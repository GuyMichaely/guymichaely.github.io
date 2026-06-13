const SALE_MODE_RENDER_COPY = {
  tax: {
    title: "Tax-efficient sale curve",
    subtitle: saleLotCount => `${saleLotCount} shared-filter lots sorted by profit per dollar sold.`
  },
  constant: {
    title: "Concentration-preserving sale curve",
    subtitle: saleLotCount => `${saleLotCount} shared-filter lots sold pro rata by ticker, using the lowest-profit lots inside each ticker first.`
  }
};

function renderSalePlanner() {
  updateSaleAxisCopy();
  if (hasPartialSecuritySectorSelection()) {
    renderSalePlannerDisabled("Sale planner is disabled while sector exposure is partially filtered because holdings cannot be sold by sector slice.");
    return;
  }
  setSaleTargetInputsEnabled(true);

  const modeCopy = SALE_MODE_RENDER_COPY[state.saleMode];
  const cacheKey = getSalePlannerCacheKey(state.saleMode);
  let cacheEntry = state.salePathCache.get(cacheKey);

  if (!cacheEntry) {
    const saleLots = getSaleLots(state.saleSortedLots);
    const breakdownKeys = SALE_BREAKDOWN_KEYS;
    const path = SALE_PATH_BUILDERS[state.saleMode](saleLots, breakdownKeys);
    cacheEntry = { saleLots, ...path };
    rememberSalePathCache(cacheKey, cacheEntry);
  }

  const saleLots = cacheEntry.saleLots;
  const path = cacheEntry;
  state.saleCurvePoints = path.curvePoints;
  state.companionProfitSeriesByKey = path.companionProfitSeriesByKey;
  state.companionValueSeriesByKey = path.companionValueSeriesByKey;
  state.currentSaleLots = saleLots;

  renderSaleCurve(path.curvePoints);
  renderCompanionChartsFromState();

  const last = path.curvePoints[path.curvePoints.length - 1];
  const eligibleTickers = new Set(saleLots.map(lot => lot.ticker));
  const finalMarginPaydown = last.marginPaydown;
  const finalPaydownText = finalMarginPaydown > MONEY_EPSILON
    ? ` Maintenance rules direct ${formatCurrency(finalMarginPaydown)} of the full sale path to margin paydown.`
    : "";

  updateSaleAxisSummary();
  document.getElementById("saleFinalProfit").textContent = formatCurrency(last.y);
  document.getElementById("saleFinalProfit").style.color = last.y >= 0 ? "var(--good)" : "var(--danger)";
  document.getElementById("saleLotCount").textContent = saleLots.length.toLocaleString();
  document.getElementById("saleTickerCount").textContent = eligibleTickers.size.toLocaleString();
  updateSaleMarginPaydownSummary();
  document.getElementById("saleCurveTitle").textContent = modeCopy.title;
  document.getElementById("saleCurveSubtitle").textContent = `${modeCopy.subtitle(saleLots.length.toLocaleString())}${finalPaydownText}`;
  syncSaleTargets(state.saleTargetSource, false);
}

function renderSalePlannerDisabled(message) {
  state.saleCurvePoints = [];
  state.companionProfitSeriesByKey = {};
  state.companionValueSeriesByKey = {};
  state.saleTargetAmount = null;
  state.saleTargetGrossAmount = null;
  state.saleTargetNetAmount = null;
  state.saleTargetMarginPaydown = null;
  state.saleTargetProfit = null;
  state.currentSaleLots = [];
  setSaleTargetInputsEnabled(false);
  updateSaleAxisCopy();

  const svg = document.getElementById("saleCurve");
  d3.select(svg).selectAll("*").remove();
  addChartText(svg, 380, 140, "Sale planner disabled", "middle");

  document.getElementById("saleMaxX").textContent = "—";
  document.getElementById("saleFinalProfit").textContent = "—";
  document.getElementById("saleFinalProfit").style.color = "";
  document.getElementById("saleLotCount").textContent = "—";
  document.getElementById("saleTickerCount").textContent = "—";
  document.getElementById("saleMarginPaydown").textContent = "—";
  document.getElementById("saleAmountInput").value = "";
  document.getElementById("saleProfitInput").value = "";
  document.getElementById("saleMarginPaydownInput").value = "";
  document.getElementById("saleCurveTitle").textContent = "Sale curve";
  document.getElementById("saleCurveSubtitle").textContent = message;

  document.getElementById("companionStage").innerHTML = `
    <div class="planner-message">${escapeHtml(message)}</div>
    <div id="targetBreakdown" hidden></div>
  `;
  document.getElementById("companionTabs").innerHTML = "";
  document.getElementById("companionCount").textContent = "—";
}

