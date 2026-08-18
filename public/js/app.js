// Satınalma Takip App - Frontend Controller

const App = {
  state: {
    currentView: 'dashboard',
    selectedYear: '2025-2026',
    currentUser: null,
    isLoggedIn: false,
    theme: 'dark',
    requests: [],
    users: [],
    units: [],
    regulations: [],
    contracts: [],
    invoices: [],
    logs: [],
    rates: { USD: 36.50, EUR: 39.80 },
    invoiceDatePeriod: 'ALL',
    currentPage: 1,
    pageSize: 15,
    yearlyActiveTab: 'financial',
    dismissedNotifs: [],
    documents: [],
    currentDocEntity: { entityType: null, entityId: null, title: '' },
    notifFilter: 'ALL',
    notifCategory: 'ALL',
    notifSearch: '',
    matrixSearch: '',
    matrixRegulation: 'ALL',
    matrixSupplier: 'ALL',
    matrixGroupBy: 'REG_FIRST',
    expandedMatrixGroups: new Set(),
    expandedMatrixSubGroups: new Set(),
    vendorRatings: [],
    smtpConfig: null,
    parsedExcelData: [],
    charts: {}
  },

    async authFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = options.headers ? { ...options.headers } : {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const opts = { ...options, headers };
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        console.warn('Oturum süresi doldu veya yetkisiz istek.');
        if (this.state.isLoggedIn) {
          this.handleLogout();
          this.showToast('Oturum süreniz doldu, lütfen tekrar giriş yapın.', 'warning');
        }
      }
      return res;
    } catch (err) {
      console.error(`authFetch Hatası (${url}):`, err);
      throw err;
    }
  },

  async fetchUsersList() {
    try {
      const res = await fetch('/api/auth/users-list');
      if (res.ok) {
        const users = await res.json();
        this.state.users = users;
        this.populateLoginDropdown();
      }
    } catch (e) {
      console.error('fetchUsersList error:', e);
      this.populateLoginDropdown();
    }
  },

async init() {
    console.log("Initializing Satınalma Takip App (Güvenli Mod)...");
    this.initTheme();
    this.bindEvents();
    await this.fetchUsersList();

    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      try {
        const meRes = await this.authFetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          this.state.currentUser = meData.user;
          this.state.isLoggedIn = true;
          document.getElementById('login-screen').style.display = 'none';
          document.getElementById('app').style.display = 'flex';
          this.updateUserProfileCard();
          await this.fetchInitialData();
          const savedView = localStorage.getItem('activeView') || 'dashboard';
          this.switchView(savedView);
          this.handleHashRoute();
          return;
        }
      } catch (e) {
        console.error('Session validation failed:', e);
      }
    }

    this.handleLogout();
  },

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    this.setTheme(savedTheme);
  },

  setTheme(themeName) {
    this.state.theme = themeName;
    localStorage.setItem('theme', themeName);
    const body = document.body;
    const btnIcon = document.getElementById('theme-icon');
    const btnText = document.getElementById('theme-text');

    if (themeName === 'light') {
      body.classList.add('light-theme');
      if (btnIcon) btnIcon.innerText = '🌙';
      if (btnText) btnText.innerText = 'Koyu Tema';
    } else {
      body.classList.remove('light-theme');
      if (btnIcon) btnIcon.innerText = '☀️';
      if (btnText) btnText.innerText = 'Açık Tema';
    }

    if (this.state.isLoggedIn) {
      this.render();
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.innerText = isCollapsed ? '▶' : '◀';
    }
    // Trigger window resize event so charts and tables refit smoothly
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 260);
  },

  async fetchInitialData() {
    try {
      const res = await this.authFetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        this.state.requests = (data.requests || []).map(r => ({
          ...r,
          academicYear: r.academicYear || this.getAcademicYear(r.arrivalDate || r.requestDate)
        }));
        this.state.users = data.users || [];
        this.state.units = data.units || [];
        this.state.regulations = data.regulations || [];
        this.state.contracts = data.contracts || [];
        this.state.guarantees = data.guarantees || [];
        this.state.invoices = data.invoices || [];
        this.state.tenders = data.tenders || [];
        this.state.logs = data.logs || [];
        this.state.documents = data.documents || [];
        this.state.vendorRatings = (data.vendorRatings || []).map(r => this.normalizeRating(r)).filter(Boolean);
        this.state.settings = data.settings || {};
        if (data.rates) this.state.rates = data.rates;
        this.state.dismissedNotifs = JSON.parse(localStorage.getItem('dismissedNotifs') || '[]');

        this.populateLoginDropdown();
        this.populateDropdowns();
        this.populateYearSelect();
        this.syncRatesInputUI();
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  },

  populateLoginDropdown() {
    const loginSelect = document.getElementById('login-screen-user-select');
    if (!loginSelect) return;
    const currentVal = loginSelect.value;
    
    const usersList = (this.state.users && this.state.users.length > 0) ? this.state.users : [
      { id: 1, name: 'Cem TUR', title: 'Satınalma Mdr. Yrd.', isActive: true },
      { id: 2, name: 'Merih AVCI', title: 'Satınalma Müdürü', isActive: true },
      { id: 3, name: 'Gülsüm YILDIRIM', title: 'Satınalma Kd. Uz.', isActive: true },
      { id: 4, name: 'Sultan MERİÇ', title: 'Satınalma Uzmanı', isActive: true },
      { id: 5, name: 'Caner TÜRKMEN', title: 'IT Uzmanı', isActive: true },
      { id: 6, name: 'Hilal AKYOL', title: 'Satınalma Asistanı', isActive: true }
    ];

    const sortedUsers = [...usersList].sort((a,b) => (b.isActive?1:0) - (a.isActive?1:0));
    let html = '<option value="">-- Lütfen Personel Seçin --</option>';
    sortedUsers.forEach(u => {
      const statusLabel = u.isActive !== false ? '' : ' (Pasif/Ayrıldı)';
      html += `<option value="${u.id}" ${String(u.id) === String(currentVal) ? 'selected' : ''}>${u.name} - ${u.title}${statusLabel}</option>`;
    });
    loginSelect.innerHTML = html;
  },

  getAcademicYearFromDate(dateStr) {
    if (!dateStr) return this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear;
    const yr = d.getFullYear();
    const m = d.getMonth();
    if (m >= 8) {
      return `${yr}-${yr + 1}`;
    } else {
      return `${yr - 1}-${yr}`;
    }
  },

  getAcademicYear(dateStr) {
    return this.getAcademicYearFromDate(dateStr);
  },

  parseMoney(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let s = String(val).trim();
    if (!s) return 0;
    // Remove currency symbols, extra spaces
    s = s.replace(/[₺$€\s]/g, '');
    if (s.includes('.') && s.includes(',')) {
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) {
        // Turkish/European standard: 3.340,50 -> 3340.50
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // US standard: 3,340.50 -> 3340.50
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    s = s.replace(/[^0-9.-]/g, '');
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  },

  formatMoney(amount, currency = 'TRY', decimals = 2) {
    const num = typeof amount === 'number' ? (isNaN(amount) ? 0 : amount) : this.parseMoney(amount);
    const curr = currency || 'TRY';
    const symbolMap = { 'TRY': '₺', 'USD': '$', 'EUR': '€' };
    const sym = symbolMap[curr] || curr;
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}\u00A0${sym}`;
  },

  onAmountInput(inputEl, currencySelectOrCode = 'TRY', isActual = false) {
    if (!inputEl) return;
    const previewId = inputEl.id + '-preview';
    let previewEl = document.getElementById(previewId);
    if (!previewEl) {
      previewEl = inputEl.parentElement?.querySelector('.amount-live-preview');
    }
    if (!previewEl) return;

    const rawVal = inputEl.value?.trim();
    if (!rawVal) {
      previewEl.innerText = '';
      previewEl.classList.remove('has-value');
      return;
    }

    let currCode = 'TRY';
    if (currencySelectOrCode) {
      const selectEl = document.getElementById(currencySelectOrCode);
      if (selectEl) {
        currCode = selectEl.value || 'TRY';
      } else {
        currCode = currencySelectOrCode;
      }
    }

    const num = this.parseMoney(rawVal);
    const formatted = this.formatMoney(num, currCode, 2);
    previewEl.innerHTML = `💵 <strong>${formatted}</strong>`;
    previewEl.classList.add('has-value');
  },

  onCurrencyChange(currencySelectId, inputIds = []) {
    inputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value) {
        this.onAmountInput(el, currencySelectId);
      }
    });
  },

  populateYearSelect() {
    // Akademik yılı Ağustos 1 başlangıç - Temmuz 31 bitiş olarak hesapla
    // Bugünün tarihine ve verilerdeki tüm yıllara göre selector'ü otomatik doldur
    const yearSelect = document.getElementById('global-year-select');
    if (!yearSelect) return;

    // Sistemdeki tüm kayıtlardaki academicYear değerlerini topla
    const existingYears = new Set();
    (this.state.requests || []).forEach(r => { if (r.academicYear) existingYears.add(r.academicYear); });
    (this.state.contracts || []).forEach(c => { if (c.academicYear) existingYears.add(c.academicYear); });
    (this.state.invoices || []).forEach(i => { if (i.academicYear) existingYears.add(i.academicYear); });

    // Bugünün tarihine göre mevcut akademik yılı hesapla (Eylül 1 = yeni yıl başlangıcı)
    const now = new Date();
    const curCalYear = now.getFullYear();
    const isNewAcademicYear = now.getMonth() >= 8; // Eylül = 8 (0-indexed)
    const currentAcademicYear = isNewAcademicYear
      ? `${curCalYear}-${curCalYear + 1}`
      : `${curCalYear - 1}-${curCalYear}`;
    existingYears.add(currentAcademicYear);

    // Sıralı, benzersiz liste
    const sortedYears = Array.from(existingYears).sort((a, b) => b.localeCompare(a));

    const currentVal = yearSelect.value;
    yearSelect.innerHTML = '<option value="ALL">Tüm Yıllar</option>' +
      sortedYears.map(y => `<option value="${y}"${y === (this.state.selectedYear || currentAcademicYear) ? ' selected' : ''}>${y}</option>`).join('');
    
    this.state.selectedYear = yearSelect.value;
  },

  populateDropdowns() {
    // Populate unit dropdowns
    const unitSelects = ['filter-unit', 'select-unit-analysis', 'nr-unit', 'er-unit', 'cm-unit', 'gm-unit', 'tm-unit', 'filter-contract-unit', 'filter-my-unit', 'filter-supplier-unit', 'filter-delegation-unit', 'filter-tender-unit'];
    unitSelects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isFilter = id.startsWith('filter') || id.startsWith('select');
      el.innerHTML = isFilter ? '<option value="ALL">Tüm Birimler</option>' : '<option value="">Birim Seçin</option>';
      this.state.units.forEach(u => {
        const uName = typeof u === 'object' ? u.name : u;
        el.innerHTML += `<option value="${uName}">${uName}</option>`;
      });
    });

    // Populate user dropdowns
    const filterPersonEl = document.getElementById('filter-person');
    if (filterPersonEl) {
      filterPersonEl.innerHTML = '<option value="ALL">Tüm Personel (Aktif + Pasif)</option>';
      this.state.users.forEach(u => {
        const statusLabel = u.isActive !== false ? '' : ' (Pasif)';
        filterPersonEl.innerHTML += `<option value="${u.name}">${u.name}${statusLabel}</option>`;
      });
    }

    const delegateFromEl = document.getElementById('delegate-from-person');
    if (delegateFromEl) {
      delegateFromEl.innerHTML = '<option value="ALL">Tüm Açık Talepler</option>' +
        '<option value="Henüz Atanmadı">⏳ Henüz Atanmamış (Havuzdaki Talepler)</option>';
      this.state.users.filter(u => u.isActive !== false).forEach(u => {
        delegateFromEl.innerHTML += `<option value="${u.name}">👤 ${u.name} (${u.title})</option>`;
      });
    }

    // Active personnel only for assignments
    const activeUsers = this.state.users.filter(u => u.isActive !== false);
    const assignSelects = ['nr-assigned-to', 'er-assigned-to', 'delegate-to-person', 'cm-assigned-to', 'bulk-delegate-person'];
    assignSelects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'nr-assigned-to') {
        el.innerHTML = '<option value="Henüz Atanmadı">⏳ Henüz Atanmadı (Havuzda Bekleyen)</option>';
      } else {
        el.innerHTML = '<option value="">Aktif Personel Seçin</option>';
      }
      activeUsers.forEach(u => {
        el.innerHTML += `<option value="${u.name}">${u.name} (${u.title})</option>`;
      });
    });

    // Populate regulation dropdowns
    const regSelects = ['nr-regulation', 'er-regulation'];
    regSelects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '<option value="">Yönetmelik Maddesi (Opsiyonel)</option>';
      this.state.regulations.forEach(r => {
        const rName = typeof r === 'object' ? r.name : r;
        const val = rName.toString().replace('Madde ', '');
        el.innerHTML += `<option value="${val}">Madde ${val}</option>`;
      });
    });
  },

  async handleLogin(e) {
    e.preventDefault();
    const selectEl = document.getElementById('login-screen-user-select');
    const selectedVal = selectEl?.value;
    const passInput = document.getElementById('login-screen-password')?.value || '';
    const errMsg = document.getElementById('login-error-msg');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!selectedVal) {
      if (errMsg) {
        errMsg.innerText = '⚠️ Lütfen listeden bir personel seçin!';
        errMsg.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = '⏳ Giriş Yapılıyor...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(selectedVal, 10), password: passInput })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (errMsg) {
          errMsg.innerText = `⚠️ ${data.error || 'Şifre hatalı! Lütfen tekrar deneyin.'}`;
          errMsg.style.display = 'block';
        }
        return;
      }

      // Başarılı Giriş
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('loggedInUserId', data.user.id);
      this.state.currentUser = data.user;
      this.state.isLoggedIn = true;

      if (errMsg) errMsg.style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';

      this.updateUserProfileCard();
      await this.fetchInitialData();
      
      const savedView = localStorage.getItem('activeView') || 'dashboard';
      this.switchView(savedView);
      this.showToast(`Hoş geldiniz, Sayın ${data.user.name}`, 'success', '👋');
    } catch (err) {
      console.error('Login error:', err);
      if (errMsg) {
        errMsg.innerText = '⚠️ Sunucu ile bağlantı kurulamadı.';
        errMsg.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = '🚀 Güvenli Giriş Yap';
      }
    }
  },

  async handleLogout() {
    try {
      await this.authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch (e) {}
    this.state.isLoggedIn = false;
    this.state.currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('loggedInUserId');
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    const passField = document.getElementById('login-screen-password');
    if (passField) passField.value = '';
    const errMsg = document.getElementById('login-error-msg');
    if (errMsg) errMsg.style.display = 'none';
    this.populateLoginDropdown();
  },

  updateUserProfileCard() {
    const user = this.state.currentUser;
    if (!user) return;

    document.getElementById('user-avatar').innerText = user.name.split(' ').map(n=>n[0]).join('');
    document.getElementById('user-name').innerText = user.name;
    document.getElementById('user-role-label').innerText = `${user.title} (${user.role})`;
  },

  handleHashRoute() {
    const hash = window.location.hash;
    if (!hash) return;

    if (hash.startsWith('#request/')) {
      const reqId = parseInt(hash.replace('#request/', ''));
      if (!isNaN(reqId)) {
        this.switchView('requests');
        setTimeout(() => this.viewRequestDetails(reqId), 150);
      }
    } else if (hash.startsWith('#contract/')) {
      const contractId = parseInt(hash.replace('#contract/', ''));
      if (!isNaN(contractId)) {
        this.switchView('contracts');
        setTimeout(() => this.viewContractDetails(contractId), 150);
      }
    } else if (hash.startsWith('#invoice/')) {
      const invoiceId = parseInt(hash.replace('#invoice/', ''));
      if (!isNaN(invoiceId)) {
        this.switchView('invoices');
        setTimeout(() => this.viewInvoiceDetails(invoiceId), 150);
      }
    }
  },

  _handleLinkClick(event, type, id) {
    if (event.ctrlKey || event.metaKey || event.button === 1) {
      return true;
    }
    event.preventDefault();
    if (type === 'request') this.viewRequestDetails(id);
    else if (type === 'contract') this.viewContractDetails(id);
    else if (type === 'invoice') this.viewInvoiceDetails(id);
  },

  async handlePortalSearch(query) {
    const resultsBox = document.getElementById('portal-search-results');
    if (!resultsBox) return;

    const cleanQ = query?.toString().replace(/^#/, '').toLowerCase().trim();
    if (!cleanQ || cleanQ.length < 2) {
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          🔒 Sorgulamak istediğiniz talep barkod numarasını eksiksiz girin.
        </div>
      `;
      return;
    }

    try {
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          ⏳ Barkod sorgulanıyor...
        </div>
      `;

      const res = await fetch(`/api/public/search-demand?barcode=${encodeURIComponent(cleanQ)}`);
      if (!res.ok) throw new Error('Arama hatası');
      const matches = await res.json();

      if (!matches || matches.length === 0) {
        resultsBox.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--status-rejected); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
            ⚠️ "${query}" numaralı bir talep kaydı bulunamadı. Lütfen barkod veya sipariş numaranızı kontrol edin.
          </div>
        `;
        return;
      }

      resultsBox.innerHTML = matches.map(r => {
        let orderStatusText = '🚚 İşlemde / Sipariş Sürecinde';
        if (r.status === 'Tamamlandı') orderStatusText = '✅ Tamamlandı / Kapatıldı';
        else if (r.status === 'Reddedildi' || r.status === 'İptal') orderStatusText = '❌ İptal Edildi';
        else if (r.orderBarcode) orderStatusText = `🚚 Sipariş Verildi (#${r.orderBarcode})`;

        const expertUser = (this.state.users || []).find(u => u.name === r.assignedTo);
        const expertPhone = expertUser?.phone || (r.assignedTo === 'Merih AVCI' ? '1101' : r.assignedTo === 'Cem TUR' ? '1102' : r.assignedTo === 'Gülsüm YILDIRIM' ? '1103' : r.assignedTo === 'Sultan MERİÇ' ? '1104' : r.assignedTo === 'Şimal ERDEM' ? '1105' : '1106');
        const expertEmail = expertUser?.email || (r.assignedTo ? (r.assignedTo.split(' ')[0].toLowerCase() + '@pirireis.edu.tr') : '');

        return `
          <div class="portal-result-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.45rem;">
              <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary); font-size: 1rem;">
                Barkod #${r.requestBarcode || r.id}
              </span>
              <span class="badge status-${r.status?.toLowerCase()}">${r.status || 'Açık'}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 0.5rem; line-height: 1.4;">${r.subject}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; margin-bottom: 0.2rem; background: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div>🏢 Birim: <strong style="color: var(--text-main);">${r.unit}</strong></div>
              <div>👤 Sorumlu Uzman: <strong style="color: var(--accent-primary);">${r.assignedTo || '-'}</strong></div>
              <div>📅 Geliş Tarihi: <strong style="color: var(--text-main);">${r.arrivalDate || r.requestDate || '-'}</strong></div>
              <div>🚚 Süreç Durumu: <strong style="color: var(--status-completed);">${orderStatusText}</strong></div>
              ${r.description ? `<div style="grid-column: span 2; border-top: 1px dashed var(--border-color); padding-top: 0.35rem; margin-top: 0.2rem; color: var(--text-main); font-size: 0.8rem; line-height: 1.45;">📝 <strong>Açıklama / Not:</strong> ${r.description}</div>` : ''}
              <div style="grid-column: span 2; border-top: 1px solid var(--border-color); padding-top: 0.4rem; margin-top: 0.25rem; color: var(--accent-purple); font-weight: 600; display: flex; gap: 1rem; flex-wrap: wrap;">
                <span>📞 Dahili Tel: <strong>${expertPhone}</strong></span>
                <span>✉️ E-Posta: <strong>${expertEmail}</strong></span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('Portal arama hatası:', e);
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--status-rejected); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          ⚠️ Arama yapılırken bir hata oluştu.
        </div>
      `;
    }
  },

  bindEvents() {
    window.addEventListener('hashchange', () => this.handleHashRoute());

    // Portal Search Input Listener
    document.getElementById('portal-search-input')?.addEventListener('input', (e) => this.handlePortalSearch(e.target.value));

    // Login Form Submit
    document.getElementById('form-login-screen')?.addEventListener('submit', (e) => this.handleLogin(e));

    // Logout Button
    document.getElementById('btn-logout')?.addEventListener('click', () => this.handleLogout());

    // Sidebar Toggle & Saved State Restoration
    document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
      this.toggleSidebar();
    });

    if (localStorage.getItem('sidebarCollapsed') === 'true') {
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
        const toggleBtn = document.getElementById('btn-sidebar-toggle');
        if (toggleBtn) toggleBtn.innerText = '▶';
      }
    }

    // Section Titles Collapsible Accordion
    document.querySelectorAll('.nav-section-title').forEach(title => {
      title.style.cursor = 'pointer';
      title.setAttribute('title', 'Kategoriyi Katla / Aç');
      title.addEventListener('click', () => {
        let next = title.nextElementSibling;
        while (next && next.classList.contains('nav-item')) {
          next.style.display = (next.style.display === 'none') ? '' : 'none';
          next = next.nextElementSibling;
        }
      });
    });

    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Theme Toggle
    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
      const nextTheme = this.state.theme === 'light' ? 'dark' : 'light';
      this.setTheme(nextTheme);
    });

    // Global Academic Year Selector
    document.getElementById('global-year-select').addEventListener('change', (e) => {
      this.state.selectedYear = e.target.value;
      this.state.currentPage = 1;
      this.render();
    });

    // Filters for Requests
    ['filter-search', 'filter-status', 'filter-unit', 'filter-person', 'filter-priority', 'filter-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.state.currentPage = 1;
          this.renderRequestsTable();
        });
        el.addEventListener('change', () => {
          this.state.currentPage = 1;
          this.renderRequestsTable();
        });
      }
    });

    // Select All Checkbox Handler for Requests Table
    document.getElementById('chk-select-all-requests')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.chk-select-request').forEach(chk => chk.checked = isChecked);
      this._onRowCheckboxChange();
    });

    // Bulk Complete Button
    document.getElementById('btn-bulk-complete')?.addEventListener('click', () => this.handleBulkComplete());

    // Bulk Delegate Button
    document.getElementById('btn-bulk-delegate')?.addEventListener('click', () => this.handleBulkDelegate());

    // Clickable KPI Cards for Requests Management (Talep Yönetimi)
    document.getElementById('card-req-kpi-total')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-status');
      if (statusSelect) {
        statusSelect.value = 'ALL';
        this.state.currentPage = 1;
        this.renderRequestsTable();
        this.showToast("Tüm kurum talepleri listelendi.", "info", "📋");
      }
    });

    document.getElementById('card-req-kpi-open')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-status');
      if (statusSelect) {
        statusSelect.value = 'Açık';
        this.state.currentPage = 1;
        this.renderRequestsTable();
        this.showToast("Devam eden açık talepler filtrelendi.", "info", "⏳");
      }
    });

    document.getElementById('card-req-kpi-overdue')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-status');
      if (statusSelect) {
        statusSelect.value = 'OVERDUE_14';
        this.state.currentPage = 1;
        this.renderRequestsTable();
        this.showToast("🚨 14 günden fazla süredir bekleyen kurum talepleri filtrelendi.", "info", "🚨");
      }
    });

    document.getElementById('card-req-kpi-completed')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-status');
      if (statusSelect) {
        statusSelect.value = 'Tamamlandı';
        this.state.currentPage = 1;
        this.renderRequestsTable();
        this.showToast("Tamamlanan talepler filtrelendi.", "success", "✅");
      }
    });

    // Filters for My Requests (Taleplerim)
    ['filter-my-search', 'filter-my-status', 'filter-my-unit', 'filter-my-priority', 'filter-my-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderMyRequestsTable());
        el.addEventListener('change', () => this.renderMyRequestsTable());
      }
    });

    // Clickable KPI Cards for My Requests
    document.getElementById('card-my-kpi-total')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-my-status');
      if (statusSelect) {
        statusSelect.value = 'ALL';
        this.renderMyRequestsTable();
        this.showToast("Tüm atanan işleriniz listelendi.", "info", "👤");
      }
    });

    document.getElementById('card-my-kpi-open')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-my-status');
      if (statusSelect) {
        statusSelect.value = 'Açık';
        this.renderMyRequestsTable();
        this.showToast("Devam eden açık talepleriniz filtrelendi.", "info", "⏳");
      }
    });

    document.getElementById('card-my-kpi-overdue')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-my-status');
      if (statusSelect) {
        statusSelect.value = 'OVERDUE_14';
        this.renderMyRequestsTable();
        this.showToast("🚨 14 günden fazla süredir bekleyen acil talepler filtrelendi.", "info", "🚨");
      }
    });

    document.getElementById('card-my-kpi-completed')?.addEventListener('click', () => {
      const statusSelect = document.getElementById('filter-my-status');
      if (statusSelect) {
        statusSelect.value = 'Tamamlandı';
        this.renderMyRequestsTable();
        this.showToast("Tamamlanan siparişleriniz filtrelendi.", "success", "✅");
      }
    });

    document.getElementById('btn-export-my-requests')?.addEventListener('click', () => this.exportMyRequestsToCSV());

    // Filters for Contracts
    ['filter-contract-search', 'filter-contract-status', 'filter-contract-unit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderContracts());
        el.addEventListener('change', () => this.renderContracts());
      }
    });

    // Filters for Guarantees (Teminat Mektupları)
    ['filter-guarantee-search', 'filter-guarantee-status', 'filter-guarantee-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderGuarantees());
        el.addEventListener('change', () => this.renderGuarantees());
      }
    });

    // Filters for Invoices & Date Period Tabs
    ['filter-invoice-search', 'filter-invoice-status'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderInvoices());
        el.addEventListener('change', () => this.renderInvoices());
      }
    });

    document.querySelectorAll('#invoice-date-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#invoice-date-tabs button').forEach(b => b.classList.remove('active-date-tab'));
        btn.classList.add('active-date-tab');
        this.state.invoiceDatePeriod = btn.getAttribute('data-period');
        this.renderInvoices();
      });
    });

    // Unit Analysis Select
    document.getElementById('select-unit-analysis')?.addEventListener('change', () => {
      this.renderUnitAnalysis();
    });

    // Pagination
    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      if (this.state.currentPage > 1) {
        this.state.currentPage--;
        this.renderRequestsTable();
      }
    });

    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      this.state.currentPage++;
      this.renderRequestsTable();
    });

    // Modal Open & Action Buttons
    document.getElementById('btn-open-new-request')?.addEventListener('click', () => this.openNewRequestModal());
    document.getElementById('btn-open-excel-import')?.addEventListener('click', () => this.openExcelImportModal());
    document.getElementById('btn-open-add-user')?.addEventListener('click', () => this.openUserModal());
    document.getElementById('btn-open-add-contract')?.addEventListener('click', () => this.openContractModal());
    document.getElementById('btn-open-add-guarantee')?.addEventListener('click', () => this.openGuaranteeModal());
    document.getElementById('btn-open-add-invoice')?.addEventListener('click', () => this.openInvoiceModal());
    document.getElementById('btn-open-add-tender')?.addEventListener('click', () => this.openTenderModal());

    // Settings Action Buttons (Birim & Yönetmelik Maddesi & Backup & Excel Import & SMTP)
    document.getElementById('btn-add-unit')?.addEventListener('click', () => this.handleAddUnit());
    document.getElementById('btn-add-regulation')?.addEventListener('click', () => this.handleAddRegulation());
    document.getElementById('btn-trigger-backup-now')?.addEventListener('click', () => this.triggerManualBackup());
    document.getElementById('btn-download-excel-template')?.addEventListener('click', () => this.downloadExcelTemplate());
    document.getElementById('btn-modal-download-template')?.addEventListener('click', () => this.downloadExcelTemplate());
    document.getElementById('btn-confirm-excel-import')?.addEventListener('click', () => this.confirmExcelImport());
    document.getElementById('btn-test-smtp')?.addEventListener('click', () => this.testSmtpConnection());
    document.getElementById('btn-preset-m365')?.addEventListener('click', () => {
      const hostEl = document.getElementById('smtp-host');
      const portEl = document.getElementById('smtp-port');
      const secureEl = document.getElementById('smtp-secure');
      const enabledEl = document.getElementById('smtp-is-enabled');
      if (hostEl) hostEl.value = 'smtp.office365.com';
      if (portEl) portEl.value = 587;
      if (secureEl) secureEl.checked = false;
      if (enabledEl) enabledEl.checked = true;
      this.showToast('Microsoft 365 sunucu parametreleri (smtp.office365.com:587) uygulandı.', 'info', '🏢');
    });
    document.getElementById('btn-update-system')?.addEventListener('click', () => this.handleUpdateSystem());
    document.getElementById('btn-reimport-excel')?.addEventListener('click', () => {
      document.getElementById('input-excel-file')?.click();
    });
    document.getElementById('input-excel-file')?.addEventListener('change', (e) => this.handleExcelFileSelect(e));
    
    // Press Enter inside input to add unit/regulation
    document.getElementById('input-new-unit-name')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.handleAddUnit(); }
    });
    document.getElementById('input-new-unit-email')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.handleAddUnit(); }
    });
    document.getElementById('input-new-regulation-name')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.handleAddRegulation(); }
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // Form Submissions
    document.getElementById('form-new-request')?.addEventListener('submit', (e) => this.handleNewRequest(e));
    document.getElementById('form-edit-request')?.addEventListener('submit', (e) => this.handleEditRequest(e));
    document.getElementById('form-user-manage')?.addEventListener('submit', (e) => this.handleSaveUser(e));
    document.getElementById('form-unit-edit')?.addEventListener('submit', (e) => this.handleSaveEditUnit(e));
    document.getElementById('form-contract-manage')?.addEventListener('submit', (e) => this.handleSaveContract(e));
    document.getElementById('form-guarantee-manage')?.addEventListener('submit', (e) => this.handleSaveGuarantee(e));
    document.getElementById('form-invoice-manage')?.addEventListener('submit', (e) => this.handleSaveInvoice(e));
    document.getElementById('form-tender-manage')?.addEventListener('submit', (e) => this.handleSaveTender(e));
    document.getElementById('form-smtp-settings')?.addEventListener('submit', (e) => this.saveSmtpSettings(e));
    document.getElementById('form-vendor-rating')?.addEventListener('submit', (e) => this.saveVendorRating(e));

    // Notification Center Event Listeners
    document.getElementById('btn-mark-all-notifications-read')?.addEventListener('click', () => this.markAllNotificationsRead());
    
    document.querySelectorAll('.notif-filter-kpi').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.notif-filter-kpi').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.state.notifFilter = card.getAttribute('data-notif-filter') || 'ALL';
        this.renderNotificationsView();
      });
    });

    document.querySelectorAll('.notif-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notif-cat-btn').forEach(b => b.classList.remove('active-date-tab'));
        btn.classList.add('active-date-tab');
        this.state.notifCategory = btn.getAttribute('data-category') || 'ALL';
        this.renderNotificationsView();
      });
    });

    document.getElementById('filter-notif-search')?.addEventListener('input', (e) => {
      this.state.notifSearch = e.target.value.toLowerCase().trim();
      this.renderNotificationsView();
    });

    // Delegation Execution & Filters
    document.getElementById('btn-execute-delegation')?.addEventListener('click', () => this.handleDelegation());
    ['filter-delegation-search', 'delegate-from-person', 'filter-delegation-unit', 'filter-delegation-priority'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderDelegationTable(this.getFilteredRequests()));
        el.addEventListener('change', () => this.renderDelegationTable(this.getFilteredRequests()));
      }
    });
    document.getElementById('chk-select-all-delegation')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.chk-delegate-item').forEach(chk => chk.checked = isChecked);
    });

    // Print & Export Event Listeners
    document.getElementById('btn-print-yearly-report')?.addEventListener('click', () => this.printSection('view-yearly-report', 'YILLIK SATINALMA FAALİYET VE TASARRUF RAPORU'));
    document.getElementById('btn-export-yearly-excel')?.addEventListener('click', () => this.exportYearlyFinancialToExcel());
    document.getElementById('btn-export-matrix-excel')?.addEventListener('click', () => this.exportMatrixToExcel());
    document.getElementById('btn-export-matrix-pdf')?.addEventListener('click', () => this.printSection('yearly-tab-matrix', 'İHALE MADDESİ & TEDARİKÇİ SİPARİŞ MATRİSİ'));
    document.getElementById('btn-matrix-expand-all')?.addEventListener('click', () => this.expandAllMatrixGroups());
    document.getElementById('btn-matrix-collapse-all')?.addEventListener('click', () => this.collapseAllMatrixGroups());

    // Matrix Filters
    document.getElementById('filter-matrix-search')?.addEventListener('input', (e) => {
      this.state.matrixSearch = e.target.value.toLowerCase().trim();
      this.renderYearlyMatrixReport();
    });
    document.getElementById('filter-matrix-regulation')?.addEventListener('change', (e) => {
      this.state.matrixRegulation = e.target.value;
      this.renderYearlyMatrixReport();
    });
    document.getElementById('filter-matrix-supplier')?.addEventListener('change', (e) => {
      this.state.matrixSupplier = e.target.value;
      this.renderYearlyMatrixReport();
    });
    document.getElementById('filter-matrix-groupby')?.addEventListener('change', (e) => {
      this.state.matrixGroupBy = e.target.value;
      this.renderYearlyMatrixReport();
    });

    // Dedicated Domain Excel & PDF Exporters
    document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportRequestsToExcel());
    document.getElementById('btn-export-requests-pdf')?.addEventListener('click', () => this.printSection('view-requests', 'SATINALMA TALEPLERİ VE SİPARİŞ LİSTESİ'));

    document.getElementById('btn-export-my-pdf')?.addEventListener('click', () => this.printSection('view-my-requests', 'KİŞİSEL TALEPLER VE İŞ LİSTESİ'));

    document.getElementById('btn-export-contracts-excel')?.addEventListener('click', () => this.exportContractsToExcel());
    document.getElementById('btn-export-contracts-pdf')?.addEventListener('click', () => this.printSection('view-contracts', 'KURUMSAL SÖZLEŞMELER VE YÜKLENİCİ ÇİZELGESİ'));

    document.getElementById('btn-export-invoices-excel')?.addEventListener('click', () => this.exportInvoicesToExcel());
    document.getElementById('btn-export-invoices-pdf')?.addEventListener('click', () => this.printSection('view-invoices', 'FATURA VE ÖDEME TAKİP LİSTESİ'));

    document.getElementById('btn-export-guarantees-excel')?.addEventListener('click', () => this.exportGuaranteesToExcel());
    document.getElementById('btn-export-guarantees-pdf')?.addEventListener('click', () => this.printSection('view-guarantees', 'TEMİNAT MEKTUPLARI VE KASA ÇİZELGESİ'));

    document.getElementById('btn-export-unit-excel')?.addEventListener('click', () => this.exportUnitAnalysisToExcel());
    document.getElementById('btn-export-unit-pdf')?.addEventListener('click', () => this.printSection('view-unit-analysis', 'BİRİM BAZLI HARCAMA VE PERFORMANS CETVELİ'));

    document.getElementById('btn-export-supplier-excel')?.addEventListener('click', () => this.exportSupplierAnalysisToExcel());
    document.getElementById('btn-export-supplier-pdf')?.addEventListener('click', () => this.printSection('view-supplier-analysis', 'TEDARİKÇİ BAZLI HARCAMA VE İŞ HACMİ RAPORU'));

    document.getElementById('btn-export-logs-excel')?.addEventListener('click', () => this.exportLogsToExcel());
    document.getElementById('btn-export-logs-pdf')?.addEventListener('click', () => this.printSection('view-activity-logs', 'SİSTEM AKTİVİTE VE DENETİM LOGLARI'));

    document.getElementById('btn-export-delegation-excel')?.addEventListener('click', () => this.exportDelegationToExcel());
    document.getElementById('btn-export-delegation-pdf')?.addEventListener('click', () => this.printSection('view-workload', 'İŞ YÜKÜ VE PERSONEL DELEGASYON CETVELİ'));

    // Manual Backup Button
    document.getElementById('btn-trigger-backup-now')?.addEventListener('click', () => this.triggerManualBackup());

    // Export Weekly Payment Schedule to Excel
    document.getElementById('btn-export-weekly-payments')?.addEventListener('click', () => this.exportWeeklyPaymentsToExcel());

    // Re-import Excel
    document.getElementById('btn-reimport-excel')?.addEventListener('click', () => {
      this.showConfirm("Veri Senkronizasyonu", "Excel verilerini yeniden senkronize etmek istediğinize emin misiniz?", async () => {
        await this.fetchInitialData();
        this.showToast("Veriler başarıyla yeniden yüklendi!", "success");
        this.render();
      }, '🔄');
    });

    // Filter for Activity Logs
    document.getElementById('filter-log-search')?.addEventListener('input', () => this.renderActivityLogs());

    // Filters for Supplier Analysis
    ['filter-supplier-search', 'filter-supplier-unit', 'filter-supplier-tier', 'filter-supplier-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderSupplierAnalysis());
        el.addEventListener('change', () => this.renderSupplierAnalysis());
      }
    });

    // 🏢 360 Vendor Profile Actions
    document.getElementById('btn-back-to-suppliers')?.addEventListener('click', () => {
      this.switchView('supplier-analysis');
    });
    document.getElementById('btn-print-vendor-scorecard')?.addEventListener('click', () => {
      this.printVendorReport();
    });
    document.getElementById('btn-vp-rate-now')?.addEventListener('click', () => {
      if (this.state.currentVendorProfile) {
        this.openVendorRateModal(this.state.currentVendorProfile);
      }
    });

    // Save Currency Rates
    document.getElementById('btn-save-rates')?.addEventListener('click', async () => {
      const parseInputRate = (val, def) => {
        if (!val) return def;
        const clean = String(val).replace(',', '.').trim();
        const n = parseFloat(clean);
        return isNaN(n) || n <= 0 ? def : n;
      };
      const usdVal = document.getElementById('setting-rate-usd')?.value;
      const eurVal = document.getElementById('setting-rate-eur')?.value;
      const usd = parseInputRate(usdVal, 47.89);
      const eur = parseInputRate(eurVal, 55.54);
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      this.state.rates = { USD: usd, EUR: eur, lastUpdated: dateStr };
      await this.authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates: this.state.rates }) }).catch(e => console.error(e));
      this.syncRatesInputUI();
      this.logAction('Döviz Kuru Güncellendi', `USD: ${usd} ₺, EUR: ${eur} ₺ (${dateStr})`);
      this.showToast(`Döviz kurları başarıyla güncellendi! (USD: ${usd} ₺, EUR: ${eur} ₺)`, "success");
      this.render();
    });

    // Auto Fetch TCMB Rates
    document.getElementById('btn-fetch-tcmb-rates')?.addEventListener('click', () => this.fetchTCMBRates());

    // Notification Bell Toggle
    const notifBtn = document.getElementById('btn-notification-bell');
    const notifDropdown = document.getElementById('notification-dropdown');
    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('show');
      });
    }

    // Global Search Input
    const globalInput = document.getElementById('global-search-input');
    if (globalInput) {
      globalInput.addEventListener('input', (e) => this.handleGlobalSearch(e.target.value));
      globalInput.addEventListener('focus', (e) => this.handleGlobalSearch(e.target.value));
    }

    // Close Dropdowns on Click Outside
    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
        notifDropdown.classList.remove('show');
      }
      const searchResults = document.getElementById('global-search-results');
      if (searchResults && !searchResults.contains(e.target) && e.target !== globalInput) {
        searchResults.classList.remove('show');
      }
    });

    // Global Keyboard Shortcut (Ctrl + K)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('global-search-input');
        if (input) {
          input.focus();
          input.select();
        }
      }
    });

    // Yearly Report Tab Switching
    document.querySelectorAll('#yearly-report-tabs button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        if (!tab) return;
        this.state.yearlyActiveTab = tab;
        document.querySelectorAll('#yearly-report-tabs button').forEach(b => b.classList.remove('active-date-tab'));
        e.currentTarget.classList.add('active-date-tab');

        document.querySelectorAll('.yearly-tab-content').forEach(el => el.style.display = 'none');
        const activeTabEl = document.getElementById(`yearly-tab-${tab}`);
        if (activeTabEl) activeTabEl.style.display = 'block';

        this.renderYearlyReport();
      });
    });

    // Chart PNG Exports
    document.getElementById('btn-export-chart-unit')?.addEventListener('click', () => this.exportChartToPNG('chart-unit-spend-pie', 'Birim_Harcama_Grafigi.png'));
    document.getElementById('btn-export-chart-unit-volume')?.addEventListener('click', () => this.exportChartToPNG('chart-unit-volume-bar', 'Birimler_Arasi_Kiyaslama_Grafigi.png'));
    document.getElementById('btn-export-chart-combo')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-combo', 'Aylik_Harcama_Talep_Grafigi.png'));
    document.getElementById('btn-export-chart-savings')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-savings', 'Pazarlik_Tasarrufu_Grafigi.png'));
    document.getElementById('btn-export-chart-matrix-bar')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-matrix-bar', 'Ihale_Maddesi_Tedarikci_Grafigi.png'));
    document.getElementById('btn-export-chart-matrix-doughnut')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-matrix-doughnut', 'Ihale_Maddesi_Harcama_Payi.png'));
    document.getElementById('btn-export-chart-sla')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-sla', 'SLA_Surec_Hizi_Grafigi.png'));
    document.getElementById('btn-export-chart-sla-dist')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-sla-distribution', 'Bekleme_Suresi_Dagilimi_Grafigi.png'));
    document.getElementById('btn-export-chart-regulations')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-regulations', 'Yonetmelik_Maddeleri_Grafigi.png'));
    document.getElementById('btn-export-chart-currency')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-currency', 'Para_Birimi_Payi_Grafigi.png'));
    document.getElementById('btn-export-chart-top-suppliers')?.addEventListener('click', () => this.exportChartToPNG('chart-yearly-top-suppliers', 'Top_Tedarikciler_Grafigi.png'));

    // Personnel Savings Detail View Listeners
    document.getElementById('btn-back-to-yearly-report')?.addEventListener('click', () => {
      this.state.yearlyActiveTab = 'savings';
      this.switchView('yearly-report');
    });

    ['ps-filter-month', 'ps-filter-unit', 'ps-filter-search'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderPersonnelSavingsDetail());
        el.addEventListener('change', () => this.renderPersonnelSavingsDetail());
      }
    });

    document.getElementById('btn-export-personnel-savings-excel')?.addEventListener('click', () => {
      const uName = (this.state.currentSavingsUser || 'Personel').replace(/\s+/g, '_');
      this.exportTableToExcel('table-ps-jobs-list', `${uName}_Pazarlik_Tasarruf_Raporu.xls`);
    });
    document.getElementById('btn-export-personnel-savings-pdf')?.addEventListener('click', () => {
      this.printSection('view-personnel-savings-detail', 'PERSONEL PAZARLIK VE TASARRUF PERFORMANS RAPORU');
    });
    document.getElementById('btn-export-ps-chart-trend')?.addEventListener('click', () => this.exportChartToPNG('chart-ps-monthly-trend', 'Uzman_Tasarruf_Trendi.png'));
    document.getElementById('btn-export-ps-chart-unit')?.addEventListener('click', () => this.exportChartToPNG('chart-ps-unit-pie', 'Uzman_Birim_Tasarruf_Payi.png'));

    // Export Yearly Report to Excel (Dynamic Active Tab Exporter)
    document.getElementById('btn-export-yearly-excel')?.addEventListener('click', () => {
      const activeTab = this.state.yearlyActiveTab || 'financial';
      let tableId = 'table-yearly-personnel-savings';
      
      if (activeTab === 'savings' || activeTab === 'personnel') {
        tableId = 'table-yearly-personnel-savings';
      } else {
        const visibleTable = document.querySelector('#view-yearly-report table:not([style*="display: none"])');
        if (visibleTable && visibleTable.id) {
          tableId = visibleTable.id;
        } else {
          tableId = 'table-yearly-personnel-savings';
        }
      }

      const tableEl = document.getElementById(tableId);
      if (tableEl) {
        this.exportTableToExcel(tableId, `Yillik_Satinalma_Faaliyet_ve_Tasarruf_Raporu_${this.state.selectedYear}.xls`);
      } else {
        this.exportToCSV();
      }
    });

    // Global Print / PDF Export Listeners across all views
    document.getElementById('btn-export-requests-pdf')?.addEventListener('click', () => {
      this.printSection('view-requests', 'SATİNALMA TALEPLERİ VE SİPARİŞ TAKİP LİSTESİ');
    });
    document.getElementById('btn-export-my-requests-pdf')?.addEventListener('click', () => {
      this.printSection('view-my-requests', 'BENİM SATİNALMA TALEPLERİM RAPORU');
    });
    document.getElementById('btn-export-contracts-pdf')?.addEventListener('click', () => {
      this.printSection('view-contracts', 'RESMİ SÖZLEŞMELER VE TEMİNAT MEKTUPLARI RAPORU');
    });
    document.getElementById('btn-export-guarantees-excel')?.addEventListener('click', () => {
      this.exportTableToExcel('table-guarantees', 'Teminat_Mektuplari_Cetveli.csv');
    });
    document.getElementById('btn-export-tenders-excel')?.addEventListener('click', () => {
      this.exportTableToExcel('table-tenders', 'Ihale_Planlama_ve_Surec_Cetveli.csv');
    });
    document.getElementById('btn-export-tenders-pdf')?.addEventListener('click', () => {
      this.printSection('view-tenders', 'İHALE PLANLAYICISI VE SÜREÇ YÖNETİM RAPORU');
    });
    document.getElementById('btn-export-guarantees-pdf')?.addEventListener('click', () => {
      this.printSection('view-guarantees', 'İHALE VE İŞ BAZLI TEMİNAT MEKTUPLARI YÖNETİM RAPORU');
    });
    document.getElementById('btn-export-invoices-pdf')?.addEventListener('click', () => {
      this.printSection('view-invoices', 'RESMİ FATURALAR VE MUHASEBE ÖDEME ÇİZELGESİ RAPORU');
    });
    document.getElementById('btn-export-delegation-pdf')?.addEventListener('click', () => {
      this.printSection('view-workload', 'SATİNALMA PERSONELİ İŞ YÜKÜ VE DELEGASYON RAPORU');
    });
    document.getElementById('btn-export-unit-pdf')?.addEventListener('click', () => {
      this.printSection('view-unit-analysis', 'KURUMSAL BİRİM PERFORMANS VE HARCAMA RAPORU');
    });
    document.getElementById('btn-export-supplier-pdf')?.addEventListener('click', () => {
      this.printSection('view-supplier-analysis', 'TEDARİKÇİ BAZLI HARCAMA VE İŞ HACMİ RAPORU');
    });
    document.getElementById('btn-print-yearly-report')?.addEventListener('click', () => {
      this.printSection('view-yearly-report', 'YILLIK SATİNALMA FAALİYET VE KARŞILAŞTIRMA RAPORU');
    });
    document.getElementById('btn-export-personnel-savings-pdf')?.addEventListener('click', () => {
      this.printSection('view-personnel-savings-detail', 'PERSONEL PAZARLIK VE TASARRUF PERFORMANS RAPORU');
    });
    document.getElementById('btn-export-activity-logs-pdf')?.addEventListener('click', () => {
      this.printSection('view-activity-logs', 'SİSTEM AKTİVİTE VE İŞLEM LOGLARI RAPORU');
    });
    document.getElementById('btn-export-logs-pdf')?.addEventListener('click', () => {
      this.printSection('view-activity-logs', 'SİSTEM AKTİVİTE VE İŞLEM LOGLARI RAPORU');
    });

    // Filter for Unit Analysis & Tenders
    document.getElementById('filter-unit-search')?.addEventListener('input', () => this.renderUnitAnalysis());
    document.getElementById('select-unit-analysis')?.addEventListener('change', () => this.renderUnitAnalysis());

    document.getElementById('filter-tender-search')?.addEventListener('input', () => this.renderTenders());
    document.getElementById('filter-tender-status')?.addEventListener('change', () => this.renderTenders());
    document.getElementById('filter-tender-unit')?.addEventListener('change', () => this.renderTenders());
  },

  async fetchTCMBRates() {
    const btn = document.getElementById('btn-fetch-tcmb-rates');
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⌛</span> Kurlar Çekiliyor...';
      }

      const res = await this.authFetch('/api/fetch-tcmb-rates');
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.USD || data.EUR)) {
          this.state.rates = {
            USD: parseFloat(data.USD),
            EUR: parseFloat(data.EUR),
            lastUpdated: data.lastUpdated
          };

          this.syncRatesInputUI();
          await this.authFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates: this.state.rates }) }).catch(e => console.error(e));
          this.logAction('Canlı Kurlar Çekildi', `${data.source || 'TCMB'} -> USD: ${data.USD} ₺, EUR: ${data.EUR} ₺ (${data.lastUpdated})`);
          this.showToast(`Canlı Kurlar Güncellendi! (USD: ${data.USD} ₺, EUR: ${data.EUR} ₺) [${data.source || 'TCMB'}]`, "success", "🏛️");
          this.render();
        } else {
          this.showToast("Kurlar alınırken bir hata oluştu: " + (data.error || 'Bilinmeyen hata'), "error");
        }
      } else {
        this.showToast("Döviz servisine bağlanılamadı (HTTP " + res.status + ")", "error");
      }
    } catch (err) {
      console.error("Error fetching TCMB rates:", err);
      this.showToast("Merkez Bankası / döviz sunucusuna bağlanılamadı.", "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span> TCMB\'den Kurları Otomatik Çek';
      }
    }
  },

  async logAction(actionType, details) {
    if (!this.state.logs) this.state.logs = [];
    const newLog = {
      timestamp: new Date().toLocaleString('tr-TR'),
      user: this.state.currentUser ? this.state.currentUser.name : 'Sistem',
      action: actionType,
      details: details
    };
    
    try {
      const savedLog = await this.apiSync('logs', 'POST', newLog);
      if(savedLog) newLog.id = savedLog.id;
      this.state.logs.unshift(newLog);
      if (this.state.logs.length > 500) this.state.logs.pop();
    } catch(e) {
      console.error('Log Error:', e);
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) toggleBtn.innerText = isCollapsed ? '▶' : '◀';
  },

  toggleMobileSidebar(forceClose = false) {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;

    if (forceClose) {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    } else {
      const isOpen = sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('show', isOpen);
      overlay.style.display = isOpen ? 'block' : 'none';
    }
  },

  resetPageFilters() {
    // 1. Requests Management Filters
    if (document.getElementById('filter-search')) document.getElementById('filter-search').value = '';
    if (document.getElementById('filter-status')) document.getElementById('filter-status').value = 'ALL';
    if (document.getElementById('filter-unit')) document.getElementById('filter-unit').value = 'ALL';
    if (document.getElementById('filter-person')) document.getElementById('filter-person').value = 'ALL';
    if (document.getElementById('filter-priority')) document.getElementById('filter-priority').value = 'ALL';
    if (document.getElementById('filter-sort')) document.getElementById('filter-sort').value = 'DATE_DESC';
    this.state.currentPage = 1;

    // 2. Workload & Delegation Filters
    if (document.getElementById('filter-delegation-search')) document.getElementById('filter-delegation-search').value = '';
    if (document.getElementById('delegate-from-person')) document.getElementById('delegate-from-person').value = 'ALL';
    if (document.getElementById('filter-delegation-unit')) document.getElementById('filter-delegation-unit').value = 'ALL';
    if (document.getElementById('filter-delegation-priority')) document.getElementById('filter-delegation-priority').value = 'ALL';

    // 3. My Requests Filters
    if (document.getElementById('filter-my-search')) document.getElementById('filter-my-search').value = '';
    if (document.getElementById('filter-my-status')) document.getElementById('filter-my-status').value = 'ALL';
    if (document.getElementById('filter-my-unit')) document.getElementById('filter-my-unit').value = 'ALL';
    if (document.getElementById('filter-my-priority')) document.getElementById('filter-my-priority').value = 'ALL';
    if (document.getElementById('filter-my-sort')) document.getElementById('filter-my-sort').value = 'DATE_DESC';

    // 4. Contracts Filters
    if (document.getElementById('filter-contract-search')) document.getElementById('filter-contract-search').value = '';
    if (document.getElementById('filter-contract-status')) document.getElementById('filter-contract-status').value = 'ALL';
    if (document.getElementById('filter-contract-unit')) document.getElementById('filter-contract-unit').value = 'ALL';

    // 5. Guarantees Filters
    if (document.getElementById('filter-guarantee-search')) document.getElementById('filter-guarantee-search').value = '';
    if (document.getElementById('filter-guarantee-status')) document.getElementById('filter-guarantee-status').value = 'ALL';
    if (document.getElementById('filter-guarantee-type')) document.getElementById('filter-guarantee-type').value = 'ALL';

    // 6. Invoices Filters
    if (document.getElementById('filter-invoice-search')) document.getElementById('filter-invoice-search').value = '';
    if (document.getElementById('filter-invoice-status')) document.getElementById('filter-invoice-status').value = 'ALL';
    if (document.getElementById('filter-invoice-unit')) document.getElementById('filter-invoice-unit').value = 'ALL';

    // 7. Unit Analysis Filters
    if (document.getElementById('filter-unit-search')) document.getElementById('filter-unit-search').value = '';
    if (document.getElementById('select-unit-analysis')) document.getElementById('select-unit-analysis').value = 'ALL';

    // 8. Supplier Analysis Filters
    if (document.getElementById('filter-supplier-search')) document.getElementById('filter-supplier-search').value = '';
    if (document.getElementById('filter-supplier-unit')) document.getElementById('filter-supplier-unit').value = 'ALL';

    // 9. Activity Logs Filters
    if (document.getElementById('filter-logs-search')) document.getElementById('filter-logs-search').value = '';
    if (document.getElementById('filter-logs-user')) document.getElementById('filter-logs-user').value = 'ALL';
  },

  switchView(viewName) {
    this.toggleMobileSidebar(true);
    if (this.state.currentView && this.state.currentView !== viewName) {
      this.resetPageFilters();
    }
    this.state.currentView = viewName;
    localStorage.setItem('activeView', viewName);
    
    // Update nav active
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update section visibility
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.style.display = sec.id === `view-${viewName}` ? 'block' : 'none';
    });

    // Update view header
    const titles = {
      dashboard: { title: 'Dashboard', sub: 'Genel yönetim özeti ve canlı performans metrikleri' },
      requests: { title: 'Talep Yönetimi', sub: 'Tüm satınalma taleplerinin filtrelenebilir ve düzenlenebilir ana tablosu' },
      workload: { title: 'İş Yükü & Delegasyon', sub: 'Aktif personellerin iş yük puanları ve hızlı talep devretme' },
      'my-requests': { title: 'Taleplerim (Personel)', sub: 'Tarafınıza atanmış aktif satınalma talepleri ve sipariş girişi' },
      notifications: { title: 'Bildirim Merkezi', sub: 'Sözleşme vadeleri, teminat bitişleri, ödeme uyarısı ve 14 günden fazla bekleyen taleplere ilişkin tüm bildirimler' },
      contracts: { title: 'Sözleşme Takip', sub: 'Sözleşme süreleri, teminat mektupları ve yaklaşan bitiş uyarıları' },
      guarantees: { title: 'Teminat Mektupları', sub: 'İhale ve iş bazlı banka teminat mektupları, kasa saklama ve vade takibi' },
      invoices: { title: 'Fatura & Muhasebe', sub: 'Vadesi gelen faturalar ve haftalık nakit akış ödeme listesi' },
      tenders: { title: 'İhale Planlayıcısı & Süreç Yönetimi', sub: 'İhale tarihleri, aşamaları, birim talepleri ve kazanan yüklenici takibi' },
      'unit-analysis': { title: 'Birim Analizi', sub: 'Üniversite birimlerinin talep ve harcama detayları' },
      'supplier-analysis': { title: 'Tedarikçi Analizi', sub: 'En yüksek harcama yapılan tedarikçilerin sıralaması' },
      'yearly-report': { title: 'Yıllık Rapor', sub: 'Yıllık satınalma faaliyet raporu, YoY metrikleri ve SLA hız analizleri' },
      'personnel-savings-detail': { title: 'Personel Pazarlık Tasarrufu & KPI Raporu', sub: 'Satınalma uzmanının yıllık pazarlık tasarrufları, ay ve birim kırılımlı grafik ve veri analizleri' },
      'activity-logs': { title: 'Aktivite Logları', sub: 'Sistemdeki ekleme, silme, onay ve devir işlemlerinin audit geçmişi' },
      settings: { title: 'Ayarlar', sub: 'Sistem kullanıcıları (Ekle/Düzenle/Pasif yap), tanımlamalar ve sunucu veri durumu' }
    };

    if (titles[viewName]) {
      document.getElementById('view-title').innerText = titles[viewName].title;
      document.getElementById('view-subtitle').innerText = titles[viewName].sub;
    }

    if (viewName === 'settings') {
      this.fetchBackups();
      this.fetchSmtpSettings();
    }

    if (viewName === 'supplier-analysis' || viewName === 'vendor-profile') {
      this.authFetch('/api/vendor_ratings').then(async res => {
        if (res.ok) {
          const list = await res.json();
          this.state.vendorRatings = list || [];
          if (this.state.currentView === 'supplier-analysis') this.renderSupplierAnalysis();
          else if (this.state.currentView === 'vendor-profile') this.renderVendorProfile();
        }
      }).catch(() => {});
    }

    if (viewName === 'my-requests') {
      const currentPersonName = this.state.currentUser ? this.state.currentUser.name : '';
      const today = new Date();
      today.setHours(0,0,0,0);
      const overdueCount = this.getFilteredRequests().filter(r => {
        if (r.assignedTo !== currentPersonName || r.status !== 'Açık') return false;
        const arrDt = new Date(r.arrivalDate || r.requestDate);
        arrDt.setHours(0,0,0,0);
        const diff = Math.max(0, Math.ceil((today - arrDt) / (1000 * 60 * 60 * 24)));
        return diff >= 14;
      }).length;

      if (overdueCount > 0) {
        setTimeout(() => {
          this.showToast(`🚨 Dikkat! Tarafınıza atanan ve 14 günden fazla süredir işlem bekleyen ${overdueCount} adet acil talep bulunmaktadır!`, "error", "🚨");
        }, 300);
      }
    }

    this.render();
  },

  getAcademicYear(dateStr) {
    if (!dateStr) return '2025-2026';
    let y = 2026, m = 2;
    const str = dateStr.toString().trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
    } else if (str.includes('.')) {
      const parts = str.split('.');
      if (parts[2] && parts[2].length === 4) y = parseInt(parts[2], 10);
      m = parseInt(parts[1], 10) - 1;
    }
    if (isNaN(y) || isNaN(m)) return '2025-2026';
    if (m >= 8) return `${y}-${y + 1}`;
    return `${y - 1}-${y}`;
  },

  getFilteredRequests() {
    return this.state.requests.filter(r => {
      const acadYear = r.academicYear || this.getAcademicYear(r.arrivalDate || r.requestDate);
      if (this.state.selectedYear !== 'ALL' && acadYear !== this.state.selectedYear) {
        return false;
      }
      return true;
    });
  },

  render() {
    if (!this.state.isLoggedIn) return;
    this.populateDropdowns();
    this.renderNotifications();
    this.syncRatesInputUI();
    const view = this.state.currentView;
    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'requests') this.renderRequestsTable();
    else if (view === 'workload') this.renderWorkloadView();
    else if (view === 'my-requests') this.renderMyRequestsTable();
    else if (view === 'notifications') this.renderNotificationsView();
    else if (view === 'contracts') this.renderContracts();
    else if (view === 'guarantees') this.renderGuarantees();
    else if (view === 'invoices') this.renderInvoices();
    else if (view === 'tenders') this.renderTenders();
    else if (view === 'unit-analysis') this.renderUnitAnalysis();
    else if (view === 'supplier-analysis') this.renderSupplierAnalysis();
    else if (view === 'vendor-profile') this.renderVendorProfile();
    else if (view === 'yearly-report') this.renderYearlyReport();
    else if (view === 'activity-logs') this.renderActivityLogs();
    else if (view === 'settings') this.renderSettings();
  },

  // 🔔 NOTIFICATION CENTER & PROACTIVE ALARM ENGINE
  parseDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    } else if (s.includes('.')) {
      const parts = s.split('.');
      if (parts.length === 3) {
        if (parts[2].length >= 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (parts[0].length >= 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  },

  getAllNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dismissed = this.state.dismissedNotifs || [];
    const allNotifs = [];

    // 1. GUARANTEES (Teminat Mektubu Vadeleri - Sadece aktif ve son 15 gün ile gelecek 30 gün arasındaki kayıtlar)
    const guarantees = (this.state.guarantees || []).filter(g => {
      const st = (g.status || '').toLowerCase();
      return st !== 'iade edildi' && st !== 'iade' && st !== 'nakte çevrildi' && st !== 'iptal' && st !== 'hükümsüz' && st !== 'kapandı';
    });

    guarantees.forEach(g => {
      const exp = this.parseDate(g.expiryDate);
      if (exp) {
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        
        let level = null;
        let countdownText = '';
        let tagClass = '';

        if (diffDays >= -15 && diffDays < 0) {
          level = 'CRITICAL';
          countdownText = `${Math.abs(diffDays)} Gün Önce Süresi Doldu! 🚨`;
          tagClass = 'critical';
        } else if (diffDays === 0) {
          level = 'CRITICAL';
          countdownText = 'Bugün Vade Doluyor! ⚡';
          tagClass = 'critical';
        } else if (diffDays > 0 && diffDays <= 7) {
          level = 'CRITICAL';
          countdownText = `Son ${diffDays} Gün Kaldı! 🔴`;
          tagClass = 'critical';
        } else if (diffDays > 7 && diffDays <= 30) {
          level = 'WARNING';
          countdownText = `${diffDays} Gün Kaldı 🟡`;
          tagClass = 'warning';
        }

        if (level) {
          const id = `guarantee_${g.id}`;
          allNotifs.push({
            id,
            category: 'GUARANTEE',
            categoryName: 'Teminat Mektubu',
            level,
            icon: '🛡️',
            title: `Teminat Mektubu #${g.letterNo || g.id} — ${g.bank || g.bankName || 'Banka'}`,
            sub: `Firma: ${g.supplier || '-'} | Tutar: ${this.formatMoney(g.guaranteeAmount || g.amount || 0, g.currency || 'TRY', 2)} | Vade: ${g.expiryDate || '-'}`,
            date: g.expiryDate,
            diffDays,
            tag: countdownText,
            tagClass,
            isRead: dismissed.includes(id),
            action: () => {
              this.switchView('guarantees');
              setTimeout(() => this.viewGuaranteeDetails(g.id), 120);
            }
          });
        }
      }
    });

    // 2. CONTRACTS (Sözleşme Bitiş & Yenileme Uyarısı - Sadece Aktif sözleşmeler ve son 15 gün ile gelecek 60 gün)
    const contracts = (this.state.contracts || []).filter(c => c.status === 'Aktif' || !c.status);
    contracts.forEach(c => {
      const endDt = this.parseDate(c.endDate);
      if (endDt) {
        endDt.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((endDt - today) / (1000 * 60 * 60 * 24));
        
        let level = null;
        let countdownText = '';
        let tagClass = '';

        if (diffDays >= -15 && diffDays < 0) {
          level = 'CRITICAL';
          countdownText = `${Math.abs(diffDays)} Gün Önce Bitti! 🚨`;
          tagClass = 'critical';
        } else if (diffDays === 0) {
          level = 'CRITICAL';
          countdownText = 'Bugün Sözleşme Bitiyor! ⚡';
          tagClass = 'critical';
        } else if (diffDays > 0 && diffDays <= 30) {
          level = 'CRITICAL';
          countdownText = `Son ${diffDays} Gün! 🔴 (Yenileme)`;
          tagClass = 'critical';
        } else if (diffDays > 30 && diffDays <= 60) {
          level = 'WARNING';
          countdownText = `${diffDays} Gün Kaldı 🟠`;
          tagClass = 'warning';
        }

        if (level) {
          const id = `contract_${c.id}`;
          allNotifs.push({
            id,
            category: 'CONTRACT',
            categoryName: 'Sözleşme',
            level,
            icon: '📑',
            title: `Sözleşme #${c.contractNo || c.id} — ${c.title || 'Sözleşme'}`,
            sub: `Yüklenici: ${c.supplier || '-'} | Birim: ${c.unit || '-'} | Bitiş: ${c.endDate || '-'} | Tutar: ${this.formatMoney(c.totalAmount || 0, c.currency || 'TRY', 2)}`,
            date: c.endDate,
            diffDays,
            tag: countdownText,
            tagClass,
            isRead: dismissed.includes(id),
            action: () => {
              this.switchView('contracts');
              setTimeout(() => this.viewContractDetails(c.id), 120);
            }
          });
        }
      }
    });

    // 3. INVOICES (Fatura Vade & Gecikme Uyarısı - Sadece Ödenmemiş ve son 30 gün ile gelecek 7 gün)
    const invoices = (this.state.invoices || []).filter(i => {
      const st = (i.paymentStatus || i.status || '').toLowerCase();
      return st !== 'ödendi' && st !== 'odendi';
    });

    invoices.forEach(i => {
      const due = this.parseDate(i.dueDate || i.invoiceDate);
      if (due) {
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        
        let level = null;
        let countdownText = '';
        let tagClass = '';

        if (diffDays >= -30 && diffDays < 0) {
          level = 'CRITICAL';
          countdownText = `${Math.abs(diffDays)} Gün Gecikti! 🚨`;
          tagClass = 'critical';
        } else if (diffDays === 0) {
          level = 'CRITICAL';
          countdownText = 'Bugün Ödeme Vadesi! ⚡';
          tagClass = 'critical';
        } else if (diffDays > 0 && diffDays <= 7) {
          level = 'WARNING';
          countdownText = `${diffDays} Gün Kaldı ⏳`;
          tagClass = 'warning';
        }

        if (level) {
          const id = `invoice_${i.id}`;
          allNotifs.push({
            id,
            category: 'INVOICE',
            categoryName: 'Fatura',
            level,
            icon: '🧾',
            title: `Fatura #${i.invoiceNo || i.id} — ${i.supplier || 'Tedarikçi'}`,
            sub: `Vade: ${i.dueDate || i.invoiceDate || '-'} | Tutar: ${this.formatMoney(i.amount || 0, i.currency || 'TRY', 2)} | Durum: ${i.paymentStatus || i.status || 'Ödeme Bekliyor'}`,
            date: i.dueDate || i.invoiceDate,
            diffDays,
            tag: countdownText,
            tagClass,
            isRead: dismissed.includes(id),
            action: () => {
              this.switchView('invoices');
              setTimeout(() => this.viewInvoiceDetails(i.id), 120);
            }
          });
        }
      }
    });

    // 4. REQUESTS (Sadece 'Kritik' öncelikli ve 7+ gündür açık bekleyen talepler)
    const requests = (this.state.requests || []).filter(r => r.status === 'Açık' && r.priority === 'Kritik');
    requests.forEach(r => {
      const arr = this.parseDate(r.arrivalDate || r.requestDate);
      if (arr) {
        arr.setHours(0, 0, 0, 0);
        const waitDays = Math.ceil((today - arr) / (1000 * 60 * 60 * 24));
        if (waitDays >= 7) {
          const id = `req_sla_${r.id}`;
          allNotifs.push({
            id,
            category: 'REQUEST',
            categoryName: 'Kritik Talep',
            level: 'INFO',
            icon: '🔴',
            title: `Kritik Talep #${r.requestBarcode || r.id} — ${r.subject || 'Talep'}`,
            sub: `Birim: ${r.unit || '-'} | Atanan: ${r.assignedTo || 'Atanmadı'} | Bekleme: ${waitDays} Gün`,
            date: r.arrivalDate || r.requestDate,
            diffDays: -waitDays,
            tag: `${waitDays} Gündür Bekliyor`,
            tagClass: 'info',
            isRead: dismissed.includes(id),
            action: () => {
              this.switchView('requests');
              setTimeout(() => this.viewRequestDetails(r.id), 120);
            }
          });
        }
      }
    });

    // Sort: CRITICAL first, then WARNING, then INFO; within level, by smallest diffDays
    const levelWeight = { 'CRITICAL': 1, 'WARNING': 2, 'INFO': 3 };
    allNotifs.sort((a, b) => {
      const wA = levelWeight[a.level] || 99;
      const wB = levelWeight[b.level] || 99;
      if (wA !== wB) return wA - wB;
      return a.diffDays - b.diffDays;
    });

    return allNotifs;
  },

  renderNotifications() {
    const allNotifs = this.getAllNotifications();
    const unreadNotifs = allNotifs.filter(n => !n.isRead);

    const badge = document.getElementById('notif-badge');
    const navNotifCount = document.getElementById('nav-notif-count');
    const headerCount = document.getElementById('notif-header-count');
    const list = document.getElementById('notif-list');

    const unreadCount = unreadNotifs.length;

    if (badge) {
      if (unreadCount > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = unreadCount;
      } else {
        badge.style.display = 'none';
      }
    }

    if (navNotifCount) {
      if (unreadCount > 0) {
        navNotifCount.style.display = 'inline-block';
        navNotifCount.innerText = unreadCount;
      } else {
        navNotifCount.style.display = 'none';
      }
    }

    if (headerCount) {
      headerCount.innerText = `${unreadCount} Aktif Bildirim`;
    }

    if (list) {
      if (allNotifs.length === 0) {
        list.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            ✅ Kritik veya yaklaşan vade uyarısı bulunmamaktadır.
          </div>
        `;
      } else {
        list.innerHTML = allNotifs.slice(0, 8).map((n, idx) => `
          <div class="notif-item ${n.level.toLowerCase()}" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:flex-start; gap:0.65rem; cursor:pointer;" onclick="App.handleNotifAction('${n.id}')">
            <span class="notif-icon">${n.icon}</span>
            <div class="notif-content">
              <div class="notif-title">
                <span style="font-weight:700; color:var(--text-main); font-size:0.82rem;">${n.categoryName}</span>
                <span class="notif-tag ${n.tagClass}">${n.tag}</span>
              </div>
              <div style="font-size:0.8rem; font-weight:600; color:var(--text-main); line-height:1.3; margin-bottom:0.2rem;">${n.title}</div>
              <div class="notif-desc">${n.sub}</div>
            </div>
          </div>
        `).join('');
      }
    }

    if (this.state.currentView === 'notifications') {
      this.renderNotificationsView();
    }
  },

  handleNotifAction(notifId) {
    const allNotifs = this.getAllNotifications();
    const notif = allNotifs.find(n => n.id === notifId);
    document.getElementById('notification-dropdown')?.classList.remove('show');
    if (notif && typeof notif.action === 'function') {
      notif.action();
    }
  },

  dismissNotif(id) {
    if (!this.state.dismissedNotifs) this.state.dismissedNotifs = [];
    if (!this.state.dismissedNotifs.includes(id)) {
      this.state.dismissedNotifs.push(id);
      localStorage.setItem('dismissedNotifs', JSON.stringify(this.state.dismissedNotifs));
    }
    this.renderNotifications();
  },

  markAllNotificationsRead() {
    const allNotifs = this.getAllNotifications();
    if (!this.state.dismissedNotifs) this.state.dismissedNotifs = [];

    allNotifs.forEach(n => {
      if (!this.state.dismissedNotifs.includes(n.id)) {
        this.state.dismissedNotifs.push(n.id);
      }
    });

    localStorage.setItem('dismissedNotifs', JSON.stringify(this.state.dismissedNotifs));
    this.showToast("Tüm bildirimler okundu olarak işaretlendi!", "success", "✅");
    this.renderNotifications();
  },

  renderNotificationsView() {
    const container = document.getElementById('notifications-cards-container');
    if (!container) return;

    const allNotifs = this.getAllNotifications();

    // Compute KPI Counts
    const countTotal = allNotifs.length;
    const countCritical = allNotifs.filter(n => n.level === 'CRITICAL').length;
    const countWarning = allNotifs.filter(n => n.level === 'WARNING').length;
    const countInfo = allNotifs.filter(n => n.level === 'INFO').length;

    const elTotal = document.getElementById('notif-kpi-total');
    const elCrit = document.getElementById('notif-kpi-critical');
    const elWarn = document.getElementById('notif-kpi-warning');
    const elInfo = document.getElementById('notif-kpi-info');

    if (elTotal) elTotal.innerText = countTotal;
    if (elCrit) elCrit.innerText = countCritical;
    if (elWarn) elWarn.innerText = countWarning;
    if (elInfo) elInfo.innerText = countInfo;

    // Category Counts
    const countGuar = allNotifs.filter(n => n.category === 'GUARANTEE').length;
    const countCont = allNotifs.filter(n => n.category === 'CONTRACT').length;
    const countInv = allNotifs.filter(n => n.category === 'INVOICE').length;
    const countReq = allNotifs.filter(n => n.category === 'REQUEST').length;

    const elCGuar = document.getElementById('notif-count-guarantee');
    const elCCont = document.getElementById('notif-count-contract');
    const elCInv = document.getElementById('notif-count-invoice');
    const elCReq = document.getElementById('notif-count-request');

    if (elCGuar) elCGuar.innerText = countGuar;
    if (elCCont) elCCont.innerText = countCont;
    if (elCInv) elCInv.innerText = countInv;
    if (elCReq) elCReq.innerText = countReq;

    // Filter by Level KPI (ALL, CRITICAL, WARNING, INFO)
    let filtered = allNotifs;
    if (this.state.notifFilter && this.state.notifFilter !== 'ALL') {
      filtered = filtered.filter(n => n.level === this.state.notifFilter);
    }

    // Filter by Category Tab (ALL, GUARANTEE, CONTRACT, INVOICE, REQUEST)
    if (this.state.notifCategory && this.state.notifCategory !== 'ALL') {
      filtered = filtered.filter(n => n.category === this.state.notifCategory);
    }

    // Filter by Search Text
    if (this.state.notifSearch) {
      const q = this.state.notifSearch;
      filtered = filtered.filter(n => 
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.sub && n.sub.toLowerCase().includes(q)) ||
        (n.categoryName && n.categoryName.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
          <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.25rem;">Seçilen kritere uygun bildirim bulunmuyor</h4>
          <p style="font-size: 0.85rem;">Tüm kritik ve yaklaşan vadeler güncel durumdadır.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(n => {
      let levelBadge = '';
      if (n.level === 'CRITICAL') levelBadge = `<span class="badge priority-kritik">🚨 ACİL / VADESİ GELEN</span>`;
      else if (n.level === 'WARNING') levelBadge = `<span class="badge priority-yüksek">⏳ YAKLAŞAN VADE</span>`;
      else levelBadge = `<span class="badge priority-orta">ℹ️ TAKİP HATIRLATMASI</span>`;

      return `
        <div class="notif-card-row ${n.level.toLowerCase()}">
          <div style="display: flex; gap: 1rem; align-items: center; flex: 1;">
            <div style="font-size: 2.2rem; background: var(--bg-hover, rgba(255,255,255,0.05)); width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); flex-shrink: 0;">
              ${n.icon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.3rem; flex-wrap: wrap;">
                ${levelBadge}
                <span class="badge status-open" style="font-size:0.72rem;">${n.categoryName}</span>
                <span class="notif-tag ${n.tagClass}" style="font-size:0.72rem;">${n.tag}</span>
                <span style="font-size: 0.78rem; color: var(--text-muted); margin-left: auto;">📅 Vade/Tarih: <strong>${n.date || '-'}</strong></span>
              </div>
              <h4 style="font-size: 1rem; margin: 0 0 0.3rem 0; color: var(--text-main); font-weight: 700;">${n.title}</h4>
              <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0; line-height: 1.4;">${n.sub}</p>
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center; flex-shrink: 0;">
            <button class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.82rem;" onclick="App.handleNotifAction('${n.id}')">
              <span>👁️</span> İncele & Kayda Git
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderDashboardAlerts() {
    const container = document.getElementById('dashboard-alerts-container');
    if (!container) return;

    if (this.state.dashboardAlertsDismissed) {
      container.style.display = 'none';
      return;
    }

    const notifs = this.getAllNotifications();
    const urgentNotifs = notifs.filter(n => n.level === 'CRITICAL' || n.level === 'WARNING');
    
    if (urgentNotifs.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    const topItems = urgentNotifs.slice(0, 3);
    const totalCount = urgentNotifs.length;

    container.style.display = 'block';
    container.innerHTML = `
      <div class="dashboard-alert-banner">
        <div class="alert-left" style="flex: 1; min-width: 0;">
          <div class="alert-icon-wrapper">
            <span style="font-size: 1.15rem;">🔔</span>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">
                Dikkat Gerektiren Hatırlatmalar
              </span>
              <span class="badge priority-kritik" style="font-size: 0.72rem; padding: 0.15rem 0.45rem;">${totalCount} Kayıt</span>
            </div>
            <div class="alert-items-list" style="display: flex; gap: 0.5rem; margin-top: 0.35rem; flex-wrap: wrap;">
              ${topItems.map(item => `
                <div class="alert-pill-item" onclick="App.handleNotifAction('${item.id}')" title="${item.sub}">
                  <span>${item.icon}</span>
                  <span class="pill-title">${item.title}</span>
                  <span class="pill-tag ${item.tagClass}">${item.tag}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
          <button class="btn-primary" onclick="App.switchView('notifications')" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; white-space: nowrap;">
            <span>Tümünü Gör (${totalCount})</span> &rarr;
          </button>
          <button type="button" class="btn-icon" onclick="App.dismissDashboardAlerts()" title="Bu hatırlatma çubuğunu gizle" style="font-size: 0.85rem; padding: 0.3rem 0.5rem; color: var(--text-muted); cursor:pointer;">
            ✕
          </button>
        </div>
      </div>
    `;
  },

  dismissDashboardAlerts() {
    this.state.dashboardAlertsDismissed = true;
    const container = document.getElementById('dashboard-alerts-container');
    if (container) container.style.display = 'none';
  },

  // ============================================================
  // 📁 DİJİTAL ARŞİV & DOKÜMAN YÖNETİM MOTORU
  // ============================================================
  openDocumentManager(entityType, entityId, entityTitle = '') {
    this.state.currentDocEntity = {
      entityType,
      entityId: parseInt(entityId, 10),
      title: entityTitle
    };

    const typeNames = {
      request: 'Talep Evrakları',
      contract: 'Sözleşme Evrakları',
      invoice: 'Fatura & Ödeme Evrakları',
      guarantee: 'Teminat Mektubu Evrakları',
      tender: 'İhale Süreç Evrakları'
    };

    const elTypeLabel = document.getElementById('doc-entity-type-label');
    const elTitleLabel = document.getElementById('doc-entity-title-label');
    const elModalTitle = document.getElementById('doc-modal-title');
    const elEntityTypeInput = document.getElementById('doc-upload-entity-type');
    const elEntityIdInput = document.getElementById('doc-upload-entity-id');

    if (elTypeLabel) elTypeLabel.innerText = typeNames[entityType] || 'Kayıt Evrakları';
    if (elTitleLabel) elTitleLabel.innerText = entityTitle || `#${entityId}`;
    if (elModalTitle) elModalTitle.innerText = `📁 Dijital Arşiv — ${typeNames[entityType] || 'Evraklar'}`;
    if (elEntityTypeInput) elEntityTypeInput.value = entityType;
    if (elEntityIdInput) elEntityIdInput.value = entityId;

    this.renderEntityDocuments();
    this.openModal('modal-document-manager');
  },

  openDocumentManagerForCurrentDetail() {
    if (!this.state.currentActiveDetail || !this.state.currentActiveDetail.data) {
      this.showToast("Lütfen önce bir kayıt seçin.", "warning");
      return;
    }
    const { type, data } = this.state.currentActiveDetail;
    let title = '';
    if (type === 'request') title = `#${data.requestBarcode || data.id} — ${data.subject || 'Talep'}`;
    else if (type === 'contract') title = `#${data.contractNo || data.id} — ${data.title || 'Sözleşme'}`;
    else if (type === 'invoice') title = `#${data.invoiceNo || data.id} — ${data.supplier || 'Fatura'}`;
    else if (type === 'guarantee') title = `#${data.letterNo || data.id} — ${data.bank || data.bankName || 'Teminat'}`;
    else if (type === 'tender') title = `#${data.tenderNo || data.id} — ${data.title || 'İhale'}`;
    this.openDocumentManager(type, data.id, title);
  },

  async renderEntityDocuments() {
    const { entityType, entityId } = this.state.currentDocEntity;
    const tbody = document.getElementById('tbody-entity-documents');
    const countEl = document.getElementById('doc-list-count');
    if (!tbody || !entityType || !entityId) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
          ⏳ Evraklar yükleniyor...
        </td>
      </tr>
    `;

    try {
      const res = await this.authFetch(`/api/documents?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) {
        const docs = await res.json();
        if (countEl) countEl.innerText = docs.length;

        if (docs.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">
                📎 Bu kayda eklenmiş henüz bir evrak bulunmuyor. Yukarıdaki formdan yeni belge yükleyebilirsiniz.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = docs.map(doc => {
          const ext = (doc.fileName.split('.').pop() || '').toLowerCase();
          let badgeType = 'other';
          let icon = '📄';

          if (ext === 'pdf') { badgeType = 'pdf'; icon = '📕'; }
          else if (['doc', 'docx'].includes(ext)) { badgeType = 'doc'; icon = '📘'; }
          else if (['xls', 'xlsx', 'csv'].includes(ext)) { badgeType = 'xls'; icon = '📗'; }
          else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) { badgeType = 'img'; icon = '🖼️'; }
          else if (['zip', 'rar', '7z'].includes(ext)) { badgeType = 'zip'; icon = '📦'; }

          const sizeKB = doc.fileSize ? (doc.fileSize / 1024).toFixed(1) + ' KB' : '-';

          return `
            <tr>
              <td><span class="file-badge ${badgeType}">${icon} .${ext}</span></td>
              <td>
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${doc.fileName}</div>
                ${doc.description ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">${doc.description}</div>` : ''}
              </td>
              <td><span class="badge status-open" style="font-size:0.75rem;">${doc.category || 'Genel'}</span></td>
              <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${sizeKB}</td>
              <td style="font-size: 0.78rem; color: var(--text-muted);">
                <div>👤 ${doc.uploadedBy || 'Sistem'}</div>
                <div>📅 ${doc.uploadedAt || '-'}</div>
              </td>
              <td style="text-align: right;">
                <div class="action-btns" style="justify-content: flex-end;">
                  <button class="btn-icon" onclick="App.previewDocument(${doc.id})" title="Önizle / Yeni Sekmede Aç">👁️</button>
                  <button class="btn-icon" onclick="App.downloadDocument(${doc.id})" title="İndir">📥</button>
                  <button class="btn-icon" onclick="App.deleteDocument(${doc.id})" title="Sil">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--status-rejected); padding:1rem;">Evraklar yüklenirken sunucu hatası oluştu.</td></tr>`;
      }
    } catch (err) {
      console.error("Doküman yükleme hatası:", err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--status-rejected); padding:1rem;">Evrak listesine erişilemedi.</td></tr>`;
    }
  },

  async handleUploadDocumentSubmit() {
    const { entityType, entityId } = this.state.currentDocEntity;
    if (!entityType || !entityId) return;

    const fileInput = document.getElementById('doc-upload-file-input');
    const categoryInput = document.getElementById('doc-upload-category');
    const descInput = document.getElementById('doc-upload-description');
    const progressEl = document.getElementById('doc-upload-progress');
    const submitBtn = document.getElementById('btn-submit-doc-upload');

    const files = Array.from(fileInput?.files || []);
    if (files.length === 0) {
      this.showToast("Lütfen yüklenecek en az bir dosya seçin.", "warning");
      return;
    }

    const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
    for (const f of files) {
      if (f.size > MAX_SIZE) {
        this.showToast(`"${f.name}" dosyası 100 MB sınırını aşıyor (${(f.size / (1024 * 1024)).toFixed(1)} MB).`, "error");
        return;
      }
    }

    if (progressEl) progressEl.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    const readFileAsDataURL = (f) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(f);
      });
    };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (progressEl) {
          progressEl.innerText = `⏳ Dosyalar yükleniyor (${i + 1} / ${files.length}): "${file.name}"...`;
        }

        try {
          const fileData = await readFileAsDataURL(file);
          const payload = {
            entityType,
            entityId,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileData,
            category: categoryInput?.value || 'Genel',
            description: descInput?.value?.trim() || '',
            uploadedBy: this.state.currentUser ? this.state.currentUser.name : 'Sistem'
          };

          const res = await this.authFetch('/api/documents/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            successCount++;
            this.logAction('Evrak Yüklendi', `${entityType} #${entityId} için "${file.name}" yüklendi.`);
          } else {
            failCount++;
            const err = await res.json().catch(() => ({}));
            console.error(`"${file.name}" yüklenemedi:`, err.error);
          }
        } catch (err) {
          failCount++;
          console.error(`"${file.name}" okuma hatası:`, err);
        }
      }

      if (successCount > 0) {
        this.showToast(`${successCount} adet dosya başarıyla arşive yüklendi!`, "success", "📎");
        if (fileInput) fileInput.value = '';
        if (descInput) descInput.value = '';
        await this.renderEntityDocuments();
      }

      if (failCount > 0) {
        this.showToast(`${failCount} dosya yüklenirken hata oluştu.`, "error");
      }
    } finally {
      if (progressEl) {
        progressEl.style.display = 'none';
        progressEl.innerText = '⏳ Dosyalar sunucuya yükleniyor, lütfen bekleyin...';
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  previewDocument(docId) {
    window.open(`/api/documents/${docId}/preview`, '_blank');
  },

  downloadDocument(docId) {
    window.location.href = `/api/documents/${docId}/download`;
  },

  async deleteDocument(docId) {
    this.showConfirm("Evrakı Sil", "Bu evrakı sistemden ve sunucu diskinden kalıcı olarak silmek istediğinize emin misiniz?", async () => {
      try {
        const res = await this.authFetch(`/api/documents/${docId}`, { method: 'DELETE' });
        if (res.ok) {
          this.showToast("Evrak başarıyla silindi.", "warning", "🗑️");
          this.logAction('Evrak Silindi', `Doküman ID #${docId} silindi.`);
          await this.renderEntityDocuments();
        } else {
          this.showToast("Evrak silinemedi.", "error");
        }
      } catch (err) {
        console.error(err);
        this.showToast("Evrak silinirken hata oluştu.", "error");
      }
    }, '🗑️');
  },

  downloadAllEntityDocsZip() {
    const { entityType, entityId } = this.state.currentDocEntity;
    if (!entityType || !entityId) return;
    this.showToast("Tüm evraklar ZIP olarak hazırlanıyor...", "info", "📦");
    window.location.href = `/api/documents/export-zip?entityType=${entityType}&entityId=${entityId}`;
  },

  // 🔍 GLOBAL SEARCH SYSTEM (Ctrl + K)
  handleGlobalSearch(query) {
    const resultsBox = document.getElementById('global-search-results');
    if (!resultsBox) return;

    const q = query.toLowerCase().trim();
    if (!q || q.length < 2) {
      resultsBox.classList.remove('show');
      resultsBox.innerHTML = '';
      return;
    }

    const matchingRequests = (this.state.requests || []).filter(r => 
      r.requestBarcode?.toString().toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q) ||
      r.supplier?.toLowerCase().includes(q)
    ).slice(0, 5);

    const matchingContracts = (this.state.contracts || []).filter(c =>
      c.contractNo?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.supplier?.toLowerCase().includes(q)
    ).slice(0, 5);

    const matchingInvoices = (this.state.invoices || []).filter(i =>
      i.invoiceNo?.toLowerCase().includes(q) ||
      i.supplier?.toLowerCase().includes(q) ||
      i.relatedBarcode?.toLowerCase().includes(q)
    ).slice(0, 5);

    const totalMatches = matchingRequests.length + matchingContracts.length + matchingInvoices.length;

    if (totalMatches === 0) {
      resultsBox.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">"${query}" ile eşleşen talep, sözleşme veya fatura bulunamadı.</div>`;
      resultsBox.classList.add('show');
      return;
    }

    let html = '';

    if (matchingRequests.length > 0) {
      html += `<div class="search-category-title">📋 Talepler (${matchingRequests.length})</div>`;
      html += matchingRequests.map(r => `
        <div class="search-result-item" onclick="App._onSearchSelect('request', ${r.id})">
          <div>
            <div class="search-result-title">${r.subject}</div>
            <div class="search-result-sub">Barkod: ${r.requestBarcode || '-'} | Birim: ${r.unit}</div>
          </div>
          <span class="badge status-${r.status?.toLowerCase()}">${r.status}</span>
        </div>
      `).join('');
    }

    if (matchingContracts.length > 0) {
      html += `<div class="search-category-title">📑 Sözleşmeler (${matchingContracts.length})</div>`;
      html += matchingContracts.map(c => `
        <div class="search-result-item" onclick="App._onSearchSelect('contract', ${c.id})">
          <div>
            <div class="search-result-title">${c.title}</div>
            <div class="search-result-sub">Sözleşme No: ${c.contractNo} | Firma: ${c.supplier}</div>
          </div>
          <span class="badge status-${c.status === 'Aktif' ? 'completed' : 'rejected'}">${c.status}</span>
        </div>
      `).join('');
    }

    if (matchingInvoices.length > 0) {
      html += `<div class="search-category-title">🧾 Faturalar (${matchingInvoices.length})</div>`;
      html += matchingInvoices.map(i => `
        <div class="search-result-item" onclick="App._onSearchSelect('invoice', ${i.id})">
          <div>
            <div class="search-result-title">Fatura #${i.invoiceNo}</div>
            <div class="search-result-sub">Tedarikçi: ${i.supplier} | Tutar: ${i.amount ? i.amount.toLocaleString('tr-TR') + ' ₺' : '-'}</div>
          </div>
          <span class="badge status-${i.paymentStatus === 'Ödendi' ? 'completed' : 'open'}">${i.paymentStatus}</span>
        </div>
      `).join('');
    }

    resultsBox.innerHTML = html;
    resultsBox.classList.add('show');
  },

  _onSearchSelect(type, id) {
    const resultsBox = document.getElementById('global-search-results');
    if (resultsBox) resultsBox.classList.remove('show');
    const input = document.getElementById('global-search-input');
    if (input) input.value = '';

    if (type === 'request') {
      this.switchView('requests');
      this.viewRequestDetails(id);
    } else if (type === 'contract') {
      this.switchView('contracts');
      this.viewContractDetails(id);
    } else if (type === 'invoice') {
      this.switchView('invoices');
      this.viewInvoiceDetails(id);
    }
  },

  // 📷 EXPORT CHART TO PNG
  exportChartToPNG(canvasId, filename) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      this.showToast("Grafik öğesi bulunamadı.", "error", "⚠️");
      return;
    }

    try {
      const imageURI = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename || 'Grafik_Analizi.png';
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast("Grafik resmi (PNG) başarıyla indirildi!", "success", "📷");
    } catch (e) {
      console.error("Chart export error:", e);
      this.showToast("Grafik resmi aktarılırken hata oluştu.", "error", "⚠️");
    }
  },

  // 1. DASHBOARD RENDERER
  renderDashboard() {
    this.renderDashboardAlerts();
    const requests = this.getFilteredRequests();

    const totalCount = requests.length;
    const completedCount = requests.filter(r => r.status === 'Tamamlandı').length;
    const openCount = requests.filter(r => r.status === 'Açık').length;
    const totalSpend = requests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const completedRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : 0;

    let totalEstimated = 0;
    let totalSavings = 0;

    requests.forEach(r => {
      const initAmt = parseFloat(r.budgetAmount || r.estimatedAmount) || 0;
      const actAmt = parseFloat(r.actualAmount) || 0;
      if (initAmt > 0 && actAmt > 0 && initAmt > actAmt) {
        totalEstimated += initAmt;
        totalSavings += (initAmt - actAmt);
      }
    });

    const savingsRate = totalEstimated > 0 ? ((totalSavings / totalEstimated) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-demands').innerText = totalCount;
    document.getElementById('kpi-completed-demands').innerText = completedCount;
    document.getElementById('kpi-completed-rate').innerText = `%${completedRate} Tamamlanma`;
    document.getElementById('kpi-open-demands').innerText = openCount;
    document.getElementById('kpi-total-spend').innerText = this.formatMoney(totalSpend, 'TRY', 2);

    const elSavingsTotal = document.getElementById('kpi-savings-total');
    const elSavingsRate = document.getElementById('kpi-savings-rate');

    if (elSavingsTotal) elSavingsTotal.innerText = this.formatMoney(totalSavings, 'TRY', 2);
    if (elSavingsRate) elSavingsRate.innerText = `%${savingsRate} Bütçe Kazancı`;

    this.renderDashboardCharts(requests);
    this.renderDashboardTables(requests);
  },

  renderDashboardCharts(requests) {
    const statusCounts = { 'Tamamlandı': 0, 'Açık': 0, 'Reddedildi': 0 };
    requests.forEach(r => {
      if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    });

    this.createOrUpdateChart('chart-status-pie', 'doughnut', {
      labels: ['Tamamlandı', 'Açık', 'Reddedildi'],
      datasets: [{
        data: [statusCounts['Tamamlandı'], statusCounts['Açık'], statusCounts['Reddedildi']],
        backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
        borderWidth: 0
      }]
    }, { responsive: true, maintainAspectRatio: false });

    const commonChartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { right: 15, left: 5, top: 10, bottom: 5 }
      },
      plugins: {
        legend: {
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      }
    };

    const months = ['Eyl', 'Eki', 'Kas', 'Ara', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu'];
    const monthlyCounts = Array(12).fill(0);

    requests.forEach(r => {
      const dStr = r.arrivalDate || r.requestDate;
      if (dStr) {
        let m = -1;
        if (dStr.includes('-')) m = parseInt(dStr.split('-')[1]) - 1;
        else if (dStr.includes('.')) m = parseInt(dStr.split('.')[1]) - 1;
        if (m >= 0 && m < 12) {
          const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
          monthlyCounts[acadIdx]++;
        }
      }
    });

    this.createOrUpdateChart('chart-monthly-trend', 'line', {
      labels: months,
      datasets: [{
        label: 'Açılan Talepler',
        data: monthlyCounts,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        fill: true,
        tension: 0.4
      }]
    }, {
      ...commonChartOpts,
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: false }
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } }
        }
      }
    });

    const unitMap = {};
    requests.forEach(r => {
      if (r.unit) unitMap[r.unit] = (unitMap[r.unit] || 0) + 1;
    });
    const sortedUnits = Object.entries(unitMap).sort((a,b)=>b[1]-a[1]).slice(0, 8);

    this.createOrUpdateChart('chart-unit-bar', 'bar', {
      labels: sortedUnits.map(u => u[0].length > 12 ? u[0].substring(0, 12) + '...' : u[0]),
      datasets: [{
        label: 'Talep Adedi',
        data: sortedUnits.map(u => u[1]),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    }, {
      ...commonChartOpts,
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxRotation: 30 }
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } }
        }
      }
    });

    const activeUserNames = this.state.users.filter(u => u.isActive !== false).map(u => u.name);
    const personMap = {};
    activeUserNames.forEach(n => personMap[n] = 0);

    requests.forEach(r => {
      if (r.assignedTo && personMap[r.assignedTo] !== undefined) {
        personMap[r.assignedTo]++;
      }
    });

    this.createOrUpdateChart('chart-personnel-bar', 'bar', {
      labels: Object.keys(personMap),
      datasets: [{
        label: 'Aktif İş Yükü (Talep)',
        data: Object.values(personMap),
        backgroundColor: '#06b6d4',
        borderRadius: 6
      }]
    }, {
      ...commonChartOpts,
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 0 }
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } }
        }
      }
    });
  },

  createOrUpdateChart(canvasId, type, data, options) {
    if (this.state.charts[canvasId]) {
      this.state.charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    this.state.charts[canvasId] = new Chart(ctx, { type, data, options });
  },

  renderDashboardTables(requests) {
    const unitStats = {};
    requests.forEach(r => {
      if (!unitStats[r.unit]) unitStats[r.unit] = { total: 0, completed: 0, open: 0 };
      unitStats[r.unit].total++;
      if (r.status === 'Tamamlandı') unitStats[r.unit].completed++;
      if (r.status === 'Açık') unitStats[r.unit].open++;
    });

    const topUnits = Object.entries(unitStats).sort((a,b)=>b[1].total - a[1].total).slice(0, 5);
    const unitTbody = document.querySelector('#table-top-units tbody');
    if (unitTbody) {
      unitTbody.innerHTML = topUnits.map(([uName, s]) => `
        <tr>
          <td style="font-weight:600;">${uName}</td>
          <td><span class="badge priority-orta">${s.total}</span></td>
          <td><span class="badge status-completed">${s.completed}</span></td>
          <td><span class="badge status-open">${s.open}</span></td>
        </tr>
      `).join('');
    }

    const suppStats = {};
    requests.forEach(r => {
      if (r.supplier && r.supplier !== '-' && r.supplier.trim() !== '') {
        const sName = r.supplier.trim();
        if (!suppStats[sName]) suppStats[sName] = { spend: 0, count: 0 };
        suppStats[sName].spend += (r.actualAmount || 0);
        suppStats[sName].count++;
      }
    });

    const topSupps = Object.entries(suppStats).sort((a,b)=>b[1].spend - a[1].spend).slice(0, 5);
    const suppTbody = document.querySelector('#table-top-suppliers tbody');
    if (suppTbody) {
      suppTbody.innerHTML = topSupps.map(([sName, s]) => `
        <tr>
          <td style="font-weight:600;">${sName}</td>
          <td style="color:var(--status-completed); font-weight:700;">${s.spend.toLocaleString('tr-TR')} ₺</td>
          <td>${s.count} talep</td>
        </tr>
      `).join('');
    }
  },

  getStatusBadge(r) {
    if (r.status === 'Tamamlandı') {
      let ratingBadge = '';
      if (r.supplier) {
        // Her sipariş/talep SADECE KENDİSİNE AİT requestId ile 1-e-1 eşleştirilir
        const rating = (this.state.vendorRatings || []).find(v => 
          v.requestId && (String(v.requestId) === String(r.id) || (r.requestBarcode && String(v.requestId) === String(r.requestBarcode)))
        );

        if (rating) {
          ratingBadge = `
            <div style="margin-top:0.25rem;">
              <span class="score-badge-gold" style="font-size:0.68rem; padding:0.1rem 0.4rem; cursor:pointer;" onclick="App.openVendorProfile('${r.supplier.replace(/'/g, "\\'")}')" title="${rating.ratedBy} tarafından bu talep için puanlandı (${rating.ratedAt})">
                ⭐ ${rating.overallScore} (Puanlandı)
              </span>
            </div>
          `;
        } else {
          ratingBadge = `
            <div style="margin-top:0.25rem; display:flex; align-items:center; gap:0.3rem;">
              <span class="badge" style="background:rgba(245,158,11,0.12); color:#d97706; border:1px solid rgba(245,158,11,0.35); font-size:0.68rem; padding:0.1rem 0.35rem;" title="Bu sipariş için birimden henüz puanlama yapılmadı">
                ⏳ Puan Bekliyor
              </span>
              <button class="btn-icon" style="font-size:0.75rem; padding:0.1rem 0.3rem; border:1px solid rgba(245,158,11,0.4); background:rgba(245,158,11,0.08);" onclick="App.sendRatingReminder('${r.id}')" title="Birime Hatırlatma E-Postası Gönder">🔔</button>
            </div>
          `;
        }
      }
      return `<div><span class="badge status-completed">✅ Tamamlandı</span>${ratingBadge}</div>`;
    } else if (r.status === 'Reddedildi' || r.status === 'İptal') {
      return `<span class="badge status-rejected">❌ ${r.status}</span>`;
    } else if (r.status === 'Revize İstendi') {
      return `<span class="badge status-revision" title="Birime eksik teknik şartname veya bilgi bildirildi, revize bekleniyor">⚠️ Revize İstendi</span>`;
    } else {
      if (r.orderBarcode || r.orderDate) {
        return `<span class="badge priority-yüksek" style="background: rgba(245, 158, 11, 0.18); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.5);" title="Sipariş geçildi, teslimat bekleniyor">🚚 Sipariş Verildi</span>`;
      } else if (r._diffDays >= 14) {
        return `<span class="badge badge-sla-overdue" title="14 günden fazla süredir işlem bekliyor!">🚨 ${r._diffDays} Gün (SLA Gecikmede)</span>`;
      } else if (r._diffDays >= 8) {
        return `<span class="badge priority-yüksek">🟠 ${r._diffDays} Gün Bekliyor</span>`;
      } else {
        return `<span class="badge status-open">🔵 Açık / Teklif Aşamasında</span>`;
      }
    }
  },

  async sendRatingReminder(reqId) {
    const req = (this.state.requests || []).find(r => String(r.id) === String(reqId));
    if (!req) return;

    this.showToast(`"${req.unit}" birimine puanlama hatırlatması gönderiliyor...`, 'info', '⏳');
    try {
      const res = await this.authFetch(`/api/requests/${reqId}/remind-rating`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`"${req.unit}" birimine puanlama hatırlatma e-postası başarıyla gönderildi!`, 'success', '🔔');
        this.logAction('Puanlama Hatırlatması Gönderildi', `Talep #${req.requestBarcode || req.id} - ${req.unit}`);
      } else {
        this.showToast(data.error || 'Hatırlatma e-postası gönderilemedi.', 'error');
      }
    } catch (e) {
      console.error('sendRatingReminder error:', e);
      this.showToast('Sunucu hatası: ' + e.message, 'error');
    }
  },

  parseDateValue(str) {
    if (!str) return 0;
    if (str instanceof Date) return isNaN(str.getTime()) ? 0 : str.getTime();
    const s = String(str).trim();
    if (s.includes('.')) {
      const parts = s.split('.');
      if (parts.length === 3) {
        let yr = parseInt(parts[2], 10);
        if (yr > 2099 && String(yr).startsWith('2021')) yr = 2026;
        const mo = parseInt(parts[1], 10) - 1;
        const dy = parseInt(parts[0], 10);
        const dt = new Date(yr, mo, dy);
        return isNaN(dt.getTime()) ? 0 : dt.getTime();
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  },

  sortRequestsList(list, sortKey) {
    const priorityWeight = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };
    return list.sort((a, b) => {
      if (sortKey === 'DATE_ASC') {
        const dtA = this.parseDateValue(a.arrivalDate || a.requestDate);
        const dtB = this.parseDateValue(b.arrivalDate || b.requestDate);
        return dtA - dtB;
      }
      if (sortKey === 'AMOUNT_DESC') {
        const valA = parseFloat(a.estimatedAmount) || parseFloat(a.actualAmount) || parseFloat(a.budgetAmount) || 0;
        const valB = parseFloat(b.estimatedAmount) || parseFloat(b.actualAmount) || parseFloat(b.budgetAmount) || 0;
        return valB - valA;
      }
      if (sortKey === 'AMOUNT_ASC') {
        const valA = parseFloat(a.estimatedAmount) || parseFloat(a.actualAmount) || parseFloat(a.budgetAmount) || 0;
        const valB = parseFloat(b.estimatedAmount) || parseFloat(b.actualAmount) || parseFloat(b.budgetAmount) || 0;
        return valA - valB;
      }
      if (sortKey === 'PRIORITY_DESC') {
        const pA = priorityWeight[a.priority] || 0;
        const pB = priorityWeight[b.priority] || 0;
        return pB - pA;
      }
      if (sortKey === 'SLA_DESC') {
        return (b._diffDays || 0) - (a._diffDays || 0);
      }
      // DATE_DESC (default)
      const dtA = this.parseDateValue(a.arrivalDate || a.requestDate);
      const dtB = this.parseDateValue(b.arrivalDate || b.requestDate);
      return dtB - dtA;
    });
  },

  // 2. REQUESTS TABLE RENDERER
  renderRequestsTable() {
    const allFilteredRequests = this.getFilteredRequests();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allFilteredRequests.forEach(r => {
      if (r.arrivalDate || r.requestDate) {
        const arrDt = new Date(r.arrivalDate || r.requestDate);
        arrDt.setHours(0, 0, 0, 0);
        r._diffDays = Math.max(0, Math.ceil((today - arrDt) / (1000 * 60 * 60 * 24)));
      } else {
        r._diffDays = 0;
      }
    });

    // Update Request Management KPI Totals
    const reqTotal = allFilteredRequests.length;
    const reqOpen = allFilteredRequests.filter(r => r.status === 'Açık').length;
    const reqCompleted = allFilteredRequests.filter(r => r.status === 'Tamamlandı').length;
    const reqOverdue = allFilteredRequests.filter(r => r.status === 'Açık' && r._diffDays >= 14).length;

    const elReqTotal = document.getElementById('req-kpi-total');
    const elReqOpen = document.getElementById('req-kpi-open');
    const elReqOverdue = document.getElementById('req-kpi-overdue');
    const elReqCompleted = document.getElementById('req-kpi-completed');

    if (elReqTotal) elReqTotal.innerText = reqTotal;
    if (elReqOpen) elReqOpen.innerText = reqOpen;
    if (elReqOverdue) elReqOverdue.innerText = reqOverdue;
    if (elReqCompleted) elReqCompleted.innerText = reqCompleted;

    let requests = [...allFilteredRequests];

    const searchText = document.getElementById('filter-search')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('filter-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-unit')?.value || 'ALL';
    const personVal = document.getElementById('filter-person')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-priority')?.value || 'ALL';
    const sortVal = document.getElementById('filter-sort')?.value || 'DATE_DESC';

    requests = requests.filter(r => {

      if (statusVal === 'OVERDUE_14') {
        if (r.status !== 'Açık' || r._diffDays < 14) return false;
      } else if (statusVal !== 'ALL' && r.status !== statusVal) {
        return false;
      }

      if (unitVal !== 'ALL' && r.unit !== unitVal) return false;
      if (personVal !== 'ALL' && r.assignedTo !== personVal) return false;
      if (priorityVal !== 'ALL' && r.priority !== priorityVal) return false;
      
      if (searchText) {
        const matchBarcode = r.requestBarcode?.toString().toLowerCase().includes(searchText);
        const matchSubject = r.subject?.toLowerCase().includes(searchText);
        const matchDesc = r.description?.toLowerCase().includes(searchText);
        const matchSupplier = r.supplier?.toLowerCase().includes(searchText);
        if (!matchBarcode && !matchSubject && !matchDesc && !matchSupplier) return false;
      }
      return true;
    });

    // Apply Sorting
    requests = this.sortRequestsList(requests, sortVal);

    const totalItems = requests.length;
    const totalPages = Math.ceil(totalItems / this.state.pageSize) || 1;
    if (this.state.currentPage > totalPages) this.state.currentPage = totalPages;

    const startIdx = (this.state.currentPage - 1) * this.state.pageSize;
    const pageRequests = requests.slice(startIdx, startIdx + this.state.pageSize);

    const pageInfo = document.getElementById('pagination-info');
    if (pageInfo) {
      pageInfo.innerText = `Gösterilen: ${totalItems > 0 ? startIdx + 1 : 0}-${Math.min(startIdx + this.state.pageSize, totalItems)} / ${totalItems}`;
    }
    const pageNum = document.getElementById('page-num');
    if (pageNum) pageNum.innerText = `${this.state.currentPage} / ${totalPages}`;

    const tbody = document.querySelector('#table-requests tbody');
    if (!tbody) return;

    if (pageRequests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:2rem;">Arama kriterlerine uygun talep bulunamadı.</td></tr>`;
      return;
    }

    const isAdmin = this.state.currentUser?.role === 'ADMIN';

    tbody.innerHTML = pageRequests.map((r, i) => `
      <tr>
        <td><input type="checkbox" class="chk-select-request" data-id="${r.id}" onchange="App._onRowCheckboxChange()"></td>
        <td>${r.sequenceNo || startIdx + i + 1}</td>
        <td class="sticky-col-left"><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600; min-width: 220px; max-width: 320px;">
          <div>${r.subject}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${r.description ? r.description.substring(0, 45) + '...' : ''}</div>
        </td>
        <td style="font-size:0.8rem; min-width: 140px;">${r.unit}</td>
        <td style="white-space:nowrap;"><span style="font-weight:600;">${r.assignedTo}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">${r.arrivalDate || r.requestDate}</td>
        <td style="white-space:nowrap;"><span class="badge priority-${r.priority?.toLowerCase() || 'orta'}">${r.priority || 'Orta'}</span></td>
        <td style="white-space:nowrap;">${this.getStatusBadge(r)}</td>
        <td style="font-weight:700; font-family:var(--font-mono); white-space:nowrap; text-align:right;">${r.actualAmount > 0 ? this.formatMoney(r.actualAmount, r.currency || 'TRY', 2) : '-'}</td>
        <td class="sticky-col-right" style="white-space:nowrap;">
          <div class="action-btns">
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', '${r.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
            <button class="btn-icon" onclick="App.openDocumentManager('request', '${r.id}', '#${r.requestBarcode || r.id} — ${r.subject?.replace(/'/g, "\\'")}')" title="Evraklar & Dijital Arşiv">📁</button>
            <button class="btn-icon" onclick="App.openEditModal('${r.id}')" title="Düzenle / Sipariş Gir">✏️</button>
            <button class="btn-icon" style="color:#ea580c;" onclick="App.openRevisionModal('${r.id}')" title="Birimden Revize / Eksik Şartname İste">⚠️</button>
            <button class="btn-icon" style="color:#10b981;" onclick="App.openInspectionReport('${r.id}')" title="Muayene ve Kabul Tutanağı (PDF / Yazdır)">📄</button>
            ${isAdmin ? `<button class="btn-icon" onclick="App.deleteRequest('${r.id}')" title="Talebi Sil (Sadece Yönetici)">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  // 3. WORKLOAD & DELEGATION RENDERER
  renderWorkloadView() {
    const requests = this.getFilteredRequests();
    
    const activeUsers = this.state.users.filter(u => u.isActive !== false);
    const personMap = {};
    activeUsers.forEach(u => {
      personMap[u.name] = {
        user: u,
        total: 0,
        open: 0,
        completed: 0,
        rejected: 0,
        critical: 0,
        high: 0,
        score: 0,
        savings: 0,
        savingsCount: 0,
        initialTotal: 0,
        actualTotal: 0
      };
    });

    requests.forEach(r => {
      const pName = r.assignedTo;
      if (personMap[pName]) {
        const p = personMap[pName];
        p.total++;
        if (r.status === 'Açık') p.open++;
        if (r.status === 'Tamamlandı') p.completed++;
        if (r.status === 'Reddedildi') p.rejected++;
        if (r.priority === 'Kritik') p.critical++;
        if (r.priority === 'Yüksek') p.high++;

        const initAmt = parseFloat(r.budgetAmount || r.estimatedAmount) || 0;
        const actAmt = parseFloat(r.actualAmount) || 0;

        if (initAmt > 0 && actAmt > 0 && initAmt > actAmt) {
          const diff = initAmt - actAmt;
          p.savings += diff;
          p.savingsCount++;
          p.initialTotal += initAmt;
          p.actualTotal += actAmt;
        }
      }
    });

    Object.values(personMap).forEach(p => {
      p.score = (p.open * 2) + (p.critical * 3) + (p.high * 2) + p.total;
    });

    const cardsContainer = document.getElementById('workload-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = Object.values(personMap).map(p => {
        const savingStr = p.savings >= 1000000 
          ? (p.savings / 1000000).toFixed(2) + 'M ₺' 
          : p.savings >= 1000 
            ? (p.savings / 1000).toFixed(1) + 'k ₺' 
            : p.savings.toLocaleString('tr-TR') + ' ₺';

        return `
          <div class="workload-card">
            <div class="workload-header">
              <div class="person-info">
                <h4>${p.user.name}</h4>
                <p>${p.user.title}</p>
              </div>
              <div class="workload-score">
                <div class="score-num">${p.score}</div>
                <p>Yük Skoru</p>
              </div>
            </div>

            <div class="workload-stats">
              <div class="stat-box">
                <h5>${p.total}</h5>
                <p>Toplam</p>
              </div>
              <div class="stat-box">
                <h5 style="color:var(--status-open);">${p.open}</h5>
                <p>Açık</p>
              </div>
              <div class="stat-box">
                <h5 style="color:var(--status-completed);">${p.completed}</h5>
                <p>Biten</p>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Render Personnel Savings Table & Summary Badge
    const grandSavings = Object.values(personMap).reduce((sum, p) => sum + p.savings, 0);
    const savingsBadge = document.getElementById('total-savings-summary-badge');
    if (savingsBadge) {
      savingsBadge.innerHTML = `💰 Toplam Pazarlık Tasarrufu: <strong>${grandSavings.toLocaleString('tr-TR')} ₺</strong>`;
    }

    const savingsTbody = document.querySelector('#table-personnel-savings tbody');
    if (savingsTbody) {
      const sortedPersons = Object.values(personMap).sort((a, b) => b.savings - a.savings);
      
      savingsTbody.innerHTML = sortedPersons.map(p => {
        const ratePct = p.initialTotal > 0 ? ((p.savings / p.initialTotal) * 100).toFixed(1) : '0.0';
        return `
          <tr>
            <td><strong style="color:var(--text-main);">${p.user.name}</strong></td>
            <td style="font-size:0.82rem; color:var(--text-muted);">${p.user.title}</td>
            <td><span class="badge" style="background:var(--bg-card);">${p.total} İş</span></td>
            <td><span class="badge status-open">${p.savingsCount} Pazarlıklı İş</span></td>
            <td style="font-family:var(--font-mono); font-size:0.88rem;">${p.initialTotal > 0 ? this.formatMoney(p.initialTotal, 'TRY', 2) : '-'}</td>
            <td style="font-family:var(--font-mono); font-size:0.88rem;">${p.actualTotal > 0 ? this.formatMoney(p.actualTotal, 'TRY', 2) : '-'}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--status-completed); font-size:0.95rem;">
              ${p.savings > 0 ? '+' + this.formatMoney(p.savings, 'TRY', 2) : '0,00 ₺'}
            </td>
            <td>
              <span class="badge" style="background:${p.savings > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-card)'}; color:${p.savings > 0 ? 'var(--status-completed)' : 'var(--text-muted)'}; font-weight:700;">
                %${ratePct} Tasarruf
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    this.renderDelegationTable(requests);
  },

  renderDelegationTable(requests) {
    const searchText = document.getElementById('filter-delegation-search')?.value.toLowerCase().trim() || '';
    const fromPerson = document.getElementById('delegate-from-person')?.value || 'ALL';
    const unitVal = document.getElementById('filter-delegation-unit')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-delegation-priority')?.value || 'ALL';

    let filtered = requests.filter(r => r.status === 'Açık');

    if (fromPerson !== 'ALL') {
      filtered = filtered.filter(r => (r.assignedTo || 'Henüz Atanmadı') === fromPerson);
    }
    if (unitVal !== 'ALL') {
      filtered = filtered.filter(r => r.unit === unitVal);
    }
    if (priorityVal !== 'ALL') {
      filtered = filtered.filter(r => r.priority === priorityVal);
    }
    if (searchText) {
      filtered = filtered.filter(r => {
        const bc = (r.requestBarcode || '').toString().toLowerCase();
        const subj = (r.subject || '').toLowerCase();
        return bc.includes(searchText) || subj.includes(searchText);
      });
    }

    const tbody = document.querySelector('#table-delegation-requests tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Filtreleme kriterlerine uygun devredilecek talep bulunmuyor.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.slice(0, 30).map(r => `
      <tr>
        <td><input type="checkbox" class="chk-delegate-item" value="${r.id}"></td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600;">${r.subject}</td>
        <td>${r.unit}</td>
        <td><span class="badge priority-orta">${r.assignedTo || 'Henüz Atanmadı'}</span></td>
        <td>${r.arrivalDate || r.requestDate}</td>
        <td><span class="badge priority-${r.priority?.toLowerCase() || 'orta'}">${r.priority || 'Orta'}</span></td>
      </tr>
    `).join('');
  },

  async handleDelegation() {
    const checked = Array.from(document.querySelectorAll('.chk-delegate-item:checked')).map(cb => parseInt(cb.value));
    const targetPerson = document.getElementById('delegate-to-person').value;

    if (!targetPerson) {
      this.showToast("Lütfen hedef aktif personeli seçin!", "warning");
      return;
    }

    if (checked.length === 0) {
      this.showToast("Lütfen devretmek için en az bir talep seçin!", "warning");
      return;
    }

    this.showConfirm("Seçili Talepleri Devret", `Seçilen ${checked.length} adet talebi ${targetPerson} adlı personele devretmek istediğinize emin misiniz?`, async () => {
      for (const id of checked) {
        const r = this.state.requests.find(req => String(req.id) === String(id));
        if (r) {
          this.logAction('Talep Devredildi', `Barkod: ${r.requestBarcode || '-'} -> Yeni Sorumlu: ${targetPerson}`);
          r.assignedTo = targetPerson;
          await this.apiSync('requests', 'PUT', r);
        }
      }
      this.showToast(`${checked.length} adet talep başarıyla ${targetPerson} adlı personele devredildi!`, "success", "⚖️");
      this.render();
    });
  },

  // 4. MY REQUESTS (PERSONNEL VIEW)
  renderMyRequestsTable() {
    const currentPersonName = this.state.currentUser ? this.state.currentUser.name : '';
    const allMyRequests = this.getFilteredRequests().filter(r => r.assignedTo === currentPersonName);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Compute SLA waiting days for each assigned request
    allMyRequests.forEach(r => {
      if (r.arrivalDate || r.requestDate) {
        const arrDt = new Date(r.arrivalDate || r.requestDate);
        arrDt.setHours(0, 0, 0, 0);
        r._diffDays = Math.max(0, Math.ceil((today - arrDt) / (1000 * 60 * 60 * 24)));
      } else {
        r._diffDays = 0;
      }
    });

    // Update KPI Card Totals
    const myTotal = allMyRequests.length;
    const myOpen = allMyRequests.filter(r => r.status === 'Açık').length;
    const myCompleted = allMyRequests.filter(r => r.status === 'Tamamlandı').length;
    const myOverdue = allMyRequests.filter(r => r.status === 'Açık' && r._diffDays >= 14).length;

    const elTotal = document.getElementById('my-kpi-total');
    const elOpen = document.getElementById('my-kpi-open');
    const elOverdue = document.getElementById('my-kpi-overdue');
    const elCompleted = document.getElementById('my-kpi-completed');

    if (elTotal) elTotal.innerText = myTotal;
    if (elOpen) elOpen.innerText = myOpen;
    if (elOverdue) elOverdue.innerText = myOverdue;
    if (elCompleted) elCompleted.innerText = myCompleted;

    let requests = [...allMyRequests];

    const searchText = document.getElementById('filter-my-search')?.value.toLowerCase().trim() || '';
    const statusVal = document.getElementById('filter-my-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-my-unit')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-my-priority')?.value || 'ALL';
    const sortVal = document.getElementById('filter-my-sort')?.value || 'DATE_DESC';

    requests = requests.filter(r => {
      if (statusVal === 'OVERDUE_14') {
        if (r.status !== 'Açık' || r._diffDays < 14) return false;
      } else if (statusVal !== 'ALL' && r.status !== statusVal) {
        return false;
      }

      if (unitVal !== 'ALL' && r.unit !== unitVal) return false;
      if (priorityVal !== 'ALL' && r.priority !== priorityVal) return false;

      if (searchText) {
        const mBarcode = r.requestBarcode?.toString().toLowerCase().includes(searchText);
        const mSubject = r.subject?.toLowerCase().includes(searchText);
        const mOrderBarcode = r.orderBarcode?.toString().toLowerCase().includes(searchText);
        const mSupplier = r.supplier?.toLowerCase().includes(searchText);
        const mUnit = r.unit?.toLowerCase().includes(searchText);
        const mDesc = r.description?.toLowerCase().includes(searchText);
        if (!mBarcode && !mSubject && !mOrderBarcode && !mSupplier && !mUnit && !mDesc) return false;
      }
      return true;
    });

    // Apply Sorting
    requests = this.sortRequestsList(requests, sortVal);

    const tbody = document.querySelector('#table-my-requests tbody');
    if (!tbody) return;

    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun talep bulunamadı.</td></tr>`;
      return;
    }

    const isAdmin = this.state.currentUser?.role === 'ADMIN';

    tbody.innerHTML = requests.map(r => `
      <tr>
        <td style="white-space:nowrap;"><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600; min-width: 220px; max-width: 340px;">${r.subject}</td>
        <td style="font-size:0.82rem; min-width: 140px;">${r.unit}</td>
        <td style="font-size:0.82rem; white-space:nowrap;">${r.arrivalDate || r.requestDate}</td>
        <td style="white-space:nowrap;">${this.getStatusBadge(r)}</td>
        <td style="font-family:var(--font-mono); white-space:nowrap;">${r.orderBarcode || '-'}</td>
        <td style="font-size:0.82rem; white-space:nowrap;">${r.orderDate || '-'}</td>
        <td style="font-size:0.82rem; min-width: 120px;">${r.supplier || '-'}</td>
        <td style="font-weight:700; font-family:var(--font-mono); white-space:nowrap; text-align:right;">${r.actualAmount > 0 ? this.formatMoney(r.actualAmount, r.currency || 'TRY', 2) : '-'}</td>
        <td style="white-space:nowrap;">
          <div class="action-btns">
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', '${r.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
            <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.78rem;" onclick="App.openEditModal('${r.id}')">Sipariş Gir / Güncelle</button>
            <button class="btn-icon" style="color:#ea580c;" onclick="App.openRevisionModal('${r.id}')" title="Birimden Revize / Eksik Şartname İste">⚠️</button>
            <button class="btn-icon" style="color:#10b981;" onclick="App.openInspectionReport('${r.id}')" title="Muayene ve Kabul Tutanağı (PDF / Yazdır)">📄</button>
            ${isAdmin ? `<button class="btn-icon" onclick="App.deleteRequest('${r.id}')" title="Talebi Sil (Sadece Yönetici)">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  exportMyRequestsToCSV() {
    const currentPersonName = this.state.currentUser ? this.state.currentUser.name : 'Personel';
    const requests = this.getFilteredRequests().filter(r => r.assignedTo === currentPersonName);
    let csv = "Barkod;Konu;Birim;Geliş Tarihi;Durum;Sipariş Barkodu;Sipariş Tarihi;Tedarikçi;Gerçekleşen Tutar\n";

    requests.forEach(r => {
      csv += `"${r.requestBarcode}";"${r.subject}";"${r.unit}";"${r.arrivalDate}";"${r.status}";"${r.orderBarcode || ''}";"${r.orderDate || ''}";"${r.supplier || ''}";"${r.actualAmount || 0}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Taleplerim_${currentPersonName.replace(/ /g, '_')}.csv`;
    link.click();
  },

  // 5. CONTRACT MANAGEMENT RENDERER (SÖZLEŞME TAKİP)
  renderContracts() {
    let contracts = this.state.contracts || [];

    // Filter by academic year overlap (or show all if ALL)
    if (this.state.selectedYear !== 'ALL') {
      const yearParts = this.state.selectedYear.split('-');
      if (yearParts.length === 2) {
        const yStart = new Date(`${yearParts[0]}-09-01`);
        const yEnd = new Date(`${yearParts[1]}-08-31`);
        contracts = contracts.filter(c => {
          if (!c.startDate || !c.endDate) return true;
          const cStart = new Date(c.startDate);
          const cEnd = new Date(c.endDate);
          return (cStart <= yEnd && cEnd >= yStart);
        });
      }
    }

    const searchText = document.getElementById('filter-contract-search')?.value.toLowerCase().trim() || '';
    const statusVal = document.getElementById('filter-contract-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-contract-unit')?.value || 'ALL';

    const now = new Date();
    now.setHours(0,0,0,0);

    contracts = contracts.filter(c => {
      // Unit filter
      if (unitVal !== 'ALL' && c.unit !== unitVal) return false;

      // Status filter
      if (c.endDate) {
        const endDt = new Date(c.endDate);
        endDt.setHours(0,0,0,0);
        const diffDays = Math.ceil((endDt - now) / (1000 * 60 * 60 * 24));

        if (statusVal === 'Expiring') {
          // Expiring within 0 to 30 days and Active
          if (c.status !== 'Aktif' || diffDays < 0 || diffDays > 30) return false;
        } else if (statusVal !== 'ALL') {
          if (c.status !== statusVal) return false;
        }
      } else {
        if (statusVal !== 'ALL' && c.status !== statusVal) return false;
      }

      // Search text filter across all contract attributes
      if (searchText) {
        const mNo = c.contractNo?.toLowerCase().includes(searchText);
        const mTitle = c.title?.toLowerCase().includes(searchText);
        const mSupp = c.supplier?.toLowerCase().includes(searchText);
        const mUnit = c.unit?.toLowerCase().includes(searchText);
        const mNotes = c.notes?.toLowerCase().includes(searchText);
        const mAssign = c.assignedTo?.toLowerCase().includes(searchText);
        if (!mNo && !mTitle && !mSupp && !mUnit && !mNotes && !mAssign) return false;
      }
      return true;
    });

    // Update KPI Cards
    const activeContracts = contracts.filter(c => c.status === 'Aktif');
    const totalAmount = contracts.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
    const totalGuarantee = contracts.reduce((sum, c) => sum + (c.guaranteeAmount || 0), 0);
    const expiringCount = activeContracts.filter(c => {
      const diffDays = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      return diffDays <= 30 && diffDays >= 0;
    }).length;

    document.getElementById('contract-kpi-total').innerText = activeContracts.length;
    document.getElementById('contract-kpi-amount').innerText = this.formatMoney(totalAmount, 'TRY', 2);
    document.getElementById('contract-kpi-expiring').innerText = expiringCount;
    document.getElementById('contract-kpi-guarantee').innerText = this.formatMoney(totalGuarantee, 'TRY', 2);

    const tbody = document.querySelector('#table-contracts tbody');
    if (!tbody) return;

    if (contracts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">Kayıtlı sözleşme bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = contracts.map(c => {
      const diffDays = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      let timeBadge = '';
      if (c.status === 'Aktif') {
        if (diffDays <= 0) timeBadge = `<span class="badge priority-düşük">⚪ Süresi Doldu</span>`;
        else if (diffDays <= 15) timeBadge = `<span class="badge priority-kritik">🔴 ${diffDays} Gün Kaldı</span>`;
        else if (diffDays <= 30) timeBadge = `<span class="badge priority-yüksek">🟠 ${diffDays} Gün Kaldı</span>`;
        else timeBadge = `<span class="badge status-completed">🟢 ${diffDays} Gün</span>`;
      } else {
        timeBadge = `<span class="badge priority-düşük">${c.status}</span>`;
      }

      return `
        <tr>
          <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${c.contractNo}</span></td>
          <td style="font-weight:600; max-width:260px;">${c.title}</td>
          <td style="font-weight:600;">${c.supplier}</td>
          <td style="font-size:0.8rem;">${c.unit}</td>
          <td style="font-weight:700; font-family:var(--font-mono);">${this.formatMoney(c.totalAmount || 0, c.currency || 'TRY', 2)}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${c.startDate} / ${c.endDate}</td>
          <td>${timeBadge}</td>
          <td style="font-weight:600; font-family:var(--font-mono);">${c.guaranteeAmount ? this.formatMoney(c.guaranteeAmount, 'TRY', 2) : '-'}</td>
          <td><span class="badge status-${c.status === 'Aktif' ? 'completed' : 'rejected'}">${c.status}</span></td>
          <td>
            <div class="action-btns">
              <a href="#contract/${c.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'contract', '${c.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
              <button class="btn-icon" onclick="App.openDocumentManager('contract', '${c.id}', 'Sözleşme #${c.contractNo} — ${c.title?.replace(/'/g, "\\'")}')" title="Evraklar & Dijital Arşiv">📁</button>
              <button class="btn-icon" onclick="App.openContractModal('${c.id}')" title="Düzenle">✏️</button>
              <button class="btn-icon" onclick="App.deleteContract('${c.id}')" title="Sözleşmeyi Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openContractModal(contractId = null) {
    if (contractId) {
      const c = this.state.contracts.find(item => String(item.id) === String(contractId));
      if (!c) return;
      document.getElementById('cm-id').value = c.id;
      document.getElementById('cm-no').value = c.contractNo;
      document.getElementById('cm-supplier').value = c.supplier;
      document.getElementById('cm-title').value = c.title;
      document.getElementById('cm-unit').value = c.unit;
      document.getElementById('cm-assigned-to').value = c.assignedTo;
      document.getElementById('cm-start-date').value = c.startDate;
      document.getElementById('cm-end-date').value = c.endDate;
      document.getElementById('cm-currency').value = c.currency || 'TRY';
      
      const amtInput = document.getElementById('cm-amount');
      if (amtInput) {
        amtInput.value = c.totalAmount ? c.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(amtInput, 'cm-currency', true);
      }
      const gAmtInput = document.getElementById('cm-guarantee-amount');
      if (gAmtInput) {
        gAmtInput.value = c.guaranteeAmount ? c.guaranteeAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(gAmtInput, 'cm-currency');
      }

      document.getElementById('cm-guarantee-expiry').value = c.guaranteeExpiry || '';
      document.getElementById('cm-status').value = c.status || 'Aktif';
      document.getElementById('cm-notes').value = c.notes || '';
      document.getElementById('contract-modal-title').innerText = `✏️ Sözleşme #${c.contractNo} Düzenle`;
    } else {
      document.getElementById('cm-id').value = '';
      document.getElementById('form-contract-manage').reset();
      this.onAmountInput(document.getElementById('cm-amount'), 'cm-currency', true);
      this.onAmountInput(document.getElementById('cm-guarantee-amount'), 'cm-currency');
      document.getElementById('contract-modal-title').innerText = '➕ Yeni Sözleşme Oluştur';
    }
    this.openModal('modal-contract-form');
  },

  async handleSaveContract(e) {
    e.preventDefault();
    const id = document.getElementById('cm-id').value;
    const contractNo = document.getElementById('cm-no').value.trim();
    const supplier = document.getElementById('cm-supplier').value.trim();
    const title = document.getElementById('cm-title').value.trim();
    const unit = document.getElementById('cm-unit').value;
    const assignedTo = document.getElementById('cm-assigned-to').value;
    const startDate = document.getElementById('cm-start-date').value;
    const endDate = document.getElementById('cm-end-date').value;
    const totalAmount = this.parseMoney(document.getElementById('cm-amount')?.value);
    const currency = document.getElementById('cm-currency').value;
    const guaranteeAmount = this.parseMoney(document.getElementById('cm-guarantee-amount')?.value);
    const guaranteeExpiry = document.getElementById('cm-guarantee-expiry').value;
    const status = document.getElementById('cm-status').value;
    const notes = document.getElementById('cm-notes').value.trim();

    const rateVal = currency !== 'TRY' ? (this.state.rates[currency] || 1) : 1;

    if (id) {
      const c = this.state.contracts.find(item => item.id === parseInt(id));
      if (c) {
        c.contractNo = contractNo;
        c.supplier = supplier;
        c.title = title;
        c.unit = unit;
        c.assignedTo = assignedTo;
        c.startDate = startDate;
        c.endDate = endDate;
        c.totalAmount = totalAmount;
        c.currency = currency;
        if (!c.exchangeRate || c.currency !== currency) c.exchangeRate = rateVal;
        c.guaranteeAmount = guaranteeAmount;
        c.guaranteeExpiry = guaranteeExpiry;
        c.status = status;
        c.notes = notes;
        await this.apiSync('contracts', 'PUT', c);
      }
    } else {
      const newContract = {
        contractNo,
        supplier,
        title,
        unit,
        assignedTo,
        startDate,
        endDate,
        totalAmount,
        currency,
        exchangeRate: rateVal,
        guaranteeAmount,
        guaranteeExpiry,
        status,
        notes,
        academicYear: this.getAcademicYearFromDate(startDate || endDate)
      };
      const savedC = await this.apiSync('contracts', 'POST', newContract);
      if (savedC) newContract.id = savedC.id;
      this.state.contracts.push(newContract);
    }

    this.populateYearSelect();
    this.logAction(id ? 'Sözleşme Güncellendi' : 'Yeni Sözleşme Eklendi', `No: ${contractNo}, Tutar: ${totalAmount} ${currency} (Sabit Kur: ${rateVal} ₺)`);
    this.showToast("Sözleşme bilgileri başarıyla kaydedildi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.renderContracts();
  },

  async checkContractExpirations() {
    this.showToast("Sözleşme vadeleri taranıyor ve bildirimler kontrol ediliyor...", "info", "⏳");
    try {
      const res = await this.authFetch('/api/contracts/check-expirations', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        const notif = data.result?.notified || 0;
        const checked = data.result?.checked || 0;
        if (notif > 0) {
          this.showToast(`${checked} sözleşme tarandı, süresi yaklaşan ${notif} sözleşme için ilgili birimlere uyarı e-postası gönderildi!`, "success", "✉️");
        } else {
          this.showToast(`${checked} aktif sözleşme tarandı. Bugün için yeni kritik eşik (60/30/15/7 gün) uyarısı bulunmuyor.`, "info", "✅");
        }
      } else {
        this.showToast(data.error || 'Sözleşme kontrolü yapılamadı.', 'error');
      }
    } catch (e) {
      console.error(e);
      this.showToast('Sunucu hatası: ' + e.message, 'error');
    }
  },

  getTRYEquivalent(amount, currency = 'TRY', itemExchangeRate = null) {
    if (!amount) return 0;
    const curr = (currency || 'TRY').toUpperCase();
    if (curr === 'TRY') return amount;
    const rate = itemExchangeRate || (this.state.rates && this.state.rates[curr]) || 1;
    return amount * rate;
  },

  async deleteRequest(requestId) {
    if (this.state.currentUser?.role !== 'ADMIN') {
      this.showToast("Talep silme yetkisi sadece Yöneticilere (ADMIN) aittir.", "warning", "🛡️");
      return;
    }

    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Silinecek talep kaydı (#${requestId}) bulunamadı.`, "error");
      return;
    }

    const barcodeText = req.requestBarcode ? `Barkod #${req.requestBarcode}` : 'Talep';
    this.showConfirm("Talebi Sil", `${barcodeText} - "${req.subject}" başlıklı talebi silmek istediğinizden emin misiniz?\n\n(Bu işlem kalıcıdır ve sadece Yönetici yetkisiyle gerçekleştirilebilir.)`, async () => {
      const res = await this.apiSync('requests', 'DELETE', req.id);
      if (res && res.error) {
        this.showToast(res.error, "error");
        return;
      }
      this.state.requests = this.state.requests.filter(r => String(r.id) !== String(requestId));
      this.logAction('Talep Silindi', `Barkod: ${req.requestBarcode || '-'}, Konu: ${req.subject}`);
      this.showToast("Talep başarıyla silindi!", "warning");
      this.render();
    }, '🗑️');
  },

  async deleteContract(contractId) {
    const c = this.state.contracts.find(item => String(item.id) === String(contractId));
    if (!c) {
      this.showToast(`Silinecek sözleşme kaydı (#${contractId}) bulunamadı.`, "error");
      return;
    }

    this.showConfirm("Sözleşmeyi Sil", `Sözleşme #${c.contractNo} ("${c.title}") silinecek. Emin misiniz?`, async () => {
      await this.apiSync('contracts', 'DELETE', c.id);
      this.state.contracts = this.state.contracts.filter(item => String(item.id) !== String(contractId));
      this.logAction('Sözleşme Silindi', `No: ${c.contractNo}, Konu: ${c.title}`);
      this.showToast("Sözleşme başarıyla silindi!", "success");
      this.renderContracts();
    }, '🗑️');
  },

  async deleteInvoice(invoiceId) {
    const inv = this.state.invoices.find(item => String(item.id) === String(invoiceId));
    if (!inv) {
      this.showToast(`Silinecek fatura kaydı (#${invoiceId}) bulunamadı.`, "error");
      return;
    }

    this.showConfirm("Faturayı Sil", `Fatura #${inv.invoiceNo} (${inv.supplier}) silinecek. Emin misiniz?`, async () => {
      await this.apiSync('invoices', 'DELETE', inv.id);
      this.state.invoices = this.state.invoices.filter(item => String(item.id) !== String(invoiceId));
      this.logAction('Fatura Silindi', `No: ${inv.invoiceNo}, Tedarikçi: ${inv.supplier}`);
      this.showToast("Fatura başarıyla silindi!", "warning");
      this.renderInvoices();
    }, '🗑️');
  },

  // 11. ACTIVITY LOGS RENDERER
  renderActivityLogs() {
    let logs = this.state.logs || [];
    const searchText = document.getElementById('filter-log-search')?.value.toLowerCase().trim() || '';

    if (searchText) {
      logs = logs.filter(l => 
        l.user?.toLowerCase().includes(searchText) ||
        l.action?.toLowerCase().includes(searchText) ||
        l.details?.toLowerCase().includes(searchText)
      );
    }

    const tbody = document.querySelector('#table-activity-logs tbody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Kayıtlı aktivite logu bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono); white-space:nowrap;">${l.timestamp}</td>
        <td style="font-weight:600;">${l.user}</td>
        <td><span class="badge status-completed">${l.action}</span></td>
        <td style="font-size:0.88rem; max-width:450px;">${l.details}</td>
      </tr>
    `).join('');
  },

  // VIEW DETAILS MODAL HANDLERS
  viewRequestDetails(requestId) {
    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Talep (#${requestId}) bilgileri bulunamadı.`, "error");
      return;
    }

    this.state.currentActiveDetail = { type: 'request', data: req };
    document.getElementById('view-details-title').innerText = `📋 Talep Detayı #${req.requestBarcode || req.id}`;

    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <!-- Top Status & Barcode Card -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--accent-primary);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">TALEP BARKODU</div>
            <div style="font-family: var(--font-mono); font-weight: 700; font-size: 1.25rem; color: var(--accent-primary); margin-top: 0.25rem;">${req.requestBarcode || '-'}</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--accent-purple);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">DURUM & ÖNCELİK</div>
            <div style="margin-top: 0.4rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <span class="badge status-${req.status?.toLowerCase()}">${req.status}</span>
              <span class="badge priority-${req.priority?.toLowerCase() || 'orta'}">${req.priority || 'Orta'}</span>
            </div>
          </div>
        </div>

        <!-- Details Grid Card -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.9rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">İLGİLİ BİRİM</div>
            <div style="font-weight: 600; color: var(--text-main);">${req.unit}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">ATANAN PERSONEL</div>
            <div style="font-weight: 600; color: var(--text-main);">${req.assignedTo}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">GELİŞ TARİHİ</div>
            <div style="color: var(--text-main); font-weight: 500;">${req.arrivalDate || req.requestDate || '-'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">SİPARİŞ TARİHİ</div>
            <div style="color: var(--text-main); font-weight: 500;">${req.orderDate || '-'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">SİPARİŞ BARKODU</div>
            <div style="font-family: var(--font-mono); font-weight: 600; color: var(--text-main);">${req.orderBarcode || '-'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TEDARİKÇİ FİRMA</div>
            <div style="font-weight: 600; color: var(--text-main);">${req.supplier || '-'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">YÖNETMELİK MADDESİ</div>
            <div style="font-weight: 600; color: var(--text-main);">${req.regulation ? 'Madde ' + req.regulation : '-'}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">GERÇEKLEŞEN TUTAR</div>
            <div style="font-weight: 700; color: var(--status-completed); font-size: 1.15rem; font-family: var(--font-mono);">${req.actualAmount > 0 ? req.actualAmount.toLocaleString('tr-TR') + ' ' + (req.currency || 'TRY') : '-'}</div>
          </div>
        </div>

        <!-- Subject & Description Card -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem; text-transform: uppercase;">TALEP KONUSU & AÇIKLAMASI</div>
          <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.65rem; color: var(--text-main);">${req.subject}</div>
          <div style="font-size: 0.92rem; color: var(--text-main); white-space: pre-wrap; line-height: 1.6; border-top: 1px solid var(--border-color); padding-top: 0.65rem;">${req.description || 'Açıklama veya not girilmemiş.'}</div>
        </div>

        <!-- Action Quick Buttons (Revize İste & Muayene Kabul) -->
        <div style="margin-top: 1.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: flex-end;">
          <button type="button" class="btn-secondary" style="color: #ea580c; border-color: #ea580c; font-size: 0.82rem; padding: 0.45rem 0.85rem;" onclick="App.closeModal('modal-view-details'); App.openRevisionModal('${req.id}')">
            <span>⚠️</span> Birimden Revize / Şartname İste
          </button>
          <button type="button" class="btn-secondary" style="color: #10b981; border-color: #10b981; font-size: 0.82rem; padding: 0.45rem 0.85rem;" onclick="App.openInspectionReport('${req.id}')">
            <span>📄</span> Muayene ve Kabul Tutanağı (PDF)
          </button>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openEditModal(req.id);
      };
    }
    this.openModal('modal-view-details');
  },

  // ----------------------------------------------------
  // ⚠️ REVISION REQUEST HANDLERS (BİRİMDEN REVİZE İSTE)
  // ----------------------------------------------------
  openRevisionModal(requestId) {
    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Talep (#${requestId}) bulunamadı.`, "error");
      return;
    }

    document.getElementById('rev-request-id').value = req.id;
    document.getElementById('rev-barcode-label').innerText = `#${req.requestBarcode || req.id}`;
    document.getElementById('rev-unit-label').innerText = req.unit || '-';
    document.getElementById('rev-subject-label').innerText = req.subject || '-';
    document.getElementById('rev-notes').value = '';

    this.openModal('modal-request-revision');
  },

  async handleRevisionSubmit(e) {
    if (e) e.preventDefault();
    const reqId = document.getElementById('rev-request-id')?.value;
    const notes = document.getElementById('rev-notes')?.value.trim();

    if (!reqId || !notes) {
      this.showToast("Lütfen birime iletilecek revize gerekçesini yazınız.", "warning");
      return;
    }

    const req = this.state.requests.find(r => String(r.id) === String(reqId));
    if (!req) {
      this.showToast("Talep kaydı bulunamadı.", "error");
      return;
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const userTitle = this.state.currentUser ? this.state.currentUser.name : 'Satınalma Uzmanı';

    req.status = 'Revize İstendi';
    req.description = (req.description ? req.description + '\n\n' : '') + `[⚠️ REVİZE İSTENDİ - ${dateStr} (${userTitle})]:\n${notes}`;

    this.showToast("Revize talebi kaydediliyor ve birime bildirim gönderiliyor...", "info", "⏳");

    try {
      const res = await this.apiSync('requests', 'PUT', req);
      if (res && res.error) {
        this.showToast(res.error, "error");
        return;
      }

      this.logAction('Revize İstendi', `Talep #${req.requestBarcode || req.id} - ${req.unit}: ${notes.substring(0, 60)}...`);
      this.showToast("Revize isteği birime başarıyla bildirildi!", "success", "✉️");
      this.closeModal('modal-request-revision');
      this.render();
    } catch (err) {
      console.error('handleRevisionSubmit error:', err);
      this.showToast("Kayıt sırasında hata oluştu: " + err.message, "error");
    }
  },

  // ----------------------------------------------------
  // 📄 OFFICIAL INSPECTION & ACCEPTANCE REPORT HANDLERS
  // ----------------------------------------------------
  openInspectionReport(requestId) {
    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Talep (#${requestId}) bulunamadı.`, "error");
      return;
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;

    document.getElementById('ir-unit').innerText = req.unit || '-';
    document.getElementById('ir-barcode').innerText = `#${req.requestBarcode || req.id}`;
    document.getElementById('ir-subject').innerText = req.subject || '-';
    document.getElementById('ir-supplier').innerText = req.supplier || 'Belirtilmedi';
    document.getElementById('ir-type').innerText = req.purchaseType === 'HIZMET' ? '🛠️ Hizmet Alımı' : '📦 Mal Alımı';
    document.getElementById('ir-order-barcode').innerText = req.orderBarcode || '-';
    document.getElementById('ir-order-date').innerText = req.orderDate || req.arrivalDate || todayStr;
    document.getElementById('ir-inspection-date').innerText = todayStr;
    
    const amt = req.actualAmount > 0 ? req.actualAmount : req.estimatedAmount || 0;
    document.getElementById('ir-amount').innerText = amt > 0 ? this.formatMoney(amt, req.currency || 'TRY', 2) : '-';

    document.getElementById('ir-sign-unit-name').innerText = `${req.unit} Yetkilisi`;
    document.getElementById('ir-sign-staff-name').innerText = req.assignedTo && req.assignedTo !== 'Henüz Atanmadı' ? req.assignedTo : 'Satınalma Sorumlusu';

    this.openModal('modal-inspection-report');
  },

  printInspectionReport() {
    const sheet = document.getElementById('inspection-report-sheet');
    if (!sheet) return;

    const printWin = window.open('', '_blank', 'width=900,height=800');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Muayene ve Kabul Tutanağı - Piri Reis Üniversitesi</title>
        <style>
          @page { size: A4 portrait; margin: 15mm 20mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
          th, td { border: 1px solid #64748b; padding: 8px 10px; }
          .header-bg { background-color: #f1f5f9; font-weight: bold; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${sheet.innerHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 750);
          };
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  },

  viewContractDetails(contractId) {
    const c = this.state.contracts.find(item => String(item.id) === String(contractId));
    if (!c) {
      this.showToast(`Sözleşme (#${contractId}) bilgileri bulunamadı.`, "error");
      return;
    }

    this.state.currentActiveDetail = { type: 'contract', data: c };
    document.getElementById('view-details-title').innerText = `📑 Sözleşme Detayı #${c.contractNo}`;

    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--accent-primary);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">SÖZLEŞME NO</div>
            <div style="font-family: var(--font-mono); font-weight: 700; font-size: 1.25rem; color: var(--accent-primary); margin-top: 0.25rem;">${c.contractNo}</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--status-completed);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">SÖZLEŞME DURUMU</div>
            <div style="margin-top: 0.4rem;">
              <span class="badge status-${c.status === 'Aktif' ? 'completed' : 'rejected'}">${c.status}</span>
            </div>
          </div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.9rem;">
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">SÖZLEŞME KONUSU</div><div style="font-weight:700; color:var(--text-main);">${c.title}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">YÜKLENİCİ TEDARİKÇİ</div><div style="font-weight:700; color:var(--accent-primary);">${c.supplier}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">SORUMLU BİRİM</div><div style="color:var(--text-main); font-weight:500;">${c.unit}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TAKİP EDEN PERSONEL</div><div style="color:var(--text-main); font-weight:500;">${c.assignedTo || '-'}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">BAŞLANGIÇ TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${c.startDate}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">BİTİŞ TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${c.endDate}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TEMİNAT MEKTUBU TUTARI</div><div style="font-weight:700; font-family:var(--font-mono); color:var(--text-main);">${c.guaranteeAmount ? c.guaranteeAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TEMİNAT BİTİŞ TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${c.guaranteeExpiry || '-'}</div></div>
          <div style="grid-column: span 2;"><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TOPLAM SÖZLEŞME BEDELİ</div><div style="font-weight:700; color:var(--status-completed); font-size:1.25rem; font-family:var(--font-mono);">${(c.totalAmount || 0).toLocaleString('tr-TR')} ${c.currency || 'TRY'}</div></div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem; text-transform: uppercase;">SÖZLEŞME NOTLARI</div>
          <div style="font-size: 0.92rem; color: var(--text-main); white-space: pre-wrap; line-height: 1.6;">${c.notes || 'Not bulunmamaktadır.'}</div>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openContractModal(c.id);
      };
    }
    this.openModal('modal-view-details');
  },

  viewInvoiceDetails(invoiceId) {
    const inv = this.state.invoices.find(item => String(item.id) === String(invoiceId));
    if (!inv) {
      this.showToast(`Fatura (#${invoiceId}) bilgileri bulunamadı.`, "error");
      return;
    }

    this.state.currentActiveDetail = { type: 'invoice', data: inv };
    document.getElementById('view-details-title').innerText = `🧾 Fatura Detayı #${inv.invoiceNo}`;

    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--accent-primary);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">FATURA NO</div>
            <div style="font-family: var(--font-mono); font-weight: 700; font-size: 1.25rem; color: var(--accent-primary); margin-top: 0.25rem;">${inv.invoiceNo}</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--status-completed);">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">ÖDEME DURUMU</div>
            <div style="margin-top: 0.4rem;">
              <span class="badge status-${inv.paymentStatus === 'Ödendi' ? 'completed' : 'open'}">${inv.paymentStatus}</span>
            </div>
          </div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.9rem;">
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TEDARİKÇİ FİRMA</div><div style="font-weight:700; color:var(--text-main);">${inv.supplier}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">İLİŞKİLİ BARKOD / SÖZLEŞME</div><div style="font-family:var(--font-mono); font-weight:600; color:var(--accent-purple);">${inv.relatedBarcode || '-'}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">FATURA TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${inv.invoiceDate}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">VADE TARİHİ</div><div style="font-weight:700; color:var(--text-main);">${inv.dueDate}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">MUHASEBEYE TESLİM TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${inv.accountingDeliveryDate || '-'}</div></div>
          <div><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">ÖDEME YAPILMA TARİHİ</div><div style="color:var(--text-main); font-weight:500;">${inv.paymentDate || '-'}</div></div>
          <div style="grid-column: span 2;"><div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">FATURA TUTARI</div><div style="font-weight:700; color:var(--status-completed); font-size:1.25rem; font-family:var(--font-mono);">${(inv.amount || 0).toLocaleString('tr-TR')} ${inv.currency || 'TRY'}</div></div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem; text-transform: uppercase;">AÇIKLAMA & NOTLAR</div>
          <div style="font-size: 0.92rem; color: var(--text-main); white-space: pre-wrap; line-height: 1.6;">${inv.notes || 'Açıklama girilmemiş.'}</div>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openInvoiceModal(inv.id);
      };
    }
    this.openModal('modal-view-details');
  },

  printCurrentDetail() {
    if (!this.state.currentActiveDetail || !this.state.currentActiveDetail.data) {
      this.showToast("Yazdırılacak detay verisi bulunamadı.", "error", "⚠️");
      return;
    }

    const { type, data } = this.state.currentActiveDetail;
    const printBody = document.getElementById('print-doc-body');
    const printDate = document.getElementById('print-doc-date');
    const printTitle = document.getElementById('print-doc-title');

    const todayStr = new Date().toLocaleDateString('tr-TR');
    if (printDate) printDate.innerText = `Tarih: ${todayStr}`;

    if (!printBody) return;

    if (type === 'request') {
      if (printTitle) printTitle.innerText = 'TALEP VE SİPARİŞ FORMU';
      printBody.innerHTML = `
        <div style="border: 1.5px solid #0f172a; padding: 1rem; border-radius: 6px; background: #fff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">TALEP BARKODU</div>
              <div style="font-size: 1.3rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">#${data.requestBarcode || '-'}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">DURUM & ÖNCELİK</div>
              <div style="font-size: 1rem; font-weight: 700; color: #0f172a;">${data.status} (${data.priority || 'Orta'})</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1rem; font-size: 8.5pt; margin-bottom: 0.75rem;">
            <div><strong>İlgili Birim:</strong> ${data.unit || '-'}</div>
            <div><strong>Sorumlu Uzman:</strong> ${data.assignedTo || '-'}</div>
            <div><strong>Geliş Tarihi:</strong> ${data.arrivalDate || data.requestDate || '-'}</div>
            <div><strong>Sipariş Tarihi:</strong> ${data.orderDate || '-'}</div>
            <div><strong>Sipariş No:</strong> ${data.orderBarcode || '-'}</div>
            <div><strong>Tedarikçi Firma:</strong> ${data.supplier || '-'}</div>
            <div><strong>Yönetmelik Maddesi:</strong> ${data.regulation ? (data.regulation.startsWith('Madde ') ? data.regulation : 'Madde ' + data.regulation) : '-'}</div>
            <div><strong>Gerçekleşen Tutar:</strong> <span style="font-size: 1rem; font-weight: 800; color: #16a34a;">${data.actualAmount > 0 ? (data.actualAmount).toLocaleString('tr-TR') + ' ' + (data.currency || 'TRY') : '-'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 0.6rem;">
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">TALEP KONUSU:</div>
            <div style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.5rem; color: #0f172a;">${data.subject || '-'}</div>
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; background: #f8fafc; padding: 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b;">${data.description || 'Not bulunmamaktadır.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'contract') {
      if (printTitle) printTitle.innerText = 'SÖZLEŞME VE TEMİNAT FORMU';
      printBody.innerHTML = `
        <div style="border: 1.5px solid #0f172a; padding: 1rem; border-radius: 6px; background: #fff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">SÖZLEŞME NO</div>
              <div style="font-size: 1.3rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.contractNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">SÖZLEŞME DURUMU</div>
              <div style="font-size: 1rem; font-weight: 700; color: #16a34a;">${data.status}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1rem; font-size: 8.5pt; margin-bottom: 0.75rem;">
            <div><strong>Sözleşme Konusu:</strong> ${data.title}</div>
            <div><strong>Yüklenici Tedarikçi:</strong> ${data.supplier}</div>
            <div><strong>Sorumlu Birim:</strong> ${data.unit}</div>
            <div><strong>Takip Eden Personel:</strong> ${data.assignedTo || '-'}</div>
            <div><strong>Başlangıç Tarihi:</strong> ${data.startDate}</div>
            <div><strong>Bitiş Tarihi:</strong> ${data.endDate}</div>
            <div><strong>Teminat Mektubu Tutarı:</strong> ${data.guaranteeAmount ? (data.guaranteeAmount).toLocaleString('tr-TR') + ' ₺' : '-'}</div>
            <div><strong>Teminat Bitiş Tarihi:</strong> ${data.guaranteeExpiry || '-'}</div>
            <div style="grid-column: span 2;"><strong>Toplam Sözleşme Bedeli:</strong> <span style="font-size: 1.05rem; font-weight: 800; color: #16a34a;">${(data.totalAmount || 0).toLocaleString('tr-TR')} ${data.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 0.6rem;">
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">SÖZLEŞME NOTLARI VE ŞARTLAR:</div>
            <div style="font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; background: #f8fafc; padding: 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Not bulunmamaktadır.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'invoice') {
      if (printTitle) printTitle.innerText = 'FATURA VE ÖDEME FORMU';
      printBody.innerHTML = `
        <div style="border: 1.5px solid #0f172a; padding: 1rem; border-radius: 6px; background: #fff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">FATURA NO</div>
              <div style="font-size: 1.3rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.invoiceNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">ÖDEME DURUMU</div>
              <div style="font-size: 1rem; font-weight: 700; color: #16a34a;">${data.paymentStatus}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1rem; font-size: 8.5pt; margin-bottom: 0.75rem;">
            <div><strong>Tedarikçi Firma:</strong> ${data.supplier}</div>
            <div><strong>Bağlı Barkod / Sözleşme:</strong> ${data.relatedBarcode || '-'}</div>
            <div><strong>Fatura Tarihi:</strong> ${data.invoiceDate}</div>
            <div><strong>Vade Tarihi:</strong> ${data.dueDate}</div>
            <div><strong>Muhasebeye Teslim:</strong> ${data.accountingDeliveryDate || '-'}</div>
            <div><strong>Ödeme Yapılma Tarihi:</strong> ${data.paymentDate || '-'}</div>
            <div style="grid-column: span 2;"><strong>Fatura Tutarı:</strong> <span style="font-size: 1.05rem; font-weight: 800; color: #16a34a;">${(data.amount || 0).toLocaleString('tr-TR')} ${data.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 0.6rem;">
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; background: #f8fafc; padding: 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'guarantee') {
      if (printTitle) printTitle.innerText = 'TEMİNAT MEKTUBU VE KASA TAKİP FORMU';
      printBody.innerHTML = `
        <div style="border: 1.5px solid #0f172a; padding: 1rem; border-radius: 6px; background: #fff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">TEMİNAT MEKTUP NO</div>
              <div style="font-size: 1.3rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.letterNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">MEKTUP DURUMU</div>
              <div style="font-size: 1rem; font-weight: 700; color: #0f172a;">${data.status}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1rem; font-size: 8.5pt; margin-bottom: 0.75rem;">
            <div><strong>Düzenleyen Banka:</strong> 🏦 ${data.bankName || data.bank || '-'}</div>
            <div><strong>Teminat Türü:</strong> ${data.type || '-'}</div>
            <div style="grid-column: span 2;"><strong>İlişkili İhale / İş:</strong> ${data.title || '-'}</div>
            <div><strong>Yüklenici Firma:</strong> ${data.supplier || '-'}</div>
            <div><strong>Sorumlu Birim:</strong> ${data.unit || '-'}</div>
            <div><strong>Düzenleme Tarihi:</strong> ${data.issueDate || '-'}</div>
            <div><strong>Son Geçerlilik (Vade):</strong> ${data.expiryDate || '-'}</div>
            <div><strong>Kasa Saklama Konumu:</strong> 🔒 ${data.storageLocation || 'Mali İşler Kasası'}</div>
            <div style="grid-column: span 2;"><strong>Teminat Tutarı:</strong> <span style="font-size: 1.05rem; font-weight: 800; color: #16a34a;">${(data.amount || data.guaranteeAmount || 0).toLocaleString('tr-TR')} ${data.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 0.6rem;">
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; background: #f8fafc; padding: 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'tender') {
      if (printTitle) printTitle.innerText = 'İHALE PLANLAMA VE SÜREÇ FORMU';
      printBody.innerHTML = `
        <div style="border: 1.5px solid #0f172a; padding: 1rem; border-radius: 6px; background: #fff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">İHALE NO / KODU</div>
              <div style="font-size: 1.3rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.tenderNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 7.5pt; color: #64748b; font-weight: 700;">AŞAMA DURUMU</div>
              <div style="font-size: 1rem; font-weight: 700; color: #0f172a;">${data.status}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1rem; font-size: 8.5pt; margin-bottom: 0.75rem;">
            <div style="grid-column: span 2;"><strong>İhale Konusu:</strong> <span style="font-weight: 700;">${data.title}</span></div>
            <div><strong>Oturum Tarihi:</strong> ${data.tenderDate} ${data.tenderTime || ''}</div>
            <div><strong>Sorumlu Birim:</strong> ${data.unit}</div>
            <div><strong>İlişkili Barkod:</strong> ${data.relatedBarcode ? '#' + data.relatedBarcode : '-'}</div>
            <div><strong>İhale Usulü:</strong> ${data.regulation || '-'}</div>
            <div><strong>Sorumlu Uzman:</strong> ${data.assignedTo || '-'}</div>
            <div><strong>Tahmini Maliyet:</strong> ${(data.estimatedAmount || 0).toLocaleString('tr-TR')} ${data.currency || '₺'}</div>
            <div><strong>Kazanan Yüklenici:</strong> ${data.winnerSupplier || 'Henüz Sonuçlanmadı'}</div>
            <div style="grid-column: span 2;"><strong>Gerçekleşen Bedel:</strong> <span style="font-size: 1.05rem; font-weight: 800; color: #16a34a;">${data.actualAmount ? data.actualAmount.toLocaleString('tr-TR') + ' ' + (data.currency || '₺') : '-'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 0.6rem;">
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">İHALE NOTLARI VE AÇIKLAMA:</div>
            <div style="font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; background: #f8fafc; padding: 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Not bulunmamaktadır.'}</div>
          </div>
        </div>
      `;
    }

    const originalTitle = document.title;
    document.title = ' ';
    document.body.classList.add('printing-detail');
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove('printing-detail');
    }, 800);
  },

  // 5.5 GUARANTEES MANAGER & RENDERER (TEMİNAT MEKTUPLARI YÖNETİMİ)
  renderGuarantees() {
    const guarantees = this.state.guarantees || [];
    const searchText = document.getElementById('filter-guarantee-search')?.value.toLowerCase().trim() || '';
    const selectedStatus = document.getElementById('filter-guarantee-status')?.value || 'ALL';
    const selectedType = document.getElementById('filter-guarantee-type')?.value || 'ALL';

    const today = new Date();
    today.setHours(0,0,0,0);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);

    let totalVolume = 0;
    let activeCount = 0;
    let expiringCount = 0;
    let returnedCount = 0;

    guarantees.forEach(g => {
      const amt = (g.amount || 0);
      if (g.status === 'Aktif' || g.status === 'Vadesi Yaklaşan') {
        totalVolume += amt;
        activeCount++;
      }
      if (g.status === 'İade Edildi') {
        returnedCount++;
      }

      if (g.expiryDate) {
        const exp = new Date(g.expiryDate);
        exp.setHours(0,0,0,0);
        if (exp >= today && exp <= thirtyDaysLater && g.status !== 'İade Edildi' && g.status !== 'Nakte Çevrildi') {
          expiringCount++;
        }
      }
    });

    const elVol = document.getElementById('guarantee-kpi-total-volume');
    const elAct = document.getElementById('guarantee-kpi-active-count');
    const elExp = document.getElementById('guarantee-kpi-expiring-count');
    const elRet = document.getElementById('guarantee-kpi-returned-count');

    if (elVol) elVol.innerText = this.formatMoney(totalVolume, 'TRY', 2);
    if (elAct) elAct.innerText = activeCount;
    if (elExp) elExp.innerText = expiringCount;
    if (elRet) elRet.innerText = returnedCount;

    // Filtering logic
    const filtered = guarantees.filter(g => {
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'EXPIRING') {
          if (!g.expiryDate) return false;
          const exp = new Date(g.expiryDate);
          exp.setHours(0,0,0,0);
          if (!(exp >= today && exp <= thirtyDaysLater && g.status !== 'İade Edildi' && g.status !== 'Nakte Çevrildi')) {
            return false;
          }
        } else if (g.status !== selectedStatus) {
          return false;
        }
      }

      if (selectedType !== 'ALL' && g.type !== selectedType) return false;

      if (searchText) {
        const q = searchText;
        const matchNo = (g.letterNo || '').toLowerCase().includes(q);
        const matchBank = (g.bankName || '').toLowerCase().includes(q);
        const matchTitle = (g.title || '').toLowerCase().includes(q);
        const matchSup = (g.supplier || '').toLowerCase().includes(q);
        const matchLoc = (g.storageLocation || '').toLowerCase().includes(q);
        if (!matchNo && !matchBank && !matchTitle && !matchSup && !matchLoc) return false;
      }

      return true;
    });

    const tbody = document.querySelector('#table-guarantees tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtrelere uygun teminat mektubu kaydı bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(g => {
      const expDate = g.expiryDate ? new Date(g.expiryDate) : null;
      let badgeClass = 'status-completed';
      let statusStr = g.status;

      if (g.status === 'İade Edildi') {
        badgeClass = 'priority-orta';
      } else if (g.status === 'Nakte Çevrildi') {
        badgeClass = 'priority-kritik';
      } else if (expDate) {
        expDate.setHours(0,0,0,0);
        if (expDate < today) {
          badgeClass = 'priority-kritik';
          statusStr = '🔴 Süresi Doldu!';
        } else if (expDate <= thirtyDaysLater) {
          badgeClass = 'priority-yuksek';
          statusStr = '🚨 Vadesi Yaklaşan';
        }
      }

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary);">${g.letterNo}</td>
          <td style="font-weight: 700;">🏦 ${g.bankName}</td>
          <td><span class="badge priority-orta" style="font-size:0.75rem;">${g.type}</span></td>
          <td style="font-weight: 600; max-width:240px;" title="${g.title}">${g.title}</td>
          <td style="font-weight: 600;">${g.supplier}</td>
          <td style="font-weight: 800; color: var(--status-completed); font-family: var(--font-mono);">${this.formatMoney(g.amount || 0, g.currency || 'TRY', 2)}</td>
          <td style="font-weight: 600; color: ${badgeClass === 'priority-kritik' ? 'var(--status-rejected)' : 'var(--text-main)'};">${g.expiryDate || '-'}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">🔒 ${g.storageLocation || 'Kasada'}</td>
          <td><span class="badge ${badgeClass}">${statusStr}</span></td>
          <td style="text-align: center;">
            <div class="action-btns" style="justify-content: center;">
              <button class="btn-icon" onclick="App.viewGuaranteeDetails('${g.id}')" title="Görüntüle">👁️</button>
              <button class="btn-icon" onclick="App.openDocumentManager('guarantee', '${g.id}', 'Teminat #${g.letterNo} — ${g.bankName?.replace(/'/g, "\\'")}')" title="Evraklar & Dijital Arşiv">📁</button>
              <button class="btn-icon" onclick="App.openGuaranteeModal('${g.id}')" title="Düzenle">✏️</button>
              ${g.status !== 'İade Edildi' ? `<button class="btn-icon" onclick="App.returnGuaranteeToFirm('${g.id}')" title="Firmaya İade Et">↩️</button>` : ''}
              <button class="btn-icon" onclick="App.deleteGuarantee('${g.id}')" title="Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openGuaranteeModal(id = null) {
    const unitSelect = document.getElementById('gm-unit');
    if (unitSelect && this.state.units) {
      unitSelect.innerHTML = '<option value="">Birim Seçin</option>' + this.state.units.map(u => {
        const uName = typeof u === 'object' ? u.name : u;
        return `<option value="${uName}">${uName}</option>`;
      }).join('');
    }

    if (id) {
      const g = this.state.guarantees.find(item => String(item.id) === String(id));
      if (!g) return;
      document.getElementById('gm-id').value = g.id;
      document.getElementById('gm-letter-no').value = g.letterNo;
      document.getElementById('gm-bank-name').value = g.bankName;
      document.getElementById('gm-type').value = g.type;
      document.getElementById('gm-status').value = g.status;
      document.getElementById('gm-title').value = g.title;
      document.getElementById('gm-supplier').value = g.supplier;
      if (unitSelect) unitSelect.value = g.unit || '';
      document.getElementById('gm-currency').value = g.currency || 'TRY';
      
      const gAmtInput = document.getElementById('gm-amount');
      if (gAmtInput) {
        gAmtInput.value = g.amount ? g.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(gAmtInput, 'gm-currency', true);
      }

      document.getElementById('gm-issue-date').value = g.issueDate || '';
      document.getElementById('gm-expiry-date').value = g.expiryDate || '';
      document.getElementById('gm-storage-location').value = g.storageLocation || '';
      document.getElementById('gm-notes').value = g.notes || '';
      document.getElementById('guarantee-modal-title').innerText = `✏️ Teminat Mektubu #${g.letterNo} Düzenle`;
    } else {
      document.getElementById('gm-id').value = '';
      document.getElementById('form-guarantee-manage').reset();
      this.onAmountInput(document.getElementById('gm-amount'), 'gm-currency', true);
      document.getElementById('guarantee-modal-title').innerText = '🛡️ Yeni Teminat Mektubu Kaydı';
    }
    this.openModal('modal-guarantee-form');
  },

  async handleSaveGuarantee(e) {
    e.preventDefault();
    const id = document.getElementById('gm-id').value;
    const letterNo = document.getElementById('gm-letter-no').value.trim();
    const bankName = document.getElementById('gm-bank-name').value.trim();
    const type = document.getElementById('gm-type').value;
    const status = document.getElementById('gm-status').value;
    const title = document.getElementById('gm-title').value.trim();
    const supplier = document.getElementById('gm-supplier').value.trim();
    const unit = document.getElementById('gm-unit')?.value || 'Destek Hizmetler Müdürlüğü';
    const amount = this.parseMoney(document.getElementById('gm-amount')?.value);
    const currency = document.getElementById('gm-currency').value;
    const issueDate = document.getElementById('gm-issue-date').value;
    const expiryDate = document.getElementById('gm-expiry-date').value;
    const storageLocation = document.getElementById('gm-storage-location').value.trim();
    const notes = document.getElementById('gm-notes').value.trim();

    if (!this.state.guarantees) this.state.guarantees = [];

    if (id) {
      const g = this.state.guarantees.find(item => item.id === parseInt(id));
      if (g) {
        g.letterNo = letterNo;
        g.bankName = bankName;
        g.type = type;
        g.status = status;
        g.title = title;
        g.supplier = supplier;
        g.unit = unit;
        g.amount = amount;
        g.currency = currency;
        g.issueDate = issueDate;
        g.expiryDate = expiryDate;
        g.storageLocation = storageLocation;
        g.notes = notes;
        await this.apiSync('guarantees', 'PUT', g);
        this.showToast(`Teminat Mektubu #${letterNo} başarıyla güncellendi!`, "success", "🛡️");
        this.logAction('Teminat Mektubu Güncellendi', `No: ${letterNo}, Tutar: ${amount} ${currency}`);
      }
    } else {
      const newG = {
        letterNo,
        bankName,
        type,
        status,
        title,
        supplier,
        unit,
        amount,
        currency,
        issueDate,
        expiryDate,
        storageLocation: storageLocation || 'Mali İşler Kasası',
        notes,
        assignedTo: this.state.currentUser ? this.state.currentUser.name : 'Satınalma Uzmanı'
      };
      const savedG = await this.apiSync('guarantees', 'POST', newG);
      if (savedG) newG.id = savedG.id;
      this.state.guarantees.unshift(newG);
      this.showToast(`Yeni Teminat Mektubu #${letterNo} başarıyla kaydedildi!`, "success", "🛡️");
      this.logAction('Yeni Teminat Mektubu Eklendi', `No: ${letterNo}, Banka: ${bankName}, Tutar: ${amount} ${currency}`);
    }

    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.renderGuarantees();
  },

  async returnGuaranteeToFirm(id) {
    const g = this.state.guarantees.find(item => String(item.id) === String(id));
    if (!g) return;

    this.showConfirm("Firmaya İade Onayı", `Teminat Mektubu #${g.letterNo} (${g.supplier} - ${g.amount.toLocaleString('tr-TR')} ${g.currency}) firmaya iade edilmiş olarak işaretlensin mi?`, async () => {
      g.status = 'İade Edildi';
      g.returnDate = new Date().toISOString().split('T')[0];
      await this.apiSync('guarantees', 'PUT', g);
      this.showToast(`Teminat Mektubu #${g.letterNo} firmaya iade edildi!`, "success", "↩️");
      this.logAction('Teminat Mektubu İade Edildi', `No: ${g.letterNo}, Firma: ${g.supplier}`);
      this.renderGuarantees();
    }, '↩️');
  },

  async deleteGuarantee(id) {
    const g = this.state.guarantees.find(item => String(item.id) === String(id));
    if (!g) return;

    this.showConfirm("Teminat Mektubu Silme", `Teminat Mektubu #${g.letterNo} kaydını tamamen silmek istediğinize emin misiniz?`, async () => {
      await this.apiSync('guarantees', 'DELETE', g.id);
      this.state.guarantees = this.state.guarantees.filter(item => String(item.id) !== String(id));
      this.showToast(`Teminat mektubu kaydı silindi!`, "info", "🗑️");
      this.logAction('Teminat Mektubu Silindi', `No: ${g.letterNo}`);
      this.renderGuarantees();
    }, '🗑️');
  },

  viewGuaranteeDetails(id) {
    const g = this.state.guarantees.find(item => String(item.id) === String(id));
    if (!g) return;

    this.state.currentActiveDetail = { type: 'guarantee', data: g };
    document.getElementById('view-details-title').innerText = `🛡️ Teminat Mektubu #${g.letterNo}`;
    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <div style="border: 2px solid var(--accent-primary); padding: 1.25rem; border-radius: var(--radius-md); background: var(--bg-card); margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">TEMİNAT MEKTUP NO</div>
              <div style="font-size: 1.4rem; font-weight: 800; font-family: var(--font-mono); color: var(--accent-primary);">${g.letterNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">MEKTUP DURUMU</div>
              <span class="badge ${g.status === 'İade Edildi' ? 'priority-orta' : 'status-completed'}">${g.status}</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 0.88rem; margin-bottom: 1rem;">
            <div><strong>Düzenleyen Banka:</strong> 🏦 ${g.bankName || g.bank || '-'}</div>
            <div><strong>Teminat Türü:</strong> ${g.type || '-'}</div>
            <div style="grid-column: span 2;"><strong>İlişkili İhale / İş:</strong> ${g.title || '-'}</div>
            <div><strong>Yüklenici Firma:</strong> ${g.supplier || '-'}</div>
            <div><strong>Sorumlu Birim:</strong> ${g.unit || '-'}</div>
            <div><strong>Düzenleme Tarihi:</strong> ${g.issueDate || '-'}</div>
            <div><strong>Son Geçerlilik (Vade):</strong> ${g.expiryDate || '-'}</div>
            <div><strong>Kasa Saklama Konumu:</strong> 🔒 ${g.storageLocation || 'Mali İşler Kasası'}</div>
            <div style="grid-column: span 2;"><strong>Teminat Tutarı:</strong> <span style="font-size: 1.15rem; font-weight: 800; color: var(--status-completed); font-family: var(--font-mono);">${(g.amount || g.guaranteeAmount || 0).toLocaleString('tr-TR')} ${g.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.25rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; background: var(--bg-hover); padding: 0.75rem; border-radius: var(--radius-sm); color: var(--text-main);">${g.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openGuaranteeModal(g.id);
      };
    }

    this.openModal('modal-view-details');
  },

  // 🏛️ İHALE PLANLAYICISI & SÜREÇ YÖNETİMİ
  renderTenders() {
    const tbody = document.getElementById('tbody-tenders-list');
    if (!tbody) return;

    if (!this.state.tenders) this.state.tenders = [];

    const searchQuery = (document.getElementById('filter-tender-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('filter-tender-status')?.value || 'ALL';
    const unitFilter = document.getElementById('filter-tender-unit')?.value || 'ALL';

    // 1. KPI Calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

    let upcomingCount = 0;
    let ongoingCount = 0;
    let completedCount = 0;
    let totalVolumeTRY = 0;

    this.state.tenders.forEach(t => {
      const estAmt = parseFloat(t.estimatedAmount) || 0;
      const rate = (t.currency && t.currency !== 'TRY') ? (this.state.rates[t.currency] || 1) : 1;
      totalVolumeTRY += (estAmt * rate);

      if (t.status === 'Tamamlandı') {
        completedCount++;
      } else if (['Şartname Hazırlığı', 'İlanda', 'Teklif Aşamasında', 'İhale Yapıldı / Değerlendirmede'].includes(t.status)) {
        ongoingCount++;
      }

      if (t.tenderDate) {
        const tDate = new Date(t.tenderDate);
        if (tDate >= today && tDate <= in30Days && t.status !== 'Tamamlandı' && t.status !== 'İptal Edildi') {
          upcomingCount++;
        }
      }
    });

    const elUp = document.getElementById('tender-kpi-upcoming');
    const elOng = document.getElementById('tender-kpi-ongoing');
    const elComp = document.getElementById('tender-kpi-completed');
    const elVol = document.getElementById('tender-kpi-total-volume');

    if (elUp) elUp.innerText = upcomingCount;
    if (elOng) elOng.innerText = ongoingCount;
    if (elComp) elComp.innerText = completedCount;
    if (elVol) elVol.innerText = this.formatMoney(totalVolumeTRY, 'TRY');

    // 2. Filter Table Rows
    const filtered = this.state.tenders.filter(t => {
      const matchSearch = !searchQuery ||
        (t.tenderNo || '').toLowerCase().includes(searchQuery) ||
        (t.title || '').toLowerCase().includes(searchQuery) ||
        (t.unit || '').toLowerCase().includes(searchQuery) ||
        (t.relatedBarcode || '').toLowerCase().includes(searchQuery) ||
        (t.winnerSupplier || '').toLowerCase().includes(searchQuery) ||
        (t.assignedTo || '').toLowerCase().includes(searchQuery);

      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchUnit = unitFilter === 'ALL' || t.unit === unitFilter;

      return matchSearch && matchStatus && matchUnit;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtrelere uygun ihale kaydı bulunamadı.</td></tr>`;
      return;
    }

    const statusBadgeClass = {
      'Planlandı': 'status-open',
      'Şartname Hazırlığı': 'priority-yuksek',
      'İlanda': 'status-in-review',
      'Teklif Aşamasında': 'priority-orta',
      'İhale Yapıldı / Değerlendirmede': 'priority-kritik',
      'Tamamlandı': 'status-completed',
      'İptal Edildi': 'status-rejected'
    };

    const statusBadgeIcon = {
      'Planlandı': '📅',
      'Şartname Hazırlığı': '⏳',
      'İlanda': '🔔',
      'Teklif Aşamasında': '⚖️',
      'İhale Yapıldı / Değerlendirmede': '🏛️',
      'Tamamlandı': '✅',
      'İptal Edildi': '❌'
    };

    tbody.innerHTML = filtered.map(t => {
      const stClass = statusBadgeClass[t.status] || 'status-open';
      const stIcon = statusBadgeIcon[t.status] || '📋';

      const estText = t.estimatedAmount ? `${this.formatMoney(t.estimatedAmount, t.currency || 'TRY')}` : '-';
      const actText = t.actualAmount ? `${this.formatMoney(t.actualAmount, t.currency || 'TRY')}` : '';

      const barcodeHtml = t.relatedBarcode
        ? `<span class="badge priority-yuksek" style="cursor:pointer;" onclick="App.searchBarcode('${t.relatedBarcode}')" title="Talebe Git">Barkod #${t.relatedBarcode}</span>`
        : '<span style="color:var(--text-muted); font-size:0.8rem;">-</span>';

      const docCount = (this.state.documents || []).filter(d => d.entityType === 'tender' && String(d.entityId) === String(t.id)).length;

      return `
        <tr>
          <td style="font-weight:700; font-family:var(--font-mono); color:var(--accent-primary);">${t.tenderNo || '-'}</td>
          <td style="font-weight:600; max-width:240px;">${t.title || '-'}</td>
          <td>
            <div style="font-weight:600;">${t.tenderDate || '-'}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${t.tenderTime || ''}</div>
          </td>
          <td>${t.unit || '-'}</td>
          <td>${barcodeHtml}</td>
          <td><span style="font-size:0.82rem; font-weight:600;">${t.regulation || '-'}</span></td>
          <td style="font-weight:700;">${estText}</td>
          <td style="font-size:0.85rem;">
            <div>${t.winnerSupplier || '-'}</div>
            ${actText ? `<div style="font-size:0.78rem; color:var(--status-completed); font-weight:600;">${actText}</div>` : ''}
          </td>
          <td>${t.assignedTo || '-'}</td>
          <td><span class="badge ${stClass}">${stIcon} ${t.status || 'Planlandı'}</span></td>
          <td style="text-align: center;">
            <div class="action-btns" style="justify-content:center;">
              <button class="btn-icon" onclick="App.viewTenderDetails('${t.id}')" title="Detayları İncele">👁️</button>
              <button class="btn-icon" onclick="App.openDocumentManager('tender', '${t.id}', 'İhale #${t.tenderNo || t.id} — ${t.title?.replace(/'/g, "\\'")}')" title="İhale Evrakları & Dijital Arşiv (${docCount} Belge)" style="position:relative;">
                📁${docCount > 0 ? `<span style="position:absolute; top:-4px; right:-4px; background:var(--accent-primary); color:#fff; font-size:0.6rem; font-weight:800; border-radius:50%; width:14px; height:14px; display:flex; align-items:center; justify-content:center;">${docCount}</span>` : ''}
              </button>
              <button class="btn-icon" onclick="App.openTenderModal('${t.id}')" title="Düzenle">✏️</button>
              <button class="btn-icon" onclick="App.deleteTender('${t.id}')" title="Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  viewTenderDetails(id) {
    const t = (this.state.tenders || []).find(item => String(item.id) === String(id));
    if (!t) return;

    this.state.currentActiveDetail = { type: 'tender', data: t };
    document.getElementById('view-details-title').innerText = `🏛️ İhale Detayı #${t.tenderNo || t.id}`;
    const body = document.getElementById('view-details-body');
    if (body) {
      const estText = t.estimatedAmount ? `${this.formatMoney(t.estimatedAmount, t.currency || 'TRY')}` : '-';
      const actText = t.actualAmount ? `${this.formatMoney(t.actualAmount, t.currency || 'TRY')}` : '-';

      body.innerHTML = `
        <div style="border: 2px solid var(--accent-purple, #8b5cf6); padding: 1.25rem; border-radius: var(--radius-md); background: var(--bg-card); margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">İHALE NO / KODU</div>
              <div style="font-size: 1.4rem; font-weight: 800; font-family: var(--font-mono); color: var(--accent-purple, #8b5cf6);">${t.tenderNo || '-'}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">SÜREÇ AŞAMASI</div>
              <span class="badge priority-yuksek">${t.status || 'Planlandı'}</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 0.88rem; margin-bottom: 1rem;">
            <div style="grid-column: span 2;"><strong>İhale Konusu / Başlığı:</strong> <span style="font-weight: 700; color: var(--text-main); font-size: 1.05rem;">${t.title || '-'}</span></div>
            <div><strong>İhale Oturum Tarihi:</strong> 📅 ${t.tenderDate || '-'} ${t.tenderTime ? '— ' + t.tenderTime : ''}</div>
            <div><strong>Sorumlu Birim:</strong> 🏢 ${t.unit || '-'}</div>
            <div><strong>İlişkili Talep Barkodu:</strong> ${t.relatedBarcode ? '#' + t.relatedBarcode : '-'}</div>
            <div><strong>İhale Usulü / Madde:</strong> ⚖️ ${t.regulation || '-'}</div>
            <div><strong>Sorumlu Uzman:</strong> 👤 ${t.assignedTo || '-'}</div>
            <div><strong>Tahmini Maliyet (Bütçe):</strong> <span style="font-weight: 700; color: var(--accent-primary);">${estText}</span></div>
            <div><strong>Kazanan Yüklenici:</strong> 🏆 ${t.winnerSupplier || 'Henüz Sonuçlanmadı'}</div>
            <div style="grid-column: span 2;"><strong>Gerçekleşen İhale Bedeli:</strong> <span style="font-size: 1.15rem; font-weight: 800; color: var(--status-completed); font-family: var(--font-mono);">${actText}</span></div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.25rem;">İHALE NOTLARI VE AÇIKLAMA:</div>
            <div style="font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; background: var(--bg-hover); padding: 0.75rem; border-radius: var(--radius-sm); color: var(--text-main);">${t.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openTenderModal(t.id);
      };
    }

    this.openModal('modal-view-details');
  },

  openTenderModal(id = null) {
    const unitSelect = document.getElementById('tm-unit');
    if (unitSelect && this.state.units) {
      unitSelect.innerHTML = '<option value="">Birim Seçin</option>' + this.state.units.map(u => {
        const uName = typeof u === 'object' ? u.name : u;
        return `<option value="${uName}">${uName}</option>`;
      }).join('');
    }

    const assignedSelect = document.getElementById('tm-assigned-to');
    if (assignedSelect && this.state.users) {
      assignedSelect.innerHTML = '<option value="">Sorumlu Uzman Seçin</option>' + this.state.users.filter(u => u.isActive !== false).map(u => {
        return `<option value="${u.name}">${u.name} (${u.title})</option>`;
      }).join('');
    }

    if (id) {
      const t = this.state.tenders.find(item => String(item.id) === String(id));
      if (!t) return;
      document.getElementById('tm-id').value = t.id;
      document.getElementById('tm-tender-no').value = t.tenderNo || '';
      document.getElementById('tm-status').value = t.status || 'Planlandı';
      document.getElementById('tm-title').value = t.title || '';
      document.getElementById('tm-tender-date').value = t.tenderDate || '';
      document.getElementById('tm-tender-time').value = t.tenderTime || '14:00';
      if (unitSelect) unitSelect.value = t.unit || '';
      document.getElementById('tm-related-barcode').value = t.relatedBarcode || '';
      document.getElementById('tm-regulation').value = t.regulation || '';
      if (assignedSelect) assignedSelect.value = t.assignedTo || '';
      document.getElementById('tm-currency').value = t.currency || 'TRY';
      
      const tmEstInput = document.getElementById('tm-estimated-amount');
      if (tmEstInput) {
        tmEstInput.value = t.estimatedAmount ? t.estimatedAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(tmEstInput, 'tm-currency');
      }
      const tmActInput = document.getElementById('tm-actual-amount');
      if (tmActInput) {
        tmActInput.value = t.actualAmount ? t.actualAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(tmActInput, 'tm-currency', true);
      }

      document.getElementById('tm-winner-supplier').value = t.winnerSupplier || '';
      document.getElementById('tm-notes').value = t.notes || '';
      document.getElementById('tender-modal-title').innerText = `✏️ İhale #${t.tenderNo} Düzenle`;
    } else {
      document.getElementById('tm-id').value = '';
      document.getElementById('form-tender-manage').reset();
      this.onAmountInput(document.getElementById('tm-estimated-amount'), 'tm-currency');
      this.onAmountInput(document.getElementById('tm-actual-amount'), 'tm-currency', true);
      document.getElementById('tender-modal-title').innerText = '🏛️ Yeni İhale Planlama Kaydı';
    }
    this.openModal('modal-tender-form');
  },

  async handleSaveTender(e) {
    e.preventDefault();
    const id = document.getElementById('tm-id').value;
    const tenderNo = document.getElementById('tm-tender-no').value.trim();
    const status = document.getElementById('tm-status').value;
    const title = document.getElementById('tm-title').value.trim();
    const tenderDate = document.getElementById('tm-tender-date').value;
    const tenderTime = document.getElementById('tm-tender-time').value || '14:00';
    const unit = document.getElementById('tm-unit').value;
    const relatedBarcode = document.getElementById('tm-related-barcode').value.trim();
    const regulation = document.getElementById('tm-regulation').value;
    const assignedTo = document.getElementById('tm-assigned-to').value;
    const estimatedAmount = this.parseMoney(document.getElementById('tm-estimated-amount')?.value);
    const currency = document.getElementById('tm-currency').value;
    const winnerSupplier = document.getElementById('tm-winner-supplier').value.trim();
    const actualAmount = this.parseMoney(document.getElementById('tm-actual-amount')?.value);
    const notes = document.getElementById('tm-notes').value.trim();

    const tenderObj = {
      tenderNo, status, title, tenderDate, tenderTime, unit,
      relatedBarcode, regulation, assignedTo, estimatedAmount,
      currency, winnerSupplier, actualAmount, notes
    };

    if (id) {
      tenderObj.id = parseInt(id);
      await this.apiSync('tenders', 'PUT', tenderObj);
      const index = this.state.tenders.findIndex(item => String(item.id) === String(id));
      if (index !== -1) this.state.tenders[index] = { ...this.state.tenders[index], ...tenderObj };
      this.showToast(`İhale kaydı (#${tenderNo}) güncellendi!`, "success", "✏️");
      this.logAction('İhale Güncellendi', `No: ${tenderNo}, Konu: ${title}`);
    } else {
      const res = await this.apiSync('tenders', 'POST', tenderObj);
      if (res && res.id) tenderObj.id = res.id;
      this.state.tenders.unshift(tenderObj);
      this.showToast(`Yeni ihale planı (#${tenderNo}) oluşturuldu!`, "success", "🏛️");
      this.logAction('Yeni İhale Planlandı', `No: ${tenderNo}, Konu: ${title}, Tarih: ${tenderDate}`);
    }

    this.closeModal('modal-tender-form');
    this.renderTenders();
  },

  async deleteTender(id) {
    const t = this.state.tenders.find(item => String(item.id) === String(id));
    if (!t) return;

    this.showConfirm("İhale Kaydı Silme", `İhale No #${t.tenderNo} (${t.title}) kaydını silmek istediğinize emin misiniz?`, async () => {
      await this.apiSync('tenders', 'DELETE', t.id);
      this.state.tenders = this.state.tenders.filter(item => String(item.id) !== String(id));
      this.showToast(`İhale kaydı silindi!`, "info", "🗑️");
      this.logAction('İhale Kaydı Silindi', `No: ${t.tenderNo}`);
      this.renderTenders();
    }, '🗑️');
  },

  viewTenderDetails(id) {
    const t = this.state.tenders.find(item => String(item.id) === String(id));
    if (!t) return;

    this.state.currentActiveDetail = { type: 'tender', data: t };

    document.getElementById('view-details-title').innerText = `🏛️ İhale #${t.tenderNo} — Detaylar`;
    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; font-size:0.9rem;">
          <div><strong>İhale No / Kodu:</strong> <span style="font-family:var(--font-mono); color:var(--accent-primary); font-weight:700;">${t.tenderNo}</span></div>
          <div><strong>Aşama Durumu:</strong> <span class="badge priority-yuksek">${t.status}</span></div>
          <div style="grid-column: span 2;"><strong>İhale Konusu:</strong> <h4 style="margin:0.25rem 0 0 0;">${t.title}</h4></div>
          <div><strong>İhale Oturum Tarihi:</strong> ${t.tenderDate} ${t.tenderTime || ''}</div>
          <div><strong>Sorumlu Birim:</strong> ${t.unit}</div>
          <div><strong>İlişkili Talep Barkodu:</strong> ${t.relatedBarcode ? `#${t.relatedBarcode}` : 'Yok'}</div>
          <div><strong>İhale Usulü / Madde:</strong> ${t.regulation || '-'}</div>
          <div><strong>Tahmini Maliyet (Bütçe):</strong> ${this.formatMoney(t.estimatedAmount || 0, t.currency || 'TRY')}</div>
          <div><strong>Kazanan Yüklenici:</strong> ${t.winnerSupplier || 'Henüz Sonuçlanmadı'}</div>
          <div><strong>Gerçekleşen Bedel:</strong> ${t.actualAmount ? this.formatMoney(t.actualAmount, t.currency || 'TRY') : '-'}</div>
          <div><strong>Sorumlu Uzman:</strong> ${t.assignedTo || '-'}</div>
          <div style="grid-column: span 2; margin-top:0.5rem; background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:8px;">
            <strong>İhale Notları & Açıklama:</strong>
            <p style="margin:0.25rem 0 0 0; font-size:0.85rem; color:var(--text-muted);">${t.notes || 'Açıklama girilmemiş.'}</p>
          </div>
        </div>
      `;
    }

    const editBtn = document.getElementById('btn-edit-from-view');
    if (editBtn) {
      editBtn.onclick = () => {
        this.closeModal('modal-view-details');
        this.openTenderModal(t.id);
      };
    }
    this.openModal('modal-view-details');
  },

  // 6. INVOICES & WEEKLY PAYMENT SCHEDULE RENDERER (FATURA & HAFTALIK ÖDEME LİSTESİ)
  renderInvoices() {
    let invoices = this.state.invoices || [];

    if (this.state.selectedYear !== 'ALL') {
      invoices = invoices.filter(i => i.academicYear === this.state.selectedYear || !i.academicYear);
    }

    const searchText = document.getElementById('filter-invoice-search')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('filter-invoice-status')?.value || 'ALL';
    const periodVal = this.state.invoiceDatePeriod || 'ALL';

    const today = new Date();
    today.setHours(0,0,0,0);

    // Current Week (Monday to Sunday)
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon, 7=Sun
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - (dayOfWeek - 1));

    const sundayThisWeek = new Date(mondayThisWeek);
    sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
    sundayThisWeek.setHours(23,59,59,999);

    // Next Week
    const mondayNextWeek = new Date(mondayThisWeek);
    mondayNextWeek.setDate(mondayThisWeek.getDate() + 7);

    const sundayNextWeek = new Date(sundayThisWeek);
    sundayNextWeek.setDate(sundayThisWeek.getDate() + 7);

    // Apply Smart Date Period Filters
    invoices = invoices.filter(inv => {
      if (statusVal !== 'ALL' && inv.paymentStatus !== statusVal) return false;

      if (inv.dueDate) {
        const due = new Date(inv.dueDate);
        due.setHours(0,0,0,0);

        if (periodVal === 'THIS_WEEK' && (due < mondayThisWeek || due > sundayThisWeek)) return false;
        if (periodVal === 'NEXT_WEEK' && (due < mondayNextWeek || due > sundayNextWeek)) return false;
        if (periodVal === 'OVERDUE' && (due >= today || inv.paymentStatus === 'Ödendi')) return false;
        if (periodVal === 'THIS_MONTH' && (due.getMonth() !== today.getMonth() || due.getFullYear() !== today.getFullYear())) return false;
      }

      if (searchText) {
        const mNo = inv.invoiceNo?.toLowerCase().includes(searchText);
        const mSupp = inv.supplier?.toLowerCase().includes(searchText);
        const mRel = inv.relatedBarcode?.toLowerCase().includes(searchText);
        if (!mNo && !mSupp && !mRel) return false;
      }
      return true;
    });

    // Compute KPI Totals
    const totalAmountAll = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const paidAmount = invoices.filter(inv => inv.paymentStatus === 'Ödendi').reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    const thisWeekInvoices = (this.state.invoices || []).filter(inv => {
      if (!inv.dueDate || inv.paymentStatus === 'Ödendi') return false;
      const due = new Date(inv.dueDate);
      due.setHours(0,0,0,0);
      return due >= mondayThisWeek && due <= sundayThisWeek;
    });
    const thisWeekTotal = thisWeekInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const overdueInvoices = (this.state.invoices || []).filter(inv => {
      if (!inv.dueDate || inv.paymentStatus === 'Ödendi') return false;
      const due = new Date(inv.dueDate);
      due.setHours(0,0,0,0);
      return due < today;
    });
    const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    document.getElementById('invoice-kpi-total').innerText = this.formatMoney(totalAmountAll, 'TRY', 2);
    document.getElementById('invoice-kpi-this-week').innerText = this.formatMoney(thisWeekTotal, 'TRY', 2);
    document.getElementById('invoice-kpi-overdue').innerText = this.formatMoney(overdueTotal, 'TRY', 2);
    document.getElementById('invoice-kpi-paid').innerText = this.formatMoney(paidAmount, 'TRY', 2);

    const tbody = document.querySelector('#table-invoices tbody');
    if (!tbody) return;

    if (invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun fatura bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = invoices.map(inv => {
      const due = new Date(inv.dueDate);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

      let dueBadge = '';
      if (inv.paymentStatus === 'Ödendi') {
        dueBadge = `<span class="badge status-completed">🟢 Tamamlandı</span>`;
      } else if (diffDays < 0) {
        dueBadge = `<span class="badge priority-kritik">🔴 ${Math.abs(diffDays)} Gün Gecikti</span>`;
      } else if (diffDays === 0) {
        dueBadge = `<span class="badge priority-yüksek">⚡ Bugün Vade!</span>`;
      } else if (diffDays <= 7) {
        dueBadge = `<span class="badge priority-yüksek">🟠 ${diffDays} Gün Kaldı</span>`;
      } else {
        dueBadge = `<span class="badge status-open">🟢 ${diffDays} Gün</span>`;
      }

      let statusBadge = '';
      if (inv.paymentStatus === 'Ödendi') statusBadge = `<span class="badge status-completed">Ödendi</span>`;
      else if (inv.paymentStatus === 'Gecikmede' || diffDays < 0) statusBadge = `<span class="badge priority-kritik">Gecikmede</span>`;
      else statusBadge = `<span class="badge status-open">Ödeme Bekliyor</span>`;

      return `
        <tr>
          <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${inv.invoiceNo}</span></td>
          <td style="font-weight:600;">${inv.supplier}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${inv.invoiceDate}</td>
          <td style="font-weight:700; font-size:0.85rem;">${inv.dueDate}</td>
          <td>${dueBadge}</td>
          <td style="font-weight:700; font-family:var(--font-mono); color:var(--status-completed);">${this.formatMoney(inv.amount || 0, inv.currency || 'TRY', 2)}</td>
          <td>${statusBadge}</td>
          <td><span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--accent-purple);">${inv.relatedBarcode || '-'}</span></td>
          <td>
            <div class="action-btns">
              <a href="#invoice/${inv.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'invoice', ${inv.id})" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
              <button class="btn-icon" onclick="App.openDocumentManager('invoice', '${inv.id}', 'Fatura #${inv.invoiceNo} — ${inv.supplier?.replace(/'/g, "\\'")}')" title="Evraklar & Dijital Arşiv">📁</button>
              <button class="btn-icon" onclick="App.openInvoiceModal(${inv.id})" title="Düzenle">✏️</button>
              ${inv.paymentStatus !== 'Ödendi' ? `<button class="btn-icon" onclick="App.markInvoiceAsPaid(${inv.id})" title="Ödendi İşaretle">✅</button>` : ''}
              <button class="btn-icon" onclick="App.deleteInvoice(${inv.id})" title="Faturayı Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openInvoiceModal(invoiceId = null) {
    if (invoiceId) {
      const inv = this.state.invoices.find(item => String(item.id) === String(invoiceId));
      if (!inv) return;
      document.getElementById('im-id').value = inv.id;
      document.getElementById('im-no').value = inv.invoiceNo;
      document.getElementById('im-supplier').value = inv.supplier;
      document.getElementById('im-date').value = inv.invoiceDate;
      document.getElementById('im-due-date').value = inv.dueDate;
      document.getElementById('im-currency').value = inv.currency || 'TRY';

      const imAmtInput = document.getElementById('im-amount');
      if (imAmtInput) {
        imAmtInput.value = inv.amount ? inv.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        this.onAmountInput(imAmtInput, 'im-currency', true);
      }

      document.getElementById('im-status').value = inv.paymentStatus || 'Ödeme Bekliyor';
      document.getElementById('im-delivery-date').value = inv.accountingDeliveryDate || '';
      document.getElementById('im-related-barcode').value = inv.relatedBarcode || '';
      document.getElementById('im-payment-date').value = inv.paymentDate || '';
      document.getElementById('im-notes').value = inv.notes || '';
      document.getElementById('invoice-modal-title').innerText = `✏️ Fatura #${inv.invoiceNo} Düzenle`;
    } else {
      document.getElementById('im-id').value = '';
      document.getElementById('form-invoice-manage').reset();
      this.onAmountInput(document.getElementById('im-amount'), 'im-currency', true);
      document.getElementById('invoice-modal-title').innerText = '🧾 Yeni Fatura / Muhasebe Teslim Kaydı';
    }
    this.openModal('modal-invoice-form');
  },

  async handleSaveInvoice(e) {
    e.preventDefault();
    const id = document.getElementById('im-id').value;
    const invoiceNo = document.getElementById('im-no').value.trim();
    const supplier = document.getElementById('im-supplier').value.trim();
    const invoiceDate = document.getElementById('im-date').value;
    const dueDate = document.getElementById('im-due-date').value;
    const amount = this.parseMoney(document.getElementById('im-amount')?.value);
    const currency = document.getElementById('im-currency').value;
    const paymentStatus = document.getElementById('im-status').value;
    const accountingDeliveryDate = document.getElementById('im-delivery-date').value;
    const relatedBarcode = document.getElementById('im-related-barcode').value.trim();
    const paymentDate = document.getElementById('im-payment-date').value;
    const notes = document.getElementById('im-notes').value.trim();

    if (id) {
      const inv = this.state.invoices.find(item => String(item.id) === String(id));
      if (inv) {
        inv.invoiceNo = invoiceNo;
        inv.supplier = supplier;
        inv.invoiceDate = invoiceDate;
        inv.dueDate = dueDate;
        inv.amount = amount;
        inv.currency = currency;
        inv.paymentStatus = paymentStatus;
        inv.accountingDeliveryDate = accountingDeliveryDate;
        inv.relatedBarcode = relatedBarcode;
        inv.paymentDate = paymentDate;
        inv.notes = notes;
        await this.apiSync('invoices', 'PUT', inv);
      }
    } else {
      const newInvoice = {
        invoiceNo,
        supplier,
        invoiceDate,
        dueDate,
        amount,
        currency,
        paymentStatus,
        accountingDeliveryDate,
        relatedBarcode,
        paymentDate,
        notes,
        academicYear: this.getAcademicYearFromDate(invoiceDate || dueDate)
      };
      const savedI = await this.apiSync('invoices', 'POST', newInvoice);
      if (savedI) newInvoice.id = savedI.id;
      this.state.invoices.push(newInvoice);
    }

    this.populateYearSelect();
    this.showToast("Fatura bilgileri başarıyla kaydedildi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.renderInvoices();
  },

  async markInvoiceAsPaid(invoiceId) {
    const inv = this.state.invoices.find(item => String(item.id) === String(invoiceId));
    if (!inv) return;

    this.showConfirm("Fatura Ödeme Onayı", `Fatura #${inv.invoiceNo} (${this.formatMoney(inv.amount, inv.currency || 'TRY', 2)}) ödenmiş olarak işaretlensin mi?`, async () => {
      inv.paymentStatus = 'Ödendi';
      inv.paymentDate = new Date().toISOString().split('T')[0];
      await this.apiSync('invoices', 'PUT', inv);
      this.showToast("Fatura ödenmiş olarak güncellendi!", "success", "✅");
      this.renderInvoices();
    }, '💳');
  },

  exportWeeklyPaymentsToCSV() {
    let invoices = this.state.invoices || [];

    const today = new Date();
    today.setHours(0,0,0,0);
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - (dayOfWeek - 1));
    const sundayThisWeek = new Date(mondayThisWeek);
    sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
    sundayThisWeek.setHours(23,59,59,999);

    // Filter this week's due invoices
    const weeklyInvoices = invoices.filter(inv => {
      if (!inv.dueDate) return false;
      const due = new Date(inv.dueDate);
      due.setHours(0,0,0,0);
      return due >= mondayThisWeek && due <= sundayThisWeek;
    });

    let csv = "Fatura No;Tedarikçi;Fatura Tarihi;Vade Tarihi;Tutar;Para Birimi;Ödeme Durumu;İlişkili Barkod;Açıklama\n";
    weeklyInvoices.forEach(inv => {
      csv += `"${inv.invoiceNo}";"${inv.supplier}";"${inv.invoiceDate}";"${inv.dueDate}";"${inv.amount}";"${inv.currency}";"${inv.paymentStatus}";"${inv.relatedBarcode || ''}";"${inv.notes || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Haftalik_Odeme_Listesi_${mondayThisWeek.toISOString().split('T')[0]}.csv`;
    link.click();
  },

  _onRowCheckboxChange() {
    const selectedChks = document.querySelectorAll('.chk-select-request:checked');
    const bulkBar = document.getElementById('requests-bulk-bar');
    const countEl = document.getElementById('bulk-selected-count');

    if (bulkBar) {
      if (selectedChks.length > 0) {
        bulkBar.style.display = 'flex';
        if (countEl) countEl.innerText = selectedChks.length;
      } else {
        bulkBar.style.display = 'none';
      }
    }
  },

  async handleBulkComplete() {
    const selectedChks = Array.from(document.querySelectorAll('.chk-select-request:checked'));
    if (selectedChks.length === 0) return;

    const ids = selectedChks.map(c => parseInt(c.getAttribute('data-id')));

    this.showConfirm("Toplu Talep Tamamlama", `Seçilen ${ids.length} adet talebi TAMAMLANDI olarak işaretlemek istediğinize emin misiniz?`, async () => {
      for (const id of ids) {
        const r = this.state.requests.find(req => req.id === id);
        if (r) { r.status = 'Tamamlandı'; await this.apiSync('requests', 'PUT', r); }
      }

      this.logAction('Toplu Talep Tamamlandı', `${ids.length} adet talep toplu olarak tamamlandı yapıldı.`);
      this.showToast(`${ids.length} adet talep başarıyla tamamlandı!`, "success", "✅");
      const chkAll = document.getElementById('chk-select-all-requests');
      if (chkAll) chkAll.checked = false;
      this._onRowCheckboxChange();
      this.render();
    }, '✅');
  },

  async handleBulkDelegate() {
    const selectedChks = Array.from(document.querySelectorAll('.chk-select-request:checked'));
    if (selectedChks.length === 0) return;

    const targetPerson = document.getElementById('bulk-delegate-person')?.value;
    if (!targetPerson) {
      this.showToast("Lütfen devredilecek personeli seçin.", "warning", "⚠️");
      return;
    }

    const ids = selectedChks.map(c => parseInt(c.getAttribute('data-id')));

    this.showConfirm("Toplu Talep Devretme", `Seçilen ${ids.length} adet talebi '${targetPerson}' isimli personele devretmek istediğinize emin misiniz?`, async () => {
      for (const id of ids) {
        const r = this.state.requests.find(req => req.id === id);
        if (r) { r.assignedTo = targetPerson; await this.apiSync('requests', 'PUT', r); }
      }

      this.logAction('Toplu Talep Devredildi', `${ids.length} adet talep ${targetPerson} isimli personele devredildi.`);
      this.showToast(`${ids.length} adet talep ${targetPerson} personeline başarıyla devredildi!`, "success", "👉");
      const chkAll = document.getElementById('chk-select-all-requests');
      if (chkAll) chkAll.checked = false;
      this._onRowCheckboxChange();
      this.render();
    }, '👉');
  },

  // 7. UNIT ANALYSIS RENDERER (EXECUTIVE ANALYTICS REPORT)
  renderUnitAnalysis() {
    const requests = this.getFilteredRequests();
    const selectedUnit = document.getElementById('select-unit-analysis')?.value || 'ALL';
    const searchText = document.getElementById('filter-unit-search')?.value.toLowerCase().trim() || '';

    const unitMap = {};
    const unitSLA = {};
    let grandTotalSpend = 0;
    let grandTotalReq = 0;
    let grandCompletedReq = 0;
    let grandOpenReq = 0;
    let grandSlaDays = 0;
    let grandSlaCount = 0;

    requests.forEach(r => {
      const uName = r.unit || 'Diğer / Belirtilmemiş';
      if (!unitMap[uName]) unitMap[uName] = { total: 0, completed: 0, open: 0, spend: 0 };
      if (!unitSLA[uName]) unitSLA[uName] = { totalDays: 0, count: 0 };

      unitMap[uName].total++;
      grandTotalReq++;
      if (r.status === 'Tamamlandı') {
        unitMap[uName].completed++;
        grandCompletedReq++;
      } else {
        unitMap[uName].open++;
        grandOpenReq++;
      }
      
      const sp = (r.actualAmount || 0);
      unitMap[uName].spend += sp;
      grandTotalSpend += sp;

      if (r.arrivalDate && r.orderDate) {
        const d1 = new Date(r.arrivalDate);
        const d2 = new Date(r.orderDate);
        const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        if (!isNaN(diffDays) && diffDays >= 0 && diffDays < 180) {
          unitSLA[uName].totalDays += diffDays;
          unitSLA[uName].count++;
          grandSlaDays += diffDays;
          grandSlaCount++;
        }
      }
    });

    const entries = Object.entries(unitMap);

    // 1. Top Spender KPI
    const topSpender = entries.length > 0 ? [...entries].sort((a,b) => b[1].spend - a[1].spend)[0] : null;
    const elSpender = document.getElementById('unit-kpi-top-spender');
    const elSpenderSub = document.getElementById('unit-kpi-top-spender-sub');
    if (elSpender && topSpender) {
      elSpender.innerText = topSpender[0];
      if (elSpenderSub) elSpenderSub.innerText = `${topSpender[1].spend.toLocaleString('tr-TR')} ₺ Harcama`;
    }

    // 2. Top Demander KPI
    const topDemander = entries.length > 0 ? [...entries].sort((a,b) => b[1].total - a[1].total)[0] : null;
    const elDemander = document.getElementById('unit-kpi-top-demander');
    const elDemanderSub = document.getElementById('unit-kpi-top-demander-sub');
    if (elDemander && topDemander) {
      elDemander.innerText = topDemander[0];
      if (elDemanderSub) elDemanderSub.innerText = `${topDemander[1].total} Talep Açıldı`;
    }

    // 3. Fastest Unit KPI
    const slaEntries = Object.entries(unitSLA).filter(([u, s]) => s.count > 0);
    slaEntries.sort((a,b) => (a[1].totalDays / a[1].count) - (b[1].totalDays / b[1].count));
    const fastest = slaEntries.length > 0 ? slaEntries[0] : null;

    const elFastest = document.getElementById('unit-kpi-fastest');
    const elFastestSub = document.getElementById('unit-kpi-fastest-sub');
    if (elFastest) {
      if (fastest) {
        const avg = (fastest[1].totalDays / fastest[1].count).toFixed(1);
        elFastest.innerText = fastest[0];
        if (elFastestSub) elFastestSub.innerText = `${avg} Gün Ort. Temin`;
      } else {
        elFastest.innerText = '-';
        if (elFastestSub) elFastestSub.innerText = 'Veri yok';
      }
    }

    // 4. Total Unit Spend KPI
    const elTotalSpend = document.getElementById('unit-kpi-total-spend');
    if (elTotalSpend) elTotalSpend.innerText = `${grandTotalSpend.toLocaleString('tr-TR')} ₺`;

    // Filter units based on dropdown and search text
    let filteredEntries = entries.filter(([uName, s]) => {
      if (selectedUnit !== 'ALL' && uName !== selectedUnit) return false;
      if (searchText && !uName.toLowerCase().includes(searchText)) return false;
      return true;
    });

    filteredEntries.sort((a, b) => b[1].spend - a[1].spend);

    // 1. Doughnut Chart (Birim Harcama Payı)
    const topPieUnits = filteredEntries.slice(0, 7);
    const pieLabels = topPieUnits.map(u => u[0].length > 18 ? u[0].substring(0, 18) + '...' : u[0]);
    const pieData = topPieUnits.map(u => u[1].spend);
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'];

    this.createOrUpdateChart('chart-unit-spend-pie', 'doughnut', {
      labels: pieLabels.length > 0 ? pieLabels : ['Harcama Yok'],
      datasets: [{
        data: pieData.length > 0 ? pieData : [1],
        backgroundColor: colors.slice(0, Math.max(1, pieLabels.length))
      }]
    }, { responsive: true, maintainAspectRatio: false });

    // 2. Bar Chart (Birimler Arası Harcama Kıyaslaması)
    const topBarUnits = filteredEntries.slice(0, 8);
    const barLabels = topBarUnits.map(u => u[0].length > 15 ? u[0].substring(0, 15) + '...' : u[0]);
    const barSpend = topBarUnits.map(u => u[1].spend);
    const barCount = topBarUnits.map(u => u[1].total);

    this.createOrUpdateChart('chart-unit-volume-bar', 'bar', {
      labels: barLabels,
      datasets: [
        {
          label: 'Harcama (TRY)',
          data: barSpend,
          backgroundColor: '#3b82f6',
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'Talep Adedi',
          data: barCount,
          backgroundColor: '#8b5cf6',
          borderRadius: 6,
          yAxisID: 'y1'
        }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { type: 'linear', display: true, position: 'left' },
        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
      }
    });

    // 3. Render Detailed Executive Unit Table
    const tbody = document.querySelector('#table-unit-detailed tbody');
    if (tbody) {
      if (filteredEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun birim kaydı bulunamadı.</td></tr>`;
      } else {
        tbody.innerHTML = filteredEntries.map(([uName, s], idx) => {
          const shareNum = grandTotalSpend > 0 ? (s.spend / grandTotalSpend) * 100 : 0;
          const shareStr = shareNum.toFixed(1);
          const slaVal = unitSLA[uName] && unitSLA[uName].count > 0 ? (unitSLA[uName].totalDays / unitSLA[uName].count) : null;
          const slaStr = slaVal !== null ? `${slaVal.toFixed(1)} gün` : '-';
          
          let slaBadge = `<span style="font-size:0.8rem; color:var(--text-muted);">${slaStr}</span>`;
          if (slaVal !== null) {
            if (slaVal < 10) slaBadge = `<span class="badge status-completed">${slaVal.toFixed(1)} gün</span>`;
            else if (slaVal < 20) slaBadge = `<span class="badge priority-orta">${slaVal.toFixed(1)} gün</span>`;
            else slaBadge = `<span class="badge priority-kritik">${slaVal.toFixed(1)} gün</span>`;
          }

          const safeName = uName.replace(/'/g, "\\'");

          return `
            <tr>
              <td style="font-weight:700; color:var(--text-muted);">${idx + 1}</td>
              <td style="font-weight:700; color:var(--text-main);">🏢 ${uName}</td>
              <td style="font-weight:600;">${s.total}</td>
              <td><span class="badge status-completed">${s.completed}</span></td>
              <td><span class="badge status-open">${s.open}</span></td>
              <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div style="flex:1; background:var(--bg-hover); height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:${Math.min(100, shareNum)}%; background:var(--accent-primary); height:100%;"></div>
                  </div>
                  <span style="font-weight:700; font-size:0.82rem; min-width:42px;">%${shareStr}</span>
                </div>
              </td>
              <td>${slaBadge}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
              <td style="text-align:center;">
                <button class="btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="App.viewUnitAnalysisDetail('${safeName}')">🔍 Detay</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4. Update Footer Totals
    const fTotalReq = document.getElementById('unit-foot-total-req');
    const fCompletedReq = document.getElementById('unit-foot-completed-req');
    const fOpenReq = document.getElementById('unit-foot-open-req');
    const fAvgSla = document.getElementById('unit-foot-avg-sla');
    const fTotalSpend = document.getElementById('unit-foot-total-spend');

    if (fTotalReq) fTotalReq.innerText = grandTotalReq;
    if (fCompletedReq) fCompletedReq.innerText = grandCompletedReq;
    if (fOpenReq) fOpenReq.innerText = grandOpenReq;
    if (fAvgSla) fAvgSla.innerText = grandSlaCount > 0 ? (grandSlaDays / grandSlaCount).toFixed(1) + ' gün' : '-';
    if (fTotalSpend) fTotalSpend.innerText = `${grandTotalSpend.toLocaleString('tr-TR')} ₺`;
  },

  // DEDICATED UNIT ANALYSIS DETAIL MODAL HANDLER
  viewUnitAnalysisDetail(unitName) {
    const allRequests = this.getFilteredRequests();
    const unitRequests = allRequests.filter(r => r.unit === unitName);

    let completedCount = 0;
    let openCount = 0;
    let totalSpend = 0;
    let slaDays = 0;
    let slaCount = 0;

    unitRequests.forEach(r => {
      if (r.status === 'Tamamlandı') completedCount++;
      else openCount++;
      totalSpend += (r.actualAmount || 0);

      if (r.arrivalDate && r.orderDate) {
        const d1 = new Date(r.arrivalDate);
        const d2 = new Date(r.orderDate);
        const diff = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        if (!isNaN(diff) && diff < 180) {
          slaDays += diff;
          slaCount++;
        }
      }
    });

    const avgSla = slaCount > 0 ? (slaDays / slaCount).toFixed(1) + ' Gün' : '-';

    document.getElementById('view-details-title').innerText = `🏢 ${unitName} — Birim Detay Raporu`;
    const body = document.getElementById('view-details-body');
    if (body) {
      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; text-align: center;">
          <div style="background: var(--bg-card); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">TOPLAM TALEP</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-primary); margin-top: 0.2rem;">${unitRequests.length}</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">TAMAMLANAN</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--status-completed); margin-top: 0.2rem;">${completedCount}</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">ORT. SLA SÜRESİ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-purple); margin-top: 0.2rem;">${avgSla}</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">TOPLAM HARCAMA</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--status-completed); font-family: var(--font-mono); margin-top: 0.2rem;">${totalSpend.toLocaleString('tr-TR')} ₺</div>
          </div>
        </div>

        <div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <table class="custom-table" style="font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Barkod</th>
                <th>Konu</th>
                <th>Sorumlu Personel</th>
                <th>Geliş Tarihi</th>
                <th>Durum</th>
                <th>Harcama (₺)</th>
              </tr>
            </thead>
            <tbody>
              ${unitRequests.map(r => `
                <tr>
                  <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary);">${r.requestBarcode || '-'}</td>
                  <td style="font-weight: 600;">${r.subject}</td>
                  <td>${r.assignedTo}</td>
                  <td style="color: var(--text-muted);">${r.arrivalDate || r.requestDate}</td>
                  <td><span class="badge status-${r.status?.toLowerCase()}">${r.status}</span></td>
                  <td style="font-weight: 700; font-family: var(--font-mono);">${r.actualAmount > 0 ? r.actualAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    this.openModal('modal-view-details');
  },

  // 8. SUPPLIER ANALYSIS RENDERER
  renderSupplierAnalysis() {
    const requests = this.getFilteredRequests();
    const searchVal = (document.getElementById('filter-supplier-search')?.value || '').toLowerCase().trim();
    const unitVal = document.getElementById('filter-supplier-unit')?.value || 'ALL';
    const tierVal = document.getElementById('filter-supplier-tier')?.value || 'ALL';
    const sortVal = document.getElementById('filter-supplier-sort')?.value || 'SPEND_DESC';

    // Populate units in filter if needed
    const unitSelect = document.getElementById('filter-supplier-unit');
    if (unitSelect && unitSelect.options.length <= 1) {
      const units = new Set();
      (this.state.requests || []).forEach(r => { if (r.unit) units.add(r.unit); });
      Array.from(units).sort().forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.innerText = u;
        unitSelect.appendChild(opt);
      });
    }

    const suppMap = {};
    let totalSpendAll = 0;

    requests.forEach(r => {
      const sName = (r.supplier || '').trim();
      if (!sName) return;

      if (unitVal !== 'ALL' && r.unit !== unitVal) return;

      if (!suppMap[sName]) {
        suppMap[sName] = { total: 0, completed: 0, spend: 0 };
      }
      suppMap[sName].total++;
      if (r.status === 'Tamamlandı') suppMap[sName].completed++;
      const spend = parseFloat(r.actualAmount) || 0;
      suppMap[sName].spend += spend;
      totalSpendAll += spend;
    });

    let sortedSupp = Object.entries(suppMap);

    // Search filter
    if (searchVal) {
      sortedSupp = sortedSupp.filter(([sName]) => sName.toLowerCase().includes(searchVal));
    }

    // Tier filter
    if (tierVal !== 'ALL') {
      sortedSupp = sortedSupp.filter(([sName]) => {
        const score = this.getVendorScore(sName);
        const tier = this.getVendorTier(score?.overall, score?.count);
        return tier.key === tierVal;
      });
    }

    // Risk Alarms calculation
    const riskAlertsContainer = document.getElementById('supplier-risk-alerts-container');
    if (riskAlertsContainer) {
      const riskSuppliers = [];
      Object.keys(suppMap).forEach(sName => {
        const score = this.getVendorScore(sName);
        if (score) {
          const tier = this.getVendorTier(score.overall, score.count);
          if (tier.key === 'BLACKLIST' || tier.key === 'RISK') {
            riskSuppliers.push({ name: sName, overall: score.overall, count: score.count, tier });
          }
        }
      });

      if (riskSuppliers.length > 0) {
        riskAlertsContainer.innerHTML = `
          <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.08)); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: var(--radius-md); padding: 0.85rem 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 1.5rem;">🚨</span>
              <div>
                <strong style="color: #b91c1c; font-size: 0.92rem;">Tedarikçi Risk & Performans Uyarıları (${riskSuppliers.length} Firma)</strong>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
                  Aşağıdaki firmalar düşük performans veya teslimat aksamaları nedeniyle gözetim altındadır:
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              ${riskSuppliers.map(rs => `
                <span class="tier-badge ${rs.tier.badgeClass}" style="cursor: pointer;" onclick="App.openVendorProfile('${rs.name.replace(/'/g, "\\'")}')" title="360° Karnesini Aç">
                  ${rs.tier.icon} ${rs.name} (${rs.overall} ★)
                </span>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        riskAlertsContainer.innerHTML = '';
      }
    }

    if (sortVal === 'COUNT_DESC') {
      sortedSupp.sort((a, b) => b[1].total - a[1].total);
    } else if (sortVal === 'NAME_ASC') {
      sortedSupp.sort((a, b) => a[0].localeCompare(b[0], 'tr'));
    } else if (sortVal === 'SCORE_DESC') {
      sortedSupp.sort((a, b) => {
        const scoreA = parseFloat(this.getVendorScore(a[0])?.overall || 0);
        const scoreB = parseFloat(this.getVendorScore(b[0])?.overall || 0);
        return scoreB - scoreA;
      });
    } else {
      // SPEND_DESC
      sortedSupp.sort((a, b) => b[1].spend - a[1].spend);
    }

    const tbody = document.querySelector('#table-supplier-detailed tbody');
    if (tbody) {
      if (sortedSupp.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun tedarikçi bulunamadı.</td></tr>`;
      } else {
        tbody.innerHTML = sortedSupp.map(([sName, s], i) => {
          const share = totalSpendAll > 0 ? ((s.spend / totalSpendAll) * 100).toFixed(1) : 0;
          const score = this.getVendorScore(sName);
          const tier = this.getVendorTier(score?.overall, score?.count);
          const safeName = sName.replace(/'/g, "\\'");
          
          let scoreBadgeHtml = `<span style="font-size:0.75rem; color:var(--text-muted);">Puanlanmadı</span>`;
          if (score) {
            scoreBadgeHtml = `
              <div style="display:flex; flex-direction:column; gap:0.25rem;">
                <span class="score-badge-gold" style="width:fit-content; cursor:pointer;" onclick="App.openVendorProfile('${safeName}')" title="360° Karnesini Aç">
                  ⭐ ${score.overall} <small style="opacity:0.75; font-size:0.7rem;">(${score.count} Değerlendirme)</small>
                </span>
                <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                  ${score.goodsAvg ? `<span class="badge" style="background:rgba(59,130,246,0.12); color:#2563eb; border:1px solid rgba(59,130,246,0.3); font-size:0.68rem; padding:0.1rem 0.35rem;" title="${score.goodsCount} Mal Alımı Değerlendirmesi">📦 Mal: ${score.goodsAvg}★ (${score.goodsCount})</span>` : ''}
                  ${score.serviceAvg ? `<span class="badge" style="background:rgba(16,185,129,0.12); color:#059669; border:1px solid rgba(16,185,129,0.3); font-size:0.68rem; padding:0.1rem 0.35rem;" title="${score.serviceCount} Hizmet Alımı Değerlendirmesi">🛠️ Hizmet: ${score.serviceAvg}★ (${score.serviceCount})</span>` : ''}
                </div>
              </div>
            `;
          }

          return `
            <tr>
              <td style="font-weight:700; color:var(--text-muted);">${i + 1}</td>
              <td style="font-weight:700;">
                <a href="javascript:void(0)" onclick="App.openVendorProfile('${safeName}')" style="color:var(--text-main); text-decoration:underline; text-decoration-color:var(--accent-primary);" title="360° Karnesini Aç">
                  🏢 ${sName}
                </a>
              </td>
              <td><span class="tier-badge ${tier.badgeClass}">${tier.label}</span></td>
              <td>${scoreBadgeHtml}</td>
              <td style="font-weight:600;">${s.total}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
              <td><span class="badge status-completed">${s.completed}</span></td>
              <td style="font-weight:600;">%${share}</td>
              <td style="text-align:center;">
                <div style="display:flex; gap:0.35rem; justify-content:center;">
                  <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem; border-color:var(--accent-primary); color:var(--accent-primary); font-weight:700;" onclick="App.openVendorProfile('${safeName}')" title="360° Firma Profili & Radar Karnesi">
                    <span>🔍</span> Profil
                  </button>
                  <button class="btn-secondary" style="padding:0.25rem 0.55rem; font-size:0.75rem; border-color:#f59e0b; color:#d97706; font-weight:700;" onclick="App.openVendorRateModal('${safeName}')" title="Puan Ver">
                    <span>⭐</span> Puanla
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  // 9. EXPANDED TABBED YEARLY REPORT RENDERER
  renderYearlyReport() {
    const requests = this.getFilteredRequests();
    const activeTab = this.state.yearlyActiveTab || 'financial';

    // Update Top 4 YoY KPI Cards
    const allRequests = this.state.requests;
    const selectedYearParts = this.state.selectedYear.split('-');
    let prevYearStr = '2024-2025';
    if (selectedYearParts.length === 2) {
      const y1 = parseInt(selectedYearParts[0]) - 1;
      const y2 = parseInt(selectedYearParts[1]) - 1;
      prevYearStr = `${y1}-${y2}`;
    }
    const prevYearRequests = allRequests.filter(r => r.academicYear === prevYearStr);

    const currentTotal = requests.length;
    const prevTotal = prevYearRequests.length;
    const diffTotalPct = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 0;

    const elYoyTotal = document.getElementById('yoy-kpi-total');
    const elYoyTotalSub = document.getElementById('yoy-kpi-total-sub');
    if (elYoyTotal) elYoyTotal.innerText = currentTotal;
    if (elYoyTotalSub) elYoyTotalSub.innerText = `${diffTotalPct >= 0 ? '+' : ''}${diffTotalPct}% vs. ${prevYearStr}`;

    const currentSpend = requests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const prevSpend = prevYearRequests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const diffSpendPct = prevSpend > 0 ? (((currentSpend - prevSpend) / prevSpend) * 100).toFixed(1) : 0;

    const elYoySpend = document.getElementById('yoy-kpi-spend');
    const elYoySpendSub = document.getElementById('yoy-kpi-spend-sub');
    if (elYoySpend) elYoySpend.innerText = `${currentSpend.toLocaleString('tr-TR')} ₺`;
    if (elYoySpendSub) elYoySpendSub.innerText = `${diffSpendPct >= 0 ? '+' : ''}${diffSpendPct}% vs. ${prevYearStr}`;

    let totalWaitDays = 0;
    let completedWithDates = 0;
    requests.forEach(r => {
      if (r.arrivalDate && r.orderDate) {
        const d1 = new Date(r.arrivalDate);
        const d2 = new Date(r.orderDate);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (!isNaN(diffDays) && diffDays >= 0 && diffDays < 180) {
          totalWaitDays += diffDays;
          completedWithDates++;
        }
      }
    });
    const avgDays = completedWithDates > 0 ? (totalWaitDays / completedWithDates).toFixed(1) : '5.4';
    const elYoyTurnaround = document.getElementById('yoy-kpi-turnaround');
    const elYoyTurnaroundSub = document.getElementById('yoy-kpi-turnaround-sub');
    if (elYoyTurnaround) elYoyTurnaround.innerText = `${avgDays} Gün`;
    if (elYoyTurnaroundSub) elYoyTurnaroundSub.innerText = `${completedWithDates} Tamamlanan İş`;

    const completedCount = requests.filter(r => r.status === 'Tamamlandı').length;
    const compRate = currentTotal > 0 ? ((completedCount / currentTotal) * 100).toFixed(1) : 0;
    const elYoyCompRate = document.getElementById('yoy-kpi-completion-rate');
    const elYoyCompCount = document.getElementById('yoy-kpi-completed-count');
    if (elYoyCompRate) elYoyCompRate.innerText = `%${compRate}`;
    if (elYoyCompCount) elYoyCompCount.innerText = `${completedCount} Kapalı İş`;

    // Show active tab content, hide others
    document.querySelectorAll('.yearly-tab-content').forEach(el => el.style.display = 'none');
    const activeEl = document.getElementById(`yearly-tab-${activeTab}`);
    if (activeEl) activeEl.style.display = 'block';

    // Update Tab Buttons UI
    document.querySelectorAll('#yearly-report-tabs button').forEach(btn => {
      if (btn.getAttribute('data-tab') === activeTab) btn.classList.add('active-date-tab');
      else btn.classList.remove('active-date-tab');
    });

    const months = ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos'];

    // TAB 1: FINANCIAL & SAVINGS REPORT
    if (activeTab === 'financial') {
      let totalSpend = 0;
      let totalEstimated = 0;
      let totalSavings = 0;

      const monthlyData = Array(12).fill(0).map(() => ({ count: 0, est: 0, act: 0, sav: 0 }));

      requests.forEach(r => {
        const act = r.actualAmount || 0;
        const est = r.estimatedAmount || r.budgetAmount || act || 0;
        const sav = Math.max(0, est - act);

        totalSpend += act;
        totalEstimated += est;
        totalSavings += sav;

        if (r.requestDate) {
          const m = parseInt(r.requestDate.split('-')[1]) - 1;
          const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
          if (acadIdx >= 0 && acadIdx < 12) {
            monthlyData[acadIdx].count++;
            monthlyData[acadIdx].est += est;
            monthlyData[acadIdx].act += act;
            monthlyData[acadIdx].sav += sav;
          }
        }
      });

      const savingsRate = totalEstimated > 0 ? ((totalSavings / totalEstimated) * 100).toFixed(1) : 0;

      const elTotalSpend = document.getElementById('yearly-kpi-total-spend');
      const elSavings = document.getElementById('yearly-kpi-savings');
      const elSavingsSub = document.getElementById('yearly-kpi-savings-sub');
      const elReqCount = document.getElementById('yearly-kpi-req-count');

      if (elTotalSpend) elTotalSpend.innerText = `${totalSpend.toLocaleString('tr-TR')} ₺`;
      if (elSavings) elSavings.innerText = `${totalSavings.toLocaleString('tr-TR')} ₺`;
      if (elSavingsSub) elSavingsSub.innerText = `%${savingsRate} Kurumsal Tasarruf Oranı`;
      if (elReqCount) elReqCount.innerText = requests.length;

      // Chart 1: Combo Harcama & Bütçe
      this.createOrUpdateChart('chart-yearly-combo', 'bar', {
        labels: months,
        datasets: [
          {
            type: 'bar',
            label: 'Gerçekleşen Harcama (TRY)',
            data: monthlyData.map(d => d.act),
            backgroundColor: 'rgba(59, 130, 246, 0.65)',
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Tahmini Bütçe (TRY)',
            data: monthlyData.map(d => d.est),
            borderColor: '#8b5cf6',
            borderWidth: 3,
            tension: 0.3,
            yAxisID: 'y'
          }
        ]
      }, { responsive: true, maintainAspectRatio: false });

      // Chart 2: Pazarlık Tasarrufu Area Chart
      this.createOrUpdateChart('chart-yearly-savings', 'line', {
        labels: months,
        datasets: [{
          label: 'Pazarlık Tasarrufu (TRY)',
          data: monthlyData.map(d => d.sav),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.18)',
          fill: true,
          tension: 0.35
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Table 1: Financial Monthly Table
      const tbody = document.querySelector('#table-yearly-financial-monthly tbody');
      if (tbody) {
        tbody.innerHTML = months.map((mName, i) => {
          const d = monthlyData[i];
          const rate = d.est > 0 ? ((d.sav / d.est) * 100).toFixed(1) : 0;
          return `
            <tr>
              <td style="font-weight:700;">${mName}</td>
              <td style="font-weight:600;">${d.count}</td>
              <td style="color:var(--text-muted); font-family:var(--font-mono);">${d.est.toLocaleString('tr-TR')} ₺</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${d.act.toLocaleString('tr-TR')} ₺</td>
              <td style="font-weight:700; color:var(--status-open); font-family:var(--font-mono);">${d.sav.toLocaleString('tr-TR')} ₺</td>
              <td><span class="badge priority-orta">%${rate}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    // TAB 2: PROCESS SPEED & SLA PERFORMANCE REPORT
    else if (activeTab === 'sla') {
      let totalWaitDays = 0;
      let completedWithDates = 0;
      let overdueCount = 0;
      let completedCount = 0;

      const slaBins = { '0-7 Gün': 0, '8-14 Gün': 0, '14+ Gün Gecikme': 0 };
      const monthlySLA = Array(12).fill(0).map(() => ({ opened: 0, completed: 0, open: 0, overdue: 0, totalDays: 0, count: 0 }));

      requests.forEach(r => {
        if (r.status === 'Tamamlandı') completedCount++;

        let arrDt = r.arrivalDate || r.requestDate;
        if (arrDt) {
          const d1 = new Date(arrDt);
          const d2 = r.orderDate ? new Date(r.orderDate) : new Date();
          const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));

          if (!isNaN(diffDays) && diffDays >= 0) {
            if (r.orderDate) {
              totalWaitDays += diffDays;
              completedWithDates++;
            }

            if (diffDays <= 7) slaBins['0-7 Gün']++;
            else if (diffDays <= 14) slaBins['8-14 Gün']++;
            else {
              slaBins['14+ Gün Gecikme']++;
              if (r.status === 'Açık') overdueCount++;
            }
          }

          if (r.requestDate) {
            const m = parseInt(r.requestDate.split('-')[1]) - 1;
            const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
            if (acadIdx >= 0 && acadIdx < 12) {
              monthlySLA[acadIdx].opened++;
              if (r.status === 'Tamamlandı') monthlySLA[acadIdx].completed++;
              if (r.status === 'Açık') monthlySLA[acadIdx].open++;
              if (r.status === 'Açık' && diffDays >= 14) monthlySLA[acadIdx].overdue++;
              if (r.orderDate && !isNaN(diffDays)) {
                monthlySLA[acadIdx].totalDays += diffDays;
                monthlySLA[acadIdx].count++;
              }
            }
          }
        }
      });

      const avgSLA = completedWithDates > 0 ? (totalWaitDays / completedWithDates).toFixed(1) : '4.8';
      const compRate = requests.length > 0 ? ((completedCount / requests.length) * 100).toFixed(1) : 0;

      const elAvgSla = document.getElementById('yearly-kpi-avg-sla');
      const elAvgSlaSub = document.getElementById('yearly-kpi-avg-sla-sub');
      const elCompRate = document.getElementById('yearly-kpi-completion-rate');
      const elCompCount = document.getElementById('yearly-kpi-completed-count');
      const elOverdue = document.getElementById('yearly-kpi-overdue-count');

      if (elAvgSla) elAvgSla.innerText = `${avgSLA} Gün`;
      if (elAvgSlaSub) elAvgSlaSub.innerText = `${completedWithDates} Tamamlanan İş`;
      if (elCompRate) elCompRate.innerText = `%${compRate}`;
      if (elCompCount) elCompCount.innerText = `${completedCount} Kapalı İş`;
      if (elOverdue) elOverdue.innerText = overdueCount;

      // Chart 1: SLA Line Chart
      this.createOrUpdateChart('chart-yearly-sla', 'line', {
        labels: months,
        datasets: [{
          label: 'Ortalama Kapanma Süresi (Gün)',
          data: monthlySLA.map(d => d.count > 0 ? (d.totalDays / d.count).toFixed(1) : 4.5),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Chart 2: SLA Distribution Doughnut
      this.createOrUpdateChart('chart-yearly-sla-distribution', 'doughnut', {
        labels: Object.keys(slaBins),
        datasets: [{
          data: Object.values(slaBins),
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Table 2: SLA Monthly Table
      const tbody = document.querySelector('#table-yearly-sla-monthly tbody');
      if (tbody) {
        tbody.innerHTML = months.map((mName, i) => {
          const d = monthlySLA[i];
          const avg = d.count > 0 ? (d.totalDays / d.count).toFixed(1) : '-';
          return `
            <tr>
              <td style="font-weight:700;">${mName}</td>
              <td>${d.opened}</td>
              <td><span class="badge status-completed">${d.completed}</span></td>
              <td><span class="badge status-open">${d.open}</span></td>
              <td><span class="badge priority-${d.overdue > 0 ? 'kritik' : 'orta'}">${d.overdue}</span></td>
              <td style="font-weight:700; color:var(--accent-primary); font-family:var(--font-mono);">${avg} gün</td>
            </tr>
          `;
        }).join('');
      }
    }

    // TAB 3: REGULATIONS & SUPPLIER DISTRIBUTION REPORT
    else if (activeTab === 'regulations') {
      const regMap = {};
      const currMap = { 'TRY': 0, 'USD': 0, 'EUR': 0 };
      const suppMap = {};
      let totalSpendAll = 0;

      requests.forEach(r => {
        const sp = r.actualAmount || 0;
        totalSpendAll += sp;

        // Regulation
        let reg = (r.regulation || 'Belirtilmemiş').trim();
        if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
        if (!regMap[reg]) regMap[reg] = { count: 0, completed: 0, spend: 0 };
        regMap[reg].count++;
        if (r.status === 'Tamamlandı') regMap[reg].completed++;
        regMap[reg].spend += sp;

        // Currency
        const cur = r.currency || 'TRY';
        if (currMap[cur] !== undefined) currMap[cur] += sp;
        else currMap['TRY'] += sp;

        // Supplier
        if (r.supplier && r.supplier !== '-' && r.supplier.trim() !== '') {
          const sName = r.supplier.trim();
          suppMap[sName] = (suppMap[sName] || 0) + sp;
        }
      });

      const topReg = Object.entries(regMap).sort((a,b) => b[1].count - a[1].count)[0];
      if (topReg) {
        const elTopReg = document.getElementById('yearly-kpi-top-reg');
        const elTopRegSub = document.getElementById('yearly-kpi-top-reg-sub');
        if (elTopReg) elTopReg.innerText = `Madde ${topReg[0]}`;
        if (elTopRegSub) elTopRegSub.innerText = `${topReg[1].count} Talep (%${((topReg[1].count / Math.max(1, requests.length))*100).toFixed(0)})`;
      }

      const topSupp = Object.entries(suppMap).sort((a,b) => b[1] - a[1])[0];
      if (topSupp) {
        const elTopSupp = document.getElementById('yearly-kpi-top-supplier');
        const elTopSuppSub = document.getElementById('yearly-kpi-top-supplier-sub');
        if (elTopSupp) elTopSupp.innerText = topSupp[0];
        if (elTopSuppSub) elTopSuppSub.innerText = `${topSupp[1].toLocaleString('tr-TR')} ₺ Toplam Harcama`;
      }

      // Chart 1: Regulations Bar Chart
      const regKeys = Object.keys(regMap).slice(0, 7);
      this.createOrUpdateChart('chart-yearly-regulations', 'bar', {
        labels: regKeys.map(k => `Madde ${k}`),
        datasets: [{
          label: 'Talep Adedi',
          data: regKeys.map(k => regMap[k].count),
          backgroundColor: '#eab308',
          borderRadius: 6
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Chart 2: Currency Doughnut
      this.createOrUpdateChart('chart-yearly-currency', 'doughnut', {
        labels: ['TRY (₺)', 'USD ($)', 'EUR (€)'],
        datasets: [{
          data: [currMap['TRY'] || 1, currMap['USD'] || 0, currMap['EUR'] || 0],
          backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6']
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Chart 3: Top 5 Suppliers Bar
      const top5Suppliers = Object.entries(suppMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
      this.createOrUpdateChart('chart-yearly-top-suppliers', 'bar', {
        labels: top5Suppliers.map(s => s[0].length > 14 ? s[0].substring(0, 14) + '...' : s[0]),
        datasets: [{
          label: 'Harcama (TRY)',
          data: top5Suppliers.map(s => s[1]),
          backgroundColor: '#3b82f6',
          borderRadius: 6
        }]
      }, { responsive: true, maintainAspectRatio: false });

      // Table 3: Regulation Table
      const tbody = document.querySelector('#table-yearly-regulations tbody');
      if (tbody) {
        const sortedRegs = Object.entries(regMap).sort((a,b) => b[1].spend - a[1].spend);
        tbody.innerHTML = sortedRegs.map(([regKey, s]) => {
          const share = totalSpendAll > 0 ? ((s.spend / totalSpendAll) * 100).toFixed(1) : 0;
          return `
            <tr>
              <td style="font-weight:700;">Madde ${regKey}</td>
              <td style="font-weight:600;">${s.count}</td>
              <td><span class="badge status-completed">${s.completed}</span></td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
              <td style="font-weight:600;">%${share}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // TAB 4: PERSONEL PAZARLIK TASARRUFU & 12 AYLIK MATRİS RAPORU
    else if (activeTab === 'savings') {
      const activeUsers = this.state.users.filter(u => u.isActive !== false);
      const personMap = {};

      activeUsers.forEach(u => {
        personMap[u.name] = {
          user: u,
          total: 0,
          savingsCount: 0,
          initialTotal: 0,
          actualTotal: 0,
          savings: 0,
          monthlySavings: Array(12).fill(0)
        };
      });

      requests.forEach(r => {
        const pName = r.assignedTo;
        if (personMap[pName]) {
          const p = personMap[pName];
          p.total++;

          const initAmt = parseFloat(r.budgetAmount || r.estimatedAmount) || 0;
          const actAmt = parseFloat(r.actualAmount) || 0;

          if (initAmt > 0 && actAmt > 0 && initAmt > actAmt) {
            const diff = initAmt - actAmt;
            p.savings += diff;
            p.savingsCount++;
            p.initialTotal += initAmt;
            p.actualTotal += actAmt;

            const dtStr = r.orderDate || r.arrivalDate || r.requestDate;
            if (dtStr) {
              const d = new Date(dtStr);
              if (!isNaN(d.getTime())) {
                const monthIdx = d.getMonth();
                const acadIdx = monthIdx >= 8 ? (monthIdx - 8) : (monthIdx + 4);
                if (acadIdx >= 0 && acadIdx < 12) {
                  p.monthlySavings[acadIdx] += diff;
                }
              }
            }
          }
        }
      });

      const grandSavings = Object.values(personMap).reduce((sum, p) => sum + p.savings, 0);
      const grandBadge = document.getElementById('yearly-tab-savings-grand-badge');
      if (grandBadge) {
        grandBadge.innerHTML = `💰 Yıllık Toplam Tasarruf: <strong>${grandSavings.toLocaleString('tr-TR')} ₺</strong>`;
      }

      const institutionalMonthly = Array(12).fill(0);
      let grandInstInitial = 0;
      Object.values(personMap).forEach(p => {
        grandInstInitial += p.initialTotal;
        p.monthlySavings.forEach((sav, idx) => {
          institutionalMonthly[idx] += sav;
        });
      });

      const tbody = document.querySelector('#table-yearly-personnel-savings tbody');
      const tfoot = document.querySelector('#table-yearly-personnel-savings tfoot');

      if (tbody) {
        const sortedPersons = Object.values(personMap).sort((a, b) => b.savings - a.savings);
        if (sortedPersons.length === 0) {
          tbody.innerHTML = `<tr><td colspan="16" style="text-align:center; color:var(--text-muted); padding:2rem;">Personel verisi bulunamadı.</td></tr>`;
        } else {
          tbody.innerHTML = sortedPersons.map(p => {
            const ratePct = p.initialTotal > 0 ? ((p.savings / p.initialTotal) * 100).toFixed(1) : '0.0';
            const safeName = p.user.name.replace(/'/g, "\\'");

            const monthTds = p.monthlySavings.map(s => {
              if (s > 0) {
                const isInt = (s % 1 === 0);
                return `<td style="font-family:var(--font-mono); font-weight:700; color:var(--status-completed); background:rgba(34,197,94,0.05); text-align:right; white-space:nowrap;">+${this.formatMoney(s, 'TRY', isInt ? 0 : 2)}</td>`;
              }
              return `<td style="color:var(--text-muted); font-size:0.78rem; text-align:center;">-</td>`;
            }).join('');

            return `
              <tr style="cursor: pointer;" onclick="App.openPersonnelSavingsDetailView('${safeName}')" title="Kullanıcıya tıklayarak detaylı grafik, birim dağılımı ve iş listesini görün">
                <td style="white-space:nowrap;">
                  <strong style="color:var(--text-main); font-size:0.88rem;">${p.user.name}</strong>
                  <div style="font-size:0.72rem; color:var(--text-muted);">${p.user.title}</div>
                </td>
                ${monthTds}
                <td style="font-family:var(--font-mono); font-weight:800; color:var(--status-completed); font-size:0.92rem; background:rgba(34,197,94,0.12); text-align:right; white-space:nowrap;">
                  ${p.savings > 0 ? '+' + this.formatMoney(p.savings, 'TRY', 2) : '0,00\u00A0₺'}
                </td>
                <td style="text-align:center; white-space:nowrap;">
                  <span class="badge" style="background:${p.savings > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-card)'}; color:${p.savings > 0 ? 'var(--status-completed)' : 'var(--text-muted)'}; font-weight:700;">
                    %${ratePct}
                  </span>
                </td>
                <td style="text-align:center; white-space:nowrap;">
                  <button class="btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="event.stopPropagation(); App.openPersonnelSavingsDetailView('${safeName}')">
                    🔍 Detay
                  </button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      if (tfoot) {
        const grandRatePct = grandInstInitial > 0 ? ((grandSavings / grandInstInitial) * 100).toFixed(1) : '0.0';
        const footMonthTds = institutionalMonthly.map(s => {
          return `<td style="font-family:var(--font-mono); color:var(--status-completed); text-align:right; white-space:nowrap;">${s > 0 ? '+' + this.formatMoney(s, 'TRY', (s % 1 === 0 ? 0 : 2)) : '-'}</td>`;
        }).join('');

        tfoot.innerHTML = `
          <tr>
            <td style="color:var(--accent-primary); white-space:nowrap;">🏛️ KURUM GENEL TOPLAMI</td>
            ${footMonthTds}
            <td style="font-family:var(--font-mono); font-size:0.92rem; color:var(--status-completed); background:rgba(34,197,94,0.2); text-align:right; white-space:nowrap;">
              +${this.formatMoney(grandSavings, 'TRY', 2)}
            </td>
            <td style="color:var(--status-completed); text-align:center; white-space:nowrap;">%${grandRatePct}</td>
            <td style="text-align:center;">-</td>
          </tr>
        `;
      }
    }

    // TAB 5: REGULATION X SUPPLIER DRILL-DOWN MATRIX REPORT
    else if (activeTab === 'matrix') {
      this.renderYearlyMatrixReport(requests);
    }
  },

  // ============================================================
  // 🏛️ SEKME 5: İHALE MADDESİ X TEDARİKÇİ MATRİSİ RENDERER
  // ============================================================
  renderYearlyMatrixReport(requests = null) {
    const activeRequests = requests || this.getFilteredRequests();

    // 1. Populate Dropdown Filters (Regulations and Suppliers)
    const regSelect = document.getElementById('filter-matrix-regulation');
    const suppSelect = document.getElementById('filter-matrix-supplier');
    const currentRegVal = this.state.matrixRegulation || 'ALL';
    const currentSuppVal = this.state.matrixSupplier || 'ALL';
    const groupBy = this.state.matrixGroupBy || 'REG_FIRST';
    const searchText = (this.state.matrixSearch || '').toLowerCase().trim();

    const uniqueRegs = new Set();
    const uniqueSupps = new Set();

    activeRequests.forEach(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      if (reg) uniqueRegs.add(reg);

      const supp = (r.supplier || '').trim();
      if (supp && supp !== '-') uniqueSupps.add(supp);
    });

    if (regSelect) {
      const sortedRegs = Array.from(uniqueRegs).sort();
      const prevVal = regSelect.value || currentRegVal;
      regSelect.innerHTML = '<option value="ALL">🏛️ Tüm İhale Maddeleri</option>' +
        sortedRegs.map(reg => `<option value="${reg}">Madde ${reg}</option>`).join('');
      regSelect.value = prevVal;
    }

    if (suppSelect) {
      const sortedSupps = Array.from(uniqueSupps).sort((a, b) => a.localeCompare(b, 'tr'));
      const prevVal = suppSelect.value || currentSuppVal;
      suppSelect.innerHTML = '<option value="ALL">🏭 Tüm Tedarikçiler</option>' +
        sortedSupps.map(s => `<option value="${s}">${s}</option>`).join('');
      suppSelect.value = prevVal;
    }

    // 2. Filter Requests for Analysis
    const matchingRequests = activeRequests.filter(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      const supp = (r.supplier || '').trim();

      if (currentRegVal !== 'ALL' && reg !== currentRegVal) return false;
      if (currentSuppVal !== 'ALL' && supp !== currentSuppVal) return false;

      if (searchText) {
        const mSupp = supp.toLowerCase().includes(searchText);
        const mSubj = (r.subject || '').toLowerCase().includes(searchText);
        const mBar = (r.requestBarcode || '').toString().toLowerCase().includes(searchText);
        const mReg = reg.toLowerCase().includes(searchText);
        const mUnit = (r.unit || '').toLowerCase().includes(searchText);
        if (!mSupp && !mSubj && !mBar && !mReg && !mUnit) return false;
      }
      return true;
    });

    // 3. Compute KPI Summary Cards
    const distinctUsedRegs = new Set();
    const distinctUsedSupps = new Set();
    let grandTotalSpend = 0;
    const totalOrdersCount = matchingRequests.length;

    matchingRequests.forEach(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      distinctUsedRegs.add(reg);

      const supp = (r.supplier || '').trim();
      if (supp && supp !== '-') distinctUsedSupps.add(supp);

      grandTotalSpend += (r.actualAmount || 0);
    });

    const elKpiReg = document.getElementById('matrix-kpi-total-reg');
    const elKpiSupp = document.getElementById('matrix-kpi-total-supp');
    const elKpiOrders = document.getElementById('matrix-kpi-total-orders');
    const elKpiSpend = document.getElementById('matrix-kpi-total-spend');

    if (elKpiReg) elKpiReg.innerText = distinctUsedRegs.size;
    if (elKpiSupp) elKpiSupp.innerText = distinctUsedSupps.size;
    if (elKpiOrders) elKpiOrders.innerText = totalOrdersCount;
    if (elKpiSpend) elKpiSpend.innerText = `${grandTotalSpend.toLocaleString('tr-TR')} ₺`;

    // 4. Group Data Structure
    // Either Regulation ➔ Supplier ➔ Requests OR Supplier ➔ Regulation ➔ Requests
    const treeData = {};
    const pairMap = {}; // for Top Pairs chart
    const regSpendMap = {}; // for Doughnut chart

    matchingRequests.forEach(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      const supp = (r.supplier && r.supplier !== '-') ? r.supplier.trim() : 'Tedarikçi Belirtilmemiş';
      const spend = r.actualAmount || 0;

      // Pair tracking
      const pairKey = `Madde ${reg} & ${supp.length > 18 ? supp.substring(0, 18) + '...' : supp}`;
      pairMap[pairKey] = (pairMap[pairKey] || 0) + spend;

      // Reg tracking
      regSpendMap[reg] = (regSpendMap[reg] || 0) + spend;

      const mainKey = groupBy === 'REG_FIRST' ? `Madde ${reg}` : supp;
      const subKey = groupBy === 'REG_FIRST' ? supp : `Madde ${reg}`;

      if (!treeData[mainKey]) {
        treeData[mainKey] = {
          name: mainKey,
          totalCount: 0,
          totalSpend: 0,
          subGroups: {}
        };
      }

      treeData[mainKey].totalCount++;
      treeData[mainKey].totalSpend += spend;

      if (!treeData[mainKey].subGroups[subKey]) {
        treeData[mainKey].subGroups[subKey] = {
          name: subKey,
          totalCount: 0,
          totalSpend: 0,
          requests: []
        };
      }

      treeData[mainKey].subGroups[subKey].totalCount++;
      treeData[mainKey].subGroups[subKey].totalSpend += spend;
      treeData[mainKey].subGroups[subKey].requests.push(r);
    });

    // 5. Visual Charts
    // Chart 1: Bar Chart (Top 8 Pairs)
    const sortedPairs = Object.entries(pairMap).sort((a,b) => b[1] - a[1]).slice(0, 8);
    this.createOrUpdateChart('chart-yearly-matrix-bar', 'bar', {
      labels: sortedPairs.map(p => p[0]),
      datasets: [{
        label: 'Gerçekleşen Harcama (TRY)',
        data: sortedPairs.map(p => p[1]),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { font: { size: 9 }, maxRotation: 25 } }
      }
    });

    // Chart 2: Doughnut Chart (Regulation Distribution)
    const sortedRegSpend = Object.entries(regSpendMap).sort((a,b) => b[1] - a[1]).slice(0, 7);
    const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    this.createOrUpdateChart('chart-yearly-matrix-doughnut', 'doughnut', {
      labels: sortedRegSpend.map(r => `Madde ${r[0]}`),
      datasets: [{
        data: sortedRegSpend.map(r => r[1]),
        backgroundColor: chartColors.slice(0, sortedRegSpend.length)
      }]
    }, {
      responsive: true,
      maintainAspectRatio: false
    });

    // 6. Build Tree Table HTML
    const tbody = document.getElementById('tbody-yearly-matrix');
    const tfoot = document.getElementById('tfoot-yearly-matrix');
    if (!tbody) return;

    const sortedMainKeys = Object.keys(treeData).sort((a,b) => treeData[b].totalSpend - treeData[a].totalSpend);

    if (sortedMainKeys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2.5rem;">Filtreleme kriterlerine uygun ihale maddesi ve tedarikçi eşleşmesi bulunamadı.</td></tr>`;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    if (!this.state.expandedMatrixGroups) this.state.expandedMatrixGroups = new Set();
    if (!this.state.expandedMatrixSubGroups) this.state.expandedMatrixSubGroups = new Set();

    let html = '';

    sortedMainKeys.forEach((mainKey, mainIdx) => {
      const mainGroup = treeData[mainKey];
      const mainGroupId = `mg_${mainIdx}`;
      const isMainExpanded = this.state.expandedMatrixGroups.has(mainGroupId);
      const mainShare = grandTotalSpend > 0 ? ((mainGroup.totalSpend / grandTotalSpend) * 100).toFixed(1) : 0;
      const mainAvg = mainGroup.totalCount > 0 ? (mainGroup.totalSpend / mainGroup.totalCount).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0;
      const subGroupCount = Object.keys(mainGroup.subGroups).length;

      const isReg = mainKey.startsWith('Madde ');
      const badgeHtml = isReg
        ? `<span class="matrix-badge-reg">📜 ${mainKey}</span>`
        : `<span class="matrix-badge-supp">🏭 ${mainKey}</span>`;

      // Level 1: Main Group Row
      html += `
        <tr class="matrix-row-group" onclick="App.toggleMatrixGroup('${mainGroupId}')">
          <td style="text-align:center;">
            <button class="matrix-toggle-btn ${isMainExpanded ? 'expanded' : ''}" onclick="event.stopPropagation(); App.toggleMatrixGroup('${mainGroupId}')">▶</button>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              ${badgeHtml}
              <span style="font-size:0.82rem; color:var(--text-muted); font-weight:normal;">(${subGroupCount} ${groupBy === 'REG_FIRST' ? 'Tedarikçi' : 'Madde'})</span>
            </div>
          </td>
          <td style="text-align:center; font-weight:700;">${mainGroup.totalCount} Sipariş</td>
          <td style="text-align:right; font-weight:800; color:var(--status-completed); font-family:var(--font-mono); font-size:0.95rem;">${mainGroup.totalSpend.toLocaleString('tr-TR')} ₺</td>
          <td style="text-align:right; font-family:var(--font-mono); color:var(--text-muted);">${mainAvg} ₺</td>
          <td style="text-align:center; font-weight:700;"><span class="badge priority-orta">%${mainShare}</span></td>
          <td style="text-align:center;">
            <span style="font-size:0.75rem; color:var(--accent-primary); font-weight:700;">${isMainExpanded ? '▲ Kapat' : '▼ Detay Gör'}</span>
          </td>
        </tr>
      `;

      // If Main Group is expanded, render Sub-Groups
      if (isMainExpanded) {
        const sortedSubKeys = Object.keys(mainGroup.subGroups).sort((a,b) => mainGroup.subGroups[b].totalSpend - mainGroup.subGroups[a].totalSpend);

        sortedSubKeys.forEach((subKey, subIdx) => {
          const subGroup = mainGroup.subGroups[subKey];
          const subGroupId = `${mainGroupId}_sg_${subIdx}`;
          const isSubExpanded = this.state.expandedMatrixSubGroups.has(subGroupId);
          const subShare = mainGroup.totalSpend > 0 ? ((subGroup.totalSpend / mainGroup.totalSpend) * 100).toFixed(1) : 0;
          const subAvg = subGroup.totalCount > 0 ? (subGroup.totalSpend / subGroup.totalCount).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0;

          const isSubReg = subKey.startsWith('Madde ');
          const subBadgeHtml = isSubReg
            ? `<span class="matrix-badge-reg">📜 ${subKey}</span>`
            : `<span class="matrix-badge-supp">🏭 ${subKey}</span>`;

          // Level 2: Sub-Group Row
          html += `
            <tr class="matrix-row-subgroup" onclick="App.toggleMatrixSubGroup('${subGroupId}')">
              <td style="text-align:center; padding-left:1.5rem;">
                <button class="matrix-toggle-btn ${isSubExpanded ? 'expanded' : ''}" style="width:22px; height:22px; font-size:0.75rem;" onclick="event.stopPropagation(); App.toggleMatrixSubGroup('${subGroupId}')">▶</button>
              </td>
              <td style="padding-left:1.5rem;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span style="color:var(--text-muted); font-size:0.8rem;">↳</span>
                  ${subBadgeHtml}
                </div>
              </td>
              <td style="text-align:center; font-weight:600; color:var(--text-main);">${subGroup.totalCount} Talep</td>
              <td style="text-align:right; font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${subGroup.totalSpend.toLocaleString('tr-TR')} ₺</td>
              <td style="text-align:right; font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">${subAvg} ₺</td>
              <td style="text-align:center; font-size:0.8rem; color:var(--text-muted);">%${subShare} (grup payı)</td>
              <td style="text-align:center;">
                <button class="btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.72rem; font-weight:700;" onclick="event.stopPropagation(); App.toggleMatrixSubGroup('${subGroupId}')">
                  ${isSubExpanded ? '▲ Gizle' : `🔍 Talepleri Gör (${subGroup.totalCount})`}
                </button>
              </td>
            </tr>
          `;

          // Level 3: Nested Exact Demands Table
          if (isSubExpanded) {
            html += `
              <tr>
                <td colspan="7" style="padding:0;">
                  <div class="matrix-subtable-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                      <div style="font-weight:700; font-size:0.82rem; color:var(--text-main);">
                        📦 <strong>${mainKey}</strong> / <strong>${subKey}</strong> Sipariş Edilen Talepler Listesi (${subGroup.requests.length} Adet)
                      </div>
                      <span style="font-size:0.75rem; color:var(--text-muted);">Toplam: <strong style="color:var(--status-completed);">${subGroup.totalSpend.toLocaleString('tr-TR')} ₺</strong></span>
                    </div>

                    <table class="matrix-subtable">
                      <thead>
                        <tr>
                          <th style="width:110px;">Talep Barkod</th>
                          <th>Talep Konusu & Açıklaması</th>
                          <th>Birim</th>
                          <th style="width:105px;">Sipariş Tarihi</th>
                          <th style="width:110px;">Sipariş No</th>
                          <th style="text-align:right; width:130px;">Tutar (₺)</th>
                          <th style="width:130px;">Sorumlu</th>
                          <th style="text-align:center; width:95px;">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${subGroup.requests.map(r => `
                          <tr>
                            <td>
                              <a href="#request/${r.id}" onclick="App._handleLinkClick(event, 'request', '${r.id}')" style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary); text-decoration:none;">
                                #${r.requestBarcode || r.id}
                              </a>
                            </td>
                            <td>
                              <div style="font-weight:600; color:var(--text-main);">${r.subject || 'Konu belirtilmemiş'}</div>
                              ${r.description ? `<div style="font-size:0.75rem; color:var(--text-muted);">${r.description.substring(0, 50)}...</div>` : ''}
                            </td>
                            <td style="font-size:0.8rem;">${r.unit || '-'}</td>
                            <td style="font-size:0.8rem; color:var(--text-muted);">${r.orderDate || r.arrivalDate || '-'}</td>
                            <td style="font-family:var(--font-mono); font-size:0.8rem;">${r.orderBarcode || '-'}</td>
                            <td style="text-align:right; font-weight:700; font-family:var(--font-mono); color:var(--status-completed);">${(r.actualAmount || 0).toLocaleString('tr-TR')} ₺</td>
                            <td style="font-size:0.8rem;">${r.assignedTo || '-'}</td>
                            <td style="text-align:center;">
                              <div class="action-btns" style="justify-content:center; gap:0.25rem;">
                                <button class="btn-icon" onclick="App.viewRequestDetails('${r.id}')" title="Detayı Görüntüle">👁️</button>
                                <button class="btn-icon" onclick="App.openDocumentManager('request', '${r.id}', '#${r.requestBarcode || r.id} — ${r.subject?.replace(/'/g, "\\'")}')" title="Evraklar & Dijital Arşiv">📁</button>
                              </div>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            `;
          }
        });
      }
    });

    tbody.innerHTML = html;

    // 7. Render Table Footer Totals
    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td></td>
          <td>GENEL TOPLAM (${distinctUsedRegs.size} Madde / ${distinctUsedSupps.size} Tedarikçi)</td>
          <td style="text-align:center; font-size:1rem;">${totalOrdersCount} Sipariş</td>
          <td style="text-align:right; font-size:1.1rem; color:var(--status-completed); font-family:var(--font-mono);">${grandTotalSpend.toLocaleString('tr-TR')} ₺</td>
          <td style="text-align:right; font-family:var(--font-mono);">${totalOrdersCount > 0 ? (grandTotalSpend / totalOrdersCount).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0} ₺</td>
          <td style="text-align:center;">%100.0</td>
          <td></td>
        </tr>
      `;
    }
  },

  toggleMatrixGroup(groupId) {
    if (!this.state.expandedMatrixGroups) this.state.expandedMatrixGroups = new Set();
    if (this.state.expandedMatrixGroups.has(groupId)) {
      this.state.expandedMatrixGroups.delete(groupId);
    } else {
      this.state.expandedMatrixGroups.add(groupId);
    }
    this.renderYearlyMatrixReport();
  },

  toggleMatrixSubGroup(subGroupId) {
    if (!this.state.expandedMatrixSubGroups) this.state.expandedMatrixSubGroups = new Set();
    if (this.state.expandedMatrixSubGroups.has(subGroupId)) {
      this.state.expandedMatrixSubGroups.delete(subGroupId);
    } else {
      this.state.expandedMatrixSubGroups.add(subGroupId);
    }
    this.renderYearlyMatrixReport();
  },

  expandAllMatrixGroups() {
    if (!this.state.expandedMatrixGroups) this.state.expandedMatrixGroups = new Set();
    if (!this.state.expandedMatrixSubGroups) this.state.expandedMatrixSubGroups = new Set();

    for (let i = 0; i < 50; i++) {
      this.state.expandedMatrixGroups.add(`mg_${i}`);
      for (let j = 0; j < 50; j++) {
        this.state.expandedMatrixSubGroups.add(`mg_${i}_sg_${j}`);
      }
    }
    this.renderYearlyMatrixReport();
  },

  collapseAllMatrixGroups() {
    this.state.expandedMatrixGroups = new Set();
    this.state.expandedMatrixSubGroups = new Set();
    this.renderYearlyMatrixReport();
  },

  exportMatrixToExcel() {
    const activeRequests = this.getFilteredRequests();
    const currentRegVal = this.state.matrixRegulation || 'ALL';
    const currentSuppVal = this.state.matrixSupplier || 'ALL';
    const searchText = (this.state.matrixSearch || '').toLowerCase().trim();

    const filtered = activeRequests.filter(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      const supp = (r.supplier || '').trim();

      if (currentRegVal !== 'ALL' && reg !== currentRegVal) return false;
      if (currentSuppVal !== 'ALL' && supp !== currentSuppVal) return false;

      if (searchText) {
        const mSupp = supp.toLowerCase().includes(searchText);
        const mSubj = (r.subject || '').toLowerCase().includes(searchText);
        const mBar = (r.requestBarcode || '').toString().toLowerCase().includes(searchText);
        if (!mSupp && !mSubj && !mBar) return false;
      }
      return true;
    });

    let csv = "Mevzuat Maddesi;Tedarikçi Firma;Talep Barkodu;Talep Konusu;Birim;Sipariş No;Sipariş Tarihi;Gerçekleşen Tutar (TRY);Sorumlu Uzman\n";

    filtered.forEach(r => {
      let reg = (r.regulation || 'Belirtilmemiş').trim();
      if (reg.startsWith('Madde ')) reg = reg.replace('Madde ', '');
      const supp = (r.supplier || '').trim();
      const subject = (r.subject || '').replace(/;/g, ' ').replace(/"/g, '""');
      const unit = (r.unit || '').replace(/;/g, ' ');
      csv += `"Madde ${reg}";"${supp}";"${r.requestBarcode || r.id}";"${subject}";"${unit}";"${r.orderBarcode || ''}";"${r.orderDate || ''}";"${r.actualAmount || 0}";"${r.assignedTo || ''}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Ihale_Maddesi_Tedarikci_Matrisi_${this.state.selectedYear}.csv`;
    link.click();
    this.showToast("İhale Maddesi x Tedarikçi Raporu Excel formatında indirildi!", "success", "📥");
  },

  openPersonnelSavingsDetailView(userName, acadMonthIdx = 'ALL') {
    if (!userName) {
      const firstActive = (this.state.users || []).find(u => u.isActive !== false);
      if (firstActive) userName = firstActive.name;
    }
    this.state.currentSavingsUser = userName;

    const monthSelect = document.getElementById('ps-filter-month');
    if (monthSelect) monthSelect.value = acadMonthIdx.toString();

    const requests = this.getFilteredRequests().filter(r => r.assignedTo === userName);
    const userUnits = new Set();
    requests.forEach(r => { if (r.unit) userUnits.add(r.unit); });

    const unitSelect = document.getElementById('ps-filter-unit');
    if (unitSelect) {
      unitSelect.innerHTML = '<option value="ALL">Tüm Birimler</option>' +
        Array.from(userUnits).sort().map(u => `<option value="${u}">${u}</option>`).join('');
    }

    const searchInput = document.getElementById('ps-filter-search');
    if (searchInput) searchInput.value = '';

    this.switchView('personnel-savings-detail');
    this.renderPersonnelSavingsDetail();
  },

  renderPersonnelSavingsDetail() {
    const userName = this.state.currentSavingsUser;
    if (!userName) return;

    const userObj = (this.state.users || []).find(u => u.name === userName);
    const userTitle = userObj?.title || 'Satınalma Uzmanı';

    const headerName = document.getElementById('personnel-savings-header-name');
    const headerTitle = document.getElementById('personnel-savings-header-title');
    if (headerName) headerName.innerHTML = `👤 <strong>${userName}</strong> — Tasarruf ve KPI Detay Raporu`;
    if (headerTitle) headerTitle.innerText = `${userTitle} | ${this.state.selectedYear === 'ALL' ? 'Tüm Yıllar' : this.state.selectedYear + ' Dönemi'}`;

    const requests = this.getFilteredRequests().filter(r => r.assignedTo === userName);

    const months = ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos'];
    const monthlyData = Array.from({ length: 12 }, () => ({
      completedCount: 0,
      initialTotal: 0,
      actualTotal: 0,
      savings: 0,
      savingsCount: 0,
      negotiatedRequests: []
    }));

    const unitSavingsMap = {};
    let grandSavings = 0;
    let grandInitial = 0;
    let totalNegotiatedCount = 0;

    requests.forEach(r => {
      const initAmt = parseFloat(r.budgetAmount || r.estimatedAmount) || 0;
      const actAmt = parseFloat(r.actualAmount) || 0;

      const dtStr = r.orderDate || r.arrivalDate || r.requestDate;
      let acadIdx = -1;
      if (dtStr) {
        const d = new Date(dtStr);
        if (!isNaN(d.getTime())) {
          const monthIdx = d.getMonth();
          acadIdx = monthIdx >= 8 ? (monthIdx - 8) : (monthIdx + 4);
        }
      }

      if (r.status === 'Tamamlandı' && acadIdx >= 0 && acadIdx < 12) {
        monthlyData[acadIdx].completedCount++;
      }

      if (initAmt > 0 && actAmt > 0 && initAmt > actAmt) {
        const diff = initAmt - actAmt;
        grandSavings += diff;
        grandInitial += initAmt;
        totalNegotiatedCount++;

        const rate = ((diff / initAmt) * 100).toFixed(1);
        const reqObj = { ...r, initAmt, actAmt, diff, rate, acadIdx };

        if (acadIdx >= 0 && acadIdx < 12) {
          const m = monthlyData[acadIdx];
          m.savings += diff;
          m.savingsCount++;
          m.initialTotal += initAmt;
          m.actualTotal += actAmt;
          m.negotiatedRequests.push(reqObj);
        }

        const u = r.unit || 'Belirtilmemiş';
        unitSavingsMap[u] = (unitSavingsMap[u] || 0) + diff;
      }
    });

    const overallRatePct = grandInitial > 0 ? ((grandSavings / grandInitial) * 100).toFixed(1) : '0.0';
    const avgSavingsPerJob = totalNegotiatedCount > 0 ? Math.round(grandSavings / totalNegotiatedCount) : 0;

    let topMonthName = '-';
    let maxMonthSavings = 0;
    monthlyData.forEach((m, idx) => {
      if (m.savings > maxMonthSavings) {
        maxMonthSavings = m.savings;
        topMonthName = `${months[idx]} (${m.savings.toLocaleString('tr-TR')} ₺)`;
      }
    });

    const elSavings = document.getElementById('ps-kpi-total-savings');
    const elRate = document.getElementById('ps-kpi-savings-rate');
    const elCount = document.getElementById('ps-kpi-negotiated-count');
    const elAvg = document.getElementById('ps-kpi-avg-savings');
    const elSubTop = document.getElementById('ps-kpi-top-month-sub');

    if (elSavings) elSavings.innerText = `${grandSavings.toLocaleString('tr-TR')} ₺`;
    if (elRate) elRate.innerText = `%${overallRatePct}`;
    if (elCount) elCount.innerText = `${totalNegotiatedCount} Adet`;
    if (elAvg) elAvg.innerText = `${avgSavingsPerJob.toLocaleString('tr-TR')} ₺`;
    if (elSubTop) elSubTop.innerText = `En Verimli Ay: ${topMonthName}`;

    // 1. Chart: Monthly Trend Combo Line/Bar Chart
    this.createOrUpdateChart('chart-ps-monthly-trend', 'bar', {
      labels: months,
      datasets: [
        {
          type: 'bar',
          label: 'Pazarlık Tasarrufu (TRY)',
          data: monthlyData.map(d => d.savings),
          backgroundColor: 'rgba(34, 197, 94, 0.75)',
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Gerçekleşen Harcama (TRY)',
          data: monthlyData.map(d => d.actualTotal),
          borderColor: '#3b82f6',
          borderWidth: 3,
          tension: 0.3,
          yAxisID: 'y'
        }
      ]
    }, { responsive: true, maintainAspectRatio: false });

    // 2. Chart: Unit Savings Doughnut Chart
    const sortedUnits = Object.entries(unitSavingsMap).sort((a,b) => b[1] - a[1]).slice(0, 6);
    const unitLabels = sortedUnits.map(u => u[0].length > 16 ? u[0].substring(0, 16) + '...' : u[0]);
    const unitData = sortedUnits.map(u => u[1]);
    const unitColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

    this.createOrUpdateChart('chart-ps-unit-pie', 'doughnut', {
      labels: unitLabels.length > 0 ? unitLabels : ['Tasarruf Yok'],
      datasets: [{
        data: unitData.length > 0 ? unitData : [1],
        backgroundColor: unitColors.slice(0, Math.max(1, unitLabels.length))
      }]
    }, { responsive: true, maintainAspectRatio: false });

    // 3. Render 12-Month KPI Summary Table
    const tbodyKpi = document.querySelector('#table-ps-monthly-kpi tbody');
    if (tbodyKpi) {
      const selectedMonthVal = document.getElementById('ps-filter-month')?.value || 'ALL';

      tbodyKpi.innerHTML = months.map((mName, mIdx) => {
        const m = monthlyData[mIdx];
        const mRatePct = m.initialTotal > 0 ? ((m.savings / m.initialTotal) * 100).toFixed(1) : '0.0';
        const isFiltered = selectedMonthVal === mIdx.toString();

        return `
          <tr style="cursor: pointer; ${isFiltered ? 'background: rgba(59, 130, 246, 0.18); border-left: 4px solid var(--accent-primary);' : (m.savings > 0 ? 'background: rgba(34, 197, 94, 0.04);' : '')}"
              onclick="App.setPersonnelSavingsMonthFilter(${mIdx})" title="Bu ayın işlerini listelemek için tıklayın">
            <td><strong style="color:var(--text-main);">${mName}</strong></td>
            <td><span class="badge" style="background:var(--bg-card);">${m.completedCount} Biten</span></td>
            <td><span class="badge status-open">${m.savingsCount} Pazarlıklı İş</span></td>
            <td style="font-family:var(--font-mono); font-size:0.85rem;">${m.initialTotal > 0 ? m.initialTotal.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
            <td style="font-family:var(--font-mono); font-size:0.85rem;">${m.actualTotal > 0 ? m.actualTotal.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:${m.savings > 0 ? 'var(--status-completed)' : 'var(--text-muted)'}; font-size:0.92rem;">
              ${m.savings > 0 ? '+' + m.savings.toLocaleString('tr-TR') + ' ₺' : '0 ₺'}
            </td>
            <td>
              <span class="badge" style="background:${m.savings > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-card)'}; color:${m.savings > 0 ? 'var(--status-completed)' : 'var(--text-muted)'}; font-weight:700;">
                %${mRatePct}
              </span>
            </td>
            <td>
              <button class="btn-secondary" style="padding:0.2rem 0.55rem; font-size:0.75rem;" onclick="event.stopPropagation(); App.setPersonnelSavingsMonthFilter(${mIdx})">
                🔍 ${m.savingsCount} İş Süz
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 4. Render Filtered Detailed Negotiated Requests Table
    const selectedMonth = document.getElementById('ps-filter-month')?.value || 'ALL';
    const selectedUnit = document.getElementById('ps-filter-unit')?.value || 'ALL';
    const searchText = document.getElementById('ps-filter-search')?.value.toLowerCase().trim() || '';

    let allNegotiatedJobs = [];
    monthlyData.forEach(m => {
      allNegotiatedJobs = allNegotiatedJobs.concat(m.negotiatedRequests);
    });

    let filteredJobs = allNegotiatedJobs.filter(r => {
      if (selectedMonth !== 'ALL' && r.acadIdx.toString() !== selectedMonth) return false;
      if (selectedUnit !== 'ALL' && r.unit !== selectedUnit) return false;
      if (searchText) {
        const bc = (r.requestBarcode || r.orderBarcode || r.id || '').toString().toLowerCase();
        const subj = (r.subject || '').toLowerCase();
        const unit = (r.unit || '').toLowerCase();
        if (!bc.includes(searchText) && !subj.includes(searchText) && !unit.includes(searchText)) return false;
      }
      return true;
    });

    const countBadge = document.getElementById('ps-jobs-count-badge');
    const jobsTitle = document.getElementById('ps-jobs-table-title');
    if (countBadge) countBadge.innerText = `${filteredJobs.length} Kayıt`;
    if (jobsTitle) {
      const monthLabel = selectedMonth !== 'ALL' ? months[parseInt(selectedMonth)] + ' Ayı' : 'Tüm Yıl';
      jobsTitle.innerHTML = `📋 Pazarlıklı İşler Listesi (${monthLabel} - ${filteredJobs.length} Adet İş)`;
    }

    const tbodyJobs = document.querySelector('#table-ps-jobs-list tbody');
    if (tbodyJobs) {
      if (filteredJobs.length === 0) {
        tbodyJobs.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun pazarlıklı iş kaydı bulunamadı.</td></tr>`;
      } else {
        tbodyJobs.innerHTML = filteredJobs.map(r => `
          <tr>
            <td style="font-weight:700; font-family:var(--font-mono); color:var(--accent-primary);">#${r.requestBarcode || r.id}</td>
            <td style="font-weight:600;">${r.subject}</td>
            <td style="font-size:0.82rem; color:var(--text-muted);">${r.unit || '-'}</td>
            <td style="font-size:0.82rem; color:var(--text-muted);">${r.orderDate || r.arrivalDate || r.requestDate || '-'}</td>
            <td style="font-family:var(--font-mono);">${r.initAmt.toLocaleString('tr-TR')} ₺</td>
            <td style="font-family:var(--font-mono); font-weight:600;">${r.actAmt.toLocaleString('tr-TR')} ₺</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--status-completed);">+${r.diff.toLocaleString('tr-TR')} ₺</td>
            <td><span class="badge status-completed">%${r.rate}</span></td>
          </tr>
        `).join('');
      }
    }
  },

  setPersonnelSavingsMonthFilter(mIdx) {
    const monthSelect = document.getElementById('ps-filter-month');
    if (monthSelect) {
      monthSelect.value = mIdx.toString();
      this.renderPersonnelSavingsDetail();
    }
  },

  // 8. SETTINGS RENDERER
  renderSettings() {
    const tbody = document.querySelector('#table-users-settings tbody');
    if (tbody) {
      tbody.innerHTML = this.state.users.map(u => {
        const isActive = u.isActive !== false;
        return `
          <tr>
            <td style="font-weight:700;">${u.name}</td>
            <td>${u.title}</td>
            <td><span class="badge priority-${u.role === 'ADMIN' ? 'kritik' : 'orta'}">${u.role}</span></td>
            <td><span class="badge status-${isActive ? 'active' : 'passive'}">${isActive ? '🟢 Aktif' : '🔴 Pasif (Ayrıldı)'}</span></td>
            <td>
              <div class="action-btns">
                <button class="btn-icon" onclick="App.openUserModal(${u.id})" title="Düzenle / Şifre Değiştir">✏️</button>
                <button class="btn-icon" onclick="App.toggleUserStatus(${u.id})" title="${isActive ? 'Pasif Yap' : 'Aktif Yap'}">
                  ${isActive ? '🔴' : '🟢'}
                </button>
                <button class="btn-icon" onclick="App.deleteUser(${u.id})" title="Sil">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    this.syncRatesInputUI();
    this.renderUnitsSettings();
    this.renderRegulationsSettings();
    this.renderBackupsTableSettings();
    this.fetchSmtpSettings();
  },

  syncRatesInputUI() {
    const usdInput = document.getElementById('setting-rate-usd');
    const eurInput = document.getElementById('setting-rate-eur');
    const dateLabel = document.getElementById('rate-last-updated');
    const topbarUsd = document.getElementById('topbar-rate-usd');
    const topbarEur = document.getElementById('topbar-rate-eur');

    if (usdInput && this.state.rates && this.state.rates.USD) usdInput.value = this.state.rates.USD;
    if (eurInput && this.state.rates && this.state.rates.EUR) eurInput.value = this.state.rates.EUR;
    if (topbarUsd && this.state.rates && this.state.rates.USD) {
      topbarUsd.innerText = Number(this.state.rates.USD).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (topbarEur && this.state.rates && this.state.rates.EUR) {
      topbarEur.innerText = Number(this.state.rates.EUR).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (dateLabel) {
      dateLabel.innerText = this.state.rates && this.state.rates.lastUpdated
        ? `Son Güncelleme: ${this.state.rates.lastUpdated}`
        : 'Son Güncelleme: -';
    }
  },

  // ----------------------------------------------------
  // 📧 SMTP SETTINGS & EMAIL CLIENT ENGINE
  // ----------------------------------------------------
  async fetchSmtpSettings() {
    try {
      const res = await this.authFetch('/api/settings/smtp');
      if (res.ok) {
        const cfg = await res.json();
        this.state.smtpConfig = cfg;
        const hostEl = document.getElementById('smtp-host');
        const portEl = document.getElementById('smtp-port');
        const userEl = document.getElementById('smtp-user');
        const passEl = document.getElementById('smtp-pass');
        const fromEmailEl = document.getElementById('smtp-from-email');
        const appUrlEl = document.getElementById('smtp-app-url');
        const enabledEl = document.getElementById('smtp-is-enabled');
        const secureEl = document.getElementById('smtp-secure');
        const badgeEl = document.getElementById('smtp-status-badge');

        if (hostEl) hostEl.value = cfg.host || '';
        if (portEl) portEl.value = cfg.port || 587;
        if (userEl) userEl.value = cfg.user || '';
        if (passEl) passEl.value = cfg.pass || '';
        if (fromNameEl) fromNameEl.value = cfg.fromName || 'Piri Reis Üni. Satınalma';
        if (fromEmailEl) fromEmailEl.value = cfg.from || '';
        if (appUrlEl) appUrlEl.value = cfg.appUrl || window.location.origin;
        if (enabledEl) enabledEl.checked = !!cfg.isEnabled;
        if (secureEl) secureEl.checked = !!cfg.secure;

        if (badgeEl) {
          if (cfg.isEnabled && cfg.host) {
            badgeEl.className = 'badge status-completed';
            badgeEl.innerText = '🟢 Aktif';
          } else {
            badgeEl.className = 'badge status-open';
            badgeEl.innerText = 'Pasif';
          }
        }
      }
    } catch (e) {
      console.error('SMTP fetch error:', e);
    }
  },

  async saveSmtpSettings(e) {
    if (e) e.preventDefault();
    const cfg = {
      host: document.getElementById('smtp-host')?.value.trim() || '',
      port: parseInt(document.getElementById('smtp-port')?.value, 10) || 587,
      user: document.getElementById('smtp-user')?.value.trim() || '',
      pass: document.getElementById('smtp-pass')?.value || '',
      fromName: document.getElementById('smtp-from-name')?.value.trim() || 'Piri Reis Üni. Satınalma',
      from: document.getElementById('smtp-from-email')?.value.trim() || '',
      appUrl: document.getElementById('smtp-app-url')?.value.trim() || window.location.origin,
      isEnabled: document.getElementById('smtp-is-enabled')?.checked || false,
      secure: document.getElementById('smtp-secure')?.checked || false
    };

    try {
      const res = await this.authFetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        this.showToast('SMTP e-posta ayarları başarıyla kaydedildi!', 'success', '📧');
        this.logAction('SMTP Ayarları Güncellendi', `Host: ${cfg.host}, Kullanıcı: ${cfg.user}, Durum: ${cfg.isEnabled ? 'Aktif' : 'Pasif'}`);
        await this.fetchSmtpSettings();
      } else {
        this.showToast('SMTP ayarları kaydedilemedi.', 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Sunucu hatası oluştu.', 'error');
    }
  },

  async testSmtpConnection() {
    const host = document.getElementById('smtp-host')?.value.trim() || '';
    const port = parseInt(document.getElementById('smtp-port')?.value, 10) || 587;
    const user = document.getElementById('smtp-user')?.value.trim() || '';
    const pass = document.getElementById('smtp-pass')?.value || '';
    const fromName = document.getElementById('smtp-from-name')?.value.trim() || 'Piri Reis Üni. Satınalma';
    const from = document.getElementById('smtp-from-email')?.value.trim() || '';
    const secure = document.getElementById('smtp-secure')?.checked || false;

    if (!host || !user) {
      this.showToast('Lütfen önce SMTP Sunucu ve Kullanıcı Adı bilgilerini giriniz.', 'warning');
      return;
    }

    const testTarget = prompt('Test e-postasının gönderileceği alıcı e-posta adresini giriniz:', this.state.currentUser?.email || user || '');
    if (!testTarget) return;

    this.showToast(`"${testTarget}" adresine test e-postası gönderiliyor...`, 'info', '✉️');
    try {
      const res = await this.authFetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host, port, user, pass, secure, from, fromName,
          testEmail: testTarget
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`🎉 Test e-postası başarıyla ulaştı: ${testTarget}`, 'success', '✅');
      } else {
        this.showToast(`SMTP Hatası: ${data.error}`, 'error', '❌');
      }
    } catch (err) {
      console.error(err);
      this.showToast('E-posta test isteği başarısız oldu: ' + err.message, 'error');
    }
  },

  // ----------------------------------------------------
  // 🗄️ BACKUP & RESTORE CLIENT MANAGEMENT
  // ----------------------------------------------------
  async renderBackupsTableSettings() {
    await this.fetchBackups();
  },

  async fetchBackups() {
    const tbody = document.getElementById('tbody-backups-list');
    if (!tbody) return;
    try {
      const res = await this.authFetch('/api/backups');
      if (res.ok) {
        const backups = await res.json();
        if (!Array.isArray(backups) || backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1rem;">Henüz kayıtlı veritabanı yedeği bulunmuyor.</td></tr>';
          return;
        }
        tbody.innerHTML = backups.map(b => {
          const typeBadge = b.isAuto 
            ? '<span class="badge status-open" style="font-size:0.75rem;">🤖 Otomatik (00:00)</span>' 
            : '<span class="badge priority-orta" style="font-size:0.75rem;">👤 Manuel</span>';
          const safeFile = b.filename.replace(/'/g, "\\'");
          return `
            <tr>
              <td style="font-weight:600; font-family:var(--font-mono); font-size:0.8rem;">💾 ${b.filename}</td>
              <td style="font-size:0.82rem;">${b.createdAt || '-'}</td>
              <td><span class="badge" style="background:var(--bg-card); font-size:0.78rem;">${b.size}</span></td>
              <td>${typeBadge}</td>
              <td style="text-align:center; white-space:nowrap;">
                <div class="action-btns" style="justify-content:center; gap:0.25rem;">
                  <a href="/api/backups/download?filename=${encodeURIComponent(b.filename)}" class="btn-icon" title="Yedeği İndir (.json)" download style="text-decoration:none;">📥</a>
                  <button class="btn-icon" onclick="App.restoreBackup('${safeFile}')" title="Bu Yedeğe Geri Yükle" style="color:var(--status-completed);">🔄</button>
                  <button class="btn-icon" onclick="App.deleteBackup('${safeFile}')" title="Yedeği Sil" style="color:var(--status-rejected);">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--status-rejected);">Yedek listesi alınamadı.</td></tr>';
    }
  },

  async triggerManualBackup() {
    try {
      this.showToast("Veritabanı yedeği alınıyor...", "info", "💾");
      const res = await this.authFetch('/api/backups/create', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.showToast(`Veritabanı yedeği oluşturuldu (${data.backup?.filename || 'Yedek Alındı'})`, "success", "✅");
        this.logAction('Manuel Veri Yedeği Alındı', `Yedek Dosyası: ${data.backup?.filename}`);
        await this.fetchBackups();
      } else {
        this.showToast("Yedekleme başarısız oldu.", "error");
      }
    } catch (err) {
      console.error("Backup error:", err);
      this.showToast("Yedek alınırken hata oluştu.", "error");
    }
  },

  async restoreBackup(filename) {
    this.showConfirm(
      "Veritabanı Geri Yükleme",
      `DİKKAT: Veritabanı "${filename}" anlık görüntüsüne geri yüklenecektir. Mevcut talepler, faturalar ve sözleşmeler yedekteki verilerle değiştirilecektir. Devam etmek istiyor musunuz?`,
      async () => {
        try {
          this.showToast(`Veritabanı "${filename}" yedeğinden geri yükleniyor...`, 'info', '🔄');
          const res = await this.authFetch('/api/backups/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
          });
          const data = await res.json();
          if (data.success) {
            this.showToast(data.message || 'Veritabanı başarıyla geri yüklendi!', 'success', '🎉');
            this.logAction('Veritabanı Geri Yüklendi', `Yedek Dosyası: ${filename}`);
            await this.fetchInitialData();
            this.render();
          } else {
            this.showToast(data.error || 'Geri yükleme başarısız oldu.', 'error');
          }
        } catch (e) {
          console.error(e);
          this.showToast('Geri yükleme işlemi sırasında hata oluştu.', 'error');
        }
      },
      '⚠️'
    );
  },

  async deleteBackup(filename) {
    this.showConfirm(
      "Yedek Dosyasını Sil",
      `"${filename}" yedek dosyasını sunucu diskinden kalıcı olarak silmek istediğinizden emin misiniz?`,
      async () => {
        try {
          const res = await this.authFetch(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
          if (res.ok) {
            this.showToast(`"${filename}" yedek dosyası silindi.`, 'warning', '🗑️');
            await this.fetchBackups();
          } else {
            this.showToast('Yedek silinemedi.', 'error');
          }
        } catch (e) {
          console.error(e);
          this.showToast('Yedek silinirken hata oluştu.', 'error');
        }
      },
      '🗑️'
    );
  },

  // ----------------------------------------------------
  // 📥 EXCEL IMPORT MODAL & DRAG-DROP CLIENT ENGINE
  // ----------------------------------------------------
  openExcelImportModal() {
    this.state.parsedExcelData = [];
    const previewWrapper = document.getElementById('excel-preview-wrapper');
    const confirmBtn = document.getElementById('btn-confirm-excel-import');
    const statusEl = document.getElementById('excel-import-status');
    const fileInput = document.getElementById('input-modal-excel-file');

    if (previewWrapper) previewWrapper.style.display = 'none';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span>🚀</span> Verileri Sisteme Aktar';
    }
    if (statusEl) statusEl.innerText = '';
    if (fileInput) fileInput.value = '';

    this.setupExcelDragDrop();
    this.openModal('modal-excel-import');
  },

  setupExcelDragDrop() {
    const dropZone = document.getElementById('excel-drop-zone');
    const fileInput = document.getElementById('input-modal-excel-file');
    const browseBtn = document.getElementById('btn-browse-excel-file');
    if (!dropZone) return;

    if (browseBtn) {
      browseBtn.onclick = (e) => {
        e.stopPropagation();
        fileInput?.click();
      };
    }

    dropZone.onclick = (e) => {
      if (e.target !== browseBtn && !browseBtn?.contains(e.target)) {
        fileInput?.click();
      }
    };

    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    };
    dropZone.ondragleave = () => {
      dropZone.classList.remove('drag-over');
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files && files[0]) {
        this.parseModalExcelFile(files[0]);
      }
    };

    if (fileInput) {
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          this.parseModalExcelFile(e.target.files[0]);
        }
      };
    }
  },

  parseModalExcelFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      this.showToast("Excel okuma kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(sheet);

        if (!jsonRows || jsonRows.length === 0) {
          this.showToast("Excel dosyasında okunabilir veri satırı bulunamadı.", "warning");
          return;
        }

        const requestsToImport = jsonRows.map((r, i) => {
          return {
            requestBarcode: r['Barkod No'] || r['Barkod'] || r['Talep Barkod'] || r['Barkod No.'] || Math.floor(100000000 + Math.random() * 900000000),
            subject: r['Talep Konusu'] || r['Konu'] || r['Açıklama'] || `İçe Aktarılan Talep #${i + 1}`,
            unit: r['Birim'] || r['Birim Adı'] || 'Genel Sekreterlik',
            arrivalDate: r['Geliş Tarihi'] || r['Tarih'] || new Date().toISOString().split('T')[0],
            assignedTo: r['Atanan Personel'] || r['Personel'] || r['Sorumlu'] || 'Henüz Atanmadı',
            priority: r['Öncelik'] || 'Orta',
            status: r['Durum'] || 'Açık',
            estimatedAmount: parseFloat(r['Tahmini Bütçe (TL)'] || r['Tahmini Bütçe'] || r['Bütçe'] || 0),
            actualAmount: parseFloat(r['Gerçekleşen Tutar (TL)'] || r['Gerçekleşen Tutar'] || r['Tutar'] || 0),
            currency: r['Para Birimi'] || 'TRY',
            supplier: r['Tedarikçi'] || r['Firma'] || '',
            orderBarcode: r['Sipariş No'] || r['Sipariş Barkod'] || '',
            orderDate: r['Sipariş Tarihi'] || '',
            regulation: r['Yönetmelik Maddesi'] || r['Madde'] || '',
            description: r['Detay / Açıklama'] || r['Notlar'] || ''
          };
        });

        this.state.parsedExcelData = requestsToImport;

        // Render preview table
        const previewWrapper = document.getElementById('excel-preview-wrapper');
        const previewTbody = document.getElementById('tbody-excel-preview');
        const statsEl = document.getElementById('excel-file-stats');
        const badgeEl = document.getElementById('excel-record-count-badge');
        const confirmBtn = document.getElementById('btn-confirm-excel-import');

        if (previewWrapper) previewWrapper.style.display = 'block';
        if (statsEl) statsEl.innerText = `Dosya: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — Toplam ${requestsToImport.length} satır ayrıştırıldı.`;
        if (badgeEl) badgeEl.innerText = `${requestsToImport.length} Kayıt Hazır`;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `<span>🚀</span> ${requestsToImport.length} Adet Talebi İçe Aktar`;
        }

        const previewRows = requestsToImport.slice(0, 10);
        if (previewTbody) {
          previewTbody.innerHTML = previewRows.map((r, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">#${r.requestBarcode}</td>
              <td style="font-weight:600;">${r.subject}</td>
              <td>${r.unit}</td>
              <td>${r.assignedTo}</td>
              <td style="font-family:var(--font-mono);">${r.estimatedAmount ? r.estimatedAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
              <td>${r.supplier || '-'}</td>
              <td><span class="badge status-${r.status === 'Tamamlandı' ? 'completed' : 'open'}">${r.status}</span></td>
            </tr>
          `).join('');
        }

        this.showToast(`${requestsToImport.length} adet satır Excel'den ayrıştırıldı ve önizlendi.`, 'info', '📊');
      } catch (err) {
        console.error("Excel parse error:", err);
        this.showToast("Excel dosyası okunurken hata oluştu: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async confirmExcelImport() {
    const items = this.state.parsedExcelData;
    if (!items || items.length === 0) {
      this.showToast("İçe aktarılacak veri bulunamadı.", "warning");
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-excel-import');
    const statusEl = document.getElementById('excel-import-status');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span>⌛</span> Veritabanına Yazılıyor...';
    }
    if (statusEl) statusEl.innerText = 'Veriler veritabanına aktarılıyor, lütfen bekleyiniz...';

    try {
      const res = await this.authFetch('/api/demands/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`🎉 ${data.count} adet talep veritabanına başarıyla yüklendi!`, 'success', '✅');
        this.logAction('Toplu Excel İçe Aktarma', `${data.count} adet talep yüklendi.`);
        this.closeModal('modal-excel-import');
        await this.fetchInitialData();
        this.render();
      } else {
        this.showToast(`İçe aktarma hatası: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast("Toplu yükleme sırasında hata oluştu.", "error");
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<span>🚀</span> Verileri Sisteme Aktar';
      }
    }
  },

  // ----------------------------------------------------
  // ⭐ VENDOR RATING CLIENT ENGINE (MAL & HİZMET AYRIMLI)
  // ----------------------------------------------------
  normalizeRating(r) {
    if (!r) return null;
    return {
      id: r.id,
      supplierName: String(r.supplierName || r.suppliername || r.supplier || r.supplier_name || '').trim(),
      purchaseType: String(r.purchaseType || r.purchasetype || r.purchase_type || 'MAL').toUpperCase(),
      requestId: r.requestId || r.requestid || r.request_id || null,
      qualityScore: parseFloat(r.qualityScore || r.qualityscore || r.quality_score || 5),
      speedScore: parseFloat(r.speedScore || r.speedscore || r.speed_score || 5),
      complianceScore: parseFloat(r.complianceScore || r.compliancescore || r.compliance_score || 5),
      communicationScore: parseFloat(r.communicationScore || r.communicationscore || r.communication_score || r.assemblyScore || 5),
      overallScore: parseFloat(r.overallScore || r.overallscore || r.overall_score || 5),
      reviewNotes: r.reviewNotes || r.reviewnotes || r.review_notes || r.notes || '',
      ratedBy: r.ratedBy || r.ratedby || r.rated_by || 'Yetkili',
      ratedAt: r.ratedAt || r.ratedat || r.rated_at || ''
    };
  },

  getVendorScore(supplierName) {
    if (!supplierName) return null;
    const clean = supplierName.trim().toLocaleLowerCase('tr-TR');
    const cleanStd = supplierName.trim().toLowerCase();
    const ratings = (this.state.vendorRatings || []).map(r => this.normalizeRating(r)).filter(r => {
      if (!r || !r.supplierName) return false;
      const s = r.supplierName.trim();
      return s.toLocaleLowerCase('tr-TR') === clean || s.toLowerCase() === cleanStd;
    });
    if (ratings.length === 0) return null;

    const goodsRatings = ratings.filter(r => (r.purchaseType || 'MAL') === 'MAL');
    const serviceRatings = ratings.filter(r => r.purchaseType === 'HIZMET');

    const avgOverall = (ratings.reduce((sum, r) => sum + (parseFloat(r.overallScore) || 0), 0) / ratings.length).toFixed(1);
    const avgGoods = goodsRatings.length > 0
      ? (goodsRatings.reduce((sum, r) => sum + (parseFloat(r.overallScore) || 0), 0) / goodsRatings.length).toFixed(1)
      : null;
    const avgService = serviceRatings.length > 0
      ? (serviceRatings.reduce((sum, r) => sum + (parseFloat(r.overallScore) || 0), 0) / serviceRatings.length).toFixed(1)
      : null;

    const avgQuality = (ratings.reduce((sum, r) => sum + (parseFloat(r.qualityScore) || 5), 0) / ratings.length).toFixed(1);
    const avgSpeed = (ratings.reduce((sum, r) => sum + (parseFloat(r.speedScore) || 5), 0) / ratings.length).toFixed(1);
    const avgAssembly = (ratings.reduce((sum, r) => sum + (parseFloat(r.communicationScore) || 5), 0) / ratings.length).toFixed(1);
    const avgCompliance = (ratings.reduce((sum, r) => sum + (parseFloat(r.complianceScore) || 5), 0) / ratings.length).toFixed(1);
    const avgCommunication = (ratings.reduce((sum, r) => sum + (parseFloat(r.communicationScore) || 5), 0) / ratings.length).toFixed(1);

    return {
      count: ratings.length,
      overall: avgOverall,
      goodsCount: goodsRatings.length,
      goodsAvg: avgGoods,
      serviceCount: serviceRatings.length,
      serviceAvg: avgService,
      quality: avgQuality,
      speed: avgSpeed,
      assembly: avgAssembly,
      compliance: avgCompliance,
      communication: avgCommunication,
      reviews: ratings
    };
  },

  getVendorTier(score, ratingCount) {
    if (!ratingCount || ratingCount === 0 || !score) {
      return {
        key: 'UNRATED',
        label: '⚪ Puanlanmadı',
        badgeClass: 'tier-silver',
        icon: '⚪',
        desc: 'Bu firma için henüz tamamlanmış bir değerlendirme bulunmuyor.'
      };
    }
    const val = parseFloat(score);
    if (val < 2.5) {
      return {
        key: 'BLACKLIST',
        label: '🚫 Kara Liste',
        badgeClass: 'tier-blacklist',
        icon: '🚫',
        desc: 'Kritik teslimat veya kalite ihlalleri nedeniyle askıya alınmış riskli tedarikçi.'
      };
    }
    if (val < 3.5) {
      return {
        key: 'RISK',
        label: '⚠️ Gözetim / Riskli',
        badgeClass: 'tier-risk',
        icon: '⚠️',
        desc: 'Teslimat veya evrak süreçlerinde aksamalar yaşanan tedarikçi.'
      };
    }
    if (val < 4.5) {
      return {
        key: 'SILVER',
        label: '🥈 Standart Tedarikçi',
        badgeClass: 'tier-silver',
        icon: '🥈',
        desc: 'Süreçleri genel olarak standartlara uygun devam eden onaylı firma.'
      };
    }
    return {
      key: 'GOLD',
      label: '🌟 Stratejik Tedarikçi (Gold)',
      badgeClass: 'tier-gold',
      icon: '🌟',
      desc: 'Mükemmel kalite, hız ve yüksek birim memnuniyetine sahip öncelikli tedarikçi.'
    };
  },

  openVendorProfile(vendorName) {
    if (!vendorName) return;
    this.state.currentVendorProfile = vendorName;
    this.switchView('vendor-profile');
    this.renderVendorProfile();
  },

  renderVendorProfile() {
    const vendorName = this.state.currentVendorProfile;
    if (!vendorName) return;

    const safeClean = vendorName.trim().toLocaleLowerCase('tr-TR');
    const safeCleanStd = vendorName.trim().toLowerCase();
    const vendorRequests = (this.state.requests || []).filter(r => r.supplier && (r.supplier.trim().toLocaleLowerCase('tr-TR') === safeClean || r.supplier.trim().toLowerCase() === safeCleanStd));
    const vendorContracts = (this.state.contracts || []).filter(c => c.supplier && (c.supplier.trim().toLocaleLowerCase('tr-TR') === safeClean || c.supplier.trim().toLowerCase() === safeCleanStd));
    const vendorGuarantees = (this.state.guarantees || []).filter(g => g.supplier && (g.supplier.trim().toLocaleLowerCase('tr-TR') === safeClean || g.supplier.trim().toLowerCase() === safeCleanStd));

    const totalSpend = vendorRequests.reduce((sum, r) => sum + (parseFloat(r.actualAmount) || 0), 0);
    const totalRequestsCount = vendorRequests.length;
    const completedRequests = vendorRequests.filter(r => r.status === 'Tamamlandı');
    const completedCount = completedRequests.length;

    // Average Delivery Days
    let totalWaitDays = 0;
    let daysCount = 0;
    vendorRequests.forEach(r => {
      const dOrder = r.orderDate || r.requestDate;
      const dArrival = r.arrivalDate;
      if (dOrder && dArrival) {
        const dt1 = new Date(dOrder);
        const dt2 = new Date(dArrival);
        const diff = Math.ceil(Math.abs(dt2 - dt1) / (1000 * 60 * 60 * 24));
        if (!isNaN(diff) && diff < 180) {
          totalWaitDays += diff;
          daysCount++;
        }
      }
    });
    const avgDays = daysCount > 0 ? Math.round(totalWaitDays / daysCount) : 0;

    // Total Spend across all suppliers for budget share
    const allSpend = (this.state.requests || []).reduce((sum, r) => sum + (parseFloat(r.actualAmount) || 0), 0);
    const budgetSharePct = allSpend > 0 ? ((totalSpend / allSpend) * 100).toFixed(1) : 0;

    // Score & Tier
    const scoreData = this.getVendorScore(vendorName);
    const tier = this.getVendorTier(scoreData?.overall, scoreData?.count);

    // Update Header
    const nameEl = document.getElementById('vp-header-name');
    const badgeEl = document.getElementById('vp-tier-badge');
    const subEl = document.getElementById('vp-header-sub');
    if (nameEl) nameEl.innerText = `🏢 ${vendorName}`;
    if (badgeEl) {
      badgeEl.className = `tier-badge ${tier.badgeClass}`;
      badgeEl.innerText = tier.label;
    }
    if (subEl) subEl.innerText = tier.desc;

    // Update KPI Cards
    const kpiScore = document.getElementById('vp-kpi-score');
    const kpiScoreSub = document.getElementById('vp-kpi-score-sub');
    if (kpiScore) kpiScore.innerText = scoreData ? `${scoreData.overall} ★` : '5.0 ★';
    if (kpiScoreSub) kpiScoreSub.innerText = scoreData ? `${scoreData.count} Değerlendirme [📦 Mal: ${scoreData.goodsCount || 0} | 🛠️ Hizmet: ${scoreData.serviceCount || 0}]` : 'Henüz puanlanmadı';

    const kpiSpend = document.getElementById('vp-kpi-total-spend');
    const kpiSpendSub = document.getElementById('vp-kpi-total-spend-sub');
    if (kpiSpend) kpiSpend.innerText = `${totalSpend.toLocaleString('tr-TR')} ₺`;
    if (kpiSpendSub) kpiSpendSub.innerText = `Toplam Bütçe Payı: %${budgetSharePct}`;

    const kpiOrder = document.getElementById('vp-kpi-order-count');
    const kpiOrderSub = document.getElementById('vp-kpi-order-count-sub');
    if (kpiOrder) kpiOrder.innerText = `${completedCount} Adet`;
    if (kpiOrderSub) kpiOrderSub.innerText = `${totalRequestsCount} Toplam Talep (${totalRequestsCount - completedCount} Açık/İşlemde)`;

    const kpiDays = document.getElementById('vp-kpi-avg-days');
    const kpiDaysSub = document.getElementById('vp-kpi-avg-days-sub');
    if (kpiDays) kpiDays.innerText = daysCount > 0 ? `${avgDays} Gün` : '-';
    if (kpiDaysSub) kpiDaysSub.innerText = daysCount > 0 ? `${daysCount} teslimat ortalaması` : 'Teslimat kaydı yok';

    // Render Radar Chart
    this.renderVendorRadarChart(scoreData);

    // Render Unit Breakdown Table
    const unitMap = {};
    vendorRequests.forEach(r => {
      const u = r.unit || 'Belirtilmemiş';
      if (!unitMap[u]) {
        unitMap[u] = { count: 0, spend: 0, ratings: [] };
      }
      unitMap[u].count++;
      unitMap[u].spend += (parseFloat(r.actualAmount) || 0);
    });

    // Match unit ratings
    (scoreData?.reviews || []).forEach(rv => {
      Object.keys(unitMap).forEach(u => {
        if ((rv.ratedBy || '').toLowerCase().includes(u.toLowerCase())) {
          unitMap[u].ratings.push(parseFloat(rv.overallScore) || 5);
        }
      });
    });

    const tbodyUnits = document.querySelector('#table-vp-units tbody');
    if (tbodyUnits) {
      const unitEntries = Object.entries(unitMap);
      if (unitEntries.length === 0) {
        tbodyUnits.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">Bu firma için henüz birim işlem kaydı bulunmuyor.</td></tr>`;
      } else {
        tbodyUnits.innerHTML = unitEntries.map(([uName, uData]) => {
          const avgUnitScore = uData.ratings.length > 0
            ? (uData.ratings.reduce((a, b) => a + b, 0) / uData.ratings.length).toFixed(1) + ' ⭐'
            : '<span style="color:var(--text-muted); font-size:0.75rem;">Değerlendirme yok</span>';

          return `
            <tr>
              <td style="font-weight:700; color:var(--text-main);">🏛️ ${uName}</td>
              <td style="font-weight:600;">${uData.count}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${uData.spend.toLocaleString('tr-TR')} ₺</td>
              <td style="text-align:right; font-weight:700; color:#f59e0b;">${avgUnitScore}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Contracts & Guarantees List
    const contractsListEl = document.getElementById('vp-contracts-guarantees-list');
    if (contractsListEl) {
      let itemsHtml = '';
      if (vendorContracts.length > 0) {
        itemsHtml += vendorContracts.map(c => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); border:1px solid var(--border-color); padding:0.5rem 0.75rem; border-radius:var(--radius-sm);">
            <div>
              <strong>📑 Sözleşme: ${c.title || c.contractNo || 'Sözleşme'}</strong>
              <div style="font-size:0.72rem; color:var(--text-muted);">Vade: ${c.startDate || '-'} ➔ ${c.endDate || '-'}</div>
            </div>
            <span class="badge status-completed">${Number(c.totalAmount || 0).toLocaleString('tr-TR')} ${c.currency || 'TRY'}</span>
          </div>
        `).join('');
      }
      if (vendorGuarantees.length > 0) {
        itemsHtml += vendorGuarantees.map(g => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); border:1px solid var(--border-color); padding:0.5rem 0.75rem; border-radius:var(--radius-sm);">
            <div>
              <strong>🛡️ Teminat Mektubu: ${g.bank || 'Banka'} (#${g.letterNo || '-'})</strong>
              <div style="font-size:0.72rem; color:var(--text-muted);">Geçerlilik: ${g.expiryDate || '-'} (${g.status || 'Aktif'})</div>
            </div>
            <span class="badge" style="background:rgba(245,158,11,0.15); color:#d97706; font-weight:700;">${Number(g.guaranteeAmount || 0).toLocaleString('tr-TR')} ${g.currency || 'TRY'}</span>
          </div>
        `).join('');
      }

      if (!itemsHtml) {
        itemsHtml = `<div style="color:var(--text-muted); font-size:0.8rem; padding:0.5rem 0;">Bu firma adına kayıtlı aktif sözleşme veya teminat mektubu bulunmuyor.</div>`;
      }
      contractsListEl.innerHTML = itemsHtml;
    }

    // Render Past History Table
    const tbodyHistory = document.querySelector('#table-vp-history tbody');
    const historyCountEl = document.getElementById('vp-history-count-text');
    if (tbodyHistory) {
      if (vendorRequests.length === 0) {
        tbodyHistory.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Bu firmaya ait kayıtlı sipariş veya talep bulunamadı.</td></tr>`;
        if (historyCountEl) historyCountEl.innerText = '0 kayıt';
      } else {
        if (historyCountEl) historyCountEl.innerText = `${vendorRequests.length} adet işlem kaydı`;
        tbodyHistory.innerHTML = vendorRequests.map(r => {
          // Find if there is a rating for this specific request
          const matchingRating = (scoreData?.reviews || []).find(rv => 
            rv.requestId && (String(rv.requestId) === String(r.id) || (r.requestBarcode && String(rv.requestId) === String(r.requestBarcode)))
          );

          const isHizmet = (r.purchaseType || 'MAL') === 'HIZMET';
          const typeBadge = isHizmet
            ? `<span class="badge" style="background:rgba(16,185,129,0.12); color:#059669; font-size:0.7rem; padding:0.15rem 0.4rem;">🛠️ Hizmet</span>`
            : `<span class="badge" style="background:rgba(59,130,246,0.12); color:#2563eb; font-size:0.7rem; padding:0.15rem 0.4rem;">📦 Mal</span>`;

          const scoreBadge = matchingRating
            ? `<span class="score-badge-gold" style="font-size:0.75rem;">⭐ ${matchingRating.overallScore}</span>`
            : `<span style="font-size:0.75rem; color:var(--text-muted);">-</span>`;

          const reviewNotes = matchingRating?.reviewNotes ? `"${matchingRating.reviewNotes}"` : (r.description || '-');
          const rater = matchingRating ? matchingRating.ratedBy.replace('[Birim Değerlendirmesi]', '🏛️ Birim') : (r.assignedTo || '-');

          return `
            <tr>
              <td style="font-size:0.8rem; color:var(--text-muted);">${r.arrivalDate || r.orderDate || '-'}</td>
              <td style="font-weight:700; font-family:var(--font-mono); color:var(--accent-primary);">#${r.requestBarcode || r.id}</td>
              <td style="font-weight:600; color:var(--text-main);">${r.subject || '-'}</td>
              <td>${r.unit || '-'}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${(parseFloat(r.actualAmount) || 0).toLocaleString('tr-TR')} ₺</td>
              <td>${typeBadge}</td>
              <td style="font-size:0.78rem;">${rater}</td>
              <td>${scoreBadge}</td>
              <td style="font-size:0.76rem; color:var(--text-muted); max-width:200px;">${reviewNotes}</td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  renderVendorRadarChart(scoreData) {
    const canvas = document.getElementById('chart-vendor-radar');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.vendorRadarChart) {
      this.vendorRadarChart.destroy();
      this.vendorRadarChart = null;
    }

    const quality = parseFloat(scoreData?.quality || 5.0);
    const speed = parseFloat(scoreData?.speed || 5.0);
    const assembly = parseFloat(scoreData?.assembly || 5.0);
    const compliance = parseFloat(scoreData?.compliance || 5.0);
    const communication = parseFloat(scoreData?.communication || 5.0);

    const ctx = canvas.getContext('2d');
    this.vendorRadarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: [
          '📦 Ürün Kalitesi',
          '🚚 Teslimat Hızı',
          '🔧 Montaj / İşçilik',
          '🧾 Garanti & Evrak',
          '💬 İletişim & Destek'
        ],
        datasets: [{
          label: 'Performans Puanı',
          data: [quality, speed, assembly, compliance, communication],
          backgroundColor: 'rgba(30, 58, 138, 0.25)',
          borderColor: '#3b82f6',
          borderWidth: 2.5,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 5,
            ticks: {
              stepSize: 1,
              font: { size: 10, weight: '700' },
              backdropColor: 'transparent'
            },
            pointLabels: {
              font: { size: 11, weight: '700' },
              color: '#0f172a'
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.25)'
            },
            angleLines: {
              color: 'rgba(148, 163, 184, 0.25)'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Puan: ${ctx.raw} / 5.0 ★`
            }
          }
        }
      }
    });

    const legendEl = document.getElementById('vp-radar-legend');
    if (legendEl) {
      legendEl.innerHTML = `
        <div><strong>📦 Kalite:</strong> <span style="color:#f59e0b; font-weight:700;">${quality} ★</span></div>
        <div><strong>🚚 Hız:</strong> <span style="color:#f59e0b; font-weight:700;">${speed} ★</span></div>
        <div><strong>🔧 Montaj:</strong> <span style="color:#f59e0b; font-weight:700;">${assembly} ★</span></div>
        <div><strong>🧾 Evrak:</strong> <span style="color:#f59e0b; font-weight:700;">${compliance} ★</span></div>
        <div><strong>💬 İletişim:</strong> <span style="color:#f59e0b; font-weight:700;">${communication} ★</span></div>
      `;
    }
  },

  printVendorReport() {
    window.print();
  },

  openVendorRateModal(supplierName) {
    if (!supplierName) return;
    document.getElementById('vr-supplier-name').value = supplierName;
    document.getElementById('vr-supplier-title').innerText = `🏢 ${supplierName}`;
    document.getElementById('vr-review-notes').value = '';

    // Default to MAL
    this.setRatingPurchaseType('MAL');

    const scoreData = this.getVendorScore(supplierName);
    const statsEl = document.getElementById('vr-supplier-stats');
    const overallEl = document.getElementById('vr-overall-display');
    const historySection = document.getElementById('vr-history-section');
    const historyList = document.getElementById('vr-history-list');

    if (scoreData) {
      const breakdownText = [
        scoreData.goodsCount > 0 ? `📦 Mal: ${scoreData.goodsAvg}⭐ (${scoreData.goodsCount})` : null,
        scoreData.serviceCount > 0 ? `🛠️ Hizmet: ${scoreData.serviceAvg}⭐ (${scoreData.serviceCount})` : null
      ].filter(Boolean).join(' • ');

      if (statsEl) statsEl.innerText = `${scoreData.count} adet toplam değerlendirme. ${breakdownText ? `[ ${breakdownText} ]` : ''}`;
      if (overallEl) overallEl.innerText = `${scoreData.overall} ⭐`;
      if (historySection && historyList) {
        historySection.style.display = 'block';
        historyList.innerHTML = scoreData.reviews.map(r => {
          const isService = (r.purchaseType || 'MAL') === 'HIZMET';
          const isUnit = (r.ratedBy || '').includes('[Birim Değerlendirmesi]');
          const cleanName = (r.ratedBy || 'Yetkili').replace('[Birim Değerlendirmesi]', '').trim();
          
          const typeBadge = isService
            ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#059669; font-size:0.68rem; padding:0.1rem 0.4rem; border:1px solid rgba(16,185,129,0.3);">🛠️ Hizmet</span>`
            : `<span class="badge" style="background:rgba(59,130,246,0.15); color:#2563eb; font-size:0.68rem; padding:0.1rem 0.4rem; border:1px solid rgba(59,130,246,0.3);">📦 Mal</span>`;

          const reviewerBadge = isUnit
            ? `<span class="badge" style="background:rgba(245,158,11,0.15); color:#d97706; font-size:0.68rem; padding:0.1rem 0.4rem; border:1px solid rgba(245,158,11,0.3);">🏛️ Birim</span>`
            : `<span class="badge" style="background:rgba(100,116,139,0.15); color:#475569; font-size:0.68rem; padding:0.1rem 0.4rem; border:1px solid rgba(100,116,139,0.3);">👤 Satınalma</span>`;

          return `
            <div style="background:var(--bg-card); border:1px solid var(--border-color); padding:0.5rem 0.75rem; border-radius:var(--radius-sm); font-size:0.8rem;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
                  <strong>${isUnit ? '🏛️' : '👤'} ${cleanName}</strong>
                  ${reviewerBadge}
                  ${typeBadge}
                </div>
                <span style="color:#f59e0b; font-weight:700;">${r.overallScore} ⭐</span>
              </div>
              ${r.reviewNotes ? `<div style="margin-top:0.25rem; color:var(--text-muted); font-size:0.76rem;">"${r.reviewNotes}"</div>` : ''}
              <div style="font-size:0.7rem; color:var(--text-muted); text-align:right; margin-top:0.2rem;">${r.ratedAt || ''}</div>
            </div>
          `;
        }).join('');
      }
    } else {
      if (statsEl) statsEl.innerText = 'Henüz bu tedarikçi için kayıtlı bir değerlendirme bulunmuyor.';
      if (overallEl) overallEl.innerText = '5.0 ⭐';
      if (historySection) historySection.style.display = 'none';
    }

    this.openModal('modal-vendor-rate');
  },

  setRatingPurchaseType(type) {
    const hiddenType = document.getElementById('vr-purchase-type');
    if (hiddenType) hiddenType.value = type;

    const btnGoods = document.getElementById('btn-ptype-goods');
    const btnService = document.getElementById('btn-ptype-service');
    const labelEl = document.getElementById('vr-type-label');

    if (type === 'MAL') {
      btnGoods?.classList.add('active');
      btnService?.classList.remove('active');
      if (labelEl) labelEl.innerText = 'MAL ALIMI PUANI';
    } else {
      btnService?.classList.add('active');
      btnGoods?.classList.remove('active');
      if (labelEl) labelEl.innerText = 'HİZMET ALIMI PUANI';
    }

    this.renderCriteriaForType(type);
    this.setupStarPickers();
    this.recalcOverallScoreModal();
  },

  renderCriteriaForType(type) {
    const container = document.getElementById('vr-criteria-container');
    if (!container) return;

    if (type === 'MAL') {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">📦 Ürün Kalitesi & Şartname Uyumu</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">İstenen marka, model, teknik özellik ve numuneye uygunluk</div>
          </div>
          <div class="star-rating-picker" data-criterion="quality" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">🚚 Teslimat Hızı & Hasarsız Ambalaj</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Siparişin zamanında, hasarsız ve sıfır ambalajında teslimi</div>
          </div>
          <div class="star-rating-picker" data-criterion="speed" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">🔧 Montaj, Kurulum ve İşçilik</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Eksiksiz montaj, temiz işçilik ve çalışır teslim</div>
          </div>
          <div class="star-rating-picker" data-criterion="assembly" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">🧾 Garanti Belgesi, Kılavuz & Evrak Doğruluğu</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">İrsaliye, fatura, garanti evrakları ve kullanım kılavuzları</div>
          </div>
          <div class="star-rating-picker" data-criterion="compliance" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">🛠️ Hizmet Kalitesi & Kapsam Uyumu</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Yapılan bakım/hizmetin şartnameye ve ihtiyaca tam uygunluğu</div>
          </div>
          <div class="star-rating-picker" data-criterion="quality" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">⏱️ Müdahale Hızı & Çözüm Üretme</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Arıza ve taleplere hızlı reaksiyon gösterme ve çözüm süresi</div>
          </div>
          <div class="star-rating-picker" data-criterion="speed" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">👷‍♂️ Personel Yetkinliği & İSG / Kampüs Uyumu</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Teknik personelin ehil olması, saygılı iletişimi ve güvenlik kurallarına uyumu</div>
          </div>
          <div class="star-rating-picker" data-criterion="assembly" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div>
            <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">📋 Hizmet Sürekliliği & Servis Raporlaması</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Hizmetin aksamaması, periyodik bakım formları ve resmi evrak intizamı</div>
          </div>
          <div class="star-rating-picker" data-criterion="compliance" data-score="5">
            <span class="star" data-val="1">★</span><span class="star" data-val="2">★</span><span class="star" data-val="3">★</span><span class="star" data-val="4">★</span><span class="star selected" data-val="5">★</span>
            <span class="score-text" style="margin-left: 0.4rem; font-weight: 700; color: #f59e0b; width: 24px; display: inline-block; text-align: right;">5.0</span>
          </div>
        </div>
      `;
    }
  },

  setupStarPickers() {
    const pickers = document.querySelectorAll('.star-rating-picker');
    pickers.forEach(picker => {
      const stars = picker.querySelectorAll('.star');
      const scoreText = picker.querySelector('.score-text');
      let currentVal = parseInt(picker.getAttribute('data-score') || '5', 10);

      const updateStars = (val) => {
        stars.forEach(s => {
          const sVal = parseInt(s.getAttribute('data-val'), 10);
          if (sVal <= val) {
            s.classList.add('selected');
          } else {
            s.classList.remove('selected');
          }
        });
        if (scoreText) scoreText.innerText = `${val}.0`;
      };

      stars.forEach(s => {
        s.onmouseenter = () => {
          const sVal = parseInt(s.getAttribute('data-val'), 10);
          stars.forEach(st => {
            if (parseInt(st.getAttribute('data-val'), 10) <= sVal) st.classList.add('hovered');
            else st.classList.remove('hovered');
          });
        };
        s.onmouseleave = () => {
          stars.forEach(st => st.classList.remove('hovered'));
        };
        s.onclick = () => {
          currentVal = parseInt(s.getAttribute('data-val'), 10);
          picker.setAttribute('data-score', currentVal);
          updateStars(currentVal);
          this.recalcOverallScoreModal();
        };
      });

      updateStars(currentVal);
    });
  },

  recalcOverallScoreModal() {
    const pickers = document.querySelectorAll('.star-rating-picker');
    let sum = 0;
    pickers.forEach(p => {
      sum += parseInt(p.getAttribute('data-score') || '5', 10);
    });
    const avg = pickers.length > 0 ? (sum / pickers.length).toFixed(1) : '5.0';
    const overallEl = document.getElementById('vr-overall-display');
    if (overallEl) overallEl.innerText = `${avg} ⭐`;
  },

  async saveVendorRating(e) {
    if (e) e.preventDefault();
    const supplierName = document.getElementById('vr-supplier-name')?.value;
    if (!supplierName) return;

    const purchaseType = document.getElementById('vr-purchase-type')?.value || 'MAL';
    const qualityScore = parseInt(document.querySelector('[data-criterion="quality"]')?.getAttribute('data-score') || '5', 10);
    const speedScore = parseInt(document.querySelector('[data-criterion="speed"]')?.getAttribute('data-score') || '5', 10);
    const assemblyScore = parseInt(document.querySelector('[data-criterion="assembly"]')?.getAttribute('data-score') || '5', 10);
    const complianceScore = parseInt(document.querySelector('[data-criterion="compliance"]')?.getAttribute('data-score') || '5', 10);
    const overallScore = parseFloat(((qualityScore + speedScore + assemblyScore + complianceScore) / 4).toFixed(1));
    const reviewNotes = document.getElementById('vr-review-notes')?.value.trim() || '';

    const newRating = {
      supplierName,
      purchaseType,
      qualityScore,
      speedScore,
      complianceScore,
      communicationScore: assemblyScore,
      overallScore,
      reviewNotes,
      ratedBy: this.state.currentUser ? this.state.currentUser.name : 'Satınalma Yetkilisi',
      ratedAt: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };

    try {
      const res = await this.authFetch('/api/vendor_ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRating)
      });
      if (res.ok) {
        const saved = await res.json();
        if (!this.state.vendorRatings) this.state.vendorRatings = [];
        this.state.vendorRatings.push(saved);
        this.showToast(`"${supplierName}" firması için [${purchaseType === 'MAL' ? 'Mal' : 'Hizmet'}] puanlaması (${overallScore} ⭐) kaydedildi!`, 'success', '⭐');
        this.logAction('Tedarikçi Puanlandı', `Firma: ${supplierName} (${purchaseType}): ${overallScore} ⭐`);
        this.closeModal('modal-vendor-rate');
        this.renderSupplierAnalysis();
      } else {
        this.showToast("Puanlama kaydedilemedi.", "error");
      }
    } catch (err) {
      console.error(err);
      this.showToast("Puanlama kaydedilemedi.", "error");
    }
  },

  downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      this.showToast("Excel kütüphanesi yüklenemedi.", "error");
      return;
    }

    const templateData = [
      {
        'Barkod No': 1000150,
        'Talep Konusu': 'Laboratuvar Dizüstü Bilgisayar Alımı',
        'Birim': 'Mühendislik Fakültesi',
        'Geliş Tarihi': '2026-02-01',
        'Atanan Personel': 'Merih AVCI',
        'Öncelik': 'Yüksek',
        'Durum': 'Açık',
        'Tahmini Bütçe (TL)': 45000,
        'Gerçekleşen Tutar (TL)': 0,
        'Para Birimi': 'TRY',
        'Tedarikçi': '',
        'Sipariş No': '',
        'Sipariş Tarihi': '',
        'Yönetmelik Maddesi': '19-A',
        'Detay / Açıklama': 'Örnek talep kaydı açıklaması'
      },
      {
        'Barkod No': 1000151,
        'Talep Konusu': 'Derslik Projeksiyon Cihazı Bakımı',
        'Birim': 'Bilgi İşlem Müdürlüğü',
        'Geliş Tarihi': '2026-02-05',
        'Atanan Personel': 'Cem TÜRKMEN',
        'Öncelik': 'Orta',
        'Durum': 'Tamamlandı',
        'Tahmini Bütçe (TL)': 18000,
        'Gerçekleşen Tutar (TL)': 16500,
        'Para Birimi': 'TRY',
        'Tedarikçi': 'Tekno Sistem A.Ş.',
        'Sipariş No': 2000089,
        'Sipariş Tarihi': '2026-02-07',
        'Yönetmelik Maddesi': '18-C',
        'Detay / Açıklama': 'Bakım ve değişim tamamlandı'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Talepler");
    XLSX.writeFile(workbook, "Satinalma_Talep_Yukleme_Sablonu.xlsx");
    this.showToast("Örnek Excel şablonu bilgisayarınıza indirildi.", "success", "📄");
  },

  async handleUpdateSystem() {
    if (!confirm("Sunucudaki uygulama son koda (Git) güncellenecek ve servis yeniden başlatılacak. Devam etmek istiyor musunuz?")) return;
    try {
      this.showToast("Sunucu güncelleniyor, lütfen bekleyin...", "info", "🚀");
      const res = await this.authFetch('/api/update-system', { method: 'POST' });
      if (res.ok) {
        this.showToast("🎉 Sunucu başarıyla son sürüme güncellendi!", "success", "✅");
      } else {
        this.showToast("Güncelleme işlemi tamamlandı.", "info");
      }
    } catch (err) {
      console.error(err);
      this.showToast("Güncelleme sırasında hata oluştu.", "error");
    }
  },

  renderUnitsSettings() {
    const tbody = document.getElementById('tbody-units-settings');
    if (!tbody) return;
    if (!this.state.units || this.state.units.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:1rem;">Tanımlı birim bulunamadı.</td></tr>`;
      return;
    }
    tbody.innerHTML = this.state.units.map(u => {
      const id = typeof u === 'object' ? u.id : u;
      const name = typeof u === 'object' ? u.name : u;
      const email = typeof u === 'object' ? (u.email || '') : '';
      const emailBadge = email
        ? `<span class="badge status-open" style="font-family:var(--font-mono); font-size:0.78rem;">📧 ${email}</span>`
        : `<span style="font-size:0.75rem; color:var(--text-muted); opacity:0.7;">E-Posta Yok</span>`;

      return `
        <tr>
          <td style="font-weight:600; color:var(--text-main);">🏢 ${name}</td>
          <td>${emailBadge}</td>
          <td style="text-align:center;">
            <div class="action-btns" style="justify-content:center; gap:0.25rem;">
              <button class="btn-icon" onclick="App.openEditUnitModal(${id})" title="Birim Bilgilerini ve E-Postasını Düzenle">✏️</button>
              <button class="btn-icon" onclick="App.handleDeleteUnit(${id}, '${name.replace(/'/g, "\\'")}')" title="Birimi Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderRegulationsSettings() {
    const tbody = document.getElementById('tbody-regulations-settings');
    if (!tbody) return;
    if (!this.state.regulations || this.state.regulations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted); padding:1rem;">Tanımlı yönetmelik maddesi bulunamadı.</td></tr>`;
      return;
    }
    tbody.innerHTML = this.state.regulations.map(r => {
      const id = typeof r === 'object' ? r.id : r;
      const name = typeof r === 'object' ? r.name : r;
      return `
        <tr>
          <td style="font-weight:600; color:var(--text-main);">📜 Madde ${name}</td>
          <td style="text-align:center;">
            <button class="btn-icon" onclick="App.handleDeleteRegulation(${id}, '${name.replace(/'/g, "\\'")}')" title="Maddeyi Sil">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async handleAddUnit() {
    const nameInput = document.getElementById('input-new-unit-name');
    const emailInput = document.getElementById('input-new-unit-email');
    const name = nameInput?.value.trim();
    const email = emailInput?.value.trim() || '';

    if (!name) {
      this.showToast("Lütfen eklenecek birim adını girin.", "warning");
      return;
    }

    try {
      const res = await this.authFetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Sunucu hatası (${res.status})`);
      }

      const saved = await res.json();
      this.state.units.push(saved);
      if (nameInput) nameInput.value = '';
      if (emailInput) emailInput.value = '';
      this.renderUnitsSettings();
      this.populateDropdowns();
      this.showToast(`"${name}" birimi başarıyla eklendi.`, "success", "🏢");
      this.logAction('Yeni Birim Eklendi', `Birim: ${name}${email ? ` (${email})` : ''}`);
    } catch (err) {
      console.error('Birim ekleme hatası:', err);
      this.showToast(`Birim eklenemedi: ${err.message}`, "error");
    }
  },

  openEditUnitModal(unitId) {
    const unitObj = (this.state.units || []).find(u => String(typeof u === 'object' ? u.id : u) === String(unitId));
    if (!unitObj) return;

    const id = typeof unitObj === 'object' ? unitObj.id : unitObj;
    const name = typeof unitObj === 'object' ? unitObj.name : unitObj;
    const email = typeof unitObj === 'object' ? (unitObj.email || '') : '';

    const idEl = document.getElementById('ue-id');
    const nameEl = document.getElementById('ue-name');
    const emailEl = document.getElementById('ue-email');
    const titleEl = document.getElementById('unit-edit-modal-title');

    if (idEl) idEl.value = id;
    if (nameEl) nameEl.value = name;
    if (emailEl) emailEl.value = email;
    if (titleEl) titleEl.innerText = `🏢 ${name} — Bilgileri Düzenle`;

    this.openModal('modal-unit-edit');
  },

  async handleSaveEditUnit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const idVal = document.getElementById('ue-id')?.value;
    const id = parseInt(idVal, 10);
    const newName = document.getElementById('ue-name')?.value.trim();
    const newEmail = document.getElementById('ue-email')?.value.trim() || '';

    if (!id || !newName) {
      this.showToast("Lütfen birim adını eksiksiz giriniz.", "warning");
      return;
    }

    const unitIndex = (this.state.units || []).findIndex(u => String(typeof u === 'object' ? u.id : u) === String(id));
    const oldUnit = unitIndex !== -1 ? this.state.units[unitIndex] : null;
    const oldName = oldUnit ? (typeof oldUnit === 'object' ? oldUnit.name : oldUnit) : null;

    try {
      const res = await this.authFetch(`/api/units/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Sunucu hatası (${res.status})`);
      }

      const updated = await res.json();
      
      // Update in state
      if (unitIndex !== -1) {
        this.state.units[unitIndex] = { id: id, name: newName, email: newEmail };
      }

      // Update unit name across all loaded requests in memory if changed
      if (oldName && oldName !== newName) {
        (this.state.requests || []).forEach(r => {
          if (r.unit === oldName) r.unit = newName;
        });
      }

      this.closeModal('modal-unit-edit');
      this.renderUnitsSettings();
      this.populateDropdowns();
      this.render();
      this.showToast(`"${newName}" birim bilgileri başarıyla güncellendi!`, "success", "✏️");
      this.logAction('Birim Güncellendi', `Birim: ${newName}${newEmail ? ` (${newEmail})` : ''}`);
    } catch (err) {
      console.error('Birim güncelleme hatası:', err);
      this.showToast(`Birim güncellenemedi: ${err.message}`, "error");
    }
  },

  async handleDeleteUnit(id, name) {
    this.showConfirm("Birimi Sil", `"${name}" birimini silmek istediğinizden emin misiniz?`, async () => {
      try {
        await this.apiSync('units', 'DELETE', null, id);
        this.state.units = this.state.units.filter(u => (typeof u === 'object' ? u.id : u) !== id);
        this.renderUnitsSettings();
        this.populateDropdowns();
        this.showToast(`"${name}" birimi silindi.`, "info", "🗑️");
        this.logAction('Birim Silindi', `Birim: ${name}`);
      } catch (err) {
        console.error(err);
        this.showToast("Birim silinirken hata oluştu.", "error");
      }
    }, '🗑️');
  },

  async handleAddRegulation() {
    const input = document.getElementById('input-new-regulation-name');
    let name = input?.value.trim();
    if (!name) {
      this.showToast("Lütfen eklenecek yönetmelik maddesini girin.", "warning");
      return;
    }
    if (name.startsWith('Madde ')) name = name.replace('Madde ', '');
    try {
      const res = await this.apiSync('regulations', 'POST', { name });
      if (res) {
        this.state.regulations.push(res);
        input.value = '';
        this.renderRegulationsSettings();
        this.populateDropdowns();
        this.showToast(`"Madde ${name}" başarıyla eklendi.`, "success", "📜");
      }
    } catch (err) {
      console.error(err);
      this.showToast("Yönetmelik maddesi eklenirken hata oluştu.", "error");
    }
  },

  async handleDeleteRegulation(id, name) {
    if (!confirm(`"Madde ${name}" düzenlemesini silmek istediğinizden emin misiniz?`)) return;
    try {
      await this.apiSync('regulations', 'DELETE', null, id);
      this.state.regulations = this.state.regulations.filter(r => (typeof r === 'object' ? r.id : r) !== id);
      this.renderRegulationsSettings();
      this.populateDropdowns();
      this.showToast(`"Madde ${name}" silindi.`, "info", "🗑️");
    } catch (err) {
      console.error(err);
      this.showToast("Yönetmelik maddesi silinirken hata oluştu.", "error");
    }
  },

  openUserModal(userId = null) {
    if (userId) {
      const u = this.state.users.find(usr => String(usr.id) === String(userId));
      if (!u) return;
      document.getElementById('um-id').value = u.id;
      document.getElementById('um-name').value = u.name;
      document.getElementById('um-title').value = u.title;
      document.getElementById('um-role').value = u.role || 'STAFF';
      document.getElementById('um-password').value = u.password || '123';
      if (document.getElementById('um-phone')) document.getElementById('um-phone').value = u.phone || '';
      if (document.getElementById('um-email')) document.getElementById('um-email').value = u.email || '';
      document.getElementById('um-is-active').value = (u.isActive !== false).toString();
      document.getElementById('user-modal-title').innerText = `✏️ Personel Düzenle (${u.name})`;
    } else {
      document.getElementById('um-id').value = '';
      document.getElementById('form-user-manage').reset();
      document.getElementById('um-password').value = '123';
      document.getElementById('user-modal-title').innerText = '➕ Yeni Personel Ekle';
    }
    this.openModal('modal-user-form');
  },

  async handleSaveUser(e) {
    e.preventDefault();
    const id = document.getElementById('um-id').value;
    const name = document.getElementById('um-name').value.trim();
    const title = document.getElementById('um-title').value.trim();
    const role = document.getElementById('um-role').value;
    const password = document.getElementById('um-password').value.trim() || '123';
    const phone = document.getElementById('um-phone')?.value.trim() || '';
    const email = document.getElementById('um-email')?.value.trim() || '';
    const isActive = document.getElementById('um-is-active').value === 'true';

    if (id) {
      const u = this.state.users.find(usr => String(usr.id) === String(id));
      if (u) {
        u.name = name;
        u.title = title;
        u.role = role;
        u.password = password;
        u.phone = phone;
        u.email = email;
        u.isActive = isActive;
        await this.apiSync('users', 'PUT', u);
      }
    } else {
      const username = name.split(' ')[0].toLowerCase();
      const newUser = {
        username: username,
        name: name,
        title: title,
        role: role,
        password: password,
        phone: phone,
        email: email,
        isActive: isActive
      };
      const savedU = await this.apiSync('users', 'POST', newUser);
      if (savedU) newUser.id = savedU.id;
      this.state.users.push(newUser);
    }

    this.showToast("Personel bilgileri başarıyla kaydedildi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.populateLoginDropdown();
    this.populateDropdowns();
    this.render();
  },

  async toggleUserStatus(userId) {
    const u = this.state.users.find(usr => String(usr.id) === String(userId));
    if (u) {
      u.isActive = u.isActive === false ? true : false;
      await this.apiSync('users', 'PUT', u);
      const statusText = u.isActive ? 'Aktif' : 'Pasif (Ayrıldı)';
      this.showToast(`${u.name} kullanıcısının durumu '${statusText}' olarak değiştirildi!`, "info");
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }
  },

  async deleteUser(userId) {
    const u = this.state.users.find(usr => String(usr.id) === String(userId));
    if (!u) return;

    this.showConfirm("Personel Sil", `${u.name} isimli personeli silmek istediğinizden emin misiniz?`, async () => {
      await this.apiSync('users', 'DELETE', u.id);
      this.state.users = this.state.users.filter(usr => String(usr.id) !== String(userId));
      this.showToast("Personel başarıyla silindi!", "warning");
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }, '🗑️');
  },

  async apiSync(table, method, data = null, customId = null) {
    let url = `/api/${table}`;
    const id = customId !== null && customId !== undefined
      ? customId
      : (data !== null && typeof data === 'object' ? data.id : data);

    if ((method === 'PUT' || method === 'DELETE') && id !== null && id !== undefined) {
      url += `/${id}`;
    }
    
    const options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && method !== 'DELETE') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await this.authFetch(url, options);
      if (!response.ok) {
        throw new Error(`API Hatası: ${response.statusText}`);
      }
      return await response.json();
    } catch (e) {
      console.error('apiSync başarısız:', e);
      return null;
    }
  },

  async saveDatabase() {
    try {
      const dbPayload = {
        users: this.state.users,
        units: this.state.units,
        regulations: this.state.regulations,
        contracts: this.state.contracts,
        guarantees: this.state.guarantees || [],
        invoices: this.state.invoices,
        requests: this.state.requests,
        logs: this.state.logs || [],
        rates: this.state.rates || { USD: 36.50, EUR: 39.80 }
      };

      await fetch('/api/save-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(dbPayload)
      });
    } catch (err) {
      console.error("Error saving DB:", err);
    }
  },

  showToast(message, type = 'info', icon = null) {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.log(`[Toast ${type}]: ${message}`);
      return;
    }

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toastIcon = icon || icons[type] || 'ℹ️';
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.innerHTML = `
      <div class="toast-icon">${toastIcon}</div>
      <div class="toast-message">${message}</div>
    `;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.animation = 'fadeOutToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      }, 300);
    }, 4000);
  },

  showConfirm(title, message, onConfirm, icon = '⚠️') {
    const modal = document.getElementById('modal-confirm');
    if (!modal) {
      if (confirm(`${title}\n${message}`)) {
        if (typeof onConfirm === 'function') onConfirm();
      }
      return;
    }

    const iconEl = document.getElementById('confirm-modal-icon');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    let btnOk = document.getElementById('btn-confirm-ok');
    let btnCancel = document.getElementById('btn-confirm-cancel');

    if (iconEl) iconEl.innerText = icon;
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;

    if (btnOk && btnOk.parentNode) {
      const newOk = btnOk.cloneNode(true);
      btnOk.parentNode.replaceChild(newOk, btnOk);
      btnOk = newOk;
    }
    if (btnCancel && btnCancel.parentNode) {
      const newCancel = btnCancel.cloneNode(true);
      btnCancel.parentNode.replaceChild(newCancel, btnCancel);
      btnCancel = newCancel;
    }

    modal.classList.add('active');

    btnOk?.addEventListener('click', (e) => {
      e?.preventDefault();
      modal.classList.remove('active');
      if (typeof onConfirm === 'function') onConfirm();
    });

    btnCancel?.addEventListener('click', (e) => {
      e?.preventDefault();
      modal.classList.remove('active');
    });
  },

  openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
  },

  closeModal(modalId = null) {
    if (modalId) {
      document.getElementById(modalId)?.classList.remove('active');
    } else {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
  },

  async handleNewRequest(e) {
    e.preventDefault();
    const barcode = document.getElementById('nr-barcode').value.trim();
    const arrDate = document.getElementById('nr-arrival-date').value;
    const subject = document.getElementById('nr-subject').value.trim();
    const desc = document.getElementById('nr-description').value.trim();
    const unit = document.getElementById('nr-unit').value;
    const assigned = document.getElementById('nr-assigned-to').value || 'Henüz Atanmadı';
    const priority = document.getElementById('nr-priority').value;
    const purchaseType = document.getElementById('nr-purchase-type')?.value || 'MAL';
    const reg = document.getElementById('nr-regulation').value;
    const estAmt = this.parseMoney(document.getElementById('nr-estimated-amount')?.value);
    const currency = document.getElementById('nr-currency')?.value || 'TRY';

    if (!barcode) {
      this.showToast("Lütfen 'Talep Barkodu' giriniz!", "warning", "⚠️");
      document.getElementById('nr-barcode')?.focus();
      return;
    }
    if (!arrDate) {
      this.showToast("Lütfen 'Satınalmaya Geliş Tarihi' seçiniz!", "warning", "⚠️");
      document.getElementById('nr-arrival-date')?.focus();
      return;
    }
    if (!subject) {
      this.showToast("Lütfen 'Talep Konusu' giriniz!", "warning", "⚠️");
      document.getElementById('nr-subject')?.focus();
      return;
    }
    if (!unit) {
      this.showToast("Lütfen 'Talep Eden Birim' seçiniz!", "warning", "⚠️");
      document.getElementById('nr-unit')?.focus();
      return;
    }
    if (!purchaseType) {
      this.showToast("Lütfen 'Alım Türü' seçiniz!", "warning", "⚠️");
      document.getElementById('nr-purchase-type')?.focus();
      return;
    }
    if (!estAmt || estAmt <= 0) {
      this.showToast("Lütfen geçerli bir 'Tahmini / Bütçe Tutarı' giriniz (0'dan büyük olmalıdır)!", "warning", "⚠️");
      document.getElementById('nr-estimated-amount')?.focus();
      return;
    }

    const newReq = {
      id: this.state.requests.length + 1,
      sequenceNo: this.state.requests.length + 1,
      requestBarcode: barcode,
      arrivalDate: arrDate,
      requestDate: arrDate,
      subject: subject,
      description: desc,
      unit: unit,
      assignedTo: assigned,
      priority: priority,
      purchaseType: purchaseType,
      regulation: reg,
      status: 'Açık',
      estimatedAmount: estAmt,
      budgetAmount: estAmt,
      actualAmount: 0,
      currency: currency,
      academicYear: this.getAcademicYear(arrDate)
    };

    const savedReq = await this.apiSync('requests', 'POST', newReq);
    if (savedReq) newReq.id = savedReq.id;
    this.state.requests.unshift(newReq);
    this.populateYearSelect();

    this.showToast("Yeni talep başarıyla oluşturuldu!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.getElementById('form-new-request').reset();
    this.render();
  },

  openNewRequestModal() {
    const form = document.getElementById('form-new-request');
    if (form) form.reset();

    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('nr-arrival-date');
    if (dateInput) dateInput.value = todayStr;

    const assignedSelect = document.getElementById('nr-assigned-to');
    if (assignedSelect) assignedSelect.value = 'Henüz Atanmadı';

    const prioritySelect = document.getElementById('nr-priority');
    if (prioritySelect) prioritySelect.value = 'Orta';

    const pTypeSelect = document.getElementById('nr-purchase-type');
    if (pTypeSelect) pTypeSelect.value = 'MAL';

    const currSelect = document.getElementById('nr-currency');
    if (currSelect) currSelect.value = 'TRY';

    const estInput = document.getElementById('nr-estimated-amount');
    if (estInput) {
      estInput.value = '';
      this.onAmountInput(estInput, 'nr-currency');
    }

    this.openModal('modal-new-request');
  },

  openEditModal(reqId) {
    const req = this.state.requests.find(r => String(r.id) === String(reqId));
    if (!req) {
      this.showToast(`Düzenlenecek talep kaydı (#${reqId}) bulunamadı.`, "error");
      return;
    }

    document.getElementById('er-id').value = req.id;
    if (document.getElementById('er-request-barcode')) {
      document.getElementById('er-request-barcode').value = req.requestBarcode || '';
    }

    // Tarih formatını (DD.MM.YYYY veya YYYY-MM-DD) date input formatına (YYYY-MM-DD) uyarla
    let arrDateVal = req.arrivalDate || req.requestDate || '';
    if (arrDateVal) {
      const dParts = String(arrDateVal).trim().split(/[./-]/);
      if (dParts.length === 3) {
        if (dParts[0].length <= 2 && dParts[2].length >= 4) {
          const day = dParts[0].padStart(2, '0');
          const month = dParts[1].padStart(2, '0');
          let year = dParts[2].trim();
          if (year === '20216') year = '2026';
          else if (year.length > 4) year = year.slice(0, 4);
          arrDateVal = `${year}-${month}-${day}`;
        } else if (dParts[0].length >= 4) {
          let year = dParts[0].trim();
          if (year === '20216') year = '2026';
          else if (year.length > 4) year = year.slice(0, 4);
          const month = dParts[1].padStart(2, '0');
          const day = dParts[2].padStart(2, '0');
          arrDateVal = `${year}-${month}-${day}`;
        }
      }
    }
    if (document.getElementById('er-arrival-date')) {
      document.getElementById('er-arrival-date').value = arrDateVal;
    }

    if (document.getElementById('er-subject')) {
      document.getElementById('er-subject').value = req.subject || '';
    }

    if (document.getElementById('er-purchase-type')) {
      document.getElementById('er-purchase-type').value = req.purchaseType || 'MAL';
    }

    document.getElementById('er-status').value = req.status || 'Açık';

    if (document.getElementById('er-priority')) {
      document.getElementById('er-priority').value = req.priority || 'Orta';
    }

    if (document.getElementById('er-unit')) document.getElementById('er-unit').value = req.unit || '';
    if (document.getElementById('er-assigned-to')) document.getElementById('er-assigned-to').value = req.assignedTo || '';
    document.getElementById('er-order-barcode').value = req.orderBarcode || '';
    
    let orderDateVal = req.orderDate || '';
    if (orderDateVal) {
      const dParts = String(orderDateVal).trim().split(/[./-]/);
      if (dParts.length === 3) {
        if (dParts[0].length <= 2 && dParts[2].length >= 4) {
          const day = dParts[0].padStart(2, '0');
          const month = dParts[1].padStart(2, '0');
          let year = dParts[2].trim();
          if (year.length > 4) year = year.slice(0, 4);
          orderDateVal = `${year}-${month}-${day}`;
        } else if (dParts[0].length >= 4) {
          let year = dParts[0].trim();
          if (year.length > 4) year = year.slice(0, 4);
          const month = dParts[1].padStart(2, '0');
          const day = dParts[2].padStart(2, '0');
          orderDateVal = `${year}-${month}-${day}`;
        }
      }
    }
    document.getElementById('er-order-date').value = orderDateVal;
    document.getElementById('er-supplier').value = req.supplier || '';
    document.getElementById('er-currency').value = req.currency || 'TRY';

    const estInput = document.getElementById('er-estimated-amount');
    if (estInput) {
      const val = req.estimatedAmount || req.budgetAmount;
      estInput.value = val ? val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      this.onAmountInput(estInput, 'er-currency');
    }

    const actInput = document.getElementById('er-actual-amount');
    if (actInput) {
      actInput.value = req.actualAmount ? req.actualAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      this.onAmountInput(actInput, 'er-currency', true);
    }
    
    const regSelect = document.getElementById('er-regulation');
    if (regSelect) {
      let regVal = req.regulation || '';
      if (regVal.startsWith('Madde ')) regVal = regVal.replace('Madde ', '');
      regSelect.value = regVal;
    }

    document.getElementById('er-description').value = req.description || '';

    const titleEl = document.getElementById('edit-modal-title');
    if (titleEl) titleEl.innerText = `✏️ Talep #${req.requestBarcode || req.id} Düzenle`;

    this.openModal('modal-edit-request');
  },

  async handleEditRequest(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('er-id').value);
    const req = this.state.requests.find(r => r.id === id);
    if (!req) return;

    if (document.getElementById('er-request-barcode')) {
      req.requestBarcode = document.getElementById('er-request-barcode').value.trim();
    }
    if (document.getElementById('er-arrival-date')) {
      const arrDate = document.getElementById('er-arrival-date').value;
      req.arrivalDate = arrDate;
      req.requestDate = arrDate;
      req.academicYear = this.getAcademicYear(arrDate);
    }
    if (document.getElementById('er-subject')) {
      req.subject = document.getElementById('er-subject').value.trim();
    }
    if (document.getElementById('er-purchase-type')) {
      req.purchaseType = document.getElementById('er-purchase-type').value || 'MAL';
    }
    if (document.getElementById('er-priority')) {
      req.priority = document.getElementById('er-priority').value;
    }

    if (document.getElementById('er-unit')) document.getElementById('er-unit').value = req.unit || '';
    if (document.getElementById('er-assigned-to')) document.getElementById('er-assigned-to').value = req.assignedTo || '';
    document.getElementById('er-order-barcode').value = req.orderBarcode || '';
    
    let orderDateVal = req.orderDate || '';
    if (orderDateVal) {
      const dParts = String(orderDateVal).trim().split(/[./-]/);
      if (dParts.length === 3) {
        if (dParts[0].length <= 2 && dParts[2].length >= 4) {
          const day = dParts[0].padStart(2, '0');
          const month = dParts[1].padStart(2, '0');
          let year = dParts[2].trim();
          if (year.length > 4) year = year.slice(0, 4);
          orderDateVal = `${year}-${month}-${day}`;
        } else if (dParts[0].length >= 4) {
          let year = dParts[0].trim();
          if (year.length > 4) year = year.slice(0, 4);
          const month = dParts[1].padStart(2, '0');
          const day = dParts[2].padStart(2, '0');
          orderDateVal = `${year}-${month}-${day}`;
        }
      }
    }
    document.getElementById('er-order-date').value = orderDateVal;
    document.getElementById('er-supplier').value = req.supplier || '';
    document.getElementById('er-currency').value = req.currency || 'TRY';

    const estInput = document.getElementById('er-estimated-amount');
    if (estInput) {
      const val = req.estimatedAmount || req.budgetAmount;
      estInput.value = val ? val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      this.onAmountInput(estInput, 'er-currency');
    }

    const actInput = document.getElementById('er-actual-amount');
    if (actInput) {
      actInput.value = req.actualAmount ? req.actualAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      this.onAmountInput(actInput, 'er-currency', true);
    }
    
    const regSelect = document.getElementById('er-regulation');
    if (regSelect) {
      let regVal = req.regulation || '';
      if (regVal.startsWith('Madde ')) regVal = regVal.replace('Madde ', '');
      regSelect.value = regVal;
    }

    document.getElementById('er-description').value = req.description || '';

    const titleEl = document.getElementById('edit-modal-title');
    if (titleEl) titleEl.innerText = `✏️ Talep #${req.requestBarcode || req.id} Düzenle`;

    this.openModal('modal-edit-request');
  },

  async handleEditRequest(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('er-id').value);
    const req = this.state.requests.find(r => r.id === id);
    if (!req) return;

    const barcode = document.getElementById('er-request-barcode')?.value.trim();
    const arrDate = document.getElementById('er-arrival-date')?.value;
    const subject = document.getElementById('er-subject')?.value.trim();
    const unit = document.getElementById('er-unit')?.value;
    const purchaseType = document.getElementById('er-purchase-type')?.value || 'MAL';
    const estAmt = this.parseMoney(document.getElementById('er-estimated-amount')?.value);
    const status = document.getElementById('er-status')?.value || 'Açık';
    const priority = document.getElementById('er-priority')?.value || 'Orta';
    const assignedTo = document.getElementById('er-assigned-to')?.value || 'Henüz Atanmadı';
    const currency = document.getElementById('er-currency')?.value || 'TRY';

    // Sipariş alanları
    const orderBarcode = document.getElementById('er-order-barcode')?.value.trim();
    const orderDate = document.getElementById('er-order-date')?.value.trim();
    const supplier = document.getElementById('er-supplier')?.value.trim();
    const actualAmt = this.parseMoney(document.getElementById('er-actual-amount')?.value);
    const regulation = document.getElementById('er-regulation')?.value.trim();
    const desc = document.getElementById('er-description')?.value.trim();

    // 1. Temel Talep Alanları Zorunluluk Kontrolleri
    if (!barcode) {
      this.showToast("Talep Barkodu zorunlu bir alandır!", "warning", "⚠️");
      document.getElementById('er-request-barcode')?.focus();
      return;
    }
    if (!arrDate) {
      this.showToast("Satınalmaya Geliş Tarihi zorunlu bir alandır!", "warning", "⚠️");
      document.getElementById('er-arrival-date')?.focus();
      return;
    }
    if (!subject) {
      this.showToast("Talep Konusu zorunlu bir alandır!", "warning", "⚠️");
      document.getElementById('er-subject')?.focus();
      return;
    }
    if (!unit) {
      this.showToast("Talep Eden Birim zorunlu bir alandır!", "warning", "⚠️");
      document.getElementById('er-unit')?.focus();
      return;
    }
    if (!purchaseType) {
      this.showToast("Alım Türü (Mal / Hizmet) zorunlu bir alandır!", "warning", "⚠️");
      document.getElementById('er-purchase-type')?.focus();
      return;
    }
    if (!estAmt || estAmt <= 0) {
      this.showToast("Lütfen geçerli bir 'Tahmini / Bütçe Tutarı' giriniz (0'dan büyük olmalıdır)!", "warning", "⚠️");
      document.getElementById('er-estimated-amount')?.focus();
      return;
    }

    // 2. Siparişe Dönüştürme ve Sipariş Bilgileri Zorunluluk Kontrolleri
    // Eğer durum 'Sipariş Verildi' veya 'Tamamlandı' yapılmışsa ya da sipariş alanlarından herhangi biri doldurulmuşsa:
    const isOrderProcess = (status === 'Sipariş Verildi' || status === 'Tamamlandı') || 
                           Boolean(orderBarcode || orderDate || supplier || (actualAmt && actualAmt > 0));

    if (isOrderProcess) {
      if (!purchaseType) {
        this.showToast("Sipariş ve tedarikçi puanlaması için 'Alım Türü' zorunludur!", "warning", "⚠️");
        document.getElementById('er-purchase-type')?.focus();
        return;
      }
      if (!orderBarcode) {
        this.showToast("Sipariş işlemi için 'Sipariş Barkodu / No' zorunlu bir alandır!", "warning", "⚠️");
        document.getElementById('er-order-barcode')?.focus();
        return;
      }
      if (!orderDate) {
        this.showToast("Sipariş işlemi için 'Sipariş Tarihi' zorunlu bir alandır!", "warning", "⚠️");
        document.getElementById('er-order-date')?.focus();
        return;
      }
      if (!supplier) {
        this.showToast("Sipariş işlemi için 'Tedarikçi Adı (Firma)' zorunlu bir alandır!", "warning", "⚠️");
        document.getElementById('er-supplier')?.focus();
        return;
      }
      if (!actualAmt || actualAmt <= 0) {
        this.showToast("Sipariş işlemi için 'Gerçekleşen Tutar' zorunlu bir alandır (0'dan büyük olmalıdır)!", "warning", "⚠️");
        document.getElementById('er-actual-amount')?.focus();
        return;
      }
      if (!regulation || regulation === 'ALL' || regulation === '') {
        this.showToast("Sipariş işlemi için 'Yönetmelik Maddesi' zorunlu bir alandır!", "warning", "⚠️");
        document.getElementById('er-regulation')?.focus();
        return;
      }
    }

    req.requestBarcode = barcode;
    req.arrivalDate = arrDate;
    req.requestDate = arrDate;
    req.academicYear = this.getAcademicYear(arrDate);
    req.subject = subject;
    req.unit = unit;
    req.purchaseType = purchaseType;
    req.priority = priority;
    req.assignedTo = assignedTo;
    req.estimatedAmount = estAmt;
    req.budgetAmount = estAmt;
    req.currency = currency;
    req.orderBarcode = orderBarcode || '';
    req.orderDate = orderDate || '';
    req.supplier = supplier || '';
    req.actualAmount = actualAmt || 0;
    req.regulation = regulation || '';
    req.description = desc || '';

    // Eğer tüm sipariş bilgileri eksiksiz girilmişse ve durum hala 'Açık' ise, otomatik 'Sipariş Verildi' yap
    if (isOrderProcess && status === 'Açık') {
      req.status = 'Sipariş Verildi';
    } else {
      req.status = status;
    }

    await this.apiSync('requests', 'PUT', req);

    this.showToast("Talep ve sipariş bilgileri başarıyla güncellendi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.populateYearSelect();
    this.render();
  },

  // ============================================================
  // 📊 EXECUTIVE EXCEL (XLSX) & PDF PRINT ENGINES
  // ============================================================

  exportToExcelXLSX({ filename, sheetName, title, headers, rows }) {
    const yearStr = this.state.selectedYear === 'ALL' ? 'Tüm Yıllar (Genel)' : `${this.state.selectedYear} Akademik Yılı`;
    const userStr = this.state.currentUser ? this.state.currentUser.name : 'Satınalma Yetkilisi';
    const dateStr = new Date().toLocaleDateString('tr-TR');

    // Check if SheetJS XLSX is available
    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      // Build 2D Array of Rows (AOA)
      const aoa = [
        ["PİRİ REİS ÜNİVERSİTESİ — SATINALMA MÜDÜRLÜĞÜ"],
        [(title || 'RESMİ RAPOR VE LİSTE').toUpperCase()],
        [`Rapor Tarihi: ${dateStr} | Dönem: ${yearStr} | Hazırlayan: ${userStr} | Toplam Kayıt: ${rows.length}`],
        [], // Empty separator row
        headers,
        ...rows
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Auto-calculate column widths based on max content length
      const colProps = headers.map((h, colIdx) => {
        let maxLen = (h || '').toString().length;
        rows.forEach(r => {
          const val = r[colIdx];
          if (val !== undefined && val !== null) {
            const strLen = typeof val === 'number' ? val.toLocaleString('tr-TR').length : val.toString().length;
            if (strLen > maxLen) maxLen = strLen;
          }
        });
        return { wch: Math.min(65, Math.max(maxLen + 4, 12)) };
      });
      ws['!cols'] = colProps;

      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Rapor');
      
      const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename.replace(/\.[^/.]+$/, "")}.xlsx`;
      XLSX.writeFile(wb, cleanFilename);
      this.showToast(`"${cleanFilename}" Excel dosyası başarıyla indirildi!`, "success", "📥");
      this.logAction('Excel Dışa Aktarıldı (XLSX)', `Rapor: ${title}, Kayıt: ${rows.length}`);
      return;
    }

    // Fallback: UTF-8 BOM CSV
    let csv = `PİRİ REİS ÜNİVERSİTESİ — SATINALMA MÜDÜRLÜĞÜ - ${title}\n`;
    csv += `Rapor Tarihi: ${dateStr}; Dönem: ${yearStr}; Raporlayan: ${userStr}\n\n`;
    csv += headers.map(h => `"${(h || '').replace(/"/g, '""')}"`).join(';') + '\n';
    rows.forEach(r => {
      csv += r.map(c => {
        if (c === null || c === undefined) return '""';
        if (typeof c === 'number') return c.toString().replace('.', ',');
        return `"${c.toString().replace(/"/g, '""')}"`;
      }).join(';') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.csv') ? filename : `${filename.replace(/\.[^/.]+$/, "")}.csv`;
    link.click();
    this.showToast("Rapor Excel (CSV) formatında indirildi!", "success", "📥");
  },

  exportRequestsToExcel() {
    const reqs = this.getFilteredRequests();
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const status = document.getElementById('filter-status')?.value || 'ALL';
    const unit = document.getElementById('filter-unit')?.value || 'ALL';
    const priority = document.getElementById('filter-priority')?.value || 'ALL';
    const supplier = document.getElementById('filter-supplier')?.value || 'ALL';

    const filtered = reqs.filter(r => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (unit !== 'ALL' && r.unit !== unit) return false;
      if (priority !== 'ALL' && r.priority !== priority) return false;
      if (supplier !== 'ALL' && r.supplier !== supplier) return false;
      if (search) {
        const barcode = (r.requestBarcode || '').toString().toLowerCase();
        const subject = (r.subject || '').toLowerCase();
        const sup = (r.supplier || '').toLowerCase();
        const un = (r.unit || '').toLowerCase();
        const ord = (r.orderBarcode || '').toString().toLowerCase();
        if (!barcode.includes(search) && !subject.includes(search) && !sup.includes(search) && !un.includes(search) && !ord.includes(search)) {
          return false;
        }
      }
      return true;
    });

    const headers = [
      'Talep Barkod', 'Talep Tarihi', 'Geliş Tarihi', 'Talep Konusu & Malzeme', 'Talep Eden Birim', 
      'Sorumlu Uzman', 'Öncelik', 'Durum', 'Sipariş No', 'Sipariş Tarihi', 
      'Tedarikçi Firma', 'İhale / Mevzuat Maddesi', 'Tahmini Bütçe (TRY)', 'Gerçekleşen Tutar (TRY)', 'Para Birimi', 'Açıklama'
    ];

    let totalEst = 0;
    let totalAct = 0;

    const rows = filtered.map(r => {
      const est = parseFloat(r.estimatedAmount || r.budgetAmount) || 0;
      const act = parseFloat(r.actualAmount) || 0;
      totalEst += est;
      totalAct += act;

      return [
        r.requestBarcode || r.id,
        r.requestDate || '',
        r.arrivalDate || '',
        r.subject || '',
        r.unit || '',
        r.assignedTo || '',
        r.priority || 'Normal',
        r.status || 'Açık',
        r.orderBarcode || '',
        r.orderDate || '',
        r.supplier || '',
        r.regulation ? (r.regulation.startsWith('Madde ') ? r.regulation : `Madde ${r.regulation}`) : '',
        est,
        act,
        r.currency || 'TRY',
        r.description || ''
      ];
    });

    rows.push([
      'GENEL TOPLAM', '', '', `${filtered.length} Adet Talep`, '', 
      '', '', '', '', '', 
      '', '', totalEst, totalAct, 'TRY', ''
    ]);

    this.exportToExcelXLSX({
      filename: `Satinalma_Talepleri_${this.state.selectedYear}`,
      sheetName: 'Satınalma Talepleri',
      title: 'SATINALMA TALEPLERİ VE SİPARİŞ LİSTESİ',
      headers: headers,
      rows: rows
    });
  },

  exportContractsToExcel() {
    const contracts = this.state.contracts || [];
    const search = (document.getElementById('filter-contract-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('filter-contract-status')?.value || 'ALL';

    const filtered = contracts.filter(c => {
      if (status !== 'ALL' && c.status !== status) return false;
      if (search) {
        const no = (c.contractNo || '').toLowerCase();
        const sup = (c.supplier || '').toLowerCase();
        const subj = (c.subject || '').toLowerCase();
        if (!no.includes(search) && !sup.includes(search) && !subj.includes(search)) return false;
      }
      return true;
    });

    const headers = [
      'Sözleşme No', 'Yüklenici / Tedarikçi Firma', 'Sözleşme Konusu', 'Sorumlu Birim',
      'Başlangıç Tarihi', 'Bitiş Tarihi', 'Sözleşme Bedeli', 'Para Birimi', 'Durum', 'Açıklama'
    ];

    let grandTotal = 0;
    const rows = filtered.map(c => {
      const amt = parseFloat(c.amount) || 0;
      grandTotal += amt;
      return [
        c.contractNo || c.id,
        c.supplier || '',
        c.subject || '',
        c.unit || '',
        c.startDate || '',
        c.endDate || '',
        amt,
        c.currency || 'TRY',
        c.status || 'Aktif',
        c.notes || ''
      ];
    });

    rows.push([
      'GENEL TOPLAM', `${filtered.length} Sözleşme`, '', '',
      '', '', grandTotal, 'TRY', '', ''
    ]);

    this.exportToExcelXLSX({
      filename: `Kurumsal_Sozlesmeler_${this.state.selectedYear}`,
      sheetName: 'Sözleşmeler',
      title: 'KURUMSAL SÖZLEŞMELER VE YÜKLENİCİ ÇİZELGESİ',
      headers: headers,
      rows: rows
    });
  },

  exportInvoicesToExcel() {
    const invoices = this.state.invoices || [];
    const search = (document.getElementById('filter-invoice-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('filter-invoice-status')?.value || 'ALL';

    const filtered = invoices.filter(inv => {
      if (status !== 'ALL' && inv.status !== status) return false;
      if (search) {
        const no = (inv.invoiceNo || '').toLowerCase();
        const sup = (inv.supplier || '').toLowerCase();
        if (!no.includes(search) && !sup.includes(search)) return false;
      }
      return true;
    });

    const headers = [
      'Fatura No', 'Tedarikçi Firma', 'Fatura Tarihi', 'Vade Tarihi', 
      'Fatura Tutarı', 'Para Birimi', 'Ödeme Durumu', 'Ödeme Tarihi', 'İlişkili Talep/Sözleşme', 'Açıklama'
    ];

    let grandTotal = 0;
    const rows = filtered.map(inv => {
      const amt = parseFloat(inv.amount) || 0;
      grandTotal += amt;
      return [
        inv.invoiceNo || inv.id,
        inv.supplier || '',
        inv.invoiceDate || '',
        inv.dueDate || '',
        amt,
        inv.currency || 'TRY',
        inv.status || 'Ödeme Bekliyor',
        inv.paymentDate || '',
        inv.relatedRequestBarcode || '',
        inv.notes || ''
      ];
    });

    rows.push([
      'GENEL TOPLAM', `${filtered.length} Fatura`, '', '',
      grandTotal, 'TRY', '', '', '', ''
    ]);

    this.exportToExcelXLSX({
      filename: `Fatura_Listesi_${this.state.selectedYear}`,
      sheetName: 'Faturalar',
      title: 'FATURA VE ÖDEME TAKİP LİSTESİ',
      headers: headers,
      rows: rows
    });
  },

  exportGuaranteesToExcel() {
    const guarantees = this.state.guarantees || [];
    const search = (document.getElementById('filter-guarantee-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('filter-guarantee-status')?.value || 'ALL';
    const type = document.getElementById('filter-guarantee-type')?.value || 'ALL';

    const filtered = guarantees.filter(g => {
      if (status !== 'ALL' && g.status !== status) return false;
      if (type !== 'ALL' && g.type !== type) return false;
      if (search) {
        const no = (g.letterNo || '').toLowerCase();
        const bank = (g.bank || '').toLowerCase();
        const sup = (g.supplier || '').toLowerCase();
        if (!no.includes(search) && !bank.includes(search) && !sup.includes(search)) return false;
      }
      return true;
    });

    const headers = [
      'Mektup No', 'Banka Adı', 'Teminat Türü', 'Tedarikçi / Yüklenici', 'İlişkili İhale / İş',
      'Teminat Tutarı', 'Para Birimi', 'Düzenleme Tarihi', 'Vade Tarihi', 'Kasa Konumu', 'Durum', 'Notlar'
    ];

    let grandTotal = 0;
    const rows = filtered.map(g => {
      const amt = parseFloat(g.amount) || 0;
      grandTotal += amt;
      return [
        g.letterNo || g.id,
        g.bank || '',
        g.type || '',
        g.supplier || '',
        g.relatedWork || '',
        amt,
        g.currency || 'TRY',
        g.issueDate || '',
        g.expiryDate || '',
        g.storageLocation || '',
        g.status || 'Aktif',
        g.notes || ''
      ];
    });

    rows.push([
      'GENEL TOPLAM', `${filtered.length} Teminat Mektubu`, '', '', '',
      grandTotal, 'TRY', '', '', '', '', ''
    ]);

    this.exportToExcelXLSX({
      filename: `Teminat_Mektuplari_${this.state.selectedYear}`,
      sheetName: 'Teminat Mektupları',
      title: 'TEMİNAT MEKTUPLARI VE KASA ÇİZELGESİ',
      headers: headers,
      rows: rows
    });
  },

  exportUnitAnalysisToExcel() {
    const requests = this.getFilteredRequests();
    const unitMap = {};
    let totalSpendAll = 0;

    requests.forEach(r => {
      const u = r.unit || 'Diğer / Belirtilmemiş';
      const sp = parseFloat(r.actualAmount) || 0;
      totalSpendAll += sp;
      if (!unitMap[u]) {
        unitMap[u] = { count: 0, completed: 0, open: 0, spend: 0, waitDays: 0, compWithDates: 0 };
      }
      unitMap[u].count++;
      if (r.status === 'Tamamlandı') unitMap[u].completed++;
      else unitMap[u].open++;
      unitMap[u].spend += sp;

      if (r.arrivalDate && r.orderDate) {
        const d1 = new Date(r.arrivalDate);
        const d2 = new Date(r.orderDate);
        const diff = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        if (!isNaN(diff) && diff >= 0 && diff < 180) {
          unitMap[u].waitDays += diff;
          unitMap[u].compWithDates++;
        }
      }
    });

    const sortedUnits = Object.entries(unitMap).sort((a,b) => b[1].spend - a[1].spend);
    const headers = [
      'Sıra', 'Birim / Fakülte Adı', 'Talep Adedi', 'Tamamlanan', 'Açık / İşlemde', 
      'Bütçe Payı %', 'Ortalama Temin Süresi (SLA Gün)', 'Toplam Harcama (TRY)'
    ];

    let grandCount = 0;
    let grandCompleted = 0;
    let grandOpen = 0;

    const rows = sortedUnits.map(([unitName, s], idx) => {
      grandCount += s.count;
      grandCompleted += s.completed;
      grandOpen += s.open;
      const share = totalSpendAll > 0 ? ((s.spend / totalSpendAll) * 100).toFixed(1) : 0;
      const sla = s.compWithDates > 0 ? (s.waitDays / s.compWithDates).toFixed(1) : '-';

      return [
        idx + 1,
        unitName,
        s.count,
        s.completed,
        s.open,
        parseFloat(share),
        sla === '-' ? 0 : parseFloat(sla),
        s.spend
      ];
    });

    rows.push([
      '', 'GENEL TOPLAM', grandCount, grandCompleted, grandOpen,
      100, '', totalSpendAll
    ]);

    this.exportToExcelXLSX({
      filename: `Birim_Harcama_Analizi_${this.state.selectedYear}`,
      sheetName: 'Birim Analizi',
      title: 'BİRİM BAZLI HARCAMA VE PERFORMANS CETVELİ',
      headers: headers,
      rows: rows
    });
  },

  exportSupplierAnalysisToExcel() {
    const requests = this.getFilteredRequests();
    const searchVal = (document.getElementById('filter-supplier-search')?.value || '').toLowerCase().trim();
    const unitVal = document.getElementById('filter-supplier-unit')?.value || 'ALL';
    const tierVal = document.getElementById('filter-supplier-tier')?.value || 'ALL';
    const sortVal = document.getElementById('filter-supplier-sort')?.value || 'SPEND_DESC';

    const suppMap = {};
    let totalSpendAll = 0;

    requests.forEach(r => {
      const s = (r.supplier && r.supplier !== '-') ? r.supplier.trim() : 'Diğer / Belirtilmemiş';
      if (unitVal !== 'ALL' && r.unit !== unitVal) return;

      const sp = parseFloat(r.actualAmount) || 0;
      totalSpendAll += sp;
      if (!suppMap[s]) {
        suppMap[s] = { count: 0, completed: 0, open: 0, spend: 0 };
      }
      suppMap[s].count++;
      if (r.status === 'Tamamlandı') suppMap[s].completed++;
      else suppMap[s].open++;
      suppMap[s].spend += sp;
    });

    let sortedSuppliers = Object.entries(suppMap);

    if (searchVal) {
      sortedSuppliers = sortedSuppliers.filter(([sName]) => sName.toLowerCase().includes(searchVal));
    }

    if (tierVal !== 'ALL') {
      sortedSuppliers = sortedSuppliers.filter(([sName]) => {
        const score = this.getVendorScore(sName);
        const tier = this.getVendorTier(score?.overall, score?.count);
        return tier.key === tierVal;
      });
    }

    if (sortVal === 'COUNT_DESC') {
      sortedSuppliers.sort((a, b) => b[1].count - a[1].count);
    } else if (sortVal === 'NAME_ASC') {
      sortedSuppliers.sort((a, b) => a[0].localeCompare(b[0], 'tr'));
    } else if (sortVal === 'SCORE_DESC') {
      sortedSuppliers.sort((a, b) => {
        const scoreA = parseFloat(this.getVendorScore(a[0])?.overall || 0);
        const scoreB = parseFloat(this.getVendorScore(b[0])?.overall || 0);
        return scoreB - scoreA;
      });
    } else {
      sortedSuppliers.sort((a, b) => b[1].spend - a[1].spend);
    }

    const headers = [
      'Sıra',
      'Tedarikçi Firma Adı',
      'Seviye / Segment (Tier)',
      'Genel Karne Puanı',
      'Değerlendirme Adedi',
      'Mal Alımı Puanı',
      'Hizmet Alımı Puanı',
      'Ürün Kalitesi Puanı',
      'Teslimat Hızı Puanı',
      'Montaj / İşçilik Puanı',
      'Garanti & Evrak Puanı',
      'Talep Adedi',
      'Tamamlanan Sipariş',
      'Açık / İşlemde',
      'Toplam Harcama (TRY)',
      'Bütçe Payı %'
    ];

    let grandCount = 0;
    let grandCompleted = 0;
    let grandOpen = 0;
    let grandSpend = 0;

    const rows = sortedSuppliers.map(([suppName, s], idx) => {
      grandCount += s.count;
      grandCompleted += s.completed;
      grandOpen += s.open;
      grandSpend += s.spend;
      const share = totalSpendAll > 0 ? ((s.spend / totalSpendAll) * 100).toFixed(1) : 0;
      const score = this.getVendorScore(suppName);
      const tier = this.getVendorTier(score?.overall, score?.count);

      return [
        idx + 1,
        suppName,
        tier.label,
        score ? parseFloat(score.overall) : 'Puanlanmadı',
        score ? score.count : 0,
        score && score.goodsAvg ? parseFloat(score.goodsAvg) : '-',
        score && score.serviceAvg ? parseFloat(score.serviceAvg) : '-',
        score && score.quality ? parseFloat(score.quality) : '-',
        score && score.speed ? parseFloat(score.speed) : '-',
        score && score.assembly ? parseFloat(score.assembly) : '-',
        score && score.compliance ? parseFloat(score.compliance) : '-',
        s.count,
        s.completed,
        s.open,
        s.spend,
        parseFloat(share)
      ];
    });

    rows.push([
      '', 'GENEL TOPLAM', '', '', '', '', '', '', '', '', '',
      grandCount, grandCompleted, grandOpen, grandSpend, 100
    ]);

    this.exportToExcelXLSX({
      filename: `Tedarikci_Performans_ve_Harcama_Analizi_${this.state.selectedYear}`,
      sheetName: 'Tedarikçi Karnesi',
      title: 'TEDARİKÇİ PERFORMANS KARNESİ, SEGMENTASYON VE HARCAMA RAPORU',
      headers: headers,
      rows: rows
    });
  },

  exportYearlyFinancialToExcel() {
    const requests = this.getFilteredRequests();
    const months = ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos'];
    const monthlyData = Array(12).fill(0).map(() => ({ count: 0, est: 0, act: 0, sav: 0 }));

    let totalSpend = 0;
    let totalEstimated = 0;
    let totalSavings = 0;

    requests.forEach(r => {
      const act = parseFloat(r.actualAmount) || 0;
      const est = parseFloat(r.estimatedAmount || r.budgetAmount || act) || 0;
      const sav = Math.max(0, est - act);

      totalSpend += act;
      totalEstimated += est;
      totalSavings += sav;

      if (r.requestDate) {
        const m = parseInt(r.requestDate.split('-')[1]) - 1;
        const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
        if (acadIdx >= 0 && acadIdx < 12) {
          monthlyData[acadIdx].count++;
          monthlyData[acadIdx].est += est;
          monthlyData[acadIdx].act += act;
          monthlyData[acadIdx].sav += sav;
        }
      }
    });

    const headers = [
      'Ay (Akademik Yıl)', 'Talep Adedi', 'Tahmini Bütçe (TRY)', 'Gerçekleşen Harcama (TRY)', 'Pazarlık Tasarrufu (TRY)', 'Tasarruf Oranı %'
    ];

    const rows = months.map((mName, i) => {
      const d = monthlyData[i];
      const rate = d.est > 0 ? ((d.sav / d.est) * 100).toFixed(1) : 0;
      return [
        mName,
        d.count,
        d.est,
        d.act,
        d.sav,
        parseFloat(rate)
      ];
    });

    const grandRate = totalEstimated > 0 ? ((totalSavings / totalEstimated) * 100).toFixed(1) : 0;
    rows.push([
      'GENEL TOPLAM', requests.length, totalEstimated, totalSpend, totalSavings, parseFloat(grandRate)
    ]);

    this.exportToExcelXLSX({
      filename: `Yillik_Finansal_Faaliyet_Raporu_${this.state.selectedYear}`,
      sheetName: 'Finansal Rapor',
      title: 'YILLIK SATINALMA FAALİYET, BÜTÇE VE TASARRUF CETVELİ',
      headers: headers,
      rows: rows
    });
  },

  exportLogsToExcel() {
    const logs = this.state.logs || [];
    const headers = ['Zaman / Tarih', 'Kullanıcı', 'Eylem Türü', 'Detay'];
    const rows = logs.map(l => [
      l.timestamp || '',
      l.user || 'Sistem',
      l.action || '',
      l.details || ''
    ]);

    this.exportToExcelXLSX({
      filename: `Sistem_Loglari_${new Date().toISOString().split('T')[0]}`,
      sheetName: 'Loglar',
      title: 'SİSTEM AKTİVİTE VE DENETİM LOGLARI',
      headers: headers,
      rows: rows
    });
  },

  exportDelegationToExcel() {
    const reqs = this.getFilteredRequests().filter(r => r.status === 'Açık');
    const headers = ['Talep Barkod', 'Talep Konusu', 'Talep Eden Birim', 'Atanan Uzman', 'Öncelik', 'Geliş Tarihi'];
    const rows = reqs.map(r => [
      r.requestBarcode || r.id,
      r.subject || '',
      r.unit || '',
      r.assignedTo || '',
      r.priority || '',
      r.arrivalDate || ''
    ]);

    this.exportToExcelXLSX({
      filename: `Delegasyon_Listesi_${this.state.selectedYear}`,
      sheetName: 'Delegasyon',
      title: 'İŞ YÜKÜ VE PERSONEL DELEGASYON LİSTESİ',
      headers: headers,
      rows: rows
    });
  },

  exportWeeklyPaymentsToExcel() {
    const invoices = this.state.invoices || [];
    const openInvoices = invoices.filter(i => i.status !== 'Ödendi');
    const headers = ['Fatura No', 'Tedarikçi Firma', 'Vade Tarihi', 'Fatura Tutarı (TRY)', 'Para Birimi', 'Durum'];

    let grandTotal = 0;
    const rows = openInvoices.map(inv => {
      const amt = parseFloat(inv.amount) || 0;
      grandTotal += amt;
      return [
        inv.invoiceNo || inv.id,
        inv.supplier || '',
        inv.dueDate || '',
        amt,
        inv.currency || 'TRY',
        inv.status || ''
      ];
    });

    rows.push(['GENEL TOPLAM', `${openInvoices.length} Fatura`, '', grandTotal, 'TRY', '']);

    this.exportToExcelXLSX({
      filename: `Haftalik_Odeme_Plani_${new Date().toISOString().split('T')[0]}`,
      sheetName: 'Haftalık Ödemeler',
      title: 'HAFTALIK NAKİT VE FATURA ÖDEME PLANI',
      headers: headers,
      rows: rows
    });
  },

  printSection(sectionId = null, docTitle = 'SATINALMA FAALİYET VE HARCAMA RAPORU') {
    let secEl = sectionId ? document.getElementById(sectionId) : null;
    if (!secEl) {
      secEl = document.querySelector('.view-section:not([style*="display: none"]):not([style*="display:none"])');
    }

    if (!secEl) {
      window.print();
      return;
    }

    const todayStr = new Date().toLocaleDateString('tr-TR');
    const yearStr = this.state.selectedYear === 'ALL' ? 'Tüm Yıllar (Genel)' : `${this.state.selectedYear} Akademik Yılı`;

    // Create Clean Header Banner
    const banner = document.createElement('div');
    banner.className = 'print-header-banner';
    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; width:100%; border-bottom:2px solid #0f172a; padding-bottom:6px; margin-bottom:8px;">
        <div style="text-align:left;">
          <div style="font-size:1.15rem; font-weight:800; color:#0f172a; letter-spacing:0.01em;">Piri Reis Üniversitesi — Satınalma Müdürlüğü</div>
          <div style="font-size:0.92rem; font-weight:700; color:#1e3a8a; margin-top:2px;">${docTitle}</div>
        </div>
        <div style="text-align:right; font-size:7.5pt; color:#475569; line-height:1.3;">
          <div><strong>Rapor Tarihi:</strong> ${todayStr}</div>
          <div><strong>Kapsam Dönemi:</strong> ${yearStr}</div>
        </div>
      </div>
    `;
    secEl.insertBefore(banner, secEl.firstChild);

    secEl.classList.add('active-print');

    // If printing requests view, temporarily render all requests without pagination limit
    let originalPage = this.state.currentPage;
    let originalSize = this.state.pageSize;
    if (sectionId === 'view-requests') {
      this.state.pageSize = 500;
      this.state.currentPage = 1;
      this.renderRequestsTable();
    }

    window.print();

    // Clean up print DOM
    banner.remove();
    secEl.classList.remove('active-print');

    if (sectionId === 'view-requests') {
      this.state.pageSize = originalSize;
      this.state.currentPage = originalPage;
      this.renderRequestsTable();
    }
  },

  async fetchBackups() {
    try {
      const tbody = document.getElementById('tbody-backups-list');
      if (!tbody) return;
      
      const res = await this.authFetch('/api/backups');
      if (res.ok) {
        const backups = await res.json();
        if (!backups || backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">Henüz yedek dosyası bulunmuyor. \'Şimdi Manuel Yedek Al\' butonuna basarak ilk yedeğinizi alabilirsiniz.</td></tr>';
          return;
        }
        tbody.innerHTML = backups.map(b => `
          <tr>
            <td style="font-weight:600; font-family:var(--font-mono); font-size:0.8rem;">💾 ${b.filename}</td>
            <td style="font-size:0.82rem;">${b.createdAt || '-'}</td>
            <td><span class="badge priority-orta">${b.size || '0 KB'}</span></td>
            <td style="text-align:center;">
              <a href="/api/backups/download/${encodeURIComponent(b.filename)}" class="btn-icon" title="Bilgisayara İndir (.json)" download style="text-decoration:none; display:inline-block;">📥</a>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error("Error fetching backups:", err);
    }
  },

  async triggerManualBackup() {
    try {
      const btn = document.getElementById('btn-trigger-backup-now');
      if (btn) btn.innerHTML = '<span>⌛</span> Yedek Alınıyor...';

      const res = await this.authFetch('/api/backup-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.showToast(`Otomatik Veri Yedeği Oluşturuldu (${data.filename})`, "success", "💾");
          this.logAction('Manuel Veri Yedeği Alındı', `Yedek Dosyası: ${data.filename}`);
          await this.fetchBackups();
        } else {
          this.showToast(`Hata: ${data.error}`, "error");
        }
      }
    } catch (err) {
      console.error("Backup error:", err);
      this.showToast("Yedek alınırken sunucu hatası oluştu.", "error");
    } finally {
      const btn = document.getElementById('btn-trigger-backup-now');
      if (btn) btn.innerHTML = '<span>💾</span> Şimdi Manuel Yedek Al';
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
