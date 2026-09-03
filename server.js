// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sunucusu (Node.js)
//  Güvenlik & Yetkilendirme Güçlendirilmiş REST API Modülü
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const pg = require('pg');
const archiver = require('archiver');
const nodemailer = require('nodemailer');

// Load .env configuration file if present
const envFilePath = path.join(__dirname, '.env');
if (fs.existsSync(envFilePath)) {
  try {
    const envLines = fs.readFileSync(envFilePath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch (e) {
    console.error('.env okuma hatası:', e.message);
  }
}

// Parse NUMERIC / DECIMAL database fields as numbers instead of strings
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
const { Pool, Client } = pg;

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUP_DIR = path.join(__dirname, 'backups');

const JWT_SECRET = process.env.JWT_SECRET || 'pruni-satinalma-sec-key-2026-auth-jwt';

// ----------------------------------------------------
// 🛠️ OTOMATİK VERİTABANI OLUŞTURMA (AUTO-HEALING)
// ----------------------------------------------------
async function ensureDatabaseExists() {
  if (process.env.DB_USER && process.env.DB_USER !== 'postgres') {
    return; // Dedicated user connects directly to DB_NAME
  }
  const dbName = process.env.DB_NAME || 'satinalma_db';
  const defaultClient = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
  });

  try {
    await defaultClient.connect();
    const checkRes = await defaultClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (checkRes.rowCount === 0) {
      console.log(`ℹ️ "${dbName}" veritabanı bulunamadı, otomatik oluşturuluyor...`);
      await defaultClient.query(`CREATE DATABASE "${dbName}" WITH ENCODING = 'UTF8'`);
      console.log(`✅ "${dbName}" veritabanı başarıyla oluşturuldu!`);
    }
  } catch (err) {
    console.warn('Veritabanı varlık kontrolü uyarısı:', err.message);
  } finally {
    try { await defaultClient.end(); } catch (e) {}
  }
}

// PostgreSQL Bağlantı Havuzu
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'satinalma_db',
  password: process.env.DB_PASSWORD || '123456',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
});

pool.on('connect', (client) => {
  client.query("SET client_encoding = 'UTF8'");
});

pool.on('error', (err) => {
  console.error('Beklenmeyen veritabanı hatası', err);
});

// Bilinen ve İzin Verilen Veritabanı Tablo Sütunları (Güvenli Filtreleme)
const TABLE_COLUMNS = {
  users: ['name', 'title', 'role', 'isActive', 'password', 'phone', 'email', 'username'],
  requests: [
    'sequenceNo', 'requestBarcode', 'subject', 'unit', 'arrivalDate', 'requestDate',
    'assignedTo', 'priority', 'status', 'estimatedAmount', 'budgetAmount', 'actualAmount',
    'currency', 'supplier', 'orderBarcode', 'orderDate', 'estimatedDeliveryDate', 'regulation', 'description',
    'purchaseType', 'academicYear', 'multiSuppliers'
  ],
  contracts: [
    'contractNo', 'title', 'supplier', 'unit', 'assignedTo', 'startDate', 'endDate',
    'totalAmount', 'currency', 'exchangeRate', 'guaranteeAmount', 'guaranteeExpiry',
    'status', 'notes', 'description', 'academicYear'
  ],
  invoices: [
    'invoiceNo', 'supplier', 'invoiceDate', 'dueDate', 'amount', 'currency',
    'requestBarcode', 'relatedBarcode', 'status', 'paymentStatus', 'accountingDeliveryDate',
    'paymentDate', 'notes', 'description', 'academicYear'
  ],
  guarantees: [
    'letterNo', 'bank', 'bankName', 'type', 'title', 'supplier', 'unit',
    'amount', 'guaranteeAmount', 'currency', 'issueDate', 'expiryDate',
    'storageLocation', 'status', 'notes', 'description'
  ],
  logs: ['timestamp', 'user', 'action', 'details'],
  units: ['name', 'email'],
  regulations: ['name'],
  tenders: [
    'tenderNo', 'title', 'tenderDate', 'tenderTime', 'status', 'unit',
    'relatedBarcode', 'regulation', 'estimatedAmount', 'currency',
    'assignedTo', 'winnerSupplier', 'actualAmount', 'notes'
  ],
  documents: [
    'entityType', 'entityId', 'fileName', 'storedFileName', 'fileSize',
    'fileType', 'category', 'description', 'uploadedBy', 'uploadedAt'
  ],
  vendor_ratings: [
    'supplierName', 'purchaseType', 'requestId', 'speedScore', 'qualityScore',
    'complianceScore', 'communicationScore', 'overallScore', 'reviewNotes',
    'ratedBy', 'ratedAt'
  ],
  suppliers: ['name', 'taxNumber', 'taxOffice', 'category', 'contactPerson', 'email', 'phone', 'address', 'status', 'notes'],
  settings: ['key', 'value'],
  rates: ['currency', 'rate', 'lastUpdated']
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
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
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
};

// İzin verilen evrak dosya uzantıları (Güvenlik Beyaz Listesi)
const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.txt', '.zip', '.csv', '.rar', '.7z', '.webp', '.msg', '.eml', '.rtf', '.odt', '.ods'];

// ----------------------------------------------------
// 🔐 KRİPTO VE TOKEN YÖNETİMİ
// ----------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 10000, 64, 'sha512').toString('hex');
  return `$pbkdf2$10000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('$pbkdf2$')) {
    // Düz metin geriye dönük uyumluluk (migration öncesi)
    return String(storedHash) === String(password);
  }
  try {
    const parts = storedHash.split('$');
    const iterations = parseInt(parts[2], 10);
    const salt = parts[3];
    const originalHash = parts[4];
    const verifyHash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
    return originalHash === verifyHash;
  } catch (e) {
    return false;
  }
}

function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 gün geçerli
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    name: user.name,
    role: user.role || 'STAFF',
    title: user.title || '',
    email: user.email || '',
    exp
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null; // Süresi dolmuş token
    return data;
  } catch (e) {
    return null;
  }
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  return verifyToken(token);
}

// ----------------------------------------------------
// 🛡️ RATE LIMITING (KABA KUVVET KORUMASI)
// ----------------------------------------------------
const rateLimitMap = new Map();
function checkRateLimit(key, maxRequests = 15, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + windowMs;
  }
  entry.count++;
  rateLimitMap.set(key, entry);
  return entry.count <= maxRequests;
}

// Periyodik temizlik (Bellek şişmesini engellemek için)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetTime) rateLimitMap.delete(k);
  }
}, 5 * 60 * 1000);

// ----------------------------------------------------
// 📥 GÜVENLİ BODY OKUYUCU (MAX BODY LIMIT - 100MB)
// ----------------------------------------------------
function readBody(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Payload Too Large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function getTableData(tableName) {
  if (tableName === 'users') {
    // Şifre alanını ASLA API ile açık olarak döndürme
    const res = await pool.query('SELECT id, name, title, role, "isActive", email FROM users ORDER BY id ASC');
    return res.rows;
  }
  if (tableName === 'vendor_ratings') {
    const res = await pool.query('SELECT * FROM vendor_ratings ORDER BY id ASC');
    return res.rows.map(r => ({
      id: r.id,
      supplierName: r.supplierName || r.suppliername || r.supplier || '',
      purchaseType: r.purchaseType || r.purchasetype || 'MAL',
      requestId: r.requestId || r.requestid || null,
      qualityScore: parseFloat(r.qualityScore || r.qualityscore || 5),
      speedScore: parseFloat(r.speedScore || r.speedscore || 5),
      complianceScore: parseFloat(r.complianceScore || r.compliancescore || 5),
      communicationScore: parseFloat(r.communicationScore || r.communicationscore || 5),
      overallScore: parseFloat(r.overallScore || r.overallscore || 5),
      reviewNotes: r.reviewNotes || r.reviewnotes || '',
      ratedBy: r.ratedBy || r.ratedby || '',
      ratedAt: r.ratedAt || r.ratedat || ''
    }));
  }
  if (tableName === 'settings') {
    const res = await pool.query('SELECT * FROM settings');
    return res.rows;
  }
  const res = await pool.query(`SELECT * FROM ${tableName} ORDER BY id ASC`);
  return res.rows;
}

function sanitizeVal(val, k) {
  if (val === undefined || val === null || (typeof val === 'number' && isNaN(val))) return null;
  if (typeof val === 'string' && val.trim() === '' && ['estimatedAmount', 'budgetAmount', 'actualAmount', 'totalAmount', 'amount', 'guaranteeAmount', 'sequenceNo', '_diffDays', 'exchangeRate', 'speedScore', 'qualityScore', 'complianceScore', 'communicationScore', 'overallScore'].includes(k)) {
    return null;
  }
  return val;
}

// ----------------------------------------------------
// 🗄️ DATABASE BACKUP ENGINE HELPERS
// ----------------------------------------------------
async function exportAllDatabaseData() {
  const tables = ['users', 'units', 'regulations', 'rates', 'requests', 'contracts', 'invoices', 'guarantees', 'tenders', 'documents', 'logs', 'vendor_ratings', 'settings', 'suppliers'];
  const snapshot = { exportedAt: new Date().toISOString(), version: '2.1.0' };
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT * FROM ${t} ORDER BY id ASC`);
      snapshot[t] = r.rows;
    } catch (e) {
      snapshot[t] = [];
    }
  }
  return snapshot;
}

