// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sistemi
//  Talepler.xlsx Otomatik Veritabanı İçe Aktarma Scripti
// ============================================================

const fs = require('fs');
const path = require('path');
const pg = require('pg');
const XLSX = require('xlsx');

// PostgreSQL Bağlantı Havuzu
const pool = new pg.Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'satinalma_db',
  password: process.env.PGPASSWORD || '123456',
  port: parseInt(process.env.PGPORT, 10) || 5432,
});

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  if (typeof val === 'string' && val.includes('.')) {
    const parts = val.trim().split('.');
    if (parts.length === 3) {
      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return String(val);
}

function sanitizeVal(val, k) {
  if (val === undefined || val === null || (typeof val === 'number' && isNaN(val))) return null;
  if (typeof val === 'string' && val.trim() === '') return null;
  return val;
}

async function importExcel() {
  const excelFile = path.join(__dirname, 'Talepler.xlsx');
  if (!fs.existsSync(excelFile)) {
    console.error('❌ Talepler.xlsx dosyası bulunamadı:', excelFile);
    process.exit(1);
  }

  console.log('📖 Talepler.xlsx okunuyor...');
  const workbook = XLSX.readFile(excelFile);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Satırlar index 4'ten (5. satır) başlıyor
  const dataRows = rows.slice(4).filter(r => r && (r[0] || r[7]));

  console.log(`📊 Excel'den ${dataRows.length} adet talep satırı tespit edildi.`);

  const client = await pool.connect();
  try {
    await client.query("SET client_encoding = 'UTF8'");

    // Birimler, Kullanıcılar ve Yönetmelikler kümeleri
    const unitsSet = new Set();
    const usersSet = new Set();
    const regulationsSet = new Set();

    const requests = [];

    for (const r of dataRows) {
      const seqNo = parseInt(r[0], 10) || null;
      const assignedTo = r[1] ? String(r[1]).trim() : 'Henüz Atanmadı';
      const arrivalDate = parseExcelDate(r[2]) || parseExcelDate(r[3]) || new Date().toISOString().split('T')[0];
      const requestBarcode = r[4] ? String(r[4]).trim() : String(Math.floor(100000000 + Math.random() * 900000000));
      const orderDate = parseExcelDate(r[5]);
      const orderBarcode = r[6] ? String(r[6]).trim() : null;
      const subject = r[7] ? String(r[7]).trim() : 'Satınalma Talebi';
      const description = r[8] ? String(r[8]).trim() : '';
      const status = r[9] ? String(r[9]).trim() : 'Açık';
      const unit = r[10] ? String(r[10]).trim() : 'Genel Sekreterlik';
      const regulation = r[11] ? String(r[11]).trim() : '';
      const priority = r[12] ? String(r[12]).trim() : 'Orta';
      const estimatedAmount = typeof r[13] === 'number' ? r[13] : (parseFloat(r[13]) || 0);
      const actualAmount = typeof r[14] === 'number' ? r[14] : (parseFloat(r[14]) || 0);
      const currency = r[15] ? String(r[15]).trim() : 'TRY';
      const exchangeRate = typeof r[16] === 'number' ? r[16] : (parseFloat(r[16]) || 1);
      const supplier = r[17] ? String(r[17]).trim() : '';

      if (unit && unit !== 'Bilinmeyen Birim') unitsSet.add(unit);
      if (assignedTo && assignedTo !== 'Henüz Atanmadı') usersSet.add(assignedTo);
      if (regulation) regulationsSet.add(regulation);

      requests.push({
        sequenceNo: seqNo,
        requestBarcode,
        subject,
        unit,
        arrivalDate,
        assignedTo,
        priority,
        status,
        estimatedAmount,
        actualAmount,
        currency,
        exchangeRate,
        supplier,
        orderBarcode,
        orderDate,
        regulation,
        description,
        purchaseType: 'MAL'
      });
    }

    console.log('🏛️ Birimler ve kullanıcılar kaydediliyor...');
    for (const u of unitsSet) {
      await client.query('INSERT INTO units (name) VALUES ($1) ON CONFLICT DO NOTHING', [u]);
    }

    for (const usr of usersSet) {
      await client.query(
        'INSERT INTO users (name, title, role, "isActive", password) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [usr, 'Satınalma Uzmanı', 'STAFF', true, '123456']
      );
    }

    for (const reg of regulationsSet) {
      await client.query('INSERT INTO regulations (name) VALUES ($1) ON CONFLICT DO NOTHING', [reg]);
    }

    console.log('📥 Talepler veritabanına aktarılıyor...');
    let importedCount = 0;
    for (const req of requests) {
      const keys = Object.keys(req);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map(k => sanitizeVal(req[k], k));

      await client.query(`INSERT INTO requests (${cols}) VALUES (${placeholders})`, values);
      importedCount++;
    }

    console.log(`✅ BAŞARILI: Toplam ${importedCount} adet talep Talepler.xlsx dosyasından veritabanına aktarıldı!`);
  } catch (err) {
    console.error('❌ İçe aktarma hatası:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

importExcel();
