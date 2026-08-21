(()=>{"use strict";
const RPC={summary:"admin_esenciales_resumen",save:"admin_esenciales_guardar",saveSmart:"admin_esenciales_guardar_inteligente",remove:"admin_esenciales_eliminar",sections:"admin_esenciales_listar_secciones",saveSection:"admin_esenciales_guardar_seccion",editSection:"admin_esenciales_editar_seccion",editItem:"admin_esenciales_editar",visibility:"admin_esenciales_visibilidad",setVisibility:"admin_esenciales_cambiar_visibilidad"};
function client(){const c=window.AdminSupabaseClient?.getClient?.();if(!c)throw new Error("El cliente administrativo no está disponible.");return c}
function env(v){if(!v||v.schema_version!=="1.0"||!v.data)throw new Error("La respuesta de Esenciales no tiene el formato esperado.");return v}
function session(error){const m=String(error?.message||"").toLowerCase();if(Number(error?.status||0)===401||Number(error?.status||0)===403||m.includes("acceso_administrativo_no_autorizado")){window.dispatchEvent(new CustomEvent("admin:session-expired"))}throw error}
function recalcSummary(data){
  const items=data?.items||[];
  const applicable=items.filter(i=>i.estado!=="no_aplica");
  data.resumen={
    ...(data.resumen||{}),
    total:applicable.length,
    listos:items.filter(i=>i.estado==="listo").length,
    contratados:items.filter(i=>i.estado==="contratado").length,
    en_decision:items.filter(i=>["buscando","elegido"].includes(i.estado)).length,
    por_definir:items.filter(i=>i.estado==="por_definir").length
  };
  return data
}
async function getVisibility(){const{data,error}=await client().rpc(RPC.visibility);if(error)session(error);return env(data).data}
async function getSummary(){
  const [summaryResponse,visibilityData]=await Promise.all([
    client().rpc(RPC.summary),
    getVisibility()
  ]);
  if(summaryResponse.error)session(summaryResponse.error);
  const data=env(summaryResponse.data).data;
  const visibility=new Map((visibilityData?.items||[]).map(x=>[Number(x.esencial_id),x.habilitado!==false]));
  data.allItems=(data.items||[]).map(i=>({...i,habilitado:visibility.get(Number(i.id))!==false}));
  data.disabledItems=data.allItems.filter(i=>i.habilitado===false);
  data.items=data.allItems.filter(i=>i.habilitado!==false);
  return recalcSummary(data)
}
async function saveItem(item){
  let response;
  if(item?.id){
    response=await client().rpc(RPC.saveSmart,{
      p_id:Number(item.id),
      p_estado:item?.status||"por_definir",
      p_notas:String(item?.notes||"").trim()||null,
      p_proveedor_id:item?.vendorId?Number(item.vendorId):null,
      p_tarea_id:item?.taskId?Number(item.taskId):null,
      p_proveedor_no_aplica:item?.vendorNotApplicable===true,
      p_planeacion_no_aplica:item?.planningNotApplicable===true,
      p_sincronizacion_automatica:item?.syncAuto!==false
    });
  }else{
    response=await client().rpc(RPC.save,{
      p_id:null,
      p_categoria:item?.category||null,
      p_titulo:item?.title||null,
      p_estado:item?.status||"por_definir",
      p_notas:String(item?.notes||"").trim()||null,
      p_proveedor_id:item?.vendorId?Number(item.vendorId):null,
      p_tarea_id:item?.taskId?Number(item.taskId):null,
      p_proveedor_no_aplica:item?.vendorNotApplicable===true,
      p_planeacion_no_aplica:item?.planningNotApplicable===true
    });
  }
  if(response.error)session(response.error);return env(response.data)
}
async function deleteItem(id){const{data,error}=await client().rpc(RPC.remove,{p_id:Number(id)});if(error)session(error);return env(data)}
async function getSections(){const{data,error}=await client().rpc(RPC.sections);if(error)session(error);return env(data).data}
async function saveSection(name){const{data,error}=await client().rpc(RPC.saveSection,{p_nombre:String(name||"").trim()});if(error)session(error);return env(data).data}
async function editSection(oldName,newName){const{data,error}=await client().rpc(RPC.editSection,{p_nombre_anterior:String(oldName||"").trim(),p_nombre_nuevo:String(newName||"").trim()});if(error)session(error);return env(data).data}
async function editItem(id,title,category){const{data,error}=await client().rpc(RPC.editItem,{p_id:Number(id),p_titulo:String(title||"").trim(),p_categoria:String(category||"").trim()});if(error)session(error);return env(data).data}
async function setVisibility(id,enabled){const{data,error}=await client().rpc(RPC.setVisibility,{p_id:Number(id),p_habilitado:enabled!==false});if(error)session(error);return env(data).data}
window.AdminEssentialsService=Object.freeze({getSummary,saveItem,deleteItem,getSections,saveSection,editSection,editItem,getVisibility,setVisibility})})();
