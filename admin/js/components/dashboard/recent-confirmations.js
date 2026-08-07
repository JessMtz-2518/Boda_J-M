(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  function recentConfirmations(items = []) {
    const root = document.createElement("div");
    root.className = "dashboard-recent-list";
    if (!items.length) return window.AdminDashboardComponents.feedback("empty", "Todavia no hay confirmaciones registradas.");
    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "dashboard-recent-item";
      const identity = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.nombre || "Invitacion sin nombre";
      const meta = document.createElement("span");
      meta.textContent = [item.codigo, item.grupo].filter(Boolean).join(" · ");
      identity.append(name, meta);
      const attendance = document.createElement("div");
      attendance.className = "dashboard-recent-attendance";
      const status = document.createElement("span");
      status.className = `dashboard-status dashboard-status-${item.estado === "confirmado" ? "yes" : "no"}`;
      status.textContent = item.estado === "confirmado" ? "Asistira" : "No asistira";
      const total = document.createElement("small");
      total.textContent = item.estado === "confirmado" ? `${item.total_confirmado || 0} asistentes` : "0 asistentes";
      attendance.append(status, total);
      const activity = document.createElement("div");
      activity.className = "dashboard-recent-date";
      activity.textContent = window.AdminDashboardFormatters.formatDateTime(item.fecha_ultima_actividad);
      if (item.es_actualizacion) {
        const updated = document.createElement("small");
        updated.textContent = "Actualizada";
        activity.append(updated);
      }
      row.append(identity, attendance, activity);
      root.append(row);
    });
    return root;
  }
  window.AdminDashboardComponents.recentConfirmations = recentConfirmations;
})();
