function captureScrollState() {
  const filterScroll = {};

  document.querySelectorAll(".filter-values[data-filter-key]").forEach(node => {
    filterScroll[node.dataset.filterKey] = {
      left: node.scrollLeft,
      top: node.scrollTop
    };
  });

  return {
    filterScroll,
    windowX: window.scrollX,
    windowY: window.scrollY
  };
}

function restoreScrollState(scrollState) {
  document.querySelectorAll(".filter-values[data-filter-key]").forEach(node => {
    const saved = scrollState.filterScroll[node.dataset.filterKey];
    if (saved) {
      node.scrollLeft = saved.left;
      node.scrollTop = saved.top;
    }
  });

  window.scrollTo(scrollState.windowX, scrollState.windowY);
}

function scheduleSalePlanner(delay = 80) {
  clearScheduledSalePlanner();
  document.getElementById("saleCurveSubtitle").textContent = "Updating sale planner...";

  state.saleRenderTimer = setTimeout(() => {
    state.saleRenderTimer = null;
    renderSalePlanner();
  }, delay);
}

function clearScheduledSalePlanner() {
  if (state.saleRenderTimer !== null) {
    clearTimeout(state.saleRenderTimer);
    state.saleRenderTimer = null;
  }
}

function scheduleLotRows(delay = 80) {
  clearScheduledLotRows();
  const filteredSecurityLots = getSecurityLots(state.filteredLots);
  document.getElementById("lotRowsStatus").textContent = `Updating ${filteredSecurityLots.length.toLocaleString()} rows...`;

  state.lotRowsRenderTimer = setTimeout(() => {
    state.lotRowsRenderTimer = null;
    renderLotRows(filteredSecurityLots);
  }, delay);
}

function clearScheduledLotRows() {
  if (state.lotRowsRenderTimer !== null) {
    clearTimeout(state.lotRowsRenderTimer);
    state.lotRowsRenderTimer = null;
  }
}

