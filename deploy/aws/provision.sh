#!/usr/bin/env bash
# Set up every AWS service Campus Pulse uses. Run in AWS CloudShell after create-server.sh:
#
#   bash provision.sh campuspulse.app you@example.com
#
# Creates (or keeps, if they already exist):
#   - alerts: an SNS topic that emails you (confirm the email AWS sends you)
#   - a monthly AWS Budget that warns you before spending passes BUDGET (default $50)
#   - a private S3 bucket for off-server database backups, which deletes copies after 90 days
#   - CloudWatch Logs for the app, with an alarm that emails you when any error is logged
#   - a Route 53 health check on https://DOMAIN/healthz, with an alarm when the site is down
#   - Amazon SES email for "Forgot password" (domain verified in Route 53, production access requested)
#   - an Amazon Location API key for the map, usable only from your domain
#   - an IAM user the server uses for backups, logs, and email, allowed to do nothing else
# and prints one command to paste on the server to connect it to all of the above.
set -euo pipefail

DOMAIN="${1:?Usage: bash provision.sh yourdomain.com you@example.com}"
EMAIL="${2:?Usage: bash provision.sh yourdomain.com you@example.com}"
REGION="${AWS_REGION:-us-east-2}"
BUDGET="${BUDGET:-50}"
export AWS_DEFAULT_REGION="$REGION"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
TOPIC=campus-pulse-alerts
BUCKET="campus-pulse-backups-$ACCOUNT-$REGION"
LOG_GROUP=/campus-pulse/app
IAM_USER=campus-pulse-server
MAP_KEY=campus-pulse-maps
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Email alerts (SNS)"
# Route 53 health-check alarms must live in us-east-1, so there's a topic there too.
topic_in() {
  local region="$1" arn
  arn="$(aws sns create-topic --region "$region" --name "$TOPIC" --query TopicArn --output text)"
  if ! aws sns list-subscriptions-by-topic --region "$region" --topic-arn "$arn" --query "Subscriptions[?Endpoint=='$EMAIL'] | [0]" --output text | grep -q "$EMAIL"; then
    aws sns subscribe --region "$region" --topic-arn "$arn" --protocol email --notification-endpoint "$EMAIL" >/dev/null
    echo "Sent a confirmation email to $EMAIL for alerts from $region: click the link in it." >&2
  fi
  echo "$arn"
}
TOPIC_ARN="$(topic_in "$REGION")"
TOPIC_ARN_USE1="$(topic_in us-east-1)"

step "Monthly budget alert (\$$BUDGET)"
if aws budgets describe-budget --account-id "$ACCOUNT" --budget-name campus-pulse >/dev/null 2>&1; then
  echo "Budget already exists."
else
  aws budgets create-budget --account-id "$ACCOUNT" \
    --budget "{\"BudgetName\":\"campus-pulse\",\"BudgetLimit\":{\"Amount\":\"$BUDGET\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}" \
    --notifications-with-subscribers "[
      {\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},
       \"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]},
      {\"Notification\":{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},
       \"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]}]"
  echo "You'll get an email at 80% of \$$BUDGET actual spend, or if the month is forecast to pass it."
fi

step "Backup bucket (s3://$BUCKET)"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{"ID": "expire-old-backups", "Status": "Enabled", "Filter": {"Prefix": ""}, "Expiration": {"Days": 90}}]}'
echo "Private, encrypted, and old copies deleted after 90 days."

step "App logs and error alarm (CloudWatch)"
aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30
aws logs put-metric-filter --log-group-name "$LOG_GROUP" --filter-name app-errors \
  --filter-pattern '"ERROR"' \
  --metric-transformations metricName=AppErrors,metricNamespace=CampusPulse,metricValue=1,defaultValue=0
aws cloudwatch put-metric-alarm --alarm-name campus-pulse-app-errors \
  --alarm-description "Campus Pulse logged an error. Details: CloudWatch Logs, group $LOG_GROUP." \
  --namespace CampusPulse --metric-name AppErrors --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching \
  --alarm-actions "$TOPIC_ARN"
echo "Any ERROR in the app's log emails you within about 5 minutes."

step "Uptime check on https://$DOMAIN/healthz (Route 53)"
HC_ID="$(aws route53 list-health-checks --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='$DOMAIN' && HealthCheckConfig.ResourcePath=='/healthz'].Id | [0]" --output text)"
if [[ -z "$HC_ID" || "$HC_ID" == "None" ]]; then
  HC_ID="$(aws route53 create-health-check --caller-reference "campus-pulse-$(date +%s)" --health-check-config \
    "Type=HTTPS,FullyQualifiedDomainName=$DOMAIN,Port=443,ResourcePath=/healthz,RequestInterval=30,FailureThreshold=3,EnableSNI=true" \
    --query HealthCheck.Id --output text)"
  aws route53 change-tags-for-resource --resource-type healthcheck --resource-id "$HC_ID" --add-tags Key=Name,Value=campus-pulse
fi
aws cloudwatch put-metric-alarm --region us-east-1 --alarm-name campus-pulse-down \
  --alarm-description "https://$DOMAIN/healthz is failing: QR codes may not be redirecting." \
  --namespace AWS/Route53 --metric-name HealthCheckStatus --dimensions "Name=HealthCheckId,Value=$HC_ID" \
  --statistic Minimum --period 60 --evaluation-periods 2 --threshold 1 --comparison-operator LessThanThreshold \
  --treat-missing-data breaching --alarm-actions "$TOPIC_ARN_USE1" --ok-actions "$TOPIC_ARN_USE1"
