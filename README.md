# The Trip Tab

Split trip costs with friends. Share a link, and everyone adds expenses without an account. Works offline and installs on an iPhone home screen.

## Features

- **Trips:** any number, with an invite link for each.
- **Splitting:** equally, exact amounts, percentages, shares, adjustments or item by item, with one or several payers.
- **Settling up:** simplified debts or expense-by-expense debts, recorded payments and a summary to paste into a group chat.
- **Currencies:** every expense can use its own currency, at the rate you enter.
- **Credit:** every expense shows who added it and who it's split among. People pick their name on the trip, with no login.
- **Refunds and repeats:** record money coming back, or duplicate an expense.
- **Paying back:** Venmo and Zelle details beside each debt, with copy buttons.
- **History:** comments, receipt photos, search, category filters, an activity log, undo and restore.
- **Insights and export:** spending by category, person and day, plus CSV.

## How the numbers work

Amounts are stored as whole numbers of a currency's smallest unit, so totals never drift. When a split doesn't divide evenly, leftovers go to the largest remainders, so the shares always add up exactly: NT$100 among three people is 34, 33 and 33.

A balance is what someone paid minus their share. "Simplify debts" keeps every balance the same and only changes who pays whom, so the group makes fewer payments. It settles exact matches first, then has the largest debtor pay the largest creditor.

For a by-item split, the difference between the items and the bill total (tax, tip or a discount) is shared in proportion to what each person ordered.

## Install on iPhone

Open the link in Safari, tap Share, then Add to Home Screen, and open the app from its icon. The home-screen app and Safari keep separate lists of trips, so open your invite link from whichever one you use. An invite link always opens in Safari. To use a trip in the home-screen app, copy the link and paste it into "Have an invite?" on the app's first screen.

## Your data

- Trips live in a Firestore database. **Anyone with a trip's link can see and edit that trip**, so share it only with the group. Trips can't be listed or searched.
- Deleting an expense or trip only marks it. Both can be restored.
- Every edit keeps the version it replaced. Open an expense and tap "See earlier versions" to bring one back. If two people edit the same expense, the second person is asked which version to keep. If they edited offline, the last change to sync wins and the other stays in the history.
- If a link is shared too widely, People → "Replace it" moves the trip to a new link. The old link stops opening the trip and never reveals the new one. The old copy stays stored, so someone with technical skills and the old link could still read it. Anyone with the old link can also choose to keep using it.
- The database keeps an offline copy on each phone and sends changes when back online.
- Each phone keeps up to 3 daily safety copies of each trip it opens. People → Backups can restore them, and can export, import, copy and paste backups. These merge by id and never delete anything. Backups don't include receipt photos.
- Who you are on a trip and your trip list are stored only on your phone. Names aren't verified: anyone with the link can pick any name.
- Expenses added offline show "Waiting to sync" until they reach the database. They exist only on that phone until then, so don't delete the app first.
- Venmo and Zelle details are visible to anyone with the trip link.
- In Safari, a site's data can be cleared after about a week without a visit, so iPhone users are asked to add the app to their Home Screen. Synced trips stay safe, and the link gets you back in.

## Set up the database (free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project. Stay on the free Spark plan and don't add a card.
2. Build → Firestore Database → Create database, in production mode.
3. In the Rules tab, paste the contents of `firestore.rules` and publish.
4. Build → Authentication → Get started → Sign-in method, and turn on **Anonymous**. The app needs this, and nobody has to create an account.
5. Project settings → Your apps → Web, register an app, and copy its `firebaseConfig`.
6. Put those values in `js/config/firebase.js`.
7. Optional, after the app works: Build → App Check → register the web app with reCAPTCHA v3, then put the site key in `appCheckSiteKey`. Check the App Check metrics, and only then turn on enforcement for Firestore and Authentication.

The free limits are 20,000 writes and 50,000 reads a day. If they run out, the database stops until they reset, and nothing is charged.

## Development

Vanilla ES modules with no build step, served from GitHub Pages.

- `js/config`: lists and tunable numbers.
- `js/core`: pure logic. Most tests live here.
- `js/data`: storage, the two database backends, the repository and per-phone data.
- `js/ui`: one module per screen.

```
npm test                # unit
npm run test:smoke      # the basics at 320, 390 and 768 px
npm run test:e2e        # whole flows
npm run test:rules      # real backend and security rules; needs Java and the Firebase emulators
npm run preview         # one-file build for the Claude preview
```

Each release: bump `CACHE` in `sw.js` so phones offer the update. New files in `js/` or `css/` go in `APP_FILES`. A new data format needs a `schemaVersion` step in `core/model.js` and a permanent fixture in `tests/fixtures`.
