"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, Eye, EyeOff, FileCheck, FolderKanban, KeyRound, Lock, LogIn, Mail, MapPin, Moon, ScanLine, ShieldCheck, Sun } from "lucide-react";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { CurrentUser, saveCurrentUser, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@ambar.co");
  const [password, setPassword] = useState("ChangeMe123!");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState<"login" | "recover">("login");
  const [darkMode, setDarkMode] = useState(false);

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
        setError("Ingresa el código MFA configurado para este usuario.");
      } else if (caught instanceof AxiosError && caught.response?.data?.detail === "Invalid MFA code") {
        setNeedsMfa(true);
        setError("Código MFA inválido.");
      } else if (caught instanceof AxiosError && caught.response?.status === 404) {
        setError("El frontend no encuentra el API. Revisa el proxy /api/v1 o API_PROXY_TARGET.");
      } else {
        setError("Credenciales inválidas o servicio no disponible.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page" data-theme={darkMode ? "dark" : "light"}>
      <button className="icon-btn auth-theme" onClick={() => setDarkMode((value) => !value)} title="Cambiar tema">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <section className="auth-brandpanel">
        <div className="row gap2" style={{ marginBottom: "auto" }}>
          <div className="side-logo" style={{ width: 44, height: 44 }}><FolderKanban size={24} /></div>
          <div><div style={{ fontWeight: 800, fontSize: 24, color: "#fff", letterSpacing: ".02em" }}>AMBAR</div><div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.62)" }}>SGDEA Enterprise</div></div>
        </div>
        <div className="auth-hero">
          <h1>Toda la memoria de tu empresa, en un solo lugar.</h1>
          <p>Gestión documental, archivo físico, expedientes, talento humano y auditoría con trazabilidad real.</p>
          <div className="auth-feats">
            <div className="row gap2"><span className="af-ico"><ScanLine size={15} /></span><span>Digitalización, metadatos y repositorio seguro</span></div>
            <div className="row gap2"><span className="af-ico"><MapPin size={15} /></span><span>Ubicación física exacta por archivo, caja y carpeta</span></div>
            <div className="row gap2"><span className="af-ico"><ShieldCheck size={15} /></span><span>RBAC, permisos por archivo y auditoría completa</span></div>
          </div>
        </div>
        <div className="auth-cards">
          <div className="floaty"><FileCheck size={16} /> Contrato laboral · versión vigente</div>
          <div className="floaty"><BriefcaseBusiness size={16} /> Expediente laboral · completo</div>
        </div>
      </section>

      <section className="auth-formpanel">
        <div className="auth-card an-scale">
          {view === "recover" ? (
            <div className="col gap4">
              <button className="auth-back" type="button" onClick={() => setView("login")}><ArrowLeft size={16} /> Volver al login</button>
              <div className="mfa-badge"><KeyRound size={24} /></div>
              <div>
                <h2>Recuperar contraseña</h2>
                <p className="muted">Por seguridad enterprise, la recuperación se gestiona con el administrador hasta activar el proveedor SMTP de producción.</p>
              </div>
              <div className="context-help"><Mail size={18} /><p>Solicita al administrador restablecer tu clave temporal desde Seguridad → Usuarios. La operación queda auditada.</p></div>
              <Link className="btn btn-primary btn-block" href="mailto:soporte@ambar.co">Contactar soporte</Link>
            </div>
          ) : (
            <>
              <div className="auth-mobile-brand"><div className="side-logo"><FolderKanban size={22} /></div><b>AMBAR</b></div>
              <h2>Bienvenido de nuevo</h2>
              <p className="muted" style={{ marginBottom: "var(--s5)" }}>Ingresa con tu cuenta corporativa para continuar.</p>
              <form onSubmit={submit} className="col" style={{ gap: "var(--s4)" }}>
                <label className="field">Correo corporativo
                  <div className="input-icon"><Mail size={16} /><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></div>
                </label>
                <label className="field">Contraseña
                  <div className="input-icon"><Lock size={16} /><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} required /><button className="pass-toggle" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                </label>
                {needsMfa ? <label className="field">Código MFA<div className="input-icon"><KeyRound size={16} /><input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" minLength={6} maxLength={6} required /></div></label> : null}
                {error ? <div className="auth-error an-fall">{error}</div> : null}
                <div className="row between" style={{ fontSize: "var(--fs-sm)" }}>
                  <label className="check"><input type="checkbox" defaultChecked /> Recordarme</label>
                  <button className="auth-link" type="button" onClick={() => setView("recover")}>¿Olvidaste tu contraseña?</button>
                </div>
                <button className="btn btn-primary btn-block shine" disabled={loading} type="submit">{needsMfa ? <KeyRound size={18} /> : <LogIn size={18} />} {loading ? "Validando..." : needsMfa ? "Validar MFA" : "Ingresar"}</button>
              </form>
              <div className="auth-divider"><span>Acceso público</span></div>
              <Link className="btn btn-secondary btn-block" href="/empleo"><BriefcaseBusiness size={17} /> Portal de empleo</Link>
            </>
          )}
        </div>
        <p className="auth-foot">AMBAR © 2026 · Cali, Colombia · SGDEA Enterprise</p>
      </section>
    </main>
  );
}
