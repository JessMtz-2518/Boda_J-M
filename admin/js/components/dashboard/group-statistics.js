(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  function groupStatistics(items = []) {
    if (!items.length) return window.AdminDashboardComponents.feedback("empty", "No hay grupos activos para mostrar.");
    const wrapper = document.createElement("div");
    wrapper.className = "dashboard-table-wrap";
    const table = document.createElement("table");
    table.className = "dashboard-group-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Grupo", "Activas", "Respuesta", "Pendientes", "Asistentes", "Ocupacion"].forEach((label) => {
      const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    items.forEach((item) => {
      const row = document.createElement("tr");
      const values = [
        item.grupo || "Sin grupo",
        window.AdminDashboardFormatters.formatNumber(item.invitaciones?.activas),
        window.AdminDashboardFormatters.formatPercent(item.porcentajes?.respuesta),
        window.AdminDashboardFormatters.formatNumber(item.invitaciones?.pendientes),
        window.AdminDashboardFormatters.formatNumber(item.asistencia?.total_confirmado),
        window.AdminDashboardFormatters.formatPercent(item.porcentajes?.ocupacion),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement(index ? "td" : "th");
        if (!index) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    table.append(head, body); wrapper.append(table); return wrapper;
  }
  window.AdminDashboardComponents.groupStatistics = groupStatistics;
})();
