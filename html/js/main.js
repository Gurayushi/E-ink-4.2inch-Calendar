let bleDevice, gattServer;
let epdService, epdCharacteristic;
let startTime, msgIndex, appVersion;
let canvas, ctx, textDecoder;
let paintManager, cropManager;

const EpdCmd = {
  SET_PINS: 0x00,
  INIT: 0x01,
  CLEAR: 0x02,
  SEND_CMD: 0x03,
  SEND_DATA: 0x04,
  REFRESH: 0x05,
  SLEEP: 0x06,

  SET_TIME: 0x20,
  SET_WEATHER: 0x22,

  WRITE_IMG: 0x30, // v1.6

  SET_CONFIG: 0x90,
  SYS_RESET: 0x91,
  SYS_SLEEP: 0x92,
  CFG_ERASE: 0x99,
};

const canvasSizes = [
  { name: '1.54_152_152', width: 152, height: 152 },
  { name: '1.54_200_200', width: 200, height: 200 },
  { name: '2.13_104_212', width: 104, height: 212 },
  { name: '2.13_122_250', width: 122, height: 250 },
  { name: '2.66_152_296', width: 152, height: 296 },
  { name: '2.66_184_360', width: 184, height: 360 },
  { name: '2.9_128_296', width: 128, height: 296 },
  { name: '2.9_168_384', width: 168, height: 384 },
  { name: '3.5_184_384', width: 184, height: 384 },
  { name: '3.5_360_600', width: 360, height: 600 },
  { name: '3.7_240_416', width: 240, height: 416 },
  { name: '3.7_280_480', width: 280, height: 480 },
  { name: '3.97_800_480', width: 800, height: 480 },
  { name: '3.98_768_552', width: 768, height: 552 },
  { name: '4.2_400_300', width: 400, height: 300 },
  { name: '5.79_792_272', width: 792, height: 272 },
  { name: '5.83_600_448', width: 600, height: 448 },
  { name: '5.83_648_480', width: 648, height: 480 },
  { name: '7.5_640_384', width: 640, height: 384 },
  { name: '7.5_800_480', width: 800, height: 480 },
  { name: '7.5_880_528', width: 880, height: 528 },
  { name: '10.2_960_640', width: 960, height: 640 },
  { name: '10.85_1360_480', width: 1360, height: 480 },
  { name: '11.6_960_640', width: 960, height: 640 },
  { name: '4.0E6_600_400', width: 600, height: 400 },
  { name: '7.3E6_800_480', width: 800, height: 480 },
];

function hex2bytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

function bytes2hex(data) {
  return new Uint8Array(data).reduce(
    function (memo, i) {
      return memo + ("0" + i.toString(16)).slice(-2);
    }, "");
}

function intToHex(intIn) {
  let stringOut = ("0000" + intIn.toString(16)).substr(-4)
  return stringOut.substring(2, 4) + stringOut.substring(0, 2);
}

function resetVariables() {
  gattServer = null;
  epdService = null;
  epdCharacteristic = null;
  msgIndex = 0;
  document.getElementById("log").value = '';
}

async function write(cmd, data, withResponse = true) {
  if (!epdCharacteristic) {
    addLog("Dịch vụ không khả dụng, vui lòng kiểm tra kết nối Bluetooth.");
    return false;
  }
  let payload = [cmd];
  if (data) {
    if (typeof data == 'string') data = hex2bytes(data);
    if (data instanceof Uint8Array) data = Array.from(data);
    payload.push(...data)
  }
  addLog(bytes2hex(payload), '⇑');
  try {
    if (withResponse)
      await epdCharacteristic.writeValueWithResponse(Uint8Array.from(payload));
    else
      await epdCharacteristic.writeValueWithoutResponse(Uint8Array.from(payload));
  } catch (e) {
    console.error(e);
    if (e.message) addLog("write: " + e.message);
    return false;
  }
  return true;
}

async function writeImage(data, step = 'bw') {
  const chunkSize = document.getElementById('mtusize').value - 2;
  const interleavedCount = document.getElementById('interleavedcount').value;
  const count = Math.round(data.length / chunkSize);
  let chunkIdx = 0;
  let noReplyCount = interleavedCount;

  for (let i = 0; i < data.length; i += chunkSize) {
    let currentTime = (new Date().getTime() - startTime) / 1000.0;
    setStatus(`${step == 'bw' ? 'Đen trắng' : 'Màu'} gửi: ${chunkIdx + 1}/${count + 1}, Tổng thời gian: ${currentTime}s`);
    const payload = [
      (step == 'bw' ? 0x0F : 0x00) | (i == 0 ? 0x00 : 0xF0),
      ...data.slice(i, i + chunkSize),
    ];
    if (noReplyCount > 0) {
      await write(EpdCmd.WRITE_IMG, payload, false);
      noReplyCount--;
    } else {
      await write(EpdCmd.WRITE_IMG, payload, true);
      noReplyCount = interleavedCount;
    }
    chunkIdx++;
  }
}

async function setDriver() {
  await write(EpdCmd.SET_PINS, document.getElementById("epdpins").value);
  await write(EpdCmd.INIT, document.getElementById("epddriver").value);
}

async function syncTime(mode) {
  if (mode === 2) {
    if (!await showCustomConfirm(i18n[currentLang].clock_mode_warning)) return;
  }
  const timestamp = new Date().getTime() / 1000;
  const data = new Uint8Array([
    (timestamp >> 24) & 0xFF,
    (timestamp >> 16) & 0xFF,
    (timestamp >> 8) & 0xFF,
    timestamp & 0xFF,
    -(new Date().getTimezoneOffset() / 60),
    mode
  ]);
  if (await write(EpdCmd.SET_TIME, data)) {
    addLog(i18n[currentLang].time_synced);
    addLog(i18n[currentLang].wait_refresh);
  }
}

