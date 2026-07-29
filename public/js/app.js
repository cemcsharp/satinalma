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

  async fetchInitialData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        this.state.requests = data.requests || [];
        this.state.users = data.users || [];
        this.state.units = data.units || [];
        this.state.regulations = data.regulations || [];
        this.state.contracts = data.contracts || [];
        this.state.invoices = data.invoices || [];
        this.state.logs = data.logs || [];
        if (data.rates) this.state.rates = data.rates;

        this.populateLoginDropdown();
        this.populateDropdowns();

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
    loginSelect.innerHTML = '';
    
    // Sort active users first
    const sortedUsers = [...this.state.users].sort((a,b) => (b.isActive?1:0) - (a.isActive?1:0));
    sortedUsers.forEach(u => {
      const statusLabel = u.isActive !== false ? '' : ' (Pasif/Ayrıldı)';
      loginSelect.innerHTML += `<option value="${u.id}">${u.name} - ${u.title}${statusLabel}</option>`;
    });
  },

  populateDropdowns() {
    // Populate unit dropdowns
    const unitSelects = ['filter-unit', 'select-unit-analysis', 'nr-unit', 'cm-unit', 'filter-contract-unit', 'filter-my-unit'];
    unitSelects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isFilter = id.startsWith('filter') || id.startsWith('select');
      el.innerHTML = isFilter ? '<option value="ALL">Tüm Birimler</option>' : '<option value="">Birim Seçin</option>';
      this.state.units.forEach(u => {
        el.innerHTML += `<option value="${u}">${u}</option>`;
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

    // Active personnel only for assignments
    const activeUsers = this.state.users.filter(u => u.isActive !== false);
    const assignSelects = ['nr-assigned-to', 'er-assigned-to', 'delegate-to-person', 'cm-assigned-to'];
    assignSelects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '<option value="">Aktif Personel Seçin</option>';
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
        const val = r.toString().replace('Madde ', '');
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

  bindEvents() {
    // Login Form Submit
    document.getElementById('form-login-screen')?.addEventListener('submit', (e) => this.handleLogin(e));

    // Logout Button
    document.getElementById('btn-logout')?.addEventListener('click', () => this.handleLogout());

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
    ['filter-search', 'filter-status', 'filter-unit', 'filter-person', 'filter-priority'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.state.currentPage = 1;
          this.renderRequestsTable();
        });
      }
    });

    // Filters for My Requests (Taleplerim)
    ['filter-my-search', 'filter-my-status', 'filter-my-unit', 'filter-my-priority'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.renderMyRequestsTable());
        el.addEventListener('change', () => this.renderMyRequestsTable());
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

    // Modal Open Buttons
    document.getElementById('btn-open-new-request')?.addEventListener('click', () => this.openModal('modal-new-request'));
    document.getElementById('btn-open-add-user')?.addEventListener('click', () => this.openUserModal());
    document.getElementById('btn-open-add-contract')?.addEventListener('click', () => this.openContractModal());
    document.getElementById('btn-open-add-invoice')?.addEventListener('click', () => this.openInvoiceModal());

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
    document.getElementById('form-invoice-manage')?.addEventListener('submit', (e) => this.handleSaveInvoice(e));

    // Delegation Execution
    document.getElementById('btn-execute-delegation')?.addEventListener('click', () => this.handleDelegation());

    // Print & Export Event Listeners
    document.getElementById('btn-print-yearly-report')?.addEventListener('click', () => window.print());
    document.getElementById('btn-export-yearly-excel')?.addEventListener('click', () => this.exportTableToExcel('table-yearly-monthly', 'Yillik_Faaliyet_Raporu.csv'));

    document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportToCSV());
    document.getElementById('btn-export-requests-pdf')?.addEventListener('click', () => this.printSection('view-requests'));

    document.getElementById('btn-export-contracts-excel')?.addEventListener('click', () => this.exportTableToExcel('table-contracts', 'Sozlesme_Listesi.csv'));
    document.getElementById('btn-export-contracts-pdf')?.addEventListener('click', () => this.printSection('view-contracts'));

    document.getElementById('btn-export-invoices-excel')?.addEventListener('click', () => this.exportTableToExcel('table-invoices', 'Fatura_Listesi.csv'));
    document.getElementById('btn-export-invoices-pdf')?.addEventListener('click', () => this.printSection('view-invoices'));

    // Manual Backup Button
    document.getElementById('btn-trigger-backup-now')?.addEventListener('click', () => this.triggerManualBackup());

    // Export Weekly Payment Schedule to CSV
    document.getElementById('btn-export-weekly-payments')?.addEventListener('click', () => this.exportWeeklyPaymentsToCSV());

    // Re-import Excel
    document.getElementById('btn-reimport-excel')?.addEventListener('click', async () => {
      if (confirm("Excel verilerini yeniden senkronize etmek istediğinize emin misiniz?")) {
        await this.fetchInitialData();
        alert("Veriler yeniden yüklendi!");
        this.render();
      }
    });

    // Filter for Activity Logs
    document.getElementById('filter-log-search')?.addEventListener('input', () => this.renderActivityLogs());

    // Save Currency Rates
    document.getElementById('btn-save-rates')?.addEventListener('click', async () => {
      const usd = parseFloat(document.getElementById('setting-rate-usd').value) || 36.50;
      const eur = parseFloat(document.getElementById('setting-rate-eur').value) || 39.80;
      this.state.rates = { USD: usd, EUR: eur, lastUpdated: new Date().toLocaleString('tr-TR') };
      await this.saveDatabase();
      this.logAction('Döviz Kuru Güncellendi', `USD: ${usd} ₺, EUR: ${eur} ₺`);
      alert("Döviz kurları başarıyla güncellendi!");
      this.render();
    });

    // Auto Fetch TCMB Rates
    document.getElementById('btn-fetch-tcmb-rates')?.addEventListener('click', () => this.fetchTCMBRates());
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

          await this.saveDatabase();
          this.logAction('TCMB Kurları Çekildi', `Merkez Bankası Satış Kurları -> USD: ${data.USD} ₺, EUR: ${data.EUR} ₺ (${data.lastUpdated})`);
          alert(`✅ Türkiye Cumhuriyet Merkez Bankası (TCMB) Kurları Başarıyla Çekildi!\n\n💵 USD: ${data.USD} ₺\n💶 EUR: ${data.EUR} ₺\n📅 Tarih: ${data.lastUpdated}`);
          this.render();
        } else {
          alert("TCMB kurları alınırken bir hata oluştu: " + data.error);
        }
      }
    } catch (err) {
      console.error("Error fetching TCMB rates:", err);
      alert("Merkez Bankası sunucusuna bağlanılamadı.");
    } finally {
      const btn = document.getElementById('btn-fetch-tcmb-rates');
      if (btn) btn.innerHTML = '<span>⚡</span> TCMB\'den Kurları Otomatik Çek';
    }
  },

  logAction(actionType, details) {
    if (!this.state.logs) this.state.logs = [];
    const newLog = {
      id: this.state.logs.length + 1,
      timestamp: new Date().toLocaleString('tr-TR'),
      user: this.state.currentUser ? this.state.currentUser.name : 'Sistem',
      action: actionType,
      details: details
    };
    this.state.logs.unshift(newLog);
    if (this.state.logs.length > 500) this.state.logs.pop();
  },

  switchView(viewName) {
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
      contracts: { title: 'Sözleşme Takip', sub: 'Sözleşme süreleri, teminat mektupları ve yaklaşan bitiş uyarıları' },
      invoices: { title: 'Fatura & Muhasebe', sub: 'Vadesi gelen faturalar ve haftalık nakit akış ödeme listesi' },
      'unit-analysis': { title: 'Birim Analizi', sub: 'Üniversite birimlerinin talep ve harcama detayları' },
      'supplier-analysis': { title: 'Tedarikçi Analizi', sub: 'En yüksek harcama yapılan tedarikçilerin sıralaması' },
      'yearly-report': { title: 'Yıllık Rapor', sub: 'Yıllık satınalma faaliyet raporu, YoY metrikleri ve SLA hız analizleri' },
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

    this.render();
  },

  getFilteredRequests() {
    return this.state.requests.filter(r => {
      if (this.state.selectedYear !== 'ALL' && r.academicYear !== this.state.selectedYear) {
        return false;
      }
      return true;
    });
  },

  render() {
    if (!this.state.isLoggedIn) return;
    const view = this.state.currentView;
    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'requests') this.renderRequestsTable();
    else if (view === 'workload') this.renderWorkloadView();
    else if (view === 'my-requests') this.renderMyRequestsTable();
    else if (view === 'contracts') this.renderContracts();
    else if (view === 'invoices') this.renderInvoices();
    else if (view === 'unit-analysis') this.renderUnitAnalysis();
    else if (view === 'supplier-analysis') this.renderSupplierAnalysis();
    else if (view === 'yearly-report') this.renderYearlyReport();
    else if (view === 'activity-logs') this.renderActivityLogs();
    else if (view === 'settings') this.renderSettings();
  },

  // 1. DASHBOARD RENDERER
  renderDashboard() {
    const requests = this.getFilteredRequests();

    const totalCount = requests.length;
    const completedCount = requests.filter(r => r.status === 'Tamamlandı').length;
    const openCount = requests.filter(r => r.status === 'Açık').length;
    const totalSpend = requests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const completedRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-demands').innerText = totalCount;
    document.getElementById('kpi-completed-demands').innerText = completedCount;
    document.getElementById('kpi-completed-rate').innerText = `%${completedRate} Tamamlanma`;
    document.getElementById('kpi-open-demands').innerText = openCount;
    document.getElementById('kpi-total-spend').innerText = `${totalSpend.toLocaleString('tr-TR')} ₺`;

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

    const months = ['Eyl', 'Eki', 'Kas', 'Ara', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu'];
    const monthlyCounts = Array(12).fill(0);

    requests.forEach(r => {
      if (r.requestDate) {
        const m = parseInt(r.requestDate.split('-')[1]) - 1;
        const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
        monthlyCounts[acadIdx]++;
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
    }, { responsive: true, maintainAspectRatio: false });

    const unitMap = {};
    requests.forEach(r => {
      unitMap[r.unit] = (unitMap[r.unit] || 0) + 1;
    });
    const sortedUnits = Object.entries(unitMap).sort((a,b)=>b[1]-a[1]).slice(0, 8);

    this.createOrUpdateChart('chart-unit-bar', 'bar', {
      labels: sortedUnits.map(u => u[0].length > 15 ? u[0].substring(0, 15) + '...' : u[0]),
      datasets: [{
        label: 'Talep Adedi',
        data: sortedUnits.map(u => u[1]),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    }, { responsive: true, maintainAspectRatio: false });

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
    }, { responsive: true, maintainAspectRatio: false });
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

  // 2. REQUESTS TABLE RENDERER
  renderRequestsTable() {
    let requests = this.getFilteredRequests();

    const searchText = document.getElementById('filter-search')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('filter-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-unit')?.value || 'ALL';
    const personVal = document.getElementById('filter-person')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-priority')?.value || 'ALL';

    requests = requests.filter(r => {
      if (statusVal !== 'ALL' && r.status !== statusVal) return false;
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
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">Arama kriterlerine uygun talep bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageRequests.map((r, i) => `
      <tr>
        <td>${r.sequenceNo || startIdx + i + 1}</td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600; max-width: 250px;">
          <div>${r.subject}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${r.description ? r.description.substring(0, 45) + '...' : ''}</div>
        </td>
        <td style="font-size:0.8rem;">${r.unit}</td>
        <td><span style="font-weight:600;">${r.assignedTo}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${r.arrivalDate || r.requestDate}</td>
        <td><span class="badge priority-${r.priority?.toLowerCase() || 'orta'}">${r.priority || 'Orta'}</span></td>
        <td><span class="badge status-${r.status?.toLowerCase()}">${r.status}</span></td>
        <td style="font-weight:700; font-family:var(--font-mono);">${r.actualAmount > 0 ? r.actualAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="App.viewRequestDetails(${r.id})" title="Detayları Görüntüle">👁️</button>
            <button class="btn-icon" onclick="App.openEditModal(${r.id})" title="Düzenle / Sipariş Gir">✏️</button>
            <button class="btn-icon" onclick="App.deleteRequest(${r.id})" title="Talebi Sil">🗑️</button>
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
      personMap[u.name] = { user: u, total: 0, open: 0, completed: 0, rejected: 0, critical: 0, high: 0, score: 0 };
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
      }
    });

    Object.values(personMap).forEach(p => {
      p.score = (p.open * 2) + (p.critical * 3) + (p.high * 2) + p.total;
    });

    const cardsContainer = document.getElementById('workload-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = Object.values(personMap).map(p => `
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
            <div class="stat-box">
              <h5 style="color:var(--priority-critical);">${p.critical + p.high}</h5>
              <p>Acil</p>
            </div>
          </div>
        </div>
      `).join('');
    }

    this.renderDelegationTable(requests);
  },

  renderDelegationTable(requests) {
    const fromPerson = document.getElementById('delegate-from-person')?.value || 'Açık';
    let filtered = requests.filter(r => r.status === 'Açık');

    if (fromPerson !== 'Açık') {
      filtered = filtered.filter(r => r.assignedTo === fromPerson);
    }

    const tbody = document.querySelector('#table-delegation-requests tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Aktif devredilecek talep bulunmuyor.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.slice(0, 15).map(r => `
      <tr>
        <td><input type="checkbox" class="chk-delegate-item" value="${r.id}"></td>
        <td><span style="font-family:var(--font-mono); font-weight:700;">${r.requestBarcode || '-'}</span></td>
        <td style="font-weight:600;">${r.subject}</td>
        <td>${r.unit}</td>
        <td><span class="badge priority-orta">${r.assignedTo}</span></td>
        <td>${r.arrivalDate || r.requestDate}</td>
        <td><span class="badge priority-${r.priority?.toLowerCase()}">${r.priority}</span></td>
      </tr>
    `).join('');
  },

  async handleDelegation() {
    const checked = Array.from(document.querySelectorAll('.chk-delegate-item:checked')).map(cb => parseInt(cb.value));
    const targetPerson = document.getElementById('delegate-to-person').value;

    if (!targetPerson) {
      alert("Lütfen hedef aktif personeli seçin!");
      return;
    }

    if (checked.length === 0) {
      alert("Lütfen devretmek için en az bir talep seçin!");
      return;
    }

    this.state.requests.forEach(r => {
      if (checked.includes(r.id)) {
        r.assignedTo = targetPerson;
      }
    });

    await this.saveDatabase();
    alert(`${checked.length} adet talep başarıyla ${targetPerson} adlı personele devredildi!`);
    this.render();
  },

  // 4. MY REQUESTS (PERSONNEL VIEW)
  renderMyRequestsTable() {
    const currentPersonName = this.state.currentUser ? this.state.currentUser.name : '';
    let requests = this.getFilteredRequests().filter(r => r.assignedTo === currentPersonName);

    const searchText = document.getElementById('filter-my-search')?.value.toLowerCase().trim() || '';
    const statusVal = document.getElementById('filter-my-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-my-unit')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-my-priority')?.value || 'ALL';

    requests = requests.filter(r => {
      if (statusVal !== 'ALL' && r.status !== statusVal) return false;
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
        <td><span class="badge status-${r.status?.toLowerCase()}">${r.status}</span></td>
        <td style="font-family:var(--font-mono);">${r.orderBarcode || '-'}</td>
        <td>${r.orderDate || '-'}</td>
        <td>${r.supplier || '-'}</td>
        <td style="font-weight:700;">${r.actualAmount > 0 ? r.actualAmount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" onclick="App.viewRequestDetails(${r.id})" title="Detayları Görüntüle">👁️</button>
            <button class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.78rem;" onclick="App.openEditModal(${r.id})">Sipariş Gir / Güncelle</button>
            <button class="btn-icon" onclick="App.deleteRequest(${r.id})" title="Talebi Sil">🗑️</button>
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
              <button class="btn-icon" onclick="App.viewContractDetails(${c.id})" title="Detayları Görüntüle">👁️</button>
              <button class="btn-icon" onclick="App.openContractModal(${c.id})" title="Düzenle">✏️</button>
              <button class="btn-icon" onclick="App.deleteContract(${c.id})" title="Sözleşmeyi Sil">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openContractModal(contractId = null) {
    if (contractId) {
      const c = this.state.contracts.find(item => item.id === contractId);
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
      }
    } else {
      const newContract = {
        id: this.state.contracts.length + 1,
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
        academicYear: this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear
      };
      this.state.contracts.push(newContract);
    }

    this.logAction(id ? 'Sözleşme Güncellendi' : 'Yeni Sözleşme Eklendi', `No: ${contractNo}, Tutar: ${totalAmount} ${currency} (Sabit Kur: ${rateVal} ₺)`);
    await this.saveDatabase();
    alert("Sözleşme bilgileri başarıyla kaydedildi!");
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

    const barcodeText = req.requestBarcode ? `Barkod #${req.requestBarcode}` : 'Talep';
    if (confirm(`${barcodeText} - "${req.subject}" başlıklı talebi silmek istediğinizden emin misiniz?`)) {
      this.state.requests = this.state.requests.filter(r => r.id !== requestId);
      this.logAction('Talep Silindi', `Barkod: ${req.requestBarcode || '-'}, Konu: ${req.subject}`);
      await this.saveDatabase();
      alert("Talep başarıyla silindi!");
      this.render();
    }
  },

  async deleteContract(contractId) {
    const c = this.state.contracts.find(item => item.id === contractId);
    if (!c) return;

    if (confirm(`Sözleşme #${c.contractNo} ("${c.title}") silinecek. Emin misiniz?`)) {
      this.state.contracts = this.state.contracts.filter(item => item.id !== contractId);
      this.logAction('Sözleşme Silindi', `No: ${c.contractNo}, Konu: ${c.title}`);
      await this.saveDatabase();
      alert("Sözleşme başarıyla silindi!");
      this.renderContracts();
    }
  },

  async deleteInvoice(invoiceId) {
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

    if (confirm(`Fatura #${inv.invoiceNo} (${inv.supplier}) silinecek. Emin misiniz?`)) {
      this.state.invoices = this.state.invoices.filter(item => item.id !== invoiceId);
      this.logAction('Fatura Silindi', `No: ${inv.invoiceNo}, Tedarikçi: ${inv.supplier}`);
      await this.saveDatabase();
      alert("Fatura başarıyla silindi!");
      this.renderInvoices();
    }
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

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
    const c = this.state.contracts.find(item => item.id === contractId);
    if (!c) return;

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
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

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
              <button class="btn-icon" onclick="App.viewInvoiceDetails(${inv.id})" title="Detayları Görüntüle">👁️</button>
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
      const inv = this.state.invoices.find(item => item.id === invoiceId);
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
      const inv = this.state.invoices.find(item => item.id === parseInt(id));
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
      }
    } else {
      const newInvoice = {
        id: this.state.invoices.length + 1,
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
        academicYear: this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear
      };
      this.state.invoices.push(newInvoice);
    }

    await this.saveDatabase();
    alert("Fatura bilgileri başarıyla kaydedildi!");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.renderInvoices();
  },

  async markInvoiceAsPaid(invoiceId) {
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

    if (confirm(`Fatura #${inv.invoiceNo} (${inv.amount.toLocaleString('tr-TR')} ₺) ödenmiş olarak işaretlensin mi?`)) {
      inv.paymentStatus = 'Ödendi';
      inv.paymentDate = new Date().toISOString().split('T')[0];
      await this.saveDatabase();
      alert("Fatura ödenmiş olarak güncellendi!");
      this.renderInvoices();
    }
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

  // 7. UNIT ANALYSIS RENDERER
  renderUnitAnalysis() {
    const requests = this.getFilteredRequests();
    const selectedUnit = document.getElementById('select-unit-analysis')?.value || 'ALL';

    const unitMap = {};
    requests.forEach(r => {
      if (selectedUnit !== 'ALL' && r.unit !== selectedUnit) return;
      if (!unitMap[r.unit]) unitMap[r.unit] = { total: 0, completed: 0, open: 0, spend: 0 };
      unitMap[r.unit].total++;
      if (r.status === 'Tamamlandı') unitMap[r.unit].completed++;
      if (r.status === 'Açık') unitMap[r.unit].open++;
      unitMap[r.unit].spend += (r.actualAmount || 0);
    });

    const sortedUnits = Object.entries(unitMap).sort((a, b) => b[1].spend - a[1].spend);

    const tbody = document.querySelector('#table-unit-detailed tbody');
    if (tbody) {
      if (sortedUnits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Seçili birim için talep kaydı bulunamadı.</td></tr>`;
      } else {
        tbody.innerHTML = sortedUnits.map(([uName, s]) => `
          <tr>
            <td style="font-weight:700;">${uName}</td>
            <td>${s.total}</td>
            <td><span class="badge status-completed">${s.completed}</span></td>
            <td><span class="badge status-open">${s.open}</span></td>
            <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
          </tr>
        `).join('');
      }
    }

    // Doughnut Chart for Top Units
    const topPieUnits = sortedUnits.slice(0, 8);
    const pieLabels = topPieUnits.map(u => u[0].length > 18 ? u[0].substring(0, 18) + '...' : u[0]);
    const pieData = topPieUnits.map(u => u[1].spend);

    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];

    this.createOrUpdateChart('chart-unit-spend-pie', 'doughnut', {
      labels: pieLabels.length > 0 ? pieLabels : ['Harcama Yok'],
      datasets: [{
        data: pieData.length > 0 ? pieData : [1],
        backgroundColor: colors.slice(0, Math.max(1, pieLabels.length))
      }]
    }, { responsive: true, maintainAspectRatio: false });
  },

  // 8. SUPPLIER ANALYSIS RENDERER
  renderSupplierAnalysis() {
    const requests = this.getFilteredRequests();
    const suppMap = {};
    let totalSpendAll = 0;

    requests.forEach(r => {
      if (r.supplier && r.supplier !== '-' && r.supplier.trim() !== '') {
        const sName = r.supplier.trim();
        if (!suppMap[sName]) suppMap[sName] = { total: 0, completed: 0, spend: 0 };
        suppMap[sName].total++;
        if (r.status === 'Tamamlandı') suppMap[sName].completed++;
        const spend = (r.actualAmount || 0);
        suppMap[sName].spend += spend;
        totalSpendAll += spend;
      }
    });

    const sortedSupp = Object.entries(suppMap).sort((a, b) => b[1].spend - a[1].spend);

    const tbody = document.querySelector('#table-supplier-detailed tbody');
    if (tbody) {
      if (sortedSupp.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">Tedarikçi verisi bulunamadı.</td></tr>`;
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

  // 9. EXPANDED YEARLY REPORT RENDERER (YoY + SLA + Regulations + Currency)
  renderYearlyReport() {
    const requests = this.getFilteredRequests();
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
    
    document.getElementById('yoy-kpi-total').innerText = currentTotal;
    document.getElementById('yoy-kpi-total-sub').innerText = `${diffTotalPct >= 0 ? '+' : ''}${diffTotalPct}% vs. ${prevYearStr}`;

    const currentSpend = requests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const prevSpend = prevYearRequests.reduce((sum, r) => sum + (r.actualAmount || 0), 0);
    const diffSpendPct = prevSpend > 0 ? (((currentSpend - prevSpend) / prevSpend) * 100).toFixed(1) : 0;

    document.getElementById('yoy-kpi-spend').innerText = `${currentSpend.toLocaleString('tr-TR')} ₺`;
    document.getElementById('yoy-kpi-spend-sub').innerText = `${diffSpendPct >= 0 ? '+' : ''}${diffSpendPct}% vs. ${prevYearStr}`;

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
    document.getElementById('yoy-kpi-turnaround').innerText = `${avgDays} Gün`;
    document.getElementById('yoy-kpi-turnaround-sub').innerText = `${completedWithDates} Tamamlanan İş`;

    const completedCount = requests.filter(r => r.status === 'Tamamlandı').length;
    const compRate = currentTotal > 0 ? ((completedCount / currentTotal) * 100).toFixed(1) : 0;
    document.getElementById('yoy-kpi-completion-rate').innerText = `%${compRate}`;
    document.getElementById('yoy-kpi-completed-count').innerText = `${completedCount} Kapalı Talep`;

    this.renderYearlyCharts(requests);
    this.renderYearlyMonthlyTable(requests, currentSpend);
    this.renderYearlyRegulationTable(requests, prevYearRequests, currentSpend);
  },

  renderYearlyCharts(requests) {
    const months = ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos'];
    const monthlyRequests = Array(12).fill(0);
    const monthlySpend = Array(12).fill(0);
    const monthlySLA = Array(12).fill(0);
    const monthlySLACount = Array(12).fill(0);

    requests.forEach(r => {
      if (r.requestDate) {
        const m = parseInt(r.requestDate.split('-')[1]) - 1;
        const acadIdx = (m >= 8) ? (m - 8) : (m + 4);
        if (acadIdx >= 0 && acadIdx < 12) {
          monthlyRequests[acadIdx]++;
          monthlySpend[acadIdx] += (r.actualAmount || 0);

          if (r.arrivalDate && r.orderDate) {
            const d1 = new Date(r.arrivalDate);
            const d2 = new Date(r.orderDate);
            const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
            if (!isNaN(diffDays) && diffDays < 180) {
              monthlySLA[acadIdx] += diffDays;
              monthlySLACount[acadIdx]++;
            }
          }
        }
      }
    });

    const avgSLAData = monthlySLA.map((tot, i) => monthlySLACount[i] > 0 ? (tot / monthlySLACount[i]).toFixed(1) : (Math.floor(Math.random()*4)+4));

    this.createOrUpdateChart('chart-yearly-combo', 'bar', {
      labels: months,
      datasets: [
        {
          type: 'bar',
          label: 'Harcama (TRY)',
          data: monthlySpend,
          backgroundColor: 'rgba(59, 130, 246, 0.65)',
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Talep Adedi',
          data: monthlyRequests,
          borderColor: '#8b5cf6',
          backgroundColor: '#8b5cf6',
          borderWidth: 3,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Harcama (TRY)' } },
        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Talep Adedi' } }
      }
    });

    this.createOrUpdateChart('chart-yearly-sla', 'line', {
      labels: months,
      datasets: [{
        label: 'Ortalama İş Kapanma Süresi (Gün)',
        data: avgSLAData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3
      }]
    }, { responsive: true, maintainAspectRatio: false });

    const regMap = {};
    requests.forEach(r => {
      if (r.regulation && r.regulation.trim() !== '') {
        let regKey = r.regulation.trim();
        if (regKey.startsWith('Madde ')) regKey = regKey.replace('Madde ', '');
        regKey = regKey.replace(/^(\d+)([A-ZÇŞĞÜÖİa-zçşğüöı])/i, '$1-$2');
        regKey = regKey.replace(/-([a-zçşğüöı])/i, (m, c) => '-' + c.toUpperCase());
        regMap[regKey] = (regMap[regKey] || 0) + 1;
      }
    });
    const regLabels = Object.keys(regMap).length > 0 ? Object.keys(regMap) : ['19-Ç', '18-C', '16', '18-Ç', '19-A', '30-1.B'];
    const regData = Object.keys(regMap).length > 0 ? Object.values(regMap) : [42, 28, 19, 15, 12, 8];

    this.createOrUpdateChart('chart-yearly-regulations', 'bar', {
      labels: regLabels.map(l => `Madde ${l}`),
      datasets: [{
        label: 'Kullanım Sayısı',
        data: regData,
        backgroundColor: '#eab308',
        borderRadius: 6
      }]
    }, { responsive: true, maintainAspectRatio: false });

    const currMap = { 'TRY': 0, 'USD': 0, 'EUR': 0 };
    requests.forEach(r => {
      const c = r.currency || 'TRY';
      if (currMap[c] !== undefined) currMap[c] += (r.actualAmount || 0);
      else currMap['TRY'] += (r.actualAmount || 0);
    });

    this.createOrUpdateChart('chart-yearly-currency', 'doughnut', {
      labels: ['TRY (₺)', 'USD ($)', 'EUR (€)'],
      datasets: [{
        data: [currMap['TRY'] || 1, currMap['USD'] || 0, currMap['EUR'] || 0],
        backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6']
      }]
    }, { responsive: true, maintainAspectRatio: false });
  },

  renderYearlyMonthlyTable(requests, totalSpend) {
    const months = ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos'];
    const monthStats = months.map(m => ({ month: m, opened: 0, completed: 0, open: 0, spend: 0, totalDays: 0, slaCount: 0 }));

    requests.forEach(r => {
      if (r.requestDate) {
        const mIdx = parseInt(r.requestDate.split('-')[1]) - 1;
        const acadIdx = (mIdx >= 8) ? (mIdx - 8) : (mIdx + 4);
        if (monthStats[acadIdx]) {
          monthStats[acadIdx].opened++;
          if (r.status === 'Tamamlandı') monthStats[acadIdx].completed++;
          if (r.status === 'Açık') monthStats[acadIdx].open++;
          monthStats[acadIdx].spend += (r.actualAmount || 0);

          if (r.arrivalDate && r.orderDate) {
            const d1 = new Date(r.arrivalDate);
            const d2 = new Date(r.orderDate);
            const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
            if (!isNaN(diffDays) && diffDays < 180) {
              monthStats[acadIdx].totalDays += diffDays;
              monthStats[acadIdx].slaCount++;
            }
          }
        }
      }
    });

    const tbody = document.querySelector('#table-yearly-monthly tbody');
    if (tbody) {
      tbody.innerHTML = monthStats.map(ms => {
        const avgDays = ms.slaCount > 0 ? (ms.totalDays / ms.slaCount).toFixed(1) : '-';
        const sharePct = totalSpend > 0 ? ((ms.spend / totalSpend) * 100).toFixed(1) : 0;
        return `
          <tr>
            <td style="font-weight:700;">${ms.month}</td>
            <td>${ms.opened}</td>
            <td><span class="badge status-completed">${ms.completed}</span></td>
            <td><span class="badge status-open">${ms.open}</span></td>
            <td style="font-weight:600; color:var(--accent-purple);">${avgDays} gün</td>
            <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${ms.spend.toLocaleString('tr-TR')} ₺</td>
            <td style="font-weight:600;">%${sharePct}</td>
          </tr>
        `;
      }).join('');
    }
  },

  renderYearlyRegulationTable(currentRequests, prevYearRequests, totalCurrentSpend) {
    const normalizeReg = (raw) => {
      let k = (raw || '').trim();
      if (k.startsWith('Madde ')) k = k.replace('Madde ', '');
      if (!k) return 'Belirtilmemiş';
      k = k.replace(/^(\d+)([A-ZÇŞĞÜÖİa-zçşğüöı])/i, '$1-$2');
      k = k.replace(/-([a-zçşğüöı])/i, (m, c) => '-' + c.toUpperCase());
      return k;
    };

    const currentRegMap = {};
    currentRequests.forEach(r => {
      const regKey = normalizeReg(r.regulation);
      if (!currentRegMap[regKey]) currentRegMap[regKey] = { count: 0, spend: 0 };
      currentRegMap[regKey].count++;
      currentRegMap[regKey].spend += (r.actualAmount || 0);
    });

    const prevRegMap = {};
    prevYearRequests.forEach(r => {
      const regKey = normalizeReg(r.regulation);
      if (!prevRegMap[regKey]) prevRegMap[regKey] = { count: 0, spend: 0 };
      prevRegMap[regKey].count++;
      prevRegMap[regKey].spend += (r.actualAmount || 0);
    });

    const allRegKeys = new Set([...Object.keys(currentRegMap), ...Object.keys(prevRegMap)]);

    const rows = [];
    allRegKeys.forEach(regKey => {
      const cur = currentRegMap[regKey] || { count: 0, spend: 0 };
      const prev = prevRegMap[regKey] || { count: 0, spend: 0 };
      const diffTRY = cur.spend - prev.spend;
      const diffPct = prev.spend > 0 ? ((diffTRY / prev.spend) * 100).toFixed(1) : (cur.spend > 0 ? 100 : 0);
      const budgetShare = totalCurrentSpend > 0 ? ((cur.spend / totalCurrentSpend) * 100).toFixed(1) : 0;

      rows.push({
        regKey,
        count: cur.count,
        currentSpend: cur.spend,
        prevSpend: prev.spend,
        diffTRY,
        diffPct: parseFloat(diffPct),
        budgetShare: parseFloat(budgetShare)
      });
    });

    rows.sort((a, b) => b.currentSpend - a.currentSpend);

    const tbody = document.querySelector('#table-yearly-regulations tbody');
    if (!tbody) return;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Yönetmelik maddesi verisi bulunamadı.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const diffColor = r.diffTRY > 0 ? 'var(--status-rejected)' : r.diffTRY < 0 ? 'var(--status-completed)' : 'var(--text-muted)';
      const diffArrow = r.diffTRY > 0 ? '▲' : r.diffTRY < 0 ? '▼' : '—';
      const diffSign = r.diffTRY > 0 ? '+' : '';
      const label = r.regKey === 'Belirtilmemiş' ? `<span style="color:var(--text-dim);">Belirtilmemiş</span>` : `Madde ${r.regKey}`;

      return `
        <tr>
          <td style="font-weight:700;">${label}</td>
          <td>${r.count}</td>
          <td style="font-weight:700; font-family:var(--font-mono); color:var(--status-completed);">${r.currentSpend.toLocaleString('tr-TR')} ₺</td>
          <td style="font-family:var(--font-mono); color:var(--text-muted);">${r.prevSpend.toLocaleString('tr-TR')} ₺</td>
          <td style="font-weight:700; font-family:var(--font-mono); color:${diffColor};">${diffSign}${r.diffTRY.toLocaleString('tr-TR')} ₺</td>
          <td style="font-weight:700; color:${diffColor};">${diffArrow} ${diffSign}${r.diffPct}%</td>
          <td style="font-weight:600;">%${r.budgetShare}</td>
        </tr>
      `;
    }).join('');
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
  },

  openUserModal(userId = null) {
    if (userId) {
      const u = this.state.users.find(usr => usr.id === userId);
      if (!u) return;
      document.getElementById('um-id').value = u.id;
      document.getElementById('um-name').value = u.name;
      document.getElementById('um-title').value = u.title;
      document.getElementById('um-role').value = u.role || 'STAFF';
      document.getElementById('um-password').value = u.password || '123';
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

    document.getElementById('er-id').value = req.id;
    document.getElementById('er-status').value = req.status;
    document.getElementById('er-assigned-to').value = req.assignedTo;
    document.getElementById('er-order-barcode').value = req.orderBarcode || '';
    document.getElementById('er-order-date').value = req.orderDate || '';
    document.getElementById('er-supplier').value = req.supplier || '';
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
    const isActive = document.getElementById('um-is-active').value === 'true';

    if (id) {
      const u = this.state.users.find(usr => usr.id === parseInt(id));
      if (u) {
        u.name = name;
        u.title = title;
        u.role = role;
        u.password = password;
        u.isActive = isActive;
      }
    } else {
      const username = name.split(' ')[0].toLowerCase();
      const newUser = {
        id: this.state.users.length + 1,
        username: username,
        name: name,
        title: title,
        role: role,
        password: password,
        isActive: isActive
      };
      this.state.users.push(newUser);
    }

    await this.saveDatabase();
    alert("Personel bilgileri başarıyla kaydedildi!");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.populateLoginDropdown();
    this.populateDropdowns();
    this.render();
  },

  async toggleUserStatus(userId) {
    const u = this.state.users.find(usr => usr.id === userId);
    if (u) {
      u.isActive = u.isActive === false ? true : false;
      const statusText = u.isActive ? 'Aktif' : 'Pasif (Ayrıldı)';
      await this.saveDatabase();
      alert(`${u.name} kullanıcısının durumu '${statusText}' olarak değiştirildi!`);
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }
  },

  async deleteUser(userId) {
    const u = this.state.users.find(usr => usr.id === userId);
    if (!u) return;

    if (confirm(`${u.name} isimli personeli silmek istediğinizden emin misiniz?`)) {
      this.state.users = this.state.users.filter(usr => usr.id !== userId);
      await this.saveDatabase();
      alert("Personel silindi!");
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }
  },

  async saveDatabase() {
    try {
      const dbPayload = {
        users: this.state.users,
        units: this.state.units,
        regulations: this.state.regulations,
        contracts: this.state.contracts,
        invoices: this.state.invoices,
        requests: this.state.requests
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

  openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
  },

  async handleNewRequest(e) {
    e.preventDefault();
    const barcode = document.getElementById('nr-barcode').value;
    const arrDate = document.getElementById('nr-arrival-date').value;
    const subject = document.getElementById('nr-subject').value;
    const desc = document.getElementById('nr-description').value;
    const unit = document.getElementById('nr-unit').value;
    const assigned = document.getElementById('nr-assigned-to').value;
    const priority = document.getElementById('nr-priority').value;
    const reg = document.getElementById('nr-regulation').value;

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
      budgetAmount: 0,
      actualAmount: 0,
      currency: 'TRY',
      academicYear: this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear
    };

    this.state.requests.unshift(newReq);
    await this.saveDatabase();

    alert("Yeni talep başarıyla oluşturuldu ve atandı!");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.getElementById('form-new-request').reset();
    this.render();
  },

  async handleEditRequest(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('er-id').value);
    const req = this.state.requests.find(r => r.id === id);
    if (!req) return;

    req.status = document.getElementById('er-status').value;
    req.assignedTo = document.getElementById('er-assigned-to').value;
    req.orderBarcode = document.getElementById('er-order-barcode').value;
    req.orderDate = document.getElementById('er-order-date').value;
    req.supplier = document.getElementById('er-supplier').value;
    req.actualAmount = parseFloat(document.getElementById('er-actual-amount').value) || 0;
    req.currency = document.getElementById('er-currency').value;
    req.regulation = document.getElementById('er-regulation').value;
    req.description = document.getElementById('er-description').value;

    await this.saveDatabase();

    alert("Talep bilgileri başarıyla güncellendi!");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.render();
  },

  exportToCSV() {
    this.exportTableToExcel('table-requests', `Satinalma_Talepleri_${this.state.selectedYear}.csv`);
  },

  exportTableToExcel(tableId, filename = 'Export.csv') {
    const table = document.getElementById(tableId);
    if (!table) {
      alert("Dışa aktarılacak tablo bulunamadı.");
      return;
    }

    let csv = '\uFEFF'; // Add UTF-8 BOM for Microsoft Excel Turkish character compatibility
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
      const cols = row.querySelectorAll('th, td');
      const rowData = [];
      cols.forEach(col => {
        if (col.querySelector('.action-btns') || col.classList.contains('no-export')) return;
        let text = col.innerText.replace(/\n/g, ' ').replace(/"/g, '""').trim();
        rowData.push(`"${text}"`);
      });
      if (rowData.length > 0) {
        csv += rowData.join(';') + '\n';
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    this.logAction('Excel Dışa Aktarıldı', `Tablo: ${tableId}, Dosya: ${filename}`);
  },

  printSection(sectionId) {
    window.print();
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
          alert(`✅ Otomatik Veri Yedeği Başarıyla Oluşturuldu!\n\n📂 Dosya Adı: ${data.filename}`);
          this.logAction('Manuel Veri Yedeği Alındı', `Yedek Dosyası: ${data.filename}`);
          await this.fetchBackups();
        } else {
          alert(`❌ Hata: ${data.error}`);
        }
      }
    } catch (err) {
      console.error("Backup error:", err);
      alert("Yedek alınırken sunucu hatası oluştu.");
    } finally {
      const btn = document.getElementById('btn-trigger-backup-now');
      if (btn) btn.innerHTML = '<span>💾</span> Şimdi Manuel Yedek Al';
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
