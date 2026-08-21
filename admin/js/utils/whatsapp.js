(() => {
  "use strict";

  function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || "";
    const touch = navigator.maxTouchPoints || 0;
    return /Android|iPhone|iPad|iPod/i.test(ua) || touch > 1;
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/[^\d]/g, "");
  }

  function buildPassText(adults = 0, children = 0) {
    const adultCount = Number(adults) || 0;
    const childCount = Number(children) || 0;
    const parts = [];

    if (adultCount > 0) {
      parts.push(`${adultCount} ${adultCount === 1 ? "adulto" : "adultos"}`);
    }

    if (childCount > 0) {
      parts.push(`${childCount} ${childCount === 1 ? "niño" : "niños"}`);
    }

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

  function buildAppUrl(phone, text) {
    const normalizedPhone = normalizePhone(phone);
    const query = new URLSearchParams();

    if (normalizedPhone) query.set("phone", normalizedPhone);
    if (text) query.set("text", text);

    return `whatsapp://send?${query.toString()}`;
  }

  function buildWebUrl(phone, text) {
    const normalizedPhone = normalizePhone(phone);
    const encoded = encodeURIComponent(text || "");

    if (normalizedPhone) {
      return `https://wa.me/${normalizedPhone}?text=${encoded}`;
    }

    return `https://wa.me/?text=${encoded}`;
  }

  function buildWhatsAppUrl(token, options = {}) {
    const invitationUrl = window.AdminInvitationUrl.buildInvitationUrl(token);
    const message = options.message || buildMessage(invitationUrl, options);
    return buildWebUrl(options.phone, message);
  }

  function openWhatsApp({ phone = "", text = "" } = {}) {
    const webUrl = buildWebUrl(phone, text);

    if (!isMobileDevice()) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
      return webUrl;
    }

    // En móvil intentamos abrir directamente la app.
    // Si la app no responde, usamos el enlace web como respaldo.
    const appUrl = buildAppUrl(phone, text);
    const startedAt = Date.now();
    let fallbackTimer = null;

    const cancelFallback = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) cancelFallback();
    };

    document.addEventListener("visibilitychange", handleVisibility, { once: true });

    window.location.href = appUrl;

    fallbackTimer = setTimeout(() => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (Date.now() - startedAt < 2500 && !document.hidden) {
        window.location.href = webUrl;
      }
    }, 1400);

    return webUrl;
  }

  function shareInvitation(token, options = {}) {
    if (!window.AdminInvitationUrl?.buildInvitationUrl) {
      throw new Error("No fue posible construir el enlace de invitación.");
    }

    const invitationUrl = window.AdminInvitationUrl.buildInvitationUrl(token);
    const message = options.message || buildMessage(invitationUrl, options);

    openWhatsApp({
      phone: options.phone || "",
      text: message,
    });

    return buildWebUrl(options.phone, message);
  }

  window.AdminWhatsApp = Object.freeze({
    isMobileDevice,
    normalizePhone,
    buildPassText,
    buildMessage,
    buildAppUrl,
    buildWebUrl,
    buildWhatsAppUrl,
    openWhatsApp,
    shareInvitation,
  });
})();
