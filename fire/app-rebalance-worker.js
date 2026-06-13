let glpkInstance = null;
const LP_DOLLAR_SCALE = 1000;
const LP_HANDOFF_TOLERANCE_DOLLARS = 0.004;
const TICKER_SIDE_BLOCKED_SIDES = {
  sell: ["buy"],
  buy: ["sell"],
  none: ["buy", "sell"]
};
const TICKER_BLOCKED_SIDE_CONSTRAINTS = {
  buy: (model, glpk, mode) => {
    addConstraint(model, glpk, `ticker_no_buy_${mode.sideVarName}`, [{ name: mode.buyVarName, coef: 1 }], "upper", 0);
  },
  sell: (model, glpk, mode, sellTerms) => {
    addConstraint(model, glpk, `ticker_no_sell_${mode.sideVarName}`, sellTerms, "upper", 0);
  }
};
const REBALANCE_OBJECTIVES = {
  residual: {
    sellCost: () => 0,
    buyCost: 0,
    residualCost: 1
  },
  tax: {
    sellCost: candidate => candidate.profitPerDollar,
    buyCost: 0,
    residualCost: 0
  },
  trade: {
    sellCost: () => 1,
    buyCost: 1,
    residualCost: 0
  }
};
const LP_CONSTRAINT_BOUNDS = {
  fixed: (glpk, value) => ({ type: glpk.GLP_FX, lb: value, ub: value }),
  lower: (glpk, value) => ({ type: glpk.GLP_LO, lb: value, ub: 0 }),
  upper: (glpk, value) => ({ type: glpk.GLP_UP, lb: 0, ub: value })
};

self.onmessage = event => {
  const { requestId, payload } = event.data;
  const plan = buildRebalancePlan(payload, requestId);
  self.postMessage({ type: "result", requestId, plan });
};

function buildRebalancePlan(payload, requestId) {
  const context = buildRebalanceLpContext(payload);
  if (!requiresRebalanceSolve(context)) {
    return buildNoRebalancePlan(context);
  }

  postProgress(requestId, "Loading GLPK/WASM optimizer...");
  const glpk = getGlpk();

  postProgress(requestId, `Solving full tax-lot optimization with ${context.sellCandidates.length.toLocaleString()} eligible sell lots...`);
  const residualSolve = solveRebalanceLp(buildRebalanceLpModel(context, glpk, "residual", {
    residualLimit: null,
    taxLimit: null,
    tickerSides: null
  }), glpk);
  const residualLimit = getLpVariableDollarTotal(residualSolve.vars, context.residualVariableNames, context);
  const residualPlan = buildRebalancePlanFromSolution(context, residualSolve.vars);
  postPhaseResult(requestId, "target", residualPlan);

  postProgress(requestId, "Minimizing net realized gains...");
  const taxSolve = solveRebalanceLp(buildRebalanceLpModel(context, glpk, "tax", {
    residualLimit: residualLimit + getLpHandoffToleranceDollars(residualLimit),
    taxLimit: null,
    tickerSides: null
  }), glpk);
  const taxLimit = getRealizedNetGain(taxSolve.vars, context);
  const taxPlan = buildRebalancePlanFromSolution(context, taxSolve.vars);
  postPhaseResult(requestId, "tax", taxPlan);

  postProgress(requestId, "Minimizing gross trade volume...");
  // Phase 2 chooses the tax-optimal buy/sell side for overlapping tickers. Reusing
  // those sides keeps phase 3 continuous instead of re-solving the full MILP.
  const tradeSolve = solveRebalanceLp(buildRebalanceLpModel(context, glpk, "trade", {
    residualLimit: residualLimit + getLpHandoffToleranceDollars(residualLimit),
    taxLimit: taxLimit + getLpHandoffToleranceDollars(taxLimit),
    tickerSides: getTickerSideRestrictions(context, taxSolve.vars)
  }), glpk);

  return buildRebalancePlanFromSolution(context, tradeSolve.vars);
}

function getGlpk() {
  if (glpkInstance) return glpkInstance;

  const glpkUrl = new URL("glpk.js", getWorkerBaseUrl()).href;
  self.module = { exports: null };
  self.__filename = glpkUrl;

  importScripts(glpkUrl);
  glpkInstance = self.module.exports();
  delete self.module;
  delete self.__filename;
  return glpkInstance;
}

