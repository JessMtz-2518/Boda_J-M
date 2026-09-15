(() => {
  "use strict";
  const fallback={fecha_evento:"2027-05-01",hora_evento:"19:00",zona_horaria:"-06:00"};
  function client(){return window.SupabaseClient?.getClient?.();}
  function time12(value){if(!value)return"";const [h,m]=value.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"P.M.":"A.M."}`;}
  function isoDate(fecha,hora,offset="-06:00",dayOffset=0){const base=new Date(`${fecha}T12:00:00${offset}`);base.setDate(base.getDate()+Number(dayOffset||0));const y=base.getFullYear(),mo=String(base.getMonth()+1).padStart(2,"0"),d=String(base.getDate()).padStart(2,"0");return `${y}-${mo}-${d}T${hora}:00${offset}`;}
  function longDate(value){const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"long",year:"numeric"}).format(d);}
  function weekday(value){const d=new Date(`${value}T12:00:00`);const s=new Intl.DateTimeFormat("es-MX",{weekday:"long"}).format(d);return s.charAt(0).toUpperCase()+s.slice(1);}
  function shortHeroDate(value){const d=new Date(`${value}T12:00:00`);const day=String(d.getDate()).padStart(2,"0");const month=new Intl.DateTimeFormat("es-MX",{month:"long"}).format(d);return `${day} <span>|</span> ${month.charAt(0).toUpperCase()+month.slice(1)} <span>|</span> ${d.getFullYear()}`;}
  function apply(data){const e=data?.evento;if(!e)return;
    const heroDate=document.querySelector(".hero-date");if(heroDate)heroDate.innerHTML=shortHeroDate(e.fecha_evento);
    const heroLocation=document.querySelector(".hero-location");if(heroLocation)heroLocation.textContent=e.lugar_nombre.replace(/\s*\([^)]*\)\s*$/,"");
    const cards=document.querySelectorAll("#detalles .details-grid article");
    if(cards[0]){cards[0].querySelector("h3").textContent=e.ceremonia_titulo||"Ceremonia";cards[0].querySelector("strong").textContent=time12(e.ceremonia_hora);cards[0].querySelector("p").textContent=e.ceremonia_descripcion||"";}
    if(cards[1]){cards[1].querySelector("h3").textContent=e.recepcion_titulo||"Recepción";cards[1].querySelector("strong").textContent=time12(e.recepcion_hora);cards[1].querySelector("p").textContent=e.recepcion_descripcion||"";}
    if(cards[2]){cards[2].querySelector("h3").textContent=e.lugar_nombre;cards[2].querySelector("strong").textContent=e.lugar_subtitulo||"";cards[2].querySelector("p").textContent=e.direccion||"";}
    if(cards[3]){cards[3].querySelector("strong").textContent=weekday(e.fecha_evento);cards[3].querySelector("p").textContent=longDate(e.fecha_evento);}
    const map=document.querySelector("#detalles .btn.map");if(map){if(e.mapa_url){map.href=e.mapa_url;map.hidden=false;}else map.hidden=true;}
    const list=document.querySelector("#itinerario .timeline-events");if(list&&Array.isArray(data.itinerario)&&data.itinerario.length){list.replaceChildren();data.itinerario.forEach((item,index)=>{const li=document.createElement("li");li.className="timeline-event";li.dataset.eventIndex=String(index);li.innerHTML=`<div aria-hidden="true" class="timeline-marker"><span class="timeline-marker-ring"></span><span class="timeline-marker-core"></span></div><article class="timeline-card"><span class="timeline-event-number">${String(index+1).padStart(2,"0")}</span><div class="timeline-icon"><i data-lucide="${item.icono||"heart"}"></i></div><time datetime="${isoDate(e.fecha_evento,item.hora,e.zona_horaria,item.dia_offset)}">${time12(item.hora)}</time><h3></h3><p></p></article>`;li.querySelector("h3").textContent=item.titulo;li.querySelector("p").textContent=item.descripcion||"";list.append(li);});}
    const target=isoDate(e.fecha_evento,e.hora_evento,e.zona_horaria||"-06:00",0);window.dispatchEvent(new CustomEvent("invitation:event-config-ready",{detail:{dateISO:target,data}}));
    if(window.lucide?.createIcons)window.lucide.createIcons();
  }
  async function load(){try{const c=client();if(!c)return;const {data,error}=await c.rpc("obtener_evento_itinerario");if(error)throw error;if(data?.data)apply(data.data);}catch(err){console.warn("No fue posible cargar la configuración dinámica del evento; se conservarán los datos incluidos en la invitación.",err);window.dispatchEvent(new CustomEvent("invitation:event-config-ready",{detail:{dateISO:`${fallback.fecha_evento}T${fallback.hora_evento}:00${fallback.zona_horaria}`}}));}}
  window.InvitationEventConfig=Object.freeze({load});
  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",()=>window.InvitationEventConfig.load(),{once:true});}
  else{window.InvitationEventConfig.load();}
})();
