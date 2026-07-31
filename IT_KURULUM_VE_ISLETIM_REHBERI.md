# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Uygulaması
## 🐧 Linux Sunucu Kurulum Rehberi (Adım Adım)

> **Gereksinimler:** Ubuntu 20.04+ veya Debian 11+ · Node.js 14+ · Git · Nginx (opsiyonel)

---

## ADIM 1 — Node.js Kurulumu

Sunucunuzda Node.js yoksa aşağıdaki komutları sırasıyla terminale yapıştırın:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Kurulumu doğrulamak için:
```bash
node -v
```
Ekranda `v20.x.x` benzeri bir çıktı görmeniz gerekir.

---

## ADIM 2 — Proje Dosyalarını GitHub'dan Çekin

```bash
cd /opt
sudo git clone https://github.com/cemcsharp/satinalma.git
cd /opt/satinalma
```

---

## ADIM 3 — Uygulamayı Test Edin

```bash
node server.js
```

Terminalde şunu görmeniz gerekir:
```
==========================================================
 🚀 SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (Node.js)
 🌐 Erişim: http://localhost:3000/
==========================================================
```

Test ettikten sonra **Ctrl+C** ile durdurun. Bir sonraki adımda kalıcı servis olarak kuracağız.

---

## ADIM 4 — Kalıcı Servis Oluşturma (systemd)

Bu adım sayesinde sunucu her yeniden başladığında uygulama **otomatik olarak açılacaktır**.

Aşağıdaki komutu terminale yapıştırın (dosyayı otomatik oluşturur):

```bash
sudo tee /etc/systemd/system/satinalma.service > /dev/null << 'EOF'
[Unit]
Description=Piri Reis Satinalma Takip Uygulamasi
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/satinalma
ExecStart=/usr/bin/node /opt/satinalma/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
```

Ardından servisi aktifleştirin ve başlatın:

```bash
sudo systemctl daemon-reload
sudo systemctl enable satinalma
sudo systemctl start satinalma
```

Servisin çalışıp çalışmadığını kontrol edin:
```bash
sudo systemctl status satinalma
```
Ekranda **`active (running)`** yazması gerekir.

---

## ADIM 5 — Güvenlik Duvarı (Firewall) İzni

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

Bu noktada uygulama `http://SUNUCU_IP:3000` adresinden erişilebilir olmalıdır.

---

## ADIM 6 — Nginx ile Domain Yönlendirmesi (Opsiyonel)

Bu adım sayesinde kullanıcılar `http://satinalma.pirireis.edu.tr` gibi bir domain adresinden erişebilir (port numarası yazmadan).

**6a.** Nginx kurun (yoksa):
```bash
sudo apt install -y nginx
```

**6b.** Aşağıdaki komutu terminale yapıştırın (Nginx konfigürasyon dosyasını otomatik oluşturur):

```bash
sudo tee /etc/nginx/sites-available/satinalma > /dev/null << 'EOF'
server {
    listen 80;
    server_name satinalma.pirireis.edu.tr;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

> **⚠️ NOT:** `satinalma.pirireis.edu.tr` yerine IT Dairesinin belirleyeceği domain yazılmalıdır. Uygulama kodunda domain kısıtlaması yoktur, herhangi bir isim çalışır.

**6c.** Konfigürasyonu aktifleştirin:
```bash
sudo ln -s /etc/nginx/sites-available/satinalma /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` komutunun çıktısında **`syntax is ok`** ve **`test is successful`** yazması gerekir.

---

## ADIM 7 — Otomatik Gece Yedeği (Her Gece 02:00)

**7a.** Yedek scriptine çalıştırma izni verin:
```bash
chmod +x /opt/satinalma/backup.sh
```

**7b.** Cron görevi ekleyin:
```bash
crontab -e
```

Açılan editörde **en alt satıra** şu satırı yapıştırıp kaydedin:
```
0 2 * * * /bin/bash /opt/satinalma/backup.sh > /dev/null 2>&1
```

Bu sayede her gece 02:00'de `data/backups/` klasörüne tarih damgalı yedek alınır ve 30 günden eski yedekler otomatik silinir.

---

## ✅ KURULUM TAMAMLANDI

| Bileşen | Durum |
|---|---|
| Uygulama | `http://SUNUCU_IP:3000` adresinden erişilebilir |
| Otomatik Başlatma | Sunucu her açıldığında uygulama otomatik başlar |
| Gece Yedeği | Her gece 02:00'de `data/backups/` klasörüne yedek alınır |
| Domain (opsiyonel) | Nginx ile port 80 üzerinden domain ile erişim |

---

## 🔧 FAYDALI KOMUTLAR

| Komut | Açıklama |
|---|---|
| `sudo systemctl status satinalma` | Servis durumunu kontrol et |
| `sudo systemctl restart satinalma` | Servisi yeniden başlat |
| `sudo systemctl stop satinalma` | Servisi durdur |
| `sudo journalctl -u satinalma -f` | Canlı log takibi |
| `cd /opt/satinalma && git pull` | GitHub'dan güncelleme çek |

---

## 🔒 GÜVENLİK BİLGİSİ
- **Veritabanı:** `data/db.json` — Harici SQL veritabanı gerekmez.
- **Portal Güvenliği:** Şifresiz sorgulama ekranında **Birebir Tam Barkod Eşleşmesi** zorunludur. Kısmi arama ile başkalarının taleplerine erişim engellenmiştir.
