(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};

  const formatter = new Intl.NumberFormat("es-MX");

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

  function format(value) {
    return formatter.format(Number(value) || 0);
  }

  function field(label, control, helper = "") {
    const wrapper = el("label", "tables-field");
    wrapper.append(el("span", "tables-field-label", label), control);
    if (helper) wrapper.append(el("small", "tables-field-help", helper));
    return wrapper;
  }

  function metric(label, value, detail = "") {
    const card = el("article", "tables-metric");
    card.append(
      el("span", "tables-metric-label", label),
      el("strong", "tables-metric-value", value),
      el("span", "tables-metric-detail", detail)
    );
    return card;
  }

  function statusBox(type, title, text) {
    const box = el("div", `tables-capacity-status tables-capacity-status-${type}`);
    box.append(el("strong", "", title), el("p", "", text));
    return box;
  }

  function errorMessage(error) {
    const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.trim();

    const map = [
      ["CAPACIDAD_MESA_EXCEDIDA", error?.details || "La mesa no tiene suficientes lugares disponibles."],
      ["ADULTOS_EXCEDEN_CONFIRMACION", "No puedes asignar más adultos de los confirmados."],
      ["NINOS_EXCEDEN_CONFIRMACION", "No puedes asignar más niños de los confirmados."],
      ["INVITADO_NO_ASISTIRA", "La invitación ya no tiene una confirmación vigente de asistencia."],
      ["INVITADO_INACTIVO", "La invitación está inactiva."],
      ["MESA_INACTIVA", "La mesa está inactiva."],
      ["REGISTRO_DESACTUALIZADO", "La información cambió en otra sesión. Actualiza antes de continuar."],
      ["MOTIVO_INVALIDO", "Escribe el motivo administrativo."],
      ["ASIGNACION_INVALIDA", "La asignación debe contener al menos una persona."],
      ["CONFIGURACION_BLOQUEADA_ASIGNACIONES_ACTIVAS", "La configuración general está bloqueada porque ya existen asignaciones activas."],
      ["CAPACIDAD_MENOR_A_OCUPACION", error?.details || "La capacidad no puede ser menor que las personas asignadas."],
      ["CAPACIDAD_MESA_INVALIDA", "La capacidad de la mesa debe estar entre 1 y 50 lugares."],
      ["NOMBRE_MESA_INVALIDO", "El nombre de la mesa es demasiado largo."],
      ["UBICACION_MESA_INVALIDA", "La ubicación de la mesa es demasiado larga."],
      ["NOTAS_MESA_INVALIDAS", "Las notas de la mesa son demasiado largas."],
    ];

    for (const [code, text] of map) {
      if (message.includes(code)) return text;
    }

    return error?.details || "No fue posible completar la operación.";
  }

  function closeModal(overlay, previousFocus) {
    overlay.remove();
    if (!document.querySelector(".tables-modal-overlay")) {
      document.body.classList.remove("tables-modal-open");
    }
    if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function counter(label, initial, max) {
    const wrap = el("div", "tables-counter");
    const title = el("span", "tables-counter-label", label);
    const controls = el("div", "tables-counter-controls");
    const minus = button("−");
    const value = el("strong", "tables-counter-value", String(initial));
    const plus = button("+");
    const meta = el("span", "tables-counter-max", `Máx. ${max}`);

    let current = Math.max(0, Math.min(Number(initial) || 0, Number(max) || 0));

    function sync() {
      value.textContent = String(current);
      minus.disabled = current <= 0;
      plus.disabled = current >= max;
    }

    minus.addEventListener("click", () => {
      if (current <= 0) return;
      current -= 1;
      sync();
    });

    plus.addEventListener("click", () => {
      if (current >= max) return;
      current += 1;
      sync();
    });

    controls.append(minus, value, plus);
    wrap.append(title, controls, meta);
    sync();

    return {
      node: wrap,
      getValue: () => current,
      setValue: (next) => {
        current = Math.max(0, Math.min(Number(next) || 0, Number(max) || 0));
        sync();
      },
    };
  }

  function renderTableCard(item, { onDetail }) {
    const card = el("article", "tables-table-card tables-table-card-actionable");
    const head = el("div", "tables-table-card-head");
    head.append(
      el("h3", "", item.nombre || `Mesa ${item.numero}`),
      el("span", `tables-table-state tables-table-state-${item.estado}`,
        item.estado === "completa" ? "Completa" :
          item.estado === "casi_llena" ? "Casi llena" : "Disponible")
    );

    const occupancy = el("strong", "tables-table-occupancy", `${format(item.ocupados)} / ${format(item.capacidad)}`);
    const meta = el("p", "tables-table-meta", `${format(item.disponibles)} lugares disponibles`);

    const track = el("div", "tables-table-track");
    const fill = el("span", "tables-table-fill");
    fill.style.width = `${Math.max(0, Math.min(100, Number(item.porcentaje_ocupacion) || 0))}%`;
    track.append(fill);

    const detail = button("Ver mesa");
    detail.addEventListener("click", () => onDetail(item.id, detail));

    card.append(head, occupancy, meta, track, detail);
    return card;
  }


  function openEditTableModal(detail, { onUpdated }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay tables-modal-overlay-top");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const table = detail.data.mesa;

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Edición de mesa"),
      el("h2", "", table.nombre || `Mesa ${table.numero}`),
      el("p", "tables-modal-copy", `${table.ocupados} personas asignadas · ${table.disponibles} lugares disponibles`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 100;
    name.value = table.nombre || `Mesa ${table.numero}`;

    const capacity = document.createElement("input");
    capacity.type = "number";
    capacity.inputMode = "numeric";
    capacity.min = String(Math.max(1, table.ocupados));
    capacity.max = "50";
    capacity.value = String(table.capacidad);

    const location = document.createElement("input");
    location.type = "text";
    location.maxLength = 150;
    location.value = table.ubicacion || "";
    location.placeholder = "Ej. Terraza, lado izquierdo, cerca de pista";

    const notes = document.createElement("textarea");
    notes.rows = 3;
    notes.maxLength = 1000;
    notes.value = table.notas || "";
    notes.placeholder = "Notas opcionales de organización";

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio del cambio";

    const capacityHelp = el(
      "small",
      "tables-field-help",
      table.ocupados > 0
        ? `Esta mesa tiene ${table.ocupados} personas asignadas. No puede reducirse por debajo de ${table.ocupados}.`
        : "Capacidad permitida: 1 a 50 lugares."
    );

    const capacityField = el("label", "tables-field");
    capacityField.append(
      el("span", "tables-field-label", "Capacidad *"),
      capacity,
      capacityHelp
    );

    const grid = el("div", "tables-edit-grid");
    grid.append(
      field("Nombre / alias *", name),
      capacityField,
      field("Ubicación", location)
    );

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Guardar cambios", true);
    actions.append(cancel, save);

    const body = el("div", "tables-modal-body");
    body.append(
      grid,
      field("Notas", notes),
      field("Motivo del cambio *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() {
      closeModal(overlay, previousFocus);
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    save.addEventListener("click", async () => {
      const seats = Number(capacity.value);
      const motive = reason.value.trim();

      status.textContent = "";

      if (!name.value.trim()) {
        status.textContent = "Captura un nombre para la mesa.";
        name.focus();
        return;
      }

      if (!Number.isInteger(seats) || seats < Math.max(1, table.ocupados) || seats > 50) {
        status.textContent = table.ocupados > 0
          ? `La capacidad debe estar entre ${table.ocupados} y 50 lugares.`
          : "La capacidad debe estar entre 1 y 50 lugares.";
        capacity.focus();
        return;
      }

      if (!motive) {
        status.textContent = "Escribe el motivo del cambio.";
        reason.focus();
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando cambios…";

      try {
        await window.AdminTablesService.updateTable({
          tableId: table.id,
          name: name.value,
          capacity: seats,
          location: location.value,
          notes: notes.value,
          reason: motive,
          version: table.version,
        });

        dismiss();
        await onUpdated();
      } catch (error) {
        console.error("Update table:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openTableDetail(detail, { onRemove, onRefresh }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-detail-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const table = detail.data.mesa;
    const assignments = detail.data.asignaciones;

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Detalle de mesa"),
      el("h2", "", table.nombre || `Mesa ${table.numero}`),
      el("p", "tables-modal-copy", `${table.ocupados} de ${table.capacidad} lugares ocupados · ${table.disponibles} disponibles`)
    );
    const headActions = el("div", "tables-modal-head-actions");
    const edit = button("Editar mesa");
    const close = button("Cerrar");
    headActions.append(edit, close);
    head.append(copy, headActions);

    const body = el("div", "tables-modal-body");

    const summary = el("div", "tables-detail-summary");
    summary.append(
      metric("Capacidad", format(table.capacidad), "lugares"),
      metric("Ocupados", format(table.ocupados), "personas"),
      metric("Disponibles", format(table.disponibles), "lugares")
    );

    const listSection = el("section", "tables-assignment-list-section");
    listSection.append(el("h3", "", "Invitados asignados"));

    if (!assignments.length) {
      listSection.append(el("p", "tables-empty", "Todavía no hay invitados asignados a esta mesa."));
    } else {
      const list = el("div", "tables-assignment-list");

      assignments.forEach((item) => {
        const row = el("article", "tables-assignment-row");
        const info = el("div");
        info.append(
          el("strong", "", item.nombre),
          el("span", "", `${item.codigo} · ${item.grupo}`),
          el("span", "", `${item.adultos} ${item.adultos === 1 ? "adulto" : "adultos"} · ${item.ninos} ${item.ninos === 1 ? "niño" : "niños"}`)
        );

        const remove = button("Retirar");
        remove.classList.add("tables-danger-action");
        remove.addEventListener("click", () => {
          openRemoveAssignment(item, table, {
            onRemoved: async () => {
              closeModal(overlay, previousFocus);
              await onRemove();
              await onRefresh();
            },
          });
        });

        row.append(info, remove);
        list.append(row);
      });

      listSection.append(list);
    }

    if (table.ubicacion || table.notas) {
      const meta = el("section", "tables-table-notes");
      if (table.ubicacion) {
        meta.append(
          el("strong", "", "Ubicación"),
          el("p", "", table.ubicacion)
        );
      }
      if (table.notas) {
        meta.append(
          el("strong", "", "Notas"),
          el("p", "", table.notas)
        );
      }
      body.append(summary, meta, listSection);
    } else {
      body.append(summary, listSection);
    }

    edit.addEventListener("click", () => {
      openEditTableModal(detail, {
        onUpdated: async () => {
          closeModal(overlay, previousFocus);
          await onRefresh();
        },
      });
    });

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });
  }

  function openRemoveAssignment(item, table, { onRemoved }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay tables-modal-overlay-top");
    const dialog = el("section", "tables-modal tables-small-modal");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Retirar asignación"),
      el("h2", "", item.nombre),
      el("p", "tables-modal-copy", `${table.nombre || `Mesa ${table.numero}`} · ${item.adultos + item.ninos} personas`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio del retiro";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const remove = button("Retirar asignación");
    remove.classList.add("tables-danger-button");
    actions.append(cancel, remove);

    const body = el("div", "tables-modal-body");
    body.append(
      statusBox("warning", "La asignación se retirará", "El registro conservará su historial y las personas volverán a aparecer como pendientes de asignar."),
      field("Motivo del retiro *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    remove.addEventListener("click", async () => {
      const motive = reason.value.trim();
      if (!motive) {
        status.textContent = "Escribe el motivo del retiro.";
        reason.focus();
        return;
      }

      remove.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Retirando asignación…";

      try {
        await window.AdminTablesService.removeAssignment({
          assignmentId: item.asignacion_id,
          reason: motive,
          version: item.asignacion_version,
        });
        dismiss();
        await onRemoved();
      } catch (error) {
        console.error("Remove table assignment:", error);
        status.textContent = errorMessage(error);
        remove.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openAssignModal(guest, tables, { onAssigned }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-assign-modal");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Asignación de mesa"),
      el("h2", "", guest.nombre),
      el("p", "tables-modal-copy", `${guest.codigo} · ${guest.grupo}`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const body = el("div", "tables-modal-body");

    const summary = el("div", "tables-guest-assignment-summary");
    summary.append(
      metric("Confirmados", format(guest.confirmados.total), `${guest.confirmados.adultos} adultos · ${guest.confirmados.ninos} niños`),
      metric("Ya asignados", format(guest.asignados.total), `${guest.asignados.adultos} adultos · ${guest.asignados.ninos} niños`),
      metric("Pendientes", format(guest.pendientes.total), `${guest.pendientes.adultos} adultos · ${guest.pendientes.ninos} niños`)
    );

    const tableSelect = document.createElement("select");
    tableSelect.append(new Option("Selecciona una mesa", ""));
    tables.forEach((table) => {
      const option = new Option(
        `${table.nombre || `Mesa ${table.numero}`} · ${table.disponibles} disponibles`,
        String(table.id)
      );
      option.disabled = table.disponibles <= 0;
      tableSelect.append(option);
    });

    const adults = counter("Adultos", guest.pendientes.adultos, guest.pendientes.adultos);
    const children = counter("Niños", guest.pendientes.ninos, guest.pendientes.ninos);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Ej. Asignación inicial de la familia";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Asignar mesa", true);
    actions.append(cancel, save);

    const counters = el("div", "tables-assignment-counters");
    counters.append(adults.node, children.node);

    body.append(
      summary,
      field("Mesa *", tableSelect),
      counters,
      field("Motivo de la asignación *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    save.addEventListener("click", async () => {
      const tableId = Number(tableSelect.value);
      const motive = reason.value.trim();
      const adultCount = adults.getValue();
      const childCount = children.getValue();

      status.textContent = "";

      if (!tableId) {
        status.textContent = "Selecciona una mesa.";
        tableSelect.focus();
        return;
      }
      if (adultCount + childCount <= 0) {
        status.textContent = "Asigna al menos una persona.";
        return;
      }
      if (!motive) {
        status.textContent = "Escribe el motivo de la asignación.";
        reason.focus();
        return;
      }

      const selected = tables.find((item) => item.id === tableId);
      if (selected && adultCount + childCount > selected.disponibles) {
        status.textContent = `La mesa solo tiene ${selected.disponibles} lugares disponibles.`;
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando asignación…";

      try {
        await window.AdminTablesService.assign({
          tableId,
          guestId: guest.invitado_id,
          adults: adultCount,
          children: childCount,
          reason: motive,
        });
        dismiss();
        await onAssigned();
      } catch (error) {
        console.error("Assign table:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  window.AdminViews.mesas = () => {
    const root = el("section", "tables-view");

    const header = el("header", "admin-view-header tables-header");
    header.append(
      el("p", "admin-eyebrow", "Organización del evento"),
      el("h2", "", "Mesas"),
      el("p", "admin-view-copy",
        "Distribuye a los asistentes confirmados y controla la ocupación de cada mesa.")
    );

    const feedback = el("div", "tables-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;

    const content = el("div", "tables-content");
    root.append(header, feedback, content);

    let config = null;
    let summary = null;
    let tables = [];
    let pending = [];
    let requestId = 0;

    function setFeedback(type, text) {
      feedback.className = `tables-feedback${type ? ` tables-feedback-${type}` : ""}`;
      feedback.textContent = text;
      feedback.hidden = !text;
    }

    function renderInitialConfiguration() {
      const required = config?.data?.cupo_invitados_activos || 0;

      const panel = el("section", "tables-config-panel");
      const title = el("div", "tables-config-heading");
      title.append(
        el("p", "admin-eyebrow", "Configuración inicial"),
        el("h3", "", "Define las mesas de tu evento"),
        el("p", "", "Aún no has configurado las mesas. Indica cuántas tendrás y la capacidad inicial de cada una.")
      );

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.inputMode = "numeric";
      numberInput.min = "1";
      numberInput.max = "100";
      numberInput.placeholder = "Ej. 27";

      const capacityInput = document.createElement("input");
      capacityInput.type = "number";
      capacityInput.inputMode = "numeric";
      capacityInput.min = "1";
      capacityInput.max = "50";
      capacityInput.placeholder = "Ej. 10";

      const reason = document.createElement("textarea");
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.placeholder = "Ej. Configuración inicial proporcionada por el jardín";

      const formGrid = el("div", "tables-config-grid");
      formGrid.append(
        field("Número de mesas", numberInput, "Máximo 100 mesas"),
        field("Capacidad por mesa", capacityInput, "Máximo 50 personas por mesa")
      );

      const metrics = el("div", "tables-live-metrics");
      const capacityMetric = metric("Capacidad de mesas", "0", "lugares");
      const requiredMetric = metric("Cupo requerido", format(required), "invitados activos");
      const marginMetric = metric("Margen disponible", `-${format(required)}`, "faltan lugares");
      metrics.append(capacityMetric, requiredMetric, marginMetric);

      const status = el("div", "tables-capacity-slot");
      status.append(statusBox("warning", "Captura la configuración", `Necesitamos al menos ${format(required)} lugares para cubrir el cupo máximo de las invitaciones activas.`));

      const actions = el("div", "tables-config-actions");
      const save = button("Guardar configuración", true);
      save.disabled = true;
      actions.append(save);

      panel.append(title, formGrid, metrics, status, field("Motivo de la configuración *", reason), actions);
      content.replaceChildren(panel);

      function calculate() {
        const number = Number(numberInput.value);
        const perTable = Number(capacityInput.value);
        const total = Number.isInteger(number) && number > 0 && Number.isInteger(perTable) && perTable > 0
          ? number * perTable : 0;
        const margin = total - required;
        const sufficient = total >= required && total > 0;

        capacityMetric.querySelector(".tables-metric-value").textContent = format(total);
        marginMetric.querySelector(".tables-metric-value").textContent =
          margin >= 0 ? `+${format(margin)}` : `-${format(Math.abs(margin))}`;
        marginMetric.querySelector(".tables-metric-detail").textContent =
          margin >= 0 ? "lugares de margen" : "faltan lugares";

        status.replaceChildren(statusBox(
          !total ? "warning" : sufficient ? "success" : "error",
          !total ? "Captura la configuración" : sufficient ? "Capacidad suficiente" : "Capacidad insuficiente",
          !total
            ? `Necesitamos al menos ${format(required)} lugares para cubrir el cupo máximo de las invitaciones activas.`
            : sufficient
              ? `${format(total)} lugares disponibles · ${format(required)} requeridos · ${format(margin)} lugares de margen.`
              : `La configuración contempla ${format(total)} lugares, pero el padrón activo requiere ${format(required)}. Faltan ${format(Math.abs(margin))} lugares.`
        ));

        save.disabled = !sufficient || !reason.value.trim();
      }

      [numberInput, capacityInput].forEach((input) => input.addEventListener("input", calculate));
      reason.addEventListener("input", calculate);

      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await window.AdminTablesService.configure({
            numberOfTables: Number(numberInput.value),
            seatsPerTable: Number(capacityInput.value),
            reason: reason.value,
            version: null,
          });
          setFeedback("success", "Configuración de mesas creada correctamente.");
          await load();
        } catch (error) {
          setFeedback("error", errorMessage(error));
          calculate();
        }
      });
    }

    function renderConfigured() {
      const cfg = config.data;
      const sum = summary.data;

      const summaryGrid = el("div", "tables-summary-grid");
      summaryGrid.append(
        metric("Mesas activas", format(sum.mesas.activas), `${format(sum.mesas.capacidad_total)} lugares totales`),
        metric("Confirmados", format(sum.confirmados.total), `${format(sum.confirmados.adultos)} adultos · ${format(sum.confirmados.ninos)} niños`),
        metric("Asignados", format(sum.asignados.total), "personas con mesa"),
        metric("Pendientes de asignar", format(sum.pendientes_asignar), "personas por ubicar")
      );

      const configPanel = el("section", "tables-configured-panel");
      const configHead = el("div", "tables-configured-head");
      const copy = el("div");
      copy.append(
        el("p", "admin-eyebrow", "Configuración general"),
        el("h3", "", `${format(cfg.numero_mesas)} mesas · ${format(cfg.capacidad_inicial)} lugares por mesa`),
        el("p", "", `Capacidad total actual: ${format(cfg.capacidad_total_actual)} lugares · Cupo activo: ${format(cfg.cupo_invitados_activos)}.`)
      );
      configHead.append(copy);

      if (cfg.puede_reconfigurar) {
        const edit = button("Editar configuración");
        configHead.append(edit);
        edit.addEventListener("click", renderEditConfiguration);
      } else {
        configHead.append(el("span", "tables-config-locked", "Configuración general bloqueada por asignaciones activas"));
      }

      configPanel.append(
        configHead,
        statusBox(
          cfg.capacidad_suficiente ? "success" : "error",
          cfg.capacidad_suficiente ? "Capacidad suficiente" : "Capacidad insuficiente",
          cfg.margen_capacidad >= 0
            ? `${format(cfg.margen_capacidad)} lugares de margen sobre el padrón activo.`
            : `Faltan ${format(Math.abs(cfg.margen_capacidad))} lugares.`
        )
      );

      const operations = el("div", "tables-operations-grid");

      const pendingPanel = el("section", "tables-pending-panel");
      const pendingHead = el("div", "tables-section-head");
      pendingHead.append(
        el("div", "", ""),
        el("h3", "", "Pendientes de asignar"),
        el("span", "", `${format(sum.pendientes_asignar)} personas`)
      );

      const pendingList = el("div", "tables-pending-list");
      if (!pending.length) {
        pendingList.append(el("p", "tables-empty", "Todos los asistentes confirmados ya tienen mesa."));
      } else {
        pending.forEach((guest) => {
          const row = el("article", "tables-pending-row");
          const info = el("div", "tables-pending-info");
          info.append(
            el("strong", "", guest.nombre),
            el("span", "", `${guest.codigo} · ${guest.grupo}`),
            el("span", "", `Pendientes: ${guest.pendientes.adultos} adultos · ${guest.pendientes.ninos} niños`)
          );
          const assign = button("Asignar mesa", true);
          assign.addEventListener("click", () => {
            openAssignModal(guest, tables, {
              onAssigned: async () => {
                setFeedback("success", `Asignación guardada para ${guest.nombre}.`);
                await load();
              },
            });
          });
          row.append(info, assign);
          pendingList.append(row);
        });
      }
      pendingPanel.append(pendingHead, pendingList);

      const tablesPanel = el("section", "tables-list-panel");
      const tablesHead = el("div", "tables-section-head");
      tablesHead.append(
        el("div", "", ""),
        el("h3", "", "Distribución de mesas")
      );

      const grid = el("div", "tables-grid");
      tables.forEach((item) => grid.append(renderTableCard(item, {
        onDetail: async (tableId, trigger) => {
          trigger.disabled = true;
          try {
            const detail = await window.AdminTablesService.getTableDetail(tableId);
            openTableDetail(detail, {
              onRemove: async () => {
                setFeedback("success", "Asignación retirada correctamente.");
              },
              onRefresh: load,
            });
          } catch (error) {
            setFeedback("error", errorMessage(error));
          } finally {
            trigger.disabled = false;
          }
        },
      })));
      tablesPanel.append(tablesHead, grid);

      operations.append(pendingPanel, tablesPanel);
      content.replaceChildren(summaryGrid, configPanel, operations);
    }

    function renderEditConfiguration() {
      const cfg = config.data;
      if (!cfg.puede_reconfigurar) {
        setFeedback("error", "La configuración general está bloqueada porque ya existen asignaciones activas.");
        return;
      }

      const panel = el("section", "tables-config-panel");
      const title = el("div", "tables-config-heading");
      title.append(
        el("p", "admin-eyebrow", "Reconfiguración"),
        el("h3", "", "Editar configuración general"),
        el("p", "", "Puedes modificar esta carga mientras no exista ninguna asignación activa de invitados.")
      );

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.inputMode = "numeric";
      numberInput.min = "1";
      numberInput.max = "100";
      numberInput.value = String(cfg.numero_mesas);

      const capacityInput = document.createElement("input");
      capacityInput.type = "number";
      capacityInput.inputMode = "numeric";
      capacityInput.min = "1";
      capacityInput.max = "50";
      capacityInput.value = String(cfg.capacidad_inicial);

      const reason = document.createElement("textarea");
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.placeholder = "Motivo obligatorio de la reconfiguración";

      const formGrid = el("div", "tables-config-grid");
      formGrid.append(
        field("Número de mesas", numberInput),
        field("Capacidad por mesa", capacityInput)
      );

      const actions = el("div", "tables-config-actions");
      const cancel = button("Cancelar");
      const save = button("Guardar cambios", true);
      actions.append(cancel, save);

      panel.append(title, formGrid, field("Motivo del cambio *", reason), actions);
      content.replaceChildren(panel);

      function calculate() {
        const total = Number(numberInput.value) * Number(capacityInput.value);
        save.disabled = !(total >= cfg.cupo_invitados_activos && reason.value.trim());
      }
      [numberInput, capacityInput].forEach((input) => input.addEventListener("input", calculate));
      reason.addEventListener("input", calculate);
      cancel.addEventListener("click", renderConfigured);
      calculate();

      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await window.AdminTablesService.configure({
            numberOfTables: Number(numberInput.value),
            seatsPerTable: Number(capacityInput.value),
            reason: reason.value,
            version: cfg.version,
          });
          setFeedback("success", "Configuración de mesas actualizada correctamente.");
          await load();
        } catch (error) {
          setFeedback("error", errorMessage(error));
          calculate();
        }
      });
    }

    async function load() {
      const currentRequest = ++requestId;
      root.setAttribute("aria-busy", "true");
      content.replaceChildren(el("p", "tables-loading", "Cargando Mesas…"));

      try {
        const configEnvelope = await window.AdminTablesService.getConfiguration();
        if (currentRequest !== requestId || !root.isConnected) return;
        config = configEnvelope;

        if (!config.data.configurado) {
          summary = null;
          tables = [];
          pending = [];
          renderInitialConfiguration();
          return;
        }

        const [summaryResult, tablesResult, pendingResult] = await Promise.all([
          window.AdminTablesService.getSummary(),
          window.AdminTablesService.listTables(),
          window.AdminTablesService.listPending(),
        ]);

        if (currentRequest !== requestId || !root.isConnected) return;
        summary = summaryResult;
        tables = tablesResult.data.items;
        pending = pendingResult.data.items;
        renderConfigured();
      } catch (error) {
        console.error("Tables load:", error);
        content.replaceChildren(
          statusBox("error", "No fue posible cargar Mesas", "Intenta nuevamente o vuelve a iniciar sesión.")
        );
      } finally {
        if (currentRequest === requestId && root.isConnected) root.removeAttribute("aria-busy");
      }
    }

    queueMicrotask(load);
    return root;
  };
})();