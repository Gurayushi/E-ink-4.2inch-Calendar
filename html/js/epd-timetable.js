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
  const HDR_H   = 57;           // firmware draws header here
  const TABLE_H = FULL_H; // 300px (full-screen image to avoid hardware partial window bugs) for table image

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
    const boldBtn   = document.getElementById('tt-tb-bold');
    const italicBtn = document.getElementById('tt-tb-italic');
    if (boldBtn)   boldBtn.classList.toggle('active', cell.bold);
    if (italicBtn) italicBtn.classList.toggle('active', cell.italic);
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

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
  window.ttAddRow = function () {
    const cols = cells[0] ? cells[0].length : 1;
    const newRow = [];
    for (let c = 0; c < cols; c++) newRow.push(defaultCell());
    cells.push(newRow);
    rowHeights.push(30);
    saveState();
    buildTableDOM();
    renderPreview();
  };

  window.ttDelRow = function (r) {
    if (cells.length <= 1) return;
    cells.splice(r, 1);
    rowHeights.splice(r, 1);
    if (selectedCell && selectedCell.r === r) selectedCell = null;
    saveState();
    buildTableDOM();
    renderPreview();
  };

  window.ttAddCol = function () {
    cells.forEach(row => row.push(defaultCell()));
    const cols = cells[0].length;
    colWidths.push(Math.floor(FULL_W / cols));
    // redistribute widths
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale  = FULL_W / totalW;
    colWidths = colWidths.map(w => Math.floor(w * scale));
    saveState();
    buildTableDOM();
    renderPreview();
  };

  window.ttDelCol = function () {
    if (!cells[0] || cells[0].length <= 1) return;
    cells.forEach(row => row.pop());
    colWidths.pop();
    saveState();
    buildTableDOM();
    renderPreview();
  };

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

    const tableActualH = FULL_H - HDR_H;
    const totalRowH = rowHeights.reduce((a,b)=>a+b,0) || tableActualH;
    const scaleY = tableActualH / totalRowH;
    const ys = [0];
    for (let r = 0; r < rows; r++) ys.push(ys[r] + rowHeights[r]*scaleY);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        const x = xs[c], y = ys[r] + HDR_H, w = xs[c+1]-xs[c], h = ys[r+1]-ys[r];
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
    ctx.strokeRect(0.5, HDR_H + 0.5, FULL_W-1, tableActualH-1);
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
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(FULL_W, HDR_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FULL_W/2, 0); ctx.lineTo(FULL_W/2, HDR_H); ctx.stroke();

    // Left: title + weather
    ctx.fillStyle = '#cc0000'; ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('THOI KHOA BIEU', 4, 5);
    ctx.fillStyle = '#333'; ctx.font = '9px Arial';
    ctx.fillText('Nhiet phong: 25°C', 4, 22);
    ctx.fillText('T.tiet: 30°C - Nang', 4, 38);

    // Right: clock + date
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    ctx.fillStyle = '#000'; ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(hh+':'+mm, FULL_W*3/4, 6);
    const wdN = ['CN','Hai','Ba','Tu','Nam','Sau','Bay'];
    ctx.font = '9px Arial';
    const ds = 'Thu '+wdN[now.getDay()]+' '+String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    ctx.fillText(ds, FULL_W*3/4, 42);

    // Table
    const tc = document.getElementById('tt-table-canvas');
    if (tc) {
      ctx.drawImage(tc, 0, HDR_H, FULL_W, FULL_H - HDR_H, 0, HDR_H, FULL_W, FULL_H - HDR_H);
    }
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  // ── Preview canvas (EPD header + table) ─────────────────────
  function renderPreview() {
    renderTableCanvas();

    const preview = document.getElementById('tt-epd-preview');
    if (!preview) return;
    const ctx = preview.getContext('2d');
    preview.width  = FULL_W;
    preview.height = FULL_H;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, FULL_W, FULL_H);

    // Simulate header (firmware draws this; here just show placeholder)
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, FULL_W, HDR_H);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, HDR_H);
    ctx.lineTo(FULL_W, HDR_H);
    ctx.stroke();
    // Vertical divider in header
    ctx.beginPath();
    ctx.moveTo(FULL_W / 2, 0);
    ctx.lineTo(FULL_W / 2, HDR_H);
    ctx.stroke();

    // Left header text
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('THỜI KHÓA BIỂU', 4, 6);
    ctx.fillStyle = '#333';
    ctx.font = '9px Arial';
    ctx.fillText('Nhiệt phòng: 25°C', 4, 24);
    ctx.fillText('T.tiết: 30°C - Nắng', 4, 38);

    // Right header clock
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${hh}:${mm}`, FULL_W * 3 / 4, 8);
    ctx.font = '9px Arial';
    const wdNames = ['CN','Hai','Ba','Tư','Năm','Sáu','Bảy'];
    const d = now;
    ctx.fillText(`Thứ ${wdNames[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`, FULL_W * 3 / 4, 40);

    // Draw table image below header
    const tableCanvas = document.getElementById('tt-table-canvas');
    if (tableCanvas) {
      ctx.drawImage(tableCanvas, 0, HDR_H + 2);
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
      await new Promise(r => setTimeout(r, 800));
    }

    // Process image (dither)
    const processedData = processImageData(imgData, ditherMode);

    // INIT
    await write(EpdCmd.INIT);

    // Write image to bottom region (0, 57, 400, 241)
    // Driver WriteRam detects mode=3 and sets correct window automatically
    if (ditherMode === 'threeColor') {
      const half  = Math.floor(processedData.length / 2);
      const bwData  = processedData.slice(0, half);
      const redData = processedData.slice(half);
      await writeImage(bwData, 'bw');
      await writeImage(redData, 'red');
    } else {
      await writeImage(processedData, 'bw');
    }

    // Refresh EPD
    await write(EpdCmd.REFRESH);
    if (typeof updateButtonStatus === 'function') updateButtonStatus(false);

    if (typeof addLog === 'function') addLog('✅ Gửi Thời Khóa Biểu thành công!');
    if (status) status.parentElement.style.display = 'none';
    alert('✅ Đã gửi Thời Khóa Biểu lên đồng hồ thành công!');
  };

  // ── Column width resize support ──────────────────────────────
  // (Basic: user can change via number input; future: drag resize)

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
