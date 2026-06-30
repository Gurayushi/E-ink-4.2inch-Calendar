// GUI emulator for Windows
// This code is a simple Windows GUI application that emulates the display of an e-paper device.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <wchar.h>
#include <windows.h>

#include "GUI.h"

#define BITMAP_WIDTH 400
#define BITMAP_HEIGHT 300
#define WINDOW_WIDTH 450
#define WINDOW_HEIGHT 380

// Global variables
HINSTANCE g_hInstance;
HWND g_hwnd;
HDC g_paintHDC = NULL;
display_mode_t g_display_mode = MODE_CALENDAR;  // Default to calendar mode
BOOL g_bwr_mode = TRUE;                         // Default to BWR mode
uint8_t g_week_start = 0;                       // Default week start (0=Sunday, 1=Monday, etc.)
uint8_t g_language = 1;                         // Default to Vietnamese (1=Vietnamese, 0=English)
time_t g_display_time;
struct tm g_tm_time;

// Implementation of the buffer_callback function
void DrawBitmap(void* user_data, uint8_t* black, uint8_t* color, uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
    HDC hdc = g_paintHDC;
    if (!hdc) return;

    RECT clientRect;
    int scale = 1;

    // Get client area for positioning
    GetClientRect(g_hwnd, &clientRect);

    // Calculate position to center the entire bitmap in the window
    int drawX = (clientRect.right - BITMAP_WIDTH * scale) / 2;
    int drawY = (clientRect.bottom - BITMAP_HEIGHT * scale) / 2;

    // Use 4-bit approach (16 colors, but we only use 3)
    BITMAPINFO bmi;
    ZeroMemory(&bmi, sizeof(BITMAPINFO));
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = w;
    bmi.bmiHeader.biHeight = -h;  // Negative for top-down bitmap
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 4;  // 4 bits per pixel
    bmi.bmiHeader.biCompression = BI_RGB;
    bmi.bmiHeader.biClrUsed = 16;  // 16 colors (2^4)

    // Initialize all 16 palette entries to white first
    for (int i = 0; i < 16; i++) {
        bmi.bmiColors[i].rgbBlue = 255;
        bmi.bmiColors[i].rgbGreen = 255;
        bmi.bmiColors[i].rgbRed = 255;
        bmi.bmiColors[i].rgbReserved = 0;
    }

    // Set specific colors for our pixel values
    // Color 0: White
    bmi.bmiColors[0].rgbBlue = 255;
    bmi.bmiColors[0].rgbGreen = 255;
    bmi.bmiColors[0].rgbRed = 255;

    // Color 1: Black
    bmi.bmiColors[1].rgbBlue = 0;
    bmi.bmiColors[1].rgbGreen = 0;
    bmi.bmiColors[1].rgbRed = 0;

    // Color 2: Red
    bmi.bmiColors[2].rgbBlue = 0;
    bmi.bmiColors[2].rgbGreen = 0;
    bmi.bmiColors[2].rgbRed = 255;

    // Create 4-bit bitmap data
    // Each byte contains 2 pixels (4 bits each)
    int pixelsPerByte = 2;
    int bytesPerRow = ((w + pixelsPerByte - 1) / pixelsPerByte);
    // Align to DWORD boundary (4 bytes)
    bytesPerRow = ((bytesPerRow + 3) / 4) * 4;
    int totalSize = bytesPerRow * h;

    uint8_t* bitmap4bit = (uint8_t*)malloc(totalSize);
    if (!bitmap4bit) {
        return;
    }
    memset(bitmap4bit, 0, totalSize);  // Initialize to white (0)

    int ePaperBytesPerRow = (w + 7) / 8;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int bytePos = row * ePaperBytesPerRow + col / 8;
            int bitPos = 7 - (col % 8);

            int blackBit = !((black[bytePos] >> bitPos) & 0x01);
            int colorBit = color ? !((color[bytePos] >> bitPos) & 0x01) : 0;

            // Determine pixel value: 0=white, 1=black, 2=red
            uint8_t pixelValue = colorBit ? 2 : (blackBit ? 1 : 0);

            // Pack into 4-bit format
            // Each byte stores 2 pixels: [pixel0][pixel1]
            // High nibble = first pixel, low nibble = second pixel
            int bitmap4bitBytePos = row * bytesPerRow + col / pixelsPerByte;
            int isHighNibble = (col % pixelsPerByte) == 0;

            if (isHighNibble) {
                // Clear high nibble and set new value
                bitmap4bit[bitmap4bitBytePos] &= 0x0F;
                bitmap4bit[bitmap4bitBytePos] |= (pixelValue << 4);
            } else {
                // Clear low nibble and set new value
                bitmap4bit[bitmap4bitBytePos] &= 0xF0;
                bitmap4bit[bitmap4bitBytePos] |= pixelValue;
            }
        }
    }

    // Draw the bitmap
    StretchDIBits(hdc, drawX + x * scale, drawY + y * scale, w * scale, h * scale, 0, 0, w, h, bitmap4bit, &bmi,
                  DIB_RGB_COLORS, SRCCOPY);

    free(bitmap4bit);
}

