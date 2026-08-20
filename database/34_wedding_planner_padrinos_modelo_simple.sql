begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 10.1 · PADRINOS SIMPLIFICADOS
-- Modelo final:
--   Por definir / Confirmado
--   Una invitación vinculada
--   Nombres de padrinos opcionales
-- Preserva la información ya capturada.
-- =========================================================

alter table public.wedding_padrinazgos
  add column if not exists nombres_padrinos text;

-- Normalizamos estados del modelo anterior.
update public.wedding_padrinazgos
set estado = case
  when estado = 'confirmados' then 'confirmado'
  else 'por_definir'
end
where estado in ('por_definir','invitados','confirmados','rechazado');

-- Eliminamos y recreamos la restricción de estado.
alter table public.wedding_padrinazgos
  drop constraint if exists wedding_padrinazgos_estado_chk;

alter table public.wedding_padrinazgos
  add constraint wedding_padrinazgos_estado_chk
  check (estado in ('por_definir','confirmado'));

-- Dejamos el segundo vínculo anterior sin uso, pero no lo borramos
-- para evitar pérdida de datos históricos.
comment on column public.wedding_padrinazgos.invitado_1_id is
  'Invitación vinculada al padrino.';
comment on column public.wedding_padrinazgos.invitado_1_nombre is
  'Nombre visible de la invitación vinculada.';
comment on column public.wedding_padrinazgos.invitado_2_id is
  'Campo legado de Padrinos V1. No se usa desde Fase 10.1.';
comment on column public.wedding_padrinazgos.invitado_2_nombre is
  'Campo legado de Padrinos V1. No se usa desde Fase 10.1.';

create or replace function public.admin_padrinos_resumen()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_items jsonb;
  v_total integer;
  v_confirmados integer;
  v_por_definir integer;
  v_deshabilitados integer;
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  select
    count(*) filter (where activo),
    count(*) filter (where activo and estado = 'confirmado'),
    count(*) filter (where activo and estado = 'por_definir'),
    count(*) filter (where not activo)
  into v_total, v_confirmados, v_por_definir, v_deshabilitados
  from public.wedding_padrinazgos;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'tipo', p.tipo,
        'estado', p.estado,
        'invitacion_id', p.invitado_1_id,
        'invitacion_nombre', p.invitado_1_nombre,
        'nombres_padrinos', p.nombres_padrinos,
        'notas', p.notas,
        'activo', p.activo,
        'orden', p.orden,
        'es_base', p.es_base,
        'actualizado_at', p.actualizado_at
      )
      order by p.activo desc, p.orden, lower(p.tipo)
    ),
    '[]'::jsonb
  )
  into v_items
  from public.wedding_padrinazgos p;

  return jsonb_build_object(
    'schema_version','1.1',
    'generated_at',now(),
    'data',jsonb_build_object(
      'summary',jsonb_build_object(
        'total',v_total,
        'confirmados',v_confirmados,
        'por_definir',v_por_definir,
        'deshabilitados',v_deshabilitados
      ),
      'items',v_items
    )
  );
end;
$$;

revoke execute on function public.admin_padrinos_resumen() from public, anon;
grant execute on function public.admin_padrinos_resumen() to authenticated;


drop function if exists public.admin_padrinos_guardar(bigint,text,text,bigint,text,bigint,text,text);

create or replace function public.admin_padrinos_guardar(
  p_id bigint,
  p_tipo text,
  p_estado text,
  p_invitacion_id bigint,
  p_invitacion_nombre text,
  p_nombres_padrinos text,
  p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id bigint;
  v_tipo text := btrim(coalesce(p_tipo,''));
  v_estado text := coalesce(nullif(btrim(p_estado),''),'por_definir');
  v_notas text := nullif(btrim(coalesce(p_notas,'')),'');
  v_nombres text := nullif(btrim(coalesce(p_nombres_padrinos,'')),'');
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  if char_length(v_tipo) < 1 or char_length(v_tipo) > 100 then
    raise exception 'TIPO_PADRINO_INVALIDO';
  end if;

  if v_estado not in ('por_definir','confirmado') then
    raise exception 'ESTADO_PADRINO_INVALIDO';
  end if;

  if v_notas is not null and char_length(v_notas) > 2000 then
    raise exception 'NOTAS_PADRINO_INVALIDAS';
  end if;

  if v_nombres is not null and char_length(v_nombres) > 250 then
    raise exception 'NOMBRES_PADRINOS_INVALIDOS';
  end if;

  if p_id is null then
    insert into public.wedding_padrinazgos(
      tipo,estado,
      invitado_1_id,invitado_1_nombre,
      invitado_2_id,invitado_2_nombre,
      nombres_padrinos,notas,
      activo,orden,es_base
    )
    values(
      v_tipo,v_estado,
      p_invitacion_id,nullif(btrim(coalesce(p_invitacion_nombre,'')),''),
      null,null,
      v_nombres,v_notas,
      true,100,false
    )
    returning id into v_id;
  else
    update public.wedding_padrinazgos
       set tipo = v_tipo,
           estado = v_estado,
           invitado_1_id = p_invitacion_id,
           invitado_1_nombre = nullif(btrim(coalesce(p_invitacion_nombre,'')),''),
           invitado_2_id = null,
           invitado_2_nombre = null,
           nombres_padrinos = v_nombres,
           notas = v_notas,
           actualizado_at = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'PADRINO_NO_ENCONTRADO';
    end if;
  end if;

  return jsonb_build_object(
    'schema_version','1.1',
    'generated_at',now(),
    'data',jsonb_build_object('ok',true,'id',v_id)
  );
end;
$$;

revoke execute on function public.admin_padrinos_guardar(bigint,text,text,bigint,text,text,text) from public, anon;
grant execute on function public.admin_padrinos_guardar(bigint,text,text,bigint,text,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';
