# Pocket Ledger

A private personal finance tracker for your phone. You keep all your accounts in one place (bank accounts, stocks, ETFs, crypto, real estate, retirement plans, loans…), follow your net worth and performance over time, and plan your goals.

**Everything is entered by you, and everything stays on your phone.** The app never connects to your banks or brokers. The only optional exception: fetching market prices when you ask for it (off by default).

Built with Expo (SDK 57) and React Native; it runs in **Expo Go**.

---

## Privacy first

- **No connection:** no bank or broker connection, no account, no analytics, no ads.
- **Online prices are opt-in:** off by default. When you turn them on and press the button, only the identifiers of your investments (tickers, ISINs, coin names) are sent to Yahoo Finance and CoinGecko, never amounts or quantities. Nothing is ever fetched automatically.
- **Local data:** stored in a SQLite database on the phone. Android cloud backup is disabled for the app.
- **Optional biometric / PIN lock.** The app also hides its content in the app switcher.
- **Hide amounts:** one tap on the eye masks every amount in the app. Percentages stay visible.
- **Encrypted exports:** backups can be protected with a password.
- **Silent notifications:** reminders are scheduled by the phone and never show amounts.

## Features

### Portfolio (home)
- **Net worth** (assets − debts) and your **gain** in € and % for the selected period.
- **Goals card:** progress towards your goal (or FIRE number) and your emergency fund ("Covered · 112%"). Tap a line to open Insights › Goals or Savings.
- **Period selector** (Month · Year · 12M · All). It applies across the whole app.
- **History chart:**
  - *Net worth* view (when you have debts), or *Investments* view: asset value vs money invested;
  - an optional dashed **"what if" line**: where your money would be at 4%/yr (or 2–7%), to check whether you beat a savings account or a bond.
- **Performance card:** value at the start of the period, money added, value today, and a **gain breakdown**: price gains · dividends · interest.
- **Today card:** assets, invested, unrealized and realized gains, debts, your **real annualized return** since the start (e.g. "▲ 7.4%/yr vs 4%"), and how far ahead or behind the comparison rate you are.
- **Header icons:**
  - **reminders:** prices to update (colored by age), investments due for review, and a nudge to set a goal and an emergency fund (until set, or "Don't remind me");
  - **sync (⟳):** fetch prices online. Grayed while the feature is off: tapping it explains what it does and offers to turn it on;
  - **eye:** hide amounts; **gear:** settings.

### Investments
- **List view:**
  - grouped by category (Cash, Stock, ETF, Crypto, Real estate, Bonds, Funds, Retirement, Precious metals, Other, Loan, plus your own);
  - **sortable** by value, invested, gain € or gain %;
  - each line shows its account, quantity × price, average cost and period gain;
  - badges show **outdated prices** (gray 1 month · yellow 2–3 · orange 4–6 · red 6+) and **reviews due**;
  - each category sets how often to remind you: **monthly**, **yearly** (e.g. a retirement plan) or **never** (real estate, by default).
- **Allocation view:** donut chart by category, account or investment, with the full table underneath.
- **Update prices** (header link).

### Insights
Three sections, switched at the top.

**Savings**
- **Monthly savings:** one bar per month of the money you really saved:
  - investments added minus withdrawn, plus loan principal repaid minus money borrowed;
  - average, months with savings, best month;
  - exceptional months (e.g. a home purchase) are drawn cut so the other months stay readable.
- **Emergency fund:** 3, 6 or 12 months of expenses kept in your **Cash** category.
  - Cash today vs the target, months covered ("Covered: 7.7 months (112%)"), and how long your saving pace needs to fill the gap.
  - **Too much cash?** It tells you how much you could invest: what's beyond the higher of your emergency fund and your Cash target (e.g. 6 months = 6 000 € but a 15% Cash target = 8 000 € → keep 8 000 €). **See what to buy with …** opens Targets with that amount filled in.
  - Above your emergency fund but within your Cash target, it explains why that surplus stays in cash, with **Adjust my Cash target** (opens the editor).
  - Your monthly expenses are also your yearly spending in Goals › FIRE.

