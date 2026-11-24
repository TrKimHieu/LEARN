# Kiểm tra monorepo trước cutover (2026-11-24)

Nhánh `migration/monorepo`, commit `3eeb4f8`. Máy local Windows 11, Node 24.20, npm 11.19, Docker 29.8. CI dùng Node 22.

## Nguồn

| Nguồn                     | `main`    | Vị trí trong monorepo             |
| ------------------------- | --------- | --------------------------------- |
| `LEARN_backend_unified`   | `9a787e3` | root, giữ nguyên SHA và tên nhánh |
| `LEARN_web_standalone`    | `fd2d4cb` | `apps/web`, nhánh `web/*`         |
| `LEARN_mobile_standalone` | `1825efc` | `apps/mobile`, nhánh `mobile/*`   |

Có 65 nhánh, gồm 64 nhánh nguồn cộng `migration/monorepo`. Mọi nhánh trong `refs-<repo>.txt` đều có mặt. Nhánh backend giữ nguyên SHA, trừ `main` và `feat/xp-friends` vì đã nhận merge. Ref chỉ có trên remote được nhập vào `archive/*`.

## Clean clone, so với baseline 2026-11-23

| Phần         | Lệnh                                                                                                          | Baseline           | Monorepo           |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------ |
| Root/backend | `npm ci`, `db:generate`, `lint`, `typecheck`, `test:tooling`, `contracts:pack`, `contracts:consumer`, `build` | pass               | pass               |
| Root/backend | `test`                                                                                                        | 344                | 344                |
| Web          | `lint`, `typecheck`, `test:tooling`, `build`                                                                  | pass               | pass               |
| Web          | `test`                                                                                                        | 200                | 200                |
| Mobile       | `lint`                                                                                                        | 0 lỗi, 38 cảnh báo | 0 lỗi, 38 cảnh báo |
| Mobile       | `typecheck`, `test:tooling`, `export`                                                                         | pass               | pass               |
| Mobile       | `test`                                                                                                        | 341                | 341                |

`test:tooling` ở root có 20 test: 16 test backend (5 skipped, như baseline) cộng 4 test `web-release`. Web còn 1 test vì 4 test tarball đã bỏ cùng contracts vendor, và 4 test deploy đã chuyển lên root. `typecheck` ở root kiểm cả web và mobile.

## Tích hợp

- **Sandbox backend:** `sandbox:up` rồi `sandbox:verify` cho 9 file, 90 test integration. Kết quả `{"status":"passed","checks":24}`, bao gồm auth web/native, IDOR, upload presigned, trích xuất, sinh bài bằng mock LLM, ẩn đáp án, nộp bài và tiến độ. Compose dùng tên project cố định `learn-m1-sandbox`, nên dùng lại đúng volume cũ.
- **Web dev và API sandbox (`:4400`):**
  - Đăng ký tài khoản thử (ghi trong `LOCAL_TEST_ACCOUNT.md` của workspace) và đăng nhập được.
  - `/dashboard` gọi 4 API và đều nhận 200.
  - Form tạo khoá học bỏ trống hiện lỗi validate tiếng Việt. Tạo khoá học thì `POST /courses` trả 201 và mở trang khoá học.
- **Mobile `expo start --web` và mock API (`npm run mock` chạy bằng `tsx`):**
  - Bundle Metro build được trong monorepo, đăng nhập tài khoản demo được, màn Học hiển thị dữ liệu.
  - `flashcards/due` trả 404. Lỗi này có sẵn từ trước, vì mock của repo nguồn cũng không có route đó.

## Docker image

| Image                                       | Baseline     | Monorepo |
| ------------------------------------------- | ------------ | -------- |
| `api` (runtime)                             | 743 MB       | 744 MB   |
| `worker` (runtime)                          | 884 MB       | 885 MB   |
| `web`                                       | 436 MB       | 441 MB   |
| `compute`                                   | (chưa build) | 405 MB   |
| `migrate` (`Dockerfile.api` target builder) | (chưa build) | 1316 MB  |

Container web trả `GET /login` 200. Image api không chứa `jsdom`, `next`, `expo`, `react-native` hay `lightningcss`.

**Lỗi đã sửa:** lần build đầu, image api và worker nặng thêm khoảng 60 MB. Nguyên nhân là khi có `apps/web/package.json`, lệnh `npm ci --omit=dev -w apps/api` vẫn cài dependency runtime của web. Commit `3eeb4f8` bỏ hẳn `apps/web` và `apps/mobile` khỏi context của image backend. `npm ci` vẫn chấp nhận lockfile chung khi các workspace đó vắng mặt.

## Chưa kiểm

- Chạy workflow trên GitHub (YAML anchor, lọc `paths`, OIDC), vì chưa có remote.
- EAS build từ `apps/mobile`.
- Chạy image api và worker với DB thật. Sandbox đã chạy bản `dist` đã build trên máy local, không chạy trong container.
- App native trên thiết bị hoặc emulator.
