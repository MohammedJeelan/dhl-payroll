# Manifest — DHL EX Payroll

React + Firestore admin tool: log in, upload the monthly DHL Express salary
sheet, see it parsed and saved to Firestore. Sending payslips as PDF by
email is intentionally not built yet — this covers upload + view only.

## 1. Install and run

```bash
npm install
npm run dev
```

## 2. Connect it to your Firebase project (`vilcarterp`)

Open `src/firebase.js` and paste in your real config:

1. Go to the [Firebase console](https://console.firebase.google.com) → **vilcarterp** project.
2. ⚙️ **Project settings** → **General** tab → scroll to **Your apps**.
3. If there's no **Web app** listed yet, click **Add app → Web (`</>`)**, give it any nickname, skip hosting.
4. Copy the `firebaseConfig` object it shows you and paste the values into
   `src/firebase.js`, replacing the placeholders (`apiKey`, `messagingSenderId`, `appId`).
   `authDomain`, `projectId` and `storageBucket` are already filled in based on
   your project ID (`vilcarterp-7ae7f`) — double check they match.

## 3. Firestore security rules

Right now the app reads/writes Firestore directly from the browser with no
Firebase Auth session (login is done by checking the `dhlExpressUsers`
collection's `email`/`password` fields directly, matching how that collection
is already structured). That means your Firestore rules need to allow it,
e.g. for a quick start (lock this down properly before going to production):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /dhlExpressUsers/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /salaryUploads/{doc} {
      allow read, write: if true;
    }
  }
}
```

⚠️ Storing plaintext passwords in `dhlExpressUsers` and leaving that
collection open to public read (needed so the login screen can check
credentials without Firebase Auth) isn't secure for anything beyond an
internal prototype. Worth switching to real Firebase Authentication
(`signInWithEmailAndPassword`) plus locked-down rules once this moves past
a first pass.

## 4. Log in

Use one of the documents already in `dhlExpressUsers`, e.g. from your
screenshot: `jeelan@vilcart.com` / `000000`.

## 5. Upload a sheet

Go to **Upload sheet**, drop in the `DHL_SALARY_AUG_2026` workbook. It reads
every sheet name in the file — pick the one that's the actual salary sheet
(e.g. "AUG 2026"; unrelated attendance sheets in the same workbook, like
"NOV-19", will parse to 0 rows and show an error, which is expected). Once
parsed you'll see a stats strip and a preview table — click **Save to
Firestore** to write it to a new `salaryUploads` collection.

## 6. View uploaded data

**Uploaded data** in the sidebar lists every saved upload; click one to see
its full employee table. The mail icon next to each row is a placeholder for
the "email this employee their payslip as PDF" feature — not wired up yet,
on purpose.

## What's next (not built yet, on purpose)

- Select an employee (or all) and generate a payslip PDF from their row.
- Email that PDF to the employee's address.
- Real Firebase Authentication instead of a plaintext password check.
