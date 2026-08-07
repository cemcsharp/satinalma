# 🏛️ Bilgi İşlem (IT) Hızlı Sunucu Kurulum & İşletim Rehberi

**Piri Reis Üniversitesi — Satınalma Takip Sistemi**

Bu rehber Bilgi İşlem (Sistem Yöneticisi) ekibimizin **Ubuntu / Debian** Linux sunucularda tek komutla eksiksiz ve hatasız kurulum yapabilmesi için hazırlanmıştır.

---

## 🚀 TEK KOMUTLA OTOMATİK KURULUM

Sunucuya SSH ile bağlandıktan sonra proje klasöründe şu komutu çalıştırmanız yeterlidir:

```bash
sudo bash install.sh
```

### ⚡ Bu Otomatik Kurulum Betiği (`install.sh`) Neler Yapar?

1. **Sistem Paket Güncellemesi:** `apt update && apt upgrade` çalıştırarak sunucuyu günceller.
2. **Node.js 20 LTS:** En güncel uzun süreli desteklenen Node.js sürümünü sunucuya yükler.
3. **PostgreSQL Veritabanı Yapılandırması:** 
   - `satinalma_db` veritabanını varsayılan **UTF-8 Türkçe (tr_TR.UTF-8)** karakter kodlamasıyla oluşturur.
   - `postgres` kullanıcısı şifresini ve izinlerini tanımlar.
4. **Bağımlılıklar:** `npm install --production` ile gerekli Node paketlerini kurar.
5. **7/24 PM2 Çalışma Garantisi:** Uygulamayı arka planda **PM2** süreç yöneticisi ile başlatır ve sunucu reboot (yeniden başlama) olsa dahi otomatik açılacak şekilde `systemd` servisine bağlar.
6. **Nginx Reverse Proxy & Güvenlik:** 
   - Nginx sunucusunu kurar ve Port 80 gelen istekleri Port 3000 Node.js uygulamasına yönlendirir.
   - Büyük dosya/Excel aktarımları için `client_max_body_size 50M` ve zaman aşımı ayarlarını yapılandırır.

---

## 🔧 IT Sistem Yöneticisi Teknik Özeti

- **Uygulama Portu:** Node.js varsayılan olarak internal `3000` portunda dinler.
- **Nginx Yönlendirmesi:** `http://<SUNUCU_IP>/` adresi doğrudan Port 3000'e yönlendirilir.
- **Veritabanı:** PostgreSQL `satinalma_db` (Kullanıcı: `postgres`, Şifre: `123456`, Port: `5432`).
- **Domain Tanımlama:** Nginx ayar dosyasından (`/etc/nginx/sites-available/satinalma`) `server_name _` kısmını üniversite domain adı (ör: `satinalma.pirireis.edu.tr`) ile değiştirebilirsiniz.

---

## 🔄 GÜNCELLEME ALMA (UPDATE)

Yazılımda yeni bir güncelleme veya özellik yayınlandığında sunucuda sadece şu komutu çalıştırmanız yeterlidir:

```bash
bash update.sh
```

Bu komut GitHub'dan son kodları çeker, gerekiyorsa bağımlılıkları günceller ve uygulamayı kesintisiz (zero-downtime) yeniden başlatır.

---

## 🛠️ Hızlı Yönetim Komutları

```bash
# Uygulama Çalışma Durumu
pm2 status

# Canlı Konsol Log Takibi
pm2 logs satinalma

# Yeniden Başlatma
pm2 restart satinalma

# Nginx Yeniden Başlatma
sudo systemctl restart nginx

# PostgreSQL Servis Durumu
sudo systemctl status postgresql
```

---

## 👤 İlk Giriş Varsayılan Kullanıcı Bilgileri

- **Ad Soyad:** Cem TUR (Satınalma Mdr. Yrd. - Admin)
- **Varsayılan Şifre:** `123456`
*(İlk girişten sonra sağ üst kullanıcı panelinden veya Ayarlar sekmesinden şifre değiştirilebilir).*
