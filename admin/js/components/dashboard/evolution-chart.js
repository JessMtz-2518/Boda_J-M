(() => {
  "use strict";
  window.AdminDashboardComponents = window.AdminDashboardComponents || {};
  const NS = "http://www.w3.org/2000/svg";
  const svgNode = (name, attributes = {}) => { const node = document.createElementNS(NS, name); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value))); return node; };
  function evolutionChart(items = []) {
    if (!items.length) return window.AdminDashboardComponents.feedback("empty", "No hay datos de evolucion para mostrar.");
    const root = document.createElement("div"); root.className = "dashboard-chart-wrap";
    const legend = document.createElement("div"); legend.className = "dashboard-chart-legend";
    [["Primeras respuestas", "first"], ["Modificaciones", "changes"], ["Asistentes acumulados", "line"]].forEach(([label, tone]) => { const item=document.createElement("span"); item.className=`legend-${tone}`; item.textContent=label; legend.append(item); });
    const width=900, height=330, left=46, right=18, top=24, bottom=48, plotWidth=width-left-right, plotHeight=height-top-bottom;
    const svg=svgNode("svg", { viewBox:`0 0 ${width} ${height}`, role:"img", "aria-label":"Evolucion de confirmaciones durante los ultimos 30 dias" });
    const maxActivity=Math.max(1,...items.flatMap((item)=>[Number(item.actividad?.primeras_respuestas)||0,Number(item.actividad?.modificaciones)||0]));
    const maxAttendees=Math.max(1,...items.map((item)=>Number(item.estado_al_cierre?.asistentes_confirmados)||0));
    [0,.5,1].forEach((ratio)=>{const y=top+plotHeight*(1-ratio);svg.append(svgNode("line",{x1:left,x2:width-right,y1:y,y2:y,class:"chart-grid"}));});
    const slot=plotWidth/items.length, bar=Math.max(2,slot*.22); const points=[];
    items.forEach((item,index)=>{const center=left+slot*(index+.5);const first=Number(item.actividad?.primeras_respuestas)||0;const changes=Number(item.actividad?.modificaciones)||0;const firstH=plotHeight*(first/maxActivity);const changeH=plotHeight*(changes/maxActivity);svg.append(svgNode("rect",{x:center-bar-1,y:top+plotHeight-firstH,width:bar,height:firstH,class:"chart-bar-first"}));svg.append(svgNode("rect",{x:center+1,y:top+plotHeight-changeH,width:bar,height:changeH,class:"chart-bar-changes"}));const attendees=Number(item.estado_al_cierre?.asistentes_confirmados)||0;points.push(`${center},${top+plotHeight-(plotHeight*attendees/maxAttendees)}`);if(index===0||index===items.length-1||index===Math.floor(items.length/2)){const label=svgNode("text",{x:center,y:height-18,class:"chart-axis-label","text-anchor":"middle"});label.textContent=window.AdminDashboardFormatters.formatShortDate(item.fecha);svg.append(label);}});
    svg.append(svgNode("polyline",{points:points.join(" "),class:"chart-line",fill:"none"}));
    root.append(legend,svg); return root;
  }
  window.AdminDashboardComponents.evolutionChart = evolutionChart;
})();