function renderFilters() {
  const root = document.getElementById("filters");
  root.innerHTML = "";

  for (const filter of FILTERS) {
    const values = state.filterValues[filter.key];
    const selected = state.selected[filter.key];
    const query = state.filterSearch[filter.key];
    const searchQuery = query.trim().toLowerCase();
    const visibleValues = searchQuery
      ? values.filter(value => value.toLowerCase().includes(searchQuery))
      : values;

    const col = document.createElement("div");
    col.className = "filter-col resize-shell filter-section-resize-shell";
    col.dataset.filterKey = filter.key;
    const resizeKey = `filter:${filter.key}`;
    if (state.resizeHeights[resizeKey] !== undefined) col.style.height = `${formatPlainNumber(state.resizeHeights[resizeKey])}px`;

    const head = document.createElement("button");
    head.className = "filter-head";
    head.type = "button";
    head.innerHTML = `<span>${escapeHtml(filter.label)}</span><span>${selected.size}/${values.length}</span>`;
    head.addEventListener("click", () => {
      state.selected[filter.key] = selected.size === values.length ? new Set() : new Set(values);
      if (isCashLinkedFilterKey(filter.key)) syncLinkedDashboardFilterSelection(filter.key);
      render();
    });

    const search = document.createElement("input");
    search.className = "filter-search";
    search.type = "search";
    search.value = query;
    search.placeholder = `Search ${filter.label.toLowerCase()}`;
    search.setAttribute("aria-label", `Search ${filter.label}`);
    search.addEventListener("input", event => {
      state.filterSearch[filter.key] = event.target.value;
      renderFilters();
      const nextSearch = document.querySelector(`.filter-search[data-filter-key="${filter.key}"]`);
      nextSearch.focus();
      nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
    });
    search.dataset.filterKey = filter.key;

    const body = document.createElement("div");
    body.className = "filter-values";
    body.dataset.filterKey = filter.key;
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-edge";
    resizeHandle.dataset.resizeTarget = resizeKey;
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "horizontal");
    resizeHandle.setAttribute("aria-label", `Resize ${filter.label.toLowerCase()} filter`);

    for (const value of visibleValues) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip ${selected.has(value) ? "selected" : ""}`;
      chip.textContent = value;
      chip.title = getDashboardFilterChipTitle(filter.key, value);
      chip.addEventListener("click", () => {
        const next = new Set(state.selected[filter.key]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        state.selected[filter.key] = next;
        if (isCashLinkedFilterKey(filter.key)) syncLinkedDashboardFilterSelection(filter.key);
        render();
      });
      body.appendChild(chip);
    }

    col.appendChild(head);
    col.appendChild(search);
    col.appendChild(body);
    col.appendChild(resizeHandle);
    root.appendChild(col);
  }
}

function renderExposurePlanner() {
  renderRebalanceRealizationLimits();
  renderExposureTargets();
  renderTradeFilters();
}

function renderRebalanceRealizationLimits() {
  const minGainInput = document.getElementById("rebalanceMinGrossGain");
  const maxLossInput = document.getElementById("rebalanceMaxGrossLoss");

  minGainInput.value = formatPlainNumber(state.rebalanceRealizationLimits.minGrossGain);
  minGainInput.max = formatPlainNumber(getFullSellUniverseMaxGrossGain());
  maxLossInput.value = formatPlainNumber(state.rebalanceRealizationLimits.maxGrossLoss);
}

function renderExposureTargets() {
  const root = document.getElementById("exposureTargets");

  const currentPercents = getCurrentExposurePercentBySector();
  const showRebalanceReadout = shouldShowRebalanceTargetReadout(currentPercents);
  const achievedPercents = showRebalanceReadout ? getRebalanceAchievedPercentsBySector() : null;
  const residualDeltas = showRebalanceReadout ? getRebalanceResidualDeltasBySector() : null;
  const targetBase = getExposureTargetBase();
  root.innerHTML = "";
  updateExposureTargetStatus();

  for (const [index, sector] of state.exposureTargetOrder.entries()) {
    const currentPct = currentPercents[sector];
    const inputMode = state.exposureTargetInputModes[sector];
    const inputValue = getExposureTargetInputValue(sector, targetBase);
    const inputMax = getExposureTargetInputMax(sector, targetBase);
    const inputLabel = inputMode === "dollars" ? "dollars" : "percent";
    const achievedPct = achievedPercents ? achievedPercents[sector] : null;
    const residualDelta = residualDeltas
      ? residualDeltas[sector] === undefined ? 0 : residualDeltas[sector]
      : 0;
    const residualText = formatResidualDeltaText(residualDelta);
    const hasAchieved = achievedPct !== null;
    const achievedText = hasAchieved ? `Achieved ${formatPercentNumber(achievedPct)}` : "Achieved 0%";
    const isLocked = state.exposureLocked.has(sector);
    const hasResidual = Math.abs(residualDelta) > MONEY_EPSILON;
    const residualDisplayText = residualText || "$0.00 under";
    const minAttribute = sector === CASH_SECTOR ? "" : `min="0"`;
    const row = document.createElement("div");
    row.className = `exposure-target-row ${isLocked ? "is-locked" : ""} ${hasResidual ? "has-residual" : ""}`;
    row.dataset.sector = sector;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-pressed", isLocked ? "true" : "false");
    row.title = isLocked ? "Click to unlock this target" : "Click to lock this target during normalization";
    row.innerHTML = `
      <span class="swatch" style="background:${COLORS[index % COLORS.length]}" aria-hidden="true"></span>
      <span class="exposure-target-copy">
        <span class="exposure-target-name" title="${escapeHtml(sector)}">${escapeHtml(sector)}</span>
      </span>
      <span class="exposure-target-input-mode" role="group" aria-label="${escapeHtml(sector)} target input mode">
        <button type="button" data-target-mode="dollars" class="${inputMode === "dollars" ? "active" : ""}" aria-pressed="${inputMode === "dollars" ? "true" : "false"}">$</button>
        <button type="button" data-target-mode="percent" class="${inputMode === "percent" ? "active" : ""}" aria-pressed="${inputMode === "percent" ? "true" : "false"}">%</button>
      </span>
      <input type="number" ${minAttribute} max="${formatPlainNumber(inputMax)}" step="any" value="${formatPlainNumber(inputValue)}" aria-label="${escapeHtml(sector)} target ${inputLabel}">
      <span class="exposure-target-metrics">
        <span class="exposure-target-current">Current ${formatPercentNumber(currentPct)}</span>
        <span class="exposure-target-secondary-metrics">
          <span class="exposure-target-achieved ${hasAchieved ? "" : "is-placeholder"} ${hasResidual ? "is-off-target" : ""}">
            ${escapeHtml(achievedText)}
          </span>
          <span class="exposure-target-residual ${residualText ? "" : "is-placeholder"}">${escapeHtml(residualDisplayText)}</span>
        </span>
      </span>
    `;

    row.addEventListener("click", event => {
      if (event.target.closest("input, .exposure-target-input-mode")) return;
      toggleExposureTargetLock(sector);
    });
    row.addEventListener("keydown", event => {
      if (event.target.closest("input, .exposure-target-input-mode")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleExposureTargetLock(sector);
    });

    row.querySelectorAll("[data-target-mode]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        state.exposureTargetInputModes[sector] = event.currentTarget.dataset.targetMode;
        renderExposureTargets();
      });
    });

    row.querySelector("input").addEventListener("input", event => {
      const value = Number(event.target.value);
      const targetPercentValue = getExposureTargetPercentFromInputValue(sector, value, targetBase);
      const boundedValue = getBoundedExposureTargetValue(sector, targetPercentValue);
      state.exposureTargets[sector] = boundedValue;
      state.exposureTargetMessage = "";
      const normalized = normalizeExposureTargets(sector);
      const normalizedValue = getExposureTargetInputValue(sector, targetBase);
      if (Math.abs(normalizedValue - value) > getExposureTargetInputTolerance(sector)) {
        event.target.value = formatPlainNumber(normalizedValue);
      }
      syncExposureTargetInputs(sector);
      if (normalized) onRebalanceInputsChanged();
      else clearRebalancePlan();
    });

    root.appendChild(row);
  }
}

function getExposureTargetBase() {
  const { exposure } = getSectorExposure(state.lots);
  return sum(Object.values(exposure));
}

function getExposureTargetInputValue(sector, targetBase) {
  return state.exposureTargetInputModes[sector] === "dollars"
    ? targetBase * state.exposureTargets[sector] / 100
    : state.exposureTargets[sector];
}

function getExposureTargetPercentFromInputValue(sector, value, targetBase) {
  return state.exposureTargetInputModes[sector] === "dollars"
    ? value / targetBase * 100
    : value;
}

function getExposureTargetInputMax(sector, targetBase) {
  return state.exposureTargetInputModes[sector] === "dollars" ? targetBase : 100;
}

function getExposureTargetInputTolerance(sector) {
  return state.exposureTargetInputModes[sector] === "dollars" ? MONEY_EPSILON : PERCENT_POINT_EPSILON;
}

function getBoundedExposureTargetValue(sector, value) {
  return sector === CASH_SECTOR
    ? Math.min(value, 100)
    : clamp(value, 0, 100);
}

function shouldShowRebalanceTargetReadout(currentPercents) {
  if (!state.rebalancePlan) return false;

  return state.exposureTargetOrder.some(sector => {
    return Math.abs(state.exposureTargets[sector] - currentPercents[sector]) > PERCENT_POINT_EPSILON;
  });
}

function toggleExposureTargetLock(sector) {
  if (state.exposureLocked.has(sector)) state.exposureLocked.delete(sector);
  else state.exposureLocked.add(sector);
  renderExposureTargets();
}

function syncExposureTargetInputs(activeSector) {
  const targetBase = getExposureTargetBase();

  document.querySelectorAll(".exposure-target-row[data-sector]").forEach(row => {
    const sector = row.dataset.sector;
    const input = row.querySelector("input");
    const inputMode = state.exposureTargetInputModes[sector];
    if (sector !== activeSector) {
      input.value = formatPlainNumber(getExposureTargetInputValue(sector, targetBase));
    }
    input.max = formatPlainNumber(getExposureTargetInputMax(sector, targetBase));
    input.setAttribute("aria-label", `${sector} target ${inputMode === "dollars" ? "dollars" : "percent"}`);
    row.querySelectorAll("[data-target-mode]").forEach(button => {
      const active = button.dataset.targetMode === inputMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const isLocked = state.exposureLocked.has(sector);
    row.classList.toggle("is-locked", isLocked);
    row.setAttribute("aria-pressed", isLocked ? "true" : "false");
    row.title = isLocked ? "Click to unlock this target" : "Click to lock this target during normalization";
  });

  updateExposureTargetStatus();
}

function getRebalanceAchievedPercentsBySector() {
  const plan = state.rebalancePlan;
  const total = sum(Object.values(plan.finalExposureBySector));

  return Object.fromEntries(state.exposureTargetOrder.map(sector => {
    return [sector, (plan.finalExposureBySector[sector] / total) * 100];
  }));
}

function getRebalanceResidualDeltasBySector() {
  const plan = state.rebalancePlan;
  if (!planHasResidualGap(plan)) return null;

  const deltas = {};
  for (const [sector, amount] of Object.entries(plan.residualOverBySector)) {
    deltas[sector] = amount;
  }
  for (const [sector, amount] of Object.entries(plan.residualUnderBySector)) {
    deltas[sector] = (deltas[sector] ?? 0) - amount;
  }
  return deltas;
}

function formatResidualDeltaText(delta) {
  if (Math.abs(delta) <= MONEY_EPSILON) return "";
  return delta > 0
    ? `${formatCurrency(delta)} over`
    : `${formatCurrency(Math.abs(delta))} under`;
}

function planHasResidualGap(plan) {
  return plan.residualUnder > MONEY_EPSILON || plan.residualOver > MONEY_EPSILON;
}

function updateExposureTargetStatus(message = state.exposureTargetMessage) {
  const status = document.getElementById("rebalanceTargetStatus");
  if (message) {
    status.textContent = message;
    return;
  }

  const lockedText = state.exposureLocked.size > 0
    ? ` ${state.exposureLocked.size.toLocaleString()} target${state.exposureLocked.size === 1 ? "" : "s"} locked.`
    : "";
  status.textContent = `Targets auto-normalize to ${formatPercentNumber(sum(Object.values(state.exposureTargets)))}. Click a sector chip to lock it during normalization.${lockedText}`;
}

function renderTradeFilters() {
  const scrollState = captureTradeFilterScrollState();
  renderTradeFilterGroup("sell", "sellTradeFilters", SELL_TRADE_FILTERS);
  renderTradeFilterGroup("buy", "buyTradeFilters", BUY_TRADE_FILTERS);
  restoreTradeFilterScrollState(scrollState);
}

function renderTradeFilterGroup(mode, rootId, filters) {
  const root = document.getElementById(rootId);
  root.innerHTML = "";

  for (const filter of filters) {
    const values = state.tradeFilterValues[filter.key];
    const selected = getTradeSelection(mode, filter.key);
    const query = getTradeFilterSearch(mode, filter.key);
    const searchQuery = query.trim().toLowerCase();
    const visibleValues = searchQuery
      ? values.filter(value => value.toLowerCase().includes(searchQuery))
      : values;
    const col = document.createElement("div");
    col.className = "trade-filter-col";
    col.innerHTML = `
      <div class="trade-filter-head">
        <span>${escapeHtml(filter.label)}</span>
        <span>${selected.size}/${values.length}</span>
      </div>
      <input class="filter-search trade-filter-search" type="search" value="${escapeHtml(query)}" placeholder="Search ${escapeHtml(filter.label.toLowerCase())}" aria-label="Search ${escapeHtml(filter.label)}">
      <div class="trade-filter-values"></div>
    `;

    col.querySelector(".trade-filter-head").addEventListener("click", () => {
      state.tradeSelected[mode][filter.key] = selected.size === values.length ? new Set() : new Set(values);
      renderTradeFilters();
      onRebalanceInputsChanged();
    });

    const search = col.querySelector(".trade-filter-search");
    search.dataset.tradeSearchKey = `${mode}:${filter.key}`;
    search.addEventListener("input", event => {
      setTradeFilterSearch(mode, filter.key, event.target.value);
      renderTradeFilters();
      const nextSearch = document.querySelector(`.trade-filter-search[data-trade-search-key="${mode}:${filter.key}"]`);
      nextSearch.focus();
      nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
    });

    const body = col.querySelector(".trade-filter-values");
    body.dataset.tradeKey = `${mode}:${filter.key}`;
    for (const value of visibleValues) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip ${selected.has(value) ? "selected" : ""}`;
      chip.textContent = value;
      chip.title = value;
      chip.addEventListener("click", () => {
        const next = new Set(getTradeSelection(mode, filter.key));
        if (next.has(value)) next.delete(value);
        else next.add(value);
        state.tradeSelected[mode][filter.key] = next;
        renderTradeFilters();
        onRebalanceInputsChanged();
      });
      body.appendChild(chip);
    }

    root.appendChild(col);
  }
}

