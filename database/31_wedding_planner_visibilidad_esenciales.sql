begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 9.2.3 · HABILITAR / DESHABILITAR ESENCIALES
-- Ejecutar una sola vez en Supabase.
-- =========================================================

create table if not exists public.wedding_planner_esenciales_visibilidad (
  esencial_id bigint primary key,
  habilitado boolean not null default true,
  actualizado_at timestamptz not null default now()
);

alter table public.wedding_planner_esenciales_visibilidad enable row level security;

revoke all on table public.wedding_planner_esenciales_visibilidad from public, anon, authenticated;

create or replace function public.admin_esenciales_visibilidad()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_items jsonb;
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'esencial_id', e.id,
        'habilitado', coalesce(v.habilitado, true)
      )
      order by e.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.wedding_esenciales e
  left join public.wedding_planner_esenciales_visibilidad v
    on v.esencial_id = e.id;

  return jsonb_build_object(
    'schema_version', '1.0',
    'generated_at', now(),
    'data', jsonb_build_object('items', v_items)
  );
end;
$$;

revoke execute on function public.admin_esenciales_visibilidad() from public, anon;
grant execute on function public.admin_esenciales_visibilidad() to authenticated;


create or replace function public.admin_esenciales_cambiar_visibilidad(
  p_id bigint,
  p_habilitado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  if not exists (select 1 from public.wedding_esenciales where id = p_id) then
    raise exception 'ESENCIAL_NO_ENCONTRADO';
  end if;

  insert into public.wedding_planner_esenciales_visibilidad(esencial_id, habilitado, actualizado_at)
  values (p_id, coalesce(p_habilitado, true), now())
  on conflict (esencial_id)
  do update
     set habilitado = excluded.habilitado,
         actualizado_at = now();

  return jsonb_build_object(
    'schema_version', '1.0',
    'generated_at', now(),
    'data', jsonb_build_object(
      'ok', true,
      'id', p_id,
      'habilitado', coalesce(p_habilitado, true)
    )
  );
end;
$$;

revoke execute on function public.admin_esenciales_cambiar_visibilidad(bigint,boolean) from public, anon;
grant execute on function public.admin_esenciales_cambiar_visibilidad(bigint,boolean) to authenticated;

commit;
