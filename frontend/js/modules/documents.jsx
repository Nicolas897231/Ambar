/* ============================================================
   AMBAR - Gestión Documental: Documentos
   ============================================================ */

const DOC_STATES = { active: "success", created: "success", draft: "warning", archived: "neutral", incomplete: "danger", locked: "danger" };

function normalizeDoc(item, i) {
  return {
    id: item.idDocument || item.id || i + 1,
    code: item.document_code || item.code || `DOC-${item.idDocument || i + 1}`,
    name: item.document_name || item.title || item.name || "Documento sin nombre",
    type: item.document_type || item.type_code || item.type_name || "Sin tipología",
    archiveId: item.archive_id || item.ps930IdArchive,
    expedientId: item.expedient_id || item.ps950IdExpedient,
    folderId: item.folder_id || item.ps952IdFolder,
    subseriesId: item.subseries_id || item.ps612IdSubseries,
    state: item.status || "created",
    owner: item.owner || item.created_by || item.ps405Identification || "AMBAR",
    folioStart: item.folio_start,
    folioEnd: item.folio_end,
    folioTotal: item.folio_total || 0,
    files: item.files_count || item.files?.length || 0,
    location: item.physical_location || "Sin ubicación física",
    metadata: item.metadata || item.metadata_json || {},
    raw: item,
  };
}

function fieldValue(type, key) {
  if (!type || !key) return "";
  return type[key] ?? type[`ps${key}`] ?? "";
}

function schemaForType(type) {
  const schema = Array.isArray(type?.metadata_schema) ? type.metadata_schema : [];
  const required = Array.isArray(type?.required_metadata) ? type.required_metadata : [];
  const optional = Array.isArray(type?.optional_metadata) ? type.optional_metadata : [];
  if (schema.length) return schema;
  return [
    ...required.map(key => ({ key, label: key.replaceAll("_", " "), required: true, type: "text" })),
    ...optional.filter(key => !required.includes(key)).map(key => ({ key, label: key.replaceAll("_", " "), required: false, type: "text" })),
  ];
}

