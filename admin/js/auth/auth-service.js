/* =========================================================
   SERVICIO DE AUTENTICACION ADMINISTRATIVA
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

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();

    if (error) {
      throw error;
    }

    return data.session || null;
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    return data.session || null;
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut({ scope: "local" });

    if (error) {
      throw error;
    }
  }

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange((event, session) => {
      callback({ event, session });
    });
  }

  window.AdminAuthService = Object.freeze({
    getSession,
    onAuthStateChange,
    signIn,
    signOut,
  });
})();
