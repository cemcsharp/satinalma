# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Sistemi
## ⚡ Hızlı IT Sunucu Kurulum & İşletim Kılavuzu

Bu kılavuz, Satınalma Takip Sistemi'nin Linux sunucularda (Ubuntu/Debian) tek komutla hızlı kurulumu, güncellenmesi ve yönetimi için hazırlanmıştır.

---

### 🚀 1. SIFIRDAN OTOMATİK KURULUM (ÖNERİLEN)

Aşağıdaki tek satırlık komut; **PostgreSQL**, **Node.js 20**, **Nginx**, **PM2** servislerini kurar, `Talepler.xlsx` dosyasındaki tüm geçmiş verileri aktarır ve sistemi 7/24 çalışır hale getirir:

```bash
cd ~ && mkdir -p /opt/satinalma && curl -sL https://github.com/cemcsharp/satinalma/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C /opt/satinalma && cd /opt/satinalma && bash install.sh
```

---

### 🔄 2. SİSTEMİ GÜNCELLEME (UPDATE)

GitHub'da yapılan geliştirmeleri sunucuya tek komutta kesintisiz yansıtmak için:

```bash
cd /opt/satinalma && bash update.sh
```

---

### 🧹 3. SİSTEMİ TAMAMEN SIFIRLAMA (WIPE & RESET)

Tüm veritabanı, PM2 süreçleri ve uygulama dosyalarını kalıntı bırakmadan silmek için:

```bash
cd ~ && pm2 delete satinalma 2>/dev/null || true; pm2 save --force; sudo -u postgres psql -c "DROP DATABASE IF EXISTS satinalma_db WITH (FORCE);" 2>/dev/null || true; sudo -u postgres psql -c "DROP USER IF EXISTS satinalma_user;" 2>/dev/null || true; rm -rf /opt/satinalma
```

---

### 🔑 4. GİRİŞ BİLGİLERİ

Kurulum bittiğinde tarayıcınızdan `http://SUNUCU_IP/` adresine girerek aşağıdaki hesaplarla erişebilirsiniz:

* 👑 **Sistem Yöneticisi:** `Cem TUR` *(Şifre: `123456`)*
* 🏛️ **Üst Yönetim (Rektörlük):** `Yönetim` *(Şifre: `123456`)*
* 💼 **Satınalma Uzmanları:** `Merih AVCI`, `Gülsüm YILDIRIM`, `Sultan MERİÇ` *(Şifre: `123456`)*
* 🏢 **Birim Sorumluları:** Tüm fakülte ve daireler *(Şifre: `123456`)*

---

### 🔒 5. DOMAIN & SSL (HTTPS) BAĞLAMA *(İsteğe Bağlı)*

Bilgi İşlem Daire Başkanlığı'nın belirleyeceği herhangi bir kurumsal alt alan adını (örneğin: `satinalma.pirireis.edu.tr`, `talep.pirireis.edu.tr` veya `ihale.pirireis.edu.tr`) bağlayıp ücretsiz otomatik SSL (yeşil kilit) kurmak için:

1. **DNS Yönlendirmesi:** Bilgi İşlem ekibi belirlenen alan adını sunucu IP'sine (`109.236.48.236`) yönlendirir.
2. **Tek Komutla SSL Kurulumu:** Aşağıdaki komutta alan adını yazıp çalıştırmanız yeterlidir (Nginx ayarını otomatik yapar ve sertifikayı bağlar):

```bash
# Örnek: Bilgi İşlem'in tahsis ettiği alan adı ile çalıştırma
sudo certbot --nginx -d ALAN_ADINIZ.pirireis.edu.tr
```

*(Not: Alan adı tanımlanmasa dahi sistem doğrudan `http://109.236.48.236/` IP adresi üzerinden tüm özellikleriyle kesintisiz kullanılabilir).*

---

### 🛠️ 6. TEMEL YÖNETİM KOMUTLARI

| İşlem | Komut |
| :--- | :--- |
| **Uygulama Durumu** | `pm2 status` |
| **Canlı Logları İzleme** | `pm2 logs satinalma` |
| **Uygulamayı Yeniden Başlatma** | `pm2 restart satinalma` |
| **Sistem ve Güvenlik Doğrulama Testi** | `cd /opt/satinalma && node test-audit.js` |
| **Excel Verilerini Tekrar Aktarma** | `cd /opt/satinalma && node import-excel.js` |
| **Veritabanı Yedeği Alma** | `sudo -u postgres pg_dump satinalma_db > /opt/satinalma/backups/yedek_$(date +%F).sql` |
