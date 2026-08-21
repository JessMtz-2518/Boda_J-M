begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 10.5 · RELACIÓN PADRINOS ↔ ESENCIALES
-- Relación opcional, uno a uno.
-- No modifica automáticamente el estado del Esencial.
-- =========================================================

create table if not exists public.wedding_padrinos_esenciales (
  padrino_id bigint primary key references public.wedding_padrinazgos(id) on delete cascade,
  esencial_id bigint unique references public.wedding_esenciales(id) on delete cascade,
  creado_at timestamptz not null default now()
);

alter table public.wedding_padrinos_esenciales enable row level security;

revoke all on table public.wedding_padrinos_esenciales from public, anon, authenticated;

create or replace function public.admin_padrinos_esenciales_relaciones()
returns table(
  padrino_id bigint,
  padrino_tipo text,
  padrino_estado text,
  esencial_id bigint,
  esencial_titulo text,
  esencial_categoria text
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  return query
  select
    p.id::bigint,
    p.tipo::text,
    p.estado::text,
    e.id::bigint,
    e.titulo::text,
    e.categoria::text
  from public.wedding_padrinos_esenciales r
  join public.wedding_padrinazgos p on p.id = r.padrino_id
  join public.wedding_esenciales e on e.id = r.esencial_id
  order by lower(p.tipo);
end;
$$;

create or replace function public.admin_padrinos_esencial_relacion_guardar(
  p_padrino_id bigint,
  p_esencial_id bigint
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

  if not exists(select 1 from public.wedding_padrinazgos where id = p_padrino_id) then
    raise exception 'PADRINO_NO_ENCONTRADO';
  end if;

  delete from public.wedding_padrinos_esenciales
  where padrino_id = p_padrino_id;

  if p_esencial_id is not null then
    if not exists(select 1 from public.wedding_esenciales where id = p_esencial_id) then
      raise exception 'ESENCIAL_NO_ENCONTRADO';
    end if;

    -- Un Esencial sólo puede estar relacionado con un Padrino a la vez.
    delete from public.wedding_padrinos_esenciales
    where esencial_id = p_esencial_id;

    insert into public.wedding_padrinos_esenciales(padrino_id, esencial_id)
    values(p_padrino_id, p_esencial_id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'padrino_id',p_padrino_id,
    'esencial_id',p_esencial_id
  );
end;
$$;

revoke execute on function public.admin_padrinos_esenciales_relaciones() from public, anon;
grant execute on function public.admin_padrinos_esenciales_relaciones() to authenticated;

revoke execute on function public.admin_padrinos_esencial_relacion_guardar(bigint,bigint) from public, anon;
grant execute on function public.admin_padrinos_esencial_relacion_guardar(bigint,bigint) to authenticated;

commit;

notify pgrst, 'reload schema';
