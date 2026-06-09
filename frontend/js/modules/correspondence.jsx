/* ============================================================
   AMBAR — Archivo & Custodia: Correspondencia
   ============================================================ */
const { useState: coS } = React;

const MAILS = [
  { id: "RAD-ENT-2026-0912", dir: "Entrante", subject: "Requerimiento información tributaria", from: "DIAN", to: "Financiera", date: "2026-06-03 08:41", state: "Pendiente", due: "2026-06-10" },
  { id: "RAD-ENT-2026-0911", dir: "Entrante", subject: "Solicitud certificado laboral", from: "Banco de Occidente", to: "RRHH", date: "2026-06-02 14:20", state: "En trámite", due: "2026-06-05" },
  { id: "RAD-SAL-2026-0455", dir: "Saliente", subject: "Respuesta tutela 2026-118", from: "Jurídica", to: "Juzgado 3 Civil", date: "2026-06-02 11:05", state: "Respondido", due: "—" },
  { id: "RAD-ENT-2026-0908", dir: "Entrante", subject: "Cotización suministros", from: "Suministros del Valle", to: "Compras", date: "2026-06-01 09:30", state: "Cerrado", due: "—" },
  { id: "RAD-ENT-2026-0907", dir: "Entrante", subject: "Notificación auditoría externa", from: "KPMG", to: "Gerencia", date: "2026-05-31 16:12", state: "En trámite", due: "2026-06-09" },
  { id: "RAD-SAL-2026-0454", dir: "Saliente", subject: "Envío informe trimestral", from: "Financiera", to: "Junta Directiva", date: "2026-05-30 10:00", state: "Cerrado", due: "—" },
];
const MAIL_STATE = { Pendiente: "warning", "En trámite": "info", Respondido: "brand", Cerrado: "success" };

function RadicateModal({ onClose }) {
  const toast = useToast();
  const [dir, setDir] = coS("Entrante");
  return (
    <Modal title="Radicar correspondencia" sub="Registra una comunicación entrante o saliente" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" onClick={() => { toast("Correspondencia radicada y distribuida al área", { tone: "ok", title: dir === "Entrante" ? "RAD-ENT-2026-0913" : "RAD-SAL-2026-0456" }); onClose(); }}>Radicar</Button></>}>
      <div className="col gap4">
        <Segmented options={[{ value: "Entrante", label: "Entrante", icon: "mail" }, { value: "Saliente", label: "Saliente", icon: "send" }]} value={dir} onChange={setDir} />
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
          <Field label="Radicado / Consecutivo"><input className="mono" defaultValue={dir === "Entrante" ? "RAD-ENT-2026-0913" : "RAD-SAL-2026-0456"} disabled /></Field>
          <Field label="Fecha y hora"><input type="datetime-local" defaultValue="2026-06-03T09:00" /></Field>
          <Field label={dir === "Entrante" ? "Remitente" : "Destinatario"} required><input placeholder={dir === "Entrante" ? "Ej. DIAN" : "Ej. Juzgado 3 Civil"} /></Field>
          <Field label="Área responsable" required><select>{window.AREAS.map(a => <option key={a}>{a}</option>)}</select></Field>
          {dir === "Saliente" && <Field label="Medio de envío"><select><option>Físico / mensajería</option><option>Correo electrónico</option><option>Plataforma oficial</option></select></Field>}
          {dir === "Entrante" && <Field label="Plazo de respuesta"><input type="date" /></Field>}
        </div>
        <Field label="Asunto" required><input placeholder="Resumen de la comunicación" /></Field>
        <div className="uploader"><Icon name="paperclip" size={22} /><div style={{ marginTop: 6, fontWeight: 600, fontSize: "var(--fs-sm)" }}>Adjuntar documento escaneado</div></div>
        <label className="check"><input type="checkbox" defaultChecked /> Notificar y distribuir automáticamente al área responsable</label>
      </div>
    </Modal>
  );
}

