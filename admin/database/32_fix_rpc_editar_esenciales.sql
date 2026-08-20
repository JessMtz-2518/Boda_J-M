begin;

-- =========================================================
-- BODA J&M 2027
-- FIX 9.2.5 · RPC DE EDICIÓN DE ESENCIALES
-- Ejecutar una sola vez en Supabase.
-- =========================================================

drop function if exists public.admin_esenciales_editar(bigint,text,text);

create function public.admin_esenciales_editar(
  p_id bigint,
  p_titulo text,
  p_categoria text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_categoria text := btrim(coalesce(p_categoria, ''));
begin
  if not private.es_administrador_activo() then
    raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
  end if;

  if char_length(v_titulo) < 1 or char_length(v_titulo) > 180 then
    raise exception 'TITULO_ESENCIAL_INVALIDO';
  end if;

  if char_length(v_categoria) < 1 or char_length(v_categoria) > 80 then
    raise exception 'CATEGORIA_ESENCIAL_INVALIDA';
  end if;

  update public.wedding_esenciales
     set titulo = v_titulo,
         categoria = v_categoria,
         fecha_actualizacion = now()
   where id = p_id;

  if not found then
    raise exception 'ESENCIAL_NO_ENCONTRADO';
  end if;

  return jsonb_build_object(
    'schema_version', '1.0',
    'generated_at', now(),
    'data', jsonb_build_object(
      'ok', true,
      'id', p_id,
      'titulo', v_titulo,
      'categoria', v_categoria
    )
  );
end;
$$;

revoke execute on function public.admin_esenciales_editar(bigint,text,text) from public, anon;
grant execute on function public.admin_esenciales_editar(bigint,text,text) to authenticated;

commit;

-- Fuerza a PostgREST / Supabase a refrescar el schema cache.
notify pgrst, 'reload schema';
