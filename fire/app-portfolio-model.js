const REBALANCE_TRANSACTION_ACTION_CONFIG = {
  Sell: {
    sortOrder: 0,
    hasAccount: true,
    hasRealizedProfit: true
  },
  Buy: {
    sortOrder: 1,
    hasAccount: false,
    hasRealizedProfit: false
  }
};

function getFilteredExposureTotals(lots) {
  const { all } = getSectorSelectionState();
  if (all) {
    return {
      value: sum(lots.map(lot => lot.value)),
      profit: sum(lots.map(lot => lot.profit))
    };
  }

  let value = 0;
  let profit = 0;
  for (const lot of lots) {
    const sectorWeight = getSelectedSectorWeight(lot);
    value += lot.value * sectorWeight;
    profit += lot.profit * sectorWeight;
  }

  return { value, profit };
}

function getSectorExposure(lots) {
  const exposure = {};
  let total = 0;

  for (const lot of lots) {
    total += lot.value;
    for (const [sector, weight] of Object.entries(lot.sectorWeights)) {
      exposure[sector] = (exposure[sector] ?? 0) + lot.value * weight;
    }
  }

  return { exposure, total };
}

function resetExposureTargetsToCurrent() {
  const { exposure, total } = getSectorExposure(state.lots);
  const sectors = Object.keys(exposure).sort((a, b) => exposure[b] - exposure[a] || a.localeCompare(b));
  const previousInputModes = state.exposureTargetInputModes;
  state.exposureTargetOrder = sectors;
  state.exposureTargets = {};
  state.exposureTargetInputModes = {};
  state.exposureLocked = new Set();
  state.exposureTargetMessage = "";

  for (const sector of sectors) {
    state.exposureTargets[sector] = exposure[sector] / total * 100;
    state.exposureTargetInputModes[sector] = previousInputModes[sector] ?? "percent";
  }
}

function resetRebalanceRealizationLimits() {
  const limits = {
    minGrossGain: 0,
    maxGrossLoss: getFullSellUniverseMaxGrossLoss()
  };
  state.rebalanceRealizationLimitDefaults = { ...limits };
  state.rebalanceRealizationLimits = { ...limits };
}

function getFullSellUniverseMaxGrossGain() {
  return sum(state.saleSortedLots
    .filter(lot => lot.value > MONEY_EPSILON && lot.profitPerDollar > 0)
    .map(lot => lot.value * lot.profitPerDollar));
}

function getFullSellUniverseMaxGrossLoss() {
  return sum(state.saleSortedLots
    .filter(lot => lot.value > MONEY_EPSILON && lot.profitPerDollar < 0)
    .map(lot => -lot.value * lot.profitPerDollar));
}

function getCurrentExposurePercentBySector() {
  const { exposure, total } = getSectorExposure(state.lots);
  const percents = {};

  for (const sector of state.exposureTargetOrder) {
    percents[sector] = exposure[sector] / total * 100;
  }

  return percents;
}

function normalizeExposureTargets(activeSector = null) {
  const fixedSectors = new Set(state.exposureLocked);
  if (activeSector) fixedSectors.add(activeSector);
  const orderedSectors = state.exposureTargetOrder;
  state.exposureTargetMessage = "";

  const fixedTotal = sum(orderedSectors
    .filter(sector => fixedSectors.has(sector))
    .map(sector => state.exposureTargets[sector]));
  const unlockedSectors = orderedSectors.filter(sector => !fixedSectors.has(sector));
  const remaining = 100 - fixedTotal;

  if (remaining < -TARGET_TOTAL_TOLERANCE) {
    state.exposureTargetMessage = `Locked targets total ${formatPercentNumber(fixedTotal)}. Unlock or lower one target so the total can normalize to 100%.`;
    return false;
  }

  if (unlockedSectors.length === 0) {
    if (Math.abs(remaining) > TARGET_TOTAL_TOLERANCE) {
      state.exposureTargetMessage = `All targets are locked at ${formatPercentNumber(fixedTotal)}. Unlock at least one target so the total can normalize to 100%.`;
      return false;
    }
    return true;
  }

  const unlockedTotal = sum(unlockedSectors.map(sector => state.exposureTargets[sector]));
  if (unlockedTotal > 0) {
    for (const sector of unlockedSectors) {
      state.exposureTargets[sector] = state.exposureTargets[sector] / unlockedTotal * remaining;
    }
  } else {
    const currentPercents = getCurrentExposurePercentBySector();
    const currentUnlockedTotal = sum(unlockedSectors.map(sector => currentPercents[sector]));
    for (const sector of unlockedSectors) {
      state.exposureTargets[sector] = currentUnlockedTotal === 0
        ? remaining / unlockedSectors.length
        : currentPercents[sector] / currentUnlockedTotal * remaining;
    }
  }

  return true;
}

