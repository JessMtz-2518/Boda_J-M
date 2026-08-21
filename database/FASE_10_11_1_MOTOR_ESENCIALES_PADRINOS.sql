begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 10.11.1 · PADRINOS COMO SEÑAL DEL MOTOR DE ESENCIALES
--
-- Regla:
-- Si un Padrino está Confirmado, su cumplimiento está
-- 'entregado', tiene un Esencial relacionado y ese Esencial
-- mantiene Sincronización automática activa:
--   => estado efectivo del Esencial = LISTO.
--
-- El estado no se fuerza desde JavaScript. El motor de
-- Esenciales lo calcula como una señal automática real.
-- Si luego el cumplimiento deja de ser 'entregado', el motor
-- NO obliga una reversa si el Esencial ya quedó manualmente
-- en Listo; se conserva la lógica de mayor avance existente.
-- =========================================================

create or replace function public.admin_esenciales_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_proveedores jsonb;
  v_tareas jsonb;
  v_total integer := 0;
  v_listos integer := 0;
  v_contratados integer := 0;
  v_en_decision integer := 0;
  v_por_definir integer := 0;
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  with base as (
    select
      e.*,
      p.nombre as proveedor,
      p.estado as proveedor_estado,
      c.estado as contrato_estado,
      t.titulo as tarea,
      t.estado as tarea_estado,
      t.fecha_limite as tarea_fecha_limite,
      case
        when gp.estado = 'confirmado'
          and coalesce(gp.activo,true) = true
          and gp.cumplimiento_estado = 'entregado' then 'listo'
        when t.estado = 'completada' then 'listo'
        when p.estado in ('contratado','liquidado')
          or c.estado in ('firmado','no_requiere') then 'contratado'
        when p.estado = 'prospecto'
          or c.estado in ('en_revision','por_firmar') then 'elegido'
        when t.estado = 'en_proceso' then 'buscando'
        else 'por_definir'
      end as estado_automatico,
      case
        when gp.estado = 'confirmado'
          and coalesce(gp.activo,true) = true
          and gp.cumplimiento_estado = 'entregado'
          then 'Compromiso de padrinos entregado / listo'
        when t.estado = 'completada' then 'Tarea de Planeación completada'
        when c.estado = 'firmado' then 'Contrato firmado'
        when c.estado = 'no_requiere' then 'Proveedor sin contrato requerido'
        when p.estado = 'liquidado' then 'Proveedor liquidado'
        when p.estado = 'contratado' then 'Proveedor contratado'
        when c.estado = 'por_firmar' then 'Contrato listo para firma'
        when c.estado = 'en_revision' then 'Contrato en revisión'
        when p.estado = 'prospecto' then 'Proveedor en evaluación'
        when t.estado = 'en_proceso' then 'Tarea de Planeación en proceso'
        else null
      end as motivo_automatico
    from public.wedding_esenciales e
    left join public.wedding_padrinos_esenciales pe on pe.esencial_id = e.id
    left join public.wedding_padrinazgos gp on gp.id = pe.padrino_id
    left join public.planeacion_proveedores p on p.id = e.proveedor_id
    left join public.planeacion_contratos c on c.proveedor_id = e.proveedor_id
    left join public.planeacion_tareas t on t.id = e.tarea_id
  ), efectivo as (
    select b.*,
      case
        when b.estado = 'no_aplica' then 'no_aplica'
        when not b.sincronizacion_automatica then b.estado
        when greatest(
          case b.estado
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 4 then 'listo'
        when greatest(
          case b.estado
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 3 then 'contratado'
        when greatest(
          case b.estado
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 2 then 'elegido'
        when greatest(
          case b.estado
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico
            when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2
            when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 1 then 'buscando'
        else 'por_definir'
      end as estado_efectivo
    from base b
  )
  select
    count(*) filter(where estado_efectivo <> 'no_aplica')::integer,
    count(*) filter(where estado_efectivo = 'listo')::integer,
    count(*) filter(where estado_efectivo = 'contratado')::integer,
    count(*) filter(where estado_efectivo in ('buscando','elegido'))::integer,
    count(*) filter(where estado_efectivo = 'por_definir')::integer
  into v_total,v_listos,v_contratados,v_en_decision,v_por_definir
  from efectivo;

  with base as (
    select
      e.*,
      p.nombre as proveedor,
      p.estado as proveedor_estado,
      c.estado as contrato_estado,
      t.titulo as tarea,
      t.estado as tarea_estado,
      t.fecha_limite as tarea_fecha_limite,
      case
        when gp.estado = 'confirmado'
          and coalesce(gp.activo,true) = true
          and gp.cumplimiento_estado = 'entregado' then 'listo'
        when t.estado = 'completada' then 'listo'
        when p.estado in ('contratado','liquidado') or c.estado in ('firmado','no_requiere') then 'contratado'
        when p.estado = 'prospecto' or c.estado in ('en_revision','por_firmar') then 'elegido'
        when t.estado = 'en_proceso' then 'buscando'
        else 'por_definir'
      end as estado_automatico,
      case
        when gp.estado = 'confirmado'
          and coalesce(gp.activo,true) = true
          and gp.cumplimiento_estado = 'entregado'
          then 'Compromiso de padrinos entregado / listo'
        when t.estado = 'completada' then 'Tarea de Planeación completada'
        when c.estado = 'firmado' then 'Contrato firmado'
        when c.estado = 'no_requiere' then 'Proveedor sin contrato requerido'
        when p.estado = 'liquidado' then 'Proveedor liquidado'
        when p.estado = 'contratado' then 'Proveedor contratado'
        when c.estado = 'por_firmar' then 'Contrato listo para firma'
        when c.estado = 'en_revision' then 'Contrato en revisión'
        when p.estado = 'prospecto' then 'Proveedor en evaluación'
        when t.estado = 'en_proceso' then 'Tarea de Planeación en proceso'
        else null
      end as motivo_automatico
    from public.wedding_esenciales e
    left join public.wedding_padrinos_esenciales pe on pe.esencial_id = e.id
    left join public.wedding_padrinazgos gp on gp.id = pe.padrino_id
    left join public.planeacion_proveedores p on p.id = e.proveedor_id
    left join public.planeacion_contratos c on c.proveedor_id = e.proveedor_id
    left join public.planeacion_tareas t on t.id = e.tarea_id
  ), efectivo as (
    select b.*,
      case
        when b.estado = 'no_aplica' then 'no_aplica'
        when not b.sincronizacion_automatica then b.estado
        when greatest(
          case b.estado when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 4 then 'listo'
        when greatest(
          case b.estado when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 3 then 'contratado'
        when greatest(
          case b.estado when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 2 then 'elegido'
        when greatest(
          case b.estado when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end,
          case b.estado_automatico when 'por_definir' then 0 when 'buscando' then 1 when 'elegido' then 2 when 'contratado' then 3 when 'listo' then 4 else 0 end
        ) = 1 then 'buscando'
        else 'por_definir'
      end as estado_efectivo
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,
      'categoria',e.categoria,
      'titulo',e.titulo,
      'estado',e.estado_efectivo,
      'estado_manual',e.estado,
      'estado_automatico',e.estado_automatico,
      'sincronizacion_automatica',e.sincronizacion_automatica,
      'motivo_automatico',e.motivo_automatico,
      'notas',e.notas,
      'orden',e.orden,
      'proveedor_id',e.proveedor_id,
      'proveedor_no_aplica',coalesce(e.proveedor_no_aplica,false),
      'proveedor',e.proveedor,
      'proveedor_estado',e.proveedor_estado,
      'contrato_estado',e.contrato_estado,
      'tarea_id',e.tarea_id,
      'planeacion_no_aplica',coalesce(e.planeacion_no_aplica,false),
      'tarea',e.tarea,
      'tarea_estado',e.tarea_estado,
      'tarea_fecha_limite',e.tarea_fecha_limite,
      'es_personalizado',e.es_personalizado,
      'fecha_actualizacion',e.fecha_actualizacion
    ) order by e.categoria,e.orden,e.titulo),'[]'::jsonb)
  into v_items
  from efectivo e;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'nombre',p.nombre,'categoria',p.categoria,'estado',p.estado,'costo_total',p.costo_total,
      'contrato_estado',coalesce(c.estado,'sin_contrato')
    ) order by p.categoria,p.nombre),'[]'::jsonb)
  into v_proveedores
  from public.planeacion_proveedores p
  left join public.planeacion_contratos c on c.proveedor_id=p.id
  where p.estado <> 'cancelado';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'titulo',t.titulo,'categoria',t.categoria,'responsable',t.responsable,
      'estado',t.estado,'fecha_limite',t.fecha_limite
    ) order by case when t.estado='completada' then 1 else 0 end,t.fecha_limite nulls last,t.titulo),'[]'::jsonb)
  into v_tareas
  from public.planeacion_tareas t;

  return jsonb_build_object(
    'schema_version','1.0','generated_at',now(),
    'data',jsonb_build_object(
      'resumen',jsonb_build_object(
        'total',v_total,
        'listos',v_listos,
        'contratados',v_contratados,
        'en_decision',v_en_decision,
        'por_definir',v_por_definir,
        'porcentaje',case when v_total=0 then 0 else round(100.0*(v_listos+v_contratados)/v_total) end
      ),
      'items',v_items,
      'proveedores',v_proveedores,
      'tareas',v_tareas
    )
  );
end;
$$;


commit;

notify pgrst, 'reload schema';
