#!/usr/bin/env bash
# =============================================================================
# Gsky Sport Shoes - one-shot production setup (Ubuntu 22.04 / 24.04)
# -----------------------------------------------------------------------------
# 1) Upload this project to the server (e.g. to /root/gsky)
# 2) Run as root:
#       sudo DOMAIN=gskyshoes.co.tz CERT_EMAIL=you@email.com bash setup-vps.sh
#
# Optional variables (with defaults read from the uploaded server/.env):
#   DOMAIN=www.example.com        Your domain. If empty -> HTTP on the IP only.
#   CERT_EMAIL=you@email.com      Email for Let's Encrypt (needed for HTTPS).
#   DB_PASSWORD=...               PostgreSQL password (random if empty).
#   ADMIN_PASSWORD=...            New admin login password (default: Admin@1234).
# =============================================================================
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/gsky"
APP_USER="gsky"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $(basename "$0")"
  exit 1
fi

# --- Load secret defaults from an existing .env (keep server state on re-runs) --
SECRET_SRC=""
if [[ -f "$APP_DIR/server/.env" ]]; then
  SECRET_SRC="$APP_DIR/server/.env"
elif [[ -f "$SOURCE_DIR/server/.env" ]]; then
  SECRET_SRC="$SOURCE_DIR/server/.env"
fi
if [[ -n "$SECRET_SRC" ]]; then
  echo "==> Loading existing values from $SECRET_SRC"
  set -a
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "$SECRET_SRC")
  set +a
fi

DOMAIN="${DOMAIN:-}"
CERT_EMAIL="${CERT_EMAIL:-}"
if [[ -z "$DB_PASSWORD" && -n "${DATABASE_URL:-}" ]]; then
  DB_PASSWORD="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*:([^/@]+)@.*#\1#')"
