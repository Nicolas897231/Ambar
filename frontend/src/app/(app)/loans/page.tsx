"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, HandCoins, Paperclip, RefreshCcw, RotateCcw, Search, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Breadcrumbs,
  DataTable,
  DetailDrawer,
  EmptyState,
  FilterBar,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  StatusBadge
} from "@/components/ui/enterprise";

type Archive = { idArchive: number; archive_name: string };
type LoanSummary = {
  active: number;
  due_today: number;
  overdue: number;
  returned_this_month: number;
  by_entity_type: Record<string, number>;
};
type Loan = {
  idLoan: number;
  loan_code: string;
  entity_type: string;
  entity_id: number;
  ps930IdArchive: number;
  archive_name?: string | null;
  current_location_path?: string | null;
  requested_by: string;
  requester_identification?: string | null;
  requester_area?: string | null;
  requester_contact?: string | null;
  approved_by?: string | null;
  due_at?: string | null;
  returned_at?: string | null;
  status: string;
  reason?: string | null;
  observations?: string | null;
  return_observations?: string | null;
  delivery_evidence_url?: string | null;
  return_evidence_url?: string | null;
  created_at?: string;
};

const statuses = [
  { value: "", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "due_today", label: "Vencen hoy" },
  { value: "overdue", label: "Vencidos" },
  { value: "returned", label: "Devueltos" },
  { value: "cancelled", label: "Cancelados" }
];

function loanTone(status: string) {
  if (status === "returned") return "success" as const;
  if (status === "cancelled") return "neutral" as const;
  if (status === "overdue") return "danger" as const;
  if (status === "due_today") return "warning" as const;
  return status === "active" ? "info" as const : "neutral" as const;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Prestamo activo",
    due_today: "Vence hoy",
    overdue: "Prestamo vencido",
    returned: "Devuelto",
    cancelled: "Cancelado",
    rejected: "Rechazado"
  };
  return labels[status] ?? status;
}

