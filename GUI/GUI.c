#include "GUI.h"

#include <stdio.h>

#include "Lunar.h"
#include "fonts.h"

#define ARRAY_SIZE(arr) (sizeof(arr) / sizeof((arr)[0]))
#define GFX_printf_styled(gfx, fg, bg, font, ...) \
    GFX_setTextColor(gfx, fg, bg);                \
    GFX_setFont(gfx, font);                       \
    GFX_printf(gfx, __VA_ARGS__);

// height to use larger layout
#define large_layout(data) ((data)->height >= 400)

typedef struct {
    uint8_t month;
    uint8_t day;
    char name[20];  // increased to 20 to fit Vietnamese UTF-8 strings
} Festival;

static const Festival festivals[15] = {
    {1, 1, "Tết DL"}, {2, 14, "T.nhân"}, {3, 8, "Q.tế P.nữ"}, {3, 12, "Trồng cây"}, {4, 1, "Cá t.tư"},
    {5, 1, "L.động"}, {5, 4, "T.niên"}, {6, 1, "Q.tế T.nhi"}, {7, 1, "Đảng"}, {8, 1, "Q.đội"},
    {9, 10, "Nhà giáo"}, {10, 1, "Quốc khánh"}, {11, 1, "Halloween"}, {12, 24, "H.G.Sinh"}, {12, 25, "Giáng sinh"}
};

static const Festival festivals_lunar[11] = {
    {1, 1, "Tết N.Đán"}, {1, 15, "Tết N.Tiêu"}, {2, 2, "Rồng n.đầu"}, {5, 5, "Đoan ngọ"}, {7, 7, "Thất tịch"}, {7, 15, "Trung nguyên"},
    {8, 15, "Trung thu"}, {9, 9, "Trùng cửu"}, {10, 1, "Hàn y"}, {12, 8, "Lạp bát"}, {12, 30, "Giao thừa"}
};

// 放假和调休数据，每年更新
#define HOLIDAY_YEAR 2026
static const uint16_t holidays[] = {
    0x0101, 0x0102, 0x0103, 0x1104, 0x120E, 0x020F, 0x0210, 0x0211, 0x0212, 0x0213, 0x0214, 0x0215, 0x0216,
    0x0217, 0x121C, 0x0404, 0x0405, 0x0406, 0x0501, 0x0502, 0x0503, 0x0504, 0x0505, 0x1509, 0x0613, 0x0614,
    0x0615, 0x0919, 0x091A, 0x091B, 0x1914, 0x0A01, 0x0A02, 0x0A03, 0x0A04, 0x0A05, 0x0A06, 0x0A07, 0x1A0A,
};

static bool GetHoliday(uint8_t mon, uint8_t day, bool* work) {
    for (uint8_t i = 0; i < ARRAY_SIZE(holidays); i++) {
        if (((holidays[i] >> 8) & 0xF) == mon && (holidays[i] & 0xFF) == day) {
            *work = ((holidays[i] >> 12) & 0xF) > 0;
            return true;
        }
    }
    return false;
}

static bool GetFestival(uint16_t year, uint8_t mon, uint8_t day, uint8_t week, struct Lunar_Date* Lunar,
                        char* festival, uint8_t lang) {
    // 农历节日
    for (uint8_t i = 0; i < ARRAY_SIZE(festivals_lunar); i++) {
        if (Lunar->Month == festivals_lunar[i].month && Lunar->Date == festivals_lunar[i].day) {
            strcpy(festival, festivals_lunar[i].name);
            return true;
        }
    }

    // 除夕：春节前一天（12/29 或 12/30），12/30 已在上面判断
    if (Lunar->Month == 12 && Lunar->Date == 29) {
        struct Lunar_Date nextLunar;
        struct devtm tm = {year, mon, day, 0, 0, 0, week};
        transformTime(transformTimeStruct(&tm) + 86400, &tm);
        LUNAR_SolarToLunar(&nextLunar, tm.tm_year + YEAR0, tm.tm_mon + 1, tm.tm_mday);
        if (nextLunar.Month == 1 && nextLunar.Date == 1) {
            strcpy(festival, "Giao thừa");
            return true;
        }
    }
    // 母亲节: 五月第二个星期日
    if (mon == 5 && week == 0 && day >= 8 && day <= 14) {
        strcpy(festival, "Ngày của Mẹ");
        return true;
    }
    // 父亲节: 六月第三个星期日
    if (mon == 6 && week == 0 && day >= 15 && day <= 21) {
        strcpy(festival, "Ngày của Cha");
        return true;
    }
    // 感恩节：十一月第四个星期四
    if (mon == 11 && week == 4 && day >= 22 && day <= 28) {
        strcpy(festival, "Lễ tạ ơn");
        return true;
    }

    // 公历节日
    for (uint8_t i = 0; i < ARRAY_SIZE(festivals); i++) {
        if (mon == festivals[i].month && day == festivals[i].day) {
            strcpy(festival, festivals[i].name);
            return true;
        }
    }

    // 二十四节气
    uint8_t JQdate;
    if (GetJieQi(year, mon, day, &JQdate) && JQdate == day) {
        uint8_t JQ = (mon - 1) * 2;
        if (day >= 15) JQ++;
        strcpy(festival, GetJieQiStrName(JQ, lang));
        return true;
    }

    return false;
}


static uint8_t batt_cal(uint16_t voltage) {
    uint16_t adc_sample = (voltage * 2047) / 3600;
    if (adc_sample > 1705)
        return 100;
    else if (adc_sample <= 1705 && adc_sample > 1584)
        return 28 + (uint8_t)(((((adc_sample - 1584) << 16) / (1705 - 1584)) * 72) >> 16);
    else if (adc_sample <= 1584 && adc_sample > 1360)
        return 4 + (uint8_t)(((((adc_sample - 1360) << 16) / (1584 - 1360)) * 24) >> 16);
    else if (adc_sample <= 1360 && adc_sample > 1136)
        return (uint8_t)(((((adc_sample - 1136) << 16) / (1360 - 1136)) * 4) >> 16);
    else
        return 0;
}

static void DrawBattery(Adafruit_GFX* gfx, int16_t x, int16_t y, uint8_t iw, uint16_t voltage) {
    x -= iw;
    uint8_t level = batt_cal(voltage);
    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setCursor(gfx, x - GFX_getUTF8Width(gfx, "3.2V") - 2, y + 9);
    GFX_printf(gfx, "%d.%dV", voltage / 1000, (voltage % 1000) / 100);
    GFX_fillRect(gfx, x, y, iw, 10, GFX_WHITE);
    GFX_drawRect(gfx, x, y, iw, 10, GFX_BLACK);
    GFX_fillRect(gfx, x + iw, y + 4, 2, 2, GFX_BLACK);
    GFX_fillRect(gfx, x + 2, y + 2, 16 * level / 100, 6, GFX_BLACK);
}

static uint8_t GetWeekOfYear(uint8_t year, uint8_t mon, uint8_t mday, uint8_t wday) {
    int y = year + 1900;
    bool is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    static const uint16_t offsets[] = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};
    int doy = offsets[mon] + mday;
    if (is_leap && mon > 1) {
        doy++;
    }
    int iso_wday = (wday == 0) ? 7 : wday;
    int week = (doy - iso_wday + 10) / 7;
    if (week < 1) {
        week = 52;
        int prev_y = y - 1;
        bool prev_leap = (prev_y % 4 == 0 && prev_y % 100 != 0) || (prev_y % 400 == 0);
        int jan1_wday = (iso_wday - doy % 7 + 7) % 7 + 1;
        if (jan1_wday == 5 || (jan1_wday == 6 && prev_leap)) {
            week = 53;
        }
    } else if (week > 52) {
        int Dec31_wday = (iso_wday + (31 - mday) % 7) % 7 + 1;
        if (Dec31_wday < 4) {
            week = 1;
        }
    }
    return week;
}

