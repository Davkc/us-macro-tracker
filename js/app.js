// US Macro Tracker dashboard. All observations come from the generated local JSON.
const names = {
  cpi: "Headline CPI", coreCpi: "Core CPI", ppi: "PPI All Commodities",
  ppiFinal: "PPI Final Demand", fedfunds: "Federal Funds Rate",
  mortgage30: "30-Year Mortgage", mortgage15: "15-Year Mortgage",
  gas: "Regular Gasoline", gdp: "Real GDP",
  unemployment: "Unemployment Rate", sentiment: "Consumer Sentiment"
};
const colors = {
  cpi: "#2878a2", coreCpi: "#65a7c7", ppi: "#c18a35", ppiFinal: "#d3ad69",
  fedfunds: "#7656a6", mortgage30: "#bd5146", mortgage15: "#d58177",
  gas: "#3e8968", gdp: "#397e75", unemployment: "#c4682c", sentiment: "#5286b5"
};
const groups = {
  overview: ["cpi", "coreCpi", "ppiFinal", "fedfunds", "mortgage30", "gas"],
  inflation: ["cpi", "coreCpi", "ppi", "ppiFinal"],
  policy: ["fedfunds", "mortgage30", "mortgage15"],
  gas: ["gas", "cpi", "ppi"],
  economy: ["gdp", "unemployment", "sentiment", "fedfunds"],
  relationships: ["ppiFinal", "cpi", "mortgage30", "fedfunds", "gas"]
};

let data;
let chart;
let activeTab = "overview";
const $ = selector => document.querySelector(selector);
const freq = () => $("#frequency").value;
const change = () => $("#change").value;
const range = () => $("#range").value;

function rows(key) {
  const series = data.series[key];
  return (series && series[freq()]) || [];
}

