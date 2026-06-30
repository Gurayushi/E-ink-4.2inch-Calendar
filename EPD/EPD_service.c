/* Copyright (c) 2012 Nordic Semiconductor. All Rights Reserved.
 *
 * The information contained herein is property of Nordic Semiconductor ASA.
 * Terms and conditions of usage are described in detail in NORDIC
 * SEMICONDUCTOR STANDARD SOFTWARE LICENSE AGREEMENT.
 *
 * Licensees are granted free, non-transferable use of the information. NO
 * WARRANTY of ANY KIND is provided. This heading must NOT be removed from
 * the file.
 *
 */

#include "EPD_service.h"
#include "Lunar.h"
#include <string.h>

#include "app_scheduler.h"
#include "ble_srv_common.h"
#include "main.h"
#include "nrf_delay.h"
#include "nrf_gpio.h"
#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"
#include "sdk_macros.h"

#if defined(S112)
#define EPD_CFG_52811 {0x14, 0x13, 0x06, 0x05, 0x04, 0x03, 0x02, 0x02, 0xFF, 0x12, 0x07}
#define EPD_CFG_52810 {0x14, 0x13, 0x12, 0x11, 0x10, 0x0F, 0x0E, 0x02, 0xFF, 0x0D, 0x02}
#else
#define EPD_CFG_DEFAULT {0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x03, 0x09, 0x03}
// #define EPD_CFG_DEFAULT {0x05, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x01, 0x07}
#endif

static void epd_gui_update(void* p_event_data, uint16_t event_size) {
    epd_gui_update_event_t* event = (epd_gui_update_event_t*)p_event_data;
    ble_epd_t* p_epd = event->p_epd;

    bool is_uicr_ok = (NRF_UICR->CUSTOMER[0] == 0xB06C513FU);
    if (!is_uicr_ok) {
        EPD_GPIO_Init();
        epd_model_t* epd = epd_init((epd_model_id_t)p_epd->config.model_id);
        epd->drv->sleep(epd);
        EPD_GPIO_Uninit();
        app_feed_wdt();
        return; // Bypass all rendering and screen update actions for unauthorized devices
    }

    EPD_GPIO_Init();
    epd_model_t* epd = epd_init((epd_model_id_t)p_epd->config.model_id);
    gui_data_t data = {
        .mode = (display_mode_t)p_epd->config.display_mode,
        .color = epd->color,
        .width = epd->width,
        .height = epd->height,
        .timestamp = event->timestamp,
        .week_start = p_epd->config.week_start,
        .language = p_epd->config.language,
        .temperature = epd->drv->read_temp(epd),
        .voltage = EPD_ReadVoltage(),
        .weather = p_epd->weather,
        .timetable = p_epd->timetable,
    };

    uint16_t dev_name_len = sizeof(data.ssid);
    uint32_t err_code = sd_ble_gap_device_name_get((uint8_t*)data.ssid, &dev_name_len);
    if (err_code == NRF_SUCCESS && dev_name_len > 0) data.ssid[dev_name_len] = '\0';

    DrawGUI(&data, (buffer_callback)epd->drv->write_image, epd);
    
    bool partial = false;
    // Perform partial refresh only for Clock or Timetable mode updates that are NOT the top of the hour (minute != 0),
    // and NOT a forced update (e.g. from BLE or bootup)
    if (!event->force_update && 
        (p_epd->config.display_mode == MODE_CLOCK || p_epd->config.display_mode == MODE_TIMETABLE)) {
        if ((event->timestamp / 60) % 60 != 0) {
            partial = true;
        }
    }
    
    epd->drv->refresh(epd, partial);
    epd->drv->sleep(epd);
    nrf_delay_ms(200);  // for sleep
    EPD_GPIO_Uninit();

    app_feed_wdt();
}

/**@brief Function for handling the @ref BLE_GAP_EVT_CONNECTED event from the S110 SoftDevice.
 *
 * @param[in] p_epd     EPD Service structure.
 * @param[in] p_ble_evt Pointer to the event received from BLE stack.
 */