async function clearScreen() {
  if (await showCustomConfirm(i18n[currentLang].clear_confirm)) {
    await write(EpdCmd.CLEAR);
    addLog(i18n[currentLang].clear_sent);
    addLog(i18n[currentLang].wait_refresh);
  }
}

async function sendcmd() {
  const cmdTXT = document.getElementById('cmdTXT').value;
  if (cmdTXT == '') return;
  const bytes = hex2bytes(cmdTXT);
  await write(bytes[0], bytes.length > 1 ? bytes.slice(1) : null);
}

function convertUC8159(blackWhiteData, redWhiteData) {
  const halfLength = blackWhiteData.length;
  let payloadData = new Uint8Array(halfLength * 4);
  let payloadIdx = 0;
  let black_data, color_data, data;
  for (let i = 0; i < halfLength; i++) {
    black_data = blackWhiteData[i];
    color_data = redWhiteData[i];
    for (let j = 0; j < 8; j++) {
      if ((color_data & 0x80) == 0x00) data = 0x04;  // red
      else if ((black_data & 0x80) == 0x00) data = 0x00;  // black
      else data = 0x03;  // white
      data = (data << 4) & 0xFF;
      black_data = (black_data << 1) & 0xFF;
      color_data = (color_data << 1) & 0xFF;
      j++;
      if ((color_data & 0x80) == 0x00) data |= 0x04;  // red
      else if ((black_data & 0x80) == 0x00) data |= 0x00;  // black
      else data |= 0x03;  // white
      black_data = (black_data << 1) & 0xFF;
      color_data = (color_data << 1) & 0xFF;
      payloadData[payloadIdx++] = data;
    }
  }
  return payloadData;
}

async function sendimg() {
  if (cropManager.isCropMode()) {
    await showCustomAlert("Vui lòng hoàn thành việc cắt ảnh trước! Gửi ảnh đã bị hủy.");
    return;
  }

  const canvasSize = document.getElementById('canvasSize').value;
  const ditherMode = document.getElementById('ditherMode').value;
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];

  if (selectedOption.getAttribute('data-size') !== canvasSize) {
    if (!await showCustomConfirm("Cảnh báo: Kích thước khung vẽ và Driver không khớp, bạn có muốn tiếp tục?")) return;
  }
  if (selectedOption.getAttribute('data-color') !== ditherMode) {
    if (!await showCustomConfirm("Cảnh báo: Chế độ màu và Driver không khớp, bạn có muốn tiếp tục?")) return;
  }

  startTime = new Date().getTime();
  const status = document.getElementById("status");
  status.parentElement.style.display = "block";

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData, ditherMode);

  updateButtonStatus(true);

  await write(EpdCmd.INIT);

  if (ditherMode === 'threeColor') {
    const halfLength = Math.floor(processedData.length / 2);
    const blackWhiteData = processedData.slice(0, halfLength);
    const redWhiteData = processedData.slice(halfLength);
    if (epdDriverSelect.value === '08' || epdDriverSelect.value === '09') {
      await writeImage(convertUC8159(blackWhiteData, redWhiteData), 'bw');
    } else {
      await writeImage(blackWhiteData, 'bw');
      await writeImage(redWhiteData, 'red');
    }
  } else if (ditherMode === 'blackWhiteColor') {
    if (epdDriverSelect.value === '08' || epdDriverSelect.value === '09') {
      const emptyData = new Uint8Array(processedData.length).fill(0xFF);
      await writeImage(convertUC8159(processedData, emptyData), 'bw');
    } else {
      await writeImage(processedData, 'bw');
    }
  } else if (ditherMode === 'fourColor' || ditherMode === 'sixColor') {
    await writeImage(processedData, 'bw');
  } else {
    addLog("Firmware hiện tại không hỗ trợ chế độ màu này.");
    updateButtonStatus();
    return;
  }

  await write(EpdCmd.REFRESH);
  updateButtonStatus();

  const sendTime = (new Date().getTime() - startTime) / 1000.0;
  addLog(`Gửi hoàn thành! Thời gian: ${sendTime}s`);
  setStatus(`Gửi hoàn thành! Thời gian: ${sendTime}s`);
  addLog("Vui lòng không thao tác trước khi màn hình làm mới xong.");
  setTimeout(() => {
    status.parentElement.style.display = "none";
  }, 5000);
}

