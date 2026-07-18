const STOCK_META = {
  "2330": {
    name: "台積電", sector: "半導體", base: 1085, seed: 2330, volatility: 0.016,
    driver: "AI 加速器與先進製程需求", risk: "地緣政治／高估值",
    chain: [["終端需求", "AI 算力"], ["晶片設計", "GPU / ASIC"], ["先進製程", "台積電"], ["先進封裝", "CoWoS"]]
  },
  "2317": {
    name: "鴻海", sector: "電子代工", base: 212, seed: 2317, volatility: 0.019,
    driver: "AI 伺服器出貨與組裝訂單", risk: "毛利率／客戶集中",
    chain: [["雲端資本支出", "Hyperscaler"], ["伺服器平台", "AI Server"], ["組裝製造", "鴻海"], ["機櫃出貨", "GB200 / GB300"]]
  },
  "2454": {
    name: "聯發科", sector: "IC 設計", base: 1390, seed: 2454, volatility: 0.021,
    driver: "手機復甦與 Edge AI 滲透", risk: "產品組合／競爭",
    chain: [["終端換機", "智慧手機"], ["邊緣 AI", "端側運算"], ["晶片設計", "聯發科"], ["晶圓製造", "先進製程"]]
  },
  "2382": {
    name: "廣達", sector: "AI 伺服器", base: 296, seed: 2382, volatility: 0.023,
    driver: "雲端業者 AI 資本支出", risk: "出貨遞延／供應瓶頸",
    chain: [["雲端需求", "CSP CapEx"], ["AI 平台", "GPU System"], ["ODM 設計", "廣達"], ["系統交付", "伺服器機櫃"]]
  }
};

const MODEL_META = {
  trend: { label: "趨勢模型", color: "#4d80db" },
  momentum: { label: "動能模型", color: "#d89d35" },
  reversion: { label: "均值回歸", color: "#8e68dc" },
  ensemble: { label: "集成中位數", color: "#18753c" }
};

const HORIZON_LABELS = { 3: "3 日", 5: "1 週", 10: "2 週", 21: "1 個月", 42: "2 個月", 63: "3 個月" };

const FALLBACK_MARKETS = {
  taiex: { value: 23860.12, change: 0.64, state: "偏多", data: [98,99,98.6,100,100.4,101.8,101.2,103,102.6,104.2,104.8,105.5] },
  otc: { value: 263.31, change: -0.22, state: "震盪", data: [100,100.5,101,100.4,101.2,101.8,101.4,101.1,100.8,100.3,100.5,100.2] },
  sox: { value: 5473.20, change: 1.14, data: [98,99,100,99.6,100.8,101.5,102.8,102.2,103.7,104.5,104.2,105.4] },
  usd: { value: 32.48, change: 0.08, data: [100,99.7,99.9,100.2,100.4,100.1,100.5,100.7,100.9,100.8,101,101.1] }
};

const FALLBACK_NEWS = [
  { category: "supply", source: "供應鏈追蹤", time: "今日 08:20", title: "AI 伺服器平台換代，先進封裝與機櫃出貨成為觀察焦點", summary: "新平台量產節奏會依序影響晶片、散熱、電源與 ODM 出貨；重點不是單一訂單，而是能否形成連續季度營收。", impact: "positive", stocks: ["2330 台積電", "2317 鴻海", "2382 廣達"] },
  { category: "world", source: "全球總經", time: "今日 07:45", title: "市場重新評估利率路徑，成長股估值敏感度升高", summary: "長債殖利率上行通常壓縮高本益比股票的估值空間，即使基本面不變，也可能先出現價格波動。", impact: "negative", stocks: ["高估值科技", "電子權值"] },
  { category: "tw", source: "台股盤前", time: "今日 07:15", title: "電子權值與中小型股輪動加快，量價結構比指數漲跌更重要", summary: "若指數上漲但上漲家數與成交量未同步，代表資金集中，追價風險會高於全面多頭。", impact: "neutral", stocks: ["台股加權", "櫃買指數"] },
  { category: "supply", source: "半導體鏈", time: "昨日 22:30", title: "先進製程需求維持強勁，設備與材料交期仍需交叉驗證", summary: "晶圓代工利用率改善對上游設備材料有正向外溢，但實際營收時間差可能落後一至兩季。", impact: "positive", stocks: ["2330 台積電", "半導體設備"] },
  { category: "world", source: "產業風險", time: "昨日 20:10", title: "出口限制與地緣風險仍可能改變高階晶片供應路徑", summary: "政策衝擊往往先反映在估值，再影響訂單與產品組合；需同時觀察公司指引與客戶替代方案。", impact: "negative", stocks: ["IC 設計", "晶圓代工"] },
  { category: "tw", source: "籌碼觀察", time: "昨日 18:40", title: "匯率與外資期現貨方向分歧，短線訊號偏中性", summary: "單日外資買賣超容易受被動資金干擾，至少用五日趨勢搭配新台幣方向判讀。", impact: "neutral", stocks: ["大型權值", "金融期貨"] }
];

