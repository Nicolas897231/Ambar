"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import api from "@/lib/api";
import { CurrentUser, saveCurrentUser, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      saveSession(data.access_token, data.refresh_token);
      const me = await api.get<CurrentUser>("/auth/me");
      saveCurrentUser(me.data);
      router.push("/dashboard");
    } catch {
      setError("Credenciales invalidas o servicio no disponible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Ambar</h1>
        <p className="muted">Ingreso seguro al core documental</p>
        <form onSubmit={submit}>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
          {error ? <div className="error">{error}</div> : null}
          <button disabled={loading} type="submit"><LogIn size={18} /> {loading ? "Validando" : "Ingresar"}</button>
        </form>
      </section>
    </main>
  );
}