function getWorkerBaseUrl() {
  return new URL(".", self.location.href).href;
}

function buildRebalanceLpContext(payload) {
  const moneyEpsilon = payload.moneyEpsilon;
  const sectors = payload.sectors;
  const sellCandidates = payload.sellLots.map((lot, index) => ({
    ...lot,
    varName: `sell_${index}`
  }));
  const buyCandidates = payload.buyCandidates.map((candidate, index) => ({
    ...candidate,
    varName: candidate.varName
  }));
  const marginAccounts = payload.marginAccounts
    .map((account, index) => ({
      ...account,
      debit: account.debit,
      excessEquity: account.excessEquity,
      varName: `margin_paydown_${index}`
    }));
  const residualVariableNames = sectors.flatMap((_sector, index) => [`under_${index}`, `over_${index}`]);
  const tickerModes = buildTickerModes(sellCandidates, buyCandidates);
  const netCashSector = payload.netCashSector;
  const netCashSectorIndex = sectors.indexOf(netCashSector);

  return {
    exposure: payload.exposure,
    sectors,
    netCashSector,
    netCashSectorIndex,
    targetBySector: payload.targetBySector,
    realizationLimits: payload.realizationLimits,
    sellCandidates,
    buyCandidates,
    marginAccounts,
    tickerModes,
    residualVariableNames,
    moneyEpsilon,
    dollarScale: LP_DOLLAR_SCALE
  };
}

function hasRebalanceTargetDelta(context) {
  return context.sectors.some(sector => {
    return Math.abs(context.targetBySector[sector] - context.exposure[sector]) > context.moneyEpsilon;
  });
}

function requiresRebalanceSolve(context) {
  return hasRebalanceTargetDelta(context) ||
    context.realizationLimits.minGrossGain > context.moneyEpsilon;
}

function buildRebalanceLpModel(context, glpk, objective, limits) {
  const objectiveConfig = REBALANCE_OBJECTIVES[objective];
  const model = {
    name: `rebalance_${objective}`,
    objective: {
      direction: glpk.GLP_MIN,
      name: "cost",
      vars: []
    },
    subjectTo: [],
    bounds: [],
    binaries: []
  };

  const cashTerms = [];
  const sectorTermsByIndex = context.sectors.map(() => []);
  const residualTerms = [];
  const taxTerms = [];
  const grossGainTerms = [];
  const grossLossTerms = [];
  const marginTermsByAccount = Object.fromEntries(context.marginAccounts.map(account => [account.accountName, []]));

  for (const candidate of context.sellCandidates) {
    addVariable(model, glpk, candidate.varName, objectiveConfig.sellCost(candidate), 0, dollarsToLpUnits(candidate.value, context));
    addTerm(cashTerms, candidate.varName, 1);
    addTerm(taxTerms, candidate.varName, candidate.profitPerDollar);
    if (candidate.profitPerDollar > 0) addTerm(grossGainTerms, candidate.varName, candidate.profitPerDollar);
    if (candidate.profitPerDollar < 0) addTerm(grossLossTerms, candidate.varName, -candidate.profitPerDollar);
    if (marginTermsByAccount[candidate.accountName]) {
      addTerm(marginTermsByAccount[candidate.accountName], candidate.varName, 1 - candidate.marginMaintenanceRate);
    }
    addSectorTerms(sectorTermsByIndex, context.sectors, candidate.sectorWeights, candidate.varName, -1);
    addNetCashExposureTerm(sectorTermsByIndex, context, candidate.varName, 1);
  }

  for (const candidate of context.buyCandidates) {
    addVariable(model, glpk, candidate.varName, objectiveConfig.buyCost, 0, null);
    addTerm(cashTerms, candidate.varName, -1);
    addSectorTerms(sectorTermsByIndex, context.sectors, candidate.sectorWeights, candidate.varName, 1);
    addNetCashExposureTerm(sectorTermsByIndex, context, candidate.varName, -1);
  }

  addVariable(model, glpk, "cash_used", 0, 0, null);
  addTerm(cashTerms, "cash_used", 1);
  addVariable(model, glpk, "unused_cash", 0, 0, null);
  addTerm(cashTerms, "unused_cash", -1);

  for (const account of context.marginAccounts) {
    addVariable(model, glpk, account.varName, 0, 0, dollarsToLpUnits(account.debit, context));
    addTerm(cashTerms, account.varName, -1);
  }

  context.sectors.forEach((_sector, index) => {
    const underName = `under_${index}`;
    const overName = `over_${index}`;
    addVariable(model, glpk, underName, objectiveConfig.residualCost, 0, null);
    addVariable(model, glpk, overName, objectiveConfig.residualCost, 0, null);
    addTerm(sectorTermsByIndex[index], underName, 1);
    addTerm(sectorTermsByIndex[index], overName, -1);
    addTerm(residualTerms, underName, 1);
    addTerm(residualTerms, overName, 1);
  });

  addConstraint(model, glpk, "cash", cashTerms, "fixed", 0);
  addConstraint(model, glpk, "minimumGrossGain", grossGainTerms, "lower", dollarsToLpUnits(context.realizationLimits.minGrossGain, context));
  addConstraint(model, glpk, "maximumGrossLoss", grossLossTerms, "upper", dollarsToLpUnits(context.realizationLimits.maxGrossLoss, context));

  context.sectors.forEach((sector, index) => {
    const targetDelta = context.targetBySector[sector] - context.exposure[sector];
    addConstraint(model, glpk, getRebalanceSectorConstraintKey(index), sectorTermsByIndex[index], "fixed", dollarsToLpUnits(targetDelta, context));
  });

  if (limits.residualLimit !== null) {
    addConstraint(model, glpk, "residualTotal", residualTerms, "upper", dollarsToLpUnits(limits.residualLimit, context));
  }

  if (limits.taxLimit !== null) {
    addConstraint(model, glpk, "realizedNetGain", taxTerms, "upper", dollarsToLpUnits(limits.taxLimit, context));
  }

  for (const account of context.marginAccounts) {
    const terms = [...marginTermsByAccount[account.accountName]];
    if (terms.length === 0) continue;
    addTerm(terms, account.varName, -1);
    addConstraint(model, glpk, `margin_requirement_${account.varName}`, terms, "upper", dollarsToLpUnits(account.excessEquity, context));
  }

  addTickerModeConstraints(model, glpk, context, limits.tickerSides);

  return model;
}

