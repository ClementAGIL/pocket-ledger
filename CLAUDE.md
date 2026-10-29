# Pocket Ledger

Personal finance tracker (Expo SDK 57 / React Native). The user enters everything by hand; data lives only on the phone in SQLite. User-facing docs: `README.md`.

@AGENTS.md

## Product constraints (do not break without asking)

- **No network, except one opt-in, user-triggered feature: online prices.**
  - Settings › Online prices is off by default. Fetching only happens when the user presses "Fetch prices online" (no background, timer or automatic refresh), and nothing is saved before the user reviews and presses Save.
  - Only identifiers (tickers, ISINs, coin names) go to Yahoo Finance and CoinGecko, never amounts or quantities.
  - All network code lives in `src/quotes/fetchQuotes.ts` (also used by the import script for month-end prices). Otherwise: no bank/broker APIs, analytics, crash reporting, remote fonts or images.
- **Must run in Expo Go.** Only modules bundled with Expo Go, so no SQLCipher or other custom native code. If a feature truly needs a development build, ask first. (A standalone APK is planned: it must keep working in Expo Go too.)
- **EUR only, UI in English.** Foreign quotes are converted to EUR when fetched.
- **Privacy:**
  - the biometric/PIN lock and the "hide amounts" toggle must be respected on every screen (the Goals and emergency fund amount inputs also use `secureTextEntry` when hidden);
  - notifications never contain amounts, because they show on the lock screen.

## Architecture

```
src/app/                 Expo Router screens only (their sub-components live in src/components)
  (tabs)/index           Portfolio (home): net worth, period gain, GoalsCard, chart, performance, today;
                         header: reminders, check-in (calendar icon), online prices (sync icon), hide amounts, demo, settings
  (tabs)/investments     List (sortable; by category, or by account → categories → investments) | Allocation donut
  (tabs)/insights        Sections (switch at the top): Savings (+ emergency fund) | Targets | Goals;
                         opened on a section with ?section=savings|targets|goals&at=<timestamp> (&focus=emergency scrolls to the fund)
  (tabs)/add             Operation form (components/operation/OperationForm)
  onboarding             Introduction (full-screen modal, 6 swiped pages, lock + demo on the last); once per install
  checkin                Monthly check-in (?month=YYYY-MM): month gain, savings, movers, then big losses / prices / reviews / scheduled
  holding                Same product in several accounts (?holding=<holdingKey>): summed chart & position,
                         merged history with an account tag, links to each investment page
  asset/[id]             Investment page: chart, position, schedules & loan details, notes & review, history (FlatList; price updates hidden until "Show", not saved)
  schedule               Modal: add/edit a scheduled operation (?asset=ID&id=SID)
  scheduled              Review of the scheduled operations due: amount / price / interest per line, Save all + Undo
  operation              Modal: add/edit an entry (editing the cash side of a transfer opens the main side)
  update-prices          Bulk price/balance entry + "Fetch prices online" button
  fetch-prices           Modal: online fetch with progress, old → new review, Save + Undo
  settings, accounts, categories, backups
src/domain/              PURE TypeScript (no React/Expo imports), unit-tested in __tests__/
  types, dates, format              model, local dates, € / duration formatting, number parsing
  positions, portfolio, history     replay engine + entry order, totals & groups & indexes, time series
  performance                       period gains (Modified Dietz), cashFlow() rule; performanceBetween(start, end) for any range
  checkin                           monthly check-in: month range, gain, savings, movers, checkInDue (Home card)
  benchmark, savings, allocation    "what if X%" line, monthly savings, donut data
  staleness, reviews, priceUpdates  update reminders, review dates, bulk price parsing
  repayments, sorting, rebalance    loan repayment planning, list sort, target allocation plan
  schedules                         scheduled operations: due dates, review drafts → records, loan split / payoff, schedule form
  returns                           real annualized return (XIRR), overall, per investment, per holding (forAssets)
  holdings                          same identifier + category in several accounts: holdingKey, mergeRows, sums
  operations                        Add-operation rules: offered ops, validation, records, preview, cash link
  quotes                            online prices: candidates, identifiers, source parsing, EUR conversion
  emergency                         emergency fund, cash advice, goal progress
  projection                        Goals simulation: growth, saving pace, goal / FIRE date, inflation
  milestones                        goal / emergency fund reached: keys, newlyReached, check-in month values
src/db/                  migrations.ts (schema), repo.ts (all SQL), demo.ts (dev data),
                         nodeTestDatabase.ts (expo-sqlite stand-in on node:sqlite, tests only)
src/state/               DataMode (real / demo database, SQLiteProvider), DataProvider (loads everything, computes,
                         write(), settings, today), UndoProvider, onboarding (seen-once flag)
src/backup/              format (plain JSON), encryption + encoding (password backups),
                         backup (export/import I/O), autoBackup + autoBackupRules (local safety net)
src/quotes/fetchQuotes   the only network code: Yahoo (chart, ISIN search, FX) + CoinGecko
src/notifications/       reminders (lazy expo-notifications), NotificationsBridge (sync + tap)
src/security/LockGate    biometric/PIN lock + app-switcher cover
src/hooks/               useMoney (€ + hide amounts), useNumberDraft (typed number inputs),
                         useConfirmLeave (discard unsaved changes?), useQuoteRun (online fetch session),
                         useEntryActions (history line: open, delete + undo, cash link label);
                         useOnlinePricesEntry lives in OnlinePricesIntro
src/components/          ui.tsx primitives (Button incl. outline + icon, ProgressBar, Chips…), charts
                         (HistoryChart, SavingsChart, AllocationCard), GoalsCard, MonthlySavings, EmergencyFund,
                         Simulation (Goals), TargetAllocation, OnlinePricesIntro, StartupError, saveError, forms…,
                         AppIcon (the icon in SVG, arrow drawable) + AnimatedSplash
  celebration/           Confetti (one clock, physics per piece) · GoalCelebration (watcher + full-screen modal)
  goals/                 GoalCard · ProjectionCard · GrowthCard · SavingCard (Simulation holds the state)
  operation/             OperationForm (state + save) · NewAssetFields · OperationFields · Preview
  onboarding/            scene (choreography engine: Scene canvas 280×220, Piece flies in `from` during its `at`
                         window, Draw strokes a path; theme colors only) · Illustrations (one scene per page)
  home/                  HeaderButtons (reminder, icon buttons) · Reminders (prices to update, reviews due)
  investments/           CategoryGroup (category card + its investment rows; `nested` inside an account) · AccountGroup
  asset/                 EntryLine (history line, entry order, operation labels) · EditAsset · ScheduleCard (+ loan details)
  prices/                PriceRow (Update prices) · QuoteRow (Online prices)
  settings/              one component per Settings section + shared rows
scripts/import/          statement → backup converter, run on a computer (npm run import): ledger (merge into a
                         backup, replacing only the imported account), csv, one file per format (degiro, revolut)
src/theme.ts             color tokens (light/dark), spacing, radius
assets/icon-source/      SVG sources of the app icon (suit with a phone showing a rising arrow in the breast pocket); the PNGs in assets/images are rendered from them
```

