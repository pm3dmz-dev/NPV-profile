
import React, { useMemo, useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const presets = {
  Base: [-1000, 300, 350, 400, 450, 500],
  "Long-lived project": [-2500, 250, 350, 475, 600, 700, 800, 900],
  "Non-conventional": [-1000, 2300, -1320],
  NetPhone: [-33.8, 11.6, 17.6, 17.6, 17.6, 6.0],
  "Deferred Maintenance": [10, 10, 10, 10, 10, -124],
  Mining: [-700, 500, 500, 500, 500, -1392],
  "Advance Payment": [100, -80, -50, -50, -30, 160],
};

const n = (x, d = 0) => Number.isFinite(Number(x)) ? Number(x) : d;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fmtMoney = (x) => Number.isFinite(x) ? money.format(x) : "—";
const fmtPct = (x) => Number.isFinite(x) ? pct.format(x) : "—";
const fmtMoM = (x) => Number.isFinite(x) ? `${x.toFixed(2)}x` : "—";

function npv(cfs, r) {
  if (!Number.isFinite(r) || r <= -1) return NaN;
  return cfs.reduce((s, cf, t) => s + n(cf) / (1 + r) ** t, 0);
}
function dnpv(cfs, r) {
  if (!Number.isFinite(r) || r <= -1) return NaN;
  return cfs.reduce((s, cf, t) => t === 0 ? s : s - t * n(cf) / (1 + r) ** (t + 1), 0);
}
function mom(cfs) {
  const invested = Math.abs(cfs.filter(x => n(x) < 0).reduce((s, x) => s + n(x), 0));
  const returned = cfs.filter(x => n(x) > 0).reduce((s, x) => s + n(x), 0);
  return invested ? returned / invested : NaN;
}
function bisect(cfs, a, b) {
  let fa = npv(cfs, a), fb = npv(cfs, b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null;
  let lo = a, hi = b;
  for (let i = 0; i < 90; i++) {
    const m = (lo + hi) / 2, fm = npv(cfs, m);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-7) return m;
    if (fa * fm <= 0) hi = m; else { lo = m; fa = fm; }
  }
  return (lo + hi) / 2;
}
function irrs(cfs, lo = -0.95, hi = 2) {
  const out = [];
  const steps = 1400;
  let pr = lo, pv = npv(cfs, pr);
  for (let i = 1; i <= steps; i++) {
    const r = lo + (hi - lo) * i / steps, v = npv(cfs, r);
    if (Number.isFinite(pv) && Number.isFinite(v) && pv * v < 0) {
      const root = bisect(cfs, pr, r);
      if (root !== null && !out.some(x => Math.abs(x - root) < 1e-4)) out.push(root);
    }
    pr = r; pv = v;
  }
  return out;
}
function chooseIrr(xs) {
  if (!xs.length) return { value: null, multiple: false };
  if (xs.length === 1) return { value: xs[0], multiple: false };
  const pos = xs.filter(x => x > 0).sort((a, b) => a - b);
  return { value: pos.length ? pos[0] : [...xs].sort((a, b) => Math.abs(a) - Math.abs(b))[0], multiple: true };
}
function niceStep(raw) {
  const e = Math.floor(Math.log10(Math.max(raw, 1e-9))), b = 10 ** e, f = raw / b;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * b;
}
function ticks(lo, hi, count = 6, zero = true, fixed = null) {
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) hi = lo + 1;
  const step = fixed ?? niceStep((hi - lo) / Math.max(1, count - 1));
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, arr = [];
  for (let x = a; x <= b + step / 2; x += step) arr.push(Math.abs(x) < step * 1e-9 ? 0 : x);
  return { arr, lo: arr[0], hi: arr[arr.length - 1], step };
}
function path(data, xk, yk, W, H, p, dom) {
  const sx = x => p.l + (x - dom.x0) / (dom.x1 - dom.x0 || 1) * (W - p.l - p.r);
  const sy = y => H - p.b - (y - dom.y0) / (dom.y1 - dom.y0 || 1) * (H - p.t - p.b);
  return { sx, sy, d: data.map((o, i) => `${i ? "L" : "M"}${sx(o[xk]).toFixed(2)},${sy(o[yk]).toFixed(2)}`).join(" ") };
}
function chartData(cfs, minR, maxR) {
  const lo = Math.max(-.9, Math.round(n(minR, -.2) * 10) / 10);
  const hi = Math.round(n(maxR, .5) * 10) / 10;
  if (lo >= hi) return [];
  const steps = Math.max(260, Math.min(1000, Math.ceil(Math.abs(hi - lo) / .001)));
  return Array.from({ length: steps }, (_, i) => {
    const r = lo + (hi - lo) * i / (steps - 1);
    return { r, rp: r * 100, v: npv(cfs, r) };
  });
}
function stats(cfs, r) {
  const v = npv(cfs, r), dv = dnpv(cfs, r);
  return { npv: v, irrs: irrs(cfs), mom: mom(cfs), duration: v ? -(dv / Math.abs(v)) * .01 : NaN };
}
function pvFlows(cfs, r) { return cfs.map((cf, t) => n(cf) / (1 + r) ** t); }
function incremental(a, b) {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => n(a[i]) - n(b[i]));
}
function irrText(xs) {
  if (!xs.length) return "no IRR";
  if (xs.length === 1) return pct.format(xs[0]);
  return `${xs.map(x => pct.format(x)).join(", ")} — multiple IRRs`;
}
function note(name, s, label) {
  const outcome = `${label} currently has NPV ${fmtMoney(s.npv)}, IRR ${irrText(s.irrs)}, and Multiple of Money ${fmtMoM(s.mom)}.`;
  const map = {
    Base: ["Base project", "A standard investment example: a large up-front cash investment followed by operating cash returns.", "This is the cleanest case for comparing NPV and IRR: the NPV profile is downward sloping and the IRR is unique.", "For conventional investments, IRR is a useful summary, but NPV remains the value criterion."],
    "Long-lived project": ["Long-lived project", "A larger, longer-duration investment with cash flows spread farther into the future.", "Because value arrives later, the project is more sensitive to the discount rate.", "Long-horizon projects can look attractive on cash returned, but value depends strongly on the opportunity cost of capital."],
    "Non-conventional": ["Non-conventional cash flows", "A project with more than one sign change: an initial outflow, a large inflow, then a later outflow.", "The NPV profile can cross zero more than once, so IRR is not a single clean hurdle rate.", "When signs change more than once, focus on NPV at the relevant cost of capital."],
    NetPhone: ["NetPhone", "A product-launch example with an initial launch cost, operating cash flows, and a smaller terminal cash flow.", "This behaves like a conventional project; the PV timeline shows which years contribute most to value.", "Timing and discount rates matter even when total cash returned is positive."],
    "Deferred Maintenance": ["Deferred Maintenance", "A cost-deferral example: small early benefits followed by a large later cash outflow.", "This can resemble borrowing from the future; higher discount rates reduce the weight on the later cost.", "Ask whether the project creates value or merely shifts costs into the future."],
    Mining: ["Mining", "A resource-extraction project with initial investment, interim operating cash flows, and a terminal cleanup liability.", "The terminal liability creates non-conventional cash-flow behavior.", "Long-dated liabilities should be modeled explicitly; use the full NPV profile."],
    "Advance Payment": ["Advance Payment", "A financing-like project: cash is received at the start, followed by later obligations and a terminal inflow.", "Positive cash at date 0 is not the same as value creation.", "Use NPV to put early receipts and future obligations on the same present-value basis."],
    Custom: ["Custom project", "A user-defined cash-flow stream. Use + Cash flow to add periods and edit values directly.", "Change the sign pattern, timing, or terminal cash flow and watch the NPV profile update.", "Check whether the project is conventional before relying on IRR."],
  };
  const x = map[name] ?? map.Custom;
  return { title: x[0], desc: x[1], interp: x[2], takeaway: x[3], outcome };
}

