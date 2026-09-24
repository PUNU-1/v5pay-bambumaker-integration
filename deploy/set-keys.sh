#!/usr/bin/env bash
# Записывает ключи V5Pay в /etc/v5pay.env и перезапускает сервис.
# Значения читаются из stdin по одному в строке, в порядке:
#   V5PAY_BASE_URL, V5PAY_MERCHANT_NO, V5PAY_APP_KEY, V5PAY_SECRET_KEY
# Вызывается из deploy/set-keys.ps1 — так ключи не попадают в историю команд.
set -euo pipefail

ENV_FILE=/etc/v5pay.env
read -r base_url
read -r merchant
read -r app_key
read -r secret
# PowerShell может добавить BOM в начало и \r в конце строк
base_url=${base_url#$'\xef\xbb\xbf'}
base_url=${base_url%$'\r'}; merchant=${merchant%$'\r'}; app_key=${app_key%$'\r'}; secret=${secret%$'\r'}

tmp=$(mktemp)
grep -vE '^(V5PAY_BASE_URL|V5PAY_MERCHANT_NO|V5PAY_APP_KEY|V5PAY_SECRET_KEY)=' "$ENV_FILE" > "$tmp" || true
printf '%s\n' "V5PAY_BASE_URL=$base_url" "V5PAY_MERCHANT_NO=$merchant" "V5PAY_APP_KEY=$app_key" "V5PAY_SECRET_KEY=$secret" >> "$tmp"
install -m 600 "$tmp" "$ENV_FILE"
rm -f "$tmp"

systemctl restart v5pay
sleep 2
echo "v5pay: $(systemctl is-active v5pay), base URL: $base_url, merchant: $merchant"
