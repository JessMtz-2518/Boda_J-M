(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  function feedback(kind, message) {
    const box = document.createElement("div");
    box.className = `dashboard-feedback dashboard-feedback-${kind}`;
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    const text = document.createElement("p");
    text.textContent = message;
    box.append(text);
    return box;
  }
  window.AdminDashboardComponents.feedback = feedback;
})();
