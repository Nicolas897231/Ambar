const { useState: arS, useMemo: arM } = React;

function pathTone(value) {
  const n = Number(value || 0);
  if (n >= 90) return "danger";
  if (n >= 71) return "warning";
  return "success";
}

function shelfLabel(shelf) {
  return [shelf.floor, shelf.aisle && `Pasillo ${shelf.aisle}`, shelf.shelf_code && `Estantería ${shelf.shelf_code}`, shelf.module && `Cuerpo ${shelf.module}`, shelf.bay && `Nivel ${shelf.bay}`]
    .filter(Boolean)
    .join(" / ") || shelf.shelf_name || shelf.shelf_code || "Ubicación sin ruta";
}

function parseLocationList(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end >= start && end - start <= 100) return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
  }
  return text.split(/[,\n;]/).map((part) => part.trim()).filter(Boolean).slice(0, 100);
}

function QuickSearch() {
  const [q, setQ] = arS("");
  const [result, setResult] = arS(null);
  const [loading, setLoading] = arS(false);
  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const value = await AmbarAPI.post("/search/documents", { q: q.trim(), size: 5 });
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
    <Card className="an-rise topography-hero">
      <div className="topography-hero-grid">
        <div>
          <div className="eyebrow">Consulta física</div>
          <h3>¿Dónde está una unidad documental?</h3>
          <p>Busca por documento, expediente, código o identificación. AMBAR responde con la ruta heredada desde la caja si existe.</p>
        </div>
        <div className="topography-search">
          <div className="search-box grow">
            <Icon name="search" size={18} />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ej. Juan Pérez, DOC-2026, BX-001" />
          </div>
          <Button size="lg" icon="search" onClick={run} disabled={loading}>{loading ? "Buscando" : "Buscar"}</Button>
        </div>
      </div>
      {result && (
        <Card pad="sm" className="an-scale location-result">
          <div className="row between">
            <div className="row gap2"><Icon name="map-pin" size={18} style={{ color: "var(--brand)" }} /><b>{result.title || result.document_name || result.name || result.code}</b></div>
            <Badge tone={path ? "success" : "warning"} dot>{path ? "Localizado" : "Sin ubicación"}</Badge>
          </div>
          <p className="mono muted">{path || "La entidad existe, pero aún no hereda una ubicación física desde caja."}</p>
        </Card>
      )}
      {!loading && q && result === null && <Empty icon="search" title="Sin resultados">No se encontraron unidades con ubicación para esa búsqueda.</Empty>}
    </Card>
  );
}

