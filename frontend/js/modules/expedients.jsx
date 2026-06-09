/* ============================================================
   AMBAR — Gestión Documental: Expedientes (entidad principal)
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

const EXPEDIENTS = [
  { id: "EXP-EMP-0142", name: "Juan Pérez Gómez", type: "Empleado", area: "Operaciones", docs: 14, compliance: 86, state: "Abierto", loc: "Caja 18 · Carpeta 12", updated: "Hace 2 días" },
  { id: "EXP-EMP-0143", name: "Mariana Ruiz", type: "Empleado", area: "Comercial", docs: 8, compliance: 62, state: "Abierto", loc: "Caja 19 · Carpeta 3", updated: "Hoy" },
  { id: "EXP-PRV-0051", name: "Suministros del Valle S.A.S.", type: "Proveedor", area: "Compras", docs: 11, compliance: 100, state: "Abierto", loc: "Caja 7 · Carpeta 1", updated: "Hace 1 sem" },
  { id: "EXP-CLI-0233", name: "Comercializadora Andina", type: "Cliente", area: "Comercial", docs: 22, compliance: 94, state: "Abierto", loc: "Caja 31 · Carpeta 5", updated: "Ayer" },
  { id: "EXP-CON-0410", name: "Contrato obra civil sede norte", type: "Contrato", area: "Jurídica", docs: 17, compliance: 78, state: "Abierto", loc: "Caja 12 · Carpeta 9", updated: "Hace 3 días" },
  { id: "EXP-PRY-0007", name: "Implementación ERP 2026", type: "Proyecto", area: "TI", docs: 34, compliance: 71, state: "Abierto", loc: "Digital", updated: "Hoy" },
  { id: "EXP-EMP-0098", name: "Carlos Daza", type: "Empleado", area: "Operaciones", docs: 16, compliance: 90, state: "Abierto", loc: "Caja 4 · Carpeta 8", updated: "Hace 5 días" },
  { id: "EXP-PRC-0021", name: "Proceso disciplinario 2026-04", type: "Proceso", area: "Jurídica", docs: 6, compliance: 55, state: "Cerrado", loc: "Histórico", updated: "Hace 1 mes" },
];

const REQUIRED_DOCS = [
  ["Hoja de vida", true], ["Contrato firmado", true], ["Fotocopia de cédula", true], ["Certificaciones laborales", true],
  ["Certificados de estudio", true], ["Examen médico de ingreso", false], ["Afiliación EPS/Pensión", true], ["Antecedentes", false],
];

function ExpedientDetail({ exp, onClose, navigate }) {
  const [folder, setFolder] = exS("hv");
  const tc = EXP_TYPES.find(t => t.key === exp.type);
  return (
    <Drawer wide title={exp.name} sub={<span className="mono">{exp.id}</span>} onClose={onClose}
      headExtra={<Badge tone={exp.state === "Abierto" ? "success" : "neutral"} dot>{exp.state}</Badge>}>
      <div className="detail-2">
        {/* Left: info + compliance */}
        <div className="col gap4">
          <Card pad="sm">
            <div className="row gap2" style={{ marginBottom: "var(--s3)" }}><span className="m-icon" style={{ background: `color-mix(in oklab, ${tc.color} 16%, transparent)`, color: tc.color }}><Icon name={tc.icon} size={18} /></span><div><div style={{ fontWeight: 700 }}>{exp.type}</div><small className="muted">{exp.area}</small></div></div>
            <div className="dl">
              <dt>Documentos</dt><dd>{exp.docs}</dd>
              <dt>Ubicación</dt><dd className="mono" style={{ fontSize: "var(--fs-xs)" }}>{exp.loc}</dd>
              <dt>Última act.</dt><dd>{exp.updated}</dd>
              <dt>Serie TRD</dt><dd className="mono">200-24</dd>
              <dt>Retención</dt><dd>5 años</dd>
            </div>
          </Card>
          <Card pad="sm">
            <div className="row between" style={{ marginBottom: "var(--s3)" }}><b style={{ fontSize: "var(--fs-sm)" }}>Completitud documental</b><Badge tone={exp.compliance >= 90 ? "success" : exp.compliance >= 70 ? "warning" : "danger"}>{exp.compliance}%</Badge></div>
            <Meter value={exp.compliance} tone={exp.compliance >= 90 ? "ok" : exp.compliance >= 70 ? "warn" : "danger"} />
            <div className="col" style={{ marginTop: "var(--s4)" }}>
              {REQUIRED_DOCS.map(([d, ok]) => (
                <div key={d} className="comp-item"><span className={`comp-check ${ok ? "ok" : "no"}`}>{ok ? <Icon name="check" size={13} /> : <Icon name="x" size={12} />}</span><span className="grow" style={{ fontSize: "var(--fs-sm)", color: ok ? "var(--text)" : "var(--muted)" }}>{d}</span>{!ok && <Button variant="subtle" size="sm" icon="upload">Subir</Button>}</div>
              ))}
            </div>
          </Card>
        </div>
        {/* Center: tree + docs */}
        <div className="col gap4">
          <Card pad="sm">
            <CardHead title="Árbol documental" sub="Carpetas y documentos del expediente" />
            <div className="tree">
              <div className="tree-node active"><Icon name="folder" size={16} className="tn-ico" /> {exp.name}</div>
              <div className="tree-children">
                {[["hv", "Hoja de vida", "folder", 3], ["contrato", "Contrato y anexos", "folder", 4], ["certs", "Certificaciones", "folder", 5], ["medical", "Exámenes médicos", "folder", 2]].map(([k, n, ic, c]) => (
                  <div key={k}><div className={`tree-node${folder === k ? " active" : ""}`} onClick={() => setFolder(k)}><Icon name={ic} size={16} className="tn-ico" /> <span className="grow">{n}</span><small className="muted">{c}</small></div></div>
                ))}
              </div>
            </div>
          </Card>
          <Card pad="sm">
            <div className="col gap2">
              {[["Contrato_indefinido.pdf", "pdf", "v3"], ["Otrosi_2026.pdf", "pdf", "v1"], ["Anexo_funciones.docx", "docx", "v2"]].map(([n, k, v]) => {
                const [c, lbl] = FILE_KINDS[k];
                return <div key={n} className="list-row"><span className="filebadge"><span className="fb-ico" style={{ background: c }}>{lbl}</span></span><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{n}</div><small className="muted">{v} · 24 folios</small></div><Badge tone="success" dot>Activo</Badge><Button variant="subtle" size="sm" icon="eye" /></div>;
              })}
            </div>
          </Card>
        </div>
        {/* Right: timeline */}
        <div className="col gap4">
          <Card pad="sm">
            <CardHead title="Línea de tiempo" />
            <div className="timeline">
              {[["plus", "Expediente creado", "2024-03-01", "ok"], ["upload", "13 documentos cargados", "2024-03-05", ""], ["route", "Transferido a Central", "2025-01-12", "brand"], ["package-check", "Préstamo a Jurídica", "2026-02-08", ""], ["pencil", "Actualización de contrato", exp.updated, "brand"]].map(([ic, t, m, tn], i) => (
                <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={13} /></div><div className="tl-body"><div className="tl-title" style={{ fontSize: "var(--fs-sm)" }}>{t}</div><div className="tl-meta">{m}</div></div></div>
              ))}
            </div>
          </Card>
          <Button variant="ghost" className="btn-block" icon="package-check" onClick={() => navigate && navigate("loans")}>Solicitar préstamo</Button>
        </div>
      </div>
    </Drawer>
  );
}