async function downloadDataArray() {
  if (cropManager.isCropMode()) {
    await showCustomAlert("Vui lòng hoàn thành việc cắt ảnh trước! Tải xuống đã bị hủy.");
    return;
  }

  const mode = document.getElementById('ditherMode').value;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData, mode);

  if (mode === 'sixColor' && processedData.length !== canvas.width * canvas.height) {
    console.log(`Lỗi: Dự kiến ${canvas.width * canvas.height} bytes, nhưng nhận được ${processedData.length} bytes`);
    addLog('Kích thước dữ liệu không khớp. Vui lòng kiểm tra kích thước hình ảnh và chế độ.');
    return;
  }

  const dataLines = [];
  for (let i = 0; i < processedData.length; i++) {
    const hexValue = (processedData[i] & 0xff).toString(16).padStart(2, '0');
    dataLines.push(`0x${hexValue}`);
  }

  const formattedData = [];
  for (let i = 0; i < dataLines.length; i += 16) {
    formattedData.push(dataLines.slice(i, i + 16).join(', '));
  }

  const colorModeValue = mode === 'sixColor' ? 0 : mode === 'fourColor' ? 1 : mode === 'blackWhiteColor' ? 2 : 3;
  const arrayContent = [
    'const uint8_t imageData[] PROGMEM = {',
    formattedData.join(',\n'),
    '};',
    `const uint16_t imageWidth = ${canvas.width};`,
    `const uint16_t imageHeight = ${canvas.height};`,
    `const uint8_t colorMode = ${colorModeValue};`
  ].join('\n');

  const blob = new Blob([arrayContent], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'imagedata.h';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateButtonStatus(forceDisabled = false) {
  const connected = gattServer != null && gattServer.connected;
  const status = forceDisabled ? 'disabled' : (connected ? null : 'disabled');
  document.getElementById("reconnectbutton").disabled = (gattServer == null || gattServer.connected) ? 'disabled' : null;
  document.getElementById("sendcmdbutton").disabled = status;
  document.getElementById("calendarmodebutton").disabled = status;
  document.getElementById("clockmodebutton").disabled = status;
  document.getElementById("syncweatherbutton").disabled = status;
  document.getElementById("clearscreenbutton").disabled = status;
  document.getElementById("sendimgbutton").disabled = status;
  document.getElementById("setDriverbutton").disabled = status;
}

function disconnect() {
  if (bleDevice && bleDevice.forget) {
    bleDevice.forget().catch(e => console.error("Error forgetting device:", e));
  }
  updateButtonStatus();
  resetVariables();
  addLog(i18n[currentLang].disconnected);
  document.getElementById("connectbutton").innerHTML = i18n[currentLang].connect_btn;
}

async function preConnect() {
  if (!navigator.bluetooth) {
    await showCustomAlert("Trình duyệt không hỗ trợ Web Bluetooth trên giao thức hiện tại (giao thức content:// hoặc file://). Bạn cần mở trang web qua HTTPS (như GitHub Pages) để kết nối!");
    return;
  }
  if (gattServer != null && gattServer.connected) {
    if (bleDevice != null && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  }
  else {
    resetVariables();
    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'NRF' }],
        optionalServices: ['62750001-d828-918d-fb46-b6c11c675aec']
      });
    } catch (e) {
      console.error(e);
      if (e.message) addLog("requestDevice: " + e.message);
      addLog(i18n[currentLang].ble_check);
      addLog(i18n[currentLang].ble_check_desktop);
      addLog(i18n[currentLang].ble_check_android);
      addLog(i18n[currentLang].ble_check_ios);
      return;
    }

    await bleDevice.addEventListener('gattserverdisconnected', disconnect);
    setTimeout(async function () { await connect(); }, 300);
  }
}

async function reConnect() {
  if (bleDevice != null && bleDevice.gatt.connected)
    bleDevice.gatt.disconnect();
  resetVariables();
  addLog("Đang kết nối lại...");
  setTimeout(async function () { await connect(); }, 300);
}

function handleNotify(value, idx) {
  const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (idx == 0) {
    addLog(`${i18n[currentLang].config_received} ${bytes2hex(data)}`);
    // 0: mosi_pin, 1: sclk_pin, 2: cs_pin, 3: dc_pin, 4: rst_pin, 5: busy_pin, 6: bs_pin
    // 7: model_id, 8: wakeup_pin, 9: led_pin, 10: en_pin, 11: display_mode, 12: week_start, 13: language
    const epdpins = document.getElementById("epdpins");
    const epddriver = document.getElementById("epddriver");
    epdpins.value = bytes2hex(data.slice(0, 7));
    if (data.length > 10) epdpins.value += bytes2hex(data.slice(10, 11));
    epddriver.value = bytes2hex(data.slice(7, 8));
    
    // Update local language selector if device has it configured
    if (data.length > 13) {
       let langCode = data[13];
       let mappedLang = langCode === 1 ? 'en' : (langCode === 2 ? 'vi' : 'zh');
       if (currentLang !== mappedLang) {
           document.getElementById('langSelector').value = mappedLang;
           setLanguage(mappedLang);
       }
    }
    // Unpack sleep schedule and override days if available
    if (data.length > 18) {
      let schedule = (data[14] << 24) | (data[15] << 16) | (data[16] << 8) | data[17];
      let overrides = data[18];
      window.alwaysRunOverrides = overrides;
      for (let day = 0; day < 7; day++) {
        document.getElementById(`sleep-m-${day}`).checked = (schedule & (1 << (day * 3 + 0))) !== 0;
        document.getElementById(`sleep-a-${day}`).checked = (schedule & (1 << (day * 3 + 1))) !== 0;
        document.getElementById(`sleep-e-${day}`).checked = (schedule & (1 << (day * 3 + 2))) !== 0;
        let isOverridden = (overrides & (1 << day)) !== 0;
        updateOverrideButtonUI(day, isOverridden);
      }
      saveSleepScheduleToStorage(schedule, overrides);
    }
    window.deviceConfigData = data; // Cache it
    updateDitcherOptions();
  } else {
    if (textDecoder == null) textDecoder = new TextDecoder();
    const msg = textDecoder.decode(data);
    addLog(msg, '⇓');
    if (msg.startsWith('mtu=') && msg.length > 4) {
      const mtuSize = parseInt(msg.substring(4));
      document.getElementById('mtusize').value = mtuSize;
      addLog(`${i18n[currentLang].mtu_updated} ${mtuSize}`);
    } else if (msg.startsWith('t=') && msg.length > 2) {
      const t = parseInt(msg.substring(2)) + new Date().getTimezoneOffset() * 60;
      addLog(`${i18n[currentLang].remote_time} ${new Date(t * 1000).toLocaleString()}`);
      addLog(`${i18n[currentLang].local_time} ${new Date().toLocaleString()}`);
    }
  }
}

