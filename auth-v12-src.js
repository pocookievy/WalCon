import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, setPersistence, browserLocalPersistence,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  initializeFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  writeBatch, serverTimestamp, arrayUnion
} from 'firebase/firestore';

const TEMPLATE_VERSION = 12;
const app = initializeApp(firebaseConfig, 'walcon-v12');
const auth = getAuth(app);
const db = initializeFirestore(app,{experimentalForceLongPolling:true,useFetchStreams:false});

const DEFAULT_CATEGORIES = [
  {id:'income-primary-salary',group:'income',name:'Primary Salary',icon:'💵',lineItems:['Main Paycheck']},
  {id:'income-side-hustles',group:'income',name:'Side Hustles',icon:'💵',lineItems:['Freelancing','Gig Work','Selling Crafts']},
  {id:'income-investments',group:'income',name:'Investments',icon:'💵',lineItems:['Dividends','Savings Interest','Rental Income']},
  {id:'income-other',group:'income',name:'Other Income',icon:'💵',lineItems:['Cash Gifts','Tax Refunds','Bonuses']},
  {id:'need-housing',group:'need',name:'Housing',icon:'🏠',lineItems:['Rent / Mortgage','HOA Fees','Property Taxes']},
  {id:'need-utilities',group:'need',name:'Utilities',icon:'⚡',lineItems:['Electricity','Water','Gas','Trash','Internet','Phone Plans']},
  {id:'need-groceries',group:'need',name:'Groceries',icon:'🛒',lineItems:['Food','Drinks','Household Essentials']},
  {id:'need-transportation',group:'need',name:'Transportation',icon:'🚗',lineItems:['Gas','Public Transit','Car Insurance','Parking','Basic Car Maintenance']},
  {id:'need-healthcare',group:'need',name:'Healthcare',icon:'🩺',lineItems:['Health Insurance Premiums','Doctor Copays','Prescription Medications']},
  {id:'need-insurance',group:'need',name:'Insurance',icon:'🛡️',lineItems:["Renter's Insurance",'Home Insurance','Life Insurance']},
  {id:'want-dining-out',group:'want',name:'Dining Out',icon:'🍽️',lineItems:['Restaurants','Fast Food','Coffee Shops','Food Delivery Apps']},
  {id:'want-entertainment',group:'want',name:'Entertainment',icon:'🎭',lineItems:['Movie Tickets','Concerts','Hobbies','Social Events']},
  {id:'want-subscriptions',group:'want',name:'Subscriptions',icon:'📺',lineItems:['Streaming Services','Software','Gym Memberships']},
  {id:'want-shopping',group:'want',name:'Shopping',icon:'🛍️',lineItems:['Clothing','Home Decor','Electronics','Personal Grooming']},
  {id:'want-travel',group:'want',name:'Travel',icon:'✈️',lineItems:['Vacation Flights','Hotels','Holiday Trips']},
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

const $=s=>document.querySelector(s);
function msg(text){const el=$('#authMessage');if(el)el.textContent=text;}
function busy(v){['#loginBtn','#signupBtn','#forgotPasswordBtn'].forEach(s=>{const el=$(s);if(el)el.disabled=v;});}
function friendly(error){const c=String(error?.code||'');if(c.includes('email-already-in-use'))return 'This email already has an account. Use Log In.';if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Email or password is incorrect.';if(c.includes('network-request-failed'))return 'Firebase network request failed. Check connectivity and retry.';if(c.includes('invalid-email'))return 'Enter a valid email address.';return error?.message||'Authentication failed.';}

async function seedDefaults(user){
  const base=['users',user.uid];
  const systemRef=doc(db,...base,'settings','system');
  let sys={};
  try{const snap=await getDoc(systemRef);sys=snap.exists()?snap.data():{};}catch(error){console.warn('System settings unavailable during seed',error);}
  if(Number(sys.defaultTemplateVersion||0)>=TEMPLATE_VERSION)return;
  let catsSnap=null,sourcesSnap=null;
  try{[catsSnap,sourcesSnap]=await Promise.all([getDocs(collection(db,...base,'categories')),getDocs(collection(db,...base,'balanceSources'))]);}
  catch(error){console.warn('Collection preflight unavailable; attempting direct seed',error);}
  const existingCats=new Set(catsSnap?.docs?.map(d=>d.id)||[]);
  const existingSources=new Set(sourcesSnap?.docs?.map(d=>d.id)||[]);
  const deletedCats=new Set(Array.isArray(sys.deletedDefaultCategoryIds)?sys.deletedDefaultCategoryIds:[]);
  const deletedSources=new Set(Array.isArray(sys.deletedDefaultSourceIds)?sys.deletedDefaultSourceIds:[]);
  const batch=writeBatch(db);
  for(const item of DEFAULT_CATEGORIES){if(!existingCats.has(item.id)&&!deletedCats.has(item.id))batch.set(doc(db,...base,'categories',item.id),{...item,isDefault:true,defaultTemplateVersion:TEMPLATE_VERSION,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});}
  for(const item of DEFAULT_SOURCES){if(!existingSources.has(item.id)&&!deletedSources.has(item.id))batch.set(doc(db,...base,'balanceSources',item.id),{...item,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});}
  batch.set(systemRef,{defaultsInitialized:true,defaultTemplateVersion:TEMPLATE_VERSION,defaultTemplateName:'WalCon Default Finance Template',updatedAt:serverTimestamp()},{merge:true});
  await batch.commit();
}

async function markDeleted(kind,id){const user=auth.currentUser;if(!user)return;const field=kind==='source'?'deletedDefaultSourceIds':'deletedDefaultCategoryIds';await setDoc(doc(db,'users',user.uid,'settings','system'),{[field]:arrayUnion(id),updatedAt:serverTimestamp()},{merge:true});}

async function login(){const email=$('#authEmail')?.value.trim()||'',password=$('#authPassword')?.value||'';if(!email||!password){msg('Enter email and password.');return;}busy(true);msg('Signing in…');try{const cred=await signInWithEmailAndPassword(auth,email,password);msg('Signed in. Loading WalCon…');seedDefaults(cred.user).catch(e=>console.warn('Template seed deferred',e));sessionStorage.setItem('walcon-v12-auth',cred.user.uid);setTimeout(()=>location.reload(),250);}catch(e){msg(friendly(e));busy(false);}}
async function signup(){const email=$('#authEmail')?.value.trim()||'',password=$('#authPassword')?.value||'';if(!email||!password){msg('Enter email and password.');return;}busy(true);msg('Creating account…');try{const cred=await createUserWithEmailAndPassword(auth,email,password);seedDefaults(cred.user).catch(e=>console.warn('Template seed deferred',e));msg('Account created. Loading WalCon…');setTimeout(()=>location.reload(),250);}catch(e){msg(friendly(e));busy(false);}}
async function reset(){const email=$('#authEmail')?.value.trim()||'';if(!email){msg('Enter your email first.');return;}busy(true);try{await sendPasswordResetEmail(auth,email);msg('Password reset email sent.');}catch(e){msg(friendly(e));}finally{busy(false);}}

function installUI(){
  const loginBtn=$('#loginBtn'),signupBtn=$('#signupBtn');
  if(loginBtn){loginBtn.type='button';loginBtn.onclick=null;loginBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();login();},true);}
  if(signupBtn){signupBtn.type='button';signupBtn.onclick=null;signupBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();signup();},true);}
  if(!$('#forgotPasswordBtn')&&$('#authMessage')){const b=document.createElement('button');b.id='forgotPasswordBtn';b.type='button';b.className='link';b.textContent='Forgot Password';b.style.marginTop='10px';$('#authMessage').before(b);b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();reset();},true);}
  $('#authPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login();}},true);
  document.addEventListener('click',async e=>{
    const c=e.target.closest?.('[data-delete-category]');if(c){try{await markDeleted('category',c.dataset.deleteCategory);}catch(err){console.warn(err);}return;}
    const s=e.target.closest?.('[data-delete-source]');if(s){try{await markDeleted('source',s.dataset.deleteSource);}catch(err){console.warn(err);}}
  },true);
}

async function init(){await setPersistence(auth,browserLocalPersistence).catch(()=>{});installUI();onAuthStateChanged(auth,user=>{if(user)seedDefaults(user).catch(e=>console.warn('Deferred default seed',e));});window.WALCON_V12_AUTH_READY=true;}
init().catch(e=>{console.error(e);msg(`Authentication setup failed: ${e?.message||e}`);});
