const { useState: docS, useMemo: docM } = React;

const DOC_STATES = { active: "success", Activo: "success", draft: "warning", Borrador: "warning", archived: "neutral", Archivado: "neutral", incomplete: "danger", Incompleto: "danger" };

function normalizeDoc(item, i) {
  return {
    id: item.idDocument || item.id || i + 1,
    code: item.document_code || item.code || `DOC-${item.idDocument || i + 1}`,
    name: item.document_name || item.title || item.name || "Documento sin nombre",
    type: item.document_type || item.type_name || item.type || "Sin tipologia",
    archiveId: item.archive_id,
    expedientId: item.expedient_id,
    folderId: item.folder_id,
    subseriesId: item.subseries_id,
    state: item.status || "active",
    owner: item.owner || item.created_by || "AMBAR",
    folioStart: item.folio_start,
    folioEnd: item.folio_end,
    folioTotal: item.folio_total || 0,
    files: item.files_count || 0,
    location: item.physical_location || "Sin ubicacion fisica",
    metadata: item.metadata || {},
  };
}

function DocumentDetail({ doc, onClose }) {
  return (
    <Drawer wide title={doc.name} sub={<span className="mono">{doc.code} · {doc.type}</span>} onClose={onClose}
      headExtra={<Badge tone={DOC_STATES[doc.state] || "neutral"} dot>{doc.state}</Badge>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <div className="kv"><span className="k">Tipologia documental</span><span className="v">{doc.type}</span></div>
        <div className="kv"><span className="k">Responsable</span><span className="v">{doc.owner}</span></div>
        <div className="kv"><span className="k">Archivo</span><span className="v">{doc.archiveId || "Sin archivo"}</span></div>
        <div className="kv"><span className="k">Expediente</span><span className="v">{doc.expedientId || "Sin expediente"}</span></div>
        <div className="kv"><span className="k">Carpeta</span><span className="v">{doc.folderId || "Sin carpeta"}</span></div>
        <div className="kv"><span className="k">Folios</span><span className="v">{doc.folioTotal || 0}</span></div>
        <div className="kv"><span className="k">Archivos digitales</span><span className="v">{doc.files}</span></div>
        <div className="kv"><span className="k">Ubicacion fisica</span><span className="v">{doc.location}</span></div>
      </div>
      <div className="divider" />
      <Card pad="sm" style={{ background: "var(--panel-2)" }}>
        <CardHead title="Metadatos reales" sub="Campos guardados en backend para esta tipologia" icon="braces" />
        {Object.keys(doc.metadata || {}).length === 0
          ? <Empty icon="braces" title="Sin metadatos">Este documento aun no tiene metadatos adicionales registrados.</Empty>
          : <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-xs)" }}>{JSON.stringify(doc.metadata, null, 2)}</pre>}
      </Card>
    </Drawer>
  );
}

function CreateDocModal({ onClose, onCreated }) {
  const toast = useToast();
  const [payload, setPayload] = docS({ document_name: "", document_type: "", metadata: {} });
  const { data: typesRaw } = useLiveData(() => AmbarAPI.endpoints.documentTypes(), [], []);
  const { data: archivesRaw } = useLiveData(() => AmbarAPI.endpoints.archives(), [], []);
  const { data: expedientsRaw } = useLiveData(() => AmbarAPI.endpoints.expedients(), [], []);
  const types = AmbarAPI.listFrom(typesRaw, ["items", "document_types", "types"]);
  const archives = AmbarAPI.listFrom(archivesRaw);
  const expedients = AmbarAPI.listFrom(expedientsRaw);
  const setField = (key, value) => setPayload(p => ({ ...p, [key]: value }));
  const submit = async () => {
    if (!payload.document_name.trim() || !payload.document_type.trim() || !payload.archive_id || !payload.expedient_id) {
      toast("Nombre, tipologia, archivo y expediente son obligatorios.", { tone: "danger", title: "Faltan datos" });
      return;
    }
    try {
      const created = await AmbarAPI.post("/documents", payload);
      toast("Documento registrado desde datos reales.", { tone: "ok", title: "Documento creado" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el documento.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Modal lg title="Registrar documento" sub="El documento queda asociado a archivo, expediente y tipologia." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={submit}>Crear documento</Button></>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Field label="Nombre documental" required><input value={payload.document_name} onChange={e => setField("document_name", e.target.value)} placeholder="Ej. Contrato laboral firmado" maxLength={200} /></Field>
        <Field label="Tipologia documental" required>
          <select value={payload.document_type} onChange={e => setField("document_type", e.target.value)}>
            <option value="">Seleccionar tipologia</option>
            {types.map(t => <option key={t.code || t.type_code || t.idDocumentType} value={t.code || t.type_code || t.name}>{t.name || t.type_name || t.code}</option>)}
          </select>
        </Field>
        <Field label="Archivo" required>
          <select value={payload.archive_id || ""} onChange={e => setField("archive_id", Number(e.target.value) || null)}>
            <option value="">Seleccionar archivo</option>
            {archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.name || a.archive_name || a.code}</option>)}
          </select>
        </Field>
        <Field label="Expediente" required>
          <select value={payload.expedient_id || ""} onChange={e => setField("expedient_id", Number(e.target.value) || null)}>
            <option value="">Seleccionar expediente</option>
            {expedients.map(e => <option key={e.idExpedient || e.id} value={e.idExpedient || e.id}>{e.expedient_name || e.name || e.expedient_code}</option>)}
          </select>
        </Field>
        <Field label="Folio inicial"><input type="number" min="1" value={payload.folio_start || ""} onChange={e => setField("folio_start", Number(e.target.value) || null)} /></Field>
        <Field label="Folio final"><input type="number" min="1" value={payload.folio_end || ""} onChange={e => setField("folio_end", Number(e.target.value) || null)} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Metadatos JSON opcionales"><textarea placeholder='{"numero_contrato":"..."}' onChange={e => {
          try { setField("metadata", e.target.value.trim() ? JSON.parse(e.target.value) : {}); } catch {}
        }} /></Field></div>
      </div>
    </Modal>
  );
}

