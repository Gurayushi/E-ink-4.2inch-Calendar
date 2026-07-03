const i18n = {
  vi: {
    title: "Lịch E-Paper",
    ble_connection: "Kết nối Bluetooth",
    connect_btn: "Kết nối",
    reconnect_btn: "Kết nối lại",
    clear_log_btn: "Xóa Log",
    driver_label: "Driver",
    pin_label: "Chân (Pins)",
    confirm_btn: "Xác nhận",
    device_control: "Điều khiển",
    calendar_mode_btn: "Chế độ Lịch",
    clock_mode_btn: "Chế độ Đồng hồ",
    sync_data_btn: "Đồng bộ dữ liệu",
    clear_screen_btn: "Xóa màn hình",
    send_cmd_btn: "Gửi Lệnh",
    ble_transfer: "Truyền Ảnh",
    canvas_size: "Kích thước:",
    color_mode: "Chế độ màu:",
    dither_alg: "Kiểu Dither:",
    dither_strength: "Độ Dither:",
    contrast: "Độ tương phản:",
    confirm_interval: "K.hoảng ACK:",
    status: "Trạng thái: ",
    rotate_canvas_btn: "Xoay Ảnh",
    clear_canvas_btn: "Xóa Ảnh",
    download_array_btn: "Tải mảng C",
    send_img_btn: "Gửi Ảnh",
    brush_color: "Màu cọ:",
    brush_size: "Cỡ cọ:",
    font_family: "Font chữ:",
    font_size: "Cỡ chữ:",
    add_text_btn: "Thêm chữ",
    finish_btn: "Hoàn tất",
    text_input_placeholder: "Nhập chữ",
    dev_mode: "Chế độ Dev",
    normal_mode: "Bình thường",
    lang_label: "Ngôn ngữ:",
    clock_mode_warning: "Cảnh báo: Chế độ đồng hồ dùng full refresh, không nên bật thường xuyên. Tiếp tục?",
    time_synced: "Đã đồng bộ thời gian!",
    wait_refresh: "Vui lòng chờ màn hình tải xong.",
    clear_confirm: "Xác nhận xóa trắng màn hình?",
    clear_sent: "Đã gửi lệnh xóa!",
    disconnected: "Đã ngắt kết nối.",
    ble_check: "Hãy kiểm tra xem Bluetooth đã bật chưa và trình duyệt có hỗ trợ không! Khuyên dùng:",
    ble_check_desktop: "• Máy tính: Chrome/Edge",
    ble_check_android: "• Android: Chrome/Edge",
    ble_check_ios: "• iOS: Trình duyệt Bluefy",
    connecting: "Đang kết nối...",
    connected: "Đã kết nối thành công!",
    device_not_found: "Không tìm thấy thiết bị",
    connect_ble_first: "Vui lòng kết nối Bluetooth trước",
    config_received: "Đã nhận cấu hình:",
    mtu_updated: "MTU đã cập nhật thành:",
    remote_time: "Thời gian thiết bị:",
    local_time: "Thời gian hệ thống:",
    firmware_version: "Phiên bản Firmware:",
    fw_upgrade_warning: "Cảnh báo: Phiên bản firmware quá thấp, vui lòng nâng cấp.",
    visit_old_version: "Truy cập web phiên bản cũ?",
    visit_old_link: "Nếu gặp lỗi, truy cập bản cũ:",
    disconnect_btn: "Ngắt kết nối",
    crop_mode_alert: "Tỉ lệ ảnh không khớp với khung vẽ, sẽ chuyển sang chế độ cắt.\\nVui lòng phóng to và di chuyển ảnh cho vừa khung, sau đó bấm nút 'Xong'.",
    enter_text: "Vui lòng nhập nội dung văn bản",
    click_to_place: "Chạm vào vùng trống để đặt chữ",
    drag_to_adjust: "Kéo để di chuyển chữ",
    brush_mode: "Chế độ vẽ",
    eraser: "Cục tẩy",
    insert_text: "Chèn chữ"
  }
};

let currentLang = 'vi';

function setLanguage(lang) {
  currentLang = 'vi';
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n['vi'][key]) {
      if (el.tagName === 'INPUT' && el.type === 'text' && el.placeholder) {
        el.placeholder = i18n['vi'][key];
      } else {
        el.innerText = i18n['vi'][key];
      }
    }
  });

  document.title = i18n['vi']['title'];
  
  if (typeof updateDeviceLanguageConfig === "function") {
      updateDeviceLanguageConfig();
  }
}
