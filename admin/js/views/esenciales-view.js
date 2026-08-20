(()=>{"use strict";
const labels={por_definir:"Por definir",buscando:"Buscando",elegido:"Elegido",contratado:"Contratado",listo:"Listo",no_aplica:"No aplica"};
const order=["por_definir","buscando","elegido","contratado","listo","no_aplica"];
function el(t,c,x){const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n}
function button(text,primary=false){const b=el("button",primary?"admin-button":"admin-button admin-button-secondary",text);b.type="button";return b}
function metric(k,v,s){const a=el("article","essential-metric");a.append(el("span","essential-metric-label",k),el("strong","essential-metric-value",String(v)),el("small","essential-metric-copy",s));return a}
function option(value,text,selected=false){const o=document.createElement("option");o.value=value;o.textContent=text;o.selected=selected;return o}
function dateMx(value){if(!value)return"";const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"short",year:"numeric"}).format(d)}
function openNewModal(data,reload){const overlay=el("div","essential-modal-overlay"),modal=el("section","essential-modal");const head=el("header","essential-modal-head");const copy=el("div");copy.append(el("p","admin-eyebrow","CHECKLIST PERSONALIZADO"),el("h2","","Agregar esencial"));const close=button("Cerrar");head.append(copy,close);const form=document.createElement("form");form.className="essential-modal-form";
const title=document.createElement("input");title.required=true;title.maxLength=180;title.placeholder="Ej. Letrero de bienvenida";
const category=document.createElement("input");category.required=true;category.maxLength=80;category.placeholder="Ej. Detalles finales";
const status=document.createElement("select");order.forEach(v=>status.append(option(v,labels[v],v==="por_definir")));
const vendor=document.createElement("select");vendor.append(option("","Sin proveedor vinculado",true));(data.proveedores||[]).forEach(v=>vendor.append(option(String(v.id),`${v.nombre} · ${v.categoria}`)));
const task=document.createElement("select");task.append(option("","Sin tarea vinculada",true));(data.tareas||[]).forEach(t=>task.append(option(String(t.id),`${t.titulo}${t.fecha_limite?` · ${dateMx(t.fecha_limite)}`:""}`)));
const notes=document.createElement("textarea");notes.rows=3;notes.placeholder="Notas o detalle que quieras recordar…";
function field(label,control){const f=el("label","essential-modal-field");f.append(el("span","",label),control);return f}
const grid=el("div","essential-modal-grid");grid.append(field("Esencial *",title),field("Categoría *",category),field("Estado",status),field("Proveedor",vendor),field("Tarea de Planeación",task),field("Notas",notes));grid.lastElementChild.classList.add("essential-modal-field-wide");
const msg=el("p","essential-modal-status","");const actions=el("div","essential-modal-actions");const cancel=button("Cancelar"),save=button("Agregar esencial",true);save.type="submit";actions.append(cancel,save);form.append(grid,msg,actions);modal.append(head,form);overlay.append(modal);document.body.append(overlay);document.body.classList.add("essential-modal-open");
function dismiss(){overlay.remove();document.body.classList.remove("essential-modal-open")};close.onclick=dismiss;cancel.onclick=dismiss;form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;msg.textContent="Guardando…";try{await window.AdminEssentialsService.saveItem({title:title.value,category:category.value,status:status.value,vendorId:vendor.value,taskId:task.value,notes:notes.value});dismiss();await reload()}catch(err){msg.textContent=err.message||"No se pudo guardar.";save.disabled=false}})}
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
  vendor.append(option("","Proveedor: sin vincular",!item.proveedor_id));
  (data.proveedores||[]).forEach(v=>vendor.append(option(String(v.id),`Proveedor: ${v.nombre}`,Number(v.id)===Number(item.proveedor_id))));
  const task=document.createElement("select");
  task.className="essential-link-select";
  task.append(option("","Planeación: sin vincular",!item.tarea_id));
  (data.tareas||[]).forEach(t=>task.append(option(String(t.id),`Tarea: ${t.titulo}`,Number(t.id)===Number(item.tarea_id))));
  links.append(vendor,task);

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
    const autoText=item.motivo_automatico
      ? `${item.motivo_automatico} · Estado actual: ${labels[item.estado]}`
      : `Sin señales vinculadas · Estado actual: ${labels[item.estado]}`;
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
  if(item.es_personalizado){
    const del=button("Eliminar");
    del.classList.add("essential-delete");
    del.onclick=async()=>{
      if(!confirm(`¿Eliminar "${item.titulo}"?`))return;
      del.disabled=true;
      try{await window.AdminEssentialsService.deleteItem(item.id);await reload()}
      catch(e){msg.textContent=e.message||"No se pudo eliminar";del.disabled=false}
    };
    footer.append(del)
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
        vendorId:vendor.value,
        taskId:task.value,
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

  a.append(top,links,intelligence,notes,footer);
  return a
}
window.AdminViews=window.AdminViews||{};window.AdminViews.esenciales=()=>{const root=el("section","essentials-view");const head=el("header","admin-view-header essentials-heading");const headCopy=el("div");headCopy.append(el("p","admin-eyebrow","WEDDING COMMAND CENTER"),el("h2","","Checklist esencial"),el("p","admin-view-copy","Todo lo que necesita la boda, conectado con proveedores y Planeación."));const add=button("AGREGAR ESENCIAL",true);head.append(headCopy,add);const metrics=el("div","essential-metrics"),filters=el("div","essential-filters");const search=document.createElement("input");search.type="search";search.placeholder="Buscar esencial o categoría…";const status=document.createElement("select");status.innerHTML='<option value="">Todos los estados</option>'+order.map(v=>`<option value="${v}">${labels[v]}</option>`).join("");filters.append(search,status);const progress=el("section","essential-progress"),list=el("div","essential-groups"),loading=el("p","contracts-load-status","Cargando checklist…");root.append(head,metrics,progress,filters,loading,list);let data=null;
const expandedGroups=new Set();
function render(){if(!data)return;const r=data.resumen||{};metrics.replaceChildren(metric("TOTAL",r.total||0,"esenciales aplicables"),metric("LISTOS",r.listos||0,"completamente resueltos"),metric("CONTRATADOS",r.contratados||0,"proveedor asegurado"),metric("EN DECISIÓN",r.en_decision||0,"buscando o elegidos"),metric("POR DEFINIR",r.por_definir||0,"aún sin iniciar"));progress.innerHTML=`<div class="essential-progress-copy"><h3>Progreso general</h3><strong>${r.porcentaje||0}% preparado</strong></div><div class="essential-progress-track"><span style="width:${Math.min(100,Number(r.porcentaje||0))}%"></span></div>`;const q=search.value.trim().toLowerCase(),st=status.value;const items=(data.items||[]).filter(i=>(!st||i.estado===st)&&(!q||`${i.titulo} ${i.categoria} ${i.proveedor||""} ${i.tarea||""}`.toLowerCase().includes(q)));list.replaceChildren();const groups=new Map();items.forEach(i=>{if(!groups.has(i.categoria))groups.set(i.categoria,[]);groups.get(i.categoria).push(i)});if(!items.length){list.append(el("div","timeline-empty","No hay elementos que coincidan con los filtros."));return}const filtering=Boolean(q||st);groups.forEach((arr,name)=>{const sec=el("section","essential-group"),h=document.createElement("button");h.type="button";h.className="essential-group-header";const title=el("h3","",name),summary=el("span","essential-group-summary",`${arr.filter(i=>["listo","contratado"].includes(i.estado)).length} de ${arr.filter(i=>i.estado!=="no_aplica").length} resueltos`),toggle=el("span","essential-group-toggle");const isOpen=filtering||expandedGroups.has(name);toggle.textContent=isOpen?"−":"+";toggle.setAttribute("aria-hidden","true");h.setAttribute("aria-expanded",String(isOpen));h.append(title,summary,toggle);const grid=el("div","essential-grid");grid.hidden=!isOpen;arr.forEach(i=>grid.append(card(i,data,load)));h.addEventListener("click",()=>{const open=h.getAttribute("aria-expanded")==="true";const next=!open;h.setAttribute("aria-expanded",String(next));toggle.textContent=next?"−":"+";grid.hidden=!next;if(next)expandedGroups.add(name);else expandedGroups.delete(name)});sec.append(h,grid);list.append(sec)})}
async function load(){loading.hidden=false;try{data=await window.AdminEssentialsService.getSummary();loading.hidden=true;render()}catch(e){loading.hidden=false;loading.textContent=e.message||"No fue posible cargar el checklist."}}
add.onclick=()=>data&&openNewModal(data,load);search.oninput=render;status.onchange=render;setTimeout(load,0);return root}})();