function DocumentsPage({ user }) {
  const [q, setQ] = docS("");
  const [detail, setDetail] = docS(null);
  const [creating, setCreating] = docS(false);
  const liveDocs = useLiveData(() => AmbarAPI.endpoints.documents().then(value => AmbarAPI.listFrom(value).map(normalizeDoc)), [], []);
  const rows = docM(() => liveDocs.data.filter(d => !q || (d.name + d.code + d.type + d.owner).toLowerCase().includes(q.toLowerCase())), [q, liveDocs.data]);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestion Documental</div><h1>Documentos</h1><p className="lead">Listado conectado al backend. Cada documento debe venir de una tipologia, expediente y archivo.</p></div>
        <div className="page-actions">{can(user, ["document.create"]) && <Button icon="plus" onClick={() => setCreating(true)}>Registrar documento</Button>}</div>
      </div>
      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", gap: "var(--s3)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, codigo, tipologia o responsable..." /></div>
          <Badge tone="outline">{rows.length} documentos</Badge>
        </div>
        {liveDocs.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton lines={8} /></div> : rows.length === 0 ? (
          <Empty icon="file-text" title="Sin documentos">No hay documentos registrados en la base de datos para estos filtros.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Tipologia</th><th>Responsable</th><th>Estado</th><th>Folios</th><th>Archivos</th><th></th></tr></thead>
              <tbody>{rows.map(d => (
                <tr key={d.id} className="clickable" onClick={() => setDetail(d)}>
                  <td className="cell-mono">{d.code}</td>
                  <td className="cell-strong">{d.name}</td>
                  <td><span className="tag-soft">{d.type}</span></td>
                  <td>{d.owner}</td>
                  <td><Badge tone={DOC_STATES[d.state] || "neutral"} dot>{d.state}</Badge></td>
                  <td>{d.folioTotal}</td>
                  <td>{d.files}</td>
                  <td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); setDetail(d); }} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {detail && <DocumentDetail doc={detail} onClose={() => setDetail(null)} />}
      {creating && <CreateDocModal onClose={() => setCreating(false)} onCreated={(created) => liveDocs.setData(current => [normalizeDoc(created, 0), ...(current || [])])} />}
    </>
  );
}

window.DocumentsPage = DocumentsPage;
