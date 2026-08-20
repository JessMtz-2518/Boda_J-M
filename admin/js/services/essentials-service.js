(()=>{"use strict";
const RPC={summary:"admin_esenciales_resumen",save:"admin_esenciales_guardar",saveSmart:"admin_esenciales_guardar_inteligente",remove:"admin_esenciales_eliminar"};
function client(){const c=window.AdminSupabaseClient?.getClient?.();if(!c)throw new Error("El cliente administrativo no está disponible.");return c}
function env(v){if(!v||v.schema_version!=="1.0"||!v.data)throw new Error("La respuesta de Esenciales no tiene el formato esperado.");return v}
function session(error){const m=String(error?.message||"").toLowerCase();if(Number(error?.status||0)===401||Number(error?.status||0)===403||m.includes("acceso_administrativo_no_autorizado")){window.dispatchEvent(new CustomEvent("admin:session-expired"))}throw error}
async function getSummary(){const{data,error}=await client().rpc(RPC.summary);if(error)session(error);return env(data).data}
async function saveItem(item){
  let response;
  if(item?.id){
    response=await client().rpc(RPC.saveSmart,{
      p_id:Number(item.id),
      p_estado:item?.status||"por_definir",
      p_notas:String(item?.notes||"").trim()||null,
      p_proveedor_id:item?.vendorId?Number(item.vendorId):null,
      p_tarea_id:item?.taskId?Number(item.taskId):null,
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
      p_tarea_id:item?.taskId?Number(item.taskId):null
    });
  }
  if(response.error)session(response.error);return env(response.data)
}
async function deleteItem(id){const{data,error}=await client().rpc(RPC.remove,{p_id:Number(id)});if(error)session(error);return env(data)}
window.AdminEssentialsService=Object.freeze({getSummary,saveItem,deleteItem})})();