function Metric({ title, value, sub, multiple }) {
  return <div className="metric"><p>{title}</p><h3>{value}{multiple && <span> (multiple)</span>}</h3><small>{sub}</small></div>;
}
function Editor({ name, color, preset, cfs, setPreset, setCfs }) {
  const update = (i, v) => { setPreset("Custom"); setCfs(old => old.map((x, j) => i === j ? v : x)); };
  const select = (v) => { setPreset(v); if (v !== "Custom") setCfs(presets[v]); };
  return <div className="editor">
    <div className="editorTop"><b><i className={color}></i>{name}</b><button onClick={() => { setPreset("Custom"); setCfs(old => [...old, ""]); }}>+ Cash flow</button></div>
    <label>Preset<select value={preset} onChange={e => select(e.target.value)}>{Object.keys(presets).map(k => <option key={k}>{k}</option>)}<option>Custom</option></select></label>
    {preset === "Custom" && <em>Use + Cash flow to extend the project, then edit each period.</em>}
    <div className="flows">{cfs.map((cf, i) => <div className="flow" key={i}><span>t={i}</span><input type="number" value={cf} onChange={e => update(i, e.target.value)} /><button disabled={cfs.length <= 1} onClick={() => { setPreset("Custom"); setCfs(old => old.filter((_, j) => j !== i)); }}>×</button></div>)}</div>
  </div>;
}