function DocumentDetail({ doc, onClose, onUpdated }) {
  const toast = useToast();
  const [tab, setTab] = useState("info");
  const [uploading, setUploading] = useState(false);
  const filesLive = useLiveData(() => AmbarAPI.endpoints.documentFiles(doc.id), [], [doc.id]);
  const versionsLive = useLiveData(() => AmbarAPI.endpoints.documentVersions(doc.id), {}, [doc.id]);
  const metadataLive = useLiveData(() => AmbarAPI.endpoints.documentMetadata(doc.id), {}, [doc.id]);
  const files = AmbarAPI.listFrom(filesLive.data);
  const versionFiles = AmbarAPI.listFrom(versionsLive.data, ["files", "items", "versions"]);
  const metadata = metadataLive.data?.metadata || metadataLive.data || doc.metadata || {};

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await AmbarAPI.form(`/documents/${doc.id}/files`, form);
      toast("Archivo digital cargado y versionado.", { tone: "ok", title: "Repositorio actualizado" });
      filesLive.setData(await AmbarAPI.endpoints.documentFiles(doc.id));
      versionsLive.setData(await AmbarAPI.endpoints.documentVersions(doc.id));
      onUpdated?.();
    } catch (err) {
      toast(err.message || "No fue posible cargar el archivo.", { tone: "danger", title: "Carga rechazada" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const downloadFile = async (file) => {
    try {
      await AmbarAPI.download(`/documents/${doc.id}/files/${file.idFile}/download`, file.original_name);
      toast("Descarga segura solicitada.", { tone: "ok", title: "Archivo preparado" });
    } catch (err) {
      toast(err.message || "No fue posible descargar.", { tone: "danger", title: "Descarga bloqueada" });
    }
  };

  return (
    <Drawer wide title={doc.name} sub={<span className="mono">{doc.code} - {doc.type}</span>} onClose={onClose}
      headExtra={<Badge tone={DOC_STATES[String(doc.state).toLowerCase()] || "neutral"} dot>{doc.state}</Badge>}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "info", label: "Información", icon: "file-text" },
        { key: "files", label: "Archivos", icon: "database", count: files.length },
        { key: "versions", label: "Versiones", icon: "git-branch", count: versionFiles.length },
        { key: "metadata", label: "Metadatos", icon: "braces" },
      ]} />

      {tab === "info" && (
        <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
          <div className="kv"><span className="k">Tipología documental</span><span className="v">{doc.type}</span></div>
          <div className="kv"><span className="k">Responsable</span><span className="v">{doc.owner}</span></div>
          <div className="kv"><span className="k">Archivo</span><span className="v">{doc.archiveId || "Sin archivo"}</span></div>
          <div className="kv"><span className="k">Expediente</span><span className="v">{doc.expedientId || "Sin expediente"}</span></div>
          <div className="kv"><span className="k">Carpeta</span><span className="v">{doc.folderId || "Sin carpeta"}</span></div>
          <div className="kv"><span className="k">Folios</span><span className="v">{doc.folioStart && doc.folioEnd ? `${doc.folioStart} a ${doc.folioEnd}` : doc.folioTotal || 0}</span></div>
          <div className="kv"><span className="k">Archivos digitales</span><span className="v">{files.length || doc.files}</span></div>
          <div className="kv"><span className="k">Ubicación física</span><span className="v">{doc.location}</span></div>
        </div>
      )}

      {tab === "files" && (
        <Card>
          <CardHead title="Archivos digitales" sub="Cada carga crea nueva versión; no se sobrescribe el original." icon="database"
            action={<label className={`btn btn-primary btn-sm${uploading ? " disabled" : ""}`}><Icon name="upload" size={14} /> <span>{uploading ? "Cargando..." : "Cargar archivo"}</span><input type="file" onChange={uploadFile} disabled={uploading} style={{ display: "none" }} /></label>} />
          {filesLive.loading ? <Skeleton rows={4} /> : files.length === 0 ? <Empty icon="upload-cloud" title="Sin archivos digitales">Este registro puede existir como documento físico. Carga un archivo cuando tengas soporte digital.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Archivo</th><th>Tipo</th><th>Versión</th><th>Tamaño</th><th>Acción</th></tr></thead>
                <tbody>{files.map(file => <tr key={file.idFile}>
                  <td className="cell-strong">{file.original_name}</td>
                  <td>{file.content_type}</td>
                  <td>{file.version}</td>
                  <td>{formatBytes(file.size_bytes)}</td>
                  <td><Button variant="ghost" size="sm" icon="download" onClick={() => downloadFile(file)}>Descargar</Button></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "versions" && (
        <Card>
          <CardHead title="Historial de versiones" sub="Versionamiento informado por backend" icon="git-branch" />
          {versionFiles.length === 0 ? <Empty icon="git-branch" title="Sin versiones digitales">Las versiones aparecerán después de cargar archivos.</Empty> : (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Versión</th><th>Archivo</th><th>Checksum</th><th>Fecha</th></tr></thead>
                <tbody>{versionFiles.map(file => <tr key={file.idFile || file.version}>
                  <td>{file.version}</td><td>{file.original_name}</td><td className="cell-mono">{file.checksum}</td><td>{String(file.uploaded_at || "").slice(0, 19)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "metadata" && (
        <Card pad="sm" style={{ background: "var(--panel-2)" }}>
          <CardHead title="Metadatos reales" sub="Campos guardados en backend para esta tipología" icon="braces" />
          {Object.keys(metadata || {}).length === 0
            ? <Empty icon="braces" title="Sin metadatos">Este documento aún no tiene metadatos adicionales registrados.</Empty>
            : <div className="grid cols-2">{Object.entries(metadata).map(([key, value]) => <div className="kv" key={key}><span className="k">{key.replaceAll("_", " ")}</span><span className="v">{String(value)}</span></div>)}</div>}
        </Card>
      )}
    </Drawer>
  );
}

function CreateDocModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = useState({ document_name: "", document_type: "", archive_id: "", expedient_id: "", folder_id: "", metadata: {}, folio_start: "", folio_end: "" });
  const { data: typesRaw } = useLiveData(() => AmbarAPI.endpoints.documentTypes(), [], []);
  const { data: archivesRaw } = useLiveData(() => AmbarAPI.endpoints.archives(), [], []);
  const { data: expedientsRaw } = useLiveData(() => AmbarAPI.endpoints.expedients(), [], []);
  const { data: foldersRaw } = useLiveData(() => payload.expedient_id ? AmbarAPI.endpoints.folders(payload.expedient_id) : Promise.resolve([]), [], [payload.expedient_id]);
  const types = AmbarAPI.listFrom(typesRaw, ["items", "document_types", "types"]);
  const archives = AmbarAPI.listFrom(archivesRaw);
  const expedients = AmbarAPI.listFrom(expedientsRaw).filter(e => !payload.archive_id || Number(e.archive_id || e.ps930IdArchive) === Number(payload.archive_id) || !e.archive_id);
  const folders = AmbarAPI.listFrom(foldersRaw);
  const selectedType = types.find(t => [t.type_code, t.code, t.name].map(String).includes(String(payload.document_type)));
  const schema = schemaForType(selectedType);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const setMeta = (key, value) => setPayload(p => ({ ...p, metadata: { ...(p.metadata || {}), [key]: value } }));

  const submit = async () => {
    const missing = [];
    if (!payload.document_name.trim()) missing.push("nombre documental");
    if (!payload.document_type) missing.push("tipología");
    if (!payload.archive_id) missing.push("archivo");
    if (!payload.expedient_id) missing.push("expediente");
    if (!payload.folder_id) missing.push("carpeta");
    schema.filter(f => f.required).forEach(f => { if (!payload.metadata?.[f.key]) missing.push(f.label || f.key); });
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "No se puede crear" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/documents", {
        document_name: payload.document_name.trim(),
        document_type: payload.document_type,
        archive_id: Number(payload.archive_id),
        expedient_id: Number(payload.expedient_id),
        folder_id: Number(payload.folder_id),
        metadata: payload.metadata || {},
        folio_start: payload.folio_start ? Number(payload.folio_start) : null,
        folio_end: payload.folio_end ? Number(payload.folio_end) : null,
      });
      toast("Documento creado con contexto archivístico completo.", { tone: "ok", title: "Documento creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el documento.", { tone: "danger", title: "Error" });
    }
  };

  return (
    <Modal lg title="Registrar documento" sub="El documento queda asociado a archivo, expediente, carpeta y tipología." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear documento</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Nombre documental" required><input value={payload.document_name} onChange={e => setField("document_name", e.target.value)} placeholder="Ej. Contrato laboral firmado" maxLength={200} /></Field>
        <Field label="Tipología documental" required>
          <select value={payload.document_type} onChange={e => { setField("document_type", e.target.value); setField("metadata", {}); }}>
            <option value="">Seleccionar tipología</option>
            {types.map(t => <option key={t.type_code || t.code || t.idDocumentType} value={t.type_code || t.code || t.name}>{t.name || t.type_name || t.type_code}</option>)}
          </select>
        </Field>
        <Field label="Archivo" required>
          <select value={payload.archive_id} onChange={e => { setField("archive_id", e.target.value); setField("expedient_id", ""); setField("folder_id", ""); }}>
            <option value="">Seleccionar archivo</option>
            {archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name || a.name || a.archive_code}</option>)}
          </select>
        </Field>
        <Field label="Expediente" required>
          <select value={payload.expedient_id} onChange={e => { setField("expedient_id", e.target.value); setField("folder_id", ""); }}>
            <option value="">Seleccionar expediente</option>
            {expedients.map(e => <option key={e.idExpedient || e.id} value={e.idExpedient || e.id}>{e.expedient_code || e.code} - {e.expedient_name || e.name}</option>)}
          </select>
        </Field>
        <Field label="Carpeta" required>
          <select value={payload.folder_id} onChange={e => setField("folder_id", e.target.value)} disabled={!payload.expedient_id}>
            <option value="">{payload.expedient_id ? "Seleccionar carpeta" : "Primero selecciona expediente"}</option>
            {folders.map(f => <option key={f.idFolder || f.id} value={f.idFolder || f.id}>{f.folder_code || f.code} - {f.folder_name || f.name}</option>)}
          </select>
        </Field>
        <div className="grid cols-2">
          <Field label="Folio inicial"><input type="number" min="1" value={payload.folio_start} onChange={e => setField("folio_start", e.target.value)} /></Field>
          <Field label="Folio final"><input type="number" min="1" value={payload.folio_end} onChange={e => setField("folio_end", e.target.value)} /></Field>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Card pad="sm" style={{ background: "var(--panel-2)" }}>
            <CardHead title="Metadatos de la tipología" sub={schema.length ? "Campos definidos por TRD/tipología" : "Esta tipología no exige metadatos adicionales"} icon="braces" />
            {schema.length === 0 ? <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>Puedes crear el documento sin metadatos adicionales.</p> : (
              <div className="grid cols-2">{schema.map(field => <Field key={field.key} label={field.label || field.key} required={field.required}><input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={payload.metadata?.[field.key] || ""} onChange={e => setMeta(field.key, e.target.value)} /></Field>)}</div>
            )}
          </Card>
        </div>
      </div>
    </Modal>
  );
}

function DocumentsPage({ user }) {
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const liveDocs = useLiveData(() => AmbarAPI.endpoints.documents().then(value => AmbarAPI.listFrom(value).map(normalizeDoc)), [], []);
  const rows = useMemo(() => liveDocs.data.filter(d => !q || (d.name + d.code + d.type + d.owner).toLowerCase().includes(q.toLowerCase())), [q, liveDocs.data]);
  const withFiles = rows.filter(d => d.files > 0).length;
  const withoutContext = rows.filter(d => !d.archiveId || !d.expedientId || !d.folderId).length;

  const refreshDocs = async () => liveDocs.setData(AmbarAPI.listFrom(await AmbarAPI.endpoints.documents()).map(normalizeDoc));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Documentos</h1><p className="lead">Registra, clasifica, versiona y consulta documentos reales. Ningún documento debe quedar sin archivo, expediente, carpeta y tipología.</p></div>
        <div className="page-actions">{can(user, ["document.create"]) && <Button icon="plus" onClick={() => setCreating(true)}>Registrar documento</Button>}</div>
      </div>
      <div className="grid cols-3">
        <Metric label="Documentos registrados" value={rows.length} icon="file-text" tone="brand" accent />
        <Metric label="Con archivo digital" value={withFiles} icon="database" tone="info" accent />
        <Metric label="Revisar contexto" value={withoutContext} icon="alert-triangle" tone={withoutContext ? "warn" : "ok"} accent />
      </div>
      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", gap: "var(--s3)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, código, tipología o responsable..." /></div>
          <Button variant="ghost" size="sm" icon="download" onClick={() => downloadCSV("documentos", rows)}>Exportar CSV</Button>
        </div>
        {liveDocs.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={8} /></div> : rows.length === 0 ? (
          <Empty icon="file-text" title="Sin documentos">No hay documentos registrados en la base de datos para estos filtros.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Nombre</th><th>Tipología</th><th>Contexto</th><th>Estado</th><th>Folios</th><th>Archivos</th><th></th></tr></thead>
              <tbody>{rows.map(d => (
                <tr key={d.id} className="clickable" onClick={() => setDetail(d)}>
                  <td className="cell-mono">{d.code}</td>
                  <td className="cell-strong">{d.name}</td>
                  <td><span className="tag-soft">{d.type}</span></td>
                  <td className="muted" style={{ fontSize: "var(--fs-xs)" }}>Archivo {d.archiveId || "-"} - Exp. {d.expedientId || "-"} - Carpeta {d.folderId || "-"}</td>
                  <td><Badge tone={DOC_STATES[String(d.state).toLowerCase()] || "neutral"} dot>{d.state}</Badge></td>
                  <td>{d.folioTotal || "-"}</td>
                  <td>{d.files}</td>
                  <td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); setDetail(d); }} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {detail && <DocumentDetail doc={detail} onClose={() => setDetail(null)} onUpdated={refreshDocs} />}
      {creating && <CreateDocModal onClose={() => setCreating(false)} onCreated={(created) => liveDocs.setData(current => [normalizeDoc(created, 0), ...(current || [])])} />}
    </>
  );
}

window.DocumentsPage = DocumentsPage;