static void DrawDateHeader(Adafruit_GFX* gfx, int16_t x, int16_t y, tm_t* tm, struct Lunar_Date* Lunar,
                           gui_data_t* data) {
    GFX_setCursor(gfx, x, y - 2);
    GFX_printf_styled(gfx, GFX_RED, GFX_WHITE, u8g2_font_arial_13, "%02d", tm->tm_mday);
    GFX_printf_styled(gfx, GFX_BLACK, GFX_WHITE, u8g2_font_arial_13, " / ");
    GFX_printf_styled(gfx, GFX_RED, GFX_WHITE, u8g2_font_arial_13, "%02d", tm->tm_mon + 1);
    GFX_printf_styled(gfx, GFX_BLACK, GFX_WHITE, u8g2_font_arial_13, " / ");
    GFX_printf_styled(gfx, GFX_RED, GFX_WHITE, u8g2_font_arial_13, "%d", tm->tm_year + YEAR0);

    int16_t tx = gfx->tx;
    int16_t ty = y;

    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setCursor(gfx, tx + 5, ty);
    
    if (Lunar->IsLeap) GFX_printf(gfx, " ");
    GFX_printf(gfx, "%s%s %s", GetLunarMonthLeapStr(Lunar->IsLeap, data->language), GetLunarMonthStr(Lunar->Month, data->language), GetLunarDateStr(Lunar->Date, data->language));
    
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_printf(gfx, " [Tuần %d]", GetWeekOfYear(tm->tm_year, tm->tm_mon, tm->tm_mday, tm->tm_wday));

    GFX_setCursor(gfx, tx + 5, ty - 14);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    GFX_printf(gfx, " Năm %s %s", GetLunarStemStr(LUNAR_GetStem(Lunar), data->language), GetLunarBranchStr(LUNAR_GetBranch(Lunar), data->language));
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_printf(gfx, " [%s]", GetLunarZodiacStr(LUNAR_GetZodiac(Lunar), data->language));

    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    DrawBattery(gfx, data->width - 10 - 2, large_layout(data) ? 16 : 6, 20, data->voltage);
    GFX_setCursor(gfx, data->width - GFX_getUTF8Width(gfx, data->ssid) - 10, y);
    GFX_printf(gfx, "%s", data->ssid);
}

static void DrawWeekHeader(Adafruit_GFX* gfx, int16_t x, int16_t y, gui_data_t* data) {
    GFX_setFont(gfx, large_layout(data) ? u8g2_font_arial_13 : u8g2_font_arial_13);
    uint8_t w = (data->width - 2 * x) / 7;
    uint8_t h = large_layout(data) ? 32 : 24;
    uint8_t r = (data->width - 2 * x) % 7;
    uint8_t fh = (h - GFX_getFontHeight(gfx)) / 2 + GFX_getFontAscent(gfx) + 1;
    for (int i = 0; i < 7; i++) {
        uint8_t day = (data->week_start + i) % 7;
        uint16_t bg = (day == 0 || day == 6) ? GFX_RED : GFX_BLACK;
        GFX_fillRect(gfx, x + i * w, y, i == 6 ? (w + r) : w, h, bg);
        GFX_setTextColor(gfx, GFX_WHITE, bg);
        GFX_setCursor(gfx, x + (w - GFX_getUTF8Width(gfx, GetLunarDayStr(day, data->language))) / 2 + i * w, y + fh);
        GFX_printf(gfx, "%s", GetLunarDayStr(day, data->language));
    }
}

static void DrawMonthDays(Adafruit_GFX* gfx, int16_t x, int16_t y, tm_t* tm, struct Lunar_Date* Lunar,
                          gui_data_t* data) {
    uint8_t firstDayWeek = get_first_day_week(tm->tm_year + YEAR0, tm->tm_mon + 1);
    int8_t adjustedFirstDay = (firstDayWeek - data->week_start + 7) % 7;
    uint8_t monthMaxDays = thisMonthMaxDays(tm->tm_year + YEAR0, tm->tm_mon + 1);
    uint8_t monthDayRows = 1 + (monthMaxDays - (7 - adjustedFirstDay) + 6) / 7;

    int16_t bw = (data->width - x - 10) / 7;
    int16_t bh = (data->height - y - 10) / monthDayRows;
    bool large = large_layout(data);

    if (large) {
        for (uint8_t i = 1; i < monthDayRows; i++)
            GFX_drawDottedLine(gfx, x, y + i * bh, x + 7 * bw - 1, y + i * bh, GFX_BLACK, 1, 5);
        for (uint8_t i = 1; i < 7; i++)
            GFX_drawDottedLine(gfx, x + i * bw, y, x + i * bw, y + monthDayRows * bh - 1, GFX_BLACK, 1, 5);
    }

    for (uint8_t i = 0; i < monthMaxDays; i++) {
        uint16_t year = tm->tm_year + YEAR0;
        uint8_t month = tm->tm_mon + 1;
        uint8_t day = i + 1;

        int16_t actualWeek = (firstDayWeek + i) % 7;
        int16_t displayWeek = (adjustedFirstDay + i) % 7;
        bool weekend = (actualWeek == 0) || (actualWeek == 6);

        LUNAR_SolarToLunar(Lunar, year, month, day);

        int16_t block_x = x + displayWeek * bw;
        int16_t block_y = y + (i + adjustedFirstDay) / 7 * bh;
        int16_t block_w = (displayWeek == 6) ? ((data->width - 2 * x) - 6 * bw) : bw;
        int16_t block_h = bh;

        if (day == tm->tm_mday) {
            GFX_fillRect(gfx, block_x, block_y, block_w, block_h, GFX_RED);
            GFX_setTextColor(gfx, GFX_WHITE, GFX_RED);
        } else {
            GFX_setTextColor(gfx, weekend ? GFX_RED : GFX_BLACK, GFX_WHITE);
        }

        char buf[64] = {0};
        snprintf(buf, sizeof(buf), "%d", day);
        GFX_setFont(gfx, u8g2_font_arial_13);
        int16_t num_w = GFX_getUTF8Width(gfx, buf);
        GFX_setCursor(gfx, block_x + (block_w - num_w) / 2, block_y + (large ? 16 : 14) + GFX_getFontAscent(gfx) / 2);
        GFX_printf(gfx, "%s", buf);

        GFX_setFont(gfx, large ? u8g2_font_arial_13 : u8g2_font_arial_11);
        GFX_setFontMode(gfx, 1);  // transparent
        if (GetFestival(year, month, day, actualWeek, Lunar, buf, data->language)) {
            if (day != tm->tm_mday) GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
            else GFX_setTextColor(gfx, GFX_WHITE, GFX_WHITE);
        } else {
            if (Lunar->Date == 1) {
                snprintf(buf, sizeof(buf), "%s%s", GetLunarMonthLeapStr(Lunar->IsLeap, data->language),
                         GetLunarMonthStr(Lunar->Month, data->language));
            } else {
                snprintf(buf, sizeof(buf), "%s", GetLunarDateStr(Lunar->Date, data->language));
            }
            if (day == tm->tm_mday) GFX_setTextColor(gfx, GFX_WHITE, GFX_WHITE);
        }

        char* last_space = NULL;
        int16_t text_w = GFX_getUTF8Width(gfx, buf);
        if (text_w > block_w - 2) {
            last_space = strrchr(buf, ' ');
            if (last_space != NULL) {
                *last_space = ' ';
            }
        }
        
        if (last_space != NULL) {
            char* line2 = last_space + 1;
            int16_t ty2 = block_y + block_h - 2;
            int16_t ty1 = ty2 - GFX_getFontHeight(gfx) - 2;
            GFX_setCursor(gfx, block_x + (block_w - GFX_getUTF8Width(gfx, buf)) / 2, ty1);
            GFX_printf(gfx, "%s", buf);
            GFX_setCursor(gfx, block_x + (block_w - GFX_getUTF8Width(gfx, line2)) / 2, ty2);
            GFX_printf(gfx, "%s", line2);
        } else {
            GFX_setCursor(gfx, block_x + (block_w - text_w) / 2, block_y + block_h - 9);
            GFX_printf(gfx, "%s", buf);
        }

        bool work = false;
        if (year == HOLIDAY_YEAR && GetHoliday(month, day, &work)) {
            uint16_t rx = block_x + block_w - (large ? 12 : 10);
            uint16_t ry = block_y + (large ? 10 : 8);
            uint8_t hol_cr = large ? 10 : 8;
            if (day == tm->tm_mday) {
                GFX_fillCircle(gfx, rx, ry, hol_cr, GFX_WHITE);
                GFX_drawCircle(gfx, rx, ry, hol_cr, GFX_RED);
            }
            GFX_setFont(gfx, u8g2_font_arial_11);
            GFX_setTextColor(gfx, work ? GFX_BLACK : GFX_RED, GFX_WHITE);
            const char* work_str = work ? (data->language == 0 ? "W" : "L") : (data->language == 0 ? "H" : "N");
            int16_t work_w = GFX_getUTF8Width(gfx, work_str);
            GFX_setCursor(gfx, rx - work_w / 2, ry + GFX_getFontAscent(gfx) / 2);
            GFX_printf(gfx, "%s", work_str);
        }
    }
}

