begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 7.8.2 · CHECKLIST ESENCIAL INTELIGENTE
-- Vinculación con proveedores y Planeación + esenciales personalizados.
-- Ejecutar una sola vez en Supabase.
-- =========================================================

alter table public.wedding_esenciales
  add column if not exists proveedor_id bigint,
  add column if not exists tarea_id bigint,
  add column if not exists es_personalizado boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wedding_esenciales_proveedor_fkey'
  ) then
    alter table public.wedding_esenciales
      add constraint wedding_esenciales_proveedor_fkey
      foreign key (proveedor_id) references public.planeacion_proveedores(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'wedding_esenciales_tarea_fkey'
  ) then
    alter table public.wedding_esenciales
      add constraint wedding_esenciales_tarea_fkey
      foreign key (tarea_id) references public.planeacion_tareas(id) on delete set null;
  end if;
end $$;

create index if not exists idx_wedding_esenciales_proveedor on public.wedding_esenciales(proveedor_id);
create index if not exists idx_wedding_esenciales_tarea on public.wedding_esenciales(tarea_id);

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
  v_total integer;
  v_listos integer;
  v_contratados integer;
  v_en_decision integer;
  v_por_definir integer;
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  select
    count(*) filter(where e.estado <> 'no_aplica')::integer,
    count(*) filter(where e.estado = 'listo')::integer,
    count(*) filter(where e.estado = 'contratado')::integer,
    count(*) filter(where e.estado in ('buscando','elegido'))::integer,
    count(*) filter(where e.estado = 'por_definir')::integer
  into v_total,v_listos,v_contratados,v_en_decision,v_por_definir
  from public.wedding_esenciales e;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,
      'categoria',e.categoria,
      'titulo',e.titulo,
      'estado',e.estado,
      'notas',e.notas,
      'orden',e.orden,
      'proveedor_id',e.proveedor_id,
      'proveedor',p.nombre,
      'proveedor_estado',p.estado,
      'tarea_id',e.tarea_id,
      'tarea',t.titulo,
      'tarea_estado',t.estado,
      'tarea_fecha_limite',t.fecha_limite,
      'es_personalizado',e.es_personalizado,
      'estado_sugerido',case
        when t.estado = 'completada' then 'listo'
        when p.estado in ('contratado','liquidado') then 'contratado'
        when t.estado = 'en_proceso' then 'buscando'
        else null
      end,
      'fecha_actualizacion',e.fecha_actualizacion
    ) order by e.categoria,e.orden,e.titulo),'[]'::jsonb)
  into v_items
  from public.wedding_esenciales e
  left join public.planeacion_proveedores p on p.id=e.proveedor_id
  left join public.planeacion_tareas t on t.id=e.tarea_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'nombre',p.nombre,'categoria',p.categoria,'estado',p.estado,'costo_total',p.costo_total
    ) order by p.categoria,p.nombre),'[]'::jsonb)
  into v_proveedores
  from public.planeacion_proveedores p
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

create or replace function public.admin_esenciales_guardar(
  p_id bigint default null,
  p_categoria text default null,
  p_titulo text default null,
  p_estado text default 'por_definir',
  p_notas text default null,
  p_proveedor_id bigint default null,
  p_tarea_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_orden integer;
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  if p_estado not in ('por_definir','buscando','elegido','contratado','listo','no_aplica') then
    raise exception 'ESTADO_INVALIDO';
  end if;

  if p_proveedor_id is not null and not exists(select 1 from public.planeacion_proveedores where id=p_proveedor_id) then
    raise exception 'PROVEEDOR_NO_ENCONTRADO';
  end if;
  if p_tarea_id is not null and not exists(select 1 from public.planeacion_tareas where id=p_tarea_id) then
    raise exception 'TAREA_NO_ENCONTRADA';
  end if;

  if p_id is null then
    if nullif(trim(coalesce(p_titulo,'')),'') is null then raise exception 'TITULO_OBLIGATORIO'; end if;
    if nullif(trim(coalesce(p_categoria,'')),'') is null then raise exception 'CATEGORIA_OBLIGATORIA'; end if;
    select coalesce(max(orden),0)+10 into v_orden from public.wedding_esenciales where categoria=trim(p_categoria);
    insert into public.wedding_esenciales(categoria,titulo,estado,notas,orden,proveedor_id,tarea_id,es_personalizado,fecha_actualizacion)
    values(trim(p_categoria),trim(p_titulo),p_estado,nullif(trim(coalesce(p_notas,'')),''),v_orden,p_proveedor_id,p_tarea_id,true,now())
    returning id into v_id;
  else
    update public.wedding_esenciales
    set estado=p_estado,
        notas=nullif(trim(coalesce(p_notas,'')),''),
        proveedor_id=p_proveedor_id,
        tarea_id=p_tarea_id,
        fecha_actualizacion=now()
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'ESENCIAL_NO_ENCONTRADO'; end if;
  end if;

  return jsonb_build_object('schema_version','1.0','generated_at',now(),'data',jsonb_build_object('ok',true,'id',v_id));
end;
$$;

create or replace function public.admin_esenciales_eliminar(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;
  delete from public.wedding_esenciales where id=p_id and es_personalizado=true;
  if not found then raise exception 'SOLO_ESENCIALES_PERSONALIZADOS_SE_PUEDEN_ELIMINAR'; end if;
  return jsonb_build_object('schema_version','1.0','generated_at',now(),'data',jsonb_build_object('ok',true,'id',p_id));
end;
$$;

-- Mantener compatibilidad con la función de la fase anterior.
create or replace function public.admin_esenciales_actualizar(p_id bigint,p_estado text,p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.admin_esenciales_guardar(p_id,null,null,p_estado,p_notas,null,null);
end;
$$;

revoke execute on function public.admin_esenciales_resumen() from public,anon;
revoke execute on function public.admin_esenciales_guardar(bigint,text,text,text,text,bigint,bigint) from public,anon;
revoke execute on function public.admin_esenciales_eliminar(bigint) from public,anon;
revoke execute on function public.admin_esenciales_actualizar(bigint,text,text) from public,anon;
grant execute on function public.admin_esenciales_resumen() to authenticated;
grant execute on function public.admin_esenciales_guardar(bigint,text,text,text,text,bigint,bigint) to authenticated;
grant execute on function public.admin_esenciales_eliminar(bigint) to authenticated;
grant execute on function public.admin_esenciales_actualizar(bigint,text,text) to authenticated;

commit;
