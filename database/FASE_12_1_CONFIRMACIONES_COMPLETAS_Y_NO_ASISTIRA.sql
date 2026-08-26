-- =========================================================
-- FASE 12.1 · CONFIRMACIONES COMPLETAS + NO ASISTIRÁ
-- 1) Reconstituye la fuente del módulo Confirmaciones.
-- 2) Corrige listados incompletos al leer directamente confirmaciones + invitados.
-- 3) Al consultar Confirmaciones después de la fecha límite, las invitaciones
--    activas sin respuesta se registran automáticamente como "no_asistira".
-- =========================================================

begin;

create or replace view private.admin_confirmaciones_gestion
with (security_barrier = true)
as
select
    i.id as invitado_id,
    i.codigo,
    i.nombre,
    i.grupo,
    i.activo as invitacion_activa,
    i.adultos_asignados,
    i.ninos_asignados,
    (i.adultos_asignados + i.ninos_asignados)::integer as cupo_total,
    c.estado,
    c.adultos_confirmados::integer,
    c.ninos_confirmados::integer,
    (c.adultos_confirmados + c.ninos_confirmados)::integer as total_confirmado,
    c.mensaje,
    c.fecha_confirmacion,
    c.fecha_actualizacion,
    exists (
        select 1
        from public.historial_confirmaciones h
        where h.invitado_id = i.id
          and h.accion = 'actualizada'
    ) as tiene_actualizaciones
from public.confirmaciones c
join public.invitados i on i.id = c.invitado_id;

revoke all on table private.admin_confirmaciones_gestion
from public, anon, authenticated;

