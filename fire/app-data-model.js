function prepareDashboardData(data) {
  const { priceMap, accounts, sectorWeights, dashboardMetrics } = data;
  const sectorWeightMap = buildSectorWeightMap(sectorWeights);
  const securityLots = buildAccountGroupLots(accounts, priceMap, sectorWeightMap);
  const marginModel = buildMarginConfig(accounts);
  const lots = [
    ...securityLots,
    ...buildCashLots(accounts, dashboardMetrics, marginModel)
  ];

  return {
    lots: buildTableSortedLots(lots),
    saleSortedLots: buildSaleSortedLots(securityLots),
    marginModel,
    marginSummaries: buildMarginSummaries(securityLots, marginModel),
    dashboardMetrics,
    sectorWeightMap
  };
}


function buildSectorWeightMap(dataSectorWeights) {
  const [sectorNames, weightsByTicker] = dataSectorWeights;
  const map = {};

  for (const [ticker, weights] of Object.entries(weightsByTicker)) {
    map[ticker] = Object.fromEntries(sectorNames
      .map((sector, index) => [sector, weights[index]])
      .filter(([, weight]) => weight !== 0));
  }

  return map;
}


function buildAccountGroupLots(sourceAccounts, priceMap, sectorWeightMap) {
  const lots = [];

  for (const account of sourceAccounts) {
    const accountName = account.accountName;
    const accountType = account.accountType;
    const profitTreatment = getProfitTreatmentForAccountType(accountType);
    const term = getTermForAccountType(accountType);

    if (profitTreatment === "basis") {
      appendGroupedBasisHoldings(lots, account, accountType, accountName, priceMap, sectorWeightMap);
      continue;
    }

    appendGroupedSimpleHoldings(lots, account, accountType, accountName, term, priceMap, sectorWeightMap, profitTreatment);
  }

  return lots;
}


function appendGroupedSimpleHoldings(lots, account, accountType, accountName, term, priceMap, sectorWeightMap, profitTreatment) {
  const sharesByTicker = new Map();

  for (const holding of account.holdings) {
    const ticker = holding.ticker;
    sharesByTicker.set(ticker, (sharesByTicker.get(ticker) ?? 0) + holding.shares);
  }

  for (const [ticker, shares] of sharesByTicker.entries()) {
    lots.push(buildLot({
      accountType,
      accountName,
      ticker,
      term,
      shares,
      perShareBasis: null,
      priceMap,
      sectorWeightMap,
      profitTreatment
    }));
  }
}


function appendGroupedBasisHoldings(lots, account, accountType, accountName, priceMap, sectorWeightMap) {
  const sharesByTickerTermBasis = new Map();

  for (const holding of account.holdings) {
    const termMap = getOrCreateMap(sharesByTickerTermBasis, holding.ticker);
    const basisMap = getOrCreateMap(termMap, holding.term);
    basisMap.set(holding.perShareBasis, (basisMap.get(holding.perShareBasis) ?? 0) + holding.shares);
  }

  for (const [ticker, termMap] of sharesByTickerTermBasis.entries()) {
    for (const [term, basisMap] of termMap.entries()) {
      for (const [perShareBasis, shares] of basisMap.entries()) {
        lots.push(buildLot({
          accountType,
          accountName,
          ticker,
          term,
          shares,
          perShareBasis,
          priceMap,
          sectorWeightMap,
          profitTreatment: "basis"
        }));
      }
    }
  }
}


function getOrCreateMap(parent, key) {
  if (!parent.has(key)) parent.set(key, new Map());
  return parent.get(key);
}


const TERM_BY_ACCOUNT_TYPE = {
  Individual: "Long-term",
  Roth: "Long-term",
  "Pre-tax": "Short-term"
};


const PROFIT_TREATMENT_BY_ACCOUNT_TYPE = {
  Individual: "basis",
  Roth: "none",
  "Pre-tax": "full"
};


const PROFIT_CALCULATORS = {
  full: ({ value }) => value,
  basis: ({ quantity, price, basis }) => quantity * (price - basis),
  none: () => 0
};


function getTermForAccountType(accountType) {
  return TERM_BY_ACCOUNT_TYPE[accountType];
}


function getProfitTreatmentForAccountType(accountType) {
  return PROFIT_TREATMENT_BY_ACCOUNT_TYPE[accountType];
}


