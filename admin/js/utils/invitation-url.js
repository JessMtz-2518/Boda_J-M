(() => {
  "use strict";

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function validateToken(token) {
    const value = String(token || "").trim();
    if (!UUID_PATTERN.test(value)) throw new TypeError("El token de invitación no es un UUID válido.");
    return value;
  }

  function getInvitationBaseUrl() {
    const url = new URL(window.location.href);
    let pathname = url.pathname;
    const adminIndex = pathname.indexOf("/admin/");
    if (adminIndex >= 0) pathname = pathname.slice(0, adminIndex + 1);
    else pathname = pathname.replace(/[^/]*$/, "");
    url.pathname = pathname || "/";
    url.search = "";
    url.hash = "";
    return url;
  }

  function buildInvitationUrl(token, options = {}) {
    const url = getInvitationBaseUrl();
    url.searchParams.set("inv", validateToken(token));
    if (options.preview === "admin") url.searchParams.set("preview", "admin");
    return url.toString();
  }

  function openInvitationPreview(token, options = {}) {
    const url = buildInvitationUrl(token, options);
    const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!previewWindow) throw new Error("El navegador bloqueó la nueva pestaña.");
    return url;
  }

  async function copyInvitationUrl(token) {
    const url = buildInvitationUrl(token);
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("No fue posible copiar el enlace.");
    }
    return url;
  }

  window.AdminInvitationUrl = Object.freeze({ buildInvitationUrl, copyInvitationUrl, getInvitationBaseUrl, openInvitationPreview, validateToken });
})();
