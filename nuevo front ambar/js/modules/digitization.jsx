/* ============================================================
   AMBAR — Gestión Documental: Digitalización y OCR
   ============================================================ */
const { useState: dgS } = React;

const DG_COLS = [
  { key: "pend", name: "Pendiente", color: "var(--muted)" },
  { key: "scan", name: "Escaneado", color: "var(--viz-sky)" },
  { key: "ocr", name: "OCR procesando", color: "var(--viz-amber)" },
  { key: "val", name: "Validado", color: "var(--viz-indigo)" },
  { key: "arch", name: "Archivado", color: "var(--ok)" },
];
const DG_ITEMS = [
  { id: "DG-2041", name: "Contrato laboral · M. Ruiz", col: "pend", op: "Laura M.", folios: 24, pri: "alta" },
  { id: "DG-2042", name: "Facturas proveedor abril", col: "pend", op: "Laura M.", folios: 12, pri: "media" },
  { id: "DG-2039", name: "Actas comité 2026", col: "scan", op: "Laura M.", folios: 40, pri: "media" },
  { id: "DG-2038", name: "Hoja de vida · S. López", col: "scan", op: "Diana O.", folios: 6, pri: "alta" },
  { id: "DG-2035", name: "Resoluciones Q1", col: "ocr", op: "Laura M.", folios: 18, pri: "baja" },
  { id: "DG-2030", name: "Certificaciones banco", col: "val", op: "Laura M.", folios: 4, pri: "media" },
  { id: "DG-2028", name: "Correspondencia DIAN", col: "val", op: "Marta L.", folios: 3, pri: "alta" },
  { id: "DG-2020", name: "Contrato obra civil", col: "arch", op: "Laura M.", folios: 34, pri: "media" },
  { id: "DG-2018", name: "Pólizas 2025", col: "arch", op: "Laura M.", folios: 9, pri: "baja" },
];
const PRI = { alta: "danger", media: "warning", baja: "outline" };

function OCRResult() {
  const [box, setBox] = dgS(null);
  const fields = [["Nombre completo", "Mariana Ruiz Castaño", 98], ["Cédula", "1.144.082.331", 99], ["Cargo", "Analista comercial", 94], ["Salario", "$ 3.200.000", 88], ["Fecha de inicio", "2026-06-01", 96], ["Tipo de contrato", "Término indefinido", 91]];
  return (
    <div className="ocr-split">
      <Card pad="sm" className="an-rise">
        <CardHead title="Documento escaneado" sub="Pasa el cursor sobre los campos detectados" />
        <div className="ocr-doc placeholder-img" style={{ background: "var(--panel-2)" }}>
          <div className="col center" style={{ gap: 6, color: "var(--faint)" }}><Icon name="file-text" size={40} /><span className="mono" style={{ fontSize: 11 }}>contrato_m_ruiz.pdf · pág 1/24</span></div>
          {[[12, 18, 50, 6], [12, 30, 38, 5], [55, 30, 30, 5], [12, 48, 44, 5]].map((b, i) => (
            <div key={i} className="ocr-box" style={{ left: b[0] + "%", top: b[1] + "%", width: b[2] + "%", height: b[3] + "%", opacity: box === i ? 1 : .45 }} onMouseEnter={() => setBox(i)} onMouseLeave={() => setBox(null)} />
          ))}
        </div>
        <div className="row gap2" style={{ marginTop: "var(--s3)" }}><Button variant="ghost" size="sm" icon="chevron-left" /><span className="mono muted" style={{ fontSize: "var(--fs-xs)", alignSelf: "center" }}>Página 1 de 24</span><Button variant="ghost" size="sm" icon="chevron-right" /><div className="spacer" /><Button variant="ghost" size="sm" icon="maximize" /></div>
      </Card>
      <div className="col gap4">
        <Card pad="sm" className="an-rise">
          <div className="row between" style={{ marginBottom: "var(--s3)" }}><b>Campos detectados</b><Badge tone="success" icon="sparkles">Confianza 94%</Badge></div>
          <div className="col gap2">
            {fields.map(([k, v, c], i) => (
              <div key={k} className="list-row" style={{ background: box === i ? "var(--brand-ghost)" : "" }} onMouseEnter={() => setBox(i < 4 ? i : null)}>
                <div className="grow"><div className="k" style={{ fontSize: "var(--fs-2xs)", color: "var(--muted)", fontWeight: 600 }}>{k}</div><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{v}</div></div>
                <div className="col" style={{ alignItems: "flex-end", gap: 3 }}><div className="conf-bar"><i style={{ width: c + "%", background: c >= 95 ? "var(--ok)" : c >= 88 ? "var(--warn)" : "var(--danger)" }} /></div><small className="mono faint">{c}%</small></div>
              </div>
            ))}
          </div>
        </Card>
        <Card pad="sm" className="an-rise" style={{ maxHeight: 180, overflow: "auto" }}>
          <b style={{ fontSize: "var(--fs-sm)" }}>Texto completo extraído</b>
          <p className="mono" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.7, color: "var(--muted)", marginTop: 8 }}>CONTRATO INDIVIDUAL DE TRABAJO. Entre EMPRESA AMBAR S.A.S. y MARIANA RUIZ CASTAÑO, identificada con C.C. 1.144.082.331, se celebra el presente contrato a término indefinido para el cargo de Analista Comercial…</p>
        </Card>
        <div className="row gap2"><Button className="grow" icon="check">Validar e indexar</Button><Button variant="ghost" icon="rotate">Reprocesar</Button></div>
      </div>
    </div>
  );
}

