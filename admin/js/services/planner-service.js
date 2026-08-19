(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_planner_resumen",
    save: "admin_planner_guardar_tarea",
    remove: "admin_planner_eliminar_tarea",
  });

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
      message.includes("acceso_administrativo_no_autorizado");
  }

  function handleError(error) {
    if (isSessionError(error)) {
      window.dispatchEvent(new CustomEvent("admin:session-expired"));
    }
    throw error;
  }

  function validateEnvelope(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("La respuesta de Planeación no tiene el formato esperado.");
    }
    if (value.schema_version !== "1.0" || !value.data) {
      throw new Error("La respuesta de Planeación no tiene el formato esperado.");
    }
    return value;
  }

  function normalizeTask(item) {
    return {
      id: Number(item.id),
      title: String(item.titulo || ""),
      category: String(item.categoria || "General"),
      responsible: item.responsable ? String(item.responsable) : "",
      dueDate: item.fecha_limite ? String(item.fecha_limite) : "",
      priority: String(item.prioridad || "media"),
      status: String(item.estado || "pendiente"),
      notes: item.notas ? String(item.notas) : "",
      updatedAt: item.fecha_actualizacion ? String(item.fecha_actualizacion) : "",
    };
  }

  async function getSummary() {
    const { data, error } = await getClient().rpc(RPC.summary);
    if (error) handleError(error);
    const envelope = validateEnvelope(data);
    const source = envelope.data;
    const summary = source.resumen || {};
    return {
      generatedAt: envelope.generated_at,
      summary: {
        total: Number(summary.total || 0),
        pending: Number(summary.pendientes || 0),
        inProgress: Number(summary.en_proceso || 0),
        completed: Number(summary.completadas || 0),
        overdue: Number(summary.vencidas || 0),
        progress: Number(summary.porcentaje_completado || 0),
      },
      tasks: Array.isArray(source.items) ? source.items.map(normalizeTask) : [],
    };
  }

  async function saveTask(task) {
    const title = String(task?.title || "").trim();
    if (!title || title.length > 180) throw new Error("El título es obligatorio.");
    const payload = {
      p_id: task.id ? Number(task.id) : null,
      p_titulo: title,
      p_categoria: String(task.category || "General").trim() || "General",
      p_responsable: String(task.responsible || "").trim() || null,
      p_fecha_limite: task.dueDate || null,
      p_prioridad: task.priority || "media",
      p_estado: task.status || "pendiente",
      p_notas: String(task.notes || "").trim() || null,
    };
    const { data, error } = await getClient().rpc(RPC.save, payload);
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function deleteTask(id) {
    const { data, error } = await getClient().rpc(RPC.remove, { p_id: Number(id) });
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  window.AdminPlannerService = Object.freeze({
    getSummary,
    saveTask,
    deleteTask,
  });
})();
