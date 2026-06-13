async function loadData({ refreshMode = "cache" } = {}) {
  clearScheduledSalePlanner();
  clearScheduledLotRows();
  clearScheduledRebalancePlan();
  const explicitRefresh = refreshMode !== "cache";

  // A fresh load replaces the grid, so edits pending against the prior data are dropped.
  state.accountAutosave.dirtyRowKeys = new Set();
  state.accountAutosave.pendingOps = [];

  if (state.demoMode) {
    applyDashboardData(getDemoDashboardData());
    setManagementStatus("Demo mode — changes are not saved.");
    return;
  }

  if (refreshMode === "cache") {
    const cached = readCachedDashboardData();
    if (cached) {
      applyDashboardData(cached.data);
      return;
    }

    refreshMode = "everything";
  }

  if (getDashboardDataUrl() === null) {
    if (readCachedDashboardData() === null) {
      applyDashboardData(getEmptyDashboardData());
      document.getElementById("firstRunHint").hidden = false;
    }
    if (explicitRefresh) flagMissingApiUrl();
    document.getElementById("statusText").textContent = "Set the API URL (sidebar) to fetch data.";
    return;
  }

  setDataRefreshInProgress(true, refreshMode);

  try {
    const apiData = await fetchDashboardData(buildDashboardRequest(refreshMode));
    const dashboardData = mergeApiData(refreshMode, apiData);
    applyDashboardData(dashboardData);
    cacheDashboardData(dashboardData);
  } catch (error) {
    if (error.apiError) {
      reportDashboardLoadError(error.apiError);
      return;
    }

    if (error.networkError) {
      reportDashboardNetworkError(error.networkError);
      return;
    }

    throw error;
  } finally {
    setDataRefreshInProgress(false, refreshMode);
  }
}


function buildDashboardRequest(refreshMode) {
  if (refreshMode === "holdings") {
    return {
      mode: "holdings",
      knownSectorTickers: getCachedSectorTickers()
    };
  }

  return { mode: refreshMode };
}


function getDashboardDataUrl() {
  return window.localStorage.getItem(API_URL_KEY);
}


function flagMissingApiUrl() {
  document.getElementById("apiUrlInput").classList.add("api-url-invalid");
  document.getElementById("apiUrlStatus").textContent = "An API URL is required for network operations.";
}


function getEmptyDashboardData() {
  return {
    priceMap: {},
    sectorWeights: [[], {}],
    accounts: [],
    cashEquivalents: [],
    otherDebts: [],
    dashboardMetrics: {
      monthlySpend: 0,
      cashBalance: 0,
      knownInterestRateAssets: { balance: 0, portfolioGrowthMonthlyDelta: 0 },
      cashFlow: { liquidInterestGrowth: 0, debtServicing: 0 },
      otherDebtsBalance: 0,
      recurring: { incomeTotal: 0, expenseTotal: 0 },
    },
  };
}


async function probeDashboardData(baseUrl) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("mode", "everything");
    const response = await fetch(url, { cache: "no-store" });
    const payload = await readJsonResponse(response);
    return payload.error ? null : payload;
  } catch (error) {
    return null;
  }
}


async function fetchDashboardData(request) {
  const url = new URL(getDashboardDataUrl());
  url.searchParams.set("mode", request.mode);

  if (request.mode === "holdings") {
    url.searchParams.set("knownSectorTickers", JSON.stringify(request.knownSectorTickers));
  }

  let response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throwNetworkError(error);
  }

  const payload = await readJsonResponse(response);

  if (payload.error) {
    throwApiError(payload.error);
  }

  return payload;
}