fi
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-}"
if [[ -z "$JWT_SECRET" || "$JWT_SECRET" == *change-this* ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
fi
ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gskyshoes.co.tz}"
ADMIN_PHONE="${ADMIN_PHONE:-0675029833}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@1234}"
WHATSAPP_NUMBER="${WHATSAPP_NUMBER:-0675029833}"
CONTACT_TO_EMAIL="${CONTACT_TO_EMAIL:-mwansisyagasper2004@gmail.com}"
SMTP_USER="${SMTP_USER:-mwansisyagasper2004@gmail.com}"
SMTP_PASS="${SMTP_PASS:-}"
CONTACT_FROM_NAME="${CONTACT_FROM_NAME:-M&E Pub}"
# AI assistant (Gemini free tier) - key comes from the uploaded server/.env
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"

# --- System packages ----------------------------------------------------------
echo "==> Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl ca-certificates rsync openssl nginx postgresql postgresql-contrib certbot python3-certbot-nginx

echo "==> Installing Node.js 20..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# --- App user + code ----------------------------------------------------------
echo "==> Creating system user '${APP_USER}'..."
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

echo "==> Copying app to ${APP_DIR} ..."
mkdir -p "$APP_DIR"
rsync -a --exclude node_modules --exclude 'client/dist' --exclude .git --exclude 'server/.env' "$SOURCE_DIR/" "$APP_DIR/"
mkdir -p "$APP_DIR/server/uploads" "$APP_DIR/client/dist"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --- Database -----------------------------------------------------------------
echo "==> Creating PostgreSQL role + database 'gsky'..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE ${APP_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${APP_USER} PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='gsky'" | grep -q 1; then
  sudo -u postgres createdb -O "$APP_USER" gsky
fi

# --- Build client + install server deps ---------------------------------------
echo "==> Building client (npm ci + vite build)..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm ci --no-audit --no-fund && npm run build"

echo "==> Installing server dependencies..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/server' && npm ci --omit=dev --no-audit --no-fund"

# --- Production .env -----------------------------------------------------------
BASE_URL=""
if [[ -n "$DOMAIN" ]]; then
  BASE_URL="https://$DOMAIN"
else
  BASE_URL="http://$(hostname -I | awk '{print $1}')"
fi
CLIENT_URLS="${CLIENT_URLS:-${BASE_URL},http://localhost:5173}"

if [[ -f "$APP_DIR/server/.env" ]]; then
  echo "==> Keeping existing server/.env (DB password preserved)"
  chown "$APP_USER:$APP_USER" "$APP_DIR/server/.env"
else
  cat > "$APP_DIR/server/.env" <<EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgres://${APP_USER}:${DB_PASSWORD}@localhost:5432/gsky
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
CLIENT_URLS=${CLIENT_URLS}
UPLOAD_DIR=uploads
PAYMENT_PROVIDER=sandbox
PAYMENT_SANDBOX_AUTO_CONFIRM=true
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_USER}
EMAIL_FROM=M&E Pub <${SMTP_USER}>
CONTACT_TO_EMAIL=${CONTACT_TO_EMAIL}
CONTACT_FROM_NAME=${CONTACT_FROM_NAME}
ADMIN_NAME=${ADMIN_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PHONE=${ADMIN_PHONE}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
WHATSAPP_NUMBER=${WHATSAPP_NUMBER}
GEMINI_API_KEY=${GEMINI_API_KEY}
GEMINI_MODEL=${GEMINI_MODEL}
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/server/.env"
  chmod 600 "$APP_DIR/server/.env"
fi

echo "==> Applying database schema + seed data..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/server' && node src/db/setup.js && node src/db/seed.js"

# --- systemd -------------------------------------------------------------------
echo "==> Installing systemd service..."
cp "$APP_DIR/deploy/gsky.service" /etc/systemd/system/gsky.service
systemctl daemon-reload
systemctl enable gsky
systemctl restart gsky
sleep 2
if ! systemctl is-active --quiet gsky; then
  echo "!! gsky service failed. Logs:"; journalctl -u gsky -n 30 --no-pager; exit 1
fi

# --- Nginx ----------------------------------------------------------------------
echo "==> Configuring Nginx..."
if [[ -n "$DOMAIN" ]]; then
  sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/nginx-gsky.conf" > /etc/nginx/sites-available/gsky
else
  sed "s/__DOMAIN__/_/g" "$APP_DIR/deploy/nginx-gsky.conf" > /etc/nginx/sites-available/gsky
fi
ln -sf /etc/nginx/sites-available/gsky /etc/nginx/sites-enabled/gsky
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# --- HTTPS via Let's Encrypt -----------------------------------------------------
if [[ -n "$DOMAIN" && -n "$CERT_EMAIL" ]]; then
  echo "==> Issuing SSL certificate for ${DOMAIN} ..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
else
  echo "==> No DOMAIN/CERT_EMAIL supplied - serving over HTTP only."
  echo "    Later, set DNS and run: certbot --nginx -d yourdomain -m you@email.com --agree-tos --redirect"
fi

# --- Firewall ---------------------------------------------------------------------
echo "==> Configuring firewall..."
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow "Nginx Full" >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || true

# --- Health check + summary --------------------------------------------------------
echo ""
echo "============================================================================"
echo "  GSKY DEPLOY COMPLETE"
echo "============================================================================"
curl -s http://localhost:5000/api/health || echo "(health endpoint not reachable yet)"
echo ""
echo "  Store:        ${BASE_URL}"
if [[ -n "$DOMAIN" ]]; then
  echo "  HTTPS:        https://${DOMAIN}  (auto-redirect from HTTP)"
fi
echo "  Admin login:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
echo "  DB:           postgres://${APP_USER}:***@localhost:5432/gsky"
echo ""
echo "  IMPORTANT: change the admin password after first login."
echo "  NOTE: payments are SIMULATED (sandbox). Orders do not move real money."
echo "        Connect a real gateway (mobile money) before taking real payments."
echo "============================================================================"
