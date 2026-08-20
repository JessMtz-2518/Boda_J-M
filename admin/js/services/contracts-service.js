(() => {
  "use strict";

  const RPC = Object.freeze({
    summary: "admin_contratos_resumen",
    save: "admin_contratos_guardar",
  });

  function getClient() {
    const client = window.AdminSupabaseClient?.getClient?.();
    if (!client) throw new Error("El cliente administrativo no está disponible.");
    return client;
  }

  function isSessionError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    const message = String(error?.message || "").toLowerCase();
    return status === 401 || status === 403 || error?.code === "PGRST301" ||
      message.includes("jwt") || message.includes("session") ||
      message.includes("acceso_administrativo_no_autorizado");
  }

  function handleError(error) {
    if (isSessionError(error)) {
      window.dispatchEvent(new CustomEvent("admin:session-expired"));
    }
    throw error;
  }

  function validateEnvelope(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.schema_version !== "1.0" || !value.data) {
      throw new Error("La respuesta de contratos no tiene el formato esperado.");
    }
    return value;
  }

  function normalize(item) {
    return {
      vendorId: Number(item.proveedor_id),
      vendorName: String(item.proveedor || ""),
      category: String(item.categoria || "General"),
      contact: item.contacto ? String(item.contacto) : "",
      phone: item.telefono ? String(item.telefono) : "",
      email: item.correo ? String(item.correo) : "",
      totalCost: Number(item.costo_total || 0),
      vendorStatus: String(item.estado_proveedor || "prospecto"),
      contractId: item.contrato_id === null || item.contrato_id === undefined ? null : Number(item.contrato_id),
      status: String(item.estado_contrato || "sin_contrato"),
      signedDate: item.fecha_firma ? String(item.fecha_firma) : "",
      signatureDueDate: item.fecha_limite_firma ? String(item.fecha_limite_firma) : "",
      validUntil: item.fecha_vigencia ? String(item.fecha_vigencia) : "",
      conditions: item.condiciones ? String(item.condiciones) : "",
      cancellationPolicy: item.politica_cancelacion ? String(item.politica_cancelacion) : "",
      notes: item.notas_contrato ? String(item.notas_contrato) : "",
      paidTotal: Number(item.pagado_total || 0),
      advancePaid: Number(item.anticipo_pagado || 0),
      balance: Number(item.saldo_pendiente || 0),
      nextPaymentDate: item.proximo_pago_fecha ? String(item.proximo_pago_fecha) : "",
      nextPaymentAmount: Number(item.proximo_pago_monto || 0),
      nextPaymentConcept: item.proximo_pago_concepto ? String(item.proximo_pago_concepto) : "",
      nextPaymentOverdue: Boolean(item.proximo_pago_vencido),
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
        totalVendors: Number(summary.total_proveedores || 0),
        signed: Number(summary.firmados || 0),
        reviewing: Number(summary.en_revision || 0),
        awaitingSignature: Number(summary.por_firmar || 0),
        withoutContract: Number(summary.sin_contrato || 0),
        notRequired: Number(summary.no_requiere || 0),
      },
      contracts: Array.isArray(source.contratos) ? source.contratos.map(normalize) : [],
    };
  }

  async function saveContract(contract) {
    const vendorId = Number(contract?.vendorId);
    if (!Number.isFinite(vendorId) || vendorId <= 0) throw new Error("Selecciona un proveedor válido.");

    const payload = {
      p_proveedor_id: vendorId,
      p_estado: String(contract?.status || "sin_contrato"),
      p_fecha_firma: contract?.signedDate || null,
      p_fecha_limite_firma: contract?.signatureDueDate || null,
      p_fecha_vigencia: contract?.validUntil || null,
      p_condiciones: String(contract?.conditions || "").trim() || null,
      p_politica_cancelacion: String(contract?.cancellationPolicy || "").trim() || null,
      p_notas: String(contract?.notes || "").trim() || null,
    };

    const { data, error } = await getClient().rpc(RPC.save, payload);
    if (error) handleError(error);
    return validateEnvelope(data);
  }

  window.AdminContractsService = Object.freeze({ getSummary, saveContract });
})();
