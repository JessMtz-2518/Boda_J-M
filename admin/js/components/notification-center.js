(()=>{"use strict";
const DAY=86400000;
function dateOnly(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||""));return m?new Date(+m[1],+m[2]-1,+m[3]):null}
function days(v){const d=dateOnly(v);if(!d)return null;const t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/DAY)}
function money(v){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(Number(v)||0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function level(score){return score>=95?"urgent":score>=75?"high":"upcoming"}

function build(finance,planner,contracts,essentials,operational){
  const a=[];
  const add=(score,type,title,detail,hash)=>a.push({score,level:level(score),type,title,detail,hash});

  (finance?.payments||[]).filter(p=>!["pagado","cancelado"].includes(p.status)).forEach(p=>{
    const d=days(p.dueDate);if(d===null||d>30)return;
    if(d<0)add(100,"Pago",p.concept||"Pago vencido",`${p.vendorName||"Sin proveedor"} · ${money(p.amount)} · vencido hace ${Math.abs(d)} día${Math.abs(d)===1?"":"s"}`,"#/presupuesto");
    else add(d<=7?96:80,"Pago",p.concept||"Próximo pago",`${p.vendorName||"Sin proveedor"} · ${money(p.amount)} · ${d===0?"vence hoy":d===1?"vence mañana":`vence en ${d} días`}`,"#/presupuesto")
  });

  const linkedTaskIds=new Set(
    (essentials?.items||[])
      .filter(i=>{
        const d=days(i.tarea_fecha_limite);
        return i.tarea_id&&d!==null&&d<=7&&!["listo","contratado","no_aplica"].includes(i.estado)
      })
      .map(i=>Number(i.tarea_id))
  );

  (planner?.tasks||[])
    .filter(t=>!["completada","cancelada"].includes(t.status))
    .filter(t=>!linkedTaskIds.has(Number(t.id)))
    .forEach(t=>{
      const d=days(t.dueDate);if(d===null||d>30)return;
      add(d<0?100:d<=7?94:76,"Tarea",t.title,`${t.category||"General"} · ${t.responsible||"Sin responsable"} · ${d<0?`vencida hace ${Math.abs(d)} días`:d===0?"vence hoy":`vence en ${d} días`}`,"#/planeacion")
    });

  (contracts?.contracts||[]).forEach(c=>{
    if(c.status==="firmado"||c.status==="no_requiere")return;
    const d=days(c.signatureDueDate);
    if(d!==null&&d<=30)add(d<0?100:d<=7?93:78,"Contrato",c.vendorName||"Proveedor",d<0?`Firma vencida hace ${Math.abs(d)} días`:`Firma prevista ${d===0?"para hoy":`en ${d} días`}`,"#/contratos");
    else if(c.status==="sin_contrato")add(75,"Contrato",c.vendorName||"Proveedor","Proveedor activo sin contrato definido","#/contratos")
  });

  (essentials?.items||[]).forEach(i=>{
    if(["listo","contratado","no_aplica"].includes(i.estado))return;
    const d=days(i.tarea_fecha_limite);
    if(d!==null&&d<=7)add(d<0?100:95,"Esencial",i.titulo,`${i.categoria} · ${d<0?`tarea vencida hace ${Math.abs(d)} días`:d===0?"tarea vence hoy":`tarea vence en ${d} días`}${!i.proveedor_id?" · sin proveedor":""}`,"#/esenciales")
  });

  const pendientesMesa=Number(operational?.data?.indicadores?.pendientes_mesa||0);
  if(pendientesMesa>0){
    add(82,"Mesas",`${pendientesMesa} asistente${pendientesMesa===1?"":"s"} pendiente${pendientesMesa===1?"":"s"} de mesa`,`Hay ${pendientesMesa} asistente${pendientesMesa===1?" confirmado":"s confirmados"} por asignar a una mesa.`,"#/mesas")
  }

  return a.sort((x,y)=>y.score-x.score)
}

function requiredServicesReady(){
  return Boolean(
    window.AdminFinanceService?.getSummary &&
    window.AdminPlannerService?.getSummary &&
    window.AdminContractsService?.getSummary &&
    window.AdminEssentialsService?.getSummary &&
    window.AdminDashboardService?.getOperational
  )
}

async function load(){
  if(!requiredServicesReady())throw new Error("SERVICIOS_ALERTAS_NO_LISTOS");
  const calls=[
    window.AdminFinanceService.getSummary(),
    window.AdminPlannerService.getSummary(),
    window.AdminContractsService.getSummary(),
    window.AdminEssentialsService.getSummary(),
    window.AdminDashboardService.getOperational()
  ];
  const results=await Promise.allSettled(calls);
  const failed=results.filter(r=>r.status==="rejected");
  if(failed.length){
    const error=new Error("ALERTAS_CARGA_INCOMPLETA");
    error.causes=failed.map(r=>r.reason);
    throw error
  }
  return build(...results.map(r=>r.value))
}

function init(){
  const session=document.querySelector(".admin-session");
  if(!session||document.getElementById("adminNotificationButton"))return;

  const wrap=document.createElement("div");
  wrap.className="admin-notification-wrap";
  wrap.innerHTML='<button class="admin-notification-button" id="adminNotificationButton" type="button" aria-label="Abrir alertas" aria-expanded="false"><span class="admin-notification-icon" aria-hidden="true">🔔</span><b class="admin-notification-badge" id="adminNotificationBadge" hidden>0</b></button><aside class="admin-notification-drawer" id="adminNotificationDrawer" hidden><header><div><span>WEDDING COMMAND CENTER</span><h2>Alertas</h2></div><button type="button" id="adminNotificationClose" aria-label="Cerrar">×</button></header><div class="admin-notification-summary" id="adminNotificationSummary"></div><div class="admin-notification-list" id="adminNotificationList"><p class="admin-notification-empty">Cargando alertas…</p></div></aside>';

  session.parentNode.insertBefore(wrap,session);

  const btn=wrap.querySelector("#adminNotificationButton");
  const drawer=wrap.querySelector("#adminNotificationDrawer");
  const badge=wrap.querySelector("#adminNotificationBadge");
  const list=wrap.querySelector("#adminNotificationList");
  const summary=wrap.querySelector("#adminNotificationSummary");

  let currentItems=[];
  let loaded=false;
  let refreshing=null;

  function close(){drawer.hidden=true;btn.setAttribute("aria-expanded","false")}

  function renderLoading(){
    summary.innerHTML='<span><b>—</b> urgentes</span><span><b>—</b> prioridad alta</span><span><b>—</b> próximos</span>';
    list.innerHTML='<p class="admin-notification-empty">Cargando alertas…</p>'
  }

  function render(items){
    currentItems=items;
    loaded=true;
    const actionable=items.filter(x=>x.score>=75).length;
    badge.textContent=String(actionable);
    badge.hidden=!actionable;
    summary.innerHTML=`<span><b>${items.filter(x=>x.level==="urgent").length}</b> urgentes</span><span><b>${items.filter(x=>x.level==="high").length}</b> prioridad alta</span><span><b>${items.filter(x=>x.level==="upcoming").length}</b> próximos</span>`;
    list.innerHTML=items.length
      ?items.map(x=>`<a class="admin-notification-item is-${x.level}" href="${x.hash}"><div><span>${esc(x.type)} · ${x.level==="urgent"?"Urgente":x.level==="high"?"Prioridad alta":"Próximo"}</span><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div><b>→</b></a>`).join("")
      :'<p class="admin-notification-empty">Todo en orden. No hay alertas que requieran atención.</p>';
    list.querySelectorAll("a").forEach(a=>a.addEventListener("click",close))
  }

  function renderError(){
    list.innerHTML='<p class="admin-notification-empty">No fue posible consultar todas las alertas. Toca la campana para intentar nuevamente.</p>'
  }

  async function refresh({loading=true}={}){
    if(refreshing)return refreshing;
    if(loading)renderLoading();

    refreshing=(async()=>{
      try{
        const items=await load();
        render(items);
        return items
      }catch(e){
        console.error("Centro de alertas:",e,e?.causes||"");
        if(!loaded)badge.hidden=true;
        renderError();
        throw e
      }finally{
        refreshing=null
      }
    })();

    return refreshing
  }

  wrap.querySelector("#adminNotificationClose").onclick=close;

  btn.onclick=async()=>{
    const opening=drawer.hidden;
    drawer.hidden=!drawer.hidden;
    btn.setAttribute("aria-expanded",String(!drawer.hidden));
    if(opening){
      try{await refresh({loading:!loaded})}catch(_){}
    }
  };

  document.addEventListener("click",e=>{if(!drawer.hidden&&!wrap.contains(e.target))close()});

  window.addEventListener("admin:access-ready",()=>{refresh({loading:true}).catch(()=>{})});
  window.addEventListener("admin:alerts-refresh",()=>{refresh({loading:!loaded}).catch(()=>{})});
  window.addEventListener("hashchange",()=>setTimeout(()=>refresh({loading:false}).catch(()=>{}),300));
  window.addEventListener("focus",()=>refresh({loading:false}).catch(()=>{}));

  // Si la sesión ya quedó autorizada antes de que este componente terminara de inicializar.
  if(!document.querySelector("#adminShell")?.hidden){
    refresh({loading:true}).catch(()=>{})
  }else{
    renderLoading()
  }
}

window.AdminNotificationCenter=Object.freeze({init});
window.addEventListener("load",()=>setTimeout(init,0));
})();