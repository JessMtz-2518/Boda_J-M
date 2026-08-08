(() => {
  "use strict";

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function buildPassText(adults = 0, children = 0) {
    const adultCount = Number(adults) || 0;
    const childCount = Number(children) || 0;
    const parts = [];
    if (adultCount > 0) parts.push(`${adultCount} ${adultCount === 1 ? "adulto" : "adultos"}`);
    if (childCount > 0) parts.push(`${childCount} ${childCount === 1 ? "niño" : "niños"}`);
    return parts.length ? `[Pase para ${parts.join(" y ")}]` : "[Pase personalizado]";
  }

  function buildMessage(url, options = {}) {
    const name = String(options.name || "").trim();
    const pass = buildPassText(options.adults, options.children);
    const greetingName = name ? `${name}\n\n` : "";
    const EMOJIS = Object.freeze({
      ring: "\uD83D\uDC8D",
      gift: "\uD83C\uDF81",
      sparkle: "\u2728",
      hearts: "\uD83D\uDC95",
    });
    return `${greetingName}${pass}\n\n¡Queridos Familiares y Amigos! ${EMOJIS.ring}\n\nNos complace invitarlos a celebrar con nosotros uno de los días más importantes de nuestras vidas: ¡Nuestra Boda!\n\n${EMOJIS.gift} Para conocer todos los detalles de nuestra celebración y confirmar su asistencia, visiten:\n\n${url}\n\n${EMOJIS.sparkle} Su presencia es el mejor regalo que podemos recibir. Esperamos compartir este momento tan especial junto a ustedes.\n\nCon todo nuestro amor,\nJessica & Marcos ${EMOJIS.hearts}`;
  }

  function buildWhatsAppUrl(token, options = {}) {
    const invitationUrl = window.AdminInvitationUrl.buildInvitationUrl(token);
    const message = options.message || buildMessage(invitationUrl, options);
    const phone = normalizePhone(options.phone);
    const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(message)}`;
  }

  function shareInvitation(token, options = {}) {
    const url = buildWhatsAppUrl(token, options);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return url;
  }

  window.AdminWhatsApp = Object.freeze({ buildMessage, buildPassText, buildWhatsAppUrl, normalizePhone, shareInvitation });
})();
