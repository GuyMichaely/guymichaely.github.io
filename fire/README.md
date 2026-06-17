# Portfolio Dashboard Feature Documentation

This document describes the user-facing behavior of the portfolio dashboard.

## Data Loading

The dashboard loads portfolio data from the API URL, which is entered in the sidebar's `API URL` field and persisted in browser storage — it is not part of the source code. A scheme-less entry is tried as `https://` first and `http://` second. An entered URL is adopted only after it answers a full `Everything` probe successfully; on failure the field flags the error and keeps the typed value while the previously working URL (and its cached data) stays in use. Clearing the field removes the stored URL while keeping the cached data; an explicit fetch or save attempted without a URL flags the field and reports that an API URL is required. Without a stored URL, page load uses any cached payload, and with neither it shows an empty dashboard with a welcome card. The sidebar's data controls (refresh buttons, demo mode, API URL, freshness line) collapse behind the `Data` toggle. The most recent complete dashboard payload is cached in browser storage, including sector weights. Holdings refreshes send the ticker list already present in the cached payload so the server only recalculates sector weights for newly held tickers.

On normal page load, the dashboard uses cached API data when cached data exists; when it does not, the page load performs an `Everything` fetch. The sidebar refresh buttons provide three update levels:

- `Prices`: fetches current prices and reuses cached holdings and sector weights.
- `Holdings`: fetches current holdings and prices, sends the locally cached sector ticker list, and receives sector weights only for tickers not already cached by the browser.
- `Everything`: fetches current holdings, prices, and all sector weights from scratch, replacing the cached dashboard payload.

If the server cannot complete a refresh, the Summary status line reports the server error code and message. Sector-resolution failures include the offending ticker.