static void DrawCalendar(Adafruit_GFX* gfx, tm_t* tm, struct Lunar_Date* Lunar, gui_data_t* data) {
    bool large = large_layout(data);
    DrawDateHeader(gfx, 10, large ? 38 : 28, tm, Lunar, data);
    DrawWeekHeader(gfx, 10, large ? 44 : 32, data);
    DrawMonthDays(gfx, 10, large ? 84 : 64, tm, Lunar, data);
}

// clang-format off
/* Routine to Draw Large 7-Segment formated number
   Contributed by William Zaggle.

   int n - The number to be displayed
   int xLoc = The x location of the upper left corner of the number
   int yLoc = The y location of the upper left corner of the number
   int cS = The size of the number. 
   fC is the foreground color of the number
   bC is the background color of the number (prevents having to clear previous space)
   nD is the number of digit spaces to occupy (must include space for minus sign for numbers < 0).

   width: nD*(11*cS+2)-2*cS
   height: 20*cS+4

   https://forum.arduino.cc/t/fast-7-segment-number-display-for-tft/296619/4
*/
static void Draw7Number(Adafruit_GFX *gfx, int16_t n, uint16_t xLoc, uint16_t yLoc, int16_t cS, uint16_t fC, uint16_t bC, int16_t nD) {
    uint16_t num=abs(n),i,t,w,col,h,a,b,j=1,d=0,S2=5*cS,S3=2*cS,S4=7*cS,x1=cS+1,x2=S3+S2+1,y1=yLoc+x1,y3=yLoc+S3+S4+1;
    uint16_t seg[7][3]={{x1,yLoc,1},{x2,y1,0},{x2,y3+x1,0},{x1,(2*y3)-yLoc,1},{0,y3+x1,0},{0,y1,0},{x1,y3,1}};
    uint8_t nums[12]={0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F,0x00,0x40},c=(c=abs(cS))>10?10:(c<1)?1:c,cnt=(cnt=abs(nD))>10?10:(cnt<1)?1:cnt;
    for (xLoc+=cnt*(d=S2+(3*S3)+2);cnt>0;cnt--){
      for (i=(num>9)?num%10:((!cnt)&&(n<0))?11:((nD<0)&&(!num))?10:num,xLoc-=d,num/=10,j=0;j<7;++j){
        col=(nums[i]&(1<<j))?fC:bC;
        if (seg[j][2])for(w=S2,t=seg[j][1]+S3,h=seg[j][1]+cS,a=xLoc+seg[j][0]+cS,b=seg[j][1];b<h;b++,a--,w+=2)GFX_drawFastHLine(gfx,a,b,w,col);
        else for(w=S4,t=xLoc+seg[j][0]+S3,h=xLoc+seg[j][0]+cS,b=xLoc+seg[j][0],a=seg[j][1]+cS;b<h;b++,a--,w+=2)GFX_drawFastVLine(gfx,b,a,w,col);
        for (;b<t;b++,a++,w-=2)seg[j][2]?GFX_drawFastHLine(gfx,a,b,w,col):GFX_drawFastVLine(gfx,b,a,w,col);
        }
    }
}
// clang-format on

static void DrawSunnyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_drawCircle(gfx, x + 12, y + 12, 5, GFX_RED);
    GFX_drawLine(gfx, x + 12, y + 2, x + 12, y + 5, GFX_RED);
    GFX_drawLine(gfx, x + 12, y + 19, x + 12, y + 22, GFX_RED);
    GFX_drawLine(gfx, x + 2, y + 12, x + 5, y + 12, GFX_RED);
    GFX_drawLine(gfx, x + 19, y + 12, x + 22, y + 12, GFX_RED);
    GFX_drawLine(gfx, x + 5, y + 5, x + 7, y + 7, GFX_RED);
    GFX_drawLine(gfx, x + 17, y + 17, x + 19, y + 19, GFX_RED);
    GFX_drawLine(gfx, x + 17, y + 5, x + 15, y + 7, GFX_RED);
    GFX_drawLine(gfx, x + 5, y + 19, x + 7, y + 17, GFX_RED);
}

static void DrawCloudyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 8, y + 14, 5, GFX_BLACK);
    GFX_fillCircle(gfx, x + 15, y + 10, 7, GFX_BLACK);
    GFX_fillCircle(gfx, x + 22, y + 14, 5, GFX_BLACK);
    GFX_fillRect(gfx, x + 8, y + 12, 14, 7, GFX_BLACK);
    GFX_fillCircle(gfx, x + 15, y + 10, 4, GFX_RED);
}

static void DrawPartlyCloudyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_drawCircle(gfx, x + 16, y + 8, 4, GFX_RED);
    GFX_drawLine(gfx, x + 16, y + 1, x + 16, y + 3, GFX_RED);
    GFX_drawLine(gfx, x + 21, y + 4, x + 23, y + 3, GFX_RED);
    GFX_drawLine(gfx, x + 22, y + 8, x + 24, y + 8, GFX_RED);
    
    GFX_fillCircle(gfx, x + 7, y + 15, 4, GFX_BLACK);
    GFX_fillCircle(gfx, x + 13, y + 12, 5, GFX_BLACK);
    GFX_fillCircle(gfx, x + 19, y + 15, 3, GFX_BLACK);
    GFX_fillRect(gfx, x + 7, y + 13, 12, 5, GFX_BLACK);
}

