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

  function openWhatsApp({ phone = "", text = "" } = {}) {
    const webUrl = buildWebUrl(phone, text);

    if (!isMobileDevice()) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
      return;
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
  }

  window.AdminWhatsApp = Object.freeze({
    isMobileDevice,
    normalizePhone,
    buildAppUrl,
    buildWebUrl,
    openWhatsApp,
  });
})();