create or replace function public.admin_listar_confirmaciones(
    p_busqueda text default null,
    p_grupo text default null,
    p_estado text default null,
    p_activo boolean default null,
    p_pagina integer default 1,
    p_tamano_pagina integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_busqueda text := nullif(trim(coalesce(p_busqueda, '')), '');
    v_grupo text := nullif(trim(coalesce(p_grupo, '')), '');
    v_estado text := nullif(trim(coalesce(p_estado, '')), '');
    v_fecha_limite timestamptz;
    v_total integer;
    v_total_paginas integer;
    v_offset integer;
    v_items jsonb;
begin
    if auth.uid() is null or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.' using errcode = '42501';
    end if;

    if p_pagina is null or p_pagina < 1 then
        raise exception 'PAGINA_INVALIDA' using errcode = '22023';
    end if;
    if p_tamano_pagina is null or p_tamano_pagina not in (10,20,50) then
        raise exception 'TAMANO_PAGINA_INVALIDO' using errcode = '22023';
    end if;
    if v_grupo is not null and v_grupo not in ('Familia Marcos','Familia Jess','Amigos Marcos','Amigos Jess') then
        raise exception 'GRUPO_INVALIDO' using errcode = '22023';
    end if;
    if v_estado is not null and v_estado not in ('confirmado','no_asistira') then
        raise exception 'ESTADO_INVALIDO' using errcode = '22023';
    end if;
    if v_busqueda is not null and char_length(v_busqueda) > 150 then
        raise exception 'BUSQUEDA_DEMASIADO_LARGA' using errcode = '22023';
    end if;

    -- Cierre automático: la primera consulta administrativa posterior al
    -- vencimiento materializa como "no asistirá" las invitaciones activas sin respuesta.
    select nullif(c.valor #>> '{}','')::timestamptz
      into v_fecha_limite
      from public.configuracion c
     where c.clave = 'fecha_limite_rsvp';

    if v_fecha_limite is not null and now() > v_fecha_limite then
        perform set_config('app.admin_confirmation_correction', 'true', true);
        perform set_config(
            'app.admin_confirmation_reason',
            'Sin respuesta al cierre de confirmaciones; marcado automáticamente como no asistirá.',
            true
        );

        insert into public.confirmaciones(
            invitado_id, adultos_confirmados, ninos_confirmados, mensaje, estado
        )
        select i.id, 0, 0, null, 'no_asistira'
          from public.invitados i
          left join public.confirmaciones c on c.invitado_id = i.id
         where i.activo = true
           and c.invitado_id is null
        on conflict (invitado_id) do nothing;
    end if;

    select count(*) into v_total
    from public.confirmaciones c
    join public.invitados i on i.id = c.invitado_id
    where (v_busqueda is null or i.nombre ilike '%'||v_busqueda||'%' or i.codigo ilike '%'||v_busqueda||'%' or i.grupo ilike '%'||v_busqueda||'%')
      and (v_grupo is null or i.grupo = v_grupo)
      and (v_estado is null or c.estado = v_estado)
      and (p_activo is null or i.activo = p_activo);

    v_total_paginas := case when v_total = 0 then 0 else ceil(v_total::numeric / p_tamano_pagina)::integer end;
    if v_total_paginas > 0 and p_pagina > v_total_paginas then
        raise exception 'PAGINA_FUERA_DE_RANGO' using errcode = '22023';
    end if;
    v_offset := (p_pagina - 1) * p_tamano_pagina;

    select coalesce(jsonb_agg(jsonb_build_object(
        'invitado_id', q.invitado_id,
        'codigo', q.codigo,
        'nombre', q.nombre,
        'grupo', q.grupo,
        'invitacion_activa', q.invitacion_activa,
        'cupo', jsonb_build_object('adultos', q.adultos_asignados, 'ninos', q.ninos_asignados, 'total', q.cupo_total),
        'confirmacion', jsonb_build_object(
            'estado', q.estado,
            'adultos', q.adultos_confirmados,
            'ninos', q.ninos_confirmados,
            'total', q.total_confirmado,
            'tiene_mensaje', q.mensaje is not null,
            'tiene_actualizaciones', q.tiene_actualizaciones,
            'fecha_confirmacion', q.fecha_confirmacion,
            'fecha_actualizacion', q.fecha_actualizacion
        )
    ) order by q.fecha_actualizacion desc, q.invitado_id desc), '[]'::jsonb)
    into v_items
    from (
        select
            i.id invitado_id, i.codigo, i.nombre, i.grupo, i.activo invitacion_activa,
            i.adultos_asignados::integer, i.ninos_asignados::integer,
            (i.adultos_asignados+i.ninos_asignados)::integer cupo_total,
            c.estado,
            c.adultos_confirmados::integer,
            c.ninos_confirmados::integer,
            (c.adultos_confirmados+c.ninos_confirmados)::integer total_confirmado,
            c.mensaje, c.fecha_confirmacion, c.fecha_actualizacion,
            exists(select 1 from public.historial_confirmaciones h where h.invitado_id=i.id and h.accion='actualizada') tiene_actualizaciones
        from public.confirmaciones c
        join public.invitados i on i.id = c.invitado_id
        where (v_busqueda is null or i.nombre ilike '%'||v_busqueda||'%' or i.codigo ilike '%'||v_busqueda||'%' or i.grupo ilike '%'||v_busqueda||'%')
          and (v_grupo is null or i.grupo = v_grupo)
          and (v_estado is null or c.estado = v_estado)
          and (p_activo is null or i.activo = p_activo)
        order by c.fecha_actualizacion desc, i.id desc
        limit p_tamano_pagina offset v_offset
    ) q;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object(
            'items',v_items,
            'pagination',jsonb_build_object(
                'page',p_pagina,
                'page_size',p_tamano_pagina,
                'total_items',v_total,
                'total_pages',v_total_paginas,
                'has_previous',p_pagina > 1,
                'has_next',v_total_paginas > 0 and p_pagina < v_total_paginas
            )
        )
    );
end;
$$;

revoke execute on function public.admin_listar_confirmaciones(text,text,text,boolean,integer,integer) from public, anon;
grant execute on function public.admin_listar_confirmaciones(text,text,text,boolean,integer,integer) to authenticated;

commit;