static void DrawRainyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 8, y + 10, 5, GFX_BLACK);
    GFX_fillCircle(gfx, x + 14, y + 7, 6, GFX_BLACK);
    GFX_fillCircle(gfx, x + 20, y + 10, 4, GFX_BLACK);
    GFX_fillRect(gfx, x + 8, y + 8, 12, 6, GFX_BLACK);
    GFX_drawLine(gfx, x + 8, y + 16, x + 6, y + 20, GFX_RED);
    GFX_drawLine(gfx, x + 13, y + 16, x + 11, y + 20, GFX_RED);
    GFX_drawLine(gfx, x + 18, y + 16, x + 16, y + 20, GFX_RED);
}

static void DrawStormyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 8, y + 10, 5, GFX_BLACK);
    GFX_fillCircle(gfx, x + 14, y + 7, 6, GFX_BLACK);
    GFX_fillCircle(gfx, x + 20, y + 10, 4, GFX_BLACK);
    GFX_fillRect(gfx, x + 8, y + 8, 12, 6, GFX_BLACK);
    int16_t lx = x + 10;
    int16_t ly = y + 12;
    GFX_drawLine(gfx, lx + 4, ly, lx + 1, ly + 5, GFX_RED);
    GFX_drawLine(gfx, lx + 1, ly + 5, lx + 3, ly + 5, GFX_RED);
    GFX_drawLine(gfx, lx + 3, ly + 5, lx, ly + 10, GFX_RED);
}

static void DrawSnowyIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 8, y + 10, 5, GFX_BLACK);
    GFX_fillCircle(gfx, x + 14, y + 7, 6, GFX_BLACK);
    GFX_fillCircle(gfx, x + 20, y + 10, 4, GFX_BLACK);
    GFX_fillRect(gfx, x + 8, y + 8, 12, 6, GFX_BLACK);
    GFX_drawPixel(gfx, x + 8, y + 16, GFX_RED);
    GFX_drawPixel(gfx, x + 14, y + 17, GFX_RED);
    GFX_drawPixel(gfx, x + 20, y + 16, GFX_RED);
}

static void DrawNightIcon(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 12, y + 12, 7, GFX_RED);
    GFX_fillCircle(gfx, x + 8, y + 10, 6, GFX_WHITE);
}

static void DrawWeatherIcon(Adafruit_GFX* gfx, uint8_t weather_id, int16_t x, int16_t y) {
    switch (weather_id) {
        case 0: DrawSunnyIcon(gfx, x, y); break;
        case 1: DrawPartlyCloudyIcon(gfx, x, y); break;
        case 2: DrawCloudyIcon(gfx, x, y); break;
        case 3: DrawRainyIcon(gfx, x, y); break;
        case 4: DrawStormyIcon(gfx, x, y); break;
        case 5: DrawSnowyIcon(gfx, x, y); break;
        case 6: DrawNightIcon(gfx, x, y); break;
        default: DrawPartlyCloudyIcon(gfx, x, y); break;
    }
}

static void DrawThermometer(Adafruit_GFX* gfx, int16_t x, int16_t y) {
    GFX_fillCircle(gfx, x + 3, y + 14, 3, GFX_RED);
    GFX_fillRect(gfx, x + 1, y + 2, 4, 11, GFX_BLACK);
    GFX_fillRect(gfx, x + 2, y + 3, 2, 10, GFX_WHITE);
    GFX_fillRect(gfx, x + 3, y + 6, 1, 6, GFX_RED);
}

static void DrawDropletIcon(Adafruit_GFX* gfx, int16_t x, int16_t y, uint16_t color) {
    GFX_drawLine(gfx, x + 4, y, x + 1, y + 6, color);
    GFX_drawLine(gfx, x + 4, y, x + 7, y + 6, color);
    GFX_drawCircle(gfx, x + 4, y + 6, 3, color);
    GFX_drawLine(gfx, x + 4, y + 1, x + 2, y + 6, color);
    GFX_drawLine(gfx, x + 4, y + 1, x + 6, y + 6, color);
    GFX_drawCircle(gfx, x + 4, y + 6, 2, color);
}

static void DrawFaceIcon(Adafruit_GFX* gfx, int16_t x, int16_t y, uint16_t aqi) {
    // Face outline: thicker outline (two circles)
    GFX_drawCircle(gfx, x + 10, y + 10, 9, GFX_RED);
    GFX_drawCircle(gfx, x + 10, y + 10, 8, GFX_RED);
    
    // Eyes: thicker (2x2 squares)
    GFX_fillRect(gfx, x + 6, y + 6, 2, 2, GFX_RED);
    GFX_fillRect(gfx, x + 12, y + 6, 2, 2, GFX_RED);
    
    // Mouth based on AQI: thicker
    if (aqi <= 50) {
        // Happy smile (drawn with lines)
        GFX_drawLine(gfx, x + 5, y + 11, x + 7, y + 13, GFX_RED);
        GFX_drawLine(gfx, x + 5, y + 12, x + 7, y + 14, GFX_RED);
        
        GFX_drawLine(gfx, x + 7, y + 13, x + 13, y + 13, GFX_RED);
        GFX_drawLine(gfx, x + 7, y + 14, x + 13, y + 14, GFX_RED);
        
        GFX_drawLine(gfx, x + 13, y + 13, x + 15, y + 11, GFX_RED);
        GFX_drawLine(gfx, x + 13, y + 14, x + 15, y + 12, GFX_RED);
    } else if (aqi <= 100) {
        // Neutral mouth (thick line)
        GFX_fillRect(gfx, x + 6, y + 12, 9, 2, GFX_RED);
    } else {
        // Sad mouth (drawn with thick lines)
        GFX_drawLine(gfx, x + 5, y + 14, x + 7, y + 12, GFX_RED);
        GFX_drawLine(gfx, x + 5, y + 15, x + 7, y + 13, GFX_RED);
        
        GFX_drawLine(gfx, x + 7, y + 12, x + 13, y + 12, GFX_RED);
        GFX_drawLine(gfx, x + 7, y + 13, x + 13, y + 13, GFX_RED);
        
        GFX_drawLine(gfx, x + 13, y + 12, x + 15, y + 14, GFX_RED);
        GFX_drawLine(gfx, x + 13, y + 13, x + 15, y + 15, GFX_RED);
    }
}

static const char* GetWeekdayUpperStr(uint8_t wday, uint8_t lang) {
    switch (wday) {
        case 0: return "CHỦ NHẬT";
        case 1: return "THỨ HAI";
        case 2: return "THỨ BA";
        case 3: return "THỨ TƯ";
        case 4: return "THỨ NĂM";
        case 5: return "THỨ SÁU";
        case 6: return "THỨ BẢY";
        default: return "";
    }
}

static const char* GetWeatherDesc(uint8_t weather_id, uint8_t lang) {
    switch (weather_id) {
        case 0: return "NẮNG";
        case 1: return "ÍT MÂY";
        case 2: return "NHIỀU MÂY";
        case 3: return "CÓ MƯA";
        case 4: return "CÓ BÃO";
        case 5: return "CÓ TUYẾT";
        case 6: return "TRỜI QUANG";
        default: return "ÍT MÂY";
    }
}

static const char* GetAQIDesc(uint16_t aqi, uint8_t lang) {
    if (aqi <= 50) return "TỐT";
    if (aqi <= 100) return "TRUNG BÌNH";
    return "KHÔNG KHỎE";
}