function captureTradeFilterScrollState() {
  const scroll = {};
  document.querySelectorAll(".trade-filter-values[data-trade-key]").forEach(node => {
    scroll[node.dataset.tradeKey] = {
      left: node.scrollLeft,
      top: node.scrollTop
    };
  });
  return scroll;
}

function restoreTradeFilterScrollState(scrollState) {
  document.querySelectorAll(".trade-filter-values[data-trade-key]").forEach(node => {
    const saved = scrollState[node.dataset.tradeKey];
    if (saved) {
      node.scrollLeft = saved.left;
      node.scrollTop = saved.top;
    }
  });
}

function onRebalanceInputsChanged() {
  scheduleRebalancePlan();
}

function getRebalanceRealizationLimitSnapshot() {
  return { ...state.rebalanceRealizationLimits };
}

function rebalanceRealizationLimitsChanged(previousLimits) {
  return Math.abs(state.rebalanceRealizationLimits.minGrossGain - previousLimits.minGrossGain) > MONEY_EPSILON ||
    Math.abs(state.rebalanceRealizationLimits.maxGrossLoss - previousLimits.maxGrossLoss) > MONEY_EPSILON;
}

function scheduleRebalancePlan(delay = 120) {
  clearScheduledRebalancePlan();
  state.rebalancePlan = null;
  state.rebalancePhaseSummaries = {};
  clearExposureTargetResultAnnotations();
  resetRebalanceSummaryFields();
  setRebalanceTransactionRows("");
  state.rebalanceRenderTimer = setTimeout(() => {
    state.rebalanceRenderTimer = null;
    calculateAndRenderRebalancePlan();
  }, delay);
}


