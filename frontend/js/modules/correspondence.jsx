/* ============================================================
   AMBAR - Radicacion manual de comunicaciones
   ============================================================ */
const { useState: coS, useMemo: coM } = React;

const RAD_TABS = [
  { key: "all", label: "Todos", icon: "mail" },
  { key: "assigned", label: "Mis pendientes", icon: "user-check" },
  { key: "unassigned", label: "Sin responsable", icon: "alert-triangle" },
  { key: "due_soon", label: "Por vencer", icon: "clock" },
  { key: "overdue", label: "Vencidos", icon: "alert-circle" },
  { key: "closed", label: "Cerrados", icon: "check-circle" },
];

function radStatusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("venc")) return "danger";
  if (["cerrado", "respondido"].includes(s)) return "success";
  if (s === "anulado") return "danger";
  if (s === "asignado" || s === "en_respuesta") return "info";
  return "warning";
}

function radLabel(value) {
  return String(value || "-").replace(/_/g, " ");
}

function fmtDate(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return String(value).slice(0, 10); }
}

function RadicationModal({ direction = "inbound", users, departments, expedients, documents, onClose, onCreated }) {
  const toast = useToast();
  const isInbound = direction === "inbound";
  const [busy, setBusy] = coS(false);
  const [payload, setPayload] = coS({
    sender_type: "persona",
    sender_name: "",
    sender_document: "",
    sender_email: "",
    sender_phone: "",
    recipient_name: "",
    recipient_email: "",
    subject: "",
    description: "",
    communication_type: "carta",
    reception_channel: isInbound ? "ventanilla" : "correo",
    dependency_id: "",
    assigned_to: "",
    expedient_id: "",
    document_id: "",
    priority: "normal",
    due_date: "",
  });
  const setField = (key, value) => setPayload((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const missing = [];
    if (isInbound && !payload.sender_name.trim()) missing.push("remitente");
    if (!isInbound && !payload.recipient_name.trim()) missing.push("destinatario");
    if (!payload.subject.trim()) missing.push("asunto");
    if (!payload.communication_type) missing.push("tipo de comunicacion");
    if (payload.sender_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.sender_email)) missing.push("correo del remitente valido");
    if (payload.recipient_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.recipient_email)) missing.push("correo del destinatario valido");
    if (missing.length) {
      toast(`Falta: ${missing.join(", ")}.`, { tone: "danger", title: "Radicacion incompleta" });
      return;
    }
    const body = {
      sender_type: payload.sender_type || null,
      sender_name: payload.sender_name || null,
      sender_document: payload.sender_document || null,
      sender_email: payload.sender_email || null,
      sender_phone: payload.sender_phone || null,
      recipient_name: payload.recipient_name || null,
      recipient_email: payload.recipient_email || null,
      subject: payload.subject,
      description: payload.description || null,
      communication_type: payload.communication_type,
      reception_channel: payload.reception_channel || null,
      dependency_id: payload.dependency_id ? Number(payload.dependency_id) : null,
      assigned_to: payload.assigned_to || null,
      expedient_id: payload.expedient_id ? Number(payload.expedient_id) : null,
      document_id: payload.document_id ? Number(payload.document_id) : null,
      priority: payload.priority,
      due_at: payload.due_date ? `${payload.due_date}T23:59:00` : null,
      metadata: {},
    };
    setBusy(true);
    try {
      const created = await AmbarAPI.post(`/correspondence/${isInbound ? "inbound" : "outbound"}`, body);
      toast(`${created.radicado_code} creado correctamente.`, { tone: "ok", title: "Radicado listo" });
      onCreated(created);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible crear el radicado.", { tone: "danger", title: "Error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={isInbound ? "Radicar entrada" : "Radicar salida"}
      sub={isInbound ? "Registra una comunicacion recibida por ventanilla, correo o mensajeria." : "Registra una comunicacion emitida por la empresa."}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button icon="check" disabled={busy} onClick={submit}>{busy ? "Guardando..." : "Crear radicado"}</Button></>}
    >
      <div className="info-callout" style={{ marginBottom: "var(--s4)" }}>
        <Icon name={isInbound ? "inbox" : "send"} />
        <div><strong>{isInbound ? "Entrada controlada" : "Salida trazable"}</strong><p>AMBAR genera el numero de radicado automaticamente y deja auditoria del tramite.</p></div>
      </div>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        {isInbound ? (
          <>
            <Field label="Remitente" required><input value={payload.sender_name} onChange={(e) => setField("sender_name", e.target.value)} placeholder="Nombre de persona o entidad" /></Field>
            <Field label="Documento / NIT"><input value={payload.sender_document} onChange={(e) => setField("sender_document", e.target.value)} placeholder="Opcional" /></Field>
            <Field label="Correo remitente"><input type="email" value={payload.sender_email} onChange={(e) => setField("sender_email", e.target.value)} placeholder="correo@empresa.com" /></Field>
            <Field label="Telefono"><input inputMode="numeric" value={payload.sender_phone} onChange={(e) => setField("sender_phone", e.target.value.replace(/[^\d+]/g, ""))} placeholder="3001234567" /></Field>
          </>
        ) : (
          <>
            <Field label="Destinatario" required><input value={payload.recipient_name} onChange={(e) => setField("recipient_name", e.target.value)} placeholder="Nombre de persona o entidad" /></Field>
            <Field label="Correo destinatario"><input type="email" value={payload.recipient_email} onChange={(e) => setField("recipient_email", e.target.value)} placeholder="correo@empresa.com" /></Field>
          </>
        )}
        <Field label="Asunto" required><input value={payload.subject} onChange={(e) => setField("subject", e.target.value)} placeholder="Ej. Solicitud de certificacion laboral" /></Field>
        <Field label="Tipo"><select value={payload.communication_type} onChange={(e) => setField("communication_type", e.target.value)}>
          <option value="carta">Carta</option><option value="oficio">Oficio</option><option value="pqrs">PQRS</option><option value="derecho_peticion">Derecho de peticion</option><option value="factura">Factura</option><option value="solicitud">Solicitud</option><option value="otro">Otro</option>
        </select></Field>
        <Field label="Canal"><select value={payload.reception_channel} onChange={(e) => setField("reception_channel", e.target.value)}>
          <option value="ventanilla">Ventanilla</option><option value="email">Correo electronico</option><option value="mensajeria">Mensajeria</option><option value="portal">Portal</option><option value="fisico">Fisico</option><option value="otro">Otro</option>
        </select></Field>
        <Field label="Prioridad"><select value={payload.priority} onChange={(e) => setField("priority", e.target.value)}>
          <option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Critica</option>
        </select></Field>
        <Field label="Dependencia destino"><select value={payload.dependency_id} onChange={(e) => setField("dependency_id", e.target.value)}>
          <option value="">Sin dependencia</option>{departments.map((dep) => <option key={dep.idDependency || dep.id} value={dep.idDependency || dep.id}>{dep.name || dep.department_name}</option>)}
        </select></Field>
        <Field label="Responsable"><select value={payload.assigned_to} onChange={(e) => setField("assigned_to", e.target.value)}>
          <option value="">Sin asignar</option>{users.map((u) => <option key={u.identification || u.id} value={u.identification || u.id}>{u.name || u.email}</option>)}
        </select></Field>
        <Field label="Fecha limite"><input type="date" value={payload.due_date} onChange={(e) => setField("due_date", e.target.value)} /></Field>
        <Field label="Expediente relacionado"><select value={payload.expedient_id} onChange={(e) => setField("expedient_id", e.target.value)}>
          <option value="">Sin expediente</option>{expedients.map((exp) => <option key={exp.idExpedient || exp.id} value={exp.idExpedient || exp.id}>{exp.expedient_code || exp.code} - {exp.expedient_name || exp.name}</option>)}
        </select></Field>
        <Field label="Documento relacionado"><select value={payload.document_id} onChange={(e) => setField("document_id", e.target.value)}>
          <option value="">Sin documento</option>{documents.map((doc) => <option key={doc.idDocument || doc.id} value={doc.idDocument || doc.id}>{doc.document_name || doc.name}</option>)}
        </select></Field>
      </div>
      <Field label="Descripcion"><textarea rows="4" value={payload.description} onChange={(e) => setField("description", e.target.value)} placeholder="Resumen corto del tramite, anexos o instrucciones." /></Field>
    </Modal>
  );
}

