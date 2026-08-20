(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};
  const state = { operational: null, recent: null, finance: null, planner: null, essentials: null, generatedAt: null };

  window.AdminDashboardState = Object.freeze({
    clear() {
      state.operational = null;
      state.recent = null;
      state.finance = null;
      state.planner = null;
      state.essentials = null;
      state.generatedAt = null;
    },
  });

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function linkButton(text, hash, primary = false) {
    const link = el("a", primary ? "admin-button dashboard-action-link" : "admin-button admin-button-secondary dashboard-action-link", text);
    link.href = hash;
    return link;
  }

  function panel(title, className = "") {
    const card = el("section", `dashboard-panel ${className}`.trim());
    const heading = el("div", "dashboard-operational-panel-head");
    heading.append(el("h3", "", title));
    const body = el("div", "dashboard-panel-body");
    card.append(heading, body);
    return { card, heading, body };
  }

  function renderKpis(target, data) {
    const c = window.AdminDashboardComponents;
    const f = window.AdminDashboardFormatters;
    const i = data.indicadores;
    const definitions = [
      ["Invitaciones activas", i.invitaciones_activas, "invitaciones vigentes"],
      ["Asistentes invitados", i.personas_invitadas, `${f.formatNumber(i.adultos_invitados)} adultos · ${f.formatNumber(i.ninos_invitados)} niños`],
      ["Asistentes confirmados", i.personas_confirmadas, `${f.formatNumber(i.adultos_confirmados)} adultos · ${f.formatNumber(i.ninos_confirmados)} niños`, "positive"],
      ["Invitaciones pendientes", i.invitaciones_pendientes, "sin respuesta", i.invitaciones_pendientes ? "attention" : "positive"],
      ["Pendientes de mesa", i.pendientes_mesa, "asistentes confirmados por ubicar", i.pendientes_mesa ? "attention" : "positive"],
    ];
    const grid = el("div", "dashboard-kpi-grid dashboard-operational-kpis");
    definitions.forEach(([label, value, detail, tone]) => {
      grid.append(c.kpiCard({ label, value: f.formatNumber(value), detail, tone }));
    });
    target.replaceChildren(grid);
  }

  function money(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function dateOnly(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function daysFromToday(value) {
    const date = dateOnly(value);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  }

  const WEDDING_DATE = "2027-05-01";
  const ESSENTIAL_LEAD_DAYS = Object.freeze({
    "Lugar y ceremonia": 300,
    "Recepción": 240,
    "Foto y recuerdos": 240,
    "Novia": 240,
    "Novio": 180,
    "Cortejo y familia": 180,
    "Invitados": 150,
    "Detalles finales": 90,
  });

  function priorityMeta(score) {
    if (score >= 95) return { label: "Urgente", tone: "critical" };
    if (score >= 75) return { label: "Alta", tone: "high" };
    if (score >= 50) return { label: "Próxima", tone: "upcoming" };
    return { label: "Más adelante", tone: "later" };
  }

  function essentialPriority(item) {
    if (!item || ["listo", "contratado", "no_aplica"].includes(item.estado)) return null;
    const taskDays = daysFromToday(item.tarea_fecha_limite);
    if (taskDays !== null && item.tarea_estado && !["completada", "cancelada"].includes(item.tarea_estado)) {
      if (taskDays < 0) return { score: 100, reason: `Tarea vencida hace ${Math.abs(taskDays)} días` };
      if (taskDays <= 7) return { score: 95, reason: taskDays === 0 ? "La tarea vence hoy" : `La tarea vence en ${taskDays} días` };
      if (taskDays <= 30) return { score: 85, reason: `La tarea vence en ${taskDays} días` };
    }
    const weddingDays = daysFromToday(WEDDING_DATE);
    const lead = ESSENTIAL_LEAD_DAYS[item.categoria] || 120;
    const dueWindow = weddingDays === null ? null : weddingDays - lead;
    if (item.estado === "por_definir") {
      if (dueWindow !== null && dueWindow <= 0) return { score: 82, reason: "Conviene definirlo desde ahora por su anticipación recomendada" };
      if (dueWindow !== null && dueWindow <= 45) return { score: 68, reason: `Conviene iniciarlo en los próximos ${Math.max(0, dueWindow)} días` };
      return { score: 30, reason: "Todavía puede esperar, pero sigue pendiente" };
    }
    if (["buscando", "elegido"].includes(item.estado)) {
      if (dueWindow !== null && dueWindow <= 30) return { score: 72, reason: item.estado === "elegido" ? "Ya está elegido; falta asegurar el cierre" : "Ya está en búsqueda y conviene darle seguimiento" };
      return { score: 48, reason: "Ya está en seguimiento" };
    }
    return { score: 25, reason: "Pendiente de seguimiento" };
  }

  function renderAttention(target, operational, finance, planner, essentials) {
    const items = [];
    const add = (priority, title, detail, action, hash, tone = "attention", kind = "Operación") => {
      items.push({ priority, title, detail, action, hash, tone, kind });
    };

    if (finance) {
      const openPayments = finance.payments.filter((p) => !["pagado", "cancelado"].includes(p.status)).map((p) => ({ ...p, days: daysFromToday(p.dueDate) })).filter((p) => p.days !== null);
      openPayments.filter((p) => p.displayStatus === "vencido" || p.days < 0).forEach((p) => add(100, p.concept || "Pago vencido", `${p.vendorName || "Sin proveedor"} · ${money(p.amount)} · vencido`, "Ver pago", "#/presupuesto", "critical", "Pago"));
      openPayments.filter((p) => p.days >= 0 && p.days <= 30).forEach((p) => add(p.days <= 7 ? 95 : 78, p.concept || "Próximo pago", `${p.vendorName || "Sin proveedor"} · ${money(p.amount)} · ${p.days === 0 ? "vence hoy" : p.days === 1 ? "vence mañana" : `vence en ${p.days} días`}`, "Ver pago", "#/presupuesto", p.days <= 7 ? "critical" : "finance", "Pago"));
    }

    if (planner) {
      planner.tasks.filter((t) => !["completada", "cancelada"].includes(t.status)).map((t) => ({ ...t, days: daysFromToday(t.dueDate) })).filter((t) => t.days !== null && t.days <= 30).forEach((t) => {
        const score = t.days < 0 ? 100 : t.days <= 7 ? 94 : 76;
        add(score, t.title, `${t.category || "General"} · ${t.responsible || "Sin responsable"} · ${t.days < 0 ? `vencida hace ${Math.abs(t.days)} días` : t.days === 0 ? "vence hoy" : `vence en ${t.days} días`}`, "Ver tarea", "#/planeacion", score >= 94 ? "critical" : "planner", "Tarea");
      });
    }

    if (essentials?.items) {
      essentials.items.forEach((essential) => {
        const result = essentialPriority(essential);
        if (!result || result.score < 50) return;
        const meta = priorityMeta(result.score);
        const links = [essential.categoria, result.reason];
        if (!essential.proveedor_id && essential.estado !== "listo") links.push("sin proveedor vinculado");
        add(result.score, essential.titulo, links.join(" · "), "Ver esencial", "#/esenciales", meta.tone, "Esencial");
      });
    }

    if (operational) {
      const i = operational.indicadores;
      if (i.pendientes_mesa > 0) add(55, `${i.pendientes_mesa} personas confirmadas sin mesa`, "Completa la distribución de asistentes confirmados.", "Asignar mesas", "#/mesas", "attention", "Invitados");
      if (i.invitaciones_pendientes > 0) add(42, `${i.invitaciones_pendientes} invitaciones sin respuesta`, "Conviene mantener seguimiento a las confirmaciones.", "Ver pendientes", "#/invitados", "attention", "Invitados");
    }

    items.sort((a, b) => b.priority - a.priority);
    const counts = { urgent: 0, high: 0, upcoming: 0 };
    items.forEach((item) => { if (item.priority >= 95) counts.urgent += 1; else if (item.priority >= 75) counts.high += 1; else if (item.priority >= 50) counts.upcoming += 1; });

    const wrap = el("div", "dashboard-priority-center");

    if (!items.length) {
      const ok = el("article", "dashboard-attention-card dashboard-attention-ok");
      const copy = el("div"); copy.append(el("strong", "", "Todo en orden"), el("p", "", "No hay prioridades que requieran atención en este momento.")); ok.append(copy); wrap.append(ok); target.replaceChildren(wrap); return;
    }

    const groups = [
      { label: "Urgentes", tone: "critical", items: items.filter((item) => item.priority >= 95), open: counts.urgent > 0 },
      { label: "Prioridad alta", tone: "high", items: items.filter((item) => item.priority >= 75 && item.priority < 95), open: false },
      { label: "Próximos", tone: "upcoming", items: items.filter((item) => item.priority >= 50 && item.priority < 75), open: false },
    ];

    groups.forEach((group) => {
      const section = el("section", `dashboard-priority-group dashboard-priority-group-${group.tone}`);
      const header = el("button", "dashboard-priority-group-header");
      header.type = "button";
      header.setAttribute("aria-expanded", group.open ? "true" : "false");

      const heading = el("div", "dashboard-priority-group-heading");
      heading.append(
        el("span", "dashboard-priority-group-label", group.label),
        el("strong", "dashboard-priority-group-count", String(group.items.length))
      );
      const toggle = el("span", "dashboard-priority-group-toggle", group.open ? "−" : "+");
      header.append(heading, toggle);

      const list = el("div", "dashboard-attention-list dashboard-priority-list");
      list.hidden = !group.open;

      if (!group.items.length) {
        const empty = el("div", "dashboard-priority-empty", `No hay asuntos en ${group.label.toLowerCase()}.`);
        list.append(empty);
      } else {
        group.items.forEach((item) => {
          const meta = priorityMeta(item.priority);
          const row = el("article", `dashboard-attention-card dashboard-attention-${item.tone}`);
          const copy = el("div");
          const badges = el("div", "dashboard-priority-badges");
          badges.append(el("span", `dashboard-priority-badge dashboard-priority-badge-${meta.tone}`, meta.label), el("span", "dashboard-priority-kind", item.kind));
          copy.append(badges, el("strong", "", item.title), el("p", "", item.detail));
          row.append(copy, linkButton(item.action, item.hash));
          list.append(row);
        });
      }

      header.addEventListener("click", () => {
        const expanded = header.getAttribute("aria-expanded") === "true";
        header.setAttribute("aria-expanded", expanded ? "false" : "true");
        list.hidden = expanded;
        toggle.textContent = expanded ? "+" : "−";
      });

      section.append(header, list);
      wrap.append(section);
    });

    target.replaceChildren(wrap);
  }

  function renderFinance(target, finance) {
    const c = window.AdminDashboardComponents;
    const s = finance.summary;
    const grid = el("div", "dashboard-kpi-grid dashboard-finance-kpis");
    [
      ["Presupuesto", money(s.budget), "monto planeado"],
      ["Contratado", money(s.contracted), `${s.committedPercent.toFixed(1)}% comprometido`, s.committedPercent > 90 ? "attention" : "positive"],
      ["Pagado", money(s.paid), `${s.paidPercent.toFixed(1)}% del presupuesto`, "positive"],
      ["Disponible", money(s.available), "sin comprometer", s.available < 0 ? "attention" : "positive"],
    ].forEach(([label, value, detail, tone]) => {
      grid.append(c.kpiCard({ label, value, detail, tone }));
    });

    const open = finance.payments
      .filter((payment) => !["pagado", "cancelado"].includes(payment.status))
      .map((payment) => ({ ...payment, days: daysFromToday(payment.dueDate) }))
      .filter((payment) => payment.days !== null && payment.days >= 0)
      .sort((a, b) => a.days - b.days)[0];

    const wrap = el("div", "dashboard-finance-summary");
    wrap.append(grid);
    if (open) {
      const next = el("div", "dashboard-finance-next");
      next.append(
        el("span", "", "Próximo pago"),
        el("strong", "", `${open.concept} · ${money(open.amount)}`),
        el("span", "", `${open.vendorName || "Sin proveedor"} · ${open.dueDate}`)
      );
      wrap.append(next);
    }
    target.replaceChildren(wrap);
  }

  function formatShortDate(value) {
    const date = dateOnly(value);
    if (!date) return value || "Sin fecha";
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function renderCommitments(target, finance, planner) {
    const commitments = [];

    if (finance) {
      finance.payments
        .filter((payment) => !["pagado", "cancelado"].includes(payment.status))
        .forEach((payment) => {
          const days = daysFromToday(payment.dueDate);
          if (days === null || days > 60) return;
          commitments.push({
            type: "payment",
            date: payment.dueDate,
            days,
            title: payment.concept || "Pago",
            detail: `${payment.vendorName || "Sin proveedor"} · ${money(payment.amount)}`,
            hash: "#/presupuesto",
          });
        });
    }

    if (planner) {
      planner.tasks
        .filter((task) => !["completada", "cancelada"].includes(task.status))
        .forEach((task) => {
          const days = daysFromToday(task.dueDate);
          if (days === null || days > 60) return;
          commitments.push({
            type: "task",
            date: task.dueDate,
            days,
            title: task.title,
            detail: `${task.category || "General"} · ${task.responsible || "Sin responsable"}`,
            hash: "#/planeacion",
          });
        });
    }

    commitments.sort((a, b) => {
      if (a.days < 0 && b.days >= 0) return -1;
      if (b.days < 0 && a.days >= 0) return 1;
      return a.days - b.days;
    });

    if (!commitments.length) {
      target.replaceChildren(
        window.AdminDashboardComponents.feedback(
          "empty",
          "No hay tareas ni pagos programados para los próximos 60 días."
        )
      );
      return;
    }

    const list = el("div", "dashboard-commitments-list");
    commitments.slice(0, 8).forEach((item) => {
      const row = el("a", `dashboard-commitment dashboard-commitment-${item.type}${item.days < 0 ? " is-overdue" : ""}`);
      row.href = item.hash;

      const date = el("div", "dashboard-commitment-date");
      date.append(
        el("strong", "", formatShortDate(item.date)),
        el(
          "span",
          "",
          item.days < 0
            ? `${Math.abs(item.days)} ${Math.abs(item.days) === 1 ? "día vencido" : "días vencido"}`
            : item.days === 0
              ? "Hoy"
              : item.days === 1
                ? "Mañana"
                : `En ${item.days} días`
        )
      );

      const copy = el("div", "dashboard-commitment-copy");
      copy.append(
        el("span", "dashboard-commitment-kind", item.type === "payment" ? "Pago" : "Tarea"),
        el("strong", "", item.title),
        el("span", "", item.detail)
      );

      row.append(date, copy, el("span", "dashboard-commitment-arrow", "→"));
      list.append(row);
    });

    target.replaceChildren(list);
  }

  function activityLabel(type, action) {
    const labels = {
      "invitado:creado": "Invitación creada",
      "invitado:actualizado": "Invitación actualizada",
      "invitado:desactivado": "Invitación dada de baja",
      "invitado:reactivado": "Invitación reactivada",
      "confirmacion:creada": "Confirmación recibida",
      "confirmacion:actualizada": "Confirmación actualizada",
      "mesa:configuracion_inicial": "Mesas configuradas",
      "mesa:reconfigurado": "Mesas reconfiguradas",
      "mesa:mesa_creada": "Mesa creada",
      "mesa:mesa_actualizada": "Mesa actualizada",
      "mesa:mesa_desactivada": "Mesa desactivada",
      "mesa:mesa_reactivada": "Mesa reactivada",
      "mesa:asignado": "Asignación de mesa",
      "mesa:reasignado": "Asignación actualizada",
      "mesa:asignacion_retirada": "Asignación retirada",
    };
    return labels[`${type}:${action}`] || "Actividad administrativa";
  }

  function renderActivity(target, items) {
    const f = window.AdminDashboardFormatters;
    if (!items.length) {
      target.replaceChildren(window.AdminDashboardComponents.feedback("empty", "Todavía no hay actividad registrada."));
      return;
    }
    const list = el("div", "dashboard-activity-list");
    items.forEach((item) => {
      const row = el("article", "dashboard-activity-item");
      const marker = el("span", `dashboard-activity-marker dashboard-activity-marker-${item.tipo}`);
      const copy = el("div", "dashboard-activity-copy");
      copy.append(el("span", "dashboard-activity-kind", activityLabel(item.tipo, item.accion)), el("strong", "", item.titulo));
      if (item.detalle) copy.append(el("span", "dashboard-activity-detail", item.detalle));
      if (item.motivo) copy.append(el("em", "dashboard-activity-reason", `Motivo: ${item.motivo}`));
      const meta = el("div", "dashboard-activity-meta");
      meta.append(el("strong", "", item.actor), el("span", "", f.formatDateTime(item.fecha_evento)));
      row.append(marker, copy, meta);
      list.append(row);
    });
    target.replaceChildren(list);
  }

  function renderRecent(target, items) {
    target.replaceChildren(window.AdminDashboardComponents.recentConfirmations(items.slice(0, 5)));
  }

  function renderShortcuts(target) {
    const grid = el("div", "dashboard-shortcuts-grid");
    [
      ["Invitaciones", "Administrar invitaciones, cupos y enlaces.", "#/invitados"],
      ["Confirmaciones", "Revisar respuestas e historial.", "#/confirmaciones"],
      ["Mesas", "Distribuir asistentes confirmados.", "#/mesas"],
      ["Estadísticas", "Consultar métricas y tendencias.", "#/estadisticas"],
      ["Planeación", "Checklist maestro y próximas fechas.", "#/planeacion"],
      ["Presupuesto", "Proveedores, pagos y control financiero.", "#/presupuesto"],
    ].forEach(([title, detail, hash]) => {
      const card = el("a", "dashboard-shortcut-card");
      card.href = hash;
      card.append(el("strong", "", title), el("span", "", detail), el("b", "", "Abrir →"));
      grid.append(card);
    });
    target.replaceChildren(grid);
  }

  window.AdminViews.dashboard = () => {
    const root = el("section", "dashboard-view dashboard-operational-view");
    const header = el("header", "dashboard-heading");
    const titleWrap = el("div");
    titleWrap.append(el("p", "admin-eyebrow", "Centro operativo"), el("h2", "", "Dashboard"));
    const updated = el("p", "dashboard-updated", "Aún no se ha actualizado");
    titleWrap.append(updated);
    const refresh = el("button", "admin-button dashboard-refresh", "Actualizar");
    refresh.type = "button";
    header.append(titleWrap, refresh);

    const globalStatus = el("div", "dashboard-global-status");
    globalStatus.setAttribute("aria-live", "polite");

    const kpis = panel("Resumen operativo", "dashboard-panel-kpis");
    const attention = panel("Centro de prioridades", "dashboard-panel-attention");
    const finance = panel("Finanzas de la boda", "dashboard-panel-finance");
    const commitments = panel("Próximos compromisos", "dashboard-panel-commitments");
    const recent = panel("Últimas confirmaciones", "dashboard-panel-recent");
    const activity = panel("Actividad reciente", "dashboard-panel-activity");
    const shortcuts = panel("Accesos rápidos", "dashboard-panel-shortcuts");

    recent.heading.append(linkButton("Ver confirmaciones", "#/confirmaciones"));
    finance.heading.append(linkButton("Ver presupuesto", "#/presupuesto"));
    activity.heading.append(el("span", "dashboard-panel-note", "Últimos movimientos del panel"));

    const mainGrid = el("div", "dashboard-operational-layout");
    mainGrid.append(attention.card, recent.card);

    root.append(header, globalStatus, kpis.card, finance.card, commitments.card, mainGrid, activity.card, shortcuts.card);

    const feedback = window.AdminDashboardComponents.feedback;
    const loading = (body) => body.replaceChildren(feedback("loading", "Cargando información…"));

    async function load(manual = false) {
      refresh.disabled = true;
      refresh.textContent = manual ? "Actualizando…" : "Cargando…";
      globalStatus.replaceChildren();
      state.operational = null;
      state.recent = null;
      state.finance = null;
      state.planner = null;
      state.essentials = null;
      state.generatedAt = null;
      [kpis.body, finance.body, attention.body, recent.body, activity.body].forEach(loading);
      renderShortcuts(shortcuts.body);

      try {
        const service = window.AdminDashboardService;
        const [opResult, recentResult, financeResult, plannerResult, essentialsResult] = await Promise.allSettled([
          service.getOperational(),
          service.getRecentConfirmations(),
          window.AdminFinanceService.getSummary(),
          window.AdminPlannerService.getSummary(),
          window.AdminEssentialsService.getSummary(),
        ]);
        if (!root.isConnected) return;

        let errors = 0;
        if (opResult.status === "fulfilled") {
          state.operational = opResult.value.data;
          state.generatedAt = opResult.value.generated_at;
          renderKpis(kpis.body, state.operational);
          renderActivity(activity.body, state.operational.actividad || []);
        } else {
          errors += 1;
          console.error("Dashboard operational:", opResult.reason);
          const msg = feedback("error", "No fue posible cargar el resumen operativo.");
          kpis.body.replaceChildren(msg.cloneNode(true));
          activity.body.replaceChildren(msg);
        }

        if (financeResult.status === "fulfilled") {
          state.finance = financeResult.value;
          renderFinance(finance.body, state.finance);
        } else {
          errors += 1;
          console.error("Dashboard finance:", financeResult.reason);
          finance.body.replaceChildren(feedback("error", "No fue posible cargar el resumen financiero."));
        }

        if (plannerResult.status === "fulfilled") {
          state.planner = plannerResult.value;
        } else {
          errors += 1;
          console.error("Dashboard planner:", plannerResult.reason);
        }

        if (essentialsResult.status === "fulfilled") {
          state.essentials = essentialsResult.value;
        } else {
          errors += 1;
          console.error("Dashboard essentials:", essentialsResult.reason);
        }

        if (state.finance || state.planner) {
          renderCommitments(commitments.body, state.finance, state.planner);
        } else {
          commitments.body.replaceChildren(feedback("error", "No fue posible cargar los próximos compromisos."));
        }

        if (state.operational || state.finance || state.planner || state.essentials) {
          renderAttention(attention.body, state.operational, state.finance, state.planner, state.essentials);
        } else {
          attention.body.replaceChildren(feedback("error", "No fue posible cargar las alertas operativas."));
        }

        if (recentResult.status === "fulfilled") {
          state.recent = recentResult.value.data.items;
          if (!state.generatedAt) state.generatedAt = recentResult.value.generated_at;
          renderRecent(recent.body, state.recent);
        } else {
          errors += 1;
          console.error("Dashboard recent:", recentResult.reason);
          recent.body.replaceChildren(feedback("error", "No fue posible cargar las confirmaciones recientes."));
        }

        updated.textContent = state.generatedAt
          ? `Última actualización: ${window.AdminDashboardFormatters.formatDateTime(state.generatedAt)}`
          : "Actualización incompleta";

        if (manual && errors === 0) {
          globalStatus.replaceChildren(feedback("success", "Dashboard actualizado correctamente."));
        } else if (errors) {
          globalStatus.replaceChildren(feedback("error", "Algunos datos no pudieron actualizarse."));
        }
      } catch (error) {
        console.error("Dashboard:", error);
        globalStatus.replaceChildren(feedback("error", "No fue posible actualizar el Dashboard."));
      } finally {
        refresh.disabled = false;
        refresh.textContent = "Actualizar";
      }
    }

    refresh.addEventListener("click", () => !refresh.disabled && load(true));
    renderShortcuts(shortcuts.body);
    queueMicrotask(() => load(false));
    return root;
  };
})();