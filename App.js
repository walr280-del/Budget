window.store = {

  // --- Helpers ---
  _load(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch { return fallback; }
  },
  _save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // --- Categories ---
  getCategories() {
    return this._load('categories', [
      { id: 1, name: 'Groceries',     is_default: true },
      { id: 2, name: 'Rent',          is_default: true },
      { id: 3, name: 'Transport',     is_default: true },
      { id: 4, name: 'Dining Out',    is_default: true },
      { id: 5, name: 'Entertainment', is_default: true },
      { id: 6, name: 'Education',     is_default: true },
      { id: 7, name: 'Income',        is_default: true },
      { id: 8, name: 'Other',         is_default: true },
    ]);
  },

  addCategory(name) {
    const cats = this.getCategories();
    const id   = Date.now();
    cats.push({ id, name, is_default: false });
    this._save('categories', cats);
    return { id, name };
  },

  deleteCategory(id) {
    const cats = this.getCategories().filter(c => c.id !== id);
    this._save('categories', cats);
  },

  // --- Transactions ---
  getTransactions(filters = {}) {
    let txs = this._load('transactions', []);
    if (filters.month !== undefined) {
      txs = txs.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === filters.month && d.getFullYear() === filters.year;
      });
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      txs = txs.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }
    if (filters.category_id) {
      txs = txs.filter(t => t.category_id === Number(filters.category_id));
    }
    if (filters.type) {
      txs = txs.filter(t => t.type === filters.type);
    }
    // Newest first
    return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  addTransaction(data) {
    const txs = this._load('transactions', []);
    const tx  = { ...data, id: Date.now(), created_at: new Date().toISOString() };
    txs.push(tx);
    this._save('transactions', txs);
    return tx;
  },

  deleteTransaction(id) {
    const txs = this._load('transactions', []).filter(t => t.id !== id);
    this._save('transactions', txs);
  },

  // --- Summary (for dashboard) ---
  getSummary(month, year) {
    const txs      = this.getTransactions({ month, year });
    const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Category breakdown (expenses only)
    const cats   = this.getCategories();
    const byCategory = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      const cat = cats.find(c => c.id === t.category_id);
      const name = cat ? cat.name : 'Other';
      byCategory[name] = (byCategory[name] || 0) + t.amount;
    });

    return { income, expenses, net: income - expenses, count: txs.length, byCategory };
  },

  // --- Budgets ---
  getBudgets(month, year) {
    return this._load('budgets', []).filter(
      b => b.month === month && b.year === year
    );
  },

  saveBudget(data) {
    const budgets = this._load('budgets', []);
    // Update existing or add new
    const idx = budgets.findIndex(
      b => b.category_id === data.category_id && b.month === data.month && b.year === data.year
    );
    if (idx >= 0) {
      budgets[idx] = { ...budgets[idx], ...data };
    } else {
      budgets.push({ ...data, id: Date.now() });
    }
    this._save('budgets', budgets);
  },

  deleteBudget(id) {
    const budgets = this._load('budgets', []).filter(b => b.id !== id);
    this._save('budgets', budgets);
  },

  // --- Settings ---
  getSettings() {
    return this._load('settings', {
      currency: 'USD',
      alerts: true,
      darkMode: false,
    });
  },

  saveSettings(data) {
    this._save('settings', data);
  },
};


