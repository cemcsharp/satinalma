#!/bin/bash
# ============================================================
#  Satinalma Takip - Otomatik Veri Yedekleme Scripti (Linux)
#  Kurulum: crontab -e → 0 2 * * * /bin/bash /opt/satinalma/backup.sh
#  Saklama: Son 30 günün yedeği tutulur, eskiler silinir
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_FILE="$SCRIPT_DIR/data/db.json"
BACKUP_DIR="$SCRIPT_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP_DAYS=30

# Yedek klasörü yoksa oluştur
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
DEST_FILE="$BACKUP_DIR/db-$TIMESTAMP.json"

# Kaynak dosya var mı?
if [ ! -f "$SOURCE_FILE" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M')] HATA: Kaynak dosya bulunamadi: $SOURCE_FILE" | tee -a "$LOG_FILE"
    exit 1
fi

# Yedek al
if cp "$SOURCE_FILE" "$DEST_FILE"; then
    SIZE=$(du -h "$DEST_FILE" | cut -f1)
    echo "[$(date +'%Y-%m-%d %H:%M')] BASARILI: db-$TIMESTAMP.json ($SIZE)" | tee -a "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M')] HATA: Yedek alinamadi!" | tee -a "$LOG_FILE"
    exit 1
fi

# 30 günden eski yedekleri temizle
find "$BACKUP_DIR" -name "db-*.json" -mtime +$KEEP_DAYS -exec rm -f {} \; -exec echo "[$(date +'%Y-%m-%d %H:%M')] SILINDI (30+ gun): {}" \; | tee -a "$LOG_FILE"

echo "Yedekleme tamamlandi."
