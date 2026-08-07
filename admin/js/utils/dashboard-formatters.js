(() => {
  "use strict";
  const number = new Intl.NumberFormat("es-MX");
  const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
  const shortDate = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" });
  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeDate = (value, { dateOnly = false } = {}) => {
    if (value === null || value === undefined || value === "") return null;
    const dateMatch = dateOnly ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value)) : null;
    if (dateOnly && !dateMatch) return null;
    if (dateMatch) {
      const [, year, month, day] = dateMatch.map(Number);
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    }
    const source = dateMatch ? `${value}T12:00:00-06:00` : value;
    const date = new Date(source);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  const formatNumber = (value) => number.format(safeNumber(value));
  const formatPercent = (value) => `${safeNumber(value).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  const formatDateTime = (value) => {
    const date = safeDate(value);
    return date ? dateTime.format(date) : "Fecha no disponible";
  };
  const formatShortDate = (value) => {
    const date = safeDate(value, { dateOnly: true });
    return date ? shortDate.format(date) : "Fecha no disponible";
  };
  window.AdminDashboardFormatters = Object.freeze({ formatDateTime, formatNumber, formatPercent, formatShortDate, safeDate, safeNumber });
})();
