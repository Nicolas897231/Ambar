"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, PackagePlus, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Location = { idLocation: number; location_name: string };
type Batch = { idBatch: number; batch_code: string; origin_location: number; destination_location: number; status: string };

export default function TransferBatchesPage() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const locations = useQuery({ queryKey: ["locations"], queryFn: async () => (await api.get<Location[]>("/transfers/locations")).data });
  const batches = useQuery({ queryKey: ["transfer-batches"], queryFn: async () => (await api.get<Batch[]>("/transfer-batches")).data });
  const create = useMutation({ mutationFn: async () => api.post("/transfer-batches", { batch_code: code, origin_location: Number(origin), destination_location: Number(destination) }), onSuccess: () => { setCode(""); client.invalidateQueries({ queryKey: ["transfer-batches"] }); } });
  const advance = useMutation({ mutationFn: async (batch: Batch) => api.patch(`/transfer-batches/${batch.idBatch}/status`, { status: batch.status === "pending" ? "approved" : batch.status === "approved" ? "packed" : batch.status === "packed" ? "shipped" : batch.status === "shipped" ? "received" : "closed" }), onSuccess: () => client.invalidateQueries({ queryKey: ["transfer-batches"] }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Transferencias avanzadas" description="Lotes, validacion de custodia, evidencias y recepcion controlada." action={<button className="ghost" onClick={() => batches.refetch()}><RefreshCcw size={17} /> Actualizar</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo lote</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Codigo<input value={code} onChange={(event) => setCode(event.target.value)} required /></label>
            <label>Origen<select value={origin} onChange={(event) => setOrigin(event.target.value)} required><option value="">Seleccionar</option>{locations.data?.map((item) => <option key={item.idLocation} value={item.idLocation}>{item.location_name}</option>)}</select></label>
            <label>Destino<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Seleccionar</option>{locations.data?.map((item) => <option key={item.idLocation} value={item.idLocation}>{item.location_name}</option>)}</select></label>
            <button><PackagePlus size={17} /> Crear lote</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Lote</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>{batches.data?.map((item) => <tr key={item.idBatch}><td>{item.batch_code}</td><td>{item.origin_location}</td><td>{item.destination_location}</td><td><span className="status">{item.status}</span></td><td><button className="ghost" onClick={() => advance.mutate(item)}><CheckCircle2 size={16} /> Avanzar</button></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
