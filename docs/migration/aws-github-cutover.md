# Chuyển AWS và GitHub sang monorepo `TrKimHieu/LEARN`

Hướng dẫn này dành cho người có quyền admin trên AWS account `839983937065` (region `ap-southeast-2`, Sydney) và trên repo GitHub `TrKimHieu/LEARN`. Tình trạng ghi ngày 2026-11-25. Tính tới ngày đó, chưa có thay đổi nào trên AWS kể từ trước khi gộp repo.

## Cái gì đổi, cái gì giữ nguyên

Pipeline của monorepo dùng đúng các tài nguyên AWS cũ. Cùng ECR repository, cùng bucket, cùng EC2 và cùng lệnh SSM. Script deploy web (`scripts/deploy/web-release.mjs`) giống hệt bản trong repo web cũ, chỉ khác phần format. Thứ duy nhất phải đổi trên AWS là **trust policy của ba IAM role**. Lý do: GitHub ký token OIDC với subject chứa tên và ID của repo, và repo đã đổi từ `LEARN_backend` / `LEARN_website` thành `LEARN`.

| Tài nguyên AWS                                                       | Việc cần làm                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OIDC provider `token.actions.githubusercontent.com`                  | Giữ nguyên                                                               |
| Role `learn-github-build-backend`                                    | **Sửa trust policy**                                                     |
| Role `learn-github-build-web`                                        | **Sửa trust policy**                                                     |
| Role `learn-github-deploy-staging` (backend và web dùng chung)       | **Sửa trust policy**                                                     |
| Permission policy của ba role trên                                   | Giữ nguyên. Tên ECR repository, prefix S3 và EC2 đích không đổi.         |
| Role của EC2 host (instance profile)                                 | Giữ nguyên                                                               |
| ECR `learn/api`, `learn/worker`, `learn/migrate`, `learn/web`        | Giữ nguyên                                                               |
| S3 `learn-deploy-trkimhieu-2026` (prefix `onebox/<commit>/`)         | Giữ nguyên                                                               |
| EC2 staging `i-03fc47bdd73a43cf5`, tag `Project/Environment/Service` | Giữ nguyên. Chỉ cập nhật địa chỉ khi IP public đổi lúc bật máy (bước 5). |
| `/opt/learn/.env` trên host                                          | Giữ nguyên, trừ địa chỉ khi IP đổi                                       |

Phía GitHub đã làm xong gần hết:

| Mục trên `TrKimHieu/LEARN`                                                                                                                                        | Trạng thái                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Biến repository `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_BUILD_ROLE_ARN`, `DEPLOY_BUCKET`, `WEB_AWS_BUILD_ROLE_ARN`                                                   | Đã có                                    |
| Environment `staging`, chỉ cho nhánh `main` deploy                                                                                                                | Đã có                                    |
| Biến trong `staging`: `AWS_DEPLOY_ROLE_ARN`, `DEPLOY_INSTANCE_ID`, `APP_URL`, `DEPLOY_BUCKET`, `WEB_AWS_DEPLOY_ROLE_ARN`, `WEB_DEPLOY_INSTANCE_ID`, `WEB_APP_URL` | Đã có                                    |
| Secret `EXPO_TOKEN` trong `staging` (chỉ `mobile-apk` cần)                                                                                                        | **Chưa có** (bước 4)                     |
| `LEARN_website`, `LEARN_mobile`                                                                                                                                   | Đã archive. Không cần làm gì thêm.       |
| Production                                                                                                                                                        | Chưa bật. Để `PRODUCTION_ENABLED` trống. |

Ý nghĩa từng biến nằm trong [`github-vars.md`](github-vars.md).

## Subject OIDC của repo mới

Repo dùng immutable subject. Kiểm lại bằng `gh api repos/TrKimHieu/LEARN/actions/oidc/customization/sub`. Lệnh đó trả `sub_claim_prefix` là `repo:TrKimHieu@191193987/LEARN@1443929163`.

