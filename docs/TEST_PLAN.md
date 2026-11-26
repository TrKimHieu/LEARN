# KẾ HOẠCH KIỂM THỬ (TEST PLAN) - DỰ ÁN LEARN

**Dự án:** LEARN – Website học tập tạo bài học từ tài liệu bằng AI  
**Môn học:** IE104.R11 - Internet và Công nghệ Web  
**Hệ thống đã triển khai:** https://13-211-191-95.sslip.io  
**Thời gian thực hiện:** 26/11/2026

---

## 1. Phạm vi kiểm thử (Scope)
Kiểm thử tập trung vào 3 chức năng cốt lõi quan trọng nhất của hệ thống web:
1. **Đăng nhập (Authentication):** Xác thực định danh người dùng qua email và mật khẩu, cấp phát access token và refresh token bảo mật phiên làm việc.
2. **Tải tài liệu (Document Upload):** Kiểm soát tính hợp lệ của tài liệu học tập (định dạng, kích thước), cơ chế tải tệp trực tiếp lên MinIO S3 bằng Presigned URL và xác nhận trích xuất.
3. **Sinh bài học bằng AI (AI Lesson Generation):** Kiểm soát hạn mức sử dụng (Quota), khởi tạo tác vụ bất đồng bộ AIJob, gọi mô hình AI sinh dàn ý, nội dung bài học và bài tập tự động.

---

## 2. Bảng đánh giá rủi ro (Risk Assessment)
Mức độ rủi ro được tính theo công thức: **Rủi ro = Tần suất sử dụng (1–3) × Mức độ thiệt hại nếu hỏng (1–3)**.

| Chức năng | Tần suất (1–3) | Thiệt hại (1–3) | Điểm rủi ro | Mức độ kiểm thử ưu tiên | Lý do lựa chọn |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Đăng nhập** | 3 (Mỗi phiên) | 3 (Chặn truy cập) | **9 (Rất cao)** | Unit, Integration, E2E | Là cửa ngõ bảo mật. Nếu lỗi, toàn bộ người học và admin không thể truy cập hệ thống. Dễ bị tấn công brute-force. |
| **Tải tài liệu** | 2 (Theo khoá học) | 3 (Mất dữ liệu / Lỗi storage) | **6 (Cao)** | Unit, Integration, E2E | Đầu vào của toàn bộ quy trình học. Tải sai định dạng hoặc vượt quá kích thước gây nghẽn tài nguyên máy chủ. |
| **Sinh bài học (AI)** | 2 (Theo nhu cầu) | 3 (Lãng phí chi phí / Treo tác vụ) | **6 (Cao)** | Unit, Integration, E2E | Tính năng giá trị cốt lõi. Gọi mô hình LLM tốn chi phí và thời gian, nếu không có idempotency sẽ trừ quota trùng lặp. |

---

## 3. Chiến lược kiểm thử theo cấp độ (Testing Strategy)
Hệ thống áp dụng mô hình **Kim tự tháp kiểm thử (Test Pyramid)** để tối ưu hoá chi phí và tốc độ:
* **Unit Test (Nhiều nhất - Logic thuần):**
  * Kiểm tra các hàm xác thực dữ liệu đầu vào (Zod schemas), quy tắc kiểm tra email, độ dài mật khẩu.
  * Kiểm tra giá trị biên kích thước tệp tải lên (ngưỡng 25MB) và danh sách định dạng MIME cho phép.
  * Kiểm tra cấu trúc phân đoạn văn bản (chunking) và kiểm định schema đầu ra của AI trước khi lưu vào DB.
* **Integration Test (Vừa phải - Tích hợp API & Dịch vụ):**
  * Gọi trực tiếp các API endpoint của hệ thống (/api/v1/auth/login, /api/v1/courses/:id/documents/upload-url, /api/v1/ai/courses/:id/generate-lessons).
  * Kiểm tra mã trạng thái HTTP (200, 201, 400, 401, 403, 429), cấu trúc phản hồi theo chuẩn RFC 9457 (Problem Details).
  * Kiểm tra cơ chế bảo mật: không lộ hash mật khẩu trong response, cookie HttpOnly, giới hạn tần suất (Rate Limiting).
* **End-to-End Test (E2E - Luồng trọng yếu):**
  * Kiểm thử luồng người dùng hoàn chỉnh từ giao diện: Đăng nhập $\rightarrow$ Xem khoá học $\rightarrow$ Kiểm tra hạ tầng sẵn sàng tiếp nhận tài liệu và sinh bài học.

---

## 4. Ngoài phạm vi kiểm thử (Out of Scope)
* Cổng thanh toán trực tuyến tiền thật (hệ thống hiện mô phỏng thanh toán gói dịch vụ).
* Ứng dụng di động (dành cho bài đánh giá riêng).
* Xử lý OCR tài liệu viết tay hoặc quét hình ảnh mờ.

---

## 5. Môi trường và công cụ kiểm thử (Test Environment)
* **Môi trường chạy:** Node.js v22.22.1, Ubuntu 24.04 LTS (Máy chủ IE104) & Production Web trên AWS EC2.
* **Test Runner:** Node.js Native Test Runner (
ode --test), 
ode:assert/strict.
* **Mục tiêu triển khai:** https://13-211-191-95.sslip.io
* **Lệnh chạy toàn bộ test:** 
pm run test:btth
