#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Otomatik Kurulum
#  Kullanım: sudo bash install.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

INSTALL_DIR="/opt/satinalma"
REPO_URL="https://github.com/cemcsharp/satinalma.git"
SERVICE_NAME="satinalma"
PORT=3000

echo ""
echo "=========================================================="
echo " 🏛️  Piri Reis Üniversitesi — Satınalma Takip Kurulumu"
echo "=========================================================="
echo ""

# Root kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Bu scripti root olarak çalıştırın: sudo bash install.sh${NC}"
  exit 1
fi

# ---- ADIM 1: Node.js Kontrolü / Kurulumu ----
echo -e "${YELLOW}[1/6] Node.js kontrol ediliyor...${NC}"
if command -v node &> /dev/null; then
  NODE_VER=$(node -v)
  echo -e "${GREEN}  ✅ Node.js zaten kurulu: $NODE_VER${NC}"
else
  echo "  📦 Node.js kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  echo -e "${GREEN}  ✅ Node.js kuruldu: $(node -v)${NC}"
fi

# ---- ADIM 2: Git Kontrolü / Kurulumu ----
echo -e "${YELLOW}[2/6] Proje dosyaları indiriliyor...${NC}"
if ! command -v git &> /dev/null; then
  apt install -y git
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  📁 Mevcut kurulum bulundu, güncelleniyor..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  echo "  📥 GitHub'dan indiriliyor..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
echo -e "${GREEN}  ✅ Proje dosyaları hazır: $INSTALL_DIR${NC}"

# ---- ADIM 3: Systemd Servisi ----
echo -e "${YELLOW}[3/6] Sistem servisi oluşturuluyor...${NC}"
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Piri Reis Satinalma Takip Uygulamasi
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
echo -e "${GREEN}  ✅ Servis oluşturuldu ve başlatıldı${NC}"

# ---- ADIM 4: Firewall ----
echo -e "${YELLOW}[4/6] Güvenlik duvarı ayarlanıyor...${NC}"
if command -v ufw &> /dev/null; then
  ufw allow ${PORT}/tcp > /dev/null 2>&1 || true
  echo -e "${GREEN}  ✅ Port $PORT açıldı${NC}"
else
  echo "  ⏭️  UFW bulunamadı, atlanıyor"
fi

# ---- ADIM 5: Nginx (Opsiyonel) ----
echo -e "${YELLOW}[5/6] Nginx kontrol ediliyor...${NC}"
if command -v nginx &> /dev/null; then
  cat > /etc/nginx/sites-available/satinalma << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

  ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t && systemctl reload nginx
  echo -e "${GREEN}  ✅ Nginx yönlendirmesi kuruldu (port 80 → 3000)${NC}"
  echo -e "${YELLOW}  💡 Domain ayarlamak için /etc/nginx/sites-available/satinalma dosyasındaki 'server_name _' satırını düzenleyin${NC}"
else
  echo "  ⏭️  Nginx kurulu değil, atlanıyor (port $PORT üzerinden doğrudan erişim aktif)"
fi

# ---- ADIM 6: Gece Yedeği (Cron) ----
echo -e "${YELLOW}[6/6] Otomatik gece yedeği kuruluyor...${NC}"
chmod +x "$INSTALL_DIR/backup.sh"
CRON_JOB="0 2 * * * /bin/bash $INSTALL_DIR/backup.sh > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "$CRON_JOB") | crontab -
echo -e "${GREEN}  ✅ Her gece 02:00 otomatik yedek aktif${NC}"

# ---- SONUÇ ----
echo ""
echo "=========================================================="
echo -e "${GREEN} ✅ KURULUM TAMAMLANDI!${NC}"
echo "=========================================================="
echo ""
echo " 🌐 Erişim Adresi:  http://$(hostname -I | awk '{print $1}'):${PORT}"
if command -v nginx &> /dev/null; then
echo " 🌐 Nginx Adresi:   http://$(hostname -I | awk '{print $1}')"
fi
echo " 📁 Kurulum Dizini: $INSTALL_DIR"
echo " 💾 Yedek Klasörü:  $INSTALL_DIR/data/backups/"
echo ""
echo " 🔧 Faydalı Komutlar:"
echo "    Durum:       sudo systemctl status satinalma"
echo "    Yeniden Bas: sudo systemctl restart satinalma"
echo "    Log Takibi:  sudo journalctl -u satinalma -f"
echo "    Güncelleme:  cd $INSTALL_DIR && git pull && sudo systemctl restart satinalma"
echo ""