async function connect() {
  if (bleDevice == null || epdCharacteristic != null) return;

  try {
    addLog(`${i18n[currentLang].connecting} ${bleDevice.name}`);
    gattServer = await bleDevice.gatt.connect();
    addLog('  Found GATT Server');
    epdService = await gattServer.getPrimaryService('62750001-d828-918d-fb46-b6c11c675aec');
    addLog('  Found EPD Service');
    epdCharacteristic = await epdService.getCharacteristic('62750002-d828-918d-fb46-b6c11c675aec');
    addLog('  Found Characteristic');
  } catch (e) {
    console.error(e);
    if (e.message) addLog("connect: " + e.message);
    disconnect();
    return;
  }

  try {
    const versionCharacteristic = await epdService.getCharacteristic('62750003-d828-918d-fb46-b6c11c675aec');
    const versionData = await versionCharacteristic.readValue();
    appVersion = versionData.getUint8(0);
    addLog(`${i18n[currentLang].firmware_version} 0x${appVersion.toString(16)}`);
  } catch (e) {
    console.error(e);
    appVersion = 0x15;
  }

  if (appVersion < 0x16) {
    const oldURL = "https://tsl0922.github.io/EPD-nRF5/v1.5";
    await showCustomAlert(i18n[currentLang].fw_upgrade_warning);
    if (await showCustomConfirm(i18n[currentLang].visit_old_version)) location.href = oldURL;
    setTimeout(() => {
      addLog(`${i18n[currentLang].visit_old_link} ${oldURL}`);
    }, 500);
  }

  try {
    await epdCharacteristic.startNotifications();
    epdCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
      handleNotify(event.target.value, msgIndex++);
    });
  } catch (e) {
    console.error(e);
    if (e.message) addLog("startNotifications: " + e.message);
  }

  await write(EpdCmd.INIT);

  document.getElementById("connectbutton").innerHTML = i18n[currentLang].disconnect_btn;
  updateButtonStatus();
}

function setStatus(statusText) {
  document.getElementById("status").innerHTML = statusText;
}

function addLog(logTXT, action = '') {
  const log = document.getElementById("log");
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0') + " ";

  const logEntry = document.createElement('div');
  const timeSpan = document.createElement('span');
  logEntry.className = 'log-line';
  timeSpan.className = 'time';
  timeSpan.textContent = time;
  logEntry.appendChild(timeSpan);

  if (action !== '') {
    const actionSpan = document.createElement('span');
    actionSpan.className = 'action';
    actionSpan.innerHTML = action;
    logEntry.appendChild(actionSpan);
  }
  logEntry.appendChild(document.createTextNode(logTXT));

  log.appendChild(logEntry);
  log.scrollTop = log.scrollHeight;

  while (log.childNodes.length > 20) {
    log.removeChild(log.firstChild);
  }
}

function clearLog() {
  document.getElementById("log").innerHTML = '';
}

function fillCanvas(style) {
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setCanvasTitle(title) {
  const canvasTitle = document.querySelector('.canvas-title');
  if (canvasTitle) {
    canvasTitle.innerText = title;
    canvasTitle.style.display = title && title !== '' ? 'block' : 'none';
  }
}

function updateImage() {
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length == 0) {
    fillCanvas('white');
    return;
  }

  const image = new Image();
  image.onload = async function () {
    URL.revokeObjectURL(this.src);
    if (image.width / image.height == canvas.width / canvas.height) {
      if (cropManager.isCropMode()) cropManager.exitCropMode();
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
      convertDithering();
    } else {
      await showCustomAlert(i18n[currentLang].crop_mode_alert);
      paintManager.setActiveTool(null, '');
      cropManager.initializeCrop();
    }
  };
  image.src = URL.createObjectURL(imageFile.files[0]);
}

function updateCanvasSize() {
  const selectedSizeName = document.getElementById('canvasSize').value;
  const selectedSize = canvasSizes.find(size => size.name === selectedSizeName);

  canvas.width = selectedSize.width;
  canvas.height = selectedSize.height;

  updateImage();
}

function updateDitcherOptions() {
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const colorMode = selectedOption.getAttribute('data-color');
  const canvasSize = selectedOption.getAttribute('data-size');

  if (colorMode) document.getElementById('ditherMode').value = colorMode;
  if (canvasSize) document.getElementById('canvasSize').value = canvasSize;

  updateCanvasSize(); // always update image
}

function rotateCanvas() {
  const currentWidth = canvas.width;
  const currentHeight = canvas.height;

  // Capture current canvas content
  const imageData = ctx.getImageData(0, 0, currentWidth, currentHeight);

  // Swap canvas dimensions
  canvas.width = currentHeight;
  canvas.height = currentWidth;

  // Create temporary canvas for rotation
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = currentWidth;
  tempCanvas.height = currentHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  // Draw rotated image on the resized canvas
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(90 * Math.PI / 180);
  ctx.drawImage(tempCanvas, -currentWidth / 2, -currentHeight / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform

  paintManager.clearHistory(); // Clear history as canvas size changed
  paintManager.clearElements(); // Clear stored text positions and line segments
  paintManager.saveToHistory(); // Save rotated canvas to history
}

async function clearCanvas() {
  if (await showCustomConfirm('Xóa sạch nội dung bản vẽ?')) {
    fillCanvas('white');
    paintManager.clearElements(); // Clear stored text positions and line segments
    if (cropManager.isCropMode()) cropManager.exitCropMode();
    paintManager.saveToHistory(); // Save cleared canvas to history
    return true;
  }
  return false;
}

function convertDithering() {
  paintManager.redrawTextElements();
  paintManager.redrawLineSegments();

  const contrast = parseFloat(document.getElementById('ditherContrast').value);
  const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageData = new ImageData(
    new Uint8ClampedArray(currentImageData.data),
    currentImageData.width,
    currentImageData.height
  );

  adjustContrast(imageData, contrast);

  const alg = document.getElementById('ditherAlg').value;
  const strength = parseFloat(document.getElementById('ditherStrength').value);
  const mode = document.getElementById('ditherMode').value;
  const processedData = processImageData(ditherImage(imageData, alg, strength, mode), mode);
  const finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, mode);
  ctx.putImageData(finalImageData, 0, 0);

  paintManager.saveToHistory(); // Save dithered image to history
}

