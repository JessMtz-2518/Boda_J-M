begin;

create or replace function public.registrar_copia_clabe(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_veces integer;
begin
  select id
    into v_id
  from public.invitados
  where token_acceso = p_token
    and activo = true;

  if v_id is null then
    raise exception 'INVITACION_NO_DISPONIBLE';
  end if;

  -- Primero intentamos incrementar un registro existente.
  update public.mesa_regalos_transferencias
     set veces_clabe_copiada = veces_clabe_copiada + 1,
         ultima_copia = now(),
         fecha_actualizacion = now()
   where invitado_id = v_id
   returning veces_clabe_copiada into v_veces;

  -- Si aún no existía, registramos la primera copia.
  if not found then
    insert into public.mesa_regalos_transferencias (
      invitado_id,
      veces_clabe_copiada,
      primera_copia,
      ultima_copia,
      fecha_actualizacion
    )
    values (
      v_id,
      1,
      now(),
      now(),
      now()
    )
    returning veces_clabe_copiada into v_veces;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invitado_id', v_id,
    'veces_copiada', v_veces
  );
end;
$$;

revoke all on function public.registrar_copia_clabe(uuid) from public;
grant execute on function public.registrar_copia_clabe(uuid) to anon, authenticated;

commit;