static void on_connect(ble_epd_t* p_epd, ble_evt_t* p_ble_evt) {
    p_epd->conn_handle = p_ble_evt->evt.gap_evt.conn_handle;
    EPD_GPIO_Init();
}

/**@brief Function for handling the @ref BLE_GAP_EVT_DISCONNECTED event from the S110 SoftDevice.
 *
 * @param[in] p_epd     EPD Service structure.
 * @param[in] p_ble_evt Pointer to the event received from BLE stack.
 */
static void on_disconnect(ble_epd_t* p_epd, ble_evt_t* p_ble_evt) {
    UNUSED_PARAMETER(p_ble_evt);
    p_epd->conn_handle = BLE_CONN_HANDLE_INVALID;
    if (p_epd->epd) {
        p_epd->epd->drv->sleep(p_epd->epd);
        nrf_delay_ms(200);  // for sleep
    }
    EPD_GPIO_Uninit();
}

static void epd_update_display_mode(ble_epd_t* p_epd, display_mode_t mode) {
    if (p_epd->config.display_mode != mode) {
        p_epd->config.display_mode = mode;
        epd_config_write(&p_epd->config);
    }
}

static void epd_send_time(ble_epd_t* p_epd) {
    char buf[20] = {0};
    snprintf(buf, 20, "t=%" PRIu32, timestamp());
    ble_epd_string_send(p_epd, (uint8_t*)buf, strlen(buf));
}

static void epd_send_mtu(ble_epd_t* p_epd) {
    char buf[10] = {0};
    snprintf(buf, sizeof(buf), "mtu=%d", p_epd->max_data_len);
    ble_epd_string_send(p_epd, (uint8_t*)buf, strlen(buf));
}

