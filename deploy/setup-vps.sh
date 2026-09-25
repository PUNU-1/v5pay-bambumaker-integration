#!/usr/bin/env bash
# Установка сервера V5Pay на чистый VPS (Ubuntu 24.04). Запуск от root:
#
#   curl -fsSLo /tmp/setup-vps.sh https://raw.githubusercontent.com/PUNU-1/v5pay-bambumaker-integration/main/deploy/setup-vps.sh
#   DOMAIN=pay.bambumaker.com bash /tmp/setup-vps.sh
#
# Повторный запуск безопасен: обновит код из GitHub и перезапустит сервис.
# Ключи V5Pay скрипт не трогает — их вписывает deploy/set-keys.ps1.
set -euo pipefail

DOMAIN="${DOMAIN:?укажите домен: DOMAIN=pay.bambumaker.com}"
REPO=https://github.com/PUNU-1/v5pay-bambumaker-integration.git
APP_DIR=/opt/v5pay
ENV_FILE=/etc/v5pay.env
PORT=3000

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git nginx certbot python3-certbot-nginx ufw

# Node.js 24 LTS (в репозитории Ubuntu версия слишком старая)
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -q nodejs
fi

# Код: принадлежит root, сервис работает от отдельного пользователя и
# пишет только в data/ (журнал обработанных платежей).
id v5pay >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin v5pay
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
mkdir -p "$APP_DIR/data"
chown -R v5pay:v5pay "$APP_DIR/data"

# Переменные окружения — только при первой установке, чтобы не затереть ключи.
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<EOF
V5PAY_BASE_URL=https://api-uat.v5pay.com
V5PAY_MERCHANT_NO=
V5PAY_APP_KEY=
V5PAY_SECRET_KEY=
PUBLIC_CALLBACK_URL=https://$DOMAIN/v5pay/callback
PORT=$PORT
EOF
fi

cat > /etc/systemd/system/v5pay.service <<EOF
[Unit]
Description=V5Pay integration server (bambumaker.com)
After=network-online.target
Wants=network-online.target

[Service]
User=v5pay
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable v5pay >/dev/null
systemctl restart v5pay

# nginx: HTTPS-вход снаружи -> сервер на 127.0.0.1:$PORT
cat > /etc/nginx/sites-available/v5pay <<'EOF'
server {
    listen 80;
    server_name __DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sed -i "s/__DOMAIN__/$DOMAIN/; s/__PORT__/$PORT/" /etc/nginx/sites-available/v5pay
ln -sf /etc/nginx/sites-available/v5pay /etc/nginx/sites-enabled/v5pay
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# Сертификат Let's Encrypt (--agree-tos = согласие с их условиями; SKIP_CERT=1 —
# пропустить). Нужна DNS-запись $DOMAIN -> IP этого сервера.
if [ "${SKIP_CERT:-}" != 1 ] && [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
    echo "!! Сертификат не выпущен. Проверьте DNS-запись $DOMAIN -> IP сервера и запустите скрипт ещё раз."
  fi
fi

sleep 2
echo "health: $(curl -fsS "http://127.0.0.1:$PORT/health" || echo 'сервер не отвечает — journalctl -u v5pay -n 50')"
