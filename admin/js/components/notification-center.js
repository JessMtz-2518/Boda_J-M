(()=>{"use strict";

const DAY=86400000;
const WEDDING_DATE="2027-05-01";
const ESSENTIAL_LEAD_DAYS=Object.freeze({
  "Lugar y ceremonia":300,
  "Recepción":240,
  "Foto y recuerdos":240,
  "Novia":240,
  "Novio":180,
  "Cortejo y familia":180,
  "Invitados":150,
  "Detalles finales":90
});

function dateOnly(value){
  if(!value)return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null;
}
function daysFromToday(value){
  const d=dateOnly(value);
  if(!d)return null;
  const t=new Date();t.setHours(0,0,0,0);
  return Math.round((d.getTime()-t.getTime())/DAY);
}
function money(value){
  return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0})
    .format(Number(value)||0);
}
function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function priorityMeta(score){
  if(score>=95)return{label:"Urgente",level:"urgent"};
  if(score>=75)return{label:"Prioridad alta",level:"high"};
  if(score>=50)return{label:"Próximo",level:"upcoming"};
  return{label:"Más adelante",level:"later"};
}

function essentialPriority(item){
  if(!item||["listo","contratado","no_aplica"].includes(item.estado))return null;

  if(
    item.estado==="elegido" &&
    item.proveedor_no_aplica===true &&
    item.planeacion_no_aplica===true
  ) return null;

  const taskDays=daysFromToday(item.tarea_fecha_limite);
  if(taskDays!==null && item.tarea_estado && !["completada","cancelada"].includes(item.tarea_estado)){
    if(taskDays<0)return{score:100,reason:`Tarea vencida hace ${Math.abs(taskDays)} días`};
    if(taskDays<=7)return{score:95,reason:taskDays===0?"La tarea vence hoy":`La tarea vence en ${taskDays} días`};
    if(taskDays<=30)return{score:85,reason:`La tarea vence en ${taskDays} días`};
  }

  const weddingDays=daysFromToday(WEDDING_DATE);
  const lead=ESSENTIAL_LEAD_DAYS[item.categoria]||120;
  const dueWindow=weddingDays===null?null:weddingDays-lead;

  if(item.estado==="por_definir"){
    if(dueWindow!==null&&dueWindow<=0)return{score:82,reason:"Conviene definirlo desde ahora por su anticipación recomendada"};
    if(dueWindow!==null&&dueWindow<=45)return{score:68,reason:`Conviene atenderlos en los próximos ${Math.max(0,dueWindow)} días`};
    return{score:30,reason:"Todavía puede esperar, pero sigue pendiente"};
  }

  if(["buscando","elegido"].includes(item.estado)){
    if(dueWindow!==null&&dueWindow<=30){
      return{score:72,reason:item.estado==="elegido"?"Ya está elegido; falta asegurar el cierre":"Ya está en búsqueda y conviene darle seguimiento"};
    }
    return{score:48,reason:"Ya está en seguimiento"};
  }

  return{score:25,reason:"Pendiente de seguimiento"};
}

