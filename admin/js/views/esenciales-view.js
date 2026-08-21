(()=>{"use strict";
const labels={por_definir:"Por definir",buscando:"Buscando",elegido:"Elegido",contratado:"Contratado",listo:"Listo",no_aplica:"No aplica"};
const order=["por_definir","buscando","elegido","contratado","listo","no_aplica"];
function el(t,c,x){const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n}
function button(text,primary=false){const b=el("button",primary?"admin-button":"admin-button admin-button-secondary",text);b.type="button";return b}
function metric(k,v,s){const a=el("article","essential-metric");a.append(el("span","essential-metric-label",k),el("strong","essential-metric-value",String(v)),el("small","essential-metric-copy",s));return a}
function option(value,text,selected=false){const o=document.createElement("option");o.value=value;o.textContent=text;o.selected=selected;return o}
function dateMx(value){if(!value)return"";const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"short",year:"numeric"}).format(d)}
function categoryNames(data){
  const names=new Map();
  (data?.items||[]).forEach(i=>{const n=String(i.categoria||"").trim();if(n)names.set(n.toLowerCase(),n)});
  (data?.secciones||[]).forEach(s=>{const n=String(s.nombre||"").trim();if(n)names.set(n.toLowerCase(),n)});
  return [...names.values()].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}))
}
function sectionByName(data,name){
  return (data?.secciones||[]).find(s=>String(s.nombre||"").trim().toLowerCase()===String(name||"").trim().toLowerCase())||{id:null,nombre:name,es_personalizada:false}
}
function openEditSectionModal(section,reload){
  const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal essential-section-modal");
  const head=el("header","essential-modal-head"),copy=el("div");
  copy.append(el("p","admin-eyebrow","CHECKLIST PERSONALIZADO"),el("h2","","Editar sección"));
  const close=button("Cerrar");head.append(copy,close);
  const form=document.createElement("form");form.className="essential-modal-form";
  const name=document.createElement("input");name.required=true;name.maxLength=80;name.value=section.nombre||"";
  const f=el("label","essential-modal-field essential-modal-field-wide");f.append(el("span","","Nombre de la sección *"),name);
  const help=el("p","essential-section-help","Puedes renombrar cualquier sección. Todos los esenciales que pertenezcan a ella se moverán automáticamente al nuevo nombre.");
  const msg=el("p","essential-modal-status","");
  const actions=el("div","essential-modal-actions"),cancel=button("Cancelar"),save=button("Guardar cambios",true);save.type="submit";actions.append(cancel,save);
  form.append(f,help,msg,actions);modal.append(head,form);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
  function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")}
  close.onclick=dismiss;cancel.onclick=dismiss;
  form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;msg.textContent="Guardando…";try{await window.AdminEssentialsService.editSection(section.nombre,name.value);dismiss();await reload()}catch(err){msg.textContent=err.message||"No se pudo editar la sección.";save.disabled=false}});
  setTimeout(()=>{name.focus();name.select()},0)
}
function openEditEssentialModal(item,data,reload){
  const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal");
  const head=el("header","essential-modal-head"),copy=el("div");
  copy.append(el("p","admin-eyebrow","CHECKLIST PERSONALIZADO"),el("h2","","Editar esencial"));
  const close=button("Cerrar");head.append(copy,close);
  const form=document.createElement("form");form.className="essential-modal-form";
  const title=document.createElement("input");title.required=true;title.maxLength=180;title.value=item.titulo||"";
  const category=document.createElement("select");category.required=true;
  categoryNames(data).forEach(name=>category.append(option(name,name,name===item.categoria)));
  function field(label,control){const f=el("label","essential-modal-field");f.append(el("span","",label),control);return f}
  const grid=el("div","essential-modal-grid");grid.append(field("Esencial *",title),field("Sección *",category));
  const help=el("p","essential-section-help","Puedes cambiar el nombre de cualquier esencial o moverlo a otra sección. Estado, proveedor, Planeación y notas siguen editándose directamente en su tarjeta.");
  const msg=el("p","essential-modal-status","");
  const actions=el("div","essential-modal-actions"),cancel=button("Cancelar"),save=button("Guardar cambios",true);save.type="submit";actions.append(cancel,save);
  form.append(grid,help,msg,actions);modal.append(head,form);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
  function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")}
  close.onclick=dismiss;cancel.onclick=dismiss;
  form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;msg.textContent="Guardando…";try{await window.AdminEssentialsService.editItem(item.id,title.value,category.value);dismiss();await reload()}catch(err){msg.textContent=err.message||"No se pudo editar el esencial.";save.disabled=false}});
  setTimeout(()=>{title.focus();title.select()},0)
}
function openDisabledModal(data,reload){
  const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal essential-disabled-modal");
  const head=el("header","essential-modal-head"),copy=el("div");
  copy.append(el("p","admin-eyebrow","CHECKLIST ESENCIAL"),el("h2","","Elementos deshabilitados"));
  const close=button("Cerrar");head.append(copy,close);
  const body=el("div","essential-disabled-list");
  const items=data?.disabledItems||[];

  if(!items.length){
    body.append(el("p","essential-disabled-empty","No hay elementos deshabilitados."));
  }else{
    items
      .slice()
      .sort((a,b)=>`${a.categoria} ${a.titulo}`.localeCompare(`${b.categoria} ${b.titulo}`,"es",{sensitivity:"base"}))
      .forEach(item=>{
        const row=el("article","essential-disabled-row");
        const info=el("div");
        info.append(el("span","essential-category",item.categoria),el("strong","",item.titulo));
        const enable=button("Habilitar",true);
        enable.onclick=async()=>{
          enable.disabled=true;
          enable.textContent="Habilitando…";
          try{
            await window.AdminEssentialsService.setVisibility(item.id,true);
            overlay.remove();
            document.body.classList.remove("essential-modal-open");
            await reload();
          }catch(e){
            enable.disabled=false;
            enable.textContent="Habilitar";
            alert(e.message||"No se pudo habilitar el elemento.")
          }
        };
        row.append(info,enable);
        body.append(row)
      })
  }

  const help=el("p","essential-section-help","Los elementos deshabilitados no se muestran en el checklist normal, no cuentan para el progreso y no generan alertas. Puedes habilitarlos nuevamente desde aquí.");
  modal.append(head,help,body);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
  function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")}
  close.onclick=dismiss
}
function openSectionModal(reload){
  const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal essential-section-modal");
  const head=el("header","essential-modal-head"),copy=el("div");
  copy.append(el("p","admin-eyebrow","CHECKLIST PERSONALIZADO"),el("h2","","Nueva sección"));
  const close=button("Cerrar");head.append(copy,close);
  const form=document.createElement("form");form.className="essential-modal-form";
  const name=document.createElement("input");name.required=true;name.maxLength=80;name.placeholder="Ej. Luna de miel";
  const f=el("label","essential-modal-field essential-modal-field-wide");f.append(el("span","","Nombre de la sección *"),name);
  const help=el("p","essential-section-help","La sección quedará disponible aunque todavía no tenga elementos. Después podrás agregar esenciales dentro de ella.");
  const msg=el("p","essential-modal-status","");
  const actions=el("div","essential-modal-actions"),cancel=button("Cancelar"),save=button("Agregar sección",true);save.type="submit";actions.append(cancel,save);
  form.append(f,help,msg,actions);modal.append(head,form);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
  function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")}
  close.onclick=dismiss;cancel.onclick=dismiss;
  form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;msg.textContent="Guardando…";try{await window.AdminEssentialsService.saveSection(name.value);dismiss();await reload()}catch(err){msg.textContent=err.message||"No se pudo guardar la sección.";save.disabled=false}});
  setTimeout(()=>name.focus(),0)
}
function openNewModal(data,reload){const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal");const head=el("header","essential-modal-head");const copy=el("div");copy.append(el("p","admin-eyebrow","CHECKLIST PERSONALIZADO"),el("h2","","Agregar esencial"));const close=button("Cerrar");head.append(copy,close);const form=document.createElement("form");form.className="essential-modal-form";
const title=document.createElement("input");title.required=true;title.maxLength=180;title.placeholder="Ej. Letrero de bienvenida";
const category=document.createElement("select");category.required=true;category.append(option("","Selecciona una sección",!data?.seccionInicial));categoryNames(data).forEach(name=>category.append(option(name,name,name===data?.seccionInicial)));
const status=document.createElement("select");order.forEach(v=>status.append(option(v,labels[v],v==="por_definir")));
const vendor=document.createElement("select");vendor.append(option("","Sin proveedor vinculado",true),option("__no_aplica__","Proveedor: no aplica"));(data.proveedores||[]).forEach(v=>vendor.append(option(String(v.id),`${v.nombre} · ${v.categoria}`)));
const task=document.createElement("select");task.append(option("","Sin tarea vinculada",true),option("__no_aplica__","Planeación: no aplica"));(data.tareas||[]).forEach(t=>task.append(option(String(t.id),`${t.titulo}${t.fecha_limite?` · ${dateMx(t.fecha_limite)}`:""}`)));
const notes=document.createElement("textarea");notes.rows=3;notes.placeholder="Notas o detalle que quieras recordar…";
function field(label,control){const f=el("label","essential-modal-field");f.append(el("span","",label),control);return f}
const grid=el("div","essential-modal-grid");grid.append(field("Esencial *",title),field("Categoría *",category),field("Estado",status),field("Proveedor",vendor),field("Tarea de Planeación",task),field("Notas",notes));grid.lastElementChild.classList.add("essential-modal-field-wide");
const msg=el("p","essential-modal-status","");const actions=el("div","essential-modal-actions");const cancel=button("Cancelar"),save=button("Agregar esencial",true);save.type="submit";actions.append(cancel,save);form.append(grid,msg,actions);modal.append(head,form);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")};close.onclick=dismiss;cancel.onclick=dismiss;form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;msg.textContent="Guardando…";try{await window.AdminEssentialsService.saveItem({
  title:title.value,
  category:category.value,
  status:status.value,
  vendorId:vendor.value==="__no_aplica__"?"":vendor.value,
  taskId:task.value==="__no_aplica__"?"":task.value,
  vendorNotApplicable:vendor.value==="__no_aplica__",
  planningNotApplicable:task.value==="__no_aplica__",
  notes:notes.value
});dismiss();await reload()}catch(err){msg.textContent=err.message||"No se pudo guardar.";save.disabled=false}})}
function card(item,data,reload){
  const a=el("article","essential-item");
  const top=el("div","essential-item-top");
  const copy=el("div");
  copy.append(el("span","essential-category",item.categoria),el("h3","",item.titulo));

  const sel=document.createElement("select");
  sel.className=`essential-status essential-status-${item.estado}`;
  order.forEach(v=>sel.append(option(v,labels[v],v===item.estado)));
  top.append(copy,sel);

  const links=el("div","essential-links");
  const vendor=document.createElement("select");
  vendor.className="essential-link-select";
  vendor.append(
    option("","Proveedor: sin vincular",!item.proveedor_id&&!item.proveedor_no_aplica),
    option("__no_aplica__","Proveedor: no aplica",item.proveedor_no_aplica===true)
  );
  (data.proveedores||[]).forEach(v=>vendor.append(option(String(v.id),`Proveedor: ${v.nombre}`,Number(v.id)===Number(item.proveedor_id)&&!item.proveedor_no_aplica)));
  const task=document.createElement("select");
  task.className="essential-link-select";
  task.append(
    option("","Planeación: sin vincular",!item.tarea_id&&!item.planeacion_no_aplica),
    option("__no_aplica__","Planeación: no aplica",item.planeacion_no_aplica===true)
  );
  (data.tareas||[]).forEach(t=>task.append(option(String(t.id),`Tarea: ${t.titulo}`,Number(t.id)===Number(item.tarea_id)&&!item.planeacion_no_aplica)));
  links.append(vendor,task);

  let padrinoLink=null;
  if(item.padrino_relacion){
    padrinoLink=el("a","essential-padrino-link");
    padrinoLink.href="#/padrinos";

    const statusValue=item.padrino_relacion.padrino_estado||"por_definir";
    const typeLabel=item.padrino_relacion.padrino_tipo||"Padrinos";
    const namesLabel=item.padrino_relacion.padrino_nombres||"";
    const fulfillmentValue=item.padrino_relacion.cumplimiento_estado||"pendiente";

    const fulfillmentLabels={
      pendiente:"Pendiente",
      en_proceso:"En proceso",
      entregado:"Entregado / listo"
    };

    const coverageLabel=statusValue==="confirmado"?"COBERTURA":"PADRINOS";
    const coverageStatus=statusValue==="confirmado"
      ?(fulfillmentLabels[fulfillmentValue]||"Pendiente")
      :"Por definir";

    padrinoLink.append(
      el("span","essential-padrino-label",coverageLabel),
      el("strong","",namesLabel?`${typeLabel} · ${namesLabel}`:typeLabel),
      el(
        "span",
        `essential-padrino-status essential-padrino-status-${statusValue} essential-padrino-fulfillment-${fulfillmentValue}`,
        coverageStatus
      )
    );
  }

  const intelligence=el("div","essential-intelligence");
  const syncLabel=el("label","essential-auto-toggle");
  const sync=document.createElement("input");
  sync.type="checkbox";
  sync.checked=item.sincronizacion_automatica!==false;
  syncLabel.append(sync,el("span","","Sincronización automática"));
  intelligence.append(syncLabel);

  const autoInfo=el("div","essential-auto-info");
  if(sync.checked){
    autoInfo.append(el("span","essential-auto-badge","AUTO"));
    const noAplicaSignals=[
      item.proveedor_no_aplica?"Proveedor: no aplica":"",
      item.planeacion_no_aplica?"Planeación: no aplica":""
    ].filter(Boolean);
    const autoText=item.motivo_automatico
      ? `${item.motivo_automatico}${noAplicaSignals.length?` · ${noAplicaSignals.join(" · ")}`:""} · Estado actual: ${labels[item.estado]}`
      : `${noAplicaSignals.length?noAplicaSignals.join(" · "):"Sin señales vinculadas"} · Estado actual: ${labels[item.estado]}`;
    autoInfo.append(el("span","essential-auto-copy",autoText));
  }else{
    autoInfo.append(el("span","essential-manual-badge","MANUAL"),el("span","essential-auto-copy","El estado lo controlas directamente desde este elemento."));
  }
  intelligence.append(autoInfo);

  const notes=document.createElement("textarea");
  notes.className="essential-notes";
  notes.rows=2;
  notes.placeholder="Notas o detalle que quieras recordar…";
  notes.value=item.notas||"";

  const footer=el("div","essential-item-footer");
  const msg=el("small","essential-save-message","");
  footer.append(msg);
  {
    const customActions=el("div","essential-custom-actions");
    const edit=button("Editar");
    edit.classList.add("essential-edit");
    edit.onclick=()=>openEditEssentialModal(item,data,reload);

    const disable=button("Deshabilitar");
    disable.classList.add("essential-disable");
    disable.onclick=async()=>{
      if(!confirm(`¿Deshabilitar "${item.titulo}"?\n\nDejará de mostrarse en el checklist y no contará para el progreso ni las alertas.`))return;
      disable.disabled=true;
      try{await window.AdminEssentialsService.setVisibility(item.id,false);await reload()}
      catch(e){msg.textContent=e.message||"No se pudo deshabilitar";disable.disabled=false}
    };

    customActions.append(edit,disable);

    if(item.es_personalizado){
      const del=button("Eliminar");
      del.classList.add("essential-delete");
      del.onclick=async()=>{
        if(!confirm(`¿Eliminar "${item.titulo}"?`))return;
        del.disabled=true;
        try{await window.AdminEssentialsService.deleteItem(item.id);await reload()}
        catch(e){msg.textContent=e.message||"No se pudo eliminar";del.disabled=false}
      };
      customActions.append(del)
    }
    footer.append(customActions)
  }

  async function save({manualStatus=null,forceSync=null}={}){
    sel.disabled=vendor.disabled=task.disabled=notes.disabled=sync.disabled=true;
    msg.textContent="Guardando…";
    const syncAuto=forceSync===null?sync.checked:forceSync;
    const baseStatus=manualStatus || item.estado_manual || item.estado || "por_definir";
    try{
      await window.AdminEssentialsService.saveItem({
        id:item.id,
        status:baseStatus,
        notes:notes.value,
        vendorId:vendor.value==="__no_aplica__"?"":vendor.value,
        taskId:task.value==="__no_aplica__"?"":task.value,
        vendorNotApplicable:vendor.value==="__no_aplica__",
        planningNotApplicable:task.value==="__no_aplica__",
        syncAuto
      });
      msg.textContent="Guardado";
      setTimeout(reload,180)
    }catch(e){
      msg.textContent=e.message||"No se pudo guardar";
      sel.disabled=vendor.disabled=task.disabled=notes.disabled=sync.disabled=false
    }
  }

  sel.onchange=()=>{
    // Una selección explícita se considera un override manual.
    sync.checked=false;
    save({manualStatus:sel.value,forceSync:false});
  };
  vendor.onchange=()=>save();
  task.onchange=()=>save();
  notes.onchange=()=>save();
  sync.onchange=()=>{
    // Al salir de automático conservamos visualmente el estado efectivo actual.
    const manualStatus=sync.checked?(item.estado_manual||item.estado):item.estado;
    save({manualStatus,forceSync:sync.checked});
  };

  a.append(top,links);
  if(padrinoLink)a.append(padrinoLink);
  a.append(intelligence,notes,footer);
  return a
}
window.AdminViews=window.AdminViews||{};window.AdminViews.esenciales=()=>{const root=el("section","essentials-view");const head=el("header","admin-view-header essentials-heading");const headCopy=el("div");headCopy.append(el("p","admin-eyebrow","WEDDING COMMAND CENTER"),el("h2","","Checklist esencial"),el("p","admin-view-copy","Todo lo que necesita la boda, conectado con proveedores y Planeación."));const headActions=el("div","essential-heading-actions"),disabledBtn=button("DESHABILITADOS"),addSection=button("AGREGAR SECCIÓN"),add=button("AGREGAR ESENCIAL",true);headActions.append(disabledBtn,addSection,add);head.append(headCopy,headActions);const metrics=el("div","essential-metrics"),filters=el("div","essential-filters");const search=document.createElement("input");search.type="search";search.placeholder="Buscar esencial o categoría…";const status=document.createElement("select");status.innerHTML='<option value="">Todos los estados</option>'+order.map(v=>`<option value="${v}">${labels[v]}</option>`).join("");filters.append(search,status);const progress=el("section","essential-progress"),list=el("div","essential-groups"),loading=el("p","contracts-load-status","Cargando checklist…");root.append(head,metrics,progress,filters,loading,list);let data=null;
const expandedGroups=new Set();
function render(){if(!data)return;const r=data.resumen||{};metrics.replaceChildren(metric("TOTAL",r.total||0,"esenciales aplicables"),metric("LISTOS",r.listos||0,"completamente resueltos"),metric("CONTRATADOS",r.contratados||0,"proveedor asegurado"),metric("EN DECISIÓN",r.en_decision||0,"buscando o elegidos"),metric("POR DEFINIR",r.por_definir||0,"aún sin iniciar"));progress.innerHTML=`<div class="essential-progress-copy"><h3>Progreso general</h3><strong>${r.porcentaje||0}% preparado</strong></div><div class="essential-progress-track"><span style="width:${Math.min(100,Number(r.porcentaje||0))}%"></span></div>`;const q=search.value.trim().toLowerCase(),st=status.value;const items=(data.items||[]).filter(i=>(!st||i.estado===st)&&(!q||`${i.titulo} ${i.categoria} ${i.proveedor||""} ${i.tarea||""}`.toLowerCase().includes(q)));list.replaceChildren();const groups=new Map();categoryNames(data).forEach(name=>groups.set(name,[]));items.forEach(i=>{if(!groups.has(i.categoria))groups.set(i.categoria,[]);groups.get(i.categoria).push(i)});const filtering=Boolean(q||st);if(filtering){for(const [name,arr] of [...groups]){if(!arr.length&&!name.toLowerCase().includes(q))groups.delete(name)}}if(!groups.size){list.append(el("div","timeline-empty","No hay elementos que coincidan con los filtros."));return}groups.forEach((arr,name)=>{
  const sec=el("section","essential-group"),h=el("div","essential-group-header");
  const title=el("h3","",name);
  const summary=el("span","essential-group-summary",arr.length?`${arr.filter(i=>["listo","contratado"].includes(i.estado)).length} de ${arr.filter(i=>i.estado!=="no_aplica").length} resueltos`:"Sin esenciales todavía");
  const groupMeta=el("div","essential-group-meta");
  const groupActions=el("div","essential-group-actions");
  const sectionMeta=sectionByName(data,name);
  const isOpen=filtering||expandedGroups.has(name);

  h.setAttribute("role","button");
  h.setAttribute("tabindex","0");
  h.setAttribute("aria-expanded",String(isOpen));
  h.setAttribute("aria-label",`${isOpen?"Colapsar":"Desplegar"} ${name}`);

  if(sectionMeta){
    const editSection=button("Editar sección");
    editSection.classList.add("essential-section-edit");
    editSection.onclick=e=>{e.stopPropagation();openEditSectionModal(sectionMeta,load)};
    groupActions.append(editSection)
  }

  const toggle=button("");
  toggle.className="essential-group-toggle";
  toggle.textContent=isOpen?"−":"+";
  toggle.setAttribute("aria-label",`${isOpen?"Colapsar":"Desplegar"} ${name}`);
  groupActions.append(toggle);

  groupMeta.append(summary,groupActions);
  h.append(title,groupMeta);

  const grid=el("div","essential-grid");
  grid.hidden=!isOpen;
  arr.forEach(i=>grid.append(card(i,data,load)));

  if(!arr.length){
    const empty=el("div","essential-group-empty");
    empty.append(el("p","","Aún no hay esenciales en esta sección."));
    const quick=button("AGREGAR ESENCIAL",true);
    quick.onclick=e=>{e.stopPropagation();openNewModal({...data,seccionInicial:name},load)};
    empty.append(quick);
    grid.append(empty)
  }

  function setOpen(next){
    h.setAttribute("aria-expanded",String(next));
    h.setAttribute("aria-label",`${next?"Colapsar":"Desplegar"} ${name}`);
    toggle.setAttribute("aria-label",`${next?"Colapsar":"Desplegar"} ${name}`);
    toggle.textContent=next?"−":"+";
    grid.hidden=!next;
    if(next)expandedGroups.add(name);else expandedGroups.delete(name)
  }

  h.addEventListener("click",e=>{
    if(e.target.closest(".essential-section-edit"))return;
    setOpen(h.getAttribute("aria-expanded")!=="true")
  });
  h.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){
      e.preventDefault();
      setOpen(h.getAttribute("aria-expanded")!=="true")
    }
  });
  toggle.addEventListener("click",e=>{
    e.stopPropagation();
    setOpen(h.getAttribute("aria-expanded")!=="true")
  });

  sec.append(h,grid);list.append(sec)
})}
async function load(){loading.hidden=false;try{
  const [summary,sections,relations]=await Promise.all([
    window.AdminEssentialsService.getSummary(),
    window.AdminEssentialsService.getSections(),
    window.AdminGodparentsService.getRelations()
  ]);
  data=summary;
  data.secciones=sections?.items||[];
  const relationMap=new Map((relations||[]).map(r=>[Number(r.esencial_id),r]));
  const attach=(item)=>({...item,padrino_relacion:relationMap.get(Number(item.id))||null});
  data.items=(data.items||[]).map(attach);
  if(Array.isArray(data.allItems))data.allItems=data.allItems.map(attach);
  if(Array.isArray(data.disabledItems))data.disabledItems=data.disabledItems.map(attach);
  loading.hidden=true;render()
}catch(e){loading.hidden=false;loading.textContent=e.message||"No fue posible cargar el checklist."}}
disabledBtn.onclick=()=>data&&openDisabledModal(data,load);addSection.onclick=()=>openSectionModal(load);add.onclick=()=>data&&openNewModal(data,load);search.oninput=render;status.onchange=render;setTimeout(load,0);return root}})();
