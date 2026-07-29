
---

### 📂 Proje Dizin Yapısı ve Temel Dosyalar

```text
SatınalmaTakip/
├── Baslat.bat                 # 🚀 Çift tıkla sunucuyu ve tarayıcıyı başlatır
├── Servis_Yukle.bat           # 🏛️ (Yönetici) Sunucuya 7/24 otomatik servis olarak kurar
├── server.ps1                 # ⚙️ Web Sunucu & REST API Servis Kodu
├── KURULUM_REHBERI.md         # 📖 Bu Kullanım ve Kurulum Kılavuzu
├── public/                    # 🌐 Ön Yüz Arayüz Dosyaları (HTML, CSS, JS)
└── data/                      # 💾 Veritabanı Dizini
    └── db.json                # 🎯 Gerçek Zamanlı UTF-8 Veritabanı
```

---

### 🚀 1. HIZLI BAŞLATMA (Kişisel / Tek Bilgisayar Kullanımı)

1. Klasördeki **`Baslat.bat`** dosyasına çift tıklayın.
2. Siyah komut penceresi açılacak, gerekli ağ izinlerini ayarlayacak ve web tarayıcınızı otomatik açacaktır.
3. Uygulamaya **`http://localhost:3000/`** adresinden erişebilirsiniz.

---

### 🌐 2. ÇOKLU OFİS BAĞLANTISI (3 Farklı Ofis Kullanımı)

- Sunucu çalıştıktan sonra, aynı ağdaki diğer 2 ofiste çalışan çalışma arkadaşlarınız tarayıcılarına:
  ```text
  http://[SUNUCU_IP_ADRESI]:3000
  ```
  yazarak ortak veritabanına bağlanabilir ve eşzamanlı işlem yapabilirler.

---

### 🛠️ 3. BİLGİ İŞLEM (IT) SUNUCU KURULUMU (7/24 Otomatik Servis)

Sunucu bilgisayarında uygulamanın insan müdahalesi olmadan 7/24 çalışması için:

1. Proje klasöründeki **`Servis_Yukle.bat`** dosyasına **Sağ Tık -> "Yönetici Olarak Çalıştır"** deyin.
2. Script otomatik olarak:
   - Port 3000 için Windows Güvenlik Duvarı iznini açar.
   - Windows Görev Zamanlayıcısına (`Task Scheduler`) `SatinalmaTakipSunucusu` adıyla başlangıç görevi ekler.
   - Sunucu yeniden başlatılsa bile uygulama arka planda kesintisiz çalışmaya devam eder.

---

### 💾 4. VERİTABANI VE YEDEKLEME

- Tüm veriler **`data/db.json`** dosyasında saklanır.
- Her gün saat 23:00'da bu dosyanın bir kopyasını alarak kolayca veritabanı yedeği alabilirsiniz.