function getTradeSelection(mode, key) {
  return state.tradeSelected[mode][key];
}

function getTradeFilterSearch(mode, key) {
  return state.tradeFilterSearch[mode][key];
}

function setTradeFilterSearch(mode, key, value) {
  state.tradeFilterSearch[mode][key] = value;
}

function isCashLinkedFilterKey(key) {
  return key === SECTOR_KEY || key === TERM_KEY;
}

function syncLinkedDashboardFilterSelection(sourceKey) {
  const targetKey = sourceKey === SECTOR_KEY ? TERM_KEY : SECTOR_KEY;
  const sourceValue = sourceKey === SECTOR_KEY ? CASH_SECTOR : CASH_TERM;
  const targetValue = sourceKey === SECTOR_KEY ? CASH_TERM : CASH_SECTOR;
  setDashboardFilterValueSelected(targetKey, targetValue, state.selected[sourceKey].has(sourceValue));
}

function setDashboardFilterValueSelected(key, value, selected) {
  if (selected) state.selected[key].add(value);
  else state.selected[key].delete(value);
}

function getDashboardFilterChipTitle(key, value) {
  if (key === SECTOR_KEY && value === CASH_SECTOR) {
    return `${value}. Toggling this also toggles the CASH term filter.`;
  }

  if (key === TERM_KEY && value === CASH_TERM) {
    return `${value}. Toggling this also toggles the CASH sector filter.`;
  }

  return value;
}

function buildRebalancePlanPayload(targetTotal) {
  const { exposure } = getSectorExposure(state.lots);
  const exposureTotal = sum(Object.values(exposure));
  const targetBase = exposureTotal;
  const sectors = state.exposureTargetOrder;
  const targetScale = 100 / targetTotal;
  const targetBySector = {};

  for (const sector of sectors) {
    targetBySector[sector] = targetBase * (state.exposureTargets[sector] * targetScale / 100);
  }

  const sellLots = state.saleSortedLots
    .filter(lot => isTradeEligibleLot(lot, "sell") && lot.value > MONEY_EPSILON)
    .map(lot => ({
      accountName: lot.accountName,
      ticker: lot.ticker,
      term: lot.term,
      price: lot.price,
      value: lot.value,
      profitPerDollar: lot.profitPerDollar,
      sectorWeights: lot.sectorWeights,
      marginMaintenanceRate: getRebalanceLotMaintenanceRate(lot)
    }));
  const buyCandidates = getPurchaseCandidates()
    .map((candidate, index) => ({
      ...candidate,
      varName: `buy_${index}`
    }));

  return {
    exposure,
    sectors,
    targetBySector,
    realizationLimits: state.rebalanceRealizationLimits,
    netCashSector: CASH_SECTOR,
    sellLots,
    buyCandidates,
    marginAccounts: getRebalanceMarginAccounts(),
    moneyEpsilon: MONEY_EPSILON
  };
}

function getRebalanceLotMaintenanceRate(lot) {
  const account = state.marginModel.accounts[lot.accountName];
  return account ? getMarginMaintenanceForTicker(account, lot.ticker) : 0;
}

function getRebalanceMarginAccounts() {
  return state.marginSummaries
    .map(summary => ({
      accountName: summary.accountName,
      debit: summary.debit,
      excessEquity: summary.excessEquity
    }));
}

function isTradeEligibleLot(lot, mode) {
  const filters = TRADE_FILTERS_BY_MODE[mode];
  return filters.every(filter => {
    const selected = getTradeSelection(mode, filter.key);
    return selected.has(lot[filter.key]);
  });
}

function getPurchaseCandidates() {
  const byTicker = new Map();

  for (const lot of getSecurityLots(state.lots).filter(lot => isTradeEligibleLot(lot, "buy"))) {
    if (!byTicker.has(lot.ticker)) {
      byTicker.set(lot.ticker, {
        ticker: lot.ticker,
        accountName: lot.accountName,
        price: lot.price,
        sectorWeights: lot.sectorWeights
      });
    }
  }

  return [...byTicker.values()];
}

