"use client";

import { useMemo, useState } from "react";
import { Download, FileArchive, FileCheck2, RefreshCcw, Search } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Breadcrumbs,
  DataTable,
  DetailDrawer,
  EmptyState,
  FilterBar,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  StatusBadge
} from "@/components/ui/enterprise";

type RepositoryFile = { idFile: number; original_name: string; content_type: string; checksum: string; size_bytes: number };
type RepositoryItem = { idDocument: number; document_name: string; archive_id?: number; expedient_id?: number; folder_id?: number; files: RepositoryFile[] };

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function RepositoryPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RepositoryItem | null>(null);
  const repository = useQuery({ queryKey: ["repository"], queryFn: async () => (await api.get<RepositoryItem[]>("/archives/repository")).data });
  const downloadFile = useMutation({
    mutationFn: async (file: RepositoryFile) => (await api.get<{ download_url: string; original_name: string }>(`/archives/repository/files/${file.idFile}/download`)).data,
    onSuccess: (data) => window.open(data.download_url, "_blank", "noopener,noreferrer")
  });

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (repository.data ?? []).filter((item) => !text || `${item.document_name} ${item.archive_id ?? ""} ${item.expedient_id ?? ""} ${item.files.map((file) => file.original_name).join(" ")}`.toLowerCase().includes(text));
  }, [repository.data, search]);

  const fileCount = (repository.data ?? []).reduce((sum, item) => sum + item.files.length, 0);
  const storageBytes = (repository.data ?? []).reduce((sum, item) => sum + item.files.reduce((subtotal, file) => subtotal + file.size_bytes, 0), 0);
  const withFiles = (repository.data ?? []).filter((item) => item.files.length > 0).length;

  return (
    <>
      <Breadcrumbs items={["Gestion Documental", "Repositorio"]} />
      <PageHeader
        eyebrow="Archivos digitales"
        title="Repositorio documental"
        description="Consulta documentos con archivos digitales versionados, hashes, soporte y ubicacion archivistica completa."
        action={<button className="ghost" type="button" onClick={() => repository.refetch()}><RefreshCcw size={17} /> Actualizar</button>}
      />

      <section className="metrics">
        <MetricCard label="Documentos" value={repository.data?.length ?? 0} tone="info" cta="Registros documentales" />
        <MetricCard label="Con archivo digital" value={withFiles} tone="success" cta="Repositorio activo" />
        <MetricCard label="Archivos digitales" value={fileCount} cta="Versiones asociadas" />
        <MetricCard label="Almacenamiento" value={formatBytes(storageBytes)} tone="warning" cta="MinIO/S3 metadata" />
      </section>

      <section className="card">
        <FilterBar>
          <label>Buscar<span className="input-icon"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Documento, archivo, hash..." /></span></label>
        </FilterBar>
        {repository.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {!repository.isLoading && rows.length === 0 ? (
          <EmptyState icon={<FileArchive size={20} />} title="No hay archivos digitales" description="Cuando cargues archivos desde un documento, se listaran aqui con hash y version." />
        ) : null}
        <DataTable>
          <table>
            <thead><tr><th>Documento</th><th>Archivo</th><th>Expediente</th><th>Carpeta</th><th>Archivos</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.idDocument}>
                  <td>{item.document_name}</td>
                  <td>{item.archive_id ?? "-"}</td>
                  <td>{item.expedient_id ?? "-"}</td>
                  <td>{item.folder_id ?? "-"}</td>
                  <td>{item.files.length}</td>
                  <td><StatusBadge value={item.files.length ? "versioned" : "physical"} tone={item.files.length ? "success" : "warning"} /></td>
                  <td><button className="ghost" type="button" onClick={() => setSelected(item)}>Detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.document_name ?? "Repositorio"}
        subtitle={selected ? `Documento #${selected.idDocument}` : undefined}
      >
        {selected ? (
          <div className="form-grid">
            <div className="module-grid">
              <MetricCard label="Archivo" value={selected.archive_id ?? "-"} />
              <MetricCard label="Expediente" value={selected.expedient_id ?? "-"} />
              <MetricCard label="Carpeta" value={selected.folder_id ?? "-"} />
            </div>
            {selected.files.length === 0 ? <EmptyState icon={<FileCheck2 size={20} />} title="Documento fisico o pendiente" description="Este registro no tiene archivo digital asociado todavia." /> : null}
            {selected.files.map((file) => (
              <section className="card" key={file.idFile}>
                <div className="toolbar space-between">
                  <h3>{file.original_name}</h3>
                  <StatusBadge value={file.content_type} tone="info" />
                </div>
                <p className="muted">SHA256: {file.checksum}</p>
                <p className="muted">Tamano: {formatBytes(file.size_bytes)}</p>
                <button className="ghost" type="button" onClick={() => downloadFile.mutate(file)} disabled={downloadFile.isPending}><Download size={15} /> Descargar con URL firmada</button>
              </section>
            ))}
          </div>
        ) : null}
      </DetailDrawer>
    </>
  );
}
