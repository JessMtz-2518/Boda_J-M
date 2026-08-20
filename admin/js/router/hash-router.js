(() => {
  "use strict";
  const allowed = new Set(["dashboard","invitados","confirmaciones","estadisticas","mesas","reportes","planeacion","presupuesto","timeline","contratos","esenciales","padrinos"]);
  let container;
  function readRoute(){const route=window.location.hash.replace(/^#\/?/,"").split("/")[0];return allowed.has(route)?route:"dashboard";}
  function render(){const route=readRoute();if(window.location.hash!==`#/${route}`) history.replaceState(null,"",`#/${route}`);document.querySelectorAll("[data-admin-route]").forEach((link)=>{if(link.dataset.adminRoute===route)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});const view=window.AdminViews?.[route];if(typeof view!=="function")return;container.replaceChildren(view());container.focus({preventScroll:true});document.title=`${route[0].toUpperCase()+route.slice(1)} | Administración`;}
  function start(target){container=target;window.addEventListener("hashchange",render);render();}
  function stop(){window.removeEventListener("hashchange",render);if(container)container.replaceChildren();container=null;}
  window.AdminPlaceholderView=(title,copy)=>{const root=document.createElement("section");const header=document.createElement("header");header.className="admin-view-header";const eyebrow=document.createElement("p");eyebrow.className="admin-eyebrow";eyebrow.textContent="Módulo preparado";const heading=document.createElement("h2");heading.textContent=title;const paragraph=document.createElement("p");paragraph.className="admin-view-copy";paragraph.textContent=copy;header.append(eyebrow,heading,paragraph);root.append(header);return root;};
  window.AdminRouter=Object.freeze({start,stop});
})();
