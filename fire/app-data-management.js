const MANAGEMENT_ACCOUNT_TYPES = [
  { key: "individual", label: "Individual" },
  { key: "roth", label: "Roth" },
  { key: "traditional", label: "Pre-tax" },
];

const ACCOUNT_AUTOSAVE_DEBOUNCE_MS = 1200;


function initializeDataManagement() {
  document.getElementById("managementTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-management-tab]");
    if (!button) return;

    state.managementTab = button.dataset.managementTab;
    renderDataManagement();
  });

  document.getElementById("createAccountForm").addEventListener("submit", event => {
    event.preventDefault();
    if (state.demoMode) {
      setManagementStatus("Demo mode — changes are not saved.");
      return;
    }
    const pending = {
      type: "create",
      accountName: document.getElementById("createAccountName").value,
      accountType: document.getElementById("createAccountType").value,
    };
    state.accountAutosave.pendingOps.push(pending);
    insertOptimisticAccount(pending);
    document.getElementById("createAccountName").value = "";
    rerenderManagementPreservingEdits();
    flushManagementAutosave();
  });

  document.getElementById("managementAccountRows").addEventListener("input", event => {
    if (state.demoMode) {
      setManagementStatus("Demo mode — changes are not saved.");
      return;
    }
    markManagementRowDirty(event.target.closest("tr"));
  });

  document.getElementById("managementAccountRows").addEventListener("click", event => {
    const button = event.target.closest("[data-management-account-action]");
    if (!button) return;

    if (state.demoMode) {
      setManagementStatus("Demo mode — changes are not saved.");
      return;
    }

    const rowKey = button.closest("tr").dataset.managementRowKey;
    const accountName = managementRowKeyName(rowKey);
    const prompts = {
      account: `Delete account sheet "${accountName}"?`,
      cashEq: `Delete cash/equivalent row "${accountName}"?`,
      debt: `Delete debt row "${accountName}"?`,
    };
    if (!window.confirm(prompts[managementRowKeyKind(rowKey)])) return;

    state.accountAutosave.dirtyRowKeys.delete(rowKey);
    state.accountAutosave.pendingOps.push({ type: "delete", rowKey });
    rerenderManagementPreservingEdits();
    flushManagementAutosave();
  });

  document.getElementById("tradeSideTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-trade-side]");
    if (!button) return;

    state.trade.side = button.dataset.tradeSide;
    state.trade.sellDrafts = new Map();
    document.getElementById("tradeShares").value = "";
    document.getElementById("tradeVolume").value = "";
    renderDataManagement();
  });

  document.getElementById("tradeAccount").addEventListener("change", event => {
    state.trade.accountName = event.target.value;
    renderDataManagement();
  });

  document.getElementById("tradeLotHeader").addEventListener("click", event => {
    const header = event.target.closest("[data-trade-sort]");
    if (!header) return;

    const key = header.dataset.tradeSort;
    if (state.trade.sort.key === key) {
      state.trade.sort.direction *= -1;
    } else {
      state.trade.sort = { key, direction: 1 };
    }

    renderTradeLotRows();
  });

  document.getElementById("tradeSelectAll").addEventListener("click", () => {
    const lots = getSellableLots();
    const allSelected = lots.length > 0 && lots.every(lot => state.trade.sellDrafts.has(sellLotKey(lot)));

    for (const lot of lots) {
      if (allSelected) {
        state.trade.sellDrafts.delete(sellLotKey(lot));
      } else if (!state.trade.sellDrafts.has(sellLotKey(lot))) {
        state.trade.sellDrafts.set(sellLotKey(lot), newSellDraft(lot));
      }
    }

    renderTradeLotRows();
    renderTradeCommitPanel();
  });

  document.getElementById("tradeLotRows").addEventListener("click", event => {
    const row = event.target.closest("tr[data-trade-lot-key]");
    if (!row) return;

    const checkbox = row.querySelector("input[type='checkbox']");
    if (event.target.tagName === "INPUT" && event.target !== checkbox) return;

    const lotKey = row.dataset.tradeLotKey;
    const selected = event.target === checkbox ? checkbox.checked : !state.trade.sellDrafts.has(lotKey);

    if (selected) {
      state.trade.sellDrafts.set(lotKey, newSellDraft(getSellableLots().find(lot => sellLotKey(lot) === lotKey)));
    } else {
      state.trade.sellDrafts.delete(lotKey);
    }

    renderTradeLotRows();
    renderTradeCommitPanel();
  });

  document.getElementById("tradeLotRows").addEventListener("input", event => {
    const row = event.target.closest("tr[data-trade-lot-key]");
    const draft = state.trade.sellDrafts.get(row.dataset.tradeLotKey);

    if (event.target.matches("[data-lot-shares]")) {
      draft.shares = event.target.value;
      if (!draft.volumeManual) {
        draft.volume = autoSellVolume(draft.ticker, Number(draft.shares));
        row.querySelector("[data-lot-volume]").value = draft.volume;
      }
    }

    if (event.target.matches("[data-lot-volume]")) {
      draft.volume = event.target.value;
      draft.volumeManual = true;
    }

    renderTradeCommitPanel();
  });

  document.getElementById("tradeForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (state.demoMode) {
      setManagementStatus("Demo mode — changes are not saved.");
      return;
    }

    const saved = await mutateDashboardData(buildTradeRequest());
    if (!saved) return;

    state.trade.sellDrafts = new Map();
    document.getElementById("tradeTicker").value = "";
    document.getElementById("tradeShares").value = "";
    document.getElementById("tradeVolume").value = "";
    document.getElementById("tradeDate").value = todayInputValue();
    renderDataManagement();
  });

  document.getElementById("purchaseAmount").addEventListener("input", renderPurchaseAmountPreview);

  document.getElementById("purchaseForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (state.demoMode) {
      setManagementStatus("Demo mode — changes are not saved.");
      return;
    }

    const saved = await mutateDashboardData(buildPurchaseRequest());
    if (saved) resetPurchaseForm();
  });

  resetPurchaseForm();
}


