"use client";

import { FormEvent, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type ExpedientItem = { idExpedient: number; expedient_code: string; expedient_name: string };
type FuidItem = { idFuid: number; fuid_code: string; ps930IdArchive: number; ps950IdExpedient?: number; folio_total: number; location_summary?: string; observations?: string };

export default function FuidPage() {
  const client = useQueryClient();
  const [expedientId, setExpedientId] = useState("");
  const expedients = useQuery({ queryKey: ["expedients"], queryFn: async () => (await api.get<ExpedientItem[]>("/archives/expedients")).data });
  const fuid = useQuery({ queryKey: ["fuid"], queryFn: async () => (await api.get<FuidItem[]>("/archives/fuid")).data });
  const create = useMutation({ mutationFn: async () => api.post(`/archives/fuid/expedients/${expedientId}`), onSuccess: () => client.invalidateQueries({ queryKey: ["fuid"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return <><div className="breadcrumbs"><span>Custodia Documental</span><span>FUID</span></div><PageTitle title="FUID" description="Formato Unico de Inventario Documental generado desde expedientes y TRD." action={<button className="ghost" onClick={() => fuid.refetch()}><RefreshCcw size={17} /> Actualizar</button>} /><div className="split"><section className="card"><h2>Generar FUID</h2><form className="form-grid" onSubmit={submit}><label>Expediente<select value={expedientId} onChange={(event) => setExpedientId(event.target.value)} required><option value="">Seleccionar</option>{expedients.data?.map((item) => <option key={item.idExpedient} value={item.idExpedient}>{item.expedient_code} - {item.expedient_name}</option>)}</select></label><button disabled={create.isPending}><Plus size={17} /> Generar</button></form></section><section className="card table-card"><table><thead><tr><th>Codigo</th><th>Archivo</th><th>Expediente</th><th>Folios</th><th>Ubicacion</th></tr></thead><tbody>{fuid.data?.map((item) => <tr key={item.idFuid}><td>{item.fuid_code}</td><td>{item.ps930IdArchive}</td><td>{item.ps950IdExpedient}</td><td>{item.folio_total}</td><td>{item.location_summary}</td></tr>)}</tbody></table></section></div></>;
}