// Window procedure

#pragma pack(push, 1)
typedef struct {
    uint16_t bfType;
    uint32_t bfSize;
    uint16_t bfReserved1;
    uint16_t bfReserved2;
    uint32_t bfOffBits;
} BMPHeader;

typedef struct {
    uint32_t biSize;
    int32_t  biWidth;
    int32_t  biHeight;
    uint16_t biPlanes;
    uint16_t biBitCount;
    uint32_t biCompression;
    uint32_t biSizeImage;
    int32_t  biXPelsPerMeter;
    int32_t  biYPelsPerMeter;
    uint32_t biClrUsed;
    uint32_t biClrImportant;
} BMPInfoHeader;
#pragma pack(pop)

void SaveToBMP(const char* filename, uint8_t* black, uint8_t* color, int w, int h) {
    FILE* f = fopen(filename, "wb");
    if (!f) return;

    int rowSize = (w * 3 + 3) & ~3;
    int dataSize = rowSize * h;

    BMPHeader header;
    header.bfType = 0x4D42; // "BM"
    header.bfSize = 54 + dataSize;
    header.bfReserved1 = 0;
    header.bfReserved2 = 0;
    header.bfOffBits = 54;

    BMPInfoHeader info;
    info.biSize = 40;
    info.biWidth = w;
    info.biHeight = h;
    info.biPlanes = 1;
    info.biBitCount = 24;
    info.biCompression = 0;
    info.biSizeImage = dataSize;
    info.biXPelsPerMeter = 2835;
    info.biYPelsPerMeter = 2835;
    info.biClrUsed = 0;
    info.biClrImportant = 0;

    fwrite(&header, 1, 14, f);
    fwrite(&info, 1, 40, f);

    uint8_t* rowBuf = (uint8_t*)malloc(rowSize);
    int ePaperBytesPerRow = (w + 7) / 8;

    for (int y = h - 1; y >= 0; y--) {
        memset(rowBuf, 255, rowSize);
        for (int x = 0; x < w; x++) {
            int bytePos = y * ePaperBytesPerRow + x / 8;
            int bitPos = 7 - (x % 8);

            int blackBit = !((black[bytePos] >> bitPos) & 0x01);
            int colorBit = color ? !((color[bytePos] >> bitPos) & 0x01) : 0;

            int pIdx = x * 3;
            if (colorBit) {
                rowBuf[pIdx] = 0;
                rowBuf[pIdx+1] = 0;
                rowBuf[pIdx+2] = 255; // Red (BGR: Blue=0, Green=0, Red=255)
            } else if (blackBit) {
                rowBuf[pIdx] = 0;
                rowBuf[pIdx+1] = 0;
                rowBuf[pIdx+2] = 0;
            } else {
                rowBuf[pIdx] = 255;
                rowBuf[pIdx+1] = 255;
                rowBuf[pIdx+2] = 255;
            }
        }
        fwrite(rowBuf, 1, rowSize, f);
    }

    free(rowBuf);
    fclose(f);
}

