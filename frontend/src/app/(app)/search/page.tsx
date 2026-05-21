"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type SearchItem = {
  entity_type?: string;
  id?: number | string;
  title?: string;
  subtitle?: string;
  status?: string;
  archive_id?: number | null;
  url?: string;
  idDocument?: number;
  document_name?: string;
  document_type?: string;
  version?: number;
};

type SearchResult = {
  engine: string;
  total?: number;
  items?: SearchItem[];
  raw?: unknown;
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");
  const search = useMutation({
    mutationFn: async () => (await api.post<SearchResult>("/search/documents", { q, entity_type: entityType || null, status: status || null, page: 1, size: 25 })).data
  });
  const reindex = useMutation({ mutationFn: async () => api.post("/search/documents/reindex") });
  function submit(event: FormEvent) {
    event.preventDefault();
    search.mutate();
  }
  return (
    <>
      <PageTitle title="Busqueda enterprise" description="Documentos, expedientes, carpetas, cajas, archivos, empleados, FUID y kardex respetando permisos." action={<button className="ghost" onClick={() => reindex.mutate()}><RefreshCcw size={17} /> Reindexar</button>} />
      <section className="card">
        <form className="toolbar" onSubmit={submit}>
          <input placeholder="contrato 2024 Cali, caja CX-001, Juan Perez" value={q} onChange={(event) => setQ(event.target.value)} />
          <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
            <option value="">Todas las entidades</option>
            <option value="document">Documentos</option>
            <option value="expedient">Expedientes</option>
            <option value="folder">Carpetas</option>
            <option value="box">Cajas</option>
            <option value="archive">Archivos</option>
            <option value="employee">Empleados</option>
            <option value="fuid">FUID</option>
            <option value="kardex">Kardex</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="received">received</option>
            <option value="rejected">rejected</option>
            <option value="archived">archived</option>
          </select>
          <button><Search size={17} /> Buscar</button>
        </form>
      </section>
      <section className="card">
        <div className="toolbar"><span className="status">{search.data?.engine ?? "sin busqueda"}</span><span className="muted">{search.data?.total ?? 0} resultados</span></div>
        <table>
          <thead><tr><th>Resultado</th><th>Entidad</th><th>Estado</th><th>Archivo</th><th>Accion</th></tr></thead>
          <tbody>
            {search.data?.items?.map((item) => {
              const title = item.title ?? item.document_name ?? `Resultado ${item.id ?? item.idDocument}`;
              const entity = item.entity_type ?? "document";
              const url = item.url ?? (item.idDocument ? `/documents?document=${item.idDocument}` : "#");
              return (
                <tr key={`${entity}-${item.id ?? item.idDocument}`}>
                  <td><strong>{title}</strong><br /><span className="muted">{item.subtitle ?? item.document_type ?? ""}</span></td>
                  <td><span className="status">{entity}</span></td>
                  <td>{item.status ? <span className="status">{item.status}</span> : <span className="muted">N/A</span>}</td>
                  <td>{item.archive_id ?? "N/A"}</td>
                  <td>{url !== "#" ? <Link className="button-link ghost-link" href={url}>Abrir</Link> : <span className="muted">Sin ruta</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {search.data && !search.data.items?.length ? <p className="muted">No encontramos resultados. Prueba cambiar filtros o revisar permisos de archivo.</p> : null}
      </section>
    </>
  );
}
