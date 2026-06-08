/* ============================================================
   AMBAR — Gestión Documental: Documentos
   ============================================================ */
const { useState: docS, useMemo: docM } = React;

const DOC_STATES = { Activo: "success", "En proceso": "info", Vencido: "danger", Archivado: "neutral", Borrador: "warning" };
const FILE_KINDS = { pdf: ["var(--danger)", "PDF"], docx: ["var(--info)", "DOC"], xlsx: ["var(--ok)", "XLS"], jpg: ["var(--viz-violet)", "IMG"], zip: ["var(--warn)", "ZIP"] };

function makeDocs() {
  const names = ["Contrato laboral indefinido", "Factura de venta", "Acta de comité", "Certificación bancaria", "Memorando interno", "Hoja de vida", "Resolución de nombramiento", "Informe de gestión", "Licencia de maternidad", "Póliza de cumplimiento", "Cámara de comercio", "RUT actualizado", "Contrato de prestación", "Certificado laboral", "Acta de entrega"];
  const resp = ["Laura Mejía", "Andrés Gómez", "Diana Ortiz", "Ricardo Salas", "Marta Lozano"];
  const out = [];
  for (let i = 0; i < 46; i++) {
    const t = window.DOC_TYPES[i % window.DOC_TYPES.length];
    const st = Object.keys(DOC_STATES)[i % 5];
    out.push({
      id: "DOC-2026-" + String(481 - i).padStart(4, "0"),
      name: names[i % names.length] + (i > 14 ? " #" + (i - 14) : ""),
      type: t, area: window.AREAS[i % window.AREAS.length], resp: resp[i % resp.length],
      state: st, date: `2026-0${(i % 6) + 1}-${String((i * 3 % 27) + 1).padStart(2, "0")}`,
      due: i % 4 === 0 ? `2026-${String((i % 12) + 1).padStart(2, "0")}-15` : "—",
      files: (i % 3) + 1, versions: (i % 4) + 1, ocr: i % 3 !== 0,
      loc: ["Cali · Central", "Pasillo B", "Est. 4", "Caja 18"][i % 4],
    });
  }
  return out;
}
window.DOCS = window.DOCS || makeDocs();

function FilterChip({ label, active, onClick, icon }) {
  return <button className={`chip${active ? " active" : ""}`} onClick={onClick}>{icon && <Icon name={icon} size={13} />}{label}{active && <Icon name="x" size={12} className="x" />}</button>;
}

