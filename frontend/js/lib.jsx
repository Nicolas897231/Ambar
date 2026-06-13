/* ============================================================
   AMBAR — Librería de componentes UI compartidos
   ============================================================ */
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

/* ---------- Icon ---------- */
function Icon({ name, size = 18, stroke = 2, className = "", style }) {
  const inner = window.ICONS[name] || window.ICONS["circle"];
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: inner }} aria-hidden="true" />
  );
}

/* ---------- Button ---------- */
function Button({ variant = "primary", size, icon, iconRight, children, className = "", as, href, ...rest }) {
  const cls = `btn btn-${variant}${size ? " btn-" + size : ""}${!children ? " btn-icon" : ""} ${className}`;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", (e.clientX - r.left) + "px");
    e.currentTarget.style.setProperty("--my", (e.clientY - r.top) + "px");
  };
  const content = <>{icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}{children && <span>{children}</span>}{iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}</>;
  if (as === "a") return <a className={cls} href={href} onMouseMove={onMove} {...rest}>{content}</a>;
  return <button className={cls} onMouseMove={onMove} {...rest}>{content}</button>;
}

/* ---------- Card ---------- */
function Card({ children, className = "", interactive, pad, style, ...rest }) {
  return <div className={`card${pad ? " pad-" + pad : ""}${interactive ? " interactive" : ""} ${className}`} style={style} {...rest}>{children}</div>;
}
function CardHead({ title, sub, icon, action }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title-row">{icon && <Icon name={icon} size={17} style={{ color: "var(--brand)" }} />}<h3>{title}</h3></div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
function Badge({ tone = "neutral", children, dot, icon, className = "" }) {
  const map = { success: "badge-success", warning: "badge-warning", danger: "badge-danger", info: "badge-info", brand: "badge-brand", outline: "badge-outline", neutral: "" };
  return <span className={`badge ${map[tone] || ""} ${className}`}>{dot && <span className="dot" />}{icon && <Icon name={icon} size={12} />}{children}</span>;
}

/* ---------- Tabs ---------- */
function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.key} className={`tab${value === t.key ? " active" : ""}`} onClick={() => onChange(t.key)}>
          {t.icon && <Icon name={t.icon} size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />}{t.label}
          {t.count != null && <span style={{ marginLeft: 6, opacity: .6 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Segmented ---------- */
function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tooltip ---------- */
function Tip({ text, children }) {
  return <span className="tip">{children}<span className="tip-bubble">{text}</span></span>;
}
function HelpDot({ text }) {
  return <Tip text={text}><span className="help-dot">?</span></Tip>;
}

/* ---------- Switch ---------- */
function Switch({ checked, onChange }) {
  return <span className="switch" data-on={!!checked} role="switch" aria-checked={!!checked} tabIndex={0}
    onClick={() => onChange(!checked)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }} />;
}

/* ---------- Field ---------- */
function Field({ label, help, required, children, hint }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span className="req">*</span>}{help && <HelpDot text={help} />}</label>}
      {children}
      {hint && <small className="faint">{hint}</small>}
    </div>
  );
}

/* ---------- Empty / Skeleton ---------- */
function Empty({ icon = "inbox", title, children, action }) {
  return (
    <div className="empty">
      <div className="e-icon"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
function Skeleton({ rows = 4, className = "" }) {
  return <div className={`skeleton-stack ${className}`}>{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ width: `${70 + (i * 37) % 30}%`, height: 14 }} />)}</div>;
}

/* ---------- Avatar ---------- */
function Avatar({ name, color, size = "", src }) {
  return <div className={`avatar ${size}`} style={{ background: color || "var(--brand)" }} title={name}>{window.initialsOf(name || "·")}</div>;
}

