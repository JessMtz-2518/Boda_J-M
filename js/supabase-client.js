/* =========================================================
   CLIENTE PUBLICO DE SUPABASE
   Crea una sola instancia para los servicios de la invitacion.
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
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    return client;
  }

  window.SupabaseClient = Object.freeze({ getClient });
})();