echo "You'll get an email if the site is down for 2 minutes, and another when it's back."

step "Email for password resets (SES)"
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." --query "HostedZones[?Name=='$DOMAIN.'].Id | [0]" --output text)"
ZONE_ID="${ZONE_ID##*/}"
aws sesv2 get-email-identity --email-identity "$DOMAIN" >/dev/null 2>&1 || aws sesv2 create-email-identity --email-identity "$DOMAIN" >/dev/null
CHANGES=""
for token in $(aws sesv2 get-email-identity --email-identity "$DOMAIN" --query "DkimAttributes.Tokens" --output text); do
  CHANGES+="{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$token._domainkey.$DOMAIN\",\"Type\":\"CNAME\",\"TTL\":1800,\"ResourceRecords\":[{\"Value\":\"$token.dkim.amazonses.com\"}]}},"
done
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "{\"Changes\":[${CHANGES%,}]}" >/dev/null
echo "Added the DNS records that prove you own $DOMAIN (verification takes a few minutes to an hour)."
if [[ "$(aws sesv2 get-account --query ProductionAccessEnabled --output text)" != "True" ]]; then
  aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL \
    --website-url "https://$DOMAIN" --contact-language EN \
    --use-case-description "Campus Pulse sends password-reset emails to student club officers who request one on https://$DOMAIN. Only transactional mail to users who asked for it; no marketing or lists. Expect a handful per week." \
    --additional-contact-email-addresses "$EMAIL" >/dev/null 2>&1 \
    && echo "Requested SES production access (AWS usually answers within a day). Until then SES can only send to verified addresses." \
    || echo "Request SES production access in the SES console (Account dashboard) so resets can reach any officer."
fi

step "Map key (Amazon Location, usable only from https://$DOMAIN)"
if ! aws location describe-key --key-name "$MAP_KEY" >/dev/null 2>&1; then
  aws location create-key --key-name "$MAP_KEY" --no-expiry \
    --description "Campus Pulse map tiles in the browser" \
    --restrictions "{\"AllowActions\":[\"geo-maps:*\"],\"AllowResources\":[\"arn:aws:geo-maps:$REGION::provider/default\"],\"AllowReferers\":[\"https://$DOMAIN/*\",\"http://localhost:8000/*\",\"http://localhost:5173/*\"]}" >/dev/null
fi
MAP_KEY_VALUE="$(aws location describe-key --key-name "$MAP_KEY" --query Key --output text)"
echo "Done. The key only works on $DOMAIN (and localhost, for testing), so it's safe in the page."

step "Server access (IAM user $IAM_USER: backups, logs, and email only)"
aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1 || aws iam create-user --user-name "$IAM_USER" >/dev/null
aws iam put-user-policy --user-name "$IAM_USER" --policy-name campus-pulse-server --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::$BUCKET/*\"},
    {\"Effect\": \"Allow\", \"Action\": [\"logs:CreateLogStream\", \"logs:PutLogEvents\", \"logs:DescribeLogStreams\"],
     \"Resource\": \"arn:aws:logs:$REGION:$ACCOUNT:log-group:$LOG_GROUP:*\"},
    {\"Effect\": \"Allow\", \"Action\": \"ses:SendRawEmail\", \"Resource\": \"*\"}
  ]}"
if [[ "$(aws iam list-access-keys --user-name "$IAM_USER" --query 'length(AccessKeyMetadata)' --output text)" -ge 2 ]]; then
  echo "This user already has 2 access keys. Delete an old one in the IAM console, then re-run." >&2
  exit 1
fi
read -r KEY_ID KEY_SECRET < <(aws iam create-access-key --user-name "$IAM_USER" --query "AccessKey.[AccessKeyId,SecretAccessKey]" --output text)
# SES SMTP passwords are derived from the secret key (AWS's documented "SendRawEmail" signing steps).
SMTP_PASSWORD="$(KEY_SECRET="$KEY_SECRET" REGION="$REGION" python3 - <<'PY'
import base64, hashlib, hmac, os
def sign(key, msg): return hmac.new(key, msg.encode(), hashlib.sha256).digest()
sig = sign(("AWS4" + os.environ["KEY_SECRET"]).encode(), "11111111")
for part in (os.environ["REGION"], "ses", "aws4_request", "SendRawEmail"):
    sig = sign(sig, part)
print(base64.b64encode(bytes([4]) + sig).decode())
PY
)"

cat <<DONE

$(printf '\033[1;32m')All AWS services are set up.$(printf '\033[0m')

1. Confirm the alert emails AWS just sent to $EMAIL (one per region).
2. On the server (Lightsail console, then "Connect using SSH"), after setup.sh has run, paste this
   whole command. It contains a password, so don't share it:

sudo /srv/campus-pulse/deploy/aws/connect-server.sh \\
  AWS_REGION=$REGION \\
  AWS_ACCESS_KEY_ID=$KEY_ID \\
  AWS_SECRET_ACCESS_KEY='$KEY_SECRET' \\
  EMAIL_HOST_PASSWORD='$SMTP_PASSWORD' \\
  AWS_LOCATION_API_KEY='$MAP_KEY_VALUE' \\
  BACKUP_S3_URI=s3://$BUCKET \\
  LOG_GROUP=$LOG_GROUP \\
  DOMAIN=$DOMAIN
DONE
