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
} catch {
    Write-Host "Could not start listener on port $port : $_"
    exit 1
}

$publicDir = Join-Path $pwd "public"
$dbPath = Join-Path (Join-Path $pwd "data") "db.json"

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

                $resJson = "{`"success`":true,`"USD`":$usdRate,`"EUR`":$eurRate,`"lastUpdated`":`"$dateStr`"}"
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            } catch {
                $errJson = "{`"success`":false,`"error`":`"$($_)`"}"
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
                    $utf8Encoding = New-Object System.Text.UTF8Encoding($true)
                    [System.IO.File]::WriteAllText($dbPath, $bodyJson, $utf8Encoding)
                    
                    $response.ContentType = "application/json; charset=utf-8"
                    $okBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
                    $response.OutputStream.Write($okBytes, 0, $okBytes.Length)
                } finally {
                    if ($hasLock) { $mutex.ReleaseMutex() }
                }
            } else {
                $response.StatusCode = 400
            }
            $response.Close()
            continue
        }

        # Static File Serving
        $filePath = ""
        if ($urlPath -eq "/") {
            $filePath = Join-Path $publicDir "index.html"
        } else {
            $cleanRelPath = $urlPath.TrimStart('/').Replace('/', '\')
            $filePath = Join-Path $publicDir $cleanRelPath
        }

        if (Test-Path $filePath -PathType Leaf) {
            $response.ContentType = Get-ContentType $filePath
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }
        $response.Close()
    } catch {
        Write-Host "Error handling request: $_"
    }
}
