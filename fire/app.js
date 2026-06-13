document.getElementById("hideInactivePieBullets").addEventListener("change", event => {
  state.hideInactivePieBullets = event.target.checked;
  renderActivePie();
});
document.getElementById("prevPie").addEventListener("click", () => {
  state.activePieIndex = (state.activePieIndex + PIE_KEYS.length - 1) % PIE_KEYS.length;
  renderActivePie();
});
document.getElementById("nextPie").addEventListener("click", () => {
  state.activePieIndex = (state.activePieIndex + 1) % PIE_KEYS.length;
  renderActivePie();
});
document.getElementById("prevCompanion").addEventListener("click", () => {
  state.activeCompanionIndex = (state.activeCompanionIndex + SALE_BREAKDOWN_KEYS.length - 1) % SALE_BREAKDOWN_KEYS.length;
  renderCompanionChartsFromState();
});
document.getElementById("nextCompanion").addEventListener("click", () => {
  state.activeCompanionIndex = (state.activeCompanionIndex + 1) % SALE_BREAKDOWN_KEYS.length;
  renderCompanionChartsFromState();
});
document.getElementById("resetFilters").addEventListener("click", () => {
  selectAllFilters();
  render();
});
document.getElementById("resetExposureTargets").addEventListener("click", () => {
  const previousTargets = getExposureTargetSnapshot();
  resetExposureTargetsToCurrent();
  renderExposurePlanner();
  if (exposureTargetsChanged(previousTargets)) onRebalanceInputsChanged();
});
document.getElementById("rebalanceMinGrossGain").addEventListener("input", event => {
  state.rebalanceRealizationLimits.minGrossGain = Number(event.target.value);
  onRebalanceInputsChanged();
});
document.getElementById("rebalanceMaxGrossLoss").addEventListener("input", event => {
  state.rebalanceRealizationLimits.maxGrossLoss = Number(event.target.value);
  onRebalanceInputsChanged();
});
document.getElementById("resetRebalanceRealizationLimits").addEventListener("click", () => {
  const previousLimits = getRebalanceRealizationLimitSnapshot();
  resetRebalanceRealizationLimits();
  renderRebalanceRealizationLimits();
  if (rebalanceRealizationLimitsChanged(previousLimits)) onRebalanceInputsChanged();
});
document.getElementById("lotTableScroll").addEventListener("scroll", lotTable.onScroll, { passive: true });
document.getElementById("tradeLotScroll").addEventListener("scroll", tradeLotTable.onScroll, { passive: true });
document.getElementById("saleModeToggle").addEventListener("change", event => {
  state.saleMode = event.target.checked ? "constant" : "tax";
  clearScheduledSalePlanner();
  renderSalePlanner();
});
document.getElementById("saleAmountInput").addEventListener("input", () => syncSaleTargets("amount", false));
document.getElementById("saleAmountInput").addEventListener("blur", () => syncSaleTargets("amount", true));
document.getElementById("saleProfitInput").addEventListener("input", () => syncSaleTargets("profit", false));
document.getElementById("saleProfitInput").addEventListener("blur", () => syncSaleTargets("profit", true));
document.getElementById("saleNetX").addEventListener("change", event => {
  const previousGrossAmount = state.saleTargetGrossAmount;
  state.saleAxis.xMode = event.target.checked ? "net" : "gross";
  renderSaleChartsForCurrentAxis();
  if (previousGrossAmount !== null && state.saleCurvePoints.length > 0) {
    document.getElementById("saleAmountInput").value = formatCurrencyInputNumber(getDisplayXAtGrossSale(state.saleCurvePoints, previousGrossAmount));
    syncSaleTargets("amount", false);
  } else {
    syncSaleTargets(state.saleTargetSource, false);
  }
});
document.getElementById("saleSymlogX").addEventListener("change", event => {
  state.saleAxis.xSymlog = event.target.checked;
  renderSaleChartsForCurrentAxis();
});
document.getElementById("saleSymlogY").addEventListener("change", event => {
  state.saleAxis.ySymlog = event.target.checked;
  renderSaleChartsForCurrentAxis();
});
document.getElementById("fireRateInput").addEventListener("input", event => {
  state.fireRatePercent = Number(event.target.value);
  renderNetWorthSummary();
});
document.getElementById("refreshPricesButton").addEventListener("click", () => {
  loadData({ refreshMode: "prices" });
});
document.getElementById("refreshHoldingsButton").addEventListener("click", () => {
  loadData({ refreshMode: "holdings" });
});
document.getElementById("refreshEverythingButton").addEventListener("click", () => {
  loadData({ refreshMode: "everything" });
});
document.getElementById("dataControlsToggle").addEventListener("click", () => {
  const controls = document.getElementById("dataControls");
  controls.hidden = !controls.hidden;
  document.getElementById("dataControlsToggle").setAttribute("aria-expanded", controls.hidden ? "false" : "true");
  document.getElementById("dataControlsChevron").textContent = controls.hidden ? "▴" : "▾";
});
document.getElementById("apiUrlInput").addEventListener("change", event => {
  submitApiUrl(event.target.value);
});

