import { firebaseConfig } from './firebase-config.js';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';

const TEMPLATE_VERSION = 2;
const TEMPLATE_NAME = 'WalCon Default Finance Template';

const DEFAULT_CATEGORIES = [
  { id:'income-primary-salary', group:'income', name:'Primary Salary', icon:'💵', lineItems:['Main Paycheck'] },
  { id:'income-side-hustles', group:'income', name:'Side Hustles', icon:'💵', lineItems:['Freelancing','Gig Work','Selling Crafts'] },
  { id:'income-investments', group:'income', name:'Investments', icon:'💵', lineItems:['Dividends','Savings Interest','Rental Income'] },
  { id:'income-other', group:'income', name:'Other Income', icon:'💵', lineItems:['Cash Gifts','Tax Refunds','Bonuses'] },

  { id:'need-housing', group:'need', name:'Housing', icon:'🏠', lineItems:['Rent / Mortgage','HOA Fees','Property Taxes'] },
  { id:'need-utilities', group:'need', name:'Utilities', icon:'⚡', lineItems:['Electricity','Water','Gas','Trash','Internet','Phone Plans'] },
  { id:'need-groceries', group:'need', name:'Groceries', icon:'🛒', lineItems:['Food','Drinks','Household Essentials'] },
  { id:'need-transportation', group:'need', name:'Transportation', icon:'🚗', lineItems:['Gas','Public Transit','Car Insurance','Parking','Basic Car Maintenance'] },
  { id:'need-healthcare', group:'need', name:'Healthcare', icon:'🩺', lineItems:['Health Insurance Premiums','Doctor Copays','Prescription Medications'] },
  { id:'need-insurance', group:'need', name:'Insurance', icon:'🛡️', lineItems:["Renter's Insurance",'Home Insurance','Life Insurance'] },

  { id:'want-dining-out', group:'want', name:'Dining Out', icon:'🍽️', lineItems:['Restaurants','Fast Food','Coffee Shops','Food Delivery Apps'] },
  { id:'want-entertainment', group:'want', name:'Entertainment', icon:'🎭', lineItems:['Movie Tickets','Concerts','Hobbies','Social Events'] },
  { id:'want-subscriptions', group:'want', name:'Subscriptions', icon:'📺', lineItems:['Streaming Services','Software','Gym Memberships'] },
  { id:'want-shopping', group:'want', name:'Shopping', icon:'🛍️', lineItems:['Clothing','Home Decor','Electronics','Personal Grooming'] },
  { id:'want-travel', group:'want', name:'Travel', icon:'✈️', lineItems:['Vacation Flights','Hotels','Holiday Trips'] },

  { id:'debt-credit-cards', group:'debt', name:'Credit Cards', icon:'💳', lineItems:['Payment'] },
  { id:'debt-student-loans', group:'debt', name:'Student Loans', icon:'🎓', lineItems:['Payment'] },
  { id:'debt-car-loans', group:'debt', name:'Car Loans', icon:'🚘', lineItems:['Payment'] },
  { id:'debt-personal-loans', group:'debt', name:'Personal Loans', icon:'📉', lineItems:['Payment'] }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function installTemplateOnce(user) {
  const systemRef = doc(db, 'users', user.uid, 'settings', 'system');
  const systemSnap = await getDoc(systemRef);
  const currentVersion = Number(systemSnap.exists() ? systemSnap.data().defaultTemplateVersion || 0 : 0);
  if (currentVersion >= TEMPLATE_VERSION) return;

  const categoriesRef = collection(db, 'users', user.uid, 'categories');
  const categoriesSnap = await getDocs(categoriesRef);
  const existingIds = new Set(categoriesSnap.docs.map(d => d.id));

  const batch = writeBatch(db);
  for (const item of DEFAULT_CATEGORIES) {
    if (existingIds.has(item.id)) continue;
    batch.set(doc(db, 'users', user.uid, 'categories', item.id), {
      ...item,
      isDefault: true,
      defaultTemplateVersion: TEMPLATE_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  batch.set(systemRef, {
    defaultsInitialized: true,
    defaultTemplateVersion: TEMPLATE_VERSION,
    defaultTemplateName: TEMPLATE_NAME,
    defaultTemplateInstalledAt: serverTimestamp()
  }, { merge: true });

  await batch.commit();
}

onAuthStateChanged(auth, user => {
  if (!user) return;
  installTemplateOnce(user).catch(error => {
    console.error('WalCon default template installation failed', error);
    window.dispatchEvent(new CustomEvent('walcon-template-error', { detail: error?.message || String(error) }));
  });
});

window.WALCON_DEFAULT_TEMPLATE = Object.freeze({
  version: TEMPLATE_VERSION,
  name: TEMPLATE_NAME,
  categories: DEFAULT_CATEGORIES.map(item => ({ ...item, lineItems:[...item.lineItems] }))
});
