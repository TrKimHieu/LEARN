# DANH SACH LOI VA GHI NHAN KIEM THU (BUGS REPORT) - DU AN LEARN

**Du an:** LEARN - Website hoc tap tao bai hoc tu tai lieu bang AI
**Ngay thuc hien:** 26/11/2026
**He thong kiem thu:** https://13-211-191-95.sslip.io (Staging AWS EC2)
**Pham vi:** 3 chuc nang: Dang nhap, Tai tai lieu, Sinh bai hoc bang AI

---

## 1. Danh sach loi va diem cai thien phat hien qua kiem thu

### BUG-01: Thong bao loi validation cua request login body rong can ban dia hoa than thien
* **Tieu de:** Request login body rong tra ve loi VALIDATION_FAILED chua co message tieng Viet truc quan.
* **Muc do nghiem trong:** Thap (Low).
* **Test case phat hien:** TC-04b (Integration - BVA)
* **Buoc tai hien:**
  1. Gui request POST /api/v1/auth/login voi body {} va header Content-Type: application/json.
* **Ket qua mong doi:** HTTP 400 Bad Request, tra ve message tieng Viet: 'Vui long nhap day du email va mat khau.'
* **Ket qua thuc te:** HTTP 400 Bad Request voi ma VALIDATION_FAILED, tuy nhien truong detail mang tinh ky thuat cua thu vien Zod parser.
* **De xuat khac phuc:** Bo sung custom error map cho Zod schema tai tang DTO presentation cua NestJS.

---

### BUG-02: Kiem tra dung luong tep 0 byte can chan som o client truoc khi goi API
* **Tieu de:** Tep rong 0 byte can co canh bao ro rang ngay khi nguoi dung chon tep.
* **Muc do nghiem trong:** Trung binh (Medium).
* **Test case phat hien:** TC-08b (Unit - EG)
* **Buoc tai hien:**
  1. Nguoi dung chon mot tep tai lieu rong (kich thuoc 0 byte) va bam tai len khoa hoc.
* **Ket qua mong doi:** Giao dien lap tuc hien thi canh bao: 'Tep tai lieu khong co noi dung, vui long chon tep khac' va khong gui request len server.
* **Ket qua thuc te:** Ham logic backend tu choi hop le, nhung o giao dien web can chan som tai upload dropzone de tranh goi network thua.
* **De xuat khac phuc:** Tich hop ham validateFileSize vao component upload-dropzone.tsx o phia web frontend.

---

## 2. Ghi nhan cac kich ban an toan da kiem chung thanh cong (Security & Safety Verified)
Trong qua trinh kiem thu, nhom da chu dong thu nghiem cac kich ban bat thuong va he thong da bao ve an toan:
1. **Chong ro ri thong tin dang nhap:** Khi dang nhap sai mat khau (TC-04), response chi tra ve thong bao loi chuan RFC 9457; hoan toan khong chua mat khau bam (hash), thong tin database hay stack trace noi bo.
2. **Kiem soat truy cap (Access Control):** Cac endpoint tai lieu (TC-10) va sinh bai hoc bang AI (TC-13) deu chan triet de cac request chua duoc cap quyen voi ma HTTP 401 Unauthorized.
3. **Tinh san sang cua ha tang phu tro:** Kiem thu tich hop xac nhan cum co so du lieu PostgreSQL, hang doi Redis (BullMQ) va kho luu tru MinIO S3 deu hoat dong thong suot (checks: database: up, redis: up, storage: up).
