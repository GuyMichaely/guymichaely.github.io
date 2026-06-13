# Portfolio Dashboard Technical Documentation

This document describes the current implementation structure and technical contracts.

## Runtime Model

The app is a static browser application with no build step. `index.html` loads global scripts in dependency order. That order is intentional and required because modules share global constants, state, and functions.

The DOM ids/classes in `index.html` are treated as a hard runtime contract. Event binding and render helpers query required nodes directly rather than guarding for missing markup.

The page should be served over HTTP when using the rebalance optimizer. The optimizer runs in a Web Worker and loads `glpk.js` plus `glpk.wasm`; browser worker and WASM loading rules are more reliable from a local server than from `file://`.

For local development, serve the repository root and open the served URL. A simple example is `python3 -m http.server 8765`, then `http://127.0.0.1:8765/`.

Bundled browser dependencies are `d3.min.js` for SVG charting and pie generation, plus `glpk.js`/`glpk.wasm` for rebalance optimization.

The runtime assumes a browser with Web Worker and WASM support. There is no compatibility fallback for browsers that lack those capabilities.

## Data Contract

The API payload is assumed to be complete and correctly formatted.

The API URL lives in browser storage under `financialDash.apiUrl`, set from the sidebar; it is the deployment's only secret and is intentionally absent from the source. The browser cache stores the complete dashboard payload with a saved timestamp wrapper. Cache absence is a normal lifecycle state. The app reads that cache entry on normal page load and performs an `everything` fetch when it is absent. It does not compare cached payload metadata to an app version. Sector weights remain part of that cached payload as `[sectorNames, weightsByTicker]`.

The API supports three refresh modes via the `mode` query parameter:

- `prices`: returns `priceMap` only. The browser merges it into the cached complete dashboard payload and reuses cached holdings and sector weights.
- `holdings`: returns holdings, prices, dashboard metrics, and sector weights only for tickers absent from the cached dashboard payload. The browser sends its cached sector ticker list as JSON in `knownSectorTickers`.
- `everything`: returns holdings, prices, dashboard metrics, and sector weights for every held security ticker. The browser replaces the cached dashboard payload from this response.

The deployment URL is reachable by anyone who finds it, so the server validates every request at the trust boundary before touching the spreadsheet: modes, action names, field types, account/row lookups, lot row numbers, and sellable share counts. Validation failures return code `BAD_REQUEST`; any other server error is caught and returned as code `INTERNAL` rather than leaking an HTML error page. Lookups that would otherwise write or delete outside their named range (for example deleting by a name that is not a classified account) are rejected by these checks.

API failures are returned as JSON with an `error` object. Sector-resolution failures use code `SECTOR_WEIGHT_RESOLUTION_FAILED` and include the offending ticker. Yahoo external request failures use `YAHOO_NETWORK_REQUEST_FAILED`, `YAHOO_HTTP_REQUEST_FAILED`, or `YAHOO_RESPONSE_ERROR`, also with the ticker being resolved. Browser-side dashboard API network failures use `DASHBOARD_API_NETWORK_FAILED`; non-2xx or non-JSON responses surface as `DASHBOARD_API_BAD_RESPONSE`.

The API also accepts POST mutations for spreadsheet-backed data management. The browser sends `actions`, an ordered array of mutation objects each with an `action` field, plus its cached sector ticker list; the server applies the actions in order and returns one payload. Supported actions are `createAccount`, `updateAccount`, `deleteAccount`, `updateCashEquivalent`, `deleteCashEquivalent`, `updateOtherDebt`, `deleteOtherDebt`, `recordTrade`, and `addPurchase`. Mutation POSTs are serialized in the browser: at most one request is in flight at a time. A successful mutation returns updated holdings, prices, dashboard metrics, and sector weights only for tickers absent from the cached sector ticker list; the browser merges those sector weights into the cached complete payload and replaces the cache. Network and server API errors are reported in the Data management status line.

Expected top-level API fields:

