"use client";

import { FormEvent, useState } from "react";
import { Link2, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTitle } from "@/components/ui/page-title";

type Endpoint = { idEndpoint: number; endpoint_name: string; target_url: string; event_type: string; status: string };

export default function WebhooksPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://example.com/webhook");
  const [eventType, setEventType] = useState("ocr.completed");
  const endpoints = useQuery({ queryKey: ["webhook-endpoints"], queryFn: async () => (await api.get<Endpoint[]>("/webhooks/endpoints")).data });
  const create = useMutation({ mutationFn: async () => api.post("/webhooks/endpoints", { endpoint_name: name, target_url: url, event_type: eventType }), onSuccess: () => { setName(""); client.invalidateQueries({ queryKey: ["webhook-endpoints"] }); } });
  const emit = useMutation({ mutationFn: async () => api.post("/webhooks/emit", { event_type: eventType, payload: { source: "ui" } }) });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return (
    <>
      <PageTitle title="Webhooks" description="Eventos externos firmados con HMAC, retries y trazabilidad." action={<button className="ghost" onClick={() => emit.mutate()}><Send size={17} /> Emitir evento</button>} />
      <div className="split">
        <section className="card">
          <h2>Nuevo endpoint</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>URL<input value={url} onChange={(event) => setUrl(event.target.value)} required /></label>
            <label>Evento<input value={eventType} onChange={(event) => setEventType(event.target.value)} required /></label>
            <button><Link2 size={17} /> Crear endpoint</button>
          </form>
        </section>
        <section className="card">
          <table>
            <thead><tr><th>Nombre</th><th>Evento</th><th>URL</th><th>Estado</th></tr></thead>
            <tbody>{endpoints.data?.map((item) => <tr key={item.idEndpoint}><td>{item.endpoint_name}</td><td>{item.event_type}</td><td>{item.target_url}</td><td><span className="status">{item.status}</span></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