function NpvChart({ a, b, compare, r, va, vb, ira, irb, minR, maxR, setMinR, setMaxR }) {
  const W = 880, H = 430, p = { t: 30, r: 44, b: 58, l: 100 };
  const all = compare ? [...a, ...b] : a, ys = all.map(x => x.v);
  const xt = ticks(minR * 100, maxR * 100, 7, true, 10), yt = ticks(Math.min(...ys, 0), Math.max(...ys, 0), 7, true);
  const dom = { x0: xt.lo, x1: xt.hi, y0: yt.lo, y1: yt.hi };
  const A = path(a, "rp", "v", W, H, p, dom), B = path(b, "rp", "v", W, H, p, dom);
  const zeroY = A.sy(0), zeroX = A.sx(0), x = A.sx(clamp(r * 100, xt.lo, xt.hi));
  const ya = A.sy(clamp(va, yt.lo, yt.hi)), yb = A.sy(clamp(vb, yt.lo, yt.hi));
  const close = compare && Math.abs(ya - yb) < 52, bAbove = yb < ya;
  const labelX = clamp(x, p.l + 58, W - p.r - 58);
  const yaLab = clamp(ya + (close && bAbove ? 18 : -30), p.t + 16, H - p.b - 34);
  const ybLab = clamp(yb + (close && !bAbove ? 18 : -30), p.t + 16, H - p.b - 34);
  return <div className="chartArea"><svg viewBox={`0 0 ${W} ${H}`}>
    <rect width={W} height={H} rx="22" fill="white" />
    {yt.arr.map(t => <g key={`y${t}`}><line x1={p.l} x2={W-p.r} y1={A.sy(t)} y2={A.sy(t)} className="grid"/><text x={p.l-12} y={A.sy(t)+4} textAnchor="end" className={t===0?"axis strong":"axis"}>{money.format(t)}</text></g>)}
    {xt.arr.map(t => <g key={`x${t}`}><line x1={A.sx(t)} x2={A.sx(t)} y1={p.t} y2={H-p.b} className={t===0?"xzero":"grid faint"}/><text x={A.sx(t)} y={H-24} textAnchor="middle" className={t===0?"axis strong":"axis"}>{t.toFixed(0)}%</text></g>)}
    <line x1={p.l} x2={W-p.r} y1={zeroY} y2={zeroY} className="zero"/><line x1={zeroX} x2={zeroX} y1={p.t} y2={H-p.b} className="zero"/>
    <path d={A.d} className="line blue"/>{compare && <path d={B.d} className="line red"/>}
    {compare && Number.isFinite(vb) && <><line x1={x} x2={x} y1={yb} y2={H-p.b} className="dash redDash"/><line x1={Math.min(zeroX,x)} x2={Math.max(zeroX,x)} y1={yb} y2={yb} className="dash redDash"/><circle cx={x} cy={yb} r="5.5" className="dotRed"/><text x={labelX} y={ybLab} textAnchor="middle" className="label redText">NPV B</text><text x={labelX} y={ybLab+15} textAnchor="middle" className="label strong redText">{fmtMoney(vb)}</text></>}
    <line x1={x} x2={x} y1={ya} y2={H-p.b} className="dash"/><line x1={Math.min(zeroX,x)} x2={Math.max(zeroX,x)} y1={ya} y2={ya} className="dash"/><circle cx={x} cy={ya} r="6" className="dotBlue"/>
    <text x={labelX} y={yaLab} textAnchor="middle" className="label">NPV A</text><text x={labelX} y={yaLab+15} textAnchor="middle" className="label strong">{fmtMoney(va)}</text>
    <text x={x} y={H-p.b+18} textAnchor="middle" className="label">r</text><text x={x} y={H-p.b+33} textAnchor="middle" className="label strong">{pct.format(r)}</text>
    {ira.filter(q => q*100 >= xt.lo && q*100 <= xt.hi).map((q,i) => <g key={`ia${i}`}><line x1={A.sx(q*100)} x2={A.sx(q*100)} y1={p.t} y2={H-p.b} className="irr"/><circle cx={A.sx(q*100)} cy={zeroY} r="5" className="dotBlue"/><text x={clamp(A.sx(q*100),p.l+32,W-p.r-32)} y={zeroY-22} textAnchor="middle" className="label">IRR A</text><text x={clamp(A.sx(q*100),p.l+32,W-p.r-32)} y={zeroY-7} textAnchor="middle" className="label strong">{pct.format(q)}</text></g>)}
    {compare && irb.filter(q => q*100 >= xt.lo && q*100 <= xt.hi).map((q,i) => <g key={`ib${i}`}><line x1={A.sx(q*100)} x2={A.sx(q*100)} y1={p.t} y2={H-p.b} className="irr redIrr"/><circle cx={A.sx(q*100)} cy={zeroY} r="5" className="dotRed"/><text x={clamp(A.sx(q*100),p.l+34,W-p.r-34)} y={zeroY+18} textAnchor="middle" className="label redText">IRR B</text><text x={clamp(A.sx(q*100),p.l+34,W-p.r-34)} y={zeroY+33} textAnchor="middle" className="label strong redText">{pct.format(q)}</text></g>)}
    <text x={(p.l+W-p.r)/2} y={H-6} textAnchor="middle" className="title">Discount rate</text><text x="18" y={H/2} transform={`rotate(-90 18 ${H/2})`} textAnchor="middle" className="title">NPV</text>
  </svg><div className="minmax left" style={{left:`${p.l/W*100}%`}}><label>Min<input type="number" step="0.1" value={minR} onChange={e=>setMinR(Math.round(n(e.target.value,-.2)*10)/10)} /></label></div><div className="minmax" style={{left:`${(W-p.r)/W*100}%`}}><label>Max<input type="number" step="0.1" value={maxR} onChange={e=>setMaxR(Math.round(n(e.target.value,.5)*10)/10)} /></label></div></div>;
}
function Timeline({ a, b }) {
  const W=640,H=270,p={t:24,r:32,b:44,l:84};
  const da=a.map((cf,t)=>({t,v:n(cf)})), db=b?b.map((cf,t)=>({t,v:n(cf)})):[];
  const all=b?[...a,...b]:a, yt=ticks(Math.min(...all.map(n),0), Math.max(...all.map(n),0),5,true);
  const xt=ticks(0,Math.max(a.length-1,b?b.length-1:1,1),6,true);
  const dom={x0:xt.lo,x1:xt.hi,y0:yt.lo,y1:yt.hi}, A=path(da,"t","v",W,H,p,dom), B=path(db,"t","v",W,H,p,dom), zero=A.sy(0);
  return <svg className="timeline" viewBox={`0 0 ${W} ${H}`}><rect width={W} height={H} rx="22" fill="white"/>{yt.arr.map(t=><g key={t}><line x1={p.l} x2={W-p.r} y1={A.sy(t)} y2={A.sy(t)} className="grid"/><text x={p.l-10} y={A.sy(t)+4} textAnchor="end" className="axis">{money.format(t)}</text></g>)}<line x1={p.l} x2={W-p.r} y1={zero} y2={zero} className="zero"/><path d={A.d} className="line blue"/>{b&&<path d={B.d} className="line red"/>}{da.map(d=><circle key={`a${d.t}`} cx={A.sx(d.t)} cy={A.sy(d.v)} r="4" className="dotBlue"/>)}{b&&db.map(d=><circle key={`b${d.t}`} cx={A.sx(d.t)} cy={A.sy(d.v)} r="4" className="dotRed"/>)}<text x={(p.l+W-p.r)/2} y={H-10} textAnchor="middle" className="title">Period</text></svg>;
}
function Notes({ compare, pa, pb, sa, sb, r, inc }) {
  const A = note(pa, sa, "Project A"), B = note(pb, sb, "Project B");
  if (compare) {
    const cx = inc.value === null ? "no crossover rate in the search range" : `${pct.format(inc.value)}${inc.multiple ? " (multiple crossovers exist)" : ""}`;
    return <div className="notes"><p><b>Project A:</b> {A.desc}</p><p><b>Project B:</b> {B.desc}</p><p><b>Outcome at r = {pct.format(r)}:</b> NPV A is {fmtMoney(sa.npv)}, NPV B is {fmtMoney(sb.npv)}, so ΔNPV = A − B is {fmtMoney(sa.npv-sb.npv)}.</p><p><b>Incremental IRR:</b> The crossover rate is {cx}.</p><p className="callout">For mutually exclusive projects, choose using ΔNPV at the appropriate cost of capital.</p></div>;
  }
  return <div className="notes"><p><b>{A.title}:</b> {A.desc}</p><p>{A.interp}</p><p><b>Outcome at r = {pct.format(r)}:</b> {A.outcome}</p><p className="callout">{A.takeaway}</p></div>;
}