async function readJsonResponse(response) {
  if (!response.ok) {
    throwBadResponseError(`HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throwBadResponseError("the response is not JSON");
  }
}


function throwBadResponseError(detail) {
  const error = new Error(`Dashboard API returned an unusable response: ${detail}`);
  error.networkError = {
    code: "DASHBOARD_API_BAD_RESPONSE",
    message: error.message
  };
  throw error;
}


function mergeApiData(refreshMode, apiData) {
  if (refreshMode === "prices") {
    const cached = readCachedDashboardData();
    return {
      ...cached.data,
      priceMap: apiData.priceMap
    };
  }

  if (refreshMode === "holdings") {
    const cached = readCachedDashboardData();
    return cached ? completeDashboardSectorWeights(apiData, cached.data.sectorWeights) : apiData;
  }

  return apiData;
}


function completeDashboardSectorWeights(data, cachedSectorWeights) {
  const [sectorNames, cachedWeightsByTicker] = cachedSectorWeights;
  const [, apiWeightsByTicker] = data.sectorWeights;

  return {
    ...data,
    sectorWeights: [
      sectorNames,
      {
        ...cachedWeightsByTicker,
        ...apiWeightsByTicker
      }
    ]
  };
}


function applyDashboardData(data) {
  const preparedData = prepareDashboardData(data);
  state.accounts = [...data.accounts];
  state.cashEquivalents = [...data.cashEquivalents];
  state.otherDebts = [...data.otherDebts];
  reapplyOptimisticCreates();
  state.priceMap = data.priceMap;
  state.lots = preparedData.lots;
  state.saleSortedLots = preparedData.saleSortedLots;
  state.sectorWeightMap = preparedData.sectorWeightMap;
  state.marginModel = preparedData.marginModel;
  state.marginSummaries = preparedData.marginSummaries;
  state.dashboardMetrics = preparedData.dashboardMetrics;
  state.salePathCache.clear();
  initializeFilters();
  render();
  renderDataManagement();
  scheduleRebalancePlan(0);
  document.getElementById("firstRunHint").hidden = true;
  updateDataFreshness();
}


function updateDataFreshness() {
  const node = document.getElementById("dataFreshness");

  if (state.demoMode) {
    node.textContent = "";
    return;
  }

  const cached = readCachedDashboardData();
  node.textContent = cached === null ? "" : `Data as of ${formatDateTime(cached.savedAt)}`;
}


async function mutateDashboardData(request) {
  setManagementBusy(true);
  setManagementStatus("Saving…");
  const sentUrl = getDashboardDataUrl();

  try {
    const apiData = await postDashboardMutation({ actions: [request] });
    if (getDashboardDataUrl() !== sentUrl) return true;

    const dashboardData = mergeMutationData(apiData);

    if (state.demoMode) {
      cacheDashboardData(dashboardData);
      return true;
    }

    const editState = captureManagementEditState();
    applyDashboardData(dashboardData);
    restoreManagementEditState(editState);
    cacheDashboardData(dashboardData);
    setManagementStatus("Saved.");
    return true;
  } catch (error) {
    if (error.apiError) {
      reportManagementApiError(error.apiError);
      return false;
    }

    if (error.networkError) {
      reportManagementNetworkError(error.networkError);
      return false;
    }

    throw error;
  } finally {
    setManagementBusy(false);
    renderTradeSection();
  }
}


let dashboardMutationQueue = Promise.resolve();

function postDashboardMutation(request) {
  const send = dashboardMutationQueue.then(() => sendDashboardMutation(request));
  dashboardMutationQueue = send.then(() => undefined, () => undefined);
  return send;
}


async function sendDashboardMutation(request) {
  if (getDashboardDataUrl() === null) flagMissingApiUrl();

  let response;
  try {
    response = await fetch(getDashboardDataUrl(), {
      method: "post",
      body: JSON.stringify({
        ...request,
        knownSectorTickers: getCachedSectorTickers()
      }),
      cache: "no-store"
    });
  } catch (error) {
    throwNetworkError(error);
  }

  const payload = await readJsonResponse(response);

  if (payload.error) {
    throwApiError(payload.error);
  }

  return payload;
}


function mergeMutationData(apiData) {
  const cached = readCachedDashboardData();
  return cached ? completeDashboardSectorWeights(apiData, cached.data.sectorWeights) : apiData;
}


function throwNetworkError(error) {
  const networkError = new Error(`Dashboard API network request failed: ${error.message}`);
  networkError.networkError = {
    code: "DASHBOARD_API_NETWORK_FAILED",
    message: networkError.message
  };
  throw networkError;
}


function throwApiError(apiError) {
  const error = new Error(`[${apiError.code}] ${apiError.message}`);
  error.apiError = apiError;
  throw error;
}


function reportDashboardLoadError(apiError) {
  console.error(apiError);
  document.getElementById("statusText").textContent = `Refresh failed: ${apiError.code} (${apiError.ticker}) ${apiError.message}`;
}


function reportDashboardNetworkError(networkError) {
  console.error(networkError);
  document.getElementById("statusText").textContent = `Refresh failed: ${networkError.code} ${networkError.message}`;
}


function readCachedDashboardData() {
  const raw = window.localStorage.getItem(DASHBOARD_DATA_CACHE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}


function getCachedSectorTickers() {
  const cached = readCachedDashboardData();
  return cached ? Object.keys(cached.data.sectorWeights[1]) : [];
}


function cacheDashboardData(data) {
  window.localStorage.setItem(DASHBOARD_DATA_CACHE_KEY, JSON.stringify({
    savedAt: Date.now(),
    data
  }));
  updateDataFreshness();
}


function setDataRefreshInProgress(isLoading, activeMode) {
  const buttons = [
    ["prices", document.getElementById("refreshPricesButton"), "Prices"],
    ["holdings", document.getElementById("refreshHoldingsButton"), "Holdings"],
    ["everything", document.getElementById("refreshEverythingButton"), "Everything"]
  ];

  for (const [mode, button, label] of buttons) {
    button.disabled = isLoading;
    button.textContent = isLoading && mode === activeMode ? "Fetching..." : label;
  }
}