- `priceMap`: object keyed by ticker.
- `accounts`: array of account objects.
- `cashEquivalents`: array of external cash-equivalent rows from the `cash+equivalents` sheet, defaulted to `Individual` account type.
- `otherDebts`: array of debt rows from the `other debt` sheet with `name`, positive `balance` and `monthlyInterest` magnitudes (absent cells emitted as `0`), and `contributesToCashFlow`.
- `sectorWeights`: `[sectorNames, weightsByTicker]`.
- `dashboardMetrics`: FIRE and cash-flow inputs.

Account objects are expected to include `accountName`, `accountType`, `accountTypeKey`, `holdings`, `financing`, and `maintenanceByTicker`. `holdings` are security rows from the account tab and include the source spreadsheet row number used by sell mutations. Individual holdings include `term`, `date`, and `perShareBasis`; Roth and pre-tax holdings use account-type term/profit treatment. `financing` rows are account-tab cash/debt entries with `kind`, numeric `balance`, numeric `monthlyInterest`, and `contributesToCashFlow`; absent sheet balance/interest cells are emitted as `0`. `maintenanceByTicker` is derived from the account tab's side table and is used only when that account has a positive margin balance. It covers every held ticker: tickers absent from the side table and empty maintenance cells are emitted as `0`, so margin math stays finite until a real rate is entered in the sheet.

Ticker, account, account-type, term, and sector identifiers are exact-match trusted fields. The browser does not trim, uppercase, stringify, or otherwise normalize those identifiers after data is loaded. Sector weight vectors are trusted as API output and are not renormalized in the browser.

`sectorWeights` uses a shared sector-name vector plus one same-length numeric vector per ticker. Zero-weight sectors are dropped from the per-ticker sparse map. Ticker vectors are expected to match the sector-name vector and sum to 1.

The server does not persist sector weights to the spreadsheet. Each API request calculates only the sector weights required by that refresh mode, memoizing repeated tickers within that request only. Yahoo quote-summary requests are sent in `UrlFetchApp.fetchAll` batches, controlled by `YAHOO_QUOTE_SUMMARY_BATCH_SIZE` and `YAHOO_QUOTE_SUMMARY_BATCH_DELAY_MS` in `server/sectors.gs`. Equity funds use Yahoo's fund sector-weighting table when Yahoo provides one; commodity and bond/fixed-income funds without that table are mapped from Yahoo's fund category to the `COMMODITIES` or `BOND FUNDS` sector.

`dashboardMetrics` supplies monthly spend, cash balance, other debt, recurring income/expense totals, known-interest balance, known-interest portfolio-growth monthly delta, liquid interest growth, and debt servicing. The server derives those known-interest and cash-flow metrics from account financing rows, security expected-growth fields, `cash+equivalents`, and `other debt`.

Account mutations use the `AccountClassifications` named range. Account names are sheet tab names. Creating an account copies the corresponding account-type template sheet and appends the account classification row; creating a `cashEquivalent` or `otherDebt` "account" instead writes only the name into the first empty row of the `CashEquivalents` / `OtherDebts` named range, leaving balance and interest cells empty (absent balance/interest cells are emitted as `0`, like account financing cells). Individual accounts copy `_template_individual_account`; Roth and pre-tax accounts both copy `_template_tax_advantaged_account` because they share the same tab structure. Updating an account renames the sheet when the account name changes, updates the classification row, and rewrites the balance and cash-flow cells of the `cash` and `margin` rows in the account tab's financing table; the monthly interest cells are never written, so they can hold spreadsheet formulas. When the account type changes between Individual and tax-advantaged layouts, the server restructures the account sheet by inserting or deleting the whole `date` and `per share basis` spreadsheet columns, which keeps the financing and maintenance tables aligned because they sit to the right of the lot table; column formulas shift with the columns. Deleting an account deletes the classification row cells and hard-deletes the sheet.