function ExpedientsPage({ user, navigate }) {
  const [type, setType] = exS("");
  const [q, setQ] = exS("");
  const [detail, setDetail] = exS(null);
  const liveExpedients = window.useLiveData(
    () => window.AmbarAPI.endpoints.expedients().then(items => items.map((item, i) => ({
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
    EXPEDIENTS,
    []
  );
  const rows = liveExpedients.data.filter(e => (!type || e.type === type) && (!q || (e.name + e.id).toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Expedientes</h1><p className="lead">El expediente es la unidad principal de AMBAR: agrupa todos los documentos relacionados con un empleado, cliente, proveedor, contrato, proyecto o proceso.</p></div>
        <div className="page-actions">{can(user, ["document.create"]) && <Button icon="plus">Nuevo expediente</Button>}</div>
      </div>

      <div className="page-intro an-rise"><span className="pi-ico"><Icon name="folder-kanban" size={18} /></span><div><h4>¿Por qué expedientes?</h4><p>En lugar de buscar documentos sueltos, los agrupas por su contexto real. Así un nuevo empleado, un proveedor o un proceso jurídico tienen toda su información en un solo lugar — con control de completitud y trazabilidad.</p></div></div>

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
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar expediente por nombre o código…" /></div>
          {type && <FilterChip label={type} active onClick={() => setType("")} />}
        </div>
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre / Entidad</th><th>Tipo</th><th>Área</th><th>Docs</th><th>Completitud</th><th>Ubicación</th><th>Estado</th><th></th></tr></thead>
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
