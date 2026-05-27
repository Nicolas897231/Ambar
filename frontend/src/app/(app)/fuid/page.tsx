"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, GitCompare, Paperclip, Plus, RefreshCcw, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Breadcrumbs, DataTable, DetailDrawer, EmptyState, FilterBar, LoadingSkeleton, MetricCard, PageHeader, StatusBadge, TimelineEvent } from "@/components/ui/enterprise";

type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string };
type TransferItem = { idBatch: number; batch_code: string; origin_archive_id?: number; destination_archive_id?: number; status: string };
type FuidRecord = { order_number: number; documentary_unit_type: string; documentary_unit_id: number; unit_code: string; unit_title: string; support_type?: string; conservation_unit?: string; box_code?: string; folder_code?: string; shelf_code?: string; physical_location_path?: string; folio_start?: number; folio_end?: number; total_folios_declared?: number; total_folios_received?: number; quantity_declared?: number; quantity_received?: number; status: string; inconsistencies?: string[]; observations?: string };
type FuidItem = { idFuid: number; fuid_code: string; ps930IdArchive: number; archive_origin_id?: number; archive_destination_id?: number; ps950IdExpedient?: number; ps1070IdBatch?: number; support_type: string; folio_total: number; location_summary?: string; observations?: string; status: string; version: number; items_count: number; inconsistencies_count: number; delivery_evidence_count: number; reception_evidence_count: number; created_at?: string; metadata?: { items?: FuidRecord[]; evidences?: { delivery?: unknown[]; reception?: unknown[] } } };
type Comparison = { summary: { match: number; pending_review: number; inconsistencies: number }; items: Array<{ declared: FuidRecord; received?: { status: string; received_folios?: number; received_quantity?: number; rejection_reason?: string; observation?: string }; comparison_status: string; inconsistencies: string[] }> };
type KardexItem = { idMovement: number; movement_type: string; status: string; observations?: string; created_at?: string };

