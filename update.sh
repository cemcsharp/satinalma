#!/bin/bash

# ==============================================================================
# Piri Reis Üniversitesi Satınalma Takip Sistemi - Otomatik Güncelleme Betiği
# ==============================================================================

echo "=========================================================="
echo " 🔄 Güncelleme başlatılıyor..."
echo "=========================================================="

# Git deposundan son güncellemeleri çek
git pull origin main || git pull

# PM2 servisini kesintisiz yeniden başlat
pm2 reload satinalma || pm2 restart satinalma || pm2 restart server

echo "=========================================================="
echo " ✅ Uygulama başarıyla son sürüme güncellendi!"
echo "=========================================================="
