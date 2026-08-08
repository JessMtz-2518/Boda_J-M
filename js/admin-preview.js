(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const token = (params.get("inv") || "").trim();
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (params.get("preview") !== "admin" || !UUID_PATTERN.test(token)) return;

  function normalizeAccess(data) {
    const value = Array.isArray(data) ? data[0] : data;
    return value?.autorizado === true;
  }

  function abbreviatedToken(value) {
    return `${value.slice(0, 8)}…${value.slice(-4)}`;
  }

  function buildAdminUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "#/invitados";
    url.pathname = `${url.pathname.replace(/[^/]*$/, "")}admin/`;
    return url.toString();
  }

  function appendText(parent, className, text) {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
  }

  function renderBar(invitation) {
    const bar = document.createElement("aside");
    bar.className = "admin-preview-bar";
    bar.setAttribute("aria-label", "Controles de vista previa administrativa");
    const identity = document.createElement("div");
    identity.className = "admin-preview-bar__identity";
    appendText(identity, "admin-preview-bar__label", "MODO VISTA PREVIA");
    appendText(identity, "admin-preview-bar__guest", String(invitation?.nombre || "Invitado"));
    appendText(identity, "admin-preview-bar__meta", `Código: ${String(invitation?.codigo || "No disponible")} · Token: ${abbreviatedToken(token)}`);
    const actions = document.createElement("div"); actions.className = "admin-preview-bar__actions";
    const back = document.createElement("a"); back.href = buildAdminUrl(); back.textContent = "Volver al panel";
    const hide = document.createElement("button"); hide.type = "button"; hide.textContent = "Ocultar barra"; hide.addEventListener("click", () => { bar.hidden = true; });
    actions.append(back, hide); bar.append(identity, actions); document.body.appendChild(bar);
  }

  async function initialize() {
    try {
      const config = window.SUPABASE_CONFIG;
      if (!config?.url || !config?.publishableKey || typeof window.supabase?.createClient !== "function") return;
      const authClient = window.supabase.createClient(config.url, config.publishableKey, { auth: { autoRefreshToken: true, detectSessionInUrl: false, persistSession: true, storageKey: "boda-jm-admin-auth" } });
      const { data: sessionData, error: sessionError } = await authClient.auth.getSession();
      if (sessionError || !sessionData.session) return;
      const { data: accessData, error: accessError } = await authClient.rpc("admin_verificar_acceso");
      if (accessError || !normalizeAccess(accessData)) return;
      const invitation = await window.InvitadosService?.obtenerInvitacion?.(token);
      if (!invitation) return;
      renderBar(invitation);
    } catch (error) {
      console.warn("Vista previa administrativa no disponible.", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
