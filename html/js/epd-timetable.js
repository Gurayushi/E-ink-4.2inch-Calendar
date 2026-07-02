// ============================================================
// EPD TIMETABLE — epd-timetable.js
// Excel-like table editor for the Timetable screen.
// Sends 400×241 image to EPD bottom region (y=57..298) via BLE.
// Mirrors sendNoteImage() in epd-note.js.
// ============================================================

(function () {
  'use strict';

  // EPD canvas dimensions
  const FULL_W  = 400;
  const FULL_H  = 300;
  const HDR_H   = 50;           // firmware draws header here (50px height)
  const TABLE_H = FULL_H - HDR_H; // 250px for table image

  // ── Spreadsheet state ────────────────────────────────────────
  // cells[r][c] = { text, font, size, color, align, bold, italic }
  let cells = [];
  let colWidths  = [];  // px in canvas coords
  let rowHeights = [];  // px in canvas coords
  let selectedCell = null;  // { r, c }

  function defaultCell() {
    return { text: '', font: 'Arial', size: 13, color: '#000000', align: 'center', bold: false, italic: false };
  }

  function initTable(rows, cols) {
    cells      = [];
    colWidths  = [];
    rowHeights = [];
    for (let r = 0; r < rows; r++) {
      cells.push([]);
      rowHeights.push(30);
      for (let c = 0; c < cols; c++) {
        cells[r].push(defaultCell());
      }
    }
    for (let c = 0; c < cols; c++) {
      colWidths.push(Math.floor(FULL_W / cols));
    }
    selectedCell = null;
  }

  // ── Persistence ──────────────────────────────────────────────
  function saveState() {
    try {
      localStorage.setItem('epdTimetableState', JSON.stringify({ cells, colWidths, rowHeights }));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('epdTimetableState');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.cells || !s.colWidths || !s.rowHeights) return false;
      cells      = s.cells;
      colWidths  = s.colWidths;
      rowHeights = s.rowHeights;
      return true;
    } catch (e) { return false; }
  }

  // ── HTML Table DOM ────────────────────────────────────────────
  function buildTableDOM() {
    const wrapper = document.getElementById('tt-sheet-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const rows = cells.length;
    const cols = cells[0] ? cells[0].length : 0;

    const table = document.createElement('table');
    table.className = 'tt-sheet';
    table.id = 'tt-main-table';

    // Header row (column index labels)
    const thead = table.createTHead();
    const hrow  = thead.insertRow();
    hrow.insertCell(); // corner cell
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.className = 'tt-col-header';
      th.style.minWidth = Math.max(40, colWidths[c]) + 'px';
      th.innerHTML = `<span>${String.fromCharCode(65 + c)}</span>`;
      hrow.appendChild(th);
    }
    // Add column button
    const addColTh = document.createElement('th');
    addColTh.className = 'tt-add-btn-header';
    addColTh.innerHTML = `<button class="tt-icon-btn" onclick="window.ttAddCol()" title="Thêm cột">＋</button>`;
    hrow.appendChild(addColTh);

    // Body rows
    const tbody = table.createTBody();
    for (let r = 0; r < rows; r++) {
      const tr = tbody.insertRow();

      // Row index label
      const rowTh = document.createElement('th');
      rowTh.className = 'tt-row-header';
      rowTh.innerHTML = `<span>${r + 1}</span>`;
      tr.appendChild(rowTh);

      for (let c = 0; c < cols; c++) {
        const td = tr.insertCell();
        td.className = 'tt-cell';
        const cell = cells[r][c];
        td.style.fontFamily = cell.font;
        td.style.fontSize   = cell.size + 'px';
        td.style.color      = cell.color;
        td.style.textAlign  = cell.align;
        td.style.fontWeight = cell.bold   ? 'bold'   : 'normal';
        td.style.fontStyle  = cell.italic ? 'italic' : 'normal';
        td.style.minWidth   = Math.max(40, colWidths[c]) + 'px';
        td.style.height     = rowHeights[r] + 'px';
        td.contentEditable  = 'true';
        td.textContent      = cell.text;
        td.dataset.r = r;
        td.dataset.c = c;

        td.addEventListener('focus', () => selectCell(r, c));
        td.addEventListener('blur', (e) => {
          cells[r][c].text = e.target.textContent;
          saveState();
          renderPreview();
        });
        td.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Move to next row
            const next = document.querySelector(`.tt-cell[data-r="${r+1}"][data-c="${c}"]`);
            if (next) next.focus();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const next = document.querySelector(`.tt-cell[data-r="${r}"][data-c="${c+1}"]`);
            if (next) { next.focus(); }
          }
        });
      }

      // Del row button
      const delTd = tr.insertCell();
      delTd.className = 'tt-del-btn-cell';
      delTd.innerHTML = `<button class="tt-icon-btn danger" onclick="window.ttDelRow(${r})" title="Xóa hàng">✕</button>`;
    }

    // Add row button row
    const addRowTr = tbody.insertRow();
    const addRowTd = document.createElement('td');
    addRowTd.colSpan = cols + 2;
    addRowTd.className = 'tt-add-row-td';
    addRowTd.innerHTML = `<button class="tt-text-btn" onclick="window.ttAddRow()">＋ Thêm hàng</button>`;
    addRowTr.appendChild(addRowTd);

    wrapper.appendChild(table);
    refreshSelectedHighlight();
  }

  function selectCell(r, c) {
    selectedCell = { r, c };
    refreshSelectedHighlight();
    syncToolbarFromCell(r, c);
  }

  function refreshSelectedHighlight() {
    document.querySelectorAll('.tt-cell').forEach(td => td.classList.remove('tt-selected'));
    if (selectedCell) {
      const td = document.querySelector(`.tt-cell[data-r="${selectedCell.r}"][data-c="${selectedCell.c}"]`);
      if (td) td.classList.add('tt-selected');
    }
  }

  // ── Toolbar <→ Cell sync ─────────────────────────────────────
  function syncToolbarFromCell(r, c) {
    const cell = cells[r][c];
    setEl('tt-tb-font',   cell.font);
    setEl('tt-tb-size',   cell.size);
    setEl('tt-tb-color',  cell.color);
    setEl('tt-tb-align',  cell.align);
    setEl('tt-tb-width',  colWidths[c]);
    setEl('tt-tb-height', rowHeights[r]);
    setEl('tt-tb-width-slider',  colWidths[c]);
    setEl('tt-tb-height-slider', rowHeights[r]);
    const boldBtn   = document.getElementById('tt-tb-bold');
    const italicBtn = document.getElementById('tt-tb-italic');
    if (boldBtn)   boldBtn.classList.toggle('active', cell.bold);
    if (italicBtn) italicBtn.classList.toggle('active', cell.italic);
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  window.ttApplySize = function () {
    if (!selectedCell) return;
    const w = parseInt(document.getElementById('tt-tb-width')?.value);
    const h = parseInt(document.getElementById('tt-tb-height')?.value);
    
    if (!isNaN(w) && w >= 10 && w <= FULL_W) {
      colWidths[selectedCell.c] = w;
    }
    if (!isNaN(h) && h >= 10 && h <= FULL_H) {
      rowHeights[selectedCell.r] = h;
    }
    
    saveState();
    
    // Dynamically update sizes without rebuilding DOM to avoid losing focus
    const colCells = document.querySelectorAll(`.tt-cell[data-c="${selectedCell.c}"]`);
    colCells.forEach(td => td.style.minWidth = Math.max(40, w) + 'px');
    
    const table = document.getElementById('tt-main-table');
    if (table && table.tHead) {
      const ths = table.tHead.querySelectorAll('.tt-col-header');
      if (ths[selectedCell.c]) ths[selectedCell.c].style.minWidth = Math.max(40, w) + 'px';
    }

    const rowCells = document.querySelectorAll(`.tt-cell[data-r="${selectedCell.r}"]`);
    rowCells.forEach(td => td.style.height = h + 'px');

    renderPreview();
  };

  window.ttApplyToolbar = function () {
    if (!selectedCell) return;
    const { r, c } = selectedCell;
    const cell = cells[r][c];
    cell.font   = document.getElementById('tt-tb-font')?.value  || cell.font;
    cell.size   = parseInt(document.getElementById('tt-tb-size')?.value) || cell.size;
    cell.color  = document.getElementById('tt-tb-color')?.value || cell.color;
    cell.align  = document.getElementById('tt-tb-align')?.value || cell.align;
    cell.bold   = document.getElementById('tt-tb-bold')?.classList.contains('active')   || false;
    cell.italic = document.getElementById('tt-tb-italic')?.classList.contains('active') || false;

    // Update DOM cell style
    const td = document.querySelector(`.tt-cell[data-r="${r}"][data-c="${c}"]`);
    if (td) {
      td.style.fontFamily = cell.font;
      td.style.fontSize   = cell.size + 'px';
      td.style.color      = cell.color;
      td.style.textAlign  = cell.align;
      td.style.fontWeight = cell.bold   ? 'bold'   : 'normal';
      td.style.fontStyle  = cell.italic ? 'italic' : 'normal';
    }
    saveState();
    renderPreview();
  };

  window.ttToggleBold = function () {
    const btn = document.getElementById('tt-tb-bold');
    if (btn) btn.classList.toggle('active');
    ttApplyToolbar();
  };

  window.ttToggleItalic = function () {
    const btn = document.getElementById('tt-tb-italic');
    if (btn) btn.classList.toggle('active');
    ttApplyToolbar();
  };

  // ── Table operations ─────────────────────────────────────────
  window.ttInsertRowSel = function () {
    const r = selectedCell ? selectedCell.r : cells.length - 1;
    const cols = cells[0] ? cells[0].length : 1;
    const newRow = [];
    for (let c = 0; c < cols; c++) newRow.push(defaultCell());
    cells.splice(r + 1, 0, newRow);
    rowHeights.splice(r + 1, 0, 30);
    saveState();
    buildTableDOM();
    renderPreview();
    if (selectedCell) {
      selectCell(r + 1, selectedCell.c);
      const cellDom = document.querySelector(`.tt-cell[data-r="${r+1}"][data-c="${selectedCell.c}"]`);
      if (cellDom) cellDom.focus();
    }
  };

  window.ttDeleteRowSel = function () {
    if (cells.length <= 1) return;
    const r = selectedCell ? selectedCell.r : cells.length - 1;
    cells.splice(r, 1);
    rowHeights.splice(r, 1);
    selectedCell = null;
    saveState();
    buildTableDOM();
    renderPreview();
  };

  window.ttInsertColSel = function () {
    const c = selectedCell ? selectedCell.c : cells[0].length - 1;
    cells.forEach(row => {
      row.splice(c + 1, 0, defaultCell());
    });
    colWidths.splice(c + 1, 0, 80);
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale = FULL_W / totalW;
    colWidths = colWidths.map(w => Math.floor(w * scale));
    saveState();
    buildTableDOM();
    renderPreview();
    if (selectedCell) {
      selectCell(selectedCell.r, c + 1);
      const cellDom = document.querySelector(`.tt-cell[data-r="${selectedCell.r}"][data-c="${c+1}"]`);
      if (cellDom) cellDom.focus();
    }
  };

  window.ttDeleteColSel = function () {
    if (!cells[0] || cells[0].length <= 1) return;
    const c = selectedCell ? selectedCell.c : cells[0].length - 1;
    cells.forEach(row => {
      row.splice(c, 1);
    });
    colWidths.splice(c, 1);
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale = FULL_W / totalW;
    colWidths = colWidths.map(w => Math.floor(w * scale));
    selectedCell = null;
    saveState();
    buildTableDOM();
    renderPreview();
  };

  // Deprecated end-actions kept for safety
  window.ttAddRow = function () { window.ttInsertRowSel(); };
  window.ttDelRow = function (r) {
    if (cells.length <= 1) return;
    cells.splice(r, 1);
    rowHeights.splice(r, 1);
    if (selectedCell && selectedCell.r === r) selectedCell = null;
    saveState();
    buildTableDOM();
    renderPreview();
  };
  window.ttAddCol = function () { window.ttInsertColSel(); };
  window.ttDelCol = function () { window.ttDeleteColSel(); };

  // ── Canvas rendering ─────────────────────────────────────────
  function renderTableCanvas() {
    const canvas = document.getElementById('tt-table-canvas');
    if (!canvas) return;
    canvas.width = FULL_W; canvas.height = TABLE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, FULL_W, TABLE_H);

    const rows = cells.length;
    const cols = cells[0] ? cells[0].length : 0;
    if (!rows || !cols) return;

    const totalColW = colWidths.reduce((a,b)=>a+b,0) || FULL_W;
    const scaleX = FULL_W / totalColW;
    const xs = [0];
    for (let c = 0; c < cols; c++) xs.push(xs[c] + colWidths[c]*scaleX);

    const totalRowH = rowHeights.reduce((a,b)=>a+b,0) || TABLE_H;
    const scaleY = TABLE_H / totalRowH;
    const ys = [0];
    for (let r = 0; r < rows; r++) ys.push(ys[r] + rowHeights[r]*scaleY);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        const x = xs[c], y = ys[r], w = xs[c+1]-xs[c], h = ys[r+1]-ys[r];
        ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8;
        ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);

        if (cell.text) {
          const fs = (cell.italic?'italic ':'')+(cell.bold?'bold ':'')+cell.size+'px "'+cell.font+'"';
          ctx.font = fs; ctx.fillStyle = cell.color || '#000';
          ctx.textBaseline = 'middle';
          ctx.textAlign = cell.align || 'center';
          const pad = 3;
          let tx = x + pad;
          if (cell.align==='center') tx = x+w/2;
          else if (cell.align==='right') tx = x+w-pad;
          const maxW = w - pad*2;
          const lineH = cell.size*1.25;
          const lines = wrapText(ctx, cell.text, maxW);
          const totalH = lines.length * lineH;
          let ty = y + (h-totalH)/2 + lineH/2;
          for (const ln of lines) { if(ty>y+h) break; ctx.fillText(ln, tx, ty, maxW); ty+=lineH; }
        }
      }
    }
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
    ctx.strokeRect(0.5, 0.5, FULL_W-1, TABLE_H-1);
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur+' '+w : w;
      if (ctx.measureText(test).width <= maxW) { cur = test; }
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function draw7SegmentDigit(ctx, x, y, val, cS, fC) {
    const nums = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x00, 0x40];
    const w = 11 * cS;
    const h = 20 * cS;
    const t = cS;

    const segs = [
      [t, 0, w - 2*t, t],
      [w - t, t, t, h/2 - t],
      [w - t, h/2 + t/2, t, h/2 - t],
      [t, h - t, w - 2*t, t],
      [0, h/2 + t/2, t, h/2 - t],
      [0, t, t, h/2 - t],
      [t, h/2 - t/2, w - 2*t, t]
    ];

    const code = nums[val];
    for (let j = 0; j < 7; j++) {
      if ((code & (1 << j)) !== 0) {
        ctx.fillStyle = fC;
        ctx.fillRect(x + segs[j][0], y + segs[j][1], segs[j][2], segs[j][3]);
      }
    }
  }

  function draw7SegmentTime(ctx, x, y, hh, mm, cS, color) {
    const d = 13 * cS;
    const h1 = Math.floor(hh / 10);
    const h2 = hh % 10;
    const m1 = Math.floor(mm / 10);
    const m2 = mm % 10;

    draw7SegmentDigit(ctx, x, y, h1, cS, color);
    draw7SegmentDigit(ctx, x + d, y, h2, cS, color);

    const colonX = x + 2 * d;
    ctx.fillStyle = color;
    ctx.fillRect(colonX, y + Math.floor(4.5 * cS) + 1, 2 * cS, 2 * cS);
    ctx.fillRect(colonX, y + Math.floor(13.5 * cS) + 3, 2 * cS, 2 * cS);

    const minX = colonX + 4 * cS;
    draw7SegmentDigit(ctx, minX, y, m1, cS, color);
    draw7SegmentDigit(ctx, minX + d, y, m2, cS, color);
  }

  // Live preview
  function renderPreview() {
    renderTableCanvas();
    const preview = document.getElementById('tt-epd-preview');
    if (!preview) return;
    const ctx = preview.getContext('2d');
    preview.width = FULL_W; preview.height = FULL_H;

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, FULL_W, FULL_H);

    // Header bg
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, FULL_W, HDR_H);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(FULL_W, HDR_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FULL_W/2, 0); ctx.lineTo(FULL_W/2, HDR_H); ctx.stroke();

    // Left: title + weather
    ctx.fillStyle = '#cc0000'; ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('THỜI GIAN BIỂU', 6, 6);
    ctx.fillStyle = '#333'; ctx.font = '9px Arial';
    ctx.fillText('Nhiệt phòng: 25°C', 6, 22);
    ctx.fillText('T.tiết: 30°C - Nắng', 6, 36);

    // Right: clock + date
    const now = new Date();
    let powerSavingActive = false;
    if (window.sleepScheduleData) {
      let day_idx = now.getDay() - 1;
      if (day_idx < 0) day_idx = 6;
      powerSavingActive = (window.sleepScheduleData.always_run_days & (1 << day_idx)) === 0;
    }

    if (!powerSavingActive) {
      draw7SegmentTime(ctx, 200 + (200 - 54) / 2, 3, now.getHours(), now.getMinutes(), 1, '#000');
    }

    ctx.textAlign = 'center';
    const wdN = ['chủ nhật','thứ hai','thứ ba','thứ tư','thứ năm','thứ sáu','thứ bảy'];
    ctx.font = '9px Arial';
    const ds = wdN[now.getDay()]+' ngày '+String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    ctx.fillText(ds, FULL_W*3/4, 43);

    // Table
    const tc = document.getElementById('tt-table-canvas');
    if (tc) {
      ctx.drawImage(tc, 0, HDR_H);
    }
  }

  // ── BLE send ─────────────────────────────────────────────────
  window.sendTimetableImage = async function () {
    if (typeof epdCharacteristic === 'undefined' || !epdCharacteristic) {
      alert('Chưa kết nối Bluetooth! Vui lòng kết nối trước.');
      return;
    }

    // Sync text from contenteditable before rendering
    document.querySelectorAll('.tt-cell').forEach(td => {
      const r = parseInt(td.dataset.r);
      const c = parseInt(td.dataset.c);
      if (cells[r] && cells[r][c] !== undefined) {
        cells[r][c].text = td.textContent;
      }
    });
    saveState();

    renderTableCanvas();
    const tableCanvas = document.getElementById('tt-table-canvas');
    const ctx2 = tableCanvas.getContext('2d');
    const imgData = ctx2.getImageData(0, 0, FULL_W, TABLE_H);

    const ditherMode = document.getElementById('ditherMode')?.value || 'threeColor';

    const status = document.getElementById('status');
    if (status) status.parentElement.style.display = 'block';
    if (typeof updateButtonStatus === 'function') updateButtonStatus(true);

    // Switch to timetable mode (3) if not already
    if (window.currentDisplayMode !== 3) {
      if (typeof addLog === 'function') addLog('Đang chuyển đồng hồ sang Chế độ Thời Khóa Biểu...');
      await syncTime(3, true);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Process image (dither)
    const processedData = processImageData(imgData, ditherMode);

    // INIT
    await write(EpdCmd.INIT);

    // Write image to bottom region (0, 50, 400, 250)
    // Driver WriteRam detects mode=3 and sets correct window automatically
    if (ditherMode === 'threeColor') {
      const half  = Math.floor(processedData.length / 2);
      const bwData  = processedData.slice(0, half);
      const redData = processedData.slice(half);
      await writeImage(bwData, 'bw', 0, 0.5);
      await writeImage(redData, 'red', 50, 0.5);
    } else {
      await writeImage(processedData, 'bw', 0, 1);
    }

    // Refresh EPD
    await write(EpdCmd.REFRESH);
    if (typeof updateButtonStatus === 'function') updateButtonStatus(false);

    if (typeof addLog === 'function') addLog('✅ Gửi Thời Khóa Biểu thành công!');
    if (status) status.parentElement.style.display = 'none';
    
    const progressEl = document.getElementById("transfer-progress");
    if (progressEl) {
      progressEl.style.display = "none";
      progressEl.value = 0;
    }
    
    alert('✅ Đã gửi Thời Khóa Biểu lên đồng hồ thành công!');
  };

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    if (!loadState()) {
      initTable(6, 5); // default: 6 rows × 5 cols
    }
    buildTableDOM();
    renderPreview();

    // Update preview clock every minute
    setInterval(() => renderPreview(), 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();
