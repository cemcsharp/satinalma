// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sunucusu (Node.js)
//  Veritabanı: PostgreSQL (REST API)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
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

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

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
  const snapshot = { exportedAt: new Date().toISOString(), version: '2.0.0' };
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

    // Look up unit email
    const unitRes = await pool.query('SELECT email FROM units WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [demand.unit]);
    const unitEmail = unitRes.rows[0]?.email;
    if (!unitEmail || !unitEmail.includes('@')) {
      console.log(`ℹ️ "${demand.unit}" birimi için kayıtlı geçerli bir e-posta bulunamadı, bildirim gönderilmedi.`);
      return;
    }

    // Look up assigned expert email/phone if any
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

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #64748b; line-height: 1.5;">
            💡 <em>Bu bilgilendirme e-postası Piri Reis Üniversitesi Satınalma Takip Sistemi tarafından otomatik olarak gönderilmiştir. Talebinizin durumunu kurum içi takip portalından inceleyebilirsiniz.</em>
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

    // Add log
    await pool.query(
      'INSERT INTO logs (timestamp, "user", action, details) VALUES ($1, $2, $3, $4)',
      [dateStr, 'Sistem (E-Posta Servisi)', 'Birim Bilgilendirme E-Postası', `Talep #${barcode} için "${demand.unit}" birimine (${unitEmail}) e-posta gönderildi. [${eventType}]`]
    ).catch(() => {});

    console.log(`✉️ Birim E-Postası Gönderildi -> ${demand.unit} (${unitEmail}) [${eventType} - #${barcode}]`);
  } catch (err) {
    console.error('Birim bilgilendirme e-posta hatası:', err.message);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;
  const method = req.method.toUpperCase();
  const parts = urlPath.split('/').filter(Boolean);

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
      
      const [users, requests, contracts, invoices, guarantees, logs, units, regulations, rates, tenders, documents, vendorRatings, settings] = await Promise.all([
        getTableData('users'),
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
    // 📧 SMTP & E-MAIL ENDPOINTS
    // ----------------------------------------------------
    if (urlPath === '/api/settings/smtp' && method === 'GET') {
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
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const { testEmail } = JSON.parse(body || '{}');
      
      const cfg = await getSmtpConfig();
      if (!cfg || !cfg.host || !cfg.user) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'SMTP ayarları yapılandırılmamış. Lütfen önce sunucu ve kullanıcı bilgilerini giriniz.' }));
        return;
      }

      try {
        const transporter = createSmtpTransporter(cfg);
        const target = testEmail || cfg.user;
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
        res.end(JSON.stringify({ success: false, error: 'E-posta gönderilemedi: ' + err.message }));
      }
      return;
    }

    if (urlPath === '/api/email/send-alert' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const { to, subject, title, details, actionUrl } = JSON.parse(body || '{}');

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
    // 📥 EXCEL BATCH IMPORT ENDPOINT
    // ----------------------------------------------------
    if ((urlPath === '/api/demands/batch' || urlPath === '/api/import-excel-requests') && method === 'POST') {
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
          [dateStr, 'Sistem (Excel Import)', 'Toplu Talep İçe Aktarma', `${inserted.length} adet talep Excel dosyasından toplu yüklendi.`]
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
    // 🗄️ BACKUP & RESTORE MANAGEMENT ENDPOINTS
    // ----------------------------------------------------
    if (urlPath === '/api/backups' && method === 'GET') {
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
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const backupInfo = await createBackupFile(false);
      res.writeHead(201);
      res.end(JSON.stringify({ success: true, backup: backupInfo }));
      return;
    }

    if ((urlPath.startsWith('/api/backups/download/') || urlPath === '/api/backups/download') && method === 'GET') {
      let filename = url.searchParams.get('filename');
      if (!filename && urlPath.startsWith('/api/backups/download/')) {
        filename = path.basename(urlPath.replace('/api/backups/download/', ''));
      }
      if (!filename || (!filename.endsWith('.json') && !filename.endsWith('.sql'))) {
        res.writeHead(400); res.end('Geçersiz dosya adı'); return;
      }
      const filePath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end('Yedek dosyası bulunamadı'); return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (urlPath === '/api/backups/restore' && method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      const { filename } = JSON.parse(body || '{}');
      if (!filename) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Yedek dosya adı belirtilmedi.' })); return;
      }
      const filePath = path.join(BACKUP_DIR, filename);
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
      res.end(JSON.stringify({ success: true, message: `Veritabanı "${filename}" yedeğinden başarıyla geri yüklendi!` }));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'backups' && parts[2] && method === 'DELETE') {
      const filename = parts[2];
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

    // Document specific endpoints
    if (urlPath === '/api/documents' && method === 'GET') {
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
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const body = await readBody(req);
      if (!body) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Dosya verisi bulunamadı.' })); return;
      }
      try {
        const data = JSON.parse(body);
        const { entityType, entityId, fileName, fileData, fileType, category, description, uploadedBy } = data;
        
        if (!entityType || !entityId || !fileName || !fileData) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Gerekli alanlar eksik (entityType, entityId, fileName, fileData).' })); return;
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
          uploadedBy || 'Sistem',
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
        const fPath = path.join(UPLOAD_DIR, doc.storedFileName);
        if (fs.existsSync(fPath)) {
          const zipEntryName = doc.category ? `${doc.category} - ${doc.fileName}` : doc.fileName;
          zipArchive.file(fPath, { name: zipEntryName });
        }
      }
      zipArchive.finalize();
      return;
    }

    // 2. Generic REST CRUD API
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
      const filePath = path.join(UPLOAD_DIR, doc.storedFileName);
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
      const docId = parseInt(parts[2], 10);
      const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
      if (docRes.rowCount > 0) {
        const doc = docRes.rows[0];
        const fPath = path.join(UPLOAD_DIR, doc.storedFileName);
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

    if (parts[0] === 'api' && parts.length >= 2 && urlPath !== '/api/data') {
      const table = parts[1];
      const allowedTables = ['users', 'requests', 'contracts', 'invoices', 'guarantees', 'logs', 'units', 'regulations', 'tenders', 'documents', 'vendor_ratings', 'settings'];
      
      if (allowedTables.includes(table)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // POST /api/:table
        if (method === 'POST') {
          const body = await readBody(req);
          if (!body) { res.writeHead(400); res.end(JSON.stringify({ error: 'Empty body' })); return; }
          const data = JSON.parse(body);
          
          delete data.id;

          const keys = Object.keys(data);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => sanitizeVal(data[k], k));

          const query = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
          const result = await pool.query(query, values);
          
          res.writeHead(201);
          res.end(JSON.stringify(result.rows[0]));

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
          
          // If updating request, fetch previous status to detect change
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
            res.writeHead(200); res.end(JSON.stringify(result.rows[0]));

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