function DigitizationPage({ user }) {
  const [tab, setTab] = dgS("queue");
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestión Documental</div><h1>Digitalización y OCR</h1><p className="lead">Convierte documentos físicos en digitales: escanea, extrae el texto con OCR e indéxalo para búsquedas. Sigue el avance en la cola de trabajo.</p></div>
        <div className="page-actions"><Button icon="scan-line" onClick={() => setTab("scan")}>Nuevo escaneo</Button></div>
      </div>
      <div className="statstrip an-rise">
        <div><div className="ss-n">412</div><div className="ss-l">En cola</div></div>
        <div><div className="ss-n">38</div><div className="ss-l">Escaneados hoy</div></div>
        <div><div className="ss-n">96%</div><div className="ss-l">Confianza OCR media</div></div>
        <div><div className="ss-n">82.6%</div><div className="ss-l">Digitalización global</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "queue", label: "Cola de digitalización", icon: "list-checks" }, { key: "scan", label: "Escaneo", icon: "scan-line" }, { key: "ocr", label: "Resultado OCR", icon: "sparkles" }]} />

      {tab === "queue" && (
        <div className="kanban an-rise">
          {DG_COLS.map(col => {
            const items = DG_ITEMS.filter(it => it.col === col.key);
            return (
              <div key={col.key} className="kcol">
                <div className="kcol-head"><span className="k-tag" style={{ background: col.color }} /><span className="k-name">{col.name}</span><span className="k-count">{items.length}</span></div>
                <div className="kcol-body">
                  {items.map(it => (
                    <div key={it.id} className="kcard">
                      <div className="row between"><span className="mono faint" style={{ fontSize: "var(--fs-2xs)" }}>{it.id}</span><Badge tone={PRI[it.pri]}>{it.pri}</Badge></div>
                      <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)", margin: "6px 0" }}>{it.name}</div>
                      <div className="row between"><span className="muted" style={{ fontSize: "var(--fs-xs)" }}><Icon name="file" size={11} style={{ verticalAlign: -1 }} /> {it.folios} folios</span><div className="t-avatar"><Avatar size="sm" name={it.op} color="var(--viz-teal)" /></div></div>
                      {col.key === "ocr" && <div style={{ marginTop: 8 }}><Meter value={64} /></div>}
                    </div>
                  ))}
                  {items.length === 0 && <div className="muted" style={{ textAlign: "center", padding: "var(--s5)", fontSize: "var(--fs-xs)" }}>Sin documentos</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "scan" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: "var(--s4)" }}>
          <Card className="an-rise">
            <CardHead title="Subida masiva" sub="Arrastra varios documentos o conéctalos desde el escáner" icon="upload-cloud" />
            <div className="uploader" style={{ padding: "var(--s9)" }}><Icon name="upload-cloud" size={36} /><div style={{ marginTop: 10, fontWeight: 700, fontSize: "var(--fs-md)" }}>Arrastra aquí tus archivos</div><small className="faint">PDF o imágenes · 300 DPI · hasta 100 archivos</small><div className="row gap2" style={{ marginTop: "var(--s4)", justifyContent: "center" }}><Button variant="secondary" icon="file">Seleccionar archivos</Button><Button variant="ghost" icon="scan-line">Conectar escáner</Button></div></div>
            <div className="scan-grid" style={{ marginTop: "var(--s4)" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="scan-thumb placeholder-img" style={{ background: "var(--panel-2)" }}><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>pág {i + 1}</span>
                  <div className="st-tools"><button title="Rotar"><Icon name="rotate" size={13} /></button><button title="Recortar"><Icon name="crop" size={13} /></button><button title="Eliminar"><Icon name="trash" size={13} /></button></div>
                </div>
              ))}
            </div>
          </Card>
          <div className="col gap4">
            <Card pad="sm" className="an-rise"><CardHead title="Opciones de escaneo" />
              <div className="col gap4">
                <Field label="Calidad"><select><option>Alta (300 DPI)</option><option>Media (200 DPI)</option><option>Color / Gris / B&N</option></select></Field>
                <label className="check"><input type="checkbox" defaultChecked /> Aplicar OCR automáticamente</label>
                <label className="check"><input type="checkbox" defaultChecked /> Enderezar y limpiar bordes</label>
                <label className="check"><input type="checkbox" /> Dividir por código de barras</label>
                <Field label="Vincular a"><select><option>Expediente existente…</option><option>Nuevo documento</option></select></Field>
              </div>
            </Card>
            <Button className="btn-block" size="lg" icon="sparkles" onClick={() => setTab("ocr")}>Procesar 6 páginas</Button>
          </div>
        </div>
      )}

      {tab === "ocr" && <OCRResult />}
    </>
  );
}

window.DigitizationPage = DigitizationPage;
