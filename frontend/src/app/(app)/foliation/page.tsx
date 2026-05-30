"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type Expedient = { idExpedient: number; expedient_code: string; expedient_name: string; ps930IdArchive: number };
type DocumentItem = { idDocument: number; document_name: string; expedient_id?: number; folder_id?: number };
type FoliationReport = { status: string; ranges: Array<{ document_id: number; document_name: string; start: number; end: number; total: number; folder_id: number }>; unfoliated: Array<{ idDocument: number; document_name: string; folder_id: number }>; duplicates: unknown[]; gaps: Array<{ from: number; to: number }>; total_folios: number };

function tone(status: string) {
  if (status === "complete" || status === "valid") return "success" as const;
  if (status === "inconsistent") return "danger" as const;
  return "warning" as const;
}

export default function FoliationPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioEnd, setFolioEnd] = useState("");
  const [message, setMessage] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<Expedient[]>("/archives/expedients")).data });
  const documents = useQuery({ queryKey: ["documents", expedientId], queryFn: async () => (await api.get<DocumentItem[]>(`/documents?limit=100${expedientId ? `&expedient_id=${expedientId}` : ""}`)).data });
  const report = useQuery({ queryKey: ["foliation-report", expedientId], enabled: Boolean(expedientId), queryFn: async () => (await api.get<FoliationReport>(`/archives/expedients/${expedientId}/foliation`)).data });
  const create = useMutation({
    mutationFn: async () => api.post("/archives/foliation", { document_id: Number(documentId), expedient_id: Number(expedientId), folder_id: Number(folderId), folio_start: Number(folioStart), folio_end: Number(folioEnd) }),
    onSuccess: () => { setFolioStart(""); setFolioEnd(""); setMessage("Foliacion registrada y validada."); report.refetch(); client.invalidateQueries({ queryKey: ["documents"] }); },
    onError: () => setMessage("No fue posible registrar folios. Revisa duplicados, saltos o contexto documental.")
  });
  const selected = documents.data?.find((item) => item.idDocument === Number(documentId));
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <div className="breadcrumbs"><span>Gestion Documental</span><span>Foliacion</span></div>
      <PageTitle title="Foliacion documental" description="Valida duplicados, saltos, documentos sin foliar e integridad de expediente." action={<button className="ghost" onClick={() => report.refetch()}><RefreshCcw size={17} /> Validar</button>} />
      {message ? <div className="card compact"><span className={message.startsWith("No") ? "error" : "status"}>{message}</span></div> : null}
      <section className="card">
        <label>Expediente<select value={expedientId} onChange={(event) => setExpedientId(event.target.value)}><option value="">Seleccionar expediente</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
      </section>
      <section className="metrics">
        <MetricCard label="Estado" value={report.data?.status ?? "pendiente"} tone={tone(report.data?.status ?? "pending")} />
        <MetricCard label="Total folios" value={report.data?.total_folios ?? 0} />
        <MetricCard label="Sin foliar" value={report.data?.unfoliated.length ?? 0} tone={(report.data?.unfoliated.length ?? 0) ? "warning" : "success"} />
        <MetricCard label="Saltos" value={report.data?.gaps.length ?? 0} tone={(report.data?.gaps.length ?? 0) ? "danger" : "success"} />
      </section>
      <div className="split">
        <section className="card">
          <h2>Correccion manual contextual</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Documento<select value={documentId} onChange={(event) => { const value = event.target.value; setDocumentId(value); const doc = documents.data?.find((item) => item.idDocument === Number(value)); setFolderId(String(doc?.folder_id ?? "")); }} required><option value="">Seleccionar documento</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <label>Carpeta ID<input value={folderId || selected?.folder_id || ""} onChange={(event) => setFolderId(event.target.value)} required /></label>
            <div className="form-row-2"><label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} required /></label><label>Folio final<input type="number" min="1" value={folioEnd} onChange={(event) => setFolioEnd(event.target.value)} required /></label></div>
            <button disabled={create.isPending}><Plus size={17} /> Registrar correccion</button>
          </form>
        </section>
        <section className="card table-card">
          {report.isLoading ? <LoadingSkeleton rows={5} /> : null}
          {!expedientId ? <EmptyState icon={<AlertTriangle size={20} />} title="Selecciona un expediente" description="La validacion se ejecuta por expediente para respetar orden original." /> : null}
          {report.data?.status === "complete" ? <EmptyState icon={<CheckCircle2 size={20} />} title="Foliacion integra" description="No hay duplicados, saltos ni documentos sin foliar." /> : null}
          <DataTable><table><thead><tr><th>Documento</th><th>Carpeta</th><th>Inicio</th><th>Final</th><th>Total</th></tr></thead><tbody>{report.data?.ranges.map((item) => <tr key={item.document_id}><td>{item.document_name}</td><td>{item.folder_id}</td><td>{item.start}</td><td>{item.end}</td><td>{item.total}</td></tr>)}</tbody></table></DataTable>
          {report.data?.unfoliated.length ? <div className="card compact"><h3>Documentos sin foliar</h3>{report.data.unfoliated.map((item) => <p className="muted" key={item.idDocument}>{item.document_name} / carpeta {item.folder_id}</p>)}</div> : null}
        </section>
      </div>
    </>
  );
}
