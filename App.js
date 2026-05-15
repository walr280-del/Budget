/* app.js — Main Application Logic */

// ── DATA STORE (localStorage — swapped for fetch() in api.js when backend runs) ──
window.store = {
  _load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  _save(key, data) { localStorage.setItem(key, JSON.stringify(data)); },

  getCategories() {
    return this._load('categories', [
      {id:1,name:'Groceries',is_default:true},{id:2,name:'Rent',is_default:true},
      {id:3,name:'Transport',is_default:true},{id:4,name:'Dining Out',is_default:true},
      {id:5,name:'Entertainment',is_default:true},{id:6,name:'Education',is_default:true},
      {id:7,name:'Income',is_default:true},{id:8,name:'Other',is_default:true},
    ]);
  },
  addCategory(name) { const cats=this.getCategories(); const id=Date.now(); cats.push({id,name,is_default:false}); this._save('categories',cats); return {id,name}; },
  deleteCategory(id) { this._save('categories', this.getCategories().filter(c=>c.id!==id)); },

  getTransactions(filters={}) {
    let txs = this._load('transactions',[]);
    if (filters.month!==undefined) txs=txs.filter(t=>{ const d=new Date(t.date); return d.getMonth()===filters.month&&d.getFullYear()===filters.year; });
    if (filters.search) { const q=filters.search.toLowerCase(); txs=txs.filter(t=>t.description.toLowerCase().includes(q)||(t.notes||'').toLowerCase().includes(q)); }
    if (filters.category_id) txs=txs.filter(t=>t.category_id===Number(filters.category_id));
    if (filters.type) txs=txs.filter(t=>t.type===filters.type);
    return txs.sort((a,b)=>new Date(b.date)-new Date(a.date));
  },
  addTransaction(data) { const txs=this._load('transactions',[]); const tx={...data,id:Date.now(),created_at:new Date().toISOString()}; txs.push(tx); this._save('transactions',txs); return tx; },
  deleteTransaction(id) { this._save('transactions',this._load('transactions',[]).filter(t=>t.id!==id)); },

  getSummary(month,year) {
    const txs=this.getTransactions({month,year});
    const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expenses=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const cats=this.getCategories();
    const byCategory={};
    txs.filter(t=>t.type==='expense').forEach(t=>{ const cat=cats.find(c=>c.id===t.category_id); const name=cat?cat.name:'Other'; byCategory[name]=(byCategory[name]||0)+t.amount; });
    return {income,expenses,net:income-expenses,count:txs.length,byCategory};
  },

  getBudgets(month,year) { return this._load('budgets',[]).filter(b=>b.month===month&&b.year===year); },
  saveBudget(data) {
    const budgets=this._load('budgets',[]); const idx=budgets.findIndex(b=>b.category_id===data.category_id&&b.month===data.month&&b.year===data.year);
    if(idx>=0) budgets[idx]={...budgets[idx],...data}; else budgets.push({...data,id:Date.now()});
    this._save('budgets',budgets);
  },
  deleteBudget(id) { this._save('budgets',this._load('budgets',[]).filter(b=>b.id!==id)); },

  getSettings() { return this._load('settings',{currency:'USD',alerts:true,darkMode:false}); },
  saveSettings(data) { this._save('settings',data); },
};

// ── STATE ──
const state = {
  currentPage:   'dashboard',
  currentMonth:  new Date().getMonth(),
  currentYear:   new Date().getFullYear(),
  txPage:        1,
  txPerPage:     8,
  currentTxType: 'expense',
};

// ── NAVIGATION ──
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.page===pageId));
  state.currentPage = pageId;
  document.getElementById('navLinks').classList.remove('open');
  renderCurrentPage();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCurrentPage() {
  switch(state.currentPage) {
    case 'dashboard':  renderDashboard(); break;
    case 'history':    renderHistory();   break;
    case 'budget':     renderBudget();    break;
    case 'analytics':  renderAnalytics(); break;
    case 'settings':   renderSettings();  break;
  }
}

