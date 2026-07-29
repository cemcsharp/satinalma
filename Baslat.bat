@echo off
chcp 65001 > nul
title Piri Reis Üniversitesi - Satınalma Takip Sunucusu

echo ============================================================
echo   🚀 SATINALMA TAKİP SİSTEMİ BAŞLATILIYOR...
echo ============================================================
echo.

:: Sunucu Güvenlik Duvarı Port 3000 Kontrolü / İzin
netsh advfirewall firewall add rule name="SatinalmaTakipPort3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

:: Yerel Ağ IP Adresini Bulma
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
)

echo [BİLGİ] Sunucu Başlatılıyor...
echo [BİLGİ] Yerel Bağlantı: http://localhost:3000
echo [BİLGİ] Yan Ofisler İçin Ağ Adresi: http://%LOCAL_IP:~1%:3000
echo.
echo Tarayıcı açılıyor...
start http://localhost:3000/

:: PowerShell Sunucusunu Başlat
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
