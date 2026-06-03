"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Info, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Expedient = { idExpedient: number; expedient_code: string; expedient_name: string; ps930IdArchive: number };
type DocumentItem = { idDocument: number; document_name: string; expedient_id?: number; folder_id?: number; folio_start?: number; folio_end?: number };
type FoliationReport = {
  status: string;
  ranges: Array<{ document_id: number; document_name: string; start: number; end: number; total: number; folder_id: number }>;
  unfoliated: Array<{ idDocument: number; document_name: string; folder_id: number }>;
  duplicates: unknown[];
  gaps: Array<{ from: number; to: number }>;
  total_folios: number;
};

function tone(status: string) {
  if (status === "complete" || status === "valid") return "success" as const;
  if (status === "inconsistent") return "danger" as const;
  return "warning" as const;
}

function statusCopy(status?: string) {
  if (status === "complete" || status === "valid") return "Foliacion completa";
  if (status === "inconsistent") return "Hay inconsistencias";
  return "Pendiente de revision";
}

export default function FoliationPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioCount, setFolioCount] = useState("");
  const [message, setMessage] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<Expedient[]>("/archives/expedients")).data });
  const documents = useQuery({ queryKey: ["documents", expedientId], queryFn: async () => (await api.get<DocumentItem[]>(`/documents?limit=100${expedientId ? `&expedient_id=${expedientId}` : ""}`)).data });
  const report = useQuery({ queryKey: ["foliation-report", expedientId], enabled: Boolean(expedientId), queryFn: async () => (await api.get<FoliationReport>(`/archives/expedients/${expedientId}/foliation`)).data });
  const selected = documents.data?.find((item) => item.idDocument === Number(documentId));
  const folioEnd = useMemo(() => {
    const start = Number(folioStart);
    const count = Number(folioCount);
    return start > 0 && count > 0 ? start + count - 1 : null;
  }, [folioCount, folioStart]);
  const errors = [
    !expedientId ? "Selecciona un expediente." : "",
    !documentId ? "Selecciona el documento que vas a foliar." : "",
    !selected?.folder_id ? "El documento no tiene carpeta asociada." : "",
    !folioStart || Number(folioStart) < 1 ? "El folio inicial debe ser mayor a cero." : "",
    !folioCount || Number(folioCount) < 1 ? "La cantidad de folios debe ser mayor a cero." : ""
  ].filter(Boolean);

  const create = useMutation({
    mutationFn: async () => api.post("/archives/foliation", {
      document_id: Number(documentId),
      expedient_id: Number(expedientId),
      folder_id: Number(selected?.folder_id),
      folio_start: Number(folioStart),
      folio_end: folioEnd
    }),
    onSuccess: () => {
      setFolioStart("");
      setFolioCount("");
      setDocumentId("");
      setMessage("Foliacion actualizada. El expediente fue validado nuevamente.");
      report.refetch();
      client.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      const apiError = error as { response?: { data?: { detail?: string } } };
      setMessage(apiError.response?.data?.detail ?? "No fue posible registrar folios. Revisa duplicados, saltos o contexto documental.");
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (errors.length) {
      setMessage(errors[0]);
      return;
    }
    create.mutate();
  }

  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Foliacion</span></div>
      <PageTitle title="Foliacion documental" description="Control simple de hojas numeradas por expediente: inicio, cantidad y validacion de saltos." action={<button className="ghost" onClick={() => report.refetch()}><RefreshCcw size={17} /> Validar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") || message.startsWith("Selecciona") || message.startsWith("El") || message.startsWith("La") ? "error" : "status"}>{message}</span></div> : null}

      <section className="card foliation-hero">
        <div>
          <h2>¿Para que sirven los folios?</h2>
          <p className="muted">Un folio es una hoja numerada del expediente fisico. AMBAR usa esos rangos para detectar duplicados, saltos y documentos sin foliar antes de cerrar o transferir un expediente.</p>
        </div>
        <div className="context-help">
          <Info size={18} />
          <p>Forma simple: si un documento empieza en el folio 10 y tiene 5 hojas, el sistema guarda 10 al 14.</p>
        </div>
      </section>

      <section className="card">
        <label>Expediente<select value={expedientId} onChange={(event) => { setExpedientId(event.target.value); setDocumentId(""); }}><option value="">Seleccionar expediente</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
      </section>

      <section className="metrics">
        <MetricCard label="Estado" value={statusCopy(report.data?.status)} tone={tone(report.data?.status ?? "pending")} />
        <MetricCard label="Total folios" value={report.data?.total_folios ?? 0} />
        <MetricCard label="Sin foliar" value={report.data?.unfoliated.length ?? 0} tone={(report.data?.unfoliated.length ?? 0) ? "warning" : "success"} />
        <MetricCard label="Saltos" value={report.data?.gaps.length ?? 0} tone={(report.data?.gaps.length ?? 0) ? "danger" : "success"} />
      </section>

      <div className="split">
        <section className="card">
          <h2>Registrar foliacion</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Documento<select value={documentId} onChange={(event) => {
              const value = event.target.value;
              const current = documents.data?.find((item) => item.idDocument === Number(value));
              setDocumentId(value);
              setFolioStart(current?.folio_start ? String(current.folio_start) : "");
              setFolioCount(current?.folio_start && current?.folio_end ? String(current.folio_end - current.folio_start + 1) : "");
            }} required><option value="">Seleccionar documento</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <div className="form-row-2">
              <label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} placeholder="Ej: 1" required /></label>
              <label>Cantidad de folios<input type="number" min="1" value={folioCount} onChange={(event) => setFolioCount(event.target.value)} placeholder="Ej: 3" required /></label>
            </div>
            <div className="profile-summary">
              <strong>{folioEnd ? `Se registrara: folios ${folioStart} al ${folioEnd}` : "Completa inicio y cantidad"}</strong>
              <p>Carpeta detectada: {selected?.folder_id ?? "pendiente"}. {selected?.folio_start && selected?.folio_end ? `Este documento ya tenia folios ${selected.folio_start} al ${selected.folio_end}; al guardar se corrige ese rango.` : "El sistema valida duplicados y saltos al guardar."}</p>
            </div>
            {errors.length ? <div className="validation-panel">{errors.map((item) => <span key={item}>{item}</span>)}</div> : null}
            <button disabled={create.isPending}><Plus size={17} /> Registrar folios</button>
          </form>
        </section>

        <section className="card table-card">
          <div className="toolbar space-between">
            <h2>Mapa de folios</h2>
            <StatusBadge value={statusCopy(report.data?.status)} tone={tone(report.data?.status ?? "pending")} />
          </div>
          {report.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!expedientId ? <EmptyState icon={<AlertTriangle size={20} />} title="Selecciona un expediente" description="La validacion se ejecuta por expediente para respetar orden original." /> : null}
          {expedientId && report.data?.status === "complete" ? <EmptyState icon={<CheckCircle2 size={20} />} title="Foliacion integra" description="No hay duplicados, saltos ni documentos sin foliar." /> : null}
          <DataTable><table><thead><tr><th>Documento</th><th>Carpeta</th><th>Inicio</th><th>Final</th><th>Total</th></tr></thead><tbody>{report.data?.ranges.map((item) => <tr key={item.document_id}><td><FileText size={14} /> {item.document_name}</td><td>{item.folder_id}</td><td>{item.start}</td><td>{item.end}</td><td>{item.total}</td></tr>)}</tbody></table></DataTable>
          {report.data?.gaps.length ? <div className="card compact"><h3>Saltos detectados</h3>{report.data.gaps.map((item) => <p className="muted" key={`${item.from}-${item.to}`}>Faltan folios del {item.from} al {item.to}</p>)}</div> : null}
          {report.data?.unfoliated.length ? <div className="card compact"><h3>Documentos sin foliar</h3>{report.data.unfoliated.map((item) => <p className="muted" key={item.idDocument}>{item.document_name} / carpeta {item.folder_id}</p>)}</div> : null}
        </section>
      </div>
    </>
  );
}
