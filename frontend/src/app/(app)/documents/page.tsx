"use client";

import { FormEvent, useState } from "react";
import { Upload, Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = {
  idDocument: number;
  document_name: string;
  document_type: string;
  version: number;
  status: string;
  files_count: number;
};

export default function DocumentsPage() {
  const client = useQueryClient();
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("PDF");
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: async () => (await api.get<DocumentItem[]>("/documents")).data
  });
  const create = useMutation({
    mutationFn: async () => api.post("/documents", { document_name: documentName, document_type: documentType, metadata: {}, location_id: 1 }),
    onSuccess: () => {
      setDocumentName("");
      client.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !selectedDocument) return;
      const form = new FormData();
      form.append("file", file);
      return api.post(`/documents/${selectedDocument}/files`, form);
    },
    onSuccess: () => {
      setFile(null);
      client.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  function submitDocument(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  function submitFile(event: FormEvent) {
    event.preventDefault();
    upload.mutate();
  }
  return (
    <>
      <PageTitle title="Documentos" description="Creacion, metadata, versionamiento y uploads seguros." action={<button className="ghost" onClick={() => documents.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo documento</h2>
          <form className="form-grid" onSubmit={submitDocument}>
            <label>Nombre<input value={documentName} onChange={(event) => setDocumentName(event.target.value)} required /></label>
            <label>Tipo documental<input value={documentType} onChange={(event) => setDocumentType(event.target.value)} required /></label>
            <button disabled={create.isPending}><Plus size={17} /> Crear</button>
          </form>
          <h2>Subir archivo</h2>
          <form className="form-grid" onSubmit={submitFile}>
            <label>Documento<select value={selectedDocument ?? ""} onChange={(event) => setSelectedDocument(Number(event.target.value))} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <label>Archivo<input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
            <button disabled={upload.isPending}><Upload size={17} /> Cargar</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Documento</th><th>Tipo</th><th>Version</th><th>Estado</th><th>Archivos</th></tr></thead>
            <tbody>
              {documents.data?.map((item) => (
                <tr key={item.idDocument}>
                  <td>{item.document_name}</td><td>{item.document_type}</td><td>{item.version}</td><td><span className="status">{item.status}</span></td><td>{item.files_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
