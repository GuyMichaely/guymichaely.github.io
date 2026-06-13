function getSaleLots(lots) {
  return lots.filter(isDashboardSelected);
}

const SALE_PATH_BUILDERS = {
  tax: buildSalePath,
  constant: buildConstantConcentrationSalePath
};
const SALE_TRANSACTION_BUILDERS = {
  tax: getTaxEfficientSaleTransactionsAtAmount,
  constant: getConstantMixSaleTransactionsAtAmount
};
const SALE_X_AXIS_MODES = {
  net: {
    usesNet: true,
    label: "Net dollars available",
    displayX: point => point.netX
  },
  gross: {
    usesNet: false,
    label: "Gross dollars sold",
    displayX: point => point.x
  }
};

function getSalePlannerCacheKey(mode) {
  const selectedKey = FILTERS.map(filter => {
    const selected = state.selected[filter.key];
    const values = state.filterValues[filter.key];
    const selectedValues = selected.size === values.length
      ? ["*"]
      : [...selected].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return [filter.key, selectedValues];
  });

  return JSON.stringify([mode, selectedKey]);
}

function rememberSalePathCache(key, entry) {
  const maxCachedSalePaths = 16;

  if (!state.salePathCache.has(key) && state.salePathCache.size >= maxCachedSalePaths) {
    state.salePathCache.delete(state.salePathCache.keys().next().value);
  }

  state.salePathCache.set(key, entry);
}

function isDashboardSelected(lot) {
  return FILTERS.every(filter => {
    if (filter.key === SECTOR_KEY) return lotHasSelectedSector(lot);
    return state.selected[filter.key].has(lot[filter.key]);
  });
}

function buildSaleCurvePoint(grossX, y, marginPaydown) {
  return {
    x: grossX,
    y,
    marginPaydown,
    netX: grossX - marginPaydown
  };
}

function createMarginSaleTracker() {
  const workingAccounts = {};

  for (const account of Object.values(state.marginModel.accounts)) {
    const accountLots = getSecurityLots(state.lots).filter(lot => lot.accountName === account.accountName);
    let marketValue = 0;
    let requiredEquity = 0;

    for (const lot of accountLots) {
      marketValue += lot.value;
      requiredEquity += lot.value * getMarginMaintenanceForTicker(account, lot.ticker);
    }

    workingAccounts[account.accountName] = {
      account,
      marketValue,
      requiredEquity,
      debit: account.debit
    };
  }

  return {
    applySale(lot, grossDollars) {
      const working = workingAccounts[lot.accountName];
      const saleDollars = grossDollars;
      if (!working || working.debit <= 0) return 0;
      if (saleDollars === 0) return 0;

      const maintenanceRate = getMarginMaintenanceForTicker(working.account, lot.ticker);
      working.marketValue -= saleDollars;
      working.requiredEquity -= saleDollars * maintenanceRate;

      const equityBeforePaydown = working.marketValue - working.debit;
      const requiredPaydown = Math.max(0, working.requiredEquity - equityBeforePaydown);
      const paydown = Math.min(requiredPaydown, working.debit, saleDollars);
      working.debit -= paydown;

      return paydown;
    }
  };
}

function buildSalePath(lots, breakdownKeys) {
  const curvePoints = [buildSaleCurvePoint(0, 0, 0)];
  const profitBy = emptySoldBy(breakdownKeys);
  const valueBy = emptySoldBy(breakdownKeys);
  const companionProfitSeriesByKey = emptySeriesByKey(breakdownKeys);
  const companionValueSeriesByKey = emptySeriesByKey(breakdownKeys);
  const marginTracker = createMarginSaleTracker();
  let x = 0;
  let y = 0;
  let marginPaydown = 0;

  for (const lot of lots) {
    const prevX = x;
    const dx = lot.saleValue;
    const dy = lot.realizedProfit;

    x += dx;
    y += dy;
    marginPaydown += marginTracker.applySale(lot, dx);
    curvePoints.push(buildSaleCurvePoint(x, y, marginPaydown));

    appendLotSaleContributions(companionProfitSeriesByKey, companionValueSeriesByKey, profitBy, valueBy, lot, prevX, x, dy, dx, breakdownKeys);
  }

  finishSparseSeries(companionProfitSeriesByKey, x, breakdownKeys);
  finishSparseSeries(companionValueSeriesByKey, x, breakdownKeys);

  return { curvePoints, companionProfitSeriesByKey, companionValueSeriesByKey };
}

