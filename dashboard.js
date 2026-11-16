const get = (id) => document.getElementById(id);
const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const count = (value) => format.format(value) + "명";
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const start = get("start");
const end = get("end");
const group = get("group");
const trend = get("trend");
let rows = [];
let selection = [];
let chartArea;

function chart(canvas, maximum) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const left = 52, right = width - 12, top = 16, bottom = height - 32;
  const step = Math.max(1, Math.ceil(maximum / 4 / 10000)) * 10000;
  const y = (value) => bottom - value / (step * 4) * (bottom - top);
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const line = y(i * step);
    ctx.strokeStyle = "#e1eae4";
    ctx.beginPath();
    ctx.moveTo(left, line);
    ctx.lineTo(right, line);
    ctx.stroke();
    ctx.fillStyle = "#4b625a";
    ctx.fillText(format.format(i * step / 10000) + "만", left - 7, line + 4);
  }
  ctx.textAlign = "center";
  return { ctx, left, right, bottom, y };
}

function drawTrend() {
  const key = group.value;
  const values = selection.map((row) => row[key]);
  const rolling = selection.map((row) => {
    const index = rows.indexOf(row);
    return index < 11 ? null : mean(rows.slice(index - 11, index + 1).map((item) => item[key]));
  });
  const area = chart(trend, Math.max(...values, ...rolling));
  const { ctx, left, right, bottom, y } = area;
  chartArea = area;
  const x = (index) => values.length === 1 ? (left + right) / 2
    : left + index / (values.length - 1) * (right - left);
  for (const [line, color, weight] of [[values, "#5c929c", 1.5], [rolling, "#137657", 2.8]]) {
    const points = line.flatMap((value, index) => value === null ? [] : [[x(index), y(value)]]);
    if (!points.length) continue;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    points.slice(1).forEach((point) => ctx.lineTo(...point));
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(...points[0], 4, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  const ticks = Math.min(values.length, Math.max(2, Math.floor((right - left) / 86)));
  ctx.fillStyle = "#4b625a";
  for (let i = 0; i < ticks; i++) {
    const index = ticks === 1 ? 0 : Math.round(i * (values.length - 1) / (ticks - 1));
    const position = Math.max(26, Math.min(trend.clientWidth - 26, x(index)));
    ctx.fillText(selection[index].month, position, bottom + 20);
  }
}

function drawSeason() {
  const bins = Array.from({ length: 12 }, () => []);
  selection.forEach((row) => bins[Number(row.month.slice(5)) - 1].push(row[group.value]));
  const averages = bins.map((bin) => bin.length ? mean(bin) : 0);
  const maximum = Math.max(...averages);
  const { ctx, left, right, bottom, y } = chart(get("season"), maximum);
  const width = (right - left) / 12;
  averages.forEach((value, index) => {
    const x = left + width * (index + 0.5);
    ctx.fillStyle = value === maximum ? "#137657" : "#9acbb8";
    ctx.fillRect(x - width * 0.34, y(value), width * 0.68, bottom - y(value));
    ctx.fillStyle = "#4b625a";
    ctx.fillText(index + 1, x, bottom + 20);
  });
  get("season").setAttribute("aria-label", averages.map((value, index) =>
    (index + 1) + "월 " + (bins[index].length ? count(value) : "자료 없음")).join(", "));
}

function render() {
  selection = rows.slice(start.selectedIndex, end.selectedIndex + 1);
  const values = selection.map((row) => row[group.value]);
  const peak = Math.max(...values);
  get("sum").textContent = count(values.reduce((sum, value) => sum + value, 0));
  get("average").textContent = count(mean(values));
  get("peak").textContent = count(peak);
  get("peak-month").textContent = selection[values.indexOf(peak)].month;
  get("period").textContent = start.value + " ~ " + end.value;
  get("months").textContent = selection.length + "개월";
  get("detail").textContent = "선택한 기간의 정확한 값은 아래 데이터 표에서도 확인할 수 있습니다.";
  get("records").replaceChildren(...selection.map((row) => {
    const tr = document.createElement("tr");
    tr.insertCell().textContent = row.month;
    tr.insertCell().textContent = format.format(row[group.value]);
    return tr;
  }));
  drawTrend();
  drawSeason();
}

start.addEventListener("change", () => {
  if (start.selectedIndex > end.selectedIndex) end.selectedIndex = start.selectedIndex;
  render();
});
end.addEventListener("change", () => {
  if (end.selectedIndex < start.selectedIndex) start.selectedIndex = end.selectedIndex;
  render();
});
group.addEventListener("change", render);
get("reset").addEventListener("click", () => {
  start.selectedIndex = 0;
  end.selectedIndex = rows.length - 1;
  render();
});
trend.addEventListener("pointermove", (event) => {
  const { left, right } = chartArea;
  const fraction = Math.max(0, Math.min(1, (event.offsetX - left) / (right - left)));
  const row = selection[Math.round(fraction * (selection.length - 1))];
  get("detail").textContent = row.month + " · " + count(row[group.value]);
});

async function load() {
  const response = await fetch("data/jeju_monthly.csv");
  if (!response.ok) throw new Error("CSV response " + response.status);
  const csv = await response.text();
  rows = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [month, total, domestic, foreign] = line.split(",");
    return { month, total: Number(total), domestic: Number(domestic), foreign: Number(foreign) };
  }).filter((row) => row.month >= "2013-01" && row.month <= "2025-12")
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length !== 156 || rows.some((row) =>
    !Number.isFinite(row.total) || row.total !== row.domestic + row.foreign)) {
    throw new Error("Invalid visitor records");
  }
  for (const select of [start, end]) {
    select.replaceChildren(...rows.map((row) => new Option(row.month, row.month)));
  }
  end.selectedIndex = rows.length - 1;
  get("dashboard").hidden = false;
  get("status").hidden = true;
  render();
  new ResizeObserver(() => {
    drawTrend();
    drawSeason();
  }).observe(get("dashboard"));
}

load().catch((error) => {
  get("dashboard").hidden = true;
  get("status").hidden = false;
  get("status").textContent = "데이터를 불러오지 못했습니다. 페이지를 새로고침하거나 README의 로컬 실행 방법을 확인해 주세요.";
  console.error(error);
});
