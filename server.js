// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sunucusu (Node.js)
//  Linux / Windows uyumlu — Harici bağımlılık gerektirmez
//  Kullanım: node server.js
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');
const BACKUPS_DIR = path.join(DB_DIR, 'backups');

// Yedek klasörü yoksa oluştur
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// MIME Type Eşlemeleri
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Yedek alma fonksiyonu
function createBackup(reason) {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const backupName = `db_${timestamp}.json`;
    const backupPath = path.join(BACKUPS_DIR, backupName);

    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}] 💾 Yedek alındı: ${backupName} (${reason})`);

    // Son 30 yedeği tut, gerisini sil
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('db_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length > 30) {
      files.slice(30).forEach(f => {
        fs.unlinkSync(path.join(BACKUPS_DIR, f));
      });
    }
    return backupName;
  } catch (err) {
    console.error('Yedek hatası:', err.message);
    return null;
  }
}

// Sunucu başlangıcında yedek al
createBackup('startup');

// JSON body okuma
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// TCMB Döviz Kuru Çekme
function fetchTCMBRates() {
  return new Promise((resolve, reject) => {
    https.get('https://www.tcmb.gov.tr/kurlar/today.xml', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const usdMatch = data.match(/<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexSelling>([\d.,]+)<\/ForexSelling>/);
          const eurMatch = data.match(/<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexSelling>([\d.,]+)<\/ForexSelling>/);

          const usd = usdMatch ? parseFloat(usdMatch[1].replace(',', '.')) : null;
          const eur = eurMatch ? parseFloat(eurMatch[1].replace(',', '.')) : null;

          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

          resolve({ success: true, USD: usd, EUR: eur, lastUpdated: dateStr });
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// HTTP Sunucu
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;
  const method = req.method.toUpperCase();

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  console.log(`[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}] ${method} ${urlPath}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // GET /api/data
    if (urlPath === '/api/data' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        res.writeHead(200);
        res.end(data);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'DB file not found' }));
      }
      return;
    }

    // GET /api/fetch-tcmb-rates
    if (urlPath === '/api/fetch-tcmb-rates' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const rates = await fetchTCMBRates();
        res.writeHead(200);
        res.end(JSON.stringify(rates));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/save-db
    if (urlPath === '/api/save-db' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      if (body && body.trim()) {
        fs.writeFileSync(DB_PATH, body, 'utf8');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Empty body' }));
      }
      return;
    }

    // GET /api/backups
    if (urlPath === '/api/backups' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const list = [];
      if (fs.existsSync(BACKUPS_DIR)) {
        const files = fs.readdirSync(BACKUPS_DIR)
          .filter(f => f.startsWith('db_') && f.endsWith('.json'))
          .sort()
          .reverse();

        files.forEach(f => {
          const stat = fs.statSync(path.join(BACKUPS_DIR, f));
          const d = stat.birthtime || stat.ctime;
          const pad2 = (n) => String(n).padStart(2, '0');
          list.push({
            filename: f,
            sizeKB: Math.round(stat.size / 1024 * 10) / 10,
            created: `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
          });
        });
      }
      res.writeHead(200);
      res.end(JSON.stringify(list));
      return;
    }

    // POST /api/backup-now
    if (urlPath === '/api/backup-now' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const bName = createBackup('manual');
      if (bName) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, filename: bName }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: 'Yedek alınamadı.' }));
      }
      return;
    }

    // Statik Dosya Sunucu (Path Traversal korumalı)
    let filePath;
    if (urlPath === '/') {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    } else {
      filePath = path.join(PUBLIC_DIR, urlPath.replace(/\.\./g, ''));
    }

    const fullPath = path.resolve(filePath);
    const fullPublicDir = path.resolve(PUBLIC_DIR);

    if (fullPath.startsWith(fullPublicDir) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const fileData = fs.readFileSync(fullPath);
      res.writeHead(200);
      res.end(fileData);
    } else {
      res.writeHead(404);
      res.end('404 Not Found');
    }
  } catch (err) {
    console.error('İstek hatası:', err.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================================');
  console.log(' 🚀 SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (Node.js)');
  console.log(` 🌐 Erişim: http://localhost:${PORT}/`);
  console.log('==========================================================');
});