function buildPurchaseRequest() {
  return {
    action: "addPurchase",
    date: document.getElementById("purchaseDate").value,
    amount: document.getElementById("purchaseAmount").value,
    categories: document.getElementById("purchaseCategories").value
      .split("|")
      .map(category => category.trim())
      .filter(category => category !== ""),
  };
}


function renderPurchaseAmountPreview() {
  const input = document.getElementById("purchaseAmount");
  const preview = document.getElementById("purchaseAmountPreview");

  if (!input.value.startsWith("=")) {
    input.classList.remove("purchase-amount-invalid");
    preview.textContent = "";
    return;
  }

  const result = evaluatePurchaseExpression(input.value.slice(1));
  input.classList.toggle("purchase-amount-invalid", result === null);
  preview.textContent = result === null ? "Cannot evaluate" : `= ${formatCurrency(result)}`;
}


function evaluatePurchaseExpression(expression) {
  if (!/^[0-9+\-*/.()\s]*$/.test(expression)) return null;

  try {
    const result = Function(`"use strict"; return (${expression});`)();
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch (error) {
    return null;
  }
}


function resetPurchaseForm() {
  const amount = document.getElementById("purchaseAmount");
  amount.value = "";
  amount.classList.remove("purchase-amount-invalid");
  document.getElementById("purchaseAmountPreview").textContent = "";
  document.getElementById("purchaseDate").value = todayInputValue();
  document.getElementById("purchaseCategories").value = "";
}


function newSellDraft(lot) {
  return {
    ticker: lot.ticker,
    shares: formatPlainNumber(lot.shares),
    volume: autoSellVolume(lot.ticker, lot.shares),
    volumeManual: false,
  };
}


function autoSellVolume(ticker, shares) {
  return String(Math.round(shares * state.priceMap[ticker] * 100) / 100);
}


function buildTradeRequest() {
  const request = {
    action: "recordTrade",
    side: state.trade.side,
    settleWithCash: document.getElementById("tradeSettleCash").checked,
  };

  if (state.trade.side === "buy") {
    request.accountName = state.trade.accountName;
    request.ticker = document.getElementById("tradeTicker").value;
    request.shares = Number(document.getElementById("tradeShares").value);
    request.volume = Number(document.getElementById("tradeVolume").value);
    if (getManagementAccount(state.trade.accountName).accountTypeKey === "individual") {
      request.date = document.getElementById("tradeDate").value;
    }
    return request;
  }

  const salesByAccount = new Map();

  for (const lot of getSelectedSellableLots()) {
    const draft = state.trade.sellDrafts.get(sellLotKey(lot));
    if (!salesByAccount.has(lot.accountName)) {
      salesByAccount.set(lot.accountName, { accountName: lot.accountName, volume: 0, lots: [] });
    }
    const sale = salesByAccount.get(lot.accountName);
    sale.lots.push({ rowNumber: lot.rowNumber, shares: Number(draft.shares) });
    sale.volume += Number(draft.volume);
  }

  request.sales = [...salesByAccount.values()];
  return request;
}


function managementRowKey(kind, accountName) {
  return `${kind}:${accountName}`;
}


function managementRowKeyKind(rowKey) {
  return rowKey.slice(0, rowKey.indexOf(":"));
}


function managementRowKeyName(rowKey) {
  return rowKey.slice(rowKey.indexOf(":") + 1);
}


function markManagementRowDirty(row) {
  state.accountAutosave.dirtyRowKeys.add(row.dataset.managementRowKey);
  setManagementStatus("Unsaved changes…");

  if (state.accountAutosave.timer !== null) clearTimeout(state.accountAutosave.timer);
  state.accountAutosave.timer = setTimeout(() => {
    state.accountAutosave.timer = null;
    flushManagementAutosave();
  }, ACCOUNT_AUTOSAVE_DEBOUNCE_MS);
}


function hasManagementWork() {
  return state.accountAutosave.pendingOps.length > 0
    || state.accountAutosave.dirtyRowKeys.size > 0;
}


function allPendingOps() {
  return [...state.accountAutosave.inFlightOps, ...state.accountAutosave.pendingOps];
}


function pendingDeleteRowKeys() {
  return new Set(allPendingOps().filter(op => op.type === "delete").map(op => op.rowKey));
}


function insertOptimisticAccount(pending) {
  if (pending.accountType === "cashEquivalent") {
    state.cashEquivalents.push({
      accountName: pending.accountName,
      accountType: "Individual",
      balance: 0,
      monthlyInterest: 0,
      contributesToCashFlow: false,
    });
    return;
  }

  if (pending.accountType === "otherDebt") {
    state.otherDebts.push({
      name: pending.accountName,
      balance: 0,
      monthlyInterest: 0,
      contributesToCashFlow: false,
    });
    return;
  }

  state.accounts.push({
    accountName: pending.accountName,
    accountType: MANAGEMENT_ACCOUNT_TYPES.find(type => type.key === pending.accountType).label,
    accountTypeKey: pending.accountType,
    holdings: [],
    financing: [
      { kind: "cash", balance: 0, monthlyInterest: 0, contributesToCashFlow: false },
      { kind: "margin", balance: 0, monthlyInterest: 0, contributesToCashFlow: false },
    ],
    maintenanceByTicker: {},
  });
}


function reapplyOptimisticCreates() {
  for (const op of allPendingOps()) {
    if (op.type === "create") insertOptimisticAccount(op);
  }
}


function flushManagementAutosave() {
  if (state.demoMode || state.accountAutosave.inFlight || !hasManagementWork()) return;

  if (getDashboardDataUrl() === null) {
    flagMissingApiUrl();
    return;
  }

  sendManagementBatch();
}


function scheduleManagementRetry() {
  if (state.accountAutosave.timer !== null) clearTimeout(state.accountAutosave.timer);
  state.accountAutosave.timer = setTimeout(() => {
    state.accountAutosave.timer = null;
    flushManagementAutosave();
  }, ACCOUNT_AUTOSAVE_DEBOUNCE_MS);
}


const DELETE_ACTIONS_BY_KIND = {
  account: "deleteAccount",
  cashEq: "deleteCashEquivalent",
  debt: "deleteOtherDebt",
};


async function sendManagementBatch() {
  const autosave = state.accountAutosave;
  autosave.inFlightOps = autosave.pendingOps;
  autosave.pendingOps = [];
  const dirtyKeys = [...autosave.dirtyRowKeys];
  autosave.dirtyRowKeys = new Set();

  const renames = [];
  const actions = autosave.inFlightOps.map(op => op.type === "create"
    ? { action: "createAccount", accountName: op.accountName, accountType: op.accountType }
    : { action: DELETE_ACTIONS_BY_KIND[managementRowKeyKind(op.rowKey)], accountName: managementRowKeyName(op.rowKey) });

  for (const rowKey of dirtyKeys) {
    const request = buildManagementRowRequest(rowKey, getManagementRow(rowKey));
    actions.push(request);
    if (request.accountName !== request.originalAccountName) {
      renames.push({ rowKey, toName: request.accountName });
    }
  }

  autosave.inFlight = true;
  setManagementStatus("Saving…");
  const sentUrl = getDashboardDataUrl();
  let saved = false;

  try {
    const apiData = await postDashboardMutation({ actions });

    if (getDashboardDataUrl() !== sentUrl) {
      autosave.inFlightOps = [];
      saved = true;
      return;
    }

    const dashboardData = mergeMutationData(apiData);
    const editState = state.demoMode ? { rows: new Map(), focus: null } : captureManagementEditState();
    autosave.inFlightOps = [];

    for (const rename of renames) {
      if (managementRowKeyKind(rename.rowKey) === "account" && state.trade.accountName === managementRowKeyName(rename.rowKey)) {
        state.trade.accountName = rename.toName;
      }
      remapManagementRowKey(editState, rename.rowKey, managementRowKey(managementRowKeyKind(rename.rowKey), rename.toName));
    }

    if (!state.demoMode) {
      applyDashboardData(dashboardData);
      restoreManagementEditState(editState);
    }

    cacheDashboardData(dashboardData);
    saved = true;
  } catch (error) {
    autosave.pendingOps = [...autosave.inFlightOps, ...autosave.pendingOps];
    autosave.inFlightOps = [];
    for (const rowKey of dirtyKeys) autosave.dirtyRowKeys.add(rowKey);

    if (error.apiError) {
      reportManagementApiError(error.apiError);
    } else if (error.networkError) {
      reportManagementNetworkError(error.networkError);
    } else {
      throw error;
    }
  } finally {
    autosave.inFlight = false;
  }

  if (state.demoMode) return;

  if (!saved) {
    scheduleManagementRetry();
    return;
  }

  if (autosave.timer !== null) return;

  if (hasManagementWork()) {
    flushManagementAutosave();
    return;
  }

  setManagementStatus("Saved.");
}


function rerenderManagementPreservingEdits() {
  const editState = captureManagementEditState();
  renderDataManagement();
  restoreManagementEditState(editState);
}


function buildManagementRowRequest(rowKey, row) {
  const kind = managementRowKeyKind(rowKey);
  const originalAccountName = managementRowKeyName(rowKey);
  const accountName = row.querySelector("[data-account-name-input]").value;

  if (kind === "cashEq") {
    return {
      action: "updateCashEquivalent",
      originalAccountName,
      accountName,
      balance: Number(row.querySelector("[data-cash-balance]").value),
      contributesToCashFlow: row.querySelector("[data-cash-contributes]").checked,
    };
  }

  if (kind === "debt") {
    return {
      action: "updateOtherDebt",
      originalAccountName,
      accountName,
      balance: -Number(row.querySelector("[data-cash-balance]").value),
      contributesToCashFlow: row.querySelector("[data-cash-contributes]").checked,
    };
  }

  return {
    action: "updateAccount",
    originalAccountName,
    accountName,
    accountType: row.querySelector("[data-account-type-input]").value,
    financing: [
      {
        kind: "cash",
        balance: Number(row.querySelector("[data-cash-balance]").value),
        contributesToCashFlow: row.querySelector("[data-cash-contributes]").checked,
      },
      {
        kind: "margin",
        balance: Number(row.querySelector("[data-margin-balance]").value),
        contributesToCashFlow: row.querySelector("[data-margin-contributes]").checked,
      },
    ],
  };
}


function managementRowFields(row) {
  return [...row.querySelectorAll("input, select")];
}


function captureManagementEditState() {
  const rows = new Map();

  for (const rowKey of state.accountAutosave.dirtyRowKeys) {
    rows.set(rowKey, managementRowFields(getManagementRow(rowKey)).map(field => {
      return field.type === "checkbox" ? field.checked : field.value;
    }));
  }

  const active = document.activeElement;
  const activeRow = active.closest("#managementAccountRows tr");
  const fieldIndex = activeRow === null ? -1 : managementRowFields(activeRow).indexOf(active);
  const focus = fieldIndex === -1 ? null : {
    rowKey: activeRow.dataset.managementRowKey,
    fieldIndex,
    selectionStart: active.type === "text" ? active.selectionStart : null,
    selectionEnd: active.type === "text" ? active.selectionEnd : null,
  };

  return { rows, focus };
}


function restoreManagementEditState({ rows, focus }) {
  for (const [rowKey, values] of rows) {
    managementRowFields(getManagementRow(rowKey)).forEach((field, index) => {
      if (field.type === "checkbox") {
        field.checked = values[index];
      } else {
        field.value = values[index];
      }
    });
  }

  if (focus === null) return;

  const field = managementRowFields(getManagementRow(focus.rowKey))[focus.fieldIndex];
  field.focus();
  if (focus.selectionStart !== null) field.setSelectionRange(focus.selectionStart, focus.selectionEnd);
}


function remapManagementRowKey(editState, fromKey, toKey) {
  if (state.accountAutosave.dirtyRowKeys.delete(fromKey)) {
    state.accountAutosave.dirtyRowKeys.add(toKey);
  }

  for (const op of allPendingOps()) {
    if (op.type === "delete" && op.rowKey === fromKey) {
      op.rowKey = toKey;
    }
  }

  if (editState.rows.has(fromKey)) {
    editState.rows.set(toKey, editState.rows.get(fromKey));
    editState.rows.delete(fromKey);
  }

  if (editState.focus !== null && editState.focus.rowKey === fromKey) {
    editState.focus.rowKey = toKey;
  }
}


function getManagementRow(rowKey) {
  return [...document.querySelectorAll("#managementAccountRows tr")]
    .find(row => row.dataset.managementRowKey === rowKey);
}


function renderDataManagement() {
  renderManagementTabs();
  renderManagementPanels();
  renderManagementAccountRows();
  renderTradeSection();
}


function renderTradeSection() {
  initializeTradeDefaults();
  pruneTradeSelectionToVisible();
  renderTradeControls();
  renderTradeLotRows();
  renderTradeCommitPanel();
}


function initializeTradeDefaults() {
  if (state.accounts.length === 0) return;

  if (!state.accounts.some(account => account.accountName === state.trade.accountName)) {
    state.trade.accountName = state.accounts[0].accountName;
  }
}


function pruneTradeSelectionToVisible() {
  const visible = new Set(getSellableLots().map(sellLotKey));
  state.trade.sellDrafts = new Map([...state.trade.sellDrafts].filter(([lotKey]) => visible.has(lotKey)));
}


function renderManagementTabs() {
  document.querySelectorAll("[data-management-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.managementTab === state.managementTab);
  });
}


