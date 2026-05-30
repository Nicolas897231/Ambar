"use client";

import Link from "next/link";
import { Archive, Boxes, ClipboardList, FileWarning, HandCoins, RefreshCcw, Route } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Breadcrumbs,
  DataTable,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  StatusBadge,
  TimelineEvent
} from "@/components/ui/enterprise";

type Dashboard = {
  archives: number;
  documents: number;
  expedients: number;
  current_custodies: number;
  pending_movements: number;
  overdue_loans: number;
  by_archive: { idArchive: number; archive_name: string; documents: number; expedients: number; boxes: number }[];
};

type CustodySummary = {
  current: number;
  loaned: number;
  transferred: number;
  by_entity_type: Record<string, number>;
  by_archive: { archive_id: number; archive_name: string; custodian?: string | null; current: number; loaned: number; active: number }[];
};

type Movement = {
  idMovement: number;
  movement_type: string;
  entity_type: string;
  entity_id: number;
  status: string;
  ps930OriginArchiveId?: number | null;
  ps930DestinationArchiveId?: number | null;
  observations?: string | null;
  created_at?: string;
};

function tone(status: string) {
  if (["accepted", "received", "returned"].includes(status)) return "success" as const;
  if (["rejected", "overdue"].includes(status)) return "danger" as const;
  if (["pending_reception", "active", "pending"].includes(status)) return "warning" as const;
  return "info" as const;
}

export default function CustodyPage() {
  const dashboard = useQuery({ queryKey: ["custody-dashboard"], queryFn: async () => (await api.get<Dashboard>("/archives/dashboard")).data });
  const custody = useQuery({ queryKey: ["custody-summary"], queryFn: async () => (await api.get<CustodySummary>("/archives/custody/summary")).data });
  const movements = useQuery({ queryKey: ["custody-dashboard", "movements"], queryFn: async () => (await api.get<Movement[]>("/archives/kardex")).data });
  const recent = (movements.data ?? []).slice(0, 5);

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Dashboard"]} />
      <PageHeader
        eyebrow="Operacion archivistica"
        title="Dashboard de custodia"
        description="Vista ejecutable de archivos, expedientes, cajas, transferencias, recepciones, prestamos y riesgos operativos."
        action={<button className="ghost" type="button" onClick={() => { dashboard.refetch(); movements.refetch(); }}><RefreshCcw size={17} /> Actualizar</button>}
      />

      <section className="metrics">
        <MetricCard label="Archivos activos" value={dashboard.data?.archives ?? 0} tone="info" cta="Gestionar archivos" href="/archives" />
        <MetricCard label="Documentos custodiados" value={dashboard.data?.documents ?? 0} tone="success" cta="Ver repositorio" href="/repository" />
        <MetricCard label="Expedientes activos" value={dashboard.data?.expedients ?? 0} cta="Expedientes vivos" href="/expedients" />
        <MetricCard label="Custodias actuales" value={dashboard.data?.current_custodies ?? custody.data?.current ?? 0} tone="info" cta="Ver trazabilidad" href="/kardex" />
        <MetricCard label="Recepciones pendientes" value={dashboard.data?.pending_movements ?? 0} tone={(dashboard.data?.pending_movements ?? 0) ? "warning" : "success"} cta="Revisar recepcion" href="/reception" />
        <MetricCard label="Prestamos vencidos" value={dashboard.data?.overdue_loans ?? 0} tone={(dashboard.data?.overdue_loans ?? 0) ? "danger" : "success"} cta="Resolver prestamos" href="/loans" />
      </section>

      <section className="module-grid">
        <Link className="module-card" href="/archives"><Archive size={20} /><strong>Archivos</strong><span>Unidades archivisticas por sede, tipo y custodio.</span></Link>
        <Link className="module-card" href="/kardex"><Route size={20} /><strong>Kardex</strong><span>Timeline automatico de movimientos y custodia.</span></Link>
        <Link className="module-card" href="/transfer-batches"><Boxes size={20} /><strong>Transferencias</strong><span>Lotes documentales, evidencias y estados.</span></Link>
        <Link className="module-card" href="/reception"><ClipboardList size={20} /><strong>Recepcion</strong><span>Aceptar, recibir parcialmente o rechazar.</span></Link>
        <Link className="module-card" href="/fuid"><FileWarning size={20} /><strong>Inventario / FUID</strong><span>Inventario documental exportable y trazable.</span></Link>
        <Link className="module-card" href="/loans"><HandCoins size={20} /><strong>Prestamos</strong><span>Salida temporal, vencimientos y devolucion.</span></Link>
      </section>

      <div className="dashboard-split">
        <section className="card">
          <div className="toolbar space-between"><h2>Movimientos recientes</h2><Link className="inline-link" href="/kardex">Ver kardex</Link></div>
          {movements.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {!movements.isLoading && recent.length === 0 ? <EmptyState icon={<Route size={20} />} title="Sin movimientos recientes" description="Los eventos de documentos, transferencias, FUID y prestamos apareceran aqui." /> : null}
          <div className="timeline">
            {recent.map((item) => (
              <TimelineEvent
                key={item.idMovement}
                state={item.status}
                tone={tone(item.status)}
                title={`${item.movement_type} - ${item.entity_type} #${item.entity_id}`}
                description={item.observations ?? `Archivo ${item.ps930OriginArchiveId ?? "-"} -> ${item.ps930DestinationArchiveId ?? "-"}`}
                meta={item.created_at ? new Date(item.created_at).toLocaleString("es-CO") : "Sin fecha"}
              />
            ))}
          </div>
        </section>

        <section className="card">
          <div className="toolbar space-between"><h2>Capacidad por archivo</h2><StatusBadge value={`${dashboard.data?.by_archive.length ?? 0} archivos`} tone="info" /></div>
          {dashboard.isLoading ? <LoadingSkeleton rows={4} /> : null}
          <DataTable>
            <table>
              <thead><tr><th>Archivo</th><th>Documentos</th><th>Expedientes</th><th>Cajas</th><th>Riesgo</th></tr></thead>
              <tbody>
                {dashboard.data?.by_archive.map((item) => (
                  <tr key={item.idArchive}>
                    <td>{item.archive_name}</td>
                    <td>{item.documents}</td>
                    <td>{item.expedients}</td>
                    <td>{item.boxes}</td>
                    <td><StatusBadge value={item.boxes > 80 ? "capacidad alta" : "normal"} tone={item.boxes > 80 ? "warning" : "success"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>
      </div>

      <section className="card">
        <div className="toolbar space-between"><h2>Responsabilidad documental actual</h2><StatusBadge value={`${custody.data?.loaned ?? 0} prestadas`} tone={(custody.data?.loaned ?? 0) ? "warning" : "success"} /></div>
        <DataTable>
          <table>
            <thead><tr><th>Archivo</th><th>Custodio</th><th>Unidades bajo custodia</th><th>Activas</th><th>Prestadas</th></tr></thead>
            <tbody>
              {custody.data?.by_archive.map((item) => (
                <tr key={item.archive_id}>
                  <td>{item.archive_name}</td>
                  <td>{item.custodian ?? "Sin custodio asignado"}</td>
                  <td>{item.current}</td>
                  <td>{item.active}</td>
                  <td><StatusBadge value={item.loaned} tone={item.loaned ? "warning" : "success"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </section>
    </>
  );
}