function buildConstantConcentrationSalePath(lots, breakdownKeys) {
  const groups = getAssetSaleGroups(lots);
  const totalSale = sum(groups.map(group => group.totalSale));
  const zeroValueLots = lots.filter(lot => lot.saleValue <= 0 && lot.realizedProfit !== 0);
  const zeroValueProfit = sum(zeroValueLots.map(lot => lot.realizedProfit));
  const expectedFinalProfit = sum(lots.map(lot => lot.realizedProfit));
  const curvePoints = [buildSaleCurvePoint(0, 0, 0)];
  const profitBy = emptySoldBy(breakdownKeys);
  const valueBy = emptySoldBy(breakdownKeys);
  const companionProfitSeriesByKey = emptySeriesByKey(breakdownKeys);
  const companionValueSeriesByKey = emptySeriesByKey(breakdownKeys);
  const marginTracker = createMarginSaleTracker();
  let x = 0;
  let y = zeroValueProfit;
  let marginPaydown = 0;

  if (zeroValueLots.length > 0) {
    const profitDeltas = emptySoldBy(breakdownKeys);
    const valueDeltas = emptySoldBy(breakdownKeys);
    for (const lot of zeroValueLots) {
      addLotSaleContributionDeltas(profitDeltas, valueDeltas, lot, lot.realizedProfit, 0, breakdownKeys);
    }
    appendContributionDeltas(companionProfitSeriesByKey, profitBy, profitDeltas, 0, 0, breakdownKeys);
    appendContributionDeltas(companionValueSeriesByKey, valueBy, valueDeltas, 0, 0, breakdownKeys);
    curvePoints.push(buildSaleCurvePoint(0, y, marginPaydown));
  }

  if (totalSale <= 0) {
    return { curvePoints, companionProfitSeriesByKey, companionValueSeriesByKey };
  }

  for (const group of groups) {
    group.weight = group.totalSale / totalSale;
    group.lotIndex = 0;
    group.soldInLot = 0;
  }

  while (x < totalSale - MONEY_EPSILON) {
    let nextX = totalSale;

    for (const group of groups) {
      const lot = group.lots[group.lotIndex];
      if (!lot) continue;
      const remainingLotValue = lot.saleValue - group.soldInLot;
      nextX = Math.min(nextX, x + remainingLotValue / group.weight);
    }

    if (nextX <= x + 0.000001) {
      advanceExhaustedAssetLots(groups);
      if (groups.every(group => !group.lots[group.lotIndex])) break;
      continue;
    }

    const profitDeltas = emptySoldBy(breakdownKeys);
    const valueDeltas = emptySoldBy(breakdownKeys);
    let segmentProfit = 0;
    let segmentMarginPaydown = 0;

    for (const group of groups) {
      const lot = group.lots[group.lotIndex];
      if (!lot) continue;

      const groupSale = Math.min((nextX - x) * group.weight, lot.saleValue - group.soldInLot);
      if (groupSale <= 0) continue;

      const groupProfit = groupSale * lot.profitPerDollar;
      group.soldInLot += groupSale;
      segmentProfit += groupProfit;
      segmentMarginPaydown += marginTracker.applySale(lot, groupSale);
      addLotSaleContributionDeltas(profitDeltas, valueDeltas, lot, groupProfit, groupSale, breakdownKeys);
    }

    appendContributionDeltas(companionProfitSeriesByKey, profitBy, profitDeltas, x, nextX, breakdownKeys);
    appendContributionDeltas(companionValueSeriesByKey, valueBy, valueDeltas, x, nextX, breakdownKeys);
    x = nextX;
    y += segmentProfit;
    marginPaydown += segmentMarginPaydown;
    curvePoints.push(buildSaleCurvePoint(x, y, marginPaydown));
    advanceExhaustedAssetLots(groups);
  }

  const finalPoint = curvePoints[curvePoints.length - 1];
  if (Math.abs(finalPoint.x - totalSale) <= MONEY_EPSILON * 2) {
    finalPoint.x = totalSale;
    finalPoint.y = expectedFinalProfit;
    finalPoint.marginPaydown = marginPaydown;
    finalPoint.netX = totalSale - marginPaydown;
    x = totalSale;
  }

  finishSparseSeries(companionProfitSeriesByKey, x, breakdownKeys);
  finishSparseSeries(companionValueSeriesByKey, x, breakdownKeys);

  return { curvePoints, companionProfitSeriesByKey, companionValueSeriesByKey };
}