function renderSaleChartsForCurrentAxis() {
  if (hasPartialSecuritySectorSelection()) {
    renderSalePlannerDisabled("Sale planner is disabled while sector exposure is partially filtered because holdings cannot be sold by sector slice.");
    return;
  }

  renderSaleCurve(state.saleCurvePoints);
  renderCompanionChartsFromState();
  updateSaleAxisCopy();
  updateSaleAxisSummary();
}

function updateSaleAxisSummary() {
  const salePoint = state.saleCurvePoints[state.saleCurvePoints.length - 1];
  document.getElementById("saleMaxX").textContent = formatCurrency(getSalePointDisplayX(salePoint));
}

function updateSaleAxisCopy() {
  const useNet = saleUsesNetXAxis();
  const saleNetX = document.getElementById("saleNetX");
  saleNetX.checked = useNet;

  const amountLabel = document.getElementById("saleAmountLabel");
  amountLabel.textContent = useNet ? "Net dollars to pull out" : "Gross dollars to sell";

  const maxLabel = document.getElementById("saleMaxXLabel");
  maxLabel.textContent = useNet ? "Max pull-out" : "Max sale";
}

function renderSaleCurve(points) {
  const svg = document.getElementById("saleCurve");
  const series = [{
    name: "Realized profit",
    points: getSaleCurveDisplayPoints(points)
  }];

  renderXYChart(svg, series, {
    xLabel: getSaleXAxisLabel(),
    yLabel: `Realized profit${state.saleAxis.ySymlog ? " (log)" : ""}`,
    yFormatter: formatCurrency,
    yAxisFormatter: formatCompactCurrency,
    xFormatter: formatCurrency,
    xAxisFormatter: formatCompactCurrency,
    interactive: true,
    xSymlog: state.saleAxis.xSymlog,
    ySymlog: state.saleAxis.ySymlog,
    maxHoverSeries: 8,
    onClickX: setSaleAmountTarget
  });
}

function renderCompanionChartsFromState() {
  renderCompanionCharts(
    state.companionProfitSeriesByKey,
    state.companionValueSeriesByKey
  );
}

function renderCompanionCharts(companionProfitSeriesByKey, companionValueSeriesByKey) {
  const root = document.getElementById("companionStage");
  const tabs = document.getElementById("companionTabs");
  const count = document.getElementById("companionCount");
  const prevButton = document.getElementById("prevCompanion");
  const nextButton = document.getElementById("nextCompanion");

  root.innerHTML = "";
  tabs.innerHTML = "";

  const activeKey = SALE_BREAKDOWN_KEYS[state.activeCompanionIndex];
  const prevKey = SALE_BREAKDOWN_KEYS[(state.activeCompanionIndex + SALE_BREAKDOWN_KEYS.length - 1) % SALE_BREAKDOWN_KEYS.length];
  const nextKey = SALE_BREAKDOWN_KEYS[(state.activeCompanionIndex + 1) % SALE_BREAKDOWN_KEYS.length];
  const profitSeriesByValue = companionProfitSeriesByKey[activeKey];
  const valueSeriesByValue = companionValueSeriesByKey[activeKey];
  const profitValues = uniqueSorted(Object.keys(profitSeriesByValue));
  const valueValues = uniqueSorted(Object.keys(valueSeriesByValue));
  const displayXByGrossX = getSaleDisplayXByGrossXMap(state.saleCurvePoints);
  const profitSeries = profitValues.map(value => ({
    name: value,
    points: mapSeriesToSaleDisplayX(profitSeriesByValue[value], displayXByGrossX)
  }));
  const valueSeries = valueValues.map(value => ({
    name: value,
    points: mapSeriesToSaleDisplayX(valueSeriesByValue[value], displayXByGrossX)
  }));

  const grid = document.createElement("div");
  grid.className = "companion-chart-grid";
  grid.innerHTML = `
    <div class="chart-card companion-card">
      <div class="chart-title">Dollars sold by ${escapeHtml(PIE_TITLES[activeKey].toLowerCase())}</div>
      <svg class="line-chart" viewBox="0 0 760 180"></svg>
    </div>
    <div class="chart-card companion-card">
      <div class="chart-title">Profit by ${escapeHtml(PIE_TITLES[activeKey].toLowerCase())}</div>
      <svg class="line-chart" viewBox="0 0 760 180"></svg>
    </div>
  `;
  root.appendChild(grid);

  const [valueSvg, profitSvg] = grid.querySelectorAll("svg");

  renderXYChart(profitSvg, profitSeries, {
    xLabel: getSaleXAxisLabel(),
    yLabel: `Realized profit${state.saleAxis.ySymlog ? " (log)" : ""}`,
    yFormatter: formatCurrency,
    yAxisFormatter: formatCompactCurrency,
    xFormatter: formatCurrency,
    xAxisFormatter: formatCompactCurrency,
    compact: true,
    interactive: true,
    xSymlog: state.saleAxis.xSymlog,
    ySymlog: state.saleAxis.ySymlog,
    maxHoverSeries: 5,
    onClickX: setSaleAmountTarget
  });

  renderXYChart(valueSvg, valueSeries, {
    xLabel: getSaleXAxisLabel(),
    yLabel: `Dollars sold${state.saleAxis.ySymlog ? " (log)" : ""}`,
    yFormatter: formatCurrency,
    yAxisFormatter: formatCompactCurrency,
    xFormatter: formatCurrency,
    xAxisFormatter: formatCompactCurrency,
    compact: true,
    interactive: true,
    xSymlog: state.saleAxis.xSymlog,
    ySymlog: state.saleAxis.ySymlog,
    maxHoverSeries: 5,
    onClickX: setSaleAmountTarget
  });

  const breakdown = document.createElement("div");
  breakdown.className = "target-breakdown";
  breakdown.id = "targetBreakdown";
  root.appendChild(breakdown);
  renderSaleTargetBreakdownFromState();

  SALE_BREAKDOWN_KEYS.forEach((key, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `carousel-tab ${index === state.activeCompanionIndex ? "active" : ""}`;
    tab.textContent = PIE_TITLES[key];
    tab.setAttribute("aria-pressed", index === state.activeCompanionIndex ? "true" : "false");
    tab.addEventListener("click", () => {
      state.activeCompanionIndex = index;
      renderCompanionChartsFromState();
    });
    tabs.appendChild(tab);
  });

  prevButton.title = PIE_TITLES[prevKey];
  prevButton.setAttribute("aria-label", `Show ${PIE_TITLES[prevKey]}`);
  prevButton.disabled = false;
  nextButton.title = PIE_TITLES[nextKey];
  nextButton.setAttribute("aria-label", `Show ${PIE_TITLES[nextKey]}`);
  nextButton.disabled = false;
  count.textContent = `${state.activeCompanionIndex + 1} / ${SALE_BREAKDOWN_KEYS.length}`;
}

