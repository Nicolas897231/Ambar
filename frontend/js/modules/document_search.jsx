/* ============================================================
   AMBAR - Gestión Documental: Búsqueda documental
   ============================================================ */

function normalizeSearchResult(item, i) {
  return {
    id: item.id || item.entity_id || i,
    title: item.title || item.name || item.document_name || "Resultado",
    type: item.entity_type || item.type || "document",
    status: item.status || "-",
    archive: item.archive_name || item.archive_id || "-",
    summary: item.summary || item.description || item.snippet || "",
    url: item.url || item.action_url || "",
  };
}

function DocumentSearchPage({ navigate }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: "", entity_type: "", status: "", archive_id: "", metadata_key: "", metadata_value: "" });
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: archivesRaw } = useLiveData(() => AmbarAPI.endpoints.archives(), [], []);
  const archives = AmbarAPI.listFrom(archivesRaw);
  const setField = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const search = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const payload = {
        q: filters.q || null,
        entity_type: filters.entity_type || null,
        status: filters.status || null,
        archive_id: filters.archive_id ? Number(filters.archive_id) : null,
        metadata_key: filters.metadata_key || null,
        metadata_value: filters.metadata_value || null,
        page: 1,
        size: 50,
      };
      const response = await AmbarAPI.endpoints.searchDocuments(payload);
      setResults(AmbarAPI.listFrom(response, ["items", "results", "data"]).map(normalizeSearchResult));
    } catch (err) {
      toast(err.message || "No fue posible buscar documentos.", { tone: "danger", title: "Búsqueda fallida" });
    } finally {
      setLoading(false);
    }
  };

  const openResult = (row) => {
    if (row.type === "document") return navigate("documents");
    if (row.type === "expedient") return navigate("expedients");
    if (row.url) {
      const match = row.url.match(/#\/?([^/?#]+)/) || row.url.match(/\/([^/?#]+)$/);
      if (match?.[1]) return navigate(match[1]);
    }
    navigate("documents");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestión Documental</div>
          <h1>Búsqueda documental</h1>
          <p className="lead">Busca documentos y expedientes respetando permisos por archivo. Puedes filtrar por estado, archivo y metadatos de tipología.</p>
        </div>
        <div className="page-actions"><Button icon="search" onClick={search}>Buscar</Button></div>
      </div>

      <Card>
        <div className="grid cols-3">
          <Field label="Texto libre"><input value={filters.q} onChange={e => setField("q", e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Contrato, cédula, placa, manifiesto..." /></Field>
          <Field label="Entidad">
            <select value={filters.entity_type} onChange={e => setField("entity_type", e.target.value)}>
              <option value="">Todas</option>
              <option value="document">Documentos</option>
              <option value="expedient">Expedientes</option>
              <option value="folder">Carpetas</option>
              <option value="box">Cajas</option>
            </select>
          </Field>
          <Field label="Archivo">
            <select value={filters.archive_id} onChange={e => setField("archive_id", e.target.value)}>
              <option value="">Todos los autorizados</option>
              {archives.map(a => <option key={a.idArchive || a.id} value={a.idArchive || a.id}>{a.archive_name || a.name || a.archive_code}</option>)}
            </select>
          </Field>
          <Field label="Estado"><input value={filters.status} onChange={e => setField("status", e.target.value)} placeholder="created, active, archived..." /></Field>
          <Field label="Metadato"><input value={filters.metadata_key} onChange={e => setField("metadata_key", e.target.value)} placeholder="placa, conductor, contrato..." /></Field>
          <Field label="Valor metadato"><input value={filters.metadata_value} onChange={e => setField("metadata_value", e.target.value)} placeholder="Valor exacto o parcial" /></Field>
        </div>
      </Card>

      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <div><strong>Resultados</strong><div className="muted" style={{ fontSize: "var(--fs-sm)" }}>{searched ? `${results.length} coincidencias` : "Ejecuta una búsqueda para consultar la base documental"}</div></div>
          <Button variant="ghost" icon="download" onClick={() => downloadCSV("busqueda-documental", results)} disabled={!results.length}>Exportar CSV</Button>
        </div>
        {loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={7} /></div> : !searched ? (
          <Empty icon="search" title="Lista para buscar">AMBAR consultará solo entidades permitidas por tu rol y archivos autorizados.</Empty>
        ) : results.length === 0 ? (
          <Empty icon="inbox" title="Sin resultados">No hay coincidencias reales para estos filtros.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Resultado</th><th>Entidad</th><th>Estado</th><th>Archivo</th><th>Resumen</th><th></th></tr></thead>
              <tbody>{results.map(row => <tr key={`${row.type}-${row.id}`} className="clickable" onClick={() => openResult(row)}>
                <td className="cell-strong">{row.title}</td>
                <td><span className="tag-soft">{row.type}</span></td>
                <td>{row.status}</td>
                <td>{row.archive}</td>
                <td className="muted">{row.summary || "-"}</td>
                <td><Button variant="subtle" size="sm" icon="chevron-right" onClick={(event) => { event.stopPropagation(); openResult(row); }} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

window.DocumentSearchPage = DocumentSearchPage;
