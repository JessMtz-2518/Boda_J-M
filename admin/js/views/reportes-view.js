(() => {
  "use strict";

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

  function escapeCsv(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv(filename, rows) {
    // Excel del entorno actual separa correctamente por comas.
    // BOM conserva acentos y caracteres especiales.
    const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function createPaginator({ pageSize = 15, onChange }) {
    let page = 1;
    let totalItems = 0;
    const wrapper = el("div", "reports-pagination");
    const info = el("span", "reports-pagination-info");
    const controls = el("div", "reports-pagination-controls");
    const prev = button("Anterior");
    const next = button("Siguiente");
    controls.append(prev, next);
    wrapper.append(info, controls);

    function totalPages() { return Math.max(1, Math.ceil(totalItems / pageSize)); }
    function update() {
      const pages = totalPages();
      if (page > pages) page = pages;
      const start = totalItems ? ((page - 1) * pageSize) + 1 : 0;
      const end = Math.min(page * pageSize, totalItems);
      info.textContent = totalItems ? `Mostrando ${start}-${end} de ${totalItems}` : "Sin resultados";
      prev.disabled = page <= 1;
      next.disabled = page >= pages;
    }
    prev.addEventListener("click", () => { if (page > 1) { page -= 1; update(); onChange?.(); } });
    next.addEventListener("click", () => { if (page < totalPages()) { page += 1; update(); onChange?.(); } });

    return {
      node: wrapper,
      setTotal(value) { totalItems = Number(value || 0); update(); },
      reset() { page = 1; update(); },
      slice(items) {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
      }
    };
  }


  function excelBorder() {
    const side = { style: "thin", color: { rgb: "D8D7CC" } };
    return { top: side, bottom: side, left: side, right: side };
  }

  function excelHeaderStyle() {
    return {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { patternType: "solid", fgColor: { rgb: "596B4C" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: excelBorder(),
    };
  }

  function excelBodyStyle(horizontal = "left") {
    return {
      font: { color: { rgb: "243126" }, sz: 10 },
      alignment: { horizontal, vertical: "center", wrapText: true },
      border: excelBorder(),
    };
  }

  function excelStatusStyle(text) {
    const value = String(text || "").toLocaleLowerCase("es-MX");
    let fill = "F5F3EA";
    let font = "5E624F";

    if (["activa", "asistirá", "asistira", "pagado", "confirmado", "firmado"].some((key) => value.includes(key))) {
      fill = "E7EFE1";
      font = "405238";
    } else if (["pendiente", "por definir", "por firmar"].some((key) => value.includes(key))) {
      fill = "F5EEDC";
      font = "7A5F22";
    } else if (["inactiva", "no asistirá", "no asistira"].some((key) => value.includes(key))) {
      fill = "EFEDEC";
      font = "77736C";
    }

    return {
      font: { bold: true, color: { rgb: font }, sz: 10 },
      fill: { patternType: "solid", fgColor: { rgb: fill } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: excelBorder(),
    };
  }

  function styleWorksheet(ws, config = {}) {
    const range = window.XLSX.utils.decode_range(ws["!ref"]);
    const statusColumns = new Set(config.statusColumns || []);
    const numericColumns = new Set(config.numericColumns || []);

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = window.XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[address];
        if (!cell) continue;

        if (row === 0) {
          cell.s = excelHeaderStyle();
        } else if (statusColumns.has(col)) {
          cell.s = excelStatusStyle(cell.v);
        } else {
          cell.s = excelBodyStyle(numericColumns.has(col) ? "center" : "left");
        }

        if (numericColumns.has(col) && row > 0) {
          cell.z = "0";
        }
      }
    }

    ws["!autofilter"] = { ref: ws["!ref"] };
    ws["!rows"] = [{ hpt: 28 }];
    ws["!cols"] = (config.widths || []).map((wch) => ({ wch }));
  }

  function exportWorkbook(filename, sheetName, rows, config = {}) {
    if (!window.XLSX) {
      throw new Error("No fue posible cargar el generador de Excel.");
    }

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    styleWorksheet(ws, config);

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    window.XLSX.writeFile(wb, filename, {
      bookType: "xlsx",
      compression: true,
    });
  }

  function exportGuestsExcel(data) {
    const rows = [[
      "INVITADO",
      "CÓDIGO",
      "GRUPO",
      "ESTADO INVITACIÓN",
      "CONFIRMACIÓN",
      "ADULTOS CONFIRMADOS",
      "NIÑOS CONFIRMADOS",
      "TOTAL CONFIRMADOS",
    ]];

    data.guests.forEach((item) => rows.push([
      item.nombre,
      item.codigo,
      item.grupo,
      item.activo ? "Activa" : "Inactiva",
      stateLabel(item.estado_confirmacion),
      Number(item.adultos_confirmados || 0),
      Number(item.ninos_confirmados || 0),
      Number(item.total_confirmado || 0),
    ]));

    exportWorkbook(
      "boda-jm-invitados-confirmaciones.xlsx",
      "Invitados",
      rows,
      {
        widths: [30, 16, 22, 20, 18, 20, 20, 20],
        statusColumns: [3, 4],
        numericColumns: [5, 6, 7],
      }
    );
  }

  function exportTablesExcel(data) {
    const rows = [[
      "MESA",
      "ALIAS",
      "ADULTOS",
      "NIÑOS",
      "TOTAL ASIGNADOS",
      "CAPACIDAD",
      "LUGARES DISPONIBLES",
      "ASISTENTES",
    ]];

    data.byTable.forEach((table) => rows.push([
      `Mesa ${table.number}`,
      table.name || `Mesa ${table.number}`,
      Number(table.adults || 0),
      Number(table.children || 0),
      Number(table.occupied || 0),
      Number(table.capacity || 0),
      Number(table.available || 0),
      table.assignments.map((item) => item.nombre).filter(Boolean).join(", ") || "Sin asistentes asignados",
    ]));

    exportWorkbook(
      "boda-jm-distribucion-mesas.xlsx",
      "Mesas",
      rows,
      {
        widths: [12, 20, 12, 12, 18, 14, 22, 48],
        numericColumns: [2, 3, 4, 5, 6],
      }
    );
  }


  function exportReceptionPdf(data) {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) throw new Error("No fue posible cargar el generador de PDF.");
    if (typeof jsPDF.API.autoTable !== "function") throw new Error("No fue posible cargar el generador de tablas PDF.");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 12;
    const olive = [89, 107, 76];
    const oliveDark = [58, 72, 50];
    const ivory = [250, 247, 239];
    const silver = [177, 179, 174];
    const ink = [43, 48, 41];
    const muted = [102, 105, 98];
    const line = [218, 217, 207];
    const guests = Array.isArray(data.receptionGuests) ? data.receptionGuests : [];
    const tables = Array.isArray(data.byTable) ? data.byTable : [];
    const event = data.eventConfig?.evento || {};
    const eventDate = event.fecha_evento
      ? new Intl.DateTimeFormat("es-MX", { day:"2-digit", month:"long", year:"numeric" })
          .format(new Date(`${event.fecha_evento}T12:00:00`)).toUpperCase()
      : "01 MAYO 2027";
    const venue = String(event.lugar_nombre || "Jardín Jade").toUpperCase();

    const totalPeople = guests.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const assignedPeople = guests.filter((item) => item.tableNumber != null).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const activeTables = tables.length;
    const available = Number(data.tableSummary?.available || 0);

    function header(first = false) {
      doc.setTextColor(...oliveDark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(first ? 17 : 11);
      doc.text("JESSICA & MARCOS", pageW / 2, first ? 14 : 10, { align:"center" });
      if (first) {
        doc.setFontSize(15);
        doc.text("RECEPCIÓN DE INVITADOS", pageW / 2, 24, { align:"center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text("Control de acceso y asignación de mesas", pageW / 2, 30, { align:"center" });
        doc.setFontSize(7.5);
        doc.text(`${eventDate}   |   ${venue}`, pageW / 2, 36, { align:"center" });
        doc.setDrawColor(...silver);
        doc.setLineWidth(.35);
        doc.line(marginX, 40, pageW - marginX, 40);
      } else {
        doc.setDrawColor(...line);
        doc.setLineWidth(.25);
        doc.line(marginX, 13, pageW - marginX, 13);
      }
    }

    function footer(pageNumber, totalPages) {
      doc.setDrawColor(...line);
      doc.setLineWidth(.25);
      doc.line(marginX, pageH - 10, pageW - marginX, pageH - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(...muted);
      doc.text("RECEPCIÓN · JESSICA & MARCOS", marginX, pageH - 5.8);
      doc.text(`PÁGINA ${pageNumber} DE ${totalPages}`, pageW - marginX, pageH - 5.8, { align:"right" });
    }

    header(true);

    const kpis = [
      ["PERSONAS ESPERADAS", totalPeople],
      ["INVITACIONES CONFIRMADAS", guests.length],
      ["MESAS", activeTables],
      ["LUGARES DISPONIBLES", available],
    ];
    const kpiW = (pageW - marginX * 2) / 4;
    kpis.forEach(([label, value], index) => {
      const x = marginX + index * kpiW;
      if (index) {
        doc.setDrawColor(...line);
        doc.line(x, 45, x, 60);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...oliveDark);
      doc.text(String(value), x + kpiW / 2, 51, { align:"center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text(label, x + kpiW / 2, 57, { align:"center" });
    });

    doc.setDrawColor(...silver);
    doc.line(marginX, 63, pageW - marginX, 63);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...oliveDark);
    doc.text("LISTADO ALFABÉTICO", marginX, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text("Localiza al invitado, confirma su llegada e indícale su mesa.", marginX, 75);

    const rows = guests.map((item) => [
      item.name,
      String(item.adults),
      String(item.children),
      String(item.total),
      item.tableNumber == null ? "SIN ASIGNAR" : `MESA ${String(item.tableNumber).padStart(2,"0")}`,
      item.status || "Confirmada",
      ""
    ]);

    doc.autoTable({
      startY: 79,
      margin: { left:marginX, right:marginX, top:18, bottom:15 },
      head: [["INVITADO / FAMILIA","ADULTOS","NIÑOS","TOTAL","MESA","CONFIRMACIÓN","LLEGÓ"]],
      body: rows,
      theme: "grid",
      styles: {
        font:"helvetica", fontSize:7.2, textColor:ink, cellPadding:2.3,
        lineColor:line, lineWidth:.2, valign:"middle", overflow:"linebreak",
        minCellHeight:7.5
      },
      headStyles: { fillColor:olive, textColor:[255,250,241], fontStyle:"bold", halign:"center", fontSize:6.8, minCellHeight:8 },
      alternateRowStyles: { fillColor:ivory },
      columnStyles: {
        0:{ cellWidth:76, halign:"left" },
        1:{ cellWidth:20, halign:"center" },
        2:{ cellWidth:18, halign:"center" },
        3:{ cellWidth:18, halign:"center", fontStyle:"bold" },
        4:{ cellWidth:28, halign:"center", fontStyle:"bold", textColor:oliveDark },
        5:{ cellWidth:30, halign:"center" },
        6:{ cellWidth:18, halign:"center", fontSize:11 }
      },
      didDrawCell: (hook) => {
        if (hook.section === "body" && hook.column.index === 6) {
          const size = 3.8;
          const x = hook.cell.x + (hook.cell.width - size) / 2;
          const y = hook.cell.y + (hook.cell.height - size) / 2;
          doc.setDrawColor(...oliveDark);
          doc.setLineWidth(.35);
          doc.rect(x, y, size, size);
        }
      },
      didDrawPage: (hook) => {
        if (hook.pageNumber > 1) header(false);
      }
    });

    // Segunda sección: siempre comienza en página nueva para evitar montajes.
    doc.addPage("letter", "landscape");
    header(false);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...oliveDark);
    doc.text("DISTRIBUCIÓN POR MESAS", pageW / 2, 23, { align:"center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text("Consulta rápida para el equipo de recepción", pageW / 2, 29, { align:"center" });
    doc.setDrawColor(...silver);
    doc.line(marginX, 34, pageW - marginX, 34);

    const tableRows = [];
    tables.forEach((table) => {
      const people = table.assignments.reduce((sum, item) => sum + Number(item.total || 0), 0);
      const free = Math.max(0, Number(table.capacity || 0) - people);
      if (!table.assignments.length) {
        tableRows.push([`MESA ${String(table.number).padStart(2,"0")}`, "Sin invitados asignados", "0", `${people}/${table.capacity}`, `${free} libres`]);
        return;
      }
      table.assignments.forEach((item, index) => {
        tableRows.push([
          index === 0 ? `MESA ${String(table.number).padStart(2,"0")}` : "",
          item.nombre,
          String(Number(item.total || 0)),
          index === 0 ? `${people}/${table.capacity}` : "",
          index === 0 ? (free ? `${free} libres` : "COMPLETA") : ""
        ]);
      });
    });

    doc.autoTable({
      startY:39,
      margin:{ left:marginX, right:marginX, top:18, bottom:15 },
      head:[["MESA","INVITADO / FAMILIA","PERSONAS","OCUPACIÓN","DISPONIBILIDAD"]],
      body:tableRows,
      theme:"grid",
      styles:{ font:"helvetica", fontSize:7.2, textColor:ink, cellPadding:2.2, lineColor:line, lineWidth:.2, valign:"middle", overflow:"linebreak", minCellHeight:7.2 },
      headStyles:{ fillColor:olive, textColor:[255,250,241], fontStyle:"bold", halign:"center", fontSize:6.8 },
      alternateRowStyles:{ fillColor:ivory },
      columnStyles:{
        0:{cellWidth:30,halign:"center",fontStyle:"bold",textColor:oliveDark},
        1:{cellWidth:105},
        2:{cellWidth:25,halign:"center"},
        3:{cellWidth:35,halign:"center",fontStyle:"bold"},
        4:{cellWidth:40,halign:"center"}
      },
      didDrawPage:()=>header(false)
    });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      footer(page, totalPages);
    }

    doc.save("Jessica-Marcos-Recepcion-Invitados.pdf");
  }

  function buildReceptionReport(data) {
    const section = el("section", "reports-section reports-section-reception");
    section.dataset.reportPanel = "recepcion";
    const guests = data.receptionGuests || [];
    const people = guests.reduce((sum,item)=>sum+Number(item.total||0),0);
    const assigned = guests.filter((item)=>item.tableNumber!=null).reduce((sum,item)=>sum+Number(item.total||0),0);
    const unassigned = Math.max(0, people-assigned);

    const summary = el("div","reports-summary-grid");
    summary.append(
      metric("Personas esperadas",people,"personas registradas en invitaciones","success"),
      metric("Invitaciones",guests.length,"familias / invitaciones registradas"),
      metric("Mesas",data.tableSummary?.tables||0,"mesas activas"),
      metric("Sin mesa",unassigned,"personas pendientes de asignar",unassigned?"warning":"success")
    );

    const card = el("article","reports-overview-card reports-reception-card");
    card.append(
      el("p","admin-eyebrow","Reporte operativo"),
      el("h3","","Recepción de invitados"),
      el("p","admin-view-copy","PDF horizontal listo para imprimir. Incluye listado alfabético con adultos, niños, total, mesa, confirmación y casilla de llegada; después agrega la distribución por mesas. El código de invitación no aparece.")
    );
    const exportPdf = button("Exportar PDF",true);
    exportPdf.addEventListener("click",()=>{
      try{exportReceptionPdf(data)}
      catch(error){console.error("Reporte recepción PDF:",error);window.alert(error?.message||"No fue posible generar el PDF.");}
    });
    card.append(exportPdf);
    section.append(summary,card);
    return section;
  }

  function metric(label, value, detail = "", tone = "") {
    const card = el("article", `reports-metric${tone ? ` reports-metric-${tone}` : ""}`);
    card.append(
      el("span", "reports-metric-label", label),
      el("strong", "reports-metric-value", String(value)),
      el("span", "reports-metric-detail", detail)
    );
    return card;
  }

  function stateLabel(state) {
    if (state === "asistira") return "Asistirá";
    if (state === "no_asistira") return "No asistirá";
    return "Pendiente";
  }

  function stateClass(state) {
    if (state === "asistira") return "reports-state-attending";
    if (state === "no_asistira") return "reports-state-not-attending";
    return "reports-state-pending";
  }

  function buildTableReport(data) {
    const section = el("section", "reports-section reports-section-tables");
    section.dataset.reportPanel = "mesas";

    const summary = el("div", "reports-summary-grid reports-summary-grid-five");
    const tableSummary = data.tableSummary || {};
    summary.append(
      metric("Mesas", tableSummary.tables || 0, "mesas activas"),
      metric("Capacidad", tableSummary.capacity || 0, "lugares disponibles en salón"),
      metric("Asignados", tableSummary.assigned || 0, "personas con mesa"),
      metric("Sin asignar", tableSummary.unassigned || 0, "confirmados pendientes de mesa", tableSummary.unassigned ? "warning" : "success"),
      metric("Disponibles", tableSummary.available || 0, "lugares aún libres")
    );

    const wrap = el("div", "reports-table-wrap");
    const tableEl = document.createElement("table");
    tableEl.className = "reports-data-table reports-tables-summary";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Mesa", "Alias", "Adultos", "Niños", "Total", "Capacidad", "Disponibles", "Asistentes"].forEach((label) => {
      const th = document.createElement("th"); th.textContent = label; hr.append(th);
    });
    thead.append(hr);
    const tbody = document.createElement("tbody");
    tableEl.append(thead, tbody);
    wrap.append(tableEl);

    const paginator = createPaginator({ pageSize: 10, onChange: renderRows });

    function renderRows() {
      tbody.replaceChildren();
      paginator.slice(data.byTable).forEach((table) => {
        const tr = document.createElement("tr");
        const guests = table.assignments.map((item) => item.nombre).filter(Boolean).join(", ") || "Sin asistentes asignados";
        const values = [
          `Mesa ${table.number}`,
          table.name || `Mesa ${table.number}`,
          table.adults,
          table.children,
          table.occupied,
          table.capacity,
          table.available,
          guests,
        ];
        values.forEach((value, index) => {
          const td = document.createElement("td");
          td.textContent = String(value);
          td.dataset.label = ["Mesa","Alias","Adultos","Niños","Total","Capacidad","Disponibles","Asistentes"][index];
          if (index === 7) td.className = "reports-table-guests-cell";
          tr.append(td);
        });
        tbody.append(tr);
      });
    }

    paginator.setTotal(data.byTable.length);
    renderRows();
    section.append(summary, wrap, paginator.node);
    return section;
  }

  function buildGuestsReport(data) {
    const section = el("section", "reports-section reports-section-guests");
    section.dataset.reportPanel = "invitados";
    section.hidden = true;

    const summary = data.guestSummary;
    const blocks = el("div", "reports-summary-groups");

    const invitationBlock = el("section", "reports-summary-block");
    invitationBlock.append(el("h3", "", "Invitaciones"));
    const invitationMetrics = el("div", "reports-metrics reports-metrics-compact");
    invitationMetrics.append(
      metric("Total", summary.invitation.total, "Invitaciones registradas"),
      metric("Activas", summary.invitation.active, "Invitaciones vigentes", "active"),
      metric("Inactivas", summary.invitation.inactive, "Bajas administrativas", "inactive")
    );
    invitationBlock.append(invitationMetrics);

    const confirmationBlock = el("section", "reports-summary-block");
    confirmationBlock.append(el("h3", "", "Confirmación"));
    const confirmationMetrics = el("div", "reports-metrics reports-metrics-compact");
    confirmationMetrics.append(
      metric("Asistirán", summary.confirmation.attending, "Invitaciones confirmadas", "attending"),
      metric("No asistirán", summary.confirmation.notAttending, "Invitaciones declinadas", "not-attending"),
      metric("Pendientes", summary.confirmation.pending, "Sin respuesta", "pending")
    );
    confirmationBlock.append(confirmationMetrics);

    const peopleBlock = el("section", "reports-summary-block reports-summary-block-people");
    peopleBlock.append(el("h3", "", "Personas que asistirán"));
    const peopleMetrics = el("div", "reports-metrics reports-metrics-compact");
    peopleMetrics.append(
      metric("Adultos", summary.people.adults, "Confirmados"),
      metric("Niños", summary.people.children, "Confirmados"),
      metric("Total asistentes", summary.people.total, "Adultos + niños", "attending")
    );
    peopleBlock.append(peopleMetrics);
    blocks.append(invitationBlock, confirmationBlock, peopleBlock);

    const toolbar = el("div", "reports-guests-toolbar");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Buscar invitado, código o grupo";
    search.className = "reports-search";
    const state = document.createElement("select");
    [["", "Todos los estados"], ["asistira", "Asistirá"], ["no_asistira", "No asistirá"], ["pendiente", "Pendiente"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; state.append(option);
    });
    const active = document.createElement("select");
    [["", "Activas e inactivas"], ["true", "Solo activas"], ["false", "Solo inactivas"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; active.append(option);
    });
    toolbar.append(search, state, active);

    const wrap = el("div", "reports-list-wrap");
    const table = el("table", "reports-list-table reports-guests-table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Invitado", "Código", "Grupo", "Invitación", "Confirmación", "Adultos", "Niños", "Total"].forEach((label) => {
      const th = document.createElement("th"); th.textContent = label; hr.append(th);
    });
    thead.append(hr);
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    wrap.append(table);

    const empty = el("p", "reports-empty-inline", "No hay invitados que coincidan con los filtros.");
    empty.hidden = true;
    const paginator = createPaginator({ pageSize: 15, onChange: renderRows });

    function renderRows() {
      const term = search.value.trim().toLocaleLowerCase("es-MX");
      const stateValue = state.value;
      const activeValue = active.value;
      const filtered = data.guests.filter((item) => {
        const haystack = `${item.nombre} ${item.codigo} ${item.grupo}`.toLocaleLowerCase("es-MX");
        if (term && !haystack.includes(term)) return false;
        if (stateValue && item.estado_confirmacion !== stateValue) return false;
        if (activeValue && String(item.activo) !== activeValue) return false;
        return true;
      });

      paginator.setTotal(filtered.length);
      tbody.replaceChildren();
      paginator.slice(filtered).forEach((item) => {
        const tr = document.createElement("tr");
        const values = [item.nombre, item.codigo, item.grupo];
        values.forEach((value, index) => {
          const td = document.createElement("td"); td.textContent = value; td.dataset.label = ["Invitado", "Código", "Grupo"][index]; tr.append(td);
        });

        const invitation = document.createElement("td");
        invitation.dataset.label = "Invitación";
        invitation.append(el("span", `reports-status-chip ${item.activo ? "reports-state-active" : "reports-state-inactive"}`, item.activo ? "Activa" : "Inactiva"));

        const confirmation = document.createElement("td");
        confirmation.dataset.label = "Confirmación";
        confirmation.append(el("span", `reports-status-chip ${stateClass(item.estado_confirmacion)}`, stateLabel(item.estado_confirmacion)));

        const counts = [item.adultos_confirmados, item.ninos_confirmados, item.total_confirmado];
        [invitation, confirmation].forEach((td) => tr.append(td));
        counts.forEach((value, index) => {
          const td = document.createElement("td"); td.textContent = String(value); td.dataset.label = ["Adultos", "Niños", "Total"][index]; tr.append(td);
        });
        tbody.append(tr);
      });

      empty.hidden = filtered.length > 0;
    }

    search.addEventListener("input", () => { paginator.reset(); renderRows(); });
    state.addEventListener("change", () => { paginator.reset(); renderRows(); });
    active.addEventListener("change", () => { paginator.reset(); renderRows(); });
    renderRows();

    section.append(blocks, toolbar, wrap, empty, paginator.node);
    return section;
  }


  function money(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function buildOverviewReport(data) {
    const section = el("section", "reports-section reports-section-overview");
    section.dataset.reportPanel = "resumen";

    const guests = data.guestSummary || {};
    const tables = data.tableSummary || {};
    const org = data.organizationSummary || {};
    const finance = data.financeSummary || {};

    const executive = el("div", "reports-overview-executive");
    executive.append(
      metric("Invitaciones activas", guests.invitation?.active || 0, "invitaciones vigentes"),
      metric("Personas confirmadas", guests.people?.total || 0, `${guests.people?.adults || 0} adultos · ${guests.people?.children || 0} niños`),
      metric("Sin mesa", tables.unassigned || 0, "confirmados pendientes de asignar", tables.unassigned ? "warning" : "success"),
      metric("Planeación", `${Number(org.planner?.progress || 0).toFixed(1).replace(".0","")}%`, "completado"),
      metric("Esenciales definidos", `${org.essentials?.defined || 0}/${org.essentials?.total || 0}`, "listos o contratados"),
      metric("Pagado", money(finance.paid || 0), `de ${money(finance.budget || 0)} presupuestados`)
    );

    const blocks = el("div", "reports-overview-blocks");

    const confirmations = el("article", "reports-overview-card");
    confirmations.append(el("h3", "", "Confirmaciones"));
    const confirmGrid = el("div", "reports-mini-grid");
    confirmGrid.append(
      metric("Asistirán", guests.confirmation?.attending || 0, "invitaciones confirmadas", "success"),
      metric("No asistirán", guests.confirmation?.notAttending || 0, "invitaciones declinadas"),
      metric("Pendientes", guests.confirmation?.pending || 0, "sin respuesta", guests.confirmation?.pending ? "warning" : "")
    );
    confirmations.append(confirmGrid);

    const organization = el("article", "reports-overview-card");
    organization.append(el("h3", "", "Organización"));
    const orgGrid = el("div", "reports-mini-grid");
    orgGrid.append(
      metric("Tareas pendientes", (org.planner?.pending || 0) + (org.planner?.inProgress || 0), "Planeación"),
      metric("Esenciales pendientes", org.essentials?.pending || 0, "por definir"),
      metric("Padrinos pendientes", org.godparents?.pending || 0, "por definir")
    );
    organization.append(orgGrid);

    const finances = el("article", "reports-overview-card reports-overview-card-wide");
    finances.append(el("h3", "", "Finanzas"));
    const finGrid = el("div", "reports-mini-grid reports-mini-grid-five");
    finGrid.append(
      metric("Presupuesto", money(finance.budget || 0), "monto planeado"),
      metric("Contratado", money(finance.contracted || 0), "comprometido"),
      metric("Pagado", money(finance.paid || 0), "liquidado"),
      metric("Pendiente de pago", money(finance.pendingPayment || 0), "saldo contratado"),
      metric("Disponible", money(finance.available || 0), "sin comprometer")
    );
    finances.append(finGrid);

    blocks.append(confirmations, organization, finances);
    section.append(executive, blocks);
    return section;
  }

  function buildOrganizationReport(data) {
    const section = el("section", "reports-section reports-section-organization");
    section.dataset.reportPanel = "organizacion";
    const org = data.organizationSummary || {};

    const blocks = el("div", "reports-overview-blocks");
    const planner = el("article", "reports-overview-card");
    planner.append(el("h3", "", "Planeación"));
    const plannerGrid = el("div", "reports-mini-grid");
    plannerGrid.append(
      metric("Total", org.planner?.total || 0, "tareas registradas"),
      metric("Completadas", org.planner?.completed || 0, "tareas cerradas", "success"),
      metric("Pendientes", org.planner?.pending || 0, "por iniciar"),
      metric("En proceso", org.planner?.inProgress || 0, "en seguimiento"),
      metric("Vencidas", org.planner?.overdue || 0, "requieren atención", org.planner?.overdue ? "warning" : "")
    );
    planner.append(plannerGrid);

    const essentials = el("article", "reports-overview-card");
    essentials.append(el("h3", "", "Esenciales"));
    const essentialGrid = el("div", "reports-mini-grid");
    essentialGrid.append(
      metric("Total", org.essentials?.total || 0, "esenciales aplicables"),
      metric("Definidos", org.essentials?.defined || 0, "listos o contratados", "success"),
      metric("Prospectos", org.essentials?.prospects || 0, "evaluando opciones"),
      metric("Por definir", org.essentials?.pending || 0, "aún sin iniciar")
    );
    essentials.append(essentialGrid);

    const godparents = el("article", "reports-overview-card reports-overview-card-wide");
    godparents.append(el("h3", "", "Padrinos"));
    const godGrid = el("div", "reports-mini-grid");
    godGrid.append(
      metric("Total", org.godparents?.total || 0, "padrinazgos activos"),
      metric("Confirmados", org.godparents?.confirmed || 0, "ya definidos", "success"),
      metric("Por definir", org.godparents?.pending || 0, "pendientes")
    );
    godparents.append(godGrid);

    blocks.append(planner, essentials, godparents);
    section.append(blocks);
    return section;
  }

  function buildFinanceReport(data) {
    const section = el("section", "reports-section reports-section-finance");
    section.dataset.reportPanel = "finanzas";
    const finance = data.financeSummary || {};

    const summary = el("div", "reports-summary-grid reports-summary-grid-five");
    summary.append(
      metric("Presupuesto", money(finance.budget || 0), "monto planeado"),
      metric("Contratado", money(finance.contracted || 0), "comprometido"),
      metric("Pagado", money(finance.paid || 0), "liquidado", "success"),
      metric("Pendiente de pago", money(finance.pendingPayment || 0), "saldo contratado"),
      metric("Disponible", money(finance.available || 0), "sin comprometer")
    );

    const contracts = el("article", "reports-overview-card");
    contracts.append(el("h3", "", "Estado contractual"));
    const grid = el("div", "reports-mini-grid");
    grid.append(
      metric("Firmados", finance.contracts?.signed || 0, "contratos formalizados", "success"),
      metric("Por firmar", finance.contracts?.awaitingSignature || 0, "pendientes de firma"),
      metric("En revisión", finance.contracts?.reviewing || 0, "validación contractual"),
      metric("Sin contrato", finance.contracts?.withoutContract || 0, "requieren definición")
    );
    contracts.append(grid);

    section.append(summary, contracts);
    return section;
  }

  function renderReports(data, root) {
    root.replaceChildren();

    const header = el("header", "admin-view-header reports-header");
    const copy = el("div");
    copy.append(
      el("p", "admin-eyebrow", "Wedding Command Center"),
      el("h2", "", "Centro de reportes"),
      el("p", "admin-view-copy", "Consulta, imprime y exporta el estado consolidado de la boda desde un solo lugar.")
    );

    const actions = el("div", "reports-header-actions");
    const refresh = button("Actualizar");
    const print = button("Imprimir / Guardar PDF", true);
    actions.append(refresh, print);
    header.append(copy, actions);

    const tabs = el("div", "reports-tabs reports-tabs-main");
    const tabDefinitions = [
      ["resumen", "Resumen"],
      ["invitados", "Invitados"],
      ["mesas", "Mesas"],
      ["recepcion", "Recepción"],
      ["organizacion", "Organización"],
      ["finanzas", "Finanzas"],
    ];
    const tabButtons = new Map();
    tabDefinitions.forEach(([key, label], index) => {
      const tab = button(label, index === 0);
      tab.dataset.reportTab = key;
      tab.setAttribute("aria-pressed", String(index === 0));
      tabs.append(tab);
      tabButtons.set(key, tab);
    });

    const exportBar = el("div", "reports-export-bar");
    const exportCurrent = button("Exportar Excel");
    exportBar.append(exportCurrent);

    const panels = el("div", "reports-panels");
    panels.append(
      buildOverviewReport(data),
      buildGuestsReport(data),
      buildTableReport(data),
      buildReceptionReport(data),
      buildOrganizationReport(data),
      buildFinanceReport(data)
    );

    function showPanel(key) {
      panels.querySelectorAll("[data-report-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.reportPanel !== key;
      });
      tabButtons.forEach((tab, tabKey) => {
        const active = tabKey === key;
        tab.classList.toggle("admin-button-secondary", !active);
        tab.setAttribute("aria-pressed", String(active));
      });
      root.dataset.activeReport = key;
      exportBar.hidden = !["invitados","mesas"].includes(key);
    }

    tabs.addEventListener("click", (event) => {
      const target = event.target.closest("[data-report-tab]");
      if (target) showPanel(target.dataset.reportTab);
    });

    exportCurrent.addEventListener("click", () => {
      try {
        if (root.dataset.activeReport === "invitados") {
          exportGuestsExcel(data);
          return;
        }

        if (root.dataset.activeReport === "mesas") {
          exportTablesExcel(data);
        }
      } catch (error) {
        console.error("Exportar Excel:", error);
        window.alert(error?.message || "No fue posible generar el archivo de Excel.");
      }
    });

    print.addEventListener("click", () => window.print());

    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.textContent = "Actualizando…";
      try {
        const next = await window.AdminReportsService.getReportsData();
        renderReports(next, root);
      } catch (error) {
        console.error("Reportes:", error);
        refresh.disabled = false;
        refresh.textContent = "Actualizar";
      }
    });

    root.append(header, tabs, exportBar, panels);
    showPanel("resumen");
  }

  function reportesView() {
    const root = el("section", "reports-view");
    root.dataset.activeReport = "resumen";

    const loading = el("div", "reports-loading");
    loading.append(
      el("p", "admin-eyebrow", "Wedding Command Center"),
      el("h2", "", "Preparando reportes…"),
      el("p", "admin-view-copy", "Consolidando invitados, mesas, organización y finanzas.")
    );
    root.append(loading);

    window.AdminReportsService.getReportsData()
      .then((data) => renderReports(data, root))
      .catch((error) => {
        console.error("Reportes:", error);
        root.replaceChildren();
        const box = el("div", "reports-error");
        box.append(
          el("p", "admin-eyebrow", "No fue posible cargar los reportes"),
          el("h2", "", "Intenta nuevamente"),
          el("p", "admin-view-copy", "No pudimos consultar la información actual de Mesas e Invitados.")
        );
        const retry = button("Reintentar", true);
        retry.addEventListener("click", () => root.replaceWith(reportesView()));
        box.append(retry);
        root.append(box);
      });

    return root;
  }

  window.AdminViews = window.AdminViews || {};
  window.AdminViews.reportes = reportesView;
})();
