const { useState: arS } = React;

function fillLevel(p) { return p >= 85 ? "high" : p >= 50 ? "mid" : p > 0 ? "low" : "empty"; }

function QuickSearch() {
  const [q, setQ] = arS("");
  const [result, setResult] = arS(null);
  const [loading, setLoading] = arS(false);
  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const value = await AmbarAPI.post("/search/documents", { query: q.trim(), limit: 5 });
      const first = AmbarAPI.listFrom(value)[0];
      setResult(first || null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };
  const path = result?.physical_location_path || result?.physical_location || result?.location_path || result?.archive_name || "";
  return (
    <Card className="an-rise" style={{ background: "linear-gradient(135deg, var(--brand-ghost), transparent 60%)" }}>
      <div className="col center" style={{ gap: "var(--s4)", textAlign: "center", padding: "var(--s3) 0" }}>
        <div><h3 style={{ fontSize: "var(--fs-xl)" }}>Donde esta un documento fisico</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>Busca por nombre, codigo o identificacion. AMBAR responde con datos reales si existen.</p></div>
        <div className="row" style={{ width: "min(620px, 100%)", gap: "var(--s2)" }}>
          <div className="search-box grow"><Icon name="search" size={18} /><input style={{ height: 46, fontSize: "var(--fs-md)" }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Codigo, nombre documental o expediente" /></div>
          <Button size="lg" icon="search" onClick={run} disabled={loading}>{loading ? "Buscando" : "Buscar"}</Button>
        </div>
        {result && (
          <Card pad="sm" className="an-scale" style={{ width: "min(640px, 100%)", textAlign: "left" }}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><div className="row gap2"><Icon name="file-text" size={18} style={{ color: "var(--brand)" }} /><b>{result.title || result.document_name || result.name || result.code}</b></div><Badge tone={path ? "success" : "warning"} dot>{path ? "Localizado" : "Sin ubicacion"}</Badge></div>
            <p className="mono muted" style={{ fontSize: "var(--fs-sm)" }}>{path || "La entidad existe pero no tiene ruta fisica registrada."}</p>
          </Card>
        )}
        {!loading && q && result === null && <Empty icon="search" title="Sin resultados">No se encontraron unidades con ubicacion para esa busqueda.</Empty>}
      </div>
    </Card>
  );
}

function BoxesView() {
  const { data: rawBoxes, loading } = useLiveData(() => AmbarAPI.endpoints.boxes(), [], []);
  const boxes = AmbarAPI.listFrom(rawBoxes).map((b, i) => ({
    id: b.box_code || b.code || `BOX-${i + 1}`,
    cap: b.occupancy_percent || (b.capacity_folders ? Math.round(((b.current_folders || 0) / b.capacity_folders) * 100) : 0),
    folders: b.current_folders || 0,
    loc: b.physical_location_path || b.location_path || b.shelf_name || "-",
    state: b.status || "active"
  }));
  if (loading) return <Skeleton lines={8} />;
  if (boxes.length === 0) return <Card><Empty icon="boxes" title="Sin cajas">No hay cajas creadas en la base de datos.</Empty></Card>;
  return (
    <div className="grid cols-3 stagger">
      {boxes.map((b, i) => (
        <Card key={b.id} interactive pad="sm" style={{ "--i": i }}>
          <div className="row between" style={{ marginBottom: "var(--s3)" }}><div className="row gap2"><Icon name="boxes" size={20} style={{ color: "var(--brand)" }} /><b className="mono">{b.id}</b></div><Badge tone={b.state === "full" ? "danger" : "success"}>{b.state}</Badge></div>
          <div className="kv" style={{ marginBottom: "var(--s3)" }}><span className="k">Ubicacion</span><span className="v mono" style={{ fontSize: "var(--fs-xs)" }}>{b.loc}</span></div>
          <div className="row between" style={{ fontSize: "var(--fs-xs)", marginBottom: 4 }}><span className="muted">{b.folders} carpetas</span><b className="mono">{b.cap}%</b></div>
          <Meter value={b.cap} tone={b.cap >= 85 ? "danger" : b.cap >= 50 ? "warn" : "ok"} />
        </Card>
      ))}
    </div>
  );
}

function ArchivePage({ user }) {
  const [tab, setTab] = arS("quick");
  const { data: dash } = useLiveData(() => AmbarAPI.endpoints.archiveDashboard(), {}, []);
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Archivo & Custodia</div><h1>Archivo Fisico</h1><p className="lead">Consulta ubicaciones, cajas y ocupacion desde los servicios reales de custodia.</p></div>
        <div className="page-actions">{can(user, ["archive.manage"]) && <Button icon="plus">Nueva caja</Button>}</div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Archivos" value={dash.archives || dash.total_archives || 0} icon="warehouse" tone="brand" accent />
        <Metric label="Cajas" value={dash.boxes || dash.total_boxes || 0} icon="boxes" tone="info" accent />
        <Metric label="Expedientes" value={dash.expedients || dash.total_expedients || 0} icon="folder-kanban" tone="ok" accent />
        <Metric label="Ocupacion" value={dash.occupancy_percent || 0} suffix="%" icon="activity" tone="warn" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "quick", label: "Consulta rapida", icon: "search" }, { key: "boxes", label: "Cajas", icon: "boxes" }]} />
      {tab === "quick" && <QuickSearch />}
      {tab === "boxes" && <BoxesView />}
    </>
  );
}

window.ArchivePage = ArchivePage;
