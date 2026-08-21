(() => {
  "use strict";

  const fmtMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const fmtDate = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

  const STATUS = Object.freeze({
    sin_contrato: "Sin contrato",
    en_revision: "En revisión",
    por_firmar: "Por firmar",
    firmado: "Firmado",
    no_requiere: "No requiere",
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

  function dateLabel(value) {
    if (!value) return "Sin fecha";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : fmtDate.format(date);
  }

  function input(type, value = "") {
    const control = document.createElement("input");
    control.type = type;
    control.value = value || "";
    return control;
  }

  function selectStatus(value) {
    const control = document.createElement("select");
    Object.entries(STATUS).forEach(([key, label]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      control.append(option);
    });
    control.value = value || "sin_contrato";
    return control;
  }

  function field(label, control, wide = false) {
    const wrap = el("label", `contracts-field${wide ? " contracts-field-wide" : ""}`);
    wrap.append(el("span", "", label), control);
    return wrap;
  }

  function textarea(value, placeholder) {
    const control = document.createElement("textarea");
    control.rows = 4;
    control.maxLength = 2500;
    control.value = value || "";
    control.placeholder = placeholder;
    return control;
  }

  function errorText(error) {
    const raw = `${error?.message || ""} ${error?.details || ""}`;
    if (raw.includes("CONTRATO_FECHA_FIRMA_REQUERIDA")) return "Captura la fecha de firma para marcar el contrato como firmado.";
    if (raw.includes("CONTRATO_CONDICIONES_INVALIDAS")) return "Las condiciones importantes son demasiado extensas.";
    if (raw.includes("CONTRATO_CANCELACION_INVALIDA")) return "La política de cancelación es demasiado extensa.";
    if (raw.includes("PROVEEDOR_NO_ENCONTRADO")) return "El proveedor ya no está disponible.";
    return error?.details || error?.message || "No fue posible guardar la información contractual.";
  }

  function financialLine(item) {
    const wrap = el("div", "contracts-financial-strip");
    const blocks = [
      ["Costo contratado", fmtMoney.format(item.totalCost)],
      ["Anticipo pagado", fmtMoney.format(item.advancePaid)],
      ["Pagado", fmtMoney.format(item.paidTotal)],
      ["Saldo pendiente", fmtMoney.format(item.balance)],
    ];
    blocks.forEach(([label, value]) => {
      const block = el("div", "contracts-financial-item");
      block.append(el("span", "", label), el("strong", "", value));
      wrap.append(block);
    });
    return wrap;
  }

  function nextPaymentBox(item) {
    const box = el("div", `contracts-next-payment${item.nextPaymentOverdue ? " is-overdue" : ""}`);
    if (!item.nextPaymentDate) {
      box.append(el("span", "", "Próximo pago"), el("strong", "", "Sin pagos pendientes programados"));
      return box;
    }
    box.append(
      el("span", "", item.nextPaymentOverdue ? "Pago vencido" : "Próximo pago"),
      el("strong", "", `${item.nextPaymentConcept || "Pago"} · ${fmtMoney.format(item.nextPaymentAmount)}`),
      el("small", "", dateLabel(item.nextPaymentDate))
    );
    return box;
  }

  function openContractModal(item, onSaved) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "contracts-modal-overlay");
    const dialog = el("section", "contracts-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "contracts-modal-head");
    const copy = el("div");
    copy.append(el("p", "admin-eyebrow", "Control contractual"), el("h2", "", item.vendorName));
    const close = button("Cerrar");
    head.append(copy, close);

    const form = document.createElement("form");
    form.className = "contracts-form";
    const grid = el("div", "contracts-form-grid");
    const status = selectStatus(item.status);
    const signed = input("date", item.signedDate);
    const signatureDue = input("date", item.signatureDueDate);
    const validUntil = input("date", item.validUntil);
    const conditions = textarea(item.conditions, "Horarios, entregables, restricciones, servicios incluidos o condiciones que debas recordar…");
    const cancellation = textarea(item.cancellationPolicy, "Penalizaciones, devoluciones, cambios de fecha o condiciones de cancelación…");
    const notes = textarea(item.notes, "Acuerdos especiales, conversaciones importantes o recordatorios internos…");

    grid.append(
      field("Estado del contrato", status),
      field("Fecha límite acordada para firma", signatureDue),
      field("Fecha de firma", signed),
      field("Fecha del evento / servicio", validUntil),
      field("Condiciones importantes", conditions, true),
      field("Política de cancelación", cancellation, true),
      field("Notas y acuerdos especiales", notes, true)
    );

    const finance = el("div", "contracts-modal-finance-block");
    finance.append(
      el("p", "contracts-modal-section-title", "Resumen financiero vinculado a Presupuesto"),
      financialLine(item),
      nextPaymentBox(item)
    );

    const feedback = el("p", "contracts-form-status");
    const actions = el("div", "contracts-form-actions");
    const cancel = button("Cancelar");
    const save = button("Guardar contrato", true);
    save.type = "submit";
    actions.append(cancel, save);
    form.append(finance, grid, feedback, actions);

    dialog.append(head, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("contracts-modal-open");

    function dismiss() {
      overlay.remove();
      document.body.classList.remove("contracts-modal-open");
      if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });

    function syncContractFields() {
      const isSigned = status.value === "firmado";
      const hasSignatureProcess = ["en_revision", "por_firmar", "firmado"].includes(status.value);

      signed.required = isSigned;
      signed.disabled = !isSigned;
      signatureDue.disabled = !hasSignatureProcess;

      if (!isSigned) signed.value = "";
      if (!hasSignatureProcess) signatureDue.value = "";
    }

    status.addEventListener("change", syncContractFields);
    syncContractFields();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      feedback.textContent = "Guardando…";
      try {
        await window.AdminContractsService.saveContract({
          vendorId: item.vendorId,
          status: status.value,
          signedDate: signed.value,
          signatureDueDate: signatureDue.value,
          validUntil: validUntil.value,
          conditions: conditions.value,
          cancellationPolicy: cancellation.value,
          notes: notes.value,
        });
        window.dispatchEvent(new CustomEvent("admin:alerts-refresh"));
        dismiss();
        await onSaved();
      } catch (error) {
        feedback.textContent = errorText(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function metric(label, value, detail) {
    const card = el("article", "contracts-metric");
    card.append(el("span", "", label), el("strong", "", String(value)), el("small", "", detail));
    return card;
  }

  function textPreview(label, value) {
    if (!value) return null;
    const box = el("div", "contracts-note-preview");
    box.append(el("span", "", label), el("p", "", value));
    return box;
  }

  function vendorCard(item, onEdit) {
    const card = el("article", `contracts-card contracts-card-${item.status}`);
    const head = el("div", "contracts-card-head");
    const title = el("div");
    title.append(el("span", "contracts-card-category", item.category), el("h3", "", item.vendorName));
    const badge = el("span", `contracts-status contracts-status-${item.status}`, STATUS[item.status] || item.status);
    head.append(title, badge);
    card.append(head, financialLine(item), nextPaymentBox(item));

    const dates = el("div", "contracts-card-details");

    if (item.status === "firmado") {
      const signedText = item.signedDate ? `Firmado: ${dateLabel(item.signedDate)}` : "Firmado";
      const serviceText = item.validUntil ? `Servicio: ${dateLabel(item.validUntil)}` : "Servicio: sin fecha";
      dates.append(el("span", "", `${signedText} · ${serviceText}`));
    } else if (["en_revision", "por_firmar"].includes(item.status)) {
      dates.append(
        el(
          "span",
          "",
          item.signatureDueDate
            ? `Firma límite: ${dateLabel(item.signatureDueDate)}`
            : "Sin fecha límite de firma"
        )
      );
      if (item.validUntil) dates.append(el("span", "", `Servicio: ${dateLabel(item.validUntil)}`));
    } else {
      dates.append(
        el(
          "span",
          "",
          item.validUntil ? `Servicio: ${dateLabel(item.validUntil)}` : "Servicio: sin fecha"
        )
      );
    }

    card.append(dates);

    const previews = el("div", "contracts-card-previews");
    [
      textPreview("Condiciones", item.conditions),
      textPreview("Cancelación", item.cancellationPolicy),
      textPreview("Acuerdos", item.notes),
    ].filter(Boolean).forEach((node) => previews.append(node));
    if (previews.childElementCount) card.append(previews);

    const footer = el("footer", "contracts-card-footer");
    const contact = item.contact || item.phone || item.email || "Sin contacto registrado";
    footer.append(el("span", "", contact));
    const edit = button(item.contractId ? "Editar contrato" : "Configurar contrato");
    edit.addEventListener("click", () => onEdit(item));
    footer.append(edit);
    card.append(footer);
    return card;
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.contratos = function contratosView() {
    const root = el("section", "contracts-view");
    const heading = el("header", "contracts-heading");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Wedding Command Center"),
      el("h2", "", "Contratos"),
      el("p", "admin-view-copy", "Controla contratos, acuerdos, condiciones y compromisos financieros de tus proveedores desde un solo lugar.")
    );
    const refresh = button("Actualizar");
    heading.append(copy, refresh);

    const metrics = el("div", "contracts-metrics");
    const toolbar = el("div", "contracts-toolbar");
    const search = input("search");
    search.placeholder = "Buscar proveedor o categoría…";
    const filter = document.createElement("select");
    [["all","Todos los estados"], ...Object.entries(STATUS)].forEach(([key,label]) => {
      const option = document.createElement("option"); option.value = key; option.textContent = label; filter.append(option);
    });
    toolbar.append(search, filter);

    const status = el("p", "contracts-load-status", "Cargando contratos…");
    const list = el("div", "contracts-grid");
    root.append(heading, metrics, toolbar, status, list);

    let data = null;

    function renderList() {
      if (!data) return;
      const term = search.value.trim().toLowerCase();
      const state = filter.value;
      const items = data.contracts.filter((item) => {
        const matchesTerm = !term || `${item.vendorName} ${item.category} ${item.contact}`.toLowerCase().includes(term);
        const matchesState = state === "all" || item.status === state;
        return matchesTerm && matchesState;
      });
      list.replaceChildren();
      if (!items.length) {
        list.append(el("p", "contracts-empty", "No hay proveedores que coincidan con los filtros."));
        return;
      }
      items.forEach((item) => list.append(vendorCard(item, (selected) => openContractModal(selected, load))));
    }

    async function load() {
      status.hidden = false;
      status.textContent = "Cargando contratos…";
      refresh.disabled = true;
      try {
        data = await window.AdminContractsService.getSummary();
        const s = data.summary;
        metrics.replaceChildren(
          metric("Proveedores", s.totalVendors, "Activos en presupuesto"),
          metric("Firmados", s.signed, "Contrato formalizado"),
          metric("Por firmar", s.awaitingSignature, "Listos para firma"),
          metric("En revisión", s.reviewing, "Validación contractual"),
          metric("Sin contrato", s.withoutContract, "Requieren definición")
        );
        status.hidden = true;
        renderList();
      } catch (error) {
        status.hidden = false;
        status.textContent = error?.message || "No fue posible cargar los contratos.";
      } finally {
        refresh.disabled = false;
      }
    }

    refresh.addEventListener("click", load);
    search.addEventListener("input", renderList);
    filter.addEventListener("change", renderList);
    load();
    return root;
  };
})();
