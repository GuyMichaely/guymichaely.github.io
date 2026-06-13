function initializeFilters() {
  const previous = {
    filterValues: state.filterValues,
    selected: state.selected,
    filterSearch: state.filterSearch,
    tradeFilterValues: state.tradeFilterValues,
    tradeSelected: state.tradeSelected,
    tradeFilterSearch: state.tradeFilterSearch
  };

  state.filterValues = {};
  state.tradeFilterValues = {};
  state.selected = {};
  state.filterSearch = {};
  state.tradeSelected = { sell: {}, buy: {} };
  state.tradeFilterSearch = { sell: {}, buy: {} };
  state.exposureLocked = new Set();

  for (const filter of FILTERS) {
    const values = getFilterValues(filter.key);
    state.filterValues[filter.key] = values;
    state.selected[filter.key] = carrySelection(values, previous.filterValues[filter.key], previous.selected[filter.key]);
    state.filterSearch[filter.key] = previous.filterSearch[filter.key] ?? "";
  }

  for (const filter of TRADE_FILTERS) {
    state.tradeFilterValues[filter.key] = getTradeFilterValues(filter.key);
  }

  for (const filter of SELL_TRADE_FILTERS) {
    state.tradeSelected.sell[filter.key] = carrySelection(state.tradeFilterValues[filter.key], previous.tradeFilterValues[filter.key], previous.tradeSelected.sell[filter.key]);
    state.tradeFilterSearch.sell[filter.key] = previous.tradeFilterSearch.sell[filter.key] ?? "";
  }

  for (const filter of BUY_TRADE_FILTERS) {
    state.tradeSelected.buy[filter.key] = carrySelection(state.tradeFilterValues[filter.key], previous.tradeFilterValues[filter.key], previous.tradeSelected.buy[filter.key]);
    state.tradeFilterSearch.buy[filter.key] = previous.tradeFilterSearch.buy[filter.key] ?? "";
  }

  resetExposureTargetsToCurrent();
  resetRebalanceRealizationLimits();
}


function carrySelection(values, previousValues, previousSelected) {
  if (previousValues === undefined) return new Set(values);

  const previouslyOffered = new Set(previousValues);
  return new Set(values.filter(value => previousSelected.has(value) || !previouslyOffered.has(value)));
}


function getAccountFilterValues(key) {
  if (key === "accountName") return state.accounts.map(account => account.accountName);
  if (key === "accountType") return state.accounts.map(account => account.accountType);
  return [];
}


function getFilterValues(key) {
  if (key === SECTOR_KEY) {
    return uniqueSorted(state.lots.flatMap(lot => Object.keys(lot.sectorWeights)));
  }

  return uniqueSorted([...state.lots.map(lot => lot[key]), ...getAccountFilterValues(key)]);
}


function getTradeFilterValues(key) {
  return uniqueSorted([...getSecurityLots(state.lots).map(lot => lot[key]), ...getAccountFilterValues(key)]);
}


function selectAllFilters() {
  for (const filter of FILTERS) {
    state.selected[filter.key] = new Set(state.filterValues[filter.key]);
  }
}


function render() {
  const scrollState = captureScrollState();
  renderNetWorthSummary();
  renderFilters();

  const filteredLots = getFilteredLots();
  state.filteredLots = filteredLots;
  state.pieSlices = buildPieSlices();

  const totals = getFilteredExposureTotals(filteredLots);
  const totalValue = totals.value;
  const totalProfit = totals.profit;
  const tickers = new Set(filteredLots.map(lot => lot.ticker));
  const filteredSecurityLots = getSecurityLots(filteredLots);
  const securityLots = getSecurityLots(state.lots);

  renderActivePie();
  renderExposurePlanner();
  scheduleSalePlanner();
  scheduleLotRows();

  document.getElementById("totalValue").textContent = formatCurrency(totalValue);
  document.getElementById("totalProfit").textContent = formatCurrency(totalProfit);
  document.getElementById("totalProfit").style.color = totalProfit >= 0 ? "var(--good)" : "var(--danger)";
  document.getElementById("tickerCount").textContent = tickers.size.toLocaleString();
  document.getElementById("lotCount").textContent = filteredSecurityLots.length.toLocaleString();
  document.getElementById("statusText").textContent = `${filteredSecurityLots.length.toLocaleString()} of ${securityLots.length.toLocaleString()} security lots included.`;
  renderTradeSection();
  restoreScrollState(scrollState);
}
