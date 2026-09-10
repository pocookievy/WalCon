import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot,
  query, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const currency = n => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID');
const monthKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const todayISO = () => new Date().toISOString().slice(0,10);
const uidPath = (...parts) => ['users', state.user.uid, ...parts];
const configReady = Object.values(firebaseConfig).every(v => v && !String(v).includes('REPLACE_ME'));

const state = {
  user:null, db:null, auth:null, month:monthKey(), categories:[], transactions:[], bills:[], billStatus:[], debts:[], monthDoc:null,
  unsubs:[], currentView:'dashboard'
};

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)}
function showView(name){state.currentView=name;$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));$$('.nav[data-view-go]').forEach(n=>n.classList.toggle('active',n.dataset.viewGo===name));$('#bottomNav').classList.toggle('hidden',name==='auth'||name==='loading');$('#app').scrollTop=0;if(name==='history')loadHistory();}
function emptyHTML(text){return `<div class="empty">${text}</div>`}
function progressClass(percent){return percent>=100?'over':percent>=85?'warn':''}
function statusFor(budget,spent){if(!budget)return {text:'No budget',cls:'warn'};const remain=budget-spent;const pct=(spent/budget)*100;if(remain<0)return{text:`Over ${currency(Math.abs(remain))}`,cls:'over'};if(pct>=85)return{text:`Left ${currency(remain)}`,cls:'warn'};return{text:`Left ${currency(remain)}`,cls:'ok'};}
function iconFor(name){const chars='●◆■▲✦';let h=0;for(const c of name)h=(h+c.charCodeAt(0))%chars.length;return chars[h]}
function monthLabel(m){const [y,mo]=m.split('-').map(Number);return new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1));}
function categoryById(id){return state.categories.find(c=>c.id===id)}
function lineKey(catId,line){return `${catId}::${line}`}
function txForMonth(m=state.month){return state.transactions.filter(t=>t.month===m && t.type==='expense')}
function spentForCategory(catId,m=state.month){return txForMonth(m).filter(t=>t.categoryId===catId).reduce((a,t)=>a+Number(t.amount||0),0)}
function spentForLine(catId,line,m=state.month){return txForMonth(m).filter(t=>t.categoryId===catId && (t.lineItem||'')===line).reduce((a,t)=>a+Number(t.amount||0),0)}

if(!configReady){$('#configBanner').classList.remove('hidden');showView('auth');$('#authMessage').textContent='Configure firebase-config.js before login will work.';} else {boot();}

function boot(){
  const app=initializeApp(firebaseConfig);
  state.auth=getAuth(app);
  try{state.db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}catch{state.db=getFirestore(app);}
  onAuthStateChanged(state.auth, async user=>{
    clearListeners();state.user=user;
    if(!user){showView('auth');return;}
    $('#settingsEmail').textContent=user.email||user.uid;$('#avatar').textContent=(user.email||'W').slice(0,1).toUpperCase();
    state.month=monthKey();syncMonthInputs();subscribeUserData();showView('dashboard');
  });
}

function syncMonthInputs(){['#budgetMonth','#billMonth','#historyMonth'].forEach(s=>{$(s).value=state.month});$('#monthLabel').textContent=monthLabel(state.month)}
function clearListeners(){state.unsubs.forEach(u=>u&&u());state.unsubs=[]}
function subscribeUserData(){
  const cats=collection(state.db,...uidPath('categories'));
  const tx=collection(state.db,...uidPath('transactions'));
  const bills=collection(state.db,...uidPath('billTemplates'));
  const status=collection(state.db,...uidPath('monthlyBillStatus'));
  const debts=collection(state.db,...uidPath('debts'));
  const mdoc=doc(state.db,...uidPath('months',state.month));
  state.unsubs.push(onSnapshot(cats,s=>{state.categories=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));renderAll()}));
  state.unsubs.push(onSnapshot(query(tx,where('month','==',state.month)),s=>{state.transactions=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  state.unsubs.push(onSnapshot(bills,s=>{state.bills=s.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.active!==false).sort((a,b)=>(a.dueDay||99)-(b.dueDay||99));renderBills()}));
  state.unsubs.push(onSnapshot(query(status,where('month','==',state.month)),s=>{state.billStatus=s.docs.map(d=>({id:d.id,...d.data()}));renderBills();renderDashboard()}));
  state.unsubs.push(onSnapshot(debts,s=>{state.debts=s.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.active!==false);renderDebts()}));
  state.unsubs.push(onSnapshot(mdoc,s=>{state.monthDoc=s.exists()?s.data():null;renderAll()}));
}
function resubscribeMonth(){clearListeners();subscribeUserData();syncMonthInputs();}
function renderAll(){renderDashboard();renderBudgets();renderCategories();renderBills();renderDebts();}