function DocDetail({ doc, onClose }) {
  const [tab, setTab] = docS("info");
  const tabs = [
    { key: "info", label: "Información", icon: "info" }, { key: "files", label: "Archivos", icon: "paperclip", count: doc.files },
    { key: "versions", label: "Versiones", icon: "git-branch", count: doc.versions }, { key: "history", label: "Historial", icon: "history" },
    { key: "ocr", label: "OCR", icon: "scan-line" }, { key: "loc", label: "Ubicación física", icon: "map-pin" },
  ];
  return (
    <Drawer wide title={doc.name} sub={<span className="mono">{doc.id} · {doc.type}</span>} onClose={onClose}
      headExtra={<><Badge tone={DOC_STATES[doc.state]} dot>{doc.state}</Badge><Button size="sm" variant="ghost" icon="download">Descargar</Button></>}>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "info" && (
        <div className="col gap4">
          <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
            {[["Código", doc.id], ["Tipo documental", doc.type], ["Área responsable", doc.area], ["Responsable", doc.resp], ["Fecha creación", doc.date], ["Vencimiento", doc.due]].map(([k, v]) => (
              <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Descripción</div>
            <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>Documento registrado en el sistema AMBAR como parte del expediente correspondiente. Clasificado según la TRD vigente con su serie y subserie documental.</p>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Metadatos</div>
            <div className="row wrap gap2">{["N° contrato: 4821", "Cédula: 1.144.xxx", "NIT: 890.xxx", "Serie: 200-24"].map(m => <span key={m} className="tag-soft mono">{m}</span>)}</div>
          </div>
        </div>
      )}
      {tab === "files" && (
        <div className="col gap4">
          <div className="uploader"><Icon name="upload-cloud" size={26} /><div style={{ marginTop: 8, fontWeight: 600 }}>Arrastra archivos o haz clic para subir</div><small className="faint">PDF, Word, Excel, imágenes, ZIP · hasta 50 MB</small></div>
          <div className="col gap2">
            {[["Contrato.pdf", "pdf", "2.4 MB"], ["Anexo_certificado.jpg", "jpg", "880 KB"], ["Soportes.zip", "zip", "5.1 MB"]].slice(0, doc.files).map(([n, k, sz]) => {
              const [c, lbl] = FILE_KINDS[k];
              return <div key={n} className="list-row"><span className="filebadge"><span className="fb-ico" style={{ background: c }}>{lbl}</span></span><div className="grow"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{n}</div><small className="muted">{sz} · subido por {doc.resp}</small></div><Button variant="subtle" size="sm" icon="download" /><Button variant="subtle" size="sm" icon="eye" /></div>;
            })}
          </div>
        </div>
      )}
      {tab === "versions" && (
        <div className="timeline">
          {Array.from({ length: doc.versions }).map((_, i) => {
            const v = doc.versions - i;
            return <div key={v} className={`tl-item ${i === 0 ? "brand" : ""}`}><div className="tl-dot mono" style={{ fontWeight: 700, fontSize: 11 }}>v{v}</div><div className="tl-body"><div className="tl-title">Versión {v} {i === 0 && <Badge tone="brand">actual</Badge>}</div><div className="tl-meta">Modificado por {doc.resp} · 2026-0{v}-12 · {i === 0 ? "Actualización de anexos" : "Corrección de metadatos"}</div>{i !== 0 && <Button variant="ghost" size="sm" icon="git-branch" style={{ marginTop: 8 }}>Comparar con actual</Button>}</div></div>;
          })}
        </div>
      )}
      {tab === "history" && (
        <div className="timeline">
          {[["eye", "Consultado por Jorge Villa", "Hoy 10:22", ""], ["download", "Descargado por Diana Ortiz", "Ayer 16:05", "brand"], ["pencil", "Editado por Laura Mejía", "2026-05-12", ""], ["scan-line", "Digitalizado e indexado", "2026-05-10", "ok"], ["plus", "Documento registrado", "2026-05-09", "ok"]].map(([ic, t, m, tn], i) => (
            <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={14} /></div><div className="tl-body"><div className="tl-title">{t}</div><div className="tl-meta">{m}</div></div></div>
          ))}
        </div>
      )}
      {tab === "ocr" && (doc.ocr ? (
        <div className="col gap4">
          <div className="row between"><Badge tone="success" icon="check">Texto extraído e indexado</Badge><span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Confianza media 96%</span></div>
          <Card pad="sm" style={{ background: "var(--panel-2)", maxHeight: 240, overflow: "auto" }}>
            <p className="mono" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.7, color: "var(--muted)" }}>CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO INDEFINIDO. Entre los suscritos a saber: <mark style={{ background: "var(--brand-ghost)", color: "var(--brand-ink)" }}>EMPRESA AMBAR S.A.S.</mark> NIT 890.xxx, y por otra parte <mark style={{ background: "var(--brand-ghost)", color: "var(--brand-ink)" }}>{doc.resp.toUpperCase()}</mark> identificado con C.C. No 1.144.xxx, se ha celebrado el presente contrato…</p>
          </Card>
          <div><div className="label" style={{ marginBottom: 6 }}>Campos detectados automáticamente</div><div className="row wrap gap2">{["Nombre", "Cédula", "Cargo", "Salario", "Fecha de inicio"].map(f => <span key={f} className="tag-soft"><Icon name="sparkles" size={11} style={{ color: "var(--brand)" }} /> {f}</span>)}</div></div>
        </div>
      ) : <Empty icon="scan-line" title="Documento sin OCR" action={<Button icon="scan-line">Procesar OCR</Button>}>Este documento aún no ha sido procesado para extracción de texto.</Empty>)}
      {tab === "loc" && (
        <div className="col gap4">
          <div className="page-intro"><span className="pi-ico"><Icon name="map-pin" size={18} /></span><div><h4>Ubicación física registrada</h4><p>Sigue esta ruta para encontrar el original en el archivo.</p></div></div>
          <div className="row wrap" style={{ gap: 0 }}>
            {[["Sede", "Cali"], ["Archivo", "Central"], ["Pasillo", "B"], ["Estante", "4"], ["Nivel", "2"], ["Caja", "18"], ["Carpeta", "12"]].map(([k, v], i, a) => (
              <React.Fragment key={k}><div className="kv" style={{ padding: "0 var(--s3)" }}><span className="k">{k}</span><span className="v mono">{v}</span></div>{i < a.length - 1 && <Icon name="chevron-right" size={16} style={{ color: "var(--faint)" }} />}</React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function CreateDocModal({ onClose }) {
  const toast = useToast();
  const [step, setStep] = docS(0);
  return (
    <Modal lg title="Registrar nuevo documento" sub="Completa la ficha. Los campos con * son obligatorios." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><div className="row gap2">{step > 0 && <Button variant="secondary" icon="arrow-left" onClick={() => setStep(step - 1)}>Atrás</Button>}<Button icon={step < 2 ? "arrow-right" : "check"} onClick={() => { if (step < 2) setStep(step + 1); else { toast("Documento registrado correctamente", { tone: "ok", title: "DOC-2026-0482 creado" }); onClose(); } }}>{step < 2 ? "Continuar" : "Registrar documento"}</Button></div></>}>
      <div style={{ marginBottom: "var(--s5)" }}><Stepper steps={["Datos básicos", "Adjuntos & OCR", "Ubicación"]} current={step} /></div>
      {step === 0 && (
        <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
          <Field label="Código" hint="Se genera automáticamente"><input className="mono" defaultValue="DOC-2026-0482" disabled /></Field>
          <Field label="Tipo documental" required><select>{window.DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Nombre del documento" required><input placeholder="Ej. Contrato laboral Juan Pérez" /></Field>
          <Field label="Área responsable" required><select>{window.AREAS.map(a => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Responsable"><select>{["Laura Mejía", "Andrés Gómez", "Diana Ortiz"].map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Fecha de recepción"><input type="date" defaultValue="2026-06-03" /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="Descripción"><textarea placeholder="Describe brevemente el contenido y propósito del documento…" /></Field></div>
        </div>
      )}
      {step === 1 && (
        <div className="col gap4">
          <div className="uploader"><Icon name="upload-cloud" size={28} /><div style={{ marginTop: 8, fontWeight: 600 }}>Arrastra el documento escaneado aquí</div><small className="faint">PDF o imagen · mínimo 300 DPI recomendado</small></div>
          <label className="check"><input type="checkbox" defaultChecked /> Procesar OCR automáticamente al subir (extrae texto e indexa para búsqueda)</label>
          <div><div className="label" style={{ marginBottom: 8 }}>Metadatos dinámicos <HelpDot text="Campos específicos según el tipo documental seleccionado." /></div>
            <div className="grid cols-3" style={{ gap: "var(--s3)" }}><Field label="N° contrato"><input placeholder="4821" /></Field><Field label="Cédula"><input placeholder="1.144.xxx" /></Field><Field label="Vencimiento"><input type="date" /></Field></div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="col gap4">
          <label className="check"><input type="checkbox" defaultChecked /> Este documento tiene original físico que debe ubicarse</label>
          <div className="grid cols-3" style={{ gap: "var(--s3)" }}>
            <Field label="Sede" required><select>{window.SEDES.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Archivo" required><select>{window.ARCHIVES.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Estantería"><input placeholder="Est. 4" /></Field>
            <Field label="Caja"><input placeholder="CAJ-00128" /></Field>
            <Field label="Carpeta"><input placeholder="Carpeta 12" /></Field>
            <Field label="N° folios"><input type="number" placeholder="24" /></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DocumentsPage({ user, navigate }) {
  const [q, setQ] = docS("");
  const [fState, setFState] = docS("");
  const [fArea, setFArea] = docS("");
  const [sel, setSel] = docS({});
  const [detail, setDetail] = docS(null);
  const [creating, setCreating] = docS(false);
  const canCreate = can(user, ["document.create"]);

  const rows = docM(() => window.DOCS.filter(d =>
    (!q || (d.name + d.id + d.resp).toLowerCase().includes(q.toLowerCase())) &&
    (!fState || d.state === fState) && (!fArea || d.area === fArea)), [q, fState, fArea]);

  const selCount = Object.values(sel).filter(Boolean).length;
  const allChecked = rows.length > 0 && rows.every(r => sel[r.id]);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Documentos</h1><p className="lead">Registra, clasifica, versiona y consulta todos los documentos de la empresa. Cada uno conserva su historial, versiones y ubicación física.</p></div>
        <div className="page-actions">
          <Button variant="ghost" icon="download">Exportar</Button>
          {canCreate && <Button icon="plus" onClick={() => setCreating(true)}>Registrar documento</Button>}
        </div>
      </div>

      <Card flush className="an-rise">
        <div className="row between wrap" style={{ padding: "var(--s4)", gap: "var(--s3)", borderBottom: "1px solid var(--line)" }}>
          <div className="search-box"><Icon name="search" size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, código o responsable…" /></div>
          <div className="toolbar">
            <FilterChip label={fState || "Estado"} icon="filter" active={!!fState} onClick={() => setFState(fState ? "" : "Activo")} />
            {fState && <select value={fState} onChange={e => setFState(e.target.value)} style={{ width: 150, height: 30 }}>{Object.keys(DOC_STATES).map(s => <option key={s}>{s}</option>)}</select>}
            <FilterChip label={fArea || "Área"} icon="building" active={!!fArea} onClick={() => setFArea(fArea ? "" : window.AREAS[0])} />
            {fArea && <select value={fArea} onChange={e => setFArea(e.target.value)} style={{ width: 150, height: 30 }}>{window.AREAS.map(s => <option key={s}>{s}</option>)}</select>}
            <Tip text="Guardar esta combinación de filtros"><Button variant="ghost" size="sm" icon="star">Guardar filtro</Button></Tip>
          </div>
        </div>
        {selCount > 0 && (
          <div className="row between" style={{ padding: "var(--s3) var(--s4)", background: "var(--brand-ghost)", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)", color: "var(--brand-ink)" }}>{selCount} seleccionados</span>
            <div className="row gap2"><Button variant="ghost" size="sm" icon="route">Transferir</Button><Button variant="ghost" size="sm" icon="download">Descargar</Button><Button variant="ghost" size="sm" icon="tag">Etiquetar</Button></div>
          </div>
        )}
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr>
              <th className="row-check"><input type="checkbox" checked={allChecked} onChange={e => { const n = {}; rows.forEach(r => n[r.id] = e.target.checked); setSel(n); }} style={{ width: 16 }} /></th>
              <th>Código</th><th>Nombre</th><th>Tipo</th><th>Área</th><th>Responsable</th><th>Estado</th><th>Fecha</th><th>Vence</th><th></th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 16).map(d => (
                <tr key={d.id} className="clickable" onClick={() => setDetail(d)}>
                  <td className="row-check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={!!sel[d.id]} onChange={e => setSel(s => ({ ...s, [d.id]: e.target.checked }))} style={{ width: 16 }} /></td>
                  <td className="cell-mono">{d.id}</td>
                  <td className="cell-strong">{d.name}</td>
                  <td><span className="tag-soft">{d.type}</span></td>
                  <td>{d.area}</td>
                  <td><div className="t-avatar"><Avatar size="sm" name={d.resp} color="var(--viz-indigo)" /><span style={{ fontSize: "var(--fs-sm)" }}>{d.resp.split(" ")[0]}</span></div></td>
                  <td><Badge tone={DOC_STATES[d.state]} dot>{d.state}</Badge></td>
                  <td className="muted mono" style={{ fontSize: "var(--fs-xs)" }}>{d.date}</td>
                  <td className="muted mono" style={{ fontSize: "var(--fs-xs)", color: d.due !== "—" ? "var(--warn)" : "" }}>{d.due}</td>
                  <td onClick={e => e.stopPropagation()}><Button variant="subtle" size="sm" icon="more-horizontal" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row between" style={{ padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
          <span>Mostrando {Math.min(16, rows.length)} de {window.fmtN(rows.length)} documentos</span>
          <div className="row gap2"><Button variant="ghost" size="sm" icon="chevron-left" disabled /><span className="mono">1 / {Math.ceil(rows.length / 16)}</span><Button variant="ghost" size="sm" icon="chevron-right" /></div>
        </div>
      </Card>

      {detail && <DocDetail doc={detail} onClose={() => setDetail(null)} />}
      {creating && <CreateDocModal onClose={() => setCreating(false)} />}
    </>
  );
}

window.DocumentsPage = DocumentsPage;