function buildTickerModes(sellCandidates, buyCandidates) {
  const sellCapacityByTicker = new Map();
  for (const candidate of sellCandidates) {
    sellCapacityByTicker.set(candidate.ticker, (sellCapacityByTicker.get(candidate.ticker) ?? 0) + candidate.value);
  }

  const totalSellCapacity = sum([...sellCapacityByTicker.values()]);
  return buyCandidates
    .filter(candidate => sellCapacityByTicker.has(candidate.ticker))
    .map((candidate, index) => ({
      ticker: candidate.ticker,
      buyVarName: candidate.varName,
      sideVarName: `ticker_side_${index}`,
      sellCapacity: dollarsToLpUnits(sellCapacityByTicker.get(candidate.ticker), { dollarScale: LP_DOLLAR_SCALE }),
      buyCapacity: dollarsToLpUnits(totalSellCapacity, { dollarScale: LP_DOLLAR_SCALE })
    }));
}

function addTickerModeConstraints(model, glpk, context, tickerSides) {
  const sellCandidatesByTicker = groupByTicker(context.sellCandidates);

  for (const mode of context.tickerModes) {
    const sellTerms = sellCandidatesByTicker.get(mode.ticker)
      .map(candidate => ({ name: candidate.varName, coef: 1 }));

    if (tickerSides !== null) {
      const side = tickerSides[mode.ticker];
      for (const blockedSide of TICKER_SIDE_BLOCKED_SIDES[side]) {
        TICKER_BLOCKED_SIDE_CONSTRAINTS[blockedSide](model, glpk, mode, sellTerms);
      }
      continue;
    }

    addBinaryVariable(model, glpk, mode.sideVarName);

    addTerm(sellTerms, mode.sideVarName, -mode.sellCapacity);
    addConstraint(model, glpk, `ticker_sell_side_${mode.sideVarName}`, sellTerms, "upper", 0);

    addConstraint(model, glpk, `ticker_buy_side_${mode.sideVarName}`, [
      { name: mode.buyVarName, coef: 1 },
      { name: mode.sideVarName, coef: mode.buyCapacity }
    ], "upper", mode.buyCapacity);
  }
}