async function createBackupFile(isAuto = false) {
  const data = await exportAllDatabaseData();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const prefix = isAuto ? 'auto_backup' : 'manual_backup';
  const filename = `${prefix}_${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`🗄️ Veritabanı yedeği alındı: ${filename}`);

  // Retain only latest 30 backups to prevent disk bloat
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    if (files.length > 30) {
      files.sort();
      const toDelete = files.slice(0, files.length - 30);
      for (const df of toDelete) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, df)); } catch(e) {}
      }
    }
  } catch (e) {}

  return { filename, size: fs.statSync(filePath).size, createdAt: now.toISOString(), isAuto };
}

// Scheduled Daily Backup (checks hourly)
let lastAutoBackupDate = '';
setInterval(async () => {
  const todayStr = new Date().toISOString().split('T')[0];
  if (lastAutoBackupDate !== todayStr) {
    lastAutoBackupDate = todayStr;
    try {
      await createBackupFile(true);
    } catch (e) {
      console.error('Otomatik yedek alma hatası:', e.message);
    }
  }
}, 60 * 60 * 1000);

// ----------------------------------------------------
// 💱 CANLI DÖVİZ KURLARI SERVİSİ (TCMB & GLOBAL FX BACKUP)
// ----------------------------------------------------
function fetchJsonUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchBackupRates() {
  try {
    const usdData = await fetchJsonUrl('https://open.er-api.com/v6/latest/USD');
    const eurData = await fetchJsonUrl('https://open.er-api.com/v6/latest/EUR');
    if (usdData && usdData.rates && usdData.rates.TRY && eurData && eurData.rates && eurData.rates.TRY) {
      return {
        USD: parseFloat(usdData.rates.TRY.toFixed(4)),
        EUR: parseFloat(eurData.rates.TRY.toFixed(4)),
        source: 'Global FX (Yedek Döviz Kaynağı)'
      };
    }
  } catch (e) {
    console.warn('Yedek döviz servisi hatası:', e.message);
  }
  return null;
}

async function fetchTCMBRates() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.tcmb.gov.tr',
      path: '/kurlar/today.xml',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const extractRate = (xml, code) => {
            const regexBlock = new RegExp(`<Currency[^>]+(?:CurrencyCode|Kod)=["']${code}["'][\\s\\S]*?<\\/Currency>`, 'i');
            const blockMatch = xml.match(regexBlock);
            if (!blockMatch) return null;
            const block = blockMatch[0];
            const rateMatch = block.match(/<ForexSelling>([0-9.,]+)<\/ForexSelling>/i) ||
                              block.match(/<ForexBuying>([0-9.,]+)<\/ForexBuying>/i) ||
                              block.match(/<BanknoteSelling>([0-9.,]+)<\/BanknoteSelling>/i);
            if (!rateMatch) return null;
            const num = parseFloat(rateMatch[1].replace(',', '.'));
            return isNaN(num) ? null : num;
          };

          let usdRate = extractRate(data, 'USD');
          let eurRate = extractRate(data, 'EUR');
          let source = 'TCMB (Türkiye Cumhuriyet Merkez Bankası)';

          if (!usdRate || !eurRate) {
            const backup = await fetchBackupRates();
            if (backup) {
              usdRate = usdRate || backup.USD;
              eurRate = eurRate || backup.EUR;
              source = backup.source;
            }
          }

          if (!usdRate || !eurRate) {
            // DB'deki mevcut kurları al
            const currentDbRates = await pool.query('SELECT currency, rate FROM rates').catch(() => ({ rows: [] }));
            const map = {};
            if (currentDbRates && currentDbRates.rows) {
              currentDbRates.rows.forEach(r => map[r.currency] = parseFloat(r.rate));
            }
            usdRate = usdRate || map.USD || 47.89;
            eurRate = eurRate || map.EUR || 55.54;
          }

          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

          await pool.query(`
            INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('USD', $1, $2)
            ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
          `, [usdRate, dateStr]).catch(e => console.error('USD rate DB save err:', e.message));

          await pool.query(`
            INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('EUR', $1, $2)
            ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
          `, [eurRate, dateStr]).catch(e => console.error('EUR rate DB save err:', e.message));

          console.log(`💱 Canlı Kurlar Güncellendi: USD=${usdRate} ₺, EUR=${eurRate} ₺ (${dateStr}) [${source}]`);

          resolve({
            success: true,
            USD: usdRate,
            EUR: eurRate,
            lastUpdated: dateStr,
            source: source
          });
        } catch (err) {
          console.error('Kurlar ayrıştırma hatası:', err.message);
          resolve({ success: false, error: err.message });
        }
      });
    });

    req.on('timeout', async () => {
      req.destroy();
      console.warn('TCMB bağlantı zaman aşımı, yedek kaynağa geçiliyor...');
      const backup = await fetchBackupRates();
      if (backup) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        await pool.query(`
          INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('USD', $1, $2)
          ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
        `, [backup.USD, dateStr]).catch(() => {});
        await pool.query(`
          INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('EUR', $1, $2)
          ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
        `, [backup.EUR, dateStr]).catch(() => {});
        resolve({
          success: true,
          USD: backup.USD,
          EUR: backup.EUR,
          lastUpdated: dateStr,
          source: backup.source
        });
      } else {
        resolve({ success: false, error: 'Merkez Bankası ve yedek döviz servisine bağlanılamadı.' });
      }
    });

    req.on('error', async (err) => {
      console.warn('TCMB bağlantı hatası:', err.message, 'yedek kaynağa geçiliyor...');
      const backup = await fetchBackupRates();
      if (backup) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        await pool.query(`
          INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('USD', $1, $2)
          ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
        `, [backup.USD, dateStr]).catch(() => {});
        await pool.query(`
          INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('EUR', $1, $2)
          ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
        `, [backup.EUR, dateStr]).catch(() => {});
        resolve({
          success: true,
          USD: backup.USD,
          EUR: backup.EUR,
          lastUpdated: dateStr,
          source: backup.source
        });
      } else {
        resolve({ success: false, error: err.message });
      }
    });

    req.end();
  });
}

// Otomatik Kurları Periyodik Güncelle (Her 4 saatte bir)
setInterval(() => {
  fetchTCMBRates().catch(e => console.error('Otomatik kur güncelleme hatası:', e.message));
}, 4 * 60 * 60 * 1000);

// ----------------------------------------------------
// 📧 SMTP HELPER FUNCTIONS
// ----------------------------------------------------
async function getSmtpConfig() {
  try {
    const res = await pool.query("SELECT value FROM settings WHERE key = 'smtp_config'");
    if (res.rowCount > 0 && res.rows[0].value) {
      return JSON.parse(res.rows[0].value);
    }
  } catch (e) {}
  return null;
}

function createSmtpTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: parseInt(config.port, 10) || 587,
    secure: config.secure === true || config.port == 465,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

function getAppBaseUrl(cfg) {
  if (process.env.APP_URL && process.env.APP_URL.trim()) {
    return process.env.APP_URL.trim().replace(/\/$/, '');
  }
  if (cfg && cfg.appUrl && cfg.appUrl.trim()) {
    return cfg.appUrl.trim().replace(/\/$/, '');
  }
  return 'http://109.236.48.236';
}

