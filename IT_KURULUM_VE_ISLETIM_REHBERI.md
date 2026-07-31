# 🏛️ Piri Reis Üniversitesi — Satınalma Takip Uygulaması
## 🐧 Linux Sunucu Kurulum Rehberi

---

## 🚀 TEK KOMUTLA KURULUM

Linux sunucuya SSH ile bağlanın ve şu komutu çalıştırın:

```bash
git clone https://github.com/cemcsharp/satinalma.git /opt/satinalma && sudo bash /opt/satinalma/install.sh
```

**Bu kadar!** Script otomatik olarak şunları yapar:
- ✅ Node.js kurulumu (yoksa)
- ✅ Proje dosyalarını GitHub'dan çekme
- ✅ Systemd servisi oluşturma (sunucu her açılışta otomatik başlar)
- ✅ Güvenlik duvarı port izni (3000)
- ✅ Nginx yönlendirmesi (varsa, port 80 → 3000)
- ✅ Gece 02:00 otomatik yedekleme (cron)

Kurulum sonunda ekranda erişim adresi gösterilir.

---

## ⚙️ KURULUM SONRASI

### Domain Ayarı (Opsiyonel)
Nginx kuruluysa, domain adını değiştirmek için:
```bash
sudo nano /etc/nginx/sites-available/satinalma
```
`server_name _` satırını istediğiniz domain ile değiştirin (ör: `server_name satinalma.pirireis.edu.tr;`) ve kaydedin:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Not:** Uygulama kodunda domain kısıtlaması yoktur. IT DNS'te hangi isim tanımlanırsa o adresle çalışır.

### Güncelleme Çekmek
İleride bir güncelleme yapıldığında:
```bash
cd /opt/satinalma && git pull && sudo systemctl restart satinalma
```

---

## 🔧 FAYDALI KOMUTLAR

| Komut | Açıklama |
|---|---|
| `sudo systemctl status satinalma` | Servis durumunu kontrol et |
| `sudo systemctl restart satinalma` | Servisi yeniden başlat |
| `sudo systemctl stop satinalma` | Servisi durdur |
| `sudo journalctl -u satinalma -f` | Canlı log takibi |

---

## 🔒 GÜVENLİK BİLGİSİ
- **Veritabanı:** `data/db.json` — Harici SQL veritabanı gerekmez.
- **Yedekleme:** Son 30 günün yedeği `data/backups/` klasöründe tarih damgasıyla saklanır.
- **Portal Güvenliği:** Şifresiz sorgulama ekranında **Birebir Tam Barkod Eşleşmesi** zorunludur. Kısmi arama ile başkalarının taleplerine erişim engellenmiştir.

---

## 🪟 WINDOWS SUNUCU (Alternatif)
1. `server.ps1` → Sağ tıkla → **"PowerShell ile Çalıştır"**
2. `Yedek_Kur.bat` → Sağ tıkla → **"Yönetici Olarak Çalıştır"** *(gece 02:00 yedek)*
3. Firewall: `netsh advfirewall firewall add rule name="SatinalmaTakip" dir=in action=allow protocol=TCP localport=3000`
