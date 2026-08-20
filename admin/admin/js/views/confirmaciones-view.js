(() => {
  "use strict";

  const GROUPS = ["Familia Marcos", "Familia Jess", "Amigos Marcos", "Amigos Jess"];
  const state = { search: "", group: null, status: null, active: null, page: 1, pageSize: 20 };
  let requestId = 0;
  let debounceId = null;

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

  function select(options) {
    const node = document.createElement("select");
    options.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      node.append(option);
    });
    return node;
  }

  function field(label, control) {
    const wrapper = el("label", "confirmation-field");
    wrapper.append(el("span", "", label), control);
    return wrapper;
  }

  function formatDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function stateLabel(value) {
    return value === "confirmado" ? "Asistirá" : "No asistirá";
  }

  function errorText(error) {
    const message = String(error?.message || error?.details || "");
    if (message.includes("REGISTRO_DESACTUALIZADO")) return "La confirmación cambió en otra sesión. Vuelve a abrirla para cargar la versión más reciente.";
    if (message.includes("máximo de adultos") || message.includes("maximo de adultos")) return "Los adultos confirmados no pueden superar el cupo asignado.";
    if (message.includes("máximo de niños") || message.includes("maximo de niños")) return "Los niños confirmados no pueden superar el cupo asignado.";
    if (message.includes("MOTIVO_INVALIDO")) return "Escribe un motivo válido para registrar la corrección.";
    return "No fue posible completar la operación. Intenta nuevamente.";
  }

  function statusChip(value, active = true) {
    const chip = el("span", `confirmation-chip confirmation-chip-${value === "confirmado" ? "yes" : "no"}`, stateLabel(value));
    if (!active) chip.classList.add("confirmation-chip-inactive");
    return chip;
  }

  function counter(label, initial, max) {
    let value = initial;
    const wrapper = el("div", "confirmation-counter");
    const name = el("span", "confirmation-counter-label", label);
    const row = el("div", "confirmation-counter-row");
    const minus = button("−");
    const display = el("output", "confirmation-counter-value", String(value));
    const plus = button("+");

    function render() {
      display.textContent = String(value);
      minus.disabled = value <= 0;
      plus.disabled = value >= max;
    }
    minus.addEventListener("click", () => { if (value > 0) { value -= 1; render(); } });
    plus.addEventListener("click", () => { if (value < max) { value += 1; render(); } });
    render();
    row.append(minus, display, plus);
    wrapper.append(name, row, el("small", "", `Máx. ${max}`));
    return { node: wrapper, getValue: () => value };
  }

  function closeModal(overlay, previousFocus) {
    overlay.remove();
    document.body.classList.remove("confirmation-modal-open");
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }

  function historySummary(item) {
    const latest = item.datos_nuevos || {};
    const adults = Number(latest.adultos_confirmados ?? 0);
    const children = Number(latest.ninos_confirmados ?? 0);
    const total = adults + children;
    return total === 0
      ? "Registró que no asistirá."
      : `Asistencia: ${adults} ${adults === 1 ? "adulto" : "adultos"} · ${children} ${children === 1 ? "niño" : "niños"}.`;
  }

  function openCorrection(detail, { onCorrected }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "confirmation-modal-overlay");
    const dialog = el("section", "confirmation-modal confirmation-correction-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "confirmation-correction-title");

    const head = el("header", "confirmation-modal-head");
    const copy = el("div");
    copy.append(el("p", "admin-eyebrow", "Corrección administrativa"));
    const title = el("h2", "", detail.current.nombre);
    title.id = "confirmation-correction-title";
    copy.append(title, el("p", "confirmation-detail-code", `${detail.current.codigo} · ${detail.current.grupo}`));
    const close = button("Cerrar");
    head.append(copy, close);

    const body = el("div", "confirmation-modal-body confirmation-correction-body");
    const current = detail.current;
    const c = current.confirmacion;

    const summary = el("section", "confirmation-detail-summary");
    const statusRow = el("div", "confirmation-detail-status");
    statusRow.append(statusChip(c.estado, current.invitacion_activa));
    if (!current.invitacion_activa) statusRow.append(el("span", "confirmation-inactive-label", "Invitación inactiva"));
    summary.append(
      statusRow,
      el("p", "", `Confirmados actualmente: ${c.adultos} ${c.adultos === 1 ? "adulto" : "adultos"} · ${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`),
      el("p", "", `Cupo reservado: ${current.cupo.adultos} adultos · ${current.cupo.ninos} niños`)
    );

    const message = el("section", "confirmation-message");
    message.append(el("h3", "", "Mensaje original"));
    message.append(el("p", "", c.mensaje_original || "El invitado no dejó mensaje."));

    const correction = el("section", "confirmation-correction");
    correction.append(el("h3", "", "Modificar asistencia"));
    correction.append(el("p", "confirmation-help", "Corrige únicamente adultos y niños confirmados. El mensaje original se conservará sin cambios."));

    const counters = el("div", "confirmation-correction-grid");
    const adults = counter("Adultos", c.adultos, current.cupo.adultos);
    const children = counter("Niños", c.ninos, current.cupo.ninos);
    counters.append(adults.node, children.node);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio de la corrección";
    const reasonField = field("Motivo de la corrección *", reason);

    const correctionStatus = el("p", "confirmation-operation-status");
    correctionStatus.setAttribute("role", "status");
    correctionStatus.setAttribute("aria-live", "polite");

    const save = button("Guardar corrección", true);
    correction.append(counters, reasonField, correctionStatus, save);

    body.append(summary, message, correction);
    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("confirmation-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });
    document.addEventListener("keydown", function escape(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", escape);
      dismiss();
    }, { once: true });

    save.addEventListener("click", async () => {
      const motive = reason.value.trim();
      correctionStatus.className = "confirmation-operation-status";
      correctionStatus.textContent = "";

      if (!motive) {
        correctionStatus.classList.add("confirmation-operation-error");
        correctionStatus.textContent = "Escribe el motivo de la corrección.";
        reason.focus();
        return;
      }

      save.disabled = true;
      close.disabled = true;
      save.setAttribute("aria-busy", "true");
      correctionStatus.textContent = "Guardando corrección…";

      try {
        await window.AdminConfirmationsService.correctConfirmation({
          invitadoId: current.invitado_id,
          adultos: adults.getValue(),
          ninos: children.getValue(),
          motivo: motive,
          version: c.version,
        });

        dismiss();
        await onCorrected(current.invitado_id);
      } catch (error) {
        correctionStatus.classList.add("confirmation-operation-error");
        correctionStatus.textContent = errorText(error);
        save.disabled = false;
        close.disabled = false;
        save.removeAttribute("aria-busy");
      }
    });
  }

  function openDetail(detail) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "confirmation-modal-overlay");
    const dialog = el("section", "confirmation-modal confirmation-detail-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "confirmation-detail-title");

    const head = el("header", "confirmation-modal-head");
    const copy = el("div");
    copy.append(el("p", "admin-eyebrow", "Detalle de confirmación"));
    const title = el("h2", "", detail.current.nombre);
    title.id = "confirmation-detail-title";
    copy.append(title, el("p", "confirmation-detail-code", `${detail.current.codigo} · ${detail.current.grupo}`));
    const close = button("Cerrar");
    head.append(copy, close);

    const body = el("div", "confirmation-modal-body");
    const current = detail.current;
    const c = current.confirmacion;

    const summary = el("section", "confirmation-detail-summary");
    const statusRow = el("div", "confirmation-detail-status");
    statusRow.append(statusChip(c.estado, current.invitacion_activa));
    if (!current.invitacion_activa) statusRow.append(el("span", "confirmation-inactive-label", "Invitación inactiva"));
    summary.append(
      statusRow,
      el("p", "", `Confirmados: ${c.adultos} ${c.adultos === 1 ? "adulto" : "adultos"} · ${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`),
      el("p", "", `Cupo reservado: ${current.cupo.adultos} adultos · ${current.cupo.ninos} niños`),
      el("p", "confirmation-date", `Primera respuesta: ${formatDate(c.fecha_confirmacion)}`),
      el("p", "confirmation-date", `Última actualización: ${formatDate(c.fecha_actualizacion)}`)
    );

    const message = el("section", "confirmation-message");
    message.append(el("h3", "", "Mensaje original"));
    message.append(el("p", "", c.mensaje_original || "El invitado no dejó mensaje."));

    const history = el("section", "confirmation-history");
    history.append(el("h3", "", "Historial"));
    if (!detail.history.length) {
      history.append(el("p", "confirmation-empty", "No hay eventos de historial disponibles."));
    } else {
      const timeline = el("div", "confirmation-timeline");
      detail.history.forEach((item) => {
        const entry = el("article", "confirmation-history-item");
        const who = item.origen === "administrador" ? (item.administrador_nombre || "Administrador") : "Invitado";
        entry.append(
          el("span", `confirmation-origin confirmation-origin-${item.origen}`, who),
          el("strong", "", item.accion === "creada" ? "Confirmación inicial" : "Actualización"),
          el("p", "", historySummary(item)),
          item.motivo ? el("p", "confirmation-history-reason", `Motivo: ${item.motivo}`) : document.createDocumentFragment(),
          el("time", "", formatDate(item.fecha_evento))
        );
        timeline.append(entry);
      });
      history.append(timeline);
    }

    body.append(summary, message, history);
    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("confirmation-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });
  }

  function confirmationCard(item, openDetailAction, openEditAction) {
    const card = el("article", "confirmation-card");
    const identity = el("div", "confirmation-card-identity");
    identity.append(
      el("h3", "", item.nombre),
      el("p", "", `${item.codigo} · ${item.grupo}${item.invitacion_activa ? "" : " · Inactiva"}`),
      el("small", "", `Cupo: ${item.cupo.adultos} adultos · ${item.cupo.ninos} niños`)
    );

    const attendance = el("div", "confirmation-card-attendance");
    attendance.append(
      statusChip(item.confirmacion.estado, item.invitacion_activa),
      el("p", "", `${item.confirmacion.adultos} adultos · ${item.confirmacion.ninos} niños`),
      el("small", "", `${item.confirmacion.total} asistentes confirmados`)
    );

    const activity = el("div", "confirmation-card-activity");
    activity.append(
      el("span", "", item.confirmacion.tiene_actualizaciones ? "Actualizada" : "Primera respuesta"),
      el("time", "", formatDate(item.confirmacion.fecha_actualizacion))
    );
    if (item.confirmacion.tiene_mensaje) activity.append(el("small", "", "Con mensaje"));

    const actions = el("div", "confirmation-card-actions");
    const detail = button("Ver detalle", true);
    const edit = button("Editar");
    detail.addEventListener("click", () => openDetailAction(item.invitado_id, detail));
    edit.addEventListener("click", () => openEditAction(item.invitado_id, edit));
    actions.append(detail, edit);

    card.append(identity, attendance, activity, actions);
    return card;
  }

  function createView() {
    const root = el("section", "confirmations-view");
    const header = el("header", "admin-view-header");
    header.append(
      el("p", "admin-eyebrow", "Gestión administrativa"),
      el("h2", "", "Confirmaciones"),
      el("p", "admin-view-copy", "Consulta las respuestas vigentes, revisa su historial y realiza correcciones administrativas con trazabilidad.")
    );

    const toolbar = el("section", "confirmation-toolbar");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Nombre, código o grupo…";
    search.autocomplete = "off";

    const group = select([["", "Todos los grupos"], ...GROUPS.map((value) => [value, value])]);
    const status = select([["", "Todos los estados"], ["confirmado", "Asistirá"], ["no_asistira", "No asistirá"]]);
    const active = select([["", "Activas e inactivas"], ["true", "Invitaciones activas"], ["false", "Invitaciones inactivas"]]);
    const clear = button("Limpiar filtros");
    clear.classList.add("confirmation-clear-filters");

    const filters = el("div", "confirmation-filter-grid");
    filters.append(field("Buscar confirmación", search), field("Grupo", group), field("Estado", status), field("Invitación", active));
    toolbar.append(filters, clear);

    const meta = el("div", "confirmation-list-meta", "Cargando confirmaciones…");
    const feedback = el("div", "confirmation-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    const list = el("div", "confirmation-list");

    const pagination = el("div", "confirmation-pagination");
    const previous = button("Anterior");
    const pageText = el("span", "", "Página 1");
    const next = button("Siguiente");
    const pageSize = select([["10", "10"], ["20", "20"], ["50", "50"]]);
    pageSize.value = String(state.pageSize);
    pagination.append(previous, pageText, next, el("span", "", "Por página"), pageSize);

    root.append(header, toolbar, meta, feedback, list, pagination);

    function setFeedback(type, text) {
      feedback.className = `confirmation-feedback${type ? ` confirmation-feedback-${type}` : ""}`;
      feedback.textContent = text;
      feedback.hidden = !text;
    }

    async function load() {
      const id = ++requestId;
      setFeedback("loading", "Consultando confirmaciones…");

      try {
        const response = await window.AdminConfirmationsService.listConfirmations(state);
        if (id !== requestId) return;

        const data = response.data;
        meta.textContent = `Resultados: ${data.pagination.total_items} ${data.pagination.total_items === 1 ? "confirmación" : "confirmaciones"}`;
        list.replaceChildren(...data.items.map((item) => confirmationCard(item, openConfirmationDetail, openConfirmationEditor)));

        if (!data.items.length) {
          list.append(el("p", "confirmation-empty", "No encontramos confirmaciones que coincidan con los filtros."));
        }

        pageText.textContent = data.pagination.total_pages
          ? `Página ${data.pagination.page} de ${data.pagination.total_pages}`
          : "Página 0 de 0";
        previous.disabled = !data.pagination.has_previous;
        next.disabled = !data.pagination.has_next;
        setFeedback("", "");
      } catch (error) {
        if (id !== requestId) return;
        setFeedback("error", "No fue posible consultar las confirmaciones. Intenta nuevamente.");
      }
    }

    async function openConfirmationDetail(invitationId, trigger) {
      trigger.disabled = true;
      trigger.setAttribute("aria-busy", "true");
      setFeedback("loading", "Cargando detalle…");
      try {
        const detail = await window.AdminConfirmationsService.getConfirmation(invitationId);
        setFeedback("", "");
        openDetail(detail);
      } catch (error) {
        setFeedback("error", "No fue posible cargar el detalle de la confirmación.");
      } finally {
        trigger.disabled = false;
        trigger.removeAttribute("aria-busy");
      }
    }

    async function openConfirmationEditor(invitationId, trigger) {
      trigger.disabled = true;
      trigger.setAttribute("aria-busy", "true");
      setFeedback("loading", "Cargando confirmación…");
      try {
        const detail = await window.AdminConfirmationsService.getConfirmation(invitationId);
        setFeedback("", "");
        openCorrection(detail, {
          onCorrected: async () => {
            setFeedback("success", "Confirmación corregida y auditada correctamente.");
            await load();
          },
        });
      } catch (error) {
        setFeedback("error", "No fue posible cargar la confirmación para editarla.");
      } finally {
        trigger.disabled = false;
        trigger.removeAttribute("aria-busy");
      }
    }

    function resetPageAndLoad() { state.page = 1; load(); }

    search.addEventListener("input", () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        state.search = search.value.trim();
        resetPageAndLoad();
      }, 350);
    });
    group.addEventListener("change", () => { state.group = group.value || null; resetPageAndLoad(); });
    status.addEventListener("change", () => { state.status = status.value || null; resetPageAndLoad(); });
    active.addEventListener("change", () => {
      state.active = active.value === "" ? null : active.value === "true";
      resetPageAndLoad();
    });
    clear.addEventListener("click", () => {
      search.value = "";
      group.value = "";
      status.value = "";
      active.value = "";
      Object.assign(state, { search: "", group: null, status: null, active: null, page: 1 });
      load();
    });
    previous.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
    next.addEventListener("click", () => { state.page += 1; load(); });
    pageSize.addEventListener("change", () => { state.pageSize = Number(pageSize.value); state.page = 1; load(); });

    queueMicrotask(load);
    return root;
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.confirmaciones = createView;
})();