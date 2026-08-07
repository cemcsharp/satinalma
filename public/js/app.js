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
    charts: {}
  },

  async init() {
    console.log("Initializing Satınalma Takip App...");
    this.initTheme();
    this.bindEvents();
    await this.fetchInitialData();
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
      const res = await fetch('/api/data');
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
        this.state.logs = data.logs || [];
        if (data.rates) this.state.rates = data.rates;
        this.state.dismissedNotifs = JSON.parse(localStorage.getItem('dismissedNotifs') || '[]');

        this.populateLoginDropdown();
        this.populateDropdowns();
        this.populateYearSelect();

        // Restore login session from localStorage
        const savedUserId = localStorage.getItem('loggedInUserId');
        if (savedUserId) {
          const user = this.state.users.find(u => u.id === parseInt(savedUserId));
          if (user) {
            this.state.currentUser = user;
            this.state.isLoggedIn = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            this.updateUserProfileCard();

            const savedView = localStorage.getItem('activeView') || 'dashboard';
            this.switchView(savedView);
            this.handleHashRoute();
          }
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  },

  populateLoginDropdown() {
    const loginSelect = document.getElementById('login-screen-user-select');
    if (!loginSelect) return;
    const currentVal = loginSelect.value;
    
    // Sort active users first
    const sortedUsers = [...(this.state.users || [])].sort((a,b) => (b.isActive?1:0) - (a.isActive?1:0));
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
    const unitSelects = ['filter-unit', 'select-unit-analysis', 'nr-unit', 'er-unit', 'cm-unit', 'filter-contract-unit', 'filter-my-unit', 'filter-supplier-unit', 'filter-delegation-unit'];
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

  handleLogin(e) {
    e.preventDefault();
    const selectedUserId = parseInt(document.getElementById('login-screen-user-select').value);
    const passInput = document.getElementById('login-screen-password').value;
    const user = this.state.users.find(u => u.id === selectedUserId);
    const errMsg = document.getElementById('login-error-msg');

    if (user) {
      const validPass = user.password || '123';
      if (passInput === validPass) {
        this.state.currentUser = user;
        this.state.isLoggedIn = true;
        localStorage.setItem('loggedInUserId', user.id);
        
        if (errMsg) errMsg.style.display = 'none';
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        this.updateUserProfileCard();
        const savedView = localStorage.getItem('activeView') || 'dashboard';
        this.switchView(savedView);
      } else {
        if (errMsg) errMsg.style.display = 'block';
      }
    }
  },

  handleLogout() {
    this.state.isLoggedIn = false;
    this.state.currentUser = null;
    localStorage.removeItem('loggedInUserId');
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-screen-password').value = '';
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

  handlePortalSearch(query) {
    const resultsBox = document.getElementById('portal-search-results');
    if (!resultsBox) return;

    // Temizleme: Baştaki # simgesi ve fazla boşluklar temizlenir
    const cleanQ = query?.toString().replace(/^#/, '').toLowerCase().trim();
    if (!cleanQ || cleanQ.length < 2) {
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          🔒 Sorgulamak istediğiniz talep barkod numarasını eksiksiz girin.
        </div>
      `;
      return;
    }

    // Bilgi Güvenliği & Gizlilik: Yalnızca Barkod No veya Sipariş No sorgulanır
    const matches = (this.state.requests || []).filter(r => {
      const reqBc = r.requestBarcode?.toString().toLowerCase().trim() || '';
      const ordBc = r.orderBarcode?.toString().toLowerCase().trim() || '';
      return reqBc === cleanQ || ordBc === cleanQ;
    }).slice(0, 5);

    if (matches.length === 0) {
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
      else if (r.status === 'Reddedildi') orderStatusText = '❌ İptal Edildi';
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
            <span class="badge status-${r.status?.toLowerCase()}">${r.status}</span>
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
    document.getElementById('btn-open-add-user')?.addEventListener('click', () => this.openUserModal());
    document.getElementById('btn-open-add-contract')?.addEventListener('click', () => this.openContractModal());
    document.getElementById('btn-open-add-guarantee')?.addEventListener('click', () => this.openGuaranteeModal());
    document.getElementById('btn-open-add-invoice')?.addEventListener('click', () => this.openInvoiceModal());

    // Settings Action Buttons (Birim & Yönetmelik Maddesi & Backup & Excel Import)
    document.getElementById('btn-add-unit')?.addEventListener('click', () => this.handleAddUnit());
    document.getElementById('btn-add-regulation')?.addEventListener('click', () => this.handleAddRegulation());
    document.getElementById('btn-trigger-backup-now')?.addEventListener('click', () => this.triggerBackupNow());
    document.getElementById('btn-download-excel-template')?.addEventListener('click', () => this.downloadExcelTemplate());
    document.getElementById('btn-update-system')?.addEventListener('click', () => this.handleUpdateSystem());
    document.getElementById('btn-reimport-excel')?.addEventListener('click', () => {
      document.getElementById('input-excel-file')?.click();
    });
    document.getElementById('input-excel-file')?.addEventListener('change', (e) => this.handleExcelFileSelect(e));
    
    // Press Enter inside input to add unit/regulation
    document.getElementById('input-new-unit-name')?.addEventListener('keypress', (e) => {
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
    document.getElementById('form-contract-manage')?.addEventListener('submit', (e) => this.handleSaveContract(e));
    document.getElementById('form-guarantee-manage')?.addEventListener('submit', (e) => this.handleSaveGuarantee(e));
    document.getElementById('form-invoice-manage')?.addEventListener('submit', (e) => this.handleSaveInvoice(e));

    // Notification Center Event Listeners
    document.getElementById('btn-mark-all-notifications-read')?.addEventListener('click', () => this.markAllNotificationsRead());
    document.getElementById('filter-notif-category')?.addEventListener('change', () => this.renderNotificationsView());

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
    document.getElementById('btn-print-yearly-report')?.addEventListener('click', () => window.print());
    document.getElementById('btn-export-yearly-excel')?.addEventListener('click', () => this.exportTableToExcel('table-yearly-monthly', 'Yillik_Faaliyet_Raporu.xls'));

    document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportToCSV());
    document.getElementById('btn-export-requests-pdf')?.addEventListener('click', () => this.printSection('view-requests'));

    document.getElementById('btn-export-my-pdf')?.addEventListener('click', () => this.printSection('view-my-requests'));

    document.getElementById('btn-export-contracts-excel')?.addEventListener('click', () => this.exportTableToExcel('table-contracts', 'Sozlesme_Listesi.xls'));
    document.getElementById('btn-export-contracts-pdf')?.addEventListener('click', () => this.printSection('view-contracts'));

    document.getElementById('btn-export-invoices-excel')?.addEventListener('click', () => this.exportTableToExcel('table-invoices', 'Fatura_Listesi.xls'));
    document.getElementById('btn-export-invoices-pdf')?.addEventListener('click', () => this.printSection('view-invoices'));

    document.getElementById('btn-export-unit-excel')?.addEventListener('click', () => this.exportTableToExcel('table-unit-detailed', 'Birim_Analizi.xls'));
    document.getElementById('btn-export-unit-pdf')?.addEventListener('click', () => this.printSection('view-unit-analysis'));

    document.getElementById('btn-export-supplier-excel')?.addEventListener('click', () => this.exportTableToExcel('table-supplier-detailed', 'Tedarikci_Analizi.xls'));
    document.getElementById('btn-export-supplier-pdf')?.addEventListener('click', () => this.printSection('view-supplier-analysis'));

    document.getElementById('btn-export-logs-excel')?.addEventListener('click', () => this.exportTableToExcel('table-activity-logs', 'Aktivite_Loglari.xls'));
    document.getElementById('btn-export-logs-pdf')?.addEventListener('click', () => this.printSection('view-activity-logs'));

    document.getElementById('btn-export-delegation-excel')?.addEventListener('click', () => this.exportTableToExcel('table-delegation-requests', 'Delegasyon_Listesi.xls'));
    document.getElementById('btn-export-delegation-pdf')?.addEventListener('click', () => this.printSection('view-workload'));

    // Manual Backup Button
    document.getElementById('btn-trigger-backup-now')?.addEventListener('click', () => this.triggerManualBackup());

    // Export Weekly Payment Schedule to CSV
    document.getElementById('btn-export-weekly-payments')?.addEventListener('click', () => this.exportWeeklyPaymentsToCSV());

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
    ['filter-supplier-search', 'filter-supplier-unit', 'filter-supplier-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderSupplierAnalysis());
        el.addEventListener('change', () => this.renderSupplierAnalysis());
      }
    });

    // Save Currency Rates
    document.getElementById('btn-save-rates')?.addEventListener('click', async () => {
      const usd = parseFloat(document.getElementById('setting-rate-usd').value) || 36.50;
      const eur = parseFloat(document.getElementById('setting-rate-eur').value) || 39.80;
      this.state.rates = { USD: usd, EUR: eur, lastUpdated: new Date().toLocaleString('tr-TR') };
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates: this.state.rates }) }).catch(e => console.error(e));
      this.logAction('Döviz Kuru Güncellendi', `USD: ${usd} ₺, EUR: ${eur} ₺`);
      this.showToast("Döviz kurları başarıyla güncellendi!", "success");
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

    // Filter for Unit Analysis
    document.getElementById('filter-unit-search')?.addEventListener('input', () => this.renderUnitAnalysis());
    document.getElementById('select-unit-analysis')?.addEventListener('change', () => this.renderUnitAnalysis());
  },

  async fetchTCMBRates() {
    try {
      const btn = document.getElementById('btn-fetch-tcmb-rates');
      if (btn) btn.innerText = '⌛ Merkez Bankası\'na Bağlanılıyor...';

      const res = await fetch('/api/fetch-tcmb-rates');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.state.rates = {
            USD: data.USD,
            EUR: data.EUR,
            lastUpdated: data.lastUpdated
          };

          const usdInput = document.getElementById('setting-rate-usd');
          const eurInput = document.getElementById('setting-rate-eur');
          const dateLabel = document.getElementById('rate-last-updated');

          if (usdInput) usdInput.value = data.USD;
          if (eurInput) eurInput.value = data.EUR;
          if (dateLabel) dateLabel.innerText = `TCMB Güncelleme: ${data.lastUpdated}`;

          await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates: this.state.rates }) }).catch(e => console.error(e));
          this.logAction('TCMB Kurları Çekildi', `Merkez Bankası Satış Kurları -> USD: ${data.USD} ₺, EUR: ${data.EUR} ₺ (${data.lastUpdated})`);
          this.showToast(`TCMB Kurları Başarıyla Çekildi! (USD: ${data.USD} ₺, EUR: ${data.EUR} ₺)`, "success", "🏛️");
          this.render();
        } else {
          this.showToast("TCMB kurları alınırken bir hata oluştu: " + data.error, "error");
        }
      }
    } catch (err) {
      console.error("Error fetching TCMB rates:", err);
      this.showToast("Merkez Bankası sunucusuna bağlanılamadı.", "error");
    } finally {
      const btn = document.getElementById('btn-fetch-tcmb-rates');
      if (btn) btn.innerHTML = '<span>⚡</span> TCMB\'den Kurları Otomatik Çek';
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
    const view = this.state.currentView;
    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'requests') this.renderRequestsTable();
    else if (view === 'workload') this.renderWorkloadView();
    else if (view === 'my-requests') this.renderMyRequestsTable();
    else if (view === 'notifications') this.renderNotificationsView();
    else if (view === 'contracts') this.renderContracts();
    else if (view === 'guarantees') this.renderGuarantees();
    else if (view === 'invoices') this.renderInvoices();
    else if (view === 'unit-analysis') this.renderUnitAnalysis();
    else if (view === 'supplier-analysis') this.renderSupplierAnalysis();
    else if (view === 'yearly-report') this.renderYearlyReport();
    else if (view === 'activity-logs') this.renderActivityLogs();
    else if (view === 'settings') this.renderSettings();
  },

  // 🔔 NOTIFICATION CENTER & ALERTS (GÜNCELLENMİŞ VE GELİŞTİRİLMİŞ)
  getAllNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dismissed = this.state.dismissedNotifs || [];
    const allNotifs = [];

    // 1. SLA 14+ Days Overdue Requests
    const overdueRequests = (this.state.requests || []).filter(r => {
      if (r.status !== 'Açık') return false;
      const d = new Date(r.arrivalDate || r.requestDate);
      d.setHours(0, 0, 0, 0);
      const diff = Math.max(0, Math.ceil((today - d) / (1000 * 60 * 60 * 24)));
      return diff >= 14;
    });

    overdueRequests.forEach(r => {
      const id = `sla_${r.id}`;
      const d = new Date(r.arrivalDate || r.requestDate);
      d.setHours(0, 0, 0, 0);
      const diff = Math.max(0, Math.ceil((today - d) / (1000 * 60 * 60 * 24)));

      allNotifs.push({
        id: id,
        category: 'SLA',
        icon: '🚨',
        title: `Barkod #${r.requestBarcode || r.id} — ${r.subject || 'Talep'} (${diff} Gün Gecikmede!)`,
        sub: `Birim: ${r.unit} | Atanan: ${r.assignedTo || 'Atanmadı'} | Geliş: ${r.arrivalDate || r.requestDate}`,
        date: r.arrivalDate || r.requestDate,
        isRead: dismissed.includes(id) || dismissed.includes('sla'),
        action: () => {
          this.switchView('requests');
          setTimeout(() => this.viewRequestDetails(r.id), 100);
        }
      });
    });

    // 2. Contracts Expiring in <= 30 Days
    const activeContracts = (this.state.contracts || []).filter(c => c.status === 'Aktif');
    activeContracts.forEach(c => {
      if (c.endDate) {
        const endDt = new Date(c.endDate);
        endDt.setHours(0, 0, 0, 0);
        const diff = Math.ceil((endDt - today) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff <= 30) {
          const id = `contract_${c.id}`;
          allNotifs.push({
            id: id,
            category: 'CONTRACT',
            icon: '📑',
            title: `Sözleşme #${c.contractNo || c.id} — ${c.title} (Son ${diff} Gün!)`,
            sub: `Yüklenici: ${c.supplier} | Bitiş Tarihi: ${c.endDate} | Tutar: ${c.totalAmount?.toLocaleString('tr-TR')} ₺`,
            date: c.endDate,
            isRead: dismissed.includes(id) || dismissed.includes('contract'),
            action: () => {
              this.switchView('contracts');
              setTimeout(() => this.viewContractDetails(c.id), 100);
            }
          });
        }
      }
    });

    // 3. Guarantees Expiring in <= 30 Days
    const activeGuarantees = (this.state.guarantees || []).filter(g => g.status === 'Aktif' || g.status === 'Vadesi Yaklaşan');
    activeGuarantees.forEach(g => {
      if (g.expiryDate) {
        const expDt = new Date(g.expiryDate);
        expDt.setHours(0, 0, 0, 0);
        const diff = Math.ceil((expDt - today) / (1000 * 60 * 60 * 24));
        if (diff <= 30) {
          const id = `guarantee_${g.id}`;
          allNotifs.push({
            id: id,
            category: 'GUARANTEE',
            icon: '🛡️',
            title: `Teminat Mektubu #${g.letterNo || g.id} — ${g.bankName} (${diff < 0 ? 'Süresi Doldu!' : `Son ${diff} Gün!`})`,
            sub: `Firma: ${g.supplier} | İhale: ${g.title} | Tutar: ${g.amount?.toLocaleString('tr-TR')} ${g.currency || 'TRY'}`,
            date: g.expiryDate,
            isRead: dismissed.includes(id) || dismissed.includes('guarantee'),
            action: () => {
              this.switchView('guarantees');
              setTimeout(() => this.viewGuaranteeDetails(g.id), 100);
            }
          });
        }
      }
    });

    // 4. Invoices Due in <= 7 Days
    const activeInvoices = (this.state.invoices || []).filter(i => i.paymentStatus !== 'Ödendi');
    activeInvoices.forEach(i => {
      if (i.dueDate) {
        const dDt = new Date(i.dueDate);
        dDt.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dDt - today) / (1000 * 60 * 60 * 24));
        if (diff <= 7) {
          const id = `invoice_${i.id}`;
          allNotifs.push({
            id: id,
            category: 'INVOICE',
            icon: '🧾',
            title: `Fatura #${i.invoiceNo || i.id} — ${i.supplier} (${diff < 0 ? `${Math.abs(diff)} Gün Gecikti!` : diff === 0 ? 'Bugün Vade!' : `${diff} Gün Kaldı`})`,
            sub: `Vade Tarihi: ${i.dueDate} | Tutar: ${i.amount?.toLocaleString('tr-TR')} ${i.currency || 'TRY'}`,
            date: i.dueDate,
            isRead: dismissed.includes(id) || dismissed.includes('invoice'),
            action: () => {
              this.switchView('invoices');
              setTimeout(() => this.viewInvoiceDetails(i.id), 100);
            }
          });
        }
      }
    });

    return allNotifs;
  },

  renderNotifications() {
    const allNotifs = this.getAllNotifications();
    const unreadNotifs = allNotifs.filter(n => !n.isRead);

    const badge = document.getElementById('notif-badge');
    const navBadge = document.getElementById('nav-notif-badge');
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

    if (navBadge) {
      if (unreadCount > 0) {
        navBadge.style.display = 'inline-block';
        navBadge.innerText = unreadCount;
      } else {
        navBadge.style.display = 'none';
      }
    }

    if (headerCount) {
      headerCount.innerText = `${unreadCount} Okunmamış Bildirim`;
    }

    if (list) {
      if (unreadNotifs.length === 0) {
        list.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            ✅ Tüm bildirimler okundu. Kritik uyarı bulunmamaktadır.
          </div>
        `;
      } else {
        list.innerHTML = unreadNotifs.slice(0, 6).map((n, idx) => `
          <div class="notif-item" style="padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer;" onclick="App._triggerNotifAndRead('${n.id}', ${idx})">
            <span style="font-size:1.2rem;">${n.icon}</span>
            <div style="flex:1; min-width:0;">
              <div class="notif-item-title" style="font-weight:700; font-size:0.82rem; color:var(--text-main); line-height:1.3;">${n.title}</div>
              <div class="notif-item-sub" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n.sub}</div>
            </div>
            <button onclick="event.stopPropagation(); App.dismissNotif('${n.id}')" title="Okundu işaretle ve kaldır" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:0.95rem; padding:0.1rem 0.3rem;" onmouseover="this.style.color='var(--status-rejected)'" onmouseout="this.style.color='var(--text-muted)'">✕</button>
          </div>
        `).join('');
        this._notifActions = unreadNotifs.slice(0, 6).map(n => n.action);
      }
    }

    if (this.state.currentView === 'notifications') {
      this.renderNotificationsView();
    }
  },

  handleNotifAction(notifId) {
    const allNotifs = this.getAllNotifications();
    const notif = allNotifs.find(n => n.id === notifId);
    this.dismissNotif(notifId);
    if (notif && typeof notif.action === 'function') {
      notif.action();
    }
  },

  _triggerNotifAndRead(notifId, idx) {
    this.handleNotifAction(notifId);
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
    const container = document.getElementById('notifications-full-list');
    if (!container) return;

    const categoryFilter = document.getElementById('filter-notif-category')?.value || 'ALL';
    let allNotifs = this.getAllNotifications();

    if (categoryFilter === 'UNREAD') {
      allNotifs = allNotifs.filter(n => !n.isRead);
    } else if (categoryFilter !== 'ALL') {
      allNotifs = allNotifs.filter(n => n.category === categoryFilter);
    }

    if (allNotifs.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
          <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.25rem;">Seçilen kritere uygun bildirim bulunmuyor</h4>
          <p style="font-size: 0.85rem;">Tüm kritik uyarılarınız günceldir veya okundu olarak işaretlenmiştir.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = allNotifs.map(n => {
      let catBadge = '';
      if (n.category === 'SLA') catBadge = `<span class="badge priority-kritik">🚨 SLA Gecikmesi</span>`;
      else if (n.category === 'CONTRACT') catBadge = `<span class="badge priority-yüksek">📑 Sözleşme Bitişi</span>`;
      else if (n.category === 'GUARANTEE') catBadge = `<span class="badge priority-orta">🛡️ Teminat Vadesi</span>`;
      else if (n.category === 'INVOICE') catBadge = `<span class="badge status-open">🧾 Fatura Ödemesi</span>`;

      return `
        <div class="glass-card" style="padding: 1.25rem; display: flex; gap: 1rem; align-items: center; justify-content: space-between; opacity: ${n.isRead ? '0.65' : '1'}; border-left: 4px solid ${n.isRead ? 'var(--border-color)' : 'var(--accent-primary)'}; transition: all 0.2s ease;">
          <div style="display: flex; gap: 1rem; align-items: flex-start; flex: 1;">
            <div style="font-size: 2rem; background: var(--bg-hover); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); flex-shrink: 0;">${n.icon}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
                ${catBadge}
                <span style="font-size: 0.78rem; color: var(--text-muted);">📅 ${n.date || 'Bugün'}</span>
                ${n.isRead ? `<span style="font-size: 0.75rem; color: var(--text-muted);">✓ Okundu</span>` : `<span class="badge status-completed" style="font-size:0.7rem;">YENİ BİLDİRİM</span>`}
              </div>
              <h4 style="font-size: 1rem; margin-bottom: 0.35rem; color: var(--text-main); font-weight: 700;">${n.title}</h4>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.4;">${n.sub}</p>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0;">
            <button class="btn-primary" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="App.handleNotifAction('${n.id}')">
              <span>👁️</span> İncele
            </button>
            ${!n.isRead ? `
              <button class="btn-secondary" style="padding: 0.45rem 0.75rem; font-size: 0.8rem;" onclick="App.dismissNotif('${n.id}')">
                <span>✕</span> Okundu Yap
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
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
    document.getElementById('kpi-total-spend').innerText = `${totalSpend.toLocaleString('tr-TR')} ₺`;

    const elSavingsTotal = document.getElementById('kpi-savings-total');
    const elSavingsRate = document.getElementById('kpi-savings-rate');

    if (elSavingsTotal) elSavingsTotal.innerText = `${totalSavings.toLocaleString('tr-TR')} ₺`;
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
      return `<span class="badge status-completed">✅ Tamamlandı</span>`;
    } else if (r.status === 'Reddedildi') {
      return `<span class="badge status-rejected">❌ Reddedildi</span>`;
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

  sortRequestsList(list, sortKey) {
    const priorityWeight = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };
    return list.sort((a, b) => {
      if (sortKey === 'DATE_ASC') {
        const dtA = new Date(a.arrivalDate || a.requestDate || 0);
        const dtB = new Date(b.arrivalDate || b.requestDate || 0);
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
      const dtA = new Date(a.arrivalDate || a.requestDate || 0);
      const dtB = new Date(b.arrivalDate || b.requestDate || 0);
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

    tbody.innerHTML = pageRequests.map((r, i) => `
      <tr>
        <td><input type="checkbox" class="chk-select-request" data-id="${r.id}" onchange="App._onRowCheckboxChange()"></td>
        <td>${r.sequenceNo || startIdx + i + 1}</td>
        <td class="sticky-col-left"><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600; max-width: 250px;">
          <div>${r.subject}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${r.description ? r.description.substring(0, 45) + '...' : ''}</div>
        </td>
        <td style="font-size:0.8rem;">${r.unit}</td>
        <td><span style="font-weight:600;">${r.assignedTo}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${r.arrivalDate || r.requestDate}</td>
        <td><span class="badge priority-${r.priority?.toLowerCase() || 'orta'}">${r.priority || 'Orta'}</span></td>
        <td>${this.getStatusBadge(r)}</td>
        <td style="font-weight:700; font-family:var(--font-mono);">${r.actualAmount > 0 ? r.actualAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
        <td class="sticky-col-right">
          <div class="action-btns">
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', '${r.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
            <button class="btn-icon" onclick="App.openEditModal('${r.id}')" title="Düzenle / Sipariş Gir">✏️</button>
            <button class="btn-icon" onclick="App.deleteRequest('${r.id}')" title="Talebi Sil">🗑️</button>
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
            <td style="font-family:var(--font-mono); font-size:0.88rem;">${p.initialTotal > 0 ? p.initialTotal.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
            <td style="font-family:var(--font-mono); font-size:0.88rem;">${p.actualTotal > 0 ? p.actualTotal.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--status-completed); font-size:0.95rem;">
              ${p.savings > 0 ? '+' + p.savings.toLocaleString('tr-TR') + ' ₺' : '0 ₺'}
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

    tbody.innerHTML = requests.map(r => `
      <tr>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600; max-width: 240px;">${r.subject}</td>
        <td>${r.unit}</td>
        <td>${r.arrivalDate || r.requestDate}</td>
        <td>${this.getStatusBadge(r)}</td>
        <td style="font-family:var(--font-mono);">${r.orderBarcode || '-'}</td>
        <td>${r.orderDate || '-'}</td>
        <td>${r.supplier || '-'}</td>
        <td style="font-weight:700;">${r.actualAmount > 0 ? r.actualAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
        <td>
          <div class="action-btns">
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', '${r.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
            <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.78rem;" onclick="App.openEditModal('${r.id}')">Sipariş Gir / Güncelle</button>
            <button class="btn-icon" onclick="App.deleteRequest('${r.id}')" title="Talebi Sil">🗑️</button>
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
    document.getElementById('contract-kpi-amount').innerText = `${totalAmount.toLocaleString('tr-TR')} ₺`;
    document.getElementById('contract-kpi-expiring').innerText = expiringCount;
    document.getElementById('contract-kpi-guarantee').innerText = `${totalGuarantee.toLocaleString('tr-TR')} ₺`;

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
          <td style="font-weight:700; font-family:var(--font-mono);">${(c.totalAmount || 0).toLocaleString('tr-TR')} ${c.currency || 'TRY'}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${c.startDate} / ${c.endDate}</td>
          <td>${timeBadge}</td>
          <td style="font-weight:600; font-family:var(--font-mono);">${c.guaranteeAmount ? (c.guaranteeAmount).toLocaleString('tr-TR') + ' ₺' : '-'}</td>
          <td><span class="badge status-${c.status === 'Aktif' ? 'completed' : 'rejected'}">${c.status}</span></td>
          <td>
            <div class="action-btns">
              <a href="#contract/${c.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'contract', '${c.id}')" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
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
      document.getElementById('cm-amount').value = c.totalAmount;
      document.getElementById('cm-currency').value = c.currency || 'TRY';
      document.getElementById('cm-guarantee-amount').value = c.guaranteeAmount || '';
      document.getElementById('cm-guarantee-expiry').value = c.guaranteeExpiry || '';
      document.getElementById('cm-status').value = c.status || 'Aktif';
      document.getElementById('cm-notes').value = c.notes || '';
      document.getElementById('contract-modal-title').innerText = `✏️ Sözleşme #${c.contractNo} Düzenle`;
    } else {
      document.getElementById('cm-id').value = '';
      document.getElementById('form-contract-manage').reset();
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
    const totalAmount = parseFloat(document.getElementById('cm-amount').value) || 0;
    const currency = document.getElementById('cm-currency').value;
    const guaranteeAmount = parseFloat(document.getElementById('cm-guarantee-amount').value) || 0;
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

  getTRYEquivalent(amount, currency = 'TRY', itemExchangeRate = null) {
    if (!amount) return 0;
    const curr = (currency || 'TRY').toUpperCase();
    if (curr === 'TRY') return amount;
    const rate = itemExchangeRate || (this.state.rates && this.state.rates[curr]) || 1;
    return amount * rate;
  },

  async deleteRequest(requestId) {
    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Silinecek talep kaydı (#${requestId}) bulunamadı.`, "error");
      return;
    }

    const barcodeText = req.requestBarcode ? `Barkod #${req.requestBarcode}` : 'Talep';
    this.showConfirm("Talebi Sil", `${barcodeText} - "${req.subject}" başlıklı talebi silmek istediğinizden emin misiniz?`, async () => {
      await this.apiSync('requests', 'DELETE', req.id);
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
    const printTitle = document.querySelector('#printable-official-document .print-header div:nth-child(2)');

    const todayStr = new Date().toLocaleDateString('tr-TR');
    if (printDate) printDate.innerText = `Belge Düzenleme Tarihi: ${todayStr}`;

    if (!printBody) return;

    if (type === 'request') {
      if (printTitle) printTitle.innerText = 'SATİNALMA TALEP VE SİPARİŞ FORMU';
      printBody.innerHTML = `
        <div style="border: 2px solid #0f172a; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 1rem; margin-bottom: 1.25rem;">
            <div>
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">TALEP BARKODU</div>
              <div style="font-size: 1.5rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.requestBarcode || '-'}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">DURUM & ÖNCELİK</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">${data.status} (${data.priority || 'Orta'})</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.95rem; margin-bottom: 1.5rem;">
            <div><strong>İlgili Birim:</strong> ${data.unit}</div>
            <div><strong>Takip Eden Personel:</strong> ${data.assignedTo}</div>
            <div><strong>Geliş Tarihi:</strong> ${data.arrivalDate || data.requestDate || '-'}</div>
            <div><strong>Sipariş Tarihi:</strong> ${data.orderDate || '-'}</div>
            <div><strong>Sipariş Barkodu:</strong> ${data.orderBarcode || '-'}</div>
            <div><strong>Tedarikçi Firma:</strong> ${data.supplier || '-'}</div>
            <div><strong>Yönetmelik Maddesi:</strong> ${data.regulation ? 'Madde ' + data.regulation : '-'}</div>
            <div><strong>Gerçekleşen Tutar:</strong> <span style="font-size: 1.15rem; font-weight: 800; color: #16a34a;">${data.actualAmount > 0 ? data.actualAmount.toLocaleString('tr-TR') + ' ' + (data.currency || 'TRY') : '-'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">TALEP KONUSU:</div>
            <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: #0f172a;">${data.subject}</div>
            <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; background: #f8fafc; padding: 1rem; border-radius: 6px; border: 1px solid #e2e8f0; color: #1e293b;">${data.description || 'Not bulunmamaktadır.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'contract') {
      if (printTitle) printTitle.innerText = 'RESMİ SÖZLEŞME VE TEMİNAT TAKİP FORMU';
      printBody.innerHTML = `
        <div style="border: 2px solid #0f172a; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 1rem; margin-bottom: 1.25rem;">
            <div>
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">SÖZLEŞME NO</div>
              <div style="font-size: 1.5rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.contractNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">SÖZLEŞME DURUMU</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #16a34a;">${data.status}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.95rem; margin-bottom: 1.5rem;">
            <div><strong>Sözleşme Konusu:</strong> ${data.title}</div>
            <div><strong>Yüklenici Tedarikçi:</strong> ${data.supplier}</div>
            <div><strong>Sorumlu Birim:</strong> ${data.unit}</div>
            <div><strong>Takip Eden Personel:</strong> ${data.assignedTo || '-'}</div>
            <div><strong>Başlangıç Tarihi:</strong> ${data.startDate}</div>
            <div><strong>Bitiş Tarihi:</strong> ${data.endDate}</div>
            <div><strong>Teminat Mektubu Tutarı:</strong> ${data.guaranteeAmount ? data.guaranteeAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</div>
            <div><strong>Teminat Bitiş Tarihi:</strong> ${data.guaranteeExpiry || '-'}</div>
            <div style="grid-column: span 2;"><strong>Toplam Sözleşme Bedeli:</strong> <span style="font-size: 1.2rem; font-weight: 800; color: #16a34a;">${(data.totalAmount || 0).toLocaleString('tr-TR')} ${data.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">SÖZLEŞME NOTLARI VE ŞARTLAR:</div>
            <div style="font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; background: #f8fafc; padding: 1rem; border-radius: 6px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Not bulunmamaktadır.'}</div>
          </div>
        </div>
      `;
    } else if (type === 'invoice') {
      if (printTitle) printTitle.innerText = 'FATURA VE MUHASEBE TESLİM FORMU';
      printBody.innerHTML = `
        <div style="border: 2px solid #0f172a; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 1rem; margin-bottom: 1.25rem;">
            <div>
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">FATURA NO</div>
              <div style="font-size: 1.5rem; font-weight: 800; font-family: monospace; color: #1e3a8a;">${data.invoiceNo}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">ÖDEME DURUMU</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #16a34a;">${data.paymentStatus}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; font-size: 0.95rem; margin-bottom: 1.5rem;">
            <div><strong>Tedarikçi Firma:</strong> ${data.supplier}</div>
            <div><strong>Bağlı Barkod / Sözleşme:</strong> ${data.relatedBarcode || '-'}</div>
            <div><strong>Fatura Tarihi:</strong> ${data.invoiceDate}</div>
            <div><strong>Vade Tarihi:</strong> ${data.dueDate}</div>
            <div><strong>Muhasebeye Teslim:</strong> ${data.accountingDeliveryDate || '-'}</div>
            <div><strong>Ödeme Yapılma Tarihi:</strong> ${data.paymentDate || '-'}</div>
            <div style="grid-column: span 2;"><strong>Fatura Tutarı:</strong> <span style="font-size: 1.2rem; font-weight: 800; color: #16a34a;">${(data.amount || 0).toLocaleString('tr-TR')} ${data.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid #cbd5e1; padding-top: 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; background: #f8fafc; padding: 1rem; border-radius: 6px; border: 1px solid #e2e8f0; color: #1e293b;">${data.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
    }

    document.body.classList.add('printing-detail');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-detail');
    }, 1000);
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

    if (elVol) elVol.innerText = `${totalVolume.toLocaleString('tr-TR')} ₺`;
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
          <td style="font-weight: 800; color: var(--status-completed); font-family: var(--font-mono);">${(g.amount || 0).toLocaleString('tr-TR')} ${g.currency || 'TRY'}</td>
          <td style="font-weight: 600; color: ${badgeClass === 'priority-kritik' ? 'var(--status-rejected)' : 'var(--text-main)'};">${g.expiryDate || '-'}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">🔒 ${g.storageLocation || 'Kasada'}</td>
          <td><span class="badge ${badgeClass}">${statusStr}</span></td>
          <td style="text-align: center;">
            <div class="action-btns" style="justify-content: center;">
              <button class="btn-icon" onclick="App.viewGuaranteeDetails('${g.id}')" title="Görüntüle">👁️</button>
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
      unitSelect.innerHTML = this.state.units.map(u => `<option value="${u}">${u}</option>`).join('');
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
      document.getElementById('gm-amount').value = g.amount;
      document.getElementById('gm-currency').value = g.currency || 'TRY';
      document.getElementById('gm-issue-date').value = g.issueDate || '';
      document.getElementById('gm-expiry-date').value = g.expiryDate || '';
      document.getElementById('gm-storage-location').value = g.storageLocation || '';
      document.getElementById('gm-notes').value = g.notes || '';
      document.getElementById('guarantee-modal-title').innerText = `✏️ Teminat Mektubu #${g.letterNo} Düzenle`;
    } else {
      document.getElementById('gm-id').value = '';
      document.getElementById('form-guarantee-manage').reset();
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
    const amount = parseFloat(document.getElementById('gm-amount').value) || 0;
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
            <div><strong>Düzenleyen Banka:</strong> 🏦 ${g.bankName}</div>
            <div><strong>Teminat Türü:</strong> ${g.type}</div>
            <div style="grid-column: span 2;"><strong>İlişkili İhale / İş:</strong> ${g.title}</div>
            <div><strong>Yüklenici Firma:</strong> ${g.supplier}</div>
            <div><strong>Sorumlu Birim:</strong> ${g.unit || '-'}</div>
            <div><strong>Düzenleme Tarihi:</strong> ${g.issueDate || '-'}</div>
            <div><strong>Son Geçerlilik (Vade):</strong> ${g.expiryDate || '-'}</div>
            <div><strong>Kasa Saklama Konumu:</strong> 🔒 ${g.storageLocation || 'Mali İşler Kasası'}</div>
            <div><strong>Teminat Tutarı:</strong> <span style="font-size: 1.15rem; font-weight: 800; color: var(--status-completed); font-family: var(--font-mono);">${(g.amount || 0).toLocaleString('tr-TR')} ${g.currency || 'TRY'}</span></div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.25rem;">AÇIKLAMA VE NOTLAR:</div>
            <div style="font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; background: var(--bg-hover); padding: 0.75rem; border-radius: var(--radius-sm); color: var(--text-main);">${g.notes || 'Açıklama girilmemiş.'}</div>
          </div>
        </div>
      `;
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

    document.getElementById('invoice-kpi-total').innerText = `${totalAmountAll.toLocaleString('tr-TR')} ₺`;
    document.getElementById('invoice-kpi-this-week').innerText = `${thisWeekTotal.toLocaleString('tr-TR')} ₺`;
    document.getElementById('invoice-kpi-overdue').innerText = `${overdueTotal.toLocaleString('tr-TR')} ₺`;
    document.getElementById('invoice-kpi-paid').innerText = `${paidAmount.toLocaleString('tr-TR')} ₺`;

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
          <td style="font-weight:700; font-family:var(--font-mono); color:var(--status-completed);">${(inv.amount || 0).toLocaleString('tr-TR')} ${inv.currency || 'TRY'}</td>
          <td>${statusBadge}</td>
          <td><span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--accent-purple);">${inv.relatedBarcode || '-'}</span></td>
          <td>
            <div class="action-btns">
              <a href="#invoice/${inv.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'invoice', ${inv.id})" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
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
      document.getElementById('im-amount').value = inv.amount;
      document.getElementById('im-currency').value = inv.currency || 'TRY';
      document.getElementById('im-status').value = inv.paymentStatus || 'Ödeme Bekliyor';
      document.getElementById('im-delivery-date').value = inv.accountingDeliveryDate || '';
      document.getElementById('im-related-barcode').value = inv.relatedBarcode || '';
      document.getElementById('im-payment-date').value = inv.paymentDate || '';
      document.getElementById('im-notes').value = inv.notes || '';
      document.getElementById('invoice-modal-title').innerText = `✏️ Fatura #${inv.invoiceNo} Düzenle`;
    } else {
      document.getElementById('im-id').value = '';
      document.getElementById('form-invoice-manage').reset();
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
    const amount = parseFloat(document.getElementById('im-amount').value) || 0;
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

    this.showConfirm("Fatura Ödeme Onayı", `Fatura #${inv.invoiceNo} (${inv.amount.toLocaleString('tr-TR')} ₺) ödenmiş olarak işaretlensin mi?`, async () => {
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

    const searchText = document.getElementById('filter-supplier-search')?.value.toLowerCase().trim() || '';
    const unitVal = document.getElementById('filter-supplier-unit')?.value || 'ALL';
    const sortVal = document.getElementById('filter-supplier-sort')?.value || 'SPEND_DESC';

    const suppMap = {};
    let totalSpendAll = 0;

    requests.forEach(r => {
      if (r.supplier && r.supplier !== '-' && r.supplier.trim() !== '') {
        if (unitVal !== 'ALL' && r.unit !== unitVal) return;

        const sName = r.supplier.trim();
        if (searchText && !sName.toLowerCase().includes(searchText)) return;

        if (!suppMap[sName]) suppMap[sName] = { total: 0, completed: 0, spend: 0 };
        suppMap[sName].total++;
        if (r.status === 'Tamamlandı') suppMap[sName].completed++;
        const spend = (r.actualAmount || 0);
        suppMap[sName].spend += spend;
        totalSpendAll += spend;
      }
    });

    let sortedSupp = Object.entries(suppMap);

    if (sortVal === 'COUNT_DESC') {
      sortedSupp.sort((a, b) => b[1].total - a[1].total);
    } else if (sortVal === 'NAME_ASC') {
      sortedSupp.sort((a, b) => a[0].localeCompare(b[0], 'tr'));
    } else {
      // SPEND_DESC
      sortedSupp.sort((a, b) => b[1].spend - a[1].spend);
    }

    const tbody = document.querySelector('#table-supplier-detailed tbody');
    if (tbody) {
      if (sortedSupp.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun tedarikçi bulunamadı.</td></tr>`;
      } else {
        tbody.innerHTML = sortedSupp.map(([sName, s], i) => {
          const share = totalSpendAll > 0 ? ((s.spend / totalSpendAll) * 100).toFixed(1) : 0;
          return `
            <tr>
              <td>${i + 1}</td>
              <td style="font-weight:700;">${sName}</td>
              <td>${s.total}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
              <td><span class="badge status-completed">${s.completed}</span></td>
              <td style="font-weight:600;">%${share}</td>
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
              if (s > 0) return `<td style="font-family:var(--font-mono); font-weight:700; color:var(--status-completed); background:rgba(34,197,94,0.05);">+${s.toLocaleString('tr-TR')} ₺</td>`;
              return `<td style="color:var(--text-muted); font-size:0.78rem;">-</td>`;
            }).join('');

            return `
              <tr style="cursor: pointer;" onclick="App.openPersonnelSavingsDetailView('${safeName}')" title="Kullanıcıya tıklayarak detaylı grafik, birim dağılımı ve iş listesini görün">
                <td>
                  <strong style="color:var(--text-main); font-size:0.88rem;">${p.user.name}</strong>
                  <div style="font-size:0.72rem; color:var(--text-muted);">${p.user.title}</div>
                </td>
                ${monthTds}
                <td style="font-family:var(--font-mono); font-weight:800; color:var(--status-completed); font-size:0.92rem; background:rgba(34,197,94,0.12);">
                  ${p.savings > 0 ? '+' + p.savings.toLocaleString('tr-TR') + ' ₺' : '0 ₺'}
                </td>
                <td>
                  <span class="badge" style="background:${p.savings > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-card)'}; color:${p.savings > 0 ? 'var(--status-completed)' : 'var(--text-muted)'}; font-weight:700;">
                    %${ratePct}
                  </span>
                </td>
                <td>
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
          return `<td style="font-family:var(--font-mono); color:var(--status-completed);">${s > 0 ? '+' + s.toLocaleString('tr-TR') + ' ₺' : '-'}</td>`;
        }).join('');

        tfoot.innerHTML = `
          <tr>
            <td style="color:var(--accent-primary);">🏛️ KURUM GENEL TOPLAMI</td>
            ${footMonthTds}
            <td style="font-family:var(--font-mono); font-size:0.92rem; color:var(--status-completed); background:rgba(34,197,94,0.2);">
              +${grandSavings.toLocaleString('tr-TR')} ₺
            </td>
            <td style="color:var(--status-completed);">%${grandRatePct}</td>
            <td>-</td>
          </tr>
        `;
      }
    }
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
    this.renderUnitsSettings();
    this.renderRegulationsSettings();
    this.renderBackupsTableSettings();
  },

  async renderBackupsTableSettings() {
    const tbody = document.getElementById('tbody-backups-list');
    if (!tbody) return;
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const backups = await res.json();
        if (!Array.isArray(backups) || backups.length === 0) {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">Henüz alınmış veritabanı yedeği bulunmuyor.</td></tr>`;
          return;
        }
        tbody.innerHTML = backups.map(b => `
          <tr>
            <td style="font-weight:600; font-family:var(--font-mono); font-size:0.82rem;">${b.filename}</td>
            <td>${b.createdAt}</td>
            <td>${b.size}</td>
            <td style="text-align:center;">
              <a href="/api/backups/download/${b.filename}" class="btn-icon" title="Yedek Dosyasını İndir" download>📥</a>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--status-rejected);">Yedek listesi alınamadı.</td></tr>`;
    }
  },

  async triggerBackupNow() {
    try {
      this.showToast("Veritabanı yedeği oluşturuluyor...", "info", "💾");
      const res = await fetch('/api/backups/create', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.showToast(`Yedek oluşturuldu: ${data.filename} (${data.size})`, "success", "✅");
        this.renderBackupsTableSettings();
      } else {
        this.showToast("Yedekleme başarısız oldu.", "error");
      }
    } catch (err) {
      console.error(err);
      this.showToast("Yedekleme sırasında hata oluştu.", "error");
    }
  },

  handleExcelFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      this.showToast("Excel okuma kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip sayfayı yenileyin.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonRows || jsonRows.length === 0) {
          this.showToast("Seçilen Excel dosyasında okunabilir veri bulunamadı.", "warning");
          return;
        }

        // Map Excel columns to Request fields
        const requestsToImport = jsonRows.map(r => {
          return {
            requestBarcode: r['Barkod No'] || r['Barkod'] || r['Talep Barkod'] || r['Barkod No.'] || Math.floor(100000000 + Math.random() * 900000000),
            subject: r['Talep Konusu'] || r['Konu'] || r['Açıklama'] || 'Excel İçe Aktarma',
            unit: r['Birim'] || r['Birim Adı'] || 'Genel Sekreterlik',
            arrivalDate: r['Geliş Tarihi'] || r['Tarih'] || new Date().toISOString().split('T')[0],
            assignedTo: r['Atanan Personel'] || r['Personel'] || r['Sorumlu'] || 'Merih AVCI',
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

        this.showToast(`Excel dosyasından ${requestsToImport.length} adet talep okundu, veritabanına yükleniyor...`, "info", "📊");

        const res = await fetch('/api/import-excel-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestsToImport)
        });

        if (res.ok) {
          const result = await res.json();
          this.showToast(`🎉 ${result.addedCount} adet talep veritabanına başarıyla yüklendi!`, "success", "✅");
          await this.fetchInitialData();
          this.render();
        } else {
          this.showToast("Excel verileri yüklenirken sunucu hatası oluştu.", "error");
        }
      } catch (err) {
        console.error("Excel okuma hatası:", err);
        this.showToast("Excel dosyası okunamadı. Lütfen geçerli bir .xlsx veya .xls dosyası seçin.", "error");
      } finally {
        e.target.value = ''; // Reset input for re-selection
      }
    };
    reader.readAsArrayBuffer(file);
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
      const res = await fetch('/api/update-system', { method: 'POST' });
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
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted); padding:1rem;">Tanımlı birim bulunamadı.</td></tr>`;
      return;
    }
    tbody.innerHTML = this.state.units.map(u => {
      const id = typeof u === 'object' ? u.id : u;
      const name = typeof u === 'object' ? u.name : u;
      return `
        <tr>
          <td style="font-weight:600;">${name}</td>
          <td style="text-align:center;">
            <button class="btn-icon" onclick="App.handleEditUnit(${id}, '${name.replace(/'/g, "\\'")}')" title="Birim Adını Düzenle">✏️</button>
            <button class="btn-icon" onclick="App.handleDeleteUnit(${id}, '${name.replace(/'/g, "\\'")}')" title="Birimi Sil">🗑️</button>
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
          <td style="font-weight:600;">Madde ${name}</td>
          <td style="text-align:center;">
            <button class="btn-icon" onclick="App.handleDeleteRegulation(${id}, '${name.replace(/'/g, "\\'")}')" title="Maddeyi Sil">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async handleAddUnit() {
    const input = document.getElementById('input-new-unit-name');
    const name = input?.value.trim();
    if (!name) {
      this.showToast("Lütfen eklenecek birim adını girin.", "warning");
      return;
    }
    try {
      const res = await this.apiSync('units', 'POST', { name });
      if (res) {
        this.state.units.push(res);
        input.value = '';
        this.renderUnitsSettings();
        this.populateDropdowns();
        this.showToast(`"${name}" birimi başarıyla eklendi.`, "success", "🏢");
      }
    } catch (err) {
      console.error(err);
      this.showToast("Birim eklenirken hata oluştu.", "error");
    }
  },

  async handleEditUnit(id, oldName) {
    const newName = prompt("Birim Adını Düzenleyin:", oldName);
    if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
    const cleanName = newName.trim();
    try {
      await this.apiSync('units', 'PUT', { name: cleanName }, id);
      const unitObj = this.state.units.find(u => (typeof u === 'object' ? u.id : u) === id);
      if (unitObj && typeof unitObj === 'object') unitObj.name = cleanName;
      
      // Update unit name across all loaded requests in memory
      this.state.requests.forEach(r => {
        if (r.unit === oldName) r.unit = cleanName;
      });

      this.renderUnitsSettings();
      this.populateDropdowns();
      this.render();
      this.showToast(`Birim adı "${cleanName}" olarak güncellendi.`, "success", "✏️");
    } catch (err) {
      console.error(err);
      this.showToast("Birim güncellenirken hata oluştu.", "error");
    }
  },

  async handleDeleteUnit(id, name) {
    if (!confirm(`"${name}" birimini silmek istediğinizden emin misiniz?`)) return;
    try {
      await this.apiSync('units', 'DELETE', null, id);
      this.state.units = this.state.units.filter(u => (typeof u === 'object' ? u.id : u) !== id);
      this.renderUnitsSettings();
      this.populateDropdowns();
      this.showToast(`"${name}" birimi silindi.`, "info", "🗑️");
    } catch (err) {
      console.error(err);
      this.showToast("Birim silinirken hata oluştu.", "error");
    }
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

  openEditModal(requestId) {
    const req = this.state.requests.find(r => String(r.id) === String(requestId));
    if (!req) {
      this.showToast(`Düzenlenecek talep kaydı (#${requestId}) bulunamadı.`, "error");
      return;
    }

    document.getElementById('er-id').value = req.id;
    document.getElementById('er-status').value = req.status;
    document.getElementById('er-assigned-to').value = req.assignedTo;
    document.getElementById('er-order-barcode').value = req.orderBarcode || '';
    document.getElementById('er-order-date').value = req.orderDate || '';
    document.getElementById('er-supplier').value = req.supplier || '';
    if (document.getElementById('er-estimated-amount')) {
      document.getElementById('er-estimated-amount').value = req.estimatedAmount || req.budgetAmount || 0;
    }
    document.getElementById('er-actual-amount').value = req.actualAmount || 0;
    document.getElementById('er-currency').value = req.currency || 'TRY';
    
    const regSelect = document.getElementById('er-regulation');
    if (regSelect) {
      let regVal = req.regulation || '';
      if (regVal.startsWith('Madde ')) regVal = regVal.replace('Madde ', '');
      regSelect.value = regVal;
    }
    
    document.getElementById('er-description').value = req.description || '';

    document.getElementById('edit-modal-title').innerText = `✏️ Talep #${req.requestBarcode || req.id} Düzenle`;
    this.openModal('modal-edit-request');
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
      const response = await fetch(url, options);
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
    const barcode = document.getElementById('nr-barcode').value;
    const arrDate = document.getElementById('nr-arrival-date').value;
    const subject = document.getElementById('nr-subject').value;
    const desc = document.getElementById('nr-description').value;
    const unit = document.getElementById('nr-unit').value;
    const assigned = document.getElementById('nr-assigned-to').value || 'Henüz Atanmadı';
    const priority = document.getElementById('nr-priority').value;
    const reg = document.getElementById('nr-regulation').value;
    const estAmt = parseFloat(document.getElementById('nr-estimated-amount')?.value) || 0;

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
      regulation: reg,
      status: 'Açık',
      estimatedAmount: estAmt,
      budgetAmount: estAmt,
      actualAmount: 0,
      currency: 'TRY',
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

    this.openModal('modal-new-request');
  },

  openEditModal(reqId) {
    const req = this.state.requests.find(r => String(r.id) === String(reqId));
    if (!req) return;

    document.getElementById('er-id').value = req.id;
    document.getElementById('er-status').value = req.status || 'Açık';
    if (document.getElementById('er-unit')) document.getElementById('er-unit').value = req.unit || '';
    if (document.getElementById('er-assigned-to')) document.getElementById('er-assigned-to').value = req.assignedTo || '';
    document.getElementById('er-order-barcode').value = req.orderBarcode || '';
    document.getElementById('er-order-date').value = req.orderDate || '';
    document.getElementById('er-supplier').value = req.supplier || '';
    if (document.getElementById('er-estimated-amount')) document.getElementById('er-estimated-amount').value = req.estimatedAmount || '';
    document.getElementById('er-actual-amount').value = req.actualAmount || '';
    document.getElementById('er-currency').value = req.currency || 'TRY';
    if (document.getElementById('er-regulation')) document.getElementById('er-regulation').value = req.regulation || '';
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

    req.status = document.getElementById('er-status').value;
    if (document.getElementById('er-unit')) req.unit = document.getElementById('er-unit').value;
    req.assignedTo = document.getElementById('er-assigned-to').value;
    req.orderBarcode = document.getElementById('er-order-barcode').value;
    req.orderDate = document.getElementById('er-order-date').value;
    req.supplier = document.getElementById('er-supplier').value;
    const estAmt = parseFloat(document.getElementById('er-estimated-amount')?.value) || 0;
    req.estimatedAmount = estAmt;
    if (!req.budgetAmount) req.budgetAmount = estAmt;
    req.actualAmount = parseFloat(document.getElementById('er-actual-amount').value) || 0;
    req.currency = document.getElementById('er-currency').value;
    req.regulation = document.getElementById('er-regulation').value;
    req.description = document.getElementById('er-description').value;

    await this.apiSync('requests', 'PUT', req);

    this.showToast("Talep bilgileri başarıyla güncellendi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.render();
  },

  exportToCSV() {
    this.exportTableToExcel('table-requests', `Satinalma_Talepleri_${this.state.selectedYear}.csv`);
  },

  exportTableToExcel(tableId, filename = 'Export.csv') {
    const table = document.getElementById(tableId);
    if (!table) {
      this.showToast("Dışa aktarılacak tablo bulunamadı.", "warning");
      return;
    }

    // Convert extension to .csv so Excel opens natively without format mismatch warning dialogs
    if (filename.endsWith('.xls') || filename.endsWith('.xlsx')) {
      filename = filename.replace(/\.(xls|xlsx)$/i, '.csv');
    }
    if (!filename.endsWith('.csv')) {
      filename += '.csv';
    }

    let csvContent = '';
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
      // Skip hidden rows unless it's tfoot or header
      if (row.offsetParent === null && !row.closest('tfoot')) return;

      const cols = row.querySelectorAll('th, td');
      const rowData = [];

      cols.forEach(col => {
        // Skip action buttons column
        if (col.querySelector('.action-btns') || col.classList.contains('no-export')) return;
        
        let text = col.innerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        // Clean button text inside cells if any
        text = text.replace(/🔍\s*Detay/g, '').trim();

        // Escape double quotes for CSV
        text = text.replace(/"/g, '""');
        
        // Wrap in quotes if text contains semicolon or special chars
        if (text.includes(';') || text.includes('"') || text.includes('\n')) {
          text = `"${text}"`;
        }
        rowData.push(text);
      });

      if (rowData.length > 0) {
        csvContent += rowData.join(';') + '\r\n';
      }
    });

    // UTF-8 BOM (\uFEFF) ensures Excel opens Turkish characters (Ş, Ğ, Ç, İ, Ö, Ü, ₺) perfectly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    
    this.logAction('Excel Dışa Aktarıldı', `Tablo: ${tableId}, Dosya: ${filename}`);
  },

  printSection(sectionId = null, docTitle = 'SATİNALMA MÜDÜRLÜĞÜ FAALİYET VE HARCAMA RAPORU') {
    let secEl = sectionId ? document.getElementById(sectionId) : null;
    if (!secEl) {
      secEl = document.querySelector('.view-section:not([style*="display: none"]):not([style*="display:none"])');
    }

    if (!secEl) {
      window.print();
      return;
    }

    let banner = secEl.querySelector('.print-header-banner');
    let createdBanner = false;

    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'print-header-banner';
      createdBanner = true;

      const todayStr = new Date().toLocaleDateString('tr-TR');
      const userStr = this.state.currentUser ? this.state.currentUser.name : 'Satınalma Yetkilisi';
      const yearStr = this.state.selectedYear === 'ALL' ? 'Tüm Yıllar (Genel)' : `${this.state.selectedYear} Akademik Yılı`;

      banner.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div style="text-align:left;">
            <div style="font-size:1.3rem; font-weight:800; color:#0f172a; letter-spacing:0.02em;">T.C. PİRİ REİS ÜNİVERSİTESİ</div>
            <div style="font-size:1rem; font-weight:700; color:#1e3a8a; margin-top:0.2rem;">${docTitle}</div>
          </div>
          <div style="text-align:right; font-size:0.8rem; color:#475569; line-height:1.4;">
            <div><strong>Tarih:</strong> ${todayStr}</div>
            <div><strong>Dönem:</strong> ${yearStr}</div>
            <div><strong>Raporlayan:</strong> ${userStr}</div>
          </div>
        </div>
      `;
      secEl.insertBefore(banner, secEl.firstChild);
    }

    secEl.classList.add('active-print');
    window.print();

    if (createdBanner && banner) {
      banner.remove();
    }
    secEl.classList.remove('active-print');
  },

  async fetchBackups() {
    try {
      const tbody = document.getElementById('tbody-backups-list');
      if (!tbody) return;
      
      const res = await fetch('/api/backups');
      if (res.ok) {
        const backups = await res.json();
        if (!backups || backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Henüz yedek dosyası yok.</td></tr>';
          return;
        }
        tbody.innerHTML = backups.map(b => `
          <tr>
            <td style="font-weight:600;">💾 ${b.filename}</td>
            <td>${b.created}</td>
            <td><span class="badge priority-orta">${b.sizeKB} KB</span></td>
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

      const res = await fetch('/api/backup-now', { method: 'POST' });
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
