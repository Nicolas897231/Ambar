"use client";

import Link from "next/link";
import { Mail, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string; document_type: string; status: string; archive_id?: number; expedient_id?: number };

const correspondenceWords = ["oficio", "memorando", "carta", "comunicacion", "radicado", "respuesta"];

export default function CorrespondencePage() {
  const documents = useQuery({ queryKey: ["correspondence-documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents?limit=100")).data });
  const items = (documents.data ?? []).filter((item) => correspondenceWords.some((word) => `${item.document_name} ${item.document_type}`.toLowerCase().includes(word)));

  return (
    <>
      <PageTitle title="Correspondencia" description="Vista operacional de comunicaciones documentales registradas en el SGDEA." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="metrics">
        <MetricCard label="Comunicaciones" value={items.length} tone="info" />
        <MetricCard label="Activas" value={items.filter((item) => item.status === "active").length} tone="success" />
        <MetricCard label="Con expediente" value={items.filter((item) => item.expedient_id).length} tone="neutral" />
        <MetricCard label="Fuente" value="Documentos" tone="neutral" />
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><Mail size={18} /> Radicados documentales</h2><StatusBadge value="filtrado por tipologia" tone="info" /></div>
        {documents.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!documents.isLoading && !items.length ? <EmptyState icon={<Mail size={20} />} title="Sin correspondencia registrada" description="Crea documentos tipo oficio, memorando, carta o radicado para verlos aqui." action={<Link className="button-link" href="/documents">Registrar documento</Link>} /> : null}
        {items.length ? (
          <DataTable>
            <table>
              <thead><tr><th>Comunicacion</th><th>Tipo</th><th>Archivo</th><th>Expediente</th><th>Estado</th><th>Accion</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.idDocument}>
                    <td>{item.document_name}</td>
                    <td>{item.document_type}</td>
                    <td>{item.archive_id ?? "Sin archivo"}</td>
                    <td>{item.expedient_id ?? "Sin expediente"}</td>
                    <td><StatusBadge value={item.status} tone={item.status === "active" ? "success" : "neutral"} /></td>
                    <td><Link className="inline-link" href={`/documents?document=${item.idDocument}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : null}
      </section>
    </>
  );
}
