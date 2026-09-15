(() => {
  "use strict";
  const ICONS=[
    ["handshake","🤝 Bienvenida / saludo"],["church","⛪ Ceremonia"],["wine","🍷 Recepción / brindis"],
    ["utensils","🍽️ Cena"],["music-2","🎵 Música / baile"],["cake-slice","🍰 Pastel"],
    ["camera","📷 Fotos"],["heart","♡ Momento especial"],["sparkles","✨ Celebración"],
    ["moon-star","🌙 Fin del evento"],["clock-3","🕒 Horario"]
  ];
  function el(tag,cls="",text=""){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=="")n.textContent=text;return n;}
  function input(type,value=""){const n=document.createElement("input");n.type=type;n.value=value||"";return n;}
  function field(label,control,wide=false,help=""){const w=el("label",`event-admin-field${wide?" event-admin-field-wide":""}`);w.append(el("span","",label),control);if(help)w.append(el("small","",help));return w;}
  function textarea(value=""){const n=document.createElement("textarea");n.rows=3;n.value=value||"";return n;}
  function selectIcon(value){const s=document.createElement("select");ICONS.forEach(([icon,label])=>{const o=document.createElement("option");o.value=icon;o.textContent=label;s.append(o)});s.value=ICONS.some(([icon])=>icon===value)?value:"heart";return s;}
  function timeLabel(value){if(!value)return"";const [h,m]=value.split(":").map(Number);const hour=h%12||12;return `${hour}:${String(m).padStart(2,"0")} ${h>=12?"P.M.":"A.M."}`;}

  window.AdminViews=window.AdminViews||{};
  window.AdminViews.evento=function(){
    const root=el("section","event-admin-view");
    const head=el("header","admin-view-header");
    head.append(el("p","admin-eyebrow","Organización"),el("h2","","Evento e itinerario"),el("p","admin-view-copy","Edita los datos que aparecen en la invitación pública. La fecha y hora principal también actualizan la cuenta regresiva."));
    const status=el("p","event-admin-status","Cargando configuración…");
    const form=el("form","event-admin-form");form.hidden=true;
    const eventPanel=el("section","event-admin-panel");eventPanel.append(el("h3","","Detalles del evento"));
    const eventGrid=el("div","event-admin-grid");eventPanel.append(eventGrid);
    const itineraryPanel=el("section","event-admin-panel");
    const itineraryHead=el("div","event-admin-panel-head");itineraryHead.append(el("div","",""));itineraryHead.firstChild.append(el("h3","","Itinerario"),el("p","event-admin-help","Puedes editar horarios, textos e iconos, cambiar el orden o agregar momentos."));
    const add=el("button","admin-button admin-button-secondary","Agregar momento");add.type="button";itineraryHead.append(add);itineraryPanel.append(itineraryHead);
    const list=el("div","event-admin-itinerary");itineraryPanel.append(list);
    const actions=el("div","event-admin-actions");const saveFeedback=el("span","event-admin-save-feedback","");const save=el("button","admin-button","Guardar cambios");save.type="submit";actions.append(saveFeedback,save);
    form.append(eventPanel,itineraryPanel,actions);root.append(head,status,form);

    let data=null;
    const controls={};
    function makeEventFields(evento){
      eventGrid.replaceChildren();
      controls.fecha=input("date",evento.fecha_evento);controls.fecha.required=true;
      controls.hora=input("time",evento.hora_evento);controls.hora.required=true;
      controls.lugar=input("text",evento.lugar_nombre);controls.lugar.required=true;controls.lugar.maxLength=120;
      controls.subtitulo=input("text",evento.lugar_subtitulo);controls.subtitulo.maxLength=160;
      controls.direccion=textarea(evento.direccion);controls.direccion.required=true;controls.direccion.maxLength=300;
      controls.mapa=input("text",evento.mapa_url);controls.mapa.inputMode="url";controls.mapa.placeholder="https://maps.app.goo.gl/...";
      controls.ceremoniaHora=input("time",evento.ceremonia_hora);controls.ceremoniaTitulo=input("text",evento.ceremonia_titulo);controls.ceremoniaDesc=textarea(evento.ceremonia_descripcion);
      controls.recepcionHora=input("time",evento.recepcion_hora);controls.recepcionTitulo=input("text",evento.recepcion_titulo);controls.recepcionDesc=textarea(evento.recepcion_descripcion);
      eventGrid.append(
        field("Fecha de la boda",controls.fecha),field("Hora principal / inicio del contador",controls.hora),
        field("Nombre del lugar",controls.lugar),field("Ubicación corta",controls.subtitulo),
        field("Dirección",controls.direccion,true),field("Enlace de Google Maps",controls.mapa,true),
        field("Hora de ceremonia",controls.ceremoniaHora),field("Título de ceremonia",controls.ceremoniaTitulo),field("Descripción de ceremonia",controls.ceremoniaDesc,true),
        field("Hora de recepción",controls.recepcionHora),field("Título de recepción",controls.recepcionTitulo),field("Descripción de recepción",controls.recepcionDesc,true)
      );
    }
    function itineraryRow(item={hora:"19:00",dia_offset:0,titulo:"Nuevo momento",descripcion:"",icono:"heart",activo:true}){
      const card=el("article","event-admin-itinerary-card");
      const top=el("div","event-admin-itinerary-top");const number=el("strong","event-admin-itinerary-number","");const move=el("div","event-admin-itinerary-move");
      const up=el("button","admin-button admin-button-secondary","↑");const down=el("button","admin-button admin-button-secondary","↓");const remove=el("button","admin-button admin-button-secondary","Quitar");[up,down,remove].forEach(b=>b.type="button");move.append(up,down,remove);top.append(number,move);
      const grid=el("div","event-admin-grid");const hour=input("time",item.hora);hour.required=true;const nextDay=document.createElement("select");[[0,"Mismo día"],[1,"Día siguiente"],[2,"Dos días después"]].forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;nextDay.append(o)});nextDay.value=String(item.dia_offset||0);const title=input("text",item.titulo);title.required=true;title.maxLength=80;const icon=selectIcon(item.icono);const desc=textarea(item.descripcion);desc.maxLength=500;const active=input("checkbox");active.checked=item.activo!==false;
      grid.append(field("Hora",hour),field("Día",nextDay),field("Título",title),field("Icono",icon,false,"Elige el momento; el icono se mostrará automáticamente en la invitación."),field("Descripción",desc,true),field("Visible en invitación",active));card.append(top,grid);card._controls={hour,nextDay,title,icon,desc,active};
      up.onclick=()=>{const prev=card.previousElementSibling;if(prev){list.insertBefore(card,prev);renumber();}};down.onclick=()=>{const next=card.nextElementSibling;if(next){list.insertBefore(next,card);renumber();}};remove.onclick=()=>{if(list.children.length<=1){alert("El itinerario debe conservar al menos un momento.");return;}card.remove();renumber();};
      return card;
    }
    function renumber(){[...list.children].forEach((card,i)=>{card.querySelector(".event-admin-itinerary-number").textContent=String(i+1).padStart(2,"0")});}
    function renderItinerary(items){list.replaceChildren();items.forEach(item=>list.append(itineraryRow(item)));renumber();}
    function collect(){return [...list.children].map((card,i)=>{const c=card._controls;return{orden:i+1,hora:c.hour.value,dia_offset:Number(c.nextDay.value),titulo:c.title.value.trim(),descripcion:c.desc.value.trim(),icono:c.icon.value,activo:c.active.checked}});}
    function eventPayload(){return{fecha_evento:controls.fecha.value,hora_evento:controls.hora.value,zona_horaria:"-06:00",lugar_nombre:controls.lugar.value.trim(),lugar_subtitulo:controls.subtitulo.value.trim(),direccion:controls.direccion.value.trim(),mapa_url:controls.mapa.value.trim(),ceremonia_hora:controls.ceremoniaHora.value,ceremonia_titulo:controls.ceremoniaTitulo.value.trim(),ceremonia_descripcion:controls.ceremoniaDesc.value.trim(),recepcion_hora:controls.recepcionHora.value,recepcion_titulo:controls.recepcionTitulo.value.trim(),recepcion_descripcion:controls.recepcionDesc.value.trim()};}
    async function load(){status.hidden=false;status.textContent="Cargando configuración…";try{data=await window.AdminEventService.get();makeEventFields(data.evento);renderItinerary(data.itinerario);form.hidden=false;status.hidden=true;}catch(err){console.error(err);status.textContent=err?.message||"No fue posible cargar el evento.";}}
    add.onclick=()=>{list.append(itineraryRow());renumber();list.lastElementChild.scrollIntoView({behavior:"smooth",block:"nearest"});};
    form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity()){saveFeedback.textContent="Revisa los campos marcados.";saveFeedback.className="event-admin-save-feedback is-error";return;}save.disabled=true;save.textContent="Guardando…";saveFeedback.textContent="Guardando cambios…";saveFeedback.className="event-admin-save-feedback";try{data=await window.AdminEventService.save(eventPayload(),collect());makeEventFields(data.evento);renderItinerary(data.itinerario);saveFeedback.textContent="✓ Cambios guardados";saveFeedback.className="event-admin-save-feedback is-success";status.hidden=false;status.textContent="Cambios guardados correctamente. La invitación pública ya puede leer esta información.";window.dispatchEvent(new CustomEvent("admin:alerts-refresh"));}catch(err){console.error(err);saveFeedback.textContent=err?.message||"No fue posible guardar.";saveFeedback.className="event-admin-save-feedback is-error";status.hidden=false;status.textContent=saveFeedback.textContent;}finally{save.disabled=false;save.textContent="Guardar cambios";}};
    load();return root;
  };
})();
