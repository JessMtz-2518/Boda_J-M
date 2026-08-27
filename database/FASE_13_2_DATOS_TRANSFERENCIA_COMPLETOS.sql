begin;

create table if not exists public.mesa_regalos_configuracion (
  id smallint primary key default 1 check (id=1),
  banco text not null,
  titular text not null,
  clabe text,
  cuenta text,
  tarjeta text,
  fecha_actualizacion timestamptz not null default now(),
  actualizado_por uuid
);
alter table public.mesa_regalos_configuracion enable row level security;
revoke all on table public.mesa_regalos_configuracion from anon, authenticated;

insert into public.mesa_regalos_configuracion(id,banco,titular,clabe,cuenta,tarjeta)
values(1,'Nombre del banco','Nombre del titular','000000000000000000',null,null)
on conflict(id) do nothing;

alter table public.mesa_regalos_transferencias
  add column if not exists copias_clabe integer not null default 0,
  add column if not exists copias_cuenta integer not null default 0,
  add column if not exists copias_tarjeta integer not null default 0,
  add column if not exists ultimo_dato_copiado text;

-- Conserva las copias históricas de la fase anterior como copias de CLABE.
update public.mesa_regalos_transferencias
set copias_clabe=veces_clabe_copiada
where copias_clabe=0 and veces_clabe_copiada>0;

create or replace function public.obtener_datos_bancarios_regalos()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('schema_version','1.0','data',
   jsonb_build_object('banco',banco,'titular',titular,'clabe',clabe,'cuenta',cuenta,'tarjeta',tarjeta))
 from public.mesa_regalos_configuracion where id=1;
$$;