function CorrespondencePage({ user }) {
  const [tab, setTab] = coS("Pendiente");
  const [rad, setRad] = coS(false);
  const [track, setTrack] = coS(null);
  const tabs = [{ key: "Pendiente", label: "Pendientes" }, { key: "En trámite", label: "En trámite" }, { key: "Respondido", label: "Respondidos" }, { key: "Cerrado", label: "Cerrados" }, { key: "all", label: "Todos" }];
  const rows = MAILS.filter(m => tab === "all" || m.state === tab);
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Correspondencia</h1><p className="lead">Radica y haz seguimiento a todas las comunicaciones que entran y salen de la empresa, con distribución automática al área y control de plazos de respuesta.</p></div><div className="page-actions">{can(user, ["mail.manage"]) && <Button icon="plus" onClick={() => setRad(true)}>Radicar correspondencia</Button>}</div></div>
      <div className="grid cols-4 stagger">
        <Metric label="Pendientes de trámite" value={8} icon="inbox" tone="warn" accent />
        <Metric label="En trámite" value={14} icon="mail-open" tone="info" accent />
        <Metric label="Por vencer plazo" value={3} icon="clock" tone="danger" accent />
        <Metric label="Radicados (mes)" value={212} icon="mail" tone="brand" accent trend="+6%" trendDir="up" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <Card flush className="an-rise">
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Radicado</th><th>Dir.</th><th>Asunto</th><th>De / Para</th><th>Área</th><th>Fecha</th><th>Plazo</th><th>Estado</th><th></th></tr></thead><tbody>
          {rows.map(m => (<tr key={m.id} className="clickable" onClick={() => setTrack(m)}><td className="cell-mono">{m.id}</td><td><Icon name={m.dir === "Entrante" ? "mail" : "send"} size={15} style={{ color: m.dir === "Entrante" ? "var(--viz-teal)" : "var(--viz-indigo)" }} /></td><td className="cell-strong">{m.subject}</td><td className="muted" style={{ fontSize: "var(--fs-sm)" }}>{m.from}</td><td>{m.to}</td><td className="muted mono" style={{ fontSize: "var(--fs-2xs)" }}>{m.date}</td><td className="mono" style={{ fontSize: "var(--fs-xs)", color: m.due !== "—" ? "var(--warn)" : "var(--faint)" }}>{m.due}</td><td><Badge tone={MAIL_STATE[m.state]} dot>{m.state}</Badge></td><td onClick={e => e.stopPropagation()}><Button variant="subtle" size="sm" icon="chevron-right" onClick={() => setTrack(m)} /></td></tr>))}
        </tbody></table></div>
      </Card>
      {rad && <RadicateModal onClose={() => setRad(false)} />}
      {track && (
        <Drawer title={track.subject} sub={<span className="mono">{track.id}</span>} onClose={() => setTrack(null)} headExtra={<Badge tone={MAIL_STATE[track.state]} dot>{track.state}</Badge>}>
          <div className="dl"><dt>Dirección</dt><dd>{track.dir}</dd><dt>{track.dir === "Entrante" ? "Remitente" : "Destinatario"}</dt><dd>{track.from}</dd><dt>Área</dt><dd>{track.to}</dd><dt>Radicado</dt><dd className="mono">{track.date}</dd><dt>Plazo respuesta</dt><dd>{track.due}</dd></div>
          <div className="divider" />
          <CardHead title="Seguimiento del trámite" />
          <div className="timeline">
            {[["mail", "Radicado y sellado", track.date, "ok"], ["send", "Distribuido a " + track.to, "+2 min", "brand"], ["eye", "Recibido por el área", "+1 h", ""], ...(track.state === "Cerrado" || track.state === "Respondido" ? [["check-circle", "Respondido y cerrado", "+1 día", "ok"]] : [["clock", "En trámite — pendiente de respuesta", "ahora", "brand"]])].map(([ic, t, m, tn], i) => (
              <div key={i} className={`tl-item ${tn}`}><div className="tl-dot"><Icon name={ic} size={13} /></div><div className="tl-body"><div className="tl-title" style={{ fontSize: "var(--fs-sm)" }}>{t}</div><div className="tl-meta">{m}</div></div></div>
            ))}
          </div>
          <div className="row gap2" style={{ marginTop: "var(--s4)" }}><Button className="grow" icon="send">Generar respuesta</Button><Button variant="ghost" icon="check">Cerrar trámite</Button></div>
        </Drawer>
      )}
    </>
  );
}

window.CorrespondencePage = CorrespondencePage;
