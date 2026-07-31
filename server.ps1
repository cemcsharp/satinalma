[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "=========================================================="
    Write-Host " 🚀 SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (TCMB & REST OK)"
    Write-Host " 🌐 Yerel Erişim: http://localhost:$port/"
    Write-Host "=========================================================="
    try {
        Start-Process "http://localhost:$port/"
    } catch {
        # Browser launch fallback
    }
} catch {
    Write-Host "Could not start listener on port $port : $_"
    exit 1
}

$publicDir = Join-Path $pwd "public"
$dbDir = Join-Path $pwd "data"
$dbPath = Join-Path $dbDir "db.json"
$backupsDir = Join-Path $dbDir "backups"

if (-not (Test-Path $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir -Force | Out-Null
}

function New-DatabaseBackup {
    param([string]$reason = "auto")
    try {
        if (-not (Test-Path $dbPath)) { return $null }
        if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir -Force | Out-Null }
        $timestamp = (Get-Date -Format "yyyy-MM-dd_HHmm")
        $backupName = "db_$timestamp.json"
        $backupPath = Join-Path $backupsDir $backupName
        
        Copy-Item -Path $dbPath -Destination $backupPath -Force
        Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] 💾 Backup created: " + $backupName + " (" + $reason + ")")
        
        # Keep latest 30 backups
        $existing = Get-ChildItem -Path $backupsDir -Filter "db_*.json" | Sort-Object CreationTime -Descending
        if ($existing.Count -gt 30) {
            $existing | Select-Object -Skip 30 | Remove-Item -Force
        }
        return $backupName
    } catch {
        Write-Host "Backup failed: $_"
        return $null
    }
}

# Create initial backup on server startup if db.json exists
$null = New-DatabaseBackup -reason "startup"

function Get-ContentType($filePath) {
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    switch ($ext) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".svg"  { return "image/svg+xml" }
        default { return "application/octet-stream" }
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.AbsolutePath
        Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $request.HttpMethod + " " + $urlPath)

        # CORS & Character Encoding Headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # GET /api/data
        if ($urlPath -eq "/api/data" -and $request.HttpMethod -eq "GET") {
            $response.ContentType = "application/json; charset=utf-8"
            if (Test-Path $dbPath) {
                $jsonBytes = [System.IO.File]::ReadAllBytes($dbPath)
                $response.ContentLength64 = $jsonBytes.Length
                $response.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
            } else {
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"DB file not found"}')
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # GET /api/fetch-tcmb-rates (Auto fetch TCMB XML Exchange Rates)
        if ($urlPath -eq "/api/fetch-tcmb-rates") {
            $response.ContentType = "application/json; charset=utf-8"
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Encoding = [System.Text.Encoding]::UTF8
                $xmlText = $wc.DownloadString('https://www.tcmb.gov.tr/kurlar/today.xml')
                $xml = [xml]$xmlText
                $usdNode = $xml.Tarih_Date.Currency | Where-Object { $_.CurrencyCode -eq 'USD' }
                $eurNode = $xml.Tarih_Date.Currency | Where-Object { $_.CurrencyCode -eq 'EUR' }
                
                $usdRate = [double]($usdNode.ForexSelling.Replace(',', '.'))
                $eurRate = [double]($eurNode.ForexSelling.Replace(',', '.'))
                $dateStr = (Get-Date -Format 'dd.MM.yyyy HH:mm')

                $ratesObj = [ordered]@{
                    success = $true
                    USD = $usdRate
                    EUR = $eurRate
                    lastUpdated = $dateStr
                }
                $resJson = $ratesObj | ConvertTo-Json -Compress
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            } catch {
                $errObj = @{ success = $false; error = "$($_)" }
                $errJson = $errObj | ConvertTo-Json -Compress
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # POST /api/save-db (Thread-Safe Atomic Save State back to disk)
        if ($urlPath -eq "/api/save-db" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $bodyJson = $reader.ReadToEnd()
            $reader.Close()

            if ($bodyJson -and $bodyJson.Trim() -ne "") {
                $mutex = New-Object System.Threading.Mutex($false, "SatinalmaTakipDbSaveMutex")
                $hasLock = $false
                try {
                    $hasLock = $mutex.WaitOne(3000)
                    if ($hasLock) {
                        $utf8Encoding = New-Object System.Text.UTF8Encoding($true)
                        [System.IO.File]::WriteAllText($dbPath, $bodyJson, $utf8Encoding)
                        
                        $response.ContentType = "application/json; charset=utf-8"
                        $okBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
                        $response.OutputStream.Write($okBytes, 0, $okBytes.Length)
                    } else {
                        $response.StatusCode = 500
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":false,"error":"Mutex lock timeout"}')
                        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    }
                } finally {
                    if ($hasLock) { $mutex.ReleaseMutex() }
                }
            } else {
                $response.StatusCode = 400
            }
            $response.Close()
            continue
        }

        # GET /api/backups (List all backups)
        if ($urlPath -eq "/api/backups" -and $request.HttpMethod -eq "GET") {
            $response.ContentType = "application/json; charset=utf-8"
            $list = @()
            if (Test-Path $backupsDir) {
                $files = Get-ChildItem -Path $backupsDir -Filter "db_*.json" | Sort-Object CreationTime -Descending
                foreach ($f in $files) {
                    $list += @{
                        filename = $f.Name
                        sizeKB = [math]::Round($f.Length / 1KB, 1)
                        created = $f.CreationTime.ToString("dd.MM.yyyy HH:mm")
                    }
                }
            }
            $resJson = @($list) | ConvertTo-Json -Compress
            if (-not $resJson -or $resJson -eq "null") { $resJson = "[]" }
            $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            $response.Close()
            continue
        }

        # POST /api/backup-now (Manual Trigger Backup)
        if ($urlPath -eq "/api/backup-now" -and $request.HttpMethod -eq "POST") {
            $response.ContentType = "application/json; charset=utf-8"
            $bName = New-DatabaseBackup -reason "manual"
            if ($bName) {
                $resJson = "{`"success`":true,`"filename`":`"$bName`"}"
            } else {
                $resJson = "{`"success`":false,`"error`":`"Yedek alınamadı.`"}"
            }
            $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            $response.Close()
            continue
        }

        # Static File Serving (with Path Traversal Guard)
        $filePath = ""
        if ($urlPath -eq "/") {
            $filePath = Join-Path $publicDir "index.html"
        } else {
            $cleanRelPath = $urlPath.TrimStart('/').Replace('/', '\')
            $filePath = Join-Path $publicDir $cleanRelPath
        }

        $fullPath = [System.IO.Path]::GetFullPath($filePath)
        $fullPublicDir = [System.IO.Path]::GetFullPath($publicDir)

        if ($fullPath.StartsWith($fullPublicDir, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $fullPath -PathType Leaf)) {
            $response.ContentType = Get-ContentType $fullPath
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $bytes.Length
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
            }
        }
        try { $response.Close() } catch {}
    } catch {
        Write-Host "Error handling request: $_"
    }
}
