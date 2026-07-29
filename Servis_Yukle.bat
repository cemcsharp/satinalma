@echo off
chcp 65001 > nul
title Satınalma Takip — Otomatik Sunucu Servis Kurulumu

echo ============================================================
echo   🏛️ SATİNALMA TAKİP KURUMSAL SUNUCU SERVİS KURULUMU
echo ============================================================
echo.

:: Yönetici Yetkisi Kontrolü
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [HATA] Bu kurulum dosyasını YÖNETİCİ OLARAK ÇALIŞTIRMALISINIZ!
    echo Sağ tıklayıp "Yönetici olarak çalıştır" seçeneğini kullanın.
    echo.
    pause
    exit /b
)

echo [1/3] Güvenlik duvarı (Port 3000) izni tanımlanıyor...
netsh advfirewall firewall delete rule name="SatinalmaTakipPort3000" >nul 2>&1
netsh advfirewall firewall add rule name="SatinalmaTakipPort3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
echo      [OK] Port 3000 dış erişime açıldı.

echo.
echo [2/3] Windows Otomatik Başlangıç Görevi Oluşturuluyor...
schtasks /Create /F /TN "SatinalmaTakipSunucusu" /TR "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """%~dp0server.ps1"""" /SC ONSTART /RU SYSTEM /RL HIGHEST >nul 2>&1

if %errorLevel% equ 0 (
    echo      [OK] Windows başlangıcına 7/24 otomatik servis olarak eklendi.
) else (
    schtasks /Create /F /TN "SatinalmaTakipSunucusu" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """%~dp0server.ps1"""" /SC ONSTART /RL HIGHEST >nul 2>&1
    echo      [OK] Servis tanımı başarıyla yapıldı.
)

echo.
echo [3/3] Servis Başlatılıyor...
schtasks /Run /TN "SatinalmaTakipSunucusu" >nul 2>&1

echo.
echo ============================================================
echo   🎉 KURULUM TAMAMLANDI!
echo   Sistem artık sunucu her açıldığında arka planda çalışacaktır.
echo   Erişim Adresi: http://localhost:3000/
echo ============================================================
echo.
pause