static void DrawTime(Adafruit_GFX* gfx, tm_t* tm, int16_t x, int16_t y, uint16_t cS, uint16_t nD, uint16_t fC) {
    Draw7Number(gfx, tm->tm_hour, x, y, cS, fC, GFX_WHITE, nD);
    x += (nD * (11 * cS + 2) - 2 * cS) + 2 * cS;
    GFX_fillRect(gfx, x, y + (int16_t)(4.5 * cS) + 1, 2 * cS, 2 * cS, fC);
    GFX_fillRect(gfx, x, y + (int16_t)(13.5 * cS) + 3, 2 * cS, 2 * cS, fC);
    x += 4 * cS;
    Draw7Number(gfx, tm->tm_min, x, y, cS, fC, GFX_WHITE, nD);
}

static void DrawWeatherCol(Adafruit_GFX* gfx, uint16_t col_x, uint16_t col_w, const char* prefix, uint8_t weather, int16_t temp, const char* time_str, uint8_t humidity, uint16_t uv, uint8_t lang) {
    DrawWeatherIcon(gfx, weather, col_x + (col_w - 24) / 2, 135);
    char temp_buf[32];
    snprintf(temp_buf, sizeof(temp_buf), "%s: %d°C", prefix, temp);
    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setCursor(gfx, col_x + (col_w - GFX_getUTF8Width(gfx, temp_buf)) / 2, 175);
    GFX_printf(gfx, "%s", temp_buf);
    GFX_setCursor(gfx, col_x + (col_w - GFX_getUTF8Width(gfx, time_str)) / 2, 195);
    GFX_printf(gfx, "%s", time_str);
    char hum_val[8];
    snprintf(hum_val, sizeof(hum_val), "%d%%", humidity);
    uint16_t total_w_hum = 8 + 4 + GFX_getUTF8Width(gfx, hum_val);
    uint16_t start_x_hum = col_x + (col_w - total_w_hum) / 2;
    DrawDropletIcon(gfx, start_x_hum, 210, GFX_BLACK);
    GFX_setCursor(gfx, start_x_hum + 12, 220);
    GFX_printf(gfx, "%s", hum_val);
    char uv_val[16];
    if (uv == 0xFFFF) {
        strcpy(uv_val, ": 0.0");
    } else {
        snprintf(uv_val, sizeof(uv_val), ": %d.%d", uv / 10, uv % 10);
    }
    uint16_t total_w_uv = GFX_getUTF8Width(gfx, "UV") + GFX_getUTF8Width(gfx, uv_val);
    uint16_t start_x_uv = col_x + (col_w - total_w_uv) / 2;
    GFX_setCursor(gfx, start_x_uv, 240);
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_printf(gfx, "UV");
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    GFX_printf(gfx, "%s", uv_val);
    const char* desc_str = GetWeatherDesc(weather, lang);
    GFX_setCursor(gfx, col_x + (col_w - GFX_getUTF8Width(gfx, desc_str)) / 2, 265);
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_printf(gfx, "%s", desc_str);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
}