function applyDither() {
  cropManager.finishCrop(() => convertDithering());
}

function initEventHandlers() {
  document.getElementById("ditherStrength").addEventListener("input", (e) => {
    document.getElementById("ditherStrengthValue").innerText = parseFloat(e.target.value).toFixed(1);
    applyDither();
  });
  document.getElementById("ditherContrast").addEventListener("input", (e) => {
    document.getElementById("ditherContrastValue").innerText = parseFloat(e.target.value).toFixed(1);
    applyDither();
  });
}

function checkDebugMode() {
  const link = document.getElementById('debug-toggle');
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug');

  if (debugMode === 'true') {
    document.body.classList.add('dark-mode');
    link.innerHTML = 'Chế độ thường';
    link.setAttribute('href', window.location.pathname);
    addLog("Lưu ý: Chế độ nhà phát triển đã được bật! Vui lòng không tự ý sửa đổi nếu không biết rõ!");
  } else {
    document.body.classList.remove('dark-mode');
    link.innerHTML = 'Chế độ Dev';
    link.setAttribute('href', window.location.pathname + '?debug=true');
  }
}

function initializePage() {
  textDecoder = null;
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext("2d");

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  paintManager = new PaintManager(canvas, ctx);
  cropManager = new CropManager(canvas, ctx, paintManager);

  paintManager.initPaintTools();
  cropManager.initCropTools();
  initEventHandlers();
  updateButtonStatus();
  checkDebugMode();

  // Initialize language (force Vietnamese)
  setLanguage('vi');
  loadTimetableFromStorage();
  loadSleepScheduleFromStorage();

  // Initialize collapsible panels on mobile
  if (window.innerWidth <= 768) {
    document.querySelectorAll('fieldset.collapsible').forEach((fs, index) => {
      if (index > 0) {
        fs.classList.add('collapsed');
      }
    });
  }

  // Initialize theme
  const savedTheme = localStorage.getItem('epd_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
  const themeCheckbox = document.getElementById('checkbox-theme');
  if (themeCheckbox) themeCheckbox.checked = isDark;
  toggleTheme(isDark);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage);
} else {
  initializePage();
}

async function updateDeviceLanguageConfig() {
  if (!epdCharacteristic || !gattServer || !gattServer.connected) return;
  if (!window.deviceConfigData) return;
  
  let newLangCode = currentLang === 'en' ? 0 : 1;
  let configArray = Array.from(window.deviceConfigData);
  
  // ensure array is long enough (14 elements: index 0 to 13)
  while(configArray.length < 14) configArray.push(0);
  configArray[13] = newLangCode;
  
  // EPD_CMD_SET_CONFIG is 0x90
  await write(EpdCmd.SET_CONFIG, configArray);
  addLog("Language synced to device");
}


function toggleTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('epd_theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('epd_theme', 'light');
  }
}

// Automatically clear Web Bluetooth cache/permissions on load
window.addEventListener('DOMContentLoaded', async () => {
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      for (const device of devices) {
        if (device.forget) {
          await device.forget();
          console.log(`Cleared cached device permission for: ${device.name}`);
        }
      }
    } catch (e) {
      console.error("Error clearing cached devices on load:", e);
    }
  }
});

function cleanVietnameseCityName(name) {
  if (!name) return "";
  let clean = name;
  const prefixes = [
    /^[Pp]hường\s+/,
    /^[Xx]ã\s+/,
    /^[Qq]uận\s+/,
    /^[Hh]uyện\s+/,
    /^[Tt]hành\s+phố\s+/,
    /^[Tt][Pp]\.?\s+/,
    /^[Tt]hị\s+trấn\s+/,
    /^[Tt]hị\s+xã\s+/
  ];
  for (const prefix of prefixes) {
    clean = clean.replace(prefix, "");
  }
  return clean.trim();
}