**Targets**
- Set target weights by category (e.g. 70% ETF / 20% cash / 10% crypto) and see each category's current share vs its target.
- **Invest new money:** what to buy next, without selling. **Full rebalance:** the exact buy and sell amounts.
- Categories without a target (e.g. your home) are left out.
- While editing, the **Cash** row suggests a target from your emergency fund (e.g. 6 months of expenses ≈ 9%), with a one-tap "Use 9%".

**Goals** (a simulation)
- **Goal:** an amount, or **FIRE**: enter your yearly spending, the target is 25× it (the "4% rule"). A progress bar shows where you are today.
- *"At 7.0%/yr (4.9% after inflation) and 12 000 €/yr, you'll reach 750 000 € in today's money in June 2041"*, with a chart of the projected value vs the money you put in, over 10, 20 or 30 years.
- **Growth rate:** yours (your real annualized return), 4%, 7%, 10% or custom.
- **Inflation** (Off · 2% · 3% · custom, 2% by default): amounts are in **today's euros**, so a FIRE number is compared with what your spending costs now.
- **Yearly saving:** your current pace (average of the last 12 months, exceptional months left out) or a custom amount.
- A simulation, not a forecast: steady growth, real returns vary. Your choices are remembered.

### Add an operation
- **Choose an existing investment, or create one on the spot** (name, ticker/ISIN, category, account, notes). New accounts and categories can be created in the form.
- **Operations adapt to the investment:**

  | Investment type | Operations |
  |---|---|
  | Stocks, ETFs, crypto… | Buy · Sell · Update price · Dividend |
  | Cash, real estate, retirement… | Deposit · Withdraw · Update value · Interest |
  | Loans | Borrow · Repay · Update balance |

- **Buy and sell start from the last known unit price** (you can change it).
- **Paid from / paid into a cash account** (optional): buy 2 MSCI World **paid from Livret A**, and the Livret A withdrawal is created too (fees included). Same for sales and dividends (paid into).
  - The preview shows both balances; a warning appears if the cash account would go below zero.
  - The two entries stay linked: editing the buy updates the withdrawal (or moves it to another account), deleting one deletes both (with Undo).
  - Moving money between your own accounts doesn't count as money added or saved.
- **"Current position" card** before you start, and a **live preview** of the impact before saving: quantity, average cost, invested, value, gains. The preview always matches what you'll see once saved.
- **Loans, repay by new balance:** enter today's balance, tick "Paid every month" and the payment day, and the app creates one repayment per month since the last update.
- **Sanity checks:** you can't sell more than you hold, and you can't enter a future date.

### Update prices
- **One screen to update every price or balance at once,** for a given date, with the change in % as you type and the age of each price.
- **Fetch prices online** (Settings → Online prices, or the button at the top):
  - for stocks, ETFs, funds, metals and crypto that have an **identifier**:

    | Identifier | Example |
    |---|---|
    | Yahoo ticker | `GOOG`, `IWDA.AS` (Amsterdam), `CW8.PA` (Paris), `GC=F` (gold, per troy ounce) |
    | ISIN | `IE00B4L5Y983` (the app looks up the listing, preferring euro exchanges) |
    | Crypto | `BTC`, `ethereum` (via CoinGecko) |

  - a progress bar and one line per investment: gray while waiting, ✓ green when found (old price struck through → new price, with the change), ⚠ red with the reason when it fails (unknown ticker, no connection…);
  - prices in dollars, pounds or pence are converted to euros with the day's exchange rate;
  - each found price has a **checkbox**; an **unchanged** price starts unticked and grayed;
  - a big change (over 30%) shows a ⚠ **Big price change** label; tap it to see why: normal if your last price is old, otherwise check the identifier;
  - **nothing is saved until you press Save**, and you can Undo right after. Prices are saved at today's date (the market close date is shown).

### Investment page
- **Chart, position details, period gain**, and its **annualized return** (after one year of history).
- **Notes:** why you bought it, your plan.
- **Review date** (in 3 months, 6 months, 1 year…), with a one-tap "Reviewed: next in 6 months".
- **Full history,** newest first, in the order you entered things. Each price shows whether it was **entered manually** or **fetched online**; linked entries show "⇄ Paid from Livret A". Tap an entry to edit it, or use the trash icon to delete it (with Undo).