function renderManagementPanels() {
  document.getElementById("managementAccountsPanel").hidden = state.managementTab !== "accounts";
  document.getElementById("managementTradePanel").hidden = state.managementTab !== "trade";
  document.getElementById("managementPurchasePanel").hidden = state.managementTab !== "purchase";
}


function renderManagementAccountRows() {
  const accountRows = state.accounts.map(account => {
    const cash = getManagementFinancing(account, "cash");
    const margin = getManagementFinancing(account, "margin");
    return `
      <tr data-management-row-key="${escapeHtml(managementRowKey("account", account.accountName))}">
        <td><input data-account-name-input type="text" value="${escapeHtml(account.accountName)}"></td>
        <td>${renderAccountTypeSelect("data-account-type-input", account.accountTypeKey)}</td>
        <td class="num"><input data-cash-balance type="number" step="any" value="${formatPlainNumber(cash.balance)}"></td>
        <td class="num">${formatCurrency(cash.monthlyInterest)}</td>
        <td><input data-cash-contributes type="checkbox" ${cash.contributesToCashFlow ? "checked" : ""}></td>
        <td class="num"><input data-margin-balance type="number" step="any" value="${formatPlainNumber(margin.balance)}"></td>
        <td class="num">${formatCurrency(margin.monthlyInterest)}</td>
        <td><input data-margin-contributes type="checkbox" ${margin.contributesToCashFlow ? "checked" : ""}></td>
        <td class="num">${account.holdings.length.toLocaleString()}</td>
        <td><button type="button" data-management-account-action="delete">Delete</button></td>
      </tr>
    `;
  });

  const cashEquivalentRows = state.cashEquivalents.map(row =>
    balanceRowHtml("cashEq", "Cash/equivalent", row.accountName, row.balance, row.monthlyInterest, row.contributesToCashFlow));

  const debtRows = state.otherDebts.map(row =>
    balanceRowHtml("debt", "Debt", row.name, -row.balance, -row.monthlyInterest, row.contributesToCashFlow));

  document.getElementById("managementAccountRows").innerHTML = [...accountRows, ...cashEquivalentRows, ...debtRows].join("");

  for (const rowKey of pendingDeleteRowKeys()) {
    const row = getManagementRow(rowKey);
    row.classList.add("pending-delete-row");
    managementRowFields(row).forEach(field => { field.disabled = true; });
    row.querySelector("button").disabled = true;
  }
}