function aggregateTransactionsByActionAccountTicker(transactions) {
  const grouped = new Map();

  for (const transaction of transactions) {
    const actionConfig = REBALANCE_TRANSACTION_ACTION_CONFIG[transaction.action];
    const accountName = actionConfig.hasAccount ? transaction.accountName : "";
    const key = [transaction.action, accountName, transaction.ticker].join("\u0001");

    if (!grouped.has(key)) {
      grouped.set(key, {
        action: transaction.action,
        accountName,
        ticker: transaction.ticker,
        dollars: 0,
        shares: 0,
        realizedProfit: 0
      });
    }

    const row = grouped.get(key);
    row.dollars += transaction.dollars;
    row.shares += transaction.shares;
    row.realizedProfit += transaction.realizedProfit;
  }

  return [...grouped.values()]
    .sort((a, b) => {
      return (REBALANCE_TRANSACTION_ACTION_CONFIG[a.action].sortOrder - REBALANCE_TRANSACTION_ACTION_CONFIG[b.action].sortOrder) ||
        a.accountName.localeCompare(b.accountName) ||
        a.ticker.localeCompare(b.ticker);
    });
}

function getFilteredLots() {
  return state.lots.filter(isDashboardSelected);
}

function getSectorSelectionState() {
  const values = state.filterValues[SECTOR_KEY];
  const selected = state.selected[SECTOR_KEY];

  return {
    values,
    selected,
    all: values.length > 0 && selected.size === values.length,
    none: selected.size === 0,
    partial: selected.size > 0 && selected.size < values.length
  };
}

function hasPartialSecuritySectorSelection() {
  const securitySectors = state.filterValues[SECTOR_KEY].filter(sector => sector !== CASH_SECTOR);
  const selectedCount = securitySectors.filter(sector => state.selected[SECTOR_KEY].has(sector)).length;
  return selectedCount > 0 && selectedCount < securitySectors.length;
}

function getSelectedSectorWeight(lot) {
  const { selected, all, none } = getSectorSelectionState();
  if (all) return 1;
  if (none) return 0;

  let weight = 0;
  for (const [sector, sectorWeight] of Object.entries(lot.sectorWeights)) {
    if (selected.has(sector)) weight += sectorWeight;
  }
  return weight;
}

function lotHasSelectedSector(lot) {
  return getSelectedSectorWeight(lot) > 0;
}

function buildPieSlices() {
  const slices = {};

  for (const key of PIE_KEYS) {
    const pieLots = getLotsForPieKey(key);
    slices[key] = {};

    for (const metric of PIE_METRICS) {
      slices[key][metric.key] = getSlicesBy(pieLots, key, metric);
    }
  }

  return slices;
}

function getLotsForPieKey(key) {
  return state.lots.filter(lot => {
    return FILTERS.every(filter => {
      if (filter.key === key) return true;
      if (filter.key === SECTOR_KEY) return lotHasSelectedSector(lot);
      return state.selected[filter.key].has(lot[filter.key]);
    });
  });
}

function getSlicesBy(lots, key, metric) {
  const grouped = new Map();

  for (const lot of lots) {
    const baseAmount = lot[metric.amountKey];

    if (key === SECTOR_KEY) {
      for (const [sector, weight] of Object.entries(lot.sectorWeights)) {
        grouped.set(sector, (grouped.get(sector) ?? 0) + baseAmount * weight);
      }
    } else {
      const sliceName = lot[key];
      const amount = baseAmount * getSelectedSectorWeight(lot);
      grouped.set(sliceName, (grouped.get(sliceName) ?? 0) + amount);
    }
  }

  return [...grouped.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      selected: key === SECTOR_KEY ? state.selected[SECTOR_KEY].has(name) : state.selected[key].has(name)
    }))
    .filter(slice => slice.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((slice, index) => ({ ...slice, index }));
}

function togglePieValue(filterKey, value) {
  const next = new Set(state.selected[filterKey]);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  state.selected[filterKey] = next;
  if (isCashLinkedFilterKey(filterKey)) syncLinkedDashboardFilterSelection(filterKey);
}

function isolatePieValue(filterKey, value) {
  state.selected[filterKey] = new Set([value]);
  if (isCashLinkedFilterKey(filterKey)) syncLinkedDashboardFilterSelection(filterKey);
}
