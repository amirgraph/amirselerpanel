#!/bin/bash
# ═══════════════════════════════════════════
#   XUI Reseller Panel - One-Click Installer
# ═══════════════════════════════════════════

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════╗"
echo "║     XUI Reseller Panel Installer      ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}لطفاً با root اجرا کن: sudo bash install.sh${NC}"
  exit 1
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}→ نصب Node.js...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo -e "${GREEN}✓ Node.js: $(node -v)${NC}"

# Install PM2
if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}→ نصب PM2...${NC}"
  npm install -g pm2
fi

# Create app directory
APP_DIR="/opt/xui-reseller"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/data

# Copy files
echo -e "${YELLOW}→ کپی فایل‌ها...${NC}"
cp -r . $APP_DIR/
cd $APP_DIR

# Install dependencies
echo -e "${YELLOW}→ نصب پکیج‌ها...${NC}"
npm install --production

# Setup .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  
  # Generate random JWT secret
  JWT_SECRET=$(openssl rand -base64 32)
  sed -i "s/change_this_to_random_string_min32chars/$JWT_SECRET/" .env
  
  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════${NC}"
  echo -e "${YELLOW}  تنظیمات رو وارد کن:${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════${NC}"
  
  read -p "آی‌پی سرور 3X-UI (مثال: 5.160.252.236): " XUI_IP
  read -p "پورت 3X-UI (مثال: 57098): " XUI_PORT
  read -p "مسیر 3X-UI (مثال: /7KHbKsDgrmIXgYYBpE): " XUI_PATH_VAL
  read -p "یوزر ادمین 3X-UI: " XUI_USER
  read -sp "پسورد ادمین 3X-UI: " XUI_PASS
  echo ""
  read -p "توکن ربات تلگرام: " BOT_TOKEN
  read -p "آیدی عددی تلگرام ادمین: " ADMIN_TG
  read -p "پورت پنل نمایندگی (پیش‌فرض 3000): " PANEL_PORT
  PANEL_PORT=${PANEL_PORT:-3000}
  
  sed -i "s|PORT=3000|PORT=$PANEL_PORT|" .env
  sed -i "s|XUI_URL=https://5.160.252.236:57098|XUI_URL=https://$XUI_IP:$XUI_PORT|" .env
  sed -i "s|XUI_PATH=/7KHbKsDgrmIXgYYBpE|XUI_PATH=$XUI_PATH_VAL|" .env
  sed -i "s|XUI_USERNAME=admin|XUI_USERNAME=$XUI_USER|" .env
  sed -i "s|XUI_PASSWORD=your_3xui_password|XUI_PASSWORD=$XUI_PASS|" .env
  sed -i "s|TELEGRAM_BOT_TOKEN=your_bot_token_here|TELEGRAM_BOT_TOKEN=$BOT_TOKEN|" .env
  sed -i "s|ADMIN_TELEGRAM_ID=your_telegram_id|ADMIN_TELEGRAM_ID=$ADMIN_TG|" .env
  
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  sed -i "s|SUB_BASE_URL=http://YOUR_SERVER_IP:3000/sub|SUB_BASE_URL=http://$SERVER_IP:$PANEL_PORT/sub|" .env
fi

# Start with PM2
echo -e "${YELLOW}→ راه‌اندازی سرویس...${NC}"
pm2 delete xui-reseller 2>/dev/null || true
pm2 start src/server.js --name xui-reseller
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

# Open firewall port
PANEL_PORT=$(grep "^PORT=" .env | cut -d'=' -f2)
PANEL_PORT=${PANEL_PORT:-3000}

if command -v ufw &> /dev/null; then
  ufw allow $PANEL_PORT/tcp 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ نصب کامل شد!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_IP")
echo ""
echo -e "  📊 پنل ادمین:     ${YELLOW}http://$SERVER_IP:$PANEL_PORT/admin${NC}"
echo -e "  🏪 پنل نماینده:   ${YELLOW}http://$SERVER_IP:$PANEL_PORT/panel${NC}"
echo ""
echo -e "  👤 یوزر ادمین: ${YELLOW}admin${NC}"
echo -e "  🔑 پسورد ادمین: ${YELLOW}admin123${NC}"
echo -e "${RED}  ⚠️  حتماً پسورد رو عوض کن!${NC}"
echo ""
echo -e "  مدیریت سرویس:"
echo -e "  pm2 status"
echo -e "  pm2 logs xui-reseller"
echo -e "  pm2 restart xui-reseller"
echo ""
