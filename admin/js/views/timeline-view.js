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
    if (item.kind === "payment") {
      return {
        pendiente: "Pendiente",
        pagado: "Pagado",
        cancelado: "Cancelado",
        vencido: "Vencido",
      }[item.displayStatus || item.status] || item.displayStatus || item.status || "Pendiente";
    }
    if (item.kind === "godparent") {
      return {
        por_definir: "Por definir",
        confirmado: "Confirmado",
        pendiente: "Pendiente",
        en_proceso: "En proceso",
        entregado: "Entregado / listo",
      }[item.status] || item.status || "Pendiente";
    }
    if (item.kind === "contract") {
      return {
        sin_contrato: "Sin contrato",
        en_revision: "En revisión",
        por_firmar: "Por firmar",
        firmado: "Firmado",
        servicio: "Servicio",
      }[item.status] || item.status || "Contrato";
    }
    return item.status || "Evento";
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

  function normalizeGodparentTarget(item) {
    const confirmed = item.estado === "confirmado";
    return {
      id: `godparent-target-${item.id}`,
      sourceId: item.id,
      kind: "godparent",
      date: item.fecha_objetivo,
      title: confirmed ? `Padrinos definidos: ${item.tipo}` : `Definir / invitar padrinos: ${item.tipo}`,
      subtitle: item.nombres_padrinos || item.invitacion_nombre || "Sin padrinos definidos",
      status: confirmed ? "confirmado" : "por_definir",
      completed: confirmed,
      route: "#/padrinos",
      amount: null,
    };
  }

  function normalizeGodparentCommitment(item) {
    const fulfillment = item.cumplimiento_estado || "pendiente";
    return {
      id: `godparent-commitment-${item.id}`,
      sourceId: item.id,
      kind: "godparent",
      date: item.fecha_compromiso,
      title: `Compromiso de padrinos: ${item.tipo}`,
      subtitle: item.nombres_padrinos || item.invitacion_nombre || "Padrinos confirmados",
      status: fulfillment,
      completed: fulfillment === "entregado",
      route: "#/padrinos",
      amount: null,
    };
  }

  function normalizeContractSignature(item) {
    const signed = item.status === "firmado";
    return {
      id: `contract-signature-${item.vendorId}`,
      sourceId: item.vendorId,
      kind: "contract",
      date: item.signatureDueDate,
      title: signed ? `Contrato firmado: ${item.vendorName}` : `Firma de contrato: ${item.vendorName}`,
      subtitle: item.category || "Proveedor",
      status: signed ? "firmado" : item.status,
      completed: signed,
      route: "#/contratos",
      amount: null,
    };
  }

  function normalizeContractService(item) {
    return {
      id: `contract-service-${item.vendorId}`,
      sourceId: item.vendorId,
      kind: "contract",
      date: item.validUntil,
      title: `Servicio: ${item.vendorName}`,
      subtitle: item.category || "Proveedor",
      status: "servicio",
      completed: false,
      route: "#/contratos",
      amount: null,
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

  function isTerminalCompleted(item, events) {
    if (!item?.completed) return false;

    // Tareas y pagos son cierres terminales por sí mismos.
    if (["task","payment"].includes(item.kind)) return true;

    // En padrinos, si ya existe un compromiso entregado/listo para el mismo registro,
    // la confirmación previa queda como hito histórico, pero no se cuenta dos veces.
    if (item.kind === "godparent") {
      if (item.id.startsWith("godparent-commitment-")) return item.status === "entregado";
      if (item.id.startsWith("godparent-target-")) {
        const hasDeliveredCommitment = events.some((candidate) =>
          candidate.kind === "godparent" &&
          candidate.sourceId === item.sourceId &&
          candidate.id.startsWith("godparent-commitment-") &&
          candidate.status === "entregado"
        );
        return !hasDeliveredCommitment && item.status === "confirmado";
      }
    }

    // La firma formaliza el contrato y cuenta una sola vez como cierre contractual.
    if (item.kind === "contract") {
      return item.id.startsWith("contract-signature-") && item.status === "firmado";
    }

    return false;
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
    const kindLabel = {
      task: "Tarea",
      payment: "Pago",
      godparent: "Padrino",
      contract: "Contrato",
      wedding: "Evento",
    }[item.kind] || "Evento";
    top.append(el("span", `timeline-kind timeline-kind-${item.kind}`, kindLabel));
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
    const actionLabel = {
      task: "Planeación",
      payment: "Presupuesto",
      godparent: "Padrinos",
      contract: "Contratos",
      wedding: "Dashboard",
    }[item.kind] || "detalle";
    action.setAttribute("aria-label", `Abrir ${actionLabel}`);

    card.append(date, copy, action);
    return card;
  }

  function renderTimeline(container, events, filter) {
    let filtered = events;
    if (filter === "tasks") filtered = events.filter((item) => item.kind === "task");
    if (filter === "payments") filtered = events.filter((item) => item.kind === "payment");
    if (filter === "commitments") filtered = events.filter((item) => ["godparent","contract"].includes(item.kind));
    if (filter === "completed") filtered = events.filter((item) => isTerminalCompleted(item, events));

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
      ["commitments", "Compromisos"],
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
        const [planner, finance, godparents, contracts] = await Promise.all([
          window.AdminPlannerService.getSummary(),
          window.AdminFinanceService.getSummary(),
          window.AdminGodparentsService.getSummary(),
          window.AdminContractsService.getSummary(),
        ]);

        const tasks = planner.tasks.filter((task) => task.dueDate).map(normalizeTask);
        const payments = finance.payments.filter((payment) => payment.dueDate).map(normalizePayment);

        const godparentTargets = (godparents.items || [])
          .filter((item) => item.fecha_objetivo)
          .map(normalizeGodparentTarget);
        const godparentCommitments = (godparents.items || [])
          .filter((item) => item.estado === "confirmado" && item.fecha_compromiso)
          .map(normalizeGodparentCommitment);

        const contractSignatures = (contracts.contracts || [])
          .filter((item) => item.signatureDueDate && ["en_revision","por_firmar","firmado"].includes(item.status))
          .map(normalizeContractSignature);
        const contractServices = (contracts.contracts || [])
          .filter((item) => item.validUntil)
          .map(normalizeContractService);

        const commitments = [
          ...godparentTargets,
          ...godparentCommitments,
          ...contractSignatures,
          ...contractServices,
        ];

        allEvents = [...tasks, ...payments, ...commitments, weddingMilestone()];

        const openTasks = tasks.filter((item) => !item.completed && item.status !== "cancelada").length;
        const openPayments = payments.filter((item) => !item.completed && item.status !== "cancelado").length;

        const todayKey = new Date();
        todayKey.setHours(0, 0, 0, 0);
        const upcomingCommitments = commitments.filter((item) => {
          if (item.completed || !item.date) return false;
          const date = dateOnly(item.date);
          return date && date.getTime() >= todayKey.getTime();
        }).length;

        const completed = [...tasks, ...payments, ...commitments]
          .filter((item) => isTerminalCompleted(item, [...tasks, ...payments, ...commitments]))
          .length;
        const wedding = dateOnly(WEDDING_DATE);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = wedding ? Math.max(0, Math.ceil((wedding.getTime() - today.getTime()) / 86400000)) : 0;

        metrics.replaceChildren(
          metric("Faltan", days, "días para la boda"),
          metric("Tareas pendientes", openTasks, "por completar"),
          metric("Pagos pendientes", openPayments, "por liquidar"),
          metric("Próximos compromisos", upcomingCommitments, "padrinos y contratos"),
          metric("Completados", completed, "hitos completados")
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
