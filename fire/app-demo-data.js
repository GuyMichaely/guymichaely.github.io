function getDemoDashboardData() {
  return {
    priceMap: {
      AAPL: 230, MSFT: 420, NVDA: 130, AMZN: 185, TSLA: 250,
      VOO: 510, QQQ: 480, SCHD: 28, BND: 73, VNQ: 85,
    },
    sectorWeights: [
      [
        "INFORMATION TECHNOLOGY", "COMMUNICATION SERVICES", "CONSUMER DISCRETIONARY",
        "HEALTHCARE", "FINANCIALS", "REAL ESTATE", "BOND FUNDS", "ENERGY",
        "INDUSTRIALS", "CONSUMER STAPLES",
      ],
      {
        AAPL: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        MSFT: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        NVDA: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        AMZN: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        TSLA: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        VOO: [0.32, 0.09, 0.1, 0.12, 0.13, 0.03, 0, 0.04, 0.09, 0.08],
        QQQ: [0.59, 0.15, 0.12, 0.06, 0.01, 0, 0, 0.01, 0.03, 0.03],
        SCHD: [0.12, 0.05, 0.08, 0.15, 0.18, 0, 0, 0.12, 0.16, 0.14],
        BND: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        VNQ: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
      },
    ],
    accounts: [
      {
        accountName: "Demo Brokerage", accountType: "Individual", accountTypeKey: "individual",
        holdings: [
          { rowNumber: 3, ticker: "AAPL", term: "Long-term", date: "2022-03-14T05:00:00.000Z", shares: 40, perShareBasis: 162, value: 9200, expectedGrowth: null },
          { rowNumber: 4, ticker: "NVDA", term: "Long-term", date: "2021-08-02T05:00:00.000Z", shares: 120, perShareBasis: 21, value: 15600, expectedGrowth: null },
          { rowNumber: 5, ticker: "NVDA", term: "Short-term", date: "2025-11-20T05:00:00.000Z", shares: 30, perShareBasis: 138, value: 3900, expectedGrowth: null },
          { rowNumber: 6, ticker: "VOO", term: "Long-term", date: "2023-01-09T05:00:00.000Z", shares: 55, perShareBasis: 352, value: 28050, expectedGrowth: null },
          { rowNumber: 7, ticker: "TSLA", term: "Short-term", date: "2025-09-15T05:00:00.000Z", shares: 20, perShareBasis: 291, value: 5000, expectedGrowth: null },
          { rowNumber: 8, ticker: "AMZN", term: "Long-term", date: "2022-06-27T05:00:00.000Z", shares: 35, perShareBasis: 109, value: 6475, expectedGrowth: null },
        ],
        financing: [
          { kind: "cash", balance: 4200, monthlyInterest: 14, contributesToCashFlow: true },
          { kind: "margin", balance: 6500, monthlyInterest: 48, contributesToCashFlow: true },
        ],
        maintenanceByTicker: { AAPL: 0.25, NVDA: 0.3, VOO: 0.25, TSLA: 0.4, AMZN: 0.25 },
      },
      {
        accountName: "Demo Roth IRA", accountType: "Roth", accountTypeKey: "roth",
        holdings: [
          { rowNumber: 3, ticker: "QQQ", term: "Long-term", shares: 65, value: 31200, expectedGrowth: null },
          { rowNumber: 4, ticker: "SCHD", term: "Long-term", shares: 300, value: 8400, expectedGrowth: null },
          { rowNumber: 5, ticker: "VOO", term: "Long-term", shares: 28, value: 14280, expectedGrowth: null },
        ],
        financing: [
          { kind: "cash", balance: 850, monthlyInterest: 2.1, contributesToCashFlow: true },
          { kind: "margin", balance: 0, monthlyInterest: 0, contributesToCashFlow: false },
        ],
        maintenanceByTicker: {},
      },
      {
        accountName: "Demo 401k", accountType: "Pre-tax", accountTypeKey: "traditional",
        holdings: [
          { rowNumber: 3, ticker: "VOO", term: "Short-term", shares: 90, value: 45900, expectedGrowth: null },
          { rowNumber: 4, ticker: "BND", term: "Short-term", shares: 140, value: 10220, expectedGrowth: null },
          { rowNumber: 5, ticker: "VNQ", term: "Short-term", shares: 60, value: 5100, expectedGrowth: null },
        ],
        financing: [
          { kind: "cash", balance: 0, monthlyInterest: 0, contributesToCashFlow: false },
          { kind: "margin", balance: 0, monthlyInterest: 0, contributesToCashFlow: false },
        ],
        maintenanceByTicker: {},
      },
    ],
    cashEquivalents: [
      { accountName: "Demo HYSA", accountType: "Individual", balance: 18500, monthlyInterest: 63.5, contributesToCashFlow: true },
      { accountName: "Demo Checking", accountType: "Individual", balance: 2300, monthlyInterest: 0, contributesToCashFlow: false },
    ],
    otherDebts: [
      { name: "Demo Auto Loan", balance: 9800, monthlyInterest: 52, contributesToCashFlow: true },
    ],
    dashboardMetrics: {
      monthlySpend: 1500,
      cashBalance: 25850,
      knownInterestRateAssets: { balance: 10220, portfolioGrowthMonthlyDelta: 31 },
      cashFlow: { liquidInterestGrowth: 79.6, debtServicing: 100 },
      otherDebtsBalance: 9800,
      // Slightly negative net cash flow: net-worth growth in the demo story is
      // carried by portfolio returns, not income.
      recurring: { incomeTotal: 5200, expenseTotal: 3900 },
    },
  };
}