function RadicationDetail({ item, users, onClose, onChanged }) {
  const toast = useToast();
  const [assignTo, setAssignTo] = coS(item.assigned_to || "");
  const [dueDate, setDueDate] = coS(item.due_at ? String(item.due_at).slice(0, 10) : "");
  const [notes, setNotes] = coS("");
  const detailLive = useLiveData(() => AmbarAPI.get(`/correspondence/${item.id}`), item, [item.id]);
  const detail = detailLive.data || item;
  const events = detail.events || [];
  const assign = async () => {
    if (!assignTo) {
      toast("Selecciona un responsable.", { tone: "danger", title: "Asignacion incompleta" });
      return;
    }
    try {
      const updated = await AmbarAPI.post(`/correspondence/${item.id}/assign`, {
        assigned_to: assignTo,
        due_at: dueDate ? `${dueDate}T23:59:00` : null,
        notes: notes || null,
      });
      toast("Radicado asignado.", { tone: "ok", title: "Actualizado" });
      onChanged(updated);
    } catch (err) {
      toast(err.message || "No fue posible asignar.", { tone: "danger", title: "Error" });
    }
  };
  const respond = async () => {
    if (!notes.trim()) {
      toast("Escribe la respuesta o actuacion realizada.", { tone: "danger", title: "Falta nota" });
      return;
    }
    try {
      const updated = await AmbarAPI.post(`/correspondence/${item.id}/respond`, { notes });
      toast("Radicado marcado como respondido.", { tone: "ok", title: "Respuesta registrada" });
      onChanged(updated);
    } catch (err) {
      toast(err.message || "No fue posible registrar respuesta.", { tone: "danger", title: "Error" });
    }
  };
  const close = async () => {
    try {
      const updated = await AmbarAPI.post(`/correspondence/${item.id}/close`, { notes: notes || "Cierre operativo" });
      toast("Radicado cerrado.", { tone: "ok", title: "Cierre listo" });
      onChanged(updated);
      onClose();
    } catch (err) {
      toast(err.message || "No fue posible cerrar.", { tone: "danger", title: "Error" });
    }
  };
  return (
    <Drawer title={detail.radicado_code} sub={detail.subject} onClose={onClose} wide headExtra={<Badge tone={radStatusTone(detail.status)} dot>{radLabel(detail.status)}</Badge>}>
      <div className="grid cols-2" style={{ gap: "var(--s4)" }}>
        <Info label="Direccion" value={detail.direction === "inbound" ? "Entrada" : "Salida"} />
        <Info label="Prioridad" value={radLabel(detail.priority)} />
        <Info label="Remitente" value={detail.sender_name || "-"} />
        <Info label="Destinatario" value={detail.recipient_name || "-"} />
        <Info label="Dependencia" value={detail.dependency_name || "Sin dependencia"} />
        <Info label="Responsable" value={detail.assigned_to_name || detail.assigned_to || "Sin asignar"} />
        <Info label="Expediente" value={detail.expedient_code ? `${detail.expedient_code} - ${detail.expedient_name || ""}` : "Sin expediente"} />
        <Info label="Documento" value={detail.document_name || "Sin documento"} />
        <Info label="Fecha limite" value={fmtDate(detail.due_at)} />
        <Info label="Creado" value={fmtDate(detail.created_at)} />
      </div>
      {detail.description && <Card pad="sm" style={{ marginTop: "var(--s4)" }}><CardHead title="Resumen" icon="file-text" /><p>{detail.description}</p></Card>}
      <Card pad="sm" style={{ marginTop: "var(--s4)" }}>
        <CardHead title="Gestionar radicado" sub="Asignar, responder o cerrar sin salir de la bandeja." icon="settings" />
        <div className="grid cols-2" style={{ gap: "var(--s3)" }}>
          <Field label="Responsable"><select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Sin asignar</option>{users.map((u) => <option key={u.identification || u.id} value={u.identification || u.id}>{u.name || u.email}</option>)}
          </select></Field>
          <Field label="Fecha limite"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label="Nota de tramite"><textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observacion, respuesta o motivo de cierre." /></Field>
        <div className="row gap2 wrap">
          <Button variant="secondary" icon="user-check" onClick={assign}>Asignar</Button>
          <Button variant="secondary" icon="send" onClick={respond}>Marcar respondido</Button>
          <Button icon="check-circle" onClick={close}>Cerrar</Button>
        </div>
      </Card>
      <Card pad="sm" style={{ marginTop: "var(--s4)" }}>
        <CardHead title="Trazabilidad" sub="Eventos reales registrados en backend." icon="history" />
        {detailLive.loading ? <Skeleton rows={4} /> : events.length ? (
          <div className="timeline">
            {events.map((event) => (
              <div className="tl-item" key={event.id}>
                <div className="tl-dot"><Icon name="check" size={13} /></div>
                <div><strong>{radLabel(event.action)}</strong><p>{event.notes || "Sin observacion"} · {event.user_name || event.user_id || "AMBAR"} · {fmtDate(event.created_at)}</p></div>
              </div>
            ))}
          </div>
        ) : <Empty icon="history" title="Sin eventos">Este radicado aun no tiene eventos adicionales.</Empty>}
      </Card>
    </Drawer>
  );
}

