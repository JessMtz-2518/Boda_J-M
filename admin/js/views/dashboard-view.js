(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};
  const state = { operational: null, recent: null, generatedAt: null };

  window.AdminDashboardState = Object.freeze({
    clear() {
      state.operational = null;
      state.recent = null;
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

  function renderAttention(target, data) {
    const i = data.indicadores;
    const m = data.mesas;
    const items = [];

    if (i.invitaciones_pendientes > 0) {
      items.push(["invitaciones", `${i.invitaciones_pendientes} invitaciones sin respuesta`, "Revisa qué invitaciones siguen sin respuesta.", "Ver pendientes", "#/invitados"]);
    }
    if (i.pendientes_mesa > 0) {
      items.push(["mesas", `${i.pendientes_mesa} personas confirmadas sin mesa`, "Asigna una mesa para completar la distribución.", "Asignar mesas", "#/mesas"]);
    }
    if (m.activas === 0 && i.personas_confirmadas > 0) {
      items.push(["mesas", "Mesas aún no configuradas", "Ya existen asistentes confirmados y todavía no hay configuración de mesas.", "Configurar mesas", "#/mesas"]);
    }

    if (!items.length) {
      const ok = el("article", "dashboard-attention-card dashboard-attention-ok");
      const copy = el("div");
      copy.append(el("strong", "", "Todo en orden"), el("p", "", "No hay pendientes administrativos críticos por atender."));
      ok.append(copy);
      target.replaceChildren(ok);
      return;
    }

    const list = el("div", "dashboard-attention-list");
    items.forEach(([, title, detail, action, hash]) => {
      const row = el("article", "dashboard-attention-card dashboard-attention-attention");
      const copy = el("div");
      copy.append(el("strong", "", title), el("p", "", detail));
      row.append(copy, linkButton(action, hash));
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
    const attention = panel("Atención requerida", "dashboard-panel-attention");
    const recent = panel("Últimas confirmaciones", "dashboard-panel-recent");
    const activity = panel("Actividad reciente", "dashboard-panel-activity");
    const shortcuts = panel("Accesos rápidos", "dashboard-panel-shortcuts");

    recent.heading.append(linkButton("Ver confirmaciones", "#/confirmaciones"));
    activity.heading.append(el("span", "dashboard-panel-note", "Últimos movimientos del panel"));

    const mainGrid = el("div", "dashboard-operational-layout");
    mainGrid.append(attention.card, recent.card);

    root.append(header, globalStatus, kpis.card, mainGrid, activity.card, shortcuts.card);

    const feedback = window.AdminDashboardComponents.feedback;
    const loading = (body) => body.replaceChildren(feedback("loading", "Cargando información…"));

    async function load(manual = false) {
      refresh.disabled = true;
      refresh.textContent = manual ? "Actualizando…" : "Cargando…";
      globalStatus.replaceChildren();
      [kpis.body, attention.body, recent.body, activity.body].forEach(loading);
      renderShortcuts(shortcuts.body);

      try {
        const service = window.AdminDashboardService;
        const [opResult, recentResult] = await Promise.allSettled([
          service.getOperational(),
          service.getRecentConfirmations(),
        ]);
        if (!root.isConnected) return;

        let errors = 0;
        if (opResult.status === "fulfilled") {
          state.operational = opResult.value.data;
          state.generatedAt = opResult.value.generated_at;
          renderKpis(kpis.body, state.operational);
          renderAttention(attention.body, state.operational);
          renderActivity(activity.body, state.operational.actividad || []);
        } else {
          errors += 1;
          console.error("Dashboard operational:", opResult.reason);
          const msg = feedback("error", "No fue posible cargar el resumen operativo.");
          kpis.body.replaceChildren(msg.cloneNode(true));
          attention.body.replaceChildren(msg.cloneNode(true));
          activity.body.replaceChildren(msg);
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