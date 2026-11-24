# Biến GitHub sau khi gộp monorepo

Trước khi gộp, repo backend và repo web dùng cùng tên biến (cấp repository và environment `staging`/`production`). Trong một repo, các biến của web được đổi tên với tiền tố `WEB_`.

| Trước (repo web `LEARN_website`) | Sau (monorepo)            | Cấp         | Dùng ở                                 |
| -------------------------------- | ------------------------- | ----------- | -------------------------------------- |
| `AWS_BUILD_ROLE_ARN`             | `WEB_AWS_BUILD_ROLE_ARN`  | repository  | `web-release.yml`, `aws-check.yml`     |
| `AWS_DEPLOY_ROLE_ARN`            | `WEB_AWS_DEPLOY_ROLE_ARN` | environment | `web-deploy.yml`, `aws-check.yml`      |
| `DEPLOY_INSTANCE_ID`             | `WEB_DEPLOY_INSTANCE_ID`  | environment | `web-deploy.yml`                       |
| `APP_URL`                        | `WEB_APP_URL`             | environment | `web-deploy.yml` (smoke test `/login`) |

Biến dùng chung, giữ nguyên tên. Nếu giá trị ở hai repo cũ khác nhau, phải tách tên trước khi cutover.

| Biến                 | Cấp        | Dùng ở                                   |
| -------------------- | ---------- | ---------------------------------------- |
| `AWS_ACCOUNT_ID`     | repository | backend, web                             |
| `AWS_REGION`         | repository | backend, web                             |
| `PRODUCTION_ENABLED` | repository | `backend-release.yml`, `web-release.yml` |
| `DEPLOY_BUCKET`      | repository | `backend-release.yml`                    |

Biến của backend giữ nguyên tên: `AWS_BUILD_ROLE_ARN`, `AWS_DEPLOY_ROLE_ARN`, `DEPLOY_INSTANCE_ID`, `APP_URL`.

Secret `EXPO_TOKEN` (environment `staging`) được dùng ở `mobile-apk.yml`.

## Trust policy OIDC

Subject OIDC chứa tên repo (`repo:<owner>/<repo>:...`). Sau khi đổi sang repo mới, phải sửa trust policy của cả bốn role (build và deploy, cho backend và web). Chạy `aws-check.yml` để in `sub` thực tế và kiểm từng role.