// ── DASHBOARD ──
function renderDashboard() {
  const summary = store.getSummary(state.currentMonth, state.currentYear);
  document.getElementById('totalIncome').textContent   = formatCurrency(summary.income);
  document.getElementById('totalExpenses').textContent = formatCurrency(summary.expenses);
  const netEl = document.getElementById('netBalance');
  netEl.textContent = formatCurrency(summary.net);
  netEl.className   = 'stat-value '+(summary.net>=0?'green':'red');
  document.getElementById('txCount').textContent = summary.count;
  document.getElementById('currentMonthLabel').textContent = formatMonthLabel(state.currentMonth,state.currentYear);
  renderPieChart(summary.byCategory);
  renderTrendChart(getLast6MonthsData());
  const txs   = store.getTransactions({month:state.currentMonth,year:state.currentYear});
  const recEl = document.getElementById('recentTxList');
  recEl.innerHTML = txs.length===0
    ? '<p class="empty-state">No transactions this month. <button class="link-btn" data-page="add-transaction">Add one!</button></p>'
    : txs.slice(0,5).map(tx=>txItemHTML(tx)).join('');
}

function getLast6MonthsData() {
  const result=[];
  for(let i=5;i>=0;i--) {
    let m=state.currentMonth-i, y=state.currentYear;
    if(m<0){m+=12;y--;}
    const s=store.getSummary(m,y);
    result.push({label:formatMonthShort(m,y),income:s.income,expenses:s.expenses,total:s.expenses});
  }
  return result;
}

// ── HISTORY ──
function renderHistory() {
  const search      = document.getElementById('searchInput').value.trim();
  const category_id = document.getElementById('filterCategory').value;
  const type        = document.getElementById('filterType').value;
  const allTxs      = store.getTransactions({search,category_id,type});
  const pages       = Math.max(1,Math.ceil(allTxs.length/state.txPerPage));
  if(state.txPage>pages) state.txPage=pages;
  const slice = allTxs.slice((state.txPage-1)*state.txPerPage, state.txPage*state.txPerPage);
  const listEl = document.getElementById('historyList');
  listEl.innerHTML = slice.length===0 ? '<p class="empty-state">No transactions found.</p>' : slice.map(tx=>txItemHTML(tx,true)).join('');
  const pagEl = document.getElementById('pagination');
  pagEl.innerHTML = pages<=1 ? '' : Array.from({length:pages},(_,i)=>`<button class="page-num ${i+1===state.txPage?'active':''}" data-p="${i+1}">${i+1}</button>`).join('');
}

// ── BUDGET ──
function renderBudget() {
  document.getElementById('budgetMonthLabel').textContent = formatMonthLabel(state.currentMonth,state.currentYear);
  const budgets = store.getBudgets(state.currentMonth,state.currentYear);
  const summary = store.getSummary(state.currentMonth,state.currentYear);
  const cats    = store.getCategories();
  const listEl  = document.getElementById('budgetList');
  if(budgets.length===0){listEl.innerHTML='<p class="empty-state">No budgets set. Add one above!</p>';return;}
  listEl.innerHTML = budgets.map(b=>{
    const cat=cats.find(c=>c.id===b.category_id); const name=cat?cat.name:'Unknown';
    const spent=summary.byCategory[name]||0; const pct=Math.min(100,(spent/b.monthly_limit)*100);
    const fillCls=pct>=100?'danger':pct>=80?'warn':'safe';
    const alert=pct>=100?`<div class="budget-alert">⚠ Budget reached!</div>`:pct>=80?`<div class="budget-alert" style="color:var(--amber)">Approaching limit</div>`:'';
    return `<div class="budget-item"><div class="budget-header"><span class="budget-name">${escapeHTML(name)}<button class="budget-delete" data-id="${b.id}" title="Remove">✕</button></span><span class="budget-pct">$${spent.toFixed(2)} / $${b.monthly_limit.toFixed(2)} · ${Math.round(pct)}%</span></div><div class="budget-track"><div class="budget-fill ${fillCls}" style="width:${pct}%"></div></div>${alert}</div>`;
  }).join('');
}

