#!/usr/bin/env bash
# Create the Campus Pulse server on Lightsail and point your domain at it. Run in AWS CloudShell:
#
#   bash create-server.sh campuspulse.app
#
# Creates a 2 GB Ubuntu 24.04 instance (IPv4 only), gives it a static IP, opens HTTPS (443), and sets the
# domain's A record in Route 53 (the domain must be registered in, or delegated to, Route 53).
# Safe to re-run: anything that already exists is kept.
set -euo pipefail

DOMAIN="${1:?Usage: bash create-server.sh yourdomain.com}"
REGION="${AWS_REGION:-us-east-2}"
NAME=campus-pulse
IP_NAME=campus-pulse-ip
export AWS_DEFAULT_REGION="$REGION"
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Checking the Route 53 hosted zone for $DOMAIN"
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." --query "HostedZones[?Name=='$DOMAIN.'].Id | [0]" --output text)"
if [[ -z "$ZONE_ID" || "$ZONE_ID" == "None" ]]; then
  echo "No Route 53 hosted zone for $DOMAIN. Register the domain in Route 53 first (it creates the zone)." >&2
  exit 1
fi
ZONE_ID="${ZONE_ID##*/}"

step "Creating the server ($NAME in $REGION)"
if aws lightsail get-instance --instance-name "$NAME" >/dev/null 2>&1; then
  if [[ "$(aws lightsail get-instance --instance-name "$NAME" --query instance.ipAddressType --output text)" == "ipv6" ]]; then
    echo "$NAME is IPv6-only, which can't reach IPv4 sites or take a static IPv4 address." >&2
    echo "Delete it (aws lightsail delete-instance --instance-name $NAME), wait a minute, and re-run this script." >&2
    exit 1
  fi
  echo "$NAME already exists; keeping it."
else
  # IPv4 only. Exclude IPv6-only plans: they're cheaper but can't reach IPv4-only sites or take a
  # static IPv4 address.
  BUNDLE="$(aws lightsail get-bundles --query "bundles[?ramSizeInGb==\`2.0\` && isActive && contains(supportedPlatforms, 'LINUX_UNIX') && !contains(bundleId, 'ipv6')] | sort_by(@, &price)[0].bundleId" --output text)"
  echo "Plan: $BUNDLE (2 GB RAM)"
  aws lightsail create-instances --instance-names "$NAME" --availability-zone "${REGION}a" \
    --blueprint-id ubuntu_24_04 --bundle-id "$BUNDLE" --ip-address-type ipv4 >/dev/null
fi
until [[ "$(aws lightsail get-instance-state --instance-name "$NAME" --query state.name --output text)" == "running" ]]; do
  echo "Waiting for the server to start…"; sleep 10
done

step "Attaching a static IP"
aws lightsail get-static-ip --static-ip-name "$IP_NAME" >/dev/null 2>&1 || aws lightsail allocate-static-ip --static-ip-name "$IP_NAME" >/dev/null
if [[ "$(aws lightsail get-static-ip --static-ip-name "$IP_NAME" --query staticIp.attachedTo --output text)" != "$NAME" ]]; then
  aws lightsail attach-static-ip --static-ip-name "$IP_NAME" --instance-name "$NAME" >/dev/null
fi
IP="$(aws lightsail get-static-ip --static-ip-name "$IP_NAME" --query staticIp.ipAddress --output text)"
echo "Static IP: $IP"

step "Opening HTTPS (443)"
aws lightsail open-instance-public-ports --instance-name "$NAME" \
  --port-info "fromPort=443,toPort=443,protocol=TCP,cidrs=0.0.0.0/0" >/dev/null

step "Pointing $DOMAIN at $IP"
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "{
  \"Changes\": [{\"Action\": \"UPSERT\", \"ResourceRecordSet\": {
    \"Name\": \"$DOMAIN\", \"Type\": \"A\", \"TTL\": 300, \"ResourceRecords\": [{\"Value\": \"$IP\"}]}}]}" >/dev/null

cat <<DONE

Server ready at $IP, and $DOMAIN points to it (DNS can take a few minutes).
Next: run provision.sh here, then connect to the server ("Connect using SSH" in the Lightsail
console) and run deploy/lightsail/setup.sh.
DONE
