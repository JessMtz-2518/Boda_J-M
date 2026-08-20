(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  function kpiCard({ label, value, detail = "", tone = "default" }) {
    const card = document.createElement("article");
    card.className = `dashboard-kpi dashboard-kpi-${tone}`;
    const caption = document.createElement("p");
    caption.className = "dashboard-kpi-label";
    caption.textContent = label;
    const amount = document.createElement("strong");
    amount.className = "dashboard-kpi-value";
    amount.textContent = value;
    card.append(caption, amount);
    if (detail) {
      const note = document.createElement("span");
      note.textContent = detail;
      card.append(note);
    }
    return card;
  }
  window.AdminDashboardComponents.kpiCard = kpiCard;
})();