### Settings
- **Privacy:** lock with biometrics / PIN, hide amounts.
- **Monthly reminder:** day and time. See Limitations for Android.
- **Comparison line rate:** off, 2–7%.
- **Online prices:** on / off (asks for confirmation and explains what is sent).
- **Accounts and categories:** rename, archive, add, recolor.
- **Backups:** encrypted export, restore from a file, automatic backups.

## How the numbers are calculated

- **Average cost:** your purchases including fees, divided by the quantity held. A sale doesn't change the average cost; it records a **realized gain**.
- **Period gain** = value at the end − value at the start − money you added + dividends received.
  - Money you add is not a gain, and money you take out is not a loss. Money moved between your own accounts (a buy paid from Livret A) is neither.
  - The % uses the *Modified Dietz* method, so a deposit in the middle of the month doesn't distort it.
- **Annualized return (XIRR):** the yearly rate that turns each euro you put in, on its date, into what you got back plus today's value. It makes "+18% in 5 years" and "+12% in 1 year" comparable. It's shown only after one year of history.
- **Same-day entries** count in the order you saved them: the latest one sets the price (a price update entered after a buy wins over the buy price, and the other way round).
- **Nothing is stored pre-computed:** totals, history and charts are recalculated from your operations, so correcting or back-dating an entry fixes everything automatically.

## Backups

- **Automatic backups:**
  - kept on the phone (last 5, 10 or 20);
  - made before the first change of each day, and before any restore, reset or delete;
  - Settings → *Automatic backups on this phone* to restore one.
  - ⚠️ They're deleted if you uninstall the app.
- **Export:**
  - a JSON file you save wherever you want (Files, a USB drive, a cloud drive…), through the share sheet;
  - **protect it with a password** (recommended): encrypted with scrypt + XChaCha20-Poly1305;
  - encryption takes a few seconds, on purpose. **If you forget the password, the backup can't be recovered.**
  - Backups stay restorable after app updates.
- **Export regularly:** that's what protects you if you lose your phone.

## Getting started

### Requirements
- Node.js 20+.
- The **Expo Go** app on your phone, in its latest version (it must support SDK 57).

### Run
```bash
npm install
npx expo start
```
Scan the QR code with Expo Go (Android) or the Camera app (iPhone).

### Try it with demo data
In development, **Settings → Development → Reset with demo data** fills the app with about 5 years of realistic history across every feature (including real tickers for online prices, and buys paid from a cash account). Its prices are invented, so fetching real prices shows many "Big price change" labels. **Delete all data** empties it again.

## Limitations

- **EUR only, English UI.**
- **Prices are entered manually,** unless you turn on Online prices. Those use free, unofficial sources (Yahoo Finance, CoinGecko) that may change or limit requests; individual bonds are rarely found.
- **Monthly reminders don't work in Expo Go on Android.** Expo Go blocks the notifications module there. They work on iPhone, and on Android in a standalone build.
- **The database on the phone isn't encrypted.** The lock screen protects access to the app.
- **CSV import isn't available yet** (planned).

## Roadmap
- **A standalone Android APK** (EAS Build), to use the app without Expo Go and the development server.
- CSV import.

## Development

```bash
npm test                   # unit tests (calculations, backups, online prices with a fake network, database on real SQLite)
npx tsc --noEmit           # typecheck
npx expo lint              # lint
npx expo install --check   # check dependency versions match the Expo SDK
```

- Install packages with `npx expo install <package>`, not `npm install`.
- **Don't run `npm audit fix --force`:** it installs versions incompatible with Expo and breaks the app.

### Project structure
```
src/app/            screens (Expo Router)
src/domain/         all calculations and form rules, pure TypeScript, unit-tested
src/db/             SQLite schema, migrations and queries
src/state/          data provider shared by all screens, undo banner
src/backup/         export / import, encryption, automatic backups
src/quotes/         online prices (the only network code)
src/notifications/  monthly reminder
src/security/       biometric / PIN lock
src/components/     shared UI and charts
```

Contributor and AI-assistant guidelines (architecture rules, invariants, schema history, how to add a feature): [CLAUDE.md](CLAUDE.md).
