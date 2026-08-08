/* =========================================================
   GUARD DE AUTORIZACION ADMINISTRATIVA
   La sesion Auth no basta: la RPC valida al administrador.
   ========================================================= */

(() => {
  "use strict";

  function getClient() {
    const client = window.AdminSupabaseClient?.getClient?.();

    if (!client) {
      throw new Error("El cliente administrativo no esta disponible.");
    }

    return client;
  }

  function normalizeAccess(data) {
    const value = Array.isArray(data) ? data[0] : data;

    return {
      authorized: value?.autorizado === true,
      name: value?.nombre || "",
      role: value?.rol || "",
    };
  }

  async function verifyAccess() {
    const { data, error } = await getClient().rpc("admin_verificar_acceso");

    if (error) {
      throw error;
    }

    return normalizeAccess(data);
  }

  async function resolveAccess() {
    const session = await window.AdminAuthService.getSession();

    if (!session) {
      return {
        status: "unauthenticated",
        session: null,
        access: null,
      };
    }

    const access = await verifyAccess();

    return {
      status: access.authorized ? "authorized" : "unauthorized",
      session,
      access,
    };
  }

  window.AdminAuthGuard = Object.freeze({
    resolveAccess,
    verifyAccess,
  });
})();
