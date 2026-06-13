function setStatText(id, text, color = "") {
  const node = document.getElementById(id);
  node.textContent = text;
  node.style.color = color;
}


const VIRTUAL_TABLE_OVERSCAN = 12;

function createVirtualTableRenderer({ scrollerId, bodyId, columnCount, renderRow }) {
  const virtual = { rows: [], rowHeight: 0, startIndex: -1 };

  function setRows(rows) {
    virtual.rows = rows;
    virtual.startIndex = -1;
    render();
  }

  function onScroll() {
    if (virtual.rows.length === 0) return;
    render();
  }

  function render() {
    const body = document.getElementById(bodyId);
    const rows = virtual.rows;

    if (rows.length === 0) {
      body.innerHTML = "";
      return;
    }

    if (virtual.rowHeight === 0) {
      body.innerHTML = renderRow(rows[0]);
      virtual.rowHeight = body.querySelector("tr").offsetHeight;
      // A hidden table measures 0; leave the single row and re-measure when shown.
      if (virtual.rowHeight === 0) return;
    }

    const scroller = document.getElementById(scrollerId);
    const visibleCount = Math.ceil(scroller.clientHeight / virtual.rowHeight) + 2 * VIRTUAL_TABLE_OVERSCAN;
    const startIndex = clamp(Math.floor(scroller.scrollTop / virtual.rowHeight) - VIRTUAL_TABLE_OVERSCAN, 0, Math.max(0, rows.length - visibleCount));

    if (startIndex === virtual.startIndex) return;
    virtual.startIndex = startIndex;

    const slice = rows.slice(startIndex, startIndex + visibleCount);
    body.innerHTML =
      virtualSpacerHtml(startIndex * virtual.rowHeight, columnCount) +
      slice.map(renderRow).join("") +
      virtualSpacerHtml((rows.length - startIndex - slice.length) * virtual.rowHeight, columnCount);
  }

  return { setRows, onScroll };
}


function virtualSpacerHtml(height, columnCount) {
  if (height === 0) return "";
  return `<tr aria-hidden="true"><td colspan="${columnCount}" style="height:${formatPlainNumber(height)}px;padding:0;border:0"></td></tr>`;
}


const lotTable = createVirtualTableRenderer({
  scrollerId: "lotTableScroll",
  bodyId: "lotRows",
  columnCount: 9,
  renderRow: lotRowHtml,
});

function renderLotRows(lots) {
  const status = document.getElementById("lotRowsStatus");

  if (lots.length === 0) {
    lotTable.setRows([]);
    status.textContent = "No rows match the current filters.";
    return;
  }

  status.textContent = `${lots.length.toLocaleString()} rows shown.`;
  lotTable.setRows(lots);
}


function lotRowHtml(lot) {
  return `
    <tr>
    <td>${escapeHtml(lot.accountType)}</td>
    <td>${escapeHtml(lot.accountName)}</td>
    <td>${escapeHtml(lot.sector)}</td>
    <td>${escapeHtml(lot.ticker)}</td>
    <td>${escapeHtml(lot.term)}</td>
    <td class="num">${formatShares(lot.shares)}</td>
    <td class="num">${formatCurrency(lot.price)}</td>
    <td class="num">${formatCurrency(lot.value)}</td>
    <td class="num">${formatCurrency(lot.profit)}</td>
    </tr>
  `;
}