function balanceRowHtml(kind, typeLabel, name, balance, monthlyInterest, contributesToCashFlow) {
  return `
    <tr data-management-row-key="${escapeHtml(managementRowKey(kind, name))}">
      <td><input data-account-name-input type="text" value="${escapeHtml(name)}"></td>
      <td>${typeLabel}</td>
      <td class="num"><input data-cash-balance type="number" step="any" value="${formatPlainNumber(balance)}"></td>
      <td class="num">${formatCurrency(monthlyInterest)}</td>
      <td><input data-cash-contributes type="checkbox" ${contributesToCashFlow ? "checked" : ""}></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td><button type="button" data-management-account-action="delete">Delete</button></td>
    </tr>
  `;
}


function renderTradeControls() {
  const account = getManagementAccount(state.trade.accountName);
  const isSell = state.trade.side === "sell";

  document.querySelectorAll("[data-trade-side]").forEach(button => {
    button.classList.toggle("active", button.dataset.tradeSide === state.trade.side);
  });

  const accountSelect = document.getElementById("tradeAccount");
  accountSelect.innerHTML = state.accounts
    .map(option => `<option value="${escapeHtml(option.accountName)}">${escapeHtml(option.accountName)}</option>`)
    .join("");
  accountSelect.value = state.trade.accountName;
  document.getElementById("tradeAccountWrap").hidden = isSell;
  accountSelect.disabled = isSell;

  document.getElementById("tradeSellPicker").hidden = !isSell;
  document.getElementById("tradeGrid").classList.toggle("trade-grid-buy", !isSell);
  document.getElementById("tradeSubmit").textContent = isSell ? "Record sell" : "Record buy";
  document.getElementById("tradeSelectionSummary").hidden = !isSell;

  const tickerInput = document.getElementById("tradeTicker");
  document.getElementById("tradeTickerWrap").hidden = isSell;
  tickerInput.disabled = isSell;

  const dateInput = document.getElementById("tradeDate");
  const showDate = !isSell && account !== undefined && account.accountTypeKey === "individual";
  document.getElementById("tradeDateWrap").hidden = !showDate;
  dateInput.disabled = !showDate;
  if (dateInput.value === "") dateInput.value = todayInputValue();
}


