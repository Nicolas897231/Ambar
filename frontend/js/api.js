(function () {
  const USER = "ambar_current_user";
  const API_BASE = window.AMBAR_API_BASE || "/api/v1";

  function headers(extra) {
    return Object.assign({ "Content-Type": "application/json" }, extra || {});
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, Object.assign({ credentials: "include" }, options, { headers: headers(options.headers) }));
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = (await response.json()).detail || detail; } catch {}
      const error = new Error(detail);
      error.status = response.status;
      if (response.status === 401 && !path.startsWith("/auth/login")) {
        localStorage.removeItem(USER);
        window.dispatchEvent(new CustomEvent("ambar:session-expired", { detail: { path } }));
      }
      throw error;
    }
    if (response.status === 204) return null;
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) return response.json();
    return response.text();
  }

  async function form(path, formData) {
    const response = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", body: formData });
    if (!response.ok) throw new Error(response.statusText);
    return response.json().catch(() => null);
  }

  async function download(path, filename) {
    const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = (await response.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const payload = await response.json();
      if (payload.download_url || payload.url) {
        window.open(payload.download_url || payload.url, "_blank", "noopener,noreferrer");
        return payload;
      }
      downloadText(filename || "ambar-export.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      return payload;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "ambar-descarga";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  function listFrom(value, keys) {
    if (Array.isArray(value)) return value;
    const candidates = keys || ["items", "results", "data", "logs", "tasks", "users", "vacancies", "candidates", "employees", "archives", "documents", "expedients", "notifications", "jobs"];
    for (const key of candidates) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    return [];
  }

  function firstNumber(source, keys) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  }

  function mapUser(me) {
    const roles = me?.roles || ["super_admin"];
    const rawRole = roles[0] || "super_admin";
    const role = window.normalizeRoleKey ? window.normalizeRoleKey(rawRole) : String(rawRole).replace(/[\s-]+/g, "_");
    const name = me?.name || me?.email || "Usuario AMBAR";
    const meta = window.roleMeta ? window.roleMeta(role) : { name: role.replace(/_/g, " ") };
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
      title: meta.name
    };
  }

  const api = {
    baseURL: API_BASE,
    async login(email, password, mfa_code) {
      await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, mfa_code: mfa_code || null }) });
      const me = await this.validateSession();
      if (!me) {
        throw new Error("No fue posible confirmar la sesión. Revisa que el gateway conserve las cookies de autenticación.");
      }
      return me;
    },
    async me(force = false) {
      const cached = localStorage.getItem(USER);
      if (cached && !force) return JSON.parse(cached);
      const me = mapUser(await request("/auth/me"));
      localStorage.setItem(USER, JSON.stringify(me));
      return me;
    },
    async validateSession() {
      const status = await request("/auth/session");
      if (!status?.authenticated || !status.user) {
        localStorage.removeItem(USER);
        return null;
      }
      const me = mapUser(status.user);
      localStorage.setItem(USER, JSON.stringify(me));
      return me;
    },
    logout() {
      localStorage.removeItem(USER);
      return request("/auth/logout", { method: "POST", body: "{}" }).catch(() => null);
    },
    hasSession() { return Boolean(localStorage.getItem(USER)); },
    clearSession() { localStorage.removeItem(USER); },
    get: request,
    post(path, payload) { return request(path, { method: "POST", body: JSON.stringify(payload || {}) }); },
    patch(path, payload) { return request(path, { method: "PATCH", body: JSON.stringify(payload || {}) }); },
    download,
    form,
    listFrom,
    firstNumber,
    endpoints: {
      dashboard: () => request("/analytics/dashboard"),
      dashboardAdvanced: () => request("/analytics/advanced"),
      documents: () => request("/documents?limit=100"),
      documentTypes: () => request("/documents/types"),
      documentFiles: (documentId) => request(`/documents/${documentId}/files`),
      documentVersions: (documentId) => request(`/documents/${documentId}/versions`),
      documentMetadata: (documentId) => request(`/documents/${documentId}/metadata`),
      expedients: () => request("/archives/expedients"),
      expedientDetail: (id) => request(`/archives/expedients/${id}/detail`),
      expedientTree: (id) => request(`/archives/expedients/${id}/tree`),
      expedientCompliance: (id) => request(`/archives/expedients/${id}/compliance`),
      expedientClosure: (id) => request(`/archives/expedients/${id}/closure-check`),
      expedientFoliation: (id) => request(`/archives/expedients/${id}/foliation`),
      expedientMissingDocuments: (id) => request(`/archives/expedients/${id}/missing-documents`),
      expedientLocations: (id) => request(`/archives/expedients/${id}/locations`),
      expedientTransfers: (id) => request(`/archives/expedients/${id}/related-transfers`),
      expedientLoans: (id) => request(`/archives/expedients/${id}/related-loans`),
      expedientAudit: (id) => request(`/archives/expedients/${id}/audit`),
      folders: (expedientId) => request(`/archives/folders${expedientId ? `?expedient_id=${encodeURIComponent(expedientId)}` : ""}`),
      repository: () => request("/archives/repository"),
      searchDocuments: (payload) => request("/search/documents", { method: "POST", body: JSON.stringify(payload || {}) }),
      archives: () => request("/archives"),
      archiveDashboard: () => request("/archives/dashboard"),
      boxes: () => request("/archives/boxes"),
      shelves: () => request("/archives/shelves"),
      physicalStructureOptions: (archiveId) => request(`/archives/physical-structure/options?archive_id=${encodeURIComponent(archiveId)}`),
      locations: () => request("/transfers/locations"),
      locationsSummary: () => request("/archives/locations/summary"),
      locationsTree: () => request("/archives/locations/tree"),
      locationsUnassigned: () => request("/archives/locations/unassigned"),
      locationsMovements: () => request("/archives/locations/movements"),
      trdEditor: () => request("/trd/editor"),
      trdSeries: () => request("/trd/series"),
      trdSubseries: () => request("/trd/subseries"),
      trdDependencies: () => request("/trd/dependencies"),
      transfers: () => request("/transfer-batches"),
      receptionItems: (batchId) => request(`/transfer-batches/${batchId}/reception/items`),
      receptionComparison: (batchId) => request(`/transfer-batches/${batchId}/reception/fuid-comparison`),
      kardexTimeline: () => request("/kardex/timeline"),
      kardexSummary: () => request("/kardex/summary"),
      fuid: () => request("/archives/fuid"),
      loans: () => request("/archives/loans"),
      loanSummary: () => request("/archives/loans/summary"),
      employees: () => request("/hr/employees"),
      candidates: () => request("/hr/candidates"),
      vacancies: () => request("/hr/vacancies"),
      publicVacancies: () => request("/hr/public/vacancies"),
      departments: () => request("/hr/departments"),
      positions: () => request("/hr/positions"),
      expiringContracts: () => request("/hr/contracts/expiring"),
      medicalExams: () => request("/hr/sst/exams"),
      sstAlerts: () => request("/hr/sst/alerts"),
      audit: () => request("/audit?limit=100"),
      auditSummary: () => request("/audit/summary"),
      users: () => request("/users"),
      roles: () => request("/users/roles"),
      permissions: () => request("/users/permissions"),
      integrations: () => request("/integrations"),
      signatures: () => request("/signatures/requests"),
      notifications: () => request("/notifications"),
      notificationsSummary: () => request("/notifications/summary"),
      tasks: () => request("/workflows/tasks"),
      tasksSummary: () => request("/workflows/tasks/summary"),
      ocrJobs: () => request("/ocr/jobs"),
      biDashboard: () => request("/bi/executive-dashboard"),
      reportsJobs: () => request("/reports/jobs"),
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
        .then((value) => { if (alive && value !== undefined) setData(value); })
        .catch((err) => { if (alive) setError(err.message || "No fue posible cargar datos reales."); })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, deps || []);
    return { data, loading, error, setData };
  };
})();