The Accounts grid runs one save pipeline for row updates, deletes, and creates. The browser debounces edits per quiet period and keeps two queues: an ordered operation log of creates and deletes in click order, and per-row dirty flags keyed by `account:<name>`, `cashEq:<name>`, or `debt:<name>` using the row's last-saved name. Each send batches all queued work into a single request — the operation log chronologically (so create→delete→create cycles of the same name replay correctly), followed by one update per dirty row — and the next batch is sent after the previous response unless the user is mid-edit (an active debounce defers the send to its flush). Edits coalesce (a row's update carries its current state, however many edits produced it); creates and deletes replay individually. A failed batch is re-queued ahead of newer work and retried after a debounce interval. Requests are built at send time, so a delete queued behind an in-flight rename targets the post-rename name (renames remap dirty and pending-delete keys). Rows pending deletion render greyed and disabled without blocking the rest of the grid. Creates are optimistic: a synthetic row is inserted into client state and the grid immediately, payload applies copy the payload arrays and re-insert synthetic rows for still-pending creates (so optimistic rows survive intervening responses without contaminating the cached payload), and edits to a not-yet-confirmed row queue behind its create in the same pipeline. After a response is applied, dirty rows' input values and the focused field (with text caret position) are restored over the re-rendered grid. A failed work item is retained (a failed update re-marks its row dirty) and retries automatically one debounce interval after the error response; user edits push the retry later by resetting the debounce. With no API URL stored, the flush is blocked and the URL field is flagged rather than attempting a request. A fresh data load (page load, refresh, demo toggle, or adopting a URL) replaces the grid and clears any pending edit/op queues, so a pending key can never outlive the row it names.

`updateCashEquivalent` and `updateOtherDebt` write the name, balance, and cash-flow cells of the matching row in the `CashEquivalents` / `OtherDebts` named range, located by the original name in the range's first column. The monthly interest cell is never written. The delete variants remove the matching row's cells from the range, shifting later rows up. Debt balances are stored as positive magnitudes in the sheet; the grid negates them for display and negates the edited value back before sending, so `updateOtherDebt` receives the sheet-sign balance.

`recordTrade` identifies sold lots by account name plus spreadsheet row numbers from the most recent payload. This is intentionally a live-row contract: the app assumes the sheet is not edited between lookup and commit. A buy carries `accountName`, `ticker`, `shares`, `volume`, and (for Individual sheets) `date`, and appends a lot row at the first empty lot row, writing ticker and shares plus date and per-share basis (`volume / shares`). A buy also appends the ticker to the account tab's maintenance side table when missing, leaving the maintenance cell empty for the user to fill; absent maintenance cells are emitted as `0`, keeping margin math finite until a real rate is entered. A sell carries `sales` as `[{accountName, volume, lots: [{rowNumber, shares}]}]`, one entry per account, with each lot's share quantity taken from the picker's editable drafts and each account's volume summed from the per-lot volumes; a lot sold at its full sheet share count has its lot cells deleted (shifting later lot cells upward, which is why deletions are processed bottom-up), and a partially sold lot has the shares subtracted. When `settleWithCash` is set, the buy volume drains the buy account's `cash` balance cell to zero and any remainder increments its `margin` balance cell; each sale account's volume first reduces its `margin` balance cell (down to zero) and the remainder increments its `cash` balance cell.

`addPurchase` carries `date`, `amount`, and `categories` (a string array split from the `|`-separated input). It appends a row to the Purchases sheet at the first row whose amount cell is empty (scanning from the data start), writing the date to the `date` column, the amount to the `spent (net of cc rewards)` column as a formula when it begins with `=` (`setFormula`) and otherwise as a value (`setValue`, which Sheets coerces to a number), and each category tag into successive columns from `categories` onward. The browser previews `=` expressions by evaluating the arithmetic locally (restricted to a numeric/operator character set); an expression outside that set is shown as uncomputable but still submitted for the sheet to evaluate. The Purchases `SpendPerMonth` cell averages the amount column over the tracking window, so the appended row flows into `dashboardMetrics.monthlySpend` on the next payload read.

## Script Responsibilities

