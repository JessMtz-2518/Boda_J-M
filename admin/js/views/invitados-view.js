(() => {
  "use strict";

  const DEBOUNCE_MS = 350;
  const GROUPS = ["Familia Marcos", "Familia Jess", "Amigos Marcos", "Amigos Jess"];
  const stateLabels = Object.freeze({ pendiente: "Pendiente", asistira: "Asistirá", no_asistira: "No asistirá" });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function selectField(labelText, entries, className = "guest-filter-field") {
    const label = element("label", className);
    label.append(element("span", "", labelText));
    const select = document.createElement("select");
    entries.forEach(([value, label]) => select.append(option(value, label)));
    label.append(select);
    return { field: label, select };
  }

  function actionButton(label, primary = false) {
    const button = element("button", `guest-directory-action${primary ? " guest-directory-action-primary" : ""}`, label);
    button.type = "button";
    return button;
  }

  function overviewMetric(label, value = "—", detail = "Cargando…") {
    const card = element("article", "tables-metric");
    const valueNode = element("strong", "tables-metric-value", value);
    const detailNode = element("span", "tables-metric-detail", detail);
    card.append(element("span", "tables-metric-label", label), valueNode, detailNode);
    return { card, valueNode, detailNode };
  }

  function textField(labelText, input) {
    const label = element("label", "guest-editor-field");
    label.append(element("span", "", labelText), input);
    return label;
  }

  function errorText(error) {
    const message = String(error?.message || "");
    if (message.includes("CUPO_ADULTOS_MENOR_A_CONFIRMACION")) return "Los adultos asignados no pueden ser menores que los adultos ya confirmados.";
    if (message.includes("CUPO_NINOS_MENOR_A_CONFIRMACION")) return "Los niños asignados no pueden ser menores que los niños ya confirmados.";
    if (message.includes("REGISTRO_DESACTUALIZADO")) return "Este invitado fue modificado en otra sesión. Cierra esta ventana y vuelve a cargar sus datos antes de intentar nuevamente.";
    if (message.includes("TELEFONO_INVALIDO")) return "El teléfono no tiene un formato válido.";
    if (message.includes("NOMBRE_INVALIDO")) return "Revisa el nombre del invitado.";
    if (message.includes("MOTIVO_INVALIDO")) return "Escribe un motivo para registrar el cambio.";
    if (message.includes("NOTAS_DEMASIADO_LARGAS")) return "Las notas no pueden exceder 1000 caracteres.";
    if (message.includes("GRUPO_INVALIDO")) return "Selecciona un grupo válido.";
    if (message.includes("CUPO_CERO_NO_PERMITIDO") || message.includes("CUPO_INVALIDO")) return "Asigna al menos una persona y verifica los cupos.";
    if (message.includes("CONSECUTIVO_AGOTADO")) return "Este grupo ya no tiene códigos disponibles.";
    if (message.includes("CODIGO_DUPLICADO")) return "No fue posible generar un código único. Intenta nuevamente.";
    return "No fue posible guardar los cambios. Revisa los datos e intenta nuevamente.";
  }

  async function validateTableCapacity(additionalSeats) {
    const delta = Number(additionalSeats) || 0;
    if (delta <= 0) return { ok: true };

    if (!window.AdminTablesService?.getConfiguration) {
      return {
        ok: false,
        message: "No fue posible validar la capacidad de las mesas. Intenta nuevamente."
      };
    }

    try {
      const envelope = await window.AdminTablesService.getConfiguration();
      const config = envelope?.data || {};

      // Si todavía no se ha configurado Mesas, no bloqueamos el alta.
      if (!config.configurado) return { ok: true };

      const current = Number(config.cupo_invitados_activos) || 0;
      const capacity = Number(config.capacidad_total_actual) || 0;
      const projected = current + delta;

      if (projected <= capacity) return { ok: true };

      const missing = projected - capacity;
      return {
        ok: false,
        missing,
        current,
        capacity,
        projected,
        message: `No hay suficientes lugares en las mesas para este cambio. Necesitas aumentar la capacidad en ${missing} ${missing === 1 ? "lugar" : "lugares"} antes de continuar. Ve a Mesas y agrega lugares o una mesa.`
      };
    } catch (error) {
      console.error("Validación de capacidad de mesas:", error);
      return {
        ok: false,
        message: "No fue posible validar la capacidad de las mesas. Intenta nuevamente."
      };
    }
  }

  function counterField(labelText, initialValue, minimum = 0) {
    const wrapper = element("div", "guest-editor-counter-field");
    wrapper.append(element("span", "guest-editor-label", labelText));
    const counter = element("div", "guest-editor-counter");
    const minus = actionButton("−");
    const value = element("output", "guest-editor-counter-value", String(initialValue));
    const plus = actionButton("+");
    value.setAttribute("aria-live", "polite");
    let current = Number(initialValue) || 0;

    function refresh() {
      value.textContent = String(current);
      minus.disabled = current <= minimum;
    }
    minus.setAttribute("aria-label", `Disminuir ${labelText.toLowerCase()}`);
    plus.setAttribute("aria-label", `Aumentar ${labelText.toLowerCase()}`);
    minus.addEventListener("click", () => { if (current > minimum) { current -= 1; refresh(); } });
    plus.addEventListener("click", () => { current += 1; refresh(); });
    refresh();
    counter.append(minus, value, plus);
    wrapper.append(counter);
    return { field: wrapper, getValue: () => current };
  }

  function openEditor(detail, { onSaved, setFeedback }) {
    const previousFocus = document.activeElement;
    const overlay = element("div", "guest-editor-overlay");
    const dialog = element("section", "guest-editor-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "guest-editor-title");

    const head = element("header", "guest-editor-head");
    const heading = element("div");
    heading.append(element("p", "admin-eyebrow", "Gestión administrativa"));
    const title = element("h2", "", "Editar invitación");
    title.id = "guest-editor-title";
    heading.append(title, element("p", "guest-editor-code", `${detail.codigo} · ${detail.activo ? "Activo" : "Inactivo"}`));
    const closeButton = actionButton("Cerrar");
    closeButton.classList.add("guest-editor-close");
    head.append(heading, closeButton);

    const form = document.createElement("form");
    form.className = "guest-editor-form";
    form.noValidate = true;

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 150;
    name.required = true;
    name.value = detail.nombre;

    const group = document.createElement("select");
    GROUPS.forEach((item) => group.append(option(item, item)));
    group.value = detail.grupo;

    const phone = document.createElement("input");
    phone.type = "tel";
    phone.maxLength = 25;
    phone.placeholder = "Ej. 525512345678";
    phone.value = detail.telefono || "";

    const notes = document.createElement("textarea");
    notes.maxLength = 1000;
    notes.rows = 4;
    notes.value = detail.notas || "";

    const reason = document.createElement("textarea");
    reason.maxLength = 1000;
    reason.rows = 3;
    reason.required = true;
    reason.placeholder = "Ej. Actualización de teléfono o ajuste de cupo";

    const confirmedAdults = detail.confirmacion?.adultos_confirmados || 0;
    const confirmedChildren = detail.confirmacion?.ninos_confirmados || 0;
    const adults = counterField("Adultos", detail.adultos_asignados, confirmedAdults);
    const children = counterField("Niños", detail.ninos_asignados, confirmedChildren);

    const fields = element("div", "guest-editor-grid");
    fields.append(
      textField("Nombre", name),
      textField("Grupo", group),
      adults.field,
      children.field,
      textField("Teléfono", phone),
      textField("Notas administrativas", notes)
    );

    const confirmation = element("section", "guest-editor-confirmation");
    confirmation.append(element("h3", "", "Confirmación vigente"));
    if (detail.confirmacion) {
      confirmation.append(element("p", "", `${stateLabels[detail.confirmacion.estado] || detail.confirmacion.estado} · ${confirmedAdults} ${confirmedAdults === 1 ? "adulto" : "adultos"} · ${confirmedChildren} ${confirmedChildren === 1 ? "niño" : "niños"}`));
      confirmation.append(element("small", "", "El cupo no puede reducirse por debajo de estas cantidades confirmadas."));
    } else {
      confirmation.append(element("p", "", "Sin confirmación registrada."));
    }

    const reasonField = textField("Motivo del cambio *", reason);
    reasonField.classList.add("guest-editor-reason");
    const status = element("div", "guest-editor-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const footer = element("footer", "guest-editor-footer");
    const cancel = actionButton("Cancelar");
    const save = actionButton("Guardar cambios", true);
    save.type = "submit";
    footer.append(cancel, save);

    form.append(fields, confirmation, reasonField, status, footer);
    dialog.append(head, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("guest-editor-open");

    function close() {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      document.body.classList.remove("guest-editor-open");
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    closeButton.addEventListener("click", close);
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKeyDown);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "guest-editor-status";
      status.textContent = "";

      const trimmedName = name.value.trim();
      const trimmedReason = reason.value.trim();
      if (!trimmedName) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = "El nombre es obligatorio.";
        name.focus();
        return;
      }
      if (!trimmedReason) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = "Escribe el motivo del cambio para guardar la auditoría.";
        reason.focus();
        return;
      }

      save.disabled = true;
      cancel.disabled = true;
      closeButton.disabled = true;
      save.setAttribute("aria-busy", "true");
      status.textContent = "Guardando cambios…";

      try {
        const newTotal = adults.getValue() + children.getValue();
        const oldTotal = Number(detail.cupo_total) || 0;
        const increase = detail.activo ? Math.max(0, newTotal - oldTotal) : 0;
        const capacityCheck = await validateTableCapacity(increase);
        if (!capacityCheck.ok) {
          status.className = "guest-editor-status guest-editor-status-error";
          status.textContent = capacityCheck.message;
          save.disabled = false;
          cancel.disabled = false;
          closeButton.disabled = false;
          save.removeAttribute("aria-busy");
          return;
        }

        const result = await window.AdminGuestsService.updateGuest({
          invitadoId: detail.invitado_id,
          nombre: trimmedName,
          grupo: group.value,
          adultosAsignados: adults.getValue(),
          ninosAsignados: children.getValue(),
          telefono: phone.value,
          notas: notes.value,
          motivo: trimmedReason,
          version: detail.version,
        });
        close();
        setFeedback("success", result.actualizado ? "Invitación actualizada correctamente." : "No se detectaron cambios en el invitado.");
        await onSaved();
      } catch (error) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = errorText(error);
        save.disabled = false;
        cancel.disabled = false;
        closeButton.disabled = false;
        save.removeAttribute("aria-busy");
      }
    });

    window.setTimeout(() => name.focus(), 0);
  }

  function openStatusDialog(detail, { onChanged, setFeedback }) {
    const previousFocus = document.activeElement;
    const targetActive = !detail.activo;
    const isDeactivation = !targetActive;

    const overlay = element("div", "guest-editor-overlay guest-status-overlay");
    const dialog = element("section", "guest-editor-dialog guest-status-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "guest-status-title");

    const head = element("header", "guest-editor-head");
    const heading = element("div");
    heading.append(element("p", "admin-eyebrow", "Gestión administrativa"));
    const title = element("h2", "", isDeactivation ? "Dar de baja invitación" : "Reactivar invitación");
    title.id = "guest-status-title";
    heading.append(
      title,
      element("p", "guest-editor-code", `${detail.codigo} · ${detail.grupo}`)
    );

    const closeButton = actionButton("Cerrar");
    closeButton.classList.add("guest-editor-close");
    head.append(heading, closeButton);

    const body = element("div", "guest-status-body");
    const identity = element("section", "guest-status-summary");
    identity.append(
      element("p", "admin-eyebrow", isDeactivation ? "Baja lógica" : "Reactivación"),
      element("h3", "", detail.nombre),
      element(
        "p",
        "",
        `Pase: ${detail.adultos_asignados} ${detail.adultos_asignados === 1 ? "adulto" : "adultos"}` +
          (detail.ninos_asignados
            ? ` · ${detail.ninos_asignados} ${detail.ninos_asignados === 1 ? "niño" : "niños"}`
            : "")
      )
    );

    const warning = element("section", `guest-status-warning${isDeactivation ? " guest-status-warning-danger" : ""}`);
    if (isDeactivation) {
      warning.append(
        element("h3", "", "La invitación quedará inactiva"),
        element("p", "", "No se eliminará ningún registro. Se conservarán el código, token, confirmaciones e historial y podrás reactivarla posteriormente."),
        element("p", "", "Mientras esté inactiva, su enlace personalizado dejará de funcionar y quedará fuera de los indicadores de invitados activos.")
      );

      if (detail.confirmacion) {
        warning.append(
          element(
            "p",
            "guest-status-confirmed",
            `Confirmación vigente: ${stateLabels[detail.confirmacion.estado] || detail.confirmacion.estado} · ` +
              `${detail.confirmacion.adultos_confirmados} ${detail.confirmacion.adultos_confirmados === 1 ? "adulto" : "adultos"} · ` +
              `${detail.confirmacion.ninos_confirmados} ${detail.confirmacion.ninos_confirmados === 1 ? "niño" : "niños"}.`
          )
        );
      }
    } else {
      warning.append(
        element("h3", "", "La invitación volverá a estar activa"),
        element("p", "", "Recuperará su mismo código, enlace personalizado, cupo e historial. Si existía una confirmación anterior, se conservará.")
      );
    }

    const form = document.createElement("form");
    form.className = "guest-status-form";
    form.noValidate = true;

    const reason = document.createElement("textarea");
    reason.maxLength = 1000;
    reason.rows = 3;
    reason.required = true;
    reason.placeholder = isDeactivation
      ? "Ej. Ya no asistirá a la boda / invitación cancelada"
      : "Ej. Invitación reactivada por solicitud de los novios";

    const reasonField = textField(isDeactivation ? "Motivo de la baja *" : "Motivo de la reactivación *", reason);
    reasonField.classList.add("guest-editor-reason");

    const status = element("div", "guest-editor-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const footer = element("footer", "guest-editor-footer guest-status-footer");
    const cancel = actionButton("Cancelar");
    const confirm = actionButton(isDeactivation ? "Dar de baja invitación" : "Reactivar invitación", true);
    if (isDeactivation) confirm.classList.add("guest-status-danger-action");
    confirm.type = "submit";
    footer.append(cancel, confirm);

    form.append(reasonField, status, footer);
    body.append(identity, warning, form);
    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("guest-editor-open");

    function close() {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      document.body.classList.remove("guest-editor-open");
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    closeButton.addEventListener("click", close);
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKeyDown);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const trimmedReason = reason.value.trim();
      status.className = "guest-editor-status";
      status.textContent = "";

      if (!trimmedReason) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = isDeactivation
          ? "Escribe el motivo de la baja para registrar la auditoría."
          : "Escribe el motivo de la reactivación para registrar la auditoría.";
        reason.focus();
        return;
      }

      confirm.disabled = true;
      cancel.disabled = true;
      closeButton.disabled = true;
      confirm.setAttribute("aria-busy", "true");
      status.textContent = isDeactivation ? "Dando de baja invitación…" : "Reactivando invitación…";

      try {
        if (targetActive) {
          const capacityCheck = await validateTableCapacity(Number(detail.cupo_total) || 0);
          if (!capacityCheck.ok) {
            status.className = "guest-editor-status guest-editor-status-error";
            status.textContent = capacityCheck.message;
            confirm.disabled = false;
            cancel.disabled = false;
            closeButton.disabled = false;
            confirm.removeAttribute("aria-busy");
            return;
          }
        }

        const result = await window.AdminGuestsService.changeGuestStatus({
          invitadoId: detail.invitado_id,
          activo: targetActive,
          motivo: trimmedReason,
          version: detail.version,
        });

        close();
        setFeedback(
          "success",
          result.cambio_aplicado
            ? (targetActive ? "Invitación reactivada correctamente." : "Invitación dada de baja correctamente.")
            : "La invitación ya tenía ese estado."
        );
        await onChanged();
      } catch (error) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = errorText(error);
        confirm.disabled = false;
        cancel.disabled = false;
        closeButton.disabled = false;
        confirm.removeAttribute("aria-busy");
      }
    });

    window.setTimeout(() => reason.focus(), 0);
  }

  function openCreator({ onCreated, setFeedback }) {
    const previousFocus = document.activeElement;
    const overlay = element("div", "guest-editor-overlay");
    const dialog = element("section", "guest-editor-dialog guest-create-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "guest-create-title");

    const head = element("header", "guest-editor-head");
    const heading = element("div");
    heading.append(element("p", "admin-eyebrow", "Gestión administrativa"));
    const title = element("h2", "", "Nueva invitación");
    title.id = "guest-create-title";
    heading.append(title, element("p", "guest-editor-code", "El código y el enlace se generarán automáticamente."));
    const closeButton = actionButton("Cerrar");
    closeButton.classList.add("guest-editor-close");
    head.append(heading, closeButton);

    const form = document.createElement("form");
    form.className = "guest-editor-form guest-create-form";
    form.noValidate = true;

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 150;
    name.required = true;
    name.placeholder = "Ej. Tíos Roberto y Laura";

    const group = document.createElement("select");
    GROUPS.forEach((item) => group.append(option(item, item)));

    const phone = document.createElement("input");
    phone.type = "tel";
    phone.maxLength = 25;
    phone.placeholder = "Ej. 525512345678";

    const notes = document.createElement("textarea");
    notes.maxLength = 1000;
    notes.rows = 4;
    notes.placeholder = "Opcional";

    const reason = document.createElement("textarea");
    reason.maxLength = 1000;
    reason.rows = 3;
    reason.required = true;
    reason.placeholder = "Ej. Invitación agregada por solicitud familiar";

    const adults = counterField("Adultos", 1, 0);
    const children = counterField("Niños", 0, 0);

    const fields = element("div", "guest-editor-grid");
    fields.append(
      textField("Nombre", name),
      textField("Grupo", group),
      adults.field,
      children.field,
      textField("Teléfono", phone),
      textField("Notas administrativas", notes)
    );

    const note = element("section", "guest-editor-confirmation guest-create-note");
    note.append(
      element("h3", "", "Generación automática"),
      element("p", "", "Al guardar se asignará el siguiente código disponible del grupo y un enlace personalizado único."),
      element("small", "", "El código y el token no se capturan manualmente y no se reutilizan.")
    );

    const reasonField = textField("Motivo del alta *", reason);
    reasonField.classList.add("guest-editor-reason");
    const status = element("div", "guest-editor-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const footer = element("footer", "guest-editor-footer");
    const cancel = actionButton("Cancelar");
    const save = actionButton("Crear invitación", true);
    save.type = "submit";
    footer.append(cancel, save);

    form.append(fields, note, reasonField, status, footer);
    dialog.append(head, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("guest-editor-open");

    function close() {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      document.body.classList.remove("guest-editor-open");
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    closeButton.addEventListener("click", close);
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKeyDown);

    function showCreated(created, capturedPhone) {
      const pass = `${created.adultos_asignados} ${created.adultos_asignados === 1 ? "adulto" : "adultos"}` +
        (created.ninos_asignados ? ` · ${created.ninos_asignados} ${created.ninos_asignados === 1 ? "niño" : "niños"}` : "");
      const result = element("section", "guest-create-success");
      result.append(
        element("p", "admin-eyebrow", "Invitación creada correctamente"),
        element("h3", "", created.nombre),
        element("p", "guest-create-code", `${created.codigo} · ${created.grupo}`),
        element("p", "guest-create-pass", `Pase: ${pass}`)
      );

      const actions = element("div", "guest-create-actions");
      const preview = actionButton("Vista previa", true);
      const copy = actionButton("Copiar enlace");
      const whatsapp = actionButton("WhatsApp");
      const done = actionButton("Cerrar");

      async function withToken(button, purpose, action) {
        let token = null;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
          token = await window.AdminGuestsService.getInvitationToken(created.id, purpose);
          await action(token);
        } catch (error) {
          status.className = "guest-editor-status guest-editor-status-error";
          status.textContent = "No fue posible preparar esta acción. Puedes intentarlo nuevamente.";
        } finally {
          token = null;
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      }

      preview.addEventListener("click", () => withToken(preview, "vista_previa", (token) => {
        window.AdminInvitationUrl.openInvitationPreview(token, { preview: "admin" });
      }));
      copy.addEventListener("click", () => withToken(copy, "copiar_enlace", async (token) => {
        await window.AdminInvitationUrl.copyInvitationUrl(token);
        status.className = "guest-editor-status guest-editor-status-success";
        status.textContent = "Enlace copiado";
      }));
      whatsapp.addEventListener("click", () => withToken(whatsapp, "whatsapp", (token) => {
        window.AdminWhatsApp.shareInvitation(token, {
          phone: capturedPhone,
          name: created.nombre,
          adults: created.adultos_asignados,
          children: created.ninos_asignados,
        });
      }));
      done.addEventListener("click", close);

      actions.append(preview, copy, whatsapp, done);
      result.append(actions);
      form.replaceChildren(result, status);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "guest-editor-status";
      status.textContent = "";

      const trimmedName = name.value.trim();
      const trimmedReason = reason.value.trim();
      const total = adults.getValue() + children.getValue();
      if (!trimmedName) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = "El nombre es obligatorio.";
        name.focus();
        return;
      }
      if (total <= 0) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = "Asigna al menos una persona a la invitación.";
        return;
      }
      if (!trimmedReason) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = "Escribe el motivo del alta para guardar la auditoría.";
        reason.focus();
        return;
      }

      save.disabled = true;
      cancel.disabled = true;
      closeButton.disabled = true;
      save.setAttribute("aria-busy", "true");
      status.textContent = "Creando invitado…";

      try {
        const capacityCheck = await validateTableCapacity(total);
        if (!capacityCheck.ok) {
          status.className = "guest-editor-status guest-editor-status-error";
          status.textContent = capacityCheck.message;
          save.disabled = false;
          cancel.disabled = false;
          closeButton.disabled = false;
          save.removeAttribute("aria-busy");
          return;
        }

        const capturedPhone = phone.value.trim();
        const created = await window.AdminGuestsService.createGuest({
          nombre: trimmedName,
          grupo: group.value,
          adultos: adults.getValue(),
          ninos: children.getValue(),
          telefono: capturedPhone,
          notas: notes.value,
          motivo: trimmedReason,
        });
        await onCreated(created);
        status.className = "guest-editor-status guest-editor-status-success";
        status.textContent = "Invitado creado correctamente.";
        showCreated(created, capturedPhone);
        setFeedback("success", `${created.nombre} fue agregado con el código ${created.codigo}.`);
      } catch (error) {
        status.className = "guest-editor-status guest-editor-status-error";
        status.textContent = errorText(error);
        save.disabled = false;
        cancel.disabled = false;
        closeButton.disabled = false;
        save.removeAttribute("aria-busy");
      }
    });
  }

  function guestCard(guest, setFeedback, onEdit, onStatus) {
    const article = element("article", "guest-directory-card");
    const identity = element("div", "guest-directory-identity");
    identity.append(element("h3", "", guest.nombre));
    identity.append(element("p", "guest-directory-meta", `${guest.codigo} · ${guest.grupo}${guest.activo ? "" : " · Inactivo"}`));
    const capacity = `${guest.adultos_asignados} ${guest.adultos_asignados === 1 ? "adulto" : "adultos"}` +
      (guest.ninos_asignados ? ` · ${guest.ninos_asignados} ${guest.ninos_asignados === 1 ? "niño" : "niños"}` : "");
    identity.append(element("p", "guest-directory-capacity", `Pase: ${capacity}`));

    const status = element("div", "guest-directory-state");
    const badge = element("span", `guest-state-badge guest-state-${guest.estado_confirmacion === "asistira" ? "yes" : guest.estado_confirmacion === "no_asistira" ? "no" : "pending"}`, stateLabels[guest.estado_confirmacion]);
    const confirmed = guest.estado_confirmacion === "pendiente"
      ? "Sin respuesta"
      : `${guest.total_confirmado} ${guest.total_confirmado === 1 ? "asistente confirmado" : "asistentes confirmados"}`;
    status.append(badge, element("small", "", confirmed));

    const actions = element("div", "guest-directory-actions");
    actions.setAttribute("aria-label", `Acciones para ${guest.nombre}`);

    const previewButton = actionButton("Vista previa", true);
    previewButton.addEventListener("click", async () => {
      let token = null;
      previewButton.disabled = true;
      previewButton.setAttribute("aria-busy", "true");
      try {
        token = await window.AdminGuestsService.getInvitationToken(guest.invitado_id, "vista_previa");
        window.AdminInvitationUrl.openInvitationPreview(token, { preview: "admin" });
      } catch (error) {
        setFeedback("error", error?.message === "INVITACION_INACTIVA" ? "Esta invitación está inactiva." : "No fue posible abrir la vista previa.");
      } finally {
        token = null;
        previewButton.disabled = false;
        previewButton.removeAttribute("aria-busy");
      }
    });

    const copyButton = actionButton("Copiar enlace");
    copyButton.addEventListener("click", async () => {
      let token = null;
      copyButton.disabled = true;
      copyButton.setAttribute("aria-busy", "true");
      try {
        token = await window.AdminGuestsService.getInvitationToken(guest.invitado_id, "copiar_enlace");
        await window.AdminInvitationUrl.copyInvitationUrl(token);
        setFeedback("success", "Enlace copiado");
      } catch (error) {
        setFeedback("error", error?.message === "INVITACION_INACTIVA" ? "Esta invitación está inactiva." : "No fue posible copiar el enlace.");
      } finally {
        token = null;
        copyButton.disabled = false;
        copyButton.removeAttribute("aria-busy");
      }
    });

    const whatsappButton = actionButton("WhatsApp");
    whatsappButton.addEventListener("click", async () => {
      let token = null;
      whatsappButton.disabled = true;
      whatsappButton.setAttribute("aria-busy", "true");
      try {
        const detail = await window.AdminGuestsService.getGuestDetail(guest.invitado_id);
        token = await window.AdminGuestsService.getInvitationToken(guest.invitado_id, "whatsapp");
        window.AdminWhatsApp.shareInvitation(token, {
          phone: detail.telefono,
          name: detail.nombre,
          adults: detail.adultos_asignados,
          children: detail.ninos_asignados,
        });
        setFeedback("success", detail.telefono ? `WhatsApp abierto para ${detail.nombre}.` : "WhatsApp abierto. Selecciona el destinatario para compartir la invitación.");
      } catch (error) {
        setFeedback("error", error?.message === "INVITACION_INACTIVA" ? "Esta invitación está inactiva." : "No fue posible preparar el mensaje de WhatsApp.");
      } finally {
        token = null;
        whatsappButton.disabled = false;
        whatsappButton.removeAttribute("aria-busy");
      }
    });

    const editButton = actionButton("Editar");
    editButton.addEventListener("click", async () => {
      editButton.disabled = true;
      editButton.setAttribute("aria-busy", "true");
      try {
        await onEdit(guest.invitado_id);
      } finally {
        editButton.disabled = false;
        editButton.removeAttribute("aria-busy");
      }
    });

    const statusButton = actionButton(guest.activo ? "Dar de baja" : "Reactivar");
    statusButton.classList.add(guest.activo ? "guest-directory-action-danger" : "guest-directory-action-reactivate");
    statusButton.addEventListener("click", async () => {
      statusButton.disabled = true;
      statusButton.setAttribute("aria-busy", "true");
      try {
        await onStatus(guest.invitado_id);
      } finally {
        statusButton.disabled = false;
        statusButton.removeAttribute("aria-busy");
      }
    });

    actions.append(previewButton, copyButton, whatsappButton, editButton, statusButton);
    article.append(identity, status, actions);
    return article;
  }

  function buildView() {
    const root = element("section", "guest-directory-view");
    const header = element("header", "admin-view-header guest-directory-header");
    const headerCopy = element("div", "guest-directory-header-copy");
    headerCopy.append(element("p", "admin-eyebrow", "Gestión administrativa"), element("h2", "", "Invitaciones"), element("p", "admin-view-copy", "Administra cada invitación, su cupo de personas y las acciones asociadas desde un solo lugar."));
    const newGuest = actionButton("+ Nueva invitación", true);
    newGuest.classList.add("guest-new-button");
    header.append(headerCopy, newGuest);

    const overview = element("section", "tables-summary-grid admin-overview-grid");
    overview.setAttribute("aria-label", "Resumen de invitaciones");
    const activeMetric = overviewMetric("Invitaciones activas");
    const capacityMetric = overviewMetric("Cupo total");
    const childrenMetric = overviewMetric("Con niños");
    const inactiveMetric = overviewMetric("Dadas de baja");
    overview.append(activeMetric.card, capacityMetric.card, childrenMetric.card, inactiveMetric.card);

    const controls = element("section", "guest-directory-controls");
    controls.setAttribute("aria-label", "Búsqueda y filtros de invitaciones");
    const searchField = element("label", "guest-search-field");
    searchField.append(element("span", "", "Buscar invitación"));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Nombre, código, grupo o teléfono…";
    search.maxLength = 100;
    search.autocomplete = "off";
    searchField.append(search);

    const group = selectField("Grupo", [["", "Todos los grupos"], ...GROUPS.map((value) => [value, value])]);
    const state = selectField("Estado", [["", "Todos los estados"], ["pendiente", "Pendiente"], ["asistira", "Asistirá"], ["no_asistira", "No asistirá"]]);
    const active = selectField("Actividad", [["true", "Activos"], ["false", "Inactivos"], ["", "Todos"]]);
    const children = selectField("Niños", [["", "Todos"], ["true", "Con niños"], ["false", "Sin niños"]]);
    const order = selectField("Ordenar por", [["grupo", "Grupo"], ["nombre", "Nombre"], ["codigo", "Código"], ["cupo_total", "Cupo total"], ["estado", "Estado"], ["fecha_actualizacion", "Última actualización"]]);
    const filterGrid = element("div", "guest-filter-grid");
    [group, state, active, children, order].forEach(({ field }) => filterGrid.append(field));
    const clear = actionButton("Limpiar filtros");
    clear.classList.add("guest-clear-filters");
    controls.append(searchField, filterGrid, clear);

    const summary = element("div", "guest-directory-summary");
    const count = element("p");
    const updateState = element("span", "guest-directory-update");
    summary.append(count, updateState);
    const feedback = element("div", "guest-directory-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    const list = element("div", "guest-directory-list");

    const pagination = element("nav", "guest-directory-pagination");
    pagination.setAttribute("aria-label", "Paginación de invitaciones");
    const previous = actionButton("Anterior");
    const pageLabel = element("span");
    const next = actionButton("Siguiente");
    const sizeField = selectField("Por página", [["10", "10"], ["20", "20"], ["50", "50"]], "guest-page-size");
    sizeField.select.value = "20";
    pagination.append(previous, pageLabel, next, sizeField.field);
    root.append(header, overview, controls, summary, feedback, list, pagination);
    return { root, newGuest, overviewMetrics: { activeMetric, capacityMetric, childrenMetric, inactiveMetric }, search, group: group.select, state: state.select, active: active.select, children: children.select, order: order.select, clear, count, updateState, feedback, list, pagination, previous, next, pageLabel, pageSize: sizeField.select };
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.invitados = () => {
    const ui = buildView();
    const state = { search: "", group: null, state: null, active: true, withChildren: null, withoutPhone: null, withNotes: null, page: 1, pageSize: 20, order: "grupo", direction: "asc" };
    let initialized = false;
    let debounceTimer = null;
    let requestId = 0;

    function setFeedback(kind, message) {
      ui.feedback.className = `guest-directory-feedback guest-directory-feedback-${kind}`;
      ui.feedback.textContent = message;
      ui.feedback.hidden = !message;
    }

    async function editGuest(invitadoId) {
      try {
        const detail = await window.AdminGuestsService.getGuestDetail(invitadoId);
        openEditor(detail, { onSaved: () => load(), setFeedback });
      } catch (error) {
        setFeedback("error", "No fue posible cargar los datos de la invitación para editar.");
      }
    }

    function createGuest() {
      openCreator({
        setFeedback,
        onCreated: async () => {
          state.page = 1;
          await load();
        },
      });
    }

    async function changeGuestStatus(invitadoId) {
      try {
        setFeedback("loading", "Cargando invitación…");
        const detail = await window.AdminGuestsService.getGuestDetail(invitadoId);
        setFeedback("", "");
        openStatusDialog(detail, {
          setFeedback,
          onChanged: async () => {
            state.page = 1;
            await load();
          },
        });
      } catch (error) {
        setFeedback("error", "No fue posible cargar los datos de la invitación.");
      }
    }

    function render(envelope) {
      const { items, paginacion } = envelope.data;
      ui.list.replaceChildren(...items.map((guest) => guestCard(guest, setFeedback, editGuest, changeGuestStatus)));
      ui.count.replaceChildren(document.createTextNode("Resultados: "), element("strong", "", `${paginacion.total_registros} ${paginacion.total_registros === 1 ? "invitación" : "invitaciones"}`));
      ui.pageLabel.textContent = paginacion.total_paginas ? `Página ${paginacion.pagina} de ${paginacion.total_paginas}` : "Página 0 de 0";
      ui.previous.disabled = paginacion.pagina <= 1;
      ui.next.disabled = paginacion.total_paginas === 0 || paginacion.pagina >= paginacion.total_paginas;
      ui.pagination.hidden = paginacion.total_registros === 0;
      if (items.length === 0) {
        const hasCustomCriteria = Boolean(state.search || state.group || state.state || state.active !== true || state.withChildren !== null);
        setFeedback("empty", hasCustomCriteria ? "No encontramos invitaciones que coincidan con la búsqueda o los filtros." : "Todavía no hay invitaciones activas registradas.");
      } else {
        setFeedback("", "");
      }
    }

    async function loadOverview() {
      const metrics = ui.overviewMetrics;
      try {
        const base = { search: "", group: null, state: null, active: true, withChildren: null, withoutPhone: null, withNotes: null, page: 1, pageSize: 50, order: "grupo", direction: "asc" };
        const first = await window.AdminGuestsService.listGuests(base);
        const totalActive = first.data.paginacion.total_registros;
        let items = [...first.data.items];
        for (let page = 2; page <= first.data.paginacion.total_paginas; page += 1) {
          const response = await window.AdminGuestsService.listGuests({ ...base, page });
          items.push(...response.data.items);
        }
        const [withChildren, inactive] = await Promise.all([
          window.AdminGuestsService.listGuests({ ...base, withChildren: true }),
          window.AdminGuestsService.listGuests({ ...base, active: false }),
        ]);
        const adults = items.reduce((sum, item) => sum + Number(item.adultos_asignados || 0), 0);
        const children = items.reduce((sum, item) => sum + Number(item.ninos_asignados || 0), 0);
        metrics.activeMetric.valueNode.textContent = String(totalActive);
        metrics.activeMetric.detailNode.textContent = "invitaciones disponibles";
        metrics.capacityMetric.valueNode.textContent = String(adults + children);
        metrics.capacityMetric.detailNode.textContent = `${adults} adultos · ${children} niños`;
        metrics.childrenMetric.valueNode.textContent = String(withChildren.data.paginacion.total_registros);
        metrics.childrenMetric.detailNode.textContent = "invitaciones con niños";
        metrics.inactiveMetric.valueNode.textContent = String(inactive.data.paginacion.total_registros);
        metrics.inactiveMetric.detailNode.textContent = "invitaciones inactivas";
      } catch (error) {
        Object.values(metrics).forEach(({ valueNode, detailNode }) => { valueNode.textContent = "—"; detailNode.textContent = "No disponible"; });
      }
    }

    async function load({ initial = false } = {}) {
      if (!ui.root.isConnected) return;
      const currentRequest = ++requestId;
      if (initial) {
        setFeedback("loading", "Cargando invitaciones…");
        ui.list.replaceChildren();
      } else {
        ui.updateState.textContent = "Actualizando resultados…";
      }
      ui.root.setAttribute("aria-busy", "true");
      try {
        const envelope = await window.AdminGuestsService.listGuests(state);
        if (currentRequest !== requestId || !ui.root.isConnected) return;
        render(envelope);
        initialized = true;
        loadOverview();
      } catch (error) {
        if (currentRequest !== requestId || !ui.root.isConnected) return;
        console.error("Admin guests list:", error);
        if (!initialized) {
          ui.list.replaceChildren();
          ui.count.textContent = "Resultados no disponibles";
        }
        setFeedback("error", "No fue posible consultar las invitaciones. Intenta nuevamente.");
      } finally {
        if (currentRequest === requestId && ui.root.isConnected) {
          ui.updateState.textContent = "";
          ui.root.removeAttribute("aria-busy");
        }
      }
    }

    function resetPageAndLoad() { state.page = 1; load(); }
    ui.newGuest.addEventListener("click", createGuest);
    ui.search.addEventListener("input", () => {
      window.clearTimeout(debounceTimer);
      requestId += 1;
      debounceTimer = window.setTimeout(() => { state.search = ui.search.value.trim(); resetPageAndLoad(); }, DEBOUNCE_MS);
    });
    ui.group.addEventListener("change", () => { state.group = ui.group.value || null; resetPageAndLoad(); });
    ui.state.addEventListener("change", () => { state.state = ui.state.value || null; resetPageAndLoad(); });
    ui.active.addEventListener("change", () => { state.active = ui.active.value === "" ? null : ui.active.value === "true"; resetPageAndLoad(); });
    ui.children.addEventListener("change", () => { state.withChildren = ui.children.value === "" ? null : ui.children.value === "true"; resetPageAndLoad(); });
    ui.order.addEventListener("change", () => { state.order = ui.order.value; resetPageAndLoad(); });
    ui.pageSize.addEventListener("change", () => { state.pageSize = Number(ui.pageSize.value); resetPageAndLoad(); });
    ui.previous.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
    ui.next.addEventListener("click", () => { state.page += 1; load(); });
    ui.clear.addEventListener("click", () => {
      window.clearTimeout(debounceTimer);
      Object.assign(state, { search: "", group: null, state: null, active: true, withChildren: null, withoutPhone: null, withNotes: null, page: 1, pageSize: 20, order: "grupo", direction: "asc" });
      ui.search.value = ""; ui.group.value = ""; ui.state.value = ""; ui.active.value = "true"; ui.children.value = ""; ui.order.value = "grupo"; ui.pageSize.value = "20";
      load();
    });

    window.setTimeout(() => { if (ui.root.isConnected) load({ initial: true }); }, 0);
    return ui.root;
  };
})();
