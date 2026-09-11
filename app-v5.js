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
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = (s='') => String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const attr = (s='') => esc(s).replace(/`/g,'&#96;');
const todayISO = () => new Date().toISOString().slice(0,10);
const monthKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const monthLabel = m => { const [y,mo]=m.split('-').map(Number); return new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1)); };
const idr = n => `Rp ${Number(n||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const parseIDR = value => {
  const s = String(value||'').trim();
  if(!s) return 0;
  if(s.includes(',')) return Number(s.replace(/\./g,'').replace(',','.')) || 0;
  if(/^\d{1,3}(\.\d{3})+(\.\d{1,2})?$/.test(s)) return Number(s.replace(/\./g,'')) || 0;
  return Number(s.replace(/[^0-9.-]/g,'')) || 0;
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
const SOURCE_TYPES = ['Cash','Main Bank Account','Other Bank Account','E-wallet','Other'];
const GROUP_LABELS = {income:'Income',need:'Needs',want:'Wants',debt:'Debt'};
const GROUP_ORDER = ['income','need','want','debt'];
const COLORS = ['#9D8BFF','#72E5AC','#FFD66B','#FF6D8E','#7CCBFF','#C58BFF','#8FE0D0','#FFAE73','#89A6FF','#E88BB8','#B8DE73','#D9A2FF','#63D7FF','#F7CB78','#A2F09B','#FF8B75','#B59BFF','#6FC2B1','#E5A7CE','#AFC2FF'];

const state = {
  user:null, month:monthKey(), categories:[], sources:[], transactions:[], budgets:[], debts:[], bills:[], billStatus:[],
  settings:{warningThreshold:85}, unsubs:[], currentView:'home', categoryFilter:'all'
};
const userPath = (...parts) => ['users',state.user.uid,...parts];

function toast(msg,persist=false){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); if(!persist)setTimeout(()=>el.classList.remove('show'),2200); }
function showError(error,context='Firebase error'){
  console.error(context,error);
  const denied=String(error?.code||'').includes('permission-denied');
  const message=denied?'Firestore/Storage permission denied. Publish the supplied rules in Firebase Console.':`${context}: ${error?.message||error}`;
  const b=$('#errorBanner'); b.textContent=message; b.classList.remove('hidden'); toast(message,true);
}
function clearError(){ $('#errorBanner').classList.add('hidden'); }
function closeModal(){ $('#modal').classList.add('hidden'); $('#modalBody').innerHTML=''; }
function showView(name){
  state.currentView=name;
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $$('.nav[data-view-go]').forEach(n=>n.classList.toggle('active',n.dataset.viewGo===name));
  $('#bottomNav').classList.toggle('hidden',name==='auth'||name==='loading');
  $('#app').scrollTop=0;
  if(name==='expense') renderExpenseForm();
  if(name==='settings') renderSettings();
  if(name==='history') renderHistory();
}
function empty(text){ return `<div class=\"item\"><div class=\"grow\"><div class=\"meta\">${esc(text)}</div></div></div>`; }
function category(id){ return state.categories.find(x=>x.id===id); }
function source(id){ return state.sources.find(x=>x.id===id); }
function budget(id){ return state.budgets.find(x=>x.id===id); }
function monthExpenses(m=state.month){ return state.transactions.filter(t=>t.type==='expense'&&t.month===m); }
function linkedSpent(budgetId){ return monthExpenses().filter(t=>t.budgetId===budgetId).reduce((a,t)=>a+Number(t.amount||0),0); }
function totalBalance(){ return state.sources.reduce((a,s)=>a+Number(s.currentBalance||0),0); }
function budgetTotals(){ const total=state.budgets.reduce((a,b)=>a+Number(b.amount||0),0); const spent=state.budgets.reduce((a,b)=>a+linkedSpent(b.id),0); return {total,spent,remaining:total-spent}; }
function budgetStatus(entry){ const spent=linkedSpent(entry.id), amount=Number(entry.amount||0), rem=amount-spent, pct=amount?spent/amount*100:0; return {spent,rem,pct,cls:rem<0?'over':pct>=Number(state.settings.warningThreshold||85)?'warn':'ok'}; }

async function seedDefaults(){
  const existingCats=await getDocs(collection(db,...userPath('categories')));
  const catBatch=writeBatch(db);
  for(const legacy of existingCats.docs){const d=legacy.data();if(!GROUP_ORDER.includes(d.group))catBatch.update(legacy.ref,{group:'want',updatedAt:serverTimestamp()});}
  const existingIds=new Set(existingCats.docs.map(d=>d.id));
  for(const c of DEFAULT_CATEGORIES){ if(!existingIds.has(c.id))catBatch.set(doc(db,...userPath('categories',c.id)),{...c,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}); }
  await catBatch.commit();
  const sourceSnap=await getDocs(collection(db,...userPath('balanceSources')));
  if(sourceSnap.empty){
    const batch=writeBatch(db);
    for(const s of DEFAULT_SOURCES) batch.set(doc(db,...userPath('balanceSources',s.id)),{...s,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await batch.commit();
  }
  const settingsRef=doc(db,...userPath('settings','preferences'));
  const settingsSnap=await getDoc(settingsRef);
  if(!settingsSnap.exists()) await setDoc(settingsRef,{warningThreshold:85,currency:'IDR',updatedAt:serverTimestamp()});
}

function stopListeners(){ state.unsubs.forEach(u=>{try{u()}catch{}}); state.unsubs=[]; }
function listen(col,handler,q=null){
  const target=q||collection(db,...userPath(col));
  state.unsubs.push(onSnapshot(target,s=>{handler(s.docs.map(d=>({id:d.id,...d.data()}))); clearError();},e=>showError(e,`Load ${col} failed`)));
}
function subscribe(){
  stopListeners();
  listen('categories',v=>{state.categories=v.sort((a,b)=>GROUP_ORDER.indexOf(a.group)-GROUP_ORDER.indexOf(b.group)||String(a.name).localeCompare(String(b.name)));renderAll();});
  listen('balanceSources',v=>{state.sources=v.sort((a,b)=>String(a.name).localeCompare(String(b.name)));renderAll();});
  listen('transactions',v=>{state.transactions=v;renderAll();},query(collection(db,...userPath('transactions')),where('month','==',state.month)));
  listen('budgets',v=>{state.budgets=v;renderAll();},query(collection(db,...userPath('budgets')),where('month','==',state.month)));
  listen('debts',v=>{state.debts=v.filter(x=>x.active!==false);renderDebts();});
  listen('bills',v=>{state.bills=v.filter(x=>x.active!==false).sort((a,b)=>(a.dueDay||99)-(b.dueDay||99));renderBills();});
  listen('billStatus',v=>{state.billStatus=v;renderBills();},query(collection(db,...userPath('billStatus')),where('month','==',state.month)));
  state.unsubs.push(onSnapshot(doc(db,...userPath('settings','preferences')),s=>{state.settings={warningThreshold:85,...(s.exists()?s.data():{})};renderAll();},e=>showError(e,'Load settings failed'));
}
function changeMonth(m){ state.month=m||monthKey(); $('#budgetMonth').value=state.month; $('#billMonth').value=state.month; $('#historyMonth').value=state.month; subscribe(); }

function renderAll(){ renderHome(); renderBalances(); renderCategories(); renderBudgets(); renderDebts(); renderBills(); if(state.currentView==='expense')renderExpenseForm(); if(state.currentView==='settings')renderSettings(); if(state.currentView==='history')renderHistory(); }

function renderHome(){
  if(!state.user)return;
  $('#homeMonthLabel').textContent=monthLabel(state.month);
  $('#homeBalance').textContent=idr(totalBalance());
  $('#homeSourceCount').textContent=state.sources.length;
  const bt=budgetTotals(); $('#homeBudgetLeft').textContent=idr(bt.remaining);
  const spent=monthExpenses().reduce((a,t)=>a+Number(t.amount||0),0); $('#homeSpent').textContent=idr(spent);
  $('#homeBalances').innerHTML=state.sources.length?state.sources.map(s=>`<button class=\"balance-chip\" data-edit-source=\"${s.id}\"><span>${esc(s.type||'Source')}</span><strong>${esc(s.name)}</strong><strong>${idr(s.currentBalance)}</strong></button>`).join(''):'';

  const grouped={}; for(const t of monthExpenses()){ const key=t.categoryId||t.categoryName||'other'; if(!grouped[key])grouped[key]={name:t.categoryName||category(t.categoryId)?.name||'Other',value:0}; grouped[key].value+=Number(t.amount||0); }
  const entries=Object.values(grouped).sort((a,b)=>b.value-a.value); const total=entries.reduce((a,x)=>a+x.value,0);
  $('#donutAmount').textContent=idr(total).replace(',00',''); $('#graphTotal').textContent=entries.length?`${entries.length} categories`:'No expenses';
  if(!entries.length){ $('#expenseDonut').style.background='conic-gradient(rgba(255,255,255,.10) 0 100%)'; $('#expenseLegend').innerHTML='<div class=\"meta\">No expense data this month.</div>'; }
  else {
    let cursor=0; const segments=[]; entries.forEach((e,i)=>{const pct=e.value/total*100;segments.push(`${COLORS[i%COLORS.length]} ${cursor}% ${cursor+pct}%`);cursor+=pct;});
    $('#expenseDonut').style.background=`conic-gradient(${segments.join(',')})`;
    $('#expenseLegend').innerHTML=entries.map((e,i)=>`<div class=\"legend-item\"><i class=\"legend-dot\" style=\"background:${COLORS[i%COLORS.length]}\"></i><span>${esc(e.name)}</span><strong>${Math.round(e.value/total*100)}%</strong></div>`).join('');
  }
  const recent=[...monthExpenses()].sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt)).slice(0,5);
  $('#recentExpenses').innerHTML=recent.length?recent.map(t=>`<div class=\"item\"><div class=\"item-icon\">${category(t.categoryId)?.icon||'−'}</div><div class=\"grow\"><div class=\"name\">${esc(t.name||t.lineItem||'Expense')}</div><div class=\"meta\">${esc(t.categoryName||'')} • ${esc(t.lineItem||'')} • ${esc(t.sourceName||'')}</div></div><div class=\"money red\">− ${idr(t.amount)}</div></div>`).join(''):empty('No expenses this month.');
}

function renderBalances(){
  $('#balanceTotal').textContent=idr(totalBalance());
  $('#balanceList').innerHTML=state.sources.length?state.sources.map(s=>`<div class=\"card\"><div class=\"row-head\"><div><div class=\"name\">${esc(s.name)}</div><span class=\"source-badge\">${esc(s.type||'Other')}</span><div class=\"hero-number small\">${idr(s.currentBalance)}</div></div><div class=\"row-actions\"><button class=\"btn sm\" data-edit-source=\"${s.id}\">Edit</button><button class=\"btn sm danger\" data-delete-source=\"${s.id}\">Remove</button></div></div></div>`).join(''):empty('No balance sources.');
}

function renderCategories(){
  const filtered=state.categoryFilter==='all'?state.categories:state.categories.filter(c=>c.group===state.categoryFilter);
  let html='';
  for(const group of GROUP_ORDER){
    const cats=filtered.filter(c=>c.group===group); if(!cats.length)continue;
    html+=`<div class=\"group-label\">${GROUP_LABELS[group]}</div>`;
    html+=cats.map(c=>`<div class=\"card\"><div class=\"row-head\"><div><div class=\"name\">${c.icon||'•'} ${esc(c.name)}</div><span class=\"kind-badge\">${GROUP_LABELS[c.group]||c.group}</span></div><div class=\"row-actions\"><button class=\"btn sm\" data-add-line=\"${c.id}\">+ Line</button><button class=\"btn sm\" data-edit-category=\"${c.id}\">Edit</button><button class=\"btn sm danger\" data-delete-category=\"${c.id}\">Remove</button></div></div><div class=\"line-items\">${(c.lineItems||[]).length?(c.lineItems||[]).map(line=>`<span class=\"line-pill\">${esc(line)} <button data-remove-line=\"${c.id}\" data-line=\"${attr(line)}\" aria-label=\"Remove\">×</button></span>`).join(''):'<span class=\"meta\">No line items</span>'}</div></div>`).join('');
  }
  $('#categoryList').innerHTML=html||empty('No categories in this filter.');
}

function renderExpenseForm(){
  if(!state.user)return;
  if(!$('#expenseDate').value) $('#expenseDate').value=todayISO();
  const currentCat=$('#expenseCategory').value;
  const expenseCats=state.categories.filter(c=>GROUP_ORDER.includes(c.group)&&c.group!=='income');
  $('#expenseCategory').innerHTML='<option value=\"\">Select Category</option>'+expenseCats.map(c=>`<option value=\"${c.id}\" ${c.id===currentCat?'selected':''}>${esc(GROUP_LABELS[c.group]+' — '+c.name)}</option>`).join('');
  const currentSource=$('#expenseSource').value;
  $('#expenseSource').innerHTML='<option value=\"\">Select source of fund</option>'+state.sources.map(s=>`<option value=\"${s.id}\" ${s.id===currentSource?'selected':''}>${esc(s.name)} — ${idr(s.currentBalance)}</option>`).join('');
  refreshExpenseLines();
}
function refreshExpenseLines(){
  const cat=category($('#expenseCategory').value); const selected=$('#expenseLine').value;
  $('#expenseLine').innerHTML='<option value=\"\">Select Line Item</option>'+((cat?.lineItems||[]).map(line=>`<option value=\"${attr(line)}\" ${line===selected?'selected':''}>${esc(line)}</option>`).join(''));
  updateBudgetMatchHint();
}
async function findBudgetFor(month,categoryId,lineItem){
  if(month===state.month)return state.budgets.find(x=>x.month===month&&x.categoryId===categoryId&&x.lineItem===lineItem)||null;
  const snap=await getDocs(query(collection(db,...userPath('budgets')),where('month','==',month)));
  return snap.docs.map(d=>({id:d.id,...d.data()})).find(x=>x.categoryId===categoryId&&x.lineItem===lineItem)||null;
}
function updateBudgetMatchHint(){
  const linked=$('#expenseLinked').checked, catId=$('#expenseCategory').value, line=$('#expenseLine').value, date=$('#expenseDate').value||todayISO(), m=date.slice(0,7);
  if(!linked){ $('#budgetMatchHint').textContent='Out-of-budget expense: it will reduce the selected balance source, but not any budget item.'; return; }
  if(m!==state.month){$('#budgetMatchHint').textContent=`Budget link will be checked against ${monthLabel(m)} when you save.`;return;}
  const b=state.budgets.find(x=>x.month===m&&x.categoryId===catId&&x.lineItem===line);
  if(!b){ $('#budgetMatchHint').textContent='No matching budget item for this month. Add one in Budget or turn linking off.'; return; }
  const st=budgetStatus(b); $('#budgetMatchHint').textContent=`Linked to ${b.categoryName} → ${b.lineItem}. Remaining before this expense: ${idr(st.rem)}.`;
}

function renderBudgets(){
  $('#budgetMonth').value=state.month;
  const bt=budgetTotals(); $('#budgetTotal').textContent=idr(bt.total); $('#budgetSpent').textContent=idr(bt.spent); $('#budgetRemaining').textContent=idr(bt.remaining);
  $('#budgetList').innerHTML=state.budgets.length?state.budgets.sort((a,b)=>String(a.categoryName).localeCompare(String(b.categoryName))).map(b=>{const st=budgetStatus(b);return `<div class=\"card\"><div class=\"row-head\"><div><div class=\"name\">${esc(b.categoryName)} → ${esc(b.lineItem)}</div><div class=\"meta\">Fixed monthly budget ${idr(b.amount)} • Linked spending ${idr(st.spent)}</div><div class=\"budget-status ${st.cls}\">${st.rem<0?`Over ${idr(Math.abs(st.rem))}`:`Remaining ${idr(st.rem)}`}</div></div><div class=\"row-actions\"><button class=\"btn sm\" data-edit-budget=\"${b.id}\">Edit</button><button class=\"btn sm danger\" data-delete-budget=\"${b.id}\">Remove</button></div></div><div class=\"progress ${st.cls}\"><i style=\"width:${Math.min(100,st.pct)}%\"></i></div></div>`}).join(''):empty('No budget items for this month. Add a fixed budget per line item.');
}

function renderDebts(){
  $('#debtTotal').textContent=idr(state.debts.reduce((a,d)=>a+Number(d.currentBalance||0),0));
  $('#debtList').innerHTML=state.debts.length?state.debts.map(d=>{const original=Number(d.originalBalance||0),current=Number(d.currentBalance||0),paid=Math.max(0,original-current),pct=original?paid/original*100:0;return `<div class=\"card\"><div class=\"row-head\"><div><div class=\"name\">${esc(d.name)}</div><div class=\"meta\">${esc(d.categoryName||'Debt')} • Original ${idr(original)}</div></div><div class=\"row-actions\"><button class=\"btn sm\" data-pay-debt=\"${d.id}\">Pay</button><button class=\"btn sm\" data-edit-debt=\"${d.id}\">Edit</button><button class=\"btn sm danger\" data-delete-debt=\"${d.id}\">Remove</button></div></div><div class=\"progress\"><i style=\"width:${Math.min(100,pct)}%\"></i></div><div class=\"summary3\" style=\"margin-top:10px\"><div><span>Paid</span><strong>${idr(paid)}</strong></div><div><span>Remaining</span><strong>${idr(current)}</strong></div><div><span>Progress</span><strong>${Math.round(pct)}%</strong></div></div></div>`}).join(''):empty('No debt items yet.');
}

function renderBills(){
  $('#billMonth').value=state.month;
  $('#billList').innerHTML=state.bills.length?state.bills.map(b=>{const s=state.billStatus.find(x=>x.billId===b.id);return `<div class=\"item\"><div class=\"item-icon\">✓</div><div class=\"grow\"><div class=\"name\">${esc(b.name)}</div><div class=\"meta\">${b.dueDay?`Due day ${b.dueDay}`:'No due day'} • ${idr(b.amount||0)}</div></div><button class=\"btn sm ${s?.paid?'primary':''}\" data-toggle-bill=\"${b.id}\">${s?.paid?'Paid':'Unpaid'}</button><button class=\"btn sm danger\" data-delete-bill=\"${b.id}\">×</button></div>`}).join(''):empty('No recurring bills yet.');
}

function renderHistory(){
  $('#historyMonth').value=state.month;
  const items=[...monthExpenses()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||timeOf(b.createdAt)-timeOf(a.createdAt));
  $('#historyList').innerHTML=items.length?items.map(t=>`<div class=\"item\"><div class=\"item-icon\">${category(t.categoryId)?.icon||'−'}</div><div class=\"grow\"><div class=\"name\">${esc(t.name||t.lineItem||'Expense')}</div><div class=\"meta\">${esc(t.date||'')} • ${esc(t.categoryName||'')} → ${esc(t.lineItem||'')} • ${esc(t.sourceName||'')}${t.notes?` • ${esc(t.notes)}`:''}</div>${t.receiptUrl?`<a href=\"${attr(t.receiptUrl)}\" target=\"_blank\" rel=\"noopener\" class=\"link\">View bill photo</a>`:''}</div><div><div class=\"money red\">− ${idr(t.amount)}</div><button class=\"btn sm danger\" data-delete-expense=\"${t.id}\">Remove</button></div></div>`).join(''):empty('No expenses this month.');
}
function renderSettings(){ $('#warningThreshold').value=Number(state.settings.warningThreshold||85); $('#settingsEmail').textContent=state.user?.email||''; }

function openModal(type,id=null){
  const body=$('#modalBody'), title=$('#modalTitle');
  if(type==='balance'){
    const s=id?source(id):null; title.textContent=s?'Edit balance source':'Add balance source';
    body.innerHTML=`<label>Source type<select id=\"mSourceType\">${SOURCE_TYPES.map(x=>`<option ${x===(s?.type||'Cash')?'selected':''}>${x}</option>`).join('')}</select></label><label style=\"margin-top:12px\">Name<input id=\"mSourceName\" value=\"${attr(s?.name||'')}\" placeholder=\"e.g. BCA Main\"></label><label style=\"margin-top:12px\">Current balance (IDR)<input id=\"mSourceBalance\" class=\"idr-input\" inputmode=\"decimal\" value=\"${s?Number(s.currentBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}\" placeholder=\"0,00\"></label><button class=\"btn primary full\" data-save-source=\"${id||''}\">Save</button>`;
  } else if(type==='category'){
    const c=id?category(id):null; title.textContent=c?'Edit category':'Add category';
    body.innerHTML=`<label>Group<select id=\"mCatGroup\">${GROUP_ORDER.map(g=>`<option value=\"${g}\" ${g===(c?.group||'need')?'selected':''}>${GROUP_LABELS[g]}</option>`).join('')}</select></label><label style=\"margin-top:12px\">Category name<input id=\"mCatName\" value=\"${attr(c?.name||'')}\" placeholder=\"Category name\"></label><label style=\"margin-top:12px\">Icon / emoji<input id=\"mCatIcon\" value=\"${attr(c?.icon||'')}\" maxlength=\"4\" placeholder=\"•\"></label><label style=\"margin-top:12px\">Line items — one per line<textarea id=\"mCatLines\" placeholder=\"Item 1\nItem 2\">${esc((c?.lineItems||[]).join('\n'))}</textarea></label><button class=\"btn primary full\" data-save-category=\"${id||''}\">Save</button>`;
  } else if(type==='line'){
    const c=category(id); title.textContent=`Add line item — ${c?.name||''}`; body.innerHTML=`<label>Line item name<input id=\"mLineName\" placeholder=\"New line item\"></label><button class=\"btn primary full\" data-save-line=\"${id}\">Add Line Item</button>`;
  } else if(type==='budget'){
    const b=id?budget(id):null; title.textContent=b?'Edit budget item':'Add budget item';
    const cats=state.categories.filter(c=>GROUP_ORDER.includes(c.group)&&c.group!=='income');
    body.innerHTML=`<label>Category<select id=\"mBudgetCat\"><option value=\"\">Select</option>${cats.map(c=>`<option value=\"${c.id}\" ${c.id===b?.categoryId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label style=\"margin-top:12px\">Line item<select id=\"mBudgetLine\"><option value=\"${attr(b?.lineItem||'')}\">${esc(b?.lineItem||'Select category first')}</option></select></label><label style=\"margin-top:12px\">Fixed monthly budget (IDR)<input id=\"mBudgetAmount\" class=\"idr-input\" inputmode=\"decimal\" value=\"${b?Number(b.amount||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}\" placeholder=\"0,00\"></label><button class=\"btn primary full\" data-save-budget=\"${id||''}\">Save Budget</button>`;
    setTimeout(()=>refreshModalBudgetLines(b?.lineItem||''),0);
  } else if(type==='debt'){
    const d=id?state.debts.find(x=>x.id===id):null; const debtCats=state.categories.filter(c=>c.group==='debt'); title.textContent=d?'Edit debt':'Add debt';
    body.innerHTML=`<label>Debt category<select id=\"mDebtCat\"><option value=\"\">Select</option>${debtCats.map(c=>`<option value=\"${c.id}\" ${c.id===d?.categoryId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label style=\"margin-top:12px\">Debt name<input id=\"mDebtName\" value=\"${attr(d?.name||'')}\" placeholder=\"e.g. BCA Visa\"></label><label style=\"margin-top:12px\">Original amount<input id=\"mDebtOriginal\" class=\"idr-input\" inputmode=\"decimal\" value=\"${d?Number(d.originalBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}\"></label><label style=\"margin-top:12px\">Current remaining<input id=\"mDebtCurrent\" class=\"idr-input\" inputmode=\"decimal\" value=\"${d?Number(d.currentBalance||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}):''}\"></label><button class=\"btn primary full\" data-save-debt=\"${id||''}\">Save Debt</button>`;
  } else if(type==='payDebt'){
    const d=state.debts.find(x=>x.id===id); title.textContent=`Pay — ${d?.name||'Debt'}`;
    body.innerHTML=`<div class=\"meta\">Remaining ${idr(d?.currentBalance||0)}</div><label style=\"margin-top:12px\">Payment source<select id=\"mDebtSource\"><option value=\"\">Select source</option>${state.sources.map(s=>`<option value=\"${s.id}\">${esc(s.name)} — ${idr(s.currentBalance)}</option>`).join('')}</select></label><label style=\"margin-top:12px\">Payment amount<input id=\"mDebtPayAmount\" class=\"idr-input\" inputmode=\"decimal\" placeholder=\"0,00\"></label><label class=\"switchline\" style=\"margin-top:12px\"><input id=\"mDebtLinkBudget\" type=\"checkbox\"><span>Link payment to matching monthly budget if available</span></label><button class=\"btn primary full\" data-apply-debt=\"${id}\">Apply Payment</button>`;
  } else if(type==='bill'){
    title.textContent='Add recurring bill'; body.innerHTML=`<label>Bill name<input id=\"mBillName\" placeholder=\"Electricity\"></label><div class=\"grid2\" style=\"margin-top:12px\"><label>Amount<input id=\"mBillAmount\" class=\"idr-input\" inputmode=\"decimal\" placeholder=\"0,00\"></label><label>Due day<input id=\"mBillDue\" type=\"number\" min=\"1\" max=\"31\"></label></div><button class=\"btn primary full\" data-save-bill>Save Bill</button>`;
  }
  $('#modal').classList.remove('hidden');
}
function refreshModalBudgetLines(selected=''){
  const cat=category($('#mBudgetCat')?.value); if(!$('#mBudgetLine'))return;
  $('#mBudgetLine').innerHTML='<option value=\"\">Select line item</option>'+((cat?.lineItems||[]).map(l=>`<option value=\"${attr(l)}\" ${l===selected?'selected':''}>${esc(l)}</option>`).join(''));
}

async function saveSource(id){
  const name=$('#mSourceName').value.trim(), type=$('#mSourceType').value, currentBalance=parseIDR($('#mSourceBalance').value); if(!name)return toast('Source name required');
  try{ const data={name,type,currentBalance,updatedAt:serverTimestamp()}; if(id)await updateDoc(doc(db,...userPath('balanceSources',id)),data); else await addDoc(collection(db,...userPath('balanceSources')),{...data,createdAt:serverTimestamp()}); closeModal();toast('Balance source saved'); }catch(e){showError(e,'Save balance source failed');}
}
async function saveCategory(id){
  const name=$('#mCatName').value.trim(),group=$('#mCatGroup').value,icon=$('#mCatIcon').value.trim(),lineItems=[...new Set($('#mCatLines').value.split('\n').map(x=>x.trim()).filter(Boolean))]; if(!name)return toast('Category name required');
  try{const data={name,group,icon,lineItems,updatedAt:serverTimestamp()}; if(id)await updateDoc(doc(db,...userPath('categories',id)),data); else await addDoc(collection(db,...userPath('categories')),{...data,isDefault:false,createdAt:serverTimestamp()});closeModal();toast('Category saved');}catch(e){showError(e,'Save category failed');}
}
async function addLine(id){ const name=$('#mLineName').value.trim(); if(!name)return toast('Line item required'); const c=category(id); if(!c)return; try{await updateDoc(doc(db,...userPath('categories',id)),{lineItems:[...new Set([...(c.lineItems||[]),name])],updatedAt:serverTimestamp()});closeModal();toast('Line item added');}catch(e){showError(e,'Add line item failed');} }
async function removeLine(id,line){ const c=category(id); if(!c)return; if(!confirm(`Remove line item “${line}”? Existing history is kept.`))return; try{await updateDoc(doc(db,...userPath('categories',id)),{lineItems:(c.lineItems||[]).filter(x=>x!==line),updatedAt:serverTimestamp()});toast('Line item removed');}catch(e){showError(e,'Remove line item failed');} }
async function saveBudget(id){
  const categoryId=$('#mBudgetCat').value,lineItem=$('#mBudgetLine').value,amount=parseIDR($('#mBudgetAmount').value),c=category(categoryId); if(!c||!lineItem||amount<=0)return toast('Category, line item and amount are required');
  try{
    if(!id){const existing=state.budgets.find(b=>b.categoryId===categoryId&&b.lineItem===lineItem); if(existing)return toast('This line item already has a budget this month');}
    const data={month:state.month,categoryId,categoryName:c.name,lineItem,amount,updatedAt:serverTimestamp()}; if(id)await updateDoc(doc(db,...userPath('budgets',id)),data); else await addDoc(collection(db,...userPath('budgets')),{...data,createdAt:serverTimestamp()}); closeModal();toast('Budget saved');
  }catch(e){showError(e,'Save budget failed');}
}
async function saveDebt(id){ const categoryId=$('#mDebtCat').value,c=category(categoryId),name=$('#mDebtName').value.trim(),original=parseIDR($('#mDebtOriginal').value),current=parseIDR($('#mDebtCurrent').value||$('#mDebtOriginal').value); if(!c||!name||original<=0)return toast('Debt category, name and original amount required'); try{const data={categoryId,categoryName:c.name,name,originalBalance:original,currentBalance:current,active:true,updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,...userPath('debts',id)),data);else await addDoc(collection(db,...userPath('debts')),{...data,createdAt:serverTimestamp()});closeModal();toast('Debt saved');}catch(e){showError(e,'Save debt failed');} }
async function saveBill(){ const name=$('#mBillName').value.trim(),amount=parseIDR($('#mBillAmount').value),dueDay=Number($('#mBillDue').value||0)||null;if(!name)return toast('Bill name required');try{await addDoc(collection(db,...userPath('bills')),{name,amount,dueDay,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});closeModal();toast('Bill saved');}catch(e){showError(e,'Save bill failed');} }

async function uploadReceipt(file,month){ if(!file)return {receiptUrl:null,receiptPath:null}; const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`users/${state.user.uid}/receipts/${month}/${Date.now()}_${crypto.randomUUID()}_${safe}`; const ref=storageRef(storage,path); await uploadBytes(ref,file,{contentType:file.type||'image/jpeg'}); return {receiptUrl:await getDownloadURL(ref),receiptPath:path}; }

async function saveExpense(event){
  event.preventDefault(); clearError();
  const categoryId=$('#expenseCategory').value,lineItem=$('#expenseLine').value,name=$('#expenseName').value.trim(),date=$('#expenseDate').value,sourceId=$('#expenseSource').value,amount=parseIDR($('#expenseAmount').value),notes=$('#expenseNotes').value.trim(),linked=$('#expenseLinked').checked;
  const c=category(categoryId),s=source(sourceId),month=date?.slice(0,7); if(!c||!lineItem||!name||!date||!s||amount<=0)return toast('Complete category, line item, name, date, source and amount');
  let budgetId=null;
  if(linked){ const b=await findBudgetFor(month,categoryId,lineItem); if(!b)return toast('No matching budget item. Add budget first or turn budget linking off.'); budgetId=b.id; }
  let receipt={receiptUrl:null,receiptPath:null};
  try{
    const file=$('#expenseReceipt').files?.[0]; if(file) receipt=await uploadReceipt(file,month);
    const sourceRef=doc(db,...userPath('balanceSources',sourceId)); const txRef=doc(collection(db,...userPath('transactions')));
    await runTransaction(db,async tx=>{const sourceSnap=await tx.get(sourceRef);if(!sourceSnap.exists())throw new Error('Payment source no longer exists');const sourceData=sourceSnap.data();tx.update(sourceRef,{currentBalance:Number(sourceData.currentBalance||0)-amount,updatedAt:serverTimestamp()});tx.set(txRef,{type:'expense',month,date,categoryId,categoryName:c.name,lineItem,name,sourceId,sourceName:s.name,amount,notes,budgetId,...receipt,createdAt:serverTimestamp()});});
    $('#expenseForm').reset(); $('#expenseLinked').checked=true; $('#expenseDate').value=todayISO(); renderExpenseForm(); toast('Expense saved and balance reduced'); if(month!==state.month)changeMonth(month); showView('home');
  }catch(e){showError(e,'Save expense failed');}
}

async function deleteExpense(id){
  const t=state.transactions.find(x=>x.id===id); if(!t||!confirm(`Remove “${t.name||'expense'}” and restore ${idr(t.amount)} to ${t.sourceName||'its source'}?`))return;
  try{
    const sourceRef=doc(db,...userPath('balanceSources',t.sourceId)); const txRef=doc(db,...userPath('transactions',id));
    await runTransaction(db,async tx=>{const s=await tx.get(sourceRef); if(s.exists())tx.update(sourceRef,{currentBalance:Number(s.data().currentBalance||0)+Number(t.amount||0),updatedAt:serverTimestamp()}); tx.delete(txRef);});
    if(t.receiptPath){try{await deleteObject(storageRef(storage,t.receiptPath));}catch{}}
    toast('Expense removed and balance restored');
  }catch(e){showError(e,'Remove expense failed');}
}

async function payDebt(id){
  const d=state.debts.find(x=>x.id===id),sourceId=$('#mDebtSource').value,amount=parseIDR($('#mDebtPayAmount').value),s=source(sourceId);if(!d||!s||amount<=0)return toast('Source and payment amount required');
  const paid=Math.min(amount,Number(d.currentBalance||0)); let budgetId=null;
  if($('#mDebtLinkBudget').checked){budgetId=state.budgets.find(b=>b.categoryId===d.categoryId&&b.lineItem==='Payment')?.id||null; if(!budgetId)return toast('No matching Debt → Payment budget this month');}
  try{
    const debtRef=doc(db,...userPath('debts',id)),sourceRef=doc(db,...userPath('balanceSources',sourceId)),txRef=doc(collection(db,...userPath('transactions')));
    await runTransaction(db,async tx=>{const dd=await tx.get(debtRef);const ss=await tx.get(sourceRef);if(!dd.exists()||!ss.exists())throw new Error('Debt or payment source missing');tx.update(debtRef,{currentBalance:Math.max(0,Number(dd.data().currentBalance||0)-paid),updatedAt:serverTimestamp()});tx.update(sourceRef,{currentBalance:Number(ss.data().currentBalance||0)-paid,updatedAt:serverTimestamp()});tx.set(txRef,{type:'expense',month:state.month,date:todayISO(),categoryId:d.categoryId,categoryName:d.categoryName,lineItem:'Payment',name:`Debt payment — ${d.name}`,sourceId,sourceName:s.name,amount:paid,notes:'Debt payment',budgetId,createdAt:serverTimestamp()});});
    await addDoc(collection(db,...userPath('debtPayments')),{debtId:id,debtName:d.name,amount:paid,sourceId,sourceName:s.name,month:state.month,date:todayISO(),createdAt:serverTimestamp()}); closeModal();toast('Debt payment applied');
  }catch(e){showError(e,'Debt payment failed');}
}

async function toggleBill(id){ const current=state.billStatus.find(x=>x.billId===id); try{await setDoc(doc(db,...userPath('billStatus',`${state.month}_${id}`)),{billId:id,month:state.month,paid:!current?.paid,updatedAt:serverTimestamp()},{merge:true});}catch(e){showError(e,'Update bill failed');} }

onAuthStateChanged(auth,async user=>{
  stopListeners(); state.user=user;
  if(!user){showView('auth');return;}
  $('#settingsEmail').textContent=user.email||user.uid;
  try{await seedDefaults(); changeMonth(monthKey()); showView('home');}catch(e){showError(e,'Firebase setup failed');showView('home');}
});

$('#loginBtn').onclick=async()=>{try{$('#authMessage').textContent='';await signInWithEmailAndPassword(auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch(e){$('#authMessage').textContent=e.message;}};
$('#signupBtn').onclick=async()=>{try{$('#authMessage').textContent='';await createUserWithEmailAndPassword(auth,$('#authEmail').value.trim(),$('#authPassword').value);}catch(e){$('#authMessage').textContent=e.message;}};
$('#logoutBtn').onclick=()=>signOut(auth);
$('#modalClose').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
$('#expenseForm').addEventListener('submit',saveExpense);
$('#expenseCategory').addEventListener('change',refreshExpenseLines);
$('#expenseLine').addEventListener('change',updateBudgetMatchHint);
$('#expenseDate').addEventListener('change',updateBudgetMatchHint);
$('#expenseLinked').addEventListener('change',updateBudgetMatchHint);
$('#budgetMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#billMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#historyMonth').addEventListener('change',e=>changeMonth(e.target.value));
$('#saveSettingsBtn').onclick=async()=>{const warningThreshold=Math.max(50,Math.min(99,Number($('#warningThreshold').value||85)));try{await setDoc(doc(db,...userPath('settings','preferences')),{warningThreshold,currency:'IDR',updatedAt:serverTimestamp()},{merge:true});toast('Settings saved');}catch(e){showError(e,'Save settings failed');}};

addEventListener('online',()=>$('#networkState').textContent='online'); addEventListener('offline',()=>$('#networkState').textContent='offline'); $('#networkState').textContent=navigator.onLine?'online':'offline';

document.addEventListener('focusout',e=>{if(e.target.classList?.contains('idr-input'))formatIDRInput(e.target);});
document.addEventListener('change',e=>{if(e.target.id==='mBudgetCat')refreshModalBudgetLines();});

document.addEventListener('click',async e=>{
  const go=e.target.closest('[data-view-go]'); if(go){showView(go.dataset.viewGo);return;}
  const open=e.target.closest('[data-open]'); if(open){openModal(open.dataset.open);return;}
  const filter=e.target.closest('[data-filter]'); if(filter){state.categoryFilter=filter.dataset.filter;$$('#categoryFilters .chip').forEach(x=>x.classList.toggle('active',x===filter));renderCategories();return;}
  const editSource=e.target.closest('[data-edit-source]'); if(editSource){openModal('balance',editSource.dataset.editSource);return;}
  const deleteSource=e.target.closest('[data-delete-source]'); if(deleteSource&&confirm('Remove this balance source? Existing transaction history is kept.')){try{await deleteDoc(doc(db,...userPath('balanceSources',deleteSource.dataset.deleteSource)));toast('Balance source removed');}catch(err){showError(err,'Remove source failed');}return;}
  const editCategory=e.target.closest('[data-edit-category]'); if(editCategory){openModal('category',editCategory.dataset.editCategory);return;}
  const addLineBtn=e.target.closest('[data-add-line]'); if(addLineBtn){openModal('line',addLineBtn.dataset.addLine);return;}
  const removeLineBtn=e.target.closest('[data-remove-line]'); if(removeLineBtn){await removeLine(removeLineBtn.dataset.removeLine,removeLineBtn.dataset.line);return;}
  const deleteCategory=e.target.closest('[data-delete-category]'); if(deleteCategory&&confirm('Remove this category? Existing history is kept.')){try{await deleteDoc(doc(db,...userPath('categories',deleteCategory.dataset.deleteCategory)));toast('Category removed');}catch(err){showError(err,'Remove category failed');}return;}
  const editBudget=e.target.closest('[data-edit-budget]'); if(editBudget){openModal('budget',editBudget.dataset.editBudget);return;}
  const deleteBudget=e.target.closest('[data-delete-budget]'); if(deleteBudget&&confirm('Remove this monthly budget item? Existing linked expenses remain in history.')){try{await deleteDoc(doc(db,...userPath('budgets',deleteBudget.dataset.deleteBudget)));toast('Budget removed');}catch(err){showError(err,'Remove budget failed');}return;}
  const editDebt=e.target.closest('[data-edit-debt]'); if(editDebt){openModal('debt',editDebt.dataset.editDebt);return;}
  const payDebtBtn=e.target.closest('[data-pay-debt]'); if(payDebtBtn){openModal('payDebt',payDebtBtn.dataset.payDebt);return;}
  const deleteDebt=e.target.closest('[data-delete-debt]'); if(deleteDebt&&confirm('Remove this debt item? Payment history is kept.')){try{await deleteDoc(doc(db,...userPath('debts',deleteDebt.dataset.deleteDebt)));toast('Debt removed');}catch(err){showError(err,'Remove debt failed');}return;}
  const toggle=e.target.closest('[data-toggle-bill]'); if(toggle){await toggleBill(toggle.dataset.toggleBill);return;}
  const deleteBill=e.target.closest('[data-delete-bill]'); if(deleteBill&&confirm('Remove this recurring bill?')){try{await deleteDoc(doc(db,...userPath('bills',deleteBill.dataset.deleteBill)));toast('Bill removed');}catch(err){showError(err,'Remove bill failed');}return;}
  const delExpense=e.target.closest('[data-delete-expense]'); if(delExpense){await deleteExpense(delExpense.dataset.deleteExpense);return;}
  const saveSourceBtn=e.target.closest('[data-save-source]'); if(saveSourceBtn){await saveSource(saveSourceBtn.dataset.saveSource);return;}
  const saveCategoryBtn=e.target.closest('[data-save-category]'); if(saveCategoryBtn){await saveCategory(saveCategoryBtn.dataset.saveCategory);return;}
  const saveLineBtn=e.target.closest('[data-save-line]'); if(saveLineBtn){await addLine(saveLineBtn.dataset.saveLine);return;}
  const saveBudgetBtn=e.target.closest('[data-save-budget]'); if(saveBudgetBtn){await saveBudget(saveBudgetBtn.dataset.saveBudget);return;}
  const saveDebtBtn=e.target.closest('[data-save-debt]'); if(saveDebtBtn){await saveDebt(saveDebtBtn.dataset.saveDebt);return;}
  const applyDebt=e.target.closest('[data-apply-debt]'); if(applyDebt){await payDebt(applyDebt.dataset.applyDebt);return;}
  if(e.target.closest('[data-save-bill]')){await saveBill();return;}
});

showView('loading');