function setRebalanceTransactionRows(html) {
  document.getElementById("rebalanceRows").innerHTML = html;
  document.querySelector(".rebalance-table-resize-shell").hidden = html === "";
  document.getElementById("rebalanceTableMessage").hidden = html !== "";
}

function clearExposureTargetResultAnnotations() {
  document.querySelectorAll(".exposure-target-row.has-residual").forEach(row => {
    row.classList.remove("has-residual");
  });
  document.querySelectorAll(".exposure-target-achieved").forEach(node => {
    node.textContent = "Achieved 0%";
    node.classList.add("is-placeholder");
    node.classList.remove("is-off-target");
  });
  document.querySelectorAll(".exposure-target-residual").forEach(node => {
    node.textContent = "$0.00 under";
    node.classList.add("is-placeholder");
  });
}

function clearScheduledRebalancePlan() {
  if (state.rebalanceRenderTimer !== null) {
    clearTimeout(state.rebalanceRenderTimer);
    state.rebalanceRenderTimer = null;
  }
  terminateRebalanceWorker();
}

function terminateRebalanceWorker() {
  stopRebalanceStatusTimer();
  if (!state.rebalanceWorker) return;
  state.rebalanceWorker.terminate();
  state.rebalanceWorker = null;
  state.rebalanceRequestId += 1;
}

