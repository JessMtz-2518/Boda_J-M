(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};

  const state = {
    summary: null,
    groups: null,
    evolution: null,
    generatedAt: null,
  };

  const numberFormatter = new Intl.NumberFormat("es-MX");

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    return numberFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0);
  }

  function formatPercent(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `${safe.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
  }

  function ratioPercent(value, total) {
    const safeValue = Number(value) || 0;
    const safeTotal = Number(total) || 0;
    if (safeTotal <= 0) return 0;
    return Math.max(0, Math.min(100, (safeValue / safeTotal) * 100));
  }

  function isDeadlineExpired(dateValue) {
    // La RPC de configuración puede devolver la fecha como YYYY-MM-DD o como
    // timestamp ISO (YYYY-MM-DDTHH:mm:ss...). Para la regla de negocio solo
    // importa el día calendario configurado, por eso leemos los primeros
    // componentes de fecha y evitamos conversiones de zona horaria.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateValue || "").trim());
    if (!match) return false;

    const deadlineKey = Number(`${match[1]}${match[2]}${match[3]}`);
    const now = new Date();
    const todayKey = (now.getFullYear() * 10000) + ((now.getMonth() + 1) * 100) + now.getDate();
    return todayKey > deadlineKey;
  }

  function applyDeadlineClassification(summary, groups, rsvpConfig) {
    const expired = isDeadlineExpired(rsvpConfig?.fecha_limite_rsvp);

    const classifyInvitations = (invitations) => {
      if (!invitations) return;
      const unanswered = Math.max(0, Number(invitations.pendientes) || 0);
      invitations.vencidas = expired ? unanswered : 0;
      invitations.pendientes = expired ? 0 : unanswered;
    };

    classifyInvitations(summary?.invitaciones);
    (groups || []).forEach((item) => classifyInvitations(item?.invitaciones));
  }

  function setProgress(bar, value) {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    bar.style.setProperty("--statistics-progress", `${percent}%`);
    bar.setAttribute("aria-valuenow", String(Math.round(percent * 10) / 10));
  }

  function metricCard(label, value, detail, tone = "") {
    const card = el("article", `statistics-metric${tone ? ` statistics-metric-${tone}` : ""}`);
    card.append(
      el("p", "statistics-metric-label", label),
      el("strong", "statistics-metric-value", value),
      el("span", "statistics-metric-detail", detail)
    );
    return card;
  }

  function panel(title, className = "") {
    const section = el("section", `statistics-panel${className ? ` ${className}` : ""}`);
    const heading = el("div", "statistics-panel-heading");
    heading.append(el("h3", "", title));
    const body = el("div", "statistics-panel-body");
    section.append(heading, body);
    return { section, body };
  }

  function feedback(type, text) {
    const node = el("div", `statistics-feedback statistics-feedback-${type}`);
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.append(el("p", "", text));
    return node;
  }

  function renderOverview(target, data) {
    const invitations = data.invitaciones;
    const attendance = data.asistencia;
    const quota = data.cupo;
    const percentages = data.porcentajes;
    const grid = el("div", "statistics-overview-grid");
    grid.append(
      metricCard("Invitaciones activas", formatNumber(invitations.activas), "Padrón vigente"),
      metricCard("Respuesta", formatPercent(percentages.respuesta), `${formatNumber(invitations.con_respuesta)} invitaciones respondieron`, "positive"),
      metricCard("Asistentes confirmados", formatNumber(attendance.total_confirmado), `${formatNumber(attendance.adultos_confirmados)} adultos · ${formatNumber(attendance.ninos_confirmados)} niños`, "positive"),
      metricCard("Ocupación", formatPercent(percentages.ocupacion), `Sobre ${formatNumber(quota.total_reservado)} lugares reservados`)
    );

    const secondary = el("div", "statistics-secondary-grid");
    secondary.append(
      metricCard("Pendientes", formatNumber(invitations.pendientes), "Invitaciones dentro del plazo", invitations.pendientes ? "attention" : ""),
      metricCard("Plazo vencido", formatNumber(invitations.vencidas || 0), "Invitaciones sin respuesta al cierre", invitations.vencidas ? "attention" : ""),
      metricCard("Asistirán", formatNumber(invitations.asistiran), "Invitaciones que confirmaron"),
      metricCard("No asistirán", formatNumber(invitations.no_asistiran), "Invitaciones declinadas")
    );

    target.replaceChildren(grid, secondary);
  }

  function statusRow(label, value, total, detail, tone) {
    const row = el("div", "statistics-status-row");
    const head = el("div", "statistics-status-head");
    head.append(
      el("span", "", label),
      el("strong", "", formatNumber(value))
    );

    const track = el("div", "statistics-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    const bar = el("span", `statistics-progress-bar statistics-progress-${tone}`);
    track.append(bar);
    setProgress(track, ratioPercent(value, total));

    const meta = el("div", "statistics-status-meta");
    meta.append(
      el("span", "", detail),
      el("span", "", formatPercent(ratioPercent(value, total)))
    );

    row.append(head, track, meta);
    return row;
  }

  function renderResponseDistribution(target, data) {
    const invitations = data.invitaciones;
    const active = Math.max(0, invitations.activas);

    const wrap = el("div", "statistics-status-list");
    wrap.append(
      statusRow("Asistirán", invitations.asistiran, active, "Invitaciones confirmadas", "positive"),
      statusRow("No asistirán", invitations.no_asistiran, active, "Invitaciones declinadas", "negative"),
      statusRow("Pendientes", invitations.pendientes, active, "Sin respuesta dentro del plazo", "neutral"),
      statusRow("Plazo vencido", invitations.vencidas || 0, active, "Sin respuesta al cierre", "neutral")
    );

    const note = el(
      "p",
      "statistics-panel-note",
      active
        ? `La distribución considera ${formatNumber(active)} invitaciones activas.`
        : "No hay invitaciones activas para calcular la distribución."
    );

    target.replaceChildren(wrap, note);
  }

  function groupCard(item) {
    const invitations = item.invitaciones;
    const attendance = item.asistencia;
    const quota = item.cupo;
    const percentages = item.porcentajes;

    const card = el("article", "statistics-group-card");
    const head = el("div", "statistics-group-head");
    head.append(
      el("h4", "", item.grupo || "Sin grupo"),
      el("span", "", `${formatNumber(invitations.activas)} activas`)
    );

    const key = el("div", "statistics-group-key");
    const unansweredValue = invitations.vencidas || invitations.pendientes || 0;
    const unansweredLabel = invitations.vencidas ? "vencidas" : "pendientes";
    key.append(
      el("div", "", `${formatNumber(attendance.total_confirmado)} asistentes`),
      el("div", "", `${formatNumber(unansweredValue)} ${unansweredLabel}`)
    );

    const responseLabel = el("div", "statistics-group-progress-label");
    responseLabel.append(el("span", "", "Respuesta"), el("strong", "", formatPercent(percentages.respuesta)));
    const responseTrack = el("div", "statistics-progress-track");
    responseTrack.setAttribute("role", "progressbar");
    responseTrack.setAttribute("aria-label", `Respuesta de ${item.grupo}`);
    responseTrack.setAttribute("aria-valuemin", "0");
    responseTrack.setAttribute("aria-valuemax", "100");
    responseTrack.append(el("span", "statistics-progress-bar statistics-progress-positive"));
    setProgress(responseTrack, percentages.respuesta);

    const occupancyLabel = el("div", "statistics-group-progress-label");
    occupancyLabel.append(el("span", "", "Ocupación"), el("strong", "", formatPercent(percentages.ocupacion)));
    const occupancyTrack = el("div", "statistics-progress-track");
    occupancyTrack.setAttribute("role", "progressbar");
    occupancyTrack.setAttribute("aria-label", `Ocupación de ${item.grupo}`);
    occupancyTrack.setAttribute("aria-valuemin", "0");
    occupancyTrack.setAttribute("aria-valuemax", "100");
    occupancyTrack.append(el("span", "statistics-progress-bar statistics-progress-occupancy"));
    setProgress(occupancyTrack, percentages.ocupacion);

    const footer = el("div", "statistics-group-footer");
    footer.append(
      el("span", "", `Cupo: ${formatNumber(quota.total_reservado)}`),
      el("span", "", `Confirmados: ${formatNumber(attendance.adultos_confirmados)} A · ${formatNumber(attendance.ninos_confirmados)} N`)
    );

    card.append(head, key, responseLabel, responseTrack, occupancyLabel, occupancyTrack, footer);
    return card;
  }

  function renderGroups(target, items) {
    if (!items.length) {
      target.replaceChildren(feedback("empty", "No hay grupos activos para analizar."));
      return;
    }
    const grid = el("div", "statistics-groups-grid");
    items.forEach((item) => grid.append(groupCard(item)));
    target.replaceChildren(grid);
  }

  function renderActivity(target, data) {
    const activity = data.actividad;
    const last = activity.ultima_confirmacion_at
      ? window.AdminDashboardFormatters.formatDateTime(activity.ultima_confirmacion_at)
      : "Sin confirmaciones";

    const average = activity.tiempo_promedio_disponible && activity.tiempo_promedio_respuesta_horas !== null
      ? `${Number(activity.tiempo_promedio_respuesta_horas).toLocaleString("es-MX", { maximumFractionDigits: 1 })} h`
      : "No disponible";

    const cards = el("div", "statistics-activity-grid");
    cards.append(
      metricCard("Última confirmación", last, "Actividad más reciente"),
      metricCard("Tiempo promedio de respuesta", average, activity.tiempo_promedio_disponible ? "Desde apertura de invitación" : (activity.motivo_no_disponible || "Sin datos suficientes"))
    );
    target.replaceChildren(cards);
  }

  function renderEvolution(target, items) {
    const chart = window.AdminDashboardComponents?.evolutionChart;
    if (typeof chart !== "function") {
      target.replaceChildren(feedback("error", "La gráfica de evolución no está disponible."));
      return;
    }
    target.replaceChildren(chart(items));
  }

  window.AdminViews.estadisticas = () => {
    const root = el("section", "statistics-view");

    const header = el("header", "statistics-header");
    const heading = el("div");
    heading.append(
      el("p", "admin-eyebrow", "Análisis de la boda"),
      el("h2", "", "Estadísticas"),
      el("p", "admin-view-copy", "Analiza la respuesta de los invitados, la ocupación del cupo y la evolución de las confirmaciones.")
    );

    const headerActions = el("div", "statistics-header-actions");
    const updated = el("p", "statistics-updated", "Aún no se ha actualizado");
    const refresh = el("button", "admin-button", "Actualizar");
    refresh.type = "button";
    headerActions.append(updated, refresh);
    header.append(heading, headerActions);

    const globalStatus = el("div", "statistics-global-status");
    globalStatus.setAttribute("aria-live", "polite");

    const overview = panel("Panorama general", "statistics-panel-overview");
    const distribution = panel("Estado de las invitaciones", "statistics-panel-distribution");
    const groups = panel("Comparativo por grupo", "statistics-panel-groups");
    const activity = panel("Actividad de confirmaciones", "statistics-panel-activity");
    const evolution = panel("Evolución de los últimos 30 días", "statistics-panel-evolution");

    const middle = el("div", "statistics-middle-grid");
    middle.append(distribution.section, activity.section);

    root.append(
      header,
      globalStatus,
      overview.section,
      middle,
      groups.section,
      evolution.section
    );

    function showInitialLoading(body) {
      if (!body.childElementCount) {
        body.replaceChildren(feedback("loading", "Cargando estadísticas..."));
      }
    }

    function showSectionError(body, message, hasData) {
      const existing = body.querySelector("[data-statistics-error]");
      if (existing) existing.remove();

      const notice = feedback("error", hasData ? `${message} Se conservan los datos anteriores.` : message);
      notice.dataset.statisticsError = "true";
      if (hasData) body.prepend(notice);
      else body.replaceChildren(notice);
    }

    function clearSectionError(body) {
      body.querySelector("[data-statistics-error]")?.remove();
    }

    async function load(manual = false) {
      refresh.disabled = true;
      refresh.textContent = manual ? "Actualizando..." : "Cargando...";
      globalStatus.replaceChildren();

      [overview.body, distribution.body, groups.body, activity.body, evolution.body].forEach(showInitialLoading);

      try {
        const service = window.AdminDashboardService;
        if (!service) throw new Error("Servicio administrativo no disponible.");

        const confirmationsService = window.AdminConfirmationsService;
        const results = await Promise.allSettled([
          service.getSummary(),
          service.getGroupStatistics(),
          service.getEvolution(),
          confirmationsService?.getRsvpConfiguration?.() || Promise.resolve(null),
        ]);

        if (!root.isConnected) return;

        let errors = 0;
        const configResult = results[3];
        const rsvpConfig = configResult?.status === "fulfilled" ? configResult.value : null;

        if (configResult?.status === "rejected") {
          console.error("Statistics RSVP configuration request:", configResult.reason);
        }

        const summaryResult = results[0];
        if (summaryResult.status === "fulfilled") {
          try {
            clearSectionError(overview.body);
            clearSectionError(distribution.body);
            clearSectionError(activity.body);
            state.summary = summaryResult.value.data;
            state.generatedAt = summaryResult.value.generated_at;
            applyDeadlineClassification(state.summary, null, rsvpConfig);
            renderOverview(overview.body, state.summary);
            renderResponseDistribution(distribution.body, state.summary);
            renderActivity(activity.body, state.summary);
          } catch (error) {
            console.error("Statistics summary render:", error);
            errors += 1;
            showSectionError(overview.body, "No fue posible mostrar el panorama general.", Boolean(state.summary));
            showSectionError(distribution.body, "No fue posible mostrar la distribución.", Boolean(state.summary));
            showSectionError(activity.body, "No fue posible mostrar la actividad.", Boolean(state.summary));
          }
        } else {
          console.error("Statistics summary request:", summaryResult.reason);
          errors += 1;
          showSectionError(overview.body, "No fue posible cargar el panorama general.", Boolean(state.summary));
          showSectionError(distribution.body, "No fue posible cargar la distribución.", Boolean(state.summary));
          showSectionError(activity.body, "No fue posible cargar la actividad.", Boolean(state.summary));
        }

        const groupsResult = results[1];
        if (groupsResult.status === "fulfilled") {
          try {
            clearSectionError(groups.body);
            state.groups = groupsResult.value.data.items;
            state.generatedAt = groupsResult.value.generated_at || state.generatedAt;
            applyDeadlineClassification(null, state.groups, rsvpConfig);
            renderGroups(groups.body, state.groups);
          } catch (error) {
            console.error("Statistics groups render:", error);
            errors += 1;
            showSectionError(groups.body, "No fue posible mostrar las estadísticas por grupo.", Boolean(state.groups));
          }
        } else {
          console.error("Statistics groups request:", groupsResult.reason);
          errors += 1;
          showSectionError(groups.body, "No fue posible cargar las estadísticas por grupo.", Boolean(state.groups));
        }

        const evolutionResult = results[2];
        if (evolutionResult.status === "fulfilled") {
          try {
            clearSectionError(evolution.body);
            state.evolution = evolutionResult.value.data.items;
            state.generatedAt = evolutionResult.value.generated_at || state.generatedAt;
            renderEvolution(evolution.body, state.evolution);
          } catch (error) {
            console.error("Statistics evolution render:", error);
            errors += 1;
            showSectionError(evolution.body, "No fue posible mostrar la evolución.", Boolean(state.evolution));
          }
        } else {
          console.error("Statistics evolution request:", evolutionResult.reason);
          errors += 1;
          showSectionError(evolution.body, "No fue posible cargar la evolución.", Boolean(state.evolution));
        }

        updated.textContent = state.generatedAt
          ? `Actualizado: ${window.AdminDashboardFormatters.formatDateTime(state.generatedAt)}`
          : "Actualización incompleta";

        if (errors) {
          globalStatus.replaceChildren(feedback("error", `${errors} bloque${errors === 1 ? "" : "s"} no pudo${errors === 1 ? "" : "ieron"} actualizarse.`));
        } else if (manual) {
          globalStatus.replaceChildren(feedback("success", "Estadísticas actualizadas correctamente."));
        }
      } catch (error) {
        console.error("Statistics update:", error);
        globalStatus.replaceChildren(feedback("error", "No fue posible actualizar las estadísticas."));
      } finally {
        refresh.disabled = false;
        refresh.textContent = "Actualizar";
      }
    }

    refresh.addEventListener("click", () => {
      if (!refresh.disabled) load(true);
    });

    queueMicrotask(() => load(false));
    return root;
  };
})();