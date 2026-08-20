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

  async function getUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async function updateDisplayName(name) {
    const displayName = String(name || "").trim();
    if (!displayName || displayName.length > 120) {
      throw new Error("NOMBRE_CUENTA_INVALIDO");
    }

    const { data, error } = await getClient().auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw error;
    return data.user || null;
  }

  async function updateEmail(email) {
    const nextEmail = String(email || "").trim();
    if (!nextEmail) throw new Error("CORREO_CUENTA_INVALIDO");

    const { data, error } = await getClient().auth.updateUser({
      email: nextEmail,
    });
    if (error) throw error;
    return data.user || null;
  }

  async function updatePassword(password) {
    const nextPassword = String(password || "");
    if (nextPassword.length < 8) {
      throw new Error("CONTRASENA_CUENTA_CORTA");
    }

    const { data, error } = await getClient().auth.updateUser({
      password: nextPassword,
    });
    if (error) throw error;
    return data.user || null;
  }

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange((event, session) => {
      callback({ event, session });
    });
  }

  window.AdminAuthService = Object.freeze({
    getSession,
    getUser,
    onAuthStateChange,
    signIn,
    signOut,
    updateDisplayName,
    updateEmail,
    updatePassword,
  });
})();