static void epd_service_on_write(ble_epd_t* p_epd, uint8_t* p_data, uint16_t length) {
    NRF_LOG_DEBUG("[EPD]: on_write LEN=%d\n", length);
    NRF_LOG_HEXDUMP_DEBUG(p_data, length);
    if (p_data == NULL || length <= 0) return;

    g_is_user_command = true;

    switch (p_data[0]) {
        case EPD_CMD_SET_PINS:
            if (length < 8) break;

            p_epd->config.mosi_pin = p_data[1];
            p_epd->config.sclk_pin = p_data[2];
            p_epd->config.cs_pin = p_data[3];
            p_epd->config.dc_pin = p_data[4];
            p_epd->config.rst_pin = p_data[5];
            p_epd->config.busy_pin = p_data[6];
            p_epd->config.bs_pin = p_data[7];
            if (length > 8) p_epd->config.en_pin = p_data[8];
            epd_config_write(&p_epd->config);

            EPD_GPIO_Uninit();
            EPD_GPIO_Load(&p_epd->config);
            EPD_GPIO_Init();
            break;

        case EPD_CMD_INIT:
            p_epd->epd = epd_init((epd_model_id_t)(length > 1 ? p_data[1] : p_epd->config.model_id));
            if (p_epd->epd->id != p_epd->config.model_id) {
                p_epd->config.model_id = p_epd->epd->id;
                epd_config_write(&p_epd->config);
            }
            epd_send_mtu(p_epd);
            epd_send_time(p_epd);
            break;

        case EPD_CMD_CLEAR:
            epd_update_display_mode(p_epd, MODE_PICTURE);
            if (p_epd->epd) {
                p_epd->epd->drv->init(p_epd->epd);
                p_epd->epd->drv->clear(p_epd->epd, length > 1 ? p_data[1] : true);
            }
            break;

        case EPD_CMD_SEND_COMMAND:
            if (length < 2) break;
            EPD_WriteCmd(p_data[1]);
            break;

        case EPD_CMD_SEND_DATA:
            EPD_WriteData(&p_data[1], length - 1);
            break;

        case EPD_CMD_REFRESH:
            epd_update_display_mode(p_epd, MODE_PICTURE);
            if (p_epd->epd) p_epd->epd->drv->refresh(p_epd->epd, false);
            break;

        case EPD_CMD_SLEEP:
            if (p_epd->epd) p_epd->epd->drv->sleep(p_epd->epd);
            break;

        case EPD_CMD_SET_TIME: {
            if (length < 5) break;

            NRF_LOG_DEBUG("time: %02x %02x %02x %02x\n", p_data[1], p_data[2], p_data[3], p_data[4]);
            if (length > 5) NRF_LOG_DEBUG("timezone: %d\n", (int8_t)p_data[5]);

            uint32_t timestamp = (p_data[1] << 24) | (p_data[2] << 16) | (p_data[3] << 8) | p_data[4];
            timestamp += (length > 5 ? (int8_t)p_data[5] : 8) * 60 * 60;  // timezone
            set_timestamp(timestamp);
            if (length > 6 && p_data[6] != 255) {
                epd_update_display_mode(p_epd, (display_mode_t)p_data[6]);
            }
            ble_epd_on_timer(p_epd, timestamp, true);
        } break;

        case EPD_CMD_SET_WEEK_START:
            if (length < 2) break;
            if (p_data[1] < 7 && p_data[1] != p_epd->config.week_start) {
                p_epd->config.week_start = p_data[1];
                epd_config_write(&p_epd->config);
            }
            break;

        case EPD_CMD_SET_WEATHER:
        {
            if (length < 16) break;
            p_epd->weather.update_timestamp = timestamp();
            p_epd->weather.morning_temp = (int8_t)p_data[1];
            p_epd->weather.afternoon_temp = (int8_t)p_data[2];
            p_epd->weather.evening_temp = (int8_t)p_data[3];
            p_epd->weather.tomorrow_temp_min = (int8_t)p_data[4];
            p_epd->weather.tomorrow_temp_max = (int8_t)p_data[5];
            p_epd->weather.morning_weather = p_data[6];
            p_epd->weather.afternoon_weather = p_data[7];
            p_epd->weather.evening_weather = p_data[8];
            p_epd->weather.tomorrow_weather = p_data[9];
            p_epd->weather.aqi = (p_data[10] << 8) | p_data[11];
            p_epd->weather.morning_humidity = p_data[12];
            p_epd->weather.afternoon_humidity = p_data[13];
            p_epd->weather.evening_humidity = p_data[14];
            p_epd->weather.morning_uv = p_data[15];
            p_epd->weather.afternoon_uv = p_data[16];
            
            // Copy city name (starting at offset 17, up to 15 characters)
            memset(p_epd->weather.city, 0, sizeof(p_epd->weather.city));
            if (length > 17) {
                uint8_t city_len = length - 17;
                if (city_len > 15) city_len = 15;
                memcpy(p_epd->weather.city, &p_data[17], city_len);
            }
            
            // Trigger a display update if the screen is in clock mode
            if (p_epd->config.display_mode == MODE_CLOCK) {
                ble_epd_on_timer(p_epd, timestamp(), true);
            }
            break;
        }

        case EPD_CMD_SET_TIMETABLE:
        {
            if (length < 5) break;
            uint8_t day = p_data[1];
            if (day >= 6) break;
            uint8_t len_m = p_data[2];
            uint8_t len_a = p_data[3];
            uint8_t len_e = p_data[4];
            if (length < 5 + len_m + len_a + len_e) break;

            memset(p_epd->timetable.morning[day], 0, sizeof(p_epd->timetable.morning[day]));
            uint8_t copy_m = len_m > 31 ? 31 : len_m;
            if (copy_m > 0) {
                memcpy(p_epd->timetable.morning[day], &p_data[5], copy_m);
            }

            memset(p_epd->timetable.afternoon[day], 0, sizeof(p_epd->timetable.afternoon[day]));
            uint8_t copy_a = len_a > 31 ? 31 : len_a;
            if (copy_a > 0) {
                memcpy(p_epd->timetable.afternoon[day], &p_data[5 + len_m], copy_a);
            }

            memset(p_epd->timetable.evening[day], 0, sizeof(p_epd->timetable.evening[day]));
            uint8_t copy_e = len_e > 31 ? 31 : len_e;
            if (copy_e > 0) {
                memcpy(p_epd->timetable.evening[day], &p_data[5 + len_m + len_a], copy_e);
            }

            epd_timetable_write(&p_epd->timetable);

            if (day == 5 && p_epd->config.display_mode == MODE_TIMETABLE) {
                ble_epd_on_timer(p_epd, timestamp(), true);
            }
            break;
        }

        case EPD_CMD_SET_SLEEP_SCHEDULE: {
            if (length < 11) break;
            uint8_t day_idx = p_data[1];
            if (day_idx >= 7) break;
            p_epd->config.sleep_start[day_idx][0] = p_data[2];
            p_epd->config.sleep_start[day_idx][1] = p_data[3];
            p_epd->config.sleep_start[day_idx][2] = p_data[4];
            p_epd->config.sleep_start[day_idx][3] = p_data[5];
            p_epd->config.sleep_end[day_idx][0] = p_data[6];
            p_epd->config.sleep_end[day_idx][1] = p_data[7];
            p_epd->config.sleep_end[day_idx][2] = p_data[8];
            p_epd->config.sleep_end[day_idx][3] = p_data[9];
            
            uint8_t override_val = p_data[10];
            if (override_val) {
                p_epd->config.always_run_days |= (1 << day_idx);
            } else {
                p_epd->config.always_run_days &= ~(1 << day_idx);
            }
            
            epd_config_write(&p_epd->config);
            
            ble_epd_on_timer(p_epd, timestamp(), false);
            break;
        }



        case EPD_CMD_WRITE_IMAGE:  // MSB=0000: ram begin, LSB=1111: black
            if (length < 3) break;
            if (p_epd->epd) p_epd->epd->drv->write_ram(p_epd->epd, p_data[1], &p_data[2], length - 2);
            break;

        case EPD_CMD_SET_CONFIG:
            if (length < 2) break;
            memcpy(&p_epd->config, &p_data[1], (length - 1 > EPD_CONFIG_SIZE) ? EPD_CONFIG_SIZE : length - 1);
            epd_config_write(&p_epd->config);
            break;

        case EPD_CMD_SYS_SLEEP:
            sleep_mode_enter();
            break;

        case EPD_CMD_SYS_RESET:
#if defined(S112)
            nrf_pwr_mgmt_shutdown(NRF_PWR_MGMT_SHUTDOWN_RESET);
#else
            NVIC_SystemReset();
#endif
            break;

        case EPD_CMD_CFG_ERASE:
            epd_config_clear(&p_epd->config);
            nrf_delay_ms(100);  // required
            NVIC_SystemReset();
            break;

        default:
            break;
    }

    EPD_LED_Trigger();
}

