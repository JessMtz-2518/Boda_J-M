(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_padrinos_resumen",
    save: "admin_padrinos_guardar",
    toggle: "admin_padrinos_cambiar_activo",
    dates: "admin_padrinos_fechas_objetivo",
    saveDate: "admin_padrinos_fecha_objetivo_guardar",
    links: "admin_padrinos_esenciales_relaciones",
    saveLink: "admin_padrinos_esencial_relacion_guardar",
    fulfillment: "admin_padrinos_cumplimiento",
    saveFulfillment: "admin_padrinos_cumplimiento_guardar",
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
    const [{ data, error }, datesResult, linksResult, fulfillmentResult] = await Promise.all([
      client().rpc(RPC.summary),
      client().rpc(RPC.dates),
      client().rpc(RPC.links),
      client().rpc(RPC.fulfillment),
    ]);
    if (error) fail(error);
    if (datesResult.error) fail(datesResult.error);
    if (linksResult.error) fail(linksResult.error);
    if (fulfillmentResult.error) fail(fulfillmentResult.error);

    const summary = envelope(data);
    const dates = Array.isArray(datesResult.data) ? datesResult.data : [];
    const links = Array.isArray(linksResult.data) ? linksResult.data : [];
    const fulfillment = Array.isArray(fulfillmentResult.data) ? fulfillmentResult.data : [];
    const dateMap = new Map(dates.map((row) => [Number(row.id), row.fecha_objetivo || null]));
    const linkMap = new Map(links.map((row) => [Number(row.padrino_id), row]));
    const fulfillmentMap = new Map(fulfillment.map((row) => [Number(row.padrino_id), row]));

    if (Array.isArray(summary.items)) {
      summary.items = summary.items.map((item) => ({
        ...item,
        fecha_objetivo: dateMap.get(Number(item.id)) || null,
        esencial_id: linkMap.get(Number(item.id))?.esencial_id || null,
        esencial_titulo: linkMap.get(Number(item.id))?.esencial_titulo || null,
        esencial_categoria: linkMap.get(Number(item.id))?.esencial_categoria || null,
        cumplimiento_estado: fulfillmentMap.get(Number(item.id))?.cumplimiento_estado || "pendiente",
        fecha_compromiso: fulfillmentMap.get(Number(item.id))?.fecha_compromiso || null,
      }));
    }
    if (Array.isArray(summary.disabled)) {
      summary.disabled = summary.disabled.map((item) => ({
        ...item,
        fecha_objetivo: dateMap.get(Number(item.id)) || null,
        cumplimiento_estado: fulfillmentMap.get(Number(item.id))?.cumplimiento_estado || "pendiente",
        fecha_compromiso: fulfillmentMap.get(Number(item.id))?.fecha_compromiso || null,
      }));
    }
    return summary;
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
    const saved = envelope(data);

    const savedId = Number(saved?.id || saved?.item?.id || values.id || 0);
    if (savedId) {
      const dateResult = await client().rpc(RPC.saveDate, {
        p_id: savedId,
        p_fecha_objetivo: values.targetDate || null,
      });
      if (dateResult.error) fail(dateResult.error);

      const linkResult = await client().rpc(RPC.saveLink, {
        p_padrino_id: savedId,
        p_esencial_id: values.essentialId ? Number(values.essentialId) : null,
      });
      if (linkResult.error) fail(linkResult.error);

      const fulfillmentResult = await client().rpc(RPC.saveFulfillment, {
        p_padrino_id: savedId,
        p_cumplimiento_estado: values.status === "confirmado"
          ? String(values.fulfillmentStatus || "pendiente")
          : "pendiente",
        p_fecha_compromiso: values.status === "confirmado"
          ? (values.commitmentDate || null)
          : null,
      });
      if (fulfillmentResult.error) fail(fulfillmentResult.error);
    }
    return saved;
  }

  async function getRelations() {
    const [linksResult, fulfillmentResult] = await Promise.all([
      client().rpc(RPC.links),
      client().rpc(RPC.fulfillment),
    ]);

    if (linksResult.error) fail(linksResult.error);
    if (fulfillmentResult.error) fail(fulfillmentResult.error);

    const links = Array.isArray(linksResult.data) ? linksResult.data : [];
    const fulfillment = Array.isArray(fulfillmentResult.data) ? fulfillmentResult.data : [];
    const fulfillmentMap = new Map(
      fulfillment.map((row) => [Number(row.padrino_id), row])
    );

    return links.map((row) => ({
      ...row,
      cumplimiento_estado:
        fulfillmentMap.get(Number(row.padrino_id))?.cumplimiento_estado || "pendiente",
      fecha_compromiso:
        fulfillmentMap.get(Number(row.padrino_id))?.fecha_compromiso || null,
    }));
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
    getRelations,
    listAllActiveGuests,
  });
})();