static void DrawClock(Adafruit_GFX* gfx, tm_t* tm, struct Lunar_Date* Lunar, gui_data_t* data) {
    // 1. Draw outer border & grid dividers
    GFX_drawRect(gfx, 6, 6, 388, 288, GFX_BLACK);
    GFX_drawRect(gfx, 7, 7, 386, 286, GFX_BLACK);
    
    // Grid Dividers
    GFX_drawFastHLine(gfx, 6, 112, 388, GFX_BLACK); // Horizontal main divider
    GFX_drawFastVLine(gfx, 230, 6, 106, GFX_BLACK); // Top vertical divider (moved to 230)
    GFX_drawFastVLine(gfx, 230, 112, 182, GFX_BLACK); // Bottom vertical divider (moved to 230)
    GFX_drawFastHLine(gfx, 230, 195, 164, GFX_BLACK); // Bottom-right horizontal divider (moved to 230)

    // ----------------------------------------------------
    // TOP LEFT: Digital Clock (24h format, size 4, black)
    // ----------------------------------------------------
    uint16_t cS = 4;
    uint16_t nD = 2;
    uint16_t time_width = 2 * (nD * (11 * cS + 2) - 2 * cS) + 4 * cS;
    int16_t time_x = 6 + (224 - time_width) / 2;
    int16_t time_y = 6 + (106 - 84) / 2;
    DrawTime(gfx, tm, time_x, time_y, cS, nD, GFX_BLACK);

    // ----------------------------------------------------
    // TOP RIGHT: Date, Battery (Voltage), Temperature, BLE Name
    // ----------------------------------------------------
    // Horizontal divider splitting date and battery/temp
    GFX_drawFastHLine(gfx, 230, 36, 164, GFX_BLACK);
    
    // Date row (centered) formatted as ngày/tháng/năm
    char date_buf[64];
    snprintf(date_buf, sizeof(date_buf), "%s, %02d/%02d/%d", GetWeekdayUpperStr(tm->tm_wday, data->language), tm->tm_mday, tm->tm_mon + 1, tm->tm_year + YEAR0);
    GFX_setFont(gfx, u8g2_font_arial_11);
    uint16_t w_date = GFX_getUTF8Width(gfx, date_buf);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    GFX_setCursor(gfx, 230 + (164 - w_date) / 2, 26);
    GFX_printf(gfx, "%s", date_buf);
    
    // Battery calculation (drawn on left side of bottom row)
    uint8_t batt_pct = batt_cal(data->voltage);
    uint16_t x_bat = 258;
    uint16_t y_bat = 42;
    uint16_t w_bat = 26;
    uint16_t h_bat = 13;
    GFX_drawRect(gfx, x_bat, y_bat, w_bat, h_bat, GFX_BLACK);
    GFX_drawRect(gfx, x_bat + 1, y_bat + 1, w_bat - 2, h_bat - 2, GFX_BLACK);
    GFX_fillRect(gfx, x_bat + w_bat, y_bat + 3, 2, h_bat - 6, GFX_BLACK);
    uint8_t bars = (batt_pct + 12) / 25;
    for (int i = 0; i < bars; i++) {
        GFX_fillRect(gfx, x_bat + 3 + i * 5, y_bat + 3, 3, h_bat - 6, GFX_RED);
    }
    
    // Voltage text below battery icon
    char volt_buf[16];
    snprintf(volt_buf, sizeof(volt_buf), "%d.%02dV", data->voltage / 1000, (data->voltage % 1000) / 10);
    GFX_setFont(gfx, u8g2_font_arial_11);
    uint16_t w_volt = GFX_getUTF8Width(gfx, volt_buf);
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_setCursor(gfx, 230 + (82 - w_volt) / 2, 72);
    GFX_printf(gfx, "%s", volt_buf);
    
    // Temperature + Thermometer (drawn on right side of bottom row)
    char temp_str[16];
    snprintf(temp_str, sizeof(temp_str), "%d°C", data->temperature);
    GFX_setFont(gfx, u8g2_font_arial_11);
    uint16_t w_temp = GFX_getUTF8Width(gfx, temp_str);
    uint16_t total_w = w_temp + 4 + 10;
    uint16_t start_x = 312 + (82 - total_w) / 2;
    GFX_setCursor(gfx, start_x, 52);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    GFX_printf(gfx, "%s", temp_str);
    DrawThermometer(gfx, start_x + w_temp + 4, 38);
    
    // Room Temp label below temp text
    GFX_setFont(gfx, u8g2_font_arial_11);
    const char* room_temp_lbl = "Nhiệt độ";
    uint16_t w_lbl = GFX_getUTF8Width(gfx, room_temp_lbl);
    GFX_setCursor(gfx, 312 + (82 - w_lbl) / 2, 72);
    GFX_printf(gfx, "%s", room_temp_lbl);
    
    // BLE Bluetooth Name centered at the very bottom
    GFX_setFont(gfx, u8g2_font_arial_11);
    uint16_t w_ble = GFX_getUTF8Width(gfx, data->ssid);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    GFX_setCursor(gfx, 230 + (164 - w_ble) / 2, 102);
    GFX_printf(gfx, "%s", data->ssid);

    // ----------------------------------------------------
    // BOTTOM LEFT: Today Weather (Morning / Afternoon / Night columns)
    // ----------------------------------------------------
    // Header
    GFX_fillRect(gfx, 6, 112, 224, 18, GFX_BLACK);
    
    char today_hdr[32];
    if (strlen(data->weather.city) > 0) {
        char upper_city[16] = {0};
        for (int i = 0; i < 15 && data->weather.city[i]; i++) {
            char c = data->weather.city[i];
            if (c >= 'a' && c <= 'z') c = c - 'a' + 'A';
            upper_city[i] = c;
        }
        snprintf(today_hdr, sizeof(today_hdr), "HÔM NAY (%s)", upper_city);
    } else {
        snprintf(today_hdr, sizeof(today_hdr), "HÔM NAY");
    }
    
    GFX_setTextColor(gfx, GFX_WHITE, GFX_BLACK);
    GFX_setCursor(gfx, 6 + (224 - GFX_getUTF8Width(gfx, today_hdr)) / 2, 125);
    GFX_printf(gfx, "%s", today_hdr);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    
    if (data->weather.update_timestamp == 0) {
        GFX_setFont(gfx, u8g2_font_arial_11);
        const char* no_data = "Hãy đồng bộ thời tiết";
        GFX_setCursor(gfx, 6 + (224 - GFX_getUTF8Width(gfx, no_data)) / 2, 205);
        GFX_printf(gfx, "%s", no_data);
    } else {
        // Column dividers
        GFX_drawFastVLine(gfx, 81, 130, 164, GFX_BLACK);
        GFX_drawFastVLine(gfx, 156, 130, 164, GFX_BLACK);
        
        // Sáng
        DrawWeatherCol(gfx, 6, 75, "Sáng", data->weather.morning_weather, data->weather.morning_temp, "06:00-12:00", data->weather.morning_humidity, data->weather.morning_uv, data->language);
        
        // Chiều
        DrawWeatherCol(gfx, 81, 75, "Chiều", data->weather.afternoon_weather, data->weather.afternoon_temp, "12:00-18:00", data->weather.afternoon_humidity, data->weather.afternoon_uv, data->language);
        
        // Tối
        DrawWeatherCol(gfx, 156, 74, "Tối", data->weather.evening_weather, data->weather.evening_temp, "18:00-00:00", data->weather.evening_humidity, 0xFFFF, data->language);
    }

    // ----------------------------------------------------
    // BOTTOM RIGHT: Tomorrow Weather & Air Quality (AQI)
    // ----------------------------------------------------
    // SUB-GRID 1: Tomorrow
    GFX_fillRect(gfx, 230, 112, 164, 18, GFX_BLACK);
    const char* tomor_hdr = "NGÀY MAI";
    GFX_setTextColor(gfx, GFX_WHITE, GFX_BLACK);
    GFX_setCursor(gfx, 230 + (164 - GFX_getUTF8Width(gfx, tomor_hdr)) / 2, 125);
    GFX_printf(gfx, "%s", tomor_hdr);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    
    if (data->weather.update_timestamp == 0) {
        GFX_setFont(gfx, u8g2_font_arial_11);
        const char* no_data_small = "Đợi đồng bộ";
        GFX_setCursor(gfx, 230 + (164 - GFX_getUTF8Width(gfx, no_data_small)) / 2, 160);
        GFX_printf(gfx, "%s", no_data_small);
    } else {
        tm_t tomor_tm;
        transformTime(data->timestamp + 86400, &tomor_tm);
        char tomor_date_str[32];
        snprintf(tomor_date_str, sizeof(tomor_date_str), "%s, %02d/%02d", GetWeekdayUpperStr(tomor_tm.tm_wday, data->language), tomor_tm.tm_mday, tomor_tm.tm_mon + 1);
        
        uint16_t total_w_tomor = 24 + 8 + GFX_getUTF8Width(gfx, tomor_date_str);
        uint16_t start_x_tomor = 230 + (164 - total_w_tomor) / 2;
        
        DrawWeatherIcon(gfx, data->weather.tomorrow_weather, start_x_tomor, 142);
        GFX_setCursor(gfx, start_x_tomor + 32, 148);
        GFX_printf(gfx, "%s", tomor_date_str);
        GFX_setCursor(gfx, start_x_tomor + 32, 162);
        GFX_printf(gfx, "%d°C - %d°C", data->weather.tomorrow_temp_min, data->weather.tomorrow_temp_max);
        GFX_setCursor(gfx, start_x_tomor + 32, 176);
        GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
        GFX_printf(gfx, "%s", GetWeatherDesc(data->weather.tomorrow_weather, data->language));
        GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    }
    
    // SUB-GRID 2: AQI
    GFX_fillRect(gfx, 230, 195, 164, 18, GFX_BLACK);
    const char* aqi_hdr = "CHẤT LƯỢNG KHÔNG KHÍ";
    GFX_setTextColor(gfx, GFX_WHITE, GFX_BLACK);
    GFX_setCursor(gfx, 230 + (164 - GFX_getUTF8Width(gfx, aqi_hdr)) / 2, 208);
    GFX_printf(gfx, "%s", aqi_hdr);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    
    if (data->weather.update_timestamp == 0) {
        GFX_setFont(gfx, u8g2_font_arial_11);
        const char* no_aqi = "Không có dữ liệu AQI";
        GFX_setCursor(gfx, 230 + (164 - GFX_getUTF8Width(gfx, no_aqi)) / 2, 250);
        GFX_printf(gfx, "%s", no_aqi);
    } else {
        // Red box for AQI number
        uint16_t box_x = 236;
        uint16_t box_y = 222;
        uint16_t box_w = 36;
        uint16_t box_h = 24;
        GFX_fillRect(gfx, box_x, box_y, box_w, box_h, GFX_RED);
        char aqi_str[10];
        snprintf(aqi_str, sizeof(aqi_str), "%d", data->weather.aqi);
        GFX_setFont(gfx, u8g2_font_arial_11);
        uint16_t w_num = GFX_getUTF8Width(gfx, aqi_str);
        GFX_setCursor(gfx, box_x + (box_w - w_num) / 2, box_y + 17);
        GFX_setTextColor(gfx, GFX_WHITE, GFX_RED);
        GFX_printf(gfx, "%s", aqi_str);
        
        // Smiley Face & Status
        DrawFaceIcon(gfx, 278, box_y + 2, data->weather.aqi);
        GFX_setFont(gfx, u8g2_font_arial_11);
        GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
        GFX_setCursor(gfx, 302, box_y + 16);
        GFX_printf(gfx, "%s", GetAQIDesc(data->weather.aqi, data->language));
        
        // AQI Slider bar
        uint16_t bar_x = 236;
        uint16_t bar_y = 262;
        uint16_t bar_w = 144;
        uint16_t bar_h = 4;
        GFX_drawRect(gfx, bar_x, bar_y, bar_w, bar_h, GFX_BLACK);
        uint16_t fill_w = (data->weather.aqi > 500 ? 500 : data->weather.aqi) * bar_w / 500;
        GFX_fillRect(gfx, bar_x, bar_y, fill_w, bar_h, GFX_RED);
        
        // Slider labels
        GFX_setFont(gfx, u8g2_font_arial_11);
        GFX_setCursor(gfx, bar_x, bar_y + 14);
        GFX_printf(gfx, "0");
        GFX_setCursor(gfx, bar_x + bar_w - GFX_getUTF8Width(gfx, "500"), bar_y + 14);
        GFX_printf(gfx, "500");
        uint16_t w_aqi_lbl = GFX_getUTF8Width(gfx, "AQI");
        GFX_setCursor(gfx, bar_x + (bar_w - w_aqi_lbl) / 2, bar_y + 14);
        GFX_printf(gfx, "AQI");
    }
}