function period(date) {
  const d = new Date(date + "T00:00:00Z");
  return freq() === "quarterly"
    ? "Q" + (Math.floor(d.getUTCMonth() / 3) + 1) + " " + d.getUTCFullYear()
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function format(value, key) {
  if (!Number.isFinite(value)) return "—";
  const series = data.series[key];
  const unit = series && series.units;
  if (unit === "percent") return value.toFixed(2) + "%";
  if (unit === "dollars_per_gallon") return "$" + value.toFixed(2);
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function latestDate(keys) {
  return keys.reduce((latest, key) => {
    const list = rows(key);
    const date = list.length ? list[list.length - 1].date : "";
    return date > latest ? date : latest;
  }, "");
}

// Anchor relative ranges to the latest observations, so sparse sample data and
// delayed releases still produce a useful window instead of an empty chart.
function filtered(list, endDate) {
  const years = parseInt(range(), 10);
  if (!Number.isFinite(years) || !endDate) return list;
  const cutoff = new Date(endDate + "T00:00:00Z");
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return list.filter(row => new Date(row.date + "T00:00:00Z") >= cutoff);
}

function readUrlState() {
  const params = new URLSearchParams(location.hash.slice(1));
  const allowed = (selector, value) => Array.from($(selector).options).some(option => option.value === value);
  const tab = params.get("tab");
  if (tab === "table" || Object.prototype.hasOwnProperty.call(groups, tab)) activeTab = tab;
  ["frequency", "change", "range"].forEach(id => {
    const value = params.get(id);
    if (value && allowed("#" + id, value)) $("#" + id).value = value;
  });
  const normalize = params.get("normalize");
  $("#normalize").checked = normalize === null ? true : normalize === "1";
}

function writeUrlState() {
  const params = new URLSearchParams({
    tab: activeTab,
    frequency: freq(),
    change: change(),
    range: range(),
    normalize: $("#normalize").checked ? "1" : "0"
  });
  history.replaceState(null, "", "#" + params.toString());
}

function applyTabState() {
  document.querySelectorAll("[data-tab]").forEach(button => {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });
}

async function init() {
  readUrlState();
  applyTabState();
  $("#normalize").disabled = change() !== "level";
  try {
    const response = await fetch("data/indicators.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    data = await response.json();
    const updated = new Date(data.generated_at);
    $("#updated").textContent = data.sample_data
      ? "Illustrative sample · updated " + updated.toLocaleString()
      : "FRED snapshot · updated " + updated.toLocaleString();
    render();
    writeUrlState();
  } catch (error) {
    $("#updated").textContent = "Data unavailable";
    $("#error").hidden = false;
    $("#error").textContent = "Could not load data/indicators.json: " + error.message;
  }
}

function render() {
  if (!data) return;
  $("#normalize").disabled = change() !== "level";
  renderCards();
  renderChart();
  renderTable();
  renderInsights();
  applyTabState();
}

function renderCards() {
  ["cpi", "ppiFinal", "fedfunds", "mortgage30"].forEach(key => {
    const list = rows(key).filter(row => Number.isFinite(row.value));
    const latest = list[list.length - 1];
    const previous = list[list.length - 2];
    $("#card-" + key).textContent = format(latest ? latest.value : null, key);
    const delta = latest && previous ? latest.value - previous.value : null;
    const node = $("#change-" + key);
    const direction = data.series[key].direction;
    const favorable = direction === "higher" ? delta > 0 : direction === "lower" ? delta < 0 : false;
    const arrow = delta === null ? "" : delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "→ ";
    const date = latest ? " · " + period(latest.date) : "";
    node.textContent = delta === null
      ? "Not enough observations"
      : arrow + Math.abs(delta).toFixed(2) + " vs prior period" + date;
    node.className = delta === null || delta === 0 ? "" : favorable ? "positive" : "negative";
  });
}

function chartRows(key, endDate) {
  return filtered(rows(key), endDate);
}

function renderChart() {
  const keys = activeTab === "table" ? groups.overview : (groups[activeTab] || groups.overview);
  const endDate = latestDate(keys);
  const seriesRows = {};
  keys.forEach(key => { seriesRows[key] = chartRows(key, endDate); });
  const dates = Array.from(new Set(keys.reduce((all, key) => {
    return all.concat(seriesRows[key].map(row => row.date));
  }, []))).sort();
  const normalized = change() === "level" && $("#normalize").checked;
  const useRateAxis = change() === "level" && !normalized && keys.some(key => data.series[key].units === "percent");

  const datasets = keys.map(key => {
    const list = seriesRows[key];
    const lookup = new Map(list.map(row => [row.date, row]));
    const base = list.find(row => row.value > 0);
    const units = data.series[key].units;
    return {
      label: names[key],
      data: dates.map(date => {
        const row = lookup.get(date);
        if (!row) return null;
        let value = change() === "level" ? row.value : row[change()];
        if (value !== null && value !== undefined && normalized && base) value = value / base.value * 100;
        return value;
      }),
      borderColor: colors[key],
      backgroundColor: colors[key],
      pointRadius: dates.length > 35 ? 0 : 2,
      tension: 0.25,
      spanGaps: true,
      yAxisID: useRateAxis && units === "percent" ? "rates" : "levels"
    };
  });

  if (chart) chart.destroy();
  const scales = {
    x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } },
    levels: {
      type: "linear", position: "left",
      title: { display: true, text: normalized ? "Indexed to 100 at range start" : "Indicator level" }
    }
  };
  if (useRateAxis) {
    scales.rates = {
      type: "linear", position: "right",
      title: { display: true, text: "Rate (%)" },
      grid: { drawOnChartArea: false }
    };
  }
  chart = new Chart($("#chart"), {
    type: "line",
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { title: items => period(items[0].label) } }
      },
      scales
    },
    plugins: [recessionBands()]
  });

  const titles = {
    overview: "Indicators over time", policy: "Fed policy & mortgage rates",
    relationships: "Indicator relationships"
  };
  $("#chart-title").textContent = titles[activeTab] || activeTab[0].toUpperCase() + activeTab.slice(1) + " indicators";
  document.querySelector(".chart-head span").textContent =
    (freq() === "quarterly" ? "Quarterly" : "Monthly") + " · " + changeLabel() +
    " · " + rangeLabel() + " · latest data " + (endDate || "unavailable");
  $("#table-panel").hidden = activeTab !== "table";
  document.querySelector(".chart-panel").hidden = activeTab === "table";
}