function sellLotKey(lot) {
  return `${lot.rowNumber}@${lot.accountName}`;
}


const SELLABLE_SORT_VALUE = {
  accountName: lot => lot.accountName,
  ticker: lot => lot.ticker,
  shares: lot => lot.shares,
  perShareBasis: lot => lot.perShareBasis === undefined ? -Infinity : lot.perShareBasis,
  date: lot => lot.date === undefined ? -Infinity : new Date(lot.date).getTime(),
};


function getSellableLots() {
  const lots = state.accounts
    .filter(account => state.selected.accountName.has(account.accountName) && state.selected.accountType.has(account.accountType))
    .flatMap(account => account.holdings
      .filter(holding => holdingMatchesSidebarFilters(holding))
      .map(holding => ({ accountName: account.accountName, ...holding })));

  const sort = state.trade.sort;
  if (sort.key === null) return lots;

  const sortValue = SELLABLE_SORT_VALUE[sort.key];
  return lots.sort((a, b) => {
    const valueA = sortValue(a);
    const valueB = sortValue(b);
    const order = typeof valueA === "string" ? valueA.localeCompare(valueB) : valueA - valueB;
    return order * sort.direction;
  });
}


function holdingMatchesSidebarFilters(holding) {
  return state.selected.ticker.has(holding.ticker) &&
    state.selected.term.has(holding.term) &&
    Object.keys(state.sectorWeightMap[holding.ticker]).some(sector => state.selected.sector.has(sector));
}