function clearRebalancePlan() {
  clearScheduledRebalancePlan();
  state.rebalancePlan = null;
  state.rebalancePhaseSummaries = {};
  resetRebalanceSummaryFields();
  setRebalanceTransactionRows("");
  renderExposureTargets();
  setRebalanceStatus("No plan calculated.");
}

function resetRebalanceSummaryFields() {
  document.getElementById("rebalanceTradeVolume").textContent = "—";
  document.getElementById("rebalanceGrossProfit").textContent = "—";
  document.getElementById("rebalanceGrossLoss").textContent = "—";
  document.getElementById("rebalanceNetProfit").textContent = "—";
  document.getElementById("rebalanceGrossProfit").style.color = "";
  document.getElementById("rebalanceGrossLoss").style.color = "";
  document.getElementById("rebalanceNetProfit").style.color = "";
  document.getElementById("rebalanceTransactionCount").textContent = "—";
}

function calculateAndRenderRebalancePlan() {
  const targetTotal = sum(Object.values(state.exposureTargets));
  if (Math.abs(targetTotal - 100) > TARGET_TOTAL_TOLERANCE) {
    clearRebalancePlan();
    setRebalanceStatus(`Targets total ${formatPercentNumber(targetTotal)}. Normalize or edit targets to total 100.00%.`, true);
    return;
  }

  terminateRebalanceWorker();
  const requestId = state.rebalanceRequestId + 1;
  state.rebalanceRequestId = requestId;

  const payload = buildRebalancePlanPayload(targetTotal);
  const worker = createRebalanceWorker();

  state.rebalanceWorker = worker;
  startRebalanceStatusTimer(`Optimizing full tax-lot plan across ${payload.sellLots.length.toLocaleString()} eligible sell lots...`);

  worker.onmessage = event => {
    const data = event.data;
    if (data.requestId !== state.rebalanceRequestId) return;

    if (data.type === "progress") {
      updateRebalanceStatusTimer(data.message);
      return;
    }

    if (data.type === "phaseResult") {
      renderRebalancePhaseResult(data);
      return;
    }

    terminateRebalanceWorker();
    renderRebalancePlan(data.plan);
  };

  worker.postMessage({ type: "solve", requestId, payload });
}

const REBALANCE_WORKER_VERSION = "2026-06-08-realization-limits";
const REBALANCE_PHASE_RENDERERS = {
  target: renderRebalanceTargetPhaseResult,
  tax: renderRebalanceTaxPhaseResult
};

function createRebalanceWorker() {
  const workerPath = `app-rebalance-worker.js?v=${encodeURIComponent(REBALANCE_WORKER_VERSION)}`;
  return new Worker(workerPath);
}

function renderRebalancePlan(plan) {
  state.rebalancePlan = plan;
  state.rebalancePhaseSummaries = {};
  document.getElementById("rebalanceTradeVolume").textContent = formatCurrency(plan.sold + plan.bought);
  document.getElementById("rebalanceGrossProfit").textContent = formatCurrency(plan.grossProfit);
  document.getElementById("rebalanceGrossLoss").textContent = formatCurrency(plan.grossLoss);
  document.getElementById("rebalanceNetProfit").textContent = formatCurrency(plan.netProfit);
  document.getElementById("rebalanceGrossProfit").style.color = plan.grossProfit > 0 ? "var(--good)" : "";
  document.getElementById("rebalanceGrossLoss").style.color = plan.grossLoss < 0 ? "var(--danger)" : "";
  document.getElementById("rebalanceNetProfit").style.color = plan.netProfit >= 0 ? "var(--good)" : "var(--danger)";
  const aggregatedTransactions = aggregateTransactionsByActionAccountTicker(plan.transactions);
  document.getElementById("rebalanceTransactionCount").textContent = aggregatedTransactions.length.toLocaleString();
  const statusParts = [];
  const realizationLimitStatus = getActiveRebalanceRealizationLimitStatus();
  if (realizationLimitStatus) statusParts.push(realizationLimitStatus);
  const hasResidualGap = planHasResidualGap(plan);
  if (hasResidualGap) {
    statusParts.push("Rebalance optimization has a residual target gap after applying the eligible trade universe.");
  } else {
    statusParts.push("Rebalance optimization solved for the eligible trade universe.");
  }
  if (plan.marginPaydown > MONEY_EPSILON) {
    statusParts.push(`${formatCurrency(plan.marginPaydown)} sale proceeds reserved for margin paydown.`);
  }
  if (plan.cashUsed > MONEY_EPSILON) {
    statusParts.push(`${formatCurrency(plan.cashUsed)} existing cash used.`);
  }
  if (hasResidualGap) {
    if (plan.remainingCash > MONEY_EPSILON) {
      statusParts.push(`Unallocated sale cash: ${formatCurrency(plan.remainingCash)}.`);
    }
    statusParts.push(`Target gap: ${formatCurrency(plan.residualUnder)} under and ${formatCurrency(plan.residualOver)} over.`);
  } else if (plan.remainingCash > MONEY_EPSILON) {
    statusParts.push(`Unallocated sale cash: ${formatCurrency(plan.remainingCash)}.`);
  }
  setRebalanceStatus(statusParts.join(" "), hasResidualGap);
  renderExposureTargets();

  setRebalanceTransactionRows(aggregatedTransactions.map(transaction => {
    const actionConfig = REBALANCE_TRANSACTION_ACTION_CONFIG[transaction.action];
    return `
      <tr>
        <td>${escapeHtml(transaction.action)}</td>
        <td>${actionConfig.hasAccount ? escapeHtml(transaction.accountName) : ""}</td>
        <td>${escapeHtml(transaction.ticker)}</td>
        <td class="num">${formatCurrency(transaction.dollars)}</td>
        <td class="num">${formatShares(transaction.shares)}</td>
        <td class="num">${actionConfig.hasRealizedProfit ? formatCurrency(transaction.realizedProfit) : ""}</td>
      </tr>
    `;
  }).join(""));
}

