"use client";

import { Download, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type RepositoryItem = { idDocument: number; document_name: string; archive_id?: number; expedient_id?: number; folder_id?: number; files: { idFile: number; original_name: string; content_type: string; checksum: string; size_bytes: number }[] };

export default function RepositoryPage() {
  const repository = useQuery({ queryKey: ["repository"], queryFn: async () => (await api.get<RepositoryItem[]>("/archives/repository")).data });
  return <><div className="breadcrumbs"><span>Gestion Documental</span><span>Repositorio</span></div><PageTitle title="Repositorio documental" description="Archivos digitales versionados, hashes y ubicacion archivistica." action={<button className="ghost" onClick={() => repository.refetch()}><RefreshCcw size={17} /> Actualizar</button>} /><section className="card table-card"><table><thead><tr><th>Documento</th><th>Archivo</th><th>Expediente</th><th>Carpeta</th><th>Archivos digitales</th></tr></thead><tbody>{repository.data?.map((item) => <tr key={item.idDocument}><td>{item.document_name}</td><td>{item.archive_id}</td><td>{item.expedient_id}</td><td>{item.folder_id}</td><td>{item.files.map((file) => <span className="status" key={file.idFile}><Download size={14} /> {file.original_name}</span>)}</td></tr>)}</tbody></table></section></>;
}