function build(finance,planner,contracts,essentials,operational,godparents){
  const items=[];
  const add=(score,type,title,detail,hash)=>items.push({
    score,
    ...priorityMeta(score),
    type,
    title,
    detail,
    hash
  });

  // PAGOS
  if(finance){
    const openPayments=(finance.payments||[])
      .filter(p=>!["pagado","cancelado"].includes(p.status))
      .map(p=>({...p,days:daysFromToday(p.dueDate)}))
      .filter(p=>p.days!==null);

    openPayments
      .filter(p=>p.displayStatus==="vencido"||p.days<0)
      .forEach(p=>add(
        100,"Pago",p.concept||"Pago vencido",
        `${p.vendorName||"Sin proveedor"} · ${money(p.amount)} · vencido`,
        "#/presupuesto"
      ));

    openPayments
      .filter(p=>p.days>=0&&p.days<=30)
      .forEach(p=>add(
        p.days<=7?95:78,
        "Pago",
        p.concept||"Próximo pago",
        `${p.vendorName||"Sin proveedor"} · ${money(p.amount)} · ${p.days===0?"vence hoy":p.days===1?"vence mañana":`vence en ${p.days} días`}`,
        "#/presupuesto"
      ));
  }

  // PLANEACIÓN, evitando duplicar tareas que ya están representadas por un Esencial.
  if(planner){
    const linkedTaskIds=new Set(
      (essentials?.items||[])
        .filter(essential=>{
          const result=essentialPriority(essential);
          return Number.isInteger(Number(essential.tarea_id))&&result&&result.score>=50;
        })
        .map(essential=>Number(essential.tarea_id))
    );

    (planner.tasks||[])
      .filter(t=>!["completada","cancelada"].includes(t.status))
      .filter(t=>!linkedTaskIds.has(Number(t.id)))
      .map(t=>({...t,days:daysFromToday(t.dueDate)}))
      .filter(t=>t.days!==null&&t.days<=30)
      .forEach(t=>{
        const score=t.days<0?100:t.days<=7?94:76;
        add(
          score,
          "Tarea",
          t.title,
          `${t.category||"General"} · ${t.responsible||"Sin responsable"} · ${t.days<0?`vencida hace ${Math.abs(t.days)} días`:t.days===0?"vence hoy":`vence en ${t.days} días`}`,
          "#/planeacion"
        );
      });
  }

  // CONTRATOS
  // Firma: 1–5 días / hoy / vencida = Urgente; 6–14 días = Prioridad alta.
  // Más de 14 días no genera alerta de firma. "Sin contrato" queda como Próximo.
  (contracts?.contracts||[]).forEach(c=>{
    if(c.status==="firmado"||c.status==="no_requiere")return;

    if(["en_revision","por_firmar"].includes(c.status)){
      const d=daysFromToday(c.signatureDueDate);

      if(d!==null&&d<=5){
        const detail=d<0
          ?`Firma vencida hace ${Math.abs(d)} días`
          :d===0
            ?"La firma vence hoy"
            :`La firma vence en ${d} días`;

        add(97,"Contrato",c.vendorName||"Proveedor",detail,"#/contratos");
        return;
      }

      if(d!==null&&d>=6&&d<=14){
        add(84,"Contrato",c.vendorName||"Proveedor",`La firma vence en ${d} días`,"#/contratos");
        return;
      }
    }

    if(c.status==="sin_contrato"){
      add(56,"Contrato",c.vendorName||"Proveedor","Proveedor activo sin contrato definido","#/contratos");
    }
  });

  // ESENCIALES: Padrinos confirmados indican cobertura/responsabilidad,
  // pero NO resuelven la compra, el estado ni las tareas del Esencial.
  if(essentials?.items){
    const confirmedLinkedEssentials=new Set(
      (godparents?.items||[])
        .filter(item=>item.estado==="confirmado"&&item.esencial_id)
        .map(item=>Number(item.esencial_id))
    );

    essentials.items.forEach(essential=>{
      const result=essentialPriority(essential);
      if(!result||result.score<50)return;

      const links=[essential.categoria,result.reason];
      const coveredByGodparents=confirmedLinkedEssentials.has(Number(essential.id));

      if(coveredByGodparents){
        links.push("cubierto por padrinos");
      }else if(!essential.proveedor_id&&!essential.proveedor_no_aplica&&essential.estado!=="listo"){
        links.push("sin proveedor vinculado");
      }
      if(!essential.tarea_id&&essential.planeacion_no_aplica){
        links.push("Planeación: no aplica");
      }

      items.push({
        score:result.score,
        ...priorityMeta(result.score),
        type:"Esencial",
        title:essential.titulo,
        detail:links.join(" · "),
        hash:"#/esenciales",
        kind:"Esencial"
      });
    });
  }

  // PADRINOS: próximos agrupados; sólo se separan al escalar a alta/urgente.
  if(godparents?.summary){
    const pendingItems=(godparents.items||[]).filter(
      item=>item.estado==="por_definir"&&item.activo!==false
    );

    if(pendingItems.length){
      const dated=pendingItems
        .filter(item=>item.fecha_objetivo)
        .map(item=>({...item,days:daysFromToday(item.fecha_objetivo)}))
        .filter(item=>item.days!==null)
        .sort((a,b)=>a.days-b.days);

      const urgent=dated.filter(item=>item.days<=0);
      const high=dated.filter(item=>item.days>0&&item.days<=14);
      const upcomingDated=dated.filter(item=>item.days>14);
      const undated=pendingItems.filter(item=>!item.fecha_objetivo);

      urgent.forEach(item=>{
        const timing=item.days===0?"La fecha objetivo es hoy":`La fecha objetivo venció hace ${Math.abs(item.days)} días`;
        add(98,"Padrinos",`${item.tipo} pendiente por definir`,`${timing}. Conviene resolverlo cuanto antes.`,"#/padrinos");
      });

      high.forEach(item=>add(
        84,
        "Padrinos",
        `${item.tipo} pendiente por definir`,
        `Fecha objetivo en ${item.days} días. Conviene avisarles con anticipación para que contemplen su participación y el gasto correspondiente.`,
        "#/padrinos"
      ));

      const upcomingCount=upcomingDated.length+undated.length;
      if(upcomingCount>0){
        const parts=[];
        if(upcomingDated.length)parts.push(`${upcomingDated.length} ${upcomingDated.length === 1 ? "padrino con fecha objetivo" : "padrinos con fecha objetivo"}`);
        if(undated.length)parts.push(`${undated.length} sin fecha objetivo`);

        let nextText="";
        if(upcomingDated.length){
          const next=upcomingDated[0];
          const nextDate=new Date(`${next.fecha_objetivo}T12:00:00`);
          const formatted=new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",year:"numeric"}).format(nextDate);
          nextText=` Próxima fecha: ${next.tipo} · ${formatted}.`;
        }

        const confirmedWithoutCommitmentDate=(godparents.items||[]).filter(
          item=>
            item.estado==="confirmado" &&
            item.activo!==false &&
            (item.cumplimiento_estado||"pendiente")!=="entregado" &&
            !item.fecha_compromiso
        ).length;

        const commitmentNote=confirmedWithoutCommitmentDate>0
          ?` · ${confirmedWithoutCommitmentDate} ${confirmedWithoutCommitmentDate===1?"compromiso confirmado sin fecha de entrega":"compromisos confirmados sin fecha de entrega"}`
          :"";

        add(
          58,
          "Padrinos",
          `${upcomingCount} ${upcomingCount===1?"padrino pendiente por definir":"padrinos pendientes por definir"}`,
          `${parts.join(" · ")}${commitmentNote}.${nextText} Conviene avisarles con anticipación para que contemplen su participación y el gasto correspondiente.`,
          "#/padrinos"
        );
      }
    }
  }


  // CUMPLIMIENTO DE PADRINOS CONFIRMADOS
  if(godparents?.summary){
    const confirmedFulfillment=(godparents.items||[]).filter(
      item=>
        item.estado==="confirmado" &&
        item.activo!==false &&
        (item.cumplimiento_estado||"pendiente")!=="entregado"
    );

    const datedFulfillment=confirmedFulfillment
      .filter(item=>item.fecha_compromiso)
      .map(item=>({...item,commitmentDays:daysFromToday(item.fecha_compromiso)}))
      .filter(item=>item.commitmentDays!==null)
      .sort((a,b)=>a.commitmentDays-b.commitmentDays);

    const fulfillmentUrgent=datedFulfillment.filter(item=>item.commitmentDays<=5);
    const fulfillmentHigh=datedFulfillment.filter(item=>item.commitmentDays>5&&item.commitmentDays<=14);
    const fulfillmentUpcoming=datedFulfillment.filter(item=>item.commitmentDays>14);
    const fulfillmentUndated=confirmedFulfillment.filter(item=>!item.fecha_compromiso);

    fulfillmentUrgent.forEach(item=>{
      const statusText=(item.cumplimiento_estado||"pendiente")==="en_proceso"?"sigue en proceso":"sigue pendiente";
      const timing=item.commitmentDays<0
        ?`El compromiso venció hace ${Math.abs(item.commitmentDays)} días`
        :item.commitmentDays===0
          ?"El compromiso vence hoy"
          :`El compromiso vence en ${item.commitmentDays} días`;

      add(
        99,
        "Padrinos",
        `${item.tipo} · compromiso ${statusText}`,
        `${timing}. Revisa el seguimiento con ${item.nombres_padrinos||"los padrinos"}.`,
        "#/padrinos"
      );
    });

    fulfillmentHigh.forEach(item=>{
      add(
        86,
        "Padrinos",
        `${item.tipo} · compromiso próximo`,
        `Entrega/compromiso en ${item.commitmentDays} días · ${
          item.cumplimiento_estado==="en_proceso"?"En proceso":"Pendiente"
        } · ${item.nombres_padrinos||"Padrinos por confirmar"}.`,
        "#/padrinos"
      );
    });

    // La fecha de compromiso es opcional:
    // sólo los compromisos que sí tienen fecha generan Próximos/Alta/Urgente.
    const fulfillmentUpcomingCount=fulfillmentUpcoming.length;
    if(fulfillmentUpcomingCount>0){
      const next=fulfillmentUpcoming[0];
      const nextDate=new Date(`${next.fecha_compromiso}T12:00:00`);
      const formatted=new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",year:"numeric"}).format(nextDate);

      add(
        57,
        "Padrinos",
        `${fulfillmentUpcomingCount} ${
          fulfillmentUpcomingCount===1
            ?"compromiso de padrinos por completar"
            :"compromisos de padrinos por completar"
        }`,
        `Próximo compromiso: ${next.tipo} · ${formatted}.`,
        "#/padrinos"
      );
    }
  }

  // OPERACIÓN: sin fecha límite => Próximos, no Prioridad alta.
  const ind=operational?.data?.indicadores;
  if(ind){
    const pendientesMesa=Number(ind.pendientes_mesa||0);
    if(pendientesMesa>0){
      add(
        55,
        "Invitados",
        `${pendientesMesa} personas confirmadas sin mesa`,
        "Completa la distribución de asistentes confirmados.",
        "#/mesas"
      );
    }

    const pendientesInv=Number(ind.invitaciones_pendientes||0);
    if(pendientesInv>0){
      items.push({
        score:42,
        ...priorityMeta(42),
        type:"Invitados",
        title:`${pendientesInv} invitaciones sin respuesta`,
        detail:"Conviene mantener seguimiento a las confirmaciones.",
        hash:"#/invitados"
      });
    }
  }

  // Agrupar Esenciales por nivel igual que el Dashboard.
  const tier=score=>score>=95?"urgent":score>=75?"high":score>=50?"upcoming":"later";
  const groups=new Map();

  items.forEach(item=>{
    if(item.kind!=="Esencial"||item.score<50)return;
    const t=tier(item.score);
    if(!groups.has(t))groups.set(t,[]);
    groups.get(t).push(item);
  });

  groups.forEach(groupItems=>{
    if(groupItems.length<2)return;

    groupItems.forEach(item=>{
      const i=items.indexOf(item);
      if(i>=0)items.splice(i,1);
    });

    const maxScore=Math.max(...groupItems.map(item=>item.score));
    const reasons=[...new Set(groupItems.map(item=>{
      const parts=String(item.detail||"").split(" · ");
      return parts.length>1?parts[1]:"";
    }).filter(Boolean))];

    let summary=`${groupItems.length} pendientes de proveedor o definición`;
    if(reasons.length===1)summary=`${reasons[0]}. ${summary}`;
    else if(reasons.length>1)summary=`${summary}. ${reasons.join(" · ")}`;

    items.push({
      score:maxScore,
      ...priorityMeta(maxScore),
      type:"Esenciales",
      title:`${groupItems.length} esenciales por atender`,
      detail:summary,
      hash:"#/esenciales"
    });
  });

  return items
    .filter(item=>item.score>=50)
    .sort((a,b)=>b.score-a.score);
}

