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

// Parse NUMERIC / DECIMAL database fields as numbers instead of strings
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUP_DIR = path.join(__dirname, 'backups');

const JWT_SECRET = process.env.JWT_SECRET || 'pruni-satinalma-sec-key-2026-auth-jwt';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
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
const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.txt', '.zip', '.csv'];

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
  const exp = Date.now() + (24 * 60 * 60 * 1000); // 24 saat geçerli
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
// 📥 GÜVENLİ BODY OKUYUCU (MAX BODY LIMIT)
// ----------------------------------------------------
function readBody(req, maxBytes = 25 * 1024 * 1024) {
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
  if (tableName === 'users') {
    // Şifre alanını ASLA API ile açık olarak döndürme
    const res = await pool.query('SELECT id, name, title, role, "isActive", email FROM users ORDER BY id ASC');
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
  const tables = ['users', 'units', 'regulations', 'rates', 'requests', 'contracts', 'invoices', 'guarantees', 'tenders', 'documents', 'logs', 'vendor_ratings', 'settings'];
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
      if (status === 'Tamamlandı') badgeColor = '#10b981';
      else if (status === 'Reddedildi' || status === 'İptal') badgeColor = '#ef4444';
      else if (status === 'Sipariş Verildi' || demand.orderBarcode) badgeColor = '#8b5cf6';
      else badgeColor = '#f59e0b';

      subject = `🔄 Talep Durumu Güncellendi: [${status}] — #${barcode} (${demand.subject || ''})`;
      headerTitle = `Talep Durumu: ${status}`;
      messageText = `Sayın İlgili,<br><br><strong>${demand.unit}</strong> adına kayıtlı <strong>#${barcode}</strong> numaralı satınalma talebinizin süreci güncellenmiştir.<br><br>
      Önceki Durum: <strong>${oldStatus || 'Açık'}</strong> ➔ Güncel Durum: <strong style="color:${badgeColor}; font-size:1.05rem;">${status}</strong>`;
    } else {
      return;
    }

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
      const rateUrl = `http://localhost:${PORT}/rate-vendor.html?reqId=${demand.id || ''}&barcode=${encodeURIComponent(barcode)}&supplier=${encodeURIComponent(demand.supplier || '')}&unit=${encodeURIComponent(demand.unit || '')}&subject=${encodeURIComponent(demand.subject || '')}&type=${encodeURIComponent(pType)}`;
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
  const rateUrl = `http://localhost:${PORT}/rate-vendor.html?reqId=${demand.id || ''}&barcode=${encodeURIComponent(barcode)}&supplier=${encodeURIComponent(demand.supplier || '')}&unit=${encodeURIComponent(demand.unit || '')}&subject=${encodeURIComponent(demand.subject || '')}&type=${encodeURIComponent(pType)}`;

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

  function sendForbidden(msg = 'Bu işlem için ADMIN (Yönetici) yetkisi gereklidir.') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: msg, code: 'FORBIDDEN' }));
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

      const userRes = await pool.query('SELECT id, name, title, role, "isActive", password, email FROM users WHERE id = $1', [parseInt(userId, 10)]);
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
      
      const [users, requests, contracts, invoices, guarantees, logs, units, regulations, rates, tenders, documents, vendorRatings, settings] = await Promise.all([
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
        getTableData('settings').catch(() => [])
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
        settings: settingsMap
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
      const body = await readBody(req, 25 * 1024 * 1024); // max 25MB
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

        // Kullanıcı yönetimi (users) için ADMIN kontrolü
        if (table === 'users' && currentUser?.role !== 'ADMIN') {
          sendForbidden('Kullanıcı hesaplarını yönetmek için ADMIN yetkisi gereklidir.');
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

          const keys = Object.keys(data);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(data[k], k));

          const query = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
          const result = await pool.query(query, values);
          
          const returnedRow = { ...result.rows[0] };
          if (table === 'users') delete returnedRow.password;

          res.writeHead(201);
          res.end(JSON.stringify(returnedRow));

          // Trigger automated unit email on demand creation
          if (table === 'requests' && result.rows[0]) {
            notifyUnitOnDemandEvent(result.rows[0], 'CREATED').catch(e => console.error('Birim e-posta tetikleme hatası:', e.message));
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
          if (table === 'requests') {
            const prevRes = await pool.query('SELECT status FROM requests WHERE id = $1', [id]).catch(() => null);
            oldStatus = prevRes?.rows[0]?.status;
          }

          const keys = Object.keys(data);
          const updates = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(data[k], k));
          values.push(id);

          const query = `UPDATE ${table} SET ${updates} WHERE id = $${values.length} RETURNING *`;
          const result = await pool.query(query, values);
          
          if (result.rowCount === 0) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
          } else {
            const returnedRow = { ...result.rows[0] };
            if (table === 'users') delete returnedRow.password;

            res.writeHead(200); res.end(JSON.stringify(returnedRow));

            // Trigger automated unit email on demand status update
            if (table === 'requests' && result.rows[0] && oldStatus && result.rows[0].status !== oldStatus) {
              notifyUnitOnDemandEvent(result.rows[0], 'STATUS_CHANGED', oldStatus).catch(e => console.error('Birim e-posta güncelleme hatası:', e.message));
            }
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
        if (!currentUser) return sendUnauthorized();
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

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE units ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE vendor_ratings ADD COLUMN IF NOT EXISTS "purchaseType" VARCHAR(50) DEFAULT 'MAL';
      ALTER TABLE vendor_ratings ADD COLUMN IF NOT EXISTS "requestId" INTEGER;
      ALTER TABLE requests ADD COLUMN IF NOT EXISTS "purchaseType" VARCHAR(50) DEFAULT 'MAL';
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
      }
    }
  } catch (err) {
    console.error('Veritabanı ilklendirme hatası:', err.message);
  }
}

initDatabaseSchema().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(' 🛡️ SATINALMA TAKİP SUNUCUSU ÇALIŞIYOR (Güvenli REST API)');
    console.log(` 🌐 Erişim: http://localhost:${PORT}/`);
    console.log('==========================================================');
  });
});
