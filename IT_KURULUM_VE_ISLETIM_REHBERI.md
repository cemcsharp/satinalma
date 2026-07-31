# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Uygulaması
## ⚡ IT Kurulum, Güvenlik ve İşletim Rehberi

---

### 📋 SİSTEM MİMARİSİ VE ÖZELLİKLERİ
- **Mimari:** Single Page Application (SPA) + Minimalist REST API.
- **Veritabanı:** Dahili `data/db.json` (Harici SQL sunucusu gerektirmez, sıfır konfigürasyon).
- **Port:** Varsayılan `3000` (Nginx veya IIS arkasında 80/443 olarak çalıştırılabilir).
- **Mobil/Tablet Uyum:** %100 Duyarlı (Responsive) CSS altyapısı, mobil hamburger menü ve dokunmatik tablo kaydırma.
- **Güvenlik Mimarisi:** 
  - Portal Talep Sorgulama ekranında **BİREBİR TAM BARKOD EŞLEŞMESİ** zorunludur.
  - Kısmi arama ile başkasının taleplerine erişilmesi veya veri ifşası engellenmiştir.

---

### 🪟 1. WINDOWS SUNUCU KURULUMU

#### A. Hızlı Başlatma (Komut Satırı / PowerShell)
1. `server.ps1` dosyasına sağ tıklayıp **"PowerShell ile Çalıştır"** deyin.
2. Güvenlik duvarı izni eklemek için Yönetici PowerShell'de çalıştırın:
   ```powershell
   netsh advfirewall firewall add rule name="SatinalmaTakip" dir=in action=allow protocol=TCP localport=3000
   ```
3. **Yerel Erişim:** `http://localhost:3000/` veya `http://[SUNUCU_IP]:3000/`

#### B. Sunucu Yeniden Başladığında Otomatik Çalışma (Windows Servisi / Görev)
Windows sunucu her açıldığında uygulamanın otomatik başlaması için:
1. `Servis_Yukle.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** deyin.
2. Uygulama Windows Başlangıç Görevi olarak sisteme kaydolur.

---

### 🐧 2. LINUX SUNUCU KURULUMU (Ubuntu / Debian / RHEL)

#### A. Servis Olarak Çalıştırma (systemd)
`/etc/systemd/system/satinalma.service` dosyası oluşturun:
```ini
[Unit]
Description=Piri Reis Satınalma Takip Uygulaması
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/satinalma
ExecStart=/usr/bin/pwsh /opt/satinalma/server.ps1
Restart=always

[Install]
WantedBy=multi-user.target
```

Servisi aktifleştirin:
```bash
sudo systemctl daemon-reload
sudo systemctl enable satinalma
sudo systemctl start satinalma
```

#### B. Nginx Reverse Proxy (Domain & SSL / HTTPS Konfigürasyonu)
`/etc/nginx/sites-available/satinalma` dosyası:
```nginx
server {
    listen 80;
    server_name satinalma.pirireis.edu.tr; # IT Dairesinin belirleyeceği domain ismi

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifleştirme:
```bash
sudo ln -s /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 🌐 3. DOMAIN VE DNS ESNEKLİĞİ
Uygulama kodunda herhangi bir domain, IP veya CORS kısıtlaması **bulunmamaktadır**.
IT Dairesi DNS sunucusunda hangi ismi tanımlarsa (`satinalma.pirireis.edu.tr`, `satinalmatakip.pirireis.edu.tr`, `sat.pirireis.edu.tr` vb.), sistem o domain üzerinden sorunsuz çalışır.

---

### 💾 4. OTOMATİK VERİ YEDEKLENMESİ (Her Gece 02:00)

Tüm veriler `data/db.json` dosyasında saklanır. Otomatik yedekleme scriptleri hazır olup **son 30 günün yedeği** tarih damgasıyla (`backups/db-YYYY-MM-DD_HH-mm.json`) tutulur ve 30 günü geçenler otomatik temizlenir.

- **Windows Otomatik Kurulum:**  
  `Yedek_Kur.bat` dosyasına **"Yönetici Olarak Çalıştır"** diyerek tıklayın. Görev Zamanlayıcısına 02:00 görevi eklenir.

- **Linux Otomatik Kurulum:**  
  `crontab -e` komutuyla ekleyin:
  ```bash
  0 2 * * * /bin/bash /opt/satinalma/backup.sh > /dev/null 2>&1
  ```
