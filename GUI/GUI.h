#ifndef __GUI_H
#define __GUI_H

#include "Adafruit_GFX.h"
#include "EPD_config.h"

typedef enum {
    MODE_PICTURE = 0,
    MODE_CALENDAR = 1,
    MODE_CLOCK = 2,
    MODE_TIMETABLE = 3,
} display_mode_t;

typedef struct {
    int8_t morning_temp;
    int8_t afternoon_temp;
    int8_t evening_temp;
    int8_t tomorrow_temp_min;
    int8_t tomorrow_temp_max;
    uint8_t morning_weather;
    uint8_t afternoon_weather;
    uint8_t evening_weather;
    uint8_t tomorrow_weather;
    uint16_t aqi;
    uint32_t update_timestamp;
    char city[16];
    uint8_t morning_humidity;
    uint8_t afternoon_humidity;
    uint8_t evening_humidity;
    uint8_t morning_uv;
    uint8_t afternoon_uv;
} weather_data_t;

typedef struct {
    display_mode_t mode;
    uint16_t color;
    uint16_t width;
    uint16_t height;
    uint32_t timestamp;
    uint8_t week_start;  // 0: Sunday, 1: Monday
    uint8_t language;    // 0: zh, 1: en, 2: vi
    int8_t temperature;
    uint16_t voltage;
    char ssid[20];
    weather_data_t weather;
    timetable_data_t timetable;
} gui_data_t;

void DrawGUI(gui_data_t* data, buffer_callback callback, void* callback_data);

#endif
