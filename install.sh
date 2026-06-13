#!/bin/bash
# ─────────────────────────────────────────────────────────
#  Minecraft AFK Bot — Linux Installer
#  Hỗ trợ: Ubuntu, Debian, Fedora, Arch, CentOS
# ─────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

INSTALL_DIR="$HOME/.minecraft-afk-bot"
BIN_LINK="/usr/local/bin/mc-afk-bot"

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║      ⛏️  Minecraft AFK Bot — Installer      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Check Node.js ──────────────────────────────────────────
echo -e "${BOLD}[1/4] Kiểm tra Node.js...${RESET}"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo -e "${GREEN}✓ Node.js ${NODE_VER} đã được cài đặt${RESET}"
else
  echo -e "${YELLOW}Node.js chưa được cài. Đang cài đặt...${RESET}"
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  else
    echo -e "${RED}✗ Không thể tự động cài Node.js. Hãy cài thủ công: https://nodejs.org${RESET}"
    exit 1
  fi
  echo -e "${GREEN}✓ Node.js đã được cài đặt${RESET}"
fi

# ── Create install dir ─────────────────────────────────────
echo -e "\n${BOLD}[2/4] Tạo thư mục cài đặt...${RESET}"
mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}✓ ${INSTALL_DIR}${RESET}"

# ── Copy files ─────────────────────────────────────────────
echo -e "\n${BOLD}[3/4] Cài đặt bot...${RESET}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cp "$SCRIPT_DIR/cli.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"

cd "$INSTALL_DIR"
npm install --omit=dev --silent
echo -e "${GREEN}✓ Dependencies đã được cài đặt${RESET}"

# ── Create launcher script ─────────────────────────────────
cat > "$INSTALL_DIR/mc-afk-bot" << 'EOF'
#!/bin/bash
node "$(dirname "$0")/cli.js" "$@"
EOF
chmod +x "$INSTALL_DIR/mc-afk-bot"

# Try to add to PATH
if [ -w "/usr/local/bin" ]; then
  ln -sf "$INSTALL_DIR/mc-afk-bot" "$BIN_LINK"
  echo -e "${GREEN}✓ Đã thêm vào PATH: ${BIN_LINK}${RESET}"
else
  echo -e "${YELLOW}⚠ Không có quyền ghi /usr/local/bin. Dùng sudo hoặc chạy trực tiếp:${RESET}"
  echo -e "  ${CYAN}${INSTALL_DIR}/mc-afk-bot${RESET}"
fi

# ── Done ────────────────────────────────────────────────────
echo -e "\n${BOLD}[4/4] Hoàn tất!${RESET}"
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║          ✅ Cài đặt thành công!              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "Chạy bot bằng lệnh:"
echo -e "  ${CYAN}${BOLD}mc-afk-bot${RESET}                        # Interactive mode"
echo -e "  ${CYAN}${BOLD}mc-afk-bot --help${RESET}                 # Xem hướng dẫn"
echo -e "  ${CYAN}${BOLD}mc-afk-bot --host play.server.vn --username MyBot${RESET}"
echo ""