## Data model and invariants

- Account → Asset → Transactions (BUY, SELL, DEPOSIT, WITHDRAW, INCOME) + Price points.
- **Asset `valuation`:** `units` (quantity × unit price) or `balance` (a single value). Fixed at creation.
- **Category `kind`:** `asset` or `liability`.
  - Liabilities (loans) count negatively in net worth and are excluded from invested and gains.
  - On a loan, DEPOSIT = Borrow and WITHDRAW = Repay.
- **Never store derived numbers** (totals, invested, average cost, history, benchmark…). Everything is recomputed from transactions and prices in `src/domain`, so back-dated entries correct everything automatically.
- **Calculation rules:** see the comments in `src/domain/positions.ts`. Change them only together with their tests.
- **Charges** (exchange connection fees, negative interest): an INCOME of 0 € with the cost as `fees` (`isCharge()` in `positions.ts`): it lowers the value and the gain; shown as "Fee −2,50 €" in the history.
- **Order of entries** (`compareEntries` in `positions.ts`, shared by the calculations and the investment history):
  - by date, then by save time (`createdAt`, `'YYYY-MM-DD HH:MM:SS'` UTC), then operations before prices, then id;
  - so the latest entry of a day sets the price (a buy after a price update, or the other way round);
  - edits keep the original time (`upsertPrice(…, createdAt)`, `updateTransaction` doesn't touch it); restores (undo, backups) keep it;
  - form previews place an unsaved entry at `NOT_SAVED_YET` (or its original time when edited), so the **preview equals the saved result**.
- **Linked cash transfers** (`transactions.linked_id`):
  - a BUY / SELL / INCOME of a `units` asset can be paid from / into an asset of the Cash category; both rows point to each other;
  - the cash side is a WITHDRAW (amount + fees) or DEPOSIT (amount − fees) on the same date (`evaluateCashLink` in `operations.ts`); low cash only warns;
  - it nets to 0 in performance, savings and the overall XIRR (both sides go through `cashFlow()`);
  - a dividend paid into cash (INCOME ↔ DEPOSIT, `isIncomeTransfer()`) is not money added portfolio-wide: left out of the total performance flows, the Home "Money put in" line (`moneyFlows()`) and savings; per asset the cash side stays a deposit (cash gain 0, the dividend is the stock's gain);
  - keep the pair consistent with `repo.syncLinkedCash` (create / update / move / remove); delete and undo both rows together; `deleteAsset` unlinks the other side, `restoreAsset` relinks it.
- **Money:**
  - stored as integer cents in SQLite (`amount_cents`, `fees_cents`), handled as euros in the domain;
  - converted only in `repo.ts`;
  - quantities and unit prices are REAL, because crypto needs decimals.
- **Dates:** local calendar days as `'YYYY-MM-DD'`. Use `src/domain/dates.ts` (`addMonths` clamps to month end), never `toISOString()` (UTC shifts the day).
- **Today:** while rendering, use `useToday()` (refreshed when the app returns to the foreground; the app is often resumed on another day). Call `today()` only at the moment of an action (save, fetch) or for a form's starting value.

### Database

- Tables: `categories` (`target_weight`, `update_reminder`), `accounts`, `assets` (`review_date`), `transactions` (`linked_id`, `created_at`), `prices` (`source`, `created_at`, one per asset per day), `schedules` (`done_until`, `cash_asset_id` set null when that asset goes, `rate` for loans), `settings` (key/value strings).
- `migrate()` applies `MIGRATIONS` up to `SCHEMA_VERSION` (`PRAGMA user_version`). A database newer than the app is recreated in development and refused in a release build (`isDev` option for tests).

## Feature rules worth knowing

- **Gains follow one app-wide period** (`settings.period`: MTD / YTD / 12M / ALL, via `<PeriodSelector>`, default ALL). Screens show `useData().performance`:
  - gain = end − start − net money added + dividends paid out;
  - split into `priceGain` + `dividends` + `interest`;
  - `byAccount`: an account's assets; a dividend paid into a cash asset of the same account isn't money added to it (like the total);
  - % = Modified Dietz, or gain / net money invested for ALL;
  - "Since purchase" figures stay in `position` / `summary`.
- **`cashFlow()` in `performance.ts`** is the single "money in/out" rule, shared by performance, savings, the benchmark, the XIRR flows and the Home chart's "Money put in" line (deposits − withdrawals, not the cost of what is held; Today › "Invested" stays the cost).
- **Monthly savings:** assets via `cashFlow()`, both sides of a linked cash transfer left out (a buy paid from cash is neither "invested" nor "withdrawn"; the net is unchanged); debts: every change of a loan balance counts (borrow −, repay +); `chartBounds()` cuts exceptional months (`exceptionalLimit()`: > 3× the 75th percentile).
- **Annualized return** (`returns.ts`, `useData().returns`):
  - XIRR since the start, money-weighted: buys/deposits out, sells/withdrawals/dividends in, current value at the end; debts excluded;
  - shown only after 1 year of history;
  - `total` is computed after each change, `forAsset(id)` on demand and cached; `forAssets(ids)` (a holding) on demand, not cached.
- **Holdings** (`holdings.ts`): `units` investments with the same identifier (case and spaces ignored) in the same category are one product held in several accounts.
  - display only (no table, no setting): Investments › List › By category shows one `HoldingRow` (`mergeRows` + `sortRows` on the summed figures; chevron = per-account lines; "N accounts" counts distinct accounts, `accountsLabel()`); By account never merges;
  - `sumStates()`: quantities, values, costs, realized and income summed, price = the most recently known; avg cost = invested / quantity; period gain = `combine()` of the investments (`holdingPerformance`);
  - `/holding` page: `buildHistory` over the investments' steps, chart marks of all of them, history with each entry's account; editing, notes, reviews and deleting stay on each investment page.
- **Chart marks** (`chartMarks()` in `history.ts`, `HistoryChart` `marks` prop): one mark per day and operation type (summed across investments; income net of fees, charges left out), ▲ in (BUY / DEPOSIT) · ▼ out (SELL / WITHDRAW) · ● INCOME, one lane per kind under the chart, marks within 10 px drawn as one bigger mark; while scrubbing, the legend lists the operations since the previous point (amounts via `formatEuro(…, { hidden })`). Colors `positive` / `negative` / `categorical[3]`, always with the shape.
- **Home chart projection** (`settings.chartProjection`, "With projection" switch under the chart, off by default): `projectMonths(nominalPlan(…))` = the Goals rate and saving without inflation, from today's assets; length `chartProjectionMonths()` = the period shown (MTD 1 month, YTD / 12M 12 months, ALL the history's length); `ChartPoint.projected` points are drawn dashed after a "today" divider, without area fill or comparison value; net worth view keeps today's debts.
- **Comparison line** (`benchmark.ts`, `settings.benchmarkRate`, 0 = off): flows compounded at X%/yr, dividends leave it. Computed in one pass; never stored.
- **Update reminders:** based on `position.priceDate` (last price, trade or balance change; dividends don't count); levels in the category's period: 1 gray · 2–3 yellow · 4–6 orange · 6+ red; `never` is never late; `theme.stale*` colors always paired with an icon + label; closed and archived positions are ignored.
- **Reviews:** due on and after `reviewDate` (`reviews.ts`); shown in the list, the home reminder and the investment page.
- **Big loss warning** (`bigLoss()` in `reviews.ts`, `BIG_LOSS` = −25%): a tracked, non-debt position with `unrealizedPct` ≤ −25% (vs average cost):
  - `LossBadge` on the row (holdings: on the summed figures) for as long as it lasts, a banner on the investment page;
  - "to review" in the Home reminders (`reviewReason()` 'loss', listed first) until a later review is planned: "Reviewed: look again in 3 months" (`NotesCard`) sets `reviewDate` (no extra column);
  - the check-in lists all of them.
- **Monthly check-in** (`checkin.ts`, `app/checkin.tsx`): opens on the last complete month (‹ › from the first month with data to the current one, shown "so far"):
  - gain via `performanceBetween()` (assets, like Home), `monthlySavings()` of the month, top 3 gainers / losers by € (≥ 0.50 €);
  - then today's to-dos: big losses, prices to update, reviews whose date has come (losses not repeated);
  - Home `CheckInCard` during the first 10 days of a month until opened (`checkInDue()`, `settings.checkInSeen` set when the last complete month is shown); permanent links: the Home header calendar icon, under the Performance card and in the reminders window; the monthly notification opens it.
- **Target allocation** (`rebalance.ts`): only categories with a target take part, targets must sum to 100%; "buy-only" splits new money over the deficits, "full" gives exact buys/sells; rounded to the cent, keeping the exact total. `TargetAllocation` accepts `investAmount` (pre-filled) and `startEditing`; "Use my current allocation" / "Current" pre-fill the editor with `currentShares()` (one decimal, sums to 100, a share rounding to 0 stays without a target, nothing saved before Save). Investments › Allocation › Category links to Insights › Targets. The editor lists every asset category: held or targeted ones first, the others ("not held yet") on demand; a target on an empty category takes part like any other (0% now). Order: the targets list by share now, then target (`byShareThenTarget`; "Next: buy" stays the biggest buy); the editor by target, then value (`byTargetThenValue`), fixed when it opens.
- **Scheduled operations** (`schedules.ts`, `schedules` table, `app/schedule.tsx` form, `app/scheduled.tsx` review):
  - monthly on `day` (clamped to the month's end) from `startDate`; `doneUntil` = the last occurrence reviewed (saved or skipped); a new start date clears it; at most 120 due at once;
  - **nothing is saved on its own**: Home reminders (`ScheduledReminder`, also in the check-in) → review screen (list fixed when it opens), each line ticked by default, adjustable; unticked = skipped; Save → `repo.saveScheduled`, undo → `repo.undoScheduled` (deletes the rows, restores each `doneUntil`);
  - BUY: quantity = amount / price (default the last price), the cash WITHDRAW is **linked** (like the Add form); DEPOSIT / WITHDRAW of a balance: the cash side is **not linked** (money moved between own accounts nets to 0 anyway);
  - **loan payment** (liability WITHDRAW with a `rate`): interest = balance × rate / 12 (`loanSplit`), stored as the repayment's **`fees`** (so only the principal lowers the balance; history "X + Y interest"), the cash side = the whole payment, **not linked** (savings: −interest net); several due months chain the balance (`draftOccurrences`);
  - investment page `ScheduleCard`: schedules, loan interest this month, `loanPayoff()` date + interest left, `interestPaid()`, `repayOrInvest()` vs `returns.total` (meaningful only);
  - deleting an investment cascades its schedules and nulls `cash_asset_id` elsewhere; `restoreAsset` gets `{ own, paidFrom }` to put both back.
- **Loan "Repay by new balance":** `planRepayments()` splits the principal equally over monthly payment dates; the last payment absorbs the rounding.
- **Add form** (`operations.ts` + `OperationForm`):
  - Buy / Sell start from the asset's last unit price;
  - "Paid from / Paid into" (Cash category assets, default "Not tracked") creates the linked cash side; the preview shows the cash balance before → after.
- **Goals** (Insights › Goals: `projection.ts`, `components/Simulation.tsx`):
  - starts from today's assets (debts excluded); monthly steps: growth at the monthly equivalent of the yearly rate, then 1/12 of the yearly saving; never below 0;
  - inflation (default 2%): amounts in today's euros via `realRate()` = (1+r)/(1+i)−1, saving constant in today's money; 'off' = future euros;
  - rate: "Yours" = `returns.total` (7% before a year of history), 4/7/10%, custom;
  - "Your pace" = `savingPace()`: net money into assets per month over the last 12 complete months, exceptional months left out, × 12; loan repayments don't count;
  - goal = an amount or FIRE (25× yearly spending); `monthsToReach()` searches up to 100 years; `goalProgress()` for the bars;
  - under the projection: "your money doubles every ~N years" (`doublingYears()`, the rate chosen; in today's money too when inflation is on; hidden when the rate ≤ 0);
  - FIRE goal card: "you can cover X of yearly spending" = assets × `FIRE_WITHDRAWAL_RATE` (the same 4% rule);
  - all choices in `settings.projection` (one JSON setting, `parseProjectionSettings` is tolerant).
- **Emergency fund** (Insights › Savings: `emergency.ts`, `components/EmergencyFund.tsx`):
  - target = months (3/6/12) × monthly expenses (`settings.projection.yearlySpending / 12`, shared with FIRE), vs the value of the category named "Cash" (`isCashCategory`);
  - `cashAdvice()`: what to keep = max(emergency fund, Cash target in € = weight × assets with a target). Above it (from 1 cent, so it always agrees with the rebalancing): "invest X" + link to Targets › Invest new money pre-filled. Between the fund and the Cash target: `held-for-target` explanation + link to the target editor;
  - the target editor's Cash row suggests a share (`emergencyShare`) with "Use X%".
- **Goal celebrations** (`milestones.ts`, `components/celebration/`): the goal (amount or FIRE, vs assets) and the emergency fund (vs the Cash category):
  - in the app: `GoalCelebrations` (root layout) compares the values before / after each **data** change (operation, price update…); a crossing not yet in `settings.celebratedGoals` (JSON list of `Milestone.key` = kind + target, the last 20) opens a full-screen modal (trophy, rays, confetti) after 700 ms; loading, a demo switch or editing the goal never celebrates; a new target can be celebrated again;
  - check-in: `CheckIn.values` (assets and cash at the month's start / end); a crossing during the month shows a "Goal reached in …" card and confetti (each time that month is shown; today's targets);
  - texts via `useMilestoneText()` (amounts respect "hide amounts"); no confetti with reduced motion.
- **Home `GoalsCard`:** goal and emergency fund progress (covered shows the %), each opening its Insights section; "Set a goal…" when neither is set (hidden while there's no investment).
- **Home reminders** (header button + window): prices to update, reviews due, and "Plan ahead" while a goal or the emergency fund isn't set (`missingSetup()` in `projection.ts`; also on a fresh install or after a reset). Each line opens its section; "Don't remind me" sets `settings.setupReminderDismissed`.
- **Online prices** (`quotes.ts`, `fetchQuotes.ts`, `app/fetch-prices.tsx`):
  - entry points: Home sync icon and the Update prices button; when off, both open `OnlinePricesIntro` (explains, "Turn on and fetch"); consent text shared via `ONLINE_PRICES_PRIVACY`;
  - candidates: open, non-archived, `units` assets (not debts) with an identifier;
  - identifier: category named like "Crypto" → CoinGecko, all coins of a run in one `simple/price` request (`isCoinSymbol`: ≤ 5 chars by `symbols=`, names by `ids=`, never a name by symbol: "bitcoin" is a tiny token's symbol); a coin missing → Yahoo `SYM-EUR`, then CoinGecko search only if the batch answered (never one CoinGecko request per coin after a 429); a valid ISIN → Yahoo search (euro listing preferred) then chart; anything else → Yahoo ticker (`GOOG`, `IWDA.AS`, `GC=F`);
  - non-EUR quotes: minor units first (GBp ÷ 100), then ÷ Yahoo `EUR{CUR}=X`, once per currency per run; 3 requests at a time, 10 s timeout;
  - each identifier is asked once per run (`quoteKey`: kind + query, coins case-insensitive): the same product in several accounts shares the request and its answer; still one line, checkbox and saved price per investment;
  - not fetched again within `REFETCH_AFTER_MINUTES` (60): a current price saved online in that time (`recentOnlineFetch` → `fetchedMinutesAgo`, status `recent`, "Fetch again" link), or a price found this app session (`sessionFound` in `useQuoteRun`, by `quoteKey`, even unsaved: shown again as found with its age, `minutesAgo`, and asked again by "Fetch again"); a batch CoinGecko request refused or failed (`ctx.coinFailure`) means no per-coin search for the rest of the run; Retry fetches only failed / not fetched lines;
  - saved **at today's date** with `upsertPrice(…, source: 'online')` (the market day is only shown); undo deletes new rows and restores replaced ones (`planQuoteSave`);
  - each found line has a checkbox, ticked by default except unchanged prices (`samePrice`: equal at the displayed decimals), which start unticked and grayed; changes over ±30% show a "Big price change" label with a tap-to-open explanation (a warning, not an error);
  - price `source` is shown in the history ("Fetched online" / "Entered manually");
  - jest-expo mocks `fetch`: tests pass a fake `fetch` to `runQuotes`.
- **Splash + introduction:**
  - the native splash (`expo-splash-screen`, same background and icon) hides when the data is loaded; `AnimatedSplash` (root layout, above everything incl. the lock) then plays one timeline (~1.8 s): your things pop up around the icon and fly into the pocket phone, the arrow draws with a ripple and sparks, a faint rising line crosses the screen, the name drops in letter by letter; the finished picture holds `HOLD_MS` (0.7 s), then it fades out (a quick fade with reduced motion; the icon stays centered at the native splash's size so the hand-off is seamless); it plays once per launch (a demo switch doesn't replay it). Expo Go shows its own native splash first;
  - `/onboarding`: opened by Home on the first start (`onboardingSeen()` in `expo-sqlite/kv-store`, key `onboardingSeen`, global like `dataMode`), only when the real database has no investment (an update with data just sets the flag); Settings › Help › "Show the introduction" replays it. Last page: turn on the lock (same checks as Settings), "Explore with demo data first";
  - each page has its own animated illustration (`components/onboarding/Illustrations`): its timeline (~2.2 s) plays when the page is more than half in view and rewinds once it's off screen, so it replays; reduced motion shows it at once;
  - keep the pages in step with the features when a major one is added.
- **Demo mode** (`state/DataMode.tsx`): a second database file (`pocketledger-demo.db`) for showing the app (interviews…):
  - entered from the Home flask icon, at once (no dialog: the real amounts would show behind it; hidden in demo); the way back is only Settings › Demo data (last section) › "Back to my data", always confirmed;
  - the mode is stored outside both databases (`expo-sqlite/kv-store`, key `dataMode`); a switch remounts everything (`key` on `SQLiteProvider`), so the lock asks again when going back;
  - the demo database is rebuilt from `demo.ts` each time it opens; settings are per database;
  - in demo: no automatic backups (they'd push out the real ones), Reminder and Backup sections hidden, the monthly reminder isn't touched.
- **Notifications** are local only (no push server). The monthly one says "Your monthly check-in is ready" and opens `/checkin`.
  - **Never import `expo-notifications` statically** (only `import type`): Expo Go on Android throws when loading it, which crashes the app.
  - Use `loadNotifications()`, which returns null where it's unavailable.
- **Backups:**
  - **Automatic local backups** (`Documents/backups`, unencrypted, keep the last N): one before the first `write()` of the day (in `DataProvider`), plus `safetyBackup()` before any restore, reset or delete-all. Best effort: a failed backup must never block a change.
  - **Exports** can be password-encrypted: scrypt (N=2^14, about 5–10 s on a phone, on purpose) + XChaCha20-Poly1305 via `@noble/*`, pure JS. All parameters are stored in the file.
  - **Format** (`FORMAT_VERSION` 9, 8 still read): prices carry `source` and `createdAt`, transactions `linkedId` and `createdAt`, `schedules` (since 9); a link to a missing transaction is dropped, a schedule's missing cash asset becomes "not tracked".

- **Statement import** (`scripts/import/`, not in the app):
  - `npm run import -- <format> <csv> [--out file] [--account name] [--no-prices]` (tsx); a converter returns an `ImportedAccount` (assets + operations in EUR, `cash` = linked cash side) and warnings for every line it doesn't understand;
  - `mergeAccount()` reads the existing `--out` (a previous run or a password-less export), replaces only the account with the same name and keeps everything else; an unreadable existing file is never overwritten;
  - DEGIRO: trades grouped by order ID (EUR = the conversion line), foreign income pooled until its conversion and shared pro rata (cash matches to the cent), sweeps ignored, splits restated, delisting = sale at the settlement;
  - month-end prices (unless `--no-prices`): `heldMonthEnds()` lists the months each `units` asset with an identifier was held, `fetchMonthlyHistory()` asks Yahoo for the whole monthly history (`period1=0`: `range=max` turns into quarterly bars; only identifiers sent), tries listings euro first until one goes back far enough, converts at each month's `EUR{CUR}=X` close; saved as `online` prices at the month end (today for the current month), `createdAt` 23:59:59 so they come after the day's operations;
  - Revolut (consolidated statement, double-encoded UTF-8: match ASCII only): money put in = EUR "Change en …" / "… pocket" lines into "Revolut cash"; buys = net + fees; net dividends; crypto quantities lose their decimal point (`cryptoQuantities()` finds the decimals from the € values and scales staking to the year-end holding); Learn & Earn and staking = 0 € BUYs at the market price (staking one per coin per year); `missingSplits`: Yahoo's split events (`events=split`) restate earlier operations (`applySplits()`);
  - `historyMatchesTrades()` drops a fetched history whose closes are > ×3 from the import's trade prices (another product); crypto assets are asked as `SYMBOL-EUR`;
  - new format: add `<bank>.ts` + register it in `CONVERTERS` (`run.ts`) + a test with a small invented CSV.

## How to change things

- **Reads:** `useData()` → `snapshot` (raw rows), `portfolio` (incl. `txByAsset`, `pricesByAsset`, `txById`), `performance`, `returns`, `settings`, `today`.
- **Writes:** always `useData().write(txn => repo.xxx(txn, …))`. It makes the daily backup, runs in an exclusive transaction and refreshes the UI. Never call `db.runAsync` from a screen; add a function to `repo.ts`. The Add / Edit form saves through `repo.saveOperation()` (new investment, price or transactions, linked cash side), tested in `saveOperation.test.ts`.
- **Save errors:** `showSaveError(e, 'A … with this name already exists.')` (`components/saveError.ts`): the duplicate message only for a real duplicate name (`isDuplicateName` in `db/errors.ts`), otherwise the actual error.
- **Startup failures** (database can't open or load, a crash) show `StartupError` (the root `ErrorBoundary` in `app/_layout.tsx`) instead of a frozen splash.
- **Deletions:** offer an undo.
  - Keep the deleted rows, then `useUndo()(message, () => write(txn => repo.restoreXxx(txn, row)))`.
  - The `restore*` functions re-insert rows with their original ids (and links, save times).
  - The banner lives at the root (`UndoProvider`), so it survives navigation.
- **Settings:** add the field to `Settings` + `parseSettings` in `DataProvider` (stored as strings in the `settings` table, with a default when missing; objects are stored as JSON).
- **Schema change:**
  1. Append a function to `MIGRATIONS` in `src/db/migrations.ts`. Never edit a shipped migration. (SQLite `ADD COLUMN` can't take a non-constant default like `datetime('now')`: add it nullable, set it in the inserts, and backfill existing rows.)
  2. Update `repo.ts` (mappers, inserts, `restore*`, `replaceAll`), the test fixtures and the Database section above.
  3. Bump `FORMAT_VERSION` in `src/backup/format.ts`, and keep older versions importable.
- **Form rules** (what's allowed, error messages, what gets saved, previews) belong in `src/domain/operations.ts` with tests, not in the component.
- **New calculation logic:** in `src/domain`, with a jest test. DB-level behaviour can be tested on real SQLite with `openTestDatabase()` (see `src/db/__tests__/demo.test.ts`, `linked.test.ts`, `prices.test.ts`, `saveOperation.test.ts`).
- **UI:**
  - colors from `useTheme()` tokens, no hard-coded hex in screens;
  - amounts via `<Money>` or `useMoney()`, which respect "hide amounts";
  - parse user numbers with `parseNumber` (accepts `1 234,56`);
  - section-to-section links inside Insights go through callbacks; links from other screens use `router.push({ pathname: '/insights', params: { section, at } })`.
- **Charts:**
  - custom SVG (`HistoryChart` has a time-proportional x-axis; Goals reuses it with the goal as the dashed line);
  - series colors are validated palette slots (`seriesValue`, `seriesInvested`, `seriesBenchmark`, `categorical`), so don't swap them by eye;
  - at most 9 donut segments (`MAX_SLICES`: up to 8 items each get a validated `categorical` slot; from 9, the 7 largest + "Other"; never a 9th hue); by investment, a holding in several accounts is one segment.
- **Demo data** (`src/db/demo.ts`; demo mode in every build, Settings › Development "Reset with demo data" `__DEV__` only):
  - keep it exercising every feature: all staleness levels, due reviews, big losses (Ethereum at exactly −32% vs average cost, Peloton far lower), scheduled operations due, a loan last updated 4 months ago, real Yahoo tickers (CW8.PA, ESE.PA, TTE.PA, NOKIA.HE, AAPL…), a bond ISIN that isn't found, a few online prices, 3 buys paid from the checking account;
  - its prices are invented, so a real fetch shows many "Big price change" labels;
  - `demo.test.ts` checks it on real SQLite.

## Performance

- **Model:** every `write()` reloads the whole snapshot and recomputes everything. That's simple and safe; on 10 years of daily data (~113k rows) the domain recompute stays ≈ 100–200 ms on a phone.
- **One investment's rows:** use `portfolio.txByAsset` / `portfolio.pricesByAsset` / `portfolio.txById` (O(1)). Never `snapshot.transactions.filter(t => t.assetId === …)` in a screen, and especially not in a form re-rendered on each keystroke.
- **Hot loops over operations:** avoid `Date` objects and substrings. `dayNumber()` parses char codes; aggregate per day before per-day math (see `benchmarkSeries`).
- **Long lists** (history of an investment, online prices…) must be virtualized (`FlatList`), never `.map` inside a `ScrollView`.
- **Measure before optimizing:** `npm run bench` / `npm run bench:jitless` (`src/bench/perf.bench.ts`, not part of `npm test`). The jitless run prints a harmless WebAssembly warning.
- **Next step if needed** (not done): reload only the affected investment after a `write()` and cache each investment's replay. The full SQLite reload (~400 ms in Node on 113k rows) is the largest remaining cost.

## Commands

```bash
npm test                   # jest: domain, backup, fetch (mocked), DB on real SQLite
npx tsc --noEmit           # typecheck
npx expo lint              # lint (if it reports a parse error in code that is fine: npx expo lint --no-cache)
npx expo start             # run, scan with Expo Go
npx expo install --check   # dependency versions match the SDK
npx expo export --platform android --output-dir <tmp>   # check the bundle builds
```

- **Dev app on a phone/emulator (fast loop):** `npx expo run:android --app-id com.pocketledger.app.dev` builds the debug app, installs it and serves it with Metro. `plugins/withDevVariant.js` makes debug builds a separate app, "Dev Pocket Ledger" (`com.pocketledger.app.dev`, own data), so they never replace the release APK. Afterwards `npx expo start` + open the dev app is enough (rebuild only after native changes).
- **Local Android build:** `npx expo run:android` only generates `android/` when it's missing. After changing `app.json` (name, icon, scheme, plugins), run `npx expo prebuild --clean --platform android` first, or the build keeps the old values.
- Add or upgrade packages only with `npx expo install <pkg>`.
- **Never run `npm audit fix --force`**: it installs versions incompatible with the Expo SDK and breaks the app. Most audit warnings concern dev and build tooling.
- **ESM-only packages** (like `@noble/*`) must be added to jest `transformIgnorePatterns` in `package.json`.
- **jest-expo replaces `fetch`** with a mock: a live check against the real sources needs its own `fetch` (e.g. built on `node:https`) passed to `runQuotes`.
- Before saying a task is done, run the tests, typecheck and lint.
- **Standalone Android APK:** `npx eas-cli@latest build -p android --profile preview` (EAS cloud build, `eas.json` profile `preview` = installable APK, package `com.pocketledger.app`). It is a release build: `__DEV__` is false (no Development section), its database is separate from Expo Go's, and monthly reminders work on Android. The app must keep working in Expo Go too.
