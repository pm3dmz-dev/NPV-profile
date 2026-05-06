import React, { useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const presets = {
  Base: [-1000, 300, 350, 400, 450, 500],
  "Long-lived project": [-2500, 250, 350, 475, 600, 700, 800, 900],
  "Non-conventional": [-1000, 2300, -1320],
  NetPhone: [-33.8, 11.6, 17.6, 17.6, 17.6, 6.0],
  "Deferred Maintenance": [10, 10, 10, 10, 10, -124],
  Mining: [-700, 500, 500, 500, 500, -1392],
  "Advance Payment": [100, -80, -50, -50, -30, 160],
};

function safeNumber(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function formatCurrency(value) {
  return Number.isFinite(value) ? currency.format(value) : "—";
}

function formatPercent(value) {
  return Number.isFinite(value) ? pct.format(value) : "—";
}

function formatMultiple(value) {
  return Number.isFinite(value) ? value.toFixed(2) + "x" : "—";
}

function npvAtRate(cashFlows, rate) {
  if (!Number.isFinite(rate) || rate <= -1) return NaN;
  return cashFlows.reduce((sum, cf, t) => sum + safeNumber(cf) / Math.pow(1 + rate, t), 0);
}

function derivativeNpv(cashFlows, rate) {
  if (!Number.isFinite(rate) || rate <= -1) return NaN;
  return cashFlows.reduce((sum, cf, t) => {
    if (t === 0) return sum;
    return sum - (t * safeNumber(cf)) / Math.pow(1 + rate, t + 1);
  }, 0);
}

function bisectionRoot(cashFlows, left, right) {
  let fl = npvAtRate(cashFlows, left);
  const fr = npvAtRate(cashFlows, right);
  if (!Number.isFinite(fl) || !Number.isFinite(fr) || fl * fr > 0) return null;

  let lo = left;
  let hi = right;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = npvAtRate(cashFlows, mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-8) return mid;
    if (fl * fm <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fl = fm;
    }
  }
  return (lo + hi) / 2;
}

function findIrrs(cashFlows, minRate = -0.95, maxRate = 2) {
  const roots = [];
  const steps = 1400;
  let priorRate = minRate;
  let priorValue = npvAtRate(cashFlows, priorRate);

  for (let i = 1; i <= steps; i += 1) {
    const rate = minRate + ((maxRate - minRate) * i) / steps;
    const value = npvAtRate(cashFlows, rate);
    if (Number.isFinite(priorValue) && Number.isFinite(value) && priorValue * value < 0) {
      const root = bisectionRoot(cashFlows, priorRate, rate);
      if (root !== null && !roots.some((x) => Math.abs(x - root) < 1e-4)) roots.push(root);
    }
    priorRate = rate;
    priorValue = value;
  }
  return roots;
}

function moneyMultiple(cashFlows) {
  const invested = Math.abs(cashFlows.filter((cf) => safeNumber(cf) < 0).reduce((sum, cf) => sum + safeNumber(cf), 0));
  const returned = cashFlows.filter((cf) => safeNumber(cf) > 0).reduce((sum, cf) => sum + safeNumber(cf), 0);
  return invested === 0 ? NaN : returned / invested;
}

function presentValueCashFlows(cashFlows, rate) {
  return cashFlows.map((cf, t) => safeNumber(cf) / Math.pow(1 + rate, t));
}

function incrementalCashFlows(cashFlowsA, cashFlowsB) {
  const count = Math.max(cashFlowsA.length, cashFlowsB.length);
  return Array.from({ length: count }, (_, i) => safeNumber(cashFlowsA[i]) - safeNumber(cashFlowsB[i]));
}

function pickDisplayedIncrementalIrr(irrs) {
  if (!irrs.length) return { value: null, multiple: false };
  if (irrs.length === 1) return { value: irrs[0], multiple: false };
  const positive = irrs.filter((r) => r > 0).sort((a, b) => a - b);
  const chosen = positive.length ? positive[0] : [...irrs].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  return { value: chosen, multiple: true };
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exponent);
  const fraction = rawStep / base;
  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 2.5) return 2.5 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function makeTicks(minValue, maxValue, desired = 6, includeZero = true, fixedStep = null) {
  let lo = Number.isFinite(minValue) ? minValue : 0;
  let hi = Number.isFinite(maxValue) ? maxValue : 1;
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) hi = lo + 1;
  const step = fixedStep || niceStep((hi - lo) / Math.max(1, desired - 1));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let tick = start; tick <= end + step * 0.5; tick += step) {
    ticks.push(Math.abs(tick) < step * 1e-10 ? 0 : tick);
  }
  if (includeZero && !ticks.some((tick) => Math.abs(tick) < step * 1e-8)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1] };
}

