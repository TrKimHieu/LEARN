#!/usr/bin/env bash
# Start or stop the LEARN staging host from AWS CloudShell.
#   bash staging-power.sh start   # start EC2, point /opt/learn/.env at the new public IP, restart services
#   bash staging-power.sh stop
# The public IP changes on every start (no Elastic IP), so `start` rewrites DOMAIN, APP_URL and
# S3_PUBLIC_ENDPOINT to <ip-with-dashes>.sslip.io and prints the GitHub variables to update.
set -euo pipefail

ID="${LEARN_INSTANCE_ID:-i-03fc47bdd73a43cf5}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}"

case "${1:-}" in
  stop)
    aws ec2 stop-instances --instance-ids "$ID" >/dev/null
    aws ec2 wait instance-stopped --instance-ids "$ID"
    echo "Stopped $ID"
    exit 0
    ;;
  start) ;;
  *) echo "Usage: $0 start|stop" >&2; exit 2 ;;
esac

aws ec2 start-instances --instance-ids "$ID" >/dev/null
echo "Waiting for $ID to pass status checks (a few minutes)..."
aws ec2 wait instance-status-ok --instance-ids "$ID"

ip=$(aws ec2 describe-instances --instance-ids "$ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
[[ "$ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || { echo "No public IP: $ip" >&2; exit 1; }
host="${ip//./-}.sslip.io"
url="https://$host"

echo "Waiting for SSM agent..."
until [ "$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$ID" \
  --query 'InstanceInformationList[0].PingStatus' --output text)" = Online ]; do sleep 5; done

# Same lock as learn-release.sh so this never overlaps a release. sed -i keeps mode 0600 and root owner.
script=$(cat <<EOF
set -euo pipefail
cd /opt/learn
exec 9>/var/lock/learn-release.lock
flock -w 300 9
sed -i -e 's|^DOMAIN=.*|DOMAIN=$host|' -e 's|^APP_URL=.*|APP_URL=$url|' \
  -e 's|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=$url|' .env
grep -E '^(DOMAIN|APP_URL|S3_PUBLIC_ENDPOINT)=' .env
docker compose --env-file .env -f compose.yml up -d --no-deps caddy web api worker
EOF
)
params=$(jq -n --arg s "$script" '{commands: [$s]}')
cmd=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript \
  --comment "LEARN staging address $host" --parameters "$params" \
  --query Command.CommandId --output text)

while :; do
  status=$(aws ssm get-command-invocation --command-id "$cmd" --instance-id "$ID" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$status" in Pending | InProgress | Delayed) sleep 5 ;; *) break ;; esac
done
aws ssm get-command-invocation --command-id "$cmd" --instance-id "$ID" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text
[ "$status" = Success ] || { echo "Host update failed: $status" >&2; exit 1; }

echo "Waiting for HTTPS (Caddy issues a certificate for the new domain)..."
for _ in $(seq 1 30); do
  curl -fsS --max-time 10 -o /dev/null "$url/api/v1/health/ready" && break
  sleep 10
done
curl -fsS --max-time 10 -o /dev/null "$url/api/v1/health/ready" && echo "Ready: $url" || echo "Not ready yet: $url"

cat <<EOF

Update GitHub (run on your PC):
  gh variable set APP_URL -R TrKimHieu/LEARN -e staging -b $url
  gh variable set WEB_APP_URL -R TrKimHieu/LEARN -e staging -b $url
EOF
