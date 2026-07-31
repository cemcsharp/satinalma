# ============================================================
#  Satinalma Takip - Otomatik Veri Yedekleme Scripti
#  Çalışma saati: Her gece 02:00 (Görev Zamanlayıcı tarafından tetiklenir)
#  Saklama süresi: Son 30 günün yedeği tutulur
# ============================================================

# Proje kök dizinini bu scriptin bulunduğu klasör olarak al
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$sourceFile  = Join-Path $scriptDir "data\db.json"
$backupDir   = Join-Path $scriptDir "backups"
$logFile     = Join-Path $backupDir "backup.log"
$keepDays    = 30

# Yedek klasörü yoksa oluştur
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"
$destFile    = Join-Path $backupDir "db-$timestamp.json"

# Kaynak dosya var mı kontrol et
if (-not (Test-Path $sourceFile)) {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] HATA: Kaynak dosya bulunamadi: $sourceFile"
    Add-Content -Path $logFile -Value $msg
    Write-Host $msg
    exit 1
}

# Yedek al
try {
    Copy-Item -Path $sourceFile -Destination $destFile -Force
    $size = (Get-Item $destFile).Length
    $msg  = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] BASARILI: $destFile ($([math]::Round($size/1KB, 1)) KB)"
    Add-Content -Path $logFile -Value $msg
    Write-Host $msg
} catch {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] HATA: Yedek alinamadi - $_"
    Add-Content -Path $logFile -Value $msg
    Write-Host $msg
    exit 1
}

# 30 günden eski yedekleri temizle
$cutoffDate = (Get-Date).AddDays(-$keepDays)
$oldFiles   = Get-ChildItem -Path $backupDir -Filter "db-*.json" |
              Where-Object { $_.LastWriteTime -lt $cutoffDate }

foreach ($f in $oldFiles) {
    Remove-Item $f.FullName -Force
    $delMsg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] SILINDI (30+ gun): $($f.Name)"
    Add-Content -Path $logFile -Value $delMsg
    Write-Host $delMsg
}

Write-Host "Yedekleme tamamlandi."