export default function LoansPage() {
  const client = useQueryClient();
  const [archiveId, setArchiveId] = useState("");
  const [entityType, setEntityType] = useState("document");
  const [entityId, setEntityId] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [requesterIdentification, setRequesterIdentification] = useState("");
  const [requesterArea, setRequesterArea] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Loan | null>(null);
  const [returnObservation, setReturnObservation] = useState("");
  const [returnEvidence, setReturnEvidence] = useState("");
  const [deliveryEvidence, setDeliveryEvidence] = useState("");

  const archives = useQuery({ queryKey: ["archives"], queryFn: async () => (await api.get<Archive[]>("/archives")).data });
  const summary = useQuery({ queryKey: ["loans-summary"], queryFn: async () => (await api.get<LoanSummary>("/archives/loans/summary")).data });
  const loans = useQuery({
    queryKey: ["loans", statusFilter, typeFilter, search],
    queryFn: async () => (await api.get<Loan[]>("/archives/loans", { params: { status_filter: statusFilter || undefined, entity_type: typeFilter || undefined, search: search || undefined } })).data
  });
  const detail = useQuery({
    queryKey: ["loan-detail", selected?.idLoan],
    enabled: Boolean(selected),
    queryFn: async () => (await api.get<Loan>(`/archives/loans/${selected?.idLoan}`)).data
  });

  const currentLoan = detail.data ?? selected;

  function invalidate() {
    client.invalidateQueries({ queryKey: ["loans"] });
    client.invalidateQueries({ queryKey: ["loans-summary"] });
    client.invalidateQueries({ queryKey: ["loan-detail"] });
    client.invalidateQueries({ queryKey: ["kardex"] });
    client.invalidateQueries({ queryKey: ["custody-dashboard"] });
  }

  const create = useMutation({
    mutationFn: async () => api.post("/archives/loans", {
      archive_id: Number(archiveId),
      entity_type: entityType,
      entity_id: Number(entityId),
      requested_by: requestedBy,
      requester_identification: requesterIdentification || undefined,
      requester_area: requesterArea || undefined,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      reason: reason || undefined,
      observations: observations || undefined
    }),
    onSuccess: () => {
      setEntityId("");
      setRequestedBy("");
      setRequesterIdentification("");
      setRequesterArea("");
      setDueAt("");
      setReason("");
      setObservations("");
      invalidate();
    }
  });

  const returnLoan = useMutation({
    mutationFn: async (loan: Loan) => api.post(`/archives/loans/${loan.idLoan}/return`, {
      observations: returnObservation || "Devolucion documental registrada desde AMBAR.",
      return_evidence_url: returnEvidence || undefined
    }),
    onSuccess: () => {
      setReturnObservation("");
      setReturnEvidence("");
      invalidate();
    }
  });

  const cancelLoan = useMutation({
    mutationFn: async (loan: Loan) => api.post(`/archives/loans/${loan.idLoan}/cancel`, { observations: "Prestamo cancelado desde AMBAR." }),
    onSuccess: invalidate
  });

  const addDeliveryEvidence = useMutation({
    mutationFn: async (loan: Loan) => api.post(`/archives/loans/${loan.idLoan}/delivery-evidence`, { evidence_url: deliveryEvidence, observation: "Evidencia de entrega registrada." }),
    onSuccess: () => {
      setDeliveryEvidence("");
      invalidate();
    }
  });

  const checkOverdue = useMutation({
    mutationFn: async () => api.post("/archives/loans/check-overdue"),
    onSuccess: invalidate
  });

  const rows = useMemo(() => loans.data ?? [], [loans.data]);
  const unitsByType = summary.data?.by_entity_type ?? {};

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  async function exportCsv() {
    const response = await api.get("/archives/loans/export", { params: { format: "csv" }, responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prestamos_documentales.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Prestamos"]} />
      <PageHeader
        eyebrow="Control de salida temporal"
        title="Prestamos documentales"
        description="Controla prestamos por documento, carpeta, expediente o caja con vencimientos, evidencias, Kardex y auditoria."
        action={<div className="inline-actions"><button className="ghost" type="button" onClick={() => checkOverdue.mutate()}><CalendarClock size={17} /> Revisar vencimientos</button><button className="ghost" type="button" onClick={() => loans.refetch()}><RefreshCcw size={17} /> Actualizar</button></div>}
      />

      <section className="metrics">
        <MetricCard label="Activos" value={summary.data?.active ?? 0} tone="info" cta="Unidades fuera del archivo" />
        <MetricCard label="Vencen hoy" value={summary.data?.due_today ?? 0} tone={(summary.data?.due_today ?? 0) ? "warning" : "success"} cta="Requieren seguimiento" />
        <MetricCard label="Vencidos" value={summary.data?.overdue ?? 0} tone={(summary.data?.overdue ?? 0) ? "danger" : "success"} cta="Bloquean cierre/transferencia" />
        <MetricCard label="Devueltos este mes" value={summary.data?.returned_this_month ?? 0} tone="success" cta="Custodia normalizada" />
      </section>

      <div className="split">
        <section className="card">
          <h2>Crear prestamo documental</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Archivo<select value={archiveId} onChange={(event) => setArchiveId(event.target.value)} required><option value="">Seleccionar</option>{archives.data?.map((archive) => <option key={archive.idArchive} value={archive.idArchive}>{archive.archive_name}</option>)}</select></label>
            <label>Unidad documental<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option></select></label>
            <label>ID entidad<input value={entityId} onChange={(event) => setEntityId(event.target.value)} inputMode="numeric" required /></label>
            <label>Solicitante<input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} required placeholder="Nombre completo" /></label>
            <label>Identificacion<input value={requesterIdentification} onChange={(event) => setRequesterIdentification(event.target.value)} placeholder="Opcional" /></label>
            <label>Area solicitante<input value={requesterArea} onChange={(event) => setRequesterArea(event.target.value)} placeholder="Juridica, RRHH..." /></label>
            <label>Fecha limite<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
            <label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Consulta, auditoria, tramite..." /></label>
            <label>Observaciones<textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Condiciones de entrega" /></label>
            <button disabled={create.isPending}><HandCoins size={17} /> Registrar prestamo</button>
          </form>
          {create.isError ? <p className="error-text">No se pudo crear el prestamo. Verifica disponibilidad, permisos y transferencias pendientes.</p> : null}
        </section>

        <section className="card">
          <FilterBar>
            <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Codigo, solicitante, archivo..." /></span></label>
            <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>Tipo<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option><option value="document">Documento</option><option value="folder">Carpeta</option><option value="expedient">Expediente</option><option value="box">Caja</option></select></label>
            <button className="ghost" type="button" onClick={exportCsv}><Download size={16} /> Exportar</button>
          </FilterBar>
          {loans.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!loans.isLoading && rows.length === 0 ? <EmptyState icon={<CalendarClock size={20} />} title="Sin prestamos" description="Los prestamos activos, vencidos y devueltos apareceran aqui." /> : null}
          <DataTable>
            <table>
              <thead><tr><th>Prestamo</th><th>Unidad</th><th>Solicitante</th><th>Archivo</th><th>Vence</th><th>Estado</th><th>Accion</th></tr></thead>
              <tbody>
                {rows.map((loan) => (
                  <tr key={loan.idLoan}>
                    <td>{loan.loan_code}</td>
                    <td>{loan.entity_type} #{loan.entity_id}</td>
                    <td>{loan.requested_by}</td>
                    <td>{loan.archive_name ?? loan.ps930IdArchive}</td>
                    <td>{loan.due_at ? new Date(loan.due_at).toLocaleString("es-CO") : "-"}</td>
                    <td><StatusBadge value={statusLabel(loan.status)} tone={loanTone(loan.status)} /></td>
                    <td><button className="ghost" type="button" onClick={() => setSelected(loan)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>
      </div>

      <section className="card">
        <h2>Unidades prestadas por tipo</h2>
        <div className="module-grid">
          <MetricCard label="Documentos" value={unitsByType.document ?? 0} />
          <MetricCard label="Carpetas" value={unitsByType.folder ?? 0} />
          <MetricCard label="Expedientes" value={unitsByType.expedient ?? 0} />
          <MetricCard label="Cajas" value={unitsByType.box ?? 0} />
        </div>
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={currentLoan ? `${currentLoan.loan_code} - ${statusLabel(currentLoan.status)}` : "Prestamo"}
        subtitle={currentLoan ? `${currentLoan.entity_type} #${currentLoan.entity_id}` : undefined}
      >
        {currentLoan ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Archivo" value={currentLoan.archive_name ?? currentLoan.ps930IdArchive} />
              <MetricCard label="Solicitante" value={currentLoan.requested_by} />
              <MetricCard label="Estado" value={statusLabel(currentLoan.status)} tone={loanTone(currentLoan.status)} />
            </div>
            <section className="card">
              <h3>Custodia temporal</h3>
              <p className="muted">{currentLoan.current_location_path ?? "Ubicacion fisica pendiente."}</p>
              <p className="muted">Entrega: {currentLoan.approved_by ?? "No registrado"} | Vence: {currentLoan.due_at ? new Date(currentLoan.due_at).toLocaleString("es-CO") : "Sin fecha"}</p>
            </section>
            <section className="card">
              <h3>Observaciones</h3>
              <p className="muted">{currentLoan.observations ?? "Sin observaciones."}</p>
              {currentLoan.reason ? <p className="muted">Motivo: {currentLoan.reason}</p> : null}
              {currentLoan.status === "overdue" ? <p className="error-text"><AlertTriangle size={15} /> Prestamo vencido. Esta unidad bloquea cierres y transferencias.</p> : null}
            </section>
            <section className="card">
              <h3>Evidencias</h3>
              <p className="muted">Entrega: {currentLoan.delivery_evidence_url ? <a href={currentLoan.delivery_evidence_url} target="_blank">Ver evidencia</a> : "Sin evidencia"}</p>
              <p className="muted">Devolucion: {currentLoan.return_evidence_url ? <a href={currentLoan.return_evidence_url} target="_blank">Ver evidencia</a> : "Sin evidencia"}</p>
              {currentLoan.status !== "returned" && currentLoan.status !== "cancelled" ? (
                <div className="inline-actions">
                  <input value={deliveryEvidence} onChange={(event) => setDeliveryEvidence(event.target.value)} placeholder="URL evidencia entrega" />
                  <button className="ghost" type="button" onClick={() => addDeliveryEvidence.mutate(currentLoan)} disabled={!deliveryEvidence || addDeliveryEvidence.isPending}><Paperclip size={16} /> Guardar</button>
                </div>
              ) : null}
            </section>
            {["active", "due_today", "overdue"].includes(currentLoan.status) ? (
              <section className="card">
                <h3>Registrar devolucion</h3>
                <label>Observacion<textarea value={returnObservation} onChange={(event) => setReturnObservation(event.target.value)} placeholder="Estado de la unidad documental al regresar" /></label>
                <label>Evidencia de devolucion<input value={returnEvidence} onChange={(event) => setReturnEvidence(event.target.value)} placeholder="URL opcional" /></label>
                <div className="inline-actions">
                  <button onClick={() => returnLoan.mutate(currentLoan)} disabled={returnLoan.isPending}><CheckCircle2 size={17} /> Registrar devolucion</button>
                  <button className="ghost danger" type="button" onClick={() => cancelLoan.mutate(currentLoan)} disabled={cancelLoan.isPending}><XCircle size={17} /> Cancelar</button>
                </div>
              </section>
            ) : (
              <EmptyState icon={<RotateCcw size={20} />} title="Prestamo cerrado" description="La unidad documental ya no esta en salida temporal activa." />
            )}
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