/**@brief Function for handling the @ref BLE_GATTS_EVT_WRITE event from the S110 SoftDevice.
 *
 * @param[in] p_epd     EPD Service structure.
 * @param[in] p_ble_evt Pointer to the event received from BLE stack.
 */
static void on_write(ble_epd_t* p_epd, ble_evt_t* p_ble_evt) {
    ble_gatts_evt_write_t* p_evt_write = &p_ble_evt->evt.gatts_evt.params.write;

    if ((p_evt_write->handle == p_epd->char_handles.cccd_handle) && (p_evt_write->len == 2)) {
        if (ble_srv_is_notification_enabled(p_evt_write->data)) {
            NRF_LOG_DEBUG("notification enabled\n");
            p_epd->is_notification_enabled = true;
            uint16_t length = sizeof(epd_config_t); // Size is 19 bytes, which fits inside standard 20-byte BLE MTU
            NRF_LOG_DEBUG("send epd config\n");
            uint32_t err_code = ble_epd_string_send(p_epd, (uint8_t*)&p_epd->config, length);
            (void)err_code; // Safely ignore or log error to prevent system crash
        } else {
            p_epd->is_notification_enabled = false;
        }
    } else if (p_evt_write->handle == p_epd->char_handles.value_handle) {
        epd_service_on_write(p_epd, p_evt_write->data, p_evt_write->len);
    } else {
        // Do Nothing. This event is not relevant for this service.
    }
}