function TopologyView() {
  const { data, loading } = useLiveData(() => AmbarAPI.endpoints.locationsTree(), [], []);
  const [pages, setPages] = arS({});
  const archives = AmbarAPI.listFrom(data);
  const pageSize = 8;
  if (loading) return <Skeleton rows={9} />;
  if (!archives.length) return <Card><Empty icon="warehouse" title="Sin topografía">Crea una sede, un archivo y una ubicación topográfica para empezar.</Empty></Card>;
  return (
    <div className="grid cols-2 stagger">
      {archives.map((archive, i) => {
        const shelves = archive.shelves || [];
        const boxes = shelves.flatMap(s => s.boxes || []);
        const occupancy = boxes.length ? Math.round(boxes.reduce((acc, b) => acc + Number(b.occupancy_percent || 0), 0) / boxes.length) : 0;
        const page = pages[archive.archive_id] || 0;
        const visibleShelves = shelves.slice(page * pageSize, page * pageSize + pageSize);
        return (
          <Card key={archive.archive_id} className="topology-card an-scale" style={{ "--i": i }}>
            <div className="row between">
              <div>
                <div className="eyebrow">{archive.archive_code}</div>
                <h3>{archive.archive_name}</h3>
              </div>
              <Badge tone={pathTone(occupancy)}>{occupancy}% ocupación</Badge>
            </div>
            <div className="topology-tree">
              {shelves.length === 0 && <div className="tree-empty">Sin pasillos o estanterías parametrizadas.</div>}
              {visibleShelves.map((shelf) => (
                <details key={shelf.idShelf} open>
                  <summary>
                    <span className="tree-dot" />
                    <span className="grow">{shelfLabel(shelf)}</span>
                    <Badge tone={pathTone(shelf.occupancy_percent)}>{shelf.current_boxes || 0}/{shelf.capacity_boxes || 0}</Badge>
                  </summary>
                  <div className="tree-branch">
                    {(shelf.boxes || []).length === 0 && <div className="tree-empty">Sin cajas en esta ubicación.</div>}
                    {(shelf.boxes || []).map((box) => (
                      <div className="tree-row" key={box.idBox}>
                        <Icon name="boxes" size={15} />
                        <span className="cell-strong mono">{box.box_code}</span>
                        <span className="muted grow">{box.current_folders || 0} carpetas</span>
                        <Meter value={box.occupancy_percent || 0} tone={pathTone(box.occupancy_percent) === "success" ? "ok" : pathTone(box.occupancy_percent) === "warning" ? "warn" : "danger"} />
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <Pager
              page={page}
              pageSize={pageSize}
              total={shelves.length}
              label="ubicaciones"
              onPage={(next) => setPages(state => ({ ...state, [archive.archive_id]: next }))}
            />
          </Card>
        );
      })}
    </div>
  );
}

function BoxesView() {
  const { data: rawBoxes, loading } = useLiveData(() => AmbarAPI.endpoints.boxes(), [], []);
  const [selected, setSelected] = arS(null);
  const [q, setQ] = arS("");
  const [page, setPage] = arS(0);
  const allBoxes = AmbarAPI.listFrom(rawBoxes).map((b, i) => ({
    raw: b,
    id: b.idBox || b.id || i,
    code: b.box_code || b.code || `BOX-${i + 1}`,
    cap: b.occupancy_percent || (b.capacity_folders ? Math.round(((b.current_folders || 0) / b.capacity_folders) * 100) : 0),
    folders: b.current_folders || 0,
    docs: b.current_documents || 0,
    loc: b.physical_location_path || b.location_path || b.shelf_name || "Sin ubicación topográfica",
    state: b.status || "active"
  }));
  const boxes = allBoxes.filter((b) => {
    const text = `${b.code} ${b.loc} ${b.state}`.toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });
  const pageSize = 12;
  const visibleBoxes = boxes.slice(page * pageSize, page * pageSize + pageSize);
  if (loading) return <Skeleton rows={8} />;
  if (allBoxes.length === 0) return <Card><Empty icon="boxes" title="Sin cajas">No hay cajas creadas en la base de datos.</Empty></Card>;
  return (
    <>
      <div className="toolbar-card">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input value={q} onChange={(event) => { setQ(event.target.value); setPage(0); }} placeholder="Buscar caja, ruta o estado" />
        </div>
        <Badge tone="outline">{boxes.length} cajas</Badge>
      </div>
      <div className="grid cols-3 stagger">
        {visibleBoxes.map((b, i) => (
          <Card key={b.id} interactive pad="sm" className="archive-box-card" style={{ "--i": i }} onClick={() => setSelected(b.raw)}>
            <div className="row between" style={{ marginBottom: "var(--s3)" }}>
              <div className="row gap2"><Icon name="boxes" size={20} style={{ color: "var(--brand)" }} /><b className="mono">{b.code}</b></div>
              <Badge tone={b.state === "full" ? "danger" : "success"}>{b.state}</Badge>
            </div>
            <div className="kv" style={{ marginBottom: "var(--s3)" }}><span className="k">Ruta</span><span className="v mono compact-path">{b.loc}</span></div>
            <div className="row between" style={{ fontSize: "var(--fs-xs)", marginBottom: 4 }}><span className="muted">{b.folders} carpetas / {b.docs} docs</span><b className="mono">{b.cap}%</b></div>
            <Meter value={b.cap} tone={b.cap >= 90 ? "danger" : b.cap >= 71 ? "warn" : "ok"} />
          </Card>
        ))}
      </div>
      <Pager page={page} pageSize={pageSize} total={boxes.length} label="cajas" onPage={setPage} />
      {selected && <BoxDetail box={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function BoxDetail({ box, onClose }) {
  const { data, loading } = useLiveData(() => AmbarAPI.get(`/archives/boxes/${box.idBox}/contents`), null, [box.idBox]);
  const folders = data?.folders || [];
  return (
    <Drawer wide title={box.box_code} sub={box.location_path || "Caja sin ruta"} onClose={onClose}
      headExtra={<Badge tone={pathTone(box.occupancy_percent)}>{box.occupancy_percent || 0}%</Badge>}>
      <Card pad="sm">
        <CardHead title="Contenido de caja" sub="Carpetas y documentos heredando esta ubicación" icon="boxes" action={<Badge tone="outline">{folders.length} carpetas</Badge>} />
        {loading ? <Skeleton rows={5} /> : folders.length === 0 ? <Empty icon="folder" title="Caja vacía">No hay carpetas asignadas a esta caja.</Empty> : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Carpeta</th><th>Documentos</th><th>Folios</th><th>Ruta heredada</th></tr></thead>
              <tbody>{folders.map(folder => <tr key={folder.idFolder}><td className="cell-strong">{folder.folder_code} - {folder.folder_name}</td><td>{folder.documents_count}</td><td>{folder.folio_count}</td><td className="mono muted compact-path">{folder.location_path}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </Drawer>
  );
}

function UnassignedView() {
  const { data, loading } = useLiveData(() => AmbarAPI.endpoints.locationsUnassigned(), {}, []);
  const groups = [
    ["Cajas sin estanteria", data.boxes_without_shelf || [], "boxes"],
    ["Carpetas sin caja", data.folders_without_box || [], "folder"],
    ["Expedientes sin ubicación", data.expedients_without_location || [], "folder-kanban"],
    ["Documentos sin ubicación", data.documents_without_location || [], "file-text"],
  ];
  if (loading) return <Skeleton rows={8} />;
  return (
    <div className="grid cols-2">
      {groups.map(([title, rows, icon]) => (
        <Card key={title}>
          <CardHead title={title} icon={icon} action={<Badge tone={rows.length ? "warning" : "success"}>{rows.length}</Badge>} />
          {rows.length === 0 ? <Empty icon="check-circle" title="Todo al dia">No hay pendientes en este grupo.</Empty> : (
            <div className="mini-list">
              {rows.slice(0, 10).map((row, i) => <div key={row.idBox || row.idFolder || row.idExpedient || row.idDocument || i} className="mini-row"><Icon name={icon} size={15} /><span className="grow">{row.box_code || row.folder_code || row.expedient_code || row.document_name}</span><Badge tone="warning">pendiente</Badge></div>)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function MovementsView() {
  const [filters, setFilters] = arS({ movement_type: "", date_from: "", date_to: "" });
  const [page, setPage] = arS(0);
  const pageSize = 5;
  const query = arM(() => ({
    ...(filters.movement_type ? { movement_type: filters.movement_type } : {}),
    ...(filters.date_from ? { date_from: `${filters.date_from}T00:00:00` } : {}),
    ...(filters.date_to ? { date_to: `${filters.date_to}T23:59:59` } : {}),
    skip: page * pageSize,
    limit: pageSize,
  }), [filters, page]);
  const { data, loading } = useLiveData(() => AmbarAPI.endpoints.locationsMovements(query), [], [JSON.stringify(query)]);
  const rows = AmbarAPI.listFrom(data);
  const update = (key, value) => {
    setFilters((state) => ({ ...state, [key]: value }));
    setPage(0);
  };
  if (loading) return <Skeleton rows={8} />;
  if (!rows.length && !Object.values(filters).some(Boolean)) return <Card><Empty icon="route" title="Sin movimientos">Todavia no hay movimientos fisicos registrados.</Empty></Card>;
  return (
    <Card>
      <CardHead title="Movimientos fisicos" sub="Kardex generado por cambios de ubicacion" icon="route" />
      <div className="filter-bar">
        <select value={filters.movement_type} onChange={(event) => update("movement_type", event.target.value)}>
          <option value="">Todos los movimientos</option>
          <option value="shelf.created">Ubicacion creada</option>
          <option value="shelf.updated">Ubicacion actualizada</option>
          <option value="box.created">Caja creada</option>
          <option value="box.moved">Caja movida</option>
          <option value="folder.moved">Carpeta movida</option>
          <option value="location.assigned">Ubicacion asignada</option>
        </select>
        <input type="date" value={filters.date_from} onChange={(event) => update("date_from", event.target.value)} aria-label="Fecha desde" />
        <input type="date" value={filters.date_to} onChange={(event) => update("date_to", event.target.value)} aria-label="Fecha hasta" />
      </div>
      {!rows.length ? <Empty icon="filter" title="Sin resultados">No hay movimientos para estos filtros.</Empty> : (
        <div className="timeline">
          {rows.map((m, i) => (
            <div className="tl-item" key={m.idMovement || i}>
              <span className="tl-dot" />
              <div className="tl-card">
                <div className="row between"><b>{m.movement_type}</b><small className="muted">{m.created_at ? new Date(m.created_at).toLocaleString("es-CO") : ""}</small></div>
                <p className="muted">{m.observations || "Movimiento registrado en Kardex."}</p>
                <div className="mono compact-path">{m.metadata_json?.destination_location || m.status || ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} pageSize={pageSize} total={page * pageSize + rows.length + (rows.length === pageSize ? 1 : 0)} label="movimientos" onPage={setPage} />
    </Card>
  );
}

function CreatePhysicalModal({ mode, onClose, onCreated }) {
  const toast = useToast();
  const [kind, setKind] = arS(mode || "box");
  const [saving, setSaving] = arS(false);
  const [payload, setPayload] = arS({
    archive_id: "",
    location_id: "",
    shelf_id: "",
    archive_type: "central",
    capacity_units: 0,
    capacity_boxes: 20,
    capacity_folders: 30,
    status: "active",
    floors: "Piso 1",
    aisles: "1-3",
    shelves: "1-5",
    bodies: "A,B",
    levels: "1-4",
  });
  const { data: locationsRaw } = useLiveData(() => AmbarAPI.endpoints.locations(), [], []);
  const { data: archivesRaw } = useLiveData(() => AmbarAPI.endpoints.archives(), [], []);
  const { data: shelvesRaw } = useLiveData(() => AmbarAPI.endpoints.shelves(), [], []);
  const { data: optionRaw } = useLiveData(
    () => payload.archive_id ? AmbarAPI.endpoints.physicalStructureOptions(payload.archive_id) : Promise.resolve({}),
    {},
    [payload.archive_id]
  );
  const locations = AmbarAPI.listFrom(locationsRaw);
  const archives = AmbarAPI.listFrom(archivesRaw);
  const shelves = AmbarAPI.listFrom(shelvesRaw).filter(s => !payload.archive_id || Number(s.ps930IdArchive || s.archive_id) === Number(payload.archive_id));
  const optionList = (key) => Array.isArray(optionRaw?.[key]) ? optionRaw[key] : [];
  const bulkFloors = parseLocationList(payload.floors, ["Piso 1"]);
  const bulkAisles = parseLocationList(payload.aisles);
  const bulkShelves = parseLocationList(payload.shelves);
  const bulkBodies = parseLocationList(payload.bodies, ["A"]);
  const bulkLevels = parseLocationList(payload.levels, ["1"]);
  const bulkTotal = bulkFloors.length * bulkAisles.length * bulkShelves.length * bulkBodies.length * bulkLevels.length;
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const resetLocationPickers = () => setPayload(p => ({ ...p, floor: "", aisle: "", shelf_code: "", body: "", level: "" }));

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let created;
      if (kind === "site") {
        if (!payload.location_name?.trim()) return toast("Falta nombre de la sede.", { tone: "danger", title: "Sede incompleta" });
        created = await AmbarAPI.post("/transfers/locations", { location_name: payload.location_name.trim(), address: payload.address || null });
      }
      if (kind === "archive") {
        const missing = [];
        if (!payload.archive_name?.trim()) missing.push("nombre");
        if (!payload.location_id) missing.push("sede");
        if (missing.length) return toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Archivo incompleto" });
        created = await AmbarAPI.post("/archives", {
          archive_code: null,
          archive_name: payload.archive_name.trim(),
          archive_type: payload.archive_type,
          location_id: Number(payload.location_id),
          capacity_units: Number(payload.capacity_units || 0),
          description: payload.description || null,
          metadata: {},
        });
      }
      if (kind === "bulk") {
        if (!payload.archive_id) return toast("Selecciona el archivo que recibira la topografia.", { tone: "danger", title: "Infraestructura incompleta" });
        if (!bulkAisles.length || !bulkShelves.length || !bulkBodies.length || !bulkLevels.length) {
          return toast("Completa pasillos, estanterias, cuerpos y niveles.", { tone: "danger", title: "Topografia incompleta" });
        }
        created = await AmbarAPI.post("/archives/physical-structure/bulk", {
          archive_id: Number(payload.archive_id),
          floors: bulkFloors,
          aisles: bulkAisles,
          shelves: bulkShelves,
          bodies: bulkBodies,
          levels: bulkLevels,
          capacity_boxes: Number(payload.capacity_boxes || 0),
        });
      }
      if (kind === "shelf") {
        const missing = [];
        ["archive_id", "aisle", "shelf_code", "body", "level"].forEach(key => { if (!String(payload[key] || "").trim()) missing.push(key === "archive_id" ? "archivo" : key); });
        if (missing.length) return toast(`Falta seleccionar: ${missing.join(", ")}.`, { tone: "danger", title: "Ubicacion incompleta" });
        created = await AmbarAPI.post("/archives/shelves", {
          archive_id: Number(payload.archive_id),
          shelf_code: payload.shelf_code.trim(),
          shelf_name: `Pasillo ${payload.aisle} - Estanteria ${payload.shelf_code} - Cuerpo ${payload.body} - Nivel ${payload.level}`,
          aisle: payload.aisle.trim(),
          floor: payload.floor || null,
          body: payload.body.trim(),
          level: payload.level.trim(),
          capacity_boxes: Number(payload.capacity_boxes || 0),
        });
      }
      if (kind === "box") {
        const missing = [];
        if (!payload.archive_id) missing.push("archivo");
        if (!payload.shelf_id) missing.push("ubicacion topografica");
        if (missing.length) return toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Caja incompleta" });
        created = await AmbarAPI.post("/archives/boxes", {
          archive_id: Number(payload.archive_id),
          shelf_id: Number(payload.shelf_id),
          box_code: null,
          box_name: payload.box_name || null,
          capacity_folders: Number(payload.capacity_folders || 0),
        });
      }
      toast("Operacion registrada en backend.", { tone: "ok", title: "Custodia actualizada" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible guardar.", { tone: "danger", title: "Error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal wide title="Parametrizar archivo fisico" sub="Crea sede, archivo, topografia o caja. Las rutas no se escriben en carpetas ni documentos." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button></>}>
      <Segmented value={kind} onChange={(value) => { setKind(value); if (value === "shelf") resetLocationPickers(); }} options={[
        { value: "site", label: "Sede", icon: "map-pin" },
        { value: "archive", label: "Archivo", icon: "warehouse" },
        { value: "bulk", label: "Topografia masiva", icon: "layers" },
        { value: "shelf", label: "Ubicacion", icon: "table" },
        { value: "box", label: "Caja", icon: "boxes" },
      ]} />
      <div className="divider" />
      {kind === "site" && <div className="grid cols-2"><Field label="Nombre sede" required><input value={payload.location_name || ""} onChange={e => setField("location_name", e.target.value)} placeholder="Sede Cali" /></Field><Field label="Direccion"><input value={payload.address || ""} onChange={e => setField("address", e.target.value)} placeholder="Direccion fisica" /></Field></div>}
      {kind === "archive" && <div className="grid cols-2">
        <Field label="Sede" required><select value={payload.location_id || ""} onChange={e => setField("location_id", e.target.value)}><option value="">Seleccionar sede</option>{locations.map(l => <option key={l.idLocation || l.id} value={l.idLocation || l.id}>{l.location_name}</option>)}</select></Field>
        <Field label="Tipo" required><select value={payload.archive_type} onChange={e => setField("archive_type", e.target.value)}><option value="gestion">Gestion</option><option value="central">Central</option><option value="historico">Historico</option><option value="satelite">Satelite</option></select></Field>
        <Field label="Codigo" hint="AMBAR genera este codigo automaticamente al guardar el archivo."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input value={payload.archive_name || ""} onChange={e => setField("archive_name", e.target.value)} placeholder="Archivo Central Cali" /></Field>
        <Field label="Capacidad cajas"><input type="number" min="0" value={payload.capacity_units || 0} onChange={e => setField("capacity_units", e.target.value)} /></Field>
      </div>}
      {kind === "bulk" && <div className="grid cols-2">
        <Field label="Archivo" required><select value={payload.archive_id || ""} onChange={e => setField("archive_id", e.target.value)}><option value="">Seleccionar archivo</option>{archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name}</option>)}</select></Field>
        <Field label="Pisos"><input value={payload.floors || ""} onChange={e => setField("floors", e.target.value)} placeholder="Piso 1" /></Field>
        <Field label="Pasillos" required hint="Ejemplo: 1-5 o A,B,C"><input value={payload.aisles || ""} onChange={e => setField("aisles", e.target.value)} placeholder="1-5" /></Field>
        <Field label="Estanterias" required><input value={payload.shelves || ""} onChange={e => setField("shelves", e.target.value)} placeholder="1-10" /></Field>
        <Field label="Cuerpos / modulos" required><input value={payload.bodies || ""} onChange={e => setField("bodies", e.target.value)} placeholder="A,B" /></Field>
        <Field label="Niveles / entrepanos" required><input value={payload.levels || ""} onChange={e => setField("levels", e.target.value)} placeholder="1-6" /></Field>
        <Field label="Capacidad por nivel"><input type="number" min="0" value={payload.capacity_boxes || 0} onChange={e => setField("capacity_boxes", e.target.value)} /></Field>
        <Card pad="sm" style={{ background: "var(--panel-2)" }}>
          <CardHead title={`${bulkTotal || 0} ubicaciones por crear`} sub="AMBAR crea rutas seleccionables. Despues las cajas se asignan a estas rutas y las carpetas heredan ubicacion." icon="shield-check" />
        </Card>
      </div>}
      {kind === "shelf" && <div className="grid cols-2">
        <Field label="Archivo" required><select value={payload.archive_id || ""} onChange={e => { setField("archive_id", e.target.value); resetLocationPickers(); }}><option value="">Seleccionar archivo</option>{archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name}</option>)}</select></Field>
        <Field label="Piso"><select value={payload.floor || ""} onChange={e => setField("floor", e.target.value)} disabled={!payload.archive_id}><option value="">Seleccionar piso</option>{optionList("floors").map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Pasillo" required><select value={payload.aisle || ""} onChange={e => setField("aisle", e.target.value)} disabled={!payload.archive_id}><option value="">Seleccionar pasillo</option>{optionList("aisles").map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Estanteria" required><select value={payload.shelf_code || ""} onChange={e => setField("shelf_code", e.target.value)} disabled={!payload.archive_id}><option value="">Seleccionar estanteria</option>{optionList("shelves").map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Cuerpo / modulo" required><select value={payload.body || ""} onChange={e => setField("body", e.target.value)} disabled={!payload.archive_id}><option value="">Seleccionar cuerpo</option>{optionList("bodies").map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Nivel / entrepano" required><select value={payload.level || ""} onChange={e => setField("level", e.target.value)} disabled={!payload.archive_id}><option value="">Seleccionar nivel</option>{optionList("levels").map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Capacidad cajas"><input type="number" min="0" value={payload.capacity_boxes || 0} onChange={e => setField("capacity_boxes", e.target.value)} /></Field>
        <Card pad="sm" style={{ background: "var(--panel-2)" }}><CardHead title="Seleccion desde catalogos" sub="Si no aparecen opciones, primero crea la topografia masiva del archivo." icon="info" /></Card>
      </div>}
      {kind === "box" && <div className="grid cols-2">
        <Field label="Archivo" required><select value={payload.archive_id || ""} onChange={e => { setField("archive_id", e.target.value); setField("shelf_id", ""); }}><option value="">Seleccionar archivo</option>{archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name}</option>)}</select></Field>
        <Field label="Ubicacion topografica" required><select value={payload.shelf_id || ""} onChange={e => setField("shelf_id", e.target.value)}><option value="">Seleccionar pasillo / estanteria / nivel</option>{shelves.map(s => <option key={s.idShelf || s.id} value={s.idShelf || s.id}>{shelfLabel(s)}</option>)}</select></Field>
        <Field label="Codigo caja" hint="AMBAR genera este codigo automaticamente al guardar la caja."><AutoCodeInput /></Field>
        <Field label="Nombre"><input value={payload.box_name || ""} onChange={e => setField("box_name", e.target.value)} placeholder="Contratos 2026" /></Field>
        <Field label="Capacidad carpetas"><input type="number" min="0" value={payload.capacity_folders || 0} onChange={e => setField("capacity_folders", e.target.value)} /></Field>
      </div>}
    </Modal>
  );
}

function ArchivePage({ user }) {
  const [tab, setTab] = arS("quick");
  const [creating, setCreating] = arS(false);
  const { data: dash } = useLiveData(() => AmbarAPI.endpoints.locationsSummary(), {}, []);
  const canManage = can(user, ["archive.manage"]);
  const tabs = arM(() => [
    { key: "quick", label: "Consulta rapida", icon: "search" },
    { key: "map", label: "Mapa topografico", icon: "warehouse" },
    { key: "boxes", label: "Cajas", icon: "boxes" },
    { key: "unassigned", label: "Sin ubicación", icon: "alert-triangle", count: dash.folders_without_box || 0 },
    { key: "movements", label: "Movimientos", icon: "route" },
  ], [dash.folders_without_box]);
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Archivo & Custodia</div><h1>Archivo Físico</h1><p className="lead">Parametriza sede, archivo, pasillo, estantería, cuerpo, nivel y caja. Las carpetas, expedientes y documentos heredan la ruta física.</p></div>
        <div className="page-actions">{canManage ? <Button icon="plus" onClick={() => setCreating(true)}>Parametrizar</Button> : <Button variant="ghost" icon="lock" disabled>Sin permiso</Button>}</div>
      </div>
      <div className="grid cols-4 stagger">
        <Metric label="Archivos" value={dash.archives || 0} icon="warehouse" tone="brand" accent />
        <Metric label="Estanterías" value={dash.shelves || 0} icon="table" tone="info" accent />
        <Metric label="Cajas" value={dash.boxes || 0} icon="boxes" tone="ok" accent />
        <Metric label="Unidades sin caja" value={dash.folders_without_box || 0} icon="alert-triangle" tone="warn" accent />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "quick" && <QuickSearch />}
      {tab === "map" && <TopologyView />}
      {tab === "boxes" && <BoxesView />}
      {tab === "unassigned" && <UnassignedView />}
      {tab === "movements" && <MovementsView />}
      {creating && <CreatePhysicalModal onClose={() => setCreating(false)} onCreated={() => setTab("map")} />}
    </>
  );
}

window.ArchivePage = ArchivePage;
