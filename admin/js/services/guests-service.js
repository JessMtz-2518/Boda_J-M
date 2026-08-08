(() => {
  "use strict";

  const RPC_NAME = "admin_listar_invitados";
  const TOKEN_RPC_NAME = "admin_obtener_token_invitacion";
  const DETAIL_RPC_NAME = "admin_obtener_invitado";
  const UPDATE_RPC_NAME = "admin_actualizar_invitado";
  const CREATE_RPC_NAME = "admin_crear_invitado";
  const STATUS_RPC_NAME = "admin_cambiar_estado_invitado";
  const TOKEN_PURPOSES = Object.freeze(["vista_previa", "copiar_enlace", "whatsapp"]);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

  function normalizeInvitationId(value) {
    const id = Number(value);
    if (!isInteger(id) || id < 1) invalidContract();
    return id;
  }

  function normalizeTokenPurpose(value) {
    const purpose = String(value || "").trim().toLowerCase();
    if (!TOKEN_PURPOSES.includes(purpose)) invalidContract();
    return purpose;
  }

  function validateTokenEnvelope(response, expectedPurpose) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();
    const data = requireObject(envelope.data);
    if (data.proposito !== expectedPurpose) invalidContract();
    if (typeof data.token_acceso !== "string" || !UUID_PATTERN.test(data.token_acceso.trim())) invalidContract();
    return data.token_acceso.trim();
  }

  function validateGuestDetailEnvelope(response, expectedId) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();
    const data = requireObject(envelope.data);
    const guest = requireObject(data.invitado);

    if (!isInteger(guest.invitado_id) || guest.invitado_id !== expectedId) invalidContract();
    ["codigo", "nombre", "grupo"].forEach((field) => requireString(guest[field]));
    if (!GROUPS.includes(guest.grupo)) invalidContract();
    ["adultos_asignados", "ninos_asignados", "cupo_total"].forEach((field) => {
      if (!isNonNegativeInteger(guest[field])) invalidContract();
    });
    if (guest.cupo_total !== guest.adultos_asignados + guest.ninos_asignados) invalidContract();
    if (!isNullableString(guest.telefono) || !isNullableString(guest.notas)) invalidContract();
    requireBoolean(guest.activo);
    if (!isValidDate(guest.version)) invalidContract();

    if (guest.confirmacion !== null) {
      const confirmation = requireObject(guest.confirmacion);
      if (!STATES.includes(confirmation.estado)) invalidContract();
      ["adultos_confirmados", "ninos_confirmados", "total_confirmado"].forEach((field) => {
        if (!isNonNegativeInteger(confirmation[field])) invalidContract();
      });
      if (confirmation.total_confirmado !== confirmation.adultos_confirmados + confirmation.ninos_confirmados) invalidContract();
      if (!isNullableString(confirmation.mensaje)) invalidContract();
      if (!isValidDate(confirmation.fecha_primera_respuesta) || !isValidDate(confirmation.fecha_ultima_actividad)) invalidContract();
    }

    return guest;
  }

  function normalizeUpdatePayload(value = {}) {
    const payload = requireObject(value);
    const id = normalizeInvitationId(payload.invitadoId);
    const name = String(payload.nombre ?? "").trim();
    const group = String(payload.grupo ?? "").trim();
    const adults = Number(payload.adultosAsignados);
    const children = Number(payload.ninosAsignados);
    const phone = String(payload.telefono ?? "").trim();
    const notes = String(payload.notas ?? "").trim();
    const reason = String(payload.motivo ?? "").trim();
    const version = String(payload.version ?? "").trim();

    if (!name || name.length > 150) invalidContract();
    if (!GROUPS.includes(group)) invalidContract();
    if (!isNonNegativeInteger(adults) || !isNonNegativeInteger(children)) invalidContract();
    if (phone.length > 25 || (phone && !/^[0-9+() -]{7,25}$/.test(phone))) invalidContract();
    if (notes.length > 1000 || !reason || reason.length > 1000 || !isValidDate(version)) invalidContract();

    return { id, name, group, adults, children, phone: phone || null, notes: notes || null, reason, version };
  }

  function validateUpdateEnvelope(response, expectedId) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();
    const data = requireObject(envelope.data);
    if (!isInteger(data.invitado_id) || data.invitado_id !== expectedId) invalidContract();
    requireBoolean(data.actualizado);
    if (!isValidDate(data.version)) invalidContract();
    return data;
  }


  function normalizeStatusPayload(value = {}) {
    const payload = requireObject(value);
    const id = normalizeInvitationId(payload.invitadoId);
    if (typeof payload.activo !== "boolean") invalidContract();

    const reason = String(payload.motivo ?? "").trim();
    const version = String(payload.version ?? "").trim();

    if (!reason || reason.length > 1000 || !isValidDate(version)) invalidContract();

    return { id, active: payload.activo, reason, version };
  }

  function validateStatusEnvelope(response, expectedId, expectedActive) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();

    const data = requireObject(envelope.data);
    if (!isInteger(data.invitado_id) || data.invitado_id !== expectedId) invalidContract();
    requireBoolean(data.cambio_aplicado);
    requireBoolean(data.activo);
    if (data.activo !== expectedActive) invalidContract();
    if (!isValidDate(data.version)) invalidContract();

    return data;
  }


  function normalizeCreatePayload(value = {}) {
    const payload = requireObject(value);
    const name = String(payload.nombre ?? "").trim();
    const group = String(payload.grupo ?? "").trim();
    const adults = Number(payload.adultos);
    const children = Number(payload.ninos);
    const phone = String(payload.telefono ?? "").trim();
    const notes = String(payload.notas ?? "").trim();
    const reason = String(payload.motivo ?? "").trim();

    if (!name || name.length > 150) invalidContract();
    if (!GROUPS.includes(group)) invalidContract();
    if (!isNonNegativeInteger(adults) || !isNonNegativeInteger(children) || adults + children <= 0) invalidContract();
    if (phone.length > 25 || (phone && !/^[0-9+() -]{7,25}$/.test(phone))) invalidContract();
    if (notes.length > 1000 || !reason || reason.length > 1000) invalidContract();

    return { name, group, adults, children, phone: phone || null, notes: notes || null, reason };
  }

  function validateCreateEnvelope(response) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0" || !isValidDate(envelope.generated_at)) invalidContract();
    const data = requireObject(envelope.data);
    if (data.created !== true) invalidContract();
    const guest = requireObject(data.invitado);
    if (!isInteger(guest.id) || guest.id < 1) invalidContract();
    ["codigo", "nombre", "grupo"].forEach((field) => requireString(guest[field]));
    if (!GROUPS.includes(guest.grupo)) invalidContract();
    ["adultos_asignados", "ninos_asignados", "cupo_total"].forEach((field) => {
      if (!isNonNegativeInteger(guest[field])) invalidContract();
    });
    if (guest.cupo_total !== guest.adultos_asignados + guest.ninos_asignados || guest.cupo_total <= 0) invalidContract();
    requireBoolean(guest.activo);
    if (!guest.activo || !isValidDate(guest.version)) invalidContract();
    return guest;
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

  async function getGuestDetail(invitationId) {
    const id = normalizeInvitationId(invitationId);
    const { data, error } = await client().rpc(DETAIL_RPC_NAME, { p_id: id });
    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }
    return validateGuestDetailEnvelope(data, id);
  }

  async function updateGuest(values) {
    const normalized = normalizeUpdatePayload(values);
    const { data, error } = await client().rpc(UPDATE_RPC_NAME, {
      p_id: normalized.id,
      p_nombre: normalized.name,
      p_grupo: normalized.group,
      p_adultos_asignados: normalized.adults,
      p_ninos_asignados: normalized.children,
      p_telefono: normalized.phone,
      p_notas: normalized.notes,
      p_motivo: normalized.reason,
      p_version: normalized.version,
    });
    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }
    return validateUpdateEnvelope(data, normalized.id);
  }

  async function createGuest(values) {
    const normalized = normalizeCreatePayload(values);
    const { data, error } = await client().rpc(CREATE_RPC_NAME, {
      p_nombre: normalized.name,
      p_grupo: normalized.group,
      p_adultos: normalized.adults,
      p_ninos: normalized.children,
      p_telefono: normalized.phone,
      p_notas: normalized.notes,
      p_motivo: normalized.reason,
    });
    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }
    return validateCreateEnvelope(data);
  }


  async function changeGuestStatus(values) {
    const normalized = normalizeStatusPayload(values);
    const { data, error } = await client().rpc(STATUS_RPC_NAME, {
      p_id: normalized.id,
      p_activo: normalized.active,
      p_motivo: normalized.reason,
      p_version: normalized.version,
    });

    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }

    return validateStatusEnvelope(data, normalized.id, normalized.active);
  }

  async function getInvitationToken(invitationId, purpose) {
    const id = normalizeInvitationId(invitationId);
    const normalizedPurpose = normalizeTokenPurpose(purpose);
    const { data, error } = await client().rpc(TOKEN_RPC_NAME, {
      p_id: id,
      p_proposito: normalizedPurpose,
    });
    if (error) {
      if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
      throw error;
    }
    return validateTokenEnvelope(data, normalizedPurpose);
  }

  window.AdminGuestsService = Object.freeze({ listGuests, getGuestDetail, updateGuest, createGuest, changeGuestStatus, getInvitationToken });
})();
