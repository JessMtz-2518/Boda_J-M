(() => {
  "use strict";
  const button = (text, className = "guest-action") => { const el = document.createElement("button"); el.type = "button"; el.className = className; el.textContent = text; return el; };

  function createQrDialog(guest) {
    const dialog = document.createElement("dialog"); dialog.className = "qr-dialog";
    const content = document.createElement("div"); content.className = "qr-dialog-content";
    const title = document.createElement("h3"); title.textContent = `QR de ${guest.name}`;
    const canvas = document.createElement("div"); canvas.className = "qr-canvas";
    const close = button("Cerrar", "admin-button admin-button-secondary"); close.addEventListener("click", () => dialog.close());
    content.append(title, canvas, close); dialog.append(content); document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    window.AdminQrCode.render(canvas, guest.token); dialog.showModal();
  }

  function create(guest, options = {}) {
    window.AdminInvitationUrl.validateToken(guest.token);
    const root = document.createElement("div"); root.className = "guest-actions";
    const status = options.statusElement;
    const report = (message) => { if (status) status.textContent = message; };
    const preview = button("Vista previa"); preview.addEventListener("click", () => { try { window.AdminInvitationUrl.openInvitationPreview(guest.token); report("Vista previa abierta."); } catch (error) { report(error.message); } });
    const copy = button("Copiar enlace", "guest-action guest-action-secondary"); copy.addEventListener("click", async () => { try { await window.AdminInvitationUrl.copyInvitationUrl(guest.token); report("Enlace copiado."); } catch (error) { report(error.message); } });
    const qr = button("Generar QR", "guest-action guest-action-secondary"); qr.addEventListener("click", () => { try { createQrDialog(guest); report("QR generado con la URL canónica."); } catch (error) { report(error.message); } });
    const whatsapp = button("WhatsApp", "guest-action guest-action-secondary"); whatsapp.addEventListener("click", () => { try { window.AdminWhatsApp.shareInvitation(guest.token); report("WhatsApp abierto."); } catch (error) { report(error.message); } });
    const more = document.createElement("div"); more.className = "guest-more";
    const moreButton = button("Más", "guest-action guest-action-secondary"); moreButton.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div"); menu.className = "guest-more-menu"; menu.hidden = true;
    ["Enviar por correo", "Descargar invitación en PDF"].forEach((label) => { const item = button(label); item.disabled = true; menu.appendChild(item); });
    const test = button("Modo prueba"); test.addEventListener("click", () => { try { window.AdminInvitationUrl.openInvitationPreview(guest.token, { preview: "admin" }); report("Modo prueba abierto."); } catch (error) { report(error.message); } }); menu.appendChild(test);
    moreButton.addEventListener("click", () => { menu.hidden = !menu.hidden; moreButton.setAttribute("aria-expanded", String(!menu.hidden)); });
    more.append(moreButton, menu); root.append(preview, copy, qr, whatsapp, more); return root;
  }
  window.AdminGuestActions = Object.freeze({ create });
})();