function CorrespondencePage() {
  const toast = useToast();
  const [tray, setTray] = coS("all");
  const [direction, setDirection] = coS("");
  const [q, setQ] = coS("");
  const [page, setPage] = coS(0);
  const [refresh, setRefresh] = coS(0);
  const [modal, setModal] = coS(null);
  const [selected, setSelected] = coS(null);
  const query = coM(() => ({
    page: page + 1,
    size: 10,
    q,
    direction,
    tray: tray === "all" ? "" : tray,
  }), [page, q, direction, tray, refresh]);
  const recordsLive = useLiveData(() => AmbarAPI.endpoints.correspondence(query), { items: [], total: 0, page: 1, size: 10 }, [JSON.stringify(query)]);
  const summaryLive = useLiveData(() => AmbarAPI.endpoints.correspondenceSummary(), {}, [refresh]);
  const usersLive = useLiveData(() => AmbarAPI.endpoints.users({ limit: 250 }).then(AmbarAPI.listFrom), [], []);
  const depsLive = useLiveData(() => AmbarAPI.endpoints.trdDependencies().then(AmbarAPI.listFrom), [], []);
  const expedientsLive = useLiveData(() => AmbarAPI.endpoints.expedients().then(AmbarAPI.listFrom), [], []);
  const documentsLive = useLiveData(() => AmbarAPI.endpoints.documents().then(AmbarAPI.listFrom), [], []);
  const records = AmbarAPI.listFrom(recordsLive.data);
  const summary = summaryLive.data || {};
  const tabs = RAD_TABS.map((tab) => ({
    ...tab,
    count: tab.key === "assigned" ? summary.assigned_to_me : tab.key === "unassigned" ? summary.unassigned : tab.key === "due_soon" ? summary.due_soon : tab.key === "overdue" ? summary.overdue : tab.key === "closed" ? ((summary.by_status || {}).cerrado || 0) + ((summary.by_status || {}).respondido || 0) : summary.total,
  }));
  const reload = () => setRefresh((value) => value + 1);
  const exportRows = () => {
    downloadCSV("radicacion", records, ["radicado_code", "direction", "subject", "status", "priority", "assigned_to_name", "due_at", "created_at"]);
    toast("Listado exportado.", { tone: "ok", title: "CSV listo" });
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo & Custodia</div>
          <h1>Radicación</h1>
          <p className="lead">Ventanilla unica manual para comunicaciones recibidas y enviadas, con responsable, vencimiento y trazabilidad.</p>
        </div>
        <div className="row gap2 wrap">
          <Button variant="secondary" icon="download" onClick={exportRows} disabled={!records.length}>Exportar CSV</Button>
          <Button variant="secondary" icon="send" onClick={() => setModal("outbound")}>Radicar salida</Button>
          <Button icon="inbox" onClick={() => setModal("inbound")}>Radicar entrada</Button>
        </div>
      </div>

      <div className="metrics-grid four">
        <Metric label="Radicados" value={summary.total || 0} icon="mail" tone="brand" accent />
        <Metric label="Entradas" value={summary.inbound || 0} icon="inbox" tone="info" accent />
        <Metric label="Sin responsable" value={summary.unassigned || 0} icon="alert-triangle" tone="warn" accent />
        <Metric label="Vencidos" value={summary.overdue || 0} icon="alert-circle" tone="danger" accent />
      </div>

      <Card>
        <CardHead title="Bandeja de radicación" sub="Filtra por estado operativo y abre el detalle para tramitar." icon="mail" action={
          <div className="row gap2 wrap">
            <input style={{ minWidth: 260 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar radicado, asunto o remitente" />
            <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(0); }}>
              <option value="">Entrada y salida</option>
              <option value="inbound">Solo entradas</option>
              <option value="outbound">Solo salidas</option>
            </select>
          </div>
        } />
        <Tabs tabs={tabs} value={tray} onChange={(value) => { setTray(value); setPage(0); }} />
        {recordsLive.loading ? <Skeleton rows={8} /> : records.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Radicado</th><th>Asunto</th><th>Tipo</th><th>Origen / destino</th><th>Responsable</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{item.radicado_code}</td>
                      <td><strong>{item.subject}</strong><div className="muted">{item.direction === "inbound" ? "Entrada" : "Salida"}</div></td>
                      <td>{radLabel(item.communication_type)}</td>
                      <td>{item.direction === "inbound" ? (item.sender_name || "-") : (item.recipient_name || "-")}</td>
                      <td>{item.assigned_to_name || item.assigned_to || <span className="muted">Sin asignar</span>}</td>
                      <td>{fmtDate(item.due_at)}</td>
                      <td><Badge tone={radStatusTone(item.status)} dot>{radLabel(item.status)}</Badge></td>
                      <td><Button variant="ghost" size="sm" icon="chevron-right" onClick={() => setSelected(item)}>Abrir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={10} total={recordsLive.data?.total || records.length} onPage={setPage} label="radicados" />
          </>
        ) : (
          <Empty icon="mail" title="Sin radicados">No hay comunicaciones reales para este filtro.</Empty>
        )}
      </Card>

      {modal && <RadicationModal
        direction={modal}
        users={usersLive.data || []}
        departments={depsLive.data || []}
        expedients={expedientsLive.data || []}
        documents={documentsLive.data || []}
        onClose={() => setModal(null)}
        onCreated={reload}
      />}
      {selected && <RadicationDetail
        item={selected}
        users={usersLive.data || []}
        onClose={() => setSelected(null)}
        onChanged={(updated) => { setSelected(updated); reload(); }}
      />}
    </>
  );
}

window.CorrespondencePage = CorrespondencePage;