function getActiveRebalanceRealizationLimitStatus() {
  const limits = state.rebalanceRealizationLimits;
  const defaults = state.rebalanceRealizationLimitDefaults;
  const parts = [];

  if (limits.minGrossGain > MONEY_EPSILON) parts.push(`minimum gross gain ${formatCurrency(limits.minGrossGain)}`);
  if (limits.maxGrossLoss < defaults.maxGrossLoss - MONEY_EPSILON) parts.push(`maximum gross loss ${formatCurrency(limits.maxGrossLoss)}`);

  return parts.length > 0 ? `Realization limits applied: ${parts.join(", ")}.` : "";
}

function renderRebalancePhaseResult(data) {
  REBALANCE_PHASE_RENDERERS[data.phase](data.plan);
}

function renderRebalanceTargetPhaseResult(plan) {
  state.rebalancePhaseSummaries.target = formatTargetGapSummary(plan);
  state.rebalancePlan = plan;
  renderExposureTargets();
  renderRebalanceRunningStatus();
}

function renderRebalanceTaxPhaseResult(plan) {
  state.rebalancePhaseSummaries.tax = `Net realized: ${formatCurrency(plan.netProfit)}`;
  document.getElementById("rebalanceNetProfit").textContent = formatCurrency(plan.netProfit);
  document.getElementById("rebalanceNetProfit").style.color = plan.netProfit >= 0 ? "var(--good)" : "var(--danger)";
  state.rebalancePlan = plan;
  renderExposureTargets();
  renderRebalanceRunningStatus();
}

function formatTargetGapSummary(plan) {
  if (!planHasResidualGap(plan)) return "Target gap: $0.00";
  return `Target gap: ${formatCurrency(plan.residualUnder)} under / ${formatCurrency(plan.residualOver)} over`;
}

function setRebalanceStatus(message, isWarning = false) {
  const status = document.getElementById("rebalanceStatus");
  status.textContent = message;
  status.classList.toggle("status-warning", isWarning);
}

function startRebalanceStatusTimer(message) {
  stopRebalanceStatusTimer();
  state.rebalanceStartedAt = Date.now();
  state.rebalanceStatusMessage = message;
  renderRebalanceRunningStatus();
  state.rebalanceStatusTimer = setInterval(renderRebalanceRunningStatus, 1000);
}

function updateRebalanceStatusTimer(message) {
  state.rebalanceStatusMessage = message;
  renderRebalanceRunningStatus();
}

function stopRebalanceStatusTimer() {
  if (state.rebalanceStatusTimer !== null) {
    clearInterval(state.rebalanceStatusTimer);
  }

  state.rebalanceStatusTimer = null;
  state.rebalanceStartedAt = null;
  state.rebalanceStatusMessage = "";
}

function renderRebalanceRunningStatus() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.rebalanceStartedAt) / 1000));
  const phaseSummary = getRebalancePhaseSummaryText();
  const prefix = phaseSummary ? `${phaseSummary}. ` : "";
  setRebalanceStatus(`${prefix}${state.rebalanceStatusMessage} (${formatElapsedDuration(elapsedSeconds)} elapsed)`);
}

function formatElapsedDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function getRebalancePhaseSummaryText() {
  return ["target", "tax"]
    .map(key => state.rebalancePhaseSummaries[key])
    .filter(Boolean)
    .join(". ");
}

function getExposureTargetSnapshot() {
  return Object.fromEntries(state.exposureTargetOrder.map(sector => {
    return [sector, state.exposureTargets[sector]];
  }));
}

function exposureTargetsChanged(previousTargets) {
  for (const sector of state.exposureTargetOrder) {
    const previous = previousTargets[sector];
    const current = state.exposureTargets[sector];
    if (Math.abs(current - previous) > PERCENT_POINT_EPSILON) return true;
  }

  return false;
}

