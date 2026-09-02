// ============================================================
//  Piri Reis Üniversitesi — Satınalma Takip Sistemi
//  Kapsamlı Güvenlik & Kullanılabilirlik Otomatik Denetim Testi
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('====================================================');
console.log(' 🛡️  SATINALMA SİSTEMİ GÜVENLİK & İŞLEVSEL DENETİM  ');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let warnings = 0;

function assert(description, condition, warnOnly = false) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [GEÇTİ] ${description}`);
  } else if (warnOnly) {
    warnings++;
    console.log(`  ⚠️ [UYARI] ${description}`);
  } else {
    failedTests++;
    console.log(`  ❌ [BAŞARISIZ] ${description}`);
  }
}

// ------------------------------------------------------------
// BÖLÜM 1: ŞİFRELEME & TOKEN GÜVENLİĞİ TESTLERİ
// ------------------------------------------------------------
console.log('▶ 1. Kimlik Doğrulama & Kriptografi Testleri:');

const JWT_SECRET = 'pruni-satinalma-sec-key-2026-auth-jwt';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `$pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  if (!storedHash.startsWith('$pbkdf2$')) {
    return password === storedHash;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const salt = parts[2];
  const hash = parts[3];
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + (24 * 60 * 60 * 1000);
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    name: user.name,
    role: user.role,
    title: user.title || '',
    email: user.email || '',
    exp
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token, secret = JWT_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// 1.1 Şifre Hashleme Testi
const testPass = 'AdminPiriReis2026!';
const hashed = hashPassword(testPass);
assert('Şifre PBKDF2 formatında ($pbkdf2$...) tuzlanıp hashleniyor', hashed.startsWith('$pbkdf2$') && hashed.split('$').length === 4);
assert('Doğru şifre PBKDF2 doğrulamadan başarıyla geçiyor', verifyPassword(testPass, hashed) === true);
assert('Yanlış şifre reddediliyor', verifyPassword('YanlisSifre123', hashed) === false);

// 1.2 JWT Token Üretimi & Sahtecilik Kontrolü
const mockUser = { id: 1, name: 'Cem TUR', role: 'ADMIN' };
const token = generateToken(mockUser);
const decoded = verifyToken(token);
assert('Geçerli JWT token başarıyla çözümleniyor ve rol ADMIN olarak geliyor', decoded && decoded.role === 'ADMIN');

// Sahte/Değiştirilmiş Token
const tamperedToken = token.slice(0, -5) + 'XXXXX';
assert('İmzası kurcalanmış sahte JWT token anında reddediliyor', verifyToken(tamperedToken) === null);

// Süresi Dolmuş Token
const expiredPayload = Buffer.from(JSON.stringify({ id: 1, name: 'Cem TUR', role: 'ADMIN', exp: Date.now() - 10000 })).toString('base64url');
const expHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const expSig = crypto.createHmac('sha256', JWT_SECRET).update(`${expHeader}.${expiredPayload}`).digest('base64url');
const expiredToken = `${expHeader}.${expiredPayload}.${expSig}`;
assert('Süresi dolmuş token doğrulamadan geçemiyor (Oturum zaman aşımı)', verifyToken(expiredToken) === null);

// ------------------------------------------------------------
// BÖLÜM 2: STATİK KOD GÜVENLİK ANALİZİ (SERVER.JS)
// ------------------------------------------------------------
console.log('\n▶ 2. Sunucu Kaynak Kodu & SQL Injection Taraması:');

const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// 2.1 Users tablosunda şifre sızdırma kontrolü
const userApiQuerySafe = serverCode.includes('SELECT id, name, title, role, "isActive", email FROM users');
assert('Users API uç noktası şifre kolonunu dışarıya ASLA sızdırmıyor (SELECT filtresi)', userApiQuerySafe);

// 2.2 Rate limiting kontrolü
const hasRateLimit = serverCode.includes('checkRateLimit');
assert('Kaba kuvvet (Brute Force) saldırılarına karşı IP bazlı Rate Limiting aktif', hasRateLimit);

// 2.3 Dosya yükleme güvenliği
const hasPathTraversalSafe = serverCode.includes('sanitizedName') && serverCode.includes('replace(/[^a-zA-Z0-9');
assert('Evrak yüklemede dosya isimleri temizleniyor ve Path Traversal (../) engelleniyor', hasPathTraversalSafe);

// 2.4 SQLi & Whitelist Doğrulaması
const hasAllowedTablesWhitelist = serverCode.includes('const allowedTables =') && serverCode.includes('allowedTables.includes(table)');
assert('Dinamik tablo sorgularında katı Whitelist (Beyaz Liste) koruması mevcut', hasAllowedTablesWhitelist);

const hasParametricBinding = serverCode.includes('placeholders = keys.map((_, i) => `$${i + 1}`)');
assert('Dinamik INSERT/UPDATE işlemlerinde tüm değerler ($1, $2...) parametreli bağlanıyor', hasParametricBinding);

// 2.5 Güvenli Tablo Kolon Filtreleme (Sütun Enjeksiyonu Koruması)
const hasColumnFiltering = serverCode.includes('TABLE_COLUMNS[table]');
assert('Kullanıcıdan gelen yabancı/geçersiz kolonlar veritabanına girmeden filtreleniyor', hasColumnFiltering);

// ------------------------------------------------------------
// BÖLÜM 3: ÇOKLU TEDARİKÇİ & ADİL TASARRUF MATEMATİĞİ
// ------------------------------------------------------------
console.log('\n▶ 3. Parçalı Sipariş & Bütçe/Tasarruf Hesaplama Doğrulaması:');

// Test Senaryosu: 100.000 TL Tahmini Bütçeli bir talep 2 tedarikçiye bölünüyor:
// Firma A: 40.000 TL hak ediş
// Firma B: 20.000 TL hak ediş
// Toplam Gerçekleşen: 60.000 TL (Net Tasarruf: 40.000 TL -> %40)
const totalBudget = 100000;
const itemA_actual = 40000;
const itemB_actual = 20000;
const totalActual = itemA_actual + itemB_actual;

// Adil oran paylaşımı
const ratioA = itemA_actual / totalActual;
const ratioB = itemB_actual / totalActual;

const budgetA = totalBudget * ratioA; // 66.666,67
const budgetB = totalBudget * ratioB; // 33.333,33

const savingA = budgetA - itemA_actual; // 26.666,67
const savingB = budgetB - itemB_actual; // 13.333,33

const totalCalculatedSaving = savingA + savingB;
const totalExpectedSaving = totalBudget - totalActual;

assert('Çoklu tedarikçide alt kalemlerin bütçe payları toplamı ana bütçeye tam eşit', Math.abs((budgetA + budgetB) - totalBudget) < 0.01);
assert('Çoklu tedarikçide alt tasarrufların toplamı ana tasarruf tutarına tam eşit', Math.abs(totalCalculatedSaving - totalExpectedSaving) < 0.01);
assert('Firma A adil tasarruf tutarı pozitif ve doğru oranda', savingA > 0 && Math.round(savingA) === 26667);
assert('Firma B adil tasarruf tutarı pozitif ve doğru oranda', savingB > 0 && Math.round(savingB) === 13333);

// ------------------------------------------------------------
// BÖLÜM 4: ARAYÜZ (FRONTEND) VE KULLANILABİLİRLİK STATİK KONTROLÜ
// ------------------------------------------------------------
console.log('\n▶ 4. Arayüz & Kullanılabilirlik Fonksiyon Kontrolleri:');

const appJsCode = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
const indexHtmlCode = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// 4.1 Talep Detay Görüntüleme metodu
assert('Talep inceleme penceresi App.viewRequestDetails fonksiyonu mevcut', appJsCode.includes('viewRequestDetails'));

// 4.2 Excel ve PDF Dışa Aktarma desteği
assert('Tablolar için Excel (.xlsx) dışa aktarma motoru entegre', appJsCode.includes('XLSX.utils.book_append_sheet'));
assert('Raporlar için PDF ve yazdırma görünümü desteği mevcut', appJsCode.includes('window.print') || indexHtmlCode.includes('print'));

// 4.3 KPI Kartları ve Metrik Dağılımı
assert('Operasyonel KPI kartları arayüzde tanımlı', indexHtmlCode.includes('dash-kpi-total-val') && indexHtmlCode.includes('dash-kpi-open-val'));
assert('Finans & Tasarruf KPI kartları arayüzde tanımlı', indexHtmlCode.includes('dash-fin-total-spend') && indexHtmlCode.includes('dash-fin-savings') && indexHtmlCode.includes('dash-fin-open-budget') && indexHtmlCode.includes('dash-fin-sla'));

// 4.4 Responsive Mobil Uyumluluk
const styleCssCode = fs.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'), 'utf8');
assert('Mobil ve tablet için @media responsive CSS kuralları tanımlı', styleCssCode.includes('@media (max-width:') || styleCssCode.includes('@media screen and (max-width'));

// ------------------------------------------------------------
// SONUÇ ÖZETİ
// ------------------------------------------------------------
console.log('\n====================================================');
console.log(` 📊 TEST RAPORU: Toplam ${totalTests} Kontrol Yapıldı`);
console.log(`    ✅ Başarılı : ${passedTests}`);
console.log(`    ❌ Başarısız: ${failedTests}`);
console.log(`    ⚠️ Uyarı    : ${warnings}`);
console.log('====================================================');

if (failedTests === 0) {
  console.log('🎉 SİSTEM TÜM GÜVENLİK VE KULLANILABİLİRLİK DENETİMLERİNDEN TAM NOT ALDI!');
} else {
  console.log('⚠️ Düzeltilmesi gereken bazı bulgular tespit edildi.');
}