const state = {
  selectedStock: "2330",
  horizon: 3,
  enabledModels: new Set(Object.keys(MODEL_META)),
  stocks: {},
  markets: structuredClone(FALLBACK_MARKETS),
  news: [...FALLBACK_NEWS],
  mode: "demo",
  updatedAt: null,
  forecastCache: null,
  chartHitPoints: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const fmt = (value, digits = 2) => Number(value).toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createFallbackHistory(code) {
  const meta = STOCK_META[code];
  const random = mulberry32(meta.seed);
  const points = [];
  let value = meta.base * .82;
  const today = new Date();
  for (let i = 150; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if ([0, 6].includes(date.getDay())) continue;
    const regime = i > 95 ? .0015 : i > 45 ? -.0002 : .0011;
    const shock = (random() - .49) * meta.volatility * 1.55;
    value *= 1 + regime + shock;
    points.push({ date: date.toISOString().slice(0, 10), close: Number(value.toFixed(2)) });
  }
  const scale = meta.base / points.at(-1).close;
  return points.map(point => ({ ...point, close: Number((point.close * scale).toFixed(2)) }));
}

function initializeFallbackStocks() {
  Object.entries(STOCK_META).forEach(([code, meta]) => {
    const history = createFallbackHistory(code);
    const price = history.at(-1).close;
    const previous = history.at(-2).close;
    state.stocks[code] = { code, ...meta, history, price, change: (price / previous - 1) * 100, source: "demo" };
  });
}

function nextTradingDate(dateString, step) {
  const date = new Date(`${dateString}T12:00:00`);
  let added = 0;
  while (added < step) {
    date.setDate(date.getDate() + 1);
    if (![0, 6].includes(date.getDay())) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function regressionRate(values) {
  if (values.length < 3) return 0;
  const logs = values.map(value => Math.log(value));
  const xMean = (values.length - 1) / 2;
  const yMean = mean(logs);
  let numerator = 0;
  let denominator = 0;
  logs.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator ? numerator / denominator : 0;
}

function dailyVolatility(values) {
  const returns = values.slice(1).map((value, index) => Math.log(value / values[index]));
  const avg = mean(returns);
  return Math.sqrt(mean(returns.map(value => (value - avg) ** 2)));
}

function modelForecast(history, horizon) {
  const prices = history.map(item => item.close);
  const current = prices.at(-1);
  const recent = prices.slice(-60);
  const trendRate = clamp(regressionRate(recent.slice(-45)), -.018, .018);
  const ret5 = Math.log(current / prices.at(-6)) / 5;
  const ret20 = Math.log(current / prices.at(-21)) / 20;
  const momentumRate = clamp(ret5 * .35 + ret20 * .4 + trendRate * .15, -.022, .022);
  const ma30 = mean(prices.slice(-30));
  const reversionGap = Math.log(ma30 / current);
  const reversionRate = clamp(trendRate * .24 + reversionGap / 24, -.016, .016);
  const rates = { trend: trendRate * .76, momentum: momentumRate, reversion: reversionRate };
  const paths = {};
  Object.entries(rates).forEach(([key, rate]) => {
    paths[key] = Array.from({ length: horizon }, (_, index) => current * Math.exp(rate * (index + 1)));
  });
  paths.ensemble = Array.from({ length: horizon }, (_, index) => median([paths.trend[index], paths.momentum[index], paths.reversion[index]]));
  const vol = dailyVolatility(recent);
  return { paths, vol, current };
}

function backtest(history, horizon) {
  const results = { trend: [], momentum: [], reversion: [], ensemble: [] };
  const start = Math.max(65, history.length - Math.max(75, horizon * 4));
  const step = Math.max(2, Math.floor(horizon / 3));
  for (let end = start; end + horizon < history.length; end += step) {
    const train = history.slice(0, end);
    const actual = history[end + horizon - 1].close;
    const startPrice = train.at(-1).close;
    const forecast = modelForecast(train, horizon);
    Object.keys(results).forEach(key => {
      const predicted = forecast.paths[key].at(-1);
      results[key].push({
        error: Math.abs(predicted - actual) / actual * 100,
        direction: Math.sign(predicted - startPrice) === Math.sign(actual - startPrice)
      });
    });
  }
  const metrics = {};
  Object.entries(results).forEach(([key, rows]) => {
    const directional = rows.length ? mean(rows.map(row => row.direction ? 100 : 0)) : 50;
    const error = rows.length ? mean(rows.map(row => row.error)) : 8;
    metrics[key] = { directional, error, samples: rows.length, reliability: clamp(directional * .68 + (100 - error * 8) * .32, 15, 92) };
  });
  return metrics;
}

function calculateCurrentForecast() {
  const stock = state.stocks[state.selectedStock];
  const forecast = modelForecast(stock.history, state.horizon);
  const metrics = backtest(stock.history, state.horizon);
  const endpoints = Object.fromEntries(Object.keys(MODEL_META).map(key => [key, forecast.paths[key].at(-1)]));
  const modelReturns = Object.values(endpoints).map(value => (value / stock.price - 1) * 100);
  const consensusReturn = median(modelReturns);
  const dispersion = Math.max(...modelReturns) - Math.min(...modelReturns);
  const score = clamp(Math.round(50 + consensusReturn * 7 - dispersion * 1.8), 8, 92);
  const band = forecast.vol * Math.sqrt(state.horizon) * 1.64;
  const ensembleEnd = endpoints.ensemble;
  state.forecastCache = { ...forecast, metrics, endpoints, modelReturns, consensusReturn, dispersion, score, low: ensembleEnd * Math.exp(-band), high: ensembleEnd * Math.exp(band) };
  return state.forecastCache;
}

function setChange(element, value) {
  element.textContent = pct(value);
  element.className = `change ${value > .005 ? "up" : value < -.005 ? "down" : "flat"}`;
}

function drawSparkline(canvas, values, positive = true, inverted = false) {
  if (!canvas || !values?.length) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => ({ x: index / (values.length - 1) * width, y: height - 6 - (value - min) / range * (height - 12) }));
  const color = inverted ? (positive ? "#e15f4f" : "#39b86b") : (positive ? "#39b86b" : "#e15f4f");
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}38`);
  gradient.addColorStop(1, `${color}00`);
  ctx.beginPath();
  ctx.moveTo(points[0].x, height);
  points.forEach(point => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, height);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function renderMarkets() {
  const mapping = {
    taiex: ["#taiexValue", "#taiexChange"], otc: ["#otcValue", "#otcChange"],
    sox: ["#soxValue", "#soxChange"], usd: ["#usdValue", "#usdChange"]
  };
  Object.entries(mapping).forEach(([key, [valueSelector, changeSelector]]) => {
    const market = state.markets[key];
    $(valueSelector).textContent = fmt(market.value, key === "usd" ? 2 : 2);
    setChange($(changeSelector), market.change);
    drawSparkline($(`[data-spark="${key}"]`), market.data, market.change >= 0, key !== "usd");
  });
  $("#taiexState").textContent = state.markets.taiex.state || (state.markets.taiex.change > 0 ? "偏多" : "偏弱");
  $("#otcState").textContent = state.markets.otc.state || "震盪";
  $("#fxState").textContent = state.markets.usd.change > .2 ? "升高" : "可控";
  $("#marketSummary").textContent = state.markets.taiex.change >= 0
    ? "權值股撐盤時，仍要確認櫃買與成交廣度是否同步；目前先以選股優於追指數解讀。"
    : "指數承壓時優先檢查量價與外資方向，供應鏈題材若未轉弱，可觀察回檔後的相對強勢。";
}

function drawForecastChart() {
  const canvas = $("#forecastChart");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const pad = { top: 22, right: 56, bottom: 30, left: 12 };
  const history = state.stocks[state.selectedStock].history.slice(-42);
  const fc = state.forecastCache || calculateCurrentForecast();
  const historyValues = history.map(item => item.close);
  const allForecastValues = Object.entries(fc.paths).filter(([key]) => state.enabledModels.has(key)).flatMap(([, values]) => values);
  const bandValues = [fc.low, fc.high];
  const allValues = [...historyValues, ...allForecastValues, ...bandValues];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const pricePad = (rawMax - rawMin || rawMax * .05) * .12;
  const yMin = rawMin - pricePad;
  const yMax = rawMax + pricePad;
  const total = history.length - 1 + state.horizon;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xAt = index => pad.left + index / total * plotWidth;
  const yAt = value => pad.top + (yMax - value) / (yMax - yMin) * plotHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.font = "9px 'DM Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + i / 4 * plotHeight;
    const value = yMax - i / 4 * (yMax - yMin);
    ctx.strokeStyle = "#dde2db";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#7b837d";
    ctx.fillText(fmt(value, value > 100 ? 0 : 2), width - pad.right + 8, y);
  }
  ctx.setLineDash([]);

  const splitX = xAt(history.length - 1);
  ctx.fillStyle = "rgba(57,184,107,.035)";
  ctx.fillRect(splitX, pad.top, width - pad.right - splitX, plotHeight);
  ctx.strokeStyle = "#9ca69f";
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(splitX, pad.top); ctx.lineTo(splitX, pad.top + plotHeight); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#7b837d";
  ctx.fillText("預測起點", splitX + 6, pad.top + 10);

  const ensemble = fc.paths.ensemble;
  ctx.beginPath();
  ctx.moveTo(splitX, yAt(fc.current));
  ensemble.forEach((value, index) => ctx.lineTo(xAt(history.length + index), yAt(value * Math.exp(fc.vol * Math.sqrt(index + 1) * 1.64))));
  [...ensemble].reverse().forEach((value, reverseIndex) => {
    const index = ensemble.length - reverseIndex - 1;
    ctx.lineTo(xAt(history.length + index), yAt(value * Math.exp(-fc.vol * Math.sqrt(index + 1) * 1.64)));
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(24,117,60,.08)";
  ctx.fill();

  ctx.beginPath();
  historyValues.forEach((value, index) => index ? ctx.lineTo(xAt(index), yAt(value)) : ctx.moveTo(xAt(index), yAt(value)));
  ctx.strokeStyle = "#17231c";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const hitPoints = [];
  Object.entries(MODEL_META).forEach(([key, meta]) => {
    if (!state.enabledModels.has(key)) return;
    const values = fc.paths[key];
    ctx.beginPath();
    ctx.moveTo(splitX, yAt(fc.current));
    values.forEach((value, index) => ctx.lineTo(xAt(history.length + index), yAt(value)));
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = key === "ensemble" ? 2.6 : 1.5;
    if (key !== "ensemble") ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    values.forEach((value, index) => hitPoints.push({ x: xAt(history.length + index), y: yAt(value), key, value, index }));
  });

  const dateIndexes = [0, Math.floor((history.length - 1) / 2), history.length - 1, total];
  const lastDate = history.at(-1).date;
  ctx.fillStyle = "#7b837d";
  ctx.textAlign = "center";
  dateIndexes.forEach(index => {
    const label = index < history.length ? history[index].date.slice(5).replace("-", "/") : nextTradingDate(lastDate, state.horizon).slice(5).replace("-", "/");
    ctx.fillText(label, xAt(index), height - 10);
  });
  state.chartHitPoints = hitPoints;
}

function renderForecast() {
  const stock = state.stocks[state.selectedStock];
  const fc = calculateCurrentForecast();
  $("#stockSector").textContent = stock.sector;
  $("#stockCode").textContent = stock.code;
  $("#stockName").textContent = stock.name;
  $("#stockPrice").textContent = fmt(stock.price, stock.price >= 100 ? 0 : 2);
  setChange($("#stockChange"), stock.change);
  const positiveCount = fc.modelReturns.filter(value => value > 0).length;
  const label = positiveCount >= 3 ? "偏多但需確認" : positiveCount <= 1 ? "偏保守" : "多空分歧";
  $("#consensusScore").textContent = fc.score;
  $("#consensusRing").style.setProperty("--score", fc.score);
  $("#consensusLabel").textContent = label;
  $("#consensusCopy").textContent = `${positiveCount} / 4 個模型看高，預估中位數 ${pct(fc.consensusReturn)}；請搭配事件與風險判讀。`;
  $("#rangeLabel").textContent = `${HORIZON_LABELS[state.horizon]} 90% 情境區間`;
  $("#forecastRange").textContent = `${fmt(fc.low, 0)} — ${fmt(fc.high, 0)}`;
  $("#volatilityValue").textContent = `${(fc.vol * Math.sqrt(252) * 100).toFixed(1)}%`;
  $("#dispersionValue").textContent = `${fc.dispersion.toFixed(1)} p.p.`;
  $("#qualityValue").textContent = stock.source === "live" ? "官方歷史" : "示範快照";
  renderModelTable(fc);
  renderSupplyChain();
  drawForecastChart();
}

function renderModelTable(fc) {
  $("#modelTable").innerHTML = Object.entries(MODEL_META).map(([key, meta]) => {
    const metric = fc.metrics[key];
    const forecastReturn = (fc.endpoints[key] / fc.current - 1) * 100;
    return `<tr>
      <td><span class="model-name"><i class="model-dot ${key}"></i>${meta.label}</span></td>
      <td class="mono">${metric.directional.toFixed(0)}% <small>(${metric.samples} 次)</small></td>
      <td class="mono">${metric.error.toFixed(2)}%</td>
      <td class="mono"><span class="change ${forecastReturn >= 0 ? "up" : "down"}">${pct(forecastReturn)}</span></td>
      <td><div class="confidence-bar" title="可靠度 ${metric.reliability.toFixed(0)}"><i style="width:${metric.reliability}%"></i></div></td>
    </tr>`;
  }).join("");
}

function renderSupplyChain() {
  const stock = state.stocks[state.selectedStock];
  $("#driverTitle").textContent = stock.driver;
  $("#driverReason").textContent = `此路徑是 ${stock.name} 目前最重要的觀察假設。新聞必須進一步反映到訂單、出貨或毛利，才算真正落地。`;
  $("#chainFlow").innerHTML = stock.chain.map(([label, value], index) => `${index ? '<span class="chain-arrow">→</span>' : ""}<div class="chain-node"><span>${label}</span><b>${value}</b></div>`).join("");
  const related = [
    { title: "上游需求能見度", value: "+ 中期", copy: "法人說法需與月營收、法說指引交叉確認。", tone: "positive" },
    { title: "估值與利率壓力", value: "− 短期", copy: "利率快速上行會先壓縮成長股評價。", tone: "negative" },
    { title: stock.risk, value: "風險", copy: "模型不含突發政策與公司治理事件，需另設停損。", tone: "negative" }
  ];
  $("#impactList").innerHTML = related.map(item => `<article class="impact-mini"><h4>${item.title}</h4><b class="${item.tone}">${item.value}</b><p>${item.copy}</p></article>`).join("");
}

function classifyNews(item) {
  if (item.category && item.impact && item.stocks) return item;
  const title = item.title || "市場快訊";
  const text = title.toLowerCase();
  const negativeWords = ["跌", "限制", "制裁", "下修", "風險", "衝突", "關稅", "shortage", "ban", "cut"];
  const positiveWords = ["成長", "上修", "擴產", "訂單", "需求", "growth", "record", "boost"];
  const impact = negativeWords.some(word => text.includes(word)) ? "negative" : positiveWords.some(word => text.includes(word)) ? "positive" : "neutral";
  const category = /台灣|台股|twse|taiwan/i.test(title) ? "tw" : /晶片|半導體|供應|伺服器|chip|semiconductor|supply/i.test(title) ? "supply" : "world";
  const stocks = /ai|伺服器|server/i.test(title) ? ["2330 台積電", "2382 廣達"] : /晶片|半導體|chip/i.test(title) ? ["2330 台積電", "2454 聯發科"] : ["台股大盤"];
  return { ...item, category, impact, stocks, summary: item.summary || "此新聞先作為事件訊號；是否影響股價，仍需確認對營收、成本、資本支出或估值的實際傳導。" };
}

function renderNews(filter = $("#newsFilters .active")?.dataset.filter || "all") {
  const rows = state.news.map(classifyNews).filter(item => filter === "all" || item.category === filter).slice(0, 9);
  $("#newsGrid").innerHTML = rows.length ? rows.map(item => {
    const typeLabel = { tw: "台灣", world: "全球", supply: "供應鏈" }[item.category] || "市場";
    const sourceLink = item.url ? `<a class="news-source" href="${item.url}" target="_blank" rel="noreferrer">查看來源 ↗</a>` : "";
    return `<article class="news-card ${item.impact}">
      <div class="news-meta"><span class="news-type">${typeLabel}</span><span>${item.time || "近期"}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <div class="news-impact"><span>可能影響</span><div class="news-tags">${item.stocks.map(stock => `<b>${escapeHtml(stock)}</b>`).join("")}</div>${sourceLink}</div>
    </article>`;
  }).join("") : '<p class="news-empty">這個分類目前沒有訊號。</p>';
}

function renderWatchlist() {
  $("#watchlistBody").innerHTML = Object.values(state.stocks).map(stock => {
    const f3 = modelForecast(stock.history, 3).paths.ensemble.at(-1) / stock.price * 100 - 100;
    const f21 = modelForecast(stock.history, 21).paths.ensemble.at(-1) / stock.price * 100 - 100;
    const signalClass = f21 > 2 ? "positive" : f21 < -2 ? "caution" : "watch";
    const signalText = f21 > 2 ? "偏多觀察" : f21 < -2 ? "風險升高" : "等待確認";
    return `<tr>
      <td><div class="stock-cell"><span class="stock-avatar">${stock.code.slice(0, 2)}</span><div><strong>${stock.name}</strong><span>${stock.code} · ${stock.sector}</span></div></div></td>
      <td class="mono">${fmt(stock.price, stock.price > 100 ? 0 : 2)} <span class="change ${stock.change >= 0 ? "up" : "down"}">${pct(stock.change)}</span></td>
      <td class="mono"><span class="change ${f3 >= 0 ? "up" : "down"}">${pct(f3)}</span></td>
      <td class="mono"><span class="change ${f21 >= 0 ? "up" : "down"}">${pct(f21)}</span></td>
      <td>${stock.driver}</td><td>${stock.risk}</td><td><span class="signal ${signalClass}">${signalText}</span></td>
    </tr>`;
  }).join("");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function updateDataStatus(mode, updatedAt) {
  const live = mode === "live";
  const badge = $("#dataBadge");
  const side = $("#sideDataStatus");
  badge.className = `data-badge ${live ? "live" : "demo"}`;
  side.className = `source-state ${live ? "live" : "demo"}`;
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "";
  badge.querySelector("span").textContent = live ? `TWSE 更新 ${time}` : "示範快照";
  side.lastChild.textContent = live ? "TWSE 官方歷史" : "離線示範資料";
}

function renderAll() {
  renderMarkets();
  renderForecast();
  renderNews();
  renderWatchlist();
  updateDataStatus(state.mode, state.updatedAt);
}

async function fetchDashboard(force = false) {
  const button = $("#refreshButton");
  button.classList.add("loading");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`/api/dashboard${force ? "?refresh=1" : ""}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error("API unavailable");
    const payload = await response.json();
    if (payload.stocks) {
      Object.entries(payload.stocks).forEach(([code, remote]) => {
        if (!STOCK_META[code] || !remote.history?.length) return;
        const history = remote.history.map(row => ({ date: row.date, close: Number(row.close) })).filter(row => Number.isFinite(row.close));
        if (history.length < 35) return;
        const price = history.at(-1).close;
        const previous = history.at(-2).close;
        state.stocks[code] = { code, ...STOCK_META[code], history, price, change: (price / previous - 1) * 100, source: "live" };
      });
    }
    if (payload.markets) state.markets = { ...state.markets, ...payload.markets };
    if (payload.news?.length) state.news = payload.news;
    state.mode = payload.mode || (Object.values(state.stocks).some(stock => stock.source === "live") ? "live" : "demo");
    state.updatedAt = payload.updated_at || new Date().toISOString();
    renderAll();
    if (force) showToast(state.mode === "live" ? "市場資料已更新" : "目前使用示範快照");
  } catch (error) {
    state.mode = "demo";
    updateDataStatus("demo");
    if (force) showToast("連線未完成，保留示範快照");
  } finally {
    button.classList.remove("loading");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function bindEvents() {
  $("#stockPicker").addEventListener("click", event => {
    const button = event.target.closest("[data-stock]");
    if (!button) return;
    state.selectedStock = button.dataset.stock;
    $$("#stockPicker button").forEach(item => item.classList.toggle("active", item === button));
    renderForecast();
  });
  $("#horizonPicker").addEventListener("click", event => {
    const button = event.target.closest("[data-days]");
    if (!button) return;
    state.horizon = Number(button.dataset.days);
    $$("#horizonPicker button").forEach(item => item.classList.toggle("active", item === button));
    renderForecast();
  });
  $("#modelLegend").addEventListener("change", event => {
    const input = event.target.closest("[data-model]");
    if (!input) return;
    input.checked ? state.enabledModels.add(input.dataset.model) : state.enabledModels.delete(input.dataset.model);
    if (!state.enabledModels.size) { input.checked = true; state.enabledModels.add(input.dataset.model); }
    drawForecastChart();
  });
  $("#newsFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    $$("#newsFilters button").forEach(item => item.classList.toggle("active", item === button));
    renderNews(button.dataset.filter);
  });
  $("#refreshButton").addEventListener("click", () => fetchDashboard(true));
  $("#menuButton").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  $$(".side-nav a").forEach(link => link.addEventListener("click", () => document.body.classList.remove("menu-open")));
  document.addEventListener("click", event => {
    if (innerWidth > 820 || !document.body.classList.contains("menu-open")) return;
    if (!event.target.closest(".sidebar") && !event.target.closest("#menuButton")) document.body.classList.remove("menu-open");
  });
  const canvas = $("#forecastChart");
  canvas.addEventListener("mousemove", event => {
    if (!state.chartHitPoints.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const nearestIndex = Math.round((x - state.chartHitPoints[0].x) / ((rect.width - 68 - state.chartHitPoints[0].x) / Math.max(state.horizon - 1, 1)));
    const rows = state.chartHitPoints.filter(point => point.index === clamp(nearestIndex, 0, state.horizon - 1));
    if (!rows.length) { $("#chartTooltip").hidden = true; return; }
    const tooltip = $("#chartTooltip");
    tooltip.innerHTML = `<b>${nextTradingDate(state.stocks[state.selectedStock].history.at(-1).date, rows[0].index + 1)}</b><br>${rows.map(row => `<span style="color:${MODEL_META[row.key].color}">●</span> ${MODEL_META[row.key].label} ${fmt(row.value, 1)}`).join("<br>")}`;
    tooltip.hidden = false;
    tooltip.style.left = `${clamp(x + 12, 8, rect.width - 150)}px`;
    tooltip.style.top = `${clamp(event.clientY - rect.top - 25, 8, rect.height - 120)}px`;
  });
  canvas.addEventListener("mouseleave", () => $("#chartTooltip").hidden = true);
  const resize = new ResizeObserver(() => { renderMarkets(); drawForecastChart(); });
  resize.observe(document.querySelector("main"));
  const sections = $$("main section[id]");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      $$(".side-nav a").forEach(link => link.classList.toggle("active", link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: "-30% 0px -60%" });
  sections.forEach(section => observer.observe(section));
}

function init() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).toUpperCase();
  initializeFallbackStocks();
  bindEvents();
  renderAll();
  fetchDashboard(false);
}

document.addEventListener("DOMContentLoaded", init);
