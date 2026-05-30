"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { CurrentUser, saveCurrentUser, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password, mfa_code: mfaCode || null });
      saveSession(data.access_token, data.refresh_token);
      const me = await api.get<CurrentUser>("/auth/me");
      saveCurrentUser(me.data);
      router.push("/dashboard");
    } catch (caught) {
      if (caught instanceof AxiosError && caught.response?.data?.detail === "MFA code required") {
        setNeedsMfa(true);
        setError("Ingresa el codigo MFA de tu app autenticadora.");
      } else if (caught instanceof AxiosError && caught.response?.data?.detail === "Invalid MFA code") {
        setNeedsMfa(true);
        setError("Codigo MFA invalido.");
      } else {
        setError("Credenciales invalidas o servicio no disponible.");
      }
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
          {needsMfa ? <label>Codigo MFA<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" minLength={6} maxLength={6} required /></label> : null}
          {error ? <div className="error">{error}</div> : null}
          <button disabled={loading} type="submit">{needsMfa ? <KeyRound size={18} /> : <LogIn size={18} />} {loading ? "Validando" : needsMfa ? "Validar MFA" : "Ingresar"}</button>
        </form>
      </section>
    </main>
  );
}
