import { firebaseConfig } from './firebase-config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const DEFAULT_CATEGORIES = [
  { id:'housing', name:'Housing', icon:'🏠', lineItems:['Rent / Mortgage','Maintenance'] },
  { id:'food', name:'Food & Groceries', icon:'🍽️', lineItems:['Groceries','Dining Out'] },
  { id:'transportation', name:'Transportation', icon:'🚗', lineItems:['Fuel','Public Transport'] },
  { id:'utilities', name:'Utilities', icon:'⚡', lineItems:['Electricity','Water','Internet','Phone'] },
  { id:'health', name:'Health', icon:'❤️', lineItems:['Medical','Pharmacy'] },
  { id:'personal', name:'Personal & Lifestyle', icon:'👤', lineItems:['Personal Care','Clothing'] },
  { id:'savings', name:'Savings', icon:'🏦', lineItems:['Emergency Fund','Investment'] },
  { id:'debt', name:'Debt & Installments', icon:'💳', lineItems:['Credit Card','Loan'] },
  { id:'other', name:'Other', icon:'📦', lineItems:[] }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let settings = { currencyLabel:'Rp', warningThreshold:85 };

const $ = s => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const attr = (s='') => esc(s).replace(/`/g,'&#96;');

function showMessage(message, persistent=false){
  const toast = $('#toast');
  if(toast){
    toast.textContent = message;
    toast.classList.add('show');
    if(!persistent) setTimeout(()=>toast.classList.remove('show'),2600);
  }
}

function showFirebaseError(error, context){
  console.error(context, error);
  const denied = String(error?.code||'').includes('permission-denied');
  const message = denied
    ? 'Firestore permission denied. Publish firestore.rules in Firebase Console.'
    : `${context}: ${error?.message || 'Unknown Firebase error'}`;
  showMessage(message, true);
  const banner = $('#configBanner');
  if(banner){
    banner.classList.remove('hidden');
    banner.innerHTML = `<strong>Firebase data error</strong><br>${esc(message)}`;
  }
}

const userPath = (...parts) => ['users', currentUser.uid, ...parts];

async function ensureDefaultCategories(force=false){
  if(!currentUser) return;
  const ref = collection(db, ...userPath('categories'));
  const snap = await getDocs(ref);
  if(!force && !snap.empty) return;
  const existing = new Set(snap.docs.map(d=>d.id));
  const batch = writeBatch(db);
  let count = 0;
  for(const cat of DEFAULT_CATEGORIES){
    if(existing.has(cat.id) && !force) continue;
    batch.set(doc(db, ...userPath('categories',cat.id)), {
      name:cat.name, icon:cat.icon, lineItems:cat.lineItems, isDefault:true,
      updatedAt:serverTimestamp(), createdAt:serverTimestamp()
    }, {merge:true});
    count++;
  }
  if(count) await batch.commit();
}

async function loadSettings(){
  if(!currentUser) return;
  const snap = await getDoc(doc(db, ...userPath('settings','preferences')));
  settings = {currencyLabel:'Rp',warningThreshold:85,...(snap.exists()?snap.data():{})};
}

async function renderSettings(){
  if(!currentUser) return;
  try{ await loadSettings(); }catch(error){ showFirebaseError(error,'Load settings failed'); }
  const view = document.querySelector('[data-view="settings"]');
  if(!view) return;
  view.innerHTML = `
    <div class="topbar"><div><div class="title">Settings</div><div class="subtle">Editable preferences</div></div><div></div></div>
    <div class="card">
      <div class="field" style="margin-top:0"><label>Currency label</label><input id="enhCurrency" maxlength="6" value="${attr(settings.currencyLabel||'Rp')}" /></div>
      <div class="field"><label>Budget warning threshold (%)</label><input id="enhThreshold" type="number" min="50" max="99" value="${Number(settings.warningThreshold||85)}" /></div>
      <button id="enhSaveSettings" class="btn primary full" style="margin-top:14px">Save Settings</button>
    </div>
    <div class="card list" style="margin-top:10px">
      <div class="item"><div class="grow"><div class="name">Signed in as</div><div class="meta">${esc(currentUser.email||currentUser.uid)}</div></div></div>
      <div class="item"><div class="grow"><div class="name">General default categories</div><div class="meta">Restore the standard editable categories without deleting custom categories.</div></div><button id="enhRestoreDefaults" class="btn sm">Restore</button></div>
      <div class="item"><div class="grow"><div class="name">Category editing</div><div class="meta">Use Edit on Categories to rename a category or change its line items.</div></div></div>
    </div>`;
}

function addEditButtons(){
  document.querySelectorAll('#categoryList [data-delete-category]').forEach(del=>{
    const id = del.dataset.deleteCategory;
    const parent = del.parentElement;
    if(!parent || parent.querySelector(`[data-enh-edit="${CSS.escape(id)}"]`)) return;
    const edit = document.createElement('button');
    edit.className = 'btn sm';
    edit.textContent = 'Edit';
    edit.dataset.enhEdit = id;
    parent.insertBefore(edit, del);
  });
}

const observer = new MutationObserver(()=>addEditButtons());
const categoryList = $('#categoryList');
if(categoryList) observer.observe(categoryList,{subtree:true,childList:true});

async function openEditCategory(id){
  if(!currentUser) return;
  try{
    const snap = await getDoc(doc(db, ...userPath('categories',id)));
    if(!snap.exists()) return showMessage('Category not found');
    const cat = {id,...snap.data()};
    $('#modalTitle').textContent = 'Edit Category & Line Items';
    $('#modalBody').innerHTML = `
      <div class="field"><label>Category name</label><input id="enhCatName" value="${attr(cat.name||'')}" /></div>
      <div class="field"><label>Icon / emoji</label><input id="enhCatIcon" maxlength="4" value="${attr(cat.icon||'')}" /></div>
      <div class="field"><label>Line items — one per line</label><textarea id="enhCatLines">${esc((cat.lineItems||[]).join('\n'))}</textarea></div>
      <button id="enhUpdateCategory" data-id="${id}" class="btn primary full" style="margin-top:14px">Save Changes</button>`;
    $('#modal').classList.remove('hidden');
  }catch(error){ showFirebaseError(error,'Open category failed'); }
}

async function saveNewCategory(){
  if(!currentUser) return;
  const name = $('#catName')?.value.trim();
  if(!name) return showMessage('Category name is required');
  const lineItems = ($('#catLines')?.value||'').split('\n').map(v=>v.trim()).filter(Boolean);
  try{
    await addDoc(collection(db, ...userPath('categories')), {
      name,
      icon:$('#catIcon')?.value.trim()||'',
      lineItems:[...new Set(lineItems)],
      isDefault:false,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    $('#modal').classList.add('hidden');
    $('#modalBody').innerHTML='';
    showMessage('Category saved');
  }catch(error){ showFirebaseError(error,'Save category failed'); }
}

async function updateCategory(id){
  const name = $('#enhCatName')?.value.trim();
  if(!name) return showMessage('Category name is required');
  const lineItems = ($('#enhCatLines')?.value||'').split('\n').map(v=>v.trim()).filter(Boolean);
  try{
    await updateDoc(doc(db, ...userPath('categories',id)), {
      name,
      icon:$('#enhCatIcon')?.value.trim()||'',
      lineItems:[...new Set(lineItems)],
      updatedAt:serverTimestamp()
    });
    $('#modal').classList.add('hidden');
    $('#modalBody').innerHTML='';
    showMessage('Category updated');
  }catch(error){ showFirebaseError(error,'Update category failed'); }
}

async function saveSettings(){
  const currencyLabel = ($('#enhCurrency')?.value||'Rp').trim().slice(0,6)||'Rp';
  const warningThreshold = Math.min(99,Math.max(50,Number($('#enhThreshold')?.value||85)));
  try{
    await setDoc(doc(db, ...userPath('settings','preferences')), {
      currencyLabel, warningThreshold, updatedAt:serverTimestamp()
    }, {merge:true});
    settings = {currencyLabel,warningThreshold};
    showMessage('Settings saved');
  }catch(error){ showFirebaseError(error,'Save settings failed'); }
}

document.addEventListener('click', async event=>{
  const edit = event.target.closest('[data-enh-edit]');
  if(edit){ event.preventDefault(); event.stopImmediatePropagation(); await openEditCategory(edit.dataset.enhEdit); return; }

  if(event.target.id==='saveCategory'){
    event.preventDefault(); event.stopImmediatePropagation();
    await saveNewCategory(); return;
  }
  if(event.target.id==='enhUpdateCategory'){
    event.preventDefault(); event.stopImmediatePropagation();
    await updateCategory(event.target.dataset.id); return;
  }
  if(event.target.id==='enhSaveSettings'){
    event.preventDefault(); event.stopImmediatePropagation();
    await saveSettings(); return;
  }
  if(event.target.id==='enhRestoreDefaults'){
    event.preventDefault(); event.stopImmediatePropagation();
    try{ await ensureDefaultCategories(true); showMessage('Default categories restored'); }
    catch(error){ showFirebaseError(error,'Restore defaults failed'); }
    return;
  }

  const settingsNav = event.target.closest('[data-view-go="settings"]');
  if(settingsNav) setTimeout(renderSettings,0);
}, true);

onAuthStateChanged(auth, async user=>{
  currentUser = user;
  if(!user) return;
  try{
    await ensureDefaultCategories(false);
    await loadSettings();
    setTimeout(addEditButtons,300);
  }catch(error){ showFirebaseError(error,'Default category setup failed'); }
});