function requiredServicesReady(){
  return Boolean(
    window.AdminFinanceService?.getSummary &&
    window.AdminPlannerService?.getSummary &&
    window.AdminContractsService?.getSummary &&
    window.AdminEssentialsService?.getSummary &&
    window.AdminDashboardService?.getOperational &&
    window.AdminGodparentsService?.getSummary
  );
}

async function load(){
  if(!requiredServicesReady())throw new Error("SERVICIOS_ALERTAS_NO_LISTOS");

  const results=await Promise.allSettled([
    window.AdminFinanceService.getSummary(),
    window.AdminPlannerService.getSummary(),
    window.AdminContractsService.getSummary(),
    window.AdminEssentialsService.getSummary(),
    window.AdminDashboardService.getOperational(),
    window.AdminGodparentsService.getSummary()
  ]);

  const failed=results.filter(r=>r.status==="rejected");
  if(failed.length){
    const error=new Error("ALERTAS_CARGA_INCOMPLETA");
    error.causes=failed.map(r=>r.reason);
    throw error;
  }

  return build(...results.map(r=>r.value));
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

  let loaded=false;
  let refreshing=null;

  function close(){
    drawer.hidden=true;
    btn.setAttribute("aria-expanded","false");
  }

  function renderLoading(){
    summary.innerHTML='<span><b>—</b> urgentes</span><span><b>—</b> prioridad alta</span><span><b>—</b> próximos</span>';
    list.innerHTML='<p class="admin-notification-empty">Cargando alertas…</p>';
  }

  function render(items){
    loaded=true;

    const urgent=items.filter(x=>x.level==="urgent").length;
    const high=items.filter(x=>x.level==="high").length;
    const upcoming=items.filter(x=>x.level==="upcoming").length;

    const totalAlerts=urgent+high+upcoming;
    badge.textContent=String(totalAlerts);
    badge.hidden=!totalAlerts;

    summary.innerHTML=`<span><b>${urgent}</b> urgentes</span><span><b>${high}</b> prioridad alta</span><span><b>${upcoming}</b> próximos</span>`;

    if(!items.length){
      list.innerHTML='<p class="admin-notification-empty">Todo en orden. No hay alertas que requieran atención.</p>';
    }else{
      list.innerHTML=items
        .map(x=>`<a class="admin-notification-item is-${x.level}" href="${x.hash}">
          <div>
            <span>${esc(x.type)}</span>
            <strong>${esc(x.title)}</strong>
            <p>${esc(x.detail)}</p>
          </div>
          <b>→</b>
        </a>`)
        .join("");
    }

    list.querySelectorAll("a").forEach(a=>a.addEventListener("click",close));
  }

  function renderError(){
    list.innerHTML='<p class="admin-notification-empty">No fue posible consultar todas las alertas. Toca la campana para intentar nuevamente.</p>';
  }

  async function refresh({loading=true}={}){
    if(refreshing)return refreshing;
    if(loading)renderLoading();

    refreshing=(async()=>{
      try{
        const items=await load();
        render(items);
        return items;
      }catch(e){
        console.error("Centro de alertas:",e,e?.causes||"");
        if(!loaded)badge.hidden=true;
        renderError();
        throw e;
      }finally{
        refreshing=null;
      }
    })();

    return refreshing;
  }

  wrap.querySelector("#adminNotificationClose").onclick=close;

  btn.onclick=async()=>{
    const opening=drawer.hidden;
    drawer.hidden=!drawer.hidden;
    btn.setAttribute("aria-expanded",String(!drawer.hidden));
    if(opening){
      try{await refresh({loading:!loaded});}catch(_){}
    }
  };

  document.addEventListener("click",e=>{
    if(!drawer.hidden&&!wrap.contains(e.target))close();
  });

  window.addEventListener("admin:access-ready",()=>{refresh({loading:true}).catch(()=>{});});
  window.addEventListener("admin:alerts-refresh",()=>{refresh({loading:!loaded}).catch(()=>{});});
  window.addEventListener("hashchange",()=>setTimeout(()=>refresh({loading:false}).catch(()=>{}),300));
  window.addEventListener("focus",()=>refresh({loading:false}).catch(()=>{}));

  if(!document.querySelector("#adminShell")?.hidden){
    refresh({loading:true}).catch(()=>{});
  }else{
    renderLoading();
  }
}

window.AdminNotificationCenter=Object.freeze({init,build});
window.addEventListener("load",()=>setTimeout(init,0));
})();