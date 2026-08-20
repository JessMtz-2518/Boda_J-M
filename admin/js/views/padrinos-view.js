(() => {
  "use strict";

  const STATUS = Object.freeze({
    por_definir: "Por definir",
    confirmado: "Confirmado",
  });

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

  function option(value, text, selected = false) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = text;
    node.selected = selected;
    return node;
  }

  function metric(label, value, detail) {
    const card = el("article", "godparents-metric");
    card.append(
      el("span", "godparents-metric-label", label),
      el("strong", "godparents-metric-value", String(value)),
      el("small", "godparents-metric-detail", detail)
    );
    return card;
  }

  function friendlyError(error) {
    const raw = String(error?.message || "");
    if (raw.includes("TIPO_PADRINO_INVALIDO")) return "Escribe un nombre válido para este padrino.";
    if (raw.includes("ESTADO_PADRINO_INVALIDO")) return "Selecciona un estado válido.";
    if (raw.includes("NOMBRES_PADRINOS_INVALIDOS")) return "Los nombres de los padrinos son demasiado largos.";
    return error?.details || error?.message || "No fue posible guardar la información del padrino.";
  }

  function openEditor(item, guests, reload) {
    const overlay = el("div", "godparents-modal-overlay");
    const modal = el("section", "godparents-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const head = el("header", "godparents-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "PADRINOS"),
      el("h2", "", item ? "Editar padrino" : "Agregar padrino")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const form = document.createElement("form");
    form.className = "godparents-form";

    const type = document.createElement("input");
    type.required = true;
    type.maxLength = 100;
    type.value = item?.tipo || "";
    type.placeholder = "Ej. Anillos";

    const status = document.createElement("select");
    Object.entries(STATUS).forEach(([value, label]) => {
      status.append(option(value, label, value === (item?.estado || "por_definir")));
    });

    const invitation = document.createElement("select");
    invitation.append(option("", "Sin invitación vinculada", !item?.invitacion_id));
    guests.forEach((guest) => {
      const label = `${guest.nombre} · ${guest.grupo}`;
      invitation.append(
        option(
          String(guest.invitado_id),
          label,
          Number(guest.invitado_id) === Number(item?.invitacion_id)
        )
      );
    });

    const names = document.createElement("input");
    names.maxLength = 250;
    names.value = item?.nombres_padrinos || "";
    names.placeholder = "Ej. Laura y Jorge";

    const notes = document.createElement("textarea");
    notes.rows = 4;
    notes.maxLength = 2000;
    notes.placeholder = "Acuerdos, detalles, qué llevarán o cualquier recordatorio…";
    notes.value = item?.notas || "";

    function field(label, control, wide = false) {
      const wrap = el("label", `godparents-field${wide ? " godparents-field-wide" : ""}`);
      wrap.append(el("span", "", label), control);
      return wrap;
    }

    const grid = el("div", "godparents-form-grid");
    grid.append(
      field("Tipo de padrinos *", type),
      field("Estado", status),
      field("Invitación vinculada", invitation, true),
      field("Nombre(s) de los padrinos", names, true),
      field("Notas", notes, true)
    );

    const feedback = el("p", "godparents-form-status");
    const actions = el("div", "godparents-form-actions");
    const cancel = button("Cancelar");
    const save = button(item ? "Guardar cambios" : "Agregar padrino", true);
    save.type = "submit";
    actions.append(cancel, save);

    form.append(grid, feedback, actions);
    modal.append(head, form);
    overlay.append(modal);
    document.body.append(overlay);
    document.body.classList.add("godparents-modal-open");

    function dismiss() {
      overlay.remove();
      document.body.classList.remove("godparents-modal-open");
    }

    close.onclick = dismiss;
    cancel.onclick = dismiss;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      save.disabled = close.disabled = cancel.disabled = true;
      feedback.textContent = "Guardando…";

      const linked = guests.find(
        (guest) => Number(guest.invitado_id) === Number(invitation.value)
      );

      try {
        await window.AdminGodparentsService.save({
          id: item?.id,
          type: type.value,
          status: status.value,
          invitationId: invitation.value,
          invitationName: linked?.nombre || "",
          names: names.value,
          notes: notes.value,
        });
        dismiss();
        await reload();
      } catch (error) {
        feedback.textContent = friendlyError(error);
        save.disabled = close.disabled = cancel.disabled = false;
      }
    });
  }

  function card(item, guests, reload) {
    const node = el("article", `godparents-card godparents-card-${item.estado}`);
    const head = el("div", "godparents-card-head");
    const copy = el("div");
    copy.append(
      el("span", "godparents-card-eyebrow", "PADRINOS"),
      el("h3", "", item.tipo)
    );
    head.append(
      copy,
      el(
        "span",
        `godparents-status godparents-status-${item.estado}`,
        STATUS[item.estado] || item.estado
      )
    );

    const people = el("div", "godparents-people");

    if (item.invitacion_nombre) {
      people.append(
        el("div", "godparents-person", `Invitación · ${item.invitacion_nombre}`)
      );
    } else {
      people.append(
        el("div", "godparents-person godparents-person-empty", "Sin invitación vinculada")
      );
    }

    if (item.nombres_padrinos) {
      people.append(
        el("div", "godparents-person", `Padrinos · ${item.nombres_padrinos}`)
      );
    }

    if (item.notas) {
      people.append(el("p", "godparents-notes", item.notas));
    }

    const footer = el("footer", "godparents-card-footer");
    const edit = button("Editar");
    const disable = button("Deshabilitar");
    disable.classList.add("godparents-disable");

    edit.onclick = () => openEditor(item, guests, reload);
    disable.onclick = async () => {
      if (!confirm(`¿Deshabilitar "${item.tipo}"? Podrás habilitarlo nuevamente después.`)) return;
      disable.disabled = true;
      try {
        await window.AdminGodparentsService.setActive(item.id, false);
        await reload();
      } catch (error) {
        alert(friendlyError(error));
        disable.disabled = false;
      }
    };

    footer.append(edit, disable);
    node.append(head, people, footer);
    return node;
  }

  function openDisabled(data, reload) {
    const overlay = el("div", "godparents-modal-overlay");
    const modal = el("section", "godparents-modal godparents-disabled-modal");
    const head = el("header", "godparents-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "PADRINOS"),
      el("h2", "", "Padrinos deshabilitados")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const list = el("div", "godparents-disabled-list");
    const disabled = data.items.filter((item) => !item.activo);

    if (!disabled.length) {
      list.append(el("p", "godparents-empty", "No hay padrinos deshabilitados."));
    } else {
      disabled.forEach((item) => {
        const row = el("article", "godparents-disabled-row");
        row.append(el("strong", "", item.tipo));
        const enable = button("Habilitar", true);
        enable.onclick = async () => {
          enable.disabled = true;
          try {
            await window.AdminGodparentsService.setActive(item.id, true);
            overlay.remove();
            document.body.classList.remove("godparents-modal-open");
            await reload();
          } catch (error) {
            alert(friendlyError(error));
            enable.disabled = false;
          }
        };
        row.append(enable);
        list.append(row);
      });
    }

    modal.append(head, list);
    overlay.append(modal);
    document.body.append(overlay);
    document.body.classList.add("godparents-modal-open");

    close.onclick = () => {
      overlay.remove();
      document.body.classList.remove("godparents-modal-open");
    };
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.padrinos = function padrinosView() {
    const root = el("section", "godparents-view");

    const heading = el("header", "admin-view-header godparents-heading");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "WEDDING COMMAND CENTER"),
      el("h2", "", "Padrinos"),
      el(
        "p",
        "admin-view-copy",
        "Organiza los padrinos de la boda, quiénes serán y cuáles aún faltan por definir."
      )
    );

    const actions = el("div", "godparents-heading-actions");
    const disabled = button("DESHABILITADOS");
    const add = button("AGREGAR PADRINO", true);
    actions.append(disabled, add);
    heading.append(copy, actions);

    const metrics = el("div", "godparents-metrics");
    const toolbar = el("div", "godparents-toolbar");

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Buscar padrino, invitación o persona…";

    const filter = document.createElement("select");
    filter.append(option("", "Todos los estados"));
    Object.entries(STATUS).forEach(([value, label]) => filter.append(option(value, label)));

    toolbar.append(search, filter);

    const status = el("p", "godparents-load-status", "Cargando padrinos…");
    const grid = el("div", "godparents-grid");
    root.append(heading, metrics, toolbar, status, grid);

    let data = null;
    let guests = [];

    function render() {
      if (!data) return;

      const summary = data.summary || {};
      metrics.replaceChildren(
        metric("TOTAL", summary.total || 0, "padrinos activos"),
        metric("CONFIRMADOS", summary.confirmados || 0, "ya definidos"),
        metric("POR DEFINIR", summary.por_definir || 0, "pendientes")
      );

      const term = search.value.trim().toLowerCase();
      const state = filter.value;

      const items = data.items
        .filter((item) => item.activo)
        .filter((item) => !state || item.estado === state)
        .filter((item) => {
          if (!term) return true;
          return `${item.tipo} ${item.invitacion_nombre || ""} ${item.nombres_padrinos || ""}`
            .toLowerCase()
            .includes(term);
        });

      grid.replaceChildren();

      if (!items.length) {
        grid.append(
          el("p", "godparents-empty", "No hay padrinos que coincidan con los filtros.")
        );
      } else {
        items.forEach((item) => grid.append(card(item, guests, load)));
      }
    }

    async function load() {
      status.hidden = false;
      status.textContent = "Cargando padrinos…";
      add.disabled = true;

      try {
        const [summary, guestList] = await Promise.all([
          window.AdminGodparentsService.getSummary(),
          window.AdminGodparentsService.listAllActiveGuests(),
        ]);

        data = summary;
        guests = guestList;
        status.hidden = true;
        add.disabled = false;
        render();
      } catch (error) {
        console.error("Padrinos:", error);
        status.hidden = false;
        status.textContent = "No fue posible cargar Padrinos.";
      }
    }

    search.oninput = render;
    filter.onchange = render;
    add.onclick = () => openEditor(null, guests, load);
    disabled.onclick = () => data && openDisabled(data, load);

    queueMicrotask(load);
    return root;
  };
})();