#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Sistemi
#  Güncelleme Betiği (GitHub → Sunucu)
# ============================================================

set -e

echo "=========================================================="
echo " 🔄 Satınalma Takip Sistemi Güncelleniyor..."
echo "=========================================================="

# 1. GitHub'dan güncellemeleri çek (Git ve Hızlı Arşiv Çift Motorlu)
echo ""
echo "📥 [1/3] GitHub'dan güncellemeler çekiliyor..."
export GIT_TERMINAL_PROMPT=0

if ! git fetch origin main 2>/dev/null; then
  echo "⚠️ Git doğrudan erişimi sınırlı, güvenli web kanalıyla dosyalar güncelleniyor..."
  curl -sL https://github.com/cemcsharp/satinalma/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C /opt/satinalma
else
  git reset --hard origin/main
fi

# 2. Yeni npm bağımlılıkları kontrolü
echo ""
echo "📦 [2/3] Bağımlılıklar kontrol ediliyor..."
npm install --production

# 3. PM2 servisini yeniden başlat
echo ""
echo "⚡ [3/3] Uygulama yeniden başlatılıyor..."
pm2 restart satinalma --update-env

echo ""
echo "=========================================================="
echo " ✅ Uygulama başarıyla son sürüme güncellendi!"
echo " 🌐 Erişim: http://$(hostname -I | awk '{print $1}')/"
echo "=========================================================="
