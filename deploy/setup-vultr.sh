#!/usr/bin/env bash
# One-shot setup of VLAIQ FLOW on a fresh Ubuntu 24.04 VM (Vultr), run as root.
# Safe to run again: it updates the code, rebuilds and restarts.
#
#   FLOW_DOMAIN=vlaiqflow.ro BRANCH=school-drop-off-zones bash setup-vultr.sh
#
# Before running: point an A record for FLOW_DOMAIN at this VM's IPv4 address,
# otherwise Caddy cannot get the HTTPS certificate.
# Secrets are NOT handled here: copy backend/.env to /opt/vlaiqflow/backend/.env
# (chmod 600, owner vlaiq) and run `systemctl restart vlaiqflow`.
set -euo pipefail

FLOW_DOMAIN="${FLOW_DOMAIN:-vlaiqflow.ro}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-https://github.com/Vlaiq/VlaiqFlow.git}"
APP_DIR=/opt/vlaiqflow
APP_USER=vlaiq

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ca-certificates gnupg ufw debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 (NodeSource)
if ! node --version 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable

# Caddy (official apt repository) for HTTPS
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# App user and code
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
if [ ! -f "$APP_DIR/backend/.env" ]; then
  sed "s#^CORS_ORIGINS=.*#CORS_ORIGINS=https://$FLOW_DOMAIN#" "$APP_DIR/backend/.env.example" > "$APP_DIR/backend/.env"
fi
chmod 600 "$APP_DIR/backend/.env"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Install and build as the app user
sudo -u "$APP_USER" -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "
  cd '$APP_DIR' && corepack pnpm install --frozen-lockfile && corepack pnpm build
"

# Backend service (also serves the built frontend in production)
cat > /etc/systemd/system/vlaiqflow.service <<EOF
[Unit]
Description=VLAIQ FLOW
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment=NODE_ENV=production
ExecStart=$APP_DIR/backend/node_modules/.bin/tsx src/index.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable vlaiqflow
systemctl restart vlaiqflow

# HTTPS reverse proxy
cat > /etc/caddy/Caddyfile <<EOF
$FLOW_DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
EOF
systemctl reload caddy || systemctl restart caddy

# Firewall: SSH and web only (the backend port stays private)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

sleep 3
curl -fsS -o /dev/null -w "backend: HTTP %{http_code}\n" http://127.0.0.1:8787/ || echo "backend not answering yet: journalctl -u vlaiqflow -n 50"
echo "Done. Open https://$FLOW_DOMAIN (the certificate appears once DNS points here)."