function getAssetSaleGroups(lots) {
  const byTicker = new Map();

  for (const lot of lots) {
    if (lot.saleValue <= 0) continue;
    if (!byTicker.has(lot.ticker)) {
      byTicker.set(lot.ticker, {
        ticker: lot.ticker,
        totalSale: 0,
        lots: []
      });
    }

    const group = byTicker.get(lot.ticker);
    group.totalSale += lot.saleValue;
    group.lots.push(lot);
  }

  return [...byTicker.values()]
    .map(group => ({
      ...group,
      lots: group.lots.sort((a, b) => compareSaleLots(a, b, "profitPerDollar"))
    }))
    .sort((a, b) => b.totalSale - a.totalSale || a.ticker.localeCompare(b.ticker));
}

function advanceExhaustedAssetLots(groups) {
  for (const group of groups) {
    while (group.lots[group.lotIndex] && group.soldInLot >= group.lots[group.lotIndex].saleValue - MONEY_EPSILON) {
      group.lotIndex += 1;
      group.soldInLot = 0;
    }
  }
}

function appendLotSaleContributions(profitSeriesByKey, valueSeriesByKey, profitTotalsByKey, valueTotalsByKey, lot, prevX, x, profitDelta, valueDelta, breakdownKeys) {
  const profitDeltas = emptySoldBy(breakdownKeys);
  const valueDeltas = emptySoldBy(breakdownKeys);
  addLotSaleContributionDeltas(profitDeltas, valueDeltas, lot, profitDelta, valueDelta, breakdownKeys);
  appendContributionDeltas(profitSeriesByKey, profitTotalsByKey, profitDeltas, prevX, x, breakdownKeys);
  appendContributionDeltas(valueSeriesByKey, valueTotalsByKey, valueDeltas, prevX, x, breakdownKeys);
}

function addLotSaleContributionDeltas(profitDeltas, valueDeltas, lot, profitDelta, valueDelta, breakdownKeys) {
  for (const key of breakdownKeys) {
    if (key === SECTOR_KEY) {
      for (const [sector, weight] of Object.entries(lot.sectorWeights)) {
        addContributionDelta(profitDeltas, key, sector, profitDelta * weight);
        addContributionDelta(valueDeltas, key, sector, valueDelta * weight);
      }
    } else {
      const value = lot[key];
      addContributionDelta(profitDeltas, key, value, profitDelta);
      addContributionDelta(valueDeltas, key, value, valueDelta);
    }
  }
}

function addContributionDelta(deltasByKey, key, value, delta) {
  deltasByKey[key][value] = (deltasByKey[key][value] ?? 0) + delta;
}

function appendContributionDeltas(seriesByKey, totalsByKey, deltasByKey, prevX, x, breakdownKeys) {
  for (const key of breakdownKeys) {
    for (const [value, delta] of Object.entries(deltasByKey[key])) {
      appendContributionSeries(seriesByKey, totalsByKey, key, value, prevX, x, delta);
    }
  }
}

