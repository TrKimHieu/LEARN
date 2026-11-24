# Thay đổi khi gộp monorepo và việc còn lại để deploy

Tình trạng ghi ngày 2026-11-24. File này dành cho agent hướng dẫn người dùng deploy lần đầu sau khi gộp repo. Đọc file này cùng [`github-vars.md`](github-vars.md), [`infra/aws/README.md`](../../infra/aws/README.md) và các workflow trong `.github/workflows/`. Khi file này và code khác nhau, tin code.

Vai trò của agent: hướng dẫn từng bước và kiểm tra kết quả. Người dùng tự làm mọi thao tác trên AWS Console/IAM và GitHub Settings. Staging được tắt để tiết kiệm chi phí. Chỉ bật lại khi người dùng sẵn sàng nghiệm thu, và nhắc người dùng tắt lại khi xong.

## Trước và sau khi gộp

Trước đây có ba repo GitHub:

| Repo cũ                   | Nội dung                       | Trạng thái hiện tại                    |
| ------------------------- | ------------------------------ | -------------------------------------- |
| `TrKimHieu/LEARN_backend` | API, worker, compute, packages | Đang là monorepo                       |
| `TrKimHieu/LEARN_website` | Web Next.js                    | Archive (chỉ đọc), README chỉ sang đây |
| `TrKimHieu/LEARN_mobile`  | App Expo                       | Archive (chỉ đọc), README chỉ sang đây |

Bây giờ mọi thứ nằm trong `TrKimHieu/LEARN_backend`. Tên repo được giữ nguyên dù repo đã chứa cả web và mobile. Thư mục local là `LEARN_mono`.

- Web nằm ở `apps/web`, mobile ở `apps/mobile`. Lịch sử commit của cả hai được giữ: các thư mục được viết lại vào `apps/*` rồi merge vào repo.
- Có một workspace npm và một `package-lock.json` ở gốc. Chạy `npm ci` ở gốc, không chạy trong từng app.
- Web và mobile import thẳng `@learn/contracts` (`packages/contracts`, xuất source TS). Thư mục `vendor/` và script `sync:contracts` đã bị xoá.
- Web build bằng `infra/Dockerfile.web`, với build context là gốc repo. File này dùng `infra/Dockerfile.web.dockerignore`. Next standalone chạy bằng `node apps/web/server.js`.
- Workflow có tiền tố theo app:
  - `backend-*`, `web-*`, `mobile-*` và `aws-check`.
  - `paths` filter quyết định workflow nào chạy theo file đổi.
  - `web-release` chỉ chạy khi push lên `main` có đổi file web, và không có `workflow_dispatch`. Muốn chạy lại thì dùng "Re-run jobs" trên một lần chạy cũ.
- Biến của web có tiền tố `WEB_`. Bảng đầy đủ nằm ở `github-vars.md`. Mọi biến đã được tạo trong `LEARN_backend` ngày 2026-11-24.
- `mobile-apk` chạy bằng tay (`workflow_dispatch`). Nó cần secret `EXPO_TOKEN` trong environment `staging`, mà secret này **chưa có**.

## Tình trạng AWS đã kiểm được

| Thành phần                         | Trạng thái                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Role `learn-github-build-backend`  | Nhận repo mới. `backend-release` đã đẩy image lên ECR.                       |
| Role `learn-github-deploy-staging` | Nhận repo mới với `environment:staging`. Backend và web dùng chung role này. |
| Role `learn-github-build-web`      | **Chưa kiểm.** Gần như chắc vẫn chỉ tin `LEARN_website`.                     |
| EC2 staging `i-03fc47bdd73a43cf5`  | Đang tắt. Release lỗi với `Target is not the running LEARN staging host`.    |
| Production                         | Chưa bật. `PRODUCTION_ENABLED` chưa đặt.                                     |

Repo dùng **immutable OIDC subject**, và subject chứa cả ID lẫn tên repo:

```text
repo:TrKimHieu@191193987/LEARN_backend@1443929163:ref:refs/heads/main      # build
repo:TrKimHieu@191193987/LEARN_backend@1443929163:environment:staging      # deploy
```

Muốn xem prefix thực tế, chạy `gh api repos/TrKimHieu/LEARN_backend/actions/oidc/customization/sub`, hoặc chạy workflow `aws-check`, workflow này in `sub` của từng job.

