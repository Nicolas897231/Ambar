/* ============================================================
   AMBAR — Gráficas animadas (SVG puro, sin dependencias)
   ============================================================ */
const { useState: _uS, useEffect: _uE, useRef: _uR, useMemo: _uM } = React;

function useInView(ref) {
  const [seen, setSeen] = _uS(false);
  _uE(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver((es) => es.forEach(e => e.isIntersecting && setSeen(true)), { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return seen;
}

const VIZ = ["var(--viz-amber)","var(--viz-teal)","var(--viz-indigo)","var(--viz-rose)","var(--viz-green)","var(--viz-violet)","var(--viz-sky)","var(--viz-gold)"];

/* ---------- Area / Line chart ---------- */
function AreaChart({ data, height = 200, color = "var(--brand)", color2, labels, valueFmt = (v) => v, area = true, dots = false }) {
  const ref = _uR(null);
  const seen = useInView(ref);
  const [hover, setHover] = _uS(null);
  const w = 600, h = height, pad = { t: 14, r: 12, b: 24, l: 34 };
  const max = Math.max(...data, 1) * 1.15, min = 0;
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  const fill = `${line} L ${x(data.length - 1)} ${pad.t + ih} L ${x(0)} ${pad.t + ih} Z`;
  const gid = "ag" + Math.random().toString(36).slice(2, 7);
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => pad.t + ih * f);
  return (
    <div ref={ref} style={{ width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => <line key={i} x1={pad.l} y1={gy} x2={w - pad.r} y2={gy} stroke="var(--grid-line)" strokeWidth="1" strokeDasharray={i === 4 ? "0" : "3 4"} />)}
        {[max, max / 2, 0].map((v, i) => <text key={i} x={pad.l - 8} y={pad.t + ih * (i / 2) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">{valueFmt(Math.round(v))}</text>)}
        {area && <path d={fill} fill={`url(#${gid})`} style={{ opacity: seen ? 1 : 0, transition: "opacity .8s ease .3s" }} />}
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 2000, strokeDashoffset: seen ? 0 : 2000, transition: "stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1)" }} />
        {labels && labels.map((l, i) => <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">{l}</text>)}
        {(dots || hover != null) && pts.map((p, i) => (
          <g key={i} opacity={hover == null ? (dots ? 1 : 0) : (hover === i ? 1 : 0)} style={{ transition: "opacity .15s" }}>
            <circle cx={p[0]} cy={p[1]} r="4.5" fill="var(--panel)" stroke={color} strokeWidth="2.5" />
          </g>
        ))}
        {hover != null && <line x1={pts[hover][0]} y1={pad.t} x2={pts[hover][0]} y2={pad.t + ih} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
        {data.map((v, i) => <rect key={i} x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        {hover != null && (
          <g transform={`translate(${Math.min(Math.max(pts[hover][0], 40), w - 40)}, ${pts[hover][1] - 14})`}>
            <rect x="-26" y="-22" width="52" height="20" rx="5" fill="var(--text-strong)" />
            <text x="0" y="-8" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--panel)" fontFamily="var(--font-mono)">{valueFmt(data[hover])}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ---------- Bar chart (vertical) ---------- */
function BarChart({ data, labels, height = 200, color = "var(--brand)", multi, valueFmt = (v) => v }) {
  const ref = _uR(null);
  const seen = useInView(ref);
  const [hover, setHover] = _uS(null);
  const w = 600, h = height, pad = { t: 14, r: 10, b: 26, l: 34 };
  const flat = multi ? data.flat() : data;
  const max = Math.max(...flat, 1) * 1.15;
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const groups = data.length;
  const gw = iw / groups;
  const series = multi ? data[0].length : 1;
  const bw = Math.min((gw * 0.66) / series, 42);
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => pad.t + ih * f);
  return (
    <div ref={ref} style={{ width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {grid.map((gy, i) => <line key={i} x1={pad.l} y1={gy} x2={w - pad.r} y2={gy} stroke="var(--grid-line)" strokeWidth="1" strokeDasharray={i === 4 ? "0" : "3 4"} />)}
        {[max, max / 2, 0].map((v, i) => <text key={i} x={pad.l - 8} y={pad.t + ih * (i / 2) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">{valueFmt(Math.round(v))}</text>)}
        {data.map((d, gi) => {
          const vals = multi ? d : [d];
          const groupX = pad.l + gi * gw + gw / 2;
          return (
            <g key={gi} onMouseEnter={() => setHover(gi)}>
              {vals.map((v, si) => {
                const bh = (v / max) * ih;
                const bx = groupX - (series * bw) / 2 + si * bw + (series > 1 ? si : 0);
                const c = multi ? VIZ[si % VIZ.length] : color;
                return <rect key={si} x={bx} y={pad.t + ih - bh} width={bw - (series > 1 ? 2 : 0)} height={bh} rx="4" fill={c}
                  style={{ transformOrigin: `${bx}px ${pad.t + ih}px`, transform: seen ? "scaleY(1)" : "scaleY(0)", transition: `transform .7s cubic-bezier(.16,1,.3,1) ${gi * 0.05 + si * 0.05}s`, opacity: hover == null || hover === gi ? 1 : 0.45 }} />;
              })}
              {labels && <text x={groupX} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--faint)">{labels[gi]}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- Horizontal bars ---------- */
function BarsH({ items, valueFmt = (v) => v, color }) {
  const ref = _uR(null);
  const seen = useInView(ref);
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div ref={ref} className="col" style={{ gap: "var(--s4)" }}>
      {items.map((it, i) => (
        <div key={i} className="col" style={{ gap: 6 }}>
          <div className="row between" style={{ fontSize: "var(--fs-sm)" }}>
            <span className="row gap2" style={{ fontWeight: 500 }}>{it.dot && <span style={{ width: 8, height: 8, borderRadius: 9, background: it.color || color || VIZ[i % VIZ.length] }} />}{it.label}</span>
            <span className="mono muted" style={{ fontSize: "var(--fs-xs)" }}>{valueFmt(it.value)}</span>
          </div>
          <div className="meter"><i style={{ width: seen ? (it.value / max) * 100 + "%" : 0, background: it.color || color || VIZ[i % VIZ.length], transition: `width .9s cubic-bezier(.16,1,.3,1) ${i * 0.07}s` }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Donut ---------- */
function Donut({ data, size = 168, thickness = 22, centerLabel, centerValue }) {
  const ref = _uR(null);
  const seen = useInView(ref);
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div ref={ref} className="row" style={{ gap: "var(--s5)", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const off = acc * circ;
          acc += frac;
          return <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color || VIZ[i % VIZ.length]} strokeWidth={thickness}
            strokeDasharray={`${seen ? dash : 0} ${circ}`} strokeDashoffset={-off} strokeLinecap="butt"
            transform={`rotate(-90 ${c} ${c})`} style={{ transition: `stroke-dasharray 1s cubic-bezier(.16,1,.3,1) ${i * 0.12}s` }} />;
        })}
        {centerValue != null && <text x={c} y={c - 2} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text-strong)" fontFamily="var(--font-display)">{centerValue}</text>}
        {centerLabel && <text x={c} y={c + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">{centerLabel}</text>}
      </svg>
      <div className="col" style={{ gap: "var(--s2)" }}>
        {data.map((d, i) => (
          <div key={i} className="row gap2" style={{ fontSize: "var(--fs-sm)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color || VIZ[i % VIZ.length] }} />
            <span className="grow" style={{ color: "var(--text)" }}>{d.label}</span>
            <span className="mono muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--s4)" }}>{Math.round(d.value / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sparkline ---------- */
function Sparkline({ data, color = "var(--brand)", height = 38, width = 120, fill = true }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const x = (i) => (i / (data.length - 1)) * width;
  const y = (v) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  const line = data.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
  const gid = "sp" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Radial gauge ---------- */
function Gauge({ value, size = 120, label, tone = "var(--brand)" }) {
  const ref = _uR(null); const seen = useInView(ref);
  const r = size / 2 - 12, c = size / 2, circ = Math.PI * r;
  return (
    <div ref={ref} className="col center" style={{ gap: 4 }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={`M 12 ${c} A ${r} ${r} 0 0 1 ${size - 12} ${c}`} fill="none" stroke="var(--panel-3)" strokeWidth="11" strokeLinecap="round" />
        <path d={`M 12 ${c} A ${r} ${r} 0 0 1 ${size - 12} ${c}`} fill="none" stroke={tone} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={seen ? circ - (value / 100) * circ : circ} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)" }} />
        <text x={c} y={c - 4} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text-strong)" fontFamily="var(--font-display)">{value}%</text>
      </svg>
      {label && <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{label}</span>}
    </div>
  );
}

Object.assign(window, { AreaChart, BarChart, BarsH, Donut, Sparkline, Gauge, useInView, VIZ });
