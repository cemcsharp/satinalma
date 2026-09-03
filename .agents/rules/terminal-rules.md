# Terminal ve Sunucu Komut Kuralları (Prompt-Free Standards)

Bu projede kullanıcıya veya IT ekibine verilecek tüm sunucu ve terminal komutları aşağıdaki katı kurallara uygun olmalıdır:

1. **Şifre ve Kullanıcı Adı Asla İstenmeyecek (Prompt-Free Execution):**
   - Sunucuda çalışan hiçbir komut (`git pull`, `git fetch`, `update.sh` vb.) kullanıcı adı veya şifre sormamalıdır.
   - Git komutlarında `GIT_TERMINAL_PROMPT=0` ve `git -c credential.helper=` parametreleri kullanılmalıdır.

2. **Tek Satır ve Kesintisiz Akış:**
   - Sunucuya verilecek komutlar terminalin stdin arabelleğinde takılmaması için tek satırda ve `&&` ile zincirlenmiş olarak sunulmalıdır.
   - Örnek Güncelleme:
     ```bash
     cd /opt/satinalma && bash update.sh
     ```
   - Örnek Doğrudan Çekme:
     ```bash
     cd /opt/satinalma && GIT_TERMINAL_PROMPT=0 git -c credential.helper= fetch origin main && git reset --hard origin/main && pm2 restart satinalma
     ```
   - Örnek Temiz Kurulum:
     ```bash
     cd /opt && git clone https://github.com/cemcsharp/satinalma.git && cd satinalma && bash install.sh
     ```

3. **Veritabanı & Güvenlik:**
   - Şifreler `.env` dosyasında tutulmalı (`chmod 600`), hiçbir script düz metin şifre istememeli/yazdırmamalıdır.