The sidebar shows when the displayed data was fetched (`Data as of …`, from the cached payload's timestamp); the line is absent while demo mode is active. On a first run with no cached data and no API URL, a welcome card at the top of the page points to the API URL field and demo mode; it disappears once data loads.

## Demo Mode

The `Demo mode` button in the sidebar swaps the dashboard to a built-in fake portfolio so the app can be shown without revealing real financial details. When cached data exists, entering prompts for a password that will be required to exit; the password check is a client-side convenience against shoulder-surfing, not real security. When no cached data exists there is nothing to protect, so entering and exiting need no password. Demo mode persists across reloads, so refreshing the page never flashes real data. While in demo mode the refresh buttons are disabled, data-management edits, creates, deletes, and trades are inert (the status line says changes are not saved), the locally cached real payload is untouched, and the `API URL` field does not show the stored URL. A real save still in flight when demo mode is entered updates the cache when it completes but never the screen; save responses from a previous API URL are discarded outright. Exiting with the correct password restores the real data from cache and resumes any pending saves. When no cached data exists, exiting also clears the demo data from the page, leaving the welcome card. Alternatively, entering a new API URL while in demo mode exits without a password by taking the app over: once the new URL answers a probe successfully, the protected cache and any pending saves for it are replaced — never shown — by the new backend's data; a failing URL leaves demo mode untouched.

## Layout

The dashboard uses a collapsible left Filters sidebar, horizontally resizable without limits in either direction (sidebar contents clip when it is too narrow; the main content squeezes when it is too wide) for data refresh actions, section navigation, and global dashboard filters. The main page is organized into major working areas:

- FIRE summary
- Portfolio concentration
- Filter summary
- Tax-lot sale planner
- Exposure rebalance planner
- Data management
- Robinhood export conversion
- Filtered lot table

The sidebar section navigation highlights the active main section while the page scrolls. Info popovers throughout the app appear while their info button is hovered or keyboard-focused and disappear when hover and focus leave.

Most analytical panels update from the same global dashboard filters. The rebalance planner has its own trade eligibility filters because "included in the dashboard" and "eligible to trade" are separate decisions.

The rebalance planner's current exposure and target percentages are based on the full loaded portfolio, not the dashboard filter selection.

## FIRE Summary

The FIRE section summarizes current net worth, expected monthly net worth change, cash flow, and FIRE-rate sensitivity.

The user can edit the FIRE rate input. Related figures update immediately, including:

- Current net worth and expected monthly net worth change
- Portfolio value and cash net of debt
- Expected portfolio growth before cash flow
- Net monthly cash flow
- Greatest portfolio drop survivable or percent addition needed
- Extra portfolio value needed

The net worth headline is built from portfolio value plus cash net of brokerage debt and other debt. Brokerage margin debit is shown separately from other debt.

Cash flow includes recurring income and expenses, purchases, debt servicing, and liquid interest from known-rate balances marked as cash-flow-contributing.

Known-rate asset delta is modeled as a net-worth growth component only for known-interest balances that are not marked as cash-flow-contributing. The known-interest balance is treated as part of existing net worth, not as an additional asset bucket.

The minimum FIRE assumption portfolio can support is derived from current assets and cash-flow needs; changing the editable FIRE rate changes the comparison color, not the minimum assumption value.

FIRE sensitivity fields that are mathematically undefined for the current inputs show `—`. This happens when a support metric would require division by zero, such as a 0% FIRE assumption for portfolio-needed calculations, zero net worth for percentage-addition calculations, or no unknown-rate assets for the minimum supportable FIRE assumption. The minimum supportable FIRE assumption also shows `—` when the monthly coefficient needed to balance cash flow is outside the annual-rate formula's domain.

## Concentration Views

The Concentration panel shows portfolio concentration across multiple dimensions:

- Account type
- Account name
- Sector exposure
- Ticker
- Holding term

Each concentration view can show value, profit, or both. The `Value` and `Profit` controls in the Concentration header toggle those chart types. If only one chart type is visible, the remaining pie is centered and given more horizontal room.

Both pie types aggregate by slice first, then display only slices whose aggregate amount is positive. The value pie uses current holding value. The profit pie uses realized profit, so gains and losses inside the same slice are netted before deciding whether the slice is visible.

Cash appears as cash pseudo-positions in the value-based dashboard filters, summary totals, concentration views, and rebalance targets. Cash held inside loaded accounts uses that account's account type and account name with `CASH` as its sector, ticker, and term. Residual cash outside those accounts, net of brokerage margin and other debt, uses account type `Individual`, account name `Net cash`, and the same `CASH` sector, ticker, and term.

Cash pseudo-positions have zero profit, so they do not create profit-pie slices. If residual cash is negative, the value pie does not draw a negative slice; pies display only positive aggregate slice values. The `CASH` sector and `CASH` term filters are linked because they represent the same cash classification.

Profit follows account treatment: individual accounts use cost basis, Roth accounts show zero taxable profit, and pre-tax accounts treat the full sale value as realized profit.

Pie slices and legend rows can be clicked to include or exclude values from the dashboard filter state. Shift-click isolates a single value.

The concentration carousel can be changed with the previous/next buttons or by clicking a view tab. Each visible pie card also has a local `Hide` button for quickly removing that metric from the current view; the header controls can restore hidden metrics.

Sector exposure is weighted. Funds can contribute to multiple sectors, while individual companies typically contribute to one sector. When sector filters are partially selected, holdings are included according to the selected sector-weighted portion.

The `Hide inactive` option hides inactive legend rows from the visible legend. It does not change selected filters or chart totals. Legend rows use alternating shading to make color dots, labels, compact dollar values, and percentages easier to scan horizontally.

The sector info button explains weighted sector exposure and why partial sector filters disable the sale planner.

## Filters

The Filters sidebar provides include/exclude controls for:

- Account type
- Account name
- Sector exposure
- Ticker
- Holding term

The global dashboard filters live in the left sidebar. The sidebar can be collapsed, scrolled, and horizontally resized. The sidebar header stays visible while the section navigation and filter selections scroll together. Wider sidebar widths let filter groups reflow into additional columns. Each filter group can be vertically resized until its chip-list scrollbar has enough room to disappear. Clicking a filter value toggles it. Clicking a filter header selects all values or clears all values in that filter. Filter search boxes narrow long filter lists without changing selection.

Account-name and account-type filter values include every loaded account, including accounts that currently contribute no lots, so newly created accounts appear immediately. Filter selections and searches survive data refreshes and saves: values that disappear are dropped, values new to the dashboard arrive selected, and existing selections are kept. The same persistence applies to the trade-eligibility filters in the rebalance planner.

Filter groups can be resized vertically with their drag handles on desktop and mobile.

The Summary panel reports filtered value, filtered profit, number of tickers, and number of security lots included by the current dashboard filters.

When sector exposure is partially filtered, filtered value and filtered profit use only the selected sector-weighted portion of mixed-sector holdings. Non-sector filters include or exclude whole lots.

## Tax-Lot Sale Planner

The Tax-lot sale planner calculates sale paths using eligible tax lots. It can operate in:

- Tax-efficient mode: sells lots sorted to realize losses first and gains last.
- Keep mix mode: sells proportionally by ticker while using the lowest-profit lots inside each ticker first.

Sale profit follows the same account treatment used elsewhere in the dashboard: basis-based for individual accounts, zero for Roth accounts, and full sale value for pre-tax accounts.

The sale curve can use either:

- Net proceeds: gross sale dollars minus required margin paydown.
- Gross sale dollars: total dollars sold before margin paydown.

The sale planner also supports optional log-style scaling for the X and Y axes through the `Log X` and `Log Y` controls. The chart uses symlog internally, which is log-like away from zero while still displaying zero and negative realized-profit values.

The sale summary reports:

- Maximum pull-out or maximum sale, depending on the selected X-axis mode
- Final realized profit
- Eligible lots
- Eligible tickers
- Margin paydown

The target inputs are linked:

- Entering a sale amount populates the matching profit target.
- Entering a profit target populates the matching sale amount.
- Clicking a chart point sets the sale amount target.

Sale amount and profit fields accept plain numbers or currency-formatted numbers. Empty or in-progress target text clears the linked target and hides target-specific breakdown rows.

Sale amount and profit targets are clamped to the available sale curve. Values below the curve minimum use the minimum point, and values above the curve maximum use the maximum point.

If a realized-profit target appears at more than one point on the sale curve, the planner uses the earliest matching point on the curve.

The companion sale charts show dollars sold and realized profit by account type, account name, sector exposure, ticker, and holding term. The companion carousel can be changed with previous/next buttons or by clicking a breakdown tab.

Target breakdowns show volume and realized profit at the linked target. Breakdowns are available by account type, account name, sector exposure, ticker, and holding term. The active breakdown and the second account/ticker sales list can each be resized vertically.

The sale planner is disabled while security sector exposure is partially filtered, because holdings cannot be sold as sector slices. Selecting or excluding the `CASH` sector by itself does not disable the sale planner.

## Exposure Rebalance Planner

The Exposure rebalance planner lets the user set target sector allocations, including the `CASH` allocation. Sector targets auto-normalize to 100%. Individual sector targets can be locked during normalization.

The realization constraint row lets the user require a minimum gross realized gain and cap maximum gross realized loss. The default minimum gain is `$0`, and the default maximum loss is the full loaded sell universe's possible gross loss, so the defaults do not constrain the plan. `Reset limits` restores those defaults without changing sector targets.

Each target row can be edited as either a percentage or dollar amount. Dollar entries are converted to the equivalent percentage of the current rebalance exposure base before target normalization runs.

The exposure target UI constrains security-sector targets to the `[0, 100]` range before updating the planner. The `CASH` target can be negative, which represents a leveraged cash allocation.

Current sector percentages are shown in each target control. Achieved percentages and residual indicators are shown only after a rebalance result exists and the requested target allocation differs from current exposure.

Trade eligibility is controlled separately for sell and buy universes. Sell eligibility works at the lot level. Buy eligibility is based on eligible tickers already present in the dashboard. A ticker can be bought or sold in a rebalance plan, but not both.

Buy recommendations are ticker-level purchases, not account-specific purchases. Buy rows in the transaction table leave the account column blank.

The rebalance planner does not model transaction costs, wash-sale rules, destination accounts for buys, or account-specific placement preferences.

The optimizer runs in phases:

1. Minimize target gap.
2. Minimize net realized gains without worsening the best target gap.
3. Minimize gross trade volume, meaning sell dollars plus buy dollars, without worsening the best target gap or best net realized gains, using the buy/sell ticker directions selected by the tax phase.

Because the second phase minimizes net realized gains, realized losses can be favored when they improve the net result.

Realization constraints are hard constraints. Minimum gross gain is measured as the sum of positive realized profit from sell rows. Maximum gross loss is entered as a positive dollar amount and measured as the absolute value of realized losses from sell rows.

Margin maintenance requirements are included when eligible margin-account lots are sold. Sale proceeds may be reserved for required margin paydown before remaining cash is available for purchases. Purchase rows do not model a destination account or new maintenance requirement.

`CASH` is not a tradable ticker. Rebalance sells increase cash exposure, buys decrease cash exposure, and required margin paydown does not change cash exposure because cash and margin debt both decline. If the requested allocation lowers cash exposure, the plan can use existing cash for purchases.

The dashboard shows elapsed time and interim achieved sector percentages before the final transaction list is available. The target-gap phase may annotate the sector controls with an achieved allocation that later changes after the tax phase, because residual-gap solutions can have multiple equally good target-gap results.

The final trade-volume phase does not reconsider whether an overlapping buy/sell ticker should switch sides after the tax phase. If the tax phase leaves such a ticker unused, the final phase leaves it unused too.

If the eligible trade universe cannot exactly reach the requested targets, the dashboard reports a residual target gap and shows achieved percentages on the sector allocation controls. `Under` means achieved dollars below target in one or more sectors; `over` means achieved dollars above target in one or more sectors.

The rebalance summary reports gross trade volume as sell dollars plus buy dollars. The final transaction table lists action, account, ticker, dollars, shares, and realized profit, and can be resized vertically with its drag handle. While no plan with transactions exists, the table is hidden and a placeholder message explains that planned transactions will appear once a rebalance plan is calculated.

Resetting targets to current exposure returns the target allocation to the dashboard's current sector mix and clears target locks. If targets match current exposure, the planner produces a zero-transaction rebalance. Locking or unlocking a sector affects only future target normalization; it does not itself request a new optimization unless the target percentages change.

The sell and buy trade filter sections can be resized vertically on desktop and mobile. Search boxes inside those filters narrow long ticker or account lists without changing eligibility by themselves.

## Robinhood Export Conversion

The Robinhood export conversion section turns a GainsKeeper "Unrealized Lots" PDF (the tax-lot report Robinhood exports) into text that can be pasted into a spreadsheet. The user picks a PDF with the file input; the file is read and parsed entirely in the browser and is never uploaded. The output is a read-only text area of `\n`-separated rows, each a tab-separated `ticker`, `date`, `shares`, `per share basis` (the report's Cost/Share value), in the report's top-to-bottom order. The status line reports how many lots were converted, or the error if the PDF could not be read. A `Copy` button copies the output to the clipboard, falling back to selecting the text when the clipboard is unavailable. Rows that are not tax lots — the summary page, the repeated column headers, page footers, and the trailing Total row — are ignored. This section is independent of the dashboard's API data and works the same in demo mode.

## Filtered Lots

The Filtered lots section always displays the individual lots currently included by the dashboard filters; virtualization keeps it responsive at any size.

When enabled, the lot table shows security lots with account type, account name, sector label, ticker, term, shares, price, value, and profit. Cash pseudo-positions are not shown as tax-lot rows. The lot table can be resized vertically with its drag handle. Rendering is virtualized: the scrollbar reflects the full filtered list, but only the rows near the viewport exist in the document, so large filtered sets stay responsive.

## Data Management

The Data management section supports spreadsheet-backed account and lot maintenance without leaving the dashboard.

The Accounts view is an autosaving grid of loaded accounts with editable name, type, cash and margin balances, and cash-flow checkboxes, plus read-only monthly interest and lot count. A search box above the grid filters rows to those whose name contains the typed text (the cash/equivalent and debt rows are matched the same way); non-matching rows are hidden rather than removed, so their pending edits and saves are unaffected. Clicking a sortable column header (name, type, cash balance, cash monthly interest, margin balance, margin monthly interest, or lots) sorts the whole grid and toggles ascending/descending on repeat clicks, the same way the Record-trades sell picker sorts; the default is classification order (accounts, then cash/equivalents, then debts). The grid sits in a table that can be resized vertically with a drag handle at its bottom edge like the other tables in the app. A balance field accepts a plain number or, prefixed with `=`, a spreadsheet formula written into the cell verbatim (e.g. `=1500+300`); the grid then shows the cell's evaluated value, so a formula is write-only from the grid's view and a formula that errors in the sheet surfaces as a broken balance to be corrected. Edits save automatically: changes are debounced so saves do not fire per keystroke, only one save request is in flight at a time, and a save that finishes while the user is still editing waits for the editing pause before the next save fires. The status line above the tabs shows `Unsaved changes…`, `Saving…`, `Saved.`, or the save error; a failed save retries automatically one debounce interval after its error response, pushed later by further editing.

Deletes and creates do not block the grid. A row chosen for deletion greys out and locks while everything else stays editable, and disappears when the server confirms. Creating an account adds its row to the grid immediately — editable right away, with edits queued behind the create — clears the name field, and leaves the Create card enabled so further creations can be queued. Optimistic rows survive intervening saves and are never written to the local cache; reloading before a create completes loses it, like any unsaved edit. Everything runs through the same serialized save pipeline as edits. Monthly interest is maintained in the spreadsheet and is never written back by the dashboard. Changing an account's type between Individual and tax-advantaged restructures the account sheet's lot table columns; converted lots keep ticker and shares, and date/basis cells added by an Individual conversion start empty for the user to fill in. A labeled Create account card lives on its own `Create account` tab beside `Accounts`; new accounts are created from the selected account-type template, using the account name as the new sheet tab name, and immediately appear in dashboard and trade-eligibility filters. Deleting an account hard-deletes the account sheet after confirmation.

Rows from the `cash+equivalents` and `other debt` sheets appear below the account rows in the same grid with the same autosave behavior, typed as the plain text `Cash/equivalent` and `Debt`. Their margin and lot cells are empty. Editable fields are the name, the balance, and the cash-flow checkbox; monthly interest is read-only like account interest. Debt rows display their balance and interest as negative numbers — the sheets store positive magnitudes, and the dashboard flips the sign both ways. Each row has a Delete action that removes the sheet row after confirmation. The Create account card also offers the `Cash/equivalent` and `Debt` types, which append a named row to the corresponding sheet instead of creating a sheet tab; the new row starts with an empty balance and interest, which load as zero.

The Add purchase view logs an expense to the Purchases sheet. It takes a date (defaulting to today), an amount, and optional categories separated by `|`. The amount is either a plain number or an expression beginning with `=` that the sheet evaluates; for an `=` expression the form previews the evaluated value live and flags an expression it cannot compute in red, while still allowing submission. Saving appends a row — date, amount (stored as a value or a formula), and each category in its own column — and the FIRE monthly purchasing total updates from the sheet's recomputed average. The view is inert in demo mode like the other mutations.

The Record trades view records buys and sells. The `Settle with account cash` toggle controls whether balances move: when on, a buy drains the buy account's cash balance first and borrows any remainder by increasing its margin balance, and a sell's per-account volume first pays down that account's margin balance with the remainder credited to its cash balance; when off, only the lots change. Buys target the selected account and take a ticker, share quantity, total dollar volume, and — for Individual accounts — a purchase date defaulting to today; the per-share basis is volume divided by shares. In buy mode the form spans the panel with fields laid out in columns; in sell mode the form sits beside the lot picker.

The sell lot picker lists lots from every loaded account, gated by all of the dashboard sidebar filters: account type, account name, ticker, term, and sector exposure. A lot qualifies under the sector filter when any of its sector components is selected. Each row shows the lot's account (the term column is omitted — the sidebar term filter covers it); the account dropdown applies only to buys. Rows keep a constant height and fixed column positions whether or not a lot is selected or the table is scrolled. Column headers sort the list — clicking toggles ascending/descending, and the default is spreadsheet order (classification order across accounts, sheet row order within one). Lots are selected with per-row checkboxes and a single Select all / Deselect all toggle that operates on the currently visible lots; selection state lives outside the table, so Select all covers lots that are scrolled out of view. The picker is virtualized the same way as the filtered-lot table, so thousands of lots stay responsive. Changing the sidebar filters deselects lots that are no longer visible.

Selecting a lot turns its Shares cell into an editable quantity (defaulting to the full lot) and adds an editable per-lot Volume field. The volume defaults to the sold shares times the current price and tracks share edits until the user edits the volume directly, after which it is theirs. Whatever share quantity a lot shows at submit time is what gets sold: the full sheet amount removes the lot row, less subtracts. A sale may span accounts — lots are grouped per account behind the scenes, each account's volumes are summed for its cash settlement, and the summary shows the combined lots, shares, and dollars. A cross-account transfer can be recorded as a sell and a buy with settlement off.