function buildPath(data, xKey, yKey, width, height, pad, domain) {
  const xScale = (x) => pad.left + ((x - domain.xMin) / (domain.xMax - domain.xMin || 1)) * (width - pad.left - pad.right);
  const yScale = (y) => height - pad.bottom - ((y - domain.yMin) / (domain.yMax - domain.yMin || 1)) * (height - pad.top - pad.bottom);
  const d = data
    .filter((row) => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]))
    .map((row, i) => (i === 0 ? "M" : "L") + xScale(row[xKey]).toFixed(2) + "," + yScale(row[yKey]).toFixed(2))
    .join(" ");
  return { d, xScale, yScale };
}

function makeNpvData(cashFlows, minRate, maxRate) {
  const lo = Math.max(-0.9, Math.round(safeNumber(minRate, -0.2) * 10) / 10);
  const hi = Math.round(safeNumber(maxRate, 0.5) * 10) / 10;
  if (lo >= hi) return [];
  const points = Math.max(260, Math.min(1000, Math.ceil(Math.abs(hi - lo) / 0.001)));
  return Array.from({ length: points }, (_, i) => {
    const rate = lo + ((hi - lo) * i) / (points - 1);
    return { rate, ratePct: rate * 100, npv: npvAtRate(cashFlows, rate) };
  });
}

function makeStats(cashFlows, rate) {
  const value = npvAtRate(cashFlows, rate);
  const slope = derivativeNpv(cashFlows, rate);
  const duration = value !== 0 && Number.isFinite(value) && Number.isFinite(slope) ? -(slope / Math.abs(value)) * 0.01 : NaN;
  return { npv: value, slope, duration, irrs: findIrrs(cashFlows), multiple: moneyMultiple(cashFlows) };
}

function formatIrrList(irrs) {
  if (!irrs.length) return "no IRR";
  if (irrs.length === 1) return pct.format(irrs[0]);
  return irrs.map((r) => pct.format(r)).join(", ") + " — multiple IRRs";
}

function runSelfTests() {
  const close = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;
  console.assert(close(npvAtRate([-100, 110], 0.1), 0), "NPV test failed");
  console.assert(close(moneyMultiple([-100, 50, 75]), 1.25), "Multiple of money test failed");
  console.assert(findIrrs([-100, 110]).some((r) => close(r, 0.1, 1e-4)), "IRR test failed");
  console.assert(close(presentValueCashFlows([100, 110], 0.1)[1], 100), "PV timeline test failed");
  console.assert(close(incrementalCashFlows([-100, 60], [-50, 40])[0], -50), "Incremental CF test failed");
  console.assert(pickDisplayedIncrementalIrr([-0.2, 0.1, 0.3]).value === 0.1, "Displayed incremental IRR test failed");
  console.assert(makeNpvData([-100, 110], -0.2, 0.5).length >= 260, "Chart data density test failed");
}
runSelfTests();

function Metric({ title, value, sub, multiple = false }) {
  return (
    <div className="metricCard">
      <p className="metricTitle">{title}</p>
      <p className="metricValue">
        {value}
        {multiple && <span className="metricMultiple"> (multiple)</span>}
      </p>
      <p className="metricSub">{sub}</p>
    </div>
  );
}