function getSelectedSellableLots() {
  return getSellableLots().filter(lot => state.trade.sellDrafts.has(sellLotKey(lot)));
}


const tradeLotTable = createVirtualTableRenderer({
  scrollerId: "tradeLotScroll",
  bodyId: "tradeLotRows",
  columnCount: 7,
  renderRow: tradeLotRowHtml,
});

const TRADE_SORT_LABELS = {
  accountName: "Account",
  ticker: "Ticker",
  shares: "Shares",
  perShareBasis: "Basis",
  date: "Date",
};


function renderTradeLotRows() {
  const lots = getSellableLots();
  const allSelected = lots.length > 0 && lots.every(lot => state.trade.sellDrafts.has(sellLotKey(lot)));
  document.getElementById("tradeSelectAll").textContent = allSelected ? "Deselect all" : "Select all";

  document.querySelectorAll("#tradeLotHeader [data-trade-sort]").forEach(header => {
    const key = header.dataset.tradeSort;
    const arrow = state.trade.sort.key === key ? (state.trade.sort.direction === 1 ? " ▲" : " ▼") : "";
    header.textContent = TRADE_SORT_LABELS[key] + arrow;
  });

  tradeLotTable.setRows(lots);
}


function tradeLotRowHtml(lot) {
  const draft = state.trade.sellDrafts.get(sellLotKey(lot));
  return `
    <tr data-trade-lot-key="${escapeHtml(sellLotKey(lot))}" class="${draft ? "selected-management-row" : ""}">
      <td><input type="checkbox" ${draft ? "checked" : ""}></td>
      <td>${escapeHtml(lot.accountName)}</td>
      <td>${escapeHtml(lot.ticker)}</td>
      <td class="num">${draft
        ? `<input data-lot-shares type="number" min="0" max="${formatPlainNumber(lot.shares)}" step="any" value="${draft.shares}">`
        : formatShares(lot.shares)}</td>
      <td class="num">${lot.perShareBasis === undefined ? "" : formatCurrency(lot.perShareBasis)}</td>
      <td>${lot.date === undefined ? "" : escapeHtml(dateInputValue(lot.date))}</td>
      <td class="num">${draft
        ? `<input data-lot-volume type="number" min="0" step="any" value="${draft.volume}">`
        : ""}</td>
    </tr>
  `;
}