async function fetchAndSendWeather(lat, lon, cityName) {
  addLog("Fetching weather data...");
  const cleanedName = cleanVietnameseCityName(cityName);
  const cleanCity = (cleanedName || "Hanoi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .substring(0, 15);
    
  try {
    // 1. Fetch daily & hourly weather data (including humidity and UV index)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code,relative_humidity_2m,uv_index&timezone=auto`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.daily || !data.hourly) {
      throw new Error("Invalid weather response from Open-Meteo");
    }
    
    // 2. Fetch air quality (AQI) data
    addLog("Fetching AQI data...");
    let aqi = 35; // Default to Good (35)
    try {
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;
      const aqiRes = await fetch(aqiUrl);
      const aqiData = await aqiRes.json();
      if (aqiData && aqiData.current && aqiData.current.us_aqi !== undefined) {
        aqi = Math.round(aqiData.current.us_aqi);
        addLog(`AQI (US): ${aqi}`);
      }
    } catch (e) {
      addLog("AQI fetch failed, using default: " + e.message);
    }
    
    // Extract morning (09:00), afternoon (15:00), evening (21:00) indices
    const morningTemp = Math.round(data.hourly.temperature_2m[9]);
    const morningCode = data.hourly.weather_code[9];
    const morningHum = Math.round(data.hourly.relative_humidity_2m[9] || 0);
    const morningUV = Math.round((data.hourly.uv_index[9] || 0) * 10);
    
    const afternoonTemp = Math.round(data.hourly.temperature_2m[15]);
    const afternoonCode = data.hourly.weather_code[15];
    const afternoonHum = Math.round(data.hourly.relative_humidity_2m[15] || 0);
    const afternoonUV = Math.round((data.hourly.uv_index[15] || 0) * 10);
    
    const eveningTemp = Math.round(data.hourly.temperature_2m[21]);
    const eveningCode = data.hourly.weather_code[21];
    const eveningHum = Math.round(data.hourly.relative_humidity_2m[21] || 0);
    
    // Tomorrow
    const tomorrowMin = Math.round(data.daily.temperature_2m_min[1]);
    const tomorrowMax = Math.round(data.daily.temperature_2m_max[1]);
    const tomorrowCode = data.daily.weather_code[1];
    
    // Pack into 16-byte base payload + city bytes:
    const cityBytes = new TextEncoder().encode(cleanCity);
    const payload = new Uint8Array(16 + cityBytes.length);
    
    payload[0] = morningTemp < 0 ? (256 + morningTemp) : morningTemp;
    payload[1] = afternoonTemp < 0 ? (256 + afternoonTemp) : afternoonTemp;
    payload[2] = eveningTemp < 0 ? (256 + eveningTemp) : eveningTemp;
    
    payload[3] = tomorrowMin < 0 ? (256 + tomorrowMin) : tomorrowMin;
    payload[4] = tomorrowMax < 0 ? (256 + tomorrowMax) : tomorrowMax;
    
    payload[5] = mapWMOCodeToWeatherId(morningCode);
    payload[6] = mapWMOCodeToWeatherId(afternoonCode);
    
    const eveWeatherId = mapWMOCodeToWeatherId(eveningCode);
    payload[7] = (eveWeatherId === 0) ? 6 : eveWeatherId; // 6 is NightIcon
    
    payload[8] = mapWMOCodeToWeatherId(tomorrowCode);
    
    payload[9] = (aqi >> 8) & 0xFF;
    payload[10] = aqi & 0xFF;
    
    payload[11] = morningHum;
    payload[12] = afternoonHum;
    payload[13] = eveningHum;
    payload[14] = morningUV;
    payload[15] = afternoonUV;
    
    payload.set(cityBytes, 16);
    
    addLog(`Sending weather: Morn=${morningTemp}C/Hum=${morningHum}%/UV=${(morningUV/10).toFixed(1)}, After=${afternoonTemp}C/Hum=${afternoonHum}%/UV=${(afternoonUV/10).toFixed(1)}, Night=${eveningTemp}C/Hum=${eveningHum}%, Tomor=${tomorrowMin}~${tomorrowMax}C, AQI=${aqi}, City=${cleanCity}`);
    addLog("Sending weather payload...");
    if (await write(EpdCmd.SET_WEATHER, payload)) {
      addLog("Weather synchronized!");
    }
  } catch (error) {
    addLog("Weather fetch failed: " + error.message);
  }
}

