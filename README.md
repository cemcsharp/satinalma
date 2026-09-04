# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Sistemi

[![Platform](https://img.shields.io/badge/Platform-Ubuntu%20%7C%20Debian-orange.svg)](https://ubuntu.com/)
[![Node](https://img.shields.io/badge/Node.js-v20%20LTS-green.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org/)
[![Web Server](https://img.shields.io/badge/Reverse%20Proxy-Nginx-009639.svg)](https://nginx.org/)
[![Process Manager](https://img.shields.io/badge/Process-PM2-2B037A.svg)](https://pm2.keymetrics.io/)
[![Security](https://img.shields.io/badge/Security-PBKDF2%20%7C%20JWT-red.svg)]()

Piri Reis Üniversitesi birimleri ve Satınalma Şube Müdürlüğü için geliştirilmiş; taleplerin, onay süreçlerinin, bütçe/tasarruf analizlerinin ve faturaların uçtan uca takip edildiği kurumsal web tabanlı yönetim platformu.

---

## 🚀 Hızlı Kurulum (Tek Komut)

Ubuntu veya Debian sunucunuzda aşağıdaki tek satırlık komutu çalıştırarak tüm sistemi (PostgreSQL, Node.js, Nginx, PM2 ve geçmiş veriler dahil) otomatik olarak kurabilirsiniz:

```bash
cd ~ && mkdir -p /opt/satinalma && curl -sL https://github.com/cemcsharp/satinalma/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C /opt/satinalma && cd /opt/satinalma && bash install.sh
```

---

## ✨ Temel Özellikler

* 📊 **Dinamik Dashboard & KPI:** Açık, tamamlanan, onay bekleyen ve süresi yaklaşan taleplerin canlı izlenmesi.
* 💰 **Finans & Tasarruf Analizi:** Yaklaşık maliyet, bütçe tahsisi, gerçekleşen harcama ve kurumsal tasarruf oranları.
* 🏢 **Akademik & İdari Birim Yönetimi:** Fakülteler, enstitüler ve idari dairelerin talep takibi.
* 📦 **Tedarikçi & Parçalı Sipariş:** Tek bir talebin birden çok tedarikçiye bölünerek yönetilmesi ve tedarikçi puanlama sistemi.
* 📅 **Tahmini Teslim & Akıllı Uyarılar:** Teslim tarihi yaklaşan veya geciken talepler için otomatik uyarı mekanizması.
* 💵 **Canlı TCMB Döviz Kurları:** USD ve EUR kurlarının gerçek zamanlı hesaplanması ve TL karşılıkları.
* 📄 **Excel / PDF Entegrasyonu:** Toplu veri aktarımı (`Talepler.xlsx`) ve tek tıkla resmi rapor dökümü.
* 🔍 **Barkodlu Kamu Sorgulama Portalı:** Şifresiz giriş ekranından barkod no ile süreç durumunun sorgulanabilmesi.

---

## 🔑 Varsayılan Giriş Hesapları

Kurulum tamamlandığında `http://SUNUCU_IP/` adresinden aşağıdaki yetkili hesaplarla giriş yapabilirsiniz:

| Rol | Kullanıcı | Varsayılan Şifre | Yetki Seviyesi |
| :--- | :--- | :--- | :--- |
| **Sistem Yöneticisi** | `Cem TUR` | `123456` | Tam Yetkili Yönetici |
| **Üst Yönetim** | `Yönetim` | `123456` | Rektörlük / İzleme & Raporlama |
| **Satınalma Uzmanı** | `Merih AVCI` | `123456` | Operasyonel Talep & İhale İşlemleri |
| **Satınalma Uzmanı** | `Gülsüm YILDIRIM` | `123456` | Operasyonel Talep & İhale İşlemleri |
| **Satınalma Uzmanı** | `Sultan MERİÇ` | `123456` | Operasyonel Talep & İhale İşlemleri |

---

## 🛠️ Sistem Yönetimi & Güncelleme

* **Sistemi Güncelleme:** `cd /opt/satinalma && bash update.sh`
* **Uygulama Durumu:** `pm2 status`
* **Canlı Loglar:** `pm2 logs satinalma`
* **Detaylı IT Kurulum Rehberi:** [KURULUM_NGINX_SSH.md](KURULUM_NGINX_SSH.md)

---

## 🛡️ Teknoloji & Güvenlik Mimarisi

* **Backend:** Node.js, Express REST API, PostgreSQL (`pg`)
* **Frontend:** Responsive Vanilla CSS / Vanilla JS (Harici framework bağımlılığı yoktur, ultra hızlı yüklenir)
* **Güvenlik:** PBKDF2 tuzlanmış şifreleme, HMAC-SHA256 JWT oturum yönetimi, katı SQL Injection Whitelist koruması, IP bazlı Rate Limiting.