// ----------------------------------------------------
// 📧 BİRİM OTOMATİK TALEP SÜREÇ BİLDİRİM FONKSİYONU
// ----------------------------------------------------
async function notifyUnitOnDemandEvent(demand, eventType, oldStatus = null) {
  if (!demand || !demand.unit) return;
  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.isEnabled || !cfg.host || !cfg.user) return;

    const unitRes = await pool.query('SELECT email FROM units WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [demand.unit]);
    const unitEmail = unitRes.rows[0]?.email;
    if (!unitEmail || !unitEmail.includes('@')) {
      console.log(`ℹ️ "${demand.unit}" birimi için kayıtlı geçerli bir e-posta bulunamadı, bildirim gönderilmedi.`);
      return;
    }

    let expertInfo = demand.assignedTo || 'Satınalma Uzmanı';
    if (demand.assignedTo && demand.assignedTo !== 'Henüz Atanmadı') {
      const userRes = await pool.query('SELECT name, title, email, phone FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [demand.assignedTo]);
      if (userRes.rowCount > 0) {
        const u = userRes.rows[0];
        expertInfo = `${u.name} (${u.title || 'Satınalma Uzmanı'}${u.phone ? ` - Dahili: ${u.phone}` : ''}${u.email ? ` - E-posta: ${u.email}` : ''})`;
      }
    }

    const barcode = demand.requestBarcode || demand.id;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let subject = '';
    let headerTitle = '';
    let badgeColor = '#3b82f6';
    let messageText = '';

    if (eventType === 'CREATED') {
      subject = `📋 Talebiniz Alındı — #${barcode} (${demand.subject || 'Satınalma Talebi'})`;
      headerTitle = 'Talebiniz Satınalma Müdürlüğü\'ne Ulaştı';
      badgeColor = '#3b82f6';
      messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına oluşturulan <strong>#${barcode}</strong> numaralı satınalma talebiniz sistemimize başarıyla kaydedilmiş ve işleme alınmıştır. Talebinizin süreç adımları uzmanımız tarafından takip edilmektedir.`;
    } else if (eventType === 'STATUS_CHANGED') {
      const status = demand.status || 'İşlemde';
      if (status === 'Tamamlandı') {
        badgeColor = '#10b981';
        subject = `✅ Satınalma Talebiniz Tamamlandı — #${barcode} (${demand.subject || ''})`;
        headerTitle = `Talebiniz Başarıyla Tamamlandı`;
        messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebinizin tüm teslimat ve fatura süreçleri tamamlanmıştır.`;
      } else if (status === 'Revize İstendi') {
        badgeColor = '#ea580c';
        subject = `⚠️ Satınalma Talebiniz İçin Revize İsteği — #${barcode} (${demand.subject || ''})`;
        headerTitle = `Talep İçin Revize / Ek Bilgi İstendi`;
        messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebiniz satınalma ekibimiz tarafından incelenmiş ve işleme devam edilebilmesi için <strong>revize / ek teknik şartname bilgisi</strong> talep edilmiştir.<br><br>
        ${demand.description ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-left:4px solid #ea580c; border-radius:6px; padding:12px; margin:12px 0; font-size:0.88rem; color:#9a3412;"><strong>📝 Satınalma Uzmanının Revize Notu / Eksikler:</strong><br>${demand.description}</div>` : ''}
        Lütfen talep edilen eksik belgeleri veya bilgileri güncelleyerek satınalma sorumlusu ile iletişime geçiniz.`;
      } else if (status === 'Reddedildi' || status === 'İptal') {
        badgeColor = '#ef4444';
        subject = `❌ Talep İptal / Reddedildi: #${barcode} (${demand.subject || ''})`;
        headerTitle = `Talep Durumu: ${status}`;
        messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebiniz <strong>${status}</strong> durumuna alınmıştır.<br><br>
        ${demand.description ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:6px; padding:12px; margin:12px 0; font-size:0.88rem; color:#991b1b;"><strong>Açıklama:</strong><br>${demand.description}</div>` : ''}`;
      } else if (status === 'Sipariş Verildi' || demand.orderBarcode) {
        badgeColor = '#8b5cf6';
        subject = `📦 Sipariş Verildi: #${barcode} (${demand.subject || ''})`;
        headerTitle = `Sipariş Sürecine Geçildi`;
        messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebiniz için tedarikçi firmaya resmi sipariş geçilmiştir.`;
      } else {
        badgeColor = '#f59e0b';
        subject = `🔄 Talep Durumu Güncellendi: [${status}] — #${barcode} (${demand.subject || ''})`;
        headerTitle = `Talep Durumu: ${status}`;
        messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebinizin süreci güncellenmiştir.<br><br>
        Önceki Durum: <strong>${oldStatus || 'Açık'}</strong> ➔ Güncel Durum: <strong style="color:${badgeColor}; font-size:1.05rem;">${status}</strong>`;
      }
    }

    console.log(`✉️ "${demand.unit}" birimine durum bildirimi hazırlanıyor: [${demand.status || eventType}] -> ${unitEmail}`);

    const orderSection = demand.orderBarcode ? `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-top:14px;">
        <div style="font-weight:700; color:#1e293b; margin-bottom:6px; font-size:0.9rem;">📦 Sipariş Bilgileri:</div>
        <div style="font-size:0.85rem; color:#475569; line-height:1.6;">
          <div>• <strong>Sipariş No / Barkod:</strong> #${demand.orderBarcode}</div>
          ${demand.orderDate ? `<div>• <strong>Sipariş Tarihi:</strong> ${demand.orderDate}</div>` : ''}
          ${demand.supplier ? `<div>• <strong>Tedarikçi Firma:</strong> ${demand.supplier}</div>` : ''}
          ${demand.actualAmount ? `<div>• <strong>Tutar:</strong> ${Number(demand.actualAmount).toLocaleString('tr-TR')} ${demand.currency || 'TRY'}</div>` : ''}
        </div>
      </div>
    ` : '';

    let ratingSection = '';
    if (demand.status === 'Tamamlandı' && demand.supplier) {
      const pType = demand.purchaseType || 'MAL';
      const typeLabel = pType === 'HIZMET' ? 'Hizmet' : 'Mal / Ürün';
      const baseUrl = getAppBaseUrl(cfg);
      const rateUrl = `${baseUrl}/rate-vendor.html?reqId=${demand.id || ''}&barcode=${encodeURIComponent(barcode)}&supplier=${encodeURIComponent(demand.supplier || '')}&unit=${encodeURIComponent(demand.unit || '')}&subject=${encodeURIComponent(demand.subject || '')}&type=${encodeURIComponent(pType)}`;
      ratingSection = `
        <div style="margin-top: 18px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 0.95rem; font-weight: 700; color: #166534; margin-bottom: 4px;">
            ⭐ Teslim Alınan ${typeLabel} Alımını Değerlendirin
          </div>
          <p style="font-size: 0.82rem; color: #15803d; margin: 0 0 12px 0; line-height: 1.45;">
            Sayın yetkili, <strong>${demand.supplier}</strong> firmasından teslim aldığınız ${typeLabel.toLowerCase()} sürecinin kalitesini ve teslimatını 1 tıkla puanlayarak üniversite tedarikçi karnesine katkıda bulunabilirsiniz.
          </p>
          <a href="${rateUrl}" target="_blank" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 9px 22px; border-radius: 6px; font-weight: 700; font-size: 0.88rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ⭐ Tedarikçiyi Puanla (1 Tıkla)
          </a>
        </div>
      `;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 24px; color: #ffffff; text-align: left; border-bottom: 3px solid #f59e0b;">
          <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">PİRİ REİS ÜNİVERSİTESİ</div>
          <div style="font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em;">Satınalma Müdürlüğü</div>
        </div>
        
        <div style="padding: 24px 24px 16px 24px; color: #1e293b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
            <h2 style="margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 700;">${headerTitle}</h2>
            <span style="background: ${badgeColor}; color: #ffffff; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; display: inline-block;">${demand.status || 'Açık'}</span>
          </div>

          <p style="font-size: 0.92rem; line-height: 1.6; color: #334155; margin-top: 0;">${messageText}</p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.86rem; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b; width: 36%;">Talep Barkod / No:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #1e3a8a; font-family: monospace; font-size: 0.95rem;">#${barcode}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Talep Konusu:</td>
                <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${demand.subject || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">İlgili Birim:</td>
                <td style="padding: 10px 14px; color: #0f172a;">${demand.unit}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Geliş / Talep Tarihi:</td>
                <td style="padding: 10px 14px; color: #0f172a;">${demand.arrivalDate || demand.requestDate || dateStr}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Sorumlu Uzman:</td>
                <td style="padding: 10px 14px; color: #1e3a8a; font-weight: 600;">${expertInfo}</td>
              </tr>
              ${demand.description ? `
              <tr>
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Açıklama / Not:</td>
                <td style="padding: 10px 14px; color: #334155;">${demand.description}</td>
              </tr>` : ''}
            </tbody>
          </table>

          ${orderSection}
          ${ratingSection}

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #64748b; line-height: 1.5;">
            💡 <em>Bu bilgilendirme e-postası Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından otomatik olarak gönderilmiştir.</em>
          </div>
        </div>
      </div>
    `;

    const transporter = createSmtpTransporter(cfg);
    await transporter.sendMail({
      from: `"${cfg.fromName || 'Piri Reis Üni. Satınalma'}" <${cfg.from || cfg.user}>`,
      to: unitEmail,
      subject: subject,
      html: html
    });

    await pool.query(
      'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
      [dateStr, 'Sistem (E-Posta Servisi)', 'Birim Bilgilendirme E-Postası', `Talep #${barcode} için "${demand.unit}" birimine (${unitEmail}) e-posta gönderildi. [${eventType}]`]
    ).catch(() => {});

    console.log(`✉️ Birim E-Postası Gönderildi -> ${demand.unit} (${unitEmail}) [${eventType} - #${barcode}]`);
  } catch (err) {
    console.error('Birim bilgilendirme e-posta hatası:', err.message);
  }
}

// ----------------------------------------------------
// 📧 SATINALMA PERSONELİ İŞ ATAMA & DEVİR BİLDİRİM FONKSİYONU
// ----------------------------------------------------
async function notifyStaffOnAssignment(demand, eventType, oldAssignedTo = null) {
  if (!demand || !demand.assignedTo || demand.assignedTo === 'Henüz Atanmadı') return;
  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.isEnabled || !cfg.host || !cfg.user) return;

    const userRes = await pool.query(
      'SELECT name, email FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND "isActive" = true',
      [demand.assignedTo]
    );
    const staff = userRes.rows[0];
    if (!staff || !staff.email || !staff.email.includes('@')) {
      console.log(`ℹ️ Personel "${demand.assignedTo}" için kayıtlı e-posta bulunamadı, görev bildirim maili gönderilmedi.`);
      return;
    }

    const barcode = demand.requestBarcode || demand.id;
    const baseUrl = getAppBaseUrl(cfg);
    const appDirectLink = `${baseUrl}/#request/${demand.id || ''}`;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let subject = '';
    let headerTitle = '';
    let messageText = '';
    let badgeColor = '#3b82f6';

    if (eventType === 'ASSIGNED') {
      subject = `🎯 Yeni Talep Size Atandı: #${barcode} — ${demand.unit || ''} (${demand.subject || ''})`;
      headerTitle = 'Yeni Satınalma Talebi Size Atandı';
      badgeColor = '#2563eb';
      messageText = `Sayın <strong>${staff.name}</strong>,<br><br>Sistemimize yeni kaydedilen <strong>#${barcode}</strong> numaralı talep takibiniz için tarafınıza atanmıştır.`;
    } else if (eventType === 'DELEGATED') {
      subject = `🔄 Talep Devri: #${barcode} Size Aktarıldı — ${demand.unit || ''} (${demand.subject || ''})`;
      headerTitle = 'Talep Tarafınıza Devredildi';
      badgeColor = '#8b5cf6';
      messageText = `Sayın <strong>${staff.name}</strong>,<br><br><strong>#${barcode}</strong> numaralı satınalma talebi <strong>${oldAssignedTo || 'Önceki Uzman'}</strong> üzerinden devralınarak tarafınıza aktarılmıştır.`;
    } else {
      return;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 24px; color: #ffffff; text-align: left; border-bottom: 3px solid #f59e0b;">
          <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">PİRİ REİS ÜNİVERSİTESİ</div>
          <div style="font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em;">Satınalma Takip Sistemi — Görev Ataması</div>
        </div>
        
        <div style="padding: 24px; color: #1e293b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
            <h2 style="margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 700;">${headerTitle}</h2>
            <span style="background: ${badgeColor}; color: #ffffff; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">${demand.priority || 'Normal'} Öncelik</span>
          </div>

          <p style="font-size: 0.92rem; line-height: 1.6; color: #334155; margin-top: 0;">${messageText}</p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.86rem; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b; width: 36%;">Talep Barkod / No:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #1e3a8a; font-family: monospace; font-size: 0.95rem;">#${barcode}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Talep Eden Birim:</td>
                <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${demand.unit || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Talep Konusu:</td>
                <td style="padding: 10px 14px; color: #0f172a; font-weight: 600;">${demand.subject || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Geliş / Talep Tarihi:</td>
                <td style="padding: 10px 14px; color: #0f172a;">${demand.arrivalDate || demand.requestDate || dateStr}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Tahmini Bütçe:</td>
                <td style="padding: 10px 14px; color: #0f172a; font-weight: 700;">${Number(demand.estimatedAmount || demand.budgetAmount || 0).toLocaleString('tr-TR')} ${demand.currency || 'TRY'}</td>
              </tr>
              ${demand.description ? `
              <tr>
                <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Talep Notu / Açıklama:</td>
                <td style="padding: 10px 14px; color: #334155;">${demand.description}</td>
              </tr>` : ''}
            </tbody>
          </table>

          <div style="margin-top: 24px; text-align: center;">
            <a href="${appDirectLink}" target="_blank" style="display: inline-block; background: #1e3a8a; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 700; font-size: 0.9rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              🚀 Talebi İncele & Siparişe Dönüştür
            </a>
          </div>

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #64748b; line-height: 1.5;">
            💡 <em>Bu görevlendirme e-postası Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından otomatik olarak iletilmiştir.</em>
          </div>
        </div>
      </div>
    `;

    const transporter = createSmtpTransporter(cfg);
    await transporter.sendMail({
      from: `"${cfg.fromName || 'Piri Reis Üni. Satınalma'}" <${cfg.from || cfg.user}>`,
      to: staff.email,
      subject: subject,
      html: html
    });

    console.log(`✉️ Satınalma Uzmanı Görev E-Postası Gönderildi -> ${staff.name} (${staff.email}) [${eventType} - #${barcode}]`);
  } catch (err) {
    console.error('Personel görevlendirme e-posta hatası:', err.message);
  }
}

async function sendRatingReminderEmail(demand) {
  const cfg = await getSmtpConfig();
  if (!cfg || !cfg.isEnabled || !cfg.host) {
    throw new Error('SMTP e-posta servisi aktif değil veya yapılandırılmamış.');
  }

  if (!demand || !demand.unit) {
    throw new Error('Talep veya birim bilgisi eksik.');
  }

  const unitRes = await pool.query('SELECT email FROM units WHERE name = $1 LIMIT 1', [demand.unit]).catch(() => null);
  const unitEmail = unitRes?.rows[0]?.email;
  if (!unitEmail) {
    throw new Error(`"${demand.unit}" birimine ait kayıtlı bir e-posta adresi bulunamadı.`);
  }

  const barcode = demand.requestBarcode || demand.id;
  const pType = demand.purchaseType || 'MAL';
  const typeLabel = pType === 'HIZMET' ? 'Hizmet' : 'Mal / Ürün';
  const baseUrl = getAppBaseUrl(cfg);
  const rateUrl = `${baseUrl}/rate-vendor.html?reqId=${demand.id || ''}&barcode=${encodeURIComponent(barcode)}&supplier=${encodeURIComponent(demand.supplier || '')}&unit=${encodeURIComponent(demand.unit || '')}&subject=${encodeURIComponent(demand.subject || '')}&type=${encodeURIComponent(pType)}`;

  const dateStr = new Date().toLocaleDateString('tr-TR');
  const subject = `🔔 Hatırlatma: ${demand.unit} — Tedarikçi Değerlendirmesi (#${barcode})`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 24px; color: #ffffff; text-align: left; border-bottom: 3px solid #f59e0b;">
        <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">PİRİ REİS ÜNİVERSİTESİ</div>
        <div style="font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em;">Satınalma Müdürlüğü — Kalite & Tedarikçi Yönetimi</div>
      </div>
      
      <div style="padding: 24px 24px 16px 24px; color: #1e293b;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <h2 style="margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 700;">🔔 Tedarikçi Değerlendirme Hatırlatması</h2>
          <span style="background: #f59e0b; color: #ffffff; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; display: inline-block;">Geri Bildirim Bekleniyor</span>
        </div>

        <p style="font-size: 0.92rem; line-height: 1.6; color: #334155; margin-top: 0;">
          Sayın <strong>${demand.unit}</strong> Yetkilisi,<br><br>
          Satınalma süreci tamamlanan ve teslimatı gerçekleştirilen <strong>#${barcode}</strong> nolu alımınız için memnuniyet değerlendirmeniz henüz tarafımıza ulaşmamıştır.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.86rem; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #64748b; width: 36%;">Talep Barkod / No:</td>
              <td style="padding: 10px 14px; font-weight: 700; color: #1e3a8a; font-family: monospace; font-size: 0.95rem;">#${barcode}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Talep Konusu:</td>
              <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${demand.subject || '-'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Tedarikçi Firma:</td>
              <td style="padding: 10px 14px; font-weight: 700; color: #1e3a8a;">${demand.supplier || 'Belirtilmedi'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Alım Türü:</td>
              <td style="padding: 10px 14px; color: #0f172a;">${typeLabel} Alımı</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 18px; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1px solid #fde68a; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 0.95rem; font-weight: 700; color: #b45309; margin-bottom: 4px;">
            ⭐ 1 Dakikanızı Ayırarak Tedarikçiyi Puanlayın
          </div>
          <p style="font-size: 0.82rem; color: #92400e; margin: 0 0 12px 0; line-height: 1.45;">
            Üniversitemizin tedarikçi kalite güvencesi ve sonraki alımlarda doğru firmaların seçilebilmesi için değerli görüşleriniz büyük önem taşımaktadır.
          </p>
          <a href="${rateUrl}" target="_blank" style="display: inline-block; background: #d97706; color: #ffffff; text-decoration: none; padding: 9px 22px; border-radius: 6px; font-weight: 700; font-size: 0.88rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ⭐ Tedarikçiyi Şimdi Puanla (1 Tıkla)
          </a>
        </div>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #64748b; line-height: 1.5;">
          💡 <em>Bu hatırlatma e-postası Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından gönderilmiştir.</em>
        </div>
      </div>
    </div>
  `;

  const transporter = createSmtpTransporter(cfg);
  await transporter.sendMail({
    from: `"${cfg.fromName || 'Piri Reis Üni. Satınalma'}" <${cfg.from || cfg.user}>`,
    to: unitEmail,
    subject: subject,
    html: html
  });

  await pool.query(
    'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
    [dateStr, 'Sistem (E-Posta Servisi)', 'Puanlama Hatırlatma E-Postası', `Talep #${barcode} için "${demand.unit}" birimine (${unitEmail}) puanlama hatırlatma e-postası gönderildi.`]
  ).catch(() => {});

  console.log(`🔔 Puanlama Hatırlatma E-Postası Gönderildi -> ${demand.unit} (${unitEmail}) [#${barcode}]`);
}

// ----------------------------------------------------
// ⏳ OTOMATİK SÖZLEŞME BİTİŞ & VADE UYARI MOTORU
// ----------------------------------------------------
async function notifyContractExpiry(contract, daysLeft) {
  if (!contract || !contract.endDate) return;
  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.isEnabled || !cfg.host || !cfg.user) return;

    // İlgili birim e-postası
    let unitEmail = null;
    if (contract.unit) {
      const unitRes = await pool.query('SELECT email FROM units WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [contract.unit]).catch(() => null);
      unitEmail = unitRes?.rows[0]?.email;
    }

    // İlgili uzman e-postası
    let expertEmail = null;
    let expertInfo = contract.assignedTo || 'Satınalma Uzmanı';
    if (contract.assignedTo && contract.assignedTo !== 'Henüz Atanmadı') {
      const userRes = await pool.query('SELECT name, title, email, phone FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [contract.assignedTo]).catch(() => null);
      if (userRes && userRes.rowCount > 0) {
        const u = userRes.rows[0];
        expertEmail = u.email;
        expertInfo = `${u.name} (${u.title || 'Satınalma Uzmanı'}${u.phone ? ` - Dahili: ${u.phone}` : ''}${u.email ? ` - ${u.email}` : ''})`;
      }
    }

    // Hedef alıcılar
    const recipients = [];
    if (unitEmail && unitEmail.includes('@')) recipients.push(unitEmail);
    if (expertEmail && expertEmail.includes('@') && !recipients.includes(expertEmail)) recipients.push(expertEmail);

    if (recipients.length === 0) {
      console.log(`ℹ️ Sözleşme #${contract.contractNo} (${contract.unit}) için alıcı e-posta adresi bulunamadı.`);
      return;
    }

    const badgeColor = daysLeft <= 7 ? '#ef4444' : (daysLeft <= 15 ? '#f97316' : (daysLeft <= 30 ? '#eab308' : '#3b82f6'));
    const urgencyLabel = daysLeft <= 7 ? '🚨 ACİL SON UYARI' : (daysLeft <= 15 ? '⚠️ ACİL HATIRLATMA' : '⏳ SÖZLEŞME BİTİŞ UYARISI');
    const subject = `⏳ Sözleşme Bitiş Uyarısı (${daysLeft} Gün Kaldı) — #${contract.contractNo} (${contract.title || contract.supplier || 'Sözleşme'})`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 24px; color: #ffffff; text-align: left; border-bottom: 3px solid ${badgeColor};">
          <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">PİRİ REİS ÜNİVERSİTESİ</div>
          <div style="font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em;">Satınalma Müdürlüğü — Sözleşme Vade Takip Sistemi</div>
        </div>
        
        <div style="padding: 24px; color: #1e293b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
            <h2 style="margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 700;">${urgencyLabel}</h2>
            <span style="background: ${badgeColor}; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 700;">${daysLeft} Gün Kaldı</span>
          </div>

          <p style="font-size: 0.92rem; line-height: 1.6; color: #334155; margin-top: 0;">
            Sayın İlgili,<br><br>
            <strong>${contract.unit || 'İlgili Birim'}</strong> biriminizin kullanımında olan <strong>#${contract.contractNo}</strong> numaralı ve <strong>"${contract.title}"</strong> başlıklı sözleşmenin yürürlük süresinin dolmasına <strong>${daysLeft} gün</strong> kalmıştır.<br><br>
            Hizmet veya mal tedarikinde herhangi bir kesinti yaşanmaması, yeni ihale / sözleşme uzatım süreçlerinin zamanında başlatılabilmesi için lütfen sorumlu satınalma uzmanımızla irtibata geçerek gerekiyorsa yeni satınalma talebinizi sisteme iletiniz.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.86rem; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600; width: 35%;">Sözleşme No / Kod:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #1e3a8a; font-family: monospace;">#${contract.contractNo}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Sözleşme Konusu / Başlık:</td>
                <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${contract.title}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Tedarikçi / Yüklenici Firma:</td>
                <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${contract.supplier || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">İlgili Birim:</td>
                <td style="padding: 10px 14px; color: #0f172a;">${contract.unit || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Sözleşme Başlangıç - Bitiş:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #0f172a;">${contract.startDate || '-'} ➔ <span style="color:#ef4444;">${contract.endDate}</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Toplam Sözleşme Bedeli:</td>
                <td style="padding: 10px 14px; font-weight: 700; color: #166534; font-family: monospace;">${contract.totalAmount ? Number(contract.totalAmount).toLocaleString('tr-TR') + ' ' + (contract.currency || 'TRY') : '-'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Takip Eden Satınalma Uzmanı:</td>
                <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${expertInfo}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 20px; padding: 12px; background: #fff7ed; border-left: 4px solid #f97316; border-radius: 4px; font-size: 0.82rem; color: #9a3412; line-height: 1.5;">
            💡 <strong>Bilgi Notu:</strong> 4734 Sayılı Kamu İhale Kanunu ve Üniversite Satınalma Yönetmeliği gereği yeni ihale/sipariş hazırlıklarının en az 30 gün önceden başlatılması önerilmektedir.
          </div>
        </div>

        <div style="background: #f8fafc; padding: 14px 24px; text-align: center; font-size: 0.75rem; color: #64748b; border-top: 1px solid #e2e8f0;">
          Bu bilgilendirme e-postası Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından otomatik olarak gönderilmiştir.
        </div>
      </div>
    `;

    const transporter = createSmtpTransporter(cfg);
    const fromAddr = cfg.from && cfg.from.trim() ? cfg.from.trim() : `Piri Reis Üniversitesi Satınalma <${cfg.user}>`;

    await transporter.sendMail({
      from: fromAddr,
      to: recipients.join(', '),
      subject,
      html
    });

    console.log(`✅ Sözleşme #${contract.contractNo} (${daysLeft} gün kaldı) vade uyarı e-postası başarıyla gönderildi -> ${recipients.join(', ')}`);
  } catch (err) {
    console.error(`❌ Sözleşme vade uyarı e-postası hatası (#${contract.contractNo}):`, err.message);
  }
}

async function checkContractExpirationsAndNotify() {
  try {
    const res = await pool.query('SELECT * FROM contracts WHERE status = \'Aktif\' AND "endDate" IS NOT NULL');
    if (!res || res.rowCount === 0) return { checked: 0, notified: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const THRESHOLDS = [60, 30, 15, 7];
    let notifiedCount = 0;

    for (const contract of res.rows) {
      const endDt = new Date(contract.endDate);
      if (isNaN(endDt.getTime())) continue;
      endDt.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((endDt - today) / (1000 * 60 * 60 * 24));

      for (const threshold of THRESHOLDS) {
        if (diffDays === threshold) {
          const notifKey = `contract_notif_${contract.id}_${threshold}`;
          // Mükerrerlik kontrolü (bu eşik için daha önce mail atıldı mı?)
          const notifCheck = await pool.query('SELECT value FROM settings WHERE key = $1', [notifKey]).catch(() => null);
          if (notifCheck && notifCheck.rowCount > 0) {
            continue;
          }

          // Gönder
          await notifyContractExpiry(contract, diffDays);
          notifiedCount++;

          // İşaretle (Settings tablosuna kaydet)
          const nowStr = new Date().toISOString().split('T')[0];
          await pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [notifKey, nowStr]
          ).catch(e => console.error('Bildirim kaydı hatası:', e.message));
        }
      }
    }

    return { checked: res.rowCount, notified: notifiedCount };
  } catch (err) {
    console.error('checkContractExpirationsAndNotify hatası:', err.message);
    return { error: err.message };
  }
}

// ----------------------------------------------------
// 🚀 ANA HTTP SUNUCU VE YÖNLENDİRME MOTORU
// ----------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;
  const method = req.method.toUpperCase();
  const parts = urlPath.split('/').filter(Boolean);
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  // HTTP Güvenlik Başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

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

  // Auth / Role Yardımcıları
  const currentUser = getAuthUser(req);

  function sendUnauthorized(msg = 'Oturum açmanız gerekmektedir.') {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: msg, code: 'UNAUTHORIZED' }));
  }

  function sendForbidden(msg = 'Bu işlem için ADMIN (Satınalma Yöneticisi) yetkisi gereklidir.') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: msg, code: 'FORBIDDEN' }));
  }

  function isReadOnlyUser(user) {
    return user && user.role === 'EXECUTIVE';
  }

  if (currentUser && isReadOnlyUser(currentUser) && method !== 'GET' && urlPath !== '/api/auth/logout') {
    return sendForbidden('Yönetici (EXECUTIVE) hesabı güvenli salt-okunur (izleme) modundadır. Veri değiştirme yetkisi bulunmamaktadır.');
  }

  try {
    // ----------------------------------------------------
    // 🔑 AUTHENTICATION & LOGIN ENDPOINTS (PUBLIC)
    // ----------------------------------------------------
    if (urlPath === '/api/auth/users-list' && method === 'GET') {
      // Login dropdown için güvenli personel listesi (Şifresiz)
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const result = await pool.query('SELECT id, name, title, role, "isActive" FROM users ORDER BY "isActive" DESC, id ASC');
      res.writeHead(200);
      res.end(JSON.stringify(result.rows));
      return;
    }

    if (urlPath === '/api/auth/login' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      // Brute-force koruması (1 dakikada maks 10 deneme)
      if (!checkRateLimit(`login_${clientIp}`, 10, 60000)) {
        res.writeHead(429);
        res.end(JSON.stringify({ error: 'Çok fazla hatalı giriş denemesi yapıldı. Lütfen 1 dakika bekleyin.' }));
        return;
      }

      const body = await readBody(req, 1024 * 1024);
      const { userId, password } = JSON.parse(body || '{}');

      if (!userId || !password) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Lütfen kullanıcı ve şifre giriniz.' }));
        return;
      }

      let userQuery = 'SELECT id, name, title, role, "isActive", password, email FROM users WHERE id = $1';
      let queryParams = [parseInt(userId, 10) || 0];

      if (['exec', 'executive', 'yonetim', 'yönetim'].includes(String(userId).toLowerCase())) {
        userQuery = 'SELECT id, name, title, role, "isActive", password, email FROM users WHERE role = \'EXECUTIVE\' LIMIT 1';
        queryParams = [];
      }

      const userRes = await pool.query(userQuery, queryParams);
      if (userRes.rowCount === 0) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Kullanıcı bulunamadı.' }));
        return;
      }

      const user = userRes.rows[0];
      if (user.isActive === false) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Bu kullanıcı hesabı pasif durumdadır.' }));
        return;
      }

      const isMatch = verifyPassword(password, user.password);
      if (!isMatch) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Şifre hatalı! Lütfen tekrar deneyin.' }));
        return;
      }

      const token = generateToken(user);
      const safeUser = {
        id: user.id,
        name: user.name,
        title: user.title,
        role: user.role,
        email: user.email
      };

      // Giriş logu
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      await pool.query(
        'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
        [dateStr, user.name, 'Kullanıcı Girişi', `Sisteme başarıyla giriş yapıldı (IP: ${clientIp})`]
      ).catch(() => {});

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, token, user: safeUser }));
      return;
    }

    if (urlPath === '/api/auth/me' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!currentUser) {
        sendUnauthorized();
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, user: currentUser }));
      return;
    }

    if (urlPath === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Çıkış yapıldı.' }));
      return;
    }

    // ----------------------------------------------------
    // 🔍 PUBLIC PORTAL BARKOD SORGU ENDPOINT'İ
    // ----------------------------------------------------
    if (urlPath === '/api/public/search-demand' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const query = (url.searchParams.get('barcode') || '').trim().toLowerCase();
      if (!query || query.length < 2) {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      const searchRes = await pool.query(`
        SELECT id, "requestBarcode", "orderBarcode", subject, unit, "arrivalDate", "requestDate", "assignedTo", priority, status, description, "orderDate", supplier, "purchaseType"
        FROM requests
        WHERE LOWER(TRIM("requestBarcode")) = LOWER(TRIM($1))
           OR LOWER(TRIM("orderBarcode")) = LOWER(TRIM($1))
           OR LOWER("requestBarcode") LIKE $2
        ORDER BY id DESC
        LIMIT 5
      `, [query, `%${query}%`]);

      res.writeHead(200);
      res.end(JSON.stringify(searchRes.rows));
      return;
    }

    // ----------------------------------------------------
    // 📊 DÖVİZ KURLARI (TCMB)
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // 🏢 SUPPLIERS (TEDARİKCİ KÜTÜĞÜ) ENDPOINTS
    // ----------------------------------------------------
    if (urlPath === '/api/suppliers' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const result = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
      res.writeHead(200);
      res.end(JSON.stringify(result.rows));
      return;
    }

    if (urlPath === '/api/suppliers' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!currentUser) { sendUnauthorized(); return; }
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      if (!data.name || !data.name.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Tedarikçi resmi unvanı boş olamaz.' }));
        return;
      }
      const sName = data.name.trim();
      try {
        const insertRes = await pool.query(`
          INSERT INTO suppliers (name, "taxNumber", "taxOffice", category, "contactPerson", email, phone, address, status, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          sName,
          data.taxNumber || null,
          data.taxOffice || null,
          data.category || 'Genel',
          data.contactPerson || null,
          data.email || null,
          data.phone || null,
          data.address || null,
          data.status || 'Aktif',
          data.notes || null
        ]);
        res.writeHead(201);
        res.end(JSON.stringify(insertRes.rows[0]));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message.includes('unique') ? 'Bu unvanda bir tedarikçi zaten kayıtlı.' : err.message }));
      }
      return;
    }

    if (urlPath.startsWith('/api/suppliers/') && method === 'PUT') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!currentUser) { sendUnauthorized(); return; }
      const suppId = parseInt(urlPath.split('/')[3], 10);
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const sName = (data.name || '').trim();
      if (!suppId || !sName) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Geçersiz tedarikçi ID veya unvan.' }));
        return;
      }

      try {
        const updateRes = await pool.query(`
          UPDATE suppliers
          SET name = $1, "taxNumber" = $2, "taxOffice" = $3, category = $4, "contactPerson" = $5, email = $6, phone = $7, address = $8, status = $9, notes = $10
          WHERE id = $11
          RETURNING *
        `, [
          sName,
          data.taxNumber || null,
          data.taxOffice || null,
          data.category || 'Genel',
          data.contactPerson || null,
          data.email || null,
          data.phone || null,
          data.address || null,
          data.status || 'Aktif',
          data.notes || null,
          suppId
        ]);

        res.writeHead(200);
        res.end(JSON.stringify(updateRes.rows[0]));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (urlPath.startsWith('/api/suppliers/') && method === 'DELETE') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!currentUser) { sendUnauthorized(); return; }
      const suppId = parseInt(urlPath.split('/')[3], 10);
      await pool.query('DELETE FROM suppliers WHERE id = $1', [suppId]);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (urlPath === '/api/suppliers/merge' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!currentUser) { sendUnauthorized(); return; }
      const body = await readBody(req);
      const { targetName, sourceNames } = JSON.parse(body || '{}');

      if (!targetName || !Array.isArray(sourceNames) || sourceNames.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Hedef firma ismi ve birleştirilecek kaynak isimler eksik.' }));
        return;
      }

      const cleanTarget = targetName.trim();
      const cleanSources = sourceNames.map(s => String(s).trim()).filter(Boolean);

      // Ensure target exists in suppliers table
      await pool.query(`
        INSERT INTO suppliers (name, category, status) VALUES ($1, 'Genel', 'Aktif')
        ON CONFLICT (name) DO NOTHING
      `, [cleanTarget]);

      for (const src of cleanSources) {
        if (src.toLowerCase() === cleanTarget.toLowerCase()) continue;
        await pool.query('UPDATE requests SET supplier = $1 WHERE LOWER(TRIM(supplier)) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('UPDATE contracts SET supplier = $1 WHERE LOWER(TRIM(supplier)) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('UPDATE invoices SET supplier = $1 WHERE LOWER(TRIM(supplier)) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('UPDATE guarantees SET supplier = $1 WHERE LOWER(TRIM(supplier)) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('UPDATE tenders SET "winnerSupplier" = $1 WHERE LOWER(TRIM("winnerSupplier")) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('UPDATE vendor_ratings SET "supplierName" = $1 WHERE LOWER(TRIM("supplierName")) = LOWER(TRIM($2))', [cleanTarget, src]);
        await pool.query('DELETE FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND LOWER(TRIM(name)) != LOWER(TRIM($2))', [src, cleanTarget]);
      }

      const dateStr = new Date().toLocaleString('tr-TR');
      await pool.query(
        'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
        [dateStr, currentUser.name, 'Tedarikçi Birleştirme', `Tedarikçi yazımları "${cleanSources.join(', ')}" -> "${cleanTarget}" olarak birleştirildi.`]
      ).catch(() => {});

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, targetName: cleanTarget, mergedCount: cleanSources.length }));
      return;
    }

    // ----------------------------------------------------
    // ⭐ TEDARİKÇİ PUANLAMA (E-POSTA LİNKİNDEN GELEN PUBLIC İŞLEMLER)
    // ----------------------------------------------------
    if (urlPath === '/api/vendor_ratings/check' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const reqId = url.searchParams.get('reqId');
      if (!reqId) {
        res.writeHead(200);
        res.end(JSON.stringify({ alreadyRated: false }));
        return;
      }
      const checkRes = await pool.query('SELECT * FROM vendor_ratings WHERE "requestId" = $1 ORDER BY id DESC LIMIT 1', [parseInt(reqId, 10)]).catch(() => null);
      if (checkRes && checkRes.rows.length > 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ alreadyRated: true, rating: checkRes.rows[0] }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ alreadyRated: false }));
      }
      return;
    }

    // ----------------------------------------------------
    // 1. DATA INITIAL LOAD (AUTH REQUIRED)
    // ----------------------------------------------------
    if (urlPath === '/api/data' && method === 'GET') {
      if (!currentUser) {
        sendUnauthorized();
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      const [users, requests, contracts, invoices, guarantees, logs, units, regulations, rates, tenders, documents, vendorRatings, settings, suppliers] = await Promise.all([
        getTableData('users'), // Şifresiz döner
        getTableData('requests'),
        getTableData('contracts'),
        getTableData('invoices'),
        getTableData('guarantees'),
        getTableData('logs'),
        pool.query('SELECT id, name, email FROM units ORDER BY name ASC'),
        pool.query('SELECT id, name FROM regulations ORDER BY id ASC'),
        pool.query('SELECT * FROM rates'),
        getTableData('tenders').catch(() => []),
        getTableData('documents').catch(() => []),
        getTableData('vendor_ratings').catch(() => []),
        getTableData('settings').catch(() => []),
        getTableData('suppliers').catch(() => [])
      ]);

      const ratesObj = {};
      rates.rows.forEach(r => {
        ratesObj[r.currency] = r.rate;
        if (r.lastUpdated) ratesObj.lastUpdated = r.lastUpdated;
      });

      const settingsMap = {};
      (settings || []).forEach(s => {
        if (s.key !== 'smtp_config') {
          settingsMap[s.key] = s.value;
        }
      });

      const payload = {
        users, requests, contracts, invoices, guarantees, logs,
        units: units.rows,
        regulations: regulations.rows,
        rates: Object.keys(ratesObj).length > 0 ? ratesObj : { USD: 36.50, EUR: 39.80 },
        tenders: tenders || [],
        documents: documents || [],
        vendorRatings: vendorRatings || [],
        settings: settingsMap,
        suppliers: suppliers || []
      };

      res.writeHead(200);
      res.end(JSON.stringify(payload));
      return;
    }

    // ----------------------------------------------------
    // 📧 SMTP & E-MAIL ENDPOINTS (ADMIN ONLY)
    // ----------------------------------------------------
    if (urlPath === '/api/settings/smtp' && method === 'GET') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const cfg = await getSmtpConfig();
      if (cfg) {
        const safeCfg = { ...cfg, pass: cfg.pass ? '••••••••' : '' };
        res.writeHead(200); res.end(JSON.stringify(safeCfg));
      } else {
        res.writeHead(200); res.end(JSON.stringify({ host: '', port: 587, secure: false, user: '', pass: '', from: '', fromName: 'Piri Reis Üni. Satınalma', isEnabled: false }));
      }
      return;
    }

    if (urlPath === '/api/settings/smtp' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const newCfg = JSON.parse(body || '{}');
      
      const existingCfg = await getSmtpConfig() || {};
      if (newCfg.pass === '••••••••' || !newCfg.pass) {
        newCfg.pass = existingCfg.pass || '';
      }

      await pool.query(`
        INSERT INTO settings (key, value) VALUES ('smtp_config', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1
      `, [JSON.stringify(newCfg)]);

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'SMTP e-posta ayarları başarıyla kaydedildi.' }));
      return;
    }

    if (urlPath === '/api/email/test' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      
      const dbCfg = await getSmtpConfig() || {};
      const cfg = {
        host: payload.host || dbCfg.host,
        port: payload.port || dbCfg.port || 587,
        secure: payload.secure !== undefined ? payload.secure : dbCfg.secure,
        user: payload.user || dbCfg.user,
        pass: (payload.pass && payload.pass !== '••••••••') ? payload.pass : dbCfg.pass,
        from: payload.from || dbCfg.from || payload.user || dbCfg.user,
        fromName: payload.fromName || dbCfg.fromName || 'Piri Reis Üni. Satınalma'
      };
      
      if (!cfg || !cfg.host || !cfg.user || !cfg.pass) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Lütfen SMTP Sunucu, Kullanıcı Adı ve Şifre alanlarını eksiksiz giriniz.' }));
        return;
      }

      try {
        const transporter = createSmtpTransporter(cfg);
        const target = payload.testEmail || cfg.user;
        const info = await transporter.sendMail({
          from: `"${cfg.fromName || 'Piri Reis Üni. Satınalma'}" <${cfg.from || cfg.user}>`,
          to: target,
          subject: '✅ Piri Reis Üniversitesi Satınalma Takip — SMTP Test E-Postası',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
              <div style="background: #1e3a8a; padding: 20px; color: #fff; text-align: center;">
                <h2 style="margin: 0; font-size: 1.3rem;">Piri Reis Üniversitesi</h2>
                <p style="margin: 5px 0 0; font-size: 0.9rem; opacity: 0.9;">Satınalma Takip Sistemi — E-Posta Servisi</p>
              </div>
              <div style="padding: 24px; color: #1e293b;">
                <h3 style="color: #10b981; margin-top: 0;">🎉 SMTP Bağlantısı Başarılı!</h3>
                <p>Bu e-posta, Satınalma Takip Sistemi üzerinden SMTP sunucu yapılandırmanızı doğrulamak amacıyla test olarak gönderilmiştir.</p>
                <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                  Gönderim Zamanı: ${new Date().toLocaleString('tr-TR')}
                </p>
              </div>
            </div>
          `
        });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: `Test e-postası başarıyla gönderildi: ${target}`, messageId: info.messageId }));
      } catch (err) {
        console.error('SMTP test hatası:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (urlPath === '/api/email/send-alert' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const { to, subject, title, details } = JSON.parse(body || '{}');

      const cfg = await getSmtpConfig();
      if (!cfg || !cfg.isEnabled || !cfg.host) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, message: 'SMTP bildirimleri pasif durumda.' }));
        return;
      }

      try {
        const transporter = createSmtpTransporter(cfg);
        await transporter.sendMail({
          from: `"${cfg.fromName || 'Piri Reis Üni. Satınalma'}" <${cfg.from || cfg.user}>`,
          to,
          subject: subject || '🔔 Satınalma Takip Bildirimi',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
              <div style="background: #1e3a8a; padding: 18px; color: #fff;">
                <h2 style="margin: 0; font-size: 1.2rem;">Piri Reis Üniversitesi — Satınalma Müdürlüğü</h2>
              </div>
              <div style="padding: 20px; color: #0f172a;">
                <h3 style="margin-top: 0; color: #1e3a8a;">${title || 'Önemli Bildirim'}</h3>
                <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.5; color: #334155; margin: 15px 0;">${details || ''}</div>
                <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #64748b;">
                  Bu otomatik bir sistem bildirimidir. Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından oluşturulmuştur.
                </div>
              </div>
            </div>
          `
        });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Email alert error:', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 📥 EXCEL BATCH IMPORT ENDPOINT (AUTH REQUIRED)
    // ----------------------------------------------------
    if ((urlPath === '/api/demands/batch' || urlPath === '/api/import-excel-requests') && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
      if (!Array.isArray(items) || items.length === 0) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'İçe aktarılacak kayıt bulunamadı.' })); return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = [];
        for (const item of items) {
          delete item.id;
          const keys = Object.keys(item);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(item[k], k));

          const query = `INSERT INTO requests (${cols}) VALUES (${placeholders}) RETURNING *`;
          const resInsert = await client.query(query, values);
          inserted.push(resInsert.rows[0]);
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        await client.query(
          'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
          [dateStr, currentUser.name || 'Sistem', 'Toplu Talep İçe Aktarma', `${inserted.length} adet talep Excel dosyasından toplu yüklendi.`]
        );

        await client.query('COMMIT');
        res.writeHead(201);
        res.end(JSON.stringify({ success: true, count: inserted.length, items: inserted }));
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Batch import error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      } finally {
        client.release();
      }
      return;
    }

    // ----------------------------------------------------
    // ⏳ CONTRACT EXPIRATION CHECK TRIGGER
    // ----------------------------------------------------
    if (urlPath === '/api/contracts/check-expirations' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      try {
        const result = await checkContractExpirationsAndNotify();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 🗄️ BACKUP & RESTORE MANAGEMENT ENDPOINTS (ADMIN ONLY)
    // ----------------------------------------------------
    if (urlPath === '/api/backups' && method === 'GET') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const files = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json') || f.endsWith('.sql')) : [];
      files.sort().reverse();
      const list = files.map(f => {
        const fPath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fPath);
        const sizeKB = (stat.size / 1024).toFixed(1) + ' KB';
        const d = new Date(stat.mtime);
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return {
          filename: f,
          size: sizeKB,
          createdAt: dateStr,
          mtime: stat.mtime,
          isAuto: f.startsWith('auto_backup')
        };
      });
      res.writeHead(200);
      res.end(JSON.stringify(list));
      return;
    }

    if ((urlPath === '/api/backups/create' || urlPath === '/api/backup-now') && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const backupInfo = await createBackupFile(false);
      res.writeHead(201);
      res.end(JSON.stringify({ success: true, backup: backupInfo }));
      return;
    }

    if ((urlPath.startsWith('/api/backups/download/') || urlPath === '/api/backups/download') && method === 'GET') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      let filename = url.searchParams.get('filename');
      if (!filename && urlPath.startsWith('/api/backups/download/')) {
        filename = path.basename(urlPath.replace('/api/backups/download/', ''));
      }
      if (!filename || (!filename.endsWith('.json') && !filename.endsWith('.sql'))) {
        res.writeHead(400); res.end('Geçersiz dosya adı'); return;
      }
      const filePath = path.join(BACKUP_DIR, path.basename(filename));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end('Yedek dosyası bulunamadı'); return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${path.basename(filename)}"`
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (urlPath === '/api/backups/restore' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const { filename } = JSON.parse(body || '{}');
      if (!filename) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Yedek dosya adı belirtilmedi.' })); return;
      }
      const filePath = path.join(BACKUP_DIR, path.basename(filename));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end(JSON.stringify({ error: 'Yedek dosyası bulunamadı.' })); return;
      }

      const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      const tablesToClear = ['requests', 'contracts', 'invoices', 'guarantees', 'tenders', 'documents', 'vendor_ratings'];
      for (const t of tablesToClear) {
        await pool.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`).catch(() => {});
      }

      if (backupData.requests) {
        for (const reqItem of backupData.requests) {
          delete reqItem.id;
          const keys = Object.keys(reqItem);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(reqItem[k], k));
          await pool.query(`INSERT INTO requests (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      if (backupData.contracts) {
        for (const c of backupData.contracts) {
          delete c.id;
          const keys = Object.keys(c);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(c[k], k));
          await pool.query(`INSERT INTO contracts (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      if (backupData.invoices) {
        for (const inv of backupData.invoices) {
          delete inv.id;
          const keys = Object.keys(inv);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(inv[k], k));
          await pool.query(`INSERT INTO invoices (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      if (backupData.guarantees) {
        for (const g of backupData.guarantees) {
          delete g.id;
          const keys = Object.keys(g);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(g[k], k));
          await pool.query(`INSERT INTO guarantees (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      if (backupData.tenders) {
        for (const t of backupData.tenders) {
          delete t.id;
          const keys = Object.keys(t);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(t[k], k));
          await pool.query(`INSERT INTO tenders (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      if (backupData.vendor_ratings) {
        for (const vr of backupData.vendor_ratings) {
          delete vr.id;
          const keys = Object.keys(vr);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(vr[k], k));
          await pool.query(`INSERT INTO vendor_ratings (${cols}) VALUES (${placeholders})`, values).catch(() => {});
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: `Veritabanı "${path.basename(filename)}" yedeğinden başarıyla geri yüklendi!` }));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'backups' && parts[2] && method === 'DELETE') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      const filename = path.basename(parts[2]);
      const filePath = path.join(BACKUP_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Yedek dosyası bulunamadı.' }));
      }
      return;
    }

    // ----------------------------------------------------
    // 📄 DOCUMENTS MANAGEMENT (AUTH REQUIRED)
    // ----------------------------------------------------
    if (urlPath === '/api/documents' && method === 'GET') {
      if (!currentUser) return sendUnauthorized();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const entityType = url.searchParams.get('entityType');
      const entityId = url.searchParams.get('entityId');
      let query = 'SELECT * FROM documents';
      const params = [];
      if (entityType && entityId) {
        query += ' WHERE "entityType" = $1 AND "entityId" = $2 ORDER BY id DESC';
        params.push(entityType, parseInt(entityId, 10));
      } else if (entityType) {
        query += ' WHERE "entityType" = $1 ORDER BY id DESC';
        params.push(entityType);
      } else {
        query += ' ORDER BY id DESC';
      }
      const result = await pool.query(query, params);
      res.writeHead(200);
      res.end(JSON.stringify(result.rows));
      return;
    }

    if (urlPath === '/api/documents/upload' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req, 100 * 1024 * 1024); // max 100MB per file payload
      if (!body) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Dosya verisi bulunamadı.' })); return;
      }
      try {
        const data = JSON.parse(body);
        const { entityType, entityId, fileName, fileData, fileType, category, description } = data;
        
        if (!entityType || !entityId || !fileName || !fileData) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Gerekli alanlar eksik (entityType, entityId, fileName, fileData).' })); return;
        }

        // Dosya uzantısı kontrolü (Güvenlik Whitelist)
        const ext = path.extname(fileName).toLowerCase();
        if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `Güvenlik sebebiyle "${ext}" uzantılı dosyaların yüklenmesine izin verilmemektedir. İzin verilen uzantılar: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}` }));
          return;
        }

        const base64Content = fileData.includes(';base64,') ? fileData.split(';base64,')[1] : fileData;
        const buffer = Buffer.from(base64Content, 'base64');
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9._\-çÇğĞıİöÖşŞüÜ]/g, '_');
        const storedFileName = `${Date.now()}_${Math.floor(Math.random()*1000)}_${sanitizedName}`;
        const destPath = path.join(UPLOAD_DIR, storedFileName);

        fs.writeFileSync(destPath, buffer);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        const insertQuery = `
          INSERT INTO documents ("entityType", "entityId", "fileName", "storedFileName", "fileSize", "fileType", "category", "description", "uploadedBy", "uploadedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;
        const result = await pool.query(insertQuery, [
          entityType,
          parseInt(entityId, 10),
          fileName,
          storedFileName,
          buffer.length,
          fileType || 'application/octet-stream',
          category || 'Genel',
          description || '',
          currentUser.name || 'Sistem',
          dateStr
        ]);

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, document: result.rows[0] }));
        return;
      } catch (err) {
        console.error('Dosya yükleme hatası:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Dosya kaydedilemedi: ' + err.message }));
        return;
      }
    }

    if (urlPath === '/api/documents/export-zip' && method === 'GET') {
      if (!currentUser) return sendUnauthorized();
      const entityType = url.searchParams.get('entityType');
      const entityId = url.searchParams.get('entityId');
      if (!entityType || !entityId) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'entityType ve entityId parametreleri gereklidir.' })); return;
      }
      const docsRes = await pool.query(
        'SELECT * FROM documents WHERE "entityType" = $1 AND "entityId" = $2 ORDER BY id ASC',
        [entityType, parseInt(entityId, 10)]
      );
      const docs = docsRes.rows;
      if (docs.length === 0) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('İndirilecek kayıtlı evrak bulunamadı.');
        return;
      }
      const zipArchive = new (archiver.ZipArchive || archiver)({ zlib: { level: 9 } });
      const safeZipName = `${entityType}_${entityId}_tum_evraklar.zip`;
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeZipName)}`
      });
      zipArchive.pipe(res);
      for (const doc of docs) {
        const fPath = path.join(UPLOAD_DIR, path.basename(doc.storedFileName));
        if (fs.existsSync(fPath)) {
          const zipEntryName = doc.category ? `${doc.category} - ${doc.fileName}` : doc.fileName;
          zipArchive.file(fPath, { name: zipEntryName });
        }
      }
      zipArchive.finalize();
      return;
    }

    // Document download / preview
    if (parts[0] === 'api' && parts[1] === 'documents' && parts[2] && (parts[3] === 'download' || parts[3] === 'preview') && method === 'GET') {
      const docId = parseInt(parts[2], 10);
      const isPreview = parts[3] === 'preview';
      const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
      if (docRes.rowCount === 0) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Doküman bulunamadı.');
        return;
      }
      const doc = docRes.rows[0];
      const filePath = path.join(UPLOAD_DIR, path.basename(doc.storedFileName));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Fiziksel dosya sunucuda bulunamadı.');
        return;
      }
      const stat = fs.statSync(filePath);
      const disposition = isPreview ? 'inline' : 'attachment';
      res.writeHead(200, {
        'Content-Type': doc.fileType || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Document delete
    if (parts[0] === 'api' && parts[1] === 'documents' && parts[2] && method === 'DELETE') {
      if (!currentUser) return sendUnauthorized();
      const docId = parseInt(parts[2], 10);
      const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
      if (docRes.rowCount > 0) {
        const doc = docRes.rows[0];
        const fPath = path.join(UPLOAD_DIR, path.basename(doc.storedFileName));
        if (fs.existsSync(fPath)) {
          try { fs.unlinkSync(fPath); } catch (e) { console.error('Dosya silinirken hata:', e.message); }
        }
        await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Doküman bulunamadı' }));
        return;
      }
    }

    // Remind unit to rate vendor
    if (parts[0] === 'api' && (parts[1] === 'requests' || parts[1] === 'demands') && parts[2] && parts[3] === 'remind-rating' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const reqId = parseInt(parts[2], 10);
      const reqRes = await pool.query('SELECT * FROM requests WHERE id = $1', [reqId]).catch(() => null);
      const demand = reqRes?.rows[0];
      if (!demand) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Talep bulunamadı.' }));
        return;
      }
      try {
        await sendRatingReminderEmail(demand);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: `"${demand.unit}" birimine puanlama hatırlatma e-postası başarıyla gönderildi!` }));
      } catch (err) {
        console.error('Hatırlatma e-posta hatası:', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 2. GENERIC REST CRUD API
    // ----------------------------------------------------
    // ----------------------------------------------------
    // 💱 CANLI DÖVİZ KURLARI & GENEL AYARLAR (SETTINGS & RATES)
    // ----------------------------------------------------
    if ((urlPath === '/api/settings' || urlPath === '/api/rates') && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const body = await readBody(req);
        const data = JSON.parse(body || '{}');
        const ratesData = data.rates || (data.USD || data.EUR ? data : null);

        if (ratesData && (ratesData.USD || ratesData.EUR)) {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const dateStr = ratesData.lastUpdated || `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

          if (ratesData.USD) {
            await pool.query(`
              INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('USD', $1, $2)
              ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
            `, [parseFloat(ratesData.USD), dateStr]);
          }
          if (ratesData.EUR) {
            await pool.query(`
              INSERT INTO rates (currency, rate, "lastUpdated") VALUES ('EUR', $1, $2)
              ON CONFLICT (currency) DO UPDATE SET rate = $1, "lastUpdated" = $2
            `, [parseFloat(ratesData.EUR), dateStr]);
          }

          res.writeHead(200);
          res.end(JSON.stringify({ success: true, message: 'Döviz kurları başarıyla güncellendi ve kaydedildi.' }));
          return;
        }

        if (data.key && data.value !== undefined) {
          await pool.query(`
            INSERT INTO settings (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
          `, [String(data.key), typeof data.value === 'object' ? JSON.stringify(data.value) : String(data.value)]);

          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Settings/Rates save error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 2. GENERIC REST CRUD API (GÜVENLİ VE FİLTRELİ)
    // ----------------------------------------------------
    if (parts[0] === 'api' && parts.length >= 2 && urlPath !== '/api/data') {
      const table = parts[1];
      const allowedTables = ['users', 'requests', 'contracts', 'invoices', 'guarantees', 'logs', 'units', 'regulations', 'tenders', 'documents', 'vendor_ratings', 'settings'];
      
      if (allowedTables.includes(table)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // vendor_ratings tablosuna puanlama kaydı ekleme (E-posta üzerinden public değerlendirme yapılabilmesi için izinli)
        const isPublicVendorRating = table === 'vendor_ratings' && method === 'POST';

        if (!currentUser && !isPublicVendorRating) {
          sendUnauthorized();
          return;
        }
        
        // POST /api/:table
        if (method === 'POST') {
          const body = await readBody(req);
          if (!body) { res.writeHead(400); res.end(JSON.stringify({ error: 'Empty body' })); return; }
          const data = JSON.parse(body);
          
          delete data.id;

          // Şifre güvenliği: Kullanıcı eklenirken şifreyi PBKDF2 ile hashle
          if (table === 'users') {
            const rawPass = data.password || '123456';
            data.password = hashPassword(rawPass);
          }

          if (table === 'vendor_ratings') {
            data.supplierName = data.supplierName || data.suppliername || data.supplier || '';
            data.purchaseType = data.purchaseType || data.purchasetype || 'MAL';
            data.requestId = data.requestId || data.requestid || null;
            data.qualityScore = data.qualityScore || data.qualityscore || 5;
            data.speedScore = data.speedScore || data.speedscore || 5;
            data.complianceScore = data.complianceScore || data.compliancescore || 5;
            data.communicationScore = data.communicationScore || data.communicationscore || data.assemblyScore || 5;
            data.overallScore = data.overallScore || data.overallscore || 5;
            data.reviewNotes = data.reviewNotes || data.reviewnotes || '';
            data.ratedBy = data.ratedBy || data.ratedby || '';
            data.ratedAt = data.ratedAt || data.ratedat || '';
          }

          // If rating a vendor for a specific request, ensure single evaluation lock
          if (table === 'vendor_ratings' && data.requestId) {
            const existingCheck = await pool.query('SELECT * FROM vendor_ratings WHERE "requestId" = $1 LIMIT 1', [parseInt(data.requestId, 10)]).catch(() => null);
            if (existingCheck && existingCheck.rows.length > 0) {
              res.writeHead(409);
              res.end(JSON.stringify({
                error: 'Bu talep için zaten bir değerlendirme yapılmıştır.',
                alreadyRated: true,
                rating: existingCheck.rows[0]
              }));
              return;
            }
          }

          // Güvenli sütun filtreleme (Sadece veritabanında var olan sütunları ekle)
          const validCols = TABLE_COLUMNS[table] || Object.keys(data);
          const sanitizedData = {};
          for (const k of Object.keys(data)) {
            if (validCols.includes(k) && k !== 'id') {
              sanitizedData[k] = sanitizeVal(data[k], k);
            }
          }

          const keys = Object.keys(sanitizedData);
          if (keys.length === 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Kaydedilecek geçerli sütun verisi bulunamadı.' }));
            return;
          }

          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizedData[k]);

          try {
            const query = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
            const result = await pool.query(query, values);
            
            const returnedRow = { ...result.rows[0] };
            if (table === 'users') delete returnedRow.password;

            res.writeHead(201);
            res.end(JSON.stringify(returnedRow));

            // Trigger automated unit & staff email on demand creation
            if (table === 'requests' && result.rows[0]) {
              notifyUnitOnDemandEvent(result.rows[0], 'CREATED').catch(e => console.error('Birim e-posta tetikleme hatası:', e.message));
              if (result.rows[0].assignedTo && result.rows[0].assignedTo !== 'Henüz Atanmadı') {
                notifyStaffOnAssignment(result.rows[0], 'ASSIGNED').catch(e => console.error('Personel e-posta tetikleme hatası:', e.message));
              }
            }
          } catch (err) {
            console.error(`INSERT hatası (${table}):`, err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Kayıt veritabanına eklenemedi: ' + err.message }));
          }
          return;
        }
        
        // PUT /api/:table/:id
        if (method === 'PUT' && parts[2]) {
          const id = parseInt(parts[2], 10);
          const body = await readBody(req);
          if (!body) { res.writeHead(400); res.end(JSON.stringify({ error: 'Empty body' })); return; }
          const data = JSON.parse(body);
          delete data.id; // never update id

          // Şifre güvenliği: Kullanıcı güncellenirken yeni şifre verilmişse hashle, verilmemişse eskisini koru
          if (table === 'users') {
            if (data.password && data.password.trim() !== '') {
              data.password = hashPassword(data.password);
            } else {
              delete data.password; // boşsa eski şifreyi değiştirme
            }
          }
          
          let oldStatus = null;
          let oldAssignedTo = null;
          if (table === 'requests') {
            const prevRes = await pool.query('SELECT status, "assignedTo" FROM requests WHERE id = $1', [id]).catch(() => null);
            oldStatus = prevRes?.rows[0]?.status;
            oldAssignedTo = prevRes?.rows[0]?.assignedTo;
          }

          // Güvenli sütun filtreleme (Sadece veritabanında var olan sütunları güncelle)
          const validCols = TABLE_COLUMNS[table] || Object.keys(data);
          const sanitizedData = {};
          for (const k of Object.keys(data)) {
            if (validCols.includes(k) && k !== 'id') {
              sanitizedData[k] = sanitizeVal(data[k], k);
            }
          }

          const keys = Object.keys(sanitizedData);
          if (keys.length === 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Güncellenecek geçerli sütun verisi bulunamadı.' }));
            return;
          }

          const updates = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
          const values = keys.map(k => sanitizedData[k]);
          values.push(id);

          try {
            const query = `UPDATE ${table} SET ${updates} WHERE id = $${values.length} RETURNING *`;
            const result = await pool.query(query, values);
            
            if (result.rowCount === 0) {
              res.writeHead(404); res.end(JSON.stringify({ error: 'Kayıt bulunamadı' }));
            } else {
              const returnedRow = { ...result.rows[0] };
              if (table === 'users') delete returnedRow.password;

              res.writeHead(200); res.end(JSON.stringify(returnedRow));

              // Trigger automated emails on demand status update & staff delegation
              if (table === 'requests' && result.rows[0]) {
                if (result.rows[0].status === 'Revize İstendi' || (oldStatus && result.rows[0].status !== oldStatus)) {
                  notifyUnitOnDemandEvent(result.rows[0], 'STATUS_CHANGED', oldStatus).catch(e => console.error('Birim e-posta güncelleme hatası:', e.message));
                }
                if (result.rows[0].assignedTo && result.rows[0].assignedTo !== oldAssignedTo && result.rows[0].assignedTo !== 'Henüz Atanmadı') {
                  notifyStaffOnAssignment(result.rows[0], 'DELEGATED', oldAssignedTo).catch(e => console.error('Personel devir e-posta hatası:', e.message));
                }
              }
            }
          } catch (err) {
            console.error(`UPDATE hatası (${table}):`, err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Kayıt güncellenemedi: ' + err.message }));
          }
          return;
        }

        // DELETE /api/:table/:id
        if (method === 'DELETE' && parts[2]) {
          const id = parseInt(parts[2], 10);

          // Talep ve kullanıcı silme yetkisi sadece ADMIN kullanıcılar içindir
          if ((table === 'requests' || table === 'users') && currentUser?.role !== 'ADMIN') {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Bu silme işlemi sadece Satınalma Yöneticisi (ADMIN) yetkisine sahip kullanıcılar tarafından yapılabilir.' }));
            return;
          }

          try {
            const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
            if (result.rowCount === 0) {
              res.writeHead(404); res.end(JSON.stringify({ error: 'Kayıt bulunamadı' }));
            } else {
              res.writeHead(200); res.end(JSON.stringify({ success: true }));
            }
          } catch (err) {
            console.error(`DELETE hatası (${table}):`, err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Kayıt silinemedi: ' + err.message }));
          }
          return;
        }
      }
    }

    // ----------------------------------------------------
    // 🔄 SELF-UPDATE ENDPOINT (ADMIN ONLY)
    // ----------------------------------------------------
    if (urlPath === '/api/update-system' && method === 'POST') {
      if (!currentUser) return sendUnauthorized();
      if (currentUser.role !== 'ADMIN') return sendForbidden();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const { exec } = require('child_process');
      exec('git pull && pm2 reload satinalma', (err, stdout, stderr) => {
        if (err) {
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

    // ----------------------------------------------------
    // 🌐 STATİK DOSYA SUNUCU (PATH TRAVERSAL KORUMALI)
    // ----------------------------------------------------
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
    await ensureDatabaseExists();
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

      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        "entityType" VARCHAR(50) NOT NULL,
        "entityId" INTEGER NOT NULL,
        "fileName" VARCHAR(255) NOT NULL,
        "storedFileName" VARCHAR(255) NOT NULL,
        "fileSize" NUMERIC,
        "fileType" VARCHAR(100),
        "category" VARCHAR(100),
        description TEXT,
        "uploadedBy" VARCHAR(100),
        "uploadedAt" VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS vendor_ratings (
        id SERIAL PRIMARY KEY,
        "supplierName" VARCHAR(255) NOT NULL,
        "speedScore" NUMERIC(3,1) DEFAULT 5.0,
        "qualityScore" NUMERIC(3,1) DEFAULT 5.0,
        "complianceScore" NUMERIC(3,1) DEFAULT 5.0,
        "communicationScore" NUMERIC(3,1) DEFAULT 5.0,
        "overallScore" NUMERIC(3,1) DEFAULT 5.0,
        "reviewNotes" TEXT,
        "ratedBy" VARCHAR(100),
        "ratedAt" VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        "taxNumber" VARCHAR(50),
        "taxOffice" VARCHAR(100),
        category VARCHAR(100) DEFAULT 'Genel',
        "contactPerson" VARCHAR(150),
        email VARCHAR(150),
        phone VARCHAR(50),
        address TEXT,
        status VARCHAR(20) DEFAULT 'Aktif',
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);

      ALTER TABLE units ADD COLUMN IF NOT EXISTS email VARCHAR(255);

      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "sequenceNo" INTEGER;
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "requestDate" VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "budgetAmount" NUMERIC;
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "purchaseType" VARCHAR(50) DEFAULT 'MAL';
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "academicYear" VARCHAR(50);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "orderBarcode" VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "orderDate" VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "estimatedDeliveryDate" VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS supplier VARCHAR(255);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS regulation VARCHAR(100);
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS description TEXT;

      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "guaranteeAmount" NUMERIC;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "guaranteeExpiry" VARCHAR(100);
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "academicYear" VARCHAR(50);

      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "dueDate" VARCHAR(100);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paymentStatus" VARCHAR(50);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "accountingDeliveryDate" VARCHAR(100);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "relatedBarcode" VARCHAR(100);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paymentDate" VARCHAR(100);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "academicYear" VARCHAR(50);

      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS "bankName" VARCHAR(255);
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS type VARCHAR(100);
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS title VARCHAR(255);
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS unit VARCHAR(255);
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS amount NUMERIC;
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS "storageLocation" VARCHAR(255);
      ALTER TABLE guarantees ADD COLUMN IF NOT EXISTS notes TEXT;

      ALTER TABLE rates ADD COLUMN IF NOT EXISTS "lastUpdated" VARCHAR(100);

      ALTER TABLE vendor_ratings ADD COLUMN IF NOT EXISTS "purchaseType" VARCHAR(50) DEFAULT 'MAL';
      ALTER TABLE vendor_ratings ADD COLUMN IF NOT EXISTS "requestId" INTEGER;
    `);

    // Otomatik Şifre Göçü (Mevcut düz metin şifreleri PBKDF2 tuzlu hash'e dönüştürür)
    const existingUsers = await pool.query('SELECT id, password FROM users');
    for (const u of existingUsers.rows) {
      if (u.password && !u.password.startsWith('$pbkdf2$')) {
        const hashed = hashPassword(u.password);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, u.id]);
        console.log(`🔒 Kullanıcı ID ${u.id} şifresi güvenli PBKDF2 hash formatına dönüştürüldü.`);
      }
    }

    // Check if database is empty (users table has 0 rows)
    const userCheck = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count, 10) === 0) {
      console.log('🌱 Veritabanı boş, başlangıç verileri yükleniyor...');
      
      const backupFiles = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')) : [];
      
      if (backupFiles.length > 0) {
        backupFiles.sort().reverse();
        const latestBackupPath = path.join(BACKUP_DIR, backupFiles[0]);
        console.log(`📦 Yedek dosyasından veriler çekiliyor: ${backupFiles[0]}`);
        const seedData = JSON.parse(fs.readFileSync(latestBackupPath, 'utf8'));

        if (seedData.users) {
          for (const u of seedData.users) {
            const pass = u.password ? (u.password.startsWith('$pbkdf2$') ? u.password : hashPassword(u.password)) : hashPassword('123456');
            await pool.query(
              'INSERT INTO users (name, title, role, "isActive", password, email) VALUES ($1, $2, $3, $4, $5, $6)',
              [u.name, u.title, u.role, u.isActive !== false, pass, u.email || '']
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
          ['Cem TUR', 'Satınalma Mdr. Yrd.', 'ADMIN', true, hashPassword('123456')]
        );

        // Eğer Talepler.xlsx mevcutsa ve veritabanı sıfırsa otomatik içe aktar
        const excelPath = path.join(__dirname, 'Talepler.xlsx');
        if (fs.existsSync(excelPath)) {
          try {
            console.log('📊 Talepler.xlsx bulundu, ilk açılışta veriler otomatik aktarılıyor...');
            const { execSync } = require('child_process');
            execSync('node import-excel.js', { stdio: 'inherit', cwd: __dirname });
          } catch (exErr) {
            console.error('Talepler.xlsx otomatik aktarım uyarısı:', exErr.message);
          }
        }
      }
    }

    // 🛡️ ÇOKLU TEDARİKCİ SÜTÜN MİGRASYONU
    await pool.query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS "multiSuppliers" TEXT;').catch(() => {});

    // 🛡️ ÇİFTLEYEN KULLANICI KAYITLARINI TEMİZLE (Tekil Bırak)
    await pool.query(`
      DELETE FROM users a USING users b
      WHERE a.id > b.id AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
    `).catch(() => {});

    // 🛡️ YÖNETİCİ VE ÜST YÖNETİM ROLLERİNİ GARANTİ ALTINA AL
    await pool.query(`
      UPDATE users 
      SET role = 'ADMIN', title = COALESCE(NULLIF(title, ''), 'Satınalma Mdr. Yrd.')
      WHERE (LOWER(name) LIKE '%cem%' OR LOWER(name) LIKE '%türkmen%') AND role != 'ADMIN'
    `).catch(() => {});

    await pool.query(`
      UPDATE users 
      SET role = 'ADMIN', title = COALESCE(NULLIF(title, ''), 'Satınalma Şube Müdürü')
      WHERE LOWER(name) LIKE '%merih%' AND role != 'ADMIN'
    `).catch(() => {});

    // Üst Yönetim kullanıcısını 'Yönetim' adıyla senkronize et
    await pool.query(`
      UPDATE users 
      SET name = 'Yönetim', title = 'Yönetim' 
      WHERE role = 'EXECUTIVE' OR LOWER(name) LIKE '%rektör%' OR LOWER(name) LIKE '%üst yönetim%'
    `).catch(() => {});

    const execCheck = await pool.query("SELECT id FROM users WHERE role = 'EXECUTIVE' LIMIT 1").catch(() => ({ rowCount: 0 }));
    if (execCheck.rowCount === 0) {
      await pool.query(
        'INSERT INTO users (name, title, role, "isActive", password) VALUES ($1, $2, $3, $4, $5)',
        ['Yönetim', 'Yönetim', 'EXECUTIVE', true, hashPassword('123456')]
      ).catch(() => {});
    }

    // 🏢 TEDARİKCİ KÜTÜĞÜ OTOMATİK DOLDURMA (Auto-Seeding)
    const suppCheck = await pool.query('SELECT COUNT(*) FROM suppliers').catch(() => ({ rows: [{ count: '0' }] }));
    if (parseInt(suppCheck.rows[0]?.count || 0, 10) === 0) {
      console.log('ℹ️ Tedarikçi kütüğü boş, mevcut kayıtlardan tedarikçiler aktarılıyor...');
      await pool.query(`
        INSERT INTO suppliers (name, category, status)
        SELECT DISTINCT TRIM(supplier_name), 'Genel', 'Aktif'
        FROM (
          SELECT supplier AS supplier_name FROM requests WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
          UNION
          SELECT supplier AS supplier_name FROM contracts WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
          UNION
          SELECT supplier AS supplier_name FROM invoices WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
          UNION
          SELECT supplier AS supplier_name FROM guarantees WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
          UNION
          SELECT "winnerSupplier" AS supplier_name FROM tenders WHERE "winnerSupplier" IS NOT NULL AND TRIM("winnerSupplier") != ''
        ) AS existing_suppliers
        ON CONFLICT (name) DO NOTHING;
      `).catch(e => console.error('Supplier auto-seeding warning:', e.message));
      console.log('✅ Mevcut tedarikçiler veritabanından başarıyla aktarıldı!');
    }

    // 🛡️ ÇOKLU TEDARİKCİ BİRLEŞİK İSİMLERİNİ TEMİZLE (Parçala ve Tekilleştir)
    try {
      const combinedSupps = await pool.query("SELECT id, name FROM suppliers WHERE name LIKE '%,%'");
      for (const row of combinedSupps.rows) {
        const names = row.name.split(',').map(n => n.trim()).filter(Boolean);
        for (const name of names) {
          await pool.query(
            "INSERT INTO suppliers (name, category, status) VALUES ($1, 'Genel', 'Aktif') ON CONFLICT (name) DO NOTHING",
            [name]
          );
        }
        await pool.query("DELETE FROM suppliers WHERE id = $1", [row.id]);
      }
    } catch (e) {}

    // 🛡️ ÇOKLU TEDARİKCİLİ TALEPLERİ BAĞIMSIZ SATIRLARA BÖL MİGRASYONU (249001-1, 249001-2)
    try {
      const multiReqs = await pool.query("SELECT * FROM requests WHERE \"multiSuppliers\" IS NOT NULL OR supplier LIKE '%,%'");
      for (const r of multiReqs.rows) {
        let items = [];
        if (r.multiSuppliers) {
          try {
            const parsed = typeof r.multiSuppliers === 'string' ? JSON.parse(r.multiSuppliers) : r.multiSuppliers;
            if (Array.isArray(parsed) && parsed.length > 0) items = parsed;
          } catch (e) {}
        }
        if (items.length === 0 && r.supplier && r.supplier.includes(',')) {
          const parts = r.supplier.split(',').map(s => s.trim()).filter(Boolean);
          const splitAmt = (parseFloat(r.actualAmount) || 0) / (parts.length || 1);
          items = parts.map(p => ({ supplier: p, amount: splitAmt }));
        }

        if (items.length > 1) {
          const rawBc = String(r.requestBarcode || r.id).replace(/-[0-9]+$/, '');
          const rawOrdBc = String(r.orderBarcode || '').replace(/-[0-9]+$/, '');

          // Update primary row
          const item1 = items[0];
          const bc1 = `${rawBc}-1`;
          const ord1 = rawOrdBc ? `${rawOrdBc}-1` : '';
          await pool.query(
            `UPDATE requests SET "requestBarcode" = $1, supplier = $2, "actualAmount" = $3, "orderBarcode" = $4, "multiSuppliers" = NULL WHERE id = $5`,
            [bc1, item1.supplier, item1.amount || 0, ord1, r.id]
          );

          // Insert sub-rows for items 2, 3, etc.
          for (let idx = 1; idx < items.length; idx++) {
            const it = items[idx];
            const subBc = `${rawBc}-${idx + 1}`;
            const subOrd = rawOrdBc ? `${rawOrdBc}-${idx + 1}` : '';
            await pool.query(
              `INSERT INTO requests (
                "sequenceNo", "requestBarcode", subject, unit, "arrivalDate", "requestDate",
                "assignedTo", priority, status, "estimatedAmount", "budgetAmount", "actualAmount",
                currency, supplier, "orderBarcode", "orderDate", regulation, description,
                "purchaseType", "academicYear"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
              [
                r.sequenceNo, subBc, r.subject, r.unit, r.arrivalDate, r.requestDate,
                r.assignedTo, r.priority, r.status, r.estimatedAmount, r.budgetAmount, it.amount || 0,
                r.currency || 'TRY', it.supplier, subOrd, r.orderDate, r.regulation, r.description,
                r.purchaseType || 'MAL', r.academicYear
              ]
            );
          }
        }
      }
    } catch (e) {
      console.error('Request split migration warning:', e.message);
    }
  } catch (err) {
    console.error('Veritabanı ilklendirme hatası:', err.message);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================================');
  console.log(' 🛡️ SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (Güvenli REST API)');
  console.log(` 🌐 Erişim: http://localhost:${PORT}/`);
  console.log('==========================================================');

  // Arka planda şema ve başlangıç verilerini güvenle yükle
  initDatabaseSchema().catch(err => {
    console.error('Veritabanı başlatma hatası:', err.message);
  });

  // 💱 Otomatik Canlı Döviz Kurları (Sunucu açılışında 5 sn sonra çekilir)
  setTimeout(() => {
    fetchTCMBRates().catch(e => console.error('Başlangıç kur çekme hatası:', e.message));
  }, 5000);

  // ⏳ Otomatik Sözleşme Vade & Bitiş Uyarı Motoru (Başlangıçta ve 12 saatte bir çalışır)
  setTimeout(() => {
    checkContractExpirationsAndNotify().catch(e => console.error('Sözleşme kontrolü hatası:', e.message));
  }, 15000);
  setInterval(() => {
    checkContractExpirationsAndNotify().catch(e => console.error('Sözleşme kontrolü hatası:', e.message));
  }, 12 * 60 * 60 * 1000);
});