function renderActivePie() {
  const root = document.getElementById("pieStage");
  const tabs = document.getElementById("pieTabs");
  const visibilityControls = document.getElementById("pieVisibilityControls");
  const count = document.getElementById("pieCount");
  const prevButton = document.getElementById("prevPie");
  const nextButton = document.getElementById("nextPie");

  const activeKey = PIE_KEYS[state.activePieIndex];
  const prevKey = PIE_KEYS[(state.activePieIndex + PIE_KEYS.length - 1) % PIE_KEYS.length];
  const nextKey = PIE_KEYS[(state.activePieIndex + 1) % PIE_KEYS.length];
  const visibleMetrics = PIE_METRICS.filter(metric => state.pieVisible[metric.key]);

  root.innerHTML = "";
  tabs.innerHTML = "";
  renderPieVisibilityControls(visibilityControls);

  if (visibleMetrics.length === 0) {
    root.insertAdjacentHTML("beforeend", `<div class="pie-empty-state">No pie views selected.</div>`);
  } else {
    const grid = document.createElement("div");
    grid.className = `pie-comparison-grid ${visibleMetrics.length === 1 ? "single-pie" : ""}`;
    root.appendChild(grid);

    for (const metric of visibleMetrics) {
      const slices = state.pieSlices[activeKey][metric.key];
      const activeSlices = slices.filter(slice => slice.selected);
      const card = document.createElement("div");
      card.className = "pie-card active-pie-card";
      card.innerHTML = `
        <div class="pie-card-header">
          <div>
            <div class="pie-title">${escapeHtml(PIE_TITLES[activeKey])}</div>
            <div class="pie-subtitle">${activeSlices.length}/${slices.length} active slices</div>
          </div>
          <div class="pie-card-actions">
            <div class="pie-mode">${escapeHtml(metric.label)}</div>
            <button class="pie-hide-button" type="button" aria-label="Hide ${escapeHtml(metric.label)} pie">Hide</button>
          </div>
        </div>
        <div class="mini-pie-layout">
          <div class="pie-visual">
            <svg width="180" height="180" viewBox="0 0 180 180"></svg>
            <div class="pie-tooltip" hidden></div>
          </div>
          <div class="legend-panel">
            <div class="mini-legend"></div>
          </div>
        </div>
      `;

      grid.appendChild(card);
      card.querySelector(".pie-hide-button").addEventListener("click", () => {
        state.pieVisible[metric.key] = false;
        renderActivePie();
      });
      renderPieInto(card.querySelector("svg"), activeSlices, 90, 90, 76, 42);
      renderLegendInto(card.querySelector(".mini-legend"), slices);
      bindPieHoverInteractions(card, slices, activeKey);
    }
  }


  PIE_KEYS.forEach((key, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `carousel-tab ${index === state.activePieIndex ? "active" : ""}`;
    tab.textContent = PIE_TITLES[key];
    tab.setAttribute("aria-pressed", index === state.activePieIndex ? "true" : "false");
    tab.addEventListener("click", () => {
      state.activePieIndex = index;
      renderActivePie();
    });
    tabs.appendChild(tab);
  });

  prevButton.title = PIE_TITLES[prevKey];
  prevButton.setAttribute("aria-label", `Show ${PIE_TITLES[prevKey]}`);
  prevButton.disabled = false;
  nextButton.title = PIE_TITLES[nextKey];
  nextButton.setAttribute("aria-label", `Show ${PIE_TITLES[nextKey]}`);
  nextButton.disabled = false;
  count.textContent = `${state.activePieIndex + 1} / ${PIE_KEYS.length}`;
  document.getElementById("chartSubtitle").textContent = `${PIE_TITLES[activeKey]} concentration.`;
}

function renderPieVisibilityControls(root) {
  root.innerHTML = "";

  for (const metric of PIE_METRICS) {
    const isVisible = state.pieVisible[metric.key];
    const button = document.createElement("button");
    button.className = `pie-visibility-button ${isVisible ? "active" : ""}`;
    button.type = "button";
    button.textContent = metric.label;
    button.setAttribute("aria-pressed", isVisible ? "true" : "false");
    button.setAttribute("aria-label", `${isVisible ? "Hide" : "Show"} ${metric.label} pie`);
    button.addEventListener("click", () => {
      state.pieVisible[metric.key] = !state.pieVisible[metric.key];
      renderActivePie();
    });
    root.appendChild(button);
  }
}

function renderPieInto(svg, slices, cx, cy, outerRadius, innerRadius) {
  const root = d3.select(svg);
  root.selectAll("*").remove();
  const total = sum(slices.map(slice => slice.amount));

  if (total <= 0) {
    root.append("text")
      .attr("x", cx)
      .attr("y", cy)
      .attr("text-anchor", "middle")
      .attr("class", "axis-label")
      .text("No data");
    return;
  }

  const arc = d3.arc()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);
  const pie = d3.pie()
    .sort(null)
    .value(slice => slice.amount);

  root.append("g")
    .attr("transform", `translate(${cx}, ${cy})`)
    .selectAll("path")
    .data(pie(slices))
    .join("path")
    .attr("d", arc)
    .attr("fill", arcDatum => COLORS[arcDatum.data.index % COLORS.length])
    .attr("class", "pie-slice")
    .attr("data-slice-index", arcDatum => arcDatum.data.index)
    .attr("tabindex", "0")
    .attr("role", "button")
    .attr("aria-label", arcDatum => sliceHoverText(arcDatum.data, total))
    .style("cursor", "pointer");
}