async function submitApiUrl(value) {
  const input = document.getElementById("apiUrlInput");
  const status = document.getElementById("apiUrlStatus");

  if (value === "") {
    input.classList.remove("api-url-invalid");
    status.textContent = "";
    if (!state.demoMode) window.localStorage.removeItem(API_URL_KEY);
    updateApiUrlField();
    return;
  }

  if (!state.demoMode && value === window.localStorage.getItem(API_URL_KEY)) {
    input.classList.remove("api-url-invalid");
    status.textContent = "";
    updateApiUrlField();
    return;
  }

  const candidates = /^https?:\/\//.test(value) ? [value] : [`https://${value}`, `http://${value}`];
  input.classList.remove("api-url-invalid");
  status.textContent = "Checking…";

  for (const candidate of candidates) {
    const payload = await probeDashboardData(candidate);
    if (payload !== null) {
      adoptApiUrl(candidate, payload);
      return;
    }
  }

  status.textContent = "No API answered at that URL. The previous URL is still in use.";
  input.classList.add("api-url-invalid");
}

function adoptApiUrl(url, payload) {
  window.localStorage.setItem(API_URL_KEY, url);

  // Adopting a URL replaces the backend, so any edits pending against the old one are dropped.
  state.accountAutosave.dirtyRowKeys = new Set();
  state.accountAutosave.pendingOps = [];

  if (state.demoMode) {
    // Taking over with a new backend: the protected cache is replaced, never shown.
    window.localStorage.removeItem(DEMO_MODE_KEY);
    window.localStorage.removeItem(DEMO_PASSWORD_KEY);
    state.demoMode = false;
    updateDemoModeUi();
    setManagementStatus("");
  }

  applyDashboardData(payload);
  cacheDashboardData(payload);
  document.getElementById("apiUrlStatus").textContent = "";
  updateApiUrlField();
}

function updateApiUrlField() {
  document.getElementById("apiUrlInput").value = state.demoMode ? "" : window.localStorage.getItem(API_URL_KEY) ?? "";
}
document.getElementById("demoModeButton").addEventListener("click", () => {
  if (!state.demoMode) {
    if (readCachedDashboardData() !== null) {
      const password = window.prompt("Set a password required to exit demo mode:");
      if (!password) return;
      window.localStorage.setItem(DEMO_PASSWORD_KEY, password);
    }

    window.localStorage.setItem(DEMO_MODE_KEY, "true");
    state.demoMode = true;
    updateDemoModeUi();
    applyDashboardData(getDemoDashboardData());
    setManagementStatus("Demo mode — changes are not saved.");
    return;
  }

  const storedPassword = window.localStorage.getItem(DEMO_PASSWORD_KEY);
  if (storedPassword !== null) {
    const entry = window.prompt("Enter the demo exit password:");
    if (entry !== storedPassword) {
      window.alert("Wrong password.");
      return;
    }
  }

  window.localStorage.removeItem(DEMO_MODE_KEY);
  window.localStorage.removeItem(DEMO_PASSWORD_KEY);
  state.demoMode = false;
  updateDemoModeUi();
  setManagementStatus("");
  loadData();
  flushManagementAutosave();
});

function updateDemoModeUi() {
  const button = document.getElementById("demoModeButton");
  button.textContent = state.demoMode ? "Exit demo mode" : "Demo mode";
  button.classList.toggle("demo-active", state.demoMode);
  updateApiUrlField();

  for (const id of ["refreshPricesButton", "refreshHoldingsButton", "refreshEverythingButton"]) {
    document.getElementById(id).disabled = state.demoMode;
  }
}

function initializeSectionNavigation() {
  const links = [...document.querySelectorAll("[data-section-nav]")];
  const sections = links.map(link => document.getElementById(link.dataset.sectionNav));

  const setActiveSection = sectionId => {
    for (const link of links) {
      link.classList.toggle("active", link.dataset.sectionNav === sectionId);
    }
  };

  const updateActiveSection = () => {
    let activeSectionId = sections[0].id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 140) activeSectionId = section.id;
    }
    setActiveSection(activeSectionId);
  };

  window.addEventListener("scroll", updateActiveSection, { passive: true });
  updateActiveSection();
}

function initializeSidebarControls() {
  const shell = document.getElementById("appShell");
  const sidebar = document.getElementById("filterSidebar");
  const toggle = document.getElementById("sidebarToggle");
  const resizeHandle = document.getElementById("sidebarWidthResize");

  toggle.addEventListener("click", () => {
    const collapsed = !shell.classList.contains("sidebar-collapsed");
    shell.classList.toggle("sidebar-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "Show filters" : "Hide filters");
  });

  resizeHandle.addEventListener("pointerdown", event => {
    event.preventDefault();

    const startWidth = sidebar.getBoundingClientRect().width;
    const startClientX = event.clientX;
    const previousOverflowAnchor = document.documentElement.style.overflowAnchor;

    document.documentElement.style.overflowAnchor = "none";
    sidebar.classList.add("is-width-resizing");

    const onPointerMove = moveEvent => {
      const nextWidth = Math.max(0, startWidth + moveEvent.clientX - startClientX);
      shell.style.setProperty("--sidebar-width", `${nextWidth}px`);
    };

    const onPointerUp = () => {
      document.documentElement.style.overflowAnchor = previousOverflowAnchor;
      sidebar.classList.remove("is-width-resizing");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };

    resizeHandle.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  });
}

initializeResizeHandles();
initializeSidebarControls();
initializeSectionNavigation();
initializeDataManagement();
state.demoMode = window.localStorage.getItem(DEMO_MODE_KEY) === "true";
updateDemoModeUi();
loadData();
