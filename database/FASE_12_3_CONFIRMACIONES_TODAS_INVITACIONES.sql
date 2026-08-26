-- =========================================================
-- FASE 12.3 · CONFIRMACIONES: TODAS LAS INVITACIONES
-- - Lista invitaciones con y sin respuesta.
-- - Distingue: confirmado, no_asistira, pendiente y vencido.
-- - No crea confirmaciones artificiales para quien nunca respondió.
-- =========================================================

begin;

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
    v_respondidas integer;
    v_pendientes integer;
    v_vencidas integer;
begin
    if auth.uid() is null or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.' using errcode = '42501';
    end if;
    if p_pagina is null or p_pagina < 1 then raise exception 'PAGINA_INVALIDA' using errcode='22023'; end if;
    if p_tamano_pagina is null or p_tamano_pagina not in (10,20,50) then raise exception 'TAMANO_PAGINA_INVALIDO' using errcode='22023'; end if;
    if v_grupo is not null and v_grupo not in ('Familia Marcos','Familia Jess','Amigos Marcos','Amigos Jess') then raise exception 'GRUPO_INVALIDO' using errcode='22023'; end if;
    if v_estado is not null and v_estado not in ('confirmado','no_asistira','pendiente','vencido') then raise exception 'ESTADO_INVALIDO' using errcode='22023'; end if;
    if v_busqueda is not null and char_length(v_busqueda) > 150 then raise exception 'BUSQUEDA_DEMASIADO_LARGA' using errcode='22023'; end if;

    select case
      when valor is null or nullif(valor #>> '{}','') is null then null
      else (valor #>> '{}')::timestamptz
    end
    into v_fecha_limite
    from public.configuracion
    where clave='fecha_limite_rsvp';

    with base as (
      select
        i.id invitado_id, i.codigo, i.nombre, i.grupo, i.activo invitacion_activa,
        i.adultos_asignados::integer adultos_asignados,
        i.ninos_asignados::integer ninos_asignados,
        (i.adultos_asignados+i.ninos_asignados)::integer cupo_total,
        c.invitado_id is not null respondida,
        case
          when c.invitado_id is not null then c.estado
          when v_fecha_limite is not null and now() > v_fecha_limite then 'vencido'
          else 'pendiente'
        end estado_ui,
        coalesce(c.adultos_confirmados,0)::integer adultos_confirmados,
        coalesce(c.ninos_confirmados,0)::integer ninos_confirmados,
        (coalesce(c.adultos_confirmados,0)+coalesce(c.ninos_confirmados,0))::integer total_confirmado,
        c.mensaje, c.fecha_confirmacion, c.fecha_actualizacion,
        case when c.invitado_id is null then false else exists(
          select 1 from public.historial_confirmaciones h
          where h.invitado_id=i.id and h.accion='actualizada'
        ) end tiene_actualizaciones
      from public.invitados i
      left join public.confirmaciones c on c.invitado_id=i.id
    ), filtrada as (
      select * from base
      where (v_busqueda is null or nombre ilike '%'||v_busqueda||'%' or codigo ilike '%'||v_busqueda||'%' or grupo ilike '%'||v_busqueda||'%')
        and (v_grupo is null or grupo=v_grupo)
        and (v_estado is null or estado_ui=v_estado)
        and (p_activo is null or invitacion_activa=p_activo)
    )
    select count(*),
           count(*) filter(where respondida),
           count(*) filter(where estado_ui='pendiente'),
           count(*) filter(where estado_ui='vencido')
    into v_total,v_respondidas,v_pendientes,v_vencidas
    from filtrada;

    v_total_paginas := case when v_total=0 then 0 else ceil(v_total::numeric/p_tamano_pagina)::integer end;
    if v_total_paginas>0 and p_pagina>v_total_paginas then raise exception 'PAGINA_FUERA_DE_RANGO' using errcode='22023'; end if;
    v_offset := (p_pagina-1)*p_tamano_pagina;

    with base as (
      select
        i.id invitado_id, i.codigo, i.nombre, i.grupo, i.activo invitacion_activa,
        i.adultos_asignados::integer adultos_asignados,
        i.ninos_asignados::integer ninos_asignados,
        (i.adultos_asignados+i.ninos_asignados)::integer cupo_total,
        c.invitado_id is not null respondida,
        case
          when c.invitado_id is not null then c.estado
          when v_fecha_limite is not null and now() > v_fecha_limite then 'vencido'
          else 'pendiente'
        end estado_ui,
        coalesce(c.adultos_confirmados,0)::integer adultos_confirmados,
        coalesce(c.ninos_confirmados,0)::integer ninos_confirmados,
        (coalesce(c.adultos_confirmados,0)+coalesce(c.ninos_confirmados,0))::integer total_confirmado,
        c.mensaje, c.fecha_confirmacion, c.fecha_actualizacion,
        case when c.invitado_id is null then false else exists(
          select 1 from public.historial_confirmaciones h
          where h.invitado_id=i.id and h.accion='actualizada'
        ) end tiene_actualizaciones
      from public.invitados i
      left join public.confirmaciones c on c.invitado_id=i.id
    ), filtrada as (
      select * from base
      where (v_busqueda is null or nombre ilike '%'||v_busqueda||'%' or codigo ilike '%'||v_busqueda||'%' or grupo ilike '%'||v_busqueda||'%')
        and (v_grupo is null or grupo=v_grupo)
        and (v_estado is null or estado_ui=v_estado)
        and (p_activo is null or invitacion_activa=p_activo)
    ), pagina as (
      select * from filtrada
      order by respondida desc, fecha_actualizacion desc nulls last, nombre asc, invitado_id asc
      limit p_tamano_pagina offset v_offset
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'invitado_id',p.invitado_id,
        'codigo',p.codigo,
        'nombre',p.nombre,
        'grupo',p.grupo,
        'invitacion_activa',p.invitacion_activa,
        'cupo',jsonb_build_object('adultos',p.adultos_asignados,'ninos',p.ninos_asignados,'total',p.cupo_total),
        'confirmacion',jsonb_build_object(
            'estado',p.estado_ui,
            'respondida',p.respondida,
            'adultos',p.adultos_confirmados,
            'ninos',p.ninos_confirmados,
            'total',p.total_confirmado,
            'tiene_mensaje',p.mensaje is not null,
            'tiene_actualizaciones',p.tiene_actualizaciones,
            'fecha_confirmacion',p.fecha_confirmacion,
            'fecha_actualizacion',p.fecha_actualizacion
        )
    ) order by p.respondida desc,p.fecha_actualizacion desc nulls last,p.nombre asc,p.invitado_id asc),'[]'::jsonb)
    into v_items
    from pagina p;

    return jsonb_build_object(
      'schema_version','1.0',
      'generated_at',now(),
      'data',jsonb_build_object(
        'items',v_items,
        'summary',jsonb_build_object(
          'respondidas',coalesce(v_respondidas,0),
          'pendientes',coalesce(v_pendientes,0),
          'vencidas',coalesce(v_vencidas,0)
        ),
        'pagination',jsonb_build_object(
          'page',p_pagina,
          'page_size',p_tamano_pagina,
          'total_items',v_total,
          'total_pages',v_total_paginas,
          'has_previous',p_pagina>1,
          'has_next',v_total_paginas>0 and p_pagina<v_total_paginas
        )
      )
    );
end;
$$;

revoke execute on function public.admin_listar_confirmaciones(text,text,text,boolean,integer,integer) from public, anon;
grant execute on function public.admin_listar_confirmaciones(text,text,text,boolean,integer,integer) to authenticated;

commit;
