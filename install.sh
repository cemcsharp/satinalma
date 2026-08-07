#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Sunucusu
#  Bilgi İşlem (IT) Otomatik Kurulum Betiği
# ============================================================

set -e

echo "🚀 Satınalma Takip Sunucu Kurulumu Başlıyor..."

# 1. Sistem paketlerinin ve Node.js / PostgreSQL / Nginx kurulumu
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib nginx git
sudo npm install -g pm2

# 2. PostgreSQL Veritabanı ve Şifre Ayarı
sudo -u postgres psql -c "CREATE DATABASE satinalma_db;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO postgres;"

# 3. Proje Bağımlılıklarının Kurulumu ve Servis Başlatma
npm install
pm2 start server.js --name "satinalma" 2>/dev/null || pm2 restart satinalma
pm2 save

# 4. Nginx Reverse Proxy (Port 80 -> 3000) Ayarı
cat << 'EOF' | sudo tee /etc/nginx/sites-available/satinalma > /dev/null
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo "============================================================"
echo " ✅ TEBRİKLER! Satınalma Takip Uygulaması Başarıyla Kuruldu."
echo " 🌐 Web Erişimi: http://localhost/ veya http://<SUNUCU_IP_ADRESI>/"
echo "============================================================"