function renderLegendInto(root, slices) {
  root.innerHTML = "";
  const activeTotal = sum(slices.filter(slice => slice.selected).map(slice => slice.amount));
  const visibleSlices = state.hideInactivePieBullets
    ? slices.filter(slice => slice.selected)
    : slices;

  if (visibleSlices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "legend-empty";
    empty.textContent = slices.length === 0 ? "No slices available." : "Inactive slices hidden.";
    root.appendChild(empty);
    return;
  }

  for (const slice of visibleSlices) {
    const row = document.createElement("button");
    row.className = `legend-row ${slice.selected ? "" : "is-inactive"}`;
    row.type = "button";
    row.dataset.sliceIndex = slice.index;
    row.setAttribute("aria-pressed", slice.selected ? "true" : "false");
    row.setAttribute("aria-label", sliceHoverText(slice, activeTotal));
    row.innerHTML = `
      <span class="swatch" style="background:${COLORS[slice.index % COLORS.length]}" aria-hidden="true"></span>
      <span class="legend-name" title="${escapeHtml(slice.name)}">${escapeHtml(slice.name)}</span>
      <span class="legend-metrics">
        <span class="legend-amount">${formatCompactCurrencyPrecision(slice.amount)}</span>
        <span class="legend-percent">${slice.selected && activeTotal > 0 ? formatPercentPrecision(slice.amount / activeTotal) : "Off"}</span>
      </span>
    `;
    root.appendChild(row);
  }
}

function bindPieHoverInteractions(card, slices, filterKey) {
  const activeTotal = sum(slices.filter(slice => slice.selected).map(slice => slice.amount));
  const paths = [...card.querySelectorAll(".pie-slice")];
  const rows = [...card.querySelectorAll(".legend-row")];
  const tooltip = card.querySelector(".pie-tooltip");
  const visual = card.querySelector(".pie-visual");

  const setActive = (index, event) => {
    const activeIndex = Number(index);

    for (const node of paths) {
      const isActive = Number(node.dataset.sliceIndex) === activeIndex;
      node.classList.toggle("is-active", isActive);
      node.classList.toggle("is-dimmed", !isActive);
    }

    for (const node of rows) {
      const isActive = Number(node.dataset.sliceIndex) === activeIndex;
      node.classList.toggle("is-active", isActive);
      node.classList.toggle("is-dimmed", !isActive);
    }

    tooltip.textContent = sliceHoverText(slices[activeIndex], activeTotal);
    tooltip.hidden = false;
    positionPieTooltip(tooltip, visual, event);
  };

  const attachHover = node => {
    const index = Number(node.dataset.sliceIndex);
    node.addEventListener("mousedown", event => {
      event.preventDefault();
    });
    node.addEventListener("mouseenter", event => setActive(index, event));
    node.addEventListener("mousemove", event => positionPieTooltip(tooltip, visual, event));
    node.addEventListener("mouseleave", clearActive);
    node.addEventListener("focus", () => setActive(index));
    node.addEventListener("blur", clearActive);
    node.addEventListener("click", event => {
      if (event.shiftKey) isolatePieValue(filterKey, slices[index].name);
      else togglePieValue(filterKey, slices[index].name);
      render();
    });
  };

  paths.forEach(attachHover);
  rows.forEach(attachHover);

  function clearActive() {
    paths.forEach(node => node.classList.remove("is-active", "is-dimmed"));
    rows.forEach(node => node.classList.remove("is-active", "is-dimmed"));
    tooltip.hidden = true;
  }
}

function positionPieTooltip(tooltip, visual, event) {
  if (tooltip.hidden) return;

  const rect = visual.getBoundingClientRect();
  const padding = 8;
  const tooltipWidth = tooltip.offsetWidth || 180;
  const tooltipHeight = tooltip.offsetHeight || 32;
  const rawX = event ? event.clientX - rect.left + 12 : rect.width / 2 + 10;
  const rawY = event ? event.clientY - rect.top - tooltipHeight / 2 : rect.height / 2 - tooltipHeight / 2;
  const maxX = Math.max(padding, rect.width - tooltipWidth - padding);
  const maxY = Math.max(padding, rect.height - tooltipHeight - padding);

  tooltip.style.left = `${Math.min(Math.max(padding, rawX), maxX)}px`;
  tooltip.style.top = `${Math.min(Math.max(padding, rawY), maxY)}px`;
}

function sliceHoverText(slice, total) {
  const percent = slice.selected && total > 0
    ? formatPercentPrecision(slice.amount / total)
    : "inactive";
  return `${slice.name}: ${formatCurrency(slice.amount)} (${percent})`;
}
