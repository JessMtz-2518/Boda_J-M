(() => {
  "use strict";

  const LIST_RPC = "admin_listar_confirmaciones";
  const DETAIL_RPC = "admin_obtener_confirmacion";
  const CORRECT_RPC = "admin_corregir_confirmacion";

  const GROUPS = Object.freeze([
    "Familia Marcos",
    "Familia Jess",
    "Amigos Marcos",
    "Amigos Jess",
  ]);
  const STATES = Object.freeze(["confirmado", "no_asistira"]);
  const PAGE_SIZES = Object.freeze([10, 20, 50]);

  class ConfirmationsContractError extends Error {
    constructor() {
      super("La respuesta administrativa de confirmaciones no tiene el formato esperado.");
      this.name = "ConfirmationsContractError";
      this.code = "ADMIN_CONFIRMATIONS_CONTRACT_INVALID";
    }
  }

  function invalidContract() { throw new ConfirmationsContractError(); }
  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function object(value) { if (!isObject(value)) invalidContract(); return value; }
  function string(value) { if (typeof value !== "string") invalidContract(); return value; }
  function bool(value) { if (typeof value !== "boolean") invalidContract(); return value; }
  function integer(value) { if (!Number.isInteger(value) || value < 0) invalidContract(); return value; }
  function nullableString(value) { if (value !== null && typeof value !== "string") invalidContract(); return value; }
  function validDate(value) {
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
  }
  function date(value) { if (!validDate(value)) invalidContract(); return value; }

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

  function handleError(error) {
    if (isSessionError(error)) {
      window.dispatchEvent(new CustomEvent("admin:session-expired"));
    }
    throw error;
  }

  function normalizeCriteria(value = {}) {
    const page = Number(value.page ?? 1);
    const pageSize = Number(value.pageSize ?? 20);
    const search = String(value.search ?? "").trim();
    const group = value.group || null;
    const state = value.state || null;
    const active = typeof value.active === "boolean" ? value.active : null;

    if (!Number.isInteger(page) || page < 1) invalidContract();
    if (!PAGE_SIZES.includes(pageSize)) invalidContract();
    if (search.length > 150) invalidContract();
    if (group !== null && !GROUPS.includes(group)) invalidContract();
    if (state !== null && !STATES.includes(state)) invalidContract();

    return { page, pageSize, search, group, state, active };
  }

  function validateConfirmationItem(value) {
    const item = object(value);
    integer(item.invitado_id);
    if (item.invitado_id < 1) invalidContract();
    ["codigo", "nombre", "grupo"].forEach((field) => string(item[field]));
    if (!GROUPS.includes(item.grupo)) invalidContract();
    bool(item.invitacion_activa);

    const quota = object(item.cupo);
    ["adultos", "ninos", "total"].forEach((field) => integer(quota[field]));
    if (quota.total !== quota.adultos + quota.ninos) invalidContract();

    const confirmation = object(item.confirmacion);
    string(confirmation.estado);
    if (!STATES.includes(confirmation.estado)) invalidContract();
    ["adultos", "ninos", "total"].forEach((field) => integer(confirmation[field]));
    if (confirmation.total !== confirmation.adultos + confirmation.ninos) invalidContract();
    bool(confirmation.tiene_mensaje);
    bool(confirmation.tiene_actualizaciones);
    date(confirmation.fecha_confirmacion);
    date(confirmation.fecha_actualizacion);
  }

  function validateListEnvelope(response, expected) {
    const envelope = object(response);
    if (envelope.schema_version !== "1.0") invalidContract();
    date(envelope.generated_at);

    const data = object(envelope.data);
    if (!Array.isArray(data.items)) invalidContract();
    data.items.forEach(validateConfirmationItem);

    const pagination = object(data.pagination);
    ["page", "page_size", "total_items", "total_pages"].forEach((field) => integer(pagination[field]));
    bool(pagination.has_previous);
    bool(pagination.has_next);

    if (pagination.page !== expected.page || pagination.page_size !== expected.pageSize) invalidContract();
    const pages = pagination.total_items === 0 ? 0 : Math.ceil(pagination.total_items / pagination.page_size);
    if (pagination.total_pages !== pages) invalidContract();
    if (data.items.length > pagination.page_size) invalidContract();

    return envelope;
  }

  function validateCurrent(value, expectedId) {
    const current = object(value);
    if (current.invitado_id !== expectedId) invalidContract();
    ["codigo", "nombre", "grupo"].forEach((field) => string(current[field]));
    if (!GROUPS.includes(current.grupo)) invalidContract();
    bool(current.invitacion_activa);

    const quota = object(current.cupo);
    ["adultos", "ninos", "total"].forEach((field) => integer(quota[field]));
    if (quota.total !== quota.adultos + quota.ninos) invalidContract();

    const confirmation = object(current.confirmacion);
    string(confirmation.estado);
    if (!STATES.includes(confirmation.estado)) invalidContract();
    ["adultos", "ninos", "total"].forEach((field) => integer(confirmation[field]));
    if (confirmation.total !== confirmation.adultos + confirmation.ninos) invalidContract();
    nullableString(confirmation.mensaje_original);
    date(confirmation.fecha_confirmacion);
    date(confirmation.fecha_actualizacion);
    date(confirmation.version);

    return current;
  }

  function validateHistoryItem(value) {
    const item = object(value);
    integer(item.id);
    string(item.accion);
    string(item.origen);
    if (!["invitado", "administrador"].includes(item.origen)) invalidContract();
    if (item.datos_anteriores !== null) object(item.datos_anteriores);
    object(item.datos_nuevos);
    nullableString(item.modificado_por);
    nullableString(item.administrador_nombre);
    nullableString(item.motivo);
    date(item.fecha_evento);
  }

  function validateDetailEnvelope(response, expectedId) {
    const envelope = object(response);
    if (envelope.schema_version !== "1.0") invalidContract();
    date(envelope.generated_at);

    const data = object(envelope.data);
    const current = validateCurrent(data.actual, expectedId);
    if (!Array.isArray(data.historial)) invalidContract();
    data.historial.forEach(validateHistoryItem);

    return { current, history: data.historial };
  }

  function normalizeCorrection(value = {}) {
    const invitationId = Number(value.invitadoId);
    const adults = Number(value.adultos);
    const children = Number(value.ninos);
    const reason = String(value.motivo ?? "").trim();
    const version = String(value.version ?? "").trim();

    if (!Number.isInteger(invitationId) || invitationId < 1) invalidContract();
    if (!Number.isInteger(adults) || adults < 0) invalidContract();
    if (!Number.isInteger(children) || children < 0) invalidContract();
    if (!reason || reason.length > 1000) invalidContract();
    date(version);

    return { invitationId, adults, children, reason, version };
  }

  function validateCorrectionEnvelope(response, expectedId) {
    const envelope = object(response);
    if (envelope.schema_version !== "1.0") invalidContract();
    date(envelope.generated_at);
    const data = object(envelope.data);
    if (data.corrected !== true || data.invitado_id !== expectedId) invalidContract();
    string(data.estado);
    if (!STATES.includes(data.estado)) invalidContract();
    ["adultos_confirmados", "ninos_confirmados", "total_confirmado"].forEach((field) => integer(data[field]));
    if (data.total_confirmado !== data.adultos_confirmados + data.ninos_confirmados) invalidContract();
    date(data.version);
    return data;
  }

  async function listConfirmations(criteria) {
    const normalized = normalizeCriteria(criteria);
    const { data, error } = await client().rpc(LIST_RPC, {
      p_busqueda: normalized.search || null,
      p_grupo: normalized.group,
      p_estado: normalized.state,
      p_activo: normalized.active,
      p_pagina: normalized.page,
      p_tamano_pagina: normalized.pageSize,
    });
    if (error) handleError(error);
    return validateListEnvelope(data, normalized);
  }

  async function getConfirmation(invitationId) {
    const id = Number(invitationId);
    if (!Number.isInteger(id) || id < 1) invalidContract();
    const { data, error } = await client().rpc(DETAIL_RPC, { p_invitado_id: id });
    if (error) handleError(error);
    return validateDetailEnvelope(data, id);
  }

  async function correctConfirmation(values) {
    const normalized = normalizeCorrection(values);
    const { data, error } = await client().rpc(CORRECT_RPC, {
      p_invitado_id: normalized.invitationId,
      p_adultos: normalized.adults,
      p_ninos: normalized.children,
      p_motivo: normalized.reason,
      p_version: normalized.version,
    });
    if (error) handleError(error);
    return validateCorrectionEnvelope(data, normalized.invitationId);
  }

  window.AdminConfirmationsService = Object.freeze({
    listConfirmations,
    getConfirmation,
    correctConfirmation,
  });
})();