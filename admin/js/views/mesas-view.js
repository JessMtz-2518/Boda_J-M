(() => {
  "use strict";

  window.AdminViews = window.AdminViews || {};

  const formatter = new Intl.NumberFormat("es-MX");

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

  function format(value) {
    return formatter.format(Number(value) || 0);
  }

  function field(label, control, helper = "") {
    const wrapper = el("label", "tables-field");
    wrapper.append(el("span", "tables-field-label", label), control);
    if (helper) wrapper.append(el("small", "tables-field-help", helper));
    return wrapper;
  }

  function metric(label, value, detail = "") {
    const card = el("article", "tables-metric");
    card.append(
      el("span", "tables-metric-label", label),
      el("strong", "tables-metric-value", value),
      el("span", "tables-metric-detail", detail)
    );
    return card;
  }

  function statusBox(type, title, text) {
    const box = el("div", `tables-capacity-status tables-capacity-status-${type}`);
    box.append(el("strong", "", title), el("p", "", text));
    return box;
  }

  function errorMessage(error) {
    const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.trim();

    const map = [
      ["CAPACIDAD_MESA_EXCEDIDA", error?.details || "La mesa no tiene suficientes lugares disponibles."],
      ["ADULTOS_EXCEDEN_CONFIRMACION", "No puedes asignar más adultos de los confirmados."],
      ["NINOS_EXCEDEN_CONFIRMACION", "No puedes asignar más niños de los confirmados."],
      ["INVITADO_NO_ASISTIRA", "La invitación ya no tiene una confirmación vigente de asistencia."],
      ["INVITADO_INACTIVO", "La invitación está inactiva."],
      ["MESA_INACTIVA", "La mesa está inactiva."],
      ["REGISTRO_DESACTUALIZADO", "La información cambió en otra sesión. Actualiza antes de continuar."],
      ["MOTIVO_INVALIDO", "Escribe el motivo administrativo."],
      ["ASIGNACION_INVALIDA", "La asignación debe contener al menos una persona."],
      ["CONFIGURACION_BLOQUEADA_ASIGNACIONES_ACTIVAS", "La configuración general está bloqueada porque ya existen asignaciones activas."],
      ["CAPACIDAD_MENOR_A_OCUPACION", error?.details || "La capacidad no puede ser menor que las personas asignadas."],
      ["CAPACIDAD_MESA_INVALIDA", "La capacidad de la mesa debe estar entre 1 y 50 lugares."],
      ["NOMBRE_MESA_INVALIDO", "El nombre de la mesa es demasiado largo."],
      ["UBICACION_MESA_INVALIDA", "La ubicación de la mesa es demasiado larga."],
      ["NOTAS_MESA_INVALIDAS", "Las notas de la mesa son demasiado largas."],
      ["MISMA_MESA_DESTINO", "Selecciona una mesa diferente a la actual."],
      ["REASIGNACION_INVALIDA", "La reasignación no es válida."],
      ["SIN_ASIGNACIONES_ACTIVAS", "Ya no existen asignaciones activas que liberar."],
      ["LIMITE_MESAS_ALCANZADO", "Ya alcanzaste el máximo de 100 mesas activas."],
      ["NUMERO_MESA_NO_DISPONIBLE", "No hay un número disponible para crear otra mesa."],
      ["MESA_YA_INACTIVA", "La mesa ya se encuentra inactiva."],
      ["MESA_CON_ASIGNACIONES", "Esta mesa tiene invitados asignados. Muévelos o retíralos antes de eliminarla."],
      ["CAPACIDAD_INSUFICIENTE_AL_ELIMINAR", error?.details || "La capacidad restante no sería suficiente para el padrón activo."],
      ["PLANO_INVALIDO", "No hay una distribución válida para guardar."],
      ["PLANO_POSICION_INVALIDA", "Una de las mesas tiene una posición inválida."],
      ["PLANO_MESAS_DUPLICADAS", "El plano contiene una mesa duplicada."],
      ["ELEMENTOS_PLANO_INVALIDOS", "No hay elementos visuales válidos para guardar."],
      ["ELEMENTO_PLANO_POSICION_INVALIDA", "Uno de los elementos del plano tiene una posición o tamaño inválido."],
      ["ELEMENTO_PLANO_NO_ENCONTRADO", "No se encontró uno de los elementos del plano."],
      ["LIENZO_DIMENSION_INVALIDA", "El tamaño del lienzo no es válido."],
      ["EDITOR_PLANO_INVALIDO", "El plano contiene información inválida."],
    ];

    for (const [code, text] of map) {
      if (message.includes(code)) return text;
    }

    return error?.details || "No fue posible completar la operación.";
  }

  function closeModal(overlay, previousFocus) {
    overlay.remove();
    if (!document.querySelector(".tables-modal-overlay")) {
      document.body.classList.remove("tables-modal-open");
    }
    if (previousFocus instanceof HTMLElement && document.body.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function counter(label, initial, max) {
    const wrap = el("div", "tables-counter");
    const title = el("span", "tables-counter-label", label);
    const controls = el("div", "tables-counter-controls");
    const minus = button("−");
    const value = el("strong", "tables-counter-value", String(initial));
    const plus = button("+");
    const meta = el("span", "tables-counter-max", `Máx. ${max}`);

    let current = Math.max(0, Math.min(Number(initial) || 0, Number(max) || 0));

    function sync() {
      value.textContent = String(current);
      minus.disabled = current <= 0;
      plus.disabled = current >= max;
    }

    minus.addEventListener("click", () => {
      if (current <= 0) return;
      current -= 1;
      sync();
    });

    plus.addEventListener("click", () => {
      if (current >= max) return;
      current += 1;
      sync();
    });

    controls.append(minus, value, plus);
    wrap.append(title, controls, meta);
    sync();

    return {
      node: wrap,
      getValue: () => current,
      setValue: (next) => {
        current = Math.max(0, Math.min(Number(next) || 0, Number(max) || 0));
        sync();
      },
    };
  }



  function renderTablesTable(items, { onDetail }) {
    const wrapper = el("div", "tables-list-table-wrap");
    const table = el("table", "tables-list-table");

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    [
      "Mesa",
      "Alias",
      "Ocupación",
      "Capacidad",
      "Disponibles",
      "Estado",
      "Acciones",
    ].forEach((label) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.append(th);
    });
    thead.append(headRow);

    const tbody = document.createElement("tbody");

    items.forEach((item) => {
      const row = document.createElement("tr");

      const number = document.createElement("td");
      number.dataset.label = "Mesa";
      number.append(el("strong", "tables-table-number", `Mesa ${item.numero}`));

      const alias = document.createElement("td");
      alias.dataset.label = "Alias";
      alias.textContent = item.nombre || `Mesa ${item.numero}`;

      const occupancy = document.createElement("td");
      occupancy.dataset.label = "Ocupación";
      occupancy.append(
        el("strong", "tables-table-occupancy-inline", `${item.ocupados} / ${item.capacidad}`)
      );

      const capacity = document.createElement("td");
      capacity.dataset.label = "Capacidad";
      capacity.textContent = String(item.capacidad);

      const available = document.createElement("td");
      available.dataset.label = "Disponibles";
      available.textContent = String(item.disponibles);

      const status = document.createElement("td");
      status.dataset.label = "Estado";
      const badge = el(
        "span",
        `tables-list-status tables-list-status-${item.estado}`,
        item.estado === "completa"
          ? "Completa"
          : item.estado === "casi_llena"
            ? "Casi llena"
            : "Disponible"
      );
      status.append(badge);

      const actions = document.createElement("td");
      actions.dataset.label = "Acciones";
      const detail = button("Ver mesa");
      detail.addEventListener("click", () => onDetail(item.id, detail));
      actions.append(detail);

      row.append(number, alias, occupancy, capacity, available, status, actions);
      tbody.append(row);
    });

    table.append(thead, tbody);
    wrapper.append(table);
    return wrapper;
  }

  function defaultElementPositions(items) {
    const defaults = {
      mesa_novios: { x: 50, y: 12, width: 22, height: 10 },
      pista_baile: { x: 50, y: 50, width: 30, height: 24 },
    };

    return items.map((item) => {
      const fallback = defaults[item.tipo] || { x: 50, y: 50, width: 18, height: 12 };
      return {
        id: item.id,
        type: item.tipo,
        name: item.nombre,
        x: item.plano_x !== null && item.plano_x !== undefined ? Number(item.plano_x) : fallback.x,
        y: item.plano_y !== null && item.plano_y !== undefined ? Number(item.plano_y) : fallback.y,
        width: Number(item.ancho || fallback.width),
        height: Number(item.alto || fallback.height),
      };
    });
  }

  function defaultPlanPositions(items) {
    const columns = 6;
    const rows = Math.max(1, Math.ceil(items.length / columns));
    const xStart = 8;
    const xEnd = 92;
    const yStart = 12;
    const yEnd = 88;
    const xStep = columns > 1 ? (xEnd - xStart) / (columns - 1) : 0;
    const yStep = rows > 1 ? (yEnd - yStart) / (rows - 1) : 0;

    return items.map((item, index) => ({
      tableId: item.id,
      x: item.plano_x !== null && item.plano_x !== undefined
        ? Number(item.plano_x)
        : xStart + (index % columns) * xStep,
      y: item.plano_y !== null && item.plano_y !== undefined
        ? Number(item.plano_y)
        : yStart + Math.floor(index / columns) * yStep,
    }));
  }


  function openSavePlanModal(editorState, { onSaved }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Plano del evento"),
      el("h2", "", "Guardar distribución"),
      el(
        "p",
        "tables-modal-copy",
        `${editorState.positions.length} mesas · ${editorState.elements.length} elementos · lienzo ${Math.round(editorState.width)} × ${Math.round(editorState.height)}`
      )
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio · Ej. Ajuste final de distribución";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Guardar distribución", true);
    actions.append(cancel, save);

    const body = el("div", "tables-modal-body");
    body.append(
      field("Motivo del cambio *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    save.addEventListener("click", async () => {
      const motive = reason.value.trim();
      if (!motive) {
        status.textContent = "Escribe el motivo de la distribución.";
        reason.focus();
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando distribución…";

      // Validación final defensiva: no guardar nunca una distribución
      // que contenga objetos superpuestos.
      const state = editorState;
      const tableRects = state.positions.map((pos) => ({
        id: pos.tableId,
        bounds: {
          left: pos.x - 4.65,
          right: pos.x + 4.65,
          top: pos.y - 4.65,
          bottom: pos.y + 4.65,
        },
      }));
      const elementRects = state.elements.map((element) => ({
        id: element.id,
        bounds: {
          left: element.x - element.width / 2,
          right: element.x + element.width / 2,
          top: element.y - element.height / 2,
          bottom: element.y + element.height / 2,
        },
      }));

      const overlap = (a, b, gap = 0.65) => !(
        a.right + gap <= b.left ||
        a.left >= b.right + gap ||
        a.bottom + gap <= b.top ||
        a.top >= b.bottom + gap
      );

      for (let i = 0; i < tableRects.length; i += 1) {
        for (let j = i + 1; j < tableRects.length; j += 1) {
          if (overlap(tableRects[i].bounds, tableRects[j].bounds)) {
            status.textContent = "Hay mesas demasiado juntas o superpuestas. Ajusta la distribución antes de guardar.";
            save.disabled = false;
            close.disabled = false;
            cancel.disabled = false;
            return;
          }
        }

        for (const element of elementRects) {
          if (overlap(tableRects[i].bounds, element.bounds)) {
            status.textContent = "Una mesa invade un espacio reservado. Ajusta la distribución antes de guardar.";
            save.disabled = false;
            close.disabled = false;
            cancel.disabled = false;
            return;
          }
        }
      }

      for (let i = 0; i < elementRects.length; i += 1) {
        for (let j = i + 1; j < elementRects.length; j += 1) {
          if (overlap(elementRects[i].bounds, elementRects[j].bounds)) {
            status.textContent = "Los espacios reservados no pueden superponerse.";
            save.disabled = false;
            close.disabled = false;
            cancel.disabled = false;
            return;
          }
        }
      }

      try {
        await window.AdminTablesService.saveAdvancedPlan({
          width: editorState.width,
          height: editorState.height,
          positions: editorState.positions,
          elements: editorState.elements,
          reason: motive,
        });
        dismiss();
        await onSaved();
      } catch (error) {
        console.error("Save advanced plan:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function renderVisualPlan(items, elements, config, { onDetail, onChanged }) {
    const BASE_UNIT_PX = 9;
    const EXPAND_BY = 18;
    const EDGE_THRESHOLD = 7;
    const MIN_ZOOM = 0.32;
    const MAX_ZOOM = 2.4;

    const wrapper = el("div", "tables-plan-wrapper tables-plan-editor");
    const viewport = el("div", "tables-plan-viewport");
    const sizer = el("div", "tables-plan-sizer");
    const stage = el("div", "tables-plan-stage");
    stage.setAttribute("aria-label", "Plano visual editable de mesas");

    sizer.append(stage);
    viewport.append(sizer);
    wrapper.append(viewport);

    let worldWidth = Math.max(60, Number(config?.ancho) || 100);
    let worldHeight = Math.max(60, Number(config?.alto) || 100);
    let zoom = 1.0;
    let dirty = false;
    let selectedElementId = null;

    const positions = new Map(
      defaultPlanPositions(items).map((item) => [item.tableId, {
        tableId: item.tableId,
        x: Math.min(worldWidth, Math.max(0, item.x)),
        y: Math.min(worldHeight, Math.max(0, item.y)),
      }])
    );

    const elementPositions = new Map(
      defaultElementPositions(elements).map((item) => [item.id, {
        ...item,
        x: Math.min(worldWidth - item.width / 2, Math.max(item.width / 2, item.x)),
        y: Math.min(worldHeight - item.height / 2, Math.max(item.height / 2, item.y)),
      }])
    );

    function pxPerUnit() {
      return BASE_UNIT_PX;
    }

    function updateStageGeometry() {
      const baseW = worldWidth * pxPerUnit();
      const baseH = worldHeight * pxPerUnit();

      stage.style.width = `${baseW}px`;
      stage.style.height = `${baseH}px`;
      stage.style.transform = `scale(${zoom})`;
      stage.style.transformOrigin = "0 0";

      sizer.style.width = `${baseW * zoom}px`;
      sizer.style.height = `${baseH * zoom}px`;

      wrapper.style.setProperty("--plan-zoom-label", `"${Math.round(zoom * 100)}%"`);
      renderAllPositions();
    }

    function worldToPx(value) {
      return value * pxPerUnit();
    }

    function clientToWorld(clientX, clientY) {
      const rect = stage.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / (pxPerUnit() * zoom),
        y: (clientY - rect.top) / (pxPerUnit() * zoom),
      };
    }

    function currentPositions() {
      return items.map((item) => {
        const pos = positions.get(item.id);
        return { tableId: item.id, x: pos.x, y: pos.y };
      });
    }

    function currentElements() {
      return elements.map((item) => {
        const pos = elementPositions.get(item.id);
        return {
          id: item.id,
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
        };
      });
    }

    function snapshot() {
      return {
        width: worldWidth,
        height: worldHeight,
        positions: currentPositions(),
        elements: currentElements(),
        zoom,
      };
    }

    function setDirty(value = true) {
      dirty = value;
      wrapper.classList.toggle("tables-plan-dirty", dirty);
      if (typeof onChanged === "function") {
        onChanged(dirty, snapshot());
      }
    }

    function shiftWorld(dx, dy) {
      if (!dx && !dy) return;

      positions.forEach((pos, key) => {
        positions.set(key, {
          ...pos,
          x: pos.x + dx,
          y: pos.y + dy,
        });
      });

      elementPositions.forEach((pos, key) => {
        elementPositions.set(key, {
          ...pos,
          x: pos.x + dx,
          y: pos.y + dy,
        });
      });
    }


    const COLLISION_GAP = 0.65;
    const TABLE_RADIUS = 4.65;
    const PUSH_STEP = 0.7;
    const PUSH_MAX_ITERATIONS = 160;

    function rectsOverlap(a, b, gap = COLLISION_GAP) {
      return !(
        a.right + gap <= b.left ||
        a.left >= b.right + gap ||
        a.bottom + gap <= b.top ||
        a.top >= b.bottom + gap
      );
    }

    function tableBounds(pos) {
      return {
        left: pos.x - TABLE_RADIUS,
        right: pos.x + TABLE_RADIUS,
        top: pos.y - TABLE_RADIUS,
        bottom: pos.y + TABLE_RADIUS,
      };
    }

    function elementBounds(pos) {
      return {
        left: pos.x - pos.width / 2,
        right: pos.x + pos.width / 2,
        top: pos.y - pos.height / 2,
        bottom: pos.y + pos.height / 2,
      };
    }

    function boundsCenter(bounds) {
      return {
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2,
      };
    }

    function getCollision(kind, id, bounds) {
      for (const [tableId, pos] of positions.entries()) {
        if (kind === "table" && String(tableId) === String(id)) continue;
        const otherBounds = tableBounds(pos);
        if (rectsOverlap(bounds, otherBounds)) {
          return {
            kind: "table",
            id: tableId,
            bounds: otherBounds,
            position: pos,
          };
        }
      }

      for (const [elementId, pos] of elementPositions.entries()) {
        if (kind === "element" && String(elementId) === String(id)) continue;
        const otherBounds = elementBounds(pos);
        if (rectsOverlap(bounds, otherBounds)) {
          return {
            kind: "element",
            id: elementId,
            bounds: otherBounds,
            position: pos,
          };
        }
      }

      return null;
    }

    function collidesWithPlan(kind, id, bounds) {
      return Boolean(getCollision(kind, id, bounds));
    }

    function showCollision(node, invalid) {
      node.classList.toggle("is-collision", Boolean(invalid));
      node.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid) {
        node.title = "Ese espacio está ocupado. El elemento no puede colocarse aquí.";
      }
    }

    function clampTableToWorld(pos) {
      return {
        ...pos,
        x: Math.max(TABLE_RADIUS, Math.min(worldWidth - TABLE_RADIUS, pos.x)),
        y: Math.max(TABLE_RADIUS, Math.min(worldHeight - TABLE_RADIUS, pos.y)),
      };
    }

    function ensureWorldContainsTable(pos) {
      let changed = false;
      while (pos.x + TABLE_RADIUS + EDGE_THRESHOLD > worldWidth && worldWidth < 600) {
        changed = expand("right") || changed;
      }
      while (pos.x - TABLE_RADIUS - EDGE_THRESHOLD < 0 && worldWidth < 600) {
        changed = expand("left") || changed;
        pos = { ...pos, x: pos.x + EXPAND_BY };
      }
      while (pos.y + TABLE_RADIUS + EDGE_THRESHOLD > worldHeight && worldHeight < 600) {
        changed = expand("bottom") || changed;
      }
      while (pos.y - TABLE_RADIUS - EDGE_THRESHOLD < 0 && worldHeight < 600) {
        changed = expand("top") || changed;
        pos = { ...pos, y: pos.y + EXPAND_BY };
      }
      return clampTableToWorld(pos);
    }

    function findNearestFreeTablePosition(tableId, desired, obstacleBounds) {
      let candidate = clampTableToWorld({ ...desired });
      if (!collidesWithPlan("table", tableId, tableBounds(candidate))) {
        return candidate;
      }

      const obstacleCenter = boundsCenter(obstacleBounds);
      const startDx = candidate.x - obstacleCenter.x;
      const startDy = candidate.y - obstacleCenter.y;
      const baseAngle = Math.atan2(startDy || 0.01, startDx || 0.01);

      // Buscar alrededor del obstáculo en anillos crecientes.
      for (let ring = 1; ring <= 30; ring += 1) {
        const radius = TABLE_RADIUS * 2 + COLLISION_GAP + ring * PUSH_STEP;

        for (let step = 0; step < 24; step += 1) {
          const angle = baseAngle + (Math.PI * 2 * step) / 24;
          let next = {
            tableId,
            x: obstacleCenter.x + Math.cos(angle) * radius,
            y: obstacleCenter.y + Math.sin(angle) * radius,
          };

          next = ensureWorldContainsTable(next);

          if (!collidesWithPlan("table", tableId, tableBounds(next))) {
            return next;
          }
        }
      }

      return null;
    }

    function pushTablesOutOfElement(elementId, elementPos) {
      const obstacle = elementBounds(elementPos);
      const changedTables = [];

      // Primero detectamos las mesas invadidas por el nuevo tamaño/posición.
      for (const [tableId, tablePos] of positions.entries()) {
        if (!rectsOverlap(tableBounds(tablePos), obstacle)) continue;

        const free = findNearestFreeTablePosition(tableId, tablePos, obstacle);
        if (!free) {
          return {
            ok: false,
            changedTables,
          };
        }

        positions.set(tableId, free);
        changedTables.push({
          tableId,
          previous: tablePos,
          next: free,
        });
      }

      // Una mesa desplazada puede provocar una colisión en cadena.
      // Recorremos todas las mesas y resolvemos las nuevas colisiones.
      let iterations = 0;
      let unresolved = true;

      while (unresolved && iterations < PUSH_MAX_ITERATIONS) {
        unresolved = false;
        iterations += 1;

        for (const [tableId, tablePos] of positions.entries()) {
          const collision = getCollision("table", tableId, tableBounds(tablePos));
          if (!collision) continue;

          // Las mesas jamás pueden empujar elementos reservados.
          const obstacleForTable = collision.bounds;
          const free = findNearestFreeTablePosition(tableId, tablePos, obstacleForTable);

          if (!free) {
            return {
              ok: false,
              changedTables,
            };
          }

          positions.set(tableId, free);
          changedTables.push({
            tableId,
            previous: tablePos,
            next: free,
          });
          unresolved = true;
        }
      }

      if (iterations >= PUSH_MAX_ITERATIONS) {
        return {
          ok: false,
          changedTables,
        };
      }

      renderAllPositions();
      return {
        ok: true,
        changedTables,
      };
    }

    function restoreTableChanges(changes) {
      [...changes].reverse().forEach((change) => {
        positions.set(change.tableId, change.previous);
      });
      renderAllPositions();
    }


    // =====================================================
    // FASE 5.2.4.2 · REACOMODO LOCAL INTELIGENTE
    //
    // En cada movimiento se recalcula el acomodo de las mesas
    // tomando como prioridad su posición original ("home").
    // Una mesa solo se aparta lo mínimo indispensable y vuelve
    // inmediatamente a su lugar cuando queda libre.
    // =====================================================

    let activeFlow = null;

    function clonePositionsMap() {
      return new Map(
        [...positions.entries()].map(([id, pos]) => [id, { ...pos }])
      );
    }

    function beginDynamicFlow(sourceKind, sourceId) {
      activeFlow = {
        sourceKind,
        sourceId,
        homes: clonePositionsMap(),
      };
    }

    function endDynamicFlow() {
      activeFlow = null;
    }

    function distanceBetween(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function collidesWithReserved(bounds, ignoredElementId = null) {
      for (const [elementId, elementPos] of elementPositions.entries()) {
        if (ignoredElementId !== null
            && String(elementId) === String(ignoredElementId)) {
          continue;
        }
        if (rectsOverlap(bounds, elementBounds(elementPos))) {
          return true;
        }
      }
      return false;
    }

    function collidesWithPlacedTables(bounds, placed, ignoredTableId = null) {
      for (const [tableId, tablePos] of placed.entries()) {
        if (ignoredTableId !== null
            && String(tableId) === String(ignoredTableId)) {
          continue;
        }
        if (rectsOverlap(bounds, tableBounds(tablePos))) {
          return true;
        }
      }
      return false;
    }

    function slotIsFree(tableId, candidate, placed, ignoredElementId = null) {
      const bounds = tableBounds(candidate);
      return !collidesWithReserved(bounds, ignoredElementId)
        && !collidesWithPlacedTables(bounds, placed, tableId);
    }

    function nearestLocalSlot(tableId, desired, placed, ignoredElementId = null) {
      // Importante: durante la búsqueda de posiciones NO ampliamos el lienzo.
      // Antes se llamaba ensureWorldContainsTable(), que podía expandir hacia
      // izquierda/arriba y desplazar la pista y la mesa de los novios aunque
      // solo estuviéramos probando candidatos temporales.
      const base = clampTableToWorld({ ...desired });

      if (slotIsFree(tableId, base, placed, ignoredElementId)) {
        return base;
      }

      // Búsqueda concéntrica alrededor de la posición original.
      // Pasos pequeños = reacomodo compacto.
      const radialStep = 0.62;
      const angles = 36;

      for (let ring = 1; ring <= 36; ring += 1) {
        const radius = ring * radialStep;

        for (let step = 0; step < angles; step += 1) {
          const angle = (Math.PI * 2 * step) / angles;
          let candidate = {
            tableId,
            x: desired.x + Math.cos(angle) * radius,
            y: desired.y + Math.sin(angle) * radius,
          };

          candidate = clampTableToWorld(candidate);

          if (slotIsFree(tableId, candidate, placed, ignoredElementId)) {
            return candidate;
          }
        }
      }

      return null;
    }

    function applyPlannedPositions(planned) {
      positions.clear();
      planned.forEach((pos, id) => {
        positions.set(id, { ...pos });
      });
      renderAllPositions();
    }

    function solveTableLayout({
      sourceTableId = null,
      sourcePosition = null,
      ignoredElementId = null,
      homes = null,
    } = {}) {
      const sourceHomes = homes || activeFlow?.homes || clonePositionsMap();
      const planned = new Map();

      // La mesa que el usuario está arrastrando tiene prioridad.
      if (sourceTableId !== null && sourcePosition) {
        // La expansión real del lienzo ya se gestiona desde el gesto de
        // arrastre. El solver únicamente acomoda dentro del mundo actual.
        const source = clampTableToWorld({
          tableId: sourceTableId,
          x: sourcePosition.x,
          y: sourcePosition.y,
        });

        if (collidesWithReserved(tableBounds(source), ignoredElementId)) {
          return false;
        }

        planned.set(sourceTableId, source);
      }

      const tableIds = [...sourceHomes.keys()]
        .filter((id) => String(id) !== String(sourceTableId));

      // Primero acomodamos las mesas cercanas al objeto que se mueve.
      // Así evitamos que una colisión local provoque desplazamientos
      // innecesarios en mesas lejanas.
      if (sourcePosition) {
        tableIds.sort((a, b) => {
          const da = distanceBetween(sourceHomes.get(a), sourcePosition);
          const db = distanceBetween(sourceHomes.get(b), sourcePosition);
          return da - db;
        });
      }

      for (const tableId of tableIds) {
        const home = sourceHomes.get(tableId);
        const free = nearestLocalSlot(
          tableId,
          home,
          planned,
          ignoredElementId
        );

        if (!free) {
          return false;
        }

        planned.set(tableId, free);
      }

      applyPlannedPositions(planned);
      return true;
    }

    function solveLayoutForMovingElement(elementId) {
      const homes = activeFlow?.homes || clonePositionsMap();
      return solveTableLayout({
        sourceTableId: null,
        sourcePosition: null,
        ignoredElementId: null,
        homes,
      });
    }

    function normalizeInitialTableLayout() {
      const homes = clonePositionsMap();
      const before = JSON.stringify(
        [...homes.entries()].map(([id, pos]) => [id, pos.x, pos.y])
      );

      const solved = solveTableLayout({ homes });

      if (!solved) {
        return false;
      }

      const after = JSON.stringify(
        [...positions.entries()].map(([id, pos]) => [id, pos.x, pos.y])
      );

      return before !== after;
    }

    function settleDynamicFlow() {
      if (!activeFlow) return;
      compactWorldIfPossible();
      endDynamicFlow();
    }


    function centerContentInWorld() {
      const bounds = boundsOfContent();
      const contentWidth = bounds.right - bounds.left;
      const contentHeight = bounds.bottom - bounds.top;

      const targetCenterX = worldWidth / 2;
      const targetCenterY = worldHeight / 2;
      const currentCenterX = (bounds.left + bounds.right) / 2;
      const currentCenterY = (bounds.top + bounds.bottom) / 2;

      let dx = targetCenterX - currentCenterX;
      let dy = targetCenterY - currentCenterY;

      // Evitar sacar contenido del lienzo.
      dx = Math.max(-bounds.left, Math.min(worldWidth - bounds.right, dx));
      dy = Math.max(-bounds.top, Math.min(worldHeight - bounds.bottom, dy));

      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        return false;
      }

      shiftWorld(dx, dy);
      renderAllPositions();
      return true;
    }

    function compactWorldIfPossible() {
      const PADDING = 8;
      const MIN_WORLD = 100;

      const bounds = boundsOfContent();

      // Calculamos cuánto espacio vacío existe en cada extremo.
      const emptyLeft = Math.max(0, bounds.left - PADDING);
      const emptyTop = Math.max(0, bounds.top - PADDING);
      const emptyRight = Math.max(0, worldWidth - bounds.right - PADDING);
      const emptyBottom = Math.max(0, worldHeight - bounds.bottom - PADDING);

      // Recortamos izquierda/arriba desplazando todo el contenido
      // para no alterar su distribución relativa.
      let shiftX = 0;
      let shiftY = 0;

      if (emptyLeft > EXPAND_BY / 2) {
        shiftX = Math.min(
          emptyLeft,
          Math.max(0, worldWidth - MIN_WORLD)
        );
      }

      if (emptyTop > EXPAND_BY / 2) {
        shiftY = Math.min(
          emptyTop,
          Math.max(0, worldHeight - MIN_WORLD)
        );
      }

      if (shiftX > 0) {
        shiftWorld(-shiftX, 0);
        worldWidth -= shiftX;
        viewport.scrollLeft = Math.max(
          0,
          viewport.scrollLeft - worldToPx(shiftX) * zoom
        );
      }

      if (shiftY > 0) {
        shiftWorld(0, -shiftY);
        worldHeight -= shiftY;
        viewport.scrollTop = Math.max(
          0,
          viewport.scrollTop - worldToPx(shiftY) * zoom
        );
      }

      // Recalculamos después de desplazar izquierda/arriba.
      const nextBounds = boundsOfContent();

      if (emptyRight > EXPAND_BY / 2) {
        const targetWidth = Math.max(
          MIN_WORLD,
          nextBounds.right + PADDING
        );
        if (targetWidth < worldWidth) {
          worldWidth = targetWidth;
        }
      }

      if (emptyBottom > EXPAND_BY / 2) {
        const targetHeight = Math.max(
          MIN_WORLD,
          nextBounds.bottom + PADDING
        );
        if (targetHeight < worldHeight) {
          worldHeight = targetHeight;
        }
      }

      updateStageGeometry();
      setDirty(true);
    }

    function expand(direction) {
      if (direction === "left") {
        if (worldWidth + EXPAND_BY > 600) return false;
        worldWidth += EXPAND_BY;
        shiftWorld(EXPAND_BY, 0);
        viewport.scrollLeft += worldToPx(EXPAND_BY) * zoom;
      } else if (direction === "right") {
        if (worldWidth + EXPAND_BY > 600) return false;
        worldWidth += EXPAND_BY;
      } else if (direction === "top") {
        if (worldHeight + EXPAND_BY > 600) return false;
        worldHeight += EXPAND_BY;
        shiftWorld(0, EXPAND_BY);
        viewport.scrollTop += worldToPx(EXPAND_BY) * zoom;
      } else if (direction === "bottom") {
        if (worldHeight + EXPAND_BY > 600) return false;
        worldHeight += EXPAND_BY;
      } else {
        return false;
      }

      updateStageGeometry();
      setDirty(true);
      return true;
    }

    function expandIfNeeded(bounds) {
      let changed = false;
      if (bounds.left < EDGE_THRESHOLD) changed = expand("left") || changed;
      if (bounds.right > worldWidth - EDGE_THRESHOLD) changed = expand("right") || changed;
      if (bounds.top < EDGE_THRESHOLD) changed = expand("top") || changed;
      if (bounds.bottom > worldHeight - EDGE_THRESHOLD) changed = expand("bottom") || changed;
      return changed;
    }

    function tableNode(item) {
      return stage.querySelector(`[data-table-id="${item.id}"]`);
    }

    function elementNode(item) {
      return stage.querySelector(`[data-element-id="${item.id}"]`);
    }

    function renderAllPositions() {
      items.forEach((item) => {
        const node = tableNode(item);
        const pos = positions.get(item.id);
        if (!node || !pos) return;
        node.style.left = `${worldToPx(pos.x)}px`;
        node.style.top = `${worldToPx(pos.y)}px`;
      });

      elements.forEach((item) => {
        const node = elementNode(item);
        const pos = elementPositions.get(item.id);
        if (!node || !pos) return;
        node.style.left = `${worldToPx(pos.x)}px`;
        node.style.top = `${worldToPx(pos.y)}px`;
        node.style.width = `${worldToPx(pos.width)}px`;
        node.style.height = `${worldToPx(pos.height)}px`;
      });
    }

    function selectElement(id) {
      selectedElementId = id;
      stage.querySelectorAll(".tables-plan-landmark").forEach((node) => {
        node.classList.toggle(
          "is-selected",
          Number(node.dataset.elementId) === Number(id)
        );
      });
    }

    function elementLimits(item) {
      if (item.tipo === "pista_baile") {
        return { minW: 12, minH: 10, maxW: 180, maxH: 140 };
      }
      if (item.tipo === "mesa_novios") {
        return { minW: 10, minH: 5, maxW: 90, maxH: 45 };
      }
      return { minW: 5, minH: 5, maxW: 120, maxH: 120 };
    }

    function makeResizeHandle(direction, item, node) {
      const handle = el(
        "span",
        `tables-plan-resize-handle tables-plan-resize-${direction}`
      );
      handle.dataset.resize = direction;
      handle.setAttribute("aria-hidden", "true");

      let resize = null;

      handle.addEventListener("pointerdown", (event) => {
        const current = elementPositions.get(item.id);
        beginDynamicFlow("element", item.id);

        resize = {
          pointerId: event.pointerId,
          start: clientToWorld(event.clientX, event.clientY),
          original: { ...current },
          lastValid: { ...current },
          collision: false,
        };
        selectElement(item.id);
        handle.setPointerCapture(event.pointerId);
        node.classList.add("is-resizing");
        event.stopPropagation();
        event.preventDefault();
      });

      handle.addEventListener("pointermove", (event) => {
        if (!resize || resize.pointerId !== event.pointerId) return;

        const point = clientToWorld(event.clientX, event.clientY);
        const dx = point.x - resize.start.x;
        const dy = point.y - resize.start.y;
        const original = resize.original;
        const limits = elementLimits(item);

        let next = { ...original };

        if (direction.includes("e")) {
          const left = original.x - original.width / 2;
          let right = original.x + original.width / 2 + dx;
          let width = right - left;
          width = Math.max(limits.minW, Math.min(limits.maxW, width));
          right = left + width;
          next.width = width;
          next.x = (left + right) / 2;
        }

        if (direction.includes("w")) {
          const right = original.x + original.width / 2;
          let left = original.x - original.width / 2 + dx;
          let width = right - left;
          width = Math.max(limits.minW, Math.min(limits.maxW, width));
          left = right - width;
          next.width = width;
          next.x = (left + right) / 2;
        }

        if (direction.includes("s")) {
          const top = original.y - original.height / 2;
          let bottom = original.y + original.height / 2 + dy;
          let height = bottom - top;
          height = Math.max(limits.minH, Math.min(limits.maxH, height));
          bottom = top + height;
          next.height = height;
          next.y = (top + bottom) / 2;
        }

        if (direction.includes("n")) {
          const bottom = original.y + original.height / 2;
          let top = original.y - original.height / 2 + dy;
          let height = bottom - top;
          height = Math.max(limits.minH, Math.min(limits.maxH, height));
          top = bottom - height;
          next.height = height;
          next.y = (top + bottom) / 2;
        }

        expandIfNeeded({
          left: next.x - next.width / 2,
          right: next.x + next.width / 2,
          top: next.y - next.height / 2,
          bottom: next.y + next.height / 2,
        });

        next.x = Math.max(next.width / 2, Math.min(worldWidth - next.width / 2, next.x));
        next.y = Math.max(next.height / 2, Math.min(worldHeight - next.height / 2, next.y));

        // Los elementos reservados pueden desplazar mesas, pero nunca
        // pueden invadir otro elemento reservado.
        let elementCollision = null;
        for (const [otherId, otherPos] of elementPositions.entries()) {
          if (String(otherId) === String(item.id)) continue;
          if (rectsOverlap(elementBounds(next), elementBounds(otherPos))) {
            elementCollision = otherId;
            break;
          }
        }

        if (elementCollision !== null) {
          drag.collision = true;
          showCollision(node, true);
          elementPositions.set(item.id, { ...drag.lastValid });
          renderAllPositions();
          return;
        }

        const beforeTables = clonePositionsMap();

        elementPositions.set(item.id, next);
        const solved = solveLayoutForMovingElement(item.id);

        if (!solved) {
          positions.clear();
          beforeTables.forEach((pos, id) => positions.set(id, pos));
          elementPositions.set(item.id, { ...drag.lastValid });
          drag.collision = true;
          showCollision(node, true);
          renderAllPositions();
          return;
        }

        drag.collision = false;
        showCollision(node, false);
        drag.lastValid = { ...next };
        renderAllPositions();
        setDirty(true);
      });

      function finish(event) {
        if (!resize || resize.pointerId !== event.pointerId) return;
        node.classList.remove("is-resizing");
        showCollision(node, false);
        try { handle.releasePointerCapture(event.pointerId); } catch {}
        resize = null;
        settleDynamicFlow();
      }

      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
      return handle;
    }

    // =====================================================
    // FASE 5.2.5 · INTERACCIÓN MÓVIL SEGURA
    //
    // En dispositivos táctiles:
    //   - 1 dedo = navegar por el plano.
    //   - 2 dedos = zoom.
    //   - mantener presionado = desbloquear un objeto para moverlo.
    //   - tap = acción normal (detalle/selección).
    //
    // En desktop se conserva el drag inmediato.
    // =====================================================

    const SAFE_TOUCH_MODE = window.matchMedia("(pointer: coarse)").matches
      || window.innerWidth <= 900;
    const LONG_PRESS_MS = 520;
    const LONG_PRESS_TOLERANCE = 10;

    let pan = null;
    let mobilePress = null;

    function clearMobilePress({ keepActivated = false } = {}) {
      if (!mobilePress) return;
      if (mobilePress.timer) {
        clearTimeout(mobilePress.timer);
      }

      if (!keepActivated && mobilePress.node) {
        mobilePress.node.classList.remove("is-longpress-pending");
        mobilePress.node.classList.remove("is-longpress-active");
      }

      mobilePress = null;
    }

    function stopPanForEdit(pointerId) {
      if (!pan || pan.pointerId !== pointerId) return;

      viewport.classList.remove("is-panning");
      try { viewport.releasePointerCapture(pointerId); } catch {}
      pan = null;
    }

    function beginLongPress({
      event,
      node,
      kind,
      id,
      onActivate,
      onTap,
    }) {
      clearMobilePress();

      const press = {
        pointerId: event.pointerId,
        node,
        kind,
        id,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        activated: false,
        onTap,
        timer: null,
      };

      node.classList.add("is-longpress-pending");

      press.timer = window.setTimeout(() => {
        if (mobilePress !== press || press.moved || pinch) return;

        press.activated = true;
        node.classList.remove("is-longpress-pending");
        node.classList.add("is-longpress-active");

        stopPanForEdit(press.pointerId);

        try { node.setPointerCapture(press.pointerId); } catch {}

        if (navigator.vibrate) {
          try { navigator.vibrate(18); } catch {}
        }

        onActivate();
      }, LONG_PRESS_MS);

      mobilePress = press;
    }

    function trackMobilePressMovement(event) {
      if (!mobilePress
          || mobilePress.pointerId !== event.pointerId
          || mobilePress.activated) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - mobilePress.startX,
        event.clientY - mobilePress.startY
      );

      if (distance > LONG_PRESS_TOLERANCE) {
        mobilePress.moved = true;
        if (mobilePress.timer) clearTimeout(mobilePress.timer);
        mobilePress.node?.classList.remove("is-longpress-pending");
      }
    }

    function finishMobileTap(pointerId) {
      if (!mobilePress || mobilePress.pointerId !== pointerId) return false;

      const press = mobilePress;

      if (press.timer) clearTimeout(press.timer);
      press.node?.classList.remove("is-longpress-pending");

      if (!press.activated && !press.moved && typeof press.onTap === "function") {
        press.onTap();
      }

      if (!press.activated) {
        mobilePress = null;
      }

      return true;
    }

    // ----- Mesas -----
    items.forEach((item) => {
      const pos = positions.get(item.id);
      const node = el(
        "button",
        `tables-plan-table tables-plan-table-${item.estado}`
      );
      node.type = "button";
      node.dataset.tableId = String(item.id);
      node.title = `${item.nombre || `Mesa ${item.numero}`} · ${item.ocupados}/${item.capacidad}`;

      node.append(
        el("strong", "", item.nombre || `Mesa ${item.numero}`),
        el("span", "", `${item.ocupados}/${item.capacidad}`),
        el("small", "", `${item.disponibles} disp.`)
      );

      let drag = null;

      function activateTableDrag(event) {
        beginDynamicFlow("table", item.id);

        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          original: { ...positions.get(item.id) },
          collision: false,
          mobileActivated: SAFE_TOUCH_MODE,
        };

        try { node.setPointerCapture(event.pointerId); } catch {}
        node.classList.add("is-dragging");
      }

      node.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;

        if (SAFE_TOUCH_MODE && event.pointerType !== "mouse") {
          beginLongPress({
            event,
            node,
            kind: "table",
            id: item.id,
            onActivate: () => activateTableDrag(event),
            onTap: () => onDetail(item.id, node),
          });
          // No bloqueamos el evento: el viewport puede usarlo para PAN.
          return;
        }

        activateTableDrag(event);
        event.preventDefault();
        event.stopPropagation();
      });

      node.addEventListener("pointermove", (event) => {
        if (SAFE_TOUCH_MODE && event.pointerType !== "mouse") {
          trackMobilePressMovement(event);
        }

        if (!drag || drag.pointerId !== event.pointerId) return;

        if (Math.abs(event.clientX - drag.startX) > 3
            || Math.abs(event.clientY - drag.startY) > 3) {
          drag.moved = true;
        }

        let point = clientToWorld(event.clientX, event.clientY);

        // Solo el objeto arrastrado puede solicitar expansión.
        expandIfNeeded({
          left: point.x - TABLE_RADIUS,
          right: point.x + TABLE_RADIUS,
          top: point.y - TABLE_RADIUS,
          bottom: point.y + TABLE_RADIUS,
        });

        point = clientToWorld(event.clientX, event.clientY);
        const next = {
          tableId: item.id,
          x: Math.max(TABLE_RADIUS, Math.min(worldWidth - TABLE_RADIUS, point.x)),
          y: Math.max(TABLE_RADIUS, Math.min(worldHeight - TABLE_RADIUS, point.y)),
        };

        const movedSuccessfully = solveTableLayout({
          sourceTableId: item.id,
          sourcePosition: next,
          homes: activeFlow?.homes,
        });

        drag.collision = !movedSuccessfully;
        showCollision(node, !movedSuccessfully);

        if (movedSuccessfully) {
          drag.original = { ...positions.get(item.id) };
          setDirty(true);
        } else {
          positions.set(item.id, { ...drag.original });
          renderAllPositions();
        }

        event.preventDefault();
      });

      function finishDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;

        const moved = drag.moved;
        node.classList.remove("is-dragging");
        node.classList.remove("is-longpress-active");
        showCollision(node, false);

        try { node.releasePointerCapture(event.pointerId); } catch {}

        drag = null;

        if (mobilePress?.pointerId === event.pointerId) {
          clearMobilePress();
        }

        if (moved) {
          settleDynamicFlow();
        } else if (!SAFE_TOUCH_MODE || event.pointerType === "mouse") {
          endDynamicFlow();
          onDetail(item.id, node);
        } else {
          endDynamicFlow();
        }
      }

      node.addEventListener("pointerup", finishDrag);
      node.addEventListener("pointercancel", (event) => {
        if (mobilePress?.pointerId === event.pointerId) clearMobilePress();
        if (drag?.pointerId === event.pointerId) finishDrag(event);
      });

      stage.append(node);
    });

    // ----- Elementos del salón -----
    elements.forEach((item) => {
      const node = el(
        "div",
        `tables-plan-landmark tables-plan-landmark-${item.tipo}`
      );
      node.dataset.elementId = String(item.id);
      node.tabIndex = 0;

      const label = el("strong", "", item.nombre);
      node.append(label);

      ["n", "e", "s", "w", "ne", "se", "sw", "nw"].forEach((direction) => {
        node.append(makeResizeHandle(direction, item, node));
      });

      let drag = null;

      function activateElementDrag(event) {
        const current = elementPositions.get(item.id);
        beginDynamicFlow("element", item.id);

        drag = {
          pointerId: event.pointerId,
          offset: {
            x: clientToWorld(event.clientX, event.clientY).x - current.x,
            y: clientToWorld(event.clientX, event.clientY).y - current.y,
          },
          lastValid: { ...current },
          collision: false,
          moved: false,
        };

        selectElement(item.id);
        try { node.setPointerCapture(event.pointerId); } catch {}
        node.classList.add("is-dragging");
      }

      node.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".tables-plan-resize-handle")) return;

        if (SAFE_TOUCH_MODE && event.pointerType !== "mouse") {
          beginLongPress({
            event,
            node,
            kind: "element",
            id: item.id,
            onActivate: () => activateElementDrag(event),
            onTap: () => selectElement(item.id),
          });
          return;
        }

        activateElementDrag(event);
        event.preventDefault();
        event.stopPropagation();
      });

      node.addEventListener("pointermove", (event) => {
        if (SAFE_TOUCH_MODE && event.pointerType !== "mouse") {
          trackMobilePressMovement(event);
        }

        if (!drag || drag.pointerId !== event.pointerId) return;

        drag.moved = true;

        const current = elementPositions.get(item.id);
        let point = clientToWorld(event.clientX, event.clientY);
        let next = {
          ...current,
          x: point.x - drag.offset.x,
          y: point.y - drag.offset.y,
        };

        expandIfNeeded({
          left: next.x - next.width / 2,
          right: next.x + next.width / 2,
          top: next.y - next.height / 2,
          bottom: next.y + next.height / 2,
        });

        point = clientToWorld(event.clientX, event.clientY);
        next.x = point.x - drag.offset.x;
        next.y = point.y - drag.offset.y;
        next.x = Math.max(next.width / 2, Math.min(worldWidth - next.width / 2, next.x));
        next.y = Math.max(next.height / 2, Math.min(worldHeight - next.height / 2, next.y));

        // Un elemento reservado nunca puede invadir otro.
        let reservedCollision = null;
        for (const [otherId, otherPos] of elementPositions.entries()) {
          if (String(otherId) === String(item.id)) continue;
          if (rectsOverlap(elementBounds(next), elementBounds(otherPos))) {
            reservedCollision = otherId;
            break;
          }
        }

        if (reservedCollision !== null) {
          drag.collision = true;
          showCollision(node, true);
          elementPositions.set(item.id, { ...drag.lastValid });
          renderAllPositions();
          return;
        }

        const beforeTables = clonePositionsMap();
        elementPositions.set(item.id, next);

        const solved = solveLayoutForMovingElement(item.id);

        if (!solved) {
          positions.clear();
          beforeTables.forEach((pos, id) => positions.set(id, pos));
          elementPositions.set(item.id, { ...drag.lastValid });
          drag.collision = true;
          showCollision(node, true);
          renderAllPositions();
          return;
        }

        drag.collision = false;
        showCollision(node, false);
        drag.lastValid = { ...next };
        renderAllPositions();
        setDirty(true);
        event.preventDefault();
      });

      function finishElement(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;

        node.classList.remove("is-dragging");
        node.classList.remove("is-longpress-active");
        showCollision(node, false);

        try { node.releasePointerCapture(event.pointerId); } catch {}

        drag = null;

        if (mobilePress?.pointerId === event.pointerId) {
          clearMobilePress();
        }

        settleDynamicFlow();
      }

      node.addEventListener("pointerup", finishElement);
      node.addEventListener("pointercancel", (event) => {
        if (mobilePress?.pointerId === event.pointerId) clearMobilePress();
        if (drag?.pointerId === event.pointerId) finishElement(event);
      });

      stage.append(node);
    });

    // ----- Pan del lienzo -----
    viewport.addEventListener("pointerdown", (event) => {
      const overResize = event.target.closest(".tables-plan-resize-handle");
      const overObject = event.target.closest(".tables-plan-table")
        || event.target.closest(".tables-plan-landmark");

      // En desktop, arrastrar un objeto sigue reservado para editarlo.
      // En móvil, tocar un objeto NO impide navegar: únicamente un
      // long-press lo desbloquea para edición.
      if (overResize
          || (!SAFE_TOUCH_MODE && overObject)
          || mobilePress?.activated) {
        return;
      }

      pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };

      try { viewport.setPointerCapture(event.pointerId); } catch {}
      viewport.classList.add("is-panning");

      if (!overObject) {
        selectElement(null);
      }

      event.preventDefault();
    });

    viewport.addEventListener("pointermove", (event) => {
      trackMobilePressMovement(event);

      if (!pan || pan.pointerId !== event.pointerId || pinch) return;

      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;

      if (Math.hypot(dx, dy) > 4) {
        pan.moved = true;
      }

      viewport.scrollLeft = pan.scrollLeft - dx;
      viewport.scrollTop = pan.scrollTop - dy;
      pan.lastX = event.clientX;
      pan.lastY = event.clientY;

      event.preventDefault();
    });

    function finishPan(event) {
      if (!pan || pan.pointerId !== event.pointerId) return;

      const moved = pan.moved;

      viewport.classList.remove("is-panning");
      try { viewport.releasePointerCapture(event.pointerId); } catch {}
      pan = null;

      // Tap corto sobre mesa/elemento: conserva su acción habitual.
      if (!moved) {
        finishMobileTap(event.pointerId);
      } else if (mobilePress?.pointerId === event.pointerId
                 && !mobilePress.activated) {
        clearMobilePress();
      }
    }

    viewport.addEventListener("pointerup", finishPan);
    viewport.addEventListener("pointercancel", (event) => {
      if (mobilePress?.pointerId === event.pointerId && !mobilePress.activated) {
        clearMobilePress();
      }
      finishPan(event);
    });

    // ----- Zoom -----
    function setZoom(next, anchor = null) {
      const old = zoom;
      const value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(next)));
      if (Math.abs(value - old) < 0.001) return;

      const rect = viewport.getBoundingClientRect();
      const anchorX = anchor?.x ?? rect.left + rect.width / 2;
      const anchorY = anchor?.y ?? rect.top + rect.height / 2;

      const worldX = (viewport.scrollLeft + (anchorX - rect.left)) / (BASE_UNIT_PX * old);
      const worldY = (viewport.scrollTop + (anchorY - rect.top)) / (BASE_UNIT_PX * old);

      zoom = value;
      updateStageGeometry();

      viewport.scrollLeft = worldX * BASE_UNIT_PX * zoom - (anchorX - rect.left);
      viewport.scrollTop = worldY * BASE_UNIT_PX * zoom - (anchorY - rect.top);
    }

    function boundsOfContent() {
      const bounds = {
        left: worldWidth,
        top: worldHeight,
        right: 0,
        bottom: 0,
      };

      positions.forEach((pos) => {
        bounds.left = Math.min(bounds.left, pos.x - 5);
        bounds.right = Math.max(bounds.right, pos.x + 5);
        bounds.top = Math.min(bounds.top, pos.y - 5);
        bounds.bottom = Math.max(bounds.bottom, pos.y + 5);
      });

      elementPositions.forEach((pos) => {
        bounds.left = Math.min(bounds.left, pos.x - pos.width / 2);
        bounds.right = Math.max(bounds.right, pos.x + pos.width / 2);
        bounds.top = Math.min(bounds.top, pos.y - pos.height / 2);
        bounds.bottom = Math.max(bounds.bottom, pos.y + pos.height / 2);
      });

      return bounds;
    }

    function fitView() {
      const rect = viewport.getBoundingClientRect();
      const bounds = boundsOfContent();
      const padding = 4;
      const contentW = Math.max(20, bounds.right - bounds.left + padding * 2);
      const contentH = Math.max(20, bounds.bottom - bounds.top + padding * 2);

      const naturalFit = Math.min(
        rect.width / (contentW * BASE_UNIT_PX),
        rect.height / (contentH * BASE_UNIT_PX)
      );

      const safeTouchMode = window.matchMedia("(pointer: coarse)").matches
        || window.innerWidth <= 900;

      const nextZoom = Math.max(
        safeTouchMode ? 0.38 : 0.72,
        Math.min(1.25, naturalFit)
      );

      zoom = nextZoom;
      updateStageGeometry();

      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

      viewport.scrollLeft = Math.max(
        0,
        Math.min(
          maxScrollLeft,
          centerX * BASE_UNIT_PX * zoom - rect.width / 2
        )
      );
      viewport.scrollTop = Math.max(
        0,
        Math.min(
          maxScrollTop,
          centerY * BASE_UNIT_PX * zoom - rect.height / 2
        )
      );
    }

    function centerView() {
      const rect = viewport.getBoundingClientRect();
      const bounds = boundsOfContent();
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

      viewport.scrollLeft = Math.max(
        0,
        Math.min(
          maxScrollLeft,
          centerX * BASE_UNIT_PX * zoom - rect.width / 2
        )
      );
      viewport.scrollTop = Math.max(
        0,
        Math.min(
          maxScrollTop,
          centerY * BASE_UNIT_PX * zoom - rect.height / 2
        )
      );
    }

    function centerViewportOnContent() {
      const rect = viewport.getBoundingClientRect();
      const bounds = boundsOfContent();

      const contentCenterX = (bounds.left + bounds.right) / 2;
      const contentCenterY = (bounds.top + bounds.bottom) / 2;

      const targetScrollLeft =
        contentCenterX * BASE_UNIT_PX * zoom - rect.width / 2;
      const targetScrollTop =
        contentCenterY * BASE_UNIT_PX * zoom - rect.height / 2;

      const maxScrollLeft = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth
      );
      const maxScrollTop = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight
      );

      viewport.scrollLeft = Math.max(
        0,
        Math.min(maxScrollLeft, targetScrollLeft)
      );
      viewport.scrollTop = Math.max(
        0,
        Math.min(maxScrollTop, targetScrollTop)
      );
    }



    // Pinch zoom móvil.
    let pinch = null;

    viewport.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 2) return;

      clearMobilePress();

      if (pan) {
        viewport.classList.remove("is-panning");
        try { viewport.releasePointerCapture(pan.pointerId); } catch {}
        pan = null;
      }

      const [a, b] = event.touches;
      pinch = {
        distance: Math.max(
          1,
          Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
        ),
        zoom,
      };

      wrapper.classList.add("is-pinching");
      event.preventDefault();
    }, { passive: false });

    viewport.addEventListener("touchmove", (event) => {
      if (!pinch || event.touches.length !== 2) return;
      const [a, b] = event.touches;
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const center = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
      setZoom(pinch.zoom * (distance / pinch.distance), center);
      event.preventDefault();
    }, { passive: false });

    viewport.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) {
        pinch = null;
        wrapper.classList.remove("is-pinching");
      }
    });

    viewport.addEventListener("touchcancel", () => {
      pinch = null;
      wrapper.classList.remove("is-pinching");
      clearMobilePress();
    });

    function autoLayout() {
      // -----------------------------------------------------
      // FASE 5.2.4.7 · DISTRIBUCIÓN ESCALONADA
      //
      // Mantiene:
      //   - Mesa de los novios centrada arriba
      //   - Pista de baile al centro
      //   - Mitad de mesas a la izquierda
      //   - Mitad de mesas a la derecha
      //
      // Cambia:
      //   - Las mesas ya no forman columnas rectas.
      //   - Se alternan hacia dentro/fuera para crear una
      //     composición más orgánica, similar a un montaje real.
      // -----------------------------------------------------

      const weddingWidth = 116;
      const weddingHeight = 104;
      worldWidth = weddingWidth;
      worldHeight = weddingHeight;

      const centerX = worldWidth / 2;

      const brideGroomEntry = [...elementPositions.entries()]
        .find(([, pos]) => pos.type === "mesa_novios");

      const danceFloorEntry = [...elementPositions.entries()]
        .find(([, pos]) => pos.type === "pista_baile");

      if (brideGroomEntry) {
        const [id, current] = brideGroomEntry;
        const width = Math.max(18, Math.min(28, current.width));
        const height = Math.max(7, Math.min(12, current.height));

        elementPositions.set(id, {
          ...current,
          x: centerX,
          y: 12,
          width,
          height,
        });
      }

      if (danceFloorEntry) {
        const [id, current] = danceFloorEntry;
        const width = Math.max(24, Math.min(34, current.width));
        const height = Math.max(22, Math.min(34, current.height));

        elementPositions.set(id, {
          ...current,
          x: centerX,
          y: 55,
          width,
          height,
        });
      }

      const brideGroom = brideGroomEntry
        ? elementPositions.get(brideGroomEntry[0])
        : { x: centerX, y: 12, width: 22, height: 10 };

      const danceFloor = danceFloorEntry
        ? elementPositions.get(danceFloorEntry[0])
        : { x: centerX, y: 55, width: 30, height: 26 };

      const splitIndex = Math.ceil(items.length / 2);
      const leftItems = items.slice(0, splitIndex);
      const rightItems = items.slice(splitIndex);

      const leftCount = leftItems.length;
      const rightCount = rightItems.length;
      const maxCount = Math.max(leftCount, rightCount);

      // Dos "carriles" por lado, pero escalonados.
      // Las filas alternan cerca/lejos de la pista.
      const topLimit = Math.max(
        brideGroom.y + brideGroom.height / 2 + TABLE_RADIUS + 4,
        24
      );
      const bottomLimit = worldHeight - TABLE_RADIUS - 7;

      const visibleRows = Math.max(
        Math.ceil(leftCount / 2),
        Math.ceil(rightCount / 2)
      );

      const usableHeight = Math.max(20, bottomLimit - topLimit);
      const rowGap = visibleRows > 1
        ? Math.min(12.3, usableHeight / (visibleRows - 1))
        : 0;

      const danceLeft = danceFloor.x - danceFloor.width / 2;
      const danceRight = danceFloor.x + danceFloor.width / 2;

      const nearGap = TABLE_RADIUS + COLLISION_GAP + 1.2;
      const staggerOffset = TABLE_RADIUS * 1.55;
      const outerOffset = TABLE_RADIUS * 2.15 + COLLISION_GAP;

      const leftNearX = danceLeft - nearGap;
      const rightNearX = danceRight + nearGap;

      const targetHomes = new Map();

      function placeStaggeredSide(sideItems, side) {
        const rowCount = Math.ceil(sideItems.length / 2);

        sideItems.forEach((item, index) => {
          const row = Math.floor(index / 2);
          const pairPosition = index % 2;

          // Alterna la profundidad para que no se vean lineales.
          // Primer elemento de cada par queda más cerca de la pista,
          // el segundo un poco hacia afuera y desfasado verticalmente.
          const baseY = topLimit + row * rowGap;
          const verticalStagger = pairPosition === 0 ? -1.2 : 3.2;

          let x;
          if (side === "left") {
            x = pairPosition === 0
              ? leftNearX
              : leftNearX - outerOffset;
          } else {
            x = pairPosition === 0
              ? rightNearX
              : rightNearX + outerOffset;
          }

          // Pequeña curva: las mesas superiores e inferiores se abren
          // ligeramente hacia afuera; las centrales quedan más próximas.
          const normalizedRow = rowCount <= 1
            ? 0
            : (row / (rowCount - 1)) * 2 - 1;
          const curve = Math.abs(normalizedRow) * staggerOffset * 0.42;

          if (side === "left") {
            x -= curve;
          } else {
            x += curve;
          }

          targetHomes.set(item.id, {
            tableId: item.id,
            x,
            y: baseY + verticalStagger,
          });
        });
      }

      placeStaggeredSide(leftItems, "left");
      placeStaggeredSide(rightItems, "right");

      // Ajustar lienzo solo si el escalonado lo necesita.
      const allTargets = [...targetHomes.values()];
      const minTargetX = Math.min(...allTargets.map((p) => p.x - TABLE_RADIUS));
      const maxTargetX = Math.max(...allTargets.map((p) => p.x + TABLE_RADIUS));

      if (minTargetX < 5) {
        const shift = 5 - minTargetX;
        worldWidth += shift * 2;
        shiftWorld(shift, 0);

        targetHomes.forEach((pos, id) => {
          targetHomes.set(id, {
            ...pos,
            x: pos.x + shift,
          });
        });
      }

      if (maxTargetX > worldWidth - 5) {
        worldWidth += (maxTargetX - (worldWidth - 5)) * 2;
      }

      // Resolver únicamente colisiones residuales.
      const solved = solveTableLayout({
        homes: targetHomes,
      });

      if (!solved) {
        return;
      }

      compactWorldIfPossible();
      centerContentInWorld();
      updateStageGeometry();
      setDirty(true);

      requestAnimationFrame(() => {
        fitView();

        requestAnimationFrame(() => {
          centerViewportOnContent();

          requestAnimationFrame(() => {
            centerView();
          });
        });
      });
    }

    function needsWeddingInitialization() {
      const brideGroomEntry = [...elementPositions.entries()]
        .find(([, pos]) => pos.type === "mesa_novios");
      const danceFloorEntry = [...elementPositions.entries()]
        .find(([, pos]) => pos.type === "pista_baile");

      if (!brideGroomEntry || !danceFloorEntry || !positions.size) {
        return false;
      }

      const bride = brideGroomEntry[1];
      const dance = danceFloorEntry[1];
      const tableValues = [...positions.values()];

      const avgX = tableValues.reduce((sum, pos) => sum + pos.x, 0) / tableValues.length;
      const avgY = tableValues.reduce((sum, pos) => sum + pos.y, 0) / tableValues.length;

      // Una distribución guardada de versiones anteriores se considera
      // incoherente cuando los elementos centrales quedaron muy lejos del
      // bloque de mesas o desalineados entre sí.
      const tablesFarFromDance =
        Math.abs(avgX - dance.x) > Math.max(24, worldWidth * 0.24)
        || Math.abs(avgY - dance.y) > Math.max(30, worldHeight * 0.34);

      const centralElementsSeparated =
        Math.abs(bride.x - dance.x) > Math.max(18, worldWidth * 0.18);

      const reservedOutsideUsefulZone =
        bride.x < bride.width / 2
        || bride.x > worldWidth - bride.width / 2
        || dance.x < dance.width / 2
        || dance.x > worldWidth - dance.width / 2
        || bride.y < bride.height / 2
        || bride.y > worldHeight - bride.height / 2
        || dance.y < dance.height / 2
        || dance.y > worldHeight - dance.height / 2;

      return tablesFarFromDance
        || centralElementsSeparated
        || reservedOutsideUsefulZone;
    }

    const initialLayoutAdjusted = normalizeInitialTableLayout();
    const initializeAsWedding = needsWeddingInitialization();

    if (initializeAsWedding) {
      // Si la distribución histórica quedó dispersa, al entrar a Plano se
      // presenta inmediatamente el mismo acomodo útil que genera el botón
      // Organizar automáticamente. No hace falta localizar pista/novios.
      autoLayout();
    } else {
      if (initialLayoutAdjusted) {
        compactWorldIfPossible();
        centerContentInWorld();
        setDirty(true);
      }

      updateStageGeometry();
      requestAnimationFrame(() => {
        centerView();
      });
    }

    return {
      node: wrapper,
      getState: snapshot,
      isDirty: () => dirty,
      markSaved: () => setDirty(false),
      setAutoLayout: autoLayout,
      zoomIn: () => setZoom(zoom + 0.18),
      zoomOut: () => setZoom(zoom - 0.18),
      fitView,
      centerView,
    };
  }

  function renderTableCard(item, { onDetail }) {
    const card = el("article", "tables-table-card tables-table-card-actionable");
    const head = el("div", "tables-table-card-head");
    head.append(
      el("h3", "", item.nombre || `Mesa ${item.numero}`),
      el("span", `tables-table-state tables-table-state-${item.estado}`,
        item.estado === "completa" ? "Completa" :
          item.estado === "casi_llena" ? "Casi llena" : "Disponible")
    );

    const occupancy = el("strong", "tables-table-occupancy", `${format(item.ocupados)} / ${format(item.capacidad)}`);
    const meta = el("p", "tables-table-meta", `${format(item.disponibles)} lugares disponibles`);

    const track = el("div", "tables-table-track");
    const fill = el("span", "tables-table-fill");
    fill.style.width = `${Math.max(0, Math.min(100, Number(item.porcentaje_ocupacion) || 0))}%`;
    track.append(fill);

    const detail = button("Ver mesa");
    detail.addEventListener("click", () => onDetail(item.id, detail));

    card.append(head, occupancy, meta, track, detail);
    return card;
  }


  function openEditTableModal(detail, { onUpdated }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay tables-modal-overlay-top");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const table = detail.data.mesa;

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Edición de mesa"),
      el("h2", "", table.nombre || `Mesa ${table.numero}`),
      el("p", "tables-modal-copy", `${table.ocupados} personas asignadas · ${table.disponibles} lugares disponibles`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 100;
    name.value = table.nombre || `Mesa ${table.numero}`;

    const capacity = document.createElement("input");
    capacity.type = "number";
    capacity.inputMode = "numeric";
    capacity.min = String(Math.max(1, table.ocupados));
    capacity.max = "50";
    capacity.value = String(table.capacidad);

    const location = document.createElement("input");
    location.type = "text";
    location.maxLength = 150;
    location.value = table.ubicacion || "";
    location.placeholder = "Ej. Terraza, lado izquierdo, cerca de pista";

    const notes = document.createElement("textarea");
    notes.rows = 3;
    notes.maxLength = 1000;
    notes.value = table.notas || "";
    notes.placeholder = "Notas opcionales de organización";

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio del cambio";

    const capacityHelp = el(
      "small",
      "tables-field-help",
      table.ocupados > 0
        ? `Esta mesa tiene ${table.ocupados} personas asignadas. No puede reducirse por debajo de ${table.ocupados}.`
        : "Capacidad permitida: 1 a 50 lugares."
    );

    const capacityField = el("label", "tables-field");
    capacityField.append(
      el("span", "tables-field-label", "Capacidad *"),
      capacity,
      capacityHelp
    );

    const grid = el("div", "tables-edit-grid");
    grid.append(
      field("Nombre / alias *", name),
      capacityField,
      field("Ubicación", location)
    );

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Guardar cambios", true);
    actions.append(cancel, save);

    const body = el("div", "tables-modal-body");
    body.append(
      grid,
      field("Notas", notes),
      field("Motivo del cambio *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() {
      closeModal(overlay, previousFocus);
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    save.addEventListener("click", async () => {
      const seats = Number(capacity.value);
      const motive = reason.value.trim();

      status.textContent = "";

      if (!name.value.trim()) {
        status.textContent = "Captura un nombre para la mesa.";
        name.focus();
        return;
      }

      if (!Number.isInteger(seats) || seats < Math.max(1, table.ocupados) || seats > 50) {
        status.textContent = table.ocupados > 0
          ? `La capacidad debe estar entre ${table.ocupados} y 50 lugares.`
          : "La capacidad debe estar entre 1 y 50 lugares.";
        capacity.focus();
        return;
      }

      if (!motive) {
        status.textContent = "Escribe el motivo del cambio.";
        reason.focus();
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando cambios…";

      try {
        await window.AdminTablesService.updateTable({
          tableId: table.id,
          name: name.value,
          capacity: seats,
          location: location.value,
          notes: notes.value,
          reason: motive,
          version: table.version,
        });

        dismiss();
        await onUpdated();
      } catch (error) {
        console.error("Update table:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }


  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    }).format(new Date(value));
  }

  function historyActionLabel(action) {
    const labels = {
      configuracion_inicial: "Configuración inicial",
      reconfigurado: "Configuración actualizada",
      mesa_creada: "Mesa creada",
      mesa_actualizada: "Mesa actualizada",
      mesa_desactivada: "Mesa desactivada",
      mesa_reactivada: "Mesa reactivada",
      asignado: "Invitado asignado",
      reasignado: "Invitado movido / reasignado",
      asignacion_retirada: "Asignación retirada",
      editor_plano_actualizado: "Plano actualizado",
    };
    return labels[action] || action;
  }

  async function openHistoryModal() {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-history-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Trazabilidad"),
      el("h2", "", "Historial de mesas"),
      el("p", "tables-modal-copy", "Configuraciones, ediciones, asignaciones, movimientos y retiros.")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const body = el("div", "tables-modal-body");
    body.append(el("p", "tables-loading", "Cargando historial…"));

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    try {
      const response = await window.AdminTablesService.getHistory(150);
      const items = response.data.items;
      const list = el("div", "tables-history-list");

      if (!items.length) {
        list.append(el("p", "tables-empty", "Todavía no existe historial de Mesas."));
      } else {
        items.forEach((item) => {
          const row = el("article", "tables-history-item");
          const main = el("div", "tables-history-main");
          main.append(
            el("span", "tables-history-action", historyActionLabel(item.accion)),
            el("strong", "", item.titulo),
            item.detalle ? el("span", "", item.detalle) : document.createDocumentFragment(),
            item.motivo ? el("em", "", `Motivo: ${item.motivo}`) : document.createDocumentFragment()
          );
          const meta = el("div", "tables-history-meta");
          meta.append(
            el("strong", "", item.administrador_nombre || "Sistema / invitado"),
            el("time", "", formatDateTime(item.fecha_evento))
          );
          row.append(main, meta);
          list.append(row);
        });
      }
      body.replaceChildren(list);
    } catch (error) {
      body.replaceChildren(
        statusBox("error", "No fue posible cargar el historial", errorMessage(error))
      );
    }
  }

  function openMoveAssignment(item, currentTable, tables, { onMoved }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay tables-modal-overlay-top");
    const dialog = el("section", "tables-modal tables-small-modal");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Reasignación"),
      el("h2", "", item.nombre),
      el("p", "tables-modal-copy", `${item.total} personas · ${currentTable.nombre || `Mesa ${currentTable.numero}`}`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const tableSelect = document.createElement("select");
    tableSelect.append(new Option("Selecciona mesa destino", ""));
    tables
      .filter((table) => table.id !== currentTable.id)
      .forEach((table) => {
        const option = new Option(
          `${table.nombre || `Mesa ${table.numero}`} · ${table.disponibles} disponibles`,
          String(table.id)
        );
        option.disabled = table.disponibles < item.total;
        tableSelect.append(option);
      });

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio de la reasignación";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const move = button("Mover a otra mesa", true);
    actions.append(cancel, move);

    const body = el("div", "tables-modal-body");
    body.append(
      statusBox(
        "warning",
        "Mover asignación",
        `Se moverán ${item.adultos} adultos y ${item.ninos} niños. La operación conservará el historial.`
      ),
      field("Mesa destino *", tableSelect),
      field("Motivo *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    move.addEventListener("click", async () => {
      const target = Number(tableSelect.value);
      const motive = reason.value.trim();
      status.textContent = "";

      if (!target) {
        status.textContent = "Selecciona una mesa destino.";
        tableSelect.focus();
        return;
      }
      if (!motive) {
        status.textContent = "Escribe el motivo de la reasignación.";
        reason.focus();
        return;
      }

      move.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Moviendo asignación…";

      try {
        await window.AdminTablesService.moveAssignment({
          assignmentId: item.asignacion_id,
          targetTableId: target,
          reason: motive,
          version: item.asignacion_version,
        });
        dismiss();
        await onMoved();
      } catch (error) {
        status.textContent = errorMessage(error);
        move.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openTableDetail(detail, { onRemove, onRefresh, tables }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-detail-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const table = detail.data.mesa;
    const assignments = detail.data.asignaciones;

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Detalle de mesa"),
      el("h2", "", table.nombre || `Mesa ${table.numero}`),
      el("p", "tables-modal-copy", `${table.ocupados} de ${table.capacidad} lugares ocupados · ${table.disponibles} disponibles`)
    );
    const headActions = el("div", "tables-modal-head-actions");
    const edit = button("Editar mesa");
    const close = button("Cerrar");
    headActions.append(edit, close);
    head.append(copy, headActions);

    const body = el("div", "tables-modal-body");

    const summary = el("div", "tables-detail-summary");
    summary.append(
      metric("Capacidad", format(table.capacidad), "lugares"),
      metric("Ocupados", format(table.ocupados), "personas"),
      metric("Disponibles", format(table.disponibles), "lugares")
    );

    const listSection = el("section", "tables-assignment-list-section");
    listSection.append(el("h3", "", "Invitados asignados"));

    if (!assignments.length) {
      listSection.append(el("p", "tables-empty", "Todavía no hay invitados asignados a esta mesa."));
    } else {
      const list = el("div", "tables-assignment-list");

      assignments.forEach((item) => {
        const row = el("article", "tables-assignment-row");
        const info = el("div");
        info.append(
          el("strong", "", item.nombre),
          el("span", "", `${item.codigo} · ${item.grupo}`),
          el("span", "", `${item.adultos} ${item.adultos === 1 ? "adulto" : "adultos"} · ${item.ninos} ${item.ninos === 1 ? "niño" : "niños"}`)
        );

        const rowActions = el("div", "tables-assignment-row-actions");
        const move = button("Mover");
        const remove = button("Retirar");
        remove.classList.add("tables-danger-action");

        move.addEventListener("click", () => {
          openMoveAssignment(item, table, tables, {
            onMoved: async () => {
              closeModal(overlay, previousFocus);
              await onRefresh();
            },
          });
        });

        remove.addEventListener("click", () => {
          openRemoveAssignment(item, table, {
            onRemoved: async () => {
              closeModal(overlay, previousFocus);
              await onRemove();
              await onRefresh();
            },
          });
        });

        rowActions.append(move, remove);
        row.append(info, rowActions);
        list.append(row);
      });

      listSection.append(list);
    }

    if (table.ubicacion || table.notas) {
      const meta = el("section", "tables-table-notes");
      if (table.ubicacion) {
        meta.append(
          el("strong", "", "Ubicación"),
          el("p", "", table.ubicacion)
        );
      }
      if (table.notas) {
        meta.append(
          el("strong", "", "Notas"),
          el("p", "", table.notas)
        );
      }
      body.append(summary, meta, listSection);
    } else {
      body.append(summary, listSection);
    }

    edit.addEventListener("click", () => {
      openEditTableModal(detail, {
        onUpdated: async () => {
          closeModal(overlay, previousFocus);
          await onRefresh();
        },
      });
    });

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });
  }

  function openRemoveAssignment(item, table, { onRemoved }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay tables-modal-overlay-top");
    const dialog = el("section", "tables-modal tables-small-modal");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Retirar asignación"),
      el("h2", "", item.nombre),
      el("p", "tables-modal-copy", `${table.nombre || `Mesa ${table.numero}`} · ${item.adultos + item.ninos} personas`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio del retiro";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const remove = button("Retirar asignación");
    remove.classList.add("tables-danger-button");
    actions.append(cancel, remove);

    const body = el("div", "tables-modal-body");
    body.append(
      statusBox("warning", "La asignación se retirará", "El registro conservará su historial y las personas volverán a aparecer como pendientes de asignar."),
      field("Motivo del retiro *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);

    remove.addEventListener("click", async () => {
      const motive = reason.value.trim();
      if (!motive) {
        status.textContent = "Escribe el motivo del retiro.";
        reason.focus();
        return;
      }

      remove.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Retirando asignación…";

      try {
        await window.AdminTablesService.removeAssignment({
          assignmentId: item.asignacion_id,
          reason: motive,
          version: item.asignacion_version,
        });
        dismiss();
        await onRemoved();
      } catch (error) {
        console.error("Remove table assignment:", error);
        status.textContent = errorMessage(error);
        remove.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }



  function openAddTableModal(configData, { onAdded }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Administración de mesas"),
      el("h2", "", "Agregar mesa"),
      el("p", "tables-modal-copy", "La numeración se asignará automáticamente.")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 100;
    name.placeholder = "Opcional · Ej. Mesa familia novia";

    const capacity = document.createElement("input");
    capacity.type = "number";
    capacity.inputMode = "numeric";
    capacity.min = "1";
    capacity.max = "50";
    capacity.value = String(configData.capacidad_inicial || 10);

    const location = document.createElement("input");
    location.type = "text";
    location.maxLength = 150;
    location.placeholder = "Opcional · Ej. Cerca de la pista";

    const notes = document.createElement("textarea");
    notes.rows = 3;
    notes.maxLength = 1000;
    notes.placeholder = "Notas opcionales";

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio para agregar la mesa";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Agregar mesa", true);
    actions.append(cancel, save);

    const grid = el("div", "tables-edit-grid");
    grid.append(
      field("Nombre / alias", name),
      field("Capacidad *", capacity, "Entre 1 y 50 lugares"),
      field("Ubicación", location)
    );

    const body = el("div", "tables-modal-body");
    body.append(
      grid,
      field("Notas", notes),
      field("Motivo del alta *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    save.addEventListener("click", async () => {
      const seats = Number(capacity.value);
      const motive = reason.value.trim();
      status.textContent = "";

      if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
        status.textContent = "La capacidad debe estar entre 1 y 50 lugares.";
        capacity.focus();
        return;
      }

      if (!motive) {
        status.textContent = "Escribe el motivo para agregar la mesa.";
        reason.focus();
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Agregando mesa…";

      try {
        const result = await window.AdminTablesService.addTable({
          name: name.value,
          capacity: seats,
          location: location.value,
          notes: notes.value,
          reason: motive,
        });

        const created = result?.data?.mesa;
        dismiss();
        await onAdded(created);
      } catch (error) {
        console.error("Add table:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openDeleteTableModal(tables, configData, { onDeleted }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const currentCapacity = Number(configData.capacidad_total_actual) || 0;
    const requiredCapacity = Number(configData.cupo_invitados_activos) || 0;
    const emptyTables = tables.filter((table) => table.activo && table.ocupados === 0);

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Administración de mesas"),
      el("h2", "", "Eliminar mesa"),
      el("p", "tables-modal-copy", "La mesa quedará inactiva; no se borrará su historial.")
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const tableSelect = document.createElement("select");
    tableSelect.append(new Option("Selecciona una mesa vacía", ""));

    emptyTables.forEach((table) => {
      const remaining = currentCapacity - table.capacidad;
      const option = new Option(
        `${table.nombre || `Mesa ${table.numero}`} · ${table.capacidad} lugares`,
        String(table.id)
      );
      if (remaining < requiredCapacity) {
        option.disabled = true;
        option.text += " · capacidad insuficiente";
      }
      tableSelect.append(option);
    });

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio para eliminar la mesa";

    const status = el("p", "tables-operation-status");
    const info = el("div", "tables-capacity-slot");

    function updateInfo() {
      const selected = tables.find((table) => table.id === Number(tableSelect.value));
      if (!selected) {
        info.replaceChildren(
          statusBox(
            "warning",
            "Selecciona una mesa",
            emptyTables.length
              ? "Solo se muestran mesas sin invitados asignados."
              : "No existen mesas vacías disponibles para eliminar."
          )
        );
        return;
      }

      const remaining = currentCapacity - selected.capacidad;
      const sufficient = remaining >= requiredCapacity;
      info.replaceChildren(
        statusBox(
          sufficient ? "success" : "error",
          sufficient ? "La mesa puede eliminarse" : "Capacidad insuficiente",
          sufficient
            ? `La capacidad total quedará en ${format(remaining)} lugares.`
            : `Quedarían ${format(remaining)} lugares y el padrón activo requiere ${format(requiredCapacity)}.`
        )
      );
    }

    tableSelect.addEventListener("change", updateInfo);

    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const remove = button("Eliminar mesa");
    actions.append(cancel, remove);

    const body = el("div", "tables-modal-body");
    body.append(
      field("Mesa *", tableSelect),
      info,
      field("Motivo de la baja *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");
    updateInfo();

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    remove.addEventListener("click", async () => {
      const tableId = Number(tableSelect.value);
      const selected = tables.find((table) => table.id === tableId);
      const motive = reason.value.trim();
      status.textContent = "";

      if (!selected) {
        status.textContent = "Selecciona una mesa vacía.";
        tableSelect.focus();
        return;
      }

      if (selected.ocupados > 0) {
        status.textContent = "La mesa tiene invitados asignados.";
        return;
      }

      if (currentCapacity - selected.capacidad < requiredCapacity) {
        status.textContent = "La capacidad restante sería insuficiente.";
        return;
      }

      if (!motive) {
        status.textContent = "Escribe el motivo para eliminar la mesa.";
        reason.focus();
        return;
      }

      remove.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Eliminando mesa…";

      try {
        await window.AdminTablesService.deleteTable({
          tableId: selected.id,
          reason: motive,
          version: selected.version,
        });

        dismiss();
        await onDeleted(selected);
      } catch (error) {
        console.error("Delete table:", error);
        status.textContent = errorMessage(error);
        remove.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openReleaseAllModal(summaryData, { onReleased }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-small-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const assigned = Number(summaryData?.asignados?.total) || 0;
    const adults = Number(summaryData?.asignados?.adultos) || 0;
    const children = Number(summaryData?.asignados?.ninos) || 0;

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Acción administrativa"),
      el("h2", "", "Liberar todas las mesas"),
      el(
        "p",
        "tables-modal-copy",
        `${assigned} ${assigned === 1 ? "persona tiene" : "personas tienen"} mesa actualmente`
      )
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const reason = document.createElement("textarea");
    reason.rows = 4;
    reason.maxLength = 1000;
    reason.placeholder = "Motivo obligatorio para liberar todas las mesas";

    const status = el("p", "tables-operation-status");

    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const release = button("Liberar todas las mesas");
    actions.append(cancel, release);

    const body = el("div", "tables-modal-body");
    body.append(
      statusBox(
        "warning",
        "Se eliminarán todas las asignaciones activas",
        `${adults} adultos y ${children} niños volverán a quedar pendientes de asignar. No se borrará ningún registro y el historial se conservará.`
      ),
      field("Motivo *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() {
      closeModal(overlay, previousFocus);
    }

    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    release.addEventListener("click", async () => {
      const motive = reason.value.trim();
      status.textContent = "";

      if (!motive) {
        status.textContent = "Escribe el motivo para liberar todas las mesas.";
        reason.focus();
        return;
      }

      release.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Liberando asignaciones…";

      try {
        const result = await window.AdminTablesService.releaseAll({
          reason: motive,
        });

        const released = Number(result?.data?.personas_liberadas) || assigned;
        dismiss();
        await onReleased(released);
      } catch (error) {
        console.error("Release all tables:", error);
        status.textContent = errorMessage(error);
        release.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  function openAssignModal(guest, tables, { onAssigned }) {
    const previousFocus = document.activeElement;
    const overlay = el("div", "tables-modal-overlay");
    const dialog = el("section", "tables-modal tables-assign-modal");

    const head = el("header", "tables-modal-head");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Asignación de mesa"),
      el("h2", "", guest.nombre),
      el("p", "tables-modal-copy", `${guest.codigo} · ${guest.grupo}`)
    );
    const close = button("Cerrar");
    head.append(copy, close);

    const body = el("div", "tables-modal-body");

    const summary = el("div", "tables-guest-assignment-summary");
    summary.append(
      metric("Confirmados", format(guest.confirmados.total), `${guest.confirmados.adultos} adultos · ${guest.confirmados.ninos} niños`),
      metric("Ya asignados", format(guest.asignados.total), `${guest.asignados.adultos} adultos · ${guest.asignados.ninos} niños`),
      metric("Pendientes", format(guest.pendientes.total), `${guest.pendientes.adultos} adultos · ${guest.pendientes.ninos} niños`)
    );

    const tableSelect = document.createElement("select");
    tableSelect.append(new Option("Selecciona una mesa", ""));
    tables.forEach((table) => {
      const option = new Option(
        `${table.nombre || `Mesa ${table.numero}`} · ${table.disponibles} disponibles`,
        String(table.id)
      );
      option.disabled = table.disponibles <= 0;
      tableSelect.append(option);
    });

    const adults = counter("Adultos", guest.pendientes.adultos, guest.pendientes.adultos);
    const children = counter("Niños", guest.pendientes.ninos, guest.pendientes.ninos);

    const reason = document.createElement("textarea");
    reason.rows = 3;
    reason.maxLength = 1000;
    reason.placeholder = "Ej. Asignación inicial de la familia";

    const status = el("p", "tables-operation-status");
    const actions = el("div", "tables-modal-actions");
    const cancel = button("Cancelar");
    const save = button("Asignar mesa", true);
    actions.append(cancel, save);

    const counters = el("div", "tables-assignment-counters");
    counters.append(adults.node, children.node);

    body.append(
      summary,
      field("Mesa *", tableSelect),
      counters,
      field("Motivo de la asignación *", reason),
      status,
      actions
    );

    dialog.append(head, body);
    overlay.append(dialog);
    document.body.append(overlay);
    document.body.classList.add("tables-modal-open");

    function dismiss() { closeModal(overlay, previousFocus); }
    close.addEventListener("click", dismiss);
    cancel.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) dismiss();
    });

    save.addEventListener("click", async () => {
      const tableId = Number(tableSelect.value);
      const motive = reason.value.trim();
      const adultCount = adults.getValue();
      const childCount = children.getValue();

      status.textContent = "";

      if (!tableId) {
        status.textContent = "Selecciona una mesa.";
        tableSelect.focus();
        return;
      }
      if (adultCount + childCount <= 0) {
        status.textContent = "Asigna al menos una persona.";
        return;
      }
      if (!motive) {
        status.textContent = "Escribe el motivo de la asignación.";
        reason.focus();
        return;
      }

      const selected = tables.find((item) => item.id === tableId);
      if (selected && adultCount + childCount > selected.disponibles) {
        status.textContent = `La mesa solo tiene ${selected.disponibles} lugares disponibles.`;
        return;
      }

      save.disabled = true;
      close.disabled = true;
      cancel.disabled = true;
      status.textContent = "Guardando asignación…";

      try {
        await window.AdminTablesService.assign({
          tableId,
          guestId: guest.invitado_id,
          adults: adultCount,
          children: childCount,
          reason: motive,
        });
        dismiss();
        await onAssigned();
      } catch (error) {
        console.error("Assign table:", error);
        status.textContent = errorMessage(error);
        save.disabled = false;
        close.disabled = false;
        cancel.disabled = false;
      }
    });
  }

  window.AdminViews.mesas = () => {
    const root = el("section", "tables-view");

    const header = el("header", "admin-view-header tables-header");
    header.append(
      el("p", "admin-eyebrow", "Organización del evento"),
      el("h2", "", "Mesas"),
      el("p", "admin-view-copy",
        "Distribuye a los asistentes confirmados y controla la ocupación de cada mesa.")
    );

    const feedback = el("div", "tables-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;

    const content = el("div", "tables-content");
    root.append(header, feedback, content);

    let config = null;
    let summary = null;
    let tables = [];
    let pending = [];
    let requestId = 0;

    function setFeedback(type, text) {
      feedback.className = `tables-feedback${type ? ` tables-feedback-${type}` : ""}`;
      feedback.textContent = text;
      feedback.hidden = !text;
    }

    function renderInitialConfiguration() {
      const required = config?.data?.cupo_invitados_activos || 0;

      const panel = el("section", "tables-config-panel");
      const title = el("div", "tables-config-heading");
      title.append(
        el("p", "admin-eyebrow", "Configuración inicial"),
        el("h3", "", "Define las mesas de tu evento"),
        el("p", "", "Aún no has configurado las mesas. Indica cuántas tendrás y la capacidad inicial de cada una.")
      );

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.inputMode = "numeric";
      numberInput.min = "1";
      numberInput.max = "100";
      numberInput.placeholder = "Ej. 27";

      const capacityInput = document.createElement("input");
      capacityInput.type = "number";
      capacityInput.inputMode = "numeric";
      capacityInput.min = "1";
      capacityInput.max = "50";
      capacityInput.placeholder = "Ej. 10";

      const reason = document.createElement("textarea");
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.placeholder = "Ej. Configuración inicial proporcionada por el jardín";

      const formGrid = el("div", "tables-config-grid");
      formGrid.append(
        field("Número de mesas", numberInput, "Máximo 100 mesas"),
        field("Capacidad por mesa", capacityInput, "Máximo 50 personas por mesa")
      );

      const metrics = el("div", "tables-live-metrics");
      const capacityMetric = metric("Capacidad de mesas", "0", "lugares");
      const requiredMetric = metric("Cupo requerido", format(required), "invitados activos");
      const marginMetric = metric("Margen disponible", `-${format(required)}`, "faltan lugares");
      metrics.append(capacityMetric, requiredMetric, marginMetric);

      const status = el("div", "tables-capacity-slot");
      status.append(statusBox("warning", "Captura la configuración", `Necesitamos al menos ${format(required)} lugares para cubrir el cupo máximo de las invitaciones activas.`));

      const actions = el("div", "tables-config-actions");
      const save = button("Guardar configuración", true);
      save.disabled = true;
      actions.append(save);

      panel.append(title, formGrid, metrics, status, field("Motivo de la configuración *", reason), actions);
      content.replaceChildren(panel);

      function calculate() {
        const number = Number(numberInput.value);
        const perTable = Number(capacityInput.value);
        const total = Number.isInteger(number) && number > 0 && Number.isInteger(perTable) && perTable > 0
          ? number * perTable : 0;
        const margin = total - required;
        const sufficient = total >= required && total > 0;

        capacityMetric.querySelector(".tables-metric-value").textContent = format(total);
        marginMetric.querySelector(".tables-metric-value").textContent =
          margin >= 0 ? `+${format(margin)}` : `-${format(Math.abs(margin))}`;
        marginMetric.querySelector(".tables-metric-detail").textContent =
          margin >= 0 ? "lugares de margen" : "faltan lugares";

        status.replaceChildren(statusBox(
          !total ? "warning" : sufficient ? "success" : "error",
          !total ? "Captura la configuración" : sufficient ? "Capacidad suficiente" : "Capacidad insuficiente",
          !total
            ? `Necesitamos al menos ${format(required)} lugares para cubrir el cupo máximo de las invitaciones activas.`
            : sufficient
              ? `${format(total)} lugares disponibles · ${format(required)} requeridos · ${format(margin)} lugares de margen.`
              : `La configuración contempla ${format(total)} lugares, pero el padrón activo requiere ${format(required)}. Faltan ${format(Math.abs(margin))} lugares.`
        ));

        save.disabled = !sufficient || !reason.value.trim();
      }

      [numberInput, capacityInput].forEach((input) => input.addEventListener("input", calculate));
      reason.addEventListener("input", calculate);

      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await window.AdminTablesService.configure({
            numberOfTables: Number(numberInput.value),
            seatsPerTable: Number(capacityInput.value),
            reason: reason.value,
            version: null,
          });
          setFeedback("success", "Configuración de mesas creada correctamente.");
          await load();
        } catch (error) {
          setFeedback("error", errorMessage(error));
          calculate();
        }
      });
    }

    function renderConfigured() {
      const cfg = config.data;
      const sum = summary.data;

      const summaryGrid = el("div", "tables-summary-grid");
      summaryGrid.append(
        metric("Mesas activas", format(sum.mesas.activas), `${format(sum.mesas.capacidad_total)} lugares totales`),
        metric("Confirmados", format(sum.confirmados.total), `${format(sum.confirmados.adultos)} adultos · ${format(sum.confirmados.ninos)} niños`),
        metric("Asignados", format(sum.asignados.total), "personas con mesa"),
        metric("Pendientes de asignar", format(sum.pendientes_asignar), "personas por ubicar")
      );

      const configPanel = el("section", "tables-configured-panel");
      const configHead = el("div", "tables-configured-head");
      const copy = el("div");
      copy.append(
        el("p", "admin-eyebrow", "Configuración general"),
        el(
          "h3",
          "",
          `${format(sum.mesas.activas)} mesas activas · ${format(cfg.capacidad_inicial)} lugares de capacidad base`
        ),
        el(
          "p",
          "",
          `Carga inicial: ${format(cfg.numero_mesas)} mesas · Capacidad total actual: ${format(cfg.capacidad_total_actual)} lugares · Cupo activo: ${format(cfg.cupo_invitados_activos)}.`
        )
      );

      const configActions = el("div", "tables-configured-actions");
      configHead.append(copy, configActions);

      const addTable = button("+ Agregar mesa");
      addTable.addEventListener("click", () => {
        openAddTableModal(cfg, {
          onAdded: async (created) => {
            setFeedback(
              "success",
              `${created?.nombre || "La nueva mesa"} fue agregada correctamente.`
            );
            await load();
          },
        });
      });
      configActions.append(addTable);

      const deleteTable = button("Eliminar mesa");
      deleteTable.addEventListener("click", () => {
        openDeleteTableModal(tables, cfg, {
          onDeleted: async (selected) => {
            setFeedback(
              "success",
              `${selected.nombre || `Mesa ${selected.numero}`} quedó inactiva.`
            );
            await load();
          },
        });
      });
      configActions.append(deleteTable);

      if (sum.asignados.total > 0) {
        const releaseAll = button("Liberar todas las mesas");
        releaseAll.classList.add("tables-release-all");
        releaseAll.addEventListener("click", () => {
          openReleaseAllModal(sum, {
            onReleased: async (released) => {
              setFeedback(
                "success",
                `${format(released)} ${released === 1 ? "persona quedó" : "personas quedaron"} pendiente${released === 1 ? "" : "s"} de asignar.`
              );
              await load();
            },
          });
        });
        configActions.append(releaseAll);
      }

      if (cfg.puede_reconfigurar) {
        const edit = button("Editar configuración");
        configActions.append(edit);
        edit.addEventListener("click", renderEditConfiguration);
      } else {
        configActions.append(
          el(
            "span",
            "tables-config-locked",
            "Configuración general bloqueada por asignaciones activas"
          )
        );
      }

      configPanel.append(
        configHead,
        statusBox(
          cfg.capacidad_suficiente ? "success" : "error",
          cfg.capacidad_suficiente ? "Capacidad suficiente" : "Capacidad insuficiente",
          cfg.margen_capacidad >= 0
            ? `${format(cfg.margen_capacidad)} lugares de margen sobre el padrón activo.`
            : `Faltan ${format(Math.abs(cfg.margen_capacidad))} lugares.`
        )
      );

      const operations = el("div", "tables-operations-grid");

      const pendingPanel = el("section", "tables-pending-panel");
      const pendingHead = el("div", "tables-section-head");
      pendingHead.append(
        el("div", "", ""),
        el("h3", "", "Pendientes de asignar"),
        el("span", "", `${format(sum.pendientes_asignar)} personas`)
      );

      const pendingFilters = el("div", "tables-pending-filters");
      const pendingSearch = document.createElement("input");
      pendingSearch.type = "search";
      pendingSearch.placeholder = "Buscar por nombre o código";
      pendingSearch.autocomplete = "off";

      const pendingGroup = document.createElement("select");
      pendingGroup.append(new Option("Todos los grupos", ""));
      ["Familia Marcos", "Familia Jess", "Amigos Marcos", "Amigos Jess"]
        .forEach((group) => pendingGroup.append(new Option(group, group)));

      const clearPending = button("Limpiar filtros");
      pendingFilters.append(
        field("Buscar", pendingSearch),
        field("Grupo", pendingGroup),
        clearPending
      );

      const pendingList = el("div", "tables-pending-list");
      let pendingFilterTimer = null;

      function drawPending(items) {
        pendingList.replaceChildren();
        if (!items.length) {
          pendingList.append(el("p", "tables-empty", "No hay asistentes pendientes que coincidan con los filtros."));
          return;
        }

        items.forEach((guest) => {
          const row = el("article", "tables-pending-row");
          const info = el("div", "tables-pending-info");
          info.append(
            el("strong", "", guest.nombre),
            el("span", "", `${guest.codigo} · ${guest.grupo}`),
            el("span", "", `Pendientes: ${guest.pendientes.adultos} adultos · ${guest.pendientes.ninos} niños`)
          );
          const assign = button("Asignar mesa", true);
          assign.addEventListener("click", () => {
            openAssignModal(guest, tables, {
              onAssigned: async () => {
                setFeedback("success", `Asignación guardada para ${guest.nombre}.`);
                await load();
              },
            });
          });
          row.append(info, assign);
          pendingList.append(row);
        });
      }

      async function filterPending() {
        try {
          const result = await window.AdminTablesService.listPending({
            search: pendingSearch.value,
            group: pendingGroup.value,
          });
          drawPending(result.data.items);
        } catch (error) {
          pendingList.replaceChildren(
            statusBox("error", "No fue posible filtrar pendientes", errorMessage(error))
          );
        }
      }

      pendingSearch.addEventListener("input", () => {
        clearTimeout(pendingFilterTimer);
        pendingFilterTimer = setTimeout(filterPending, 300);
      });
      pendingGroup.addEventListener("change", filterPending);
      clearPending.addEventListener("click", () => {
        pendingSearch.value = "";
        pendingGroup.value = "";
        drawPending(pending);
      });

      drawPending(pending);
      pendingPanel.append(pendingHead, pendingFilters, pendingList);

      const tablesPanel = el("section", "tables-list-panel");
      const tablesHead = el("div", "tables-section-head tables-section-head-plan");
      const tablesTitle = el("h3", "", "Distribución de mesas");

      const viewActions = el("div", "tables-view-actions");
      const listButton = button("Lista");
      const planButton = button("Plano");
      const historyButton = button("Ver historial");
      historyButton.addEventListener("click", openHistoryModal);
      viewActions.append(listButton, planButton, historyButton);
      tablesHead.append(tablesTitle, viewActions);

      const tablesBody = el("div", "tables-distribution-body");

      async function openDetailFromDistribution(tableId, trigger) {
        trigger.disabled = true;
        try {
          const detail = await window.AdminTablesService.getTableDetail(tableId);
          openTableDetail(detail, {
            onRemove: async () => {
              setFeedback("success", "Asignación retirada correctamente.");
            },
            onRefresh: load,
            tables,
          });
        } catch (error) {
          setFeedback("error", errorMessage(error));
        } finally {
          trigger.disabled = false;
        }
      }

      const tableList = renderTablesTable(tables, {
        onDetail: openDetailFromDistribution,
      });

      let plan = null;
      let planState = null;

      const planToolbar = el("div", "tables-plan-toolbar tables-plan-toolbar-advanced");
      const planHint = el(
        "p",
        "tables-plan-hint",
        SAFE_TOUCH_MODE
          ? "Móvil: desliza con un dedo para recorrer el plano, usa dos dedos para zoom y mantén presionada una mesa o elemento para moverlo."
          : "Arrastra mesas y elementos. Al acercarte al borde, el lienzo crecerá automáticamente. Selecciona la pista o la mesa de los novios para redimensionarla."
      );

      const planControls = el("div", "tables-plan-controls");
      const zoomOut = button("−");
      zoomOut.title = "Alejar";
      const zoomIn = button("+");
      zoomIn.title = "Acercar";
      const fitPlan = button("Ajustar vista");
      const centerPlan = button("Centrar");
      const autoLayout = button("Organizar automáticamente");
      const savePlan = button("Guardar distribución", true);
      savePlan.disabled = true;

      planControls.append(
        zoomOut,
        zoomIn,
        fitPlan,
        centerPlan,
        autoLayout,
        savePlan
      );
      planToolbar.append(planHint, planControls);

      function showList() {
        listButton.classList.add("is-selected");
        planButton.classList.remove("is-selected");
        tablesBody.replaceChildren(tableList);
      }

      async function showPlan() {
        listButton.classList.remove("is-selected");
        planButton.classList.add("is-selected");
        tablesBody.replaceChildren(
          el("p", "tables-loading", "Cargando editor del plano…")
        );

        try {
          const [elementsResponse, configResponse] = await Promise.all([
            window.AdminTablesService.listPlanElements(),
            window.AdminTablesService.getPlanConfiguration(),
          ]);

          const elements = elementsResponse.data.items;
          const planConfig = configResponse.data;

          plan = renderVisualPlan(tables, elements, planConfig, {
            onDetail: openDetailFromDistribution,
            onChanged: (dirty, state) => {
              planState = state;
              savePlan.disabled = !dirty;
            },
          });

          planState = plan.getState();

          const planWrap = el("div", "tables-plan-view");
          planWrap.append(planToolbar, plan.node);
          tablesBody.replaceChildren(planWrap);

          // FASE 5.2.4.6
          // Al entrar a Plano se aplica automáticamente la misma
          // distribución usada por "Organizar automáticamente":
          // mitad de mesas a la izquierda, mitad a la derecha,
          // mesa de los novios arriba y pista al centro.
          //
          // setAutoLayout() también calcula el zoom y centra la vista
          // para que todos los elementos visibles entren en el lienzo.
          requestAnimationFrame(() => {
            if (!plan) return;

            plan.setAutoLayout();
            planState = plan.getState();
            savePlan.disabled = false;

            // Esperar a que se actualicen tamaño, zoom y scroll.
            // Después forzamos un segundo centrado para que el bloque
            // completo quede exactamente al centro del viewport.
            requestAnimationFrame(() => {
              plan.fitView();
              requestAnimationFrame(() => {
                plan.centerView();
              });
            });
          });
        } catch (error) {
          tablesBody.replaceChildren(
            statusBox("error", "No fue posible cargar el editor del plano", errorMessage(error))
          );
        }
      }

      listButton.addEventListener("click", showList);
      planButton.addEventListener("click", showPlan);

      zoomOut.addEventListener("click", () => plan?.zoomOut());
      zoomIn.addEventListener("click", () => plan?.zoomIn());
      fitPlan.addEventListener("click", () => plan?.fitView());
      centerPlan.addEventListener("click", () => plan?.centerView());

      autoLayout.addEventListener("click", () => {
        if (!plan) return;
        plan.setAutoLayout();
        planState = plan.getState();
        savePlan.disabled = false;
      });

      savePlan.addEventListener("click", () => {
        if (!plan || !plan.isDirty()) return;
        planState = plan.getState();

        openSavePlanModal(planState, {
          onSaved: async () => {
            setFeedback("success", "Plano de mesas guardado correctamente.");
            await load();
          },
        });
      });

      showList();
      tablesPanel.append(tablesHead, tablesBody);

      operations.append(pendingPanel, tablesPanel);
      content.replaceChildren(summaryGrid, configPanel, operations);
    }

    function renderEditConfiguration() {
      const cfg = config.data;
      if (!cfg.puede_reconfigurar) {
        setFeedback("error", "La configuración general está bloqueada porque ya existen asignaciones activas.");
        return;
      }

      const panel = el("section", "tables-config-panel");
      const title = el("div", "tables-config-heading");
      title.append(
        el("p", "admin-eyebrow", "Reconfiguración"),
        el("h3", "", "Editar configuración general"),
        el("p", "", "Puedes modificar esta carga mientras no exista ninguna asignación activa de invitados.")
      );

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.inputMode = "numeric";
      numberInput.min = "1";
      numberInput.max = "100";
      numberInput.value = String(cfg.numero_mesas);

      const capacityInput = document.createElement("input");
      capacityInput.type = "number";
      capacityInput.inputMode = "numeric";
      capacityInput.min = "1";
      capacityInput.max = "50";
      capacityInput.value = String(cfg.capacidad_inicial);

      const reason = document.createElement("textarea");
      reason.rows = 3;
      reason.maxLength = 1000;
      reason.placeholder = "Motivo obligatorio de la reconfiguración";

      const formGrid = el("div", "tables-config-grid");
      formGrid.append(
        field("Número de mesas", numberInput),
        field("Capacidad por mesa", capacityInput)
      );

      const actions = el("div", "tables-config-actions");
      const cancel = button("Cancelar");
      const save = button("Guardar cambios", true);
      actions.append(cancel, save);

      panel.append(title, formGrid, field("Motivo del cambio *", reason), actions);
      content.replaceChildren(panel);

      function calculate() {
        const total = Number(numberInput.value) * Number(capacityInput.value);
        save.disabled = !(total >= cfg.cupo_invitados_activos && reason.value.trim());
      }
      [numberInput, capacityInput].forEach((input) => input.addEventListener("input", calculate));
      reason.addEventListener("input", calculate);
      cancel.addEventListener("click", renderConfigured);
      calculate();

      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await window.AdminTablesService.configure({
            numberOfTables: Number(numberInput.value),
            seatsPerTable: Number(capacityInput.value),
            reason: reason.value,
            version: cfg.version,
          });
          setFeedback("success", "Configuración de mesas actualizada correctamente.");
          await load();
        } catch (error) {
          setFeedback("error", errorMessage(error));
          calculate();
        }
      });
    }

    async function load() {
      const currentRequest = ++requestId;
      root.setAttribute("aria-busy", "true");
      content.replaceChildren(el("p", "tables-loading", "Cargando Mesas…"));

      try {
        const configEnvelope = await window.AdminTablesService.getConfiguration();
        if (currentRequest !== requestId || !root.isConnected) return;
        config = configEnvelope;

        if (!config.data.configurado) {
          summary = null;
          tables = [];
          pending = [];
          renderInitialConfiguration();
          return;
        }

        const [summaryResult, tablesResult, pendingResult] = await Promise.all([
          window.AdminTablesService.getSummary(),
          window.AdminTablesService.listTables(),
          window.AdminTablesService.listPending(),
        ]);

        if (currentRequest !== requestId || !root.isConnected) return;
        summary = summaryResult;
        tables = tablesResult.data.items;
        pending = pendingResult.data.items;
        renderConfigured();
      } catch (error) {
        console.error("Tables load:", error);
        content.replaceChildren(
          statusBox("error", "No fue posible cargar Mesas", "Intenta nuevamente o vuelve a iniciar sesión.")
        );
      } finally {
        if (currentRequest === requestId && root.isConnected) root.removeAttribute("aria-busy");
      }
    }

    queueMicrotask(load);
    return root;
  };
})();