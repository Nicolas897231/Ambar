/* ============================================================
   AMBAR — Archivo & Custodia: Archivo Físico
   ============================================================ */
const { useState: arS } = React;

function fillLevel(p) { return p >= 85 ? "high" : p >= 50 ? "mid" : p > 0 ? "low" : "empty"; }

function QuickSearch() {
  const [q, setQ] = arS("");
  const [result, setResult] = arS(null);
  const run = () => { if (q.trim()) setResult({ name: q.includes("Juan") || !q ? "Contrato Laboral — Juan Pérez" : q, path: ["Sede Cali", "Archivo Central", "Pasillo B", "Estante 4", "Nivel 2", "Caja 18", "Carpeta 12"], folio: "Folios 1–24" }); };
  return (
    <Card className="an-rise" style={{ background: "linear-gradient(135deg, var(--brand-ghost), transparent 60%)" }}>
      <div className="col center" style={{ gap: "var(--s4)", textAlign: "center", padding: "var(--s3) 0" }}>
        <div><h3 style={{ fontSize: "var(--fs-xl)" }}>¿Dónde está un documento físico?</h3><p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>Escribe el nombre, código o cédula y AMBAR te dice la ruta exacta.</p></div>
        <div className="row" style={{ width: "min(560px, 100%)", gap: "var(--s2)" }}>
          <div className="search-box grow"><Icon name="search" size={18} /><input style={{ height: 46, fontSize: "var(--fs-md)" }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ej. Juan Pérez, DOC-2026-0481, 1.144.xxx" /></div>
          <Button size="lg" icon="search" onClick={run}>Buscar</Button>
        </div>
        {result && (
          <Card pad="sm" className="an-scale" style={{ width: "min(640px, 100%)", textAlign: "left" }}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><div className="row gap2"><Icon name="file-text" size={18} style={{ color: "var(--brand)" }} /><b>{result.name}</b></div><Badge tone="success" dot>Localizado</Badge></div>
            <div className="row wrap" style={{ gap: 0 }}>
              {result.path.map((p, i, a) => (<React.Fragment key={i}><span className="tag-soft mono" style={{ background: i === a.length - 1 ? "var(--brand)" : "", color: i === a.length - 1 ? "var(--on-brand)" : "" }}>{p}</span>{i < a.length - 1 && <Icon name="chevron-right" size={14} style={{ color: "var(--faint)", margin: "0 4px" }} />}</React.Fragment>))}
            </div>
            <div className="row between" style={{ marginTop: "var(--s4)" }}><span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{result.folio}</span><div className="row gap2"><Button variant="ghost" size="sm" icon="package-check">Solicitar préstamo</Button><Button size="sm" icon="map-pin">Ver en mapa</Button></div></div>
          </Card>
        )}
      </div>
    </Card>
  );
}

function WarehouseMap() {
  const [sel, setSel] = arS(null);
  const aisles = [
    { name: "Pasillo A", shelves: [20, 45, 70, 90, 35, 60] },
    { name: "Pasillo B", shelves: [88, 92, 76, 100, 64, 50] },
    { name: "Pasillo C", shelves: [40, 30, 0, 15, 55, 80] },
    { name: "Pasillo D", shelves: [95, 85, 70, 88, 92, 78] },
  ];
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 280px", gap: "var(--s4)" }}>
      <Card className="an-rise">
        <CardHead title="Mapa del archivo — Sede Cali · Archivo Central" sub="Cada celda es una estantería. El color indica su ocupación." icon="warehouse"
          action={<div className="row gap2" style={{ fontSize: "var(--fs-xs)" }}><span className="row gap2"><span className="heat" style={{ background: "var(--ok)" }} />Libre</span><span className="row gap2"><span className="heat" style={{ background: "var(--warn)" }} />Media</span><span className="row gap2"><span className="heat" style={{ background: "var(--danger)" }} />Llena</span></div>} />
        <div className="warehouse">
          {aisles.map(a => (
            <div key={a.name} className="wh-aisle">
              <div className="wh-aisle-label">{a.name}</div>
              <div className="wh-shelves">
                {a.shelves.map((p, i) => (
                  <Tip key={i} text={`${a.name} · Estante ${i + 1} — ${p}% ocupado`}>
                    <div className="wh-cell" data-fill={fillLevel(p)} onClick={() => setSel({ aisle: a.name, shelf: i + 1, p })}>{i + 1}</div>
                  </Tip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="col gap4">
        <Card pad="sm" className="an-rise">
          <CardHead title="Ocupación global" />
          <Gauge value={76} label="Capacidad usada del archivo" tone="var(--warn)" />
          <div className="statstrip" style={{ marginTop: "var(--s3)", gridAutoFlow: "row" }}>
            <div><div className="ss-n">1.287</div><div className="ss-l">Cajas archivadas</div></div>
            <div><div className="ss-n">412</div><div className="ss-l">Espacios libres</div></div>
          </div>
        </Card>
        {sel ? (
          <Card pad="sm" className="an-scale">
            <CardHead title={`${sel.aisle} · Estante ${sel.shelf}`} />
            <div className="dl"><dt>Ocupación</dt><dd>{sel.p}%</dd><dt>Cajas</dt><dd>{Math.round(sel.p / 8)}</dd><dt>Niveles</dt><dd>5</dd></div>
            <Meter value={sel.p} tone={fillLevel(sel.p) === "high" ? "danger" : fillLevel(sel.p) === "mid" ? "warn" : "ok"} />
            <Button variant="ghost" size="sm" className="btn-block" icon="boxes" style={{ marginTop: "var(--s3)" }}>Ver cajas</Button>
          </Card>
        ) : <Card pad="sm" className="an-rise"><Empty icon="map" title="Selecciona una estantería">Haz clic en una celda del mapa para ver su detalle.</Empty></Card>}
      </div>
    </div>
  );
}

function BoxesView() {
  const boxes = Array.from({ length: 12 }).map((_, i) => ({ id: "CAJ-00" + String(120 + i).padStart(3, "0"), type: ["Gestión", "Central", "Histórico"][i % 3], cap: [60, 85, 100, 40, 92, 30][i % 6], folders: (i % 5) + 1, loc: `Pasillo ${["A", "B", "C", "D"][i % 4]} · Est. ${(i % 6) + 1}`, state: ["Activa", "Llena", "En tránsito"][i % 3] }));
  return (
    <div className="grid cols-3 stagger">
      {boxes.map((b, i) => (
        <Card key={b.id} interactive pad="sm" style={{ "--i": i }}>
          <div className="row between" style={{ marginBottom: "var(--s3)" }}><div className="row gap2"><Icon name="boxes" size={20} style={{ color: "var(--brand)" }} /><b className="mono">{b.id}</b></div><Badge tone={b.state === "Llena" ? "danger" : b.state === "En tránsito" ? "info" : "success"}>{b.state}</Badge></div>
          <div className="kv" style={{ marginBottom: "var(--s3)" }}><span className="k">Ubicación</span><span className="v mono" style={{ fontSize: "var(--fs-xs)" }}>{b.loc}</span></div>
          <div className="row between" style={{ fontSize: "var(--fs-xs)", marginBottom: 4 }}><span className="muted">Capacidad · {b.folders} carpetas</span><b className="mono">{b.cap}%</b></div>
          <Meter value={b.cap} tone={b.cap >= 85 ? "danger" : b.cap >= 50 ? "warn" : "ok"} />
        </Card>
      ))}
    </div>
  );
}

function ArchivePage({ user }) {
  const [tab, setTab] = arS("quick");
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Archivo & Custodia</div><h1>Archivo Físico</h1><p className="lead">Sabe en todo momento dónde está cada documento físico. Jerarquía: Sede → Archivo → Pasillo → Estantería → Nivel → Caja → Carpeta.</p></div>
        <div className="page-actions">{can(user, ["archive.manage"]) && <Button icon="plus">Nueva caja</Button>}</div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "quick", label: "Consulta rápida", icon: "search" }, { key: "map", label: "Mapa del archivo", icon: "warehouse" }, { key: "boxes", label: "Cajas", icon: "boxes" }, { key: "folders", label: "Carpetas", icon: "folders" }]} />
      {tab === "quick" && <QuickSearch />}
      {tab === "map" && <WarehouseMap />}
      {tab === "boxes" && <BoxesView />}
      {tab === "folders" && (
        <Card className="an-rise"><CardHead title="Árbol de carpetas" sub="Carpetas asociadas a expedientes y cajas" icon="folders" />
          <div className="tree">
            {[["Archivo Central", [["Contratos 2026", ["Carpeta 12 — Juan Pérez", "Carpeta 13 — Mariana Ruiz"]], ["Proveedores", ["Carpeta 1 — Suministros del Valle"]]]], ["Archivo de Gestión", [["RRHH activos", ["Carpeta 8 — Carlos Daza"]]]]].map(([root, groups]) => (
              <div key={root}><div className="tree-node active"><Icon name="building" size={16} className="tn-ico" /> {root}</div>
                <div className="tree-children">{groups.map(([g, items]) => (
                  <div key={g}><div className="tree-node"><Icon name="folder" size={16} className="tn-ico" /> {g}</div>
                    <div className="tree-children">{items.map(it => <div key={it} className="tree-node"><Icon name="folder" size={16} className="tn-ico" /> <span className="grow">{it}</span><Badge tone="outline">Caja 18</Badge></div>)}</div>
                  </div>))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

window.ArchivePage = ArchivePage;
