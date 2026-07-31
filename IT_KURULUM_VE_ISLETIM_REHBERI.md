# 🏛️ Piri Reis Üniversitesi — Satınalma Takip
## ⚡ IT Kurulum Rehberi (Windows, Linux & Nginx)

---

### 🪟 WINDOWS SUNUCU KURULUMU (3 Adım)

1. **Sunucuyu Başlatın:**  
   `server.ps1` dosyasına sağ tıklayıp **"PowerShell ile Çalıştır"** deyin.

2. **Güvenlik Duvarı Ağ İzni (Port 3000):**  
   Yönetici PowerShell'e yapıştırın:
   ```powershell
   netsh advfirewall firewall add rule name="SatinalmaTakip" dir=in action=allow protocol=TCP localport=3000
   ```

3. **Erişim Adresi:** `http://[SUNUCU_IP]:3000/`

---

### 🐧 LINUX SUNUCU KURULUMU (Ubuntu / Debian / CentOS)

#### 1️⃣ Sunucuyu Başlatma:
```bash
node server.js   # veya: pwsh server.ps1
```

#### 2️⃣ Nginx Reverse Proxy Konfigürasyonu (Port 80 / 443 HTTPS):
`/etc/nginx/sites-available/satinalma` dosyası oluşturup yapıştırın:

```nginx
server {
    listen 80;
    # IT Ekibinin Belirleyeceği Herhangi Bir Domain (ör: satinalma, satinalmatakip, sat-portal):
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

Nginx servisini aktifleştirin ve yeniden başlatın:
```bash
sudo ln -s /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 🌐 Kurumsal Bağlantı Adresi (Domain Esnekliği)
Uygulama kodunda herhangi bir domain kısıtlaması **yoktur**. IT Dairesi DNS üzerinde hangi ismi yönlendirirse (`satinalmatakip.pirireis.edu.tr`, `sat.pirireis.edu.tr` vb.), uygulama o adres üzerinden %100 sorunsuz çalışır.

---

### 💾 OTOMATİK VERİ YEDEKLENMESİ (Her Gece 02:00)

Tüm uygulama verileri tek bir **`data/db.json`** dosyasında saklanmaktadır. Otomatik yedekleme scriptleri hazırlarmış olup son **30 günün yedeği** tarih damgasıyla (`backups/db-YYYY-MM-DD_HH-mm.json`) tutulur ve 30 günü geçenler otomatik temizlenir.

#### 🪟 Windows Sunucuda Kurulum:
`Yedek_Kur.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** seçeneğini tıklayın. Her gece 02:00'de otomatik çalışan Görev Zamanlayıcı (Task Scheduler) görevi tanımlanacaktır.

#### 🐧 Linux Sunucuda Kurulum (Cron):
`crontab -e` komutunu çalıştırıp aşağıdaki satırı ekleyin:
```bash
0 2 * * * /bin/bash /opt/satinalma/backup.sh > /dev/null 2>&1
```

*(Not: `/opt/satinalma` yerine uygulamanın kurulu olduğu dizin yazılmalıdır).*