function renderDashboard(){
  if(!state.user)return;
  const start=Number(state.monthDoc?.startingBudget||0);const spent=txForMonth().reduce((a,t)=>a+Number(t.amount||0),0);const remain=start-spent;
  $('#dashBudget').textContent=currency(start);$('#dashSpent').textContent=currency(spent);$('#dashRemaining').textContent=currency(remain);
  const unpaid=state.bills.filter(b=>!state.billStatus.find(s=>s.templateId===b.id)?.paid).length;$('#dashUnpaid').textContent=unpaid;
  const ds=$('#dashStatus');ds.className='pill '+(remain<0?'red':start&&spent/start>=.85?'yellow':'green');ds.textContent=remain<0?`Over ${currency(Math.abs(remain))}`:start?`${currency(remain)} left`:'Set monthly budget';
  const cb=state.monthDoc?.categoryBudgets||{};
  $('#dashboardCategories').innerHTML=state.categories.length?state.categories.map(c=>{const spentCat=spentForCategory(c.id);const budget=Number(cb[c.id]||0);const st=statusFor(budget,spentCat);return `<div class="item"><div class="ic">${c.icon||iconFor(c.name)}</div><div class="grow"><div class="name">${esc(c.name)}</div><div class="meta">${currency(spentCat)} spent${budget?` of ${currency(budget)}`:''}</div></div><div class="money ${st.cls==='over'?'red':st.cls==='warn'?'yellow':'green'}">${st.text}</div></div>`}).join(''):emptyHTML('No categories yet. Open Categories and add your own.');
  const recent=[...txForMonth()].sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt)).slice(0,5);
  $('#recentExpenses').innerHTML=recent.length?recent.map(t=>`<div class="item"><div class="ic">${categoryById(t.categoryId)?.icon||'−'}</div><div class="grow"><div class="name">${esc(t.lineItem||t.categoryName||'Expense')}</div><div class="meta">${esc(t.categoryName||'Category')} • ${esc(t.date||state.month)}</div></div><div class="money red">− ${currency(t.amount)}</div></div>`).join(''):emptyHTML('No expenses for this month.');
}

function renderBudgets(){
  if(!state.user)return;
  const start=Number(state.monthDoc?.startingBudget||0);const spent=txForMonth().reduce((a,t)=>a+Number(t.amount||0),0);const left=start-spent;const cb=state.monthDoc?.categoryBudgets||{};let alerts=0;
  $('#budgetTotalLabel').textContent=currency(start);$('#budgetSpentLabel').textContent=currency(spent);$('#budgetLeftLabel').textContent=currency(left);
  const html=state.categories.map(c=>{const budget=Number(cb[c.id]||0);const sc=spentForCategory(c.id);const pct=budget?Math.round(sc/budget*100):0;const st=statusFor(budget,sc);if(st.cls!=='ok'&&budget)alerts++;const lineBudgets=state.monthDoc?.lineItemBudgets||{};const lines=(c.lineItems||[]).map(line=>{const lb=Number(lineBudgets[lineKey(c.id,line)]||0),ls=spentForLine(c.id,line),lr=lb-ls;return `<div class="line-budget"><div><div class="name">${esc(line)}</div><div class="meta">Spent ${currency(ls)}${lb?` • Budget ${currency(lb)}`:''}</div></div><div class="money ${lr<0?'red':'green'}">${lb?(lr<0?`Over ${currency(Math.abs(lr))}`:`Left ${currency(lr)}`):'No budget'}</div></div>`}).join('');return `<div class="card budget-card"><div class="budget-top"><div><div class="name">${c.icon||iconFor(c.name)} ${esc(c.name)}</div><div class="meta">${currency(sc)} spent${budget?` of ${currency(budget)}`:''}</div></div><span class="tag ${st.cls}">${st.text}</span></div><div class="progress ${progressClass(pct)}"><i style="width:${Math.min(pct,100)}%"></i></div>${lines?`<div class="separator"></div>${lines}`:''}</div>`}).join('');
  $('#budgetAlertLabel').textContent=alerts;$('#budgetCards').innerHTML=html||emptyHTML('Add categories first, then assign optional budgets.');
}

