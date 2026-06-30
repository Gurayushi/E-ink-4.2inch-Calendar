# TÀI LIỆU THIẾT KẾ (DESIGN.md)

> Bảng điều khiển giao diện hiện đại, thân thiện với thiết bị di động dành cho màn hình E-Paper. Nổi bật với phong cách Glassmorphism ở chế độ Sáng và Dark Mode kết hợp điểm nhấn rực rỡ (Vibrant Accents) kèm theo các hiệu ứng tương tác mượt mà.

## 1. Chủ đề Hình ảnh & Không khí (Visual Theme & Atmosphere)

**Phong cách**: Công nghệ cao, Đa giao diện (Glassmorphism & Vibrant Dark)
**Từ khóa**: Hiện đại, Xuyên thấu, Rực rỡ, Tương phản cao, Chuyên nghiệp
**Cảm giác**: Giống như một trạm điều khiển trung tâm tối tân.

**Mức độ Tương tác (Interaction Tier)**: L2 (Tương tác mượt mà với các hiệu ứng hover nâng cao, ripple khi chạm, và hiệu ứng nổi bật focus).
**Dependencies**: Chỉ dùng CSS thuần (không cần thư viện JS nặng) cho các hiệu ứng hover/click.

## 2. Bảng Màu & Chức Năng (Color Palette & Roles)

```css
:root {
  /* Chế độ Sáng (Glassmorphism) */
  --bg-gradient: linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%);
  --surface: rgba(255, 255, 255, 0.65);
  --surface-hover: rgba(255, 255, 255, 0.85);
  --border: rgba(255, 255, 255, 0.4);
  --border-hover: rgba(255, 255, 255, 0.7);
  --shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
  --backdrop: blur(12px);

  --text: #0f172a;
  --text-secondary: #475569;
  
  --accent: #3b82f6; /* Xanh lam */
  --accent-hover: #2563eb;
  
  --secondary-btn: #94a3b8;
  --secondary-btn-hover: #64748b;
  
  --log-bg: rgba(241, 245, 249, 0.7);
  --canvas-border: #cbd5e1;
}

body.dark-mode {
  /* Chế độ Tối (Vibrant Accents) */
  --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --surface: rgba(30, 41, 59, 0.7);
  --surface-hover: rgba(51, 65, 85, 0.8);
  --border: rgba(51, 65, 85, 0.6);
  --border-hover: rgba(71, 85, 105, 0.9);
  --shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
  --backdrop: blur(12px);

  --text: #f8fafc;
  --text-secondary: #94a3b8;
  
  --accent: #0ea5e9; /* Xanh lơ rực rỡ (Cyan) */
  --accent-hover: #38bdf8;
  
  --secondary-btn: #475569;
  --secondary-btn-hover: #64748b;
  
  --log-bg: rgba(15, 23, 42, 0.8);
  --canvas-border: #334155;
}
```

**Quy tắc Màu sắc:**
- Tất cả màu sắc phải thông qua biến CSS (`var()`). Không dùng mã hex cứng trong CSS.
- Chế độ Sáng sử dụng hiệu ứng kính mờ (nền trong suốt + `backdrop-filter: blur()`).
- Chế độ Tối sử dụng nền Slate sâu với ánh sáng Xanh lơ (Cyan) phát sáng ở các điểm nhấn.

## 3. Quy tắc Kiểu Chữ (Typography Rules)

**Nguồn Font:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fira+Code:wght@400;500&display=swap');
```

| Vai trò | Font | Cỡ chữ | Độ đậm | Chiều cao dòng |
|------|------|------|--------|-------------|
| Tiêu đề | Inter | 1.5rem | 600 | 1.2 |
| Legend/Phân khu | Inter | 1.1rem | 600 | 1.4 |
| Chữ thường/Nhãn | Inter | 0.9rem | 400 | 1.5 |
| Nút bấm | Inter | 0.9rem | 500 | 1 |
| Log/Mã code | Fira Code | 0.8rem | 400 | 1.4 |

## 4. Tương tác & Hoạt ảnh (Animation & Interaction)

**Triết lý chuyển động (Motion Philosophy)**: Phản hồi tương tác trực quan, chạm/nhấp chuột phải có hiệu ứng rõ ràng (scale, glow, ripple) để tăng độ chuyên nghiệp.

### Hiệu ứng khi lướt (Hover) & Chạm (Touch)
- **Nút bấm (Buttons)**: 
  - Khi lướt chuột (Hover): Phóng to nhẹ (`transform: scale(1.02)`), thêm viền sáng rực rỡ (`box-shadow` toả ra ngoài).
  - Khi nhấp/chạm (Active): Thu nhỏ lại (`transform: scale(0.98)`), kết hợp hiệu ứng sóng (Ripple) dùng CSS thuần hoặc transition mượt mà.
- **Thẻ Fieldset (Panels)**:
  - Khi hover: Viền sáng lên nhẹ, nổi khối cao hơn (tăng độ đổ bóng).
- **Ô nhập liệu (Inputs & Selects)**:
  - Khi focus: Viền phát sáng rực rỡ màu Accent, mở rộng bóng đổ.

### CSS Mẫu cho Nút bấm:
```css
button {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, background 0.2s ease;
  position: relative;
  overflow: hidden;
}
button:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 16px rgba(14, 165, 233, 0.25);
}
button:active {
  transform: translateY(0) scale(0.98);
}
```

### Hoạt ảnh lúc tải trang (Entrance)
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
fieldset {
  opacity: 0;
  animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

## 5. Quy tắc Bố cục (Layout Principles)

**Khung chứa (Container):**
- Độ rộng tối đa: 1000px
- Căn giữa trang (`margin: 0 auto`)
- Padding mặc định: 1.5rem

**Lưới và Flex:**
- Các nhóm điều khiển (Group) sẽ gói gọn vào hàng ngang trên Desktop và tự động xuống dòng trên Mobile.
- Khoảng cách (Gap) chuẩn là `0.75rem` giữa các phần tử và `1.5rem` giữa các vùng.

## 6. Những điều Nên và Không Nên (Do's and Don'ts)

### NÊN (Do)
- Tạo độ tương phản tốt ở chế độ tối.
- Gắn một nút Toggle rõ ràng trên thanh tiêu đề để chuyển đổi Sáng/Tối.
- Giữ nguyên các giá trị ID của HTML để không làm hỏng logic của mã JavaScript.

### KHÔNG NÊN (Don't)
- ❌ KHÔNG hard-code mã màu (#hex) ở các thuộc tính, tất cả phải dùng var().
- ❌ KHÔNG dùng màu đen thuần (#000000) làm nền, hãy dùng màu xám đen (Slate) để đỡ mỏi mắt.
- ❌ KHÔNG quên thiết lập CSS transition ở thẻ `body` để chuyển từ sáng sang tối được mượt mà.

## 7. Thiết kế Đáp ứng (Responsive)

| Kích thước | Chiều rộng | Hành vi |
|------|-------|-------------|
| Desktop | > 768px | Dàn hàng ngang (Flex row) |
| Mobile | < 768px | Xếp dọc (Flex column), các ô nhập liệu kéo dài 100%, Padding thu nhỏ |

**Khu vực chạm (Touch Targets):** Chiều cao tối thiểu 44px đối với giao diện mobile để ngón tay dễ ấn.