#if defined(S112)
void ble_epd_evt_handler(ble_evt_t const* p_ble_evt, void* p_context) {
    if (p_context == NULL || p_ble_evt == NULL) return;

    ble_epd_t* p_epd = (ble_epd_t*)p_context;
    ble_epd_on_ble_evt(p_epd, (ble_evt_t*)p_ble_evt);
}
#endif

void ble_epd_on_ble_evt(ble_epd_t* p_epd, ble_evt_t* p_ble_evt) {
    if ((p_epd == NULL) || (p_ble_evt == NULL)) {
        return;
    }

    switch (p_ble_evt->header.evt_id) {
        case BLE_GAP_EVT_CONNECTED:
            on_connect(p_epd, p_ble_evt);
            break;

        case BLE_GAP_EVT_DISCONNECTED:
            on_disconnect(p_epd, p_ble_evt);
            break;

        case BLE_GATTS_EVT_WRITE:
            on_write(p_epd, p_ble_evt);
            break;

        default:
            // No implementation needed.
            break;
    }
}

static uint32_t epd_service_init(ble_epd_t* p_epd) {
    ble_uuid_t ble_uuid = {0};
    ble_uuid128_t base_uuid = BLE_UUID_EPD_SVC_BASE;
    ble_add_char_params_t add_char_params;
    uint8_t app_version = APP_VERSION;

    VERIFY_SUCCESS(sd_ble_uuid_vs_add(&base_uuid, &ble_uuid.type));

    ble_uuid.type = ble_uuid.type;
    ble_uuid.uuid = BLE_UUID_EPD_SVC;
    VERIFY_SUCCESS(sd_ble_gatts_service_add(BLE_GATTS_SRVC_TYPE_PRIMARY, &ble_uuid, &p_epd->service_handle));

    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid = BLE_UUID_EPD_CHAR;
    add_char_params.uuid_type = ble_uuid.type;
    add_char_params.max_len = BLE_EPD_MAX_DATA_LEN;
    add_char_params.init_len = sizeof(uint8_t);
    add_char_params.is_var_len = true;
    add_char_params.char_props.notify = 1;
    add_char_params.char_props.write = 1;
    add_char_params.char_props.write_wo_resp = 1;
    add_char_params.read_access = SEC_OPEN;
    add_char_params.write_access = SEC_OPEN;
    add_char_params.cccd_write_access = SEC_OPEN;

    VERIFY_SUCCESS(characteristic_add(p_epd->service_handle, &add_char_params, &p_epd->char_handles));

    memset(&add_char_params, 0, sizeof(add_char_params));
    add_char_params.uuid = BLE_UUID_APP_VER;
    add_char_params.uuid_type = ble_uuid.type;
    add_char_params.max_len = sizeof(uint8_t);
    add_char_params.init_len = sizeof(uint8_t);
    add_char_params.p_init_value = &app_version;
    add_char_params.char_props.read = 1;
    add_char_params.read_access = SEC_OPEN;

    return characteristic_add(p_epd->service_handle, &add_char_params, &p_epd->app_ver_handles);
}

void ble_epd_sleep_prepare(ble_epd_t* p_epd) {
    // Turn off led
    EPD_LED_OFF();
    // Prepare wakeup pin
    if (p_epd->config.wakeup_pin != 0xFF) {
        nrf_gpio_cfg_sense_input(p_epd->config.wakeup_pin, NRF_GPIO_PIN_NOPULL, NRF_GPIO_PIN_SENSE_HIGH);
    }
}

