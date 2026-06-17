// Converts a GainsKeeper "Unrealized Lots" PDF (Robinhood's exported tax-lot
// report) into '\n'-separated rows of tab-separated `ticker	date	shares	per share basis`
// values for pasting into a spreadsheet. Parsing runs entirely client side via pdf.js.
//
// Each lot row in the report reads:
//   NAME (TICKER)  US  <shares>  <MM/DD/YYYY>  LT|ST[ in N d]  <cost/share>  ...
// The header rows, page footers, the summary page, and the trailing Total row do not
// match this shape, so they are skipped by the line parser.
const ROBINHOOD_LOT_REGEX = /\(([A-Z0-9.\-]+)\)\s+[A-Z]{2}\s+([\d,]*\.?\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(?:LT|ST)(?:\s+in\s+\d+\s+d)?\s+([\d,]*\.?\d+)/;


function initializeRobinhoodConvert() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

  document.getElementById("robinhoodPdfInput").addEventListener("change", handleRobinhoodPdfSelected);
  document.getElementById("robinhoodCopyButton").addEventListener("click", copyRobinhoodOutput);
}


async function handleRobinhoodPdfSelected(event) {
  const file = event.target.files[0];
  if (file === undefined) return;

  const output = document.getElementById("robinhoodConvertOutput");
  const copyButton = document.getElementById("robinhoodCopyButton");
  output.value = "";
  copyButton.disabled = true;
  setRobinhoodStatus(`Reading ${file.name}…`);

  try {
    const rows = await extractRobinhoodLots(await file.arrayBuffer());
    output.value = rows.map(row => row.join("\t")).join("\n");
    copyButton.disabled = rows.length === 0;
    setRobinhoodStatus(`${rows.length.toLocaleString()} ${rows.length === 1 ? "lot" : "lots"} converted.`);
  } catch (error) {
    console.error(error);
    setRobinhoodStatus(`Could not read that PDF: ${error.message}`);
  }
}


async function extractRobinhoodLots(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const rows = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    for (const line of groupTextItemsIntoLines(textContent.items)) {
      const match = ROBINHOOD_LOT_REGEX.exec(line);
      if (match === null) continue;

      const [, ticker, shares, date, perShareBasis] = match;
      rows.push([ticker, date, stripCommas(shares), stripCommas(perShareBasis)]);
    }
  }

  return rows;
}


// pdf.js yields positioned text fragments, not lines. Group fragments sharing a baseline
// (transform[5], the y position), order each line left to right (transform[4]), and emit
// lines top to bottom (PDF y grows upward, so descending y is reading order).
function groupTextItemsIntoLines(items) {
  const linesByY = new Map();

  for (const item of items) {
    if (item.str.trim() === "") continue;
    const y = Math.round(item.transform[5]);
    if (!linesByY.has(y)) linesByY.set(y, []);
    linesByY.get(y).push(item);
  }

  return [...linesByY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) => lineItems
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map(item => item.str)
      .join(" "));
}


function stripCommas(value) {
  return value.replace(/,/g, "");
}


async function copyRobinhoodOutput() {
  const output = document.getElementById("robinhoodConvertOutput");

  try {
    await navigator.clipboard.writeText(output.value);
    setRobinhoodStatus("Copied to clipboard.");
  } catch (error) {
    output.select();
    setRobinhoodStatus("Could not access the clipboard. The output is selected — copy it manually.");
  }
}


function setRobinhoodStatus(message) {
  document.getElementById("robinhoodConvertStatus").textContent = message;
}


initializeRobinhoodConvert();
