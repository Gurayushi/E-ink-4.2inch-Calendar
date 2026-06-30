#ifndef __EPD_CONFIG_H__
#define __EPD_CONFIG_H__
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint8_t mosi_pin;
    uint8_t sclk_pin;
    uint8_t cs_pin;
    uint8_t dc_pin;
    uint8_t rst_pin;
    uint8_t busy_pin;
    uint8_t bs_pin;
    uint8_t model_id;
    uint8_t wakeup_pin;
    uint8_t led_pin;
    uint8_t en_pin;
    uint8_t display_mode;
    uint8_t week_start;
    uint8_t language;
    uint8_t sleep_start[7][4];
    uint8_t sleep_end[7][4];
    uint8_t always_run_days;
} epd_config_t;

#define EPD_CONFIG_SIZE (sizeof(epd_config_t) / sizeof(uint8_t))

#define TIMETABLE_FILE_ID 0x0002
#define TIMETABLE_REC_KEY 0x0001

typedef struct {
    char morning[6][32];   // Monday to Saturday (0 to 5)
    char afternoon[6][32]; // Monday to Saturday (0 to 5)
    char evening[6][32];   // Monday to Saturday (0 to 5)
} timetable_data_t;

void epd_config_init(epd_config_t* cfg);
void epd_config_read(epd_config_t* cfg);
void epd_config_write(epd_config_t* cfg);
void epd_config_clear(epd_config_t* cfg);
bool epd_config_empty(epd_config_t* cfg);

void epd_timetable_read(timetable_data_t* tt);
void epd_timetable_write(timetable_data_t* tt);

#endif
