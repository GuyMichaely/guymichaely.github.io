function renderNetWorthSummary() {
  const metrics = getDashboardMetrics();
  const investmentValue = sum(getSecurityLots(state.lots).map(lot => lot.value));
  const marginBalance = sum(state.marginSummaries.map(summary => summary.debit));
  const cashBalance = metrics.cashBalance;
  // API contract: known-interest balance is already included in net worth, not an additional asset bucket.
  const knownInterestBalance = metrics.knownInterestRateAssets.balance;
  const knownInterestPortfolioGrowthMonthlyDelta = metrics.knownInterestRateAssets.portfolioGrowthMonthlyDelta;
  const liquidInterestGrowth = metrics.cashFlow.liquidInterestGrowth;
  const debtServicing = metrics.cashFlow.debtServicing;
  const otherDebtsBalance = metrics.otherDebtsBalance;
  const recurringIncome = metrics.recurring.incomeTotal;
  const recurringExpenses = metrics.recurring.expenseTotal;
  const monthlySpend = metrics.monthlySpend;
  const totalMonthlyOutflow = recurringExpenses + monthlySpend + debtServicing;
  const netMonthlyCashFlow = recurringIncome + liquidInterestGrowth - totalMonthlyOutflow;
  const totalDebt = marginBalance + otherDebtsBalance;
  const cashNetOfDebt = cashBalance - totalDebt;
  const netWorth = investmentValue + cashNetOfDebt;
  const unknownRateAssets = netWorth - knownInterestBalance;
  const fireAnnualRate = state.fireRatePercent / 100;
  const monthlyFireCoefficient = Math.pow(1 + fireAnnualRate, 1 / 12) - 1;
  const unknownRateMonthlyDelta = unknownRateAssets * monthlyFireCoefficient;
  const portfolioGrowthDelta = unknownRateMonthlyDelta + knownInterestPortfolioGrowthMonthlyDelta;
  const expectedMonthlyNetWorthChange = portfolioGrowthDelta + netMonthlyCashFlow;
  const monthlySupportNeed = -netMonthlyCashFlow - knownInterestPortfolioGrowthMonthlyDelta;
  const requiredUnknownRateAssets = monthlyFireCoefficient === 0
    ? null
    : monthlySupportNeed / monthlyFireCoefficient;
  const portfolioNeeded = requiredUnknownRateAssets === null
    ? null
    : knownInterestBalance + requiredUnknownRateAssets;
  const additionNeeded = portfolioNeeded === null || Math.abs(netWorth) <= MONEY_EPSILON
    ? null
    : portfolioNeeded / netWorth - 1;
  const extraPortfolioNeeded = portfolioNeeded === null
    ? null
    : portfolioNeeded - netWorth;
  const survivableDrop = additionNeeded === null
    ? null
    : -additionNeeded;
  const needsMorePortfolio = additionNeeded !== null && additionNeeded > MONEY_EPSILON;
  const supportBufferValue = needsMorePortfolio ? additionNeeded : survivableDrop;
  const minimumMonthlyFireCoefficient = Math.abs(unknownRateAssets) <= MONEY_EPSILON
    ? null
    : monthlySupportNeed / unknownRateAssets;
  const minimumFireAnnualRate = minimumMonthlyFireCoefficient === null || minimumMonthlyFireCoefficient <= -1
    ? null
    : Math.pow(1 + minimumMonthlyFireCoefficient, 12) - 1;
  setStatText("fireNetWorth", formatCurrency(netWorth), netWorth >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireExpectedMonthlyChange", formatCurrency(expectedMonthlyNetWorthChange), expectedMonthlyNetWorthChange >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireNetWorthPortfolio", formatCurrency(investmentValue));
  setStatText("fireNetWorthCashNet", formatCurrency(cashNetOfDebt), cashNetOfDebt >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireNetWorthCash", formatCurrency(cashBalance));
  setStatText("fireNetWorthBrokerageDebt", formatCurrency(-marginBalance), marginBalance > MONEY_EPSILON ? "var(--danger)" : "");
  setStatText("fireNetWorthOtherDebts", formatCurrency(-otherDebtsBalance), otherDebtsBalance > MONEY_EPSILON ? "var(--danger)" : "");
  setStatText("fireSupportBufferLabel", needsMorePortfolio ? "% addition needed to support cash flow" : "Greatest portfolio drop survivable");
  setStatText("fireSupportBuffer", formatNullablePercent(supportBufferValue), supportBufferValue === null ? "" : needsMorePortfolio ? "var(--danger)" : "var(--good)");
  setStatText("fireExtraPortfolioNeeded", formatNullableCurrency(extraPortfolioNeeded), extraPortfolioNeeded !== null && extraPortfolioNeeded <= MONEY_EPSILON ? "var(--good)" : "var(--danger)");
  setStatText("fireUnknownRateDelta", formatCurrency(unknownRateMonthlyDelta), unknownRateMonthlyDelta >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireKnownRateDelta", formatCurrency(knownInterestPortfolioGrowthMonthlyDelta), knownInterestPortfolioGrowthMonthlyDelta >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("firePortfolioGrowthDelta", formatCurrency(portfolioGrowthDelta), portfolioGrowthDelta >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireExpectedMonthlyChangeInline", formatCurrency(expectedMonthlyNetWorthChange), expectedMonthlyNetWorthChange >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireTotalMonthlyOutflow", formatCurrency(totalMonthlyOutflow), totalMonthlyOutflow > 0 ? "var(--danger)" : "");
  setStatText("fireRecurringExpenses", formatCurrency(recurringExpenses), "var(--danger)");
  setStatText("fireMonthlySpend", formatCurrency(monthlySpend), "var(--danger)");
  setStatText("fireDebtServicing", formatCurrency(debtServicing), "var(--danger)");
  setStatText("fireRecurringIncome", formatCurrency(recurringIncome), recurringIncome >= 0 ? "var(--good)" : "");
  setStatText("fireLiquidInterestGrowth", formatCurrency(liquidInterestGrowth), liquidInterestGrowth >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireNetMonthlyCashFlow", formatCurrency(netMonthlyCashFlow), netMonthlyCashFlow >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireNetMonthlyCashFlowInline", formatCurrency(netMonthlyCashFlow), netMonthlyCashFlow >= 0 ? "var(--good)" : "var(--danger)");
  setStatText("fireMinimumRate", formatNullablePercent(minimumFireAnnualRate), minimumFireAnnualRate === null ? "" : minimumFireAnnualRate <= fireAnnualRate ? "var(--good)" : "var(--danger)");

  document.getElementById("fireStatus").textContent = "";
}

function getDashboardMetrics() {
  return state.dashboardMetrics;
}
