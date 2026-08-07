# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Sistemi
## 📋 Bilgi İşlem (IT) Adım Adım Sunucu Kurulum & İşletim Rehberi

Bu doküman, **Ubuntu 20.04 / 22.04 / 24.04 LTS** veya **Debian** Linux sunucularda Satınalma Takip Sistemi'nin sıfırdan adım adım kurulumu, yapılandırılması ve yönetimi için hazırlanmıştır.

---

## 📑 İÇİNDEKİLER
1. [Gereksinimler (Prerequisites)](#1-gereksinimler-prerequisites)
2. [Yöntem A: Otomatik Tek Komutla Kurulum (Önerilen)](#2-yöntem-a-otomatik-tek-komutla-kurulum-önerilen)
3. [Yöntem B: Manuel Adım Adım Kurulum](#3-yöntem-b-manuel-adım-adım-kurulum)
   - [Adım 1: Sunucuya Bağlantı ve Kodların Çekilmesi](#adım-1-sunucuya-bağlantı-ve-kodların-çekilmesi)
   - [Adım 2: Sistem Paketlerinin Güncellenmesi](#adım-2-sistem-paketlerinin-güncellenmesi)
   - [Adım 3: Node.js 20 LTS Kurulumu](#adım-3-nodejs-20-lts-kurulumu)
   - [Adım 4: PostgreSQL Veritabanı Kurulumu ve Ayarları](#adım-4-postgresql-veritabanı-kurulumu-ve-ayarları)
   - [Adım 5: Proje Bağımlılıklarının Yüklenmesi](#adım-5-proje-bağımlılıklarının-yüklenmesi)
   - [Adım 6: PM2 Süreç Yöneticisi ile Uygulamanın 7/24 Başlatılması](#adım-6-pm2-süreç-yöneticisi-ile-uygulamamın-724-başlatılması)
   - [Adım 7: Nginx Web Sunucusu Yapılandırması (Reverse Proxy)](#adım-7-nginx-web-sunucusu-yapılandırması-reverse-proxy)
4. [Domain & SSL (HTTPS) Yapılandırması](#4-domain--ssl-https-yapılandırması)
5. [Sistem Güncelleme (Update) İşlemleri](#5-sistem-güncelleme-update-işlemleri)
6. [Yedekleme ve Geri Yükleme (Backup & Restore)](#6-yedekleme-ve-geri-yükleme-backup--restore)
7. [Faydalı IT Yönetim Komutları](#7-faydalı-it-yönetim-komutları)

---

## 1. GEREKSİNİMLER (PREREQUISITES)

- **İşletim Sistemi:** Ubuntu 20.04 LTS / 22.04 LTS / 24.04 LTS veya Debian 11/12
- **Minimum Donanım:** 2 vCPU, 2 GB RAM, 20 GB Disk
- **Ağ:** Port 80 (HTTP) ve Port 443 (HTTPS) dış trafiğe açık olmalıdır.
- **Erişim:** Sunucuda `sudo` yetkisine sahip bir kullanıcı.

---

## 2. YÖNTEM A: OTOMATİK TEK KOMUTLA KURULUM (ÖNERİLEN)

Sistemi tüm bağımlılıklarıyla tek komutta otomatik kurmak için:

```bash
# 1. Proje dizinine gidin
cd /opt

# 2. Kodları GitHub'dan çekin
sudo git clone https://github.com/cemcsharp/satinalma.git

# 3. Proje klasörüne girin
cd satinalma

# 4. Otomatik kurulum betiğini çalıştırın
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

### Adım 2: Sistem Paketlerinin Güncellenmesi
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

### Adım 3: Node.js 20 LTS Kurulumu
```bash
# NodeSource reposunu ekleyin ve Node.js 20 LTS kurun
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Versiyonu kontrol edin (v20.x olmalıdır)
node -v
npm -v
```

### Adım 4: PostgreSQL Veritabanı Kurulumu ve Ayarları
```bash
# PostgreSQL sunucusunu kurun
sudo apt install -y postgresql postgresql-contrib

# PostgreSQL servisini başlatın ve otostarta ekleyin
sudo systemctl enable postgresql
sudo systemctl start postgresql

# PostgreSQL 'postgres' kullanıcısına şifre atayın (Şifre: 123456)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';"

# Veritabanını Türkçe UTF-8 kodlaması ile oluşturun
sudo -u postgres psql -c "CREATE DATABASE satinalma_db ENCODING 'UTF8' LC_COLLATE 'tr_TR.UTF-8' LC_CTYPE 'tr_TR.UTF-8' TEMPLATE template0;"

# Yetkileri verin
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE satinalma_db TO postgres;"
```

### Adım 5: Proje Bağımlılıklarının Yüklenmesi
```bash
# Proje dizinindeyken Node paketlerini yükleyin
npm install --production
```

### Adım 6: PM2 Süreç Yöneticisi ile Uygulamanın 7/24 Başlatılması
```bash
# PM2 paketini global yükleyin
sudo npm install -g pm2

# Uygulamayı başlatın
pm2 start server.js --name "satinalma"

# Sunucu restart olduğunda PM2'nin otomatik başlamasını sağlayın
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

### Adım 7: Nginx Web Sunucusu Yapılandırması (Reverse Proxy)
```bash
# Nginx web sunucusunu kurun
sudo apt install -y nginx

# Nginx ayar dosyasını oluşturun
sudo nano /etc/nginx/sites-available/satinalma
```

Aşağıdaki yapılandırmayı dosyaya yapıştırıp kaydedin (`CTRL+O`, `ENTER`, `CTRL+X`):

```nginx
server {
    listen 80;
    server_name _; # Üniversite domaini veya IP adresi

    # Dosya yükleme boyutu sınırı (Excel/Dokümanlar)
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

        # Zaman aşımı limitleri
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Ayar dosyasını aktifleştirin ve Nginx'i yeniden başlatın:
```bash
sudo ln -sf /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
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
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d satinalma.pirireis.edu.tr
   ```

---

## 5. SİSTEM GÜNCELLEME (UPDATE) İŞLEMLERİ

Sistemde yapılan güncellemeleri sunucuya yansıtmak için:

```bash
cd /opt/satinalma
bash update.sh
```

*(Bu komut arka planda `git pull`, `npm install` ve `pm2 reload` işlemlerini otomatik gerçekleştirir).*

---

## 6. YEDEKLEME VE GERİ YÜKLEME (BACKUP & RESTORE)

### Veritabanı Yedeği Alma (Dump):
```bash
sudo -u postgres pg_dump satinalma_db > satinalma_yedek_$(date +%Y%m%d).sql
```

### Veritabanı Yedeğini Geri Yükleme (Restore):
```bash
sudo -u postgres psql satinalma_db < satinalma_yedek_20260807.sql
```

---

## 7. FAYDALI IT YÖNETİM KOMUTLARI

| İşlem | Komut |
|-------|-------|
| **Uygulama Durumu** | `pm2 status` |
| **Canlı Log İzleme** | `pm2 logs satinalma` |
| **Uygulama Restart** | `pm2 restart satinalma` |
| **Nginx Status/Restart** | `sudo systemctl status nginx` / `sudo systemctl restart nginx` |
| **PostgreSQL Status** | `sudo systemctl status postgresql` |

---

## 👤 İLK GİRİŞ VARSAYILAN KULLANICI BİLGİLERİ

- **Sistem Yöneticisi (Admin):** Cem TUR
- **Ünvan:** Satınalma Mdr. Yrd.
- **Varsayılan Şifre:** `123456`