create or replace function public.registrar_copia_dato_transferencia(p_token uuid,p_tipo text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint; v_tipo text:=lower(trim(p_tipo)); v_total integer;
begin
 if v_tipo not in ('clabe','cuenta','tarjeta') then raise exception 'TIPO_COPIA_INVALIDO'; end if;
 select id into v_id from public.invitados where token_acceso=p_token and activo=true;
 if v_id is null then raise exception 'INVITACION_NO_DISPONIBLE'; end if;

 insert into public.mesa_regalos_transferencias(invitado_id,veces_clabe_copiada,copias_clabe,copias_cuenta,copias_tarjeta,ultimo_dato_copiado)
 values(v_id,1,case when v_tipo='clabe' then 1 else 0 end,case when v_tipo='cuenta' then 1 else 0 end,case when v_tipo='tarjeta' then 1 else 0 end,v_tipo)
 on conflict(invitado_id) do update set
   veces_clabe_copiada=mesa_regalos_transferencias.veces_clabe_copiada+1,
   copias_clabe=mesa_regalos_transferencias.copias_clabe+(case when v_tipo='clabe' then 1 else 0 end),
   copias_cuenta=mesa_regalos_transferencias.copias_cuenta+(case when v_tipo='cuenta' then 1 else 0 end),
   copias_tarjeta=mesa_regalos_transferencias.copias_tarjeta+(case when v_tipo='tarjeta' then 1 else 0 end),
   ultimo_dato_copiado=v_tipo,ultima_copia=now(),fecha_actualizacion=now();

 select veces_clabe_copiada into v_total from public.mesa_regalos_transferencias where invitado_id=v_id;
 return jsonb_build_object('ok',true,'veces_copiada',v_total,'tipo',v_tipo);
end; $$;

create or replace function public.admin_mesa_regalos_datos_bancarios()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.mesa_regalos_configuracion%rowtype;
begin
 if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
 select * into r from public.mesa_regalos_configuracion where id=1;
 return jsonb_build_object('schema_version','1.0','data',jsonb_build_object('banco',r.banco,'titular',r.titular,'clabe',r.clabe,'cuenta',r.cuenta,'tarjeta',r.tarjeta));
end; $$;

create or replace function public.admin_mesa_regalos_actualizar_datos_bancarios(p_banco text,p_titular text,p_clabe text,p_cuenta text,p_tarjeta text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare c text:=nullif(regexp_replace(coalesce(p_clabe,''),'\D','','g'),''); a text:=nullif(regexp_replace(coalesce(p_cuenta,''),'\D','','g'),''); t text:=nullif(regexp_replace(coalesce(p_tarjeta,''),'\D','','g'),'');
begin
 if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
 if nullif(trim(p_banco),'') is null then raise exception 'BANCO_REQUERIDO'; end if;
 if nullif(trim(p_titular),'') is null then raise exception 'TITULAR_REQUERIDO'; end if;
 if c is not null and length(c)<>18 then raise exception 'CLABE_INVALIDA'; end if;
 if t is not null and (length(t)<13 or length(t)>19) then raise exception 'TARJETA_INVALIDA'; end if;
 if c is null and a is null and t is null then raise exception 'DATO_TRANSFERENCIA_REQUERIDO'; end if;
 insert into public.mesa_regalos_configuracion(id,banco,titular,clabe,cuenta,tarjeta,fecha_actualizacion,actualizado_por)
 values(1,trim(p_banco),trim(p_titular),c,a,t,now(),auth.uid())
 on conflict(id) do update set banco=excluded.banco,titular=excluded.titular,clabe=excluded.clabe,cuenta=excluded.cuenta,tarjeta=excluded.tarjeta,fecha_actualizacion=now(),actualizado_por=auth.uid();
 return jsonb_build_object('schema_version','1.0','data',jsonb_build_object('banco',trim(p_banco),'titular',trim(p_titular),'clabe',c,'cuenta',a,'tarjeta',t));
end; $$;

create or replace function public.admin_mesa_regalos_resumen()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_data jsonb;
begin
 if auth.uid() is null or not private.es_administrador_activo() then raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO'; end if;
 select jsonb_build_object(
  'resumen',jsonb_build_object('datos_copiados',count(*),'clabe_copiada',count(*),'por_verificar',count(*) filter(where m.estado='por_verificar'),'confirmadas',count(*) filter(where m.estado='confirmada'),'monto_confirmado',coalesce(sum(m.monto_confirmado) filter(where m.estado='confirmada'),0)),
  'registros',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'invitado_id',i.id,'invitado',i.nombre,'codigo',i.codigo,'grupo',i.grupo,'veces_copiada',m.veces_clabe_copiada,'copias_clabe',m.copias_clabe,'copias_cuenta',m.copias_cuenta,'copias_tarjeta',m.copias_tarjeta,'ultimo_dato_copiado',m.ultimo_dato_copiado,'primera_copia',m.primera_copia,'ultima_copia',m.ultima_copia,'estado',m.estado,'monto_confirmado',m.monto_confirmado,'notas',m.notas,'fecha_confirmacion',m.fecha_confirmacion) order by m.ultima_copia desc),'[]'::jsonb)
 ) into v_data from public.mesa_regalos_transferencias m join public.invitados i on i.id=m.invitado_id;
 return jsonb_build_object('schema_version','1.0','generated_at',now(),'data',v_data);
end; $$;

revoke all on function public.obtener_datos_bancarios_regalos() from public;
revoke all on function public.registrar_copia_dato_transferencia(uuid,text) from public;
revoke all on function public.admin_mesa_regalos_datos_bancarios() from public;
revoke all on function public.admin_mesa_regalos_actualizar_datos_bancarios(text,text,text,text,text) from public;
grant execute on function public.obtener_datos_bancarios_regalos() to anon,authenticated;
grant execute on function public.registrar_copia_dato_transferencia(uuid,text) to anon,authenticated;
grant execute on function public.admin_mesa_regalos_datos_bancarios() to authenticated;
grant execute on function public.admin_mesa_regalos_actualizar_datos_bancarios(text,text,text,text,text) to authenticated;

commit;