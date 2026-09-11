# Wallet Chronicle — Firebase-ready PWA

This build replaces the static preview with a real Firebase-backed frontend. It has **no preloaded categories**. Categories and optional line items are created manually inside the app.

## Included

- Email/password Firebase Authentication
- Cloud Firestore persistence scoped under each authenticated user's UID
- Manual category + line-item creation
- Monthly starting budget
- Optional per-category budgets
- Optional per-line-item budgets
- Quick expense entry
- Real-time dashboard calculations
- Green / yellow / red budget alerts (yellow at 85%, red at 100%+)
- Recurring bill templates with monthly Paid/Unpaid status
- Monthly checklist resets naturally because each month has independent status documents
- Debt balances + payment entry + payoff progress
- Month history
- PWA manifest, icons and static service-worker cache
- Firestore rules file

## 1. Firebase Console setup

1. Create a Firebase project.
2. Add a **Web App**.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Create **Cloud Firestore**.
5. Open **Project settings → Your apps → SDK setup and configuration**.
6. Copy the Firebase config values into `firebase-config.js`.

Example:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

Do not add a server Admin SDK private key to this repository.

## 2. Firestore rules

Copy the contents of `firestore.rules` into:

**Firebase Console → Firestore Database → Rules**

Then publish the rules.

The supplied rule allows a signed-in user to access only documents below their own:

`users/{uid}/...`

## 3. GitHub Pages

Upload these files to the repository root:

```text
index.html
styles.css
app.js
firebase-config.js
manifest.webmanifest
sw.js
firestore.rules
README.md
icons/
```

Then enable:

**GitHub repository → Settings → Pages → Deploy from a branch → main → / (root)**

## 4. Firebase Authentication authorized domain

After GitHub Pages gives you a public URL, open:

**Firebase Console → Authentication → Settings → Authorized domains**

Ensure your GitHub Pages hostname is authorized, for example:

`yourusername.github.io`

## Firestore structure

```text
users/{uid}/
  categories/{categoryId}
  months/{YYYY-MM}
  transactions/{transactionId}
  billTemplates/{billId}
  monthlyBillStatus/{YYYY-MM_billId}
  debts/{debtId}
  debtPayments/{paymentId}
```

### Category document

```text
name
icon
lineItems[]
```

### Month document

```text
startingBudget
categoryBudgets { categoryId: amount }
lineItemBudgets { "categoryId::lineItem": amount }
```

### Expense document

```text
type: "expense"
categoryId
categoryName
lineItem
amount
date
month
createdAt
```

## Important boundary

Firebase Web configuration values may be present in frontend code. Security must come from Firebase Authentication and Firestore Security Rules. Never put Firebase Admin SDK credentials, service-account JSON, passwords, or other server secrets in this repository.
