"use client";

import { FormEvent, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string; expedient_id?: number; folder_id?: number };
type FoliationItem = { idFoliation: number; ps520IdDocument: number; ps950IdExpedient: number; ps952IdFolder: number; folio_start: number; folio_end: number; folio_total: number; validation_status: string };

export default function FoliationPage() {
  const client = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const [expedientId, setExpedientId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folioStart, setFolioStart] = useState("");
  const [folioEnd, setFolioEnd] = useState("");
  const documents = useQuery({ queryKey: ["documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents?limit=100")).data });
  const create = useMutation({ mutationFn: async () => api.post("/archives/foliation", { document_id: Number(documentId), expedient_id: Number(expedientId), folder_id: Number(folderId), folio_start: Number(folioStart), folio_end: Number(folioEnd) }), onSuccess: () => { setFolioStart(""); setFolioEnd(""); client.invalidateQueries({ queryKey: ["documents"] }); } });
  const selected = documents.data?.find((item) => item.idDocument === Number(documentId));
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return <><div className="breadcrumbs"><span>Gestion Documental</span><span>Foliacion</span></div><PageTitle title="Foliacion" description="Control de folios, duplicados, rangos e integridad de expediente." /><div className="split"><section className="card"><h2>Registrar folios</h2><form className="form-grid" onSubmit={submit}><label>Documento<select value={documentId} onChange={(event) => { const value = event.target.value; setDocumentId(value); const doc = documents.data?.find((item) => item.idDocument === Number(value)); setExpedientId(String(doc?.expedient_id ?? "")); setFolderId(String(doc?.folder_id ?? "")); }} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label><label>Expediente ID<input value={expedientId || selected?.expedient_id || ""} onChange={(event) => setExpedientId(event.target.value)} required /></label><label>Carpeta ID<input value={folderId || selected?.folder_id || ""} onChange={(event) => setFolderId(event.target.value)} required /></label><div className="form-row-2"><label>Folio inicial<input type="number" min="1" value={folioStart} onChange={(event) => setFolioStart(event.target.value)} required /></label><label>Folio final<input type="number" min="1" value={folioEnd} onChange={(event) => setFolioEnd(event.target.value)} required /></label></div><button disabled={create.isPending}><Plus size={17} /> Registrar</button></form></section><section className="card"><p className="muted">La API valida solapamientos dentro del expediente y actualiza documento, carpeta y expediente.</p><div className="skeleton" /></section></div></>;
}
