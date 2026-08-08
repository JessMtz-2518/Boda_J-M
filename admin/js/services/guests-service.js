(() => {
  "use strict";

  const RPC_NAME = "admin_listar_invitados";
  const PAGE_SIZES = Object.freeze([10, 20, 50]);
  const GROUPS = Object.freeze(["Familia Marcos", "Familia Jess", "Amigos Marcos", "Amigos Jess"]);
  const STATES = Object.freeze(["pendiente", "asistira", "no_asistira"]);
  const ORDERS = Object.freeze(["grupo", "nombre", "codigo", "cupo_total", "estado", "fecha_actualizacion"]);

  class GuestsContractError extends Error {
    constructor() {
      super("La respuesta administrativa no tiene el formato esperado.");
      this.name = "GuestsContractError";
      this.code = "ADMIN_GUESTS_CONTRACT_INVALID";
    }
  }

  function invalidContract() { throw new GuestsContractError(); }
  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function isInteger(value) { return Number.isInteger(value) && Number.isFinite(value); }
  function isNonNegativeInteger(value) { return isInteger(value) && value >= 0; }
  function isNullableString(value) { return value === null || typeof value === "string"; }
  function isNullableBoolean(value) { return value === null || typeof value === "boolean"; }
  function isValidDate(value) { return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value)); }
  function requireObject(value) { if (!isObject(value)) invalidContract(); return value; }
  function requireString(value) { if (typeof value !== "string") invalidContract(); }
  function requireBoolean(value) { if (typeof value !== "boolean") invalidContract(); }

  function normalizeCriteria(criteria = {}) {
    const pageSize = Number(criteria.pageSize ?? 20);
    const page = Number(criteria.page ?? 1);
    const normalized = {
      search: String(criteria.search ?? "").trim(),
      group: criteria.group || null,
      state: criteria.state || null,
      active: typeof criteria.active === "boolean" ? criteria.active : null,
      withChildren: typeof criteria.withChildren === "boolean" ? criteria.withChildren : null,
      withoutPhone: typeof criteria.withoutPhone === "boolean" ? criteria.withoutPhone : null,
      withNotes: typeof criteria.withNotes === "boolean" ? criteria.withNotes : null,
      page,
      pageSize,
      order: criteria.order || "grupo",
      direction: String(criteria.direction || "asc").toLowerCase(),
    };
    if (normalized.search.length > 100 || !isInteger(page) || page < 1 || !PAGE_SIZES.includes(pageSize)) invalidContract();
    if (normalized.group !== null && !GROUPS.includes(normalized.group)) invalidContract();
    if (normalized.state !== null && !STATES.includes(normalized.state)) invalidContract();
    if (!ORDERS.includes(normalized.order) || !["asc", "desc"].includes(normalized.direction)) invalidContract();
    return normalized;
  }

  function validateItem(value) {
    const item = requireObject(value);
    ["invitado_id", "adultos_asignados", "ninos_asignados", "cupo_total", "adultos_confirmados", "ninos_confirmados", "total_confirmado"]
      .forEach((field) => { if (!isNonNegativeInteger(item[field])) invalidContract(); });
    if (item.invitado_id < 1) invalidContract();
    ["codigo", "nombre", "grupo", "estado_confirmacion"].forEach((field) => requireString(item[field]));
    if (!STATES.includes(item.estado_confirmacion) || !GROUPS.includes(item.grupo)) invalidContract();
    ["activo", "tiene_telefono", "tiene_notas"].forEach((field) => requireBoolean(item[field]));
    if (!isValidDate(item.version)) invalidContract();
    if (item.cupo_total !== item.adultos_asignados + item.ninos_asignados) invalidContract();
    if (item.total_confirmado !== item.adultos_confirmados + item.ninos_confirmados) invalidContract();
  }

  function validateEchoedCriteria(value, expected) {
    const filters = requireObject(value);
    if (!isNullableString(filters.busqueda) || !isNullableString(filters.grupo) || !isNullableString(filters.estado)) invalidContract();
    if (!isNullableBoolean(filters.activo) || !isNullableBoolean(filters.con_ninos) || !isNullableBoolean(filters.sin_telefono) || !isNullableBoolean(filters.con_notas)) invalidContract();
    requireString(filters.orden);
    requireString(filters.direccion);
    if (filters.grupo !== null && !GROUPS.includes(filters.grupo)) invalidContract();
    if (filters.estado !== null && !STATES.includes(filters.estado)) invalidContract();
    if (!ORDERS.includes(filters.orden) || !["asc", "desc"].includes(filters.direccion)) invalidContract();
    const expectedValues = {
      busqueda: expected.search || null,
      grupo: expected.group,
      estado: expected.state,
      activo: expected.active,
      con_ninos: expected.withChildren,
      sin_telefono: expected.withoutPhone,
      con_notas: expected.withNotes,
      orden: expected.order,
      direccion: expected.direction,
    };
    Object.entries(expectedValues).forEach(([field, expectedValue]) => {
      if (filters[field] !== expectedValue) invalidContract();
    });
  }

  function validateEnvelope(response, expected) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();
    const data = requireObject(envelope.data);
    if (!Array.isArray(data.items)) invalidContract();
    data.items.forEach(validateItem);
    const pagination = requireObject(data.paginacion);
    ["pagina", "tamano_pagina", "total_registros", "total_paginas"].forEach((field) => {
      if (!isNonNegativeInteger(pagination[field])) invalidContract();
    });
    if (pagination.pagina < 1 || !PAGE_SIZES.includes(pagination.tamano_pagina)) invalidContract();
    if (pagination.pagina !== expected.page || pagination.tamano_pagina !== expected.pageSize) invalidContract();
    if (data.items.length > pagination.tamano_pagina) invalidContract();
    const expectedPages = pagination.total_registros === 0 ? 0 : Math.ceil(pagination.total_registros / pagination.tamano_pagina);
    if (pagination.total_paginas !== expectedPages) invalidContract();
    validateEchoedCriteria(data.criterios, expected);
    return envelope;
  }

  function client() {
    const instance = window.AdminSupabaseClient?.getClient?.();
    if (!instance) throw new Error("El cliente administrativo no está disponible.");
    return instance;
  }

  function isSessionError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const message = String(error?.message || "").toLowerCase();
    return status === 401 || status === 403 || error?.code === "PGRST301" ||
      message.includes("jwt") || message.includes("session") ||
      message.includes("acceso administrativo no autorizado");
  }

  async function listGuests(criteria) {
    const normalized = normalizeCriteria(criteria);
    const { data, error } = await client().rpc(RPC_NAME, {
      p_busqueda: normalized.search || null,
      p_grupo: normalized.group,
      p_estado: normalized.state,
      p_activo: normalized.active,
      p_con_ninos: normalized.withChildren,
      p_sin_telefono: normalized.withoutPhone,
      p_con_notas: normalized.withNotes,
      p_pagina: normalized.page,
      p_tamano_pagina: normalized.pageSize,
      p_orden: normalized.order,
      p_direccion: normalized.direction,
    });
    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }
    return validateEnvelope(data, normalized);
  }

  window.AdminGuestsService = Object.freeze({ listGuests });
})();