function getTickerSideRestrictions(context, solution) {
  const soldByTicker = new Map();

  for (const candidate of context.sellCandidates) {
    soldByTicker.set(candidate.ticker, (soldByTicker.get(candidate.ticker) ?? 0) + getSellLpDollarValue(solution, candidate, context));
  }

  return Object.fromEntries(context.tickerModes.map(mode => {
    const sold = soldByTicker.get(mode.ticker);
    const bought = getNonnegativeLpDollarValue(solution, mode.buyVarName, context);

    if (sold > context.moneyEpsilon) return [mode.ticker, "sell"];
    if (bought > context.moneyEpsilon) return [mode.ticker, "buy"];
    return [mode.ticker, "none"];
  }));
}

function groupByTicker(candidates) {
  const byTicker = new Map();
  for (const candidate of candidates) {
    if (!byTicker.has(candidate.ticker)) byTicker.set(candidate.ticker, []);
    byTicker.get(candidate.ticker).push(candidate);
  }
  return byTicker;
}

function addVariable(model, glpk, name, objectiveCoefficient, lowerBound, upperBound) {
  model.objective.vars.push({
    name,
    coef: objectiveCoefficient
  });

  model.bounds.push(upperBound === null
    ? { name, type: glpk.GLP_LO, lb: lowerBound, ub: 0 }
    : { name, type: glpk.GLP_DB, lb: lowerBound, ub: upperBound });
}

function addBinaryVariable(model, glpk, name) {
  addVariable(model, glpk, name, 0, 0, 1);
  model.binaries.push(name);
}

function addSectorTerms(sectorTermsByIndex, sectors, sectorWeights, variableName, multiplier) {
  sectors.forEach((sector, index) => {
    const weight = sectorWeights[sector] === undefined ? 0 : sectorWeights[sector];
    addTerm(sectorTermsByIndex[index], variableName, multiplier * weight);
  });
}

function addNetCashExposureTerm(sectorTermsByIndex, context, variableName, multiplier) {
  addTerm(sectorTermsByIndex[context.netCashSectorIndex], variableName, multiplier);
}

function addTerm(terms, name, coefficient) {
  if (Math.abs(coefficient) <= 1e-12) return;
  terms.push({ name, coef: coefficient });
}

function addConstraint(model, glpk, name, terms, boundType, value) {
  const bnds = LP_CONSTRAINT_BOUNDS[boundType](glpk, value);

  model.subjectTo.push({
    name,
    vars: terms,
    bnds
  });
}

function getRebalanceSectorConstraintKey(index) {
  return `sector_${index}`;
}

function solveRebalanceLp(model, glpk) {
  const solution = glpk.solve(model, {
    msglev: glpk.GLP_MSG_OFF,
    presol: true
  });
  const vars = solution.result.vars;

  return { vars };
}

function getLpHandoffToleranceDollars(limit) {
  return Math.max(LP_HANDOFF_TOLERANCE_DOLLARS, Math.abs(limit) * 1e-9);
}

function dollarsToLpUnits(value, context) {
  return value / context.dollarScale;
}

function lpUnitsToDollars(value, context) {
  return value * context.dollarScale;
}

function getLpVariableDollarTotal(solution, variableNames, context) {
  return sum(variableNames.map(name => getNonnegativeLpDollarValue(solution, name, context)));
}

function getLpVariableValue(solution, name, context) {
  return solution[name];
}

function getNonnegativeLpDollarValue(solution, name, context) {
  return getLpDollarValue(solution, name, context);
}

function getSellLpDollarValue(solution, candidate, context) {
  return getNonnegativeLpDollarValue(solution, candidate.varName, context);
}

function getRealizedNetGain(solution, context) {
  return sum(context.sellCandidates.map(candidate => {
    return getSellLpDollarValue(solution, candidate, context) * candidate.profitPerDollar;
  }));
}

function getLpDollarValue(solution, name, context) {
  return lpUnitsToDollars(getLpVariableValue(solution, name, context), context);
}

