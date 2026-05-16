"use client";

import { FormEvent, useState } from "react";
import { FilePenLine, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string };
type Signature = { idRequest: number; ps520IdDocument: number; signer_identification: string; status: string; expires_at: string };

export default function SignaturesPage() {
  const client = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const [signer, setSigner] = useState("1000000000");
  const documents = useQuery({ queryKey: ["documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents")).data });
  const signatures = useQuery({ queryKey: ["signatures"], queryFn: async () => (await api.get<Signature[]>("/signatures/requests")).data });
  const create = useMutation({ mutationFn: async () => api.post("/signatures/requests", { document_id: Number(documentId), signer_identification: signer }), onSuccess: () => client.invalidateQueries({ queryKey: ["signatures"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Firmas electronicas" description="Solicitudes, evidencias, hash documental, token y trazabilidad legal." action={<button className="ghost" onClick={() => signatures.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Solicitar firma</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Documento<select value={documentId} onChange={(event) => setDocumentId(event.target.value)} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <label>Firmante<input value={signer} onChange={(event) => setSigner(event.target.value)} required /></label>
            <button><FilePenLine size={17} /> Solicitar</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>ID</th><th>Documento</th><th>Firmante</th><th>Estado</th><th>Expira</th></tr></thead>
            <tbody>{signatures.data?.map((item) => <tr key={item.idRequest}><td>{item.idRequest}</td><td>{item.ps520IdDocument}</td><td>{item.signer_identification}</td><td><span className="status">{item.status}</span></td><td>{new Date(item.expires_at).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