- `app-state.js`: global constants and mutable application state.
- `app-format.js`: formatting, parsing, sorting, escaping, and small numeric helpers.
- `app-dom-utils.js`: shared DOM render helpers for stats and the virtual table renderer. `createVirtualTableRenderer` renders rows as a windowed slice between two spacer rows sized from a measured row height, re-sliced on scroll with overscan, so the tbody height and scrollbar match the full list while only nearby rows exist in the DOM. The filtered-lot table and the Record trades sell picker both use it; a table measured while hidden re-measures on its next visible render.
- `app-chart-utils.js`: reusable SVG/XY chart rendering and hover behavior.
- `app-resize.js`: resize-handle behavior for filter lists, sale target breakdowns, rebalance transactions, and filtered lot rows.
- `app-data-loader.js`: cache/API loading, applying prepared data, and triggering initial render.
- `app-data-management.js`: account creation/deletion, the autosaving account grid, and the trade-recording UI backed by POST mutations.
- `app-data-model.js`: API payload conversion into security lots, cash pseudo-positions, sector weights, account-financing-derived margin config, sorted lots, and margin summaries.
- `app-fire.js`: net worth, cash flow, FIRE-rate sensitivity, and FIRE display updates.
- `app-portfolio-model.js`: filtering, sector exposure math, pie slice construction, rebalance payload construction, and transaction aggregation.
- `app-portfolio-views.js`: filters, concentration charts, exposure target UI, trade filters, rebalance worker lifecycle, and rebalance rendering.
- `app-sale-model.js`: sale path generation, margin paydown simulation, companion sale series, and target transaction aggregation.
- `app-sale-planner.js`: sale planner rendering and disabled-state handling.
- `app-sale-targets.js`: linked sale amount/profit/margin target inputs.
- `app-dashboard-render.js`: top-level dashboard render coordination.
- `app.js`: event binding and startup.
- `app-rebalance-worker.js`: GLPK-based rebalance optimization in a Web Worker.

## Portfolio Model

Each security lot stores account type, account name, ticker, term, shares, price, value, profit, sale value, realized profit, profit per dollar, and sector weights.

The browser appends cash pseudo-positions after converting API holdings. Each loaded account's positive `cash` financing balance becomes a pseudo-position with that account's account type and account name, sector `CASH`, ticker `CASH`, term `CASH`, value equal to the cash balance, and profit `0`. The browser also appends one residual cash pseudo-position with account type `Individual`, account name `Net cash`, sector `CASH`, ticker `CASH`, term `CASH`, and value equal to total cash balance minus loaded-account cash, brokerage margin debit, and other debt.

Cash pseudo-positions participate in dashboard filters, value totals, concentration views, and rebalance target exposure. They are excluded from sale-sorted lots, margin summaries, trade filter values, rebalance sell/buy candidates, and filtered lot table rows.

Account profit treatment is determined by account type:

- `Individual`: profit is based on cost basis.
- `Roth`: profit is treated as zero.
- `Pre-tax`: profit is treated as the full sale value.

Sector weights are sparse per ticker. A ticker can contribute to one or more sectors, and weighted exposure calculations use the provided sector weights directly.

Total sector exposure is expected to equal security value plus cash exposure because API sector weights are assumed to sum to 1 for every security ticker and cash pseudo-positions have a single `CASH` sector weight. Rebalance target dollars use the sector-weighted exposure total directly rather than falling back to raw portfolio value.

Dashboard summary totals use whole-lot values unless the sector filter is partially selected. In that case, value and profit totals include only the selected sector-weighted fraction of each matching lot.

The summary pane renders filtered value and filtered profit in one paired stat. Concentration pies aggregate raw metric values by slice first, then render only slices with positive aggregate amounts. This means profit slices net gains and losses within the slice before deciding whether the slice is visible. Pie legends render compact dollar amounts and three-significant-digit percentages.

Margin accounts are derived from account financing rows with positive `margin` balances and the same account tab's per-ticker maintenance rules.

Margin summaries are derived from current account lots, debit, and maintenance rules. For each margin account, the app computes current excess equity and later uses that value to decide how much sale cash must be reserved for margin paydown.

Dashboard filters and trade filters are separate:

- Dashboard filters determine which lots feed the summary, concentration views, sale planner, and filtered lot table. They also gate which holdings the Record trades sell picker offers: account type, account name, ticker, and term match exactly, and the sector filter admits a holding when any nonzero sector component of its ticker is selected. The sell request still targets the single account derived from the selected lots.
- Trade filters determine which lots can be sold and which held tickers can be bought by the rebalance optimizer.

Filter and trade-filter value lists are derived from loaded lots, with account-name and account-type lists additionally unioned with the loaded accounts so lot-less accounts appear. When filters are re-initialized after a data apply, selections, deselections, and search text carry over for values that were previously offered; values offered for the first time start selected. Exposure targets and realization limits still reset to data-derived defaults on every apply.

