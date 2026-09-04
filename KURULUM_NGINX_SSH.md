# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Sistemi
## 📋 Bilgi İşlem (IT) Adım Adım Sunucu Kurulum & İşletim Rehberi (v2.2.0)

Bu doküman, **Ubuntu 20.04 / 22.04 / 24.04 LTS** veya **Debian** Linux sunucularda Satınalma Takip Sistemi'nin sıfırdan adım adım kurulumu, yapılandırılması ve yönetimi için hazırlanmıştır.

---

## 📑 İÇİNDEKİLER
1. [Gereksinimler (Prerequisites)](#1-gereksinimler-prerequisites)
2. [Yöntem A: Otomatik Tek Komutla Kurulum (Önerilen)](#2-yöntem-a-otomatik-tek-komutla-kurulum-önerilen)
3. [Yöntem B: Manuel Adım Adım Kurulum](#3-yöntem-b-manuel-adım-adım-kurulum)
   - [Adım 1: Sunucuya Bağlantı ve Kodların Çekilmesi](#adım-1-sunucuya-bağlantı-ve-kodların-çekilmesi)
   - [Adım 2: Sistem Paketlerinin ve Dil Desteğinin Güncellenmesi](#adım-2-sistem-paketlerinin-ve-dil-desteğinin-güncellenmesi)
   - [Adım 3: Node.js 20 LTS Kurulumu](#adım-3-nodejs-20-lts-kurulumu)
   - [Adım 4: PostgreSQL Veritabanı Kurulumu ve Ayarları](#adım-4-postgresql-veritabanı-kurulumu-ve-ayarları)
   - [Adım 5: Proje Bağımlılıkları ve Dizin İzinleri](#adım-5-proje-bağımlılıkları-ve-dizin-izinleri)
   - [Adım 6: PM2 Süreç Yöneticisi ile Uygulamanın 7/24 Başlatılması](#adım-6-pm2-süreç-yöneticisi-ile-uygulamamın-724-başlatılması)
   - [Adım 7: Nginx Web Sunucusu Yapılandırması (Reverse Proxy)](#adım-7-nginx-web-sunucusu-yapılandırması-reverse-proxy)
4. [Domain & SSL (HTTPS) Yapılandırması](#4-domain--ssl-https-yapılandırması)
5. [Sistem Güncelleme (Update) İşlemleri](#5-sistem-güncelleme-update-işlemleri)
6. [Yedekleme ve Geri Yükleme (Backup & Restore)](#6-yedekleme-ve-geri-yükleme-backup--restore)
7. [Faydalı IT Yönetim ve Güvenlik Test Komutları](#7-faydalı-it-yönetim-ve-güvenlik-test-komutları)
8. [Güvenlik Mimarisi ve İlk Giriş Bilgileri](#8-güvenlik-mimarisi-ve-ilk-giriş-bilgileri)

---

## 1. GEREKSİNİMLER (PREREQUISITES)

- **İşletim Sistemi:** Ubuntu 20.04 LTS / 22.04 LTS / 24.04 LTS veya Debian 11/12
- **Minimum Donanım:** 2 vCPU, 2 GB RAM, 20 GB Disk
- **Ağ:** Port 80 (HTTP) ve Port 443 (HTTPS) dış trafiğe açık olmalıdır.
- **Erişim:** Sunucuda `sudo` yetkisine sahip bir kullanıcı.

---

## 2. YÖNTEM A: OTOMATİK TEK KOMUTLA KURULUM (ÖNERİLEN)

Sistemi tüm bağımlılıklarıyla (PostgreSQL, Node.js 20, Nginx, PM2) tek komutta otomatik kurmak için:

```bash
# Tek Komutla Hızlı ve Eksiksiz Kurulum
cd ~ && mkdir -p /opt/satinalma && curl -sL https://github.com/cemcsharp/satinalma/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C /opt/satinalma && cd /opt/satinalma && bash install.sh
```

---

## 3. YÖNTEM B: MANUEL ADIM ADIM KURULUM

Her adımı elle kontrol ederek kurmak istiyorsanız aşağıdaki adımları sırasıyla uygulayın:

### Adım 1: Sunucuya Bağlantı ve Kodların Çekilmesi
```bash
# Sunucuya SSH ile bağlanın
ssh kullanici@SUNUCU_IP_ADRESI

# Uygulamanın kurulacağı dizine gidin ve kodları çekin
cd /opt
sudo git clone https://github.com/cemcsharp/satinalma.git
cd satinalma
```

### Adım 2: Sistem Paketlerinin ve Dil Desteğinin Güncellenmesi
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y locales curl git build-essential software-properties-common
sudo locale-gen tr_TR.UTF-8
sudo update-locale LANG=tr_TR.UTF-8 LC_ALL=tr_TR.UTF-8
```

### Adım 3: Node.js 20 LTS Kurulumu
```bash
# NodeSource reposunu ekleyin ve Node.js 20 LTS kurun
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Versiyonu kontrol edin (v20.x olmalıdır)
node -v
npm -v
```

### Adım 4: PostgreSQL Veritabanı ve Kullanıcı Ayarları
```bash
# PostgreSQL sunucusunu kurun
sudo apt-get install -y postgresql postgresql-contrib

# PostgreSQL servisini başlatın ve otostarta ekleyin
sudo systemctl enable postgresql
sudo systemctl restart postgresql

# Uygulamaya özel güvenli veritabanı kullanıcısı ve veritabanı oluşturun
sudo -u postgres psql -c "CREATE USER satinalma_user WITH PASSWORD 'GUCLU_VERITABANI_SIFRENIZ';"
sudo -u postgres psql -c "CREATE DATABASE satinalma_db WITH OWNER = satinalma_user ENCODING 'UTF8';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO satinalma_user;"
sudo -u postgres psql -d satinalma_db -c "GRANT ALL ON SCHEMA public TO satinalma_user;"
```

### Adım 5: Ortam Değişkenleri (.env), Bağımlılıklar ve Dizin İzinleri
```bash
# Proje dizininde gizli .env yapılandırma dosyasını oluşturun
cat << 'EOF' > .env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=satinalma_db
DB_USER=satinalma_user
DB_PASSWORD=GUCLU_VERITABANI_SIFRENIZ
JWT_SECRET=pruni-satinalma-sec-key-2026-auth-jwt
EOF

chmod 600 .env

# Evrak ve yedek dizinlerini oluşturun
mkdir -p uploads backups
sudo chmod -R 775 uploads backups

# Proje dizinindeyken Node paketlerini yükleyin
npm install --production
```

### Adım 6: PM2 Süreç Yöneticisi ile Uygulamanın 7/24 Başlatılması
```bash
# PM2 paketini global yükleyin
sudo npm install -g pm2

# Uygulamayı başlatın
pm2 delete satinalma 2>/dev/null || true
pm2 start server.js --name "satinalma"

# Sunucu restart olduğunda PM2'nin otomatik başlamasını sağlayın
pm2 save
pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

### Adım 7: Nginx Web Sunucusu Yapılandırması (Reverse Proxy)
```bash
# Nginx web sunucusunu kurun
sudo apt-get install -y nginx

# Nginx ayar dosyasını oluşturun
sudo nano /etc/nginx/sites-available/satinalma
```

Aşağıdaki yapılandırmayı dosyaya yapıştırıp kaydedin (`CTRL+O`, `ENTER`, `CTRL+X`):

```nginx
server {
    listen 80;
    server_name _; # Üniversite domaini veya IP adresi

    # Dosya ve evrak yükleme boyutu sınırı (100MB)
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
```

Ayar dosyasını aktifleştirin ve Nginx'i yeniden başlatın:
```bash
sudo ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/satinalma
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 4. DOMAIN & SSL (HTTPS) YAPILANDIRMASI

Üniversite alt alan adı (örnek: `satinalma.pirireis.edu.tr`) bağlamak için aşağıdaki 2 seçenekten kurumunuza uygun olanı uygulayabilirsiniz:

### 1. Alan Adı (Domain) Tanımı:
`/etc/nginx/sites-available/satinalma` dosyasındaki `server_name _` satırını kurum alan adınızla güncelleyin:
```nginx
server_name satinalma.pirireis.edu.tr;
```

---

### 2. SSL Sertifikası Yükleme:

#### Seçenek A: Ücretsiz Otomatik SSL (Let's Encrypt / Certbot - Önerilen)
Sunucu doğrudan dış internete açıksa tek komutla otomatik SSL kurabilirsiniz:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d satinalma.pirireis.edu.tr
```
*(Certbot Nginx dosyanızı otomatik olarak HTTPS 443 portuna yönlendirecek ve sertifikayı her 90 günde bir kendisi yenileyecektir).*

#### Seçenek B: Üniversite Bilgi İşlem Tarafından Verilen Kurumsal SSL (.crt ve .key)
Eğer üniversite kendi Wildcard / Kurumsal SSL sertifikasını verirse:
1. Sertifika dosyalarını sunucuya yükleyin (örneğin: `/etc/ssl/certs/pirireis.crt` ve `/etc/ssl/private/pirireis.key`).
2. `/etc/nginx/sites-available/satinalma` dosyasını aşağıdaki gibi HTTPS uyumlu düzenleyin:

```nginx
server {
    listen 80;
    server_name satinalma.pirireis.edu.tr;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name satinalma.pirireis.edu.tr;

    ssl_certificate /etc/ssl/certs/pirireis.crt;
    ssl_certificate_key /etc/ssl/private/pirireis.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

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
    }
}
```

3. Nginx'i test edip yeniden başlatın:
```bash
sudo nginx -t && sudo systemctl restart nginx
```

---

## 5. SİSTEM GÜNCELLEME (UPDATE) İŞLEMLERİ

Sistemde yapılan güncellemeleri sunucuya yansıtmak için:

```bash
cd /opt/satinalma
bash update.sh
```

*(Bu komut arka planda `git pull`, `npm install` ve `pm2 reload` işlemlerini otomatik ve kesintisiz gerçekleştirir).*

---

## 6. YEDEKLEME VE GERİ YÜKLEME (BACKUP & RESTORE)

Sistem her gün otomatik JSON veritabanı yedeği almaktadır (`backups/` dizininde saklanır).

### Manuel Veritabanı Yedeği Alma (SQL Dump):
```bash
sudo -u postgres pg_dump satinalma_db > satinalma_yedek_$(date +%Y%m%d).sql
```

### Veritabanı Yedeğini Geri Yükleme (Restore):
```bash
sudo -u postgres psql satinalma_db < satinalma_yedek_DOSYA_ADI.sql
```

### Excel'den Veri İçe Aktarma (İsteğe Bağlı):
Eğer toplu talep Excel dosyası aktarılmak istenirse:
```bash
cd /opt/satinalma
node import-excel.js
```

---

## 7. FAYDALI IT YÖNETİM VE GÜVENLİK TEST KOMUTLARI

| İşlem | Komut |
|-------|-------|
| **Uygulama Durumu** | `pm2 status` |
| **Canlı Log İzleme** | `pm2 logs satinalma` |
| **Uygulama Restart** | `pm2 reload satinalma` |
| **Otomatik Güvenlik & Doğrulama Testi** | `node test-audit.js` |
| **Nginx Status/Restart** | `sudo systemctl status nginx` / `sudo systemctl restart nginx` |
| **PostgreSQL Status** | `sudo systemctl status postgresql` |

---

## 8. GÜVENLİK MİMARİSİ VE İLK GİRİŞ BİLGİLERİ

- **Kimlik Doğrulama:** HMAC-SHA256 imzalı oturum Token'ları (JWT) ile yetkilendirme.
- **Şifreleme:** Kullanıcı şifreleri veritabanında PBKDF2 (10.000 iterasyon, tuzlu SHA-512) formatında saklanır.
- **SQL & Enjeksiyon Koruması:** Dinamik sorgular için katı Whitelist ve parametreli bağlama (`$1, $2`).
- **Roller:**
  - `ADMIN` (Satınalma Yöneticisi — Tam Yetkili)
  - `STAFF` (Satınalma Uzmanı — Operasyonel Yetki)
  - `EXECUTIVE` (Yönetim / Rektörlük & Genel Sekreterlik — İzleme, Analiz ve Raporlama Modu)
- **Public Portal:** Şifresiz giriş sayfasından yalnızca talep barkodu ile süreç durumu sorgulanabilir.

### Varsayılan Giriş Hesapları:
1. **Sistem Yöneticisi:**
   - **Kullanıcı:** `Cem TUR`
   - **Ünvan:** Satınalma Mdr. Yrd.
   - **Şifre:** `123456`
2. **Üst Yönetim:**
   - **Kullanıcı:** `Yönetim` (veya giriş için `yonetim`)
   - **Ünvan:** Yönetim
   - **Şifre:** `123456`

