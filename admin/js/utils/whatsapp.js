(() => {
  "use strict";
  function buildMessage(url, customMessage) {
    return customMessage || `Hola, te compartimos la invitación de nuestra boda.\nPuedes verla y confirmar tu asistencia aquí:\n${url}`;
  }
  function buildWhatsAppUrl(token, options = {}) {
    const invitationUrl = window.AdminInvitationUrl.buildInvitationUrl(token);
    const message = buildMessage(invitationUrl, options.message);
    const phone = String(options.phone || "").replace(/\D/g, "");
    const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(message)}`;
  }
  function shareInvitation(token, options = {}) {
    const url = buildWhatsAppUrl(token, options);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) throw new Error("El navegador bloqueó WhatsApp.");
    return url;
  }
  window.AdminWhatsApp = Object.freeze({ buildMessage, buildWhatsAppUrl, shareInvitation });
})();
