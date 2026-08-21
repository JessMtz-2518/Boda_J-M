(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};

  const WEDDING_DATE = new Date("2027-05-01T19:00:00-06:00");

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function button(text, primary = false) {
    const node = el("button", primary ? "admin-button" : "admin-button admin-button-secondary", text);
    node.type = "button";
    return node;
  }

  function daysToWedding() {
    return Math.max(0, Math.ceil((WEDDING_DATE.getTime() - Date.now()) / 86400000));
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function isOverdue(task) {
    if (!task.dueDate || task.status === "completada") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${task.dueDate}T00:00:00`);
    return due < today;
  }

  function statusLabel(value) {
    return value === "completada" ? "Completada" : value === "en_proceso" ? "En proceso" : "Pendiente";
  }

  function priorityLabel(value) {
    return value === "alta" ? "Alta" : value === "baja" ? "Baja" : "Media";
  }

  function buildMetric(label, value, detail = "", tone = "") {
    const card = el("article", `planner-metric${tone ? ` planner-metric-${tone}` : ""}`);
    card.append(
      el("span", "planner-metric-label", label),
      el("strong", "planner-metric-value", String(value)),
      el("span", "planner-metric-detail", detail)
    );
    return card;
  }

  function createTaskModal(task, onSaved) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay planner-modal-overlay");
    const dialog = el("section", "tables-modal planner-task-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Wedding Planner"),
      el("h2", "", task?.id ? "Editar pendiente" : "Nuevo pendiente")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const form = document.createElement("form");
    form.className = "planner-task-form";

    const title = document.createElement("input");
    title.type = "text";
    title.maxLength = 180;
    title.required = true;
    title.value = task?.title || "";
    title.placeholder = "Ej. Confirmar menú con el jardín";

    const category = document.createElement("input");
    category.type = "text";
    category.maxLength = 80;
    category.value = task?.category || "General";
    category.placeholder = "Ej. Banquete, Foto, Decoración";

    const responsible = document.createElement("input");
    responsible.type = "text";
    responsible.maxLength = 120;
    responsible.value = task?.responsible || "";
    responsible.placeholder = "Jessica, Marcos, proveedor…";

    const dueDate = document.createElement("input");
    dueDate.type = "date";
    dueDate.value = task?.dueDate || "";

    const priority = document.createElement("select");
    [["baja","Baja"],["media","Media"],["alta","Alta"]].forEach(([value,label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if ((task?.priority || "media") === value) option.selected = true;
      priority.append(option);
    });

    const status = document.createElement("select");
    [["pendiente","Pendiente"],["en_proceso","En proceso"],["completada","Completada"]].forEach(([value,label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if ((task?.status || "pendiente") === value) option.selected = true;
      status.append(option);
    });

    const notes = document.createElement("textarea");
    notes.rows = 4;
    notes.maxLength = 1500;
    notes.value = task?.notes || "";
    notes.placeholder = "Notas, condiciones, teléfonos o acuerdos importantes.";

    function field(labelText, control, className = "") {
      const label = el("label", `admin-field ${className}`.trim());
      label.append(el("span", "", labelText), control);
      return label;
    }

    const grid = el("div", "planner-form-grid");
    grid.append(
      field("Pendiente *", title, "planner-field-wide"),
      field("Categoría", category),
      field("Responsable", responsible),
      field("Fecha límite", dueDate),
      field("Prioridad", priority),
      field("Estado", status),
      field("Notas", notes, "planner-field-wide")
    );

    const feedback = el("p", "admin-message planner-form-feedback");
    feedback.setAttribute("role", "status");

    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button(task?.id ? "Guardar cambios" : "Agregar pendiente", true);
    save.type = "submit";
    actions.append(cancel, save);
    form.append(grid, feedback, actions);
    dialog.append(head, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() {
      overlay.remove();
      if (!document.querySelector(".tables-modal-overlay")) document.body.classList.remove("tables-modal-open");
      if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      feedback.textContent = "Guardando…";
      try {
        await window.AdminPlannerService.saveTask({
          id: task?.id || null,
          title: title.value,
          category: category.value,
          responsible: responsible.value,
          dueDate: dueDate.value,
          priority: priority.value,
          status: status.value,
          notes: notes.value,
        });
        dismiss();
        await onSaved();
      } catch (error) {
        console.error("Planeación guardar:", error);
        feedback.textContent = error?.message || "No fue posible guardar el pendiente.";
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });

    requestAnimationFrame(() => title.focus({ preventScroll: true }));
  }

  window.AdminViews.planeacion = () => {
    const root = el("section", "planner-view");
    const header = el("header", "planner-heading");
    const titleWrap = el("div");
    titleWrap.append(
      el("p", "admin-eyebrow", "Wedding Command Center"),
      el("h2", "", "Planeación"),
      el("p", "planner-heading-copy", "Checklist maestro para coordinar los pendientes de la boda.")
    );
    const add = button("Agregar pendiente", true);
    header.append(titleWrap, add);

    const hero = el("section", "planner-hero");
    const countdown = el("div", "planner-countdown");
    countdown.append(
      el("span", "planner-countdown-label", "Faltan"),
      el("strong", "planner-countdown-value", String(daysToWedding())),
      el("span", "planner-countdown-detail", "días para la boda")
    );
    const progressWrap = el("div", "planner-progress-wrap");
    progressWrap.append(
      el("div", "planner-progress-copy"),
      el("div", "planner-progress-track")
    );
    hero.append(countdown, progressWrap);

    const metrics = el("div", "planner-metrics");
    const toolbar = el("div", "planner-toolbar");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Buscar tarea, categoría o responsable";
    search.className = "planner-search";

    const statusFilter = document.createElement("select");
    [["","Todos los estados"],["pendiente","Pendiente"],["en_proceso","En proceso"],["completada","Completada"]].forEach(([value,label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; statusFilter.append(option);
    });

    const priorityFilter = document.createElement("select");
    [["","Todas las prioridades"],["alta","Alta"],["media","Media"],["baja","Baja"]].forEach(([value,label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; priorityFilter.append(option);
    });

    toolbar.append(search, statusFilter, priorityFilter);

    const content = el("div", "planner-layout");
    const listPanel = el("section", "planner-panel planner-list-panel");
    const listHead = el("header", "planner-panel-head");
    listHead.append(el("h3", "", "Checklist maestro"), el("span", "planner-list-count", "0 tareas"));
    const list = el("div", "planner-task-list");
    listPanel.append(listHead, list);

    const upcomingPanel = el("aside", "planner-panel planner-upcoming-panel");
    upcomingPanel.append(el("h3", "", "Próximas fechas"), el("div", "planner-upcoming-list"));
    content.append(listPanel, upcomingPanel);

    const feedback = el("div", "planner-global-feedback");
    root.append(header, hero, metrics, toolbar, feedback, content);

    let snapshot = { summary: {}, tasks: [] };

    function renderProgress(summary) {
      const value = Math.max(0, Math.min(100, Number(summary.progress || 0)));
      const copy = progressWrap.querySelector(".planner-progress-copy");
      const track = progressWrap.querySelector(".planner-progress-track");
      copy.replaceChildren(
        el("strong", "", "Progreso general"),
        el("span", "", `${value.toFixed(value % 1 ? 1 : 0)}% completado`)
      );
      const bar = el("span", "planner-progress-bar");
      bar.style.width = `${value}%`;
      track.replaceChildren(bar);
    }

    function renderMetrics(summary) {
      metrics.replaceChildren(
        buildMetric("Total", summary.total || 0, Number(summary.total || 0) === 1 ? "tarea registrada" : "tareas registradas"),
        buildMetric("Completadas", summary.completed || 0, "tareas cerradas", "positive"),
        buildMetric("En proceso", summary.inProgress || 0, "en seguimiento"),
        buildMetric("Pendientes", summary.pending || 0, "por iniciar"),
        buildMetric("Vencidas", summary.overdue || 0, "requieren atención", summary.overdue ? "attention" : "positive")
      );
    }

    function filteredTasks() {
      const q = search.value.trim().toLocaleLowerCase("es");
      return snapshot.tasks.filter((task) => {
        if (statusFilter.value && task.status !== statusFilter.value) return false;
        if (priorityFilter.value && task.priority !== priorityFilter.value) return false;
        if (!q) return true;
        return [task.title, task.category, task.responsible, task.notes].join(" ").toLocaleLowerCase("es").includes(q);
      });
    }

    async function quickStatus(task, nextStatus) {
      try {
        await window.AdminPlannerService.saveTask({ ...task, status: nextStatus });
        await load(true);
      } catch (error) {
        console.error("Planeación estado:", error);
        feedback.textContent = error?.message || "No fue posible actualizar el estado.";
      }
    }

    async function removeTask(task) {
      if (!window.confirm(`¿Eliminar "${task.title}"?`)) return;
      try {
        await window.AdminPlannerService.deleteTask(task.id);
        await load(true);
      } catch (error) {
        console.error("Planeación eliminar:", error);
        feedback.textContent = error?.message || "No fue posible eliminar el pendiente.";
      }
    }

    function renderTaskList() {
      const tasks = filteredTasks();
      listHead.querySelector(".planner-list-count").textContent = `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`;
      list.replaceChildren();

      if (!tasks.length) {
        list.append(el("div", "planner-empty", snapshot.tasks.length ? "No hay pendientes que coincidan con los filtros." : "Aún no has agregado pendientes. Empieza con el checklist maestro."));
        return;
      }

      tasks.forEach((task) => {
        const card = el("article", `planner-task planner-task-${task.status}${isOverdue(task) ? " planner-task-overdue" : ""}`);
        const main = el("div", "planner-task-main");
        const badges = el("div", "planner-task-badges");
        badges.append(
          el("span", `planner-badge planner-priority-${task.priority}`, `Prioridad ${priorityLabel(task.priority)}`),
          el("span", `planner-badge planner-status-${task.status}`, statusLabel(task.status))
        );
        if (isOverdue(task)) badges.append(el("span", "planner-badge planner-overdue-badge", "Vencida"));
        main.append(
          badges,
          el("h4", "", task.title),
          el("p", "planner-task-meta", `${task.category}${task.responsible ? ` · ${task.responsible}` : ""}${task.dueDate ? ` · ${formatDate(task.dueDate)}` : ""}`)
        );
        if (task.notes) main.append(el("p", "planner-task-notes", task.notes));

        const actions = el("div", "planner-task-actions");
        const edit = button("Editar");
        edit.addEventListener("click", () => createTaskModal(task, load));
        actions.append(edit);

        if (task.status === "completada") {
          const reopen = button("Reabrir");
          reopen.addEventListener("click", () => quickStatus(task, "pendiente"));
          actions.append(reopen);
        } else {
          const complete = button("Completar", true);
          complete.addEventListener("click", () => quickStatus(task, "completada"));
          actions.append(complete);
        }

        const remove = button("Eliminar");
        remove.classList.add("planner-delete-button");
        remove.addEventListener("click", () => removeTask(task));
        actions.append(remove);

        card.append(main, actions);
        list.append(card);
      });
    }

    function renderUpcoming() {
      const target = upcomingPanel.querySelector(".planner-upcoming-list");
      const items = snapshot.tasks
        .filter((task) => task.status !== "completada" && task.dueDate)
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 6);

      target.replaceChildren();
      if (!items.length) {
        target.append(el("p", "planner-empty planner-empty-small", "No hay próximas fechas registradas."));
        return;
      }
      items.forEach((task) => {
        const row = el("article", `planner-upcoming-item${isOverdue(task) ? " planner-upcoming-overdue" : ""}`);
        row.append(
          el("strong", "", task.title),
          el("span", "", formatDate(task.dueDate)),
          el("small", "", `${task.category}${task.responsible ? ` · ${task.responsible}` : ""}`)
        );
        target.append(row);
      });
    }

    async function load(silent = false) {
      if (!silent) {
        feedback.textContent = "Cargando planeación…";
        list.replaceChildren(el("div", "planner-empty", "Cargando checklist…"));
      } else {
        feedback.textContent = "Actualizando…";
      }

      try {
        snapshot = await window.AdminPlannerService.getSummary();
        if (!root.isConnected) return;
        renderProgress(snapshot.summary);
        renderMetrics(snapshot.summary);
        renderTaskList();
        renderUpcoming();
        feedback.textContent = "";
      } catch (error) {
        console.error("Planeación:", error);
        feedback.textContent = "No fue posible cargar Planeación. Verifica que hayas ejecutado el SQL de la Fase 7.1.";
        list.replaceChildren(el("div", "planner-empty", "No fue posible cargar el checklist."));
      }
    }

    add.addEventListener("click", () => createTaskModal(null, load));
    [search, statusFilter, priorityFilter].forEach((control) => control.addEventListener("input", renderTaskList));
    [statusFilter, priorityFilter].forEach((control) => control.addEventListener("change", renderTaskList));

    load();
    return root;
  };
})();
