(function () {
  "use strict";

  const LEFT_W = 136;
  const RIGHT_W = 264;
  const FULL_H = 300;

  let clockTimer, cdTimer, startTime;

  function wrapLine(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  function fillJustifiedText(ctx, text, x, y, maxWidth) {
    const words = text.split(' ');
    if (words.length <= 1) {
      ctx.fillText(text, x, y);
      return;
    }
    
    const totalWordsWidth = words.reduce((acc, word) => acc + ctx.measureText(word).width, 0);
    const totalSpaceWidth = maxWidth - totalWordsWidth;
    const spaceWidth = totalSpaceWidth / (words.length - 1);
    
    let currentX = x;
    for (let i = 0; i < words.length; i++) {
      ctx.fillText(words[i], currentX, y);
      currentX += ctx.measureText(words[i]).width + spaceWidth;
    }
  }

  function updateAlignButtonsActiveState(align) {
    const buttons = document.querySelectorAll('.epd-note-align-btn');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-align') === align) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // NOTE CANVAS (Right Half — 200x300)
  // Renders the note with custom fonts, lines, etc.
  // ══════════════════════════════════════════════════════════
  function renderNoteCanvas() {
    const canvas = document.getElementById('epd-note-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, RIGHT_W, FULL_H);

    // Rule header: "GHI CHÚ"
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GHI CHÚ', 10, 8);

    // Separator line under header
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(RIGHT_W, 26);
    ctx.stroke();

    // Lined paper background
    const lineStart = 30;
    const lineStep = parseInt(document.getElementById('epd-note-spacing')?.value) || 22;
    const numLines = Math.floor((FULL_H - lineStart) / lineStep);

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < numLines; i++) {
      const y = lineStart + i * lineStep;
      ctx.beginPath();
      ctx.moveTo(6, y);
      ctx.lineTo(RIGHT_W - 6, y);
      ctx.stroke();
    }

    // Draw user text
    const textInput = document.getElementById('epd-note-input');
    if (!textInput) return;

    const fontName = document.getElementById('epd-note-font').value || 'Arial';
    const fontSize = parseInt(document.getElementById('epd-note-size').value) || 13;
    const isBold = document.getElementById('epd-note-bold').checked;
    const isItalic = document.getElementById('epd-note-italic').checked;
    const fontColor = document.getElementById('epd-note-color').value || '#cc0000';

    ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSize}px "${fontName}"`;
    ctx.fillStyle = fontColor;
    ctx.textBaseline = 'top';

    const isWrap = document.getElementById('epd-note-wrap')?.checked ?? true;
    const alignment = localStorage.getItem('epdNoteAlignRedesign') || 'left';
    const textLines = textInput.value.split('\n');
    const maxTextW = RIGHT_W - 16;
    let y = lineStart + 4; // Align with the first ruled line instead of overlapping with the header

    const linesToDraw = [];

    for (const rawLine of textLines) {
      if (!isWrap) {
        linesToDraw.push({ text: rawLine, justify: false });
      } else {
        const subLines = wrapLine(ctx, rawLine, maxTextW);
        for (let i = 0; i < subLines.length; i++) {
          const isLastSubLine = (i === subLines.length - 1);
          linesToDraw.push({
            text: subLines[i],
            justify: !isLastSubLine && alignment === 'justify'
          });
        }
      }
    }

    for (const lineObj of linesToDraw) {
      if (y > FULL_H - 18) break;

      const line = lineObj.text;
      if (line !== '') {
        if (lineObj.justify) {
          ctx.textAlign = 'left';
          fillJustifiedText(ctx, line, 8, y, maxTextW);
        } else {
          ctx.textAlign = alignment === 'justify' ? 'left' : alignment;
          let x = 8;
          if (alignment === 'center') {
            x = RIGHT_W / 2;
          } else if (alignment === 'right') {
            x = RIGHT_W - 8;
          }
          ctx.fillText(line, x, y);
        }
      }
      y += lineStep;
    }
  }

  // ══════════════════════════════════════════════════════════
  // PREVIEW CANVAS (Left Half — 200x300)
  // Renders live clock and countdown preview
  // ══════════════════════════════════════════════════════════
  function renderPreviewCanvas() {
    const canvas = document.getElementById('epd-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LEFT_W, FULL_H);

    // Check if power saving is active
    let powerSavingActive = false;
    if (window.sleepScheduleData) {
      const now = new Date();
      let day_idx = now.getDay() - 1;
      if (day_idx < 0) day_idx = 6;
      powerSavingActive = (window.sleepScheduleData.always_run_days & (1 << day_idx)) === 0;
    }

    // Top: Analog Clock (Center at 68, 75, radius 50)
    if (!powerSavingActive) {
      drawAnalogClock(ctx, 68, 75, 50);
    }

    // Bottom: Event Countdown (Center at 68, Y=220) - shifted down by 15px
    drawEventCountdown(ctx, 68, 220);
  }

  function drawAnalogClock(ctx, cx, cy, radius) {
    // Face outline
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111111';
    ctx.stroke();

    // Ticks & Hours (60 minute ticks, 12, 3, 6, 9 numbers colored red)
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6 - 90) * Math.PI / 180;
      const isHour = (i % 5 === 0);
      const isMainHour = (i % 15 === 0);
      const len = isHour ? (isMainHour ? 10 : 7) : 4;

      const x1 = cx + (radius - 2) * Math.cos(angle);
      const y1 = cy + (radius - 2) * Math.sin(angle);
      const x2 = cx + (radius - 2 - len) * Math.cos(angle);
      const y2 = cy + (radius - 2 - len) * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = isHour ? 1.5 : 0.8;
      ctx.strokeStyle = '#111111';
      ctx.stroke();

      if (isMainHour) {
        const hourNum = i === 0 ? 12 : i / 5;
        const nx = cx + (radius - 18) * Math.cos(angle);
        const ny = cy + (radius - 18) * Math.sin(angle);
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#cc0000'; // Red color for 12, 3, 6, 9
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(hourNum), nx, ny);
      }
    }

    // Hands
    const now = new Date();
    const hrs = now.getHours() % 12 + now.getMinutes() / 60;
    const mins = now.getMinutes() + now.getSeconds() / 60;

    // Hour hand (red)
    const hAng = (hrs / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * 0.48 * Math.cos(hAng), cy + radius * 0.48 * Math.sin(hAng));
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#cc0000';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Minute hand (black)
    const mAng = (mins / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * 0.7 * Math.cos(mAng), cy + radius * 0.7 * Math.sin(mAng));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111111';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center pin
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#111111';
    ctx.fill();
  }

  function getSavedEvent() {
    const saved = localStorage.getItem('epdNoteEventRedesign');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return null;
  }

  function getLocalISOString(date) {
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date - tzoffset)).toISOString().slice(0, -1);
    return localISOTime.substring(0, 16);
  }

  function drawEventCountdown(ctx, cx, cy) {
    const savedEvent = getSavedEvent();
    if (!savedEvent || !savedEvent.name || !savedEvent.datetime) {
      ctx.font = '12px Arial';
      ctx.fillStyle = '#999999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Không có sự kiện', cx, cy);
      return;
    }

    const targetDate = new Date(savedEvent.datetime);
    const now = new Date();
    const diffMs = targetDate - now;
    
    let days = 0;
    let hours = 0;
    if (diffMs > 0) {
      const diffSecs = Math.floor(diffMs / 1000);
      const totalHours = Math.floor(diffSecs / 3600);
      days = Math.floor(totalHours / 24);
      hours = totalHours % 24;
    }

    ctx.font = 'bold 13px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    const daysStr = String(days);
    const hoursStr = String(hours);
    
    const wDaysNum = ctx.measureText(daysStr).width;
    const wNgay = ctx.measureText(' NGÀY ').width;
    const wHoursNum = ctx.measureText(hoursStr).width;
    const wGio = ctx.measureText(' GIỜ').width;
    
    const totalW = wDaysNum + wNgay + wHoursNum + wGio;
    let startX = cx - totalW / 2;
    
    ctx.fillStyle = '#cc0000';
    ctx.textAlign = 'left';
    ctx.fillText(daysStr, startX, cy);
    startX += wDaysNum;
    
    ctx.fillStyle = '#111111';
    ctx.fillText(' NGÀY ', startX, cy);
    startX += wNgay;
    
    ctx.fillStyle = '#cc0000';
    ctx.fillText(hoursStr, startX, cy);
    startX += wHoursNum;
    
    ctx.fillStyle = '#111111';
    ctx.fillText(' GIỜ', startX, cy);
    
    ctx.font = '13px Arial';
    ctx.fillStyle = '#cc0000';
    ctx.textAlign = 'center';
    ctx.fillText(savedEvent.name.substring(0, 30), cx, cy + 24);
  }

  function updateCompositeCanvas() {
    const previewBoxCanvas = document.getElementById('epd-note-composite-preview');
    const canvases = [previewBoxCanvas];
    
    const previewCanvas = document.getElementById('epd-preview-canvas');
    const noteCanvas = document.getElementById('epd-note-canvas');
    
    for (const canvasEl of canvases) {
      if (!canvasEl) continue;
      const ctx = canvasEl.getContext('2d');
      if (previewCanvas) {
        ctx.drawImage(previewCanvas, 0, 0);
      }
      if (noteCanvas) {
        ctx.drawImage(noteCanvas, LEFT_W, 0);
      }
    }
  }

  window.onNoteControlChange = function () {
    renderNoteCanvas();
    renderPreviewCanvas();
    updateCompositeCanvas();
  };

  /**
   * Save event target date & time, then send the BLE command (0x25)
   */
  window.saveNoteEvent = async function () {
    const name = document.getElementById('epd-event-name').value.trim();
    const datetimeStr = document.getElementById('epd-event-dt').value;

    if (!name || !datetimeStr) {
      alert('Vui lòng điền đầy đủ tên sự kiện và ngày giờ!');
      return;
    }

    const eventData = { name, datetime: datetimeStr };
    localStorage.setItem('epdNoteEventRedesign', JSON.stringify(eventData));

    // Calculate timestamp (timezone-adjusted target unix timestamp)
    const targetDate = new Date(datetimeStr);
    const timestampSec = Math.floor(targetDate.getTime() / 1000);

    // Build payload: 4-byte timestamp + event name (string)
    const nameBytes = new TextEncoder().encode(name);
    const payload = new Uint8Array(4 + nameBytes.length);

    payload[0] = (timestampSec >> 24) & 0xff;
    payload[1] = (timestampSec >> 16) & 0xff;
    payload[2] = (timestampSec >> 8) & 0xff;
    payload[3] = timestampSec & 0xff;
    payload.set(nameBytes, 4);

    // Always switch device to Note & Countdown mode (4) first to ensure partial window is configured correctly
    addLog('Đang chuyển đồng hồ sang Chế độ Ghi chú & Đếm ngược...');
    await syncTime(4, true);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Delay to allow device to save config and initialize

    // Send EPD_CMD_SET_EVENT (0x25)
    startTime = new Date().getTime();
    addLog(`Gửi sự kiện: "${name}" (${datetimeStr})`);
    if (await write(0x25, payload, true)) {
      addLog('Đồng bộ sự kiện đếm ngược thành công!');
      if (!window.skipNoteEventSync) {
        window.skipNoteEventSync = true;
        await window.sendNoteImage();
        window.skipNoteEventSync = false;
        alert('✅ Đã đồng bộ thành công cả Ghi chú và Đếm ngược!');
      }
    }
    onNoteControlChange();
  };

  window.clearNoteEvent = async function () {
    if (!confirm('Bạn có chắc muốn đặt lại sự kiện đếm ngược?')) return;
    localStorage.removeItem('epdNoteEventRedesign');
    document.getElementById('epd-event-name').value = '';
    
    const d = new Date();
    d.setDate(d.getDate() + 10);
    document.getElementById('epd-event-dt').value = getLocalISOString(d);

    // Sync clear to device
    if (typeof epdCharacteristic !== 'undefined' && epdCharacteristic) {
      const payload = new Uint8Array([0, 0, 0, 0]);
      await write(0x25, payload, true);
      await write(EpdCmd.REFRESH);
      addLog('Đã xóa sự kiện đếm ngược trên đồng hồ!');
    }

    onNoteControlChange();
  };

  /**
   * Render the 200x300 note canvas, dither it, and transmit it to the RIGHT half (window) of EPD.
   */
  window.sendNoteImage = async function () {
    if (typeof epdCharacteristic === 'undefined' || !epdCharacteristic) {
      alert('Chưa kết nối Bluetooth! Vui lòng kết nối trước.');
      return;
    }

    renderNoteCanvas();
    const noteC = document.getElementById('epd-note-canvas');
    const ctx = noteC.getContext('2d');
    const imgData = ctx.getImageData(0, 0, RIGHT_W, FULL_H);

    const ditherMode = document.getElementById('ditherMode')?.value || 'threeColor';

    startTime = new Date().getTime();
    const status = document.getElementById("status");
    if (status) status.parentElement.style.display = "block";

    // Process image using main.js's processImageData function
    const processedData = processImageData(imgData, ditherMode);

    updateButtonStatus(true);

    try {
      // Always switch device to Note & Countdown mode (4) first to ensure partial window is configured correctly
      addLog('Đang chuyển đồng hồ sang Chế độ Ghi chú & Đếm ngược...');
      const syncSuccess = await syncTime(4, true);
      if (!syncSuccess) {
        addLog('❌ Lỗi: Không thể chuyển chế độ trên đồng hồ.');
        alert('❌ Lỗi: Không thể chuyển chế độ trên đồng hồ.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 2000ms to 500ms to minimize pin float time and speed up UI

      if (!window.skipNoteEventSync) {
        window.skipNoteEventSync = true;
        const name = document.getElementById('epd-event-name').value.trim();
        const datetimeStr = document.getElementById('epd-event-dt').value;
        if (name && datetimeStr) {
          const targetDate = new Date(datetimeStr);
          const timestampSec = Math.floor(targetDate.getTime() / 1000);
          const nameBytes = new TextEncoder().encode(name);
          const payload = new Uint8Array(4 + nameBytes.length);
          payload[0] = (timestampSec >> 24) & 0xff;
          payload[1] = (timestampSec >> 16) & 0xff;
          payload[2] = (timestampSec >> 8) & 0xff;
          payload[3] = timestampSec & 0xff;
          payload.set(nameBytes, 4);

          addLog(`Gửi sự kiện trước khi gửi ghi chú: "${name}"`);
          if (!await write(0x25, payload, true)) {
            addLog('❌ Lỗi: Không thể đồng bộ sự kiện đếm ngược.');
            alert('❌ Lỗi: Không thể đồng bộ sự kiện đếm ngược.');
            return;
          }
        }
        window.skipNoteEventSync = false;
      }

      // EPD_CMD_INIT
      if (!await write(EpdCmd.INIT)) {
        addLog('❌ Lỗi: Khởi tạo màn hình EPD thất bại.');
        alert('❌ Lỗi: Khởi tạo màn hình EPD thất bại.');
        return;
      }

      // Write image data to EPD RAM. The driver WriteRam function will automatically set
      // the window to (200, 0, 200, 300) because display mode is set to MODE_NOTE_COUNTDOWN.
      if (ditherMode === 'threeColor') {
        const halfLength = Math.floor(processedData.length / 2);
        const bwData = processedData.slice(0, halfLength);
        const redData = processedData.slice(halfLength);
        await writeImage(bwData, 'bw', 0, 0.5);
        await writeImage(redData, 'red', 50, 0.5);
      } else {
        await writeImage(processedData, 'bw', 0, 1);
      }

      // Refresh EPD screen
      if (!await write(EpdCmd.REFRESH)) {
        addLog('❌ Lỗi: Làm mới màn hình thất bại.');
        alert('❌ Lỗi: Làm mới màn hình thất bại.');
        return;
      }

      const sendTime = ((new Date().getTime() - startTime) / 1000.0).toFixed(1);
      addLog(`✅ Gửi ghi chú hoàn thành! Thời gian: ${sendTime}s`);
      alert('✅ Đã đồng bộ thành công cả Ghi chú và Đếm ngược!');
    } catch (err) {
      addLog('❌ Lỗi truyền dữ liệu: ' + err.message);
      alert('❌ Có lỗi xảy ra trong quá trình truyền dữ liệu: ' + err.message);
      window.skipNoteEventSync = false;
    } finally {
      if (typeof updateButtonStatus === 'function') updateButtonStatus(false);
      if (status) status.parentElement.style.display = "none";
      const progressEl = document.getElementById("transfer-progress");
      if (progressEl) {
        progressEl.style.display = "none";
        progressEl.value = 0;
      }
    }
  };

  /**
   * Loads the 200x300 Note canvas to the main painting canvas
   */
  window.loadNoteToMainCanvas = function () {
    renderNoteCanvas();
    const noteCanvas = document.getElementById('epd-note-canvas');
    if (!noteCanvas) return;

    if (typeof canvas !== 'undefined' && canvas && typeof ctx !== 'undefined' && ctx) {
      canvas.width = 400;
      canvas.height = 300;
      
      // Xóa trắng toàn bộ bảng vẽ trước khi chép Note sang
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Vẽ Note vào chính giữa bảng vẽ hoặc góc trái, vì Note là 400x300 nên cứ vẽ thẳng vào (x=0, y=0)
      ctx.drawImage(noteCanvas, 0, 0);

      // Select matching canvas size option
      const canvasSizeSelect = document.getElementById('canvasSize');
      if (canvasSizeSelect) {
        canvasSizeSelect.value = '4.2_400_300';
      }

      convertDithering();
      addLog('📝 Ảnh ghi chú đã được tải lên bảng vẽ. Bạn có thể trang trí thêm trước khi gửi.');
    }
  };

  // ══════════════════════════════════════════════════════════
  // INITIALIZE
  // ══════════════════════════════════════════════════════════
  function init() {
    // Restore Saved Note Font Settings
    const savedFont = localStorage.getItem('epdNoteFontRedesign');
    if (savedFont) document.getElementById('epd-note-font').value = savedFont;
    const savedSize = localStorage.getItem('epdNoteSizeRedesign');
    if (savedSize) document.getElementById('epd-note-size').value = savedSize;
    const savedSpacing = localStorage.getItem('epdNoteSpacingRedesign');
    if (savedSpacing) document.getElementById('epd-note-spacing').value = savedSpacing;
    const savedColor = localStorage.getItem('epdNoteColorRedesign');
    if (savedColor) document.getElementById('epd-note-color').value = savedColor;
    const savedBold = localStorage.getItem('epdNoteBoldRedesign');
    if (savedBold) document.getElementById('epd-note-bold').checked = (savedBold === 'true');
    const savedItalic = localStorage.getItem('epdNoteItalicRedesign');
    if (savedItalic) document.getElementById('epd-note-italic').checked = (savedItalic === 'true');
    const savedWrap = localStorage.getItem('epdNoteWrapRedesign');
    if (savedWrap !== null) document.getElementById('epd-note-wrap').checked = (savedWrap === 'true');

    const currentSpacingValEl = document.getElementById('epd-note-spacing-val');
    if (currentSpacingValEl) {
      currentSpacingValEl.innerText = document.getElementById('epd-note-spacing').value + 'px';
    }

    const savedAlign = localStorage.getItem('epdNoteAlignRedesign') || 'left';
    updateAlignButtonsActiveState(savedAlign);

    // Add click listeners to alignment buttons
    document.querySelectorAll('.epd-note-align-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const align = this.getAttribute('data-align');
        localStorage.setItem('epdNoteAlignRedesign', align);
        updateAlignButtonsActiveState(align);
        onNoteControlChange();
      });
    });

    // Auto-save settings on change
    document.getElementById('epd-note-font').addEventListener('change', function () {
      localStorage.setItem('epdNoteFontRedesign', this.value);
    });
    document.getElementById('epd-note-size').addEventListener('change', function () {
      localStorage.setItem('epdNoteSizeRedesign', this.value);
    });
    document.getElementById('epd-note-spacing').addEventListener('input', function () {
      localStorage.setItem('epdNoteSpacingRedesign', this.value);
    });
    document.getElementById('epd-note-color').addEventListener('change', function () {
      localStorage.setItem('epdNoteColorRedesign', this.value);
    });
    document.getElementById('epd-note-bold').addEventListener('change', function () {
      localStorage.setItem('epdNoteBoldRedesign', this.checked);
    });
    document.getElementById('epd-note-italic').addEventListener('change', function () {
      localStorage.setItem('epdNoteItalicRedesign', this.checked);
    });
    document.getElementById('epd-note-wrap').addEventListener('change', function () {
      localStorage.setItem('epdNoteWrapRedesign', this.checked);
    });

    // Restore Saved Note
    const savedNote = localStorage.getItem('epdNoteTextRedesign');
    if (savedNote) {
      document.getElementById('epd-note-input').value = savedNote;
    }

    // Auto-save note on input
    document.getElementById('epd-note-input').addEventListener('input', function () {
      localStorage.setItem('epdNoteTextRedesign', this.value);
      onNoteControlChange();
    });

    // Restore Saved Event Settings
    const savedEvent = getSavedEvent();
    if (savedEvent) {
      document.getElementById('epd-event-name').value = savedEvent.name || '';
      document.getElementById('epd-event-dt').value = savedEvent.datetime || '';
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 10);
      document.getElementById('epd-event-dt').value = getLocalISOString(d);
    }

    // Auto-refresh preview on event input
    document.getElementById('epd-event-name').addEventListener('input', onNoteControlChange);
    document.getElementById('epd-event-dt').addEventListener('input', onNoteControlChange);

    onNoteControlChange();

    // Start Live Clock Redraw (1 second)
    clockTimer = setInterval(function () {
      renderPreviewCanvas();
      updateCompositeCanvas();
    }, 1000);

    // Start Live Countdown Refresh (1 minute)
    cdTimer = setInterval(function () {
      renderPreviewCanvas();
      updateCompositeCanvas();
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Defer slightly to ensure main.js is fully loaded
    setTimeout(init, 200);
  }

})();