## Các bước deploy

Làm theo thứ tự. Mỗi bước có điều kiện xong. Chỉ sang bước sau khi điều kiện đó đúng.

1. **Sửa trust của `learn-github-build-web`.** Trong IAM, thêm subject build ở trên vào điều kiện `token.actions.githubusercontent.com:sub` của trust policy. Bỏ subject của `LEARN_website`.
   - Xong khi: job `web-build` trong `aws-check` chạy `aws sts get-caller-identity` thành công.
2. **Chạy `aws-check`.** Chạy từ tab Actions hoặc bằng `gh workflow run aws-check.yml -R TrKimHieu/LEARN_backend`.
   - Xong khi: cả 4 job xanh (`backend-build`, `backend-staging`, `web-build`, `web-staging`).
3. **Bật EC2 staging.**
   - IP public đổi sau mỗi lần stop/start, trừ khi có Elastic IP.
   - Khi IP đổi, cập nhật `DOMAIN`, `APP_URL` và `S3_PUBLIC_ENDPOINT` trong `/opt/learn/.env` trên host.
   - Cũng cập nhật biến `APP_URL` và `WEB_APP_URL` trong environment `staging`. Giá trị hiện tại là `https://54-206-111-17.sslip.io`.
   - Instance phải có đúng các tag `Project=LEARN`, `Environment=staging`, `Service=onebox`.
   - Xong khi: instance ở trạng thái `running`, SSM Online, và URL mới trả trang qua Caddy.
4. **Deploy backend trước.** Backend mang bundle compose/Caddy/script cho host.
   - Re-run lần `backend-release` gần nhất trên `main`.
   - Image của commit đó đã nằm trên ECR, và bước "Find images already pushed" sẽ dùng lại digest, nên không bị lỗi tag immutable.
   - Xong khi: job `staging / release` xanh, kể cả bước smoke test `/api/v1/health/ready`.
5. **Deploy web.** Re-run lần `web-release` lỗi gần nhất. Nếu không có lần nào phù hợp, cần một commit lên `main` có đổi file web.
   - Xong khi: job staging xanh và smoke test `/login` qua.
6. **Nghiệm thu bằng tay.**
   - Kiểm HTTPS, đăng nhập/refresh/logout, upload qua presigned URL, worker xử lý, sinh bài học và ôn thẻ.
   - Health xanh chưa chứng minh các luồng này chạy đúng.
   - Xong khi: người dùng xác nhận từng luồng.
7. **Mobile (tuỳ chọn).**
   - Thêm secret `EXPO_TOKEN` vào environment `staging`, rồi chạy `mobile-apk`.
   - Kiểm APK trên máy thật. Bước này chưa từng được kiểm sau khi gộp.
8. **Tắt EC2 staging** khi nghiệm thu xong.

## Điều dễ sai

- Commit lên `main` của một repo có workflow release sẽ tự deploy. Trước khi archive, một commit chỉ sửa README trên `LEARN_website` đã làm `release` tự chạy và phải huỷ tay. Ở monorepo, `paths` filter giới hạn việc này, nhưng sửa `package-lock.json` hay `packages/**` sẽ kích hoạt cả backend lẫn web.
- Khi đổi tên repo, subject OIDC đổi theo, vì subject chứa tên repo. Sau khi đổi tên, phải sửa trust của mọi role (bước 1 cho cả ba role) và các tài liệu nhắc tên repo.
- `sandbox:compare` trong CI chạy toàn bộ integration test với Postgres/Redis/MinIO thật. PR #19 sửa lỗi 500 khi chấm thẻ: `pg_advisory_xact_lock` phải gọi bằng `$executeRaw`, không gọi bằng `$queryRaw`.
- Migration không reset DB và không seed. Seed gói và tài khoản admin là việc riêng, làm một lần.

## Việc chưa làm

- Chưa có backup DB ra ngoài host, chưa có monitoring, và production chưa có host riêng. Chi tiết ở `infra/aws/README.md` mục "Rollback and limits".
- Chưa chạy EAS build và chưa thử app trên thiết bị thật.
- Clone và worktree cũ trên máy người dùng (`LEARN_backend_unified`, `LEARN_web_standalone`, `LEARN_mobile_standalone`) chưa xoá. Bản sao lưu nằm ở `.migration-backups/` và `.git-backups/` trong thư mục workspace cha.