function renderSaleTargetBreakdownFromState() {
  const root = document.getElementById("targetBreakdown");

  const targetAmount = state.saleTargetAmount;
  const targetGrossAmount = state.saleTargetGrossAmount;
  const targetNetAmount = state.saleTargetNetAmount;
  const targetMarginPaydown = state.saleTargetMarginPaydown;
  const targetProfit = state.saleTargetProfit;
  const activeKey = SALE_BREAKDOWN_KEYS[state.activeCompanionIndex];

  if (
    targetAmount === null ||
    targetGrossAmount === null ||
    targetNetAmount === null ||
    targetMarginPaydown === null ||
    targetProfit === null
  ) {
    root.innerHTML = `
      <div class="target-breakdown-header">
        <div>
          <div class="target-breakdown-title">Target breakdown</div>
          <div class="subtle">Enter dollars to sell or a profit target to populate the breakdowns.</div>
        </div>
      </div>
    `;
    return;
  }

  const profitSeriesByValue = state.companionProfitSeriesByKey[activeKey];
  const valueSeriesByValue = state.companionValueSeriesByKey[activeKey];
  const names = uniqueSorted([
    ...Object.keys(profitSeriesByValue),
    ...Object.keys(valueSeriesByValue)
  ]);

  const rows = names
    .map((name, index) => {
      return {
        name,
        index,
        profit: interpolateSeriesAtX(profitSeriesByValue[name], targetGrossAmount),
        volume: interpolateSeriesAtX(valueSeriesByValue[name], targetGrossAmount)
      };
    })
    .filter(row => Math.abs(row.profit) > MONEY_EPSILON || row.volume > MONEY_EPSILON)
    .sort((a, b) => b.volume - a.volume || b.profit - a.profit || a.name.localeCompare(b.name));

  root.innerHTML = `
    <div class="target-breakdown-header">
      <div>
        <div class="target-breakdown-title">Target breakdown by ${escapeHtml(PIE_TITLES[activeKey].toLowerCase())}</div>
        <div class="subtle">Volume and realized profit at the linked target.</div>
      </div>
      <div class="target-breakdown-total">${formatSaleTargetTotalHtml(targetGrossAmount, targetNetAmount, targetMarginPaydown, targetProfit)}</div>
    </div>
    <div class="resize-shell target-breakdown-resize-shell"${getResizeShellStyle("targetBreakdownList")}>
      <div class="target-breakdown-list"></div>
      <div class="resize-edge" data-resize-target="targetBreakdownList" role="separator" aria-orientation="horizontal" aria-label="Resize target breakdown"></div>
    </div>
    <div class="target-breakdown-header secondary">
      <div>
        <div class="target-breakdown-title">Target sales by account name and ticker</div>
        <div class="subtle">Collapse an account to show its aggregate sale amount.</div>
      </div>
    </div>
    <div class="resize-shell target-sale-resize-shell"${getResizeShellStyle("targetSaleTree")}>
      <div class="target-sale-list"></div>
      <div class="resize-edge" data-resize-target="targetSaleTree" role="separator" aria-orientation="horizontal" aria-label="Resize target sales"></div>
    </div>
  `;

  const list = root.querySelector(".target-breakdown-list");
  const saleList = root.querySelector(".target-sale-list");

  if (rows.length === 0) {
    list.innerHTML = `<div class="legend-empty">No sale contribution at this target.</div>`;
  } else {
    list.innerHTML = rows.map(row => {
      return `
        <div class="target-breakdown-row">
          <span class="swatch" style="background:${COLORS[row.index % COLORS.length]}" aria-hidden="true"></span>
          <span class="legend-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
          <span class="target-breakdown-value">${formatCurrency(row.volume)} sold</span>
          <span class="target-breakdown-value">${formatCurrency(row.profit)} profit</span>
        </div>
      `;
    }).join("");
  }

  const accountRows = aggregateSaleTransactionsByAccountTicker(getSaleTransactionsAtAmount(targetGrossAmount));
  if (accountRows.length === 0) {
    saleList.innerHTML = `<div class="legend-empty">No lots sold at this target.</div>`;
  } else {
    saleList.innerHTML = `<div class="target-sale-tree"></div>`;
    const tree = saleList.querySelector(".target-sale-tree");
    tree.innerHTML = accountRows.map(row => renderTargetSaleAccountNode(row)).join("");
    tree.querySelectorAll(".target-sale-toggle[data-account-name]").forEach(button => {
      button.addEventListener("click", () => {
        const accountName = button.dataset.accountName;
        if (state.targetSaleCollapsedAccounts.has(accountName)) {
          state.targetSaleCollapsedAccounts.delete(accountName);
        } else {
          state.targetSaleCollapsedAccounts.add(accountName);
        }
        renderSaleTargetBreakdownFromState();
      });
    });
  }
}

