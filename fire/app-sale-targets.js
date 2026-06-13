function setSaleAmountTarget(amount) {
  const saleAmountInput = document.getElementById("saleAmountInput");
  saleAmountInput.value = formatCurrencyInputNumber(amount);
  syncSaleTargets("amount", true);
}


function syncSaleTargets(source, updateSourceValue) {
  state.saleTargetSource = source;
  updateSaleAxisCopy();
  const points = state.saleCurvePoints;
  const saleAmountInput = document.getElementById("saleAmountInput");
  const saleProfitInput = document.getElementById("saleProfitInput");

  if (points.length === 0 || points[points.length - 1].x === 0) {
    clearSaleTargetState();
    renderSaleTargetBreakdownFromState();
    updateSaleMarginPaydownSummary();
    return;
  }

  const bounds = getSaleTargetBounds(points);

  if (source === "profit") {
    const targetProfit = parseOptionalNumber(saleProfitInput.value);
    if (targetProfit === null) {
      clearSaleTargetState();
      saleAmountInput.value = "";
      renderSaleTargetBreakdownFromState();
      updateSaleMarginPaydownSummary();
      return;
    }

    const profit = clamp(targetProfit, bounds.minProfit, bounds.maxProfit);
    const sale = getXAtY(getSaleCurveDisplayPoints(points), profit);
    const salePoint = interpolateSalePointByDisplayX(points, sale);

    if (updateSourceValue || profit !== targetProfit) saleProfitInput.value = formatCurrencyInputNumber(profit);
    saleAmountInput.value = formatCurrencyInputNumber(sale);
    setSaleTargetState(sale, salePoint);
    renderSaleTargetBreakdownFromState();
    updateSaleMarginPaydownSummary();
    return;
  }

  const saleAmount = parseOptionalNumber(saleAmountInput.value);
  if (saleAmount === null) {
    clearSaleTargetState();
    saleProfitInput.value = "";
    renderSaleTargetBreakdownFromState();
    updateSaleMarginPaydownSummary();
    return;
  }

  const sale = clamp(saleAmount, bounds.minSale, bounds.maxSale);
  const salePoint = interpolateSalePointByDisplayX(points, sale);
  const profit = salePoint.y;

  if (updateSourceValue || sale !== saleAmount) saleAmountInput.value = formatCurrencyInputNumber(sale);
  saleProfitInput.value = formatCurrencyInputNumber(profit);
  setSaleTargetState(sale, salePoint);
  renderSaleTargetBreakdownFromState();
  updateSaleMarginPaydownSummary();
}


function getSaleTargetBounds(points) {
  const displayPoints = getSaleCurveDisplayPoints(points);
  return {
    minSale: Math.min(...displayPoints.map(point => point.x)),
    maxSale: Math.max(...displayPoints.map(point => point.x)),
    minProfit: Math.min(...points.map(point => point.y)),
    maxProfit: Math.max(...points.map(point => point.y))
  };
}


function setSaleTargetState(displaySale, salePoint) {
  const point = copySalePoint(salePoint);
  state.saleTargetAmount = displaySale;
  state.saleTargetGrossAmount = point.x;
  state.saleTargetNetAmount = point.netX;
  state.saleTargetMarginPaydown = point.marginPaydown;
  state.saleTargetProfit = point.y;
}


function clearSaleTargetState() {
  state.saleTargetAmount = null;
  state.saleTargetGrossAmount = null;
  state.saleTargetNetAmount = null;
  state.saleTargetMarginPaydown = null;
  state.saleTargetProfit = null;
}


function updateSaleMarginPaydownSummary() {
  const stat = document.getElementById("saleMarginPaydown");
  const input = document.getElementById("saleMarginPaydownInput");
  document.getElementById("saleMarginPaydownLabel").textContent = "Margin paydown";

  if (state.saleCurvePoints.length === 0) {
    stat.textContent = "—";
    input.value = "";
    return;
  }

  const hasTarget = state.saleTargetMarginPaydown !== null;
  const value = hasTarget
    ? state.saleTargetMarginPaydown
    : state.saleCurvePoints[state.saleCurvePoints.length - 1].marginPaydown;

  stat.textContent = formatCurrency(value);
  input.value = hasTarget ? formatCurrencyInputNumber(value) : "";
}


function setSaleTargetInputsEnabled(enabled) {
  document.getElementById("saleAmountInput").disabled = !enabled;
  document.getElementById("saleProfitInput").disabled = !enabled;
  document.getElementById("saleMarginPaydownInput").disabled = !enabled;
}
