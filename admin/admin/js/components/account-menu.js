(() => {
  "use strict";

  let initialized = false;

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function button(text, primary = false) {
    const node = el("button", primary ? "admin-button" : "admin-button admin-button-secondary", text);
    node.type = "button";
    return node;
  }

  function friendlyError(error) {
    const message = String(error?.message || "");
    if (message.includes("NOMBRE_CUENTA_INVALIDO")) return "Escribe un nombre válido.";
    if (message.includes("CORREO_CUENTA_INVALIDO")) return "Escribe un correo válido.";
    if (message.includes("CONTRASENA_CUENTA_CORTA")) return "La contraseña debe tener al menos 8 caracteres.";
    if (/same password/i.test(message)) return "La nueva contraseña debe ser diferente a la actual.";
    if (/already registered|already been registered/i.test(message)) return "Ese correo ya está registrado.";
    if (/email.*rate/i.test(message)) return "Espera un momento antes de solicitar otro cambio de correo.";
    return message || "No fue posible actualizar la cuenta. Intenta nuevamente.";
  }

  function closeModal(overlay) {
    overlay.remove();
    document.body.classList.remove("admin-account-modal-open");
  }

  function field(label, input, helper = "") {
    const wrap = el("label", "admin-account-field");
    wrap.append(el("span", "", label), input);
    if (helper) wrap.append(el("small", "", helper));
    return wrap;
  }

  async function currentAccount() {
    const user = await window.AdminAuthService.getUser();
    return {
      user,
      name: String(user?.user_metadata?.display_name || document.querySelector("#adminName")?.textContent || "").trim(),
      email: String(user?.email || "").trim(),
    };
  }

  function openAccountModal(onUpdated) {
    const overlay = el("div", "admin-account-modal-overlay");
    const modal = el("section", "admin-account-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "adminAccountTitle");

    const head = el("header", "admin-account-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "MI CUENTA"),
      el("h2", "", "Cuenta de administrador")
    );
    copy.querySelector("h2").id = "adminAccountTitle";
    const close = button("Cerrar");
    head.append(copy, close);

    const loading = el("p", "admin-account-status", "Cargando cuenta…");
    const body = el("div", "admin-account-modal-body");
    body.append(loading);
    modal.append(head, body);
    overlay.append(modal);
    document.body.append(overlay);
    document.body.classList.add("admin-account-modal-open");

    close.onclick = () => closeModal(overlay);

    (async () => {
      try {
        const account = await currentAccount();
        const name = document.createElement("input");
        name.maxLength = 120;
        name.value = account.name;

        const email = document.createElement("input");
        email.type = "email";
        email.autocomplete = "email";
        email.value = account.email;

        const newPassword = document.createElement("input");
        newPassword.type = "password";
        newPassword.autocomplete = "new-password";
        newPassword.placeholder = "Mínimo 8 caracteres";

        const confirmPassword = document.createElement("input");
        confirmPassword.type = "password";
        confirmPassword.autocomplete = "new-password";
        confirmPassword.placeholder = "Repite la nueva contraseña";

        const general = el("section", "admin-account-section");
        general.append(
          el("h3", "", "Datos de la cuenta"),
          field("Nombre", name),
          field(
            "Correo electrónico",
            email,
            "Si cambias tu correo, recibirás un enlace de confirmación para validar la nueva dirección."
          )
        );

        const security = el("section", "admin-account-section");
        security.append(
          el("h3", "", "Cambiar contraseña"),
          field("Nueva contraseña", newPassword),
          field("Confirmar contraseña", confirmPassword)
        );

        const status = el("p", "admin-account-status");
        status.setAttribute("role", "status");
        const actions = el("div", "admin-account-modal-actions");
        const cancel = button("Cancelar");
        const save = button("Guardar cambios", true);
        actions.append(cancel, save);

        body.replaceChildren(general, security, status, actions);

        cancel.onclick = () => closeModal(overlay);

        save.onclick = async () => {
          const nextName = name.value.trim();
          const nextEmail = email.value.trim();
          const password = newPassword.value;
          const confirmation = confirmPassword.value;

          if (!nextName) {
            status.textContent = "Escribe tu nombre.";
            name.focus();
            return;
          }
          if (!email.reportValidity()) return;
          if (password && password !== confirmation) {
            status.textContent = "Las contraseñas no coinciden.";
            confirmPassword.focus();
            return;
          }

          save.disabled = true;
          cancel.disabled = true;
          close.disabled = true;
          status.textContent = "Guardando cambios…";

          try {
            let nameChanged = false;
            let emailChanged = false;
            let passwordChanged = false;

            if (nextName !== account.name) {
              await window.AdminAuthService.updateDisplayName(nextName);
              nameChanged = true;
            }

            if (nextEmail && nextEmail !== account.email) {
              await window.AdminAuthService.updateEmail(nextEmail);
              emailChanged = true;
            }

            if (password) {
              await window.AdminAuthService.updatePassword(password);
              passwordChanged = true;
            }

            if (nameChanged) {
              const nameNode = document.querySelector("#adminName");
              if (nameNode) nameNode.textContent = nextName;
            }

            if (typeof onUpdated === "function") {
              await onUpdated();
            }

            if (emailChanged) {
              status.textContent = "Cambio solicitado. Revisa tu correo para confirmar la nueva dirección.";
            } else if (nameChanged || passwordChanged) {
              status.textContent = "Cuenta actualizada correctamente.";
            } else {
              status.textContent = "No realizaste cambios.";
            }

            newPassword.value = "";
            confirmPassword.value = "";

            setTimeout(() => closeModal(overlay), emailChanged ? 2200 : 1100);
          } catch (error) {
            console.error("Actualizar cuenta:", error);
            status.textContent = friendlyError(error);
            save.disabled = false;
            cancel.disabled = false;
            close.disabled = false;
          }
        };
      } catch (error) {
        console.error("Cuenta:", error);
        loading.textContent = "No fue posible consultar la cuenta.";
      }
    })();
  }

  async function syncAccountCopy(nameNode, emailNode) {
    try {
      const account = await currentAccount();
      if (account.name && nameNode) nameNode.textContent = account.name;
      if (emailNode) emailNode.textContent = account.email || "Correo no disponible";
    } catch (error) {
      console.error("Sincronizar cuenta:", error);
    }
  }

  function init() {
    if (initialized) return;

    const trigger = document.querySelector("#adminAccountButton");
    const menu = document.querySelector("#adminAccountMenu");
    const nameNode = document.querySelector("#adminName");
    const emailNode = document.querySelector("#adminAccountEmail");
    const edit = document.querySelector("#adminEditAccountButton");

    if (!trigger || !menu || !edit) return;
    initialized = true;

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    function toggleMenu() {
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      if (open) syncAccountCopy(nameNode, emailNode);
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    edit.addEventListener("click", () => {
      closeMenu();
      openAccountModal(() => syncAccountCopy(nameNode, emailNode));
    });

    document.addEventListener("click", (event) => {
      if (!menu.hidden && !event.target.closest(".admin-account-wrap")) closeMenu();
    });

    window.addEventListener("admin:access-ready", () => syncAccountCopy(nameNode, emailNode));

    syncAccountCopy(nameNode, emailNode);
  }

  window.AdminAccountMenu = Object.freeze({ init });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();