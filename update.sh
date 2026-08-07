#!/bin/bash
# ============================================================
#  Piri Reis Üniversitesi — Satınalma Takip Sistemi
#  Güncelleme Betiği (GitHub → Sunucu)
# ============================================================

set -e

echo "=========================================================="
echo " 🔄 Satınalma Takip Sistemi Güncelleniyor..."
echo "=========================================================="

# 1. GitHub'dan son değişiklikleri çek
echo ""
echo "📥 [1/3] GitHub'dan güncellemeler çekiliyor..."
git pull origin main || git pull

# 2. Yeni npm bağımlılığı eklenmiş olabilir
echo ""
echo "📦 [2/3] Bağımlılıklar kontrol ediliyor..."
npm install --production

# 3. PM2 servisini kesintisiz yeniden başlat
echo ""
echo "⚡ [3/3] Uygulama yeniden başlatılıyor..."
pm2 reload satinalma || pm2 restart satinalma

echo ""
echo "=========================================================="
echo " ✅ Uygulama başarıyla son sürüme güncellendi!"
echo " 🌐 Erişim: http://$(hostname -I | awk '{print $1}')/"
echo "=========================================================="