function renderTargetSaleAccountNode(row) {
  const collapsed = state.targetSaleCollapsedAccounts.has(row.accountName);
  const toggleText = collapsed ? "+" : "-";
  const accountRow = `
    <div class="target-sale-tree-row is-account">
      <button class="target-sale-toggle" type="button" data-account-name="${escapeHtml(row.accountName)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "Expand" : "Collapse"} ${escapeHtml(row.accountName)}">${toggleText}</button>
      <span class="target-sale-name" title="${escapeHtml(row.accountName)}">${escapeHtml(row.accountName)}</span>
      <span class="target-breakdown-value target-sale-volume">${formatCurrency(row.dollars)} sold</span>
      <span class="target-breakdown-value target-sale-profit">${formatCurrency(row.realizedProfit)} profit</span>
    </div>
  `;

  if (collapsed) return accountRow;

  return accountRow + row.tickers.map(ticker => `
    <div class="target-sale-tree-row is-ticker">
      <span class="target-sale-spacer" aria-hidden="true"></span>
      <span class="target-sale-name" title="${escapeHtml(ticker.ticker)}">${escapeHtml(ticker.ticker)}</span>
      <span class="target-breakdown-value target-sale-volume">${formatCurrency(ticker.dollars)} sold</span>
      <span class="target-breakdown-value target-sale-profit">${formatCurrency(ticker.realizedProfit)} profit</span>
    </div>
  `).join("");
}

function formatSaleTargetTotalHtml(grossAmount, netAmount, marginPaydown, profit) {
  const headline = saleUsesNetXAxis()
    ? `${formatCurrency(netAmount)} available`
    : `${formatCurrency(grossAmount)} sold`;
  const detail = saleUsesNetXAxis()
    ? `${formatCurrency(grossAmount)} sold / ${formatCurrency(marginPaydown)} margin paydown`
    : `${formatCurrency(netAmount)} available / ${formatCurrency(marginPaydown)} margin paydown`;

  return `<div>${headline}</div><div>${detail}</div><div>${formatCurrency(profit)} profit</div>`;
}