function renderCategories(){
  const el=$('#categoryList');
  el.innerHTML=state.categories.length?state.categories.map(c=>`<div class="card"><div class="budget-top"><div><div class="name">${c.icon||iconFor(c.name)} ${esc(c.name)}</div><div class="meta">${(c.lineItems||[]).length?esc((c.lineItems||[]).join(' • ')):'No line items'}</div></div><button class="btn sm danger" data-delete-category="${c.id}">Delete</button></div></div>`).join(''):emptyHTML('No default categories. Use + to create categories and optional line items manually.');
}

function renderBills(){
  if(!state.user)return;const el=$('#billList');
  el.innerHTML=state.bills.length?state.bills.map(b=>{const st=state.billStatus.find(s=>s.templateId===b.id);return `<div class="item"><div class="ic">✓</div><div class="grow"><div class="name">${esc(b.name)}</div><div class="meta">${b.dueDay?`Due day ${b.dueDay}`:'No due day'}${b.amount?` • ${currency(b.amount)}`:''}</div></div><button class="check ${st?.paid?'on':''}" data-bill-toggle="${b.id}" aria-label="Paid"><i></i></button></div>`}).join(''):emptyHTML('No bills yet. Add recurring bill templates with +.');
}

function renderDebts(){
  if(!state.user)return;const total=state.debts.reduce((a,d)=>a+Number(d.currentBalance||0),0);$('#debtTotal').textContent=currency(total);
  $('#debtList').innerHTML=state.debts.length?state.debts.map(d=>{const original=Number(d.originalBalance||0),current=Number(d.currentBalance||0),paid=Math.max(0,original-current),pct=original?Math.min(100,Math.round(paid/original*100)):0;return `<div class="card budget-card"><div class="budget-top"><div><div class="name">${esc(d.name)}</div><div class="meta">${pct}% paid off</div></div><button class="btn sm" data-debt-pay="${d.id}">Add payment</button></div><div class="progress"><i style="width:${pct}%"></i></div><div class="debt-grid"><div class="debt-stat">Original<strong>${currency(original)}</strong></div><div class="debt-stat">Paid<strong>${currency(paid)}</strong></div><div class="debt-stat">Remaining<strong>${currency(current)}</strong></div></div></div>`}).join(''):emptyHTML('No debts yet. Add one with +.');
}

async function loadHistory(){
  if(!state.user)return;const m=$('#historyMonth').value||state.month;const txSnap=await getDocs(query(collection(state.db,...uidPath('transactions')),where('month','==',m)));const txs=txSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.type==='expense').sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt));const md=await getDoc(doc(state.db,...uidPath('months',m)));const start=Number(md.exists()?md.data().startingBudget||0:0);const spent=txs.reduce((a,t)=>a+Number(t.amount||0),0);const left=start-spent;$('#historySummary').innerHTML=`<div class="subtle">${monthLabel(m)}</div><div class="big sm">${currency(left)}</div><div class="kpis"><div class="kpi"><div class="subtle">Budget</div><div class="v">${currency(start)}</div></div><div class="kpi"><div class="subtle">Spent</div><div class="v">${currency(spent)}</div></div><div class="kpi"><div class="subtle">Status</div><div class="v">${left<0?'Over':'Left'}</div></div></div>`;$('#historyList').innerHTML=txs.length?txs.map(t=>`<div class="item"><div class="ic">−</div><div class="grow"><div class="name">${esc(t.lineItem||t.categoryName||'Expense')}</div><div class="meta">${esc(t.categoryName||'Category')} • ${esc(t.date||m)}</div></div><div class="money red">− ${currency(t.amount)}</div></div>`).join(''):emptyHTML('No expense history for this month.');
}

