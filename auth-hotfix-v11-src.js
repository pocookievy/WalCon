import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, setPersistence, browserLocalPersistence,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  writeBatch, serverTimestamp, arrayUnion
} from 'firebase/firestore';

const TEMPLATE_VERSION = 11;
const app = initializeApp(firebaseConfig, 'walcon-auth-hotfix-v11');
const auth = getAuth(app);
const db = getFirestore(app);

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

const $ = s => document.querySelector(s);
function authMessage(message){const el=$('#authMessage');if(el)el.textContent=message;}
function busy(value){for(const selector of ['#loginBtn','#signupBtn','#forgotPasswordBtn']){const el=$(selector);if(el)el.disabled=value;}}
function friendly(error){const code=String(error?.code||'');if(code.includes('email-already-in-use'))return 'This email already has an account. Use Log In.';if(code.includes('invalid-credential')||code.includes('user-not-found')||code.includes('wrong-password'))return 'Email or password is incorrect.';if(code.includes('invalid-email'))return 'Enter a valid email address.';if(code.includes('weak-password'))return 'Password must be at least 6 characters.';if(code.includes('too-many-requests'))return 'Too many attempts. Wait briefly and try again.';if(code.includes('network-request-failed'))return 'Network error. Check your connection.';return error?.message||'Authentication failed.';}

async function seedTemplate(user){
  const base=['users',user.uid];
  const systemRef=doc(db,...base,'settings','system');
  const systemSnap=await getDoc(systemRef);
  const sys=systemSnap.exists()?systemSnap.data():{};
  const current=Number(sys.defaultTemplateVersion||0);
  if(current>=TEMPLATE_VERSION)return;

  const [catsSnap,sourcesSnap]=await Promise.all([
    getDocs(collection(db,...base,'categories')),
    getDocs(collection(db,...base,'balanceSources'))
  ]);
  const existingCats=new Set(catsSnap.docs.map(d=>d.id));
  const existingSources=new Set(sourcesSnap.docs.map(d=>d.id));
  const deletedCats=new Set(Array.isArray(sys.deletedDefaultCategoryIds)?sys.deletedDefaultCategoryIds:[]);
  const deletedSources=new Set(Array.isArray(sys.deletedDefaultSourceIds)?sys.deletedDefaultSourceIds:[]);
  const firstInstall=!sys.defaultsInitialized || catsSnap.empty;
  const batch=writeBatch(db);

  if(firstInstall){
    for(const item of DEFAULT_CATEGORIES){
      if(existingCats.has(item.id)||deletedCats.has(item.id))continue;
      batch.set(doc(db,...base,'categories',item.id),{...item,isDefault:true,defaultTemplateVersion:TEMPLATE_VERSION,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
    for(const item of DEFAULT_SOURCES){
      if(existingSources.has(item.id)||deletedSources.has(item.id))continue;
      batch.set(doc(db,...base,'balanceSources',item.id),{...item,isDefault:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
  }

  batch.set(systemRef,{
    defaultsInitialized:true,
    defaultTemplateVersion:TEMPLATE_VERSION,
    defaultTemplateName:'WalCon Default Finance Template',
    defaultTemplateInstalledAt:serverTimestamp()
  },{merge:true});
  await batch.commit();
}

async function markDeleted(kind,id){
  const user=auth.currentUser;if(!user)return;
  const systemRef=doc(db,'users',user.uid,'settings','system');
  const field=kind==='source'?'deletedDefaultSourceIds':'deletedDefaultCategoryIds';
  await setDoc(systemRef,{[field]:arrayUnion(id),updatedAt:serverTimestamp()},{merge:true});
}

async function login(){
  const email=$('#authEmail')?.value.trim()||'';
  const password=$('#authPassword')?.value||'';
  if(!email||!password){authMessage('Enter email and password.');return;}
  busy(true);authMessage('Signing in…');
  try{
    const result=await signInWithEmailAndPassword(auth,email,password);
    await seedTemplate(result.user);
    authMessage('Signed in. Loading WalCon…');
    sessionStorage.setItem('walcon-auth-hotfix-v11',result.user.uid);
    location.reload();
  }catch(error){authMessage(friendly(error));busy(false);}
}

async function signup(){
  const email=$('#authEmail')?.value.trim()||'';
  const password=$('#authPassword')?.value||'';
  if(!email||!password){authMessage('Enter email and password.');return;}
  busy(true);authMessage('Creating account…');
  try{
    const result=await createUserWithEmailAndPassword(auth,email,password);
    await seedTemplate(result.user);
    authMessage('Account created. Loading WalCon…');
    sessionStorage.setItem('walcon-auth-hotfix-v11',result.user.uid);
    location.reload();
  }catch(error){authMessage(friendly(error));busy(false);}
}

async function resetPassword(){
  const email=$('#authEmail')?.value.trim()||'';
  if(!email){authMessage('Enter your email first.');return;}
  busy(true);
  try{await sendPasswordResetEmail(auth,email);authMessage('Password reset email sent.');}
  catch(error){authMessage(friendly(error));}
  finally{busy(false);}
}

function installForgotButton(){
  if($('#forgotPasswordBtn'))return;
  const msg=$('#authMessage');
  if(!msg)return;
  const button=document.createElement('button');
  button.id='forgotPasswordBtn';button.type='button';button.className='link';button.textContent='Forgot Password';
  button.style.marginTop='10px';
  msg.before(button);
  button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();resetPassword();},true);
}

async function handleDeleteCapture(event){
  const catBtn=event.target.closest?.('[data-delete-category]');
  if(catBtn){
    event.preventDefault();event.stopImmediatePropagation();
    if(!confirm('Remove this category? Existing history and budgets are kept.'))return;
    try{await markDeleted('category',catBtn.dataset.deleteCategory);await deleteDoc(doc(db,'users',auth.currentUser.uid,'categories',catBtn.dataset.deleteCategory));}
    catch(error){console.error('Category delete hotfix failed',error);}
    return;
  }
  const sourceBtn=event.target.closest?.('[data-delete-source]');
  if(sourceBtn){
    event.preventDefault();event.stopImmediatePropagation();
    if(!confirm('Remove this balance source? Existing transaction history is kept.'))return;
    try{await markDeleted('source',sourceBtn.dataset.deleteSource);await deleteDoc(doc(db,'users',auth.currentUser.uid,'balanceSources',sourceBtn.dataset.deleteSource));}
    catch(error){console.error('Balance source delete hotfix failed',error);}
  }
}

async function init(){
  await setPersistence(auth,browserLocalPersistence).catch(()=>{});
  installForgotButton();
  const loginBtn=$('#loginBtn');const signupBtn=$('#signupBtn');
  if(loginBtn){loginBtn.type='button';loginBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();login();},true);}
  if(signupBtn){signupBtn.type='button';signupBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();signup();},true);}
  $('#authPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();login();}},true);
  document.addEventListener('click',handleDeleteCapture,true);
  onAuthStateChanged(auth,async user=>{
    if(!user)return;
    try{await seedTemplate(user);}catch(error){console.error('WalCon template seed failed',error);}
    const authActive=document.querySelector('[data-view="auth"].active');
    const key=sessionStorage.getItem('walcon-auth-sync-v11');
    if(authActive&&key!==user.uid){sessionStorage.setItem('walcon-auth-sync-v11',user.uid);location.reload();}
  });
  window.WALCON_AUTH_HOTFIX_V11=true;
}

init().catch(error=>{console.error('WalCon auth hotfix failed',error);authMessage(`Authentication setup failed: ${error?.message||error}`);});