// ── ANALYTICS ──
function renderAnalytics() {
  renderAnalyticsBarChart(getLast6MonthsData());
  renderIncomeVsExpenseChart(getLast6MonthsData());
  const allTxs=store.getTransactions({}); const cats=store.getCategories();
  const totals={}; let grand=0;
  allTxs.filter(t=>t.type==='expense').forEach(t=>{ const cat=cats.find(c=>c.id===t.category_id); const name=cat?cat.name:'Other'; totals[name]=(totals[name]||0)+t.amount; grand+=t.amount; });
  const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const topEl=document.getElementById('topCategories');
  topEl.innerHTML = sorted.length===0 ? '<p class="empty-state">No expense data yet.</p>' :
    sorted.slice(0,8).map(([name,total],i)=>`<div class="top-cat-item"><span class="cat-rank">#${i+1}</span><span class="cat-name">${escapeHTML(name)}</span><span class="cat-pct">${grand?(total/grand*100).toFixed(1):0}%</span><span class="cat-amount">${formatCurrency(total)}</span></div>`).join('');
}

// ── SETTINGS ──
function renderSettings() {
  const s=store.getSettings();
  document.getElementById('settingCurrency').value = s.currency;
  document.getElementById('settingAlerts').checked = s.alerts;
  document.getElementById('settingDark').checked   = s.darkMode;
  renderCategoryChips();
}
function renderCategoryChips() {
  const cats=store.getCategories();
  document.getElementById('categoryList').innerHTML = cats.map(c=>`<span class="category-chip">${escapeHTML(c.name)}${c.is_default?'':`<button class="chip-delete" data-id="${c.id}">✕</button>`}</span>`).join('');
}

// ── FORM HELPERS ──
function populateCategoryDropdowns() {
  const cats=store.getCategories();
  const opts=cats.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  const txCat=document.getElementById('txCategory'); if(txCat) txCat.innerHTML='<option value="">-- Select category --</option>'+opts;
  const bCat=document.getElementById('budgetCategory'); if(bCat) bCat.innerHTML='<option value="">-- Select --</option>'+opts;
  const fCat=document.getElementById('filterCategory'); if(fCat) fCat.innerHTML='<option value="">All Categories</option>'+opts;
}

function validateTransactionForm() {
  let valid=true;
  const desc=document.getElementById('txDescription'), amt=document.getElementById('txAmount'), date=document.getElementById('txDate'), cat=document.getElementById('txCategory');
  ['descError','amountError','dateError','categoryError'].forEach(id=>document.getElementById(id).textContent='');
  [desc,amt,date,cat].forEach(el=>el.classList.remove('error'));
  if(!desc.value.trim()){document.getElementById('descError').textContent='Description is required.';desc.classList.add('error');valid=false;}
  if(!amt.value||parseFloat(amt.value)<=0){document.getElementById('amountError').textContent='Enter a valid amount greater than 0.';amt.classList.add('error');valid=false;}
  if(!date.value){document.getElementById('dateError').textContent='Date is required.';date.classList.add('error');valid=false;}
  if(!cat.value){document.getElementById('categoryError').textContent='Please select a category.';cat.classList.add('error');valid=false;}
  return valid;
}