void SaveBitmapCallback(void* user_data, uint8_t* black, uint8_t* color, uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
    static uint8_t* full_black = NULL;
    static uint8_t* full_color = NULL;
    
    if (y == 0) {
        if (!full_black) full_black = malloc(15000);
        if (!full_color) full_color = malloc(15000);
        memset(full_black, 255, 15000);
        memset(full_color, 255, 15000);
    }
    
    int bytesPerRow = (w + 7) / 8;
    int pageSize = h * bytesPerRow;
    int offset = y * bytesPerRow;
    
    if (offset + pageSize <= 15000) {
        if (black && full_black) memcpy(full_black + offset, black, pageSize);
        if (color && full_color) memcpy(full_color + offset, color, pageSize);
    }
    
    if (y + h >= 300) {
        const char* filename = (const char*)user_data;
        if (!filename) filename = "calendar.bmp";
        SaveToBMP(filename, full_black, full_color, 400, 300);
        
        // Free and reset for next run
        free(full_black);
        free(full_color);
        full_black = NULL;
        full_color = NULL;
    }
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_CREATE:
            // Initialize the display time
            g_display_time = time(NULL) + 8 * 3600;
            // Set a timer to update the CLOCK periodically (every second)
            SetTimer(hwnd, 1, 1000, NULL);
            return 0;

        case WM_TIMER:
            if (g_display_mode == MODE_CLOCK) {
                g_display_time = time(NULL) + 8 * 3600;
                if (g_display_time % 60 == 0) {
                    InvalidateRect(hwnd, NULL, FALSE);
                }
            }
            return 0;

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);

            // Set the global HDC for DrawBitmap to use
            g_paintHDC = hdc;

            // Get client rect for calculations
            RECT clientRect;
            GetClientRect(hwnd, &clientRect);

            // Clear the entire client area with a solid color
            HBRUSH bgBrush = CreateSolidBrush(RGB(240, 240, 240));
            FillRect(hdc, &clientRect, bgBrush);
            DeleteObject(bgBrush);

            // Calculate border position (same as bitmap position)
            int scale = 1;
            int drawX = (clientRect.right - BITMAP_WIDTH * scale) / 2;
            int drawY = (clientRect.bottom - BITMAP_HEIGHT * scale) / 2;

            // Draw border around the bitmap area
            HPEN borderPen = CreatePen(PS_DOT, 1, RGB(0, 0, 255));
            HPEN oldPen = SelectObject(hdc, borderPen);
            HBRUSH oldBrush = SelectObject(hdc, GetStockObject(NULL_BRUSH));  // No fill

            Rectangle(hdc, drawX - 1, drawY - 1, drawX + BITMAP_WIDTH * scale + 1, drawY + BITMAP_HEIGHT * scale + 1);

            SelectObject(hdc, oldPen);
            SelectObject(hdc, oldBrush);
            DeleteObject(borderPen);

            // Display current mode at the top of the bitmap
            const wchar_t* modeText = (g_display_mode == MODE_CLOCK) ? L"Chế độ Đồng Hồ" : L"Chế độ Lịch";
            int modeTextY = drawY - 20;  // Above the bitmap
            SetTextColor(hdc, RGB(50, 50, 50));
            SetBkMode(hdc, TRANSPARENT);

            // Create a font for mode text
            HFONT modeFont = CreateFont(16, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                        CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS, "Arial");
            HFONT oldFont = SelectObject(hdc, modeFont);

            // Calculate text width for centering mode text
            SIZE modeTextSize;
            GetTextExtentPoint32W(hdc, modeText, wcslen(modeText), &modeTextSize);
            int modeCenteredX = drawX + (BITMAP_WIDTH - modeTextSize.cx) / 2;

            TextOutW(hdc, modeCenteredX, modeTextY, modeText, wcslen(modeText));

            // Draw help text below the bitmap
            const wchar_t helpText[] = L"Space - Chế độ | L - Ngôn ngữ | R - BWR Màu | W - Đầu tuần | Arrows - Đổi ngày";
            int helpTextY = drawY + BITMAP_HEIGHT * scale + 5;
            SetTextColor(hdc, RGB(80, 80, 80));

            // Create a smaller font for help text
            HFONT helpFont =
                CreateFont(14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                           CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS, "Arial");
            SelectObject(hdc, modeFont);
            DeleteObject(modeFont);
            SelectObject(hdc, helpFont);

            // Calculate text width for centering help text
            SIZE textSize;
            GetTextExtentPoint32W(hdc, helpText, wcslen(helpText), &textSize);
            int centeredX = drawX + (BITMAP_WIDTH - textSize.cx) / 2;

            TextOutW(hdc, centeredX, helpTextY, helpText, wcslen(helpText));

            SelectObject(hdc, oldFont);
            DeleteObject(helpFont);

            // Use the stored timestamp
            gui_data_t data = {
                .mode = g_display_mode,
                .color = g_bwr_mode ? 2 : 1,
                .width = BITMAP_WIDTH,
                .height = BITMAP_HEIGHT,
                .timestamp = g_display_time,
                .week_start = g_week_start,
                .language = g_language,
                .temperature = 25,
                .voltage = 2920,
                .ssid = "NRF_EPD_84AC",
            };

            // Call DrawGUI to render the interface
            DrawGUI(&data, DrawBitmap, NULL);

            // Clear the global HDC
            g_paintHDC = NULL;

            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_KEYDOWN:
            // Toggle display mode with spacebar
            if (wParam == VK_SPACE) {
                if (g_display_mode == MODE_CLOCK)
                    g_display_mode = MODE_CALENDAR;
                else
                    g_display_mode = MODE_CLOCK;

                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Toggle BWR mode with R key
            else if (wParam == 'R') {
                g_bwr_mode = !g_bwr_mode;
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Toggle language with L key
            else if (wParam == 'L') {
                g_language = !g_language;
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Increase week start with W key
            else if (wParam == 'W') {
                g_week_start++;
                if (g_week_start > 6) g_week_start = 0;  // Wrap around
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Handle arrow keys for month/day adjustment
            else if (wParam == VK_UP || wParam == VK_DOWN || wParam == VK_LEFT || wParam == VK_RIGHT) {
                // Get the current time structure
                g_tm_time = *localtime(&g_display_time);

                // Up/Down adjusts month
                if (wParam == VK_UP) {
                    g_tm_time.tm_mon++;
                    if (g_tm_time.tm_mon > 11) {
                        g_tm_time.tm_mon = 0;
                        g_tm_time.tm_year++;
                    }
                } else if (wParam == VK_DOWN) {
                    g_tm_time.tm_mon--;
                    if (g_tm_time.tm_mon < 0) {
                        g_tm_time.tm_mon = 11;
                        g_tm_time.tm_year--;
                    }
                }
                // Left/Right adjusts day
                else if (wParam == VK_RIGHT) {
                    g_tm_time.tm_mday++;
                } else if (wParam == VK_LEFT) {
                    g_tm_time.tm_mday--;
                }

                // Convert back to time_t
                g_display_time = mktime(&g_tm_time);

                // Force redraw
                InvalidateRect(hwnd, NULL, TRUE);
            }
            return 0;

        case WM_DESTROY:
            KillTimer(hwnd, 1);
            PostQuitMessage(0);
            return 0;

        default:
            return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

// Main entry point
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    if (lpCmdLine && (strstr(lpCmdLine, "save") || strstr(lpCmdLine, "-save"))) {
        gui_data_t data = {
            .mode = MODE_CALENDAR,
            .color = 2,
            .width = BITMAP_WIDTH,
            .height = BITMAP_HEIGHT,
            .week_start = 1,
            .language = 1, // Vietnamese
            .temperature = 25,
            .voltage = 3300,
            .ssid = "NRF_EPD_1B4F",
        };
        
        // January 1, 2025 23:30 -> Lunar Dec 2nd, Giáp Thìn
        struct tm tm_t = {0};
        tm_t.tm_year = 2025 - 1900;
        tm_t.tm_mon = 0; // Jan
        tm_t.tm_mday = 1;
        tm_t.tm_hour = 23;
        tm_t.tm_min = 30;
        tm_t.tm_sec = 0;
        tm_t.tm_isdst = -1;
        
        data.timestamp = mktime(&tm_t);
        
        DrawGUI(&data, SaveBitmapCallback, "calendar.bmp");
        
        // Populate and save timetable image
        data.mode = MODE_TIMETABLE;
        memset(&data.timetable, 0, sizeof(data.timetable));
        strcpy(data.timetable.morning[0], "Toán học");
        strcpy(data.timetable.afternoon[0], "Chào Cờ");
        strcpy(data.timetable.evening[0], "Sinh hoạt");
        
        strcpy(data.timetable.morning[1], "Ngữ Văn");
        strcpy(data.timetable.afternoon[1], "Ngoại Ngữ");
        
        strcpy(data.timetable.morning[2], "Lịch Sử");
        strcpy(data.timetable.afternoon[2], "Địa Lý");
        
        strcpy(data.timetable.morning[3], "Vật Lý");
        strcpy(data.timetable.afternoon[3], "Hóa Học");
        
        strcpy(data.timetable.morning[4], "Sinh học");
        strcpy(data.timetable.afternoon[4], "Tin học");
        
        strcpy(data.timetable.morning[5], "Thể dục");
        strcpy(data.timetable.afternoon[5], "Mỹ thuật");
        
        DrawGUI(&data, SaveBitmapCallback, "timetable.bmp");
        return 0;
    }

    g_hInstance = hInstance;

    // Register window class
    WNDCLASSW wc = {0};
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"Emurator";

    if (!RegisterClassW(&wc)) {
        MessageBoxW(NULL, L"Window Registration Failed!", L"Error", MB_ICONEXCLAMATION | MB_OK);
        return 0;
    }

    // Create the window
    g_hwnd = CreateWindowW(L"Emurator", L"模拟器", WS_POPUPWINDOW | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
                           CW_USEDEFAULT, CW_USEDEFAULT, WINDOW_WIDTH, WINDOW_HEIGHT, NULL, NULL, hInstance, NULL);

    if (!g_hwnd) {
        MessageBoxW(NULL, L"Window Creation Failed!", L"Error", MB_ICONEXCLAMATION | MB_OK);
        return 0;
    }

    // Show window
    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);

    // Main message loop
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}