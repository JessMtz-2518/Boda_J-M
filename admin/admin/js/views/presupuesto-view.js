(() => {
  "use strict";

  const fmtMoney = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const fmtDate = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

  function money(value) {
    return fmtMoney.format(Number(value) || 0);
  }

  function dateLabel(value) {
    if (!value) return "Sin fecha";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : fmtDate.format(date);
  }

  function statusLabel(value) {
    return ({
      prospecto: "Prospecto",
      contratado: "Contratado",
      liquidado: "Liquidado",
      cancelado: "Cancelado",
      pendiente: "Pendiente",
      pagado: "Pagado",
      vencido: "Vencido",
    })[value] || value;
  }

  function makeField(label, control, required = false) {
    const wrap = el("label", "finance-field");
    const caption = el("span", "", `${label}${required ? " *" : ""}`);
    wrap.append(caption, control);
    return wrap;
  }

  function makeInput(type = "text", value = "") {
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    return input;
  }

  function makeSelect(options, value) {
    const select = document.createElement("select");
    options.forEach(([key, label]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      select.append(option);
    });
    select.value = value;
    return select;
  }

  function openModal({ eyebrow, title, body, onSubmit, submitLabel }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "finance-modal-overlay");
    const dialog = el("section", "finance-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "finance-modal-head");
    const copy = el("div");
    copy.append(el("p", "admin-eyebrow", eyebrow), el("h2", "", title));
    const close = button("Cerrar");
    head.append(copy, close);

    const form = document.createElement("form");
    form.className = "finance-form";
    const status = el("p", "finance-form-status");
    const actions = el("div", "finance-form-actions");
    const cancel = button("Cancelar");
    const save = button(submitLabel, true);
    save.type = "submit";
    actions.append(cancel, save);
    form.append(body, status, actions);

    dialog.append(head, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("finance-modal-open");

    function dismiss() {
      overlay.remove();
      document.body.classList.remove("finance-modal-open");
      if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      }
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) dismiss();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando…";

      try {
        await onSubmit();
        dismiss();
      } catch (error) {
        status.textContent = error?.message || "No fue posible guardar la información.";
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function budgetModal(state, refresh) {
    const body = el("div", "finance-form-grid finance-form-grid-single");
    const total = makeInput("number", state.summary.budget);
    total.min = "0";
    total.step = "100";
    total.inputMode = "decimal";
    body.append(makeField("Presupuesto total (MXN)", total, true));

    openModal({
      eyebrow: "Wedding planner",
      title: "Presupuesto de la boda",
      body,
      submitLabel: "Guardar presupuesto",
      onSubmit: async () => {
        await window.AdminFinanceService.saveBudget(total.value);
        await refresh();
      },
    });
  }

  function vendorModal(vendor, refresh) {
    const editing = Boolean(vendor);
    const body = el("div", "finance-form-grid");

    const name = makeInput("text", vendor?.name || "");
    const category = makeInput("text", vendor?.category || "");
    const contact = makeInput("text", vendor?.contact || "");
    const phone = makeInput("tel", vendor?.phone || "");
    const email = makeInput("email", vendor?.email || "");
    const cost = makeInput("number", vendor?.totalCost ?? 0);
    cost.min = "0";
    cost.step = "100";
    const status = makeSelect([
      ["prospecto", "Prospecto"],
      ["contratado", "Contratado"],
      ["liquidado", "Liquidado"],
      ["cancelado", "Cancelado"],
    ], vendor?.status || "prospecto");

    const notes = document.createElement("textarea");
    notes.rows = 4;
    notes.maxLength = 2000;
    notes.value = vendor?.notes || "";

    body.append(
      makeField("Proveedor", name, true),
      makeField("Categoría", category, true),
      makeField("Contacto", contact),
      makeField("Teléfono", phone),
      makeField("Correo", email),
      makeField("Costo total", cost, true),
      makeField("Estado", status, true)
    );

    const notesWrap = makeField("Notas", notes);
    notesWrap.classList.add("finance-field-wide");
    body.append(notesWrap);

    openModal({
      eyebrow: "Wedding planner",
      title: editing ? "Editar proveedor" : "Nuevo proveedor",
      body,
      submitLabel: editing ? "Guardar cambios" : "Agregar proveedor",
      onSubmit: async () => {
        await window.AdminFinanceService.saveVendor({
          id: vendor?.id,
          name: name.value,
          category: category.value,
          contact: contact.value,
          phone: phone.value,
          email: email.value,
          totalCost: cost.value,
          status: status.value,
          notes: notes.value,
        });
        await refresh();
      },
    });
  }

  function paymentModal(payment, state, refresh) {
    const editing = Boolean(payment);
    const body = el("div", "finance-form-grid");

    const vendor = makeSelect([["", "Sin proveedor"]].concat(
      state.vendors
        .filter((item) => item.status !== "cancelado")
        .map((item) => [String(item.id), item.name])
    ), payment?.vendorId ? String(payment.vendorId) : "");

    const concept = makeInput("text", payment?.concept || "");
    const amount = makeInput("number", payment?.amount || "");
    amount.min = "0.01";
    amount.step = "0.01";
    const dueDate = makeInput("date", payment?.dueDate || "");
    const paidDate = makeInput("date", payment?.paidDate || "");
    const status = makeSelect([
      ["pendiente", "Pendiente"],
      ["pagado", "Pagado"],
      ["cancelado", "Cancelado"],
    ], payment?.status || "pendiente");

    const notes = document.createElement("textarea");
    notes.rows = 4;
    notes.maxLength = 1500;
    notes.value = payment?.notes || "";

    function syncPaidDate() {
      paidDate.disabled = status.value !== "pagado";
      if (status.value !== "pagado") paidDate.value = "";
    }
    status.addEventListener("change", syncPaidDate);
    syncPaidDate();

    body.append(
      makeField("Proveedor", vendor),
      makeField("Concepto", concept, true),
      makeField("Monto", amount, true),
      makeField("Fecha límite", dueDate, true),
      makeField("Estado", status, true),
      makeField("Fecha de pago", paidDate)
    );

    const notesWrap = makeField("Notas", notes);
    notesWrap.classList.add("finance-field-wide");
    body.append(notesWrap);

    openModal({
      eyebrow: "Calendario de pagos",
      title: editing ? "Editar pago" : "Nuevo pago",
      body,
      submitLabel: editing ? "Guardar cambios" : "Agregar pago",
      onSubmit: async () => {
        await window.AdminFinanceService.savePayment({
          id: payment?.id,
          vendorId: vendor.value || null,
          concept: concept.value,
          amount: amount.value,
          dueDate: dueDate.value,
          paidDate: paidDate.value,
          status: status.value,
          notes: notes.value,
        });
        await refresh();
      },
    });
  }

  function metric(label, value, detail, tone = "") {
    const card = el("article", `finance-metric${tone ? ` finance-metric-${tone}` : ""}`);
    card.append(
      el("span", "finance-metric-label", label),
      el("strong", "finance-metric-value", value),
      el("span", "finance-metric-detail", detail)
    );
    return card;
  }

  function renderSummary(root, state, actions) {
    const panel = el("section", "finance-panel");
    const head = el("div", "finance-panel-head");
    head.append(el("h3", "", "Panorama financiero"));
    const editBudget = button("Editar presupuesto");
    editBudget.addEventListener("click", actions.editBudget);
    head.append(editBudget);
    panel.append(head);

    const progress = el("div", "finance-budget-progress");
    const committed = Math.max(0, Math.min(100, state.summary.committedPercent));
    const paid = Math.max(0, Math.min(100, state.summary.paidPercent));

    const labels = el("div", "finance-progress-labels");
    labels.append(
      el("span", "", `${committed}% comprometido`),
      el("span", "", `${paid}% pagado`)
    );
    const track = el("div", "finance-progress-track");
    const committedBar = el("span", "finance-progress-committed");
    committedBar.style.width = `${committed}%`;
    const paidBar = el("span", "finance-progress-paid");
    paidBar.style.width = `${paid}%`;
    track.append(committedBar, paidBar);
    progress.append(labels, track);
    panel.append(progress);

    const lower = el("div", "finance-summary-grid");

    const upcoming = el("article", "finance-subpanel");
    upcoming.append(el("h3", "", "Próximos pagos"));
    const upcomingItems = state.payments
      .filter((p) => p.status === "pendiente")
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);

    if (!upcomingItems.length) {
      upcoming.append(el("p", "finance-empty", "No hay pagos pendientes registrados."));
    } else {
      upcomingItems.forEach((payment) => {
        const row = el("div", "finance-upcoming-row");
        const copy = el("div");
        copy.append(
          el("strong", "", payment.concept),
          el("span", "", `${payment.vendorName || "Sin proveedor"} · ${dateLabel(payment.dueDate)}`)
        );
        row.append(copy, el("strong", "", money(payment.amount)));
        if (payment.displayStatus === "vencido") row.classList.add("is-overdue");
        upcoming.append(row);
      });
    }

    const categories = el("article", "finance-subpanel");
    categories.append(el("h3", "", "Contratado por categoría"));
    const grouped = new Map();
    state.vendors
      .filter((v) => ["contratado", "liquidado"].includes(v.status))
      .forEach((v) => grouped.set(v.category, (grouped.get(v.category) || 0) + v.totalCost));

    if (!grouped.size) {
      categories.append(el("p", "finance-empty", "Aún no hay proveedores contratados."));
    } else {
      [...grouped.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, amount]) => {
          const row = el("div", "finance-category-row");
          row.append(el("span", "", category), el("strong", "", money(amount)));
          categories.append(row);
        });
    }

    lower.append(upcoming, categories);
    root.append(panel, lower);
  }

  function renderVendors(root, state, actions) {
    const panel = el("section", "finance-panel");
    const head = el("div", "finance-panel-head");
    head.append(el("h3", "", "Proveedores"));
    const add = button("Agregar proveedor", true);
    add.addEventListener("click", () => actions.editVendor(null));
    head.append(add);
    panel.append(head);

    if (!state.vendors.length) {
      panel.append(el("p", "finance-empty finance-empty-large", "Aún no has agregado proveedores."));
      root.append(panel);
      return;
    }

    const grid = el("div", "finance-vendor-grid");
    state.vendors.forEach((vendor) => {
      const card = el("article", "finance-vendor-card");
      const top = el("div", "finance-vendor-top");
      const copy = el("div");
      copy.append(
        el("span", `finance-status finance-status-${vendor.status}`, statusLabel(vendor.status)),
        el("h3", "", vendor.name),
        el("p", "", vendor.category)
      );
      top.append(copy);

      const figures = el("div", "finance-vendor-figures");
      figures.append(
        el("span", "", `Costo ${money(vendor.totalCost)}`),
        el("span", "", `Pagado ${money(vendor.paid)}`),
        el("strong", "", `Saldo ${money(vendor.balance)}`)
      );

      const meta = el("div", "finance-vendor-meta");
      if (vendor.contact) meta.append(el("span", "", vendor.contact));
      if (vendor.phone) meta.append(el("span", "", vendor.phone));
      if (vendor.email) meta.append(el("span", "", vendor.email));

      const actionsWrap = el("div", "finance-card-actions");
      const edit = button("Editar");
      edit.addEventListener("click", () => actions.editVendor(vendor));
      const remove = button("Eliminar");
      remove.addEventListener("click", () => actions.removeVendor(vendor));
      actionsWrap.append(edit, remove);

      card.append(top, figures, meta, actionsWrap);
      grid.append(card);
    });

    panel.append(grid);
    root.append(panel);
  }

  function renderPayments(root, state, actions) {
    const panel = el("section", "finance-panel");
    const head = el("div", "finance-panel-head");
    head.append(el("h3", "", "Calendario de pagos"));
    const add = button("Agregar pago", true);
    add.addEventListener("click", () => actions.editPayment(null));
    head.append(add);
    panel.append(head);

    if (!state.payments.length) {
      panel.append(el("p", "finance-empty finance-empty-large", "Aún no has registrado pagos."));
      root.append(panel);
      return;
    }

    const tableWrap = el("div", "finance-table-wrap");
    const table = document.createElement("table");
    table.className = "finance-table";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Fecha", "Concepto", "Proveedor", "Monto", "Estado", "Acciones"].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      trh.append(th);
    });
    thead.append(trh);
    const tbody = document.createElement("tbody");

    state.payments.forEach((payment) => {
      const tr = document.createElement("tr");
      if (payment.displayStatus === "vencido") tr.classList.add("is-overdue");

      const values = [
        dateLabel(payment.dueDate),
        payment.concept,
        payment.vendorName || "—",
        money(payment.amount),
      ];
      values.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });

      const statusTd = document.createElement("td");
      statusTd.append(el("span", `finance-status finance-status-${payment.displayStatus}`, statusLabel(payment.displayStatus)));
      tr.append(statusTd);

      const actionsTd = document.createElement("td");
      const actionsWrap = el("div", "finance-table-actions");
      const edit = button("Editar");
      edit.addEventListener("click", () => actions.editPayment(payment));
      const remove = button("Eliminar");
      remove.addEventListener("click", () => actions.removePayment(payment));
      actionsWrap.append(edit, remove);
      actionsTd.append(actionsWrap);
      tr.append(actionsTd);

      tbody.append(tr);
    });

    table.append(thead, tbody);
    tableWrap.append(table);
    panel.append(tableWrap);
    root.append(panel);
  }

  window.AdminViews = window.AdminViews || {};

  window.AdminViews.presupuesto = function renderFinanceView() {
    const root = el("section", "finance-view");
    const header = el("header", "finance-heading");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Wedding command center"),
      el("h2", "", "Presupuesto & Proveedores"),
      el("p", "admin-view-copy", "Controla presupuesto, contratos y fechas de pago desde un solo lugar.")
    );
    const refreshButton = button("Actualizar", true);
    header.append(copy, refreshButton);

    const status = el("p", "finance-global-status");
    const metrics = el("div", "finance-metrics");
    const tabs = el("div", "finance-tabs");
    const content = el("div", "finance-content");
    root.append(header, status, metrics, tabs, content);

    let state = {
      summary: {
        budget: 0,
        contracted: 0,
        paid: 0,
        pendingPayment: 0,
        available: 0,
        committedPercent: 0,
        paidPercent: 0,
      },
      vendors: [],
      payments: [],
    };
    let activeTab = "resumen";

    function drawMetrics() {
      metrics.replaceChildren(
        metric("Presupuesto", money(state.summary.budget), "monto planeado"),
        metric("Contratado", money(state.summary.contracted), `${state.summary.committedPercent}% del presupuesto`, "soft"),
        metric("Pagado", money(state.summary.paid), `${state.summary.paidPercent}% del presupuesto`),
        metric("Pendiente de pago", money(state.summary.pendingPayment), "saldo contratado", "soft"),
        metric("Disponible", money(state.summary.available), state.summary.available < 0 ? "presupuesto excedido" : "sin comprometer", state.summary.available < 0 ? "warning" : "")
      );
    }

    const actions = {
      editBudget: () => budgetModal(state, load),
      editVendor: (vendor) => vendorModal(vendor, load),
      editPayment: (payment) => paymentModal(payment, state, load),
      removeVendor: async (vendor) => {
        if (!window.confirm(`¿Eliminar "${vendor.name}"?`)) return;
        try {
          await window.AdminFinanceService.deleteVendor(vendor.id);
          await load();
        } catch (error) {
          status.textContent = error?.message?.includes("PROVEEDOR_CON_PAGOS")
            ? "Este proveedor tiene pagos registrados. Elimina o reasigna esos pagos antes de eliminarlo."
            : (error?.message || "No fue posible eliminar el proveedor.");
        }
      },
      removePayment: async (payment) => {
        if (!window.confirm(`¿Eliminar el pago "${payment.concept}"?`)) return;
        try {
          await window.AdminFinanceService.deletePayment(payment.id);
          await load();
        } catch (error) {
          status.textContent = error?.message || "No fue posible eliminar el pago.";
        }
      },
    };

    function drawContent() {
      content.replaceChildren();
      if (activeTab === "proveedores") renderVendors(content, state, actions);
      else if (activeTab === "pagos") renderPayments(content, state, actions);
      else renderSummary(content, state, actions);
    }

    function drawTabs() {
      tabs.replaceChildren();
      [
        ["resumen", "Resumen"],
        ["proveedores", "Proveedores"],
        ["pagos", "Pagos"],
      ].forEach(([key, label]) => {
        const tab = button(label);
        tab.className = `finance-tab${activeTab === key ? " is-active" : ""}`;
        tab.setAttribute("aria-pressed", activeTab === key ? "true" : "false");
        tab.addEventListener("click", () => {
          activeTab = key;
          drawTabs();
          drawContent();
        });
        tabs.append(tab);
      });
    }

    async function load() {
      refreshButton.disabled = true;
      status.textContent = "Actualizando información…";
      try {
        state = await window.AdminFinanceService.getSummary();
        status.textContent = "";
        drawMetrics();
        drawContent();
      } catch (error) {
        status.textContent = error?.message || "No fue posible cargar la información financiera.";
      } finally {
        refreshButton.disabled = false;
      }
    }

    refreshButton.addEventListener("click", load);
    drawTabs();
    drawMetrics();
    drawContent();
    queueMicrotask(load);

    return root;
  };
})();
