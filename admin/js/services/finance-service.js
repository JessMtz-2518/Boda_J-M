(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_finanzas_resumen",
    saveBudget: "admin_finanzas_guardar_presupuesto",
    saveVendor: "admin_finanzas_guardar_proveedor",
    deleteVendor: "admin_finanzas_eliminar_proveedor",
    savePayment: "admin_finanzas_guardar_pago",
    deletePayment: "admin_finanzas_eliminar_pago",
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
      throw new Error("La respuesta financiera no tiene el formato esperado.");
    }
    if (value.schema_version !== "1.0" || !value.data) {
      throw new Error("La respuesta financiera no tiene el formato esperado.");
    }
    return value;
  }

  function normalizeVendor(item) {
    return {
      id: Number(item.id),
      name: String(item.nombre || ""),
      category: String(item.categoria || "General"),
      contact: item.contacto ? String(item.contacto) : "",
      phone: item.telefono ? String(item.telefono) : "",
      email: item.correo ? String(item.correo) : "",
      totalCost: Number(item.costo_total || 0),
      status: String(item.estado || "prospecto"),
      notes: item.notas ? String(item.notas) : "",
      paid: Number(item.pagado || 0),
      balance: Number(item.saldo || 0),
      updatedAt: item.fecha_actualizacion ? String(item.fecha_actualizacion) : "",
    };
  }

  function normalizePayment(item) {
    return {
      id: Number(item.id),
      vendorId: item.proveedor_id === null || item.proveedor_id === undefined ? null : Number(item.proveedor_id),
      vendorName: item.proveedor ? String(item.proveedor) : "",
      concept: String(item.concepto || ""),
      amount: Number(item.monto || 0),
      dueDate: String(item.fecha_limite || ""),
      paidDate: item.fecha_pago ? String(item.fecha_pago) : "",
      status: String(item.estado || "pendiente"),
      displayStatus: String(item.estado_visual || item.estado || "pendiente"),
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
        budget: Number(summary.presupuesto_total || 0),
        contracted: Number(summary.contratado || 0),
        paid: Number(summary.pagado || 0),
        pendingPayment: Number(summary.pendiente_pago || 0),
        available: Number(summary.disponible || 0),
        committedPercent: Number(summary.porcentaje_comprometido || 0),
        paidPercent: Number(summary.porcentaje_pagado || 0),
      },
      vendors: Array.isArray(source.proveedores) ? source.proveedores.map(normalizeVendor) : [],
      payments: Array.isArray(source.pagos) ? source.pagos.map(normalizePayment) : [],
    };
  }

  async function saveBudget(total) {
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Captura un presupuesto válido.");
    const { data, error } = await getClient().rpc(RPC.saveBudget, {
      p_presupuesto_total: amount,
    });
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function saveVendor(vendor) {
    const name = String(vendor?.name || "").trim();
    if (!name) throw new Error("El nombre del proveedor es obligatorio.");
    const totalCost = Number(vendor?.totalCost || 0);
    if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error("El costo total no es válido.");

    const payload = {
      p_id: vendor?.id ? Number(vendor.id) : null,
      p_nombre: name,
      p_categoria: String(vendor?.category || "General").trim() || "General",
      p_contacto: String(vendor?.contact || "").trim() || null,
      p_telefono: String(vendor?.phone || "").trim() || null,
      p_correo: String(vendor?.email || "").trim() || null,
      p_costo_total: totalCost,
      p_estado: String(vendor?.status || "prospecto"),
      p_notas: String(vendor?.notes || "").trim() || null,
    };

    const { data, error } = await getClient().rpc(RPC.saveVendor, payload);
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function deleteVendor(id) {
    const { data, error } = await getClient().rpc(RPC.deleteVendor, { p_id: Number(id) });
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function savePayment(payment) {
    const concept = String(payment?.concept || "").trim();
    if (!concept) throw new Error("El concepto del pago es obligatorio.");

    const amount = Number(payment?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto debe ser mayor a cero.");

    if (!payment?.dueDate) throw new Error("La fecha límite es obligatoria.");

    const payload = {
      p_id: payment?.id ? Number(payment.id) : null,
      p_proveedor_id: payment?.vendorId ? Number(payment.vendorId) : null,
      p_concepto: concept,
      p_monto: amount,
      p_fecha_limite: payment.dueDate,
      p_fecha_pago: payment?.paidDate || null,
      p_estado: String(payment?.status || "pendiente"),
      p_notas: String(payment?.notes || "").trim() || null,
    };

    const { data, error } = await getClient().rpc(RPC.savePayment, payload);
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  async function deletePayment(id) {
    const { data, error } = await getClient().rpc(RPC.deletePayment, { p_id: Number(id) });
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  window.AdminFinanceService = Object.freeze({
    getSummary,
    saveBudget,
    saveVendor,
    deleteVendor,
    savePayment,
    deletePayment,
  });
})();