function renderTradeCommitPanel() {
  const isSell = state.trade.side === "sell";
  const sharesWrap = document.getElementById("tradeSharesWrap");
  const volumeWrap = document.getElementById("tradeVolumeWrap");
  const submit = document.getElementById("tradeSubmit");

  sharesWrap.hidden = isSell;
  document.getElementById("tradeShares").disabled = isSell;
  volumeWrap.hidden = isSell;
  document.getElementById("tradeVolume").disabled = isSell;

  if (!isSell) {
    submit.disabled = state.managementBusy;
    return;
  }

  const selected = getSelectedSellableLots();
  const accountNames = uniqueSorted(selected.map(lot => lot.accountName));
  const summary = document.getElementById("tradeSelectionSummary");

  if (selected.length === 0) {
    summary.textContent = "No lots selected.";
  } else {
    const drafts = selected.map(lot => state.trade.sellDrafts.get(sellLotKey(lot)));
    const totalShares = sum(drafts.map(draft => Number(draft.shares)));
    const totalVolume = sum(drafts.map(draft => Number(draft.volume)));
    const accountText = accountNames.length === 1 ? accountNames[0] : `${accountNames.length} accounts`;
    summary.textContent = `${selected.length.toLocaleString()} ${selected.length === 1 ? "lot" : "lots"} in ${accountText} · ${formatShares(totalShares)} shares · ${formatCurrency(totalVolume)}`;
  }

  submit.disabled = selected.length === 0 || state.managementBusy;
}


