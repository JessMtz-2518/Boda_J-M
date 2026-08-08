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

  function disabledAction(label, primary = false) {
    const button = element("button", `guest-directory-action${primary ? " guest-directory-action-primary" : ""}`, label);
    button.type = "button";
    button.disabled = true;
    button.title = "Disponible en una siguiente etapa";
    return button;
  }

  function guestCard(guest) {
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
    actions.setAttribute("aria-label", `Acciones pendientes para ${guest.nombre}`);
      const previewButton = disabledAction("Vista previa", true);
      previewButton.disabled = false;
      previewButton.addEventListener("click", async () => {
        let token = null;
        previewButton.disabled = true;
        previewButton.setAttribute("aria-busy", "true");

        try {
          token = await window.AdminGuestsService.getInvitationToken(guest.invitado_id, "vista_previa");
          window.AdminInvitationUrl.openInvitationPreview(token, { preview: "admin" });
        } catch (error) {
          const message = error?.message === "INVITACION_INACTIVA"
            ? "Esta invitación está inactiva."
            : "No fue posible abrir la vista previa.";
          setFeedback("error", message);
        } finally {
          token = null;
          previewButton.disabled = false;
          previewButton.removeAttribute("aria-busy");
        }
      });

      const copyButton = disabledAction("Copiar enlace");
      copyButton.disabled = false;
      copyButton.addEventListener("click", async () => {
        let token = null;
        copyButton.disabled = true;
        copyButton.setAttribute("aria-busy", "true");

        try {
          token = await window.AdminGuestsService.getInvitationToken(guest.invitado_id, "copiar_enlace");
          await window.AdminInvitationUrl.copyInvitationUrl(token);
          setFeedback("success", "Enlace copiado");
        } catch (error) {
          const message = error?.message === "INVITACION_INACTIVA"
            ? "Esta invitación está inactiva."
            : "No fue posible copiar el enlace.";
          setFeedback("error", message);
        } finally {
          token = null;
          copyButton.disabled = false;
          copyButton.removeAttribute("aria-busy");
        }
      });

      actions.append(previewButton, copyButton);
      ["QR", "WhatsApp", "Editar", "Más"].forEach((label) => actions.append(disabledAction(label)));
    article.append(identity, status, actions);
    return article;
  }

  function buildView() {
    const root = element("section", "guest-directory-view");
    const header = element("header", "admin-view-header guest-directory-header");
    header.append(element("p", "admin-eyebrow", "Gestión administrativa"), element("h2", "", "Invitados"), element("p", "admin-view-copy", "Localiza una invitación y administra sus acciones desde un solo lugar."));

    const controls = element("section", "guest-directory-controls");
    controls.setAttribute("aria-label", "Búsqueda y filtros de invitados");
    const searchField = element("label", "guest-search-field");
    searchField.append(element("span", "", "Buscar invitado"));
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
    const clear = element("button", "guest-directory-action guest-clear-filters", "Limpiar filtros");
    clear.type = "button";
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
    pagination.setAttribute("aria-label", "Paginación de invitados");
    const previous = element("button", "guest-directory-action", "Anterior"); previous.type = "button";
    const pageLabel = element("span");
    const next = element("button", "guest-directory-action", "Siguiente"); next.type = "button";
    const sizeField = selectField("Por página", [["10", "10"], ["20", "20"], ["50", "50"]], "guest-page-size");
    sizeField.select.value = "20";
    pagination.append(previous, pageLabel, next, sizeField.field);
    root.append(header, controls, summary, feedback, list, pagination);
    return { root, search, group: group.select, state: state.select, active: active.select, children: children.select, order: order.select, clear, count, updateState, feedback, list, pagination, previous, next, pageLabel, pageSize: sizeField.select };
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

    function render(envelope) {
      const { items, paginacion } = envelope.data;
      ui.list.replaceChildren(...items.map(guestCard));
      ui.count.replaceChildren(document.createTextNode("Resultados: "), element("strong", "", `${paginacion.total_registros} ${paginacion.total_registros === 1 ? "invitado" : "invitados"}`));
      ui.pageLabel.textContent = paginacion.total_paginas ? `Página ${paginacion.pagina} de ${paginacion.total_paginas}` : "Página 0 de 0";
      ui.previous.disabled = paginacion.pagina <= 1;
      ui.next.disabled = paginacion.total_paginas === 0 || paginacion.pagina >= paginacion.total_paginas;
      ui.pagination.hidden = paginacion.total_registros === 0;
      if (items.length === 0) {
        const hasCustomCriteria = Boolean(state.search || state.group || state.state || state.active !== true || state.withChildren !== null);
        setFeedback("empty", hasCustomCriteria ? "No encontramos invitados que coincidan con la búsqueda o los filtros." : "Todavía no hay invitados activos registrados.");
      } else {
        setFeedback("", "");
      }
    }

    async function load({ initial = false } = {}) {
      if (!ui.root.isConnected) return;
      const currentRequest = ++requestId;
      if (initial) {
        setFeedback("loading", "Cargando invitados…");
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
      } catch (error) {
        if (currentRequest !== requestId || !ui.root.isConnected) return;
        console.error("Admin guests list:", error);
        if (!initialized) {
          ui.list.replaceChildren();
          ui.count.textContent = "Resultados no disponibles";
        }
        setFeedback("error", "No fue posible consultar los invitados. Intenta nuevamente.");
      } finally {
        if (currentRequest === requestId && ui.root.isConnected) {
          ui.updateState.textContent = "";
          ui.root.removeAttribute("aria-busy");
        }
      }
    }

    function resetPageAndLoad() { state.page = 1; load(); }
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
