"use client";

import { FormEvent, useState } from "react";
import { Bot, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string };
type OcrJob = { idJob: number; ps520IdDocument: number; status: string; confidence_avg: number | null; completed_at: string | null };

export default function OcrPage() {
  const client = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const documents = useQuery({ queryKey: ["documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents")).data });
  const jobs = useQuery({ queryKey: ["ocr-jobs"], queryFn: async () => (await api.get<OcrJob[]>("/ocr/jobs")).data });
  const create = useMutation({ mutationFn: async () => api.post("/ocr/jobs", { document_id: Number(documentId) }), onSuccess: () => client.invalidateQueries({ queryKey: ["ocr-jobs"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="OCR Center" description="Pipeline auditable: ingestion, fingerprinting, OCR, metadata e indexacion." action={<button className="ghost" onClick={() => jobs.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Procesar documento</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Documento<select value={documentId} onChange={(event) => setDocumentId(event.target.value)} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <button><Bot size={17} /> Ejecutar OCR</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Job</th><th>Documento</th><th>Estado</th><th>Confianza</th><th>Completado</th></tr></thead>
            <tbody>{jobs.data?.map((item) => <tr key={item.idJob}><td>{item.idJob}</td><td>{item.ps520IdDocument}</td><td><span className="status">{item.status}</span></td><td>{item.confidence_avg ?? 0}%</td><td>{item.completed_at ? new Date(item.completed_at).toLocaleString() : "-"}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