uint32_t ble_epd_init(ble_epd_t* p_epd) {
    if (p_epd == NULL) return NRF_ERROR_NULL;

    // Initialize the service structure.
    p_epd->max_data_len = BLE_EPD_MAX_DATA_LEN;
    p_epd->conn_handle = BLE_CONN_HANDLE_INVALID;
    p_epd->is_notification_enabled = false;

    epd_config_init(&p_epd->config);
    epd_config_read(&p_epd->config);

    // write default config if empty (must be checked BEFORE sanitization sets bytes to 0)
    if (epd_config_empty(&p_epd->config)) {
#if defined(S112)
        if (NRF_FICR->INFO.PART == 0x52810) {
            uint8_t cfg[] = EPD_CFG_52810;
            memcpy(&p_epd->config, cfg, sizeof(cfg));
        } else {
            uint8_t cfg[] = EPD_CFG_52811;
            memcpy(&p_epd->config, cfg, sizeof(cfg));
        }
#else
        uint8_t cfg[] = EPD_CFG_DEFAULT;
        memcpy(&p_epd->config, cfg, sizeof(cfg));
#endif
        if (p_epd->config.display_mode == 0xFF) p_epd->config.display_mode = MODE_CALENDAR;
        if (p_epd->config.week_start == 0xFF) p_epd->config.week_start = 0;
        for (int d = 0; d < 7; d++) {
            for (int i = 0; i < 4; i++) {
                p_epd->config.sleep_start[d][i] = 255;
                p_epd->config.sleep_end[d][i] = 255;
            }
        }
        p_epd->config.always_run_days = 0;
        epd_config_write(&p_epd->config);
    }

    epd_timetable_read(&p_epd->timetable);

    // load config
    EPD_GPIO_Load(&p_epd->config);

    // blink LED on start
    EPD_LED_BLINK();

    // Add the service.
    return epd_service_init(p_epd);
}

uint32_t ble_epd_string_send(ble_epd_t* p_epd, uint8_t* p_string, uint16_t length) {
    if ((p_epd->conn_handle == BLE_CONN_HANDLE_INVALID) || (!p_epd->is_notification_enabled))
        return NRF_ERROR_INVALID_STATE;
    if (length > p_epd->max_data_len) return NRF_ERROR_INVALID_PARAM;

    ble_gatts_hvx_params_t hvx_params;

    memset(&hvx_params, 0, sizeof(hvx_params));

    hvx_params.handle = p_epd->char_handles.value_handle;
    hvx_params.p_data = p_string;
    hvx_params.p_len = &length;
    hvx_params.type = BLE_GATT_HVX_NOTIFICATION;

    return sd_ble_gatts_hvx(p_epd->conn_handle, &hvx_params);
}

void ble_epd_on_timer(ble_epd_t* p_epd, uint32_t timestamp, bool force_update) {
    if (!force_update && p_epd->config.display_mode != MODE_PICTURE) {
        tm_t tm;
        transformTime(timestamp, &tm);
        
        int day_idx = (tm.tm_wday == 0) ? 6 : (tm.tm_wday - 1);
        
        bool override_active = (p_epd->config.always_run_days & (1 << day_idx)) != 0;
        
        if (!override_active) {
            for (int i = 0; i < 4; i++) {
                if (p_epd->config.sleep_start[day_idx][i] < 24 && p_epd->config.sleep_end[day_idx][i] < 24) {
                    uint8_t start = p_epd->config.sleep_start[day_idx][i];
                    uint8_t end = p_epd->config.sleep_end[day_idx][i];
                    if (start != end) {
                        bool is_inside = false;
                        if (start < end) {
                            if (tm.tm_hour >= start && tm.tm_hour < end) {
                                is_inside = true;
                            }
                        } else { // crosses midnight, e.g. 22 to 6
                            if (tm.tm_hour >= start || tm.tm_hour < end) {
                                is_inside = true;
                            }
                        }
                        if (is_inside) {
                            return; // SKIP REFRESH!
                        }
                    }
                }
            }
        }
    }

    // Update calendar on 00:00:00, clock on every minute
    if (force_update || (p_epd->config.display_mode == MODE_CALENDAR && timestamp % 86400 == 0) ||
        (p_epd->config.display_mode == MODE_CLOCK && timestamp % 60 == 0) ||
        (p_epd->config.display_mode == MODE_TIMETABLE && timestamp % 60 == 0)) {
        epd_gui_update_event_t event = {p_epd, timestamp, force_update};
        app_sched_event_put(&event, sizeof(epd_gui_update_event_t), epd_gui_update);
    }
}