function tone(status: string) {
  if (["generated", "accepted", "closed", "match"].includes(status)) return "success";
  if (["under_review", "partially_received", "pending_review", "outdated"].includes(status)) return "warning";
  if (["rejected", "missing", "folio_mismatch", "quantity_mismatch"].includes(status)) return "danger";
  return "neutral";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function FuidPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const [transferId, setTransferId] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<FuidItem | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceObservation, setEvidenceObservation] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<ExpedientItem[]>("/archives/expedients")).data });
  const transfers = useQuery({ queryKey: ["transfer-batches"], queryFn: async () => (await api.get<TransferItem[]>("/transfer-batches")).data });
  const fuid = useQuery({ queryKey: ["fuid"], queryFn: async () => (await api.get<FuidItem[]>("/archives/fuid")).data });
  const detailQuery = useQuery({ queryKey: ["fuid-detail", detail?.idFuid], enabled: Boolean(detail), queryFn: async () => (await api.get<FuidItem>(`/archives/fuid/${detail?.idFuid}`)).data });
  const comparison = useQuery({ queryKey: ["fuid-comparison", detail?.idFuid], enabled: Boolean(detail?.ps1070IdBatch), queryFn: async () => (await api.get<Comparison>(`/archives/fuid/${detail?.idFuid}/compare-reception`)).data });
  const kardex = useQuery({ queryKey: ["fuid-kardex", detail?.idFuid], enabled: Boolean(detail), queryFn: async () => (await api.get<KardexItem[]>(`/archives/fuid/${detail?.idFuid}/kardex`)).data });

  const createFromExpedient = useMutation({
    mutationFn: async () => api.post(`/archives/fuid/from-expedient/${expedientId}`),
    onSuccess: () => { setExpedientId(""); client.invalidateQueries({ queryKey: ["fuid"] }); }
  });
  const createFromTransfer = useMutation({
    mutationFn: async () => api.post(`/archives/fuid/from-transfer/${transferId}`),
    onSuccess: () => { setTransferId(""); client.invalidateQueries({ queryKey: ["fuid"] }); client.invalidateQueries({ queryKey: ["transfer-batches"] }); }
  });
  const regenerate = useMutation({
    mutationFn: async () => api.post(`/archives/fuid/${detail?.idFuid}/regenerate`, { reason: "Regenerado desde modulo FUID" }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["fuid"] }); client.invalidateQueries({ queryKey: ["fuid-detail", detail?.idFuid] }); }
  });
  const close = useMutation({
    mutationFn: async () => api.post(`/archives/fuid/${detail?.idFuid}/close`, { observation: "FUID cerrado desde AMBAR" }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["fuid"] }); client.invalidateQueries({ queryKey: ["fuid-detail", detail?.idFuid] }); }
  });
  const evidence = useMutation({
    mutationFn: async (type: "delivery" | "reception") => api.post(`/archives/fuid/${detail?.idFuid}/${type}-evidence`, { observation: evidenceObservation, evidence_url: evidenceUrl || null, result: type === "reception" ? "accepted" : null }),
    onSuccess: () => { setEvidenceUrl(""); setEvidenceObservation(""); client.invalidateQueries({ queryKey: ["fuid"] }); client.invalidateQueries({ queryKey: ["fuid-detail", detail?.idFuid] }); client.invalidateQueries({ queryKey: ["fuid-kardex", detail?.idFuid] }); }
  });
  const exportAllCsv = useMutation({
    mutationFn: async () => (await api.get("/archives/fuid.csv", { responseType: "blob" })).data as Blob,
    onSuccess: (blob) => downloadBlob(blob, "ambar-fuid.csv")
  });
  const exportOne = useMutation({
    mutationFn: async (format: "csv" | "xlsx") => ({ format, blob: (await api.get(`/archives/fuid/${detail?.idFuid}/export?format=${format}`, { responseType: "blob" })).data as Blob }),
    onSuccess: ({ format, blob }) => downloadBlob(blob, `${detail?.fuid_code ?? "fuid"}.${format}`)
  });

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (fuid.data ?? []).filter((item) => !text || `${item.fuid_code} ${item.ps930IdArchive} ${item.ps950IdExpedient ?? ""} ${item.ps1070IdBatch ?? ""} ${item.status}`.toLowerCase().includes(text));
  }, [fuid.data, search]);
  const selected = detailQuery.data ?? detail;
  const records = selected?.metadata?.items ?? [];

  function submitExpedient(event: FormEvent) {
    event.preventDefault();
    createFromExpedient.mutate();
  }
  function submitTransfer(event: FormEvent) {
    event.preventDefault();
    createFromTransfer.mutate();
  }

  return (
    <>
      <Breadcrumbs items={["Custodia Documental", "Inventario / FUID"]} />
      <PageHeader eyebrow="Inventario documental" title="FUID operativo" description="Genera, compara, evidencia y exporta inventarios documentales para expedientes y transferencias." action={<><button className="ghost" type="button" onClick={() => fuid.refetch()}><RefreshCcw size={17} /> Actualizar</button><button type="button" onClick={() => exportAllCsv.mutate()} disabled={exportAllCsv.isPending}><Download size={17} /> Exportar listado</button></>} />

      <section className="metrics">
        <MetricCard label="Inventarios" value={fuid.data?.length ?? 0} tone="info" />
        <MetricCard label="Folios declarados" value={(fuid.data ?? []).reduce((sum, item) => sum + (item.folio_total ?? 0), 0)} tone="success" />
        <MetricCard label="Inconsistencias" value={(fuid.data ?? []).reduce((sum, item) => sum + (item.inconsistencies_count ?? 0), 0)} tone={(fuid.data ?? []).some((item) => item.inconsistencies_count) ? "warning" : "success"} />
      </section>

      <div className="split">
        <section className="card">
          <h2>Generar inventario</h2>
          <form className="form-grid" onSubmit={submitExpedient}>
            <label>Desde expediente<select value={expedientId} onChange={(event) => setExpedientId(event.target.value)} required><option value="">Seleccionar</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label>
            <button disabled={createFromExpedient.isPending}><Plus size={17} /> Generar FUID</button>
          </form>
          <form className="form-grid" onSubmit={submitTransfer}>
            <label>Desde transferencia<select value={transferId} onChange={(event) => setTransferId(event.target.value)} required><option value="">Seleccionar</option>{transfers.data?.map((item) => <option key={item.idBatch} value={item.idBatch}>{item.batch_code} - {item.status}</option>)}</select></label>
            <button disabled={createFromTransfer.isPending}><Plus size={17} /> Generar FUID transferencia</button>
          </form>
          <EmptyState icon={<FileSpreadsheet size={20} />} title="FUID vivo" description="El inventario queda conectado con recepcion, evidencias, Kardex y auditoria." />
        </section>

        <section className="card">
          <FilterBar><label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Codigo, estado, archivo, transferencia..." /></span></label></FilterBar>
          {fuid.isLoading ? <LoadingSkeleton rows={4} /> : null}
          {!fuid.isLoading && rows.length === 0 ? <EmptyState icon={<FileSpreadsheet size={20} />} title="Sin FUID generados" description="Genera el primer inventario desde un expediente o transferencia." /> : null}
          <DataTable><table><thead><tr><th>Codigo</th><th>Origen</th><th>Relacion</th><th>Version</th><th>Items</th><th>Folios</th><th>Estado</th></tr></thead><tbody>{rows.map((item) => <tr key={item.idFuid} onClick={() => setDetail(item)}><td>{item.fuid_code}</td><td>{item.ps930IdArchive}</td><td>{item.ps950IdExpedient ? `EXP ${item.ps950IdExpedient}` : item.ps1070IdBatch ? `TR ${item.ps1070IdBatch}` : "-"}</td><td>v{item.version}</td><td>{item.items_count}</td><td>{item.folio_total}</td><td><StatusBadge value={item.status} tone={tone(item.status)} /></td></tr>)}</tbody></table></DataTable>
        </section>
      </div>

      <DetailDrawer open={Boolean(detail)} title={selected?.fuid_code ?? "FUID"} subtitle={selected?.location_summary} onClose={() => setDetail(null)}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {selected ? <section className="grid">
          <div className="toolbar wrap"><StatusBadge value={selected.status} tone={tone(selected.status)} /><StatusBadge value={`v${selected.version}`} /><StatusBadge value={`${selected.items_count} items`} tone="info" /><StatusBadge value={`${selected.inconsistencies_count} inconsistencias`} tone={selected.inconsistencies_count ? "warning" : "success"} /></div>
          <div className="toolbar wrap">
            <button className="ghost" onClick={() => exportOne.mutate("csv")}><Download size={16} /> CSV</button>
            <button className="ghost" onClick={() => exportOne.mutate("xlsx")}><Download size={16} /> Excel</button>
            <button className="ghost" onClick={() => regenerate.mutate()}><RefreshCcw size={16} /> Regenerar</button>
            <button disabled={close.isPending || selected.status === "closed"} onClick={() => close.mutate()}><CheckCircle2 size={16} /> Cerrar FUID</button>
          </div>
          <div className="grid metrics"><MetricCard label="Folios declarados" value={selected.folio_total} /><MetricCard label="Evidencias entrega" value={selected.delivery_evidence_count} /><MetricCard label="Evidencias recibo" value={selected.reception_evidence_count} /></div>
          <article className="card compact"><h3><Paperclip size={16} /> Evidencia</h3><div className="form-grid"><label>URL evidencia<input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." /></label><label>Observacion<input value={evidenceObservation} onChange={(event) => setEvidenceObservation(event.target.value)} placeholder="Acta, foto, soporte..." /></label></div><div className="toolbar"><button className="ghost" onClick={() => evidence.mutate("delivery")}>Agregar entrega</button><button className="ghost" onClick={() => evidence.mutate("reception")}>Agregar recibo</button></div></article>
          {selected.ps1070IdBatch ? <article className="card compact"><div className="toolbar space-between"><h3><GitCompare size={16} /> Comparacion con recepcion</h3><StatusBadge value={`${comparison.data?.summary.inconsistencies ?? 0} inconsistencias`} tone={(comparison.data?.summary.inconsistencies ?? 0) ? "warning" : "success"} /></div><DataTable><table><thead><tr><th>Unidad</th><th>Declarado</th><th>Recibido</th><th>Estado</th><th>Inconsistencia</th></tr></thead><tbody>{comparison.data?.items.map((item) => <tr key={`${item.declared.documentary_unit_type}-${item.declared.documentary_unit_id}`}><td>{item.declared.unit_code}<br /><span className="muted">{item.declared.unit_title}</span></td><td>{item.declared.total_folios_declared} folios / {item.declared.quantity_declared} und</td><td>{item.received?.received_folios ?? "-"} folios / {item.received?.received_quantity ?? "-"}</td><td><StatusBadge value={item.comparison_status} tone={tone(item.comparison_status)} /></td><td>{item.inconsistencies.join(", ")}</td></tr>)}</tbody></table></DataTable></article> : null}
          <DataTable><table><thead><tr><th>#</th><th>Unidad documental</th><th>Soporte</th><th>Ubicacion</th><th>Folios</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>{records.map((record) => <tr key={`${record.documentary_unit_type}-${record.documentary_unit_id}-${record.order_number}`}><td>{record.order_number}</td><td>{record.unit_code}<br /><span className="muted">{record.unit_title}</span></td><td>{record.support_type}</td><td>{record.physical_location_path ?? "-"}</td><td>{record.folio_start ?? "-"}-{record.folio_end ?? "-"} ({record.total_folios_declared ?? 0})</td><td>{record.total_folios_received ?? "-"} / {record.quantity_received ?? "-"}</td><td><StatusBadge value={record.status} tone={tone(record.status)} /></td></tr>)}</tbody></table></DataTable>
          <section className="timeline">{kardex.data?.map((item) => <TimelineEvent key={item.idMovement} state={item.status} tone={tone(item.status)} title={item.movement_type} description={item.observations ?? "Evento FUID"} meta={item.created_at?.slice(0, 16)} />)}</section>
        </section> : null}
      </DetailDrawer>
    </>
  );
}
