/* ============================================================
   AMBAR — Dashboard (centro operacional, adaptado al rol)
   ============================================================ */
const { useState: dUS, useMemo: dUM } = React;

const DASH_KPIS = [
  { key: "docs", label: "Documentos registrados", value: 48230, icon: "file-text", tone: "brand", trend: "+8.2%", dir: "up", foot: "vs. mes anterior", perms: ["document.read","analytics.view"] },
  { key: "digit", label: "Documentos digitalizados", value: 39817, icon: "scan-line", tone: "info", trend: "+12%", dir: "up", foot: "82.6% del total", perms: ["ocr.manage","analytics.view"] },
  { key: "pend", label: "Pendientes de digitalizar", value: 412, icon: "clock", tone: "warn", trend: "-5%", dir: "down", foot: "cola de trabajo", perms: ["ocr.manage","analytics.view"] },
  { key: "exp", label: "Expedientes activos", value: 3164, icon: "folder-kanban", tone: "brand", trend: "+3.1%", dir: "up", foot: "en gestión", perms: ["document.read","analytics.view"] },
  { key: "boxes", label: "Cajas archivadas", value: 1287, icon: "boxes", tone: "info", trend: "+1.4%", dir: "up", foot: "76% ocupación", perms: ["archive.manage","analytics.view"] },
  { key: "loans", label: "Préstamos activos", value: 23, icon: "package-check", tone: "warn", trend: "3 vencen hoy", dir: "flat", foot: "documentales", perms: ["document.transfer","analytics.view"] },
  { key: "contracts", label: "Contratos por vencer", value: 7, icon: "file-clock", tone: "danger", trend: "30 días", dir: "flat", foot: "requieren acción", perms: ["hr.view","analytics.view"] },
  { key: "exams", label: "Exámenes por vencer", value: 5, icon: "stethoscope", tone: "warn", trend: "30 días", dir: "flat", foot: "SST", perms: ["medical.view","hr.view"] },
  { key: "vac", label: "Vacantes activas", value: 6, icon: "user-plus", tone: "brand", trend: "+2", dir: "up", foot: "reclutamiento", perms: ["recruit.view"] },
  { key: "cand", label: "Candidatos en proceso", value: 84, icon: "users", tone: "info", trend: "+19", dir: "up", foot: "pipeline", perms: ["recruit.view"] },
];

const ACTIVITY = [
  { who: "Laura Mejía", act: "digitalizó", obj: "Contrato laboral · DOC-2026-0481", time: "Hace 6 min", ic: "scan-line", tone: "brand" },
  { who: "Andrés Gómez", act: "aprobó la transferencia", obj: "Lote FUID-2026-014 → Archivo Central", time: "Hace 24 min", ic: "route", tone: "ok" },
  { who: "Diana Ortiz", act: "movió candidato", obj: "Sara López → Entrevista técnica", time: "Hace 1 h", ic: "user-check", tone: "brand" },
  { who: "Sistema", act: "generó alerta", obj: "Examen médico de Carlos Daza venció", time: "Hace 1 h", ic: "alert-triangle", tone: "danger" },
  { who: "Ricardo Salas", act: "registró contrato", obj: "Nuevo empleado · Mariana Ruiz", time: "Hace 3 h", ic: "file-check", tone: "ok" },
  { who: "Marta Lozano", act: "radicó correspondencia", obj: "RAD-ENT-2026-0912 · DIAN", time: "Hoy 08:41", ic: "mail", tone: "brand" },
];

const TASKS = [
  { t: "Validar OCR de 12 documentos escaneados", due: "Hoy", tone: "danger", mod: "digitization" },
  { t: "Revisar 5 candidatos vacante Full Stack", due: "Hoy", tone: "warn", mod: "recruitment" },
  { t: "Recibir lote de transferencia FUID-2026-015", due: "Mañana", tone: "warn", mod: "transfers" },
  { t: "Completar expediente de Mariana Ruiz", due: "2 días", tone: "neutral", mod: "hr" },
];

function greeting() { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; }

