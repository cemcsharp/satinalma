# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Uygulaması
## ⚡ IT Kurulum ve İşletim Rehberi

---

### 🚀 HIZLI BAŞLANGIÇ

#### 🐧 Linux Sunucu (Önerilen — 3 Adım)
```bash
# 1. Projeyi GitHub'dan çekin
git clone https://github.com/cemcsharp/satinalma.git
cd satinalma

# 2. Sunucuyu başlatın (Node.js 14+ gerekli, harici paket gerekmez)
node server.js

# 3. Gece 02:00 otomatik yedek kurun
chmod +x backup.sh
crontab -e
# Açılan editöre şu satırı ekleyip kaydedin:
# 0 2 * * * /bin/bash /opt/satinalma/backup.sh > /dev/null 2>&1
```
Erişim: `http://sunucu-ip:3000`

#### 🪟 Windows Sunucu (Alternatif)
1. `server.ps1` → Sağ tıkla → **"PowerShell ile Çalıştır"**
2. `Yedek_Kur.bat` → Sağ tıkla → **"Yönetici Olarak Çalıştır"** *(gece 02:00 otomatik yedek)*

---

### ⚙️ DETAYLI YAPILANDIRMA

#### 1. Ağ Erişimi ve Firewall
- **Linux:** `sudo ufw allow 3000/tcp`
- **Windows:** `netsh advfirewall firewall add rule name="SatinalmaTakip" dir=in action=allow protocol=TCP localport=3000`

#### 2. Sunucu Yeniden Başladığında Otomatik Çalışma (systemd)
`/etc/systemd/system/satinalma.service` dosyası oluşturun:
```ini
[Unit]
Description=Satinalma Takip
After=network.target

[Service]
WorkingDirectory=/opt/satinalma
ExecStart=/usr/bin/node /opt/satinalma/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable satinalma
sudo systemctl start satinalma
```

#### 3. Domain ve Nginx Yönlendirmesi (Port 80 → 3000)
- Uygulama kodunda **domain kısıtlaması yoktur**. IT DNS'te hangi ismi tanımlarsa o adres ile çalışır.
```nginx
server {
    listen 80;
    server_name satinalma.pirireis.edu.tr;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 🔒 GÜVENLİK VE VERİ YAPISI
- **Veritabanı:** `data/db.json` — Harici SQL veritabanı gerekmez.
- **Yedekleme:** Son 30 günün yedeği `backups/` klasöründe tarih damgasıyla saklanır.
- **Portal Güvenliği:** Şifresiz sorgulama ekranında **Birebir Tam Barkod Eşleşmesi** zorunludur. Kısmi arama ile başkalarının taleplerine erişim engellenmiştir.
