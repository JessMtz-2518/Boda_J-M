(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};

  const WEDDING_DATE = "2027-05-01";
  const MONTH_FORMATTER = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
  const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  const MONEY_FORMATTER = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function button(text, active = false) {
    const node = el("button", `timeline-filter${active ? " is-active" : ""}`, text);
    node.type = "button";
    return node;
  }

  function dateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function monthKey(value) {
    const date = dateOnly(value);
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "sin-fecha";
  }

  function monthLabel(value) {
    const date = dateOnly(value);
    return date ? MONTH_FORMATTER.format(date).toUpperCase() : "SIN FECHA";
  }

  function formatDate(value) {
    const date = dateOnly(value);
    return date ? DATE_FORMATTER.format(date).replace(/\./g, "") : "Sin fecha";
  }

  function statusLabel(item) {
    if (item.kind === "wedding") return "Día de la boda";
    if (item.kind === "task") {
      return {
        pendiente: "Pendiente",
        en_proceso: "En proceso",
        completada: "Completada",
        cancelada: "Cancelada",
      }[item.status] || item.status || "Pendiente";
    }
    return {
      pendiente: "Pendiente",
      pagado: "Pagado",
      cancelado: "Cancelado",
      vencido: "Vencido",
    }[item.displayStatus || item.status] || item.displayStatus || item.status || "Pendiente";
  }

  function normalizeTask(task) {
    return {
      id: `task-${task.id}`,
      sourceId: task.id,
      kind: "task",
      date: task.dueDate,
      title: task.title,
      subtitle: [task.category || "General", task.responsible || "Sin responsable"].join(" · "),
      status: task.status,
      completed: task.status === "completada",
      route: "#/planeacion",
      amount: null,
    };
  }

  function normalizePayment(payment) {
    return {
      id: `payment-${payment.id}`,
      sourceId: payment.id,
      kind: "payment",
      date: payment.dueDate,
      title: payment.concept,
      subtitle: payment.vendorName || "Sin proveedor",
      status: payment.status,
      displayStatus: payment.displayStatus,
      completed: payment.status === "pagado",
      route: "#/presupuesto",
      amount: Number(payment.amount || 0),
    };
  }

  function weddingMilestone() {
    return {
      id: "wedding-day",
      kind: "wedding",
      date: WEDDING_DATE,
      title: "Jessica & Marcos — Día de la boda",
      subtitle: "Jardín Jade · 01 de mayo de 2027",
      status: "wedding",
      completed: false,
      route: "#/dashboard",
      amount: null,
    };
  }

  function buildEventCard(item) {
    const card = el("article", `timeline-event timeline-event-${item.kind}${item.completed ? " is-completed" : ""}`);
    if (item.kind === "wedding") card.classList.add("timeline-event-wedding");

    const date = el("div", "timeline-event-date");
    const parsed = dateOnly(item.date);
    if (parsed) {
      date.append(
        el("strong", "", String(parsed.getDate()).padStart(2, "0")),
        el("span", "", new Intl.DateTimeFormat("es-MX", { month: "short" }).format(parsed).replace(/\./g, "").toUpperCase())
      );
    } else {
      date.append(el("strong", "", "—"));
    }

    const copy = el("div", "timeline-event-copy");
    const top = el("div", "timeline-event-top");
    top.append(
      el("span", `timeline-kind timeline-kind-${item.kind}`, item.kind === "task" ? "Tarea" : item.kind === "payment" ? "Pago" : "Evento")
    );
    const status = el("span", `timeline-status timeline-status-${String(item.displayStatus || item.status || "").replace(/_/g, "-")}`, statusLabel(item));
    top.append(status);
    copy.append(top, el("h4", "", item.title));

    const meta = el("p", "timeline-event-meta", item.subtitle || "");
    if (item.amount !== null) {
      meta.append(document.createTextNode(` · ${MONEY_FORMATTER.format(item.amount)}`));
    }
    copy.append(meta);

    const action = el("a", "timeline-event-action", "→");
    action.href = item.route;
    action.setAttribute("aria-label", `Abrir ${item.kind === "task" ? "Planeación" : item.kind === "payment" ? "Presupuesto" : "Dashboard"}`);

    card.append(date, copy, action);
    return card;
  }

  function renderTimeline(container, events, filter) {
    let filtered = events;
    if (filter === "tasks") filtered = events.filter((item) => item.kind === "task");
    if (filter === "payments") filtered = events.filter((item) => item.kind === "payment");
    if (filter === "completed") filtered = events.filter((item) => item.completed);

    filtered = filtered
      .filter((item) => item.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!filtered.length) {
      container.replaceChildren(el("div", "timeline-empty", "No hay compromisos que coincidan con este filtro."));
      return;
    }

    const groups = new Map();
    filtered.forEach((item) => {
      const key = monthKey(item.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const fragment = document.createDocumentFragment();
    groups.forEach((items) => {
      const group = el("section", "timeline-month");
      const header = el("header", "timeline-month-header");
      header.append(el("span", "timeline-month-dot"), el("h3", "", monthLabel(items[0].date)), el("span", "timeline-month-count", `${items.length} ${items.length === 1 ? "evento" : "eventos"}`));
      const list = el("div", "timeline-event-list");
      items.forEach((item) => list.append(buildEventCard(item)));
      group.append(header, list);
      fragment.append(group);
    });
    container.replaceChildren(fragment);
  }

  function metric(label, value, detail) {
    const card = el("article", "timeline-metric");
    card.append(el("span", "", label), el("strong", "", String(value)), el("small", "", detail));
    return card;
  }

  function createView() {
    const root = el("section", "timeline-view");
    const header = el("header", "timeline-heading");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Wedding Command Center"),
      el("h2", "", "Timeline maestro"),
      el("p", "admin-view-copy", "Tu ruta cronológica de tareas, pagos y compromisos hasta el día de la boda.")
    );
    const refresh = el("button", "admin-button", "Actualizar");
    refresh.type = "button";
    header.append(copy, refresh);

    const metrics = el("div", "timeline-metrics");
    const filters = el("div", "timeline-filters");
    const timeline = el("div", "timeline-body");
    const status = el("p", "timeline-load-status", "Cargando timeline…");
    root.append(header, metrics, filters, status, timeline);

    let currentFilter = "all";
    let allEvents = [];

    const definitions = [
      ["all", "Todo"],
      ["tasks", "Tareas"],
      ["payments", "Pagos"],
      ["completed", "Completados"],
    ];

    function syncFilters() {
      filters.replaceChildren();
      definitions.forEach(([value, label]) => {
        const control = button(label, currentFilter === value);
        control.addEventListener("click", () => {
          currentFilter = value;
          syncFilters();
          renderTimeline(timeline, allEvents, currentFilter);
        });
        filters.append(control);
      });
    }

    async function load() {
      refresh.disabled = true;
      status.hidden = false;
      status.textContent = "Cargando timeline…";
      timeline.replaceChildren();
      try {
        const [planner, finance] = await Promise.all([
          window.AdminPlannerService.getSummary(),
          window.AdminFinanceService.getSummary(),
        ]);

        const tasks = planner.tasks.filter((task) => task.dueDate).map(normalizeTask);
        const payments = finance.payments.filter((payment) => payment.dueDate).map(normalizePayment);
        allEvents = [...tasks, ...payments, weddingMilestone()];

        const openTasks = tasks.filter((item) => !item.completed && item.status !== "cancelada").length;
        const openPayments = payments.filter((item) => !item.completed && item.status !== "cancelado").length;
        const completed = [...tasks, ...payments].filter((item) => item.completed).length;
        const wedding = dateOnly(WEDDING_DATE);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = wedding ? Math.max(0, Math.ceil((wedding.getTime() - today.getTime()) / 86400000)) : 0;

        metrics.replaceChildren(
          metric("Faltan", days, "días para la boda"),
          metric("Tareas abiertas", openTasks, "por completar"),
          metric("Pagos abiertos", openPayments, "por liquidar"),
          metric("Completados", completed, "tareas y pagos")
        );
        status.hidden = true;
        renderTimeline(timeline, allEvents, currentFilter);
      } catch (error) {
        console.error("Timeline:", error);
        metrics.replaceChildren();
        status.hidden = false;
        status.textContent = "No fue posible cargar el Timeline. Intenta actualizar nuevamente.";
      } finally {
        refresh.disabled = false;
      }
    }

    refresh.addEventListener("click", load);
    syncFilters();
    load();
    return root;
  }

  window.AdminViews.timeline = createView;
})();