function clearTransactionForm() {
  ['txDescription','txAmount','txTags','txNotes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('txDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('txCategory').value='';
  ['descError','amountError','dateError','categoryError'].forEach(id=>document.getElementById(id).textContent='');
  document.getElementById('formSuccess').classList.add('hidden');
  document.getElementById('formError').classList.add('hidden');
}

function validateBudgetForm() {
  let valid=true;
  const cat=document.getElementById('budgetCategory'), limit=document.getElementById('budgetLimit');
  document.getElementById('budgetCatError').textContent=''; document.getElementById('budgetLimitError').textContent='';
  cat.classList.remove('error'); limit.classList.remove('error');
  if(!cat.value){document.getElementById('budgetCatError').textContent='Select a category.';cat.classList.add('error');valid=false;}
  if(!limit.value||parseFloat(limit.value)<=0){document.getElementById('budgetLimitError').textContent='Enter a valid limit.';limit.classList.add('error');valid=false;}
  return valid;
}

// ── CSV EXPORT ──
function exportCSV(txs) {
  const cats=store.getCategories();
  const header='Date,Type,Description,Amount,Category,Tags,Notes\n';
  const rows=txs.map(t=>{const cat=cats.find(c=>c.id===t.category_id);return[t.date,t.type,`"${(t.description||'').replace(/"/g,'""')}"`,t.amount.toFixed(2),cat?cat.name:'Other',`"${(t.tags||'').replace(/"/g,'""')}"`,`"${(t.notes||'').replace(/"/g,'""')}"`].join(',');});
  const blob=new Blob([header+rows.join('\n')],{type:'text/csv'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`transactions_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

// ── UTILITIES ──
function formatCurrency(n) { return `$${Math.abs(n).toFixed(2)}`; }
function formatMonthLabel(m,y) { return new Date(y,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); }
function formatMonthShort(m,y) { return new Date(y,m,1).toLocaleDateString('en-US',{month:'short'}); }
function escapeHTML(str) { const el=document.createElement('div'); el.textContent=String(str); return el.innerHTML; }
function categoryIcon(name) {
  const map={'groceries':'🛒','rent':'🏠','transport':'🚌','dining out':'🍕','entertainment':'🎬','education':'📚','income':'💼','other':'📦'};
  return map[name.toLowerCase()]||'💰';
}
function txItemHTML(tx, showDelete=false) {
  const cats=store.getCategories(); const cat=cats.find(c=>c.id===tx.category_id); const catName=cat?cat.name:'Other';
  const sign=tx.type==='expense'?'-':'+'; const cls=tx.type==='expense'?'expense':'income';
  const date=new Date(tx.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return `<div class="tx-item"><div class="tx-icon">${categoryIcon(catName)}</div><div class="tx-info"><div class="tx-name">${escapeHTML(tx.description)}</div><div class="tx-meta">${escapeHTML(catName)} · ${date}</div></div><div class="tx-amount ${cls}">${sign}${formatCurrency(tx.amount)}</div>${showDelete?`<button class="tx-delete" data-id="${tx.id}" title="Delete">🗑</button>`:''}</div>`;
}
function showAlert(id,ms=3000) { const el=document.getElementById(id); el.classList.remove('hidden'); setTimeout(()=>el.classList.add('hidden'),ms); }

// ── EVENT LISTENERS ──
document.addEventListener('DOMContentLoaded',()=>{
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>navigateTo(btn.dataset.page)));
  document.addEventListener('click',e=>{ if(e.target.classList.contains('link-btn')&&e.target.dataset.page) navigateTo(e.target.dataset.page); });
  document.getElementById('navToggle').addEventListener('click',()=>document.getElementById('navLinks').classList.toggle('open'));

  // Month nav
  document.getElementById('prevMonth').addEventListener('click',()=>{ state.currentMonth--; if(state.currentMonth<0){state.currentMonth=11;state.currentYear--;} renderDashboard(); });
  document.getElementById('nextMonth').addEventListener('click',()=>{ state.currentMonth++; if(state.currentMonth>11){state.currentMonth=0;state.currentYear++;} renderDashboard(); });

  // Type toggle
  document.getElementById('expenseBtn').addEventListener('click',()=>{ state.currentTxType='expense'; document.getElementById('expenseBtn').classList.add('active'); document.getElementById('incomeBtn').classList.remove('active'); });
  document.getElementById('incomeBtn').addEventListener('click',()=>{ state.currentTxType='income'; document.getElementById('incomeBtn').classList.add('active'); document.getElementById('expenseBtn').classList.remove('active'); });

  // Add transaction
  document.getElementById('transactionForm').addEventListener('submit',e=>{
    e.preventDefault(); if(!validateTransactionForm()) return;
    store.addTransaction({type:state.currentTxType,description:document.getElementById('txDescription').value.trim(),amount:parseFloat(document.getElementById('txAmount').value),date:document.getElementById('txDate').value,category_id:parseInt(document.getElementById('txCategory').value),tags:document.getElementById('txTags').value.trim(),notes:document.getElementById('txNotes').value.trim()});
    clearTransactionForm(); showAlert('formSuccess');
  });
  document.getElementById('clearFormBtn').addEventListener('click',clearTransactionForm);

  // History filters
  ['searchInput','filterCategory','filterType'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ state.txPage=1; renderHistory(); }));
  document.getElementById('historyList').addEventListener('click',e=>{ const btn=e.target.closest('.tx-delete'); if(btn&&confirm('Delete this transaction?')){ store.deleteTransaction(Number(btn.dataset.id)); renderHistory(); } });
  document.getElementById('pagination').addEventListener('click',e=>{ if(e.target.classList.contains('page-num')){ state.txPage=parseInt(e.target.dataset.p); renderHistory(); } });

  // Budget
  document.getElementById('budgetForm').addEventListener('submit',e=>{ e.preventDefault(); if(!validateBudgetForm()) return; store.saveBudget({category_id:parseInt(document.getElementById('budgetCategory').value),monthly_limit:parseFloat(document.getElementById('budgetLimit').value),month:state.currentMonth,year:state.currentYear}); document.getElementById('budgetCategory').value=''; document.getElementById('budgetLimit').value=''; showAlert('budgetSuccess'); renderBudget(); });
  document.getElementById('budgetList').addEventListener('click',e=>{ const btn=e.target.closest('.budget-delete'); if(btn&&confirm('Remove this budget?')){ store.deleteBudget(Number(btn.dataset.id)); renderBudget(); } });

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click',()=>{ const s={currency:document.getElementById('settingCurrency').value,alerts:document.getElementById('settingAlerts').checked,darkMode:document.getElementById('settingDark').checked}; store.saveSettings(s); document.body.classList.toggle('dark-mode',s.darkMode); showAlert('settingsSuccess'); });
  document.getElementById('addCategoryBtn').addEventListener('click',()=>{ const input=document.getElementById('newCategoryName'); const errEl=document.getElementById('categoryAddError'); const name=input.value.trim(); if(!name){errEl.textContent='Enter a category name.';return;} errEl.textContent=''; store.addCategory(name); input.value=''; renderCategoryChips(); populateCategoryDropdowns(); });
  document.getElementById('categoryList').addEventListener('click',e=>{ const btn=e.target.closest('.chip-delete'); if(btn){ store.deleteCategory(Number(btn.dataset.id)); renderCategoryChips(); populateCategoryDropdowns(); } });
  document.getElementById('exportCsvBtn').addEventListener('click',()=>{ const txs=store.getTransactions({}); if(!txs.length){alert('No transactions to export.');return;} exportCSV(txs); });
  document.getElementById('exportAllBtn').addEventListener('click',()=>exportCSV(store.getTransactions({})));
  document.getElementById('resetDataBtn').addEventListener('click',()=>{ if(confirm('Delete ALL transactions and budgets?')){ localStorage.removeItem('transactions'); localStorage.removeItem('budgets'); renderCurrentPage(); } });
  document.getElementById('recentTxList').addEventListener('click',e=>{ const btn=e.target.closest('.tx-delete'); if(btn&&confirm('Delete this transaction?')){ store.deleteTransaction(Number(btn.dataset.id)); renderDashboard(); } });

  // Init
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
  if(store.getSettings().darkMode) document.body.classList.add('dark-mode');
  populateCategoryDropdowns();
  renderDashboard();
});
