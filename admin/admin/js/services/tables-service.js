(() => {
  "use strict";

  const RPC = Object.freeze({
    config: "admin_obtener_configuracion_mesas",
    configure: "admin_configurar_mesas",
    summary: "admin_resumen_mesas",
    list: "admin_listar_mesas",
    pending: "admin_listar_pendientes_mesa",
    detail: "admin_obtener_detalle_mesa",
    assign: "admin_asignar_mesa",
    removeAssignment: "admin_retirar_asignacion_mesa",
    history: "admin_historial_mesas",
    updateTable: "admin_actualizar_mesa",
    moveAssignment: "admin_reasignar_mesa",
    releaseAll: "admin_liberar_todas_las_mesas",
    addTable: "admin_agregar_mesa",
    deleteTable: "admin_eliminar_mesa",
    savePlan: "admin_guardar_plano_mesas",
    listPlanElements: "admin_listar_elementos_plano",
    savePlanElements: "admin_guardar_elementos_plano",
    planConfig: "admin_obtener_configuracion_plano",
    saveAdvancedPlan: "admin_guardar_editor_plano",
  });

  class TablesContractError extends Error {
    constructor(message = "La respuesta administrativa de Mesas no tiene el formato esperado.") {
      super(message);
      this.name = "TablesContractError";
      this.code = "ADMIN_TABLES_CONTRACT_INVALID";
    }
  }

  function fail(message) {
    throw new TablesContractError(message);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireObject(value) {
    if (!isObject(value)) fail();
    return value;
  }

  function requireBoolean(value) {
    if (typeof value !== "boolean") fail();
    return value;
  }

  function requireInteger(value, { nullable = false, min = 0 } = {}) {
    if (nullable && value === null) return value;
    if (!Number.isInteger(value) || value < min) fail();
    return value;
  }

  function requireNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail();
    return value;
  }

  function requireString(value, { nullable = false } = {}) {
    if (nullable && value === null) return value;
    if (typeof value !== "string") fail();
    return value;
  }

  function requireDate(value, { nullable = false } = {}) {
    if (nullable && value === null) return value;
    if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(Date.parse(value))) fail();
    return value;
  }

  function getClient() {
    const client = window.AdminSupabaseClient?.getClient?.();
    if (!client) throw new Error("El cliente administrativo no está disponible.");
    return client;
  }

  function isSessionError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const message = String(error?.message || "").toLowerCase();
    return status === 401 ||
      status === 403 ||
      error?.code === "PGRST301" ||
      message.includes("jwt") ||
      message.includes("session") ||
      message.includes("acceso administrativo no autorizado");
  }

  function handleError(error) {
    if (isSessionError(error)) {
      window.dispatchEvent(new CustomEvent("admin:session-expired"));
    }
    throw error;
  }

  function validateEnvelope(response) {
    const envelope = requireObject(response);
    if (envelope.schema_version !== "1.0") fail();
    requireDate(envelope.generated_at);
    return envelope;
  }

  function validateConfig(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);

    requireBoolean(data.configurado);
    requireInteger(data.capacidad_inicial_total);
    requireInteger(data.mesas_activas);
    requireInteger(data.capacidad_total_actual);
    requireInteger(data.cupo_invitados_activos);
    if (!Number.isInteger(data.margen_capacidad)) fail();
    requireBoolean(data.capacidad_suficiente);
    requireBoolean(data.hay_asignaciones_activas);
    requireBoolean(data.puede_reconfigurar);

    if (data.configurado) {
      requireInteger(data.numero_mesas, { min: 1 });
      requireInteger(data.capacidad_inicial, { min: 1 });
      requireDate(data.version);
    } else {
      if (data.numero_mesas !== null || data.capacidad_inicial !== null || data.version !== null) fail();
    }

    return envelope;
  }

  function validateSummary(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);

    const mesas = requireObject(data.mesas);
    requireInteger(mesas.activas);
    requireInteger(mesas.capacidad_total);

    const confirmados = requireObject(data.confirmados);
    ["adultos", "ninos", "total"].forEach((key) => requireInteger(confirmados[key]));

    const asignados = requireObject(data.asignados);
    ["adultos", "ninos", "total"].forEach((key) => requireInteger(asignados[key]));

    requireInteger(data.pendientes_asignar);
    requireInteger(data.lugares_disponibles);
    requireBoolean(data.hay_asignaciones_activas);

    return envelope;
  }

  function validateList(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);
    if (!Array.isArray(data.items)) fail();

    data.items.forEach((item) => {
      const row = requireObject(item);
      requireInteger(row.id, { min: 1 });
      requireInteger(row.numero, { min: 1 });
      requireString(row.nombre, { nullable: true });
      requireInteger(row.capacidad, { min: 1 });
      requireInteger(row.ocupados);
      requireInteger(row.disponibles);
      requireNumber(row.porcentaje_ocupacion);
      requireString(row.estado);
      if (!["disponible", "casi_llena", "completa"].includes(row.estado)) fail();
      requireBoolean(row.activo);
      requireBoolean(row.incluida_configuracion_general);
      requireDate(row.version);
    });

    return envelope;
  }

  async function getConfiguration() {
    const { data, error } = await getClient().rpc(RPC.config);
    if (error) handleError(error);
    return validateConfig(data);
  }

  async function configure({ numberOfTables, seatsPerTable, reason, version = null }) {
    const number = Number(numberOfTables);
    const capacity = Number(seatsPerTable);
    const motive = String(reason ?? "").trim();

    if (!Number.isInteger(number) || number < 1 || number > 100) {
      throw new Error("NUMERO_MESAS_INVALIDO");
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      throw new Error("CAPACIDAD_MESA_INVALIDA");
    }
    if (!motive || motive.length > 1000) {
      throw new Error("MOTIVO_INVALIDO");
    }
    if (version !== null && (!Number.isFinite(Date.parse(version)))) {
      throw new Error("VERSION_INVALIDA");
    }

    const { data, error } = await getClient().rpc(RPC.configure, {
      p_numero_mesas: number,
      p_capacidad_inicial: capacity,
      p_motivo: motive,
      p_version: version,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function getSummary() {
    const { data, error } = await getClient().rpc(RPC.summary);
    if (error) handleError(error);
    return validateSummary(data);
  }

  async function listTables() {
    const { data, error } = await getClient().rpc(RPC.list);
    if (error) handleError(error);
    return validateList(data);
  }


  function validatePending(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);
    if (!Array.isArray(data.items)) fail();
    requireInteger(data.total);

    data.items.forEach((item) => {
      const row = requireObject(item);
      requireInteger(row.invitado_id, { min: 1 });
      requireString(row.codigo);
      requireString(row.nombre);
      requireString(row.grupo);

      ["confirmados", "asignados", "pendientes"].forEach((key) => {
        const values = requireObject(row[key]);
        requireInteger(values.adultos);
        requireInteger(values.ninos);
        requireInteger(values.total);
      });

      requireDate(row.confirmacion_version);
    });

    return envelope;
  }

  function validateDetail(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);
    const table = requireObject(data.mesa);

    requireInteger(table.id, { min: 1 });
    requireInteger(table.numero, { min: 1 });
    requireString(table.nombre, { nullable: true });
    requireInteger(table.capacidad, { min: 1 });
    requireInteger(table.ocupados);
    requireInteger(table.disponibles);
    requireString(table.ubicacion, { nullable: true });
    requireString(table.notas, { nullable: true });
    requireBoolean(table.activo);
    requireBoolean(table.incluida_configuracion_general);
    requireDate(table.version);

    if (!Array.isArray(data.asignaciones)) fail();
    data.asignaciones.forEach((item) => {
      const row = requireObject(item);
      requireInteger(row.asignacion_id, { min: 1 });
      requireInteger(row.invitado_id, { min: 1 });
      requireString(row.codigo);
      requireString(row.nombre);
      requireString(row.grupo);
      requireInteger(row.adultos);
      requireInteger(row.ninos);
      requireInteger(row.total);
      requireDate(row.asignacion_version);
    });

    return envelope;
  }

  async function listPending({ search = "", group = "" } = {}) {
    const { data, error } = await getClient().rpc(RPC.pending, {
      p_busqueda: String(search || "").trim() || null,
      p_grupo: String(group || "").trim() || null,
    });
    if (error) handleError(error);
    return validatePending(data);
  }

  async function getTableDetail(tableId) {
    const id = Number(tableId);
    if (!Number.isInteger(id) || id < 1) throw new Error("MESA_INVALIDA");

    const { data, error } = await getClient().rpc(RPC.detail, {
      p_mesa_id: id,
    });
    if (error) handleError(error);
    return validateDetail(data);
  }

  async function assign({
    tableId,
    guestId,
    adults,
    children,
    reason,
  }) {
    const table = Number(tableId);
    const guest = Number(guestId);
    const adultCount = Number(adults);
    const childCount = Number(children);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(table) || table < 1) throw new Error("MESA_INVALIDA");
    if (!Number.isInteger(guest) || guest < 1) throw new Error("INVITADO_INVALIDO");
    if (!Number.isInteger(adultCount) || adultCount < 0) throw new Error("ASIGNACION_INVALIDA");
    if (!Number.isInteger(childCount) || childCount < 0) throw new Error("ASIGNACION_INVALIDA");
    if (adultCount + childCount <= 0) throw new Error("ASIGNACION_INVALIDA");
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");

    const { data, error } = await getClient().rpc(RPC.assign, {
      p_mesa_id: table,
      p_invitado_id: guest,
      p_adultos: adultCount,
      p_ninos: childCount,
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function removeAssignment({ assignmentId, reason, version }) {
    const id = Number(assignmentId);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(id) || id < 1) throw new Error("ASIGNACION_INVALIDA");
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");
    requireDate(version);

    const { data, error } = await getClient().rpc(RPC.removeAssignment, {
      p_asignacion_id: id,
      p_motivo: motive,
      p_version: version,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }


  async function updateTable({
    tableId,
    name,
    capacity,
    location = "",
    notes = "",
    reason,
    version,
  }) {
    const id = Number(tableId);
    const seats = Number(capacity);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(id) || id < 1) throw new Error("MESA_INVALIDA");
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      throw new Error("CAPACIDAD_MESA_INVALIDA");
    }
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");
    requireDate(version);

    const { data, error } = await getClient().rpc(RPC.updateTable, {
      p_mesa_id: id,
      p_nombre: String(name || "").trim() || null,
      p_capacidad: seats,
      p_ubicacion: String(location || "").trim() || null,
      p_notas: String(notes || "").trim() || null,
      p_motivo: motive,
      p_version: version,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }


  function validateHistory(response) {
    const envelope = validateEnvelope(response);
    const data = requireObject(envelope.data);
    if (!Array.isArray(data.items)) fail();

    data.items.forEach((item) => {
      const row = requireObject(item);
      requireInteger(row.id, { min: 1 });
      requireString(row.tipo_entidad);
      requireString(row.accion);
      requireString(row.titulo);
      requireString(row.detalle, { nullable: true });
      if (row.datos_anteriores !== null) requireObject(row.datos_anteriores);
      if (row.datos_nuevos !== null) requireObject(row.datos_nuevos);
      requireString(row.administrador_nombre, { nullable: true });
      requireString(row.motivo, { nullable: true });
      requireDate(row.fecha_evento);
    });

    return envelope;
  }

  async function getHistory(limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const { data, error } = await getClient().rpc(RPC.history, {
      p_limite: safeLimit,
    });
    if (error) handleError(error);
    return validateHistory(data);
  }






  async function getPlanConfiguration() {
    const { data, error } = await getClient().rpc(RPC.planConfig);
    if (error) handleError(error);

    const envelope = validateEnvelope(data);
    const config = requireObject(envelope.data);
    requireNumber(config.ancho);
    requireNumber(config.alto);
    requireDate(config.version);

    return envelope;
  }

  async function saveAdvancedPlan({
    width,
    height,
    positions,
    elements,
    reason,
  }) {
    const canvasWidth = Number(width);
    const canvasHeight = Number(height);
    const motive = String(reason || "").trim();

    if (!Number.isFinite(canvasWidth) || canvasWidth < 60 || canvasWidth > 600
        || !Number.isFinite(canvasHeight) || canvasHeight < 60 || canvasHeight > 600) {
      throw new Error("LIENZO_DIMENSION_INVALIDA");
    }

    if (!Array.isArray(positions) || !Array.isArray(elements)) {
      throw new Error("EDITOR_PLANO_INVALIDO");
    }

    const normalizedTables = positions.map((item) => ({
      mesa_id: Number(item.tableId),
      x: Number(Number(item.x).toFixed(3)),
      y: Number(Number(item.y).toFixed(3)),
    }));

    normalizedTables.forEach((item) => {
      if (!Number.isInteger(item.mesa_id) || item.mesa_id < 1
          || !Number.isFinite(item.x) || item.x < 0 || item.x > canvasWidth
          || !Number.isFinite(item.y) || item.y < 0 || item.y > canvasHeight) {
        throw new Error("PLANO_POSICION_INVALIDA");
      }
    });

    const normalizedElements = elements.map((item) => ({
      id: Number(item.id),
      x: Number(Number(item.x).toFixed(3)),
      y: Number(Number(item.y).toFixed(3)),
      ancho: Number(Number(item.width).toFixed(3)),
      alto: Number(Number(item.height).toFixed(3)),
    }));

    normalizedElements.forEach((item) => {
      if (!Number.isInteger(item.id) || item.id < 1
          || !Number.isFinite(item.x)
          || !Number.isFinite(item.y)
          || !Number.isFinite(item.ancho) || item.ancho < 3 || item.ancho > 300
          || !Number.isFinite(item.alto) || item.alto < 3 || item.alto > 300
          || item.x - item.ancho / 2 < 0
          || item.y - item.alto / 2 < 0
          || item.x + item.ancho / 2 > canvasWidth
          || item.y + item.alto / 2 > canvasHeight) {
        throw new Error("ELEMENTO_PLANO_POSICION_INVALIDA");
      }
    });

    if (!motive || motive.length > 1000) {
      throw new Error("MOTIVO_INVALIDO");
    }

    const { data, error } = await getClient().rpc(RPC.saveAdvancedPlan, {
      p_ancho: Number(canvasWidth.toFixed(3)),
      p_alto: Number(canvasHeight.toFixed(3)),
      p_mesas: normalizedTables,
      p_elementos: normalizedElements,
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function listPlanElements() {
    const { data, error } = await getClient().rpc(RPC.listPlanElements);
    if (error) handleError(error);

    const envelope = validateEnvelope(data);
    if (!Array.isArray(envelope.data.items)) fail();

    envelope.data.items.forEach((item) => {
      requireInteger(item.id, { min: 1 });
      requireString(item.tipo);
      requireString(item.nombre);
      if (item.plano_x !== null) requireNumber(item.plano_x);
      if (item.plano_y !== null) requireNumber(item.plano_y);
      requireNumber(item.ancho);
      requireNumber(item.alto);
      requireBoolean(item.activo);
      requireDate(item.version);
    });

    return envelope;
  }

  async function savePlanElements({ elements, reason }) {
    if (!Array.isArray(elements) || !elements.length) {
      throw new Error("ELEMENTOS_PLANO_INVALIDOS");
    }

    const normalized = elements.map((item) => ({
      id: Number(item.id),
      x: Number(Number(item.x).toFixed(3)),
      y: Number(Number(item.y).toFixed(3)),
      ancho: Number(Number(item.width).toFixed(3)),
      alto: Number(Number(item.height).toFixed(3)),
    }));

    normalized.forEach((item) => {
      if (!Number.isInteger(item.id) || item.id < 1
          || !Number.isFinite(item.x) || item.x < 0 || item.x > 100
          || !Number.isFinite(item.y) || item.y < 0 || item.y > 100
          || !Number.isFinite(item.ancho) || item.ancho < 3 || item.ancho > 80
          || !Number.isFinite(item.alto) || item.alto < 3 || item.alto > 80) {
        throw new Error("ELEMENTO_PLANO_POSICION_INVALIDA");
      }
    });

    const motive = String(reason || "").trim();
    if (!motive || motive.length > 1000) {
      throw new Error("MOTIVO_INVALIDO");
    }

    const { data, error } = await getClient().rpc(RPC.savePlanElements, {
      p_elementos: normalized,
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function savePlan({ positions, reason }) {
    if (!Array.isArray(positions) || !positions.length) {
      throw new Error("PLANO_INVALIDO");
    }

    const normalized = positions.map((item) => {
      const tableId = Number(item.tableId);
      const x = Number(item.x);
      const y = Number(item.y);

      if (!Number.isInteger(tableId) || tableId < 1) {
        throw new Error("MESA_INVALIDA");
      }
      if (!Number.isFinite(x) || x < 0 || x > 100
          || !Number.isFinite(y) || y < 0 || y > 100) {
        throw new Error("PLANO_POSICION_INVALIDA");
      }

      return {
        mesa_id: tableId,
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
      };
    });

    const motive = String(reason || "").trim();
    if (!motive || motive.length > 1000) {
      throw new Error("MOTIVO_INVALIDO");
    }

    const { data, error } = await getClient().rpc(RPC.savePlan, {
      p_posiciones: normalized,
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function addTable({
    name = "",
    capacity,
    location = "",
    notes = "",
    reason,
  }) {
    const seats = Number(capacity);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      throw new Error("CAPACIDAD_MESA_INVALIDA");
    }
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");

    const { data, error } = await getClient().rpc(RPC.addTable, {
      p_nombre: String(name || "").trim() || null,
      p_capacidad: seats,
      p_ubicacion: String(location || "").trim() || null,
      p_notas: String(notes || "").trim() || null,
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function deleteTable({ tableId, reason, version }) {
    const id = Number(tableId);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(id) || id < 1) throw new Error("MESA_INVALIDA");
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");
    requireDate(version);

    const { data, error } = await getClient().rpc(RPC.deleteTable, {
      p_mesa_id: id,
      p_motivo: motive,
      p_version: version,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function releaseAll({ reason }) {
    const motive = String(reason || "").trim();
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");

    const { data, error } = await getClient().rpc(RPC.releaseAll, {
      p_motivo: motive,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function moveAssignment({ assignmentId, targetTableId, reason, version }) {
    const assignment = Number(assignmentId);
    const target = Number(targetTableId);
    const motive = String(reason || "").trim();

    if (!Number.isInteger(assignment) || assignment < 1) throw new Error("ASIGNACION_INVALIDA");
    if (!Number.isInteger(target) || target < 1) throw new Error("MESA_INVALIDA");
    if (!motive || motive.length > 1000) throw new Error("MOTIVO_INVALIDO");
    requireDate(version);

    const { data, error } = await getClient().rpc(RPC.moveAssignment, {
      p_asignacion_id: assignment,
      p_mesa_destino_id: target,
      p_motivo: motive,
      p_version: version,
    });

    if (error) handleError(error);
    return validateEnvelope(data);
  }

  window.AdminTablesService = Object.freeze({
    getConfiguration,
    configure,
    getSummary,
    listTables,
    listPending,
    getTableDetail,
    assign,
    removeAssignment,
    getHistory,
    updateTable,
    moveAssignment,
    releaseAll,
    addTable,
    deleteTable,
    savePlan,
    listPlanElements,
    savePlanElements,
    getPlanConfiguration,
    saveAdvancedPlan,
  });
})();