Trade eligibility modes are `sell` and `buy`.

Rebalance buy candidates are ticker-level candidates derived from currently held security tickers. The optimizer does not choose a destination account for purchases; buy rows are rendered without an account. Purchase candidates therefore do not add margin-maintenance requirements. Margin handling is limited to reserving required paydown when eligible margin-account lots are sold.

Ticker price and sector weights are assumed to be ticker-level facts. If the same ticker appears in multiple accounts, the first buy-eligible occurrence supplies the purchase candidate's price and sector weights.

## FIRE Calculations

Net worth is portfolio value plus cash net of brokerage and other debt. Known-interest assets are assumed to be already included in net worth, not a separate additional asset bucket.

The editable FIRE rate is converted to an effective monthly coefficient. Unknown-rate assets use that coefficient. Known-interest balances remain excluded from FIRE-rate growth; their non-cash-flow monthly delta stays in portfolio growth, while liquid interest growth and debt servicing flow through net monthly cash flow.

## Sale Planner

The tax-efficient sale mode sells eligible lots by ascending profit per dollar. The keep-mix mode sells proportionally by ticker among positive-sale-value ticker groups while selecting lower-profit lots within each ticker first. Zero-sale-value lots with nonzero realized profit are represented at the start of the keep-mix curve at `x = 0`.

Sale mode state uses `tax` and `constant`.

Margin sale tracking simulates required paydown as lots are sold. Net sale proceeds equal gross sale dollars minus required margin paydown.

The margin sale tracker updates account market value, required equity, debit, and required paydown as each simulated sale is applied.

Sale path results are cached by sale mode and dashboard filter selection. The cache is strictly an in-memory performance cache, keeps at most 16 entries, and fresh API data clears it.

Companion sale series use gross-sale checkpoints from the main sale curve. Display-axis conversion assumes every companion point exists in the sale curve's gross-to-display lookup.

Sale chart axes exposed in the UI as `Log X` and `Log Y` use D3 `scaleSymlog`, not true logarithmic scales. This is intentional so the same charting path can display zero values and negative realized profit.

Sale X-axis modes are `net` and `gross`.

Profit target lookup scans the sale curve from left to right and returns the first segment crossing the requested profit. This is intentional because the realized-profit curve can be non-monotonic; the UI chooses the earliest matching point on the sale curve rather than trying to infer user intent among multiple mathematically valid crossings.

The sale planner is intentionally disabled for partial security-sector filters because a holding can be sold only as a lot, not as an isolated sector slice. `CASH` sector selection is not part of that disabled-state check because it is not a sellable holding.

Target inputs are text fields so formatted currency values can be displayed. Blank or in-progress input clears the optional target state; once a target is linked, the rest of the sale-target rendering treats the stored target values as numeric invariants. Internal sale transaction construction assumes the UI has already clamped target sale amounts to the curve domain.

## Rebalance Optimizer

The rebalance optimizer builds a linear or mixed-integer optimization model in `app-rebalance-worker.js` and solves it with GLPK.

Dollar-valued LP variables and constraints are scaled into thousand-dollar units before they are sent to GLPK. Solver results are converted back to dollars before plans are rendered. This keeps coefficient magnitudes smaller and reduces numerical instability without changing the user-facing dollar semantics.

The objective is lexicographic:

1. Minimize total sector target residual.
2. Minimize net realized gains subject to the best target residual.
3. Minimize gross trade volume, meaning sell dollars plus buy dollars, subject to the best target residual, best net realized gains, and ticker side choices selected by the tax phase.

The tax objective is net realized gain, not gross realized gain and not positive realized gain. Realized losses can improve that objective.

Rebalance realization limits are hard LP constraints. `minGrossGain` adds a lower-bound constraint on the sum of positive realized-profit sell terms. `maxGrossLoss` adds an upper-bound constraint on the absolute value of negative realized-profit sell terms. Their defaults are `$0` for minimum gain and the full loaded sell universe's possible gross loss for maximum loss.

Buy variables are funded by sales and existing cash used in the plan. Sell variables are bounded by eligible lot value. The cash constraint requires sales plus existing cash used to fund buys, unused cash, and required margin paydown.

