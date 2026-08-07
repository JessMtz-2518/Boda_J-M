(() => {
  "use strict";
  const number = new Intl.NumberFormat("es-MX");
  const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
  const shortDate = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" });
  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatNumber = (value) => number.format(safeNumber(value));
  const formatPercent = (value) => `${safeNumber(value).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  const formatDateTime = (value) => value ? dateTime.format(new Date(value)) : "Sin actividad";
  const formatShortDate = (value) => value ? shortDate.format(new Date(`${value}T12:00:00-06:00`)) : "";
  window.AdminDashboardFormatters = Object.freeze({ formatDateTime, formatNumber, formatPercent, formatShortDate, safeNumber });
})();
