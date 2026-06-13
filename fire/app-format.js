function formatCurrencyInputNumber(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}


function formatPlainNumber(value) {
  return String(Number(value.toPrecision(15)));
}


function parseOptionalNumber(value) {
  const stripped = value.replace(/[$,\s]/g, "");
  if (stripped === "" || stripped === "-" || stripped === "." || stripped === "-.") return null;
  return Number(stripped);
}


function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}


function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}


function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}


function formatNullableCurrency(value) {
  if (value === null) return "—";
  return formatCurrency(value);
}


function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}


function formatCompactCurrencyPrecision(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumSignificantDigits: 3
  }).format(value);
}


function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}


function formatPercentPrecision(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumSignificantDigits: 3
  }).format(value);
}


function formatNullablePercent(value) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(value);
}


function formatPercentNumber(value) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 10
  }).format(value)}%`;
}


function formatShares(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(value);
}


function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