| Dùng cho                                       | Subject                                                         |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Build image (job chạy trên `main`)             | `repo:TrKimHieu@191193987/LEARN@1443929163:ref:refs/heads/main` |
| Deploy staging (job có `environment: staging`) | `repo:TrKimHieu@191193987/LEARN@1443929163:environment:staging` |

Job có `environment` luôn mang subject `environment:...`, không mang subject `ref:...`. Vì vậy role deploy phải tin subject environment.

## Bước 1. Sao lưu trust policy hiện tại

Làm việc này trước khi sửa, để có thể khôi phục nếu sai.

1. Đăng nhập AWS Console, chọn region **Asia Pacific (Sydney) ap-southeast-2** ở góc trên.
2. Mở **CloudShell** (biểu tượng `>_` trên thanh trên cùng).
3. Chạy:

   ```bash
   mkdir -p ~/learn-trust && cd ~/learn-trust
   for r in learn-github-build-backend learn-github-build-web learn-github-deploy-staging; do
     aws iam get-role --role-name "$r" --query Role.AssumeRolePolicyDocument --output json > "$r.before.json"
     echo "== $r"; cat "$r.before.json"
   done
   ```

4. Đọc kết quả của từng role:
   - `Principal.Federated` phải là `arn:aws:iam::839983937065:oidc-provider/token.actions.githubusercontent.com`. Nếu khác, giữ đúng giá trị đang có khi làm bước 2.
   - Điều kiện `token.actions.githubusercontent.com:sub` hiện chứa subject của `LEARN_backend@1443929163` hoặc `LEARN_website@1379188518`.

Xong khi: thư mục `~/learn-trust` có ba file `*.before.json` và mỗi file in ra đúng một trust policy.

## Bước 2. Sửa trust policy của ba role

Trong CloudShell, tạo hai file policy. Nếu bước 1 cho thấy `Principal.Federated` khác giá trị dưới đây, sửa cho khớp trước khi chạy.

```bash
cd ~/learn-trust
cat > trust-build.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::839983937065:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:TrKimHieu@191193987/LEARN@1443929163:ref:refs/heads/main"
        }
      }
    }
  ]
}
JSON
sed 's|:ref:refs/heads/main|:environment:staging|' trust-build.json > trust-deploy-staging.json
```

Áp dụng cho từng role:

```bash
aws iam update-assume-role-policy --role-name learn-github-build-backend --policy-document file://trust-build.json
aws iam update-assume-role-policy --role-name learn-github-build-web --policy-document file://trust-build.json
aws iam update-assume-role-policy --role-name learn-github-deploy-staging --policy-document file://trust-deploy-staging.json
```

Policy mới bỏ hẳn subject của `LEARN_backend` và `LEARN_website`. Hai repo cũ đã đổi tên hoặc đã archive, nên không còn chạy workflow được.

Làm bằng giao diện thay vì CloudShell cũng được: **IAM → Roles →** tên role **→ Trust relationships → Edit trust policy**, dán nội dung JSON tương ứng, rồi **Update policy**.

Muốn khôi phục bản cũ: `aws iam update-assume-role-policy --role-name <role> --policy-document file://<role>.before.json`.

Xong khi: `aws iam get-role --role-name <role> --query Role.AssumeRolePolicyDocument` của cả ba role chỉ còn subject có `LEARN@1443929163`.

## Bước 3. Kiểm bằng `aws-check`

Trên máy có `gh`, chạy:

```powershell
gh workflow run aws-check.yml -R TrKimHieu/LEARN
```

Hoặc trên GitHub: **Actions → Check AWS access → Run workflow** trên `main`.

Mỗi job in `sub` và `aud` của token trước khi assume role. Nếu một job đỏ ở `configure-aws-credentials`, so `sub` in ra với subject trong trust policy của role đó.

| Job               | Role được kiểm                |
| ----------------- | ----------------------------- |
| `backend-build`   | `learn-github-build-backend`  |
| `backend-staging` | `learn-github-deploy-staging` |
| `web-build`       | `learn-github-build-web`      |
| `web-staging`     | `learn-github-deploy-staging` |

