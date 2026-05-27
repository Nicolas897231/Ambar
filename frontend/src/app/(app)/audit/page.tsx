"use client";

import { Download, RefreshCcw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "@/components/ui/enterprise";

type Audit = {
  idAudit: number;
  action: string;
  module: string;
  entity: string | null;
  entity_id: string | null;
  entity_label?: string | null;
  archive_id?: number | null;
  ps405Identification: string | null;
  ip_address: string | null;
  user_agent?: string | null;
  result: string;
  severity: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string;
};
type Summary = { total: number; critical: number; warning: number; denied: number; failed: number; by_module: Record<string, number> };

function tone(value: string) {
  if (["critical", "denied", "failed"].includes(value)) return "danger" as const;
  if (value === "warning") return "warning" as const;
  if (value === "success" || value === "info") return "success" as const;
  return "neutral" as const;
}

function JsonBlock({ value }: { value?: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) return <p className="muted">Sin datos registrados.</p>;
  return <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AuditPage() {
  const [module, setModule] = useState("");
  const [severity, setSeverity] = useState("");
  const [result, setResult] = useState("");
  const [userId, setUserId] = useState("");
  const [archiveId, setArchiveId] = useState("");
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<Audit | null>(null);
  const audits = useQuery({
    queryKey: ["audit", module, severity, result, userId, archiveId, queryText],
    queryFn: async () => (await api.get<Audit[]>("/audit", { params: { module: module || undefined, severity: severity || undefined, result: result || undefined, user_id: userId || undefined, archive_id: archiveId || undefined, q: queryText || undefined, limit: 100 } })).data
  });
  const summary = useQuery({ queryKey: ["audit-summary"], queryFn: async () => (await api.get<Summary>("/audit/summary")).data });
  const detail = useQuery({ queryKey: ["audit-detail", selected?.idAudit], enabled: Boolean(selected), queryFn: async () => (await api.get<Audit>(`/audit/${selected?.idAudit}`)).data });
  const current = detail.data ?? selected;

  const rows = useMemo(() => audits.data ?? [], [audits.data]);

  async function exportCsv() {
    const response = await api.get("/audit/export", { params: { format: "csv", module: module || undefined, severity: severity || undefined, result: result || undefined, user_id: userId || undefined, archive_id: archiveId || undefined }, responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auditoria_ambar.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Breadcrumbs items={["Plataforma", "Auditoria"]} />
      <PageHeader
        eyebrow="Control interno"
        title="Auditoria"
        description="Consulta eventos sensibles, accesos denegados, cambios, exportaciones y operaciones documentales."
        action={<div className="inline-actions"><button className="ghost" onClick={exportCsv}><Download size={17} /> Exportar CSV</button><button className="ghost" onClick={() => audits.refetch()}><RefreshCcw size={17} /> Actualizar</button></div>}
      />

      <section className="metrics">
        <MetricCard label="Eventos 30 dias" value={summary.data?.total ?? 0} tone="info" />
        <MetricCard label="Criticos" value={summary.data?.critical ?? 0} tone={(summary.data?.critical ?? 0) ? "danger" : "success"} />
        <MetricCard label="Advertencias" value={summary.data?.warning ?? 0} tone={(summary.data?.warning ?? 0) ? "warning" : "success"} />
        <MetricCard label="Accesos denegados" value={summary.data?.denied ?? 0} tone={(summary.data?.denied ?? 0) ? "danger" : "success"} />
      </section>

      <section className="card">
        <FilterBar>
          <label>Buscar<span className="input-icon"><Search size={15} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Accion, entidad, etiqueta..." /></span></label>
          <label>Modulo<input value={module} onChange={(event) => setModule(event.target.value)} placeholder="archives, audit..." /></label>
          <label>Usuario<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Identificacion" /></label>
          <label>Archivo<input value={archiveId} onChange={(event) => setArchiveId(event.target.value)} inputMode="numeric" placeholder="ID" /></label>
          <label>Severidad<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">Todas</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
          <label>Resultado<select value={result} onChange={(event) => setResult(event.target.value)}><option value="">Todos</option><option value="success">Success</option><option value="denied">Denied</option><option value="failed">Failed</option></select></label>
        </FilterBar>
        {audits.isLoading ? <LoadingSkeleton rows={6} /> : null}
        {!audits.isLoading && rows.length === 0 ? <EmptyState icon={<ShieldCheck size={20} />} title="No hay eventos" description="No hay auditoria para estos filtros." /> : null}
        <DataTable>
          <table>
            <thead><tr><th>Fecha</th><th>Severidad</th><th>Resultado</th><th>Modulo</th><th>Accion</th><th>Entidad</th><th>Usuario</th><th>IP</th><th></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.idAudit}>
                  <td>{new Date(item.created_at).toLocaleString("es-CO")}</td>
                  <td><StatusBadge value={item.severity} tone={tone(item.severity)} /></td>
                  <td><StatusBadge value={item.result} tone={tone(item.result)} /></td>
                  <td>{item.module}</td>
                  <td>{item.action}</td>
                  <td>{item.entity ?? "-"} {item.entity_id ?? ""}</td>
                  <td>{item.ps405Identification ?? "-"}</td>
                  <td>{item.ip_address ?? "-"}</td>
                  <td><button className="ghost" onClick={() => setSelected(item)}>Ver cambios</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </section>

      <DetailDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={current ? `Evento #${current.idAudit}` : "Evento"} subtitle={current ? `${current.module} - ${current.action}` : undefined}>
        {current ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Severidad" value={current.severity} tone={tone(current.severity)} />
              <MetricCard label="Resultado" value={current.result} tone={tone(current.result)} />
              <MetricCard label="Archivo" value={current.archive_id ?? "-"} />
            </div>
            <section className="card"><h3>Contexto</h3><p className="muted">Usuario: {current.ps405Identification ?? "-"} | IP: {current.ip_address ?? "-"} | Entidad: {current.entity ?? "-"} #{current.entity_id ?? ""}</p><p className="muted">{current.entity_label ?? "Sin etiqueta de entidad."}</p></section>
            <section className="split">
              <div className="card"><h3>Antes</h3><JsonBlock value={current.old_values} /></div>
              <div className="card"><h3>Despues</h3><JsonBlock value={current.new_values} /></div>
            </section>
            <section className="card"><h3>Navegador</h3><p className="muted">{current.user_agent ?? "Sin user-agent registrado."}</p></section>
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
