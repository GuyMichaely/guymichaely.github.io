const API_URL_KEY = "financialDash.apiUrl";
const DASHBOARD_DATA_CACHE_KEY = "financialDash.apiPayload";
const DEMO_MODE_KEY = "financialDash.demoMode";
const DEMO_PASSWORD_KEY = "financialDash.demoExitPassword";

const FILTERS = [
  { key: "accountType", label: "Account type" },
  { key: "accountName", label: "Account name" },
  { key: "sector", label: "Sector exposure" },
  { key: "ticker", label: "Ticker" },
  { key: "term", label: "Term" }
];

const PIE_KEYS = ["accountType", "accountName", "sector", "ticker", "term"];
const SECTOR_KEY = "sector";
const TERM_KEY = "term";
const CASH_SECTOR = "CASH";
const CASH_TICKER = "CASH";
const CASH_TERM = "CASH";
const RESIDUAL_NET_CASH_ACCOUNT_TYPE = "Individual";
const RESIDUAL_NET_CASH_ACCOUNT_NAME = "Net cash";
const SALE_BREAKDOWN_KEYS = PIE_KEYS;
const TRADE_FILTERS = FILTERS.filter(filter => filter.key !== SECTOR_KEY);
const SELL_TRADE_FILTERS = TRADE_FILTERS;
const BUY_TRADE_FILTERS = TRADE_FILTERS.filter(filter => filter.key === "ticker");
const TRADE_FILTERS_BY_MODE = {
  sell: SELL_TRADE_FILTERS,
  buy: BUY_TRADE_FILTERS
};
const TARGET_TOTAL_TOLERANCE = 0.01;
// Half-cent dust threshold for dollar-denominated comparisons and loop termination.
const MONEY_EPSILON = 0.005;
// Floating-point noise threshold for percent-point target comparisons.
const PERCENT_POINT_EPSILON = 1e-9;

const PIE_TITLES = {
  accountType: "Account type",
  accountName: "Account name",
  sector: "Sector exposure",
  ticker: "Ticker",
  term: "Holding term"
};

const PIE_METRICS = [
  { key: "value", label: "Value", amountKey: "value" },
  { key: "profit", label: "Profit", amountKey: "profit" }
];

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f97316",
  "#0891b2", "#4f46e5", "#65a30d", "#be123c", "#0f766e",
  "#7c3aed", "#ca8a04", "#475569", "#c026d3", "#0284c7"
];

const state = {
  accounts: [],
  cashEquivalents: [],
  otherDebts: [],
  priceMap: {},
  sectorWeightMap: {},
  lots: [],
  saleSortedLots: [],
  saleRenderTimer: null,
  lotRowsRenderTimer: null,
  rebalanceRenderTimer: null,
  rebalanceWorker: null,
  rebalanceRequestId: 0,
  rebalanceStartedAt: null,
  rebalanceStatusTimer: null,
  rebalanceStatusMessage: "",
  rebalancePhaseSummaries: {},
  rebalancePlan: null,
  filteredLots: [],
  saleCurvePoints: [],
  companionProfitSeriesByKey: {},
  companionValueSeriesByKey: {},
  currentSaleLots: [],
  salePathCache: new Map(),
  saleTargetAmount: null,
  saleTargetGrossAmount: null,
  saleTargetNetAmount: null,
  saleTargetMarginPaydown: null,
  saleTargetProfit: null,
  saleMode: "tax",
  pieSlices: {},
  pieVisible: {
    value: true,
    profit: true
  },
  hideInactivePieBullets: false,
  filterValues: {},
  tradeFilterValues: {},
  filterSearch: {},
  selected: {},
  tradeSelected: {
    sell: {},
    buy: {}
  },
  tradeFilterSearch: {
    sell: {},
    buy: {}
  },
  resizeHeights: {},
  marginModel: { accounts: {} },
  marginSummaries: [],
  dashboardMetrics: null,
  fireRatePercent: 3,
  targetSaleCollapsedAccounts: new Set(),
  rebalanceRealizationLimits: {
    minGrossGain: 0,
    maxGrossLoss: 0
  },
  rebalanceRealizationLimitDefaults: {
    minGrossGain: 0,
    maxGrossLoss: 0
  },
  exposureTargets: {},
  exposureTargetInputModes: {},
  exposureLocked: new Set(),
  exposureTargetMessage: "",
  exposureTargetOrder: [],
  activePieIndex: 0,
  activeCompanionIndex: 0,
  managementTab: "accounts",
  managementBusy: false,
  demoMode: false,
  accountAutosave: {
    dirtyRowKeys: new Set(),
    pendingOps: [],
    inFlightOps: [],
    timer: null,
    inFlight: false
  },
  trade: {
    side: "buy",
    accountName: "",
    sellDrafts: new Map(),
    sort: { key: null, direction: 1 }
  },
  saleTargetSource: "amount",
  saleAxis: {
    xSymlog: false,
    ySymlog: false,
    xMode: "net"
  }
};