function buildLot({ accountType, accountName, ticker, term, shares, perShareBasis, priceMap, sectorWeightMap, profitTreatment }) {
  const price = priceMap[ticker];
  const value = shares * price;
  const basis = profitTreatment === "basis" ? perShareBasis : null;
  const sectorWeights = sectorWeightMap[ticker];
  const sectorNames = Object.keys(sectorWeights);
  const profit = PROFIT_CALCULATORS[profitTreatment]({ value, quantity: shares, price, basis });

  return {
    accountType,
    accountName,
    ticker,
    sector: sectorNames.length > 1 ? "Mixed" : sectorNames[0],
    sectorWeights,
    term,
    shares,
    perShareBasis: basis,
    price,
    value,
    profit,
    saleValue: value,
    realizedProfit: profit,
    profitPerDollar: profit / value
  };
}


function buildCashLots(accounts, dashboardMetrics, marginModel) {
  return [
    ...buildAccountCashLots(accounts),
    buildResidualNetCashLot(accounts, dashboardMetrics, marginModel)
  ];
}


function buildAccountCashLots(accounts) {
  const lots = [];

  for (const account of accounts) {
    const cash = account.financing.find(row => row.kind === "cash");
    if (cash.balance > MONEY_EPSILON) {
      lots.push(buildCashLot(account.accountType, account.accountName, cash.balance));
    }
  }

  return lots;
}


function buildResidualNetCashLot(accounts, dashboardMetrics, marginModel) {
  const accountCashBalance = sum(accounts.map(account => account.financing.find(row => row.kind === "cash").balance));
  const marginBalance = sum(Object.values(marginModel.accounts).map(account => account.debit));
  const value = dashboardMetrics.cashBalance - accountCashBalance - marginBalance - dashboardMetrics.otherDebtsBalance;

  return buildCashLot(RESIDUAL_NET_CASH_ACCOUNT_TYPE, RESIDUAL_NET_CASH_ACCOUNT_NAME, value);
}


function buildCashLot(accountType, accountName, value) {
  return {
    isCash: true,
    accountType,
    accountName,
    ticker: CASH_TICKER,
    sector: CASH_SECTOR,
    sectorWeights: { [CASH_SECTOR]: 1 },
    term: CASH_TERM,
    shares: 1,
    perShareBasis: value,
    price: value,
    value,
    profit: 0,
    saleValue: 0,
    realizedProfit: 0,
    profitPerDollar: 0
  };
}


function getSecurityLots(lots) {
  return lots.filter(lot => !lot.isCash);
}


function buildMarginConfig(sourceAccounts) {
  const accounts = {};

  for (const account of sourceAccounts) {
    const margin = account.financing.find(row => row.kind === "margin");
    const debit = margin.balance;
    if (debit <= MONEY_EPSILON) continue;

    accounts[account.accountName] = {
      accountName: account.accountName,
      debit,
      maintenanceByTicker: account.maintenanceByTicker
    };
  }

  return { accounts };
}


function buildMarginSummaries(lots, marginModel) {
  return Object.values(marginModel.accounts).map(account => buildMarginSummary(lots, account));
}


function buildMarginSummary(lots, account) {
  const accountLots = lots.filter(lot => lot.accountName === account.accountName);
  let marketValue = 0;
  let requiredEquity = 0;

  for (const lot of accountLots) {
    marketValue += lot.value;
    requiredEquity += lot.value * getMarginMaintenanceForTicker(account, lot.ticker);
  }

  const equity = marketValue - account.debit;
  const excessEquity = equity - requiredEquity;

  return {
    accountName: account.accountName,
    debit: account.debit,
    excessEquity
  };
}


function getMarginMaintenanceForTicker(account, ticker) {
  return account.maintenanceByTicker[ticker];
}


function buildSaleSortedLots(lots) {
  return [...lots].sort((a, b) => compareSaleLots(a, b, "profitPerDollar"));
}


function buildTableSortedLots(lots) {
  return [...lots].sort((a, b) => {
    return a.ticker.localeCompare(b.ticker) ||
      a.accountName.localeCompare(b.accountName) ||
      a.accountType.localeCompare(b.accountType) ||
      a.term.localeCompare(b.term);
  });
}


function compareSaleLots(a, b, sortKey) {
  return (a[sortKey] - b[sortKey]) ||
    a.ticker.localeCompare(b.ticker) ||
    a.accountName.localeCompare(b.accountName);
}
