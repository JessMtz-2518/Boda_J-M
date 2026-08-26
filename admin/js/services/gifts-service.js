(() => {
  "use strict";
  function client(){const c=window.AdminSupabaseClient?.getClient?.();if(!c)throw new Error("El cliente administrativo no está disponible.");return c;}
  function check(data){if(!data||data.schema_version!=="1.0")throw new Error("La respuesta de Mesa de regalos no tiene el formato esperado.");return data.data;}
  async function getSummary(){const {data,error}=await client().rpc("admin_mesa_regalos_resumen");if(error)throw error;return check(data);}
  async function confirm(id,amount,notes){const {error}=await client().rpc("admin_mesa_regalos_confirmar",{p_id:Number(id),p_monto:Number(amount),p_notas:String(notes||"").trim()||null});if(error)throw error;}
  async function reopen(id){const {error}=await client().rpc("admin_mesa_regalos_reabrir",{p_id:Number(id)});if(error)throw error;}
  window.AdminGiftService=Object.freeze({getSummary,confirm,reopen});
})();
