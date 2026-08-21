-- FASE 10.5.1 · Corrección visual Padrinos ↔ Esenciales
-- Ejecutar una sola vez en Supabase SQL Editor.

create or replace function public.admin_padrinos_esenciales_relaciones()
returns table(
  padrino_id bigint,
  padrino_tipo text,
  padrino_estado text,
  padrino_nombres text,
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
    p.nombres_padrinos::text,
    e.id::bigint,
    e.titulo::text,
    e.categoria::text
  from public.wedding_padrinos_esenciales r
  join public.wedding_padrinazgos p on p.id = r.padrino_id
  join public.wedding_esenciales e on e.id = r.esencial_id
  order by lower(p.tipo);
end;
$$;

revoke execute on function public.admin_padrinos_esenciales_relaciones() from public, anon;
grant execute on function public.admin_padrinos_esenciales_relaciones() to authenticated;

notify pgrst, 'reload schema';