/* ---------- Modal ---------- */
function Modal({ title, sub, onClose, children, footer, lg, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`modal${lg || wide ? " lg" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>
          <Button variant="subtle" size="sm" icon="x" onClick={onClose} aria-label="Cerrar" />
        </div>
        {children}
        {footer && <div className="row between" style={{ marginTop: "var(--s6)" }}>{footer}</div>}
      </div>
    </>
  );
}

/* ---------- Drawer ---------- */
function Drawer({ title, sub, onClose, children, wide, headExtra }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div><h2 style={{ fontSize: "var(--fs-xl)" }}>{title}</h2>{sub && <div className="sub muted" style={{ fontSize: "var(--fs-sm)", marginTop: 3 }}>{sub}</div>}</div>
          <div className="row gap2">{headExtra}<Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Cerrar" /></div>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems(s => [...s, { id, msg, ...opts }]);
    setTimeout(() => setItems(s => s.filter(t => t.id !== id)), opts.duration || 3600);
  }, []);
  const icons = { ok: "check-circle", danger: "alert-circle", warn: "alert-triangle", info: "info" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {items.map(t => (
          <div key={t.id} className={`toast ${t.tone || ""}`}>
            <span className="t-ico"><Icon name={icons[t.tone] || "sparkles"} size={18} /></span>
            <div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)", color: "var(--text-strong)" }}>{t.title || t.msg}</div>{t.title && t.msg && <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 2 }}>{t.msg}</div>}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

/* ---------- Download helpers ---------- */
function safeFilename(value, fallback = "ambar-export") {
  return String(value || fallback)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCSV(filename, rows, columns) {
  const data = Array.isArray(rows) ? rows : [];
  const cols = columns || Array.from(data.reduce((set, row) => {
    Object.keys(row || {}).forEach(k => set.add(k));
    return set;
  }, new Set()));
  const csv = [cols.join(";"), ...data.map(row => cols.map(col => csvValue(row?.[col])).join(";"))].join("\n");
  downloadText(`${safeFilename(filename)}.csv`, csv, "text/csv;charset=utf-8");
}

function downloadJSON(filename, data) {
  downloadText(`${safeFilename(filename)}.json`, JSON.stringify(data || {}, null, 2), "application/json;charset=utf-8");
}

/* ---------- Stat helpers ---------- */
function useCountUp(target, dur = 900) {
  const num = typeof target === "number" ? target : parseFloat(target) || 0;
  const [val, setVal] = useState(num);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(num); return; }
    let raf, start;
    setVal(0);
    const step = (t) => { if (!start) start = t; const p = Math.min((t - start) / dur, 1); const e = 1 - Math.pow(1 - p, 3); setVal(num * e); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const safety = setTimeout(() => setVal(num), dur + 350); // guarantees final value if rAF is throttled/paused
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [num]);
  return val;
}

/* ---------- Metric card ---------- */
function Metric({ label, value, icon, tone = "brand", trend, trendDir, foot, accent, decimals = 0, prefix = "", suffix = "" }) {
  const n = typeof value === "number" ? value : null;
  const animated = useCountUp(n ?? 0);
  const display = n != null ? prefix + window.fmtN(decimals ? +animated.toFixed(decimals) : Math.round(animated)) + suffix : value;
  const tones = { brand: "var(--brand)", ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", info: "var(--info)" };
  return (
    <div className={`metric${accent ? " accent" : ""}`} style={accent ? { "--accent": tones[tone] } : null}>
      <div className="m-top">
        <span className="m-label">{label}</span>
        {icon && <span className="m-icon" style={{ background: `color-mix(in oklab, ${tones[tone]} 14%, transparent)`, color: tones[tone] }}><Icon name={icon} size={19} /></span>}
      </div>
      <div className="m-value">{display}</div>
      {(trend || foot) && (
        <div className="m-foot">
          {trend && <span className={`m-trend ${trendDir || "flat"}`}><Icon name={trendDir === "up" ? "trending-up" : trendDir === "down" ? "trending-down" : "arrow-right"} size={12} />{trend}</span>}
          {foot && <span>{foot}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Progress meter ---------- */
function Meter({ value, tone = "", showLabel }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 80); return () => clearTimeout(t); }, [value]);
  return (
    <div className="row gap2" style={{ width: "100%" }}>
      <div className={`meter ${tone}`} style={{ flex: 1 }}><i style={{ width: w + "%" }} /></div>
      {showLabel && <span className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", minWidth: 34, textAlign: "right" }}>{value}%</span>}
    </div>
  );
}

/* ---------- Stepper ---------- */
function Stepper({ steps, current }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={i} className={`step${i < current ? " done" : ""}${i === current ? " active" : ""}`}>
          <div className="s-num">{i < current ? <Icon name="check" size={16} /> : i + 1}</div>
          <div className="s-label">{s}</div>
          {i < steps.length - 1 && <div className="s-line" />}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Icon, Button, Card, CardHead, Badge, Tabs, Segmented, Tip, HelpDot, Switch, Field, Empty, Skeleton, Avatar, Modal, Drawer, ToastProvider, useToast, downloadCSV, downloadJSON, downloadText, safeFilename, Metric, Meter, Stepper, useCountUp,
  React, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext });
