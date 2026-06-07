"use client";

import Link from "next/link";
import { FileText, RefreshCcw, ScanLine } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataTable, EmptyState, LoadingSkeleton, MetricCard, StatusBadge } from "@/components/ui/enterprise";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string; document_type: string; status: string; files_count: number; version: number };

export default function DigitizationPage() {
  const documents = useQuery({ queryKey: ["digitization-documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents?limit=100")).data });
  const items = documents.data ?? [];
  const pending = items.filter((item) => item.files_count === 0);
  const digital = items.filter((item) => item.files_count > 0);

  return (
    <>
      <PageTitle title="Digitalizacion" description="Bandeja para priorizar documentos fisicos pendientes de archivo digital u OCR futuro." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <section className="metrics">
        <MetricCard label="Documentos revisados" value={items.length} tone="info" />
        <MetricCard label="Pendientes de archivo" value={pending.length} tone={pending.length ? "warning" : "success"} />
        <MetricCard label="Con archivo digital" value={digital.length} tone="success" />
        <MetricCard label="OCR preparado" value="Futuro" tone="neutral" />
      </section>
      <section className="card">
        <div className="toolbar space-between"><h2><ScanLine size={18} /> Cola documental</h2><StatusBadge value="API real" tone="success" /></div>
        {documents.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!documents.isLoading && !items.length ? <EmptyState icon={<FileText size={20} />} title="Sin documentos" description="Cuando existan documentos, AMBAR mostrara cuales requieren digitalizacion." /> : null}
        {items.length ? (
          <DataTable>
            <table>
              <thead><tr><th>Documento</th><th>Tipologia</th><th>Archivos</th><th>Version</th><th>Estado</th><th>Accion</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.idDocument}>
                    <td>{item.document_name}</td>
                    <td>{item.document_type}</td>
                    <td><StatusBadge value={item.files_count ? `${item.files_count} archivo(s)` : "pendiente"} tone={item.files_count ? "success" : "warning"} /></td>
                    <td>{item.version}</td>
                    <td><StatusBadge value={item.status} tone={item.status === "active" ? "success" : "neutral"} /></td>
                    <td><Link className="inline-link" href={`/documents?document=${item.idDocument}`}>Abrir documento</Link></td>
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
