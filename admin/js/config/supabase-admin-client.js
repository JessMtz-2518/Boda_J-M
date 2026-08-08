/* =========================================================
   CLIENTE SUPABASE DEL PANEL ADMINISTRATIVO
   Mantiene una sesion Auth separada del RSVP publico.
   ========================================================= */

(() => {
  "use strict";

  let client = null;

  function getClient() {
    if (client) {
      return client;
    }

    const config = window.SUPABASE_CONFIG;
    const factory = window.supabase?.createClient;

    if (!config?.url || !config?.publishableKey) {
      throw new Error("La configuracion publica de Supabase esta incompleta.");
    }

    if (typeof factory !== "function") {
      throw new Error("No fue posible cargar el cliente de Supabase.");
    }

    client = factory(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
        storageKey: "boda-jm-admin-auth",
      },
    });

    return client;
  }

  window.AdminSupabaseClient = Object.freeze({ getClient });
})();
