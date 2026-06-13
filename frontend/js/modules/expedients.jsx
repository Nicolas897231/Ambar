/* ============================================================
   AMBAR - Gestión Documental: Expedientes (entidad principal)
   ============================================================ */
const { useState: exS } = React;

const EXP_TYPES = [
  { key: "Empleado", icon: "briefcase", color: "var(--viz-rose)" },
  { key: "Cliente", icon: "user", color: "var(--viz-teal)" },
  { key: "Proveedor", icon: "building", color: "var(--viz-amber)" },
  { key: "Contrato", icon: "file-text", color: "var(--viz-indigo)" },
  { key: "Proyecto", icon: "folder-kanban", color: "var(--viz-violet)" },
  { key: "Proceso", icon: "workflow", color: "var(--viz-green)" },
];

function ExpedientDetail({ exp, onClose, navigate }) {
  const tc = EXP_TYPES.find(t => t.key === exp.type) || EXP_TYPES[0];
  return (
    <Drawer wide title={exp.name} sub={<span className="mono">{exp.id}</span>} onClose={onClose}
      headExtra={<Badge tone={exp.state === "Abierto" ? "success" : "neutral"} dot>{exp.state}</Badge>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Card pad="sm">
          <div className="row gap2" style={{ marginBottom: "var(--s3)" }}><span className="m-icon" style={{ background: `color-mix(in oklab, ${tc.color} 16%, transparent)`, color: tc.color }}><Icon name={tc.icon} size={18} /></span><div><div style={{ fontWeight: 700 }}>{exp.type}</div><small className="muted">{exp.area}</small></div></div>
          <div className="dl">
            <dt>Documentos</dt><dd>{exp.docs}</dd>
            <dt>Ubicación</dt><dd className="mono" style={{ fontSize: "var(--fs-xs)" }}>{exp.loc}</dd>
            <dt>Última actualización</dt><dd>{exp.updated || "-"}</dd>
            <dt>Estado</dt><dd>{exp.state}</dd>
          </div>
        </Card>
        <Card pad="sm">
          <div className="row between" style={{ marginBottom: "var(--s3)" }}><b style={{ fontSize: "var(--fs-sm)" }}>Completitud documental</b><Badge tone={exp.compliance >= 90 ? "success" : exp.compliance >= 70 ? "warning" : "danger"}>{exp.compliance}%</Badge></div>
          <Meter value={exp.compliance} tone={exp.compliance >= 90 ? "ok" : exp.compliance >= 70 ? "warn" : "danger"} />
          <p className="muted" style={{ marginTop: "var(--s3)", fontSize: "var(--fs-sm)" }}>La lista de documentos obligatorios debe venir de tipologías/TRD. No se muestran checklist ficticios.</p>
        </Card>
      </div>
      <div className="grid cols-2" style={{ gap: "var(--s4)", marginTop: "var(--s4)" }}>
        <Card><Empty icon="folder" title="Carpetas bajo demanda">Abre Documentos para consultar registros reales asociados a este expediente.</Empty><Button variant="ghost" className="btn-block" icon="file-text" onClick={() => navigate && navigate("documents")}>Ver documentos</Button></Card>
        <Card><Empty icon="history" title="Kardex bajo demanda">El timeline debe consultarse desde Kardex cuando el backend entregue movimientos de esta entidad.</Empty><Button variant="ghost" className="btn-block" icon="route" onClick={() => navigate && navigate("archive")}>Ver custodia</Button></Card>
      </div>
    </Drawer>
  );
}

function ExpedientsPage({ user, navigate }) {
  const [type, setType] = exS("");
  const [q, setQ] = exS("");
  const [detail, setDetail] = exS(null);
  const liveExpedients = window.useLiveData(
    () => window.AmbarAPI.endpoints.expedients().then(value => window.AmbarAPI.listFrom(value).map((item, i) => ({
      id: item.expedient_code || item.idExpedient || `EXP-${i + 1}`,
      name: item.expedient_name || item.name || item.expedient_code || "Expediente sin nombre",
      type: item.expedient_type || item.type || "Proceso",
      area: item.dependency_name || item.archive_name || "Archivo",
      docs: item.documents_count || item.total_documents || 0,
      compliance: item.compliance_percent || item.completeness || item.compliance || 0,
      loc: item.physical_location_path || item.location_path || item.archive_name || "Digital",
      state: item.status || "Abierto",
      color: EXP_TYPES[i % EXP_TYPES.length].color
    }))),
    [],
    []
  );
  const rows = liveExpedients.data.filter(e => (!type || e.type === type) && (!q || (e.name + e.id).toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Expedientes</h1><p className="lead">El expediente es la unidad principal de AMBAR: agrupa todos los documentos relacionados con un empleado, cliente, proveedor, contrato, proyecto o proceso.</p></div>
        <div className="page-actions">{can(user, ["document.create"]) && <Button icon="plus">Nuevo expediente</Button>}</div>
      </div>

      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>¿Por qué expedientes?</h4><p>En lugar de buscar documentos sueltos, los agrupas por su contexto real. Así un nuevo empleado, un proveedor o un proceso jurídico tienen toda su información en un solo lugar - con control de completitud y trazabilidad.</p></div></div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        {EXP_TYPES.map((t, i) => {
          const count = liveExpedients.data.filter(e => e.type === t.key).length;
          return <Card key={t.key} interactive pad="sm" className={`an-scale${type === t.key ? "" : ""}`} style={{ "--i": i, borderColor: type === t.key ? t.color : "", borderWidth: type === t.key ? 2 : 1 }} onClick={() => setType(type === t.key ? "" : t.key)}>
            <span className="m-icon" style={{ background: `color-mix(in oklab, ${t.color} 16%, transparent)`, color: t.color, marginBottom: 8 }}><Icon name={t.icon} size={18} /></span>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-xl)", fontWeight: 800 }}>{count}</div>
            <small className="muted">{t.key}s</small>
          </Card>;
        })}
      </div>

      <Card flush className="an-rise">
        <div className="row between" style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar expediente por nombre o código..." /></div>
          {type && <FilterChip label={type} active onClick={() => setType("")} />}
        </div>
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre / Entidad</th><th>Tipo</th><th>área</th><th>Docs</th><th>Completitud</th><th>Ubicación</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map(e => {
                const tc = EXP_TYPES.find(t => t.key === e.type) || EXP_TYPES[5];
                return <tr key={e.id} className="clickable" onClick={() => setDetail(e)}>
                  <td className="cell-mono">{e.id}</td>
                  <td><div className="t-avatar"><span className="avatar sm" style={{ background: tc.color }}><Icon name={tc.icon} size={13} /></span><span className="cell-strong">{e.name}</span></div></td>
                  <td><span className="tag-soft">{e.type}</span></td>
                  <td>{e.area}</td>
                  <td className="mono">{e.docs}</td>
                  <td style={{ minWidth: 130 }}><Meter value={e.compliance} tone={e.compliance >= 90 ? "ok" : e.compliance >= 70 ? "warn" : "danger"} showLabel /></td>
                  <td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{e.loc}</td>
                  <td><Badge tone={e.state === "Abierto" ? "success" : "neutral"} dot>{e.state}</Badge></td>
                  <td onClick={ev => ev.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setDetail(e)} /></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && <ExpedientDetail exp={detail} onClose={() => setDetail(null)} navigate={navigate} />}
    </>
  );
}

window.ExpedientsPage = ExpedientsPage;