function buildRebalancePlanFromSolution(context, solution) {
  const transactions = [];
  const finalExposure = { ...context.exposure };
  const marginPaydownByAccount = getRequiredMarginPaydownByAccount(context, solution);
  const marginPaydown = sum(Object.values(marginPaydownByAccount));

  for (const candidate of context.sellCandidates) {
    const dollars = getSellLpDollarValue(solution, candidate, context);
    if (dollars <= context.moneyEpsilon) continue;

    for (const [sector, weight] of Object.entries(candidate.sectorWeights)) {
      finalExposure[sector] -= dollars * weight;
    }
    finalExposure[context.netCashSector] += dollars;

    transactions.push({
      action: "Sell",
      accountName: candidate.accountName,
      ticker: candidate.ticker,
      dollars,
      shares: dollars / candidate.price,
      realizedProfit: dollars * candidate.profitPerDollar
    });
  }

  for (const candidate of context.buyCandidates) {
    const dollars = getNonnegativeLpDollarValue(solution, candidate.varName, context);
    if (dollars <= context.moneyEpsilon) continue;

    for (const [sector, weight] of Object.entries(candidate.sectorWeights)) {
      finalExposure[sector] += dollars * weight;
    }
    finalExposure[context.netCashSector] -= dollars;

    transactions.push({
      action: "Buy",
      accountName: candidate.accountName,
      ticker: candidate.ticker,
      dollars,
      shares: dollars / candidate.price,
      realizedProfit: 0
    });
  }

  const sells = transactions.filter(transaction => transaction.action === "Sell");
  const buys = transactions.filter(transaction => transaction.action === "Buy");
  const grossProfit = sum(sells.map(transaction => Math.max(0, transaction.realizedProfit)));
  const grossLoss = sum(sells.map(transaction => Math.min(0, transaction.realizedProfit)));
  const residualUnderBySector = getResidualUnderBySector(context, finalExposure);
  const residualOverBySector = getResidualOverBySector(context, finalExposure);
  const sold = sum(sells.map(transaction => transaction.dollars));
  const bought = sum(buys.map(transaction => transaction.dollars));
  const cashUsed = getNonnegativeLpDollarValue(solution, "cash_used", context);
  const remainingCash = getNonnegativeLpDollarValue(solution, "unused_cash", context);

  return {
    transactions,
    sold,
    bought,
    grossProfit,
    grossLoss,
    netProfit: grossProfit + grossLoss,
    marginPaydown,
    cashUsed,
    remainingCash,
    residualUnder: sum(Object.values(residualUnderBySector)),
    residualOver: sum(Object.values(residualOverBySector)),
    residualUnderBySector,
    residualOverBySector,
    finalExposureBySector: finalExposure,
    targetBySector: context.targetBySector
  };
}

function buildNoRebalancePlan(context) {
  const finalExposure = { ...context.exposure };
  const residualUnderBySector = getResidualUnderBySector(context, finalExposure);
  const residualOverBySector = getResidualOverBySector(context, finalExposure);

  return {
    transactions: [],
    sold: 0,
    bought: 0,
    grossProfit: 0,
    grossLoss: 0,
    netProfit: 0,
    marginPaydown: 0,
    cashUsed: 0,
    remainingCash: 0,
    residualUnder: sum(Object.values(residualUnderBySector)),
    residualOver: sum(Object.values(residualOverBySector)),
    residualUnderBySector,
    residualOverBySector,
    finalExposureBySector: finalExposure,
    targetBySector: context.targetBySector
  };
}

function getRequiredMarginPaydownByAccount(context, solution) {
  const result = {};

  for (const account of context.marginAccounts) {
    const requiredPaydown = sum(context.sellCandidates
      .filter(candidate => candidate.accountName === account.accountName)
      .map(candidate => {
        const saleDollars = getSellLpDollarValue(solution, candidate, context);
        return saleDollars * (1 - candidate.marginMaintenanceRate);
      })) - account.excessEquity;
    const paydown = Math.min(account.debit, Math.max(0, requiredPaydown));
    if (paydown > context.moneyEpsilon) result[account.accountName] = paydown;
  }

  return result;
}

function getResidualUnderBySector(context, exposureBySector) {
  const residual = {};

  for (const sector of context.sectors) {
    const delta = context.targetBySector[sector] - exposureBySector[sector];
    if (delta > context.moneyEpsilon) residual[sector] = delta;
  }

  return residual;
}

function getResidualOverBySector(context, exposureBySector) {
  const residual = {};

  for (const sector of context.sectors) {
    const delta = exposureBySector[sector] - context.targetBySector[sector];
    if (delta > context.moneyEpsilon) residual[sector] = delta;
  }

  return residual;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function postProgress(requestId, message) {
  self.postMessage({ type: "progress", requestId, message });
}

function postPhaseResult(requestId, phase, plan) {
  self.postMessage({
    type: "phaseResult",
    requestId,
    phase,
    plan
  });
}
