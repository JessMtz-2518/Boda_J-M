(() => {
  "use strict";
  function render(container, token) {
    if (!(container instanceof Element)) throw new TypeError("El contenedor QR no es válido.");
    if (typeof window.QRCode !== "function") throw new Error("La dependencia QRCode no está disponible.");
    const url = window.AdminInvitationUrl.buildInvitationUrl(token);
    container.replaceChildren();
    new window.QRCode(container, { text: url, width: 220, height: 220, colorDark: "#303a2a", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.H });
    return url;
  }
  window.AdminQrCode = Object.freeze({ render });
})();