export default function App() {
  const [pa,setPa]=useState("Base"), [pb,setPb]=useState("Long-lived project");
  const [ca,setCa]=useState(presets.Base), [cb,setCb]=useState(presets["Long-lived project"]);
  const [compare,setCompare]=useState(false), [r,setR]=useState(.1), [minR,setMinR]=useState(-.2), [maxR,setMaxR]=useState(.5);
  const a=useMemo(()=>ca.map(x=>n(x)),[ca]), b=useMemo(()=>cb.map(x=>n(x)),[cb]);
  const sliderMin=Math.max(-.95,Math.round(n(minR,-.2)*10)/10), sliderMax=Math.max(sliderMin+.1,Math.round(n(maxR,.5)*10)/10), rr=clamp(n(r,.1),sliderMin,sliderMax);
  const da=useMemo(()=>chartData(a,minR,maxR),[a,minR,maxR]), db=useMemo(()=>chartData(b,minR,maxR),[b,minR,maxR]);
  const sa=useMemo(()=>stats(a,rr),[a,rr]), sb=useMemo(()=>stats(b,rr),[b,rr]);
  const inc=useMemo(()=>chooseIrr(irrs(incremental(a,b))),[a,b]);
  const pva=useMemo(()=>pvFlows(a,rr),[a,rr]), pvb=useMemo(()=>pvFlows(b,rr),[b,rr]);
  const reset=()=>{setPa("Base");setPb("Long-lived project");setCa(presets.Base);setCb(presets["Long-lived project"]);setCompare(false);setR(.1);setMinR(-.2);setMaxR(.5);};
  const csv=()=>{const rows=[["Project","Period","Cash Flow"],...a.map((x,i)=>["A",i,x]),...(compare?b.map((x,i)=>["B",i,x]):[])]; const blob=new Blob([rows.map(row=>row.join(",")).join("\n")],{type:"text/csv"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=compare?"npv-cash-flows-comparison.csv":"npv-cash-flows.csv"; link.click(); URL.revokeObjectURL(url);};
  return <main><style>{css}</style><div className="container">
    <header><div><p className="eyebrow">BERK-DEMARZO CORPORATE FINANCE VISUALIZER</p><h1>NPV Profile Explorer</h1><p className="sub">Enter project cash flows, vary the discount rate, and compare NPV profiles across projects.</p></div><div className="actions"><button onClick={reset}>↺ Reset</button><button className="primary" onClick={csv}>⇩ CSV</button></div></header>
    <section className="layout"><aside className="card inputs"><h2>Inputs</h2><div className="rate"><label>Selected discount rate<input type="range" min={sliderMin} max={sliderMax} step=".001" value={rr} onChange={e=>setR(n(e.target.value,.1))}/></label><label>r<input type="number" step=".001" value={rr.toFixed(3)} onChange={e=>setR(n(e.target.value,.1))}/></label></div><div className="slider"><span>{pct.format(sliderMin)}</span><b>{pct.format(rr)}</b><span>{pct.format(sliderMax)}</span></div><label className="toggle"><span>Compare two projects</span><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/></label><Editor name="Project A" color="blueDot" preset={pa} cfs={ca} setPreset={setPa} setCfs={setCa}/>{compare&&<Editor name="Project B" color="redDot" preset={pb} cfs={cb} setPreset={setPb} setCfs={setCb}/>}</aside>
    <section className="main"><div className="metrics"><Metric title="NPV A" value={fmtMoney(sa.npv)} sub={`r = ${pct.format(rr)}`}/><Metric title={compare?"NPV B":"IRR A"} value={compare?fmtMoney(sb.npv):(sa.irrs.length?sa.irrs.map(x=>pct.format(x)).join(", "):"None")} sub={compare?`r = ${pct.format(rr)}`:"Search range: -95% to 200%"}/><Metric title={compare?"Δ NPV: A − B":"Multiple of Money"} value={compare?fmtMoney(sa.npv-sb.npv):fmtMoM(sa.mom)} sub={compare?"At selected rate":"Cash Returned / Cash Invested"}/><Metric title={compare?"Incremental IRR":"Duration A"} value={compare?(inc.value===null?"None":pct.format(inc.value)):fmtPct(sa.duration)} multiple={compare&&inc.multiple&&inc.value!==null} sub={compare?"Crossover rate where NPV A = NPV B":"% decline in NPV per 1% rate increase"}/></div>
    <div className="card"><h2>NPV profile</h2><p className="chartSub">The selected rate projects to Project A’s NPV on the y-axis. Project B is shown in red when comparison is on.</p>{da.length&&<NpvChart a={da} b={db} compare={compare} r={rr} va={sa.npv} vb={sb.npv} ira={sa.irrs} irb={sb.irrs} minR={minR} maxR={maxR} setMinR={setMinR} setMaxR={setMaxR}/>}</div>
    <div className="lower"><div className="stack"><div className="card"><h2>Cash-flow timeline</h2><Timeline a={a} b={compare?b:null}/></div><div className="card"><h2>PV timeline</h2><p className="chartSub">Present value of each period’s cash flow at r = {pct.format(rr)}</p><Timeline a={pva} b={compare?pvb:null}/></div></div><div className="card"><h2>Teaching notes</h2><Notes compare={compare} pa={pa} pb={pb} sa={sa} sb={sb} r={rr} inc={inc}/></div></div></section></section></div></main>;
}

const css = `
*{box-sizing:border-box} body{margin:0} main{min-height:100vh;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.container{width:min(1500px,calc(100vw - 20px));margin:0 auto;padding:16px 0 28px}header{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:22px}.eyebrow{margin:0 0 8px;color:#64748b;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:clamp(30px,4vw,46px);line-height:1.02;letter-spacing:-.04em}.sub{max-width:760px;margin:10px 0 0;color:#475569;font-size:16px;line-height:1.55}.actions{display:flex;gap:10px;flex-wrap:wrap}button,select{font:inherit}button{border:0;cursor:pointer;border-radius:16px;padding:10px 14px;font-size:14px;font-weight:700;background:white;border:1px solid #e2e8f0}.primary{background:#0f172a;color:white}.layout{display:grid;grid-template-columns:clamp(190px,16vw,220px) 1fr;gap:14px}.card,.metric{background:white;border:1px solid #e2e8f0;border-radius:26px;box-shadow:0 1px 2px rgba(15,23,42,.06)}.card{padding:14px}.inputs h2,.card h2{margin:0 0 8px;font-size:17px;font-weight:800}.rate{display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:end}label{display:block;color:#334155;font-size:12px;font-weight:700;margin-bottom:5px}input,select{width:100%;border:1px solid #e2e8f0;border-radius:11px;padding:7px 8px;margin-top:5px;font-size:13px;color:#0f172a;background:white}input[type=range]{padding:0;border:0;margin-top:10px;accent-color:#0f172a}.slider{display:flex;justify-content:space-between;color:#64748b;font-size:12px;margin:2px 0 12px}.toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #e2e8f0;border-radius:14px;padding:8px 9px;margin-bottom:10px;background:#f8fafc}.toggle input{width:auto;margin:0}.editor{border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px}.editorTop{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.editorTop b{font-size:14px;display:inline-flex;align-items:center;gap:6px}.editorTop button{font-size:12px;padding:6px 7px;border-radius:10px;background:#f1f5f9}.blueDot,.redDot{width:10px;height:10px;border-radius:999px;display:inline-block}.blueDot{background:#2563eb}.redDot{background:#dc2626}.editor em{display:block;margin:-3px 0 8px;color:#64748b;font-size:11px;line-height:1.3}.flows{max-height:230px;overflow:auto;padding-right:3px;display:grid;gap:8px}.flow{display:grid;grid-template-columns:42px 1fr 26px;gap:5px;align-items:center}.flow span{background:#f1f5f9;border-radius:10px;padding:8px 3px;text-align:center;font-size:11px;font-weight:800}.flow button{border-radius:10px;padding:7px 0;background:white;color:#64748b}.flow button:disabled{opacity:.35;cursor:not-allowed}.main{display:grid;gap:12px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric{padding:16px}.metric p{margin:0;color:#64748b;font-size:13px;font-weight:800}.metric h3{margin:8px 0 0;font-size:24px;line-height:1.15;font-weight:850;letter-spacing:-.03em;word-break:break-word}.metric h3 span{font-size:13px;font-weight:750;letter-spacing:0;color:#64748b;white-space:nowrap}.metric small{display:block;margin-top:6px;color:#64748b;font-size:12px}.chartSub{color:#64748b;font-size:13px;margin:4px 0 0;line-height:1.45}.chartArea{position:relative;width:100%;padding-bottom:58px}.chartArea svg,.timeline{display:block;width:100%;height:auto}.timeline{max-height:280px}.minmax{position:absolute;bottom:0;width:92px;transform:translateX(-50%);z-index:2}.minmax label{display:block;text-align:center;color:#334155;font-size:12px;font-weight:800}.minmax input{text-align:center}.grid{stroke:#e2e8f0;stroke-width:1}.faint{opacity:.55}.xzero{stroke:#cbd5e1;stroke-width:1.35}.zero{stroke:#0f172a;stroke-width:1.75}.dash{stroke:#64748b;stroke-width:1.45;stroke-dasharray:5 5}.redDash{stroke:#ef4444;opacity:.72}.irr{stroke:#0f172a;stroke-width:1.25;stroke-dasharray:2 5;opacity:.72}.redIrr{stroke:#dc2626}.line{fill:none;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}.blue{stroke:#2563eb}.red{stroke:#dc2626}.dotBlue{fill:#2563eb;stroke:#fff;stroke-width:2}.dotRed{fill:#dc2626;stroke:#fff;stroke-width:2}.axis{fill:#64748b;font-size:12px}.strong{font-weight:850;fill:#0f172a}.title{fill:#475569;font-size:13px;font-weight:800}.label{fill:#334155;font-size:12px;font-weight:700}.redText{fill:#991b1b}.lower{display:grid;grid-template-columns:1fr 1fr;gap:12px}.stack{display:grid;gap:12px}.notes{display:grid;gap:12px;color:#334155;font-size:14px;line-height:1.55}.notes p{margin:0}.callout{background:#f8fafc;border-radius:18px;padding:13px;color:#0f172a;font-weight:800}@media(max-height:850px){.card{padding:12px}.metric{padding:13px}.metric h3{font-size:22px}.timeline{max-height:245px}.chartArea{padding-bottom:52px}}@media(max-width:1050px){.layout{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.lower{grid-template-columns:1fr}}@media(max-width:700px){.container{width:min(100vw - 20px,1240px);padding-top:18px}header{align-items:stretch;flex-direction:column}.metrics{grid-template-columns:1fr}.rate{grid-template-columns:1fr}.layout{gap:12px}}
`;
