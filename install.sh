#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Sistemi
#  Bilgi İşlem (IT) Otomatik Sunucu Kurulum Betiği
#  Versiyon: 2.0 | Tarih: 2026-08-07
# ============================================================

set -e

echo "=========================================================="
echo " 🏛️  Piri Reis Üniversitesi — Satınalma Takip Sistemi"
echo " 🚀  Otomatik Sunucu Kurulumu Başlatılıyor..."
echo "=========================================================="

# ─── 1. SİSTEM PAKETLERİNİ GÜNCELLE ───
echo ""
echo "📦 [1/7] Sistem paketleri güncelleniyor..."
sudo apt update && sudo apt upgrade -y

# ─── 2. NODE.JS 20 LTS KURULUMU ───
echo ""
echo "🟢 [2/7] Node.js 20 LTS kuruluyor..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "   ✓ Node.js zaten yüklü: $(node -v)"
fi

# ─── 3. POSTGRESQL KURULUMU & YAPILANDIRMASI ───
echo ""
echo "🐘 [3/7] PostgreSQL kuruluyor ve yapılandırılıyor..."
sudo apt install -y postgresql postgresql-contrib

# PostgreSQL servisinin çalıştığından emin ol
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Veritabanı ve kullanıcı ayarları
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE satinalma_db ENCODING 'UTF8' LC_COLLATE 'tr_TR.UTF-8' LC_CTYPE 'tr_TR.UTF-8' TEMPLATE template0;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO postgres;" 2>/dev/null || true

# UTF-8 encoding doğrulaması
sudo -u postgres psql -d satinalma_db -c "SET client_encoding = 'UTF8';"
echo "   ✓ Veritabanı 'satinalma_db' UTF-8 kodlamasıyla hazır."

# ─── 4. NGINX KURULUMU ───
echo ""
echo "🌐 [4/7] Nginx web sunucusu kuruluyor..."
sudo apt install -y nginx

# ─── 5. PROJE BAĞIMLILIKLARI ───
echo ""
echo "📥 [5/7] Proje bağımlılıkları (npm) yükleniyor..."
npm install --production

# ─── 6. PM2 İLE UYGULAMA BAŞLATMA (7/24 ÇALIŞMA) ───
echo ""
echo "⚡ [6/7] PM2 süreç yöneticisi ile uygulama başlatılıyor..."
sudo npm install -g pm2

# Eğer zaten çalışıyorsa yeniden başlat, yoksa yeni başlat
pm2 describe satinalma > /dev/null 2>&1 && pm2 restart satinalma || pm2 start server.js --name "satinalma"
pm2 save

# PM2'nin sunucu yeniden başlatıldığında otomatik çalışmasını sağla
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
pm2 save

# ─── 7. NGINX REVERSE PROXY YAPILANDIRMASI ───
echo ""
echo "🔧 [7/7] Nginx reverse proxy ayarlanıyor (80 → 3000)..."

cat << 'EOF' | sudo tee /etc/nginx/sites-available/satinalma > /dev/null
server {
    listen 80;
    server_name _;
    
    # Büyük dosya yükleme limiti (Excel import vb.)
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Zaman aşımı ayarları
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "=========================================================="
echo " ✅ TEBRİKLER! Kurulum Başarıyla Tamamlandı!"
echo "=========================================================="
echo ""
echo " 🌐 Web Erişimi  : http://localhost/ veya http://$(hostname -I | awk '{print $1}')/"
echo " 🗄️  Veritabanı   : PostgreSQL → satinalma_db (Port 5432)"
echo " ⚡ Süreç Yöneticisi: PM2 (7/24 otomatik çalışır)"
echo " 🔄 Güncelleme   : bash update.sh"
echo ""
echo " 👤 Varsayılan Giriş Bilgileri:"
echo "    Kullanıcı : Cem TUR (Admin)"
echo "    Şifre     : 123456"
echo ""
echo "=========================================================="
