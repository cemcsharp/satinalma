# 🏛️ Bilgi İşlem (IT) Hızlı Sunucu Kurulum Rehberi

**Piri Reis Üniversitesi — Satınalma Takip Uygulaması**

Bu rehber Bilgi İşlem (Sistem Yöneticisi) arkadaşlarımızın **Ubuntu / Debian** sunucularda tek komutla kurulum yapabilmesi için hazırlanmıştır.

---

## 🚀 TEK KOMUTLA OTOMATİK KURULUM

Sunucuya SSH ile bağlandıktan sonra proje klasöründe şu komutu çalıştırmanız yeterlidir:

```bash
sudo bash install.sh
```

### ⚡ Bu Komut Neler Yapar?
1. **Node.js, PostgreSQL ve Nginx** servislerini sisteme otomatik yükler.
2. `satinalma_db` veritabanını ve yetkilerini otomatik yapılandırır.
3. Uygulamayı arka planda **PM2** süreç yöneticisi ile 7/24 çalışacak şekilde başlatır.
4. **Nginx Reverse Proxy** (Port 80 ➔ 3000) yönlendirmesini otomatik aktif eder.

---

## 🔧 IT Sistem Yöneticisi Özeti

- **Uygulama Portu:** Node.js varsayılan olarak `3000` portunda çalışır.
- **Nginx Yönlendirmesi:** `http://sunucu-ip/` adresi doğrudan Port 3000'e yönlendirilir.
- **Veritabanı:** PostgreSQL `satinalma_db` (Kullanıcı: `postgres`, Şifre: `123456`, Port: `5432`).
- **Domain Tanımlama:** Nginx dosyasından (`/etc/nginx/sites-available/satinalma`) `server_name` kısmına üniversite domain adı (ör: `satinalma.pirireis.edu.tr`) yazılabilir.

---

## 🛠️ Hızlı Yönetim Komutları

```bash
# Uygulama Durumu
pm2 status

# Canlı Log Takibi
pm2 logs satinalma

# Yeniden Başlatma
pm2 restart satinalma

# Nginx Yeniden Başlatma
sudo systemctl restart nginx
```