async function syncWeather() {
  const cityInput = document.getElementById('weather-city-input');
  if (cityInput && cityInput.value.trim() !== '') {
    const queryCity = cityInput.value.trim();
    addLog(`Searching coordinates for city: "${queryCity}"...`);
    try {
      const geocodeRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryCity)}&count=1&language=vi`);
      const geocodeData = await geocodeRes.json();
      if (geocodeData && geocodeData.results && geocodeData.results.length > 0) {
        const result = geocodeData.results[0];
        const lat = result.latitude;
        const lon = result.longitude;
        const cityName = result.name || queryCity;
        addLog(`Found coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)} (${cityName})`);
        await fetchAndSendWeather(lat, lon, cityName);
        return;
      } else {
        addLog(`No coordinates found for: "${queryCity}". Falling back to GPS...`);
      }
    } catch (err) {
      addLog(`Geocoding failed: ${err.message}. Falling back to GPS...`);
    }
  }

  // 1. Prioritize device GPS (High Accuracy)
  if (navigator.geolocation) {
    addLog("Requesting high-accuracy location from device GPS...");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      addLog(`GPS coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      
      let cityName = "GPS Location";
      try {
        const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`);
        const geoData = await geoRes.json();
        
        // Grab the most specific sub-locality/ward name (e.g., "Phường Láng Hạ")
        cityName = geoData.locality || geoData.city || "GPS Location";
        addLog(`Resolved detailed locality name: "${cityName}"`);
      } catch (e) {
        addLog(`Reverse geocoding failed: ${e.message}. Using GPS Location placeholder.`);
      }
      
      await fetchAndSendWeather(lat, lon, cityName);
    }, async (error) => {
      addLog(`GPS failed: ${error.message}. Falling back to IP Geolocation...`);
      await syncWeatherByIP();
    }, { timeout: 10000, enableHighAccuracy: true });
  } else {
    addLog("GPS is not supported by your browser. Falling back to IP Geolocation...");
    await syncWeatherByIP();
  }
}

async function syncWeatherByIP() {
  addLog("Getting location by IP...");
  try {
    const ipLocResponse = await fetch("https://freeipapi.com/api/json");
    const ipLocData = await ipLocResponse.json();
    if (ipLocData && ipLocData.latitude && ipLocData.longitude) {
      const lat = ipLocData.latitude;
      const lon = ipLocData.longitude;
      const cityName = ipLocData.cityName || "Hanoi";
      addLog(`Location by IP: ${lat.toFixed(4)}, ${lon.toFixed(4)} (${cityName})`);
      await fetchAndSendWeather(lat, lon, cityName);
      return;
    }
  } catch (e) {
    addLog("IP location failed: " + e.message);
    await showCustomAlert("Không thể tự động lấy vị trí. Vui lòng nhập thủ công tên vị trí vào ô nhập liệu!");
  }
}

function mapWMOCodeToWeatherId(code) {
  if (code === 0) return 0; // Sunny
  if (code === 1 || code === 2) return 1; // Cloudy
  if (code === 3 || code === 45 || code === 48) return 2; // Overcast
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 3; // Rainy
  if (code >= 95 && code <= 99) return 4; // Stormy
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 5; // Snowy
  return 1; // Default to Cloudy
}

function loadTimetableFromStorage() {
  const dataStr = localStorage.getItem('timetable_data');
  if (dataStr) {
    try {
      const data = JSON.parse(dataStr);
      for (let day = 0; day < 6; day++) {
        if (data.morning && data.morning[day]) {
          document.getElementById(`tt-m-${day}`).value = data.morning[day];
        }
        if (data.afternoon && data.afternoon[day]) {
          document.getElementById(`tt-a-${day}`).value = data.afternoon[day];
        }
        if (data.evening && data.evening[day]) {
          document.getElementById(`tt-e-${day}`).value = data.evening[day];
        }
      }
    } catch (e) {
      console.error("Error parsing stored timetable data", e);
    }
  }
}

function saveTimetableToStorage() {
  const data = { morning: [], afternoon: [], evening: [] };
  for (let day = 0; day < 6; day++) {
    data.morning.push(document.getElementById(`tt-m-${day}`).value);
    data.afternoon.push(document.getElementById(`tt-a-${day}`).value);
    data.evening.push(document.getElementById(`tt-e-${day}`).value);
  }
  localStorage.setItem('timetable_data', JSON.stringify(data));
}

async function sendTimetable() {
  if (!epdCharacteristic) {
    await showCustomAlert("Vui lòng kết nối Bluetooth với đồng hồ trước!");
    return;
  }
  addLog("Bắt đầu gửi Thời khóa biểu...");
  saveTimetableToStorage();
  
  for (let day = 0; day < 6; day++) {
    const morningText = document.getElementById(`tt-m-${day}`).value.trim();
    const afternoonText = document.getElementById(`tt-a-${day}`).value.trim();
    const eveningText = document.getElementById(`tt-e-${day}`).value.trim();
    
    const encoder = new TextEncoder();
    let morningBytes = encoder.encode(morningText);
    let afternoonBytes = encoder.encode(afternoonText);
    let eveningBytes = encoder.encode(eveningText);
    
    if (morningBytes.length > 31) {
      morningBytes = morningBytes.slice(0, 31);
    }
    if (afternoonBytes.length > 31) {
      afternoonBytes = afternoonBytes.slice(0, 31);
    }
    if (eveningBytes.length > 31) {
      eveningBytes = eveningBytes.slice(0, 31);
    }
    
    const payload = new Uint8Array(4 + morningBytes.length + afternoonBytes.length + eveningBytes.length);
    payload[0] = day;
    payload[1] = morningBytes.length;
    payload[2] = afternoonBytes.length;
    payload[3] = eveningBytes.length;
    payload.set(morningBytes, 4);
    payload.set(afternoonBytes, 4 + morningBytes.length);
    payload.set(eveningBytes, 4 + morningBytes.length + afternoonBytes.length);
    
    addLog(`Đang gửi Thứ ${day + 2}: Sáng='${morningText}', Chiều='${afternoonText}', Tối='${eveningText}'`);
    
    const success = await write(0x23, payload);
    if (!success) {
      addLog(`Gửi Thứ ${day + 2} thất bại!`);
      await showCustomAlert(`Gửi Thời khóa biểu thất bại ở ngày Thứ ${day + 2}.`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  
  addLog("Gửi Thời khóa biểu thành công!");
  await showCustomAlert("Đã gửi Thời khóa biểu thành công lên đồng hồ!");
}

function initModalSelects() {
  const startSelect = document.getElementById('modal-sleep-start');
  const endSelect = document.getElementById('modal-sleep-end');
  if (startSelect && endSelect && startSelect.children.length === 0) {
    for (let h = 0; h < 24; h++) {
      const optStart = document.createElement('option');
      optStart.value = h;
      optStart.innerText = `${h}h`;
      startSelect.appendChild(optStart);
      
      const optEnd = document.createElement('option');
      optEnd.value = h;
      optEnd.innerText = `${h}h`;
      endSelect.appendChild(optEnd);
    }
  }
}

window.sleepScheduleData = {
  sleep_start: [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ],
  sleep_end: [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255]
  ],
  always_run_days: 0
};

function updateSleepUI() {
  for (let day = 0; day < 7; day++) {
    const shelf = document.getElementById(`sleep-shelf-${day}`);
    if (!shelf) continue;
    shelf.innerHTML = '';
    
    let activeCount = 0;
    const start = window.sleepScheduleData.sleep_start[day];
    const end = window.sleepScheduleData.sleep_end[day];
    
    for (let i = 0; i < 4; i++) {
      if (start[i] < 24 && end[i] < 24) {
        activeCount++;
        const tag = document.createElement('div');
        tag.className = 'sleep-tag';
        tag.innerHTML = `<span>${start[i]}h - ${end[i]}h</span>`;
        
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-btn';
        closeBtn.innerText = '×';
        closeBtn.onclick = (function(d, idx) {
          return function() { removeSleepSlot(d, idx); };
        })(day, i);
        
        tag.appendChild(closeBtn);
        shelf.appendChild(tag);
      }
    }
    
    if (activeCount < 4) {
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'sleep-add-btn';
      plusBtn.innerText = '+';
      plusBtn.onclick = (function(d) {
        return function() { openSleepModal(d); };
      })(day);
      
      shelf.appendChild(plusBtn);
    }
    
    const overrideBtn = document.getElementById(`sleep-override-btn-${day}`);
    if (overrideBtn) {
      const isOverridden = (window.sleepScheduleData.always_run_days & (1 << day)) !== 0;
      overrideBtn.checked = isOverridden;
    }
  }
}

window.modalActiveDay = null;

function openSleepModal(day) {
  window.modalActiveDay = day;
  initModalSelects();
  document.getElementById('sleep-modal').classList.add('active');
}

function closeSleepModal() {
  document.getElementById('sleep-modal').classList.remove('active');
}

async function confirmSleepModal() {
  const startVal = parseInt(document.getElementById('modal-sleep-start').value);
  const endVal = parseInt(document.getElementById('modal-sleep-end').value);
  if (startVal === endVal) {
    await showCustomAlert("Giờ bắt đầu và kết thúc phải khác nhau!");
    return;
  }
  
  const day = window.modalActiveDay;
  let slotIdx = -1;
  for (let i = 0; i < 4; i++) {
    if (window.sleepScheduleData.sleep_start[day][i] === 255) {
      slotIdx = i;
      break;
    }
  }
  
  if (slotIdx !== -1) {
    window.sleepScheduleData.sleep_start[day][slotIdx] = startVal;
    window.sleepScheduleData.sleep_end[day][slotIdx] = endVal;
    saveSleepScheduleToStorage();
    updateSleepUI();
  }
  closeSleepModal();
}

function removeSleepSlot(day, slotIdx) {
  window.sleepScheduleData.sleep_start[day][slotIdx] = 255;
  window.sleepScheduleData.sleep_end[day][slotIdx] = 255;
  saveSleepScheduleToStorage();
  updateSleepUI();
}

function toggleSleepOverride(day) {
  window.sleepScheduleData.always_run_days ^= (1 << day);
  saveSleepScheduleToStorage();
  updateSleepUI();
}

function loadSleepScheduleFromStorage() {
  const dataStr = localStorage.getItem('sleep_schedule_data');
  if (dataStr) {
    try {
      const data = JSON.parse(dataStr);
      if (data.sleep_start && Array.isArray(data.sleep_start) && data.sleep_start.length === 7 && Array.isArray(data.sleep_start[0])) {
        window.sleepScheduleData.sleep_start = data.sleep_start;
      }
      if (data.sleep_end && Array.isArray(data.sleep_end) && data.sleep_end.length === 7 && Array.isArray(data.sleep_end[0])) {
        window.sleepScheduleData.sleep_end = data.sleep_end;
      }
      if (typeof data.always_run_days === 'number') {
        window.sleepScheduleData.always_run_days = data.always_run_days;
      }
    } catch (e) {
      console.error("Error parsing stored sleep schedule", e);
    }
  }
  updateSleepUI();
}

function saveSleepScheduleToStorage() {
  localStorage.setItem('sleep_schedule_data', JSON.stringify(window.sleepScheduleData));
}

async function sendSleepSchedule() {
  if (!epdCharacteristic || !gattServer || !gattServer.connected) {
    await showCustomAlert("Đồng hồ chưa kết nối!");
    return;
  }
  
  saveSleepScheduleToStorage();
  addLog("Bắt đầu gửi Lịch tắt...");
  
  for (let day = 0; day < 7; day++) {
    const start = window.sleepScheduleData.sleep_start[day];
    const end = window.sleepScheduleData.sleep_end[day];
    const override = (window.sleepScheduleData.always_run_days & (1 << day)) ? 1 : 0;
    
    const payload = new Uint8Array([
      day,
      start[0], start[1], start[2], start[3],
      end[0], end[1], end[2], end[3],
      override
    ]);
    
    addLog(`Đang gửi Lịch tắt ngày ${day + 1}: start=[${start.join(',')}], end=[${end.join(',')}], override=${override}`);
    
    const success = await write(0x24, payload);
    if (!success) {
      addLog(`Gửi Lịch tắt ngày ${day + 1} thất bại!`);
      await showCustomAlert(`Gửi Lịch tắt thất bại ở ngày ${day + 1}.`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  
  addLog("Gửi Lịch tắt màn hình thành công!");
  await showCustomAlert("Đã gửi Lịch tắt màn hình thành công lên đồng hồ!");
}

// Custom Alert & Confirm Modals
function showCustomAlert(message, title = "Thông báo") {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-dialog-overlay';
    
    const content = document.createElement('div');
    content.className = 'custom-dialog-box alert';
    
    const h4 = document.createElement('h4');
    h4.innerText = title;
    
    const p = document.createElement('p');
    p.innerText = message;
    
    const actions = document.createElement('div');
    actions.className = 'custom-dialog-actions';
    
    const okBtn = document.createElement('button');
    okBtn.className = 'primary';
    okBtn.type = 'button';
    okBtn.innerText = 'OK';
    okBtn.onclick = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.remove();
        resolve();
      }, 300);
    };
    
    actions.appendChild(okBtn);
    content.appendChild(h4);
    content.appendChild(p);
    content.appendChild(actions);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Force reflow and add active class for transition
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  });
}

function showCustomConfirm(message, title = "Xác nhận") {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-dialog-overlay';
    
    const content = document.createElement('div');
    content.className = 'custom-dialog-box confirm';
    
    const h4 = document.createElement('h4');
    h4.innerText = title;
    
    const p = document.createElement('p');
    p.innerText = message;
    
    const actions = document.createElement('div');
    actions.className = 'custom-dialog-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary';
    cancelBtn.type = 'button';
    cancelBtn.innerText = 'Hủy';
    cancelBtn.onclick = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.remove();
        resolve(false);
      }, 300);
    };
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'primary';
    confirmBtn.type = 'button';
    confirmBtn.innerText = 'Đồng ý';
    confirmBtn.onclick = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.remove();
        resolve(true);
      }, 300);
    };
    
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    content.appendChild(h4);
    content.appendChild(p);
    content.appendChild(actions);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Force reflow and add active class for transition
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  });
}

function toggleFieldset(legend) {
  if (window.innerWidth <= 768) {
    const fieldset = legend.closest('fieldset');
    fieldset.classList.toggle('collapsed');
  }
}