function txItemHTML(tx, showDelete = false) {
  const cats  = store.getCategories();
  const cat   = cats.find(c => c.id === tx.category_id);
  const catName = cat ? cat.name : 'Other';
  const icon  = categoryIcon(catName);
  const cls   = tx.type === 'expense' ? 'expense' : 'income';
  const sign  = tx.type === 'expense' ? '-' : '+';
  const date  = new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric'
  });

  return `
    <div class="tx-item">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${escapeHTML(tx.description)}</div>
        <div class="tx-meta">${escapeHTML(catName)} &middot; ${date}</div>
      </div>
      <div class="tx-amount ${cls}">${sign}${formatCurrency(tx.amount)}</div>
      ${showDelete ? `<button class="tx-delete" data-id="${tx.id}" title="Delete">&#128465;</button>` : ''}
    </div>`;
}


/* ──────────────────────────────────────────
   BUDGET
   ────────────────────────────────────────── */

function renderBudget() {
  document.getElementById('budgetMonthLabel').textContent =
    formatMonthLabel(state.currentMonth, state.currentYear);

  const budgets  = store.getBudgets(state.currentMonth, state.currentYear);
  const summary  = store.getSummary(state.currentMonth, state.currentYear);
  const cats     = store.getCategories();
  const listEl   = document.getElementById('budgetList');

  if (budgets.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No budgets set. Add one above!</p>';
    return;
  }

  listEl.innerHTML = budgets.map(b => {
    const cat     = cats.find(c => c.id === b.category_id);
    const name    = cat ? cat.name : 'Unknown';
    const spent   = summary.byCategory[name] || 0;
    const pct     = Math.min(100, (spent / b.monthly_limit) * 100);
    const fillCls = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'safe';
    const alert   = pct >= 100
      ? `<div class="budget-alert">⚠ Budget reached!</div>`
      : pct >= 80 ? `<div class="budget-alert" style="color:var(--amber)">Approaching limit</div>` : '';

    return `
      <div class="budget-item">
        <div class="budget-header">
          <span class="budget-name">
            ${escapeHTML(name)}
            <button class="budget-delete" data-id="${b.id}" title="Remove budget">&#10005;</button>
          </span>
          <span class="budget-pct">$${spent.toFixed(2)} / $${b.monthly_limit.toFixed(2)} &middot; ${Math.round(pct)}%</span>
        </div>
        <div class="budget-track">
          <div class="budget-fill ${fillCls}" style="width: ${pct}%"></div>
        </div>
        ${alert}
      </div>`;
  }).join('');
}


/* ──────────────────────────────────────────
   ANALYTICS
   ────────────────────────────────────────── */

function renderAnalytics() {
  const monthly = getLast6MonthsData();
  renderAnalyticsBarChart(monthly);
  renderIncomeVsExpenseChart(monthly);

  // Top categories (all time, expenses only)
  const allTxs    = store.getTransactions({});
  const cats      = store.getCategories();
  const totals    = {};
  let   grandTotal = 0;

  allTxs.filter(t => t.type === 'expense').forEach(t => {
    const cat  = cats.find(c => c.id === t.category_id);
    const name = cat ? cat.name : 'Other';
    totals[name] = (totals[name] || 0) + t.amount;
    grandTotal  += t.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const topEl  = document.getElementById('topCategories');

  if (sorted.length === 0) {
    topEl.innerHTML = '<p class="empty-state">No expense data yet.</p>';
    return;
  }

  topEl.innerHTML = sorted.slice(0, 8).map(([name, total], i) => {
    const pct = grandTotal ? ((total / grandTotal) * 100).toFixed(1) : 0;
    return `
      <div class="top-cat-item">
        <span class="cat-rank">#${i + 1}</span>
        <span class="cat-name">${escapeHTML(name)}</span>
        <span class="cat-pct">${pct}%</span>
        <span class="cat-amount">${formatCurrency(total)}</span>
      </div>`;
  }).join('');
}


/* ──────────────────────────────────────────
   SETTINGS
   ────────────────────────────────────────── */

function renderSettings() {
  const settings = store.getSettings();
  document.getElementById('settingCurrency').value = settings.currency;
  document.getElementById('settingAlerts').checked = settings.alerts;
  document.getElementById('settingDark').checked   = settings.darkMode;

  renderCategoryChips();
}

function renderCategoryChips() {
  const cats = store.getCategories();
  document.getElementById('categoryList').innerHTML = cats.map(c => `
    <span class="category-chip">
      ${escapeHTML(c.name)}
      ${c.is_default ? '' : `<button class="chip-delete" data-id="${c.id}" title="Remove">&#10005;</button>`}
    </span>`).join('');
}


/* ──────────────────────────────────────────
   FORM — ADD TRANSACTION
   ────────────────────────────────────────── */

function populateCategoryDropdowns() {
  const cats = store.getCategories();
  const opts = cats.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');

  // Transaction form
  const txCat = document.getElementById('txCategory');
  if (txCat) txCat.innerHTML = '<option value="">-- Select category --</option>' + opts;

  // Budget form
  const budgetCat = document.getElementById('budgetCategory');
  if (budgetCat) budgetCat.innerHTML = '<option value="">-- Select --</option>' + opts;

  // History filter
  const filterCat = document.getElementById('filterCategory');
  if (filterCat) filterCat.innerHTML = '<option value="">All Categories</option>' + opts;
}


// Show a brief success message then auto-hide
function showAlert(id, durationMs = 3000) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), durationMs);
}


/* ──────────────────────────────────────────
   EVENT LISTENERS — set up on page load
   ────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // --- Navigation buttons ---
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // --- Link buttons (e.g. "View all" on dashboard, "Add one!" links) ---
  document.addEventListener('click', e => {
    if (e.target.classList.contains('link-btn') && e.target.dataset.page) {
      navigateTo(e.target.dataset.page);
    }
  });

  // --- Mobile hamburger ---
  document.getElementById('navToggle').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });

  // --- Month navigation (dashboard) ---
  document.getElementById('prevMonth').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    renderDashboard();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    renderDashboard();
  });

  // --- Expense / Income type toggle ---
  document.getElementById('expenseBtn').addEventListener('click', () => {
    state.currentTxType = 'expense';
    document.getElementById('expenseBtn').classList.add('active');
    document.getElementById('incomeBtn').classList.remove('active');
  });
  document.getElementById('incomeBtn').addEventListener('click', () => {
    state.currentTxType = 'income';
    document.getElementById('incomeBtn').classList.add('active');
    document.getElementById('expenseBtn').classList.remove('active');
  });

  // --- Add Transaction form submit ---
  document.getElementById('transactionForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!validateTransactionForm()) return;

    store.addTransaction({
      type:        state.currentTxType,
      description: document.getElementById('txDescription').value.trim(),
      amount:      parseFloat(document.getElementById('txAmount').value),
      date:        document.getElementById('txDate').value,
      category_id: parseInt(document.getElementById('txCategory').value),
      tags:        document.getElementById('txTags').value.trim(),
      notes:       document.getElementById('txNotes').value.trim(),
    });

    clearTransactionForm();
    showAlert('formSuccess');
  });

  // --- Clear form button ---
  document.getElementById('clearFormBtn').addEventListener('click', clearTransactionForm);

  // --- History: search & filter (re-render on change) ---
  ['searchInput', 'filterCategory', 'filterType'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      state.txPage = 1;
      renderHistory();
    });
  });

  // --- History: delete transaction & pagination (event delegation) ---
  document.getElementById('historyList').addEventListener('click', e => {
    if (e.target.classList.contains('tx-delete') || e.target.closest('.tx-delete')) {
      const btn = e.target.closest('.tx-delete') || e.target;
      if (confirm('Delete this transaction?')) {
        store.deleteTransaction(Number(btn.dataset.id));
        renderHistory();
      }
    }
  });

  document.getElementById('pagination').addEventListener('click', e => {
    if (e.target.classList.contains('page-num')) {
      state.txPage = parseInt(e.target.dataset.p);
      renderHistory();
    }
  });

  // --- Budget form submit ---
  document.getElementById('budgetForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!validateBudgetForm()) return;

    store.saveBudget({
      category_id:   parseInt(document.getElementById('budgetCategory').value),
      monthly_limit: parseFloat(document.getElementById('budgetLimit').value),
      month:         state.currentMonth,
      year:          state.currentYear,
    });

    document.getElementById('budgetCategory').value = '';
    document.getElementById('budgetLimit').value    = '';
    showAlert('budgetSuccess');
    renderBudget();
  });

  // --- Budget: delete (event delegation) ---
  document.getElementById('budgetList').addEventListener('click', e => {
    if (e.target.classList.contains('budget-delete') || e.target.closest('.budget-delete')) {
      const btn = e.target.closest('.budget-delete') || e.target;
      if (confirm('Remove this budget?')) {
        store.deleteBudget(Number(btn.dataset.id));
        renderBudget();
      }
    }
  });

  // --- Settings: save preferences ---
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const settings = {
      currency: document.getElementById('settingCurrency').value,
      alerts:   document.getElementById('settingAlerts').checked,
      darkMode: document.getElementById('settingDark').checked,
    };
    store.saveSettings(settings);
    document.body.classList.toggle('dark-mode', settings.darkMode);
    showAlert('settingsSuccess');
  });

  // --- Settings: add category ---
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    const input = document.getElementById('newCategoryName');
    const errEl = document.getElementById('categoryAddError');
    const name  = input.value.trim();

    if (!name) {
      errEl.textContent = 'Enter a category name.';
      return;
    }
    errEl.textContent = '';
    store.addCategory(name);
    input.value = '';
    renderCategoryChips();
    populateCategoryDropdowns();
  });

  // --- Settings: delete category (event delegation) ---
  document.getElementById('categoryList').addEventListener('click', e => {
    if (e.target.classList.contains('chip-delete') || e.target.closest('.chip-delete')) {
      const btn = e.target.closest('.chip-delete') || e.target;
      store.deleteCategory(Number(btn.dataset.id));
      renderCategoryChips();
      populateCategoryDropdowns();
    }
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const txs = store.getTransactions({});
    if (txs.length === 0) { alert('No transactions to export.'); return; }
    exportCSV(txs);
  });

  document.getElementById('exportAllBtn').addEventListener('click', () => {
    const txs = store.getTransactions({});
    exportCSV(txs);
  });

  // --- Reset all data ---
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm('Are you sure? This will delete ALL transactions and budgets.')) {
      localStorage.removeItem('transactions');
      localStorage.removeItem('budgets');
      alert('All data has been reset.');
      renderCurrentPage();
    }
  });

  // --- Dashboard: delete from recent list (event delegation) ---
  document.getElementById('recentTxList').addEventListener('click', e => {
    if (e.target.classList.contains('tx-delete') || e.target.closest('.tx-delete')) {
      const btn = e.target.closest('.tx-delete') || e.target;
      if (confirm('Delete this transaction?')) {
        store.deleteTransaction(Number(btn.dataset.id));
        renderDashboard();
      }
    }
  });

  // --- Set today's date as default in the form ---
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txDate').value = today;

  // --- Apply saved dark mode on load ---
  const settings = store.getSettings();
  if (settings.darkMode) document.body.classList.add('dark-mode');

  // --- Initial setup ---
  populateCategoryDropdowns();
  renderDashboard();

});
