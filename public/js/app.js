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
    const unitSelects = ['filter-unit', 'select-unit-analysis', 'nr-unit', 'cm-unit', 'filter-contract-unit', 'filter-my-unit', 'filter-supplier-unit'];
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
    const assignSelects = ['nr-assigned-to', 'er-assigned-to', 'delegate-to-person', 'cm-assigned-to', 'bulk-delegate-person'];
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

    const q = query?.toLowerCase().trim();
    if (!q || q.length < 2) {
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          🔍 Sorgulamak istediğiniz talep barkodunu veya kelimeyi yukarıya yazın.
        </div>
      `;
      return;
    }

    const matches = (this.state.requests || []).filter(r => 
      r.requestBarcode?.toString().toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q) ||
      r.unit?.toLowerCase().includes(q) ||
      r.orderBarcode?.toString().toLowerCase().includes(q)
    ).slice(0, 6);

    if (matches.length === 0) {
      resultsBox.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--status-rejected); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          ⚠️ "${query}" ile eşleşen hiçbir talep kaydı bulunamadı.
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
    ['filter-search', 'filter-start-date', 'filter-end-date', 'filter-status', 'filter-unit', 'filter-person', 'filter-priority'].forEach(id => {
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
    ['filter-my-search', 'filter-my-status', 'filter-my-unit', 'filter-my-priority'].forEach(id => {
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
      await this.saveDatabase();
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

    // Filter for Unit Analysis
    document.getElementById('filter-unit-search')?.addEventListener('input', () => this.renderUnitAnalysis());
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
    this.saveDatabase();
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
    this.renderNotifications();
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

  // 🔔 NOTIFICATION CENTER & ALERTS
  renderNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const notifs = [];

    // 1. 14+ Day SLA Overdue Requests
    const overdueRequests = (this.state.requests || []).filter(r => {
      if (r.status !== 'Açık') return false;
      const d = new Date(r.arrivalDate || r.requestDate);
      d.setHours(0, 0, 0, 0);
      const diff = Math.max(0, Math.ceil((today - d) / (1000 * 60 * 60 * 24)));
      return diff >= 14;
    });

    if (overdueRequests.length > 0) {
      notifs.push({
        type: 'sla',
        icon: '🚨',
        title: `${overdueRequests.length} Adet Talep SLA Sınırını (14 Gün) Aştı!`,
        sub: 'Gecikmiş açık talepleri incelemek için tıklayın',
        action: () => {
          this.switchView('requests');
          const sel = document.getElementById('filter-status');
          if (sel) {
            sel.value = 'OVERDUE_14';
            this.renderRequestsTable();
          }
        }
      });
    }

    // 2. Contracts Expiring in <= 30 Days or Guarantee Expiry in <= 30 Days
    const expiringContracts = (this.state.contracts || []).filter(c => {
      if (c.status !== 'Aktif') return false;
      let isExpiring = false;
      if (c.endDate) {
        const endDt = new Date(c.endDate);
        const diff = Math.ceil((endDt - today) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff <= 30) isExpiring = true;
      }
      if (c.guaranteeExpiry) {
        const gDt = new Date(c.guaranteeExpiry);
        const diffG = Math.ceil((gDt - today) / (1000 * 60 * 60 * 24));
        if (diffG >= 0 && diffG <= 30) isExpiring = true;
      }
      return isExpiring;
    });

    if (expiringContracts.length > 0) {
      notifs.push({
        type: 'contract',
        icon: '📑',
        title: `${expiringContracts.length} Adet Sözleşme / Teminat Süresi Bitiyor!`,
        sub: 'Son 30 gün kalan aktif anlaşmaları kontrol edin',
        action: () => {
          this.switchView('contracts');
        }
      });
    }

    // 3. Unpaid Invoices Due in <= 7 Days or Overdue
    const dueInvoices = (this.state.invoices || []).filter(i => {
      if (i.paymentStatus === 'Ödendi') return false;
      if (i.dueDate) {
        const dDt = new Date(i.dueDate);
        const diff = Math.ceil((dDt - today) / (1000 * 60 * 60 * 24));
        return diff <= 7;
      }
      return false;
    });

    if (dueInvoices.length > 0) {
      notifs.push({
        type: 'invoice',
        icon: '⏳',
        title: `${dueInvoices.length} Adet Faturanın Vadesi Yaklaştı / Geçti!`,
        sub: 'Vadesi 7 gün içinde gelen faturaları görüntüleyin',
        action: () => {
          this.switchView('invoices');
        }
      });
    }

    const badge = document.getElementById('notif-badge');
    const headerCount = document.getElementById('notif-header-count');
    const list = document.getElementById('notif-list');

    const totalNotifs = notifs.length;

    if (badge) {
      if (totalNotifs > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = totalNotifs;
      } else {
        badge.style.display = 'none';
      }
    }

    if (headerCount) {
      headerCount.innerText = `${totalNotifs} Akıllı Uyarı`;
    }

    if (list) {
      if (notifs.length === 0) {
        list.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Şu an için kritik uyarı veya bildiriminiz yok.</div>`;
      } else {
        list.innerHTML = notifs.map((n, idx) => `
          <div class="notif-item" onclick="App._triggerNotif(${idx})">
            <div class="notif-item-icon">${n.icon}</div>
            <div>
              <div class="notif-item-title">${n.title}</div>
              <div class="notif-item-sub">${n.sub}</div>
            </div>
          </div>
        `).join('');
        this._notifActions = notifs.map(n => n.action);
      }
    }
  },

  _triggerNotif(idx) {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.remove('show');
    if (this._notifActions && this._notifActions[idx]) {
      this._notifActions[idx]();
    }
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
      if (r.estimatedAmount > 0 && r.actualAmount > 0 && r.estimatedAmount > r.actualAmount) {
        totalEstimated += r.estimatedAmount;
        totalSavings += (r.estimatedAmount - r.actualAmount);
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
    const startDateVal = document.getElementById('filter-start-date')?.value || '';
    const endDateVal = document.getElementById('filter-end-date')?.value || '';
    const statusVal = document.getElementById('filter-status')?.value || 'ALL';
    const unitVal = document.getElementById('filter-unit')?.value || 'ALL';
    const personVal = document.getElementById('filter-person')?.value || 'ALL';
    const priorityVal = document.getElementById('filter-priority')?.value || 'ALL';

    requests = requests.filter(r => {
      if (startDateVal) {
        const sDt = new Date(startDateVal);
        sDt.setHours(0,0,0,0);
        const reqDt = new Date(r.arrivalDate || r.requestDate);
        reqDt.setHours(0,0,0,0);
        if (reqDt < sDt) return false;
      }

      if (endDateVal) {
        const eDt = new Date(endDateVal);
        eDt.setHours(23,59,59,999);
        const reqDt = new Date(r.arrivalDate || r.requestDate);
        reqDt.setHours(0,0,0,0);
        if (reqDt > eDt) return false;
      }

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
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', ${r.id})" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
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
      personMap[u.name] = { user: u, total: 0, open: 0, completed: 0, rejected: 0, critical: 0, high: 0, score: 0, savings: 0 };
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

        if (r.estimatedAmount > 0 && r.actualAmount > 0 && r.estimatedAmount > r.actualAmount) {
          p.savings += (r.estimatedAmount - r.actualAmount);
        }
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
              <h5 style="color:var(--status-completed); font-size:0.85rem;" title="Uzmanın Kuruma Kazandırdığı Pazarlık Tasarrufu">🎯 ${p.savings > 0 ? (p.savings / 1000).toFixed(1) + 'k ₺' : '0 ₺'}</h5>
              <p>Tasarruf</p>
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
      this.showToast("Lütfen hedef aktif personeli seçin!", "warning");
      return;
    }

    if (checked.length === 0) {
      this.showToast("Lütfen devretmek için en az bir talep seçin!", "warning");
      return;
    }

    this.state.requests.forEach(r => {
      if (checked.includes(r.id)) {
        r.assignedTo = targetPerson;
      }
    });

    await this.saveDatabase();
    this.showToast(`${checked.length} adet talep başarıyla ${targetPerson} adlı personele devredildi!`, "success", "⚖️");
    this.render();
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
            <a href="#request/${r.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'request', ${r.id})" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
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
              <a href="#contract/${c.id}" class="btn-icon" onclick="App._handleLinkClick(event, 'contract', ${c.id})" title="Detayları Görüntüle (Sağ Tık: Yeni Sekme)" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">👁️</a>
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

    const barcodeText = req.requestBarcode ? `Barkod #${req.requestBarcode}` : 'Talep';
    this.showConfirm("Talebi Sil", `${barcodeText} - "${req.subject}" başlıklı talebi silmek istediğinizden emin misiniz?`, async () => {
      this.state.requests = this.state.requests.filter(r => r.id !== requestId);
      this.logAction('Talep Silindi', `Barkod: ${req.requestBarcode || '-'}, Konu: ${req.subject}`);
      await this.saveDatabase();
      this.showToast("Talep başarıyla silindi!", "warning");
      this.render();
    }, '🗑️');
  },

  async deleteContract(contractId) {
    const c = this.state.contracts.find(item => item.id === contractId);
    if (!c) return;

    this.showConfirm("Sözleşmeyi Sil", `Sözleşme #${c.contractNo} ("${c.title}") silinecek. Emin misiniz?`, async () => {
      this.state.contracts = this.state.contracts.filter(item => item.id !== contractId);
      this.logAction('Sözleşme Silindi', `No: ${c.contractNo}, Konu: ${c.title}`);
      await this.saveDatabase();
      this.showToast("Sözleşme başarıyla silindi!", "warning");
      this.renderContracts();
    }, '🗑️');
  },

  async deleteInvoice(invoiceId) {
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

    this.showConfirm("Faturayı Sil", `Fatura #${inv.invoiceNo} (${inv.supplier}) silinecek. Emin misiniz?`, async () => {
      this.state.invoices = this.state.invoices.filter(item => item.id !== invoiceId);
      this.logAction('Fatura Silindi', `No: ${inv.invoiceNo}, Tedarikçi: ${inv.supplier}`);
      await this.saveDatabase();
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

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
    const c = this.state.contracts.find(item => item.id === contractId);
    if (!c) return;

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
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

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
    this.showToast("Fatura bilgileri başarıyla kaydedildi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.renderInvoices();
  },

  async markInvoiceAsPaid(invoiceId) {
    const inv = this.state.invoices.find(item => item.id === invoiceId);
    if (!inv) return;

    this.showConfirm("Fatura Ödeme Onayı", `Fatura #${inv.invoiceNo} (${inv.amount.toLocaleString('tr-TR')} ₺) ödenmiş olarak işaretlensin mi?`, async () => {
      inv.paymentStatus = 'Ödendi';
      inv.paymentDate = new Date().toISOString().split('T')[0];
      await this.saveDatabase();
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

    this.showConfirm("Toplu Durum Güncelleme", `Seçilen ${ids.length} adet talebi 'Tamamlandı' olarak güncellemek istediğinize emin misiniz?`, async () => {
      ids.forEach(id => {
        const r = this.state.requests.find(req => req.id === id);
        if (r) r.status = 'Tamamlandı';
      });

      this.logAction('Toplu Talep Tamamlandı', `${ids.length} adet talep toplu olarak tamamlandı yapıldı.`);
      await this.saveDatabase();
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
      ids.forEach(id => {
        const r = this.state.requests.find(req => req.id === id);
        if (r) r.assignedTo = targetPerson;
      });

      this.logAction('Toplu Talep Devredildi', `${ids.length} adet talep ${targetPerson} isimli personele devredildi.`);
      await this.saveDatabase();
      this.showToast(`${ids.length} adet talep ${targetPerson} personeline başarıyla devredildi!`, "success", "👉");
      const chkAll = document.getElementById('chk-select-all-requests');
      if (chkAll) chkAll.checked = false;
      this._onRowCheckboxChange();
      this.render();
    }, '👉');
  },

  // 7. UNIT ANALYSIS RENDERER (REDESIGNED DASHBOARD)
  renderUnitAnalysis() {
    const requests = this.getFilteredRequests();
    const selectedUnit = document.getElementById('select-unit-analysis')?.value || 'ALL';
    const searchText = document.getElementById('filter-unit-search')?.value.toLowerCase().trim() || '';

    const unitMap = {};
    const unitSLA = {};
    let grandTotalSpend = 0;

    requests.forEach(r => {
      const uName = r.unit;
      if (!unitMap[uName]) unitMap[uName] = { total: 0, completed: 0, open: 0, spend: 0 };
      if (!unitSLA[uName]) unitSLA[uName] = { totalDays: 0, count: 0 };

      unitMap[uName].total++;
      if (r.status === 'Tamamlandı') unitMap[uName].completed++;
      if (r.status === 'Açık') unitMap[uName].open++;
      
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
      if (elSpenderSub) elSpenderSub.innerText = `${topSpender[1].spend.toLocaleString('tr-TR')} ₺ Toplam Harcama`;
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
        if (elFastestSub) elFastestSub.innerText = `${avg} Gün Ort. Temin Süresi`;
      } else {
        elFastest.innerText = '-';
        if (elFastestSub) elFastestSub.innerText = 'Süresi tamamlanmış veri yok';
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

    // 3. Render Interactive Unit Dashboard Cards Grid
    const cardsContainer = document.getElementById('unit-cards-container');
    if (cardsContainer) {
      if (filteredEntries.length === 0) {
        cardsContainer.innerHTML = `<div style="grid-column: span 3; text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun birim bulunamadı.</div>`;
      } else {
        cardsContainer.innerHTML = filteredEntries.map(([uName, s]) => {
          const share = grandTotalSpend > 0 ? ((s.spend / grandTotalSpend) * 100).toFixed(1) : 0;
          const sla = unitSLA[uName] && unitSLA[uName].count > 0 ? (unitSLA[uName].totalDays / unitSLA[uName].count).toFixed(1) : '-';

          // Dynamic Progress Color
          let fillClass = 'progress-fill-green';
          if (share > 20) fillClass = 'progress-fill-yellow';
          if (share > 35) fillClass = 'progress-fill-red';

          return `
            <div class="unit-dashboard-card">
              <div>
                <div class="unit-card-title">
                  <h4>🏢 ${uName}</h4>
                  <span class="badge priority-orta">%${share} Bütçe Payı</span>
                </div>

                <div style="font-size: 1.35rem; font-weight: 800; color: var(--status-completed); font-family: var(--font-mono); margin-bottom: 0.5rem;">
                  ${s.spend.toLocaleString('tr-TR')} ₺
                </div>

                <div class="budget-progress-container">
                  <div class="budget-progress-header">
                    <span>Kurum Bütçe Payı Oranı</span>
                    <span>%${share}</span>
                  </div>
                  <div class="budget-progress-track">
                    <div class="budget-progress-fill ${fillClass}" style="width: ${Math.min(100, Math.max(6, share * 2.2))}%;"></div>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.5rem; font-size: 0.8rem;">
                <div>
                  <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${s.total}</div>
                  <div style="color: var(--text-muted); font-size: 0.72rem;">Toplam</div>
                </div>
                <div>
                  <div style="font-weight: 700; color: var(--status-completed); font-size: 0.95rem;">${s.completed}</div>
                  <div style="color: var(--text-muted); font-size: 0.72rem;">Biten</div>
                </div>
                <div>
                  <div style="font-weight: 700; color: var(--status-open); font-size: 0.95rem;">${sla} gün</div>
                  <div style="color: var(--text-muted); font-size: 0.72rem;">Ort. SLA</div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Render Detailed Unit Table
    const tbody = document.querySelector('#table-unit-detailed tbody');
    if (tbody) {
      if (filteredEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Filtreleme kriterlerine uygun birim kaydı bulunamadı.</td></tr>`;
      } else {
        tbody.innerHTML = filteredEntries.map(([uName, s]) => {
          const share = grandTotalSpend > 0 ? ((s.spend / grandTotalSpend) * 100).toFixed(1) : 0;
          const sla = unitSLA[uName] && unitSLA[uName].count > 0 ? (unitSLA[uName].totalDays / unitSLA[uName].count).toFixed(1) + ' gün' : '-';

          return `
            <tr>
              <td style="font-weight:700;">🏢 ${uName}</td>
              <td style="font-weight:600;">${s.total}</td>
              <td><span class="badge status-completed">${s.completed}</span></td>
              <td><span class="badge status-open">${s.open}</span></td>
              <td style="font-weight:600;">%${share}</td>
              <td style="color:var(--text-muted); font-size:0.85rem;">${sla}</td>
              <td style="font-weight:700; color:var(--status-completed); font-family:var(--font-mono);">${s.spend.toLocaleString('tr-TR')} ₺</td>
            </tr>
          `;
        }).join('');
      }
    }
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
    const req = this.state.requests.find(r => r.id === requestId);
    if (!req) return;

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
      const u = this.state.users.find(usr => usr.id === parseInt(id));
      if (u) {
        u.name = name;
        u.title = title;
        u.role = role;
        u.password = password;
        u.phone = phone;
        u.email = email;
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
        phone: phone,
        email: email,
        isActive: isActive
      };
      this.state.users.push(newUser);
    }

    await this.saveDatabase();
    this.showToast("Personel bilgileri başarıyla kaydedildi!", "success");
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
      this.showToast(`${u.name} kullanıcısının durumu '${statusText}' olarak değiştirildi!`, "info");
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }
  },

  async deleteUser(userId) {
    const u = this.state.users.find(usr => usr.id === userId);
    if (!u) return;

    this.showConfirm("Personel Sil", `${u.name} isimli personeli silmek istediğinizden emin misiniz?`, async () => {
      this.state.users = this.state.users.filter(usr => usr.id !== userId);
      await this.saveDatabase();
      this.showToast("Personel başarıyla silindi!", "warning");
      this.populateLoginDropdown();
      this.populateDropdowns();
      this.render();
    }, '🗑️');
  },

  async saveDatabase() {
    try {
      const dbPayload = {
        users: this.state.users,
        units: this.state.units,
        regulations: this.state.regulations,
        contracts: this.state.contracts,
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
      if (confirm(`${title}\n${message}`)) onConfirm();
      return;
    }

    const iconEl = document.getElementById('confirm-modal-icon');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    const btnOk = document.getElementById('btn-confirm-ok');
    const btnCancel = document.getElementById('btn-confirm-cancel');

    if (iconEl) iconEl.innerText = icon;
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;

    modal.classList.add('active');

    const cleanup = () => {
      modal.classList.remove('active');
      if (btnOk) btnOk.removeEventListener('click', handleOk);
      if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
    };

    const handleOk = () => {
      cleanup();
      if (typeof onConfirm === 'function') onConfirm();
    };

    const handleCancel = () => {
      cleanup();
    };

    if (btnOk) btnOk.addEventListener('click', handleOk);
    if (btnCancel) btnCancel.addEventListener('click', handleCancel);
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
    const assigned = document.getElementById('nr-assigned-to').value;
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
      academicYear: this.state.selectedYear === 'ALL' ? '2025-2026' : this.state.selectedYear
    };

    this.state.requests.unshift(newReq);
    await this.saveDatabase();

    this.showToast("Yeni talep başarıyla oluşturuldu ve atandı!", "success");
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
    const estAmt = parseFloat(document.getElementById('er-estimated-amount')?.value) || 0;
    req.estimatedAmount = estAmt;
    if (!req.budgetAmount) req.budgetAmount = estAmt;
    req.actualAmount = parseFloat(document.getElementById('er-actual-amount').value) || 0;
    req.currency = document.getElementById('er-currency').value;
    req.regulation = document.getElementById('er-regulation').value;
    req.description = document.getElementById('er-description').value;

    await this.saveDatabase();

    this.showToast("Talep bilgileri başarıyla güncellendi!", "success");
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.render();
  },

  exportToCSV() {
    this.exportTableToExcel('table-requests', `Satinalma_Talepleri_${this.state.selectedYear}.xls`);
  },

  exportTableToExcel(tableId, filename = 'Export.xls') {
    const table = document.getElementById(tableId);
    if (!table) {
      this.showToast("Dışa aktarılacak tablo bulunamadı.", "warning");
      return;
    }

    if (!filename.endsWith('.xls') && !filename.endsWith('.xlsx')) {
      filename = filename.replace(/\.[^/.]+$/, "") + ".xls";
    }

    // Build Microsoft Excel XML/HTML Workbook representation
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Satınalma Takip Raporu</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Segoe UI, sans-serif; font-size: 11pt; }
          th { background-color: #1e293b; color: #ffffff; font-weight: bold; border: 1px solid #94a3b8; padding: 8px; text-align: left; }
          td { border: 1px solid #cbd5e1; padding: 6px; color: #0f172a; }
        </style>
      </head>
      <body>
        <table>
    `;

    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      tableHtml += '<tr>';
      const cols = row.querySelectorAll('th, td');
      cols.forEach(col => {
        if (col.querySelector('.action-btns') || col.classList.contains('no-export')) return;
        const tag = col.tagName.toLowerCase();
        let text = col.innerText.replace(/\n/g, ' ').trim();
        tableHtml += `<${tag}>${text}</${tag}>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF' + tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
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
