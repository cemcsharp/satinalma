// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sunucusu (Node.js)
//  Veritabanı: PostgreSQL (REST API)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const pg = require('pg');
// Parse NUMERIC / DECIMAL database fields as numbers instead of strings
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// PostgreSQL Bağlantı Havuzu
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'satinalma_db',
  password: '123456',
  port: 5432,
});

pool.on('connect', (client) => {
  client.query("SET client_encoding = 'UTF8'");
});

pool.on('error', (err) => {
  console.error('Beklenmeyen veritabanı hatası', err);
});

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

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

async function getTableData(tableName) {
  const res = await pool.query(`SELECT * FROM ${tableName} ORDER BY id ASC`);
  return res.rows;
}

function sanitizeVal(val, k) {
  if (val === undefined || val === null || (typeof val === 'number' && isNaN(val))) return null;
  if (typeof val === 'string' && val.trim() === '' && ['estimatedAmount', 'budgetAmount', 'actualAmount', 'totalAmount', 'amount', 'guaranteeAmount', 'sequenceNo', '_diffDays', 'exchangeRate'].includes(k)) {
    return null;
  }
  return val;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;
  const method = req.method.toUpperCase();

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  console.log(`[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}] ${method} ${urlPath}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // 1. Initial Load
    if (urlPath === '/api/data' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      const [users, requests, contracts, invoices, guarantees, logs, units, regulations, rates, tenders] = await Promise.all([
        getTableData('users'),
        getTableData('requests'),
        getTableData('contracts'),
        getTableData('invoices'),
        getTableData('guarantees'),
        getTableData('logs'),
        pool.query('SELECT id, name FROM units ORDER BY name ASC'),
        pool.query('SELECT id, name FROM regulations ORDER BY id ASC'),
        pool.query('SELECT * FROM rates'),
        getTableData('tenders').catch(() => [])
      ]);

      const ratesObj = {};
      rates.rows.forEach(r => {
        ratesObj[r.currency] = r.rate;
        if (r.lastUpdated) ratesObj.lastUpdated = r.lastUpdated;
      });

      const payload = {
        users, requests, contracts, invoices, guarantees, logs,
        units: units.rows,
        regulations: regulations.rows,
        rates: Object.keys(ratesObj).length > 0 ? ratesObj : { USD: 36.50, EUR: 39.80 },
        tenders: tenders || []
      };

      res.writeHead(200);
      res.end(JSON.stringify(payload));
      return;
    }

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

    // 2. Generic REST CRUD API
    const parts = urlPath.split('/').filter(Boolean);
    if (parts[0] === 'api' && parts.length >= 2 && urlPath !== '/api/data') {
      const table = parts[1];
      const allowedTables = ['users', 'requests', 'contracts', 'invoices', 'guarantees', 'logs', 'units', 'regulations', 'tenders'];
      
      if (allowedTables.includes(table)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // POST /api/:table
        if (method === 'POST') {
          const body = await readBody(req);
          if (!body) { res.writeHead(400); res.end(JSON.stringify({ error: 'Empty body' })); return; }
          const data = JSON.parse(body);
          
          // Remove frontend-generated ID so Postgres generates it using SERIAL
          delete data.id;

          const keys = Object.keys(data);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(data[k], k));

          const query = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
          const result = await pool.query(query, values);
          
          res.writeHead(201);
          res.end(JSON.stringify(result.rows[0]));
          return;
        }
        
        // PUT /api/:table/:id
        if (method === 'PUT' && parts[2]) {
          const id = parseInt(parts[2], 10);
          const body = await readBody(req);
          if (!body) { res.writeHead(400); res.end(JSON.stringify({ error: 'Empty body' })); return; }
          const data = JSON.parse(body);
          delete data.id; // never update id
          
          const keys = Object.keys(data);
          const updates = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(data[k], k));
          values.push(id);

          const query = `UPDATE ${table} SET ${updates} WHERE id = $${values.length} RETURNING *`;
          const result = await pool.query(query, values);
          
          if (result.rowCount === 0) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
          } else {
            res.writeHead(200); res.end(JSON.stringify(result.rows[0]));
          }
          return;
        }

        // DELETE /api/:table/:id
        if (method === 'DELETE' && parts[2]) {
          const id = parseInt(parts[2], 10);
          const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
          if (result.rowCount === 0) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
          } else {
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
          }
          return;
        }
      }
      
      // Rates Table Endpoint
      if (table === 'settings' && method === 'POST') {
        const body = await readBody(req);
        if (body) {
           const data = JSON.parse(body);
           const client = await pool.connect();
           try {
             await client.query('BEGIN');
             await client.query('CREATE TABLE IF NOT EXISTS rates (currency VARCHAR(10) PRIMARY KEY, rate NUMERIC(12,4), "lastUpdated" VARCHAR(100))');
             await client.query('ALTER TABLE rates ADD COLUMN IF NOT EXISTS "lastUpdated" VARCHAR(100)');
             await client.query('TRUNCATE rates');
             const lastUp = (data.rates && data.rates.lastUpdated) ? data.rates.lastUpdated : new Date().toLocaleString('tr-TR');
             if (data.rates && data.rates.USD) await client.query('INSERT INTO rates ("currency", "rate", "lastUpdated") VALUES ($1, $2, $3)', ['USD', data.rates.USD, lastUp]);
             if (data.rates && data.rates.EUR) await client.query('INSERT INTO rates ("currency", "rate", "lastUpdated") VALUES ($1, $2, $3)', ['EUR', data.rates.EUR, lastUp]);
             await client.query('COMMIT');
             res.writeHead(200);
             res.end(JSON.stringify({ success: true }));
           } catch (e) {
             await client.query('ROLLBACK');
             throw e;
           } finally {
             client.release();
           }
        }
        return;
      }
    }

    // Self-Update Endpoint (Executes update.sh or git pull)
    if (urlPath === '/api/update-system' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const { exec } = require('child_process');
      exec('git pull && pm2 reload satinalma', (err, stdout, stderr) => {
        if (err) {
          // If git is not used or error occurs, log it cleanly
          console.error('Güncelleme hatası:', err.message);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        } else {
          console.log('Sistem güncellendi:', stdout);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, output: stdout }));
        }
      });
      return;
    }

    // Backup & Import Endpoints
    const BACKUP_DIR = path.join(__dirname, 'backups');
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    if (urlPath === '/api/backups' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json') || f.endsWith('.sql'));
      const backupList = files.map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        const sizeKB = (stat.size / 1024).toFixed(1) + ' KB';
        const d = new Date(stat.mtime);
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return { filename: f, createdAt: dateStr, size: sizeKB, mtime: stat.mtime };
      });
      backupList.sort((a, b) => b.mtime - a.mtime);
      res.writeHead(200);
      res.end(JSON.stringify(backupList));
      return;
    }

    if (urlPath === '/api/backups/create' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const [users, requests, contracts, invoices, guarantees, logs, units, regulations, rates] = await Promise.all([
        getTableData('users'),
        getTableData('requests'),
        getTableData('contracts'),
        getTableData('invoices'),
        getTableData('guarantees'),
        getTableData('logs'),
        pool.query('SELECT id, name FROM units ORDER BY id ASC'),
        pool.query('SELECT id, name FROM regulations ORDER BY id ASC'),
        pool.query('SELECT * FROM rates')
      ]);

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `backup_satinalma_${dateStr}.json`;
      const backupPath = path.join(BACKUP_DIR, filename);

      const backupData = {
        timestamp: now.toISOString(),
        users, requests, contracts, invoices, guarantees, logs,
        units: units.rows,
        regulations: regulations.rows,
        rates: rates.rows
      };

      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      const stat = fs.statSync(backupPath);
      const sizeKB = (stat.size / 1024).toFixed(1) + ' KB';

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, filename, size: sizeKB }));
      return;
    }

    if (urlPath.startsWith('/api/backups/download/') && method === 'GET') {
      const filename = path.basename(urlPath.replace('/api/backups/download/', ''));
      const filePath = path.join(BACKUP_DIR, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.writeHead(200);
        res.end(fs.readFileSync(filePath));
      } else {
        res.writeHead(404);
        res.end('File not found');
      }
      return;
    }

    if (urlPath === '/api/import-excel-requests' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const items = JSON.parse(body || '[]');
      if (!Array.isArray(items) || items.length === 0) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'No items provided' }));
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let addedCount = 0;
        for (const item of items) {
          delete item.id; // allow PostgreSQL SERIAL auto-increment
          const keys = Object.keys(item);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(item[k], k));

          const query = `INSERT INTO requests (${cols}) VALUES (${placeholders})`;
          await client.query(query, values);
          addedCount++;
        }
        await client.query('COMMIT');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, addedCount }));
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Import excel error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      } finally {
        client.release();
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

async function initDatabaseSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        "isActive" BOOLEAN DEFAULT true,
        password VARCHAR(255) DEFAULT '123456'
      );

      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,
        "requestBarcode" VARCHAR(100),
        subject VARCHAR(550),
        unit VARCHAR(255),
        "arrivalDate" VARCHAR(100),
        "assignedTo" VARCHAR(255),
        priority VARCHAR(50),
        status VARCHAR(50),
        "estimatedAmount" NUMERIC,
        "actualAmount" NUMERIC,
        currency VARCHAR(20) DEFAULT 'TRY',
        supplier VARCHAR(255),
        "orderBarcode" VARCHAR(100),
        "orderDate" VARCHAR(100),
        regulation VARCHAR(100),
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        "contractNo" VARCHAR(100),
        title VARCHAR(255),
        supplier VARCHAR(255),
        unit VARCHAR(255),
        "startDate" VARCHAR(100),
        "endDate" VARCHAR(100),
        "totalAmount" NUMERIC,
        currency VARCHAR(20) DEFAULT 'TRY',
        "assignedTo" VARCHAR(255),
        status VARCHAR(50),
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        "invoiceNo" VARCHAR(100),
        supplier VARCHAR(255),
        "invoiceDate" VARCHAR(100),
        amount NUMERIC,
        currency VARCHAR(20) DEFAULT 'TRY',
        "requestBarcode" VARCHAR(100),
        status VARCHAR(50),
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS guarantees (
        id SERIAL PRIMARY KEY,
        "letterNo" VARCHAR(100),
        bank VARCHAR(255),
        supplier VARCHAR(255),
        "guaranteeAmount" NUMERIC,
        currency VARCHAR(20) DEFAULT 'TRY',
        "issueDate" VARCHAR(100),
        "expiryDate" VARCHAR(100),
        status VARCHAR(50),
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(100),
        "user" VARCHAR(255),
        action VARCHAR(255),
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS regulations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rates (
        id SERIAL PRIMARY KEY,
        currency VARCHAR(20) UNIQUE NOT NULL,
        rate NUMERIC
      );

      CREATE TABLE IF NOT EXISTS tenders (
        id SERIAL PRIMARY KEY,
        "tenderNo" VARCHAR(100),
        title VARCHAR(255),
        "tenderDate" VARCHAR(100),
        "tenderTime" VARCHAR(50),
        status VARCHAR(100),
        unit VARCHAR(255),
        "relatedBarcode" VARCHAR(100),
        regulation VARCHAR(100),
        "estimatedAmount" NUMERIC(12,2),
        currency VARCHAR(10),
        "assignedTo" VARCHAR(100),
        "winnerSupplier" VARCHAR(255),
        "actualAmount" NUMERIC(12,2),
        notes TEXT
      );
    `);

    // Check if database is empty (users table has 0 rows)
    const userCheck = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Veritabanı boş, başlangıç verileri (Seed Data / Backup) yükleniyor...');
      
      const BACKUP_DIR = path.join(__dirname, 'backups');
      const backupFiles = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')) : [];
      
      if (backupFiles.length > 0) {
        backupFiles.sort().reverse();
        const latestBackupPath = path.join(BACKUP_DIR, backupFiles[0]);
        console.log(`📦 Yedek dosyasından veriler çekiliyor: ${backupFiles[0]}`);
        const seedData = JSON.parse(fs.readFileSync(latestBackupPath, 'utf8'));

        if (seedData.users) {
          for (const u of seedData.users) {
            await pool.query(
              'INSERT INTO users (name, title, role, "isActive", password) VALUES ($1, $2, $3, $4, $5)',
              [u.name, u.title, u.role, u.isActive !== false, u.password || '123456']
            );
          }
        }

        if (seedData.units) {
          for (const un of seedData.units) {
            const uName = typeof un === 'object' ? un.name : un;
            await pool.query('INSERT INTO units (name) VALUES ($1) ON CONFLICT DO NOTHING', [uName]);
          }
        }

        if (seedData.regulations) {
          for (const r of seedData.regulations) {
            const rName = typeof r === 'object' ? r.name : r;
            await pool.query('INSERT INTO regulations (name) VALUES ($1) ON CONFLICT DO NOTHING', [rName]);
          }
        }

        if (seedData.rates) {
          for (const rt of seedData.rates) {
            await pool.query('INSERT INTO rates (currency, rate) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rt.currency, rt.rate]);
          }
        }

        if (seedData.requests) {
          for (const req of seedData.requests) {
            delete req.id;
            const keys = Object.keys(req);
            const cols = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => sanitizeVal(req[k], k));
            await pool.query(`INSERT INTO requests (${cols}) VALUES (${placeholders})`, values);
          }
        }

        if (seedData.contracts) {
          for (const c of seedData.contracts) {
            delete c.id;
            const keys = Object.keys(c);
            const cols = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => sanitizeVal(c[k], k));
            await pool.query(`INSERT INTO contracts (${cols}) VALUES (${placeholders})`, values);
          }
        }

        if (seedData.invoices) {
          for (const inv of seedData.invoices) {
            delete inv.id;
            const keys = Object.keys(inv);
            const cols = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => sanitizeVal(inv[k], k));
            await pool.query(`INSERT INTO invoices (${cols}) VALUES (${placeholders})`, values);
          }
        }

        if (seedData.guarantees) {
          for (const g of seedData.guarantees) {
            delete g.id;
            const keys = Object.keys(g);
            const cols = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => sanitizeVal(g[k], k));
            await pool.query(`INSERT INTO guarantees (${cols}) VALUES (${placeholders})`, values);
          }
        }

        if (seedData.tenders) {
          for (const t of seedData.tenders) {
            delete t.id;
            const keys = Object.keys(t);
            const cols = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => sanitizeVal(t[k], k));
            await pool.query(`INSERT INTO tenders (${cols}) VALUES (${placeholders})`, values);
          }
        }

        if (seedData.logs) {
          for (const l of seedData.logs) {
            delete l.id;
            await pool.query(
              'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
              [l.timestamp, l.user, l.action, l.details]
            );
          }
        }
        console.log('✅ Tüm başlangıç verileri veritabanına aktarıldı!');
      } else {
        await pool.query(
          'INSERT INTO users (name, title, role, "isActive", password) VALUES ($1, $2, $3, $4, $5)',
          ['Cem TUR', 'Satınalma Mdr. Yrd.', 'ADMIN', true, '123456']
        );
      }
    }
  } catch (err) {
    console.error('Veritabanı ilklendirme hatası:', err.message);
  }
}

initDatabaseSchema().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(' 🚀 SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (REST API Modu)');
    console.log(` 🌐 Erişim: http://localhost:${PORT}/`);
    console.log('==========================================================');
  });
});
