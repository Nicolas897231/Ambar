"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type DocumentItem = { idDocument: number; document_name: string };
type Location = { idLocation: number; location_name: string };
type Transfer = { idTransfer: number; ps520IdDocument: number; origin_location: number; destination_location: number; status: string };

export default function KardexPage() {
  const client = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const documents = useQuery({ queryKey: ["documents"], queryFn: async () => (await api.get<DocumentItem[]>("/documents")).data });
  const locations = useQuery({ queryKey: ["locations"], queryFn: async () => (await api.get<Location[]>("/transfers/locations")).data });
  const transfers = useQuery({ queryKey: ["transfers"], queryFn: async () => (await api.get<Transfer[]>("/transfers")).data });
  const create = useMutation({ mutationFn: async () => api.post("/transfers", { document_id: Number(documentId), origin_location: Number(origin), destination_location: Number(destination) }), onSuccess: () => client.invalidateQueries({ queryKey: ["transfers"] }) });
  const update = useMutation({ mutationFn: async ({ id, status }: { id: number; status: string }) => api.patch(`/transfers/${id}/status`, { status }), onSuccess: () => client.invalidateQueries({ queryKey: ["transfers"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Kardex" description="Transferencias, custodia, recepcion e historial de movimientos." />
      <div className="split">
        <section className="card">
          <h2>Nueva transferencia</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Documento<select value={documentId} onChange={(event) => setDocumentId(event.target.value)} required><option value="">Seleccionar</option>{documents.data?.map((item) => <option key={item.idDocument} value={item.idDocument}>{item.document_name}</option>)}</select></label>
            <label>Origen<select value={origin} onChange={(event) => setOrigin(event.target.value)} required><option value="">Seleccionar</option>{locations.data?.map((item) => <option key={item.idLocation} value={item.idLocation}>{item.location_name}</option>)}</select></label>
            <label>Destino<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Seleccionar</option>{locations.data?.map((item) => <option key={item.idLocation} value={item.idLocation}>{item.location_name}</option>)}</select></label>
            <button><Plus size={17} /> Solicitar</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>ID</th><th>Documento</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>{transfers.data?.map((item) => <tr key={item.idTransfer}><td>{item.idTransfer}</td><td>{item.ps520IdDocument}</td><td>{item.origin_location}</td><td>{item.destination_location}</td><td><span className="status">{item.status}</span></td><td className="toolbar"><button className="ghost" onClick={() => update.mutate({ id: item.idTransfer, status: item.status === "pending" ? "approved" : item.status === "approved" ? "in_transit" : "received" })}><CheckCircle2 size={16} /> Avanzar</button></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
