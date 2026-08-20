(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_padrinos_resumen",
    save: "admin_padrinos_guardar",
    toggle: "admin_padrinos_cambiar_activo",
  });

  function client() {
    const instance = window.AdminSupabaseClient?.getClient?.();
    if (!instance) throw new Error("El cliente administrativo no está disponible.");
    return instance;
  }

  function isSessionError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || "").toLowerCase();
    return status === 401 || status === 403 || message.includes("acceso_administrativo_no_autorizado");
  }

  function fail(error) {
    if (isSessionError(error)) window.dispatchEvent(new CustomEvent("admin:session-expired"));
    throw error;
  }

  function envelope(data) {
    if (!data || !["1.0","1.1"].includes(data.schema_version) || !data.data) {
      throw new Error("La respuesta de Padrinos no tiene el formato esperado.");
    }
    return data.data;
  }

  async function getSummary() {
    const { data, error } = await client().rpc(RPC.summary);
    if (error) fail(error);
    return envelope(data);
  }

  async function save(values = {}) {
    const { data, error } = await client().rpc(RPC.save, {
      p_id: values.id ? Number(values.id) : null,
      p_tipo: String(values.type || "").trim(),
      p_estado: String(values.status || "por_definir"),
      p_invitacion_id: values.invitationId ? Number(values.invitationId) : null,
      p_invitacion_nombre: String(values.invitationName || "").trim() || null,
      p_nombres_padrinos: String(values.names || "").trim() || null,
      p_notas: String(values.notes || "").trim() || null,
    });
    if (error) fail(error);
    return envelope(data);
  }

  async function setActive(id, active) {
    const { data, error } = await client().rpc(RPC.toggle, {
      p_id: Number(id),
      p_activo: active !== false,
    });
    if (error) fail(error);
    return envelope(data);
  }

  async function listAllActiveGuests() {
    const first = await window.AdminGuestsService.listGuests({
      page: 1,
      pageSize: 50,
      active: true,
      order: "nombre",
      direction: "asc",
    });

    const pages = Math.max(1, Number(first?.data?.paginacion?.total_paginas) || 1);
    const items = [...(first?.data?.items || [])];

    for (let page = 2; page <= pages; page += 1) {
      const next = await window.AdminGuestsService.listGuests({
        page,
        pageSize: 50,
        active: true,
        order: "nombre",
        direction: "asc",
      });
      items.push(...(next?.data?.items || []));
    }

    return items;
  }

  window.AdminGodparentsService = Object.freeze({
    getSummary,
    save,
    setActive,
    listAllActiveGuests,
  });
})();