static void DrawMiniCalendar(Adafruit_GFX* gfx, tm_t* tm, int16_t x, int16_t y) {
    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    
    // Month header, e.g. "THÁNG 10  2023"
    char month_hdr[32];
    snprintf(month_hdr, sizeof(month_hdr), "THÁNG %d  %d", tm->tm_mon + 1, tm->tm_year + YEAR0);
    GFX_setCursor(gfx, x, y + 10);
    GFX_printf(gfx, "%s", month_hdr);
    
    // Weekday header: T2 T3 T4 T5 T6 T7 CN
    const char* days_hdr[] = {"T2", "T3", "T4", "T5", "T6", "T7", "CN"};
    for (int col = 0; col < 7; col++) {
        int draw_x = x + col * 15;
        int16_t w = GFX_getUTF8Width(gfx, days_hdr[col]);
        GFX_setCursor(gfx, draw_x + (12 - w) / 2, y + 22);
        GFX_printf(gfx, "%s", days_hdr[col]);
    }
    
    // Calculate calendar days
    int year = tm->tm_year + YEAR0;
    int mon = tm->tm_mon;
    int mday = tm->tm_mday;
    int wday = tm->tm_wday; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Number of days in current month
    int days_in_month[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)) {
        days_in_month[1] = 29;
    }
    int num_days = days_in_month[mon];
    
    // Day of week of the 1st day of the month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    int first_wday = (wday - (mday - 1) % 7 + 7) % 7;
    int start_col = (first_wday == 0) ? 6 : (first_wday - 1);
    
    // Draw days
    int row = 0;
    int col = start_col;
    for (int day = 1; day <= num_days; day++) {
        int draw_x = x + col * 15;
        int draw_y = y + 34 + row * 11;
        
        if (day == mday) {
            int16_t box_x = draw_x + 1;
            int16_t box_y = draw_y - 9;
            int16_t box_w = 13;
            int16_t box_h = 11;
            GFX_fillRect(gfx, box_x, box_y, box_w, box_h, GFX_RED);
            GFX_setTextColor(gfx, GFX_WHITE, GFX_RED);
            char day_str[4];
            snprintf(day_str, sizeof(day_str), "%d", day);
            int16_t w = GFX_getUTF8Width(gfx, day_str);
            GFX_setCursor(gfx, box_x + (box_w - w) / 2, draw_y);
            GFX_printf(gfx, "%d", day);
            GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
        } else {
            char day_str[4];
            snprintf(day_str, sizeof(day_str), "%d", day);
            int16_t w = GFX_getUTF8Width(gfx, day_str);
            GFX_setCursor(gfx, draw_x + (12 - w) / 2, draw_y);
            GFX_printf(gfx, "%d", day);
        }
        
        col++;
        if (col > 6) {
            col = 0;
            row++;
        }
    }
}

static int UTF8CharLen(const char* p) {
    if (!p || *p == '\0') return 0;
    unsigned char c = (unsigned char)*p;
    if (c < 0x80) return 1;
    if ((c & 0xE0) == 0xC0) return 2;
    if ((c & 0xF0) == 0xE0) return 3;
    if ((c & 0xF8) == 0xF0) return 4;
    return 1; // fallback
}

static void DrawWrappedText(Adafruit_GFX* gfx, const char* text, int16_t col_x, int16_t col_w, int16_t row_y, int16_t row_h) {
    char line1[32] = {0};
    char line2[32] = {0};
    
    int16_t max_w = col_w - 6; // 3px padding on left/right
    
    int16_t text_w = GFX_getUTF8Width(gfx, text);
    if (text_w <= max_w) {
        int16_t draw_x = col_x + (col_w - text_w) / 2;
        // Shifted down by 2px (from +1 to +3) to avoid overlapping horizontal division line
        int16_t draw_y = row_y + (row_h - GFX_getFontHeight(gfx)) / 2 + GFX_getFontAscent(gfx) + 3;
        GFX_setCursor(gfx, draw_x, draw_y);
        GFX_printf(gfx, "%s", text);
        return;
    }
    
    int len = strlen(text);
    int split_idx = -1;
    
    // Traverse strictly by character boundaries to find split space
    int i = 0;
    while (i < len) {
        int char_len = UTF8CharLen(&text[i]);
        if (char_len == 0) break;
        
        if (text[i] == ' ') {
            char temp[32] = {0};
            if (i < 32) {
                memcpy(temp, text, i);
                if (GFX_getUTF8Width(gfx, temp) <= max_w) {
                    split_idx = i;
                } else {
                    break;
                }
            }
        }
        i += char_len;
    }
    
    // If no space splits the text cleanly, split by character boundary fitting within max_w
    if (split_idx == -1) {
        int last_fit_idx = 0;
        int i = 0;
        while (i < len) {
            int char_len = UTF8CharLen(&text[i]);
            if (char_len == 0) break;
            
            char temp[32] = {0};
            int next_i = i + char_len;
            if (next_i < 32) {
                memcpy(temp, text, next_i);
                if (GFX_getUTF8Width(gfx, temp) <= max_w) {
                    last_fit_idx = next_i;
                } else {
                    break;
                }
            } else {
                break;
            }
            i = next_i;
        }
        split_idx = last_fit_idx;
    }
    
    if (split_idx <= 0 || split_idx >= len) {
        split_idx = len;
    }
    
    // Copy line 1 safely, maintaining UTF-8 boundaries
    int copy_l1 = split_idx;
    if (copy_l1 > 31) {
        copy_l1 = 31;
        while (copy_l1 > 0 && ((text[copy_l1] & 0xC0) == 0x80)) {
            copy_l1--;
        }
    }
    memcpy(line1, text, copy_l1);
    line1[copy_l1] = '\0';
    
    // Copy line 2 safely
    int start_l2 = split_idx;
    if (start_l2 < len && text[start_l2] == ' ') {
        start_l2++;
    }
    int len_l2 = len - start_l2;
    if (len_l2 > 31) {
        len_l2 = 31;
        while (len_l2 > 0 && ((text[start_l2 + len_l2] & 0xC0) == 0x80)) {
            len_l2--;
        }
    }
    if (len_l2 > 0) {
        memcpy(line2, &text[start_l2], len_l2);
        line2[len_l2] = '\0';
    }
    
    int16_t fh = GFX_getFontHeight(gfx);
    int16_t total_h = fh * 2 + 3; // Reduced spacing by 2px (from fh*2 + 5 to fh*2 + 3)
    // Shifted down by 2px (added +2 at the end) to avoid top line overlap
    int16_t start_y = row_y + (row_h - total_h) / 2 + GFX_getFontAscent(gfx) + 2;
    
    int16_t w1 = GFX_getUTF8Width(gfx, line1);
    GFX_setCursor(gfx, col_x + (col_w - w1) / 2, start_y);
    GFX_printf(gfx, "%s", line1);
    
    if (strlen(line2) > 0) {
        int16_t w2 = GFX_getUTF8Width(gfx, line2);
        GFX_setCursor(gfx, col_x + (col_w - w2) / 2, start_y + fh + 3);
        GFX_printf(gfx, "%s", line2);
    }
}

