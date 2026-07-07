/* ============================================================
   AMBAR - Gestión Documental: Repositorio
   ============================================================ */

function formatBytes(value) {
  const n = Number(value || 0);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function RepositoryPage({ user, navigate }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const liveRepo = useLiveData(() => AmbarAPI.endpoints.repository(), [], []);
  const rows = AmbarAPI.listFrom(liveRepo.data).filter(row => {
    const text = `${row.document_name || ""} ${row.archive_id || ""} ${row.expedient_id || ""} ${row.folder_id || ""}`.toLowerCase();
    return !q || text.includes(q.toLowerCase());
  });
  const totalFiles = rows.reduce((acc, row) => acc + (row.files || []).length, 0);
  const totalSize = rows.reduce((acc, row) => acc + (row.files || []).reduce((a, f) => a + Number(f.size_bytes || 0), 0), 0);

  const downloadFile = async (file) => {
    try {
      await AmbarAPI.download(`/archives/repository/files/${file.idFile}/download`, file.original_name);
      toast("La descarga segura fue solicitada al repositorio.", { tone: "ok", title: "Descarga preparada" });
    } catch (err) {
      toast(err.message || "No fue posible descargar el archivo.", { tone: "danger", title: "Descarga bloqueada" });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestión Documental</div>
          <h1>Repositorio documental</h1>
          <p className="lead">Archivos digitales reales almacenados por documento. Las descargas pasan por permisos, auditoría y URL segura.</p>
        </div>
        <div className="page-actions">
          {can(user, ["document.create"]) && <Button icon="plus" onClick={() => navigate("documents")}>Registrar documento</Button>}
        </div>
      </div>

      <div className="grid cols-3">
        <Metric label="Documentos con contexto" value={rows.length} icon="file-text" tone="brand" accent />
        <Metric label="Archivos digitales" value={totalFiles} icon="database" tone="info" accent />
        <Metric label="Tamaño registrado" value={formatBytes(totalSize)} icon="archive" tone="ok" accent />
      </div>

      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", gap: "var(--s3)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por documento, archivo, expediente o carpeta..." /></div>
          <Badge tone="outline">{totalFiles} archivos</Badge>
        </div>
        {liveRepo.loading ? <div style={{ padding: "var(--s5)" }}><Skeleton rows={8} /></div> : rows.length === 0 ? (
          <Empty icon="database" title="Repositorio sin archivos">No hay archivos digitales para estos filtros. Carga archivos desde el detalle de un documento.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Documento</th><th>Archivo</th><th>Expediente</th><th>Carpeta</th><th>Archivo digital</th><th>Tamaño</th><th>Acción</th></tr></thead>
              <tbody>{rows.flatMap(row => {
                const files = row.files?.length ? row.files : [null];
                return files.map((file, index) => (
                  <tr key={`${row.idDocument}-${file?.idFile || index}`}>
                    <td className="cell-strong">{row.document_name}</td>
                    <td className="cell-mono">{row.archive_id || "-"}</td>
                    <td className="cell-mono">{row.expedient_id || "-"}</td>
                    <td className="cell-mono">{row.folder_id || "-"}</td>
                    <td>{file ? <span className="tag-soft">{file.original_name}</span> : <span className="muted">Sin archivo digital</span>}</td>
                    <td>{file ? formatBytes(file.size_bytes) : "-"}</td>
                    <td>{file ? <Button variant="ghost" size="sm" icon="download" onClick={() => downloadFile(file)}>Descargar</Button> : <Button variant="subtle" size="sm" icon="upload" disabled>Sin archivo</Button>}</td>
                  </tr>
                ));
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

window.RepositoryPage = RepositoryPage;
