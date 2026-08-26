begin;

create table if not exists public.mesa_regalos_transferencias (
  id bigint generated always as identity primary key,
  invitado_id bigint not null unique references public.invitados(id) on delete cascade,
  veces_clabe_copiada integer not null default 1 check (veces_clabe_copiada > 0),
  primera_copia timestamptz not null default now(),
  ultima_copia timestamptz not null default now(),
  estado text not null default 'por_verificar' check (estado in ('por_verificar','confirmada')),
  monto_confirmado numeric(12,2) check (monto_confirmado is null or monto_confirmado >= 0),
  notas text,
  fecha_confirmacion timestamptz,
  confirmado_por uuid,
  fecha_actualizacion timestamptz not null default now()
);

alter table public.mesa_regalos_transferencias enable row level security;
revoke all on table public.mesa_regalos_transferencias from anon, authenticated;

create or replace function public.registrar_copia_clabe(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  select id into v_id from public.invitados where token_acceso=p_token and activo=true;
  if v_id is null then raise exception 'INVITACION_NO_DISPONIBLE'; end if;
  insert into public.mesa_regalos_transferencias(invitado_id)
  values(v_id)
  on conflict(invitado_id) do update set
    veces_clabe_copiada=mesa_regalos_transferencias.veces_clabe_copiada+1,
    ultima_copia=now(), fecha_actualizacion=now();
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.registrar_copia_clabe(uuid) from public;
grant execute on function public.registrar_copia_clabe(uuid) to anon, authenticated;

create or replace function public.admin_mesa_regalos_resumen()
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_data jsonb;
begin
  if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'clabe_copiada', count(*),
      'por_verificar', count(*) filter(where m.estado='por_verificar'),
      'confirmadas', count(*) filter(where m.estado='confirmada'),
      'monto_confirmado', coalesce(sum(m.monto_confirmado) filter(where m.estado='confirmada'),0)
    ),
    'registros', coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'invitado_id',i.id,'invitado',i.nombre,'codigo',i.codigo,'grupo',i.grupo,
      'veces_copiada',m.veces_clabe_copiada,'primera_copia',m.primera_copia,'ultima_copia',m.ultima_copia,
      'estado',m.estado,'monto_confirmado',m.monto_confirmado,'notas',m.notas,'fecha_confirmacion',m.fecha_confirmacion
    ) order by m.ultima_copia desc),'[]'::jsonb)
  ) into v_data
  from public.mesa_regalos_transferencias m join public.invitados i on i.id=m.invitado_id;
  return jsonb_build_object('schema_version','1.0','generated_at',now(),'data',v_data);
end; $$;

create or replace function public.admin_mesa_regalos_confirmar(p_id bigint,p_monto numeric,p_notas text default null)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'MONTO_INVALIDO'; end if;
  update public.mesa_regalos_transferencias set estado='confirmada',monto_confirmado=p_monto,notas=nullif(trim(p_notas),''),fecha_confirmacion=now(),confirmado_por=auth.uid(),fecha_actualizacion=now() where id=p_id;
  if not found then raise exception 'REGISTRO_NO_ENCONTRADO'; end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.admin_mesa_regalos_reabrir(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
  update public.mesa_regalos_transferencias set estado='por_verificar',monto_confirmado=null,fecha_confirmacion=null,confirmado_por=null,fecha_actualizacion=now() where id=p_id;
  if not found then raise exception 'REGISTRO_NO_ENCONTRADO'; end if;
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.admin_mesa_regalos_resumen() from public;
revoke all on function public.admin_mesa_regalos_confirmar(bigint,numeric,text) from public;
revoke all on function public.admin_mesa_regalos_reabrir(bigint) from public;
grant execute on function public.admin_mesa_regalos_resumen() to authenticated;
grant execute on function public.admin_mesa_regalos_confirmar(bigint,numeric,text) to authenticated;
grant execute on function public.admin_mesa_regalos_reabrir(bigint) to authenticated;
commit;
