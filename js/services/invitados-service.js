/* =========================================================
   SERVICIO DE INVITADOS
   Unico punto de acceso del RSVP a las funciones RPC.
   ========================================================= */

(() => {
  "use strict";

  function getClient() {
    const client = window.SupabaseClient?.getClient?.();

    if (!client) {
      throw new Error("El cliente de Supabase no esta disponible.");
    }

    return client;
  }

  function unwrapRpcData(data) {
    if (Array.isArray(data)) {
      return data[0] || null;
    }

    return data || null;
  }

  async function obtenerInvitacion(tokenAcceso) {
    const { data, error } = await getClient().rpc("obtener_invitacion", {
      p_token: tokenAcceso,
    });

    if (error) {
      throw new Error(error.message || "No fue posible consultar la invitacion.");
    }

    return unwrapRpcData(data);
  }

  async function guardarConfirmacion({
    tokenAcceso,
    adultos,
    ninos,
    mensaje,
  }) {
    const { data, error } = await getClient().rpc("guardar_confirmacion", {
      p_token: tokenAcceso,
      p_adultos: adultos,
      p_ninos: ninos,
      p_mensaje: mensaje || null,
    });

    if (error) {
      throw new Error(error.message || "No fue posible guardar la confirmacion.");
    }

    return unwrapRpcData(data);
  }

  window.InvitadosService = Object.freeze({
    guardarConfirmacion,
    obtenerInvitacion,
  });
})();
