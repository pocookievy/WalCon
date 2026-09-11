import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, writeBatch, runTransaction
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DRIVE_FOLDER_ID = '1tpva5tCWQdmyy2HZ5JEiarKmhzKtGjQV';
const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_CLIENT_KEY = 'walcon.googleDriveClientId';
const DRIVE_TOKEN_KEY = 'walcon.googleDriveToken';
const DRIVE_TOKEN_EXPIRY_KEY = 'walcon.googleDriveTokenExpiry';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = (s='') => String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const attr = (s='') => esc(s).replace(/`/g,'&#96;');
const todayISO = () => new Date().toISOString().slice(0,10);
const monthKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const monthLabel = m => { const [y,mo]=m.split('-').map(Number); return new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1)); };
const idr = n => `Rp ${Number(n||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const parseIDR = value => {
  const s=String(value||'').trim();
  if(!s)return 0;
  if(s.includes(','))return Number(s.replace(/\./g,'').replace(',','.'))||0;
  if(/^\d{1,3}(\.\d{3})+(\.\d{1,2})?$/.test(s))return Number(s.replace(/\./g,''))||0;
  return Number(s.replace(/[^0-9.-]/g,''))||0;
};
const formatIDRInput = input => { const n=parseIDR(input.value); input.value=n?Number(n).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''; };
const timeOf = ts => ts?.toMillis ? ts.toMillis() : 0;

const DEFAULT_CATEGORIES = [
  {id:'income-primary-salary',group:'income',name:'Primary Salary',icon:'💵',lineItems:['Main Paycheck']},
  {id:'income-side-hustles',group:'income',name:'Side Hustles',icon:'💵',lineItems:['Freelancing','Gig Work','Craft Sales']},
  {id:'income-investments',group:'income',name:'Investments',icon:'💵',lineItems:['Dividends','Savings Interest','Rental Income']},
  {id:'income-other',group:'income',name:'Other Income',icon:'💵',lineItems:['Cash Gifts','Tax Refunds','Bonuses']},
  {id:'need-housing',group:'need',name:'Housing',icon:'🏠',lineItems:['Rent / Mortgage','HOA Fees','Property Taxes']},
  {id:'need-utilities',group:'need',name:'Utilities',icon:'⚡',lineItems:['Electricity','Water','Gas','Trash','Internet','Phone']},
  {id:'need-groceries',group:'need',name:'Groceries',icon:'🛒',lineItems:['Food','Drinks','Household Essentials']},
  {id:'need-transportation',group:'need',name:'Transportation',icon:'🚗',lineItems:['Gas','Public Transit','Car Insurance','Parking','Car Maintenance']},
  {id:'need-healthcare',group:'need',name:'Healthcare',icon:'🩺',lineItems:['Health Insurance','Doctor Copays','Prescription Medications']},
  {id:'need-insurance',group:'need',name:'Insurance',icon:'🛡️',lineItems:["Renter's Insurance",'Home Insurance','Life Insurance']},
  {id:'want-dining-out',group:'want',name:'Dining Out',icon:'🍽️',lineItems:['Restaurants','Fast Food','Coffee Shops','Food Delivery']},
  {id:'want-entertainment',group:'want',name:'Entertainment',icon:'🎭',lineItems:['Movie Tickets','Concerts','Hobbies','Social Events']},
  {id:'want-subscriptions',group:'want',name:'Subscriptions',icon:'📺',lineItems:['Streaming Services','Software','Gym Membership']},
  {id:'want-shopping',group:'want',name:'Shopping',icon:'🛍️',lineItems:['Clothing','Home Decor','Electronics','Personal Grooming']},
  {id:'want-travel',group:'want',name:'Travel',icon:'✈️',lineItems:['Flights','Hotels','Holiday Trips']},
  {id:'debt-credit-cards',group:'debt',name:'Credit Cards',icon:'💳',lineItems:['Payment']},
  {id:'debt-student-loans',group:'debt',name:'Student Loans',icon:'🎓',lineItems:['Payment']},
  {id:'debt-car-loans',group:'debt',name:'Car Loans',icon:'🚘',lineItems:['Payment']},
  {id:'debt-personal-loans',group:'debt',name:'Personal Loans',icon:'📉',lineItems:['Payment']}
];
const DEFAULT_SOURCES = [
  {id:'cash',type:'Cash',name:'Cash',currentBalance:0},
  {id:'main-bank',type:'Main Bank Account',name:'Main Bank Account',currentBalance:0},
  {id:'other-bank',type:'Other Bank Account',name:'Other Bank Account',currentBalance:0},
  {id:'e-wallet',type:'E-wallet',name:'E-wallet',currentBalance:0},
  {id:'other-source',type:'Other',name:'Other',currentBalance:0}
];
const SOURCE_TYPES=['Cash','Main Bank Account','Other Bank Account','E-wallet','Other'];
const GROUP_LABELS={income:'Income',need:'Needs',want:'Wants',debt:'Debt'};
const GROUP_ORDER=['income','need','want','debt'];
const COLORS=['#9D8BFF','#72E5AC','#FFD66B','#FF6D8E','#7CCBFF','#C58BFF','#8FE0D0','#FFAE73','#89A6FF','#E88BB8','#B8DE73','#D9A2FF','#63D7FF','#F7CB78','#A2F09B','#FF8B75','#B59BFF','#6FC2B1','#E5A7CE','#AFC2FF'];

const state={
  user:null,month:monthKey(),categories:[],sources:[],transactions:[],budgets:[],debts:[],bills:[],billStatus:[],
  settings:{warningThreshold:85},unsubs:[],currentView:'home',categoryFilter:'all',transactionType:'expense'
};
const userPath=(...parts)=>['users',state.user.uid,...parts];

function toast(msg,persist=false){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');if(!persist)setTimeout(()=>el.classList.remove('show'),2400);}
function showError(error,context='Error'){console.error(context,error);const msg=`${context}: ${error?.message||error}`;const b=$('#errorBanner');if(b){b.textContent=msg;b.classList.remove('hidden');}toast(msg,true);}
function clearError(){$('#errorBanner')?.classList.add('hidden');}
function closeModal(){$('#modal')?.classList.add('hidden');if($('#modalBody'))$('#modalBody').innerHTML='';}
function empty(text){return `<div class="item"><div class="grow"><div class="meta">${esc(text)}</div></div></div>`;}
function category(id){return state.categories.find(x=>x.id===id);}
function source(id){return state.sources.find(x=>x.id===id);}
function budget(id){return state.budgets.find(x=>x.id===id);}
function monthExpenses(){return state.transactions.filter(t=>t.type==='expense'&&t.month===state.month);}
function monthIncome(){return state.transactions.filter(t=>t.type==='income'&&t.month===state.month);}
function linkedSpent(budgetId){return monthExpenses().filter(t=>t.budgetId===budgetId).reduce((a,t)=>a+Number(t.amount||0),0);}
function totalBalance(){return state.sources.reduce((a,s)=>a+Number(s.currentBalance||0),0);}
function budgetTotals(){const total=state.budgets.reduce((a,b)=>a+Number(b.amount||0),0);const spent=state.budgets.reduce((a,b)=>a+linkedSpent(b.id),0);return{total,spent,remaining:total-spent};}
function budgetStatus(entry){const spent=linkedSpent(entry.id),amount=Number(entry.amount||0),rem=amount-spent,pct=amount?spent/amount*100:0;return{spent,rem,pct,cls:rem<0?'over':pct>=Number(state.settings.warningThreshold||85)?'warn':'ok'};}

function showView(name){
  state.currentView=name;
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $$('.nav[data-view-go]').forEach(n=>n.classList.toggle('active',n.dataset.viewGo===name));
  $('#bottomNav')?.classList.toggle('hidden',name==='auth'||name==='loading');
  if($('#app'))$('#app').scrollTop=0;
  if(name==='transaction')renderTransactionForm();
  if(name==='history')renderHistory();
  if(name==='settings')renderSettings();
}

async function initializeDefaultsOnce(){
  const systemRef=doc(db,...userPath('settings','system'));
  const systemSnap=await getDoc(systemRef);
  if(systemSnap.exists()&&systemSnap.data().defaultsInitialized===true)return;

  const [catSnap,sourceSnap]=await Promise.all([
    getDocs(collection(db,...userPath('categories'))),
    getDocs(collection(db,...userPath('balanceSources')))
  ]);
  const batch=writeBatch(db);
  if(catSnap.empty){
    for(const c of DEFAULT_CATEGORIES)batch.set(doc(db,...userPath('categories',c.id)),{...c,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  if(sourceSnap.empty){
    for(const s of DEFAULT_SOURCES)batch.set(doc(db,...userPath('balanceSources',s.id)),{...s,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  batch.set(systemRef,{defaultsInitialized:true,initializedAt:serverTimestamp()},{merge:true});
  await batch.commit();

  const prefRef=doc(db,...userPath('settings','preferences'));
  const prefSnap=await getDoc(prefRef);
  if(!prefSnap.exists())await setDoc(prefRef,{warningThreshold:85,currency:'IDR',updatedAt:serverTimestamp()});
}

function stopListeners(){state.unsubs.forEach(u=>{try{u()}catch{}});state.unsubs=[];}
function listen(target,handler,label){state.unsubs.push(onSnapshot(target,s=>{handler(s.docs.map(d=>({id:d.id,...d.data()})));clearError();},e=>showError(e,`Load ${label} failed`)));}
function subscribe(){
  stopListeners();
  listen(collection(db,...userPath('categories')),v=>{state.categories=v.sort((a,b)=>GROUP_ORDER.indexOf(a.group)-GROUP_ORDER.indexOf(b.group)||String(a.name).localeCompare(String(b.name)));renderAll();},'categories');
  listen(collection(db,...userPath('balanceSources')),v=>{state.sources=v.sort((a,b)=>String(a.name).localeCompare(String(b.name)));renderAll();},'balances');
  listen(query(collection(db,...userPath('transactions')),where('month','==',state.month)),v=>{state.transactions=v;renderAll();},'transactions');
  listen(query(collection(db,...userPath('budgets')),where('month','==',state.month)),v=>{state.budgets=v;renderAll();},'budgets');
  listen(collection(db,...userPath('debts')),v=>{state.debts=v.filter(x=>x.active!==false);renderDebts();},'debts');
  listen(collection(db,...userPath('bills')),v=>{state.bills=v.filter(x=>x.active!==false).sort((a,b)=>(a.dueDay||99)-(b.dueDay||99));renderBills();},'bills');
  listen(query(collection(db,...userPath('billStatus')),where('month','==',state.month)),v=>{state.billStatus=v;renderBills();},'bill status');
  state.unsubs.push(onSnapshot(doc(db,...userPath('settings','preferences')),s=>{state.settings={warningThreshold:85,...(s.exists()?s.data():{})};renderAll();},e=>showError(e,'Load settings failed'));
}
function changeMonth(m){state.month=m||monthKey();if($('#budgetMonth'))$('#budgetMonth').value=state.month;if($('#billMonth'))$('#billMonth').value=state.month;if($('#historyMonth'))$('#historyMonth').value=state.month;subscribe();}
function renderAll(){renderHome();renderBalances();renderCategories();renderBudgets();renderDebts();renderBills();if(state.currentView==='transaction')renderTransactionForm();if(state.currentView==='history')renderHistory();if(state.currentView==='settings')renderSettings();}

function renderHome(){
  if(!state.user)return;
  $('#homeMonthLabel').textContent=monthLabel(state.month);
  $('#homeBalance').textContent=idr(totalBalance());
  $('#homeSourceCount').textContent=state.sources.length;
  const bt=budgetTotals();$('#homeBudgetLeft').textContent=idr(bt.remaining);
  const spent=monthExpenses().reduce((a,t)=>a+Number(t.amount||0),0);$('#homeSpent').textContent=idr(spent);
  const income=monthIncome().reduce((a,t)=>a+Number(t.amount||0),0);if($('#homeIncome'))$('#homeIncome').textContent=idr(income);
  $('#homeBalances').innerHTML=state.sources.length?state.sources.map(s=>`<button class="balance-chip" data-edit-source="${s.id}"><span>${esc(s.type||'Source')}</span><strong>${esc(s.name)}</strong><strong>${idr(s.currentBalance)}</strong></button>`).join(''):'';

  const grouped={};
  for(const t of monthExpenses()){const key=t.categoryId||t.categoryName||'other';if(!grouped[key])grouped[key]={name:t.categoryName||category(t.categoryId)?.name||'Other',value:0};grouped[key].value+=Number(t.amount||0);}
  const entries=Object.values(grouped).sort((a,b)=>b.value-a.value),total=entries.reduce((a,x)=>a+x.value,0);
  $('#donutAmount').textContent=idr(total).replace(',00','');$('#graphTotal').textContent=entries.length?`${entries.length} categories`:'No expenses';
  if(!entries.length){$('#expenseDonut').style.background='conic-gradient(rgba(255,255,255,.10) 0 100%)';$('#expenseLegend').innerHTML='<div class="meta">No expense data this month.</div>';}
  else{let cursor=0;const segments=[];entries.forEach((e,i)=>{const pct=e.value/total*100;segments.push(`${COLORS[i%COLORS.length]} ${cursor}% ${cursor+pct}%`);cursor+=pct;});$('#expenseDonut').style.background=`conic-gradient(${segments.join(',')})`;$('#expenseLegend').innerHTML=entries.map((e,i)=>`<div class="legend-item"><i class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></i><span>${esc(e.name)}</span><strong>${Math.round(e.value/total*100)}%</strong></div>`).join('');}

  const recent=[...state.transactions].sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt)).slice(0,6);
  $('#recentExpenses').innerHTML=recent.length?recent.map(t=>`<div class="item"><div class="item-icon">${category(t.categoryId)?.icon||(t.type==='income'?'＋':'−')}</div><div class="grow"><div class="name">${esc(t.name||t.lineItem||'Transaction')}</div><div class="meta">${esc(t.categoryName||'')} • ${esc(t.lineItem||'')} • ${esc(t.sourceName||'')}</div></div><div class="money ${t.type==='income'?'green':'red'}">${t.type==='income'?'+':'−'} ${idr(t.amount)}</div></div>`).join(''):empty('No transactions this month.');
}

function renderBalances(){
  $('#balanceTotal').textContent=idr(totalBalance());
  $('#balanceList').innerHTML=state.sources.length?state.sources.map(s=>`<div class="card"><div class="row-head"><div><div class="name">${esc(s.name)}</div><span class="source-badge">${esc(s.type||'Other')}</span><div class="hero-number small">${idr(s.currentBalance)}</div></div><div class="row-actions"><button class="btn sm" data-edit-source="${s.id}">Edit</button><button class="btn sm danger" data-delete-source="${s.id}">Remove</button></div></div></div>`).join(''):empty('No balance sources.');
}

function renderCategories(){
  const filtered=state.categoryFilter==='all'?state.categories:state.categories.filter(c=>c.group===state.categoryFilter);
  let html='';
  for(const group of GROUP_ORDER){const cats=filtered.filter(c=>c.group===group);if(!cats.length)continue;html+=`<div class="group-label">${GROUP_LABELS[group]}</div>`;html+=cats.map(c=>`<div class="card"><div class="row-head"><div><div class="name">${c.icon||'•'} ${esc(c.name)}</div><span class="kind-badge">${GROUP_LABELS[c.group]||c.group}</span></div><div class="row-actions"><button class="btn sm" data-add-line="${c.id}">+ Line</button><button class="btn sm" data-edit-category="${c.id}">Edit</button><button class="btn sm danger" data-delete-category="${c.id}">Remove</button></div></div><div class="line-items">${(c.lineItems||[]).length?(c.lineItems||[]).map(line=>`<span class="line-pill">${esc(line)} <button data-remove-line="${c.id}" data-line="${attr(line)}">×</button></span>`).join(''):'<span class="meta">No line items</span>'}</div></div>`).join('');}
  $('#categoryList').innerHTML=html||empty('No categories in this filter.');
}

function setTransactionType(type){state.transactionType=type==='income'?'income':'expense';$$('[data-transaction-type]').forEach(b=>b.classList.toggle('active',b.dataset.transactionType===state.transactionType));$('#transactionTitle').textContent=state.transactionType==='income'?'Add income':'Add expense';$('#sourceLabelText').textContent=state.transactionType==='income'?'Destination balance source':'Payment method';$('#budgetModeBlock').classList.toggle('hidden',state.transactionType==='income');$('#receiptBlock').classList.toggle('hidden',state.transactionType==='income');$('#transactionSubmit').textContent=state.transactionType==='income'?'Save Income':'Save Expense';renderTransactionForm();}
function renderTransactionForm(){
  if(!state.user)return;
  if(!$('#transactionDate').value)$('#transactionDate').value=todayISO();
  const type=state.transactionType;
  const currentCat=$('#transactionCategory').value;
  const cats=state.categories.filter(c=>type==='income'?c.group==='income':c.group!=='income');
  $('#transactionCategory').innerHTML='<option value="">Select Category</option>'+cats.map(c=>`<option value="${c.id}" ${c.id===currentCat?'selected':''}>${esc(GROUP_LABELS[c.group]+' — '+c.name)}</option>`).join('');
  const currentSource=$('#transactionSource').value;
  $('#transactionSource').innerHTML='<option value="">Select balance source</option>'+state.sources.map(s=>`<option value="${s.id}" ${s.id===currentSource?'selected':''}>${esc(s.name)} — ${idr(s.currentBalance)}</option>`).join('');
  refreshTransactionLines();
  renderDriveStatus();
}
function refreshTransactionLines(){const c=category($('#transactionCategory').value),selected=$('#transactionLine').value;$('#transactionLine').innerHTML='<option value="">Select Line Item</option>'+((c?.lineItems||[]).map(line=>`<option value="${attr(line)}" ${line===selected?'selected':''}>${esc(line)}</option>`).join(''));updateBudgetMatchHint();}
async function findBudgetFor(month,categoryId,lineItem){if(month===state.month)return state.budgets.find(x=>x.month===month&&x.categoryId===categoryId&&x.lineItem===lineItem)||null;const snap=await getDocs(query(collection(db,...userPath('budgets')),where('month','==',month)));return snap.docs.map(d=>({id:d.id,...d.data()})).find(x=>x.categoryId===categoryId&&x.lineItem===lineItem)||null;}
function updateBudgetMatchHint(){
  if(state.transactionType==='income')return;
  const linked=$('#transactionLinked').checked,catId=$('#transactionCategory').value,line=$('#transactionLine').value,date=$('#transactionDate').value||todayISO(),m=date.slice(0,7);
  if(!linked){$('#budgetMatchHint').textContent='Out-of-budget expense: the selected balance source will be reduced, but no budget item will be affected.';return;}
  if(m!==state.month){$('#budgetMatchHint').textContent=`Budget link will be checked against ${monthLabel(m)} when saved.`;return;}
  const b=state.budgets.find(x=>x.month===m&&x.categoryId===catId&&x.lineItem===line);
  if(!b){$('#budgetMatchHint').textContent='No matching budget item for this month. Add one in Budget or turn budget linking off.';return;}
  const st=budgetStatus(b);$('#budgetMatchHint').textContent=`Linked to ${b.categoryName} → ${b.lineItem}. Remaining before this expense: ${idr(st.rem)}.`;
}

function renderBudgets(){
  $('#budgetMonth').value=state.month;const bt=budgetTotals();$('#budgetTotal').textContent=idr(bt.total);$('#budgetSpent').textContent=idr(bt.spent);$('#budgetRemaining').textContent=idr(bt.remaining);
  $('#budgetList').innerHTML=state.budgets.length?state.budgets.sort((a,b)=>String(a.categoryName).localeCompare(String(b.categoryName))).map(b=>{const st=budgetStatus(b);return `<div class="card"><div class="row-head"><div><div class="name">${esc(b.categoryName)} → ${esc(b.lineItem)}</div><div class="meta">Fixed monthly budget ${idr(b.amount)} • Linked spending ${idr(st.spent)}</div><div class="budget-status ${st.cls}">${st.rem<0?`Over ${idr(Math.abs(st.rem))}`:`Remaining ${idr(st.rem)}`}</div></div><div class="row-actions"><button class="btn sm" data-edit-budget="${b.id}">Edit</button><button class="btn sm danger" data-delete-budget="${b.id}">Remove</button></div></div><div class="progress ${st.cls}"><i style="width:${Math.min(100,st.pct)}%"></i></div></div>`}).join(''):empty('No budget items for this month. Add a fixed budget per line item.');
}

function renderDebts(){
  if(!$('#debtTotal'))return;$('#debtTotal').textContent=idr(state.debts.reduce((a,d)=>a+Number(d.currentBalance||0),0));
  $('#debtList').innerHTML=state.debts.length?state.debts.map(d=>{const original=Number(d.originalBalance||0),current=Number(d.currentBalance||0),paid=Math.max(0,original-current),pct=original?paid/original*100:0;return `<div class="card"><div class="row-head"><div><div class="name">${esc(d.name)}</div><div class="meta">${esc(d.categoryName||'Debt')} • Original ${idr(original)}</div></div><div class="row-actions"><button class="btn sm" data-pay-debt="${d.id}">Pay</button><button class="btn sm" data-edit-debt="${d.id}">Edit</button><button class="btn sm danger" data-delete-debt="${d.id}">Remove</button></div></div><div class="progress"><i style="width:${Math.min(100,pct)}%"></i></div><div class="summary3" style="margin-top:10px"><div><span>Paid</span><strong>${idr(paid)}</strong></div><div><span>Remaining</span><strong>${idr(current)}</strong></div><div><span>Progress</span><strong>${Math.round(pct)}%</strong></div></div></div>`}).join(''):empty('No debt items yet.');
}
function renderBills(){if(!$('#billMonth'))return;$('#billMonth').value=state.month;$('#billList').innerHTML=state.bills.length?state.bills.map(b=>{const s=state.billStatus.find(x=>x.billId===b.id);return `<div class="item"><div class="item-icon">✓</div><div class="grow"><div class="name">${esc(b.name)}</div><div class="meta">${b.dueDay?`Due day ${b.dueDay}`:'No due day'} • ${idr(b.amount||0)}</div></div><button class="btn sm ${s?.paid?'primary':''}" data-toggle-bill="${b.id}">${s?.paid?'Paid':'Unpaid'}</button><button class="btn sm danger" data-delete-bill="${b.id}">×</button></div>`}).join(''):empty('No recurring bills yet.');}
function renderHistory(){
  $('#historyMonth').value=state.month;const items=[...state.transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date))||timeOf(b.createdAt)-timeOf(a.createdAt));
  $('#historyList').innerHTML=items.length?items.map(t=>`<div class="item"><div class="item-icon">${category(t.categoryId)?.icon||(t.type==='income'?'＋':'−')}</div><div class="grow"><div class="name">${esc(t.name||t.lineItem||'Transaction')}</div><div class="meta">${esc(t.date||'')} • ${esc(t.categoryName||'')} → ${esc(t.lineItem||'')} • ${esc(t.sourceName||'')}${t.notes?` • ${esc(t.notes)}`:''}</div>${t.receiptUrl?`<a href="${attr(t.receiptUrl)}" target="_blank" rel="noopener" class="link">View receipt</a>`:''}</div><div><div class="money ${t.type==='income'?'green':'red'}">${t.type==='income'?'+':'−'} ${idr(t.amount)}</div><button class="btn sm danger" data-delete-transaction="${t.id}">Remove</button></div></div>`).join(''):empty('No transactions this month.');
}
function renderSettings(){if($('#warningThreshold'))$('#warningThreshold').value=Number(state.settings.warningThreshold||85);if($('#settingsEmail'))$('#settingsEmail').textContent=state.user?.email||'';if($('#driveClientId'))$('#driveClientId').value=localStorage.getItem(DRIVE_CLIENT_KEY)||'';renderDriveStatus();}

function openModal(type,id=null){
  const body=$('#modalBody'),title=$('#modalTitle');
  if(type==='balance'){const s=id?source(id):null;title.textContent=s?'Edit balance source':'Add balance source';body.innerHTML=`<label>Source type<select id="mSourceType">${SOURCE_TYPES.map(x=>`<option ${x===(s?.type||'Cash')?'selected':''}>${x}</option>`).join('')}</select></label><label style="margin-top:12px">Name<input id="mSourceName" value="${attr(s?.name||'')}" placeholder="e.g. BCA Main"></label><label style="margin-top:12px">Current balance (IDR)<input id="mSourceBalance" class="idr-input" inputmode="decimal" value="${s?Number(s.currentBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}" placeholder="0,00"></label><button class="btn primary full" data-save-source="${id||''}">Save</button>`;}
  else if(type==='category'){const c=id?category(id):null;title.textContent=c?'Edit category':'Add category';body.innerHTML=`<label>Group<select id="mCatGroup">${GROUP_ORDER.map(g=>`<option value="${g}" ${g===(c?.group||'need')?'selected':''}>${GROUP_LABELS[g]}</option>`).join('')}</select></label><label style="margin-top:12px">Category name<input id="mCatName" value="${attr(c?.name||'')}" placeholder="Category name"></label><label style="margin-top:12px">Icon / emoji<input id="mCatIcon" value="${attr(c?.icon||'')}" maxlength="4" placeholder="•"></label><label style="margin-top:12px">Line items — one per line<textarea id="mCatLines" placeholder="Item 1\nItem 2">${esc((c?.lineItems||[]).join('\n'))}</textarea></label><button class="btn primary full" data-save-category="${id||''}">Save</button>`;}
  else if(type==='line'){const c=category(id);title.textContent=`Add line item — ${c?.name||''}`;body.innerHTML=`<label>Line item name<input id="mLineName" placeholder="New line item"></label><button class="btn primary full" data-save-line="${id}">Add Line Item</button>`;}
  else if(type==='budget'){const b=id?budget(id):null;title.textContent=b?'Edit budget item':'Add budget item';const cats=state.categories.filter(c=>c.group!=='income');body.innerHTML=`<label>Category<select id="mBudgetCat"><option value="">Select</option>${cats.map(c=>`<option value="${c.id}" ${c.id===b?.categoryId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label style="margin-top:12px">Line item<select id="mBudgetLine"><option value="${attr(b?.lineItem||'')}">${esc(b?.lineItem||'Select category first')}</option></select></label><label style="margin-top:12px">Fixed monthly budget (IDR)<input id="mBudgetAmount" class="idr-input" inputmode="decimal" value="${b?Number(b.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}" placeholder="0,00"></label><button class="btn primary full" data-save-budget="${id||''}">Save Budget</button>`;setTimeout(()=>refreshModalBudgetLines(b?.lineItem||''),0);}
  else if(type==='debt'){const d=id?state.debts.find(x=>x.id===id):null,debtCats=state.categories.filter(c=>c.group==='debt');title.textContent=d?'Edit debt':'Add debt';body.innerHTML=`<label>Debt category<select id="mDebtCat"><option value="">Select</option>${debtCats.map(c=>`<option value="${c.id}" ${c.id===d?.categoryId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label style="margin-top:12px">Debt name<input id="mDebtName" value="${attr(d?.name||'')}" placeholder="e.g. BCA Visa"></label><label style="margin-top:12px">Original amount<input id="mDebtOriginal" class="idr-input" inputmode="decimal" value="${d?Number(d.originalBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}"></label><label style="margin-top:12px">Current remaining<input id="mDebtCurrent" class="idr-input" inputmode="decimal" value="${d?Number(d.currentBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}"></label><button class="btn primary full" data-save-debt="${id||''}">Save Debt</button>`;}
  else if(type==='payDebt'){const d=state.debts.find(x=>x.id===id);title.textContent=`Pay — ${d?.name||'Debt'}`;body.innerHTML=`<div class="meta">Remaining ${idr(d?.currentBalance||0)}</div><label style="margin-top:12px">Payment source<select id="mDebtSource"><option value="">Select source</option>${state.sources.map(s=>`<option value="${s.id}">${esc(s.name)} — ${idr(s.currentBalance)}</option>`).join('')}</select></label><label style="margin-top:12px">Payment amount<input id="mDebtPayAmount" class="idr-input" inputmode="decimal" placeholder="0,00"></label><label class="switchline" style="margin-top:12px"><input id="mDebtLinkBudget" type="checkbox"><span>Link payment to matching monthly budget if available</span></label><button class="btn primary full" data-apply-debt="${id}">Apply Payment</button>`;}
  else if(type==='bill'){title.textContent='Add recurring bill';body.innerHTML=`<label>Bill name<input id="mBillName" placeholder="Electricity"></label><div class="grid2" style="margin-top:12px"><label>Amount<input id="mBillAmount" class="idr-input" inputmode="decimal" placeholder="0,00"></label><label>Due day<input id="mBillDue" type="number" min="1" max="31"></label></div><button class="btn primary full" data-save-bill>Save Bill</button>`;}
  $('#modal').classList.remove('hidden');
}
function refreshModalBudgetLines(selected=''){const c=category($('#mBudgetCat')?.value);if(!$('#mBudgetLine'))return;$('#mBudgetLine').innerHTML='<option value="">Select line item</option>'+((c?.lineItems||[]).map(l=>`<option value="${attr(l)}" ${l===selected?'selected':''}>${esc(l)}</option>`).join(''));}

async function saveSource(id){const name=$('#mSourceName').value.trim(),type=$('#mSourceType').value,currentBalance=parseIDR($('#mSourceBalance').value);if(!name)return toast('Source name required');try{const data={name,type,currentBalance,updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,...userPath('balanceSources',id)),data);else await addDoc(collection(db,...userPath('balanceSources')),{...data,createdAt:serverTimestamp()});closeModal();toast('Balance source saved');}catch(e){showError(e,'Save balance source failed');}}
async function saveCategory(id){const name=$('#mCatName').value.trim(),group=$('#mCatGroup').value,icon=$('#mCatIcon').value.trim(),lineItems=[...new Set($('#mCatLines').value.split('\n').map(x=>x.trim()).filter(Boolean))];if(!name)return toast('Category name required');try{const data={name,group,icon,lineItems,updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,...userPath('categories',id)),data);else await addDoc(collection(db,...userPath('categories')),{...data,isDefault:false,createdAt:serverTimestamp()});closeModal();toast('Category saved');}catch(e){showError(e,'Save category failed');}}
async function addLine(id){const name=$('#mLineName').value.trim(),c=category(id);if(!name)return toast('Line item required');if(!c)return;try{await updateDoc(doc(db,...userPath('categories',id)),{lineItems:[...new Set([...(c.lineItems||[]),name])],updatedAt:serverTimestamp()});closeModal();toast('Line item added');}catch(e){showError(e,'Add line item failed');}}
async function removeLine(id,line){const c=category(id);if(!c||!confirm(`Remove line item “${line}”? Existing history and budgets are kept.`))return;try{await updateDoc(doc(db,...userPath('categories',id)),{lineItems:(c.lineItems||[]).filter(x=>x!==line),updatedAt:serverTimestamp()});toast('Line item removed');}catch(e){showError(e,'Remove line item failed');}}
async function saveBudget(id){const categoryId=$('#mBudgetCat').value,lineItem=$('#mBudgetLine').value,amount=parseIDR($('#mBudgetAmount').value),c=category(categoryId);if(!c||!lineItem||amount<=0)return toast('Category, line item and amount are required');try{if(!id&&state.budgets.find(b=>b.categoryId===categoryId&&b.lineItem===lineItem))return toast('This line item already has a budget this month');const data={month:state.month,categoryId,categoryName:c.name,lineItem,amount,updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,...userPath('budgets',id)),data);else await addDoc(collection(db,...userPath('budgets')),{...data,createdAt:serverTimestamp()});closeModal();toast('Budget saved');}catch(e){showError(e,'Save budget failed');}}
async function saveDebt(id){const categoryId=$('#mDebtCat').value,c=category(categoryId),name=$('#mDebtName').value.trim(),original=parseIDR($('#mDebtOriginal').value),current=parseIDR($('#mDebtCurrent').value||$('#mDebtOriginal').value);if(!c||!name||original<=0)return toast('Debt category, name and original amount required');try{const data={categoryId,categoryName:c.name,name,originalBalance:original,currentBalance:current,active:true,updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,...userPath('debts',id)),data);else await addDoc(collection(db,...userPath('debts')),{...data,createdAt:serverTimestamp()});closeModal();toast('Debt saved');}catch(e){showError(e,'Save debt failed');}}
async function saveBill(){const name=$('#mBillName').value.trim(),amount=parseIDR($('#mBillAmount').value),dueDay=Number($('#mBillDue').value||0)||null;if(!name)return toast('Bill name required');try{await addDoc(collection(db,...userPath('bills')),{name,amount,dueDay,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});closeModal();toast('Bill saved');}catch(e){showError(e,'Save bill failed');}}

let gisPromise=null;
function loadGoogleIdentity(){if(window.google?.accounts?.oauth2)return Promise.resolve();if(gisPromise)return gisPromise;gisPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load Google Identity Services'));document.head.appendChild(s);});return gisPromise;}
function driveClientId(){return localStorage.getItem(DRIVE_CLIENT_KEY)||'';}
function driveToken(){const token=sessionStorage.getItem(DRIVE_TOKEN_KEY)||'',expiry=Number(sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY)||0);if(!token||Date.now()>expiry){sessionStorage.removeItem(DRIVE_TOKEN_KEY);sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);return'';}return token;}
function setDriveToken(token,expiresIn){sessionStorage.setItem(DRIVE_TOKEN_KEY,token);sessionStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY,String(Date.now()+Math.max(60,Number(expiresIn||3600)-60)*1000));renderDriveStatus();}
async function connectDrive(){const clientId=driveClientId();if(!clientId)throw new Error('Enter and save the Google OAuth Web Client ID first.');await loadGoogleIdentity();return new Promise((resolve,reject)=>{const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE,callback:r=>{if(r.error)return reject(new Error(r.error_description||r.error));setDriveToken(r.access_token,r.expires_in);resolve(r.access_token);},error_callback:e=>reject(new Error(e?.message||e?.type||'Google authorization failed'))});client.requestAccessToken({prompt:'consent'});});}
function renderDriveStatus(){const connected=Boolean(driveToken());if($('#driveStatus'))$('#driveStatus').textContent=connected?'Connected for this browser session':'Not connected';if($('#driveConnectBtn'))$('#driveConnectBtn').textContent=connected?'Reconnect Google Drive':'Connect Google Drive';if($('#receiptDriveStatus'))$('#receiptDriveStatus').textContent=connected?'Google Drive connected':'Connect Google Drive in Settings before uploading a receipt';}
function safeName(v){return String(v||'receipt').trim().replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'receipt';}
async function uploadReceiptToDrive(file,{month,date,name}){if(!file)return{receiptProvider:null,receiptFileId:null,receiptFileName:null,receiptUrl:null,receiptFolderId:null};if(!file.type.startsWith('image/'))throw new Error('Receipt must be an image file');if(file.size>10*1024*1024)throw new Error('Receipt image must be 10 MB or smaller');const token=driveToken();if(!token)throw new Error('Google Drive is not connected. Open Settings and connect it before uploading a receipt.');const ext=(file.name.match(/\.[a-zA-Z0-9]{1,8}$/)||['.jpg'])[0],driveName=`${month}__${date}__${safeName(name)}__${Date.now()}${ext}`;const metadata={name:driveName,parents:[DRIVE_FOLDER_ID],description:'WalCon receipt image'};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',file,file.name);const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||`Drive upload failed (${response.status})`);return{receiptProvider:'google-drive',receiptFileId:data.id,receiptFileName:data.name||driveName,receiptUrl:data.webViewLink||`https://drive.google.com/file/d/${data.id}/view`,receiptFolderId:DRIVE_FOLDER_ID};}
async function deleteDriveReceipt(fileId){if(!fileId)return;const token=driveToken();if(!token){toast('Transaction removed. Drive receipt was retained because Google Drive is not connected.',true);return;}const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});if(!response.ok&&response.status!==404){const data=await response.json().catch(()=>({}));throw new Error(data?.error?.message||`Drive delete failed (${response.status})`);}}

async function saveTransaction(event){
  event.preventDefault();clearError();
  const type=state.transactionType,categoryId=$('#transactionCategory').value,lineItem=$('#transactionLine').value,name=$('#transactionName').value.trim(),date=$('#transactionDate').value,sourceId=$('#transactionSource').value,amount=parseIDR($('#transactionAmount').value),notes=$('#transactionNotes').value.trim(),c=category(categoryId),s=source(sourceId),month=date?.slice(0,7);
  if(!c||!lineItem||!name||!date||!s||amount<=0)return toast('Complete category, line item, name, date, balance source and amount');
  let budgetId=null;
  if(type==='expense'&&$('#transactionLinked').checked){const b=await findBudgetFor(month,categoryId,lineItem);if(!b)return toast('No matching budget item. Add budget first or turn budget linking off.');budgetId=b.id;}
  let receipt={receiptProvider:null,receiptFileId:null,receiptFileName:null,receiptUrl:null,receiptFolderId:null};
  try{
    const file=type==='expense'?$('#transactionReceipt').files?.[0]:null;if(file){toast('Uploading receipt to Google Drive…',true);receipt=await uploadReceiptToDrive(file,{month,date,name});}
    const sourceRef=doc(db,...userPath('balanceSources',sourceId)),txRef=doc(collection(db,...userPath('transactions'))),delta=type==='income'?amount:-amount;
    await runTransaction(db,async tx=>{const sourceSnap=await tx.get(sourceRef);if(!sourceSnap.exists())throw new Error('Balance source no longer exists');const sourceData=sourceSnap.data();tx.update(sourceRef,{currentBalance:Number(sourceData.currentBalance||0)+delta,updatedAt:serverTimestamp()});tx.set(txRef,{type,month,date,categoryId,categoryName:c.name,lineItem,name,sourceId,sourceName:s.name,amount,notes,budgetId,...receipt,createdAt:serverTimestamp()});});
    $('#transactionForm').reset();$('#transactionLinked').checked=true;$('#transactionDate').value=todayISO();toast(type==='income'?'Income saved and balance increased':'Expense saved and balance reduced');if(month!==state.month)changeMonth(month);showView('home');
  }catch(e){showError(e,'Save transaction failed');}
}

async function deleteTransaction(id){
  const t=state.transactions.find(x=>x.id===id);if(!t||!confirm(`Remove “${t.name||'transaction'}” and reverse its balance effect?`))return;
  try{
    const sourceRef=doc(db,...userPath('balanceSources',t.sourceId)),txRef=doc(db,...userPath('transactions',id)),reverse=t.type==='income'?-Number(t.amount||0):Number(t.amount||0);
    await runTransaction(db,async tx=>{const s=await tx.get(sourceRef);if(s.exists())tx.update(sourceRef,{currentBalance:Number(s.data().currentBalance||0)+reverse,updatedAt:serverTimestamp()});if(t.debtId){const dRef=doc(db,...userPath('debts',t.debtId)),dSnap=await tx.get(dRef);if(dSnap.exists())tx.update(dRef,{currentBalance:Number(dSnap.data().currentBalance||0)+Number(t.amount||0),updatedAt:serverTimestamp()});}tx.delete(txRef);if(t.debtId)tx.delete(doc(db,...userPath('debtPayments',id)));});
    if(t.receiptProvider==='google-drive'&&t.receiptFileId){try{await deleteDriveReceipt(t.receiptFileId);}catch(e){showError(e,'Transaction removed but Drive receipt deletion failed');}}
    toast('Transaction removed and balance reversed');
  }catch(e){showError(e,'Remove transaction failed');}
}

async function payDebt(id){
  const d=state.debts.find(x=>x.id===id),sourceId=$('#mDebtSource').value,amount=parseIDR($('#mDebtPayAmount').value),s=source(sourceId);if(!d||!s||amount<=0)return toast('Source and payment amount required');const paid=Math.min(amount,Number(d.currentBalance||0));let budgetId=null;if($('#mDebtLinkBudget').checked){budgetId=state.budgets.find(b=>b.categoryId===d.categoryId&&b.lineItem==='Payment')?.id||null;if(!budgetId)return toast('No matching Debt → Payment budget this month');}
  try{const debtRef=doc(db,...userPath('debts',id)),sourceRef=doc(db,...userPath('balanceSources',sourceId)),txRef=doc(collection(db,...userPath('transactions'))),payRef=doc(db,...userPath('debtPayments',txRef.id));await runTransaction(db,async tx=>{const dd=await tx.get(debtRef),ss=await tx.get(sourceRef);if(!dd.exists()||!ss.exists())throw new Error('Debt or payment source missing');tx.update(debtRef,{currentBalance:Math.max(0,Number(dd.data().currentBalance||0)-paid),updatedAt:serverTimestamp()});tx.update(sourceRef,{currentBalance:Number(ss.data().currentBalance||0)-paid,updatedAt:serverTimestamp()});tx.set(txRef,{type:'expense',month:state.month,date:todayISO(),categoryId:d.categoryId,categoryName:d.categoryName,lineItem:'Payment',name:`Debt payment — ${d.name}`,sourceId,sourceName:s.name,amount:paid,notes:'Debt payment',budgetId,debtId:id,createdAt:serverTimestamp()});tx.set(payRef,{debtId:id,debtName:d.name,amount:paid,sourceId,sourceName:s.name,month:state.month,date:todayISO(),createdAt:serverTimestamp()});});closeModal();toast('Debt payment applied');}catch(e){showError(e,'Debt payment failed');}
}
async function toggleBill(id){const current=state.billStatus.find(x=>x.billId===id);try{await setDoc(doc(db,...userPath('billStatus',`${state.month}_${id}`)),{billId:id,month:state.month,paid:!current?.paid,updatedAt:serverTimestamp()},{merge:true});}catch(e){showError(e,'Update bill failed');}}

onAuthStateChanged(auth,async user=>{stopListeners();state.user=user;if(!user){showView('auth');return;}if($('#settingsEmail'))$('#settingsEmail').textContent=user.email||user.uid;try{await initializeDefaultsOnce();changeMonth(monthKey());showView('home');}catch(e){showError(e,'Firebase setup failed');showView('home');}});

$('#loginBtn').onclick=async()=>{try{$('#authMessage').textContent='';await signInWithEmailAndPassword(auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch(e){$('#authMessage').textContent=e.message;}};
$('#signupBtn').onclick=async()=>{try{$('#authMessage').textContent='';await createUserWithEmailAndPassword(auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch(e){$('#authMessage').textContent=e.message;}};
$('#logoutBtn').onclick=()=>signOut(auth);
$('#modalClose').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
$('#transactionForm').addEventListener('submit',saveTransaction);
$('#transactionCategory').addEventListener('change',refreshTransactionLines);
$('#transactionLine').addEventListener('change',updateBudgetMatchHint);
$('#transactionDate').addEventListener('change',updateBudgetMatchHint);
$('#transactionLinked').addEventListener('change',updateBudgetMatchHint);
$('#budgetMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#billMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#historyMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#saveSettingsBtn').onclick=async()=>{const warningThreshold=Math.max(50,Math.min(99,Number($('#warningThreshold').value||85)));try{await setDoc(doc(db,...userPath('settings','preferences')),{warningThreshold,currency:'IDR',updatedAt:serverTimestamp()},{merge:true});toast('Settings saved');}catch(e){showError(e,'Save settings failed');}};
$('#saveDriveClientBtn').onclick=()=>{const v=$('#driveClientId').value.trim();if(v)localStorage.setItem(DRIVE_CLIENT_KEY,v);else localStorage.removeItem(DRIVE_CLIENT_KEY);toast(v?'Google OAuth Client ID saved in this browser':'Google OAuth Client ID cleared');renderDriveStatus();};
$('#driveConnectBtn').onclick=async()=>{try{const v=$('#driveClientId').value.trim();if(v)localStorage.setItem(DRIVE_CLIENT_KEY,v);await connectDrive();toast('Google Drive connected');}catch(e){showError(e,'Google Drive connection failed');}};
$('#driveDisconnectBtn').onclick=()=>{sessionStorage.removeItem(DRIVE_TOKEN_KEY);sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);renderDriveStatus();toast('Google Drive disconnected');};

addEventListener('online',()=>$('#networkState').textContent='online');addEventListener('offline',()=>$('#networkState').textContent='offline');$('#networkState').textContent=navigator.onLine?'online':'offline';
document.addEventListener('focusout',e=>{if(e.target.classList?.contains('idr-input'))formatIDRInput(e.target);});
document.addEventListener('change',e=>{if(e.target.id==='mBudgetCat')refreshModalBudgetLines();});
document.addEventListener('click',async e=>{
  const txType=e.target.closest('[data-transaction-type]');if(txType){setTransactionType(txType.dataset.transactionType);return;}
  const openTx=e.target.closest('[data-open-transaction]');if(openTx){state.transactionType=openTx.dataset.openTransaction==='income'?'income':'expense';showView('transaction');setTransactionType(state.transactionType);return;}
  const go=e.target.closest('[data-view-go]');if(go){showView(go.dataset.viewGo);return;}
  const open=e.target.closest('[data-open]');if(open){openModal(open.dataset.open);return;}
  const filter=e.target.closest('[data-filter]');if(filter){state.categoryFilter=filter.dataset.filter;$$('#categoryFilters .chip').forEach(x=>x.classList.toggle('active',x===filter));renderCategories();return;}
  const editSource=e.target.closest('[data-edit-source]');if(editSource){openModal('balance',editSource.dataset.editSource);return;}
  const deleteSource=e.target.closest('[data-delete-source]');if(deleteSource&&confirm('Remove this balance source? Existing transaction history is kept.')){try{await deleteDoc(doc(db,...userPath('balanceSources',deleteSource.dataset.deleteSource)));toast('Balance source removed');}catch(err){showError(err,'Remove source failed');}return;}
  const editCategory=e.target.closest('[data-edit-category]');if(editCategory){openModal('category',editCategory.dataset.editCategory);return;}
  const addLineBtn=e.target.closest('[data-add-line]');if(addLineBtn){openModal('line',addLineBtn.dataset.addLine);return;}
  const removeLineBtn=e.target.closest('[data-remove-line]');if(removeLineBtn){await removeLine(removeLineBtn.dataset.removeLine,removeLineBtn.dataset.line);return;}
  const deleteCategory=e.target.closest('[data-delete-category]');if(deleteCategory&&confirm('Remove this category? It will stay deleted. Existing history and budgets are kept.')){try{await deleteDoc(doc(db,...userPath('categories',deleteCategory.dataset.deleteCategory)));toast('Category removed');}catch(err){showError(err,'Remove category failed');}return;}
  const editBudget=e.target.closest('[data-edit-budget]');if(editBudget){openModal('budget',editBudget.dataset.editBudget);return;}
  const deleteBudget=e.target.closest('[data-delete-budget]');if(deleteBudget&&confirm('Remove this monthly budget item? Existing linked expenses remain in history.')){try{await deleteDoc(doc(db,...userPath('budgets',deleteBudget.dataset.deleteBudget)));toast('Budget removed');}catch(err){showError(err,'Remove budget failed');}return;}
  const editDebt=e.target.closest('[data-edit-debt]');if(editDebt){openModal('debt',editDebt.dataset.editDebt);return;}
  const payDebtBtn=e.target.closest('[data-pay-debt]');if(payDebtBtn){openModal('payDebt',payDebtBtn.dataset.payDebt);return;}
  const deleteDebt=e.target.closest('[data-delete-debt]');if(deleteDebt&&confirm('Remove this debt item? Payment history is kept.')){try{await deleteDoc(doc(db,...userPath('debts',deleteDebt.dataset.deleteDebt)));toast('Debt removed');}catch(err){showError(err,'Remove debt failed');}return;}
  const toggle=e.target.closest('[data-toggle-bill]');if(toggle){await toggleBill(toggle.dataset.toggleBill);return;}
  const deleteBill=e.target.closest('[data-delete-bill]');if(deleteBill&&confirm('Remove this recurring bill?')){try{await deleteDoc(doc(db,...userPath('bills',deleteBill.dataset.deleteBill)));toast('Bill removed');}catch(err){showError(err,'Remove bill failed');}return;}
  const deleteTx=e.target.closest('[data-delete-transaction]');if(deleteTx){await deleteTransaction(deleteTx.dataset.deleteTransaction);return;}
  const saveSourceBtn=e.target.closest('[data-save-source]');if(saveSourceBtn){await saveSource(saveSourceBtn.dataset.saveSource);return;}
  const saveCategoryBtn=e.target.closest('[data-save-category]');if(saveCategoryBtn){await saveCategory(saveCategoryBtn.dataset.saveCategory);return;}
  const saveLineBtn=e.target.closest('[data-save-line]');if(saveLineBtn){await addLine(saveLineBtn.dataset.saveLine);return;}
  const saveBudgetBtn=e.target.closest('[data-save-budget]');if(saveBudgetBtn){await saveBudget(saveBudgetBtn.dataset.saveBudget);return;}
  const saveDebtBtn=e.target.closest('[data-save-debt]');if(saveDebtBtn){await saveDebt(saveDebtBtn.dataset.saveDebt);return;}
  const applyDebt=e.target.closest('[data-apply-debt]');if(applyDebt){await payDebt(applyDebt.dataset.applyDebt);return;}
  if(e.target.closest('[data-save-bill]')){await saveBill();return;}
});

$('#driveFolderLink').href=DRIVE_FOLDER_URL;
showView('loading');
