/* ============================================================
   AMBAR - Gestion Documental: Expedientes
   ============================================================ */
const { useState: exS } = React;

const EXP_TYPES = [
  { key: "laboral", label: "Laborales", icon: "briefcase", color: "var(--viz-rose)" },
  { key: "administrativo", label: "Administrativos", icon: "folder-kanban", color: "var(--viz-teal)" },
  { key: "contable", label: "Contables", icon: "building", color: "var(--viz-amber)" },
  { key: "juridico", label: "Jurídicos", icon: "file-text", color: "var(--viz-indigo)" },
  { key: "electronico", label: "Electrónicos", icon: "database", color: "var(--viz-violet)" },
  { key: "hibrido", label: "Híbridos", icon: "workflow", color: "var(--viz-green)" },
];

function normalizeExpedientType(value) {
  return String(value || "administrativo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeExpedient(item, i) {
  return {
    backendId: item.idExpedient || item.id,
    id: item.expedient_code || item.code || item.idExpedient || `EXP-${i + 1}`,
    name: item.expedient_name || item.name || item.expedient_code || "Expediente sin nombre",
    type: normalizeExpedientType(item.expedient_type || item.type || "administrativo"),
    area: item.dependency_name || item.archive_name || item.department || "Archivo",
    docs: item.documents_count || item.total_documents || 0,
    compliance: item.compliance_percent || item.completeness || item.compliance || 0,
    loc: item.physical_location_path || item.location_path || item.archive_name || "Digital",
    state: item.status || "active",
    updated: item.updated_at ? String(item.updated_at).slice(0, 10) : "-",
    color: EXP_TYPES[i % EXP_TYPES.length].color,
  };
}

function ExpedientDetail({ exp, onClose, navigate }) {
  const toast = useToast();
  const [folderDraft, setFolderDraft] = exS({ folder_code: "", folder_name: "" });
  const [creatingFolder, setCreatingFolder] = exS(false);
  const tc = EXP_TYPES.find(t => t.key === exp.type) || EXP_TYPES[1];
  const { data: docsRaw, loading } = useLiveData(() => AmbarAPI.endpoints.documents(), [], [exp.backendId]);
  const foldersLive = useLiveData(() => exp.backendId ? AmbarAPI.endpoints.folders(exp.backendId) : Promise.resolve([]), [], [exp.backendId]);
  const docs = AmbarAPI.listFrom(docsRaw).filter(d => {
    const expId = d.expedient_id || d.ps950IdExpedient || d.idExpedient;
    const expCode = d.expedient_code || "";
    return String(expId || "") === String(exp.backendId || "") || String(expCode).toLowerCase() === String(exp.id).toLowerCase();
  });
  const folders = AmbarAPI.listFrom(foldersLive.data);
  const nextAction = docs.length === 0
    ? { label: "Registrar documento", route: "documents", icon: "file-text", text: "Este expediente no tiene documentos asociados." }
    : folders.length === 0
      ? { label: "Crear carpeta", route: null, icon: "folders", text: "Organiza los documentos en una unidad de conservacion." }
      : exp.compliance < 100
        ? { label: "Revisar foliacion", route: "foliation", icon: "list-checks", text: "La completitud documental aun no esta al 100%." }
        : { label: "Ver Kardex", route: "kardex", icon: "history", text: "El expediente esta listo para revisar trazabilidad." };
  const createFolder = async () => {
    if (!folderDraft.folder_name.trim()) {
      toast("El nombre de carpeta es obligatorio. El código lo puede generar AMBAR.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    setCreatingFolder(true);
    try {
      await AmbarAPI.post("/archives/folders", { ...folderDraft, folder_code: folderDraft.folder_code.trim() || null, expedient_id: Number(exp.backendId), metadata: {} });
      toast("Carpeta creada dentro del expediente.", { tone: "ok", title: "Carpeta lista" });
      setFolderDraft({ folder_code: "", folder_name: "" });
      foldersLive.setData(await AmbarAPI.endpoints.folders(exp.backendId));
    } catch (err) {
      toast(err.message || "No fue posible crear la carpeta.", { tone: "danger", title: "Error" });
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <Drawer wide title={exp.name} sub={<span className="mono">{exp.id}</span>} onClose={onClose}
      headExtra={<Badge tone={String(exp.state).toLowerCase().includes("active") || exp.state === "Abierto" ? "success" : "neutral"} dot>{exp.state}</Badge>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Card pad="sm">
          <div className="row gap2" style={{ marginBottom: "var(--s3)" }}>
            <span className="m-icon" style={{ background: `color-mix(in oklab, ${tc.color} 16%, transparent)`, color: tc.color }}>
              <Icon name={tc.icon} size={18} />
            </span>
            <div><div style={{ fontWeight: 700 }}>{tc.label || exp.type}</div><small className="muted">{exp.area}</small></div>
          </div>
          <div className="dl">
            <dt>Documentos</dt><dd>{docs.length || exp.docs}</dd>
            <dt>Ubicacion</dt><dd className="mono" style={{ fontSize: "var(--fs-xs)" }}>{exp.loc}</dd>
            <dt>Ultima actualizacion</dt><dd>{exp.updated || "-"}</dd>
            <dt>Estado</dt><dd>{exp.state}</dd>
          </div>
        </Card>
        <Card pad="sm">
          <div className="row between" style={{ marginBottom: "var(--s3)" }}>
            <b style={{ fontSize: "var(--fs-sm)" }}>Completitud documental</b>
            <Badge tone={exp.compliance >= 90 ? "success" : exp.compliance >= 70 ? "warning" : "danger"}>{exp.compliance}%</Badge>
          </div>
          <Meter value={exp.compliance} tone={exp.compliance >= 90 ? "ok" : exp.compliance >= 70 ? "warn" : "danger"} />
          <p className="muted" style={{ marginTop: "var(--s3)", fontSize: "var(--fs-sm)" }}>
            AMBAR calcula la completitud con documentos reales asociados y reglas de TRD cuando el backend las entrega.
          </p>
        </Card>
      </div>
      <Card className="workspace-actions">
        <div className="row between wrap" style={{ gap: "var(--s4)", alignItems: "flex-start" }}>
          <div className="row gap3" style={{ minWidth: 0 }}>
            <span className="m-icon" style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}><Icon name={nextAction.icon} size={18} /></span>
            <div>
              <h3 style={{ fontSize: "var(--fs-md)" }}>Siguiente accion sugerida</h3>
              <p className="muted" style={{ marginTop: 4 }}>{nextAction.text}</p>
            </div>
          </div>
          <Button icon={nextAction.icon} onClick={() => nextAction.route ? navigate(nextAction.route) : document.querySelector('[placeholder="CAR-001"]')?.focus()}>{nextAction.label}</Button>
        </div>
        <div className="quick-actions compact">
          <button className="quick-action" onClick={() => navigate && navigate("documents")}><Icon name="file-text" size={16} /><span>Documentos</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("foliation")}><Icon name="list-checks" size={16} /><span>Foliacion</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("transfers")}><Icon name="route" size={16} /><span>Transferir</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("loans")}><Icon name="package-check" size={16} /><span>Prestar</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("archive")}><Icon name="warehouse" size={16} /><span>Ubicacion</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("kardex")}><Icon name="history" size={16} /><span>Kardex</span></button>
        </div>
      </Card>
      <div className="grid cols-2" style={{ gap: "var(--s4)", marginTop: "var(--s4)" }}>
        <Card>
          <CardHead title="Documentos del expediente" sub="Registros reales asociados" icon="file-text" action={<Badge tone="outline">{docs.length}</Badge>} />
          {loading ? <Skeleton rows={4} /> : docs.length === 0 ? <Empty icon="file-text" title="Sin documentos asociados">No hay documentos ligados a este expediente en backend.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Documento</th><th>Tipo</th><th>Archivos</th></tr></thead>
                <tbody>{docs.map(d => <tr key={d.idDocument || d.id}><td className="cell-strong">{d.document_name || d.title || d.name}</td><td><span className="tag-soft">{d.document_type || d.type_name || "Sin tipología"}</span></td><td>{d.files_count || d.digital_files_count || 0}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <Button variant="ghost" className="btn-block" icon="file-text" onClick={() => navigate && navigate("documents")}>Ver documentos</Button>
        </Card>
        <Card>
          <CardHead title="Carpetas del expediente" sub="Unidad de conservación para clasificar documentos" icon="folders" action={<Badge tone="outline">{folders.length}</Badge>} />
          {foldersLive.loading ? <Skeleton rows={3} /> : folders.length === 0 ? <Empty icon="folders" title="Sin carpetas">Crea la primera carpeta para poder registrar documentos completos.</Empty> : (
            <div className="col gap2">{folders.slice(0, 5).map(folder => <div key={folder.idFolder || folder.id} className="row between" style={{ padding: "var(--s3)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}><span className="cell-strong">{folder.folder_code || folder.code}</span><span className="muted">{folder.folder_name || folder.name}</span></div>)}</div>
          )}
          <div className="divider" />
          <div className="grid cols-2">
            <Field label="Código" help="AMBAR genera este código automáticamente al guardar la carpeta."><AutoCodeInput /></Field>
            <Field label="Nombre"><input value={folderDraft.folder_name} onChange={e => setFolderDraft(p => ({ ...p, folder_name: e.target.value }))} placeholder="Contratos 2026" maxLength={160} /></Field>
          </div>
          <Button variant="ghost" className="btn-block" icon="plus" onClick={createFolder} disabled={creatingFolder}>{creatingFolder ? "Creando..." : "Crear carpeta"}</Button>
        </Card>
      </div>
      <Card>
        <CardHead title="Trazabilidad" sub="No se inventan movimientos; se consulta Kardex y custodia cuando el backend tenga eventos" icon="history" />
        <div className="quick-actions compact">
          <button className="quick-action" onClick={() => navigate && navigate("archive")}><Icon name="warehouse" size={16} /><span>Ver custodia</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("kardex")}><Icon name="history" size={16} /><span>Ver Kardex</span></button>
          <button className="quick-action" onClick={() => navigate && navigate("audit")}><Icon name="shield-check" size={16} /><span>Ver auditoria</span></button>
        </div>
      </Card>
    </Drawer>
  );
}

function CreateExpedientModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = exS({ expedient_code: "", expedient_name: "", expedient_type: "administrativo", metadata: {} });
  const { data: archivesRaw } = useLiveData(() => AmbarAPI.endpoints.archives(), [], []);
  const { data: depsRaw } = useLiveData(() => AmbarAPI.endpoints.trdDependencies(), [], []);
  const { data: seriesRaw } = useLiveData(() => AmbarAPI.endpoints.trdSeries(), [], []);
  const { data: subRaw } = useLiveData(() => AmbarAPI.endpoints.trdSubseries(), [], []);
  const archives = AmbarAPI.listFrom(archivesRaw);
  const dependencies = AmbarAPI.listFrom(depsRaw);
  const series = AmbarAPI.listFrom(seriesRaw);
  const subseries = AmbarAPI.listFrom(subRaw).filter(s => !payload.series_id || Number(s.ps610IdSeries || s.series_id) === Number(payload.series_id));
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));

  const submit = async () => {
    const missing = [];
    if (!payload.expedient_name.trim()) missing.push("nombre");
    if (!payload.archive_id) missing.push("archivo");
    if (!payload.series_id) missing.push("serie");
    if (!payload.subseries_id) missing.push("subserie");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "No se puede crear" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/archives/expedients", {
        ...payload,
        expedient_code: null,
        archive_id: Number(payload.archive_id),
        series_id: Number(payload.series_id),
        subseries_id: Number(payload.subseries_id),
        dependency_id: payload.dependency_id ? Number(payload.dependency_id) : null,
        digital_location: payload.digital_location?.trim() || null,
      });
      toast("Expediente creado y asociado a TRD.", { tone: "ok", title: "Expediente creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el expediente.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal lg title="Nuevo expediente" sub="Clasifica el expediente desde TRD. El archivo y la retencion quedan trazables." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear expediente</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Código" help="AMBAR genera este código automáticamente al guardar el expediente."><AutoCodeInput /></Field>
        <Field label="Nombre" required><input value={payload.expedient_name} maxLength={220} placeholder="Historia laboral / proceso / contrato" onChange={e => setField("expedient_name", e.target.value)} /></Field>
        <Field label="Tipo"><select value={payload.expedient_type} onChange={e => setField("expedient_type", e.target.value)}>{["administrativo", "laboral", "contable", "juridico", "electronico", "hibrido"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Archivo" required><select value={payload.archive_id || ""} onChange={e => setField("archive_id", Number(e.target.value) || null)}><option value="">Seleccionar archivo</option>{archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name || a.name || a.archive_code}</option>)}</select></Field>
        <Field label="Dependencia TRD"><select value={payload.dependency_id || ""} onChange={e => setField("dependency_id", Number(e.target.value) || null)}><option value="">Heredar de la serie</option>{dependencies.map(d => <option key={d.idDependency || d.id} value={d.idDependency || d.id}>{d.name || d.dependency_name || d.code}</option>)}</select></Field>
        <Field label="Serie" required><select value={payload.series_id || ""} onChange={e => { setField("series_id", Number(e.target.value) || null); setField("subseries_id", null); }}><option value="">Seleccionar serie</option>{series.map(s => <option key={s.idSeries || s.id} value={s.idSeries || s.id}>{s.code ? `${s.code} - ` : ""}{s.name || s.series_name}</option>)}</select></Field>
        <Field label="Subserie" required><select value={payload.subseries_id || ""} onChange={e => setField("subseries_id", Number(e.target.value) || null)}><option value="">Seleccionar subserie</option>{subseries.map(s => <option key={s.idSubseries || s.id} value={s.idSubseries || s.id}>{s.name || s.subseries_name}</option>)}</select></Field>
        <Field label="Ruta digital opcional" hint="Referencia logica del repositorio. No es una ruta interna del servidor."><input value={payload.digital_location || ""} maxLength={180} placeholder="Repositorio/RRHH/2026/Juan Perez" onChange={e => setField("digital_location", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ExpedientsPage({ user, navigate }) {
  const [type, setType] = exS("");
  const [q, setQ] = exS("");
  const [detail, setDetail] = exS(null);
  const [creating, setCreating] = exS(false);
  const liveExpedients = window.useLiveData(
    () => window.AmbarAPI.endpoints.expedients().then(value => window.AmbarAPI.listFrom(value).map(normalizeExpedient)),
    [],
    []
  );
  const rows = liveExpedients.data.filter(e => (!type || e.type === type) && (!q || (e.name + e.id).toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Expedientes</h1><p className="lead">El expediente es la unidad principal de AMBAR: agrupa documentos, carpetas, folios, custodia y trazabilidad de un proceso documental.</p></div>
        <div className="page-actions">{can(user, ["document.create"]) && <Button icon="plus" onClick={() => setCreating(true)}>Nuevo expediente</Button>}</div>
      </div>

      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>Por qué expedientes</h4><p>En lugar de buscar documentos sueltos, los agrupas por su contexto real. Así un empleado, un proveedor o un proceso jurídico tienen toda su información en un solo lugar, con completitud y trazabilidad.</p></div></div>

      <div className="grid exp-type-grid">
        {EXP_TYPES.map((t, i) => {
          const count = liveExpedients.data.filter(e => e.type === t.key).length;
          return <Card key={t.key} interactive pad="sm" className="an-scale" style={{ "--i": i, borderColor: type === t.key ? t.color : "", borderWidth: type === t.key ? 2 : 1 }} onClick={() => setType(type === t.key ? "" : t.key)}>
            <span className="m-icon" style={{ background: `color-mix(in oklab, ${t.color} 16%, transparent)`, color: t.color, marginBottom: 8 }}><Icon name={t.icon} size={18} /></span>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-xl)", fontWeight: 800 }}>{count}</div>
            <small className="muted">{t.label}</small>
          </Card>;
        })}
      </div>

      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar expediente por nombre o codigo..." /></div>
          {type && <FilterChip label={type} active onClick={() => setType("")} />}
        </div>
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre / Entidad</th><th>Tipo</th><th>Área</th><th>Docs</th><th>Completitud</th><th>Ubicación</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map(e => {
                const tc = EXP_TYPES.find(t => t.key === e.type) || EXP_TYPES[1];
                return <tr key={e.id} className="clickable" onClick={() => setDetail(e)}>
                  <td className="cell-mono">{e.id}</td>
                  <td><div className="t-avatar"><span className="avatar sm" style={{ background: tc.color }}><Icon name={tc.icon} size={13} /></span><span className="cell-strong">{e.name}</span></div></td>
                  <td><span className="tag-soft">{tc.label || e.type}</span></td>
                  <td>{e.area}</td>
                  <td className="mono">{e.docs}</td>
                  <td style={{ minWidth: 130 }}><Meter value={e.compliance} tone={e.compliance >= 90 ? "ok" : e.compliance >= 70 ? "warn" : "danger"} showLabel /></td>
                  <td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.loc}</td>
                  <td><Badge tone={String(e.state).toLowerCase().includes("active") || e.state === "Abierto" ? "success" : "neutral"} dot>{e.state}</Badge></td>
                  <td onClick={ev => ev.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setDetail(e)} /></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && <ExpedientDetail exp={detail} onClose={() => setDetail(null)} navigate={navigate} />}
      {creating && <CreateExpedientModal onClose={() => setCreating(false)} onCreated={(created) => liveExpedients.setData(current => [normalizeExpedient(created, 0), ...(current || [])])} />}
    </>
  );
}

window.ExpedientsPage = ExpedientsPage;
