@echo off
chcp 65001 > nul
title Satınalma Takip - Otomatik Yedekleme Görevi Kurulumu

echo ============================================================
echo  Satınalma Takip — Otomatik Gece Yedeği Kurulumu (02:00)
echo ============================================================
echo.

set SCRIPT_PATH=%~dp0backup.ps1

schtasks /create /tn "SatinalmaTakip_Yedek" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT_PATH%\"" /sc daily /st 02:00 /f /ru "SYSTEM"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [BASARILI] Otomatik yedekleme görevi Windows Görev Zamanlayıcısına eklendi.
    echo Her gece 02:00'de backups/ klasörüne tarih damgalı yedek alınacak.
    echo Son 30 günün yedeği saklanacaktır.
) else (
    echo.
    echo [HATA] Görev eklenemedi. Lütfen bu dosyayı "Yönetici Olarak Çalıştır"ın.
)

echo.
pause
