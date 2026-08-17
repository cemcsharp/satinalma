#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Sistemi
#  Bilgi İşlem (IT) Sağlamlaştırılmış Otomatik Kurulum Betiği
#  Versiyon: 2.1.0 | Tarih: 2026-08-13
# ============================================================

# Hata oluştuğunda hemen kesilmesini engellemek için kritik adımları kontrollü yürütüyoruz
export DEBIAN_FRONTEND=noninteractive

echo "=========================================================="
echo " 🏛️  Piri Reis Üniversitesi — Satınalma Takip Sistemi"
echo " 🚀  Sunucu Kurulum ve Yapılandırması Başlatılıyor..."
echo "=========================================================="

# Renkli Çıktı Fonksiyonları
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_ok() { echo -e "   ${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "   ${YELLOW}⚠ $1${NC}"; }
log_err() { echo -e "   ${RED}✗ $1${NC}"; }
log_step() { echo -e "\n${BLUE}▶ $1${NC}"; }

# ─── 1. SİSTEM PAKETLERİ VE DİL DESTEĞİ ───
log_step "[1/7] Sistem paketleri ve Türkçe dil desteği güncelleniyor..."
sudo apt-get update -y
sudo apt-get install -y locales curl git build-essential software-properties-common

# Türkçe UTF-8 dil desteğini oluştur (PostgreSQL hatasını önler)
sudo locale-gen tr_TR.UTF-8 2>/dev/null || true
sudo update-locale LANG=tr_TR.UTF-8 LC_ALL=tr_TR.UTF-8 2>/dev/null || true
log_ok "Sistem paketleri ve UTF-8 yerel ayarları hazırlandı."

# ─── 2. NODE.JS 20 LTS KURULUMU ───
log_step "[2/7] Node.js 20 LTS kontrol ediliyor / kuruluyor..."
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]; then
  echo "   → NodeSource reposu ekleniyor ve Node.js kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if command -v node &> /dev/null; then
  log_ok "Node.js hazır: $(node -v) | npm: $(npm -v)"
else
  log_err "Node.js kurulamadı! Lütfen internet bağlantısını kontrol edin."
  exit 1
fi

# ─── 3. POSTGRESQL VERİTABANI KURULUMU ───
log_step "[3/7] PostgreSQL kuruluyor ve yapılandırılıyor..."
sudo apt-get install -y postgresql postgresql-contrib

# PostgreSQL servisini başlat ve açılışa ekle
sudo systemctl enable postgresql
sudo systemctl restart postgresql

# PostgreSQL soketinin hazır olmasını bekle (maksimum 10 sn)
for i in {1..10}; do
  if sudo -u postgres psql -c '\q' 2>/dev/null; then
    break
  fi
  sleep 1
done

# PostgreSQL kullanıcısı ve veritabanı ayarları
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';" 2>/dev/null || true

# Veritabanı oluşturma (varsa devam et, yoksa UTF8 ile oluştur)
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'satinalma_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE satinalma_db ENCODING 'UTF8';" 2>/dev/null || true

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO postgres;" 2>/dev/null || true

if sudo -u postgres psql -d satinalma_db -c '\q' 2>/dev/null; then
  log_ok "PostgreSQL veritabanı 'satinalma_db' başarıyla hazırlandı."
else
  log_warn "Veritabanı kontrol edilemedi, ancak servis çalışıyor."
fi

# ─── 4. NGINX WEB SUNUCUSU KURULUMU ───
log_step "[4/7] Nginx web sunucusu kuruluyor..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl restart nginx
log_ok "Nginx web sunucusu kuruldu ve çalıştırıldı."

# ─── 5. PROJE BAĞIMLILIKLARI VE DİZİN İZİNLERİ ───
log_step "[5/7] Proje bağımlılıkları ve dizin izinleri yapılandırılıyor..."
mkdir -p uploads backups
sudo chmod -R 775 uploads backups 2>/dev/null || true

npm install --production
log_ok "Proje npm bağımlılıkları yüklendi."

# Talepler.xlsx varsa otomatik aktarım yap
if [ -f "import-excel.js" ] && [ -f "Talepler.xlsx" ]; then
  echo "   → Talepler.xlsx verileri veritabanına aktarılıyor..."
  node import-excel.js || true
fi

# ─── 6. PM2 İLE UYGULAMANIN 7/24 BAŞLATILMASI ───
log_step "[6/7] PM2 Süreç Yöneticisi yapılandırılıyor..."
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

# Mevcut çalışıyorsa durdurup temiz başlat
pm2 delete satinalma 2>/dev/null || true
pm2 start server.js --name "satinalma"
pm2 save

# Sistem başlangıcına otomatik ekleme
STARTUP_CMD=$(pm2 startup systemd -u $USER --hp $HOME 2>/dev/null | grep -E 'sudo|pm2' | tail -n 1)
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" 2>/dev/null || true
fi
pm2 save
log_ok "PM2 yapılandırıldı; uygulama 7/24 arka planda çalışıyor."

# ─── 7. NGINX REVERSE PROXY AYARLARI ───
log_step "[7/7] Nginx Reverse Proxy (Port 80 → 3000) ayarlanıyor..."

cat << 'EOF' | sudo tee /etc/nginx/sites-available/satinalma > /dev/null
server {
    listen 80;
    server_name _;

    # Büyük dosya ve evrak yükleme limiti (100MB)
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Zaman aşımı limitleri
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/satinalma
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
log_ok "Nginx Reverse Proxy yapılandırması tamamlandı ve aktifleştirildi."

# ─── SİSTEM SAĞLIK DOĞRULAMASI ───
echo ""
echo "=========================================================="
echo " 🔍 SİSTEM SAĞLIK VE SERVİS KONTROLÜ"
echo "=========================================================="

echo -n " • Node.js Sürümü     : " && node -v
echo -n " • PostgreSQL Durumu  : " && (systemctl is-active postgresql || echo "Çalışmıyor")
echo -n " • Nginx Durumu       : " && (systemctl is-active nginx || echo "Çalışmıyor")
echo -n " • PM2 Uygulama Durumu: " && (pm2 jlist | grep -q '"name":"satinalma"' && echo "Online (Çalışıyor)" || echo "Durduruldu")

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then SERVER_IP="SUNUCU_IP_ADRESI"; fi

echo ""
echo "=========================================================="
echo -e "${GREEN} ✅ KURULUM BAŞARIYLA TAMAMLANDI!${NC}"
echo "=========================================================="
echo ""
echo " 🌐 Web Arayüzü  : http://$SERVER_IP/ veya http://localhost/"
echo " 🗄️  Veritabanı   : PostgreSQL → satinalma_db (Port 5432)"
echo " 🛡️  Güvenlik     : JWT Token + PBKDF2 Şifreleme Aktif"
echo " ⚡ Süreç Yöneticisi: PM2 (Otomatik restart 7/24)"
echo " 🔄 Güncelleme   : bash update.sh"
echo ""
echo " 👤 Varsayılan Giriş Bilgileri:"
echo "    Kullanıcı : Cem TUR (Admin)"
echo "    Şifre     : 1234 (veya 123456)"
echo ""
echo "=========================================================="