function CashFlowEditor({ projectName, colorClass, presetName, cashFlows, onPresetChange, onFlowChange, onAddYear, onRemoveYear }) {
  return (
    <div className="projectEditor">
      <div className="projectTitleRow">
        <h3 className="cashFlowTitle"><span className={"legendDot " + colorClass} /> {projectName}</h3>
        <button className="smallButton" onClick={onAddYear}>+ Cash flow</button>
      </div>
      <label className="label">
        Preset
        <select value={presetName} onChange={(e) => onPresetChange(e.target.value)}>
          {Object.keys(presets).map((name) => <option key={name} value={name}>{name}</option>)}
          <option value="Custom">Custom</option>
        </select>
      </label>
      {presetName === "Custom" && <p className="customHint">Use + Cash flow to extend the project, then edit each period.</p>}
      <div className="flowList">
        {cashFlows.map((cf, i) => (
          <div className="flowRow" key={i}>
            <div className="periodTag">t={i}</div>
            <input type="number" value={cf} onChange={(e) => onFlowChange(i, e.target.value)} />
            <button className="deleteButton" disabled={cashFlows.length <= 1} onClick={() => onRemoveYear(i)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NpvChart({ dataA, dataB, compare, selectedRate, statsA, statsB, minRate, maxRate, setMinRate, setMaxRate }) {
  const width = 880;
  const height = 300;
  const pad = { top: 12, right: 34, bottom: 38, left: 80 };
  const allData = compare ? [...dataA, ...dataB] : dataA;
  const yValues = allData.map((row) => row.npv).filter(Number.isFinite);
  const xTicks = makeTicks(minRate * 100, maxRate * 100, 7, true, 10);
  const yTicks = makeTicks(Math.min(...yValues, 0), Math.max(...yValues, 0), 7, true);
  const domain = { xMin: xTicks.min, xMax: xTicks.max, yMin: yTicks.min, yMax: yTicks.max };
  const pathA = buildPath(dataA, "ratePct", "npv", width, height, pad, domain);
  const pathB = buildPath(dataB, "ratePct", "npv", width, height, pad, domain);
  const xScale = pathA.xScale;
  const yScale = pathA.yScale;
  const zeroY = yScale(0);
  const zeroX = xScale(0);
  const selectedX = xScale(clamp(selectedRate * 100, domain.xMin, domain.xMax));
  const selectedYA = yScale(clamp(statsA.npv, domain.yMin, domain.yMax));
  const selectedYB = yScale(clamp(statsB.npv, domain.yMin, domain.yMax));
  const labelX = clamp(selectedX + 44, pad.left + 58, width - pad.right - 58);
  const labelsClose = compare && Math.abs(selectedYA - selectedYB) < 58;
  const aAbove = selectedYA <= selectedYB;
  const labelYA = clamp(selectedYA + (compare ? (aAbove ? -24 : 38) : -30), pad.top + 16, height - pad.bottom - 34);
  const labelYB = clamp(selectedYB + (labelsClose ? (aAbove ? 42 : -26) : 28), pad.top + 16, height - pad.bottom - 34);

  return (
    <div className="chartArea">
      <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label="NPV profile chart">
        <rect width={width} height={height} rx="22" className="chartBg" />
        {yTicks.ticks.map((tick) => (
          <g key={"y-" + tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yScale(tick)} y2={yScale(tick)} className="gridLine" />
            <text x={pad.left - 12} y={yScale(tick) + 4} textAnchor="end" className={tick === 0 ? "axisText strong" : "axisText"}>{currency.format(tick)}</text>
          </g>
        ))}
        {xTicks.ticks.map((tick) => (
          <g key={"x-" + tick}>
            <line x1={xScale(tick)} x2={xScale(tick)} y1={pad.top} y2={height - pad.bottom} className={tick === 0 ? "zeroAxisLine" : "gridLine faint"} />
            <text x={xScale(tick)} y={height - 24} textAnchor="middle" className={tick === 0 ? "axisText strong" : "axisText"}>{tick.toFixed(0)}%</text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} className="zeroLine" />
        <line x1={zeroX} x2={zeroX} y1={pad.top} y2={height - pad.bottom} className="zeroLine" />
        <path d={pathA.d} className="mainLine projectAStroke" />
        {compare && <path d={pathB.d} className="mainLine projectBStroke" />}
        {compare && Number.isFinite(statsB.npv) && (
          <>
            <line x1={selectedX} x2={selectedX} y1={selectedYB} y2={height - pad.bottom} className="selectedProjection projectBProjection" />
            <line x1={Math.min(zeroX, selectedX)} x2={Math.max(zeroX, selectedX)} y1={selectedYB} y2={selectedYB} className="selectedProjection projectBProjection" />
            <circle cx={selectedX} cy={selectedYB} r="5.5" className="selectedDotB" />
            <text x={labelX} y={labelYB} textAnchor="middle" className="selectedLabel projectBText">NPV B</text>
            <text x={labelX} y={labelYB + 15} textAnchor="middle" className="selectedLabel strong projectBText">{formatCurrency(statsB.npv)}</text>
          </>
        )}
        <line x1={selectedX} x2={selectedX} y1={selectedYA} y2={height - pad.bottom} className="selectedProjection" />
        <line x1={Math.min(zeroX, selectedX)} x2={Math.max(zeroX, selectedX)} y1={selectedYA} y2={selectedYA} className="selectedProjection" />
        <circle cx={selectedX} cy={selectedYA} r="6" className="selectedDot" />
        <text x={labelX} y={labelYA} textAnchor="middle" className="selectedLabel">NPV A</text>
        <text x={labelX} y={labelYA + 15} textAnchor="middle" className="selectedLabel strong">{formatCurrency(statsA.npv)}</text>
        <text x={selectedX} y={height - pad.bottom + 18} textAnchor="middle" className="selectedLabel">r</text>
        <text x={selectedX} y={height - pad.bottom + 33} textAnchor="middle" className="selectedLabel strong">{pct.format(selectedRate)}</text>
        {!compare && statsA.irrs.filter((r) => r * 100 >= domain.xMin && r * 100 <= domain.xMax).map((r, i) => (
          <g key={"irra-" + i}>
            <circle cx={xScale(r * 100)} cy={zeroY} r="5" className="irrDot" />
            <text x={clamp(xScale(r * 100), pad.left + 34, width - pad.right - 34)} y={zeroY - 22} textAnchor="middle" className="irrText">IRR A</text>
            <text x={clamp(xScale(r * 100), pad.left + 34, width - pad.right - 34)} y={zeroY - 7} textAnchor="middle" className="irrText strong">{pct.format(r)}</text>
          </g>
        ))}
        <text x={(pad.left + width - pad.right) / 2} y={height - 6} textAnchor="middle" className="axisTitle">Discount rate</text>
        <text x="18" y={height / 2} transform={"rotate(-90 18 " + height / 2 + ")"} textAnchor="middle" className="axisTitle">NPV</text>
      </svg>
      <div className="axisInput axisInputMin" style={{ left: (pad.left / width) * 100 + "%" }}>
        <label className="axisInputInlineLabel"><span>Min %</span><input type="number" step="10" value={Math.round(minRate * 100)} onChange={(e) => setMinRate(Math.round(safeNumber(e.target.value, 0) / 10) / 10)} /></label>
      </div>
      <div className="axisInput axisInputMax" style={{ left: ((width - pad.right) / width) * 100 + "%" }}>
        <label className="axisInputInlineLabel"><span>Max %</span><input type="number" step="10" value={Math.round(maxRate * 100)} onChange={(e) => setMaxRate(Math.round(safeNumber(e.target.value, 40) / 10) / 10)} /></label>
      </div>
    </div>
  );
}

function TimelineChart({ cashFlowsA, pvFlowsA, cashFlowsB, pvFlowsB }) {
  const width = 640;
  const height = 210;
  const pad = { top: 14, right: 28, bottom: 32, left: 78 };

  const dataA = cashFlowsA.map((cf, t) => ({ t, value: safeNumber(cf) }));
  const dataPvA = pvFlowsA.map((cf, t) => ({ t, value: safeNumber(cf) }));
  const dataB = cashFlowsB ? cashFlowsB.map((cf, t) => ({ t, value: safeNumber(cf) })) : [];
  const dataPvB = pvFlowsB ? pvFlowsB.map((cf, t) => ({ t, value: safeNumber(cf) })) : [];

  const allValues = [
    ...cashFlowsA,
    ...pvFlowsA,
    ...(cashFlowsB || []),
    ...(pvFlowsB || []),
  ].map((x) => safeNumber(x));

  const yTicks = makeTicks(Math.min(...allValues, 0), Math.max(...allValues, 0), 5, true);
  const xMax = Math.max(cashFlowsA.length - 1, cashFlowsB ? cashFlowsB.length - 1 : 1, 1);
  const xTicks = makeTicks(0, xMax, 6, true);
  const domain = { xMin: xTicks.min, xMax: xTicks.max, yMin: yTicks.min, yMax: yTicks.max };

  const pathA = buildPath(dataA, "t", "value", width, height, pad, domain);
  const pathPvA = buildPath(dataPvA, "t", "value", width, height, pad, domain);
  const pathB = buildPath(dataB, "t", "value", width, height, pad, domain);
  const pathPvB = buildPath(dataPvB, "t", "value", width, height, pad, domain);
  const zeroY = pathA.yScale(0);

  return (
    <svg className="timelineSvg" viewBox={"0 0 " + width + " " + height} role="img" aria-label="Cash-flow and PV timeline chart">
      <rect width={width} height={height} rx="22" className="chartBg" />
      {yTicks.ticks.map((tick) => (
        <g key={"ty-" + tick}>
          <line x1={pad.left} x2={width - pad.right} y1={pathA.yScale(tick)} y2={pathA.yScale(tick)} className="gridLine" />
          <text x={pad.left - 10} y={pathA.yScale(tick) + 4} textAnchor="end" className="axisText">{currency.format(tick)}</text>
        </g>
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} className="zeroLine" />
      <path d={pathA.d} className="mainLine projectAStroke" />
      <path d={pathPvA.d} className="mainLine projectAStroke dashedLine" />
      {dataA.map((row) => <circle key={"ta-" + row.t} cx={pathA.xScale(row.t)} cy={pathA.yScale(row.value)} r="3.5" className="pointDot" />)}
      {cashFlowsB && <path d={pathB.d} className="mainLine projectBStroke" />}
      {pvFlowsB && <path d={pathPvB.d} className="mainLine projectBStroke dashedLine" />}
      {cashFlowsB && dataB.map((row) => <circle key={"tb-" + row.t} cx={pathA.xScale(row.t)} cy={pathA.yScale(row.value)} r="3.5" className="pointDotB" />)}
      <text x={(pad.left + width - pad.right) / 2} y={height - 8} textAnchor="middle" className="axisTitle">Period</text>
    </svg>
  );
}

function presetTeachingNote(presetName, stats, projectLabel) {
  const outcome = projectLabel + " currently has NPV " + formatCurrency(stats.npv) + ", IRR " + formatIrrList(stats.irrs) + ", and Multiple of Money " + formatMultiple(stats.multiple) + ".";
  const notes = {
    Base: ["Base project", "A standard investment example: a large up-front cash investment followed by operating cash returns.", "This is the cleanest case for comparing NPV and IRR. The NPV profile is downward sloping and the IRR is unique.", "For conventional investments, IRR is a useful summary, but NPV remains the value criterion."],
    "Long-lived project": ["Long-lived project", "A larger, longer-duration investment with cash flows spread farther into the future.", "Because value arrives later, the project is more sensitive to the discount rate.", "Long-horizon projects can look attractive on cash returned, but value depends strongly on the opportunity cost of capital."],
    "Non-conventional": ["Non-conventional cash flows", "A project with more than one sign change: an initial outflow, a large inflow, then a later outflow.", "The NPV profile can cross zero more than once, so IRR is not a single clean hurdle rate.", "When signs change more than once, focus on NPV at the relevant cost of capital."],
    NetPhone: ["NetPhone", "A product-launch example with an initial launch cost, operating cash flows, and a smaller terminal cash flow.", "This behaves like a conventional project; the PV timeline shows which years contribute most to value.", "Timing and discount rates matter even when total cash returned is positive."],
    "Deferred Maintenance": ["Deferred Maintenance", "A cost-deferral example: small early benefits followed by a large later cash outflow.", "This can resemble borrowing from the future; higher discount rates reduce the weight on the later cost.", "Ask whether the project creates value or merely shifts costs into the future."],
    Mining: ["Mining", "A resource-extraction project with initial investment, interim operating cash flows, and a terminal cleanup liability.", "The terminal liability creates non-conventional cash-flow behavior.", "Long-dated liabilities should be modeled explicitly; use the full NPV profile."],
    "Advance Payment": ["Advance Payment", "A financing-like project: cash is received at the start, followed by later obligations and a terminal inflow.", "Positive cash at date 0 is not the same as value creation.", "Use NPV to put early receipts and future obligations on the same present-value basis."],
    Custom: ["Custom project", "A user-defined cash-flow stream. Use + Cash flow to add periods and edit values directly.", "Change the sign pattern, timing, or terminal cash flow and watch the NPV profile update.", "Check whether the project is conventional before relying on IRR."],
  };
  const row = notes[presetName] || notes.Custom;
  return { title: row[0], description: row[1], interpretation: row[2], takeaway: row[3], outcome };
}

function TeachingNotes({ compare, presetNameA, presetNameB, statsA, statsB, selectedRate, displayedIncrementalIrr }) {
  const noteA = presetTeachingNote(presetNameA, statsA, "Project A");
  const noteB = presetTeachingNote(presetNameB, statsB, "Project B");
  if (compare) {
    const crossover = displayedIncrementalIrr.value === null
      ? "no crossover rate in the search range"
      : pct.format(displayedIncrementalIrr.value) + (displayedIncrementalIrr.multiple ? " (multiple crossovers exist)" : "");
    return (
      <div className="notes">
        <p><strong>Project A:</strong> {noteA.description}</p>
        <p><strong>Project B:</strong> {noteB.description}</p>
        <p><strong>Outcome at r = {pct.format(selectedRate)}:</strong> NPV A is {formatCurrency(statsA.npv)}, NPV B is {formatCurrency(statsB.npv)}, so ΔNPV = A − B is {formatCurrency(statsA.npv - statsB.npv)}.</p>
        <p><strong>Incremental IRR:</strong> The crossover rate is {crossover}.</p>
        <p className="callout">For mutually exclusive projects, choose using ΔNPV at the appropriate cost of capital. Incremental IRR is a diagnostic for where the ranking changes.</p>
      </div>
    );
  }
  return (
    <div className="notes">
      <p><strong>{noteA.title}:</strong> {noteA.description}</p>
      <p>{noteA.interpretation}</p>
      <p><strong>Outcome at r = {pct.format(selectedRate)}:</strong> {noteA.outcome}</p>
      <p className="callout">{noteA.takeaway}</p>
    </div>
  );
}

const CSS = [
  "*{box-sizing:border-box}",
  "body{margin:0}",
  ".appShell{min-height:100vh;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
  ".container{width:min(1500px,calc(100vw - 16px));margin:0 auto;padding:8px 0 10px}",
  ".header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:8px}",
  ".eyebrow{margin:0 0 4px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}",
  "h1{margin:0;font-size:clamp(28px,3vw,38px);line-height:1.02;letter-spacing:-.04em}",
  ".subtitle{max-width:760px;margin:6px 0 0;color:#475569;font-size:14px;line-height:1.35}",
  ".actions{display:flex;gap:10px;flex-wrap:wrap}",
  "button,select{font:inherit}",
  "button{border:0;cursor:pointer}",
  ".btnPrimary,.btnSecondary{display:inline-flex;align-items:center;gap:8px;border-radius:14px;padding:8px 12px;font-size:13px;font-weight:700}",
  ".btnPrimary{background:#0f172a;color:white}",
  ".btnSecondary{background:white;color:#0f172a;border:1px solid #e2e8f0}",
  ".layout{display:grid;grid-template-columns:clamp(180px,15vw,210px) 1fr;gap:10px;align-items:start}",
  ".card,.metricCard{background:white;border:1px solid #e2e8f0;border-radius:26px;box-shadow:0 1px 2px rgba(15,23,42,.06)}",
  ".card{padding:8px}",
  ".mainPanel .card{height:max-content;align-self:start}",
  ".sectionTitle{margin:0 0 4px;font-size:15px;font-weight:800}",
  ".label{display:block;color:#334155;font-size:12px;font-weight:700;margin-bottom:5px}",
  "input,select{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:6px 8px;margin-top:4px;font-size:13px;color:#0f172a;background:white}",
  "input[type=range]{padding:0;border:0;margin-top:10px;accent-color:#0f172a}",
  ".rateRow{display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:end}",
  ".sliderLabels{display:flex;justify-content:space-between;color:#64748b;font-size:12px;margin:2px 0 8px}",
  ".toggleRow{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #e2e8f0;border-radius:12px;padding:7px 8px;margin-bottom:8px;background:#f8fafc;font-size:12px;font-weight:800}",
  ".toggleRow input{width:auto;margin:0}",
  ".projectEditor{border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px}",
  ".projectEditor:first-of-type{border-top:0;padding-top:0}",
  ".projectTitleRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}",
  ".cashFlowTitle{margin:0;font-size:14px;font-weight:800;display:inline-flex;align-items:center;gap:6px}",
  ".legendDot{width:10px;height:10px;border-radius:999px;display:inline-block}",
  ".blueDot{background:#2563eb}",
  ".redDot{background:#dc2626}",
  ".smallButton{display:inline-flex;align-items:center;background:#f1f5f9;color:#0f172a;border-radius:10px;padding:6px 7px;font-size:12px;font-weight:800}",
  ".customHint{margin:-3px 0 8px;color:#64748b;font-size:11px;line-height:1.3}",
  ".flowList{overflow:visible;padding-right:3px;display:grid;gap:6px}",
  ".flowRow{display:grid;grid-template-columns:42px 1fr 26px;gap:5px;align-items:center}",
  ".periodTag{background:#f1f5f9;border-radius:10px;padding:6px 3px;text-align:center;font-size:11px;font-weight:800}",
  ".deleteButton{border-radius:10px;padding:5px 0;background:white;color:#64748b}",
  ".deleteButton:disabled{opacity:.35;cursor:not-allowed}",
  ".mainPanel{display:grid;gap:8px;min-width:0;align-content:start;align-items:start}",
  ".mainPanel>*{width:100%;align-self:start}",
  ".metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;align-items:start;align-content:start}",
  ".metricCard{padding:7px 10px;border-radius:18px;height:max-content;align-self:start}",
  ".metricTitle{margin:0;color:#64748b;font-size:11px;font-weight:800}",
  ".metricValue{margin:3px 0 0;font-size:18px;line-height:1.05;font-weight:850;letter-spacing:-.03em;word-break:break-word}",
  ".metricMultiple{font-size:10px;font-weight:750;letter-spacing:0;color:#64748b;white-space:nowrap}",
  ".metricSub{margin:2px 0 0;color:#64748b;font-size:10px}",
  ".chartSub{color:#64748b;font-size:11px;margin:1px 0 0;line-height:1.15}",
  ".chartArea{position:relative;width:100%;padding-bottom:22px;margin-top:-4px;line-height:0}",
  ".chartArea svg,.timelineSvg{display:block;width:100%;height:auto}",
  ".mainChartCard{height:max-content;align-self:start;overflow:visible}",
  ".timelineSvg{max-height:220px}",
  ".axisInput{position:absolute;bottom:-2px;transform:translateX(-50%);z-index:2}",
  ".axisInputInlineLabel{display:flex;align-items:center;gap:6px;color:#334155;font-size:10px;font-weight:800;white-space:nowrap}",
  ".axisInputInlineLabel span{flex:0 0 auto}",
  ".axisInputInlineLabel input{width:56px;text-align:center;padding:4px 5px;margin-top:0;font-size:11px}",
  ".axisInputMin{transform:translateX(-38%)}",
  ".axisInputMax{transform:translateX(-62%)}",
  ".chartBg{fill:#fff}",
  ".gridLine{stroke:#e2e8f0;stroke-width:1}",
  ".faint{opacity:.55}",
  ".zeroAxisLine{stroke:#cbd5e1;stroke-width:1.35}",
  ".zeroLine{stroke:#0f172a;stroke-width:1.75}",
  ".selectedProjection{stroke:#64748b;stroke-width:1.45;stroke-dasharray:5 5}",
  ".projectBProjection{stroke:#ef4444;opacity:.72}",
  ".irrLine{stroke:#0f172a;stroke-width:1.25;stroke-dasharray:2 5;opacity:.72}",
  ".projectBIrrLine{stroke:#dc2626}",
  ".mainLine{fill:none;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}",
  ".dashedLine{stroke-dasharray:8 6;opacity:.85}",
  ".projectAStroke{stroke:#2563eb}",
  ".projectBStroke{stroke:#dc2626}",
  ".selectedDot,.pointDot,.irrDot{fill:#2563eb;stroke:#fff;stroke-width:2}",
  ".selectedDotB,.pointDotB,.irrDotB{fill:#dc2626;stroke:#fff;stroke-width:2}",
  ".axisText{fill:#64748b;font-size:11px}",
  ".axisText.strong{fill:#0f172a;font-weight:800}",
  ".axisTitle{fill:#475569;font-size:12px;font-weight:800}",
  ".selectedLabel,.irrText{fill:#334155;font-size:11px;font-weight:700}",
  ".selectedLabel.strong,.irrText.strong{fill:#0f172a;font-weight:850}",
  ".projectBText{fill:#991b1b}",
  ".lowerGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start;align-content:start}",
  ".timelineStack{display:grid;gap:8px;align-items:start;align-content:start}",
  ".notes{display:grid;gap:8px;color:#334155;font-size:12px;line-height:1.35}",
  ".notes p{margin:0}",
  ".callout{background:#f8fafc;border-radius:14px;padding:9px;color:#0f172a;font-weight:800}",
  "@media(max-height:850px){.subtitle{display:none}.card{padding:7px}.metricCard{padding:6px 9px}.metricValue{font-size:17px}.metricSub{font-size:9px}.timelineSvg{max-height:190px}.chartArea{padding-bottom:20px}.chartSub{display:none}}",
  "@media(max-width:1050px){.layout{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.lowerGrid{grid-template-columns:1fr}}",
  "@media(max-width:700px){.container{width:min(100vw - 20px,1240px);padding-top:18px}.header{align-items:stretch;flex-direction:column}.metrics{grid-template-columns:1fr}.rateRow{grid-template-columns:1fr}.layout{gap:12px}}",
].join("\n");

export default function App() {
  const [presetNameA, setPresetNameA] = useState("Base");
  const [presetNameB, setPresetNameB] = useState("Long-lived project");
  const [cashFlowsA, setCashFlowsA] = useState(presets.Base);
  const [cashFlowsB, setCashFlowsB] = useState(presets["Long-lived project"]);
  const [compare, setCompare] = useState(false);
  const [discountRate, setDiscountRate] = useState(0.08);
  const [minRate, setMinRate] = useState(0);
  const [maxRate, setMaxRate] = useState(0.4);

  const cleanFlowsA = useMemo(() => cashFlowsA.map((x) => safeNumber(x)), [cashFlowsA]);
  const cleanFlowsB = useMemo(() => cashFlowsB.map((x) => safeNumber(x)), [cashFlowsB]);
  const sliderMin = Math.max(-0.95, Math.round(safeNumber(minRate, -0.2) * 10) / 10);
  const sliderMax = Math.max(sliderMin + 0.1, Math.round(safeNumber(maxRate, 0.5) * 10) / 10);
  const selectedRate = clamp(safeNumber(discountRate, 0.1), sliderMin, sliderMax);
  const chartDataA = useMemo(() => makeNpvData(cleanFlowsA, minRate, maxRate), [cleanFlowsA, minRate, maxRate]);
  const chartDataB = useMemo(() => makeNpvData(cleanFlowsB, minRate, maxRate), [cleanFlowsB, minRate, maxRate]);
  const statsA = useMemo(() => makeStats(cleanFlowsA, selectedRate), [cleanFlowsA, selectedRate]);
  const statsB = useMemo(() => makeStats(cleanFlowsB, selectedRate), [cleanFlowsB, selectedRate]);
  const pvFlowsA = useMemo(() => presentValueCashFlows(cleanFlowsA, selectedRate), [cleanFlowsA, selectedRate]);
  const pvFlowsB = useMemo(() => presentValueCashFlows(cleanFlowsB, selectedRate), [cleanFlowsB, selectedRate]);
  const incrementalIrrs = useMemo(() => findIrrs(incrementalCashFlows(cleanFlowsA, cleanFlowsB)), [cleanFlowsA, cleanFlowsB]);
  const displayedIncrementalIrr = useMemo(() => pickDisplayedIncrementalIrr(incrementalIrrs), [incrementalIrrs]);

  function selectPresetA(name) {
    setPresetNameA(name);
    if (name !== "Custom") setCashFlowsA(presets[name]);
  }

  function selectPresetB(name) {
    setPresetNameB(name);
    if (name !== "Custom") setCashFlowsB(presets[name]);
  }

  function updateFlowA(index, value) {
    setPresetNameA("Custom");
    setCashFlowsA((old) => old.map((x, i) => (i === index ? value : x)));
  }

  function updateFlowB(index, value) {
    setPresetNameB("Custom");
    setCashFlowsB((old) => old.map((x, i) => (i === index ? value : x)));
  }

  function addFlowA() {
    setPresetNameA("Custom");
    setCashFlowsA((old) => [...old, ""]);
  }

  function addFlowB() {
    setPresetNameB("Custom");
    setCashFlowsB((old) => [...old, ""]);
  }

  function removeFlowA(index) {
    setPresetNameA("Custom");
    setCashFlowsA((old) => (old.length <= 1 ? old : old.filter((_, i) => i !== index)));
  }

  function removeFlowB(index) {
    setPresetNameB("Custom");
    setCashFlowsB((old) => (old.length <= 1 ? old : old.filter((_, i) => i !== index)));
  }

  function reset() {
    setPresetNameA("Base");
    setPresetNameB("Long-lived project");
    setCashFlowsA(presets.Base);
    setCashFlowsB(presets["Long-lived project"]);
    setCompare(false);
    setDiscountRate(0.08);
    setMinRate(0);
    setMaxRate(0.4);
  }

  return (
    <main className="appShell">
      <style>{CSS}</style>
      <div className="container">
        <header className="header">
          <div>
            <p className="eyebrow">BERK-DEMARZO CORPORATE FINANCE VISUALIZER</p>
            <h1>NPV Profile Explorer</h1>
            <p className="subtitle">Enter project cash flows, vary the discount rate, and compare NPV profiles across projects.</p>
          </div>
          <div className="actions">
            <button className="btnSecondary" onClick={reset}>↺ Reset</button>
          </div>
        </header>

        <section className="layout">
          <aside className="card inputsCard">
            <h2 className="sectionTitle">Inputs</h2>
            <div className="rateRow">
              <label className="label">
                Selected discount rate
                <input type="range" min={sliderMin} max={sliderMax} step="0.001" value={selectedRate} onChange={(e) => setDiscountRate(safeNumber(e.target.value, 0.1))} />
              </label>
              <label className="label">
                r (%)
                <input type="number" step="0.1" value={(selectedRate * 100).toFixed(1)} onChange={(e) => setDiscountRate(safeNumber(e.target.value, 10) / 100)} />
              </label>
            </div>
            <div className="sliderLabels"><span>{pct.format(sliderMin)}</span><strong>{pct.format(selectedRate)}</strong><span>{pct.format(sliderMax)}</span></div>
            <label className="toggleRow"><span>Compare two projects</span><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /></label>
            <CashFlowEditor projectName="Project A" colorClass="blueDot" presetName={presetNameA} cashFlows={cashFlowsA} onPresetChange={selectPresetA} onFlowChange={updateFlowA} onAddYear={addFlowA} onRemoveYear={removeFlowA} />
            {compare && <CashFlowEditor projectName="Project B" colorClass="redDot" presetName={presetNameB} cashFlows={cashFlowsB} onPresetChange={selectPresetB} onFlowChange={updateFlowB} onAddYear={addFlowB} onRemoveYear={removeFlowB} />}
          </aside>

          <section className="mainPanel">
            <div className="metrics">
              <Metric title="NPV A" value={formatCurrency(statsA.npv)} sub={"r = " + pct.format(selectedRate)} />
              <Metric title={compare ? "NPV B" : "IRR A"} value={compare ? formatCurrency(statsB.npv) : (statsA.irrs.length ? statsA.irrs.map((r) => pct.format(r)).join(", ") : "None")} sub={compare ? "r = " + pct.format(selectedRate) : "Search range: -95% to 200%"} />
              <Metric title={compare ? "Δ NPV: A − B" : "Multiple of Money"} value={compare ? formatCurrency(statsA.npv - statsB.npv) : formatMultiple(statsA.multiple)} sub={compare ? "At selected rate" : "Cash Returned / Cash Invested"} />
              <Metric title={compare ? "Incremental IRR" : "Duration A"} value={compare ? (displayedIncrementalIrr.value === null ? "None" : pct.format(displayedIncrementalIrr.value)) : formatPercent(statsA.duration)} multiple={compare && displayedIncrementalIrr.multiple && displayedIncrementalIrr.value !== null} sub={compare ? "Crossover rate where NPV A = NPV B" : "% decline in NPV per 1% rate increase"} />
            </div>

            <div className="card mainChartCard">
              <h2 className="sectionTitle">NPV profile</h2>
              {chartDataA.length ? <NpvChart dataA={chartDataA} dataB={chartDataB} compare={compare} selectedRate={selectedRate} statsA={statsA} statsB={statsB} minRate={minRate} maxRate={maxRate} setMinRate={setMinRate} setMaxRate={setMaxRate} /> : <p className="chartSub">Use a minimum rate greater than -100% and below the maximum rate.</p>}
            </div>

            <div className="lowerGrid">
              <div className="timelineStack">
                <div className="card"><h2 className="sectionTitle">Cash-flow & PV timeline</h2><p className="chartSub">Solid = cash flows; dashed = present values at r = {pct.format(selectedRate)}</p><TimelineChart cashFlowsA={cleanFlowsA} pvFlowsA={pvFlowsA} cashFlowsB={compare ? cleanFlowsB : null} pvFlowsB={compare ? pvFlowsB : null} /></div>
              </div>
              <div className="card"><h2 className="sectionTitle">Teaching notes</h2><TeachingNotes compare={compare} presetNameA={presetNameA} presetNameB={presetNameB} statsA={statsA} statsB={statsB} selectedRate={selectedRate} displayedIncrementalIrr={displayedIncrementalIrr} /></div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
