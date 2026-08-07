(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_dashboard_resumen",
    recent: "admin_dashboard_confirmaciones_recientes",
    groups: "admin_dashboard_estadisticas_grupo",
    evolution: "admin_estadisticas_evolucion",
  });

  const SUMMARY_NUMBERS = Object.freeze({
    invitaciones: ["activas", "con_respuesta", "pendientes", "asistiran", "no_asistiran"],
    cupo: ["adultos_reservados", "ninos_reservados", "total_reservado"],
    asistencia: ["adultos_confirmados", "ninos_confirmados", "total_confirmado"],
    porcentajes: ["respuesta", "ocupacion"],
  });

  const EVOLUTION_ACTIVITY_NUMBERS = Object.freeze(["primeras_respuestas", "modificaciones"]);
  const EVOLUTION_STATE_NUMBERS = Object.freeze([
    "invitaciones_asisten",
    "invitaciones_no_asisten",
    "adultos_confirmados",
    "ninos_confirmados",
    "asistentes_confirmados",
  ]);

  class DashboardContractError extends Error {
    constructor() {
      super("La respuesta administrativa no tiene el formato esperado.");
      this.name = "DashboardContractError";
      this.code = "ADMIN_CONTRACT_INVALID";
    }
  }

  function invalidContract() {
    throw new DashboardContractError();
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isValidDate(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, year, month, day] = dateOnly.map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }
    return Number.isFinite(Date.parse(value));
  }

  function requireObject(value) {
    if (!isObject(value)) invalidContract();
    return value;
  }

  function requireString(value) {
    if (typeof value !== "string") invalidContract();
  }

  function requireBoolean(value) {
    if (typeof value !== "boolean") invalidContract();
  }

  function requireDate(value, { nullable = false } = {}) {
    if (nullable && value === null) return;
    if (!isValidDate(value)) invalidContract();
  }

  function requireNumbers(object, fields, { nullable = [] } = {}) {
    const allowedNulls = new Set(nullable);
    fields.forEach((field) => {
      if (allowedNulls.has(field) && object[field] === null) return;
      if (!isFiniteNumber(object[field])) invalidContract();
    });
  }

  function validateMetricGroups(data) {
    Object.entries(SUMMARY_NUMBERS).forEach(([group, fields]) => {
      requireNumbers(requireObject(data[group]), fields);
    });
  }

  function validateSummary(data) {
    validateMetricGroups(data);
    const activity = requireObject(data.actividad);
    requireDate(activity.ultima_confirmacion_at, { nullable: true });
    requireNumbers(activity, ["tiempo_promedio_respuesta_horas"], {
      nullable: ["tiempo_promedio_respuesta_horas"],
    });
    requireBoolean(activity.tiempo_promedio_disponible);
    requireString(activity.motivo_no_disponible);
  }

  function validateRecent(data) {
    if (!Array.isArray(data.items)) invalidContract();
    const meta = requireObject(data.meta);
    requireNumbers(meta, ["limite", "cantidad"]);
    data.items.forEach((item) => {
      const record = requireObject(item);
      requireNumbers(record, [
        "invitacion_id",
        "adultos_confirmados",
        "ninos_confirmados",
        "total_confirmado",
      ]);
      ["codigo", "nombre", "grupo", "estado"].forEach((field) => requireString(record[field]));
      if (!new Set(["confirmado", "no_asistira"]).has(record.estado)) invalidContract();
      requireDate(record.fecha_primera_respuesta);
      requireDate(record.fecha_ultima_actividad);
      requireBoolean(record.es_actualizacion);
    });
  }

  function validateGroups(data) {
    if (!Array.isArray(data.items)) invalidContract();
    data.items.forEach((item) => {
      const record = requireObject(item);
      requireString(record.grupo);
      validateMetricGroups(record);
    });
  }

  function validateEvolution(data) {
    const period = requireObject(data.periodo);
    requireDate(period.desde);
    requireDate(period.hasta);
    requireNumbers(period, ["dias"]);
    requireString(period.zona_horaria);
    if (!Array.isArray(data.items) || data.items.length !== 30) invalidContract();
    data.items.forEach((item) => {
      const record = requireObject(item);
      requireDate(record.fecha);
      requireNumbers(requireObject(record.actividad), EVOLUTION_ACTIVITY_NUMBERS);
      requireNumbers(requireObject(record.estado_al_cierre), EVOLUTION_STATE_NUMBERS);
    });
  }

  const validators = Object.freeze({
    [RPC.summary]: validateSummary,
    [RPC.recent]: validateRecent,
    [RPC.groups]: validateGroups,
    [RPC.evolution]: validateEvolution,
  });

  function validateEnvelope(name, response) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0") invalidContract();
    requireDate(envelope.generated_at);
    const data = requireObject(envelope.data);
    const validator = validators[name];
    if (typeof validator !== "function") invalidContract();
    validator(data);
    return envelope;
  }

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
    return validateEnvelope(name, data);
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