function DashboardPage({ user, navigate }) {
  const kpis = dUM(() => DASH_KPIS.filter(k => can(user, k.perms)).slice(0, 8), [user]);
  const docMonths = [3100, 3400, 3050, 3700, 4100, 3900, 4300, 4600, 4200, 4800, 5100, 5400];
  const monthLabels = ["E","F","M","A","M","J","J","A","S","O","N","D"];
  const isHR = can(user, ["hr.view","recruit.view","medical.view"]) && !can(user, ["archive.manage"]);

  return (
    <>
      {/* Hero */}
      <div className="dash-hero an-rise">
        <div className="row between wrap" style={{ alignItems: "flex-start", gap: "var(--s5)" }}>
          <div>
            <h1>{greeting()}, {user.name.split(" ")[0]} 👋</h1>
            <p>Este es el estado de la operación documental y de talento humano de hoy. {can(user,["audit.view"]) ? "Todo bajo control — revisa las alertas pendientes abajo." : "Tienes tareas y vencimientos que requieren tu atención."}</p>
          </div>
          <Button variant="secondary" icon="sparkles" onClick={() => navigate("reports")} style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.25)" }}>Ver reportes</Button>
        </div>
        <div className="dh-stats">
          <div className="dh-stat"><div className="n">82.6%</div><div className="l">Digitalización global</div></div>
          <div className="dh-stat"><div className="n">94%</div><div className="l">Cumplimiento documental</div></div>
          <div className="dh-stat"><div className="n">1.4 s</div><div className="l">Tiempo medio de búsqueda</div></div>
          <div className="dh-stat"><div className="n">{can(user,["hr.view"]) ? "248" : "23"}</div><div className="l">{can(user,["hr.view"]) ? "Empleados activos" : "Préstamos activos"}</div></div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid cols-4 stagger">
        {kpis.map((k, i) => (
          <div key={k.key} style={{ "--i": i }}>
            <Metric label={k.label} value={k.value} icon={k.icon} tone={k.tone} trend={k.trend} trendDir={k.dir} foot={k.foot} accent />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card className="an-rise">
          <CardHead title="Documentos registrados por mes" sub="Tendencia de los últimos 12 meses" icon="trending-up"
            action={<Segmented options={[{ value: "12m", label: "12m" }, { value: "6m", label: "6m" }, { value: "30d", label: "30d" }]} value="12m" onChange={() => { }} />} />
          <AreaChart data={docMonths} labels={monthLabels} color="var(--brand)" valueFmt={v => window.fmtN(v)} height={230} />
        </Card>
        <Card className="an-rise">
          <CardHead title="Estado documental" sub="Distribución por estado actual" icon="pie-chart" />
          <Donut centerValue="48k" centerLabel="documentos" data={[
            { label: "Digitalizados", value: 39817, color: "var(--viz-teal)" },
            { label: "Solo físicos", value: 6001, color: "var(--viz-amber)" },
            { label: "En proceso", value: 1989, color: "var(--viz-indigo)" },
            { label: "Sin clasificar", value: 423, color: "var(--viz-rose)" },
          ]} />
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: isHR ? "1fr 1fr" : "1fr 1fr 1fr" }}>
        <Card className="an-rise">
          <CardHead title={isHR ? "Empleados por área" : "Digitalización por área"} sub="Top dependencias" icon="bar-chart" />
          <BarsH items={(isHR ? [
            { label: "Operaciones", value: 78 }, { label: "Comercial", value: 52 }, { label: "Financiera", value: 34 }, { label: "RRHH", value: 21 }, { label: "Jurídica", value: 18 },
          ] : [
            { label: "RRHH", value: 94 }, { label: "Jurídica", value: 88 }, { label: "Financiera", value: 76 }, { label: "Operaciones", value: 64 }, { label: "Comercial", value: 51 },
          ])} valueFmt={v => isHR ? v : v + "%"} />
        </Card>
        {!isHR && (
          <Card className="an-rise">
            <CardHead title="Archivo físico vs digital" sub="Cobertura de digitalización" icon="warehouse" />
            <div className="col center" style={{ gap: "var(--s4)", padding: "var(--s3) 0" }}>
              <Gauge value={83} label="Documentos con copia digital" tone="var(--viz-teal)" />
              <div className="row between" style={{ width: "100%", fontSize: "var(--fs-sm)" }}><span className="muted">Físicos</span><b>8.413</b></div>
              <div className="row between" style={{ width: "100%", fontSize: "var(--fs-sm)" }}><span className="muted">Digitales</span><b>39.817</b></div>
            </div>
          </Card>
        )}
        <Card className="an-rise">
          <CardHead title={isHR ? "Pipeline de selección" : "Cumplimiento por archivo"} sub={isHR ? "Candidatos por etapa" : "Indicadores clave"} icon={isHR ? "user-plus" : "shield-check"} />
          {isHR ? (
            <BarChart data={[28, 19, 14, 9, 6, 8]} labels={["Post.","Pre.","Entr.","Prueba","Valid.","Contr."]} color="var(--viz-rose)" height={180} />
          ) : (
            <div className="col" style={{ gap: "var(--s4)", paddingTop: "var(--s2)" }}>
              {[["Archivo de Gestión", 91, ""], ["Archivo Central", 96, "ok"], ["Archivo Histórico", 88, "warn"]].map(([n, v, t]) => (
                <div key={n} className="col" style={{ gap: 6 }}><div className="row between" style={{ fontSize: "var(--fs-sm)" }}><span>{n}</span><b className="mono">{v}%</b></div><Meter value={v} tone={t} /></div>
              ))}
              <div className="divider" />
              <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-sm)" }}>Cumplimiento TRD global</span><Badge tone="success" icon="check">94%</Badge></div>
            </div>
          )}
        </Card>
      </div>

      {/* Widgets */}
      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card className="an-rise">
          <CardHead title="Actividad reciente" sub="Últimos movimientos en el sistema" icon="history" action={<Button variant="subtle" size="sm" iconRight="arrow-right" onClick={() => navigate("audit")}>Auditoría</Button>} />
          <div className="timeline">
            {ACTIVITY.map((a, i) => (
              <div key={i} className={`tl-item ${a.tone}`}>
                <div className="tl-dot"><Icon name={a.ic} size={14} /></div>
                <div className="tl-body"><div className="tl-title"><b>{a.who}</b> {a.act} <span style={{ color: "var(--brand)" }}>{a.obj}</span></div><div className="tl-meta">{a.time}</div></div>
              </div>
            ))}
          </div>
        </Card>
        <div className="col gap4">
          <Card className="an-rise">
            <CardHead title="Tareas pendientes" sub="Asignadas a ti" icon="list-checks" />
            <div className="col" style={{ gap: "var(--s2)" }}>
              {TASKS.map((t, i) => (
                <button key={i} className="list-row" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => navigate(t.mod)}>
                  <span className="comp-check no" style={{ borderColor: "var(--line-strong)" }}></span>
                  <span className="grow" style={{ fontSize: "var(--fs-sm)" }}>{t.t}</span>
                  <Badge tone={t.tone === "neutral" ? "outline" : t.tone === "danger" ? "danger" : "warning"}>{t.due}</Badge>
                </button>
              ))}
            </div>
          </Card>
          <Card className="an-rise" style={{ background: "linear-gradient(135deg, var(--brand-ghost), transparent)" }}>
            <div className="row gap2" style={{ marginBottom: 8 }}><Icon name="bell" size={18} style={{ color: "var(--brand)" }} /><b>Próximos vencimientos</b></div>
            <div className="col" style={{ gap: "var(--s2)" }}>
              {[["7 contratos", "30 días", "hr"], ["5 exámenes médicos", "30 días", "medical"], ["3 préstamos", "esta semana", "loans"], ["18 cajas", "transferir", "transfers"]].map(([w, d, m], i) => (
                <div key={i} className="row between" style={{ fontSize: "var(--fs-sm)", padding: "5px 0", borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
                  <span className="grow">{w}</span><span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{d}</span>
                  <Button variant="subtle" size="sm" icon="chevron-right" onClick={() => navigate(m)} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

window.DashboardPage = DashboardPage;
