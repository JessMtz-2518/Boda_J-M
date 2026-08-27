(() => {
"use strict";
const money=new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"});
const date=new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"});
function el(t,c="",x=""){const n=document.createElement(t);if(c)n.className=c;if(x!=="")n.textContent=x;return n;}
function metric(label,value,detail){const n=el("article","gift-admin-metric");n.append(el("p","gift-admin-metric-label",label),el("strong","gift-admin-metric-value",value),el("span","gift-admin-metric-detail",detail));return n;}

function closeGiftModal(ov){ov.remove();document.body.classList.remove("finance-modal-open");}
function maskDigits(value,tail=4){const v=String(value||"");if(!v)return "—";if(v.length<=tail)return v;return "•".repeat(Math.max(0,v.length-tail))+v.slice(-tail);}
function openBankEditor(current,refresh){
  const ov=el("div","finance-modal-overlay"),dlg=el("section","finance-modal");dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");
  const h=el("header","finance-modal-head"),copy=el("div");copy.append(el("p","admin-eyebrow","Mesa de regalos"),el("h2","","Editar datos para transferencia"));
  const close=el("button","admin-button admin-button-secondary","Cerrar");close.type="button";h.append(copy,close);
  const form=el("form","finance-form"),grid=el("div","finance-form-grid finance-form-grid-single");
  const bank=document.createElement("input"),holder=document.createElement("input"),clabe=document.createElement("input"),account=document.createElement("input"),card=document.createElement("input");
  bank.required=holder.required=true;bank.value=current.banco||"";holder.value=current.titular||"";clabe.value=current.clabe||"";account.value=current.cuenta||"";card.value=current.tarjeta||"";
  bank.placeholder="Ej. BBVA";holder.placeholder="Nombre del titular";clabe.placeholder="18 dígitos";account.placeholder="Opcional";card.placeholder="Opcional";
  [clabe,account,card].forEach(x=>x.inputMode="numeric");clabe.maxLength=18;card.maxLength=19;account.maxLength=30;
  const field=(label,input,help)=>{const f=el("label","finance-field");f.append(el("span","",label),input);if(help)f.append(el("small","gift-admin-field-help",help));return f;};
  grid.append(field("Banco *",bank),field("Titular *",holder),field("CLABE",clabe,"18 dígitos; deja vacío si no deseas mostrarla."),field("Cuenta",account,"Opcional."),field("Tarjeta",card,"Solo número para transferencia/depósito; opcional."));
  const status=el("p","finance-form-status"),actions=el("div","finance-form-actions"),cancel=el("button","admin-button admin-button-secondary","Cancelar"),save=el("button","admin-button","Guardar cambios");
  cancel.type="button";save.type="submit";actions.append(cancel,save);form.append(grid,status,actions);dlg.append(h,form);ov.append(dlg);document.body.append(ov);document.body.classList.add("finance-modal-open");
  const dismiss=()=>closeGiftModal(ov);close.onclick=cancel.onclick=dismiss;ov.addEventListener("mousedown",e=>{if(e.target===ov)dismiss();});
  form.onsubmit=async e=>{e.preventDefault();const c=clabe.value.replace(/\D/g,""),a=account.value.replace(/\D/g,""),t=card.value.replace(/\D/g,"");if(c&&c.length!==18){status.textContent="La CLABE debe contener exactamente 18 dígitos.";return;}if(!c&&!a&&!t){status.textContent="Captura al menos CLABE, Cuenta o Tarjeta.";return;}if(t&&(t.length<13||t.length>19)){status.textContent="La tarjeta debe contener entre 13 y 19 dígitos.";return;}save.disabled=true;status.textContent="Guardando…";try{await window.AdminGiftService.updateBankData(bank.value,holder.value,c,a,t);dismiss();await refresh();}catch(err){status.textContent=err?.message||"No fue posible actualizar los datos.";save.disabled=false;}};
}

function openConfirm(item,refresh){const ov=el("div","finance-modal-overlay"),dlg=el("section","finance-modal");dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");const h=el("header","finance-modal-head"),copy=el("div");copy.append(el("p","admin-eyebrow","Mesa de regalos"),el("h2","","Confirmar transferencia"));const close=el("button","admin-button admin-button-secondary","Cerrar");close.type="button";h.append(copy,close);const form=el("form","finance-form"),grid=el("div","finance-form-grid finance-form-grid-single"),info=el("p","gift-admin-modal-info",`${item.invitado} · ${item.codigo}`),amount=document.createElement("input"),notes=document.createElement("textarea");amount.type="number";amount.min="0";amount.step="0.01";amount.required=true;amount.placeholder="Monto recibido";notes.rows=3;notes.placeholder="Nota opcional";const f1=el("label","finance-field"),f2=el("label","finance-field");f1.append(el("span","","Monto confirmado *"),amount);f2.append(el("span","","Notas"),notes);grid.append(info,f1,f2);const status=el("p","finance-form-status"),actions=el("div","finance-form-actions"),cancel=el("button","admin-button admin-button-secondary","Cancelar"),save=el("button","admin-button","Confirmar transferencia");cancel.type="button";save.type="submit";actions.append(cancel,save);form.append(grid,status,actions);dlg.append(h,form);ov.append(dlg);document.body.append(ov);document.body.classList.add("finance-modal-open");const dismiss=()=>{ov.remove();document.body.classList.remove("finance-modal-open")};close.onclick=cancel.onclick=dismiss;ov.addEventListener("mousedown",e=>{if(e.target===ov)dismiss()});form.onsubmit=async e=>{e.preventDefault();save.disabled=true;status.textContent="Guardando…";try{await window.AdminGiftService.confirm(item.id,amount.value,notes.value);dismiss();await refresh();}catch(err){status.textContent=err?.message||"No fue posible confirmar la transferencia.";save.disabled=false;}};}
window.AdminViews=window.AdminViews||{};
window.AdminViews.regalos=function(){
  const root=el("section","gift-admin-view");
  const head=el("header","admin-view-header");
  head.append(
    el("p","admin-eyebrow","Invitados"),
    el("h2","","Mesa de regalos"),
    el("p","admin-view-copy","Administra los datos para transferencia y revisa las señales de invitados que copiaron CLABE, Cuenta o Tarjeta. Una copia indica intención; confirma manualmente el depósito después de revisarlo en tu cuenta bancaria.")
  );

  const bankPanel=el("section","gift-admin-panel");
  const feedback=el("p","gift-admin-feedback");
  const metrics=el("div","gift-admin-metrics");
  const panel=el("section","gift-admin-panel");
  root.append(head,bankPanel,metrics,feedback,panel);

  let bankData=null;
  let lastSignalsSignature="";
  let refreshBusy=false;
  let autoRefreshTimer=0;

  function renderBankPanel(){
    bankPanel.replaceChildren();

    const row=el("div","gift-admin-config-head");
    const copy=el("div");
    copy.append(
      el("p","admin-eyebrow","Configuración"),
      el("h3","","Datos para transferencia"),
      el("p","admin-view-copy","Configura Banco, Titular y los medios de transferencia que se mostrarán en la invitación. CLABE, Cuenta y Tarjeta son opcionales y solo aparecen cuando tienen información.")
    );

    const edit=el("button","admin-button","Editar datos");
    edit.type="button";
    edit.onclick=()=>openBankEditor(bankData||{},async()=>{
      await loadBankData();
      await refreshSignals(false,true);
    });

    row.append(copy,edit);
    bankPanel.append(row);
  }

  async function loadBankData(){
    bankData=await window.AdminGiftService.getBankData();
    renderBankPanel();
  }

  function signalsSignature(data){
    const r=data?.resumen||{};
    const items=data?.registros||[];
    return JSON.stringify({
      r:[
        r.datos_copiados||r.clabe_copiada||0,
        r.por_verificar||0,
        r.confirmadas||0,
        Number(r.monto_confirmado||0)
      ],
      i:items.map(item=>[
        item.id,
        item.ultima_copia,
        item.copias_clabe||0,
        item.copias_cuenta||0,
        item.copias_tarjeta||0,
        item.estado,
        Number(item.monto_confirmado||0)
      ])
    });
  }

  function renderSignals(data){
    const r=data.resumen||{};
    const items=data.registros||[];

    metrics.replaceChildren(
      metric("Datos copiados",String(r.datos_copiados||r.clabe_copiada||0),"invitaciones con señal"),
      metric("Por verificar",String(r.por_verificar||0),"posibles transferencias"),
      metric("Confirmadas",String(r.confirmadas||0),"depósitos verificados"),
      metric("Monto confirmado",money.format(Number(r.monto_confirmado||0)),"regalos recibidos")
    );

    panel.replaceChildren();

    if(!items.length){
      panel.append(el("p","gift-admin-empty","Aún no hay invitaciones que hayan copiado datos para transferencia."));
    }else{
      const wrap=el("div","gift-admin-table-wrap");
      const table=el("table","gift-admin-table");
      const thead=document.createElement("thead");
      const tr=document.createElement("tr");

      ["Invitado","Código","Última copia","Detalle de copias","Estado","Monto","Acción"]
        .forEach(x=>tr.append(el("th","",x)));
      thead.append(tr);

      const tbody=document.createElement("tbody");

      items.forEach(item=>{
        const row=document.createElement("tr");
        const detail=[];
        if(Number(item.copias_clabe||0))detail.push(`CLABE ${item.copias_clabe}`);
        if(Number(item.copias_cuenta||0))detail.push(`Cuenta ${item.copias_cuenta}`);
        if(Number(item.copias_tarjeta||0))detail.push(`Tarjeta ${item.copias_tarjeta}`);

        row.append(
          el("td","",item.invitado),
          el("td","",item.codigo),
          el("td","",date.format(new Date(item.ultima_copia))),
          el("td","",detail.join(" · ")||String(item.veces_copiada||0)),
          el("td",item.estado==="confirmada"?"gift-admin-status confirmed":"gift-admin-status pending",item.estado==="confirmada"?"Confirmada":"Por verificar"),
          el("td","",item.estado==="confirmada"?money.format(Number(item.monto_confirmado||0)):"—")
        );

        const action=document.createElement("td");
        const btn=el("button",item.estado==="confirmada"?"admin-button admin-button-secondary":"admin-button",item.estado==="confirmada"?"Reabrir":"Confirmar");
        btn.type="button";

        btn.onclick=async()=>{
          if(item.estado==="confirmada"){
            if(!confirm(`¿Marcar nuevamente como por verificar la transferencia de ${item.invitado}?`))return;
            await window.AdminGiftService.reopen(item.id);
            await refreshSignals(false,true);
          }else{
            openConfirm(item,async()=>refreshSignals(false,true));
          }
        };

        action.append(btn);
        row.append(action);
        tbody.append(row);
      });

      table.append(thead,tbody);
      wrap.append(table);
      panel.append(wrap);
    }

    feedback.textContent=`${items.length} invitaciones con señal de transferencia.`;
  }

  async function refreshSignals(silent=false,force=false){
    if(refreshBusy)return;
    refreshBusy=true;
    if(!silent)feedback.textContent="Actualizando…";

    try{
      const data=await window.AdminGiftService.getSummary();
      const signature=signalsSignature(data);

      if(force||signature!==lastSignalsSignature){
        lastSignalsSignature=signature;
        renderSignals(data);
      }else if(!silent){
        feedback.textContent=`${(data.registros||[]).length} invitaciones con señal de transferencia.`;
      }
    }catch(err){
      console.error(err);
      if(!silent)feedback.textContent=err?.message||"No fue posible cargar Mesa de regalos.";
    }finally{
      refreshBusy=false;
    }
  }

  async function initialize(){
    feedback.textContent="Actualizando…";
    try{
      await Promise.all([
        loadBankData(),
        refreshSignals(false,true)
      ]);
    }catch(err){
      console.error(err);
      feedback.textContent=err?.message||"No fue posible cargar Mesa de regalos.";
    }

    // Mientras esta vista siga abierta, revisa nuevas copias cada 2 segundos.
    autoRefreshTimer=window.setInterval(async()=>{
      if(!root.isConnected){
        window.clearInterval(autoRefreshTimer);
        return;
      }
      if(document.visibilityState==="visible"){
        await refreshSignals(true,false);
      }
    },2000);
  }

  initialize();
  return root;
};
})();