function renderAccountTypeSelect(attributeName, selectedKey) {
  return `
    <select ${attributeName}>
      ${MANAGEMENT_ACCOUNT_TYPES.map(type => `<option value="${type.key}" ${type.key === selectedKey ? "selected" : ""}>${type.label}</option>`).join("")}
    </select>
  `;
}


function getManagementAccount(accountName) {
  return state.accounts.find(account => account.accountName === accountName);
}


function getManagementFinancing(account, kind) {
  return account.financing.find(row => row.kind === kind);
}


function dateInputValue(value) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}


function todayInputValue() {
  return dateInputValue(new Date());
}


function setManagementBusy(isBusy) {
  state.managementBusy = isBusy;
  document.querySelectorAll("#managementTradePanel button, #managementTradePanel input, #managementTradePanel select, #managementPurchasePanel button, #managementPurchasePanel input").forEach(node => {
    node.disabled = isBusy;
  });
}


function setManagementStatus(message) {
  document.getElementById("managementStatus").textContent = message;
}


function reportManagementApiError(apiError) {
  console.error(apiError);
  setManagementStatus(`Save failed: ${apiError.code} ${apiError.message}`);
}


function reportManagementNetworkError(networkError) {
  console.error(networkError);
  setManagementStatus(`Save failed: ${networkError.code} ${networkError.message}`);
}
