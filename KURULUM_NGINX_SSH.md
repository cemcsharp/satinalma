# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Sistemi
## 📋 Bilgi İşlem (IT) Adım Adım Sunucu Kurulum & İşletim Rehberi (v2.1.0)

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
7. [Faydalı IT Yönetim Komutları](#7-faydalı-it-yönetim-komutları)
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
# 1. Proje dizinine gidin
cd /opt

# 2. Kodları GitHub'dan çekin
sudo git clone https://github.com/cemcsharp/satinalma.git

# 3. Proje klasörüne girin
cd satinalma

# 4. Sağlamlaştırılmış otomatik kurulum betiğini çalıştırın
sudo bash install.sh
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

### Adım 4: PostgreSQL Veritabanı Kurulumu ve Ayarları
```bash
# PostgreSQL sunucusunu kurun
sudo apt-get install -y postgresql postgresql-contrib

# PostgreSQL servisini başlatın ve otostarta ekleyin
sudo systemctl enable postgresql
sudo systemctl restart postgresql

# PostgreSQL 'postgres' kullanıcısına şifre atayın (Şifre: 123456)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';"

# Veritabanını UTF-8 kodlaması ile oluşturun
sudo -u postgres psql -c "CREATE DATABASE satinalma_db ENCODING 'UTF8';"

# Yetkileri verin
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO postgres;"
```

### Adım 5: Proje Bağımlılıkları ve Dizin İzinleri
```bash
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

Üniversite alt alan adı (örnek: `satinalma.pirireis.edu.tr`) bağlamak için:

1. `/etc/nginx/sites-available/satinalma` dosyasındaki `server_name _` satırını değiştirin:
   ```nginx
   server_name satinalma.pirireis.edu.tr;
   ```
2. Ücretsiz SSL sertifikası (Certbot) tanımlamak için:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d satinalma.pirireis.edu.tr
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
sudo -u postgres psql satinalma_db < satinalma_yedek_20260813.sql
```

---

## 7. FAYDALI IT YÖNETİM KOMUTLARI

| İşlem | Komut |
|-------|-------|
| **Uygulama Durumu** | `pm2 status` |
| **Canlı Log İzleme** | `pm2 logs satinalma` |
| **Uygulama Restart** | `pm2 reload satinalma` |
| **Nginx Status/Restart** | `sudo systemctl status nginx` / `sudo systemctl restart nginx` |
| **PostgreSQL Status** | `sudo systemctl status postgresql` |

---

## 8. GÜVENLİK MİMARİSİ VE İLK GİRİŞ BİLGİLERİ

- **Kimlik Doğrulama:** HMAC-SHA256 imzalı oturum Token'ları (JWT) ile yetkilendirme.
- **Şifreleme:** Kullanıcı şifreleri veritabanında PBKDF2 (tuzlu hash) formatında saklanır.
- **Roller:** `ADMIN` (Tam Yetkili) ve `STAFF` (Operasyonel Uzman).
- **Public Portal:** Şifresiz giriş sayfasından yalnızca talep barkodu ile süreç durumu sorgulanabilir.

### Varsayılan Giriş Bilgileri:
- **Sistem Yöneticisi (Admin):** Cem TUR
- **Ünvan:** Satınalma Mdr. Yrd.
- **Varsayılan Şifre:** `1234` (veya `123456`)