// Shade contiguous recession periods behind every time-series chart.
function recessionBands() {
  const recession = new Map(rows("recession").map(row => [row.date, row.value === 1]));
  return {
    id: "recessionBands",
    beforeDatasetsDraw(instance) {
      const labels = instance.data.labels;
      const x = instance.scales.x;
      const area = instance.chartArea;
      if (!labels.length || !area || !x) return;
      const step = (area.right - area.left) / labels.length;
      const context = instance.ctx;
      let start = -1;
      const paint = end => {
        const left = Math.max(area.left, x.getPixelForValue(start) - step / 2);
        const right = Math.min(area.right, x.getPixelForValue(end) + step / 2);
        context.fillStyle = "rgba(103, 116, 128, 0.12)";
        context.fillRect(left, area.top, right - left, area.bottom - area.top);
      };
      for (let index = 0; index <= labels.length; index += 1) {
        const active = index < labels.length && recession.get(labels[index]) === true;
        if (active && start < 0) start = index;
        if (!active && start >= 0) {
          paint(index - 1);
          start = -1;
        }
      }
    }
  };
}

function changeLabel() {
  return { level: $("#normalize").checked ? "Indexed levels" : "Levels", mom: "MoM %", qoq: "QoQ %", yoy: "YoY %" }[change()];
}

function rangeLabel() {
  return range() === "max" ? "Max range" : range().replace("y", "Y");
}

function renderInsights() {
  const items = [];
  const mortgage = rows("mortgage30");
  const fed = rows("fedfunds");
  const ppi = rows("ppiFinal");
  const cpi = rows("cpi");
  const last = list => list[list.length - 1];
  const previous = list => list[list.length - 2];
  if (mortgage.length > 1 && fed.length > 1) {
    const mortgageBps = (last(mortgage).value - previous(mortgage).value) * 100;
    const fedBps = (last(fed).value - previous(fed).value) * 100;
    items.push("Mortgage rates moved " + Math.round(mortgageBps) + " bps; the Fed funds rate moved " + Math.round(fedBps) + " bps this period.");
  }
  if (ppi.length > 1 && cpi.length > 1) {
    items.push("Final-demand PPI is " + (last(ppi).value > previous(ppi).value ? "rising" : "easing") +
      " while headline CPI is " + (last(cpi).value > previous(cpi).value ? "rising" : "easing") +
      ". PPI may signal upstream price pressure.");
  }
  $("#insights").innerHTML = "";
  items.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    $("#insights").appendChild(li);
  });
}

function renderTable() {
  const keys = ["cpi", "coreCpi", "ppiFinal", "fedfunds", "mortgage30", "gas", "gdp", "unemployment"];
  const allDates = Object.keys(data.series).reduce((all, key) => all.concat(rows(key).map(row => row.date)), []);
  const dates = Array.from(new Set(allDates)).sort().reverse();
  const body = $("#table-body");
  body.innerHTML = "";
  dates.forEach(date => {
    const tr = document.createElement("tr");
    const values = [period(date)].concat(keys.map(key => {
      const row = rows(key).find(item => item.date === date);
      return row ? format(key === "gdp" ? row.qoq : row.value, key) : "—";
    }));
    values.forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function onControlChange() {
  render();
  writeUrlState();
}

$("#frequency").onchange = onControlChange;
$("#change").onchange = onControlChange;
$("#range").onchange = onControlChange;
$("#normalize").onchange = onControlChange;
document.querySelectorAll("[data-tab]").forEach(button => {
  button.onclick = () => {
    activeTab = button.dataset.tab;
    render();
    writeUrlState();
  };
});
$("#theme").onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("macro-theme", next);
};
const savedTheme = localStorage.getItem("macro-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("#csv").onclick = () => {
  const newline = String.fromCharCode(10);
  const csv = "Quarter,CPI,Core CPI,PPI Final,Fed Funds,30Y Mortgage,Gas,GDP QoQ,Unemployment" + newline +
    Array.from($("#table-body").rows).map(row => Array.from(row.cells).map(cell =>
      '"' + cell.textContent.replace(/"/g, '""') + '"').join(",")).join(newline);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "us-macro-quarterly.csv";
  link.click();
};

init();