static void DrawTimetable(Adafruit_GFX* gfx, tm_t* tm, struct Lunar_Date* Lunar, gui_data_t* data) {
    // 1. Draw outer border & grid dividers
    GFX_drawRect(gfx, 6, 6, 388, 288, GFX_BLACK);
    GFX_drawRect(gfx, 7, 7, 386, 286, GFX_BLACK);
    
    // Draw monthly calendar in top-left
    DrawMiniCalendar(gfx, tm, 12, 12);
    
    // Draw digital clock in top-right
    uint16_t cS = 2;
    uint16_t nD = 2;
    uint16_t time_width = 2 * (nD * (11 * cS + 2) - 2 * cS) + 4 * cS;
    int16_t time_x = 388 - time_width - 12; // align right
    int16_t time_y = 12 + (78 - 42) / 2; // vertically center in header
    DrawTime(gfx, tm, time_x, time_y, cS, nD, GFX_BLACK);
    
    // Draw title "THỜI KHÓA BIỂU" in red in center (moved up to y=33)
    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    const char* title = "THỜI KHÓA BIỂU";
    uint16_t title_w = GFX_getUTF8Width(gfx, title);
    int16_t title_x = 122 + (time_x - 122 - title_w) / 2;
    GFX_setCursor(gfx, title_x, 33);
    GFX_printf(gfx, "%s", title);
    
    // Draw temperature and weather today right under title (y=52)
    uint8_t today_weather = data->weather.morning_weather;
    int8_t today_temp = data->weather.morning_temp;
    if (tm->tm_hour >= 12 && tm->tm_hour < 18) {
        today_weather = data->weather.afternoon_weather;
        today_temp = data->weather.afternoon_temp;
    } else if (tm->tm_hour >= 18 || tm->tm_hour < 6) {
        today_weather = data->weather.evening_weather;
        today_temp = data->weather.evening_temp;
    }
    
    GFX_setFont(gfx, u8g2_font_arial_11);
    GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
    
    char weather_str[64];
    snprintf(weather_str, sizeof(weather_str), "T.tiết: %d°C - %s", today_temp, GetWeatherDesc(today_weather, data->language));
    uint16_t weather_w = GFX_getUTF8Width(gfx, weather_str);
    int16_t weather_x = 122 + (time_x - 122 - weather_w) / 2;
    GFX_setCursor(gfx, weather_x, 52);
    GFX_printf(gfx, "%s", weather_str);
    
    // Draw room temperature under weather (y=71)
    char temp_str[32];
    snprintf(temp_str, sizeof(temp_str), "Nhiệt phòng: %d°C", data->temperature);
    uint16_t temp_w = GFX_getUTF8Width(gfx, temp_str);
    int16_t temp_x = 122 + (time_x - 122 - temp_w) / 2;
    GFX_setCursor(gfx, temp_x, 71);
    GFX_printf(gfx, "%s", temp_str);
    
    // 2. Draw timetable grid
    GFX_drawRect(gfx, 6, 96, 388, 196, GFX_BLACK);
    
    // Horizontal lines
    for (int i = 1; i <= 6; i++) {
        GFX_drawFastHLine(gfx, 6, 96 + i * 28, 388, GFX_BLACK);
    }
    
    // Vertical lines
    GFX_drawFastVLine(gfx, 56, 96, 196, GFX_BLACK);
    GFX_drawFastVLine(gfx, 168, 96, 196, GFX_BLACK);
    GFX_drawFastVLine(gfx, 281, 96, 196, GFX_BLACK);
    
    // Headers
    GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
    GFX_setCursor(gfx, 6 + (50 - GFX_getUTF8Width(gfx, "THỨ")) / 2, 115);
    GFX_printf(gfx, "THỨ");
    
    GFX_setCursor(gfx, 56 + (112 - GFX_getUTF8Width(gfx, "SÁNG")) / 2, 115);
    GFX_printf(gfx, "SÁNG");
    
    GFX_setCursor(gfx, 168 + (113 - GFX_getUTF8Width(gfx, "CHIỀU")) / 2, 115);
    GFX_printf(gfx, "CHIỀU");
    
    GFX_setCursor(gfx, 281 + (113 - GFX_getUTF8Width(gfx, "TỐI")) / 2, 115);
    GFX_printf(gfx, "TỐI");
    
    // Weekday names
    const char* weekdays[] = {"HAI", "BA", "TƯ", "NĂM", "SÁU", "BẢY"};
    
    // Fill the cells
    for (int day = 0; day < 6; day++) {
        uint16_t row_y = 96 + (day + 1) * 28;
        bool is_current = (tm->tm_wday == (day + 1));
        
        // Print weekday name
        GFX_setFont(gfx, u8g2_font_arial_11);
        if (is_current) {
            GFX_setTextColor(gfx, GFX_RED, GFX_WHITE);
        } else {
            GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
        }
        GFX_setCursor(gfx, 6 + (50 - GFX_getUTF8Width(gfx, weekdays[day])) / 2, row_y + 19);
        GFX_printf(gfx, "%s", weekdays[day]);
        
        // Print Morning/Afternoon/Evening cells
        GFX_setFont(gfx, u8g2_font_arial_11);
        GFX_setTextColor(gfx, GFX_BLACK, GFX_WHITE);
        
        // Morning cell
        if (strlen(data->timetable.morning[day]) > 0) {
            DrawWrappedText(gfx, data->timetable.morning[day], 56, 112, row_y, 28);
        }
        
        // Afternoon cell
        if (strlen(data->timetable.afternoon[day]) > 0) {
            DrawWrappedText(gfx, data->timetable.afternoon[day], 168, 113, row_y, 28);
        }
        
        // Evening cell
        if (strlen(data->timetable.evening[day]) > 0) {
            DrawWrappedText(gfx, data->timetable.evening[day], 281, 113, row_y, 28);
        }
    }
}

void DrawGUI(gui_data_t* data, buffer_callback callback, void* callback_data) {
    data->week_start = 1; // Force week start to Monday
    if (data->language == 1) data->language = 2;

    tm_t tm = {0};
    struct Lunar_Date Lunar;

    transformTime(data->timestamp, &tm);

    Adafruit_GFX gfx;
    int16_t ph = (__HEAP_SIZE - 512) / (data->width / 8);

    if (data->color == 2)
        GFX_begin_3c(&gfx, data->width, data->height, ph);
    else if (data->color == 3)
        GFX_begin_4c(&gfx, data->width, data->height, ph);
    else
        GFX_begin(&gfx, data->width, data->height, ph);

    GFX_firstPage(&gfx);
    do {
        GFX_fillScreen(&gfx, GFX_WHITE);

        LUNAR_SolarToLunar(&Lunar, tm.tm_year + YEAR0, tm.tm_mon + 1, tm.tm_mday);

        switch (data->mode) {
            case MODE_CALENDAR:
                DrawCalendar(&gfx, &tm, &Lunar, data);
                break;
            case MODE_CLOCK:
                DrawClock(&gfx, &tm, &Lunar, data);
                break;
            case MODE_TIMETABLE:
                DrawTimetable(&gfx, &tm, &Lunar, data);
                break;
            default:
                break;
        }

    } while (GFX_nextPage(&gfx, callback, callback_data));

    GFX_end(&gfx);
}