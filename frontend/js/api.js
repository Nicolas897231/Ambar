(function () {
  const ACCESS = "ambar_access_token";
  const REFRESH = "ambar_refresh_token";
  const USER = "ambar_current_user";
  const API_BASE = window.AMBAR_API_BASE || "/api/v1";

  function headers(extra) {
    const token = localStorage.getItem(ACCESS);
    return Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}, extra || {});
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, Object.assign({ credentials: "include" }, options, { headers: headers(options.headers) }));
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = (await response.json()).detail || detail; } catch {}
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) return response.json();
    return response.text();
  }

  async function form(path, formData) {
    const token = localStorage.getItem(ACCESS);
    const response = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
    if (!response.ok) throw new Error(response.statusText);
    return response.json().catch(() => null);
  }

  function mapUser(me) {
    const roles = me?.roles || ["super_admin"];
    const role = roles[0] || "super_admin";
    const name = me?.name || me?.email || "Usuario AMBAR";
    return {
      id: me?.identification || me?.email || "session",
      identification: me?.identification,
      name,
      email: me?.email || "",
      role,
      roles,
      permissions: me?.permissions || [],
      initials: (name || "AM").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase(),
      color: "var(--viz-violet)",
      archive: "AMBAR",
      title: role.replace(/_/g, " ")
    };
  }

  const api = {
    baseURL: API_BASE,
    async login(email, password, mfa_code) {
      const data = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, mfa_code: mfa_code || null }) });
      localStorage.setItem(ACCESS, data.access_token);
      localStorage.setItem(REFRESH, data.refresh_token);
      const me = mapUser(await request("/auth/me"));
      localStorage.setItem(USER, JSON.stringify(me));
      return me;
    },
    async me() {
      const cached = localStorage.getItem(USER);
      if (cached) return JSON.parse(cached);
      const me = mapUser(await request("/auth/me"));
      localStorage.setItem(USER, JSON.stringify(me));
      return me;
    },
    logout() {
      localStorage.removeItem(ACCESS);
      localStorage.removeItem(REFRESH);
      localStorage.removeItem(USER);
      return request("/auth/logout", { method: "POST", body: "{}" }).catch(() => null);
    },
    hasSession() { return Boolean(localStorage.getItem(ACCESS)); },
    clearSession() { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH); localStorage.removeItem(USER); },
    get: request,
    post(path, payload) { return request(path, { method: "POST", body: JSON.stringify(payload || {}) }); },
    patch(path, payload) { return request(path, { method: "PATCH", body: JSON.stringify(payload || {}) }); },
    form,
    endpoints: {
      dashboard: () => request("/analytics/dashboard"),
      dashboardAdvanced: () => request("/analytics/advanced"),
      documents: () => request("/documents?limit=100"),
      expedients: () => request("/archives/expedients"),
      archives: () => request("/archives"),
      trdEditor: () => request("/trd/editor"),
      trdSeries: () => request("/trd/series"),
      trdSubseries: () => request("/trd/subseries"),
      transfers: () => request("/transfer-batches"),
      loans: () => request("/archives/loans"),
      loanSummary: () => request("/archives/loans/summary"),
      employees: () => request("/hr/employees"),
      candidates: () => request("/hr/candidates"),
      vacancies: () => request("/hr/vacancies"),
      publicVacancies: () => request("/hr/public/vacancies"),
      audit: () => request("/audit?limit=100"),
      users: () => request("/users"),
      platform: () => request("/platform/technical-dashboard")
    }
  };

  window.AmbarAPI = api;
  window.useLiveData = function useLiveData(loader, fallback, deps) {
    const [data, setData] = React.useState(fallback);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    React.useEffect(() => {
      let alive = true;
      setLoading(true);
      setError("");
      loader()
        .then((value) => { if (alive && value) setData(value); })
        .catch((err) => { if (alive) setError(err.message || "No fue posible cargar datos reales."); })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, deps || []);
    return { data, loading, error, setData };
  };
})();