function openModal(type,extra={}){
  const body=$('#modalBody');const title=$('#modalTitle');
  if(type==='category'){
    title.textContent='Add Category';body.innerHTML=`<div class="field"><label>Category name</label><input id="catName" placeholder="e.g. Food & Daily" /></div><div class="field"><label>Icon / emoji (optional)</label><input id="catIcon" placeholder="e.g. 🍜" maxlength="4" /></div><div class="field"><label>Line items (optional, one per line)</label><textarea id="catLines" placeholder="Groceries\nDining\nCoffee"></textarea></div><button id="saveCategory" class="btn primary full" style="margin-top:14px">Save Category</button>`;
  }else if(type==='expense'){
    title.textContent='Quick Expense';body.innerHTML=`<div class="field"><label>Category</label><select id="expenseCategory"><option value="">Select category</option>${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Line item</label><select id="expenseLine"><option value="">Optional</option></select></div><div class="field"><label>Amount</label><input id="expenseAmount" inputmode="numeric" type="number" min="0" placeholder="150000" /></div><div class="field"><label>Date</label><input id="expenseDate" type="date" value="${todayISO()}" /></div><button id="saveExpense" class="btn primary full" style="margin-top:14px">Save Expense</button>`;
  }else if(type==='budgetSetup'){
    const cb=state.monthDoc?.categoryBudgets||{},lb=state.monthDoc?.lineItemBudgets||{};
    title.textContent='Budget Setup';body.innerHTML=`<div class="field"><label>Starting amount</label><input id="startBudget" type="number" min="0" value="${Number(state.monthDoc?.startingBudget||0)}" /></div><div class="separator"></div>${state.categories.map(c=>`<div class="card" style="margin-top:8px"><div class="name">${c.icon||iconFor(c.name)} ${esc(c.name)}</div><div class="field"><label>Category budget (optional)</label><input class="catBudgetInput" data-cat-budget="${c.id}" type="number" min="0" value="${Number(cb[c.id]||0)}" /></div>${(c.lineItems||[]).map(line=>`<div class="field"><label>${esc(line)} budget (optional)</label><input class="lineBudgetInput" data-cat="${c.id}" data-line="${attr(line)}" type="number" min="0" value="${Number(lb[lineKey(c.id,line)]||0)}" /></div>`).join('')}</div>`).join('')||emptyHTML('Add categories before assigning category budgets.')}<button id="saveBudget" class="btn primary full" style="margin-top:14px">Save Monthly Budget</button>`;
  }else if(type==='bill'){
    title.textContent='Add Bill Template';body.innerHTML=`<div class="field"><label>Bill name</label><input id="billName" placeholder="Internet, electricity, insurance…" /></div><div class="row2"><div class="field"><label>Expected amount</label><input id="billAmount" type="number" min="0" /></div><div class="field"><label>Due day</label><input id="billDue" type="number" min="1" max="31" /></div></div><button id="saveBill" class="btn primary full" style="margin-top:14px">Save Bill</button>`;
  }else if(type==='debt'){
    title.textContent='Add Debt';body.innerHTML=`<div class="field"><label>Debt name</label><input id="debtName" placeholder="Loan or creditor" /></div><div class="field"><label>Original balance</label><input id="debtOriginal" type="number" min="0" /></div><div class="field"><label>Current remaining balance</label><input id="debtCurrent" type="number" min="0" /></div><button id="saveDebt" class="btn primary full" style="margin-top:14px">Save Debt</button>`;
  }else if(type==='debtPay'){
    const d=state.debts.find(x=>x.id===extra.id);title.textContent=`Payment — ${d?.name||'Debt'}`;body.innerHTML=`<div class="field"><label>Payment amount</label><input id="debtPaymentAmount" type="number" min="0" /></div><div class="small" style="margin-top:8px">Current remaining: ${currency(d?.currentBalance||0)}</div><button class="btn primary full" id="saveDebtPayment" data-id="${extra.id}" style="margin-top:14px">Apply Payment</button>`;
  }
  $('#modal').classList.remove('hidden');
}
function closeModal(){$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}