Xong khi: cả bốn job xanh. Bước này không cần bật EC2.

## Bước 4. Thêm `EXPO_TOKEN` (chỉ khi cần build APK)

1. Đăng nhập https://expo.dev bằng tài khoản `trankimhieu`, owner của project trong `apps/mobile/app.json`.
2. Vào **Account settings → Access tokens → Create token**, đặt tên `github-LEARN`, rồi copy token.
3. Trên GitHub, vào **TrKimHieu/LEARN → Settings → Environments → staging → Environment secrets → Add environment secret**. Tên là `EXPO_TOKEN`, giá trị là token vừa copy.

Không dán token vào chat, commit hay issue.

Xong khi: workflow `mobile-apk` chạy từ `main` qua bước `expo-github-action` và bắt đầu `eas build`.

## Bước 5. Bật staging và deploy

Chỉ làm khi sẵn sàng nghiệm thu, vì EC2 tính tiền khi chạy.

1. **Bật EC2.** Vào **EC2 → Instances → `i-03fc47bdd73a43cf5` → Instance state → Start**. Đợi tới khi trạng thái `Running` và **Status checks** đạt 2/2.
2. **Kiểm IP public.** Nếu IP khác `54.206.111.17` (máy không có Elastic IP thì thường khác), địa chỉ mới có dạng `https://A-B-C-D.sslip.io`.
   - Vào **Systems Manager → Session Manager → Start session** và chọn instance.
   - Sửa `/opt/learn/.env` bằng `sudo nano /opt/learn/.env`. Đổi `DOMAIN`, `APP_URL` và `S3_PUBLIC_ENDPOINT` sang địa chỉ mới. Giữ quyền file `0600`, chủ là root.
   - Trên GitHub, sửa `APP_URL` và `WEB_APP_URL` trong environment `staging` sang cùng địa chỉ.
   - Không cần restart tay. Mỗi lần release, script sẽ `docker compose up -d caddy`, và Caddy lấy chứng chỉ mới cho domain mới.
3. **Deploy backend trước**, vì nó mang bundle compose và script cho host.
   - Vào **Actions → backend-release**, mở lần chạy gần nhất trên `main`, rồi bấm **Re-run all jobs**.
   - Image của commit đó đã có trên ECR, nên workflow dùng lại digest cũ thay vì push lại.
   - Xong khi: job `staging / release` xanh, kể cả smoke test `/api/v1/health/ready`.
4. **Deploy web.**
   - Vào **Actions → web-release**, mở lần chạy lỗi gần nhất, rồi bấm **Re-run all jobs**.
   - `web-release` không có nút chạy tay. Nếu không có lần chạy nào để re-run, cần merge một thay đổi trong `apps/web`.
   - Xong khi: job staging xanh và smoke test `/login` qua.
5. **Nghiệm thu bằng tay** trên địa chỉ staging. Kiểm lần lượt:
   - Đăng nhập, refresh, logout.
   - Upload tài liệu.
   - Worker xử lý tài liệu và sinh bài học.
   - Làm bài và ôn thẻ.
6. **Tắt EC2** khi xong: **Instance state → Stop**.

## Khi gặp lỗi

| Lỗi                                                          | Nguyên nhân thường gặp                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity`    | Subject trong trust policy không khớp `sub` mà `aws-check` in ra                       |
| `Credentials could not be loaded` hoặc `role-to-assume` rỗng | Thiếu biến trong GitHub, hoặc biến nằm sai cấp (repository hay environment)            |
| `Target is not the running LEARN staging host`               | EC2 đang tắt, hoặc tag `Project=LEARN`, `Environment=staging`, `Service=onebox` bị đổi |
| Smoke test lỗi dù release xanh                               | `APP_URL`/`WEB_APP_URL` hoặc `DOMAIN` trong `.env` chưa theo IP mới                    |
| `tag already exists` khi push ECR                            | Tag ECR là immutable. Re-run sẽ dùng lại digest cũ; không xoá image để push lại.       |
