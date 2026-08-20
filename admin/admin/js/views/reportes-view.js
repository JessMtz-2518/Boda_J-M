(() => {
  "use strict";

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

  function escapeCsv(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv(filename, rows) {
    const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function metric(label, value, detail = "", tone = "") {
    const card = el("article", `reports-metric${tone ? ` reports-metric-${tone}` : ""}`);
    card.append(
      el("span", "reports-metric-label", label),
      el("strong", "reports-metric-value", String(value)),
      el("span", "reports-metric-detail", detail)
    );
    return card;
  }

  function stateLabel(state) {
    if (state === "asistira") return "Asistirá";
    if (state === "no_asistira") return "No asistirá";
    return "Pendiente";
  }

  function stateClass(state) {
    if (state === "asistira") return "reports-state-attending";
    if (state === "no_asistira") return "reports-state-not-attending";
    return "reports-state-pending";
  }

  function buildTableReport(data) {
    const section = el("section", "reports-section reports-section-tables");
    section.dataset.reportPanel = "mesas";

    const grid = el("div", "reports-table-grid");
    data.byTable.forEach((table) => {
      const card = el("article", "reports-table-card");
      const head = el("header", "reports-table-card-head");
      const copy = el("div");
      copy.append(
        el("h3", "", `Mesa ${table.number}`),
        el("span", "reports-table-people", `${table.adults} adultos · ${table.children} niños`)
      );
      const occupancy = el("span", "reports-table-occupancy", `${table.occupied}/${table.capacity} · ${table.available} disp.`);
      head.append(copy, occupancy);

      if (!table.assignments.length) {
        card.append(head, el("p", "reports-empty-inline", "Sin asistentes asignados."));
      } else {
        const list = el("ul", "reports-guest-list");
        table.assignments.forEach((item) => {
          const li = document.createElement("li");
          const main = el("div", "reports-guest-main");
          main.append(
            el("strong", "", item.nombre),
            el("span", "", item.grupo || "Sin grupo")
          );
          const count = el("span", "reports-guest-count");
          count.append(
            el("strong", "", `${item.total} ${item.total === 1 ? "persona" : "personas"}`),
            el("small", "", `${item.adultos} adultos · ${item.ninos} niños`)
          );
          li.append(main, count);
          list.append(li);
        });
        card.append(head, list);
      }
      grid.append(card);
    });

    section.append(grid);
    return section;
  }

  function buildGuestsReport(data) {
    const section = el("section", "reports-section reports-section-guests");
    section.dataset.reportPanel = "invitados";
    section.hidden = true;

    const summary = data.guestSummary;
    const blocks = el("div", "reports-summary-groups");

    const invitationBlock = el("section", "reports-summary-block");
    invitationBlock.append(el("h3", "", "Invitaciones"));
    const invitationMetrics = el("div", "reports-metrics reports-metrics-compact");
    invitationMetrics.append(
      metric("Total", summary.invitation.total, "Registros de invitados"),
      metric("Activas", summary.invitation.active, "Invitaciones vigentes", "active"),
      metric("Inactivas", summary.invitation.inactive, "Bajas administrativas", "inactive")
    );
    invitationBlock.append(invitationMetrics);

    const confirmationBlock = el("section", "reports-summary-block");
    confirmationBlock.append(el("h3", "", "Confirmación"));
    const confirmationMetrics = el("div", "reports-metrics reports-metrics-compact");
    confirmationMetrics.append(
      metric("Asistirán", summary.confirmation.attending, "Invitaciones confirmadas", "attending"),
      metric("No asistirán", summary.confirmation.notAttending, "Invitaciones declinadas", "not-attending"),
      metric("Pendientes", summary.confirmation.pending, "Sin respuesta", "pending")
    );
    confirmationBlock.append(confirmationMetrics);

    const peopleBlock = el("section", "reports-summary-block reports-summary-block-people");
    peopleBlock.append(el("h3", "", "Personas que asistirán"));
    const peopleMetrics = el("div", "reports-metrics reports-metrics-compact");
    peopleMetrics.append(
      metric("Adultos", summary.people.adults, "Confirmados"),
      metric("Niños", summary.people.children, "Confirmados"),
      metric("Total asistentes", summary.people.total, "Adultos + niños", "attending")
    );
    peopleBlock.append(peopleMetrics);
    blocks.append(invitationBlock, confirmationBlock, peopleBlock);

    const toolbar = el("div", "reports-guests-toolbar");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Buscar invitado, código o grupo";
    search.className = "reports-search";
    const state = document.createElement("select");
    [["", "Todos los estados"], ["asistira", "Asistirá"], ["no_asistira", "No asistirá"], ["pendiente", "Pendiente"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; state.append(option);
    });
    const active = document.createElement("select");
    [["", "Activas e inactivas"], ["true", "Solo activas"], ["false", "Solo inactivas"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; active.append(option);
    });
    toolbar.append(search, state, active);

    const wrap = el("div", "reports-list-wrap");
    const table = el("table", "reports-list-table reports-guests-table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Invitado", "Código", "Grupo", "Invitación", "Confirmación", "Adultos", "Niños", "Total"].forEach((label) => {
      const th = document.createElement("th"); th.textContent = label; hr.append(th);
    });
    thead.append(hr);
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    wrap.append(table);

    const empty = el("p", "reports-empty-inline", "No hay invitados que coincidan con los filtros.");
    empty.hidden = true;

    function renderRows() {
      const term = search.value.trim().toLocaleLowerCase("es-MX");
      const stateValue = state.value;
      const activeValue = active.value;
      const filtered = data.guests.filter((item) => {
        const haystack = `${item.nombre} ${item.codigo} ${item.grupo}`.toLocaleLowerCase("es-MX");
        if (term && !haystack.includes(term)) return false;
        if (stateValue && item.estado_confirmacion !== stateValue) return false;
        if (activeValue && String(item.activo) !== activeValue) return false;
        return true;
      });

      tbody.replaceChildren();
      filtered.forEach((item) => {
        const tr = document.createElement("tr");
        const values = [item.nombre, item.codigo, item.grupo];
        values.forEach((value, index) => {
          const td = document.createElement("td"); td.textContent = value; td.dataset.label = ["Invitado", "Código", "Grupo"][index]; tr.append(td);
        });

        const invitation = document.createElement("td");
        invitation.dataset.label = "Invitación";
        invitation.append(el("span", `reports-status-chip ${item.activo ? "reports-state-active" : "reports-state-inactive"}`, item.activo ? "Activa" : "Inactiva"));

        const confirmation = document.createElement("td");
        confirmation.dataset.label = "Confirmación";
        confirmation.append(el("span", `reports-status-chip ${stateClass(item.estado_confirmacion)}`, stateLabel(item.estado_confirmacion)));

        const counts = [item.adultos_confirmados, item.ninos_confirmados, item.total_confirmado];
        [invitation, confirmation].forEach((td) => tr.append(td));
        counts.forEach((value, index) => {
          const td = document.createElement("td"); td.textContent = String(value); td.dataset.label = ["Adultos", "Niños", "Total"][index]; tr.append(td);
        });
        tbody.append(tr);
      });

      empty.hidden = filtered.length > 0;
    }

    search.addEventListener("input", renderRows);
    state.addEventListener("change", renderRows);
    active.addEventListener("change", renderRows);
    renderRows();

    section.append(blocks, toolbar, wrap, empty);
    return section;
  }

  function renderReports(data, root) {
    root.replaceChildren();

    const header = el("header", "admin-view-header reports-header");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Fase 6 · Reportes"),
      el("h2", "", "Reportes finales"),
      el("p", "admin-view-copy", "Consulta la distribución por mesa y el estado general de invitados y confirmaciones.")
    );

    const actions = el("div", "reports-header-actions");
    const refresh = button("Actualizar");
    const print = button("Imprimir / Guardar PDF", true);
    actions.append(refresh, print);
    header.append(copy, actions);

    const tabs = el("div", "reports-tabs");
    const tabDefinitions = [["mesas", "Por mesa"], ["invitados", "Invitados / Confirmaciones"]];
    const tabButtons = new Map();
    tabDefinitions.forEach(([key, label], index) => {
      const tab = button(label, index === 0);
      tab.dataset.reportTab = key;
      tab.setAttribute("aria-pressed", String(index === 0));
      tabs.append(tab);
      tabButtons.set(key, tab);
    });

    const exportBar = el("div", "reports-export-bar");
    const exportCurrent = button("Exportar CSV");
    exportBar.append(exportCurrent);

    const panels = el("div", "reports-panels");
    panels.append(buildTableReport(data), buildGuestsReport(data));

    function showPanel(key) {
      panels.querySelectorAll("[data-report-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.reportPanel !== key;
      });
      tabButtons.forEach((tab, tabKey) => {
        const active = tabKey === key;
        tab.classList.toggle("admin-button-secondary", !active);
        tab.setAttribute("aria-pressed", String(active));
      });
      root.dataset.activeReport = key;
    }

    tabs.addEventListener("click", (event) => {
      const target = event.target.closest("[data-report-tab]");
      if (target) showPanel(target.dataset.reportTab);
    });

    exportCurrent.addEventListener("click", () => {
      if (root.dataset.activeReport === "invitados") {
        const rows = [["Invitado", "Código", "Grupo", "Invitación", "Confirmación", "Adultos", "Niños", "Total"]];
        data.guests.forEach((item) => rows.push([
          item.nombre, item.codigo, item.grupo, item.activo ? "Activa" : "Inactiva",
          stateLabel(item.estado_confirmacion), item.adultos_confirmados, item.ninos_confirmados, item.total_confirmado,
        ]));
        downloadCsv("boda-jm-invitados-confirmaciones.csv", rows);
        return;
      }

      const rows = [["Mesa", "Invitado", "Código", "Grupo", "Adultos", "Niños", "Total", "Capacidad", "Ocupados", "Disponibles"]];
      data.byTable.forEach((table) => {
        if (!table.assignments.length) {
          rows.push([`Mesa ${table.number}`, "", "", "", "", "", "", table.capacity, table.occupied, table.available]);
          return;
        }
        table.assignments.forEach((item) => rows.push([
          `Mesa ${table.number}`, item.nombre, item.codigo, item.grupo,
          item.adultos, item.ninos, item.total, table.capacity, table.occupied, table.available,
        ]));
      });
      downloadCsv("boda-jm-reporte-por-mesa.csv", rows);
    });

    print.addEventListener("click", () => window.print());

    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.textContent = "Actualizando…";
      try {
        const next = await window.AdminReportsService.getReportsData();
        renderReports(next, root);
      } catch (error) {
        console.error("Reportes:", error);
        refresh.disabled = false;
        refresh.textContent = "Actualizar";
      }
    });

    root.append(header, tabs, exportBar, panels);
    showPanel("mesas");
  }

  function reportesView() {
    const root = el("section", "reports-view");
    root.dataset.activeReport = "mesas";

    const loading = el("div", "reports-loading");
    loading.append(
      el("p", "admin-eyebrow", "Fase 6 · Reportes"),
      el("h2", "", "Preparando reportes…"),
      el("p", "admin-view-copy", "Consultando mesas, invitados y confirmaciones.")
    );
    root.append(loading);

    window.AdminReportsService.getReportsData()
      .then((data) => renderReports(data, root))
      .catch((error) => {
        console.error("Reportes:", error);
        root.replaceChildren();
        const box = el("div", "reports-error");
        box.append(
          el("p", "admin-eyebrow", "No fue posible cargar los reportes"),
          el("h2", "", "Intenta nuevamente"),
          el("p", "admin-view-copy", "No pudimos consultar la información actual de Mesas e Invitados.")
        );
        const retry = button("Reintentar", true);
        retry.addEventListener("click", () => root.replaceWith(reportesView()));
        box.append(retry);
        root.append(box);
      });

    return root;
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.reportes = reportesView;
})();