function appendContributionSeries(seriesByKey, totalsByKey, key, value, prevX, x, delta) {
  const previousTotal = totalsByKey[key][value] ?? 0;
  const nextTotal = previousTotal + delta;
  const series = getSparseSeries(seriesByKey[key], value);

  appendSparsePoint(series, prevX, previousTotal);
  appendSparsePoint(series, x, nextTotal);
  totalsByKey[key][value] = nextTotal;
}

function emptySoldBy(breakdownKeys) {
  const soldBy = {};
  for (const key of breakdownKeys) soldBy[key] = {};
  return soldBy;
}

function emptySeriesByKey(breakdownKeys) {
  const seriesByKey = {};
  for (const key of breakdownKeys) seriesByKey[key] = {};
  return seriesByKey;
}

function getSparseSeries(seriesByValue, value) {
  if (!seriesByValue[value]) {
    seriesByValue[value] = [{ x: 0, y: 0 }];
  }

  return seriesByValue[value];
}

function appendSparsePoint(series, x, y) {
  const last = series[series.length - 1];

  if (last.x === x) {
    last.y = y;
    return;
  }

  series.push({ x, y });
}

function finishSparseSeries(seriesByKey, finalX, breakdownKeys) {
  for (const key of breakdownKeys) {
    for (const series of Object.values(seriesByKey[key])) {
      const last = series[series.length - 1];
      if (last.x !== finalX) {
        series.push({ x: finalX, y: last.y });
      }
    }
  }
}

function saleUsesNetXAxis() {
  return SALE_X_AXIS_MODES[state.saleAxis.xMode].usesNet;
}

function getSaleXAxisLabel() {
  return SALE_X_AXIS_MODES[state.saleAxis.xMode].label;
}

function getSalePointDisplayX(point) {
  return SALE_X_AXIS_MODES[state.saleAxis.xMode].displayX(point);
}

function copySalePoint(point) {
  return {
    x: point.x,
    y: point.y,
    marginPaydown: point.marginPaydown,
    netX: point.netX
  };
}

function getSaleCurveDisplayPoints(points) {
  return points.map(point => ({
    x: getSalePointDisplayX(point),
    y: point.y
  }));
}

function mapSeriesToSaleDisplayX(points, displayXByGrossX) {
  return points.map(point => ({
    x: displayXByGrossX.get(point.x),
    y: point.y
  }));
}

function getSaleDisplayXByGrossXMap(points) {
  const map = new Map();
  for (const point of points) {
    map.set(point.x, getSalePointDisplayX(point));
  }
  return map;
}

function getDisplayXAtGrossSale(points, grossX) {
  const salePoint = interpolateSalePointByGrossX(points, grossX);
  return getSalePointDisplayX(salePoint);
}

function interpolateSalePointByGrossX(points, grossX) {
  const target = grossX;
  if (target <= points[0].x) return copySalePoint(points[0]);

  const last = points[points.length - 1];
  if (target >= last.x) return copySalePoint(last);

  const rightIndex = d3.bisector(point => point.x).left(points, target);
  const right = points[rightIndex];
  const left = points[rightIndex - 1];
  if (right.x === left.x) return copySalePoint(right);

  return interpolateSalePoints(left, right, (target - left.x) / (right.x - left.x));
}

function interpolateSalePointByDisplayX(points, displayX) {
  const target = displayX;
  const firstDisplayX = getSalePointDisplayX(points[0]);
  if (target <= firstDisplayX) return copySalePoint(points[0]);

  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1];
    const right = points[index];
    const leftDisplayX = getSalePointDisplayX(left);
    const rightDisplayX = getSalePointDisplayX(right);

    if (leftDisplayX === rightDisplayX) {
      if (Math.abs(target - rightDisplayX) <= MONEY_EPSILON) return copySalePoint(right);
      continue;
    }

    const minX = Math.min(leftDisplayX, rightDisplayX);
    const maxX = Math.max(leftDisplayX, rightDisplayX);
    if (target >= minX - MONEY_EPSILON && target <= maxX + MONEY_EPSILON) {
      return interpolateSalePoints(left, right, (target - leftDisplayX) / (rightDisplayX - leftDisplayX));
    }
  }
}

