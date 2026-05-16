"use client";

import { FormEvent, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type SearchResult = {
  engine: string;
  total?: number;
  items?: Array<{ idDocument: number; document_name: string; document_type: string; status: string; version: number }>;
  raw?: unknown;
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [status, setStatus] = useState("");
  const search = useMutation({
    mutationFn: async () => (await api.post<SearchResult>("/search/documents", { q, document_type: documentType || null, status: status || null, page: 1, size: 25 })).data
  });
  const reindex = useMutation({ mutationFn: async () => api.post("/search/documents/reindex") });
  function submit(event: FormEvent) {
    event.preventDefault();
    search.mutate();
  }
  return (
    <>
      <PageTitle title="Busqueda enterprise" description="Full-text, filtros dinamicos, fallback MySQL y preparacion OpenSearch." action={<button className="ghost" onClick={() => reindex.mutate()}><RefreshCcw size={17} /> Reindexar</button>} />
      <section className="card">
        <form className="toolbar" onSubmit={submit}>
          <input placeholder="contratos 2024 Cali" value={q} onChange={(event) => setQ(event.target.value)} />
          <input placeholder="tipo documental" value={documentType} onChange={(event) => setDocumentType(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="created">created</option>
            <option value="custody">custody</option>
          </select>
          <button><Search size={17} /> Buscar</button>
        </form>
      </section>
      <section className="card">
        <div className="toolbar"><span className="status">{search.data?.engine ?? "sin busqueda"}</span><span className="muted">{search.data?.total ?? 0} resultados</span></div>
        <table>
          <thead><tr><th>Documento</th><th>Tipo</th><th>Estado</th><th>Version</th></tr></thead>
          <tbody>{search.data?.items?.map((item) => <tr key={item.idDocument}><td>{item.document_name}</td><td>{item.document_type}</td><td><span className="status">{item.status}</span></td><td>{item.version}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
