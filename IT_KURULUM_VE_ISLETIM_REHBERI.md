# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Uygulaması
## ⚡ IT Kurulum ve İşletim Rehberi

---

### 🚀 HIZLI BAŞLANGIÇ (Windows Sunucu için 2 Adım)

1. **Uygulamayı Çalıştırın:**  
   `server.ps1` dosyasına sağ tıklayıp **"PowerShell ile Çalıştır"** deyin.  
   *(Erişim adresi: `http://localhost:3000`)*

2. **Otomatik Gece Yedeğini Kurun:**  
   `Yedek_Kur.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** deyin.  
   *(Her gece 02:00'de son 30 günün yedeği `backups/` klasörüne otomatik alınır).*

---

### ⚙️ DETAYLI IT & SUNUCU YAPILANDIRMASI

#### 1. Güvenlik Duvarı İzni (Windows Firewall - Port 3000)
Ağdaki kullanıcıların erişebilmesi için Yönetici PowerShell'de çalıştırın:
```powershell
netsh advfirewall firewall add rule name="SatinalmaTakip" dir=in action=allow protocol=TCP localport=3000
```

#### 2. Domain & Web Server Yönlendirmesi (Nginx / IIS)
- Uygulama kodunda **domain kısıtlaması yoktur**. IT Dairesi DNS'te hangi ismi tanımlarsa (`satinalma.pirireis.edu.tr`, `satinalmatakip.pirireis.edu.tr` vb.) o adres üzerinden sorunsuz çalışır.
- **Nginx Yönlendirme Örneği (Port 80/443 -> 3000):**
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

#### 3. Linux Sunucu Kurulumu (Alternative)
- **Çalıştırma:** `pwsh server.ps1` veya `node server.js`
- **Linux Gece Yedeği (Cron 02:00):**  
  `crontab -e` komutuna ekleyin:
  ```bash
  0 2 * * * /bin/bash /opt/satinalma/backup.sh > /dev/null 2>&1
  ```

---

### 🔒 GÜVENLİK VE VERİ YAPISI
- **Veritabanı:** `data/db.json` (Harici SQL kuruluma gerek yoktur).
- **Portal Arama Güvenliği:** Şifresiz giriş ekranındaki talep sorgulamasında **Birebir Tam Barkod Eşleşmesi** zorunludur. Başkasının verisine veya genel liste sorgulamasına izin verilmez.
