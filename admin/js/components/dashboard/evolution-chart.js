(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  const NS = "http://www.w3.org/2000/svg";
  let chartSequence = 0;
  const svgNode = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };

  function createDataTable(items) {
    const wrapper = document.createElement("div");
    wrapper.className = "dashboard-chart-data-table-wrap";
    const table = document.createElement("table");
    table.className = "dashboard-chart-data-table";
    const caption = document.createElement("caption");
    caption.textContent = "Datos diarios de la evolucion de confirmaciones";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Fecha", "Primeras respuestas", "Modificaciones", "Asistentes confirmados"].forEach((label) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    items.forEach((item) => {
      const row = document.createElement("tr");
      const values = [
        window.AdminDashboardFormatters.formatShortDate(item.fecha),
        window.AdminDashboardFormatters.formatNumber(item.actividad.primeras_respuestas),
        window.AdminDashboardFormatters.formatNumber(item.actividad.modificaciones),
        window.AdminDashboardFormatters.formatNumber(item.estado_al_cierre.asistentes_confirmados),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    table.append(caption, head, body);
    wrapper.append(table);
    return wrapper;
  }

  function evolutionChart(items = []) {
    if (!items.length) return window.AdminDashboardComponents.feedback("empty", "No hay datos de evolucion para mostrar.");
    const formatters = window.AdminDashboardFormatters;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const totalFirst = items.reduce((total, item) => total + item.actividad.primeras_respuestas, 0);
    const totalChanges = items.reduce((total, item) => total + item.actividad.modificaciones, 0);
    const initialAttendees = firstItem.estado_al_cierre.asistentes_confirmados;
    const finalAttendees = lastItem.estado_al_cierre.asistentes_confirmados;
    const trend = finalAttendees > initialAttendees ? "aumento" : finalAttendees < initialAttendees ? "disminuyo" : "sin cambios";
    const period = `${formatters.formatShortDate(firstItem.fecha)} a ${formatters.formatShortDate(lastItem.fecha)}`;
    const description = `Periodo ${period}. ${totalFirst} primeras respuestas, ${totalChanges} modificaciones. Los asistentes confirmados pasaron de ${initialAttendees} a ${finalAttendees}; la tendencia ${trend}.`;

    const root = document.createElement("div");
    root.className = "dashboard-chart-wrap";
    root.tabIndex = 0;
    root.setAttribute("aria-label", "Grafica de evolucion desplazable horizontalmente");
    const legend = document.createElement("div");
    legend.className = "dashboard-chart-legend";
    [["Primeras respuestas", "first"], ["Modificaciones", "changes"], ["Asistentes acumulados", "line"]].forEach(([label, tone]) => {
      const item = document.createElement("span");
      item.className = `legend-${tone}`;
      item.textContent = label;
      legend.append(item);
    });

    const width=900, height=330, left=46, right=18, top=24, bottom=48, plotWidth=width-left-right, plotHeight=height-top-bottom;
    chartSequence += 1;
    const titleId = `dashboard-chart-title-${chartSequence}`;
    const descriptionId = `dashboard-chart-description-${chartSequence}`;
    const svg = svgNode("svg", { viewBox:`0 0 ${width} ${height}`, role:"img", "aria-labelledby":`${titleId} ${descriptionId}` });
    const title = svgNode("title", { id: titleId });
    title.textContent = "Evolucion de confirmaciones durante los ultimos 30 dias";
    const desc = svgNode("desc", { id: descriptionId });
    desc.textContent = description;
    svg.append(title, desc);

    const maxActivity=Math.max(1,...items.flatMap((item)=>[item.actividad.primeras_respuestas,item.actividad.modificaciones]));
    const maxAttendees=Math.max(1,...items.map((item)=>item.estado_al_cierre.asistentes_confirmados));
    [0,.5,1].forEach((ratio)=>{const y=top+plotHeight*(1-ratio);svg.append(svgNode("line",{x1:left,x2:width-right,y1:y,y2:y,class:"chart-grid"}));});
    const slot=plotWidth/items.length, bar=Math.max(2,slot*.22); const points=[];
    items.forEach((item,index)=>{const center=left+slot*(index+.5);const first=item.actividad.primeras_respuestas;const changes=item.actividad.modificaciones;const firstH=plotHeight*(first/maxActivity);const changeH=plotHeight*(changes/maxActivity);svg.append(svgNode("rect",{x:center-bar-1,y:top+plotHeight-firstH,width:bar,height:firstH,class:"chart-bar-first"}));svg.append(svgNode("rect",{x:center+1,y:top+plotHeight-changeH,width:bar,height:changeH,class:"chart-bar-changes"}));const attendees=item.estado_al_cierre.asistentes_confirmados;points.push(`${center},${top+plotHeight-(plotHeight*attendees/maxAttendees)}`);if(index===0||index===items.length-1||index===Math.floor(items.length/2)){const label=svgNode("text",{x:center,y:height-18,class:"chart-axis-label","text-anchor":"middle"});label.textContent=formatters.formatShortDate(item.fecha);svg.append(label);}});
    svg.append(svgNode("polyline",{points:points.join(" "),class:"chart-line",fill:"none"}));

    const details = document.createElement("details");
    details.className = "dashboard-chart-data";
    const detailsTitle = document.createElement("summary");
    detailsTitle.textContent = "Consultar resumen y datos de los 30 dias";
    const summary = document.createElement("p");
    summary.className = "dashboard-chart-summary";
    summary.textContent = description;
    details.append(detailsTitle, summary, createDataTable(items));
    root.append(legend, svg, details);
    return root;
  }
  window.AdminDashboardComponents.evolutionChart = evolutionChart;
})();