Tickers that are both buy-eligible and sell-eligible are constrained to one side. Phase 1 and phase 2 use binary side variables. Phase 3 reuses the tax-optimal side choices from phase 2, which keeps the final volume minimization continuous while preserving the prior objective constraints. If phase 2 leaves an overlapping ticker unused, phase 3 also leaves that ticker unused. This makes phase 3 optimal conditional on the full phase-2 side assignment, not across every possible side assignment that may have the same target gap and net realized gain.

Margin constraints ensure sales from margin accounts reserve enough cash for required maintenance paydown. Purchases are accountless ticker-level rows and do not change maintenance requirements. `CASH` is a target exposure, not a buy/sell candidate: sells increase it, buys decrease it, and margin paydown leaves it unchanged because both cash and margin debt decline. If the eligible universe cannot hit target allocations exactly, residual under/over amounts are reported by sector and in aggregate.

Rebalance transaction actions are `Sell` and `Buy`.

Positive final rebalance cash generated by the transaction plan is reported as unallocated sale cash. Existing cash used by the transaction plan is reported separately. The cash constraint assumes sales plus existing cash used fund buys, unused cash, and required margin paydown.

Plan construction uses the internal `residual`, `tax`, and `trade` objective phases. Every model build passes an explicit limit handoff object. Constraint bounds use `fixed` and `upper`. An explicit `null` variable bound means "unbounded".

Phase handoffs use a dollar tolerance of `max($0.004, abs(limit) * 1e-9)` so GLPK numerical noise does not make the next lexicographic phase infeasible after an optimal previous phase.

The worker posts phase progress and phase-result messages. Phase-result messages use `target` for phase 1 and `tax` for phase 2, and both include exposure-bearing plan objects. The main thread uses those messages to update elapsed status, residual indicators, achieved percentages, and net realized gain before the final transaction list is available. Phase 1 reports the achieved allocation from the target-gap solve immediately. That allocation may change after phase 2, because phase 2 selects a tax-optimal solution from the phase-1 target-gap optimum set.

The worker URL includes a manual version query string in `app-portfolio-views.js`. Bump that value whenever `app-rebalance-worker.js` changes so browsers do not keep running stale optimizer code.

## UI State

Dashboard filters affect concentration charts, sale planner inputs, summary stats, and filtered lot rows. Trade filters affect only the rebalance optimizer.

The main layout is a desktop-first two-column shell. The left Filters sidebar owns the refresh button, section navigation, and global dashboard filter DOM. The sidebar can collapse to a narrow rail, can be horizontally resized while expanded, and its filter grid reflows with available sidebar width. The sidebar content is one scroll container below the sticky header, so section navigation and filter selections scroll together. Section navigation links use `data-section-nav` values that match main section IDs, and `app.js` updates the active nav item from scroll position.

Exposure target locks affect normalization only. Locking or unlocking without a target percentage change should not restart the optimizer.

Exposure targets are stored as percentages. Each target row also stores a presentation mode for percent or dollar entry; dollar input is converted to a percentage of the current rebalance exposure base before state is updated and normalization runs.

Rebalance realization limits are initialized when dashboard data is applied. Filtering sell eligibility does not rewrite the realization-limit inputs; the initial maximum-loss default remains nonbinding when the sell universe is narrowed because narrowing can only reduce possible gross loss.

Exposure target input handling constrains user-entered security-sector values to `[0, 100]` before updating state. `CASH` can be negative and is constrained only by the shared `100%` upper bound. The normalization model, rebalance payload builder, and worker treat stored exposure targets as already UI-bounded numeric invariants and do not defensively clamp them again.

Resetting exposure targets to current exposure also clears target locks. If target exposure equals current exposure, the worker returns a no-op plan without loading GLPK.

Custom resize-handle containers store heights in `state.resizeHeights` and are active on desktop and mobile. Dashboard filter groups, trade filters, sale target breakdowns, target sale rows, rebalance transactions, and filtered lot rows use the shared resize-handle behavior. Resize maximums are calculated from each inner scroll container's remaining `scrollHeight - clientHeight`; grouped resizers, such as the rebalance trade filters, use the largest remaining inner scroll amount.