async function saveCategory(){const name=$('#catName').value.trim();if(!name)return toast('Category name required');const lines=$('#catLines').value.split('\n').map(s=>s.trim()).filter(Boolean);await addDoc(collection(state.db,...uidPath('categories')),{name,icon:$('#catIcon').value.trim(),lineItems:[...new Set(lines)],createdAt:serverTimestamp()});closeModal();toast('Category saved')}
async function saveExpense(){const cat=categoryById($('#expenseCategory').value);const amount=Number($('#expenseAmount').value);if(!cat||!amount)return toast('Choose category and amount');const date=$('#expenseDate').value||todayISO();const m=date.slice(0,7);await addDoc(collection(state.db,...uidPath('transactions')),{type:'expense',categoryId:cat.id,categoryName:cat.name,lineItem:$('#expenseLine').value||'',amount,date,month:m,createdAt:serverTimestamp()});closeModal();toast('Expense saved');if(m!==state.month)toast('Saved to '+monthLabel(m))}
async function saveBudget(){const categoryBudgets={};$$('.catBudgetInput').forEach(i=>{if(Number(i.value)>0)categoryBudgets[i.dataset.catBudget]=Number(i.value)});const lineItemBudgets={};$$('.lineBudgetInput').forEach(i=>{if(Number(i.value)>0)lineItemBudgets[lineKey(i.dataset.cat,i.dataset.line)]=Number(i.value)});await setDoc(doc(state.db,...uidPath('months',state.month)),{startingBudget:Number($('#startBudget').value||0),categoryBudgets,lineItemBudgets,updatedAt:serverTimestamp()},{merge:true});closeModal();toast('Budget saved')}
async function saveBill(){const name=$('#billName').value.trim();if(!name)return toast('Bill name required');await addDoc(collection(state.db,...uidPath('billTemplates')),{name,amount:Number($('#billAmount').value||0),dueDay:Number($('#billDue').value||0)||null,active:true,createdAt:serverTimestamp()});closeModal();toast('Bill saved')}
async function saveDebt(){const name=$('#debtName').value.trim();const original=Number($('#debtOriginal').value||0);const current=Number($('#debtCurrent').value||original);if(!name||!original)return toast('Name and original balance required');await addDoc(collection(state.db,...uidPath('debts')),{name,originalBalance:original,currentBalance:current,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});closeModal();toast('Debt saved')}
async function saveDebtPayment(id){const d=state.debts.find(x=>x.id===id),amt=Number($('#debtPaymentAmount').value||0);if(!d||!amt)return toast('Payment amount required');const next=Math.max(0,Number(d.currentBalance||0)-amt);await updateDoc(doc(state.db,...uidPath('debts',id)),{currentBalance:next,updatedAt:serverTimestamp()});await addDoc(collection(state.db,...uidPath('debtPayments')),{debtId:id,debtName:d.name,amount:amt,date:todayISO(),month:monthKey(),createdAt:serverTimestamp()});closeModal();toast('Payment applied')}
async function toggleBill(id){const current=state.billStatus.find(s=>s.templateId===id);const ref=doc(state.db,...uidPath('monthlyBillStatus',`${state.month}_${id}`));await setDoc(ref,{templateId:id,month:state.month,paid:!current?.paid,paidAt:!current?.paid?serverTimestamp():null,updatedAt:serverTimestamp()},{merge:true});}

function timeOf(ts){return ts?.toMillis?ts.toMillis():0}
function esc(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function attr(s=''){return esc(s).replace(/`/g,'&#96;')}

$('#loginBtn').onclick=async()=>{if(!configReady)return;$('#authMessage').textContent='';try{await signInWithEmailAndPassword(state.auth,$('#authEmail').value.trim(),$('#authPassword').value)}catch(e){$('#authMessage').textContent=e.message}}
$('#signupBtn').onclick=async()=>{if(!configReady)return;$('#authMessage').textContent='';try{await createUserWithEmailAndPassword(state.auth,$('#authEmail').value.trim(),$('#authPassword').value)}catch(e){$('#authMessage').textContent=e.message}}
$('#logoutBtn').onclick=()=>signOut(state.auth)
$('#modalClose').onclick=closeModal
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()})
document.addEventListener('click',async e=>{
  const go=e.target.closest('[data-view-go]');if(go){showView(go.dataset.viewGo);return}
  const op=e.target.closest('[data-open]');if(op){openModal(op.dataset.open);return}
  const del=e.target.closest('[data-delete-category]');if(del){if(confirm('Delete this category? Existing history remains.'))await deleteDoc(doc(state.db,...uidPath('categories',del.dataset.deleteCategory)));return}
  const bill=e.target.closest('[data-bill-toggle]');if(bill){await toggleBill(bill.dataset.billToggle);return}
  const pay=e.target.closest('[data-debt-pay]');if(pay){openModal('debtPay',{id:pay.dataset.debtPay});return}
  if(e.target.id==='saveCategory')await saveCategory();
  if(e.target.id==='saveExpense')await saveExpense();
  if(e.target.id==='saveBudget')await saveBudget();
  if(e.target.id==='saveBill')await saveBill();
  if(e.target.id==='saveDebt')await saveDebt();
  if(e.target.id==='saveDebtPayment')await saveDebtPayment(e.target.dataset.id);
})
document.addEventListener('change',e=>{
  if(e.target.id==='expenseCategory'){const c=categoryById(e.target.value);$('#expenseLine').innerHTML='<option value="">Optional</option>'+((c?.lineItems||[]).map(x=>`<option value="${attr(x)}">${esc(x)}</option>`).join(''))}
  if(e.target.id==='budgetMonth'){state.month=e.target.value||monthKey();resubscribeMonth()}
  if(e.target.id==='billMonth'){state.month=e.target.value||monthKey();resubscribeMonth()}
  if(e.target.id==='historyMonth')loadHistory();
})
addEventListener('online',()=>{$('#networkState').textContent='online'});addEventListener('offline',()=>{$('#networkState').textContent='offline'});$('#networkState').textContent=navigator.onLine?'online':'offline';