function interpolateSalePoints(leftPoint, rightPoint, t) {
  const left = copySalePoint(leftPoint);
  const right = copySalePoint(rightPoint);
  const ratio = t;
  const grossX = left.x + (right.x - left.x) * ratio;
  const marginPaydown = left.marginPaydown + (right.marginPaydown - left.marginPaydown) * ratio;

  return {
    x: grossX,
    y: left.y + (right.y - left.y) * ratio,
    marginPaydown,
    netX: grossX - marginPaydown
  };
}

function getSaleTransactionsAtAmount(targetAmount) {
  const lots = state.currentSaleLots;
  return SALE_TRANSACTION_BUILDERS[state.saleMode](lots, targetAmount);
}

function getTaxEfficientSaleTransactionsAtAmount(lots, targetAmount) {
  const transactions = [];
  let remaining = targetAmount;

  for (const lot of lots) {
    if (remaining <= MONEY_EPSILON) break;
    const dollars = Math.min(lot.saleValue, remaining);
    if (dollars <= 0) continue;
    transactions.push(buildSaleTransactionFromLot(lot, dollars));
    remaining -= dollars;
  }

  return transactions;
}

function getConstantMixSaleTransactionsAtAmount(lots, targetAmount) {
  const groups = getAssetSaleGroups(lots);
  const totalSale = sum(groups.map(group => group.totalSale));
  if (totalSale <= 0) return [];

  const transactions = [];

  for (const group of groups) {
    let remainingForTicker = targetAmount * group.totalSale / totalSale;
    for (const lot of group.lots) {
      if (remainingForTicker <= MONEY_EPSILON) break;
      const dollars = Math.min(lot.saleValue, remainingForTicker);
      if (dollars <= 0) continue;
      transactions.push(buildSaleTransactionFromLot(lot, dollars));
      remainingForTicker -= dollars;
    }
  }

  return transactions;
}

function buildSaleTransactionFromLot(lot, dollars) {
  return {
    accountType: lot.accountType,
    accountName: lot.accountName,
    ticker: lot.ticker,
    dollars,
    shares: dollars / lot.price,
    realizedProfit: dollars * lot.profitPerDollar
  };
}

function aggregateSaleTransactionsByAccountTicker(transactions) {
  const byAccount = new Map();

  for (const transaction of transactions) {
    const accountName = transaction.accountName;
    if (!byAccount.has(accountName)) {
      byAccount.set(accountName, {
        accountName,
        dollars: 0,
        shares: 0,
        realizedProfit: 0,
        tickers: new Map()
      });
    }

    const account = byAccount.get(accountName);
    if (!account.tickers.has(transaction.ticker)) {
      account.tickers.set(transaction.ticker, {
        ticker: transaction.ticker,
        dollars: 0,
        shares: 0,
        realizedProfit: 0
      });
    }

    const ticker = account.tickers.get(transaction.ticker);
    account.dollars += transaction.dollars;
    account.shares += transaction.shares;
    account.realizedProfit += transaction.realizedProfit;
    ticker.dollars += transaction.dollars;
    ticker.shares += transaction.shares;
    ticker.realizedProfit += transaction.realizedProfit;
  }

  return [...byAccount.values()]
    .map(account => ({
      ...account,
      tickers: [...account.tickers.values()]
        .filter(row => row.dollars > MONEY_EPSILON || Math.abs(row.realizedProfit) > MONEY_EPSILON)
        .sort((a, b) => b.dollars - a.dollars || a.ticker.localeCompare(b.ticker, undefined, { numeric: true }))
    }))
    .filter(account => account.dollars > MONEY_EPSILON || Math.abs(account.realizedProfit) > MONEY_EPSILON)
    .sort((a, b) => b.dollars - a.dollars || a.accountName.localeCompare(b.accountName, undefined, { numeric: true }));
}
