(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_dashboard_resumen",
    recent: "admin_dashboard_confirmaciones_recientes",
    groups: "admin_dashboard_estadisticas_grupo",
    evolution: "admin_estadisticas_evolucion",
  });

  function client() {
    const instance = window.AdminSupabaseClient?.getClient?.();
    if (!instance) throw new Error("El cliente administrativo no esta disponible.");
    return instance;
  }

  function isSessionError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const message = String(error?.message || "").toLowerCase();
    return status === 401 || status === 403 || error?.code === "PGRST301" ||
      message.includes("jwt") || message.includes("session") ||
      message.includes("acceso administrativo no autorizado");
  }

  async function call(name, parameters) {
    const { data, error } = await client().rpc(name, parameters);
    if (error) {
      if (isSessionError(error)) {
        window.dispatchEvent(new CustomEvent("admin:session-expired"));
      }
      throw error;
    }
    if (!data || data.schema_version !== "1.0" || !data.data) {
      throw new Error("La respuesta administrativa no tiene el formato esperado.");
    }
    return data;
  }

  const getSummary = () => call(RPC.summary);
  const getRecentConfirmations = () => call(RPC.recent, { p_limite: 10 });
  const getGroupStatistics = () => call(RPC.groups);
  const getEvolution = () => call(RPC.evolution);

  window.AdminDashboardService = Object.freeze({
    getEvolution,
    getGroupStatistics,
    getRecentConfirmations,
    getSummary,
  });
})();
