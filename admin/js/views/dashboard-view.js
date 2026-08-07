(() => {
  "use strict";
  window.AdminViews = window.AdminViews || {};
  const state = { summary: null, recent: null, groups: null, evolution: null, generatedAt: null };
  window.AdminDashboardState = Object.freeze({
    clear() { Object.keys(state).forEach((key) => { state[key] = null; }); },
  });

  function section(title, className) {
    const card = document.createElement("section"); card.className = `dashboard-panel ${className}`;
    const heading = document.createElement("h3"); heading.textContent = title;
    const body = document.createElement("div"); body.className = "dashboard-panel-body";
    card.append(heading, body); return { card, body };
  }

  function renderKpis(target, data) {
    const f=window.AdminDashboardFormatters, c=window.AdminDashboardComponents;
    const i=data.invitaciones, a=data.asistencia, p=data.porcentajes;
    const definitions=[
      ["Invitaciones activas",i.activas,"Total vigente"], ["Con respuesta",i.con_respuesta,"Confirmaciones recibidas"],
      ["Pendientes",i.pendientes,"Sin respuesta","attention"], ["Asistiran",i.asistiran,"Invitaciones confirmadas","positive"],
      ["No asistiran",i.no_asistiran,"Invitaciones declinadas"], ["Adultos confirmados",a.adultos_confirmados,"Asistencia vigente"],
      ["Ninos confirmados",a.ninos_confirmados,"Asistencia vigente"], ["Total asistentes",a.total_confirmado,"Adultos y ninos","positive"],
      ["Porcentaje de respuesta",f.formatPercent(p.respuesta),"Sobre invitaciones activas"], ["Porcentaje de ocupacion",f.formatPercent(p.ocupacion),"Sobre cupo reservado"],
    ];
    const grid=document.createElement("div"); grid.className="dashboard-kpi-grid";
    definitions.forEach(([label,value,detail,tone])=>grid.append(c.kpiCard({label,value:typeof value==="string"?value:f.formatNumber(value),detail,tone})));
    target.replaceChildren(grid);
  }

  window.AdminViews.dashboard = () => {
    const root=document.createElement("section"); root.className="dashboard-view";
    const header=document.createElement("header"); header.className="dashboard-heading";
    const titleWrap=document.createElement("div"); const eyebrow=document.createElement("p"); eyebrow.className="admin-eyebrow"; eyebrow.textContent="Resumen";
    const title=document.createElement("h2"); title.textContent="Dashboard";
    const updated=document.createElement("p"); updated.className="dashboard-updated";
    titleWrap.append(eyebrow,title,updated);
    const refresh=document.createElement("button"); refresh.className="admin-button dashboard-refresh"; refresh.type="button"; refresh.textContent="Actualizar";
    header.append(titleWrap,refresh);
    const globalStatus=document.createElement("div"); globalStatus.className="dashboard-global-status"; globalStatus.setAttribute("aria-live","polite");
    const kpis=section("Indicadores principales","dashboard-panel-kpis");
    const recent=section("Confirmaciones recientes","dashboard-panel-recent");
    const groups=section("Estadisticas por grupo","dashboard-panel-groups");
    const evolution=section("Evolucion de los ultimos 30 dias","dashboard-panel-evolution");
    const layout=document.createElement("div"); layout.className="dashboard-layout"; layout.append(recent.card,groups.card,evolution.card);
    root.append(header,globalStatus,kpis.card,layout);

    const feedback=window.AdminDashboardComponents.feedback;
    const showLoading=(body)=>{if(!body.childElementCount)body.replaceChildren(feedback("loading","Cargando informacion..."));};
    const removeSectionError=(body)=>body.querySelector("[data-dashboard-section-error]")?.remove();
    const showSectionError=(body,message,hasPreviousData)=>{
      removeSectionError(body);
      const notice=feedback("error",hasPreviousData?`${message} Se conservan los datos anteriores.`:message);
      notice.dataset.dashboardSectionError="true";
      if(hasPreviousData)body.prepend(notice);else body.replaceChildren(notice);
    };
    const safeRender=(key,body,renderer,payload,message)=>{
      try {
        removeSectionError(body);
        renderer(payload);
        state[key]=key==="summary"?payload.data:payload.data.items;
        state.generatedAt=payload.generated_at;
        return true;
      } catch(error) {
        console.error(`Dashboard render ${key}:`,error);
        showSectionError(body,message,Boolean(state[key]));
        return false;
      }
    };
    const renderStored=()=>{
      updated.textContent=state.generatedAt?`Ultima actualizacion: ${window.AdminDashboardFormatters.formatDateTime(state.generatedAt)}`:"Aun no se ha actualizado";
      const stored=[
        ["summary",kpis.body,()=>renderKpis(kpis.body,state.summary),"No fue posible mostrar los indicadores."],
        ["recent",recent.body,()=>recent.body.replaceChildren(window.AdminDashboardComponents.recentConfirmations(state.recent)),"No fue posible mostrar las confirmaciones recientes."],
        ["groups",groups.body,()=>groups.body.replaceChildren(window.AdminDashboardComponents.groupStatistics(state.groups)),"No fue posible mostrar las estadisticas por grupo."],
        ["evolution",evolution.body,()=>evolution.body.replaceChildren(window.AdminDashboardComponents.evolutionChart(state.evolution)),"No fue posible mostrar la evolucion."],
      ];
      stored.forEach(([key,body,renderer,message])=>{
        if(!state[key])return;
        try{renderer();}catch(error){console.error(`Dashboard stored render ${key}:`,error);showSectionError(body,message,false);}
      });
    };

    async function load(manual=false) {
      refresh.disabled=true; refresh.textContent=manual?"Actualizando...":"Cargando...";
      root.classList.toggle("is-refreshing",manual); globalStatus.replaceChildren();
      [kpis.body,recent.body,groups.body,evolution.body].forEach(showLoading);
      let errors=0;
      try {
        const service=window.AdminDashboardService;
        const results=await Promise.allSettled([service.getSummary(),service.getRecentConfirmations(),service.getGroupStatistics(),service.getEvolution()]);
        if(!root.isConnected)return;
        const configs=[
          ["summary",kpis.body,(payload)=>renderKpis(kpis.body,payload.data),"No fue posible cargar los indicadores."],
          ["recent",recent.body,(payload)=>recent.body.replaceChildren(window.AdminDashboardComponents.recentConfirmations(payload.data.items)),"No fue posible cargar las confirmaciones recientes."],
          ["groups",groups.body,(payload)=>groups.body.replaceChildren(window.AdminDashboardComponents.groupStatistics(payload.data.items)),"No fue posible cargar las estadisticas por grupo."],
          ["evolution",evolution.body,(payload)=>evolution.body.replaceChildren(window.AdminDashboardComponents.evolutionChart(payload.data.items)),"No fue posible cargar la evolucion."],
        ];
        results.forEach((result,index)=>{
          const [key,body,renderer,message]=configs[index];
          if(result.status==="fulfilled"){
            if(!safeRender(key,body,renderer,result.value,message))errors+=1;
          }else{
            errors+=1;
            console.error(`Dashboard request ${key}:`,result.reason);
            showSectionError(body,message,Boolean(state[key]));
          }
        });
        updated.textContent=state.generatedAt?`Ultima actualizacion: ${window.AdminDashboardFormatters.formatDateTime(state.generatedAt)}`:"Actualizacion incompleta";
        if(errors)globalStatus.replaceChildren(feedback("error",`${errors} seccion${errors===1?"":"es"} no pudo${errors===1?"":"ieron"} actualizarse.`));else if(manual)globalStatus.replaceChildren(feedback("success","Dashboard actualizado correctamente."));
      } catch(error) {
        console.error("Dashboard update:",error);
        globalStatus.replaceChildren(feedback("error","No fue posible actualizar el Dashboard."));
      } finally {
        refresh.disabled=false; refresh.textContent="Actualizar"; root.classList.remove("is-refreshing");
      }
    }
    refresh.addEventListener("click",()=>{if(!refresh.disabled)load(true);}); renderStored(); queueMicrotask(()=>load(false)); return root;
  };
})();
