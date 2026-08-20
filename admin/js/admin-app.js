(() => {
  "use strict";
  const elements = {};
  let authSubscription = null;
  let resolving = false;
  let routerStarted = false;

  function resolveElements() {
    ["adminLogin","adminLoginForm","adminEmail","adminPassword","adminLoginButton","adminLoginMessage","adminShell","adminName","adminRole","adminLogoutButton","adminFatal","adminFatalMessage","adminRouteView","adminMenuButton","adminSidebarBackdrop"].forEach((id) => { elements[id] = document.querySelector(`#${id}`); });
    return Object.values(elements).every(Boolean);
  }
  function hideAll() { elements.adminLogin.hidden=true; elements.adminShell.hidden=true; elements.adminFatal.hidden=true; }
  function stopRouter() { if (routerStarted) { window.AdminRouter.stop(); routerStarted=false; } }
  function showLogin(message="") { stopRouter(); hideAll(); elements.adminLoginMessage.textContent=message; elements.adminPassword.value=""; elements.adminLogin.hidden=false; document.body.classList.remove("admin-loading"); }
  function showShell(access) { hideAll(); elements.adminName.textContent=access.name; elements.adminRole.textContent=access.role; elements.adminShell.hidden=false; document.body.classList.remove("admin-loading"); if(!routerStarted){window.AdminRouter.start(elements.adminRouteView);routerStarted=true;} window.dispatchEvent(new CustomEvent("admin:access-ready")); }
  function showFatal(message) { stopRouter(); hideAll(); elements.adminFatalMessage.textContent=message; elements.adminFatal.hidden=false; document.body.classList.remove("admin-loading"); }
  function setLoginBusy(busy) { elements.adminEmail.disabled=busy; elements.adminPassword.disabled=busy; elements.adminLoginButton.disabled=busy; elements.adminLoginButton.textContent=busy?"Verificando...":"Iniciar sesion"; }
  function toggleMenu(open) { elements.adminShell.classList.toggle("menu-open",open); elements.adminMenuButton.setAttribute("aria-expanded",String(open)); elements.adminSidebarBackdrop.hidden=!open; }
  function resetRouteToDashboard() { history.replaceState(null,"","#/dashboard"); }
  const routeGroups={invitados:"invitados",confirmaciones:"invitados",estadisticas:"invitados",mesas:"invitados",planeacion:"organizacion",timeline:"organizacion",esenciales:"organizacion",padrinos:"organizacion",presupuesto:"finanzas",contratos:"finanzas",reportes:"reportes"};
  function syncNavGroups(){
    const route=(location.hash.replace(/^#\//,"")||"dashboard").split(/[?&]/)[0];
    const activeGroup=routeGroups[route]||null;
    document.querySelectorAll(".admin-nav-group").forEach((group)=>{group.open=Boolean(activeGroup&&group.dataset.navGroup===activeGroup);});
  }

  async function resolveCurrentAccess() {
    if(resolving)return; resolving=true;
    try { const result=await window.AdminAuthGuard.resolveAccess(); if(result.status==="authorized")showShell(result.access); else if(result.status==="unauthorized"){await window.AdminAuthService.signOut();showLogin("Tu cuenta no tiene autorizacion administrativa.");}else showLogin(); }
    catch(error){console.error("Admin access:",error);showFatal("No fue posible verificar el acceso administrativo.");}
    finally{resolving=false;}
  }
  async function handleLogin(event) {
    event.preventDefault(); if(!elements.adminLoginForm.reportValidity())return; setLoginBusy(true); elements.adminLoginMessage.textContent="";
    try { const session=await window.AdminAuthService.signIn(elements.adminEmail.value.trim(),elements.adminPassword.value); if(!session)throw new Error("Sesion no disponible."); const access=await window.AdminAuthGuard.verifyAccess(); if(!access.authorized){await window.AdminAuthService.signOut();showLogin("Tu cuenta no tiene autorizacion administrativa.");return;} resetRouteToDashboard(); showShell(access); }
    catch(error){console.error("Admin login:",error);showLogin("No fue posible iniciar sesion. Verifica tus credenciales.");}
    finally{setLoginBusy(false);}
  }
  async function handleLogout() {
    elements.adminLogoutButton.disabled=true;
    try { window.AdminDashboardState?.clear?.(); resetRouteToDashboard(); await window.AdminAuthService.signOut(); showLogin("Sesion cerrada correctamente."); }
    catch(error){console.error("Admin logout:",error);showFatal("No fue posible cerrar la sesion de forma segura.");}
    finally{elements.adminLogoutButton.disabled=false;}
  }
  async function handleSessionExpired() {
    if(resolving)return; resolving=true; window.AdminDashboardState?.clear?.(); stopRouter(); hideAll();
    try { await window.AdminAuthService.signOut(); } catch(error) { console.error("Expired admin session:",error); }
    finally { showLogin("Tu sesion expiro. Inicia sesion nuevamente."); resolving=false; }
  }
  async function initialize() {
    if(!resolveElements())return;
    elements.adminLoginForm.addEventListener("submit",handleLogin); elements.adminLogoutButton.addEventListener("click",handleLogout);
    elements.adminMenuButton.addEventListener("click",()=>toggleMenu(!elements.adminShell.classList.contains("menu-open"))); elements.adminSidebarBackdrop.addEventListener("click",()=>toggleMenu(false));
    elements.adminShell.addEventListener("click",(event)=>{
      const routeLink=event.target.closest("[data-admin-route]");
      if(routeLink){toggleMenu(false);setTimeout(syncNavGroups,0);return;}
      const summary=event.target.closest(".admin-nav-group > summary");
      if(summary){const current=summary.parentElement;document.querySelectorAll(".admin-nav-group[open]").forEach((group)=>{if(group!==current)group.open=false;});}
    });
    window.addEventListener("hashchange",syncNavGroups); syncNavGroups(); window.addEventListener("admin:session-expired",handleSessionExpired);
    const {data}=window.AdminAuthService.onAuthStateChange(({event})=>{if(event==="SIGNED_OUT"&&!resolving)showLogin();}); authSubscription=data?.subscription||null;
    window.addEventListener("pagehide",()=>{authSubscription?.unsubscribe?.();window.removeEventListener("admin:session-expired",handleSessionExpired);},{once:true}); await resolveCurrentAccess();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
