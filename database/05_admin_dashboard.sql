begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 3.3 · CAPA ADMINISTRATIVA DE DATOS
-- Revisar y ejecutar manualmente. No concede acceso directo a tablas.
-- =========================================================

-- =========================================================
-- 1. INDICES DE SOPORTE
-- =========================================================

create index if not exists confirmaciones_actividad_idx
    on public.confirmaciones (fecha_actualizacion desc, invitado_id);

create index if not exists invitados_grupo_activos_idx
    on public.invitados (grupo)
    where activo = true;

create index if not exists historial_actividad_admin_idx
    on public.historial_confirmaciones (
        fecha_evento desc,
        accion,
        invitado_id
    );


-- =========================================================
-- 2. PROYECCION INTERNA COMPARTIDA
-- Solo contiene invitaciones activas y su respuesta vigente.
-- No se expone al navegador.
-- =========================================================

create or replace view private.admin_invitaciones_estado
with (security_barrier = true)
as
select
    i.id as invitacion_id,
    i.codigo,
    i.nombre,
    i.grupo,
    i.adultos_asignados as adultos_reservados,
    i.ninos_asignados as ninos_reservados,
    (c.invitado_id is not null) as tiene_respuesta,
    c.estado,
    coalesce(c.adultos_confirmados, 0)::integer
        as adultos_confirmados,
    coalesce(c.ninos_confirmados, 0)::integer
        as ninos_confirmados,
    exists (
        select 1
        from public.historial_confirmaciones as h
        where h.invitado_id = i.id
          and h.accion = 'actualizada'
    ) as tiene_actualizaciones,
    c.fecha_confirmacion as fecha_primera_respuesta,
    c.fecha_actualizacion as fecha_ultima_actividad
from public.invitados as i
left join public.confirmaciones as c
    on c.invitado_id = i.id
where i.activo = true;

revoke all on table private.admin_invitaciones_estado
from public, anon, authenticated;


-- =========================================================
-- 3. RPC: RESUMEN GLOBAL DEL DASHBOARD
-- =========================================================

create or replace function public.admin_dashboard_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_data jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'invitaciones', jsonb_build_object(
            'activas', count(*),
            'con_respuesta', count(*) filter (
                where e.tiene_respuesta
            ),
            'pendientes', count(*) filter (
                where not e.tiene_respuesta
            ),
            'asistiran', count(*) filter (
                where e.estado = 'confirmado'
            ),
            'no_asistiran', count(*) filter (
                where e.estado = 'no_asistira'
            )
        ),
        'cupo', jsonb_build_object(
            'adultos_reservados',
                coalesce(sum(e.adultos_reservados), 0),
            'ninos_reservados',
                coalesce(sum(e.ninos_reservados), 0),
            'total_reservado',
                coalesce(sum(
                    e.adultos_reservados
                    + e.ninos_reservados
                ), 0)
        ),
        'asistencia', jsonb_build_object(
            'adultos_confirmados',
                coalesce(sum(e.adultos_confirmados), 0),
            'ninos_confirmados',
                coalesce(sum(e.ninos_confirmados), 0),
            'total_confirmado',
                coalesce(sum(
                    e.adultos_confirmados
                    + e.ninos_confirmados
                ), 0)
        ),
        'porcentajes', jsonb_build_object(
            'respuesta',
                case
                    when count(*) = 0 then 0.00
                    else round(
                        count(*) filter (where e.tiene_respuesta)
                        * 100.0 / count(*),
                        2
                    )
                end,
            'ocupacion',
                case
                    when coalesce(sum(
                        e.adultos_reservados
                        + e.ninos_reservados
                    ), 0) = 0 then 0.00
                    else round(
                        coalesce(sum(
                            e.adultos_confirmados
                            + e.ninos_confirmados
                        ), 0)
                        * 100.0
                        / sum(
                            e.adultos_reservados
                            + e.ninos_reservados
                        ),
                        2
                    )
                end
        ),
        'actividad', jsonb_build_object(
            'ultima_confirmacion_at',
                max(e.fecha_ultima_actividad),
            'tiempo_promedio_respuesta_horas', null,
            'tiempo_promedio_disponible', false,
            'motivo_no_disponible',
                'No existe fecha de envío de la invitación.'
        )
    )
    into v_data
    from private.admin_invitaciones_estado as e;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', v_data
    );
end;
$$;

revoke execute on function
public.admin_dashboard_resumen()
from public, anon;

grant execute on function
public.admin_dashboard_resumen()
to authenticated;


-- =========================================================
-- 4. RPC: CONFIRMACIONES RECIENTES
-- Limite configurable entre 1 y 50; valor por defecto 10.
-- =========================================================

create or replace function public.admin_dashboard_confirmaciones_recientes(
    p_limite integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_items jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_limite is null or p_limite < 1 or p_limite > 50 then
        raise exception 'p_limite debe estar entre 1 y 50.'
            using errcode = '22023';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'invitacion_id', r.invitacion_id,
                'codigo', r.codigo,
                'nombre', r.nombre,
                'grupo', r.grupo,
                'estado', r.estado,
                'adultos_confirmados',
                    r.adultos_confirmados,
                'ninos_confirmados',
                    r.ninos_confirmados,
                'total_confirmado',
                    r.adultos_confirmados
                    + r.ninos_confirmados,
                'fecha_primera_respuesta',
                    r.fecha_primera_respuesta,
                'fecha_ultima_actividad',
                    r.fecha_ultima_actividad,
                'es_actualizacion',
                    r.tiene_actualizaciones
            )
            order by
                r.fecha_ultima_actividad desc,
                r.invitacion_id desc
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select e.*
        from private.admin_invitaciones_estado as e
        where e.tiene_respuesta
        order by
            e.fecha_ultima_actividad desc,
            e.invitacion_id desc
        limit p_limite
    ) as r;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'items', v_items,
            'meta', jsonb_build_object(
                'limite', p_limite,
                'cantidad', jsonb_array_length(v_items)
            )
        )
    );
end;
$$;

revoke execute on function
public.admin_dashboard_confirmaciones_recientes(integer)
from public, anon;

grant execute on function
public.admin_dashboard_confirmaciones_recientes(integer)
to authenticated;


-- =========================================================
-- 5. RPC: ESTADISTICAS POR GRUPO
-- =========================================================

create or replace function public.admin_dashboard_estadisticas_grupo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_items jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    with grupos as (
        select
            e.grupo,
            count(*) as activas,
            count(*) filter (
                where e.tiene_respuesta
            ) as con_respuesta,
            count(*) filter (
                where not e.tiene_respuesta
            ) as pendientes,
            count(*) filter (
                where e.estado = 'confirmado'
            ) as asistiran,
            count(*) filter (
                where e.estado = 'no_asistira'
            ) as no_asistiran,
            coalesce(sum(e.adultos_reservados), 0)
                as adultos_reservados,
            coalesce(sum(e.ninos_reservados), 0)
                as ninos_reservados,
            coalesce(sum(e.adultos_confirmados), 0)
                as adultos_confirmados,
            coalesce(sum(e.ninos_confirmados), 0)
                as ninos_confirmados
        from private.admin_invitaciones_estado as e
        group by e.grupo
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'grupo', g.grupo,
                'invitaciones', jsonb_build_object(
                    'activas', g.activas,
                    'con_respuesta', g.con_respuesta,
                    'pendientes', g.pendientes,
                    'asistiran', g.asistiran,
                    'no_asistiran', g.no_asistiran
                ),
                'cupo', jsonb_build_object(
                    'adultos_reservados',
                        g.adultos_reservados,
                    'ninos_reservados',
                        g.ninos_reservados,
                    'total_reservado',
                        g.adultos_reservados
                        + g.ninos_reservados
                ),
                'asistencia', jsonb_build_object(
                    'adultos_confirmados',
                        g.adultos_confirmados,
                    'ninos_confirmados',
                        g.ninos_confirmados,
                    'total_confirmado',
                        g.adultos_confirmados
                        + g.ninos_confirmados
                ),
                'porcentajes', jsonb_build_object(
                    'respuesta',
                        case
                            when g.activas = 0 then 0.00
                            else round(
                                g.con_respuesta
                                * 100.0 / g.activas,
                                2
                            )
                        end,
                    'ocupacion',
                        case
                            when g.adultos_reservados
                                 + g.ninos_reservados = 0
                                then 0.00
                            else round(
                                (
                                    g.adultos_confirmados
                                    + g.ninos_confirmados
                                ) * 100.0
                                / (
                                    g.adultos_reservados
                                    + g.ninos_reservados
                                ),
                                2
                            )
                        end
                )
            )
            order by
                case g.grupo
                    when 'Familia Marcos' then 1
                    when 'Familia Jess' then 2
                    when 'Amigos Marcos' then 3
                    when 'Amigos Jess' then 4
                    else 5
                end,
                g.grupo
        ),
        '[]'::jsonb
    )
    into v_items
    from grupos as g;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object('items', v_items)
    );
end;
$$;

revoke execute on function
public.admin_dashboard_estadisticas_grupo()
from public, anon;

grant execute on function
public.admin_dashboard_estadisticas_grupo()
to authenticated;


-- =========================================================
-- 6. RPC: EVOLUCION DE LOS ULTIMOS 30 DIAS
-- Actividad: eventos ocurridos en el dia.
-- Estado al cierre: ultima version historica disponible al terminar el dia.
-- Siempre devuelve los 30 dias, incluidos dias con valores cero.
-- =========================================================

create or replace function public.admin_estadisticas_evolucion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_hasta date := (
        now() at time zone 'America/Mexico_City'
    )::date;
    v_desde date := v_hasta - 29;
    v_items jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    with dias as (
        select generate_series(
            v_desde::timestamp,
            v_hasta::timestamp,
            interval '1 day'
        )::date as fecha
    ),
    actividad as (
        select
            (
                h.fecha_evento
                at time zone 'America/Mexico_City'
            )::date as fecha,
            count(*) filter (
                where h.accion = 'creada'
            ) as primeras_respuestas,
            count(*) filter (
                where h.accion = 'actualizada'
            ) as modificaciones
        from public.historial_confirmaciones as h
        join private.admin_invitaciones_estado as e
            on e.invitacion_id = h.invitado_id
        where h.fecha_evento >= (
            v_desde::timestamp
            at time zone 'America/Mexico_City'
        )
          and h.fecha_evento < (
            (v_hasta + 1)::timestamp
            at time zone 'America/Mexico_City'
          )
        group by 1
    ),
    estado_diario as (
        select
            d.fecha,
            count(*) filter (
                where u.estado = 'confirmado'
            ) as invitaciones_asisten,
            count(*) filter (
                where u.estado = 'no_asistira'
            ) as invitaciones_no_asisten,
            coalesce(sum(u.adultos_confirmados), 0)
                as adultos_confirmados,
            coalesce(sum(u.ninos_confirmados), 0)
                as ninos_confirmados
        from dias as d
        left join lateral (
            select distinct on (h.invitado_id)
                h.invitado_id,
                h.datos_nuevos ->> 'estado' as estado,
                coalesce(
                    (h.datos_nuevos
                        ->> 'adultos_confirmados')::integer,
                    0
                ) as adultos_confirmados,
                coalesce(
                    (h.datos_nuevos
                        ->> 'ninos_confirmados')::integer,
                    0
                ) as ninos_confirmados
            from public.historial_confirmaciones as h
            join private.admin_invitaciones_estado as e
                on e.invitacion_id = h.invitado_id
            where h.fecha_evento < (
                (d.fecha + 1)::timestamp
                at time zone 'America/Mexico_City'
            )
            order by
                h.invitado_id,
                h.fecha_evento desc,
                h.id desc
        ) as u on true
        group by d.fecha
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'fecha', d.fecha,
                'actividad', jsonb_build_object(
                    'primeras_respuestas',
                        coalesce(a.primeras_respuestas, 0),
                    'modificaciones',
                        coalesce(a.modificaciones, 0)
                ),
                'estado_al_cierre', jsonb_build_object(
                    'invitaciones_asisten',
                        coalesce(e.invitaciones_asisten, 0),
                    'invitaciones_no_asisten',
                        coalesce(e.invitaciones_no_asisten, 0),
                    'adultos_confirmados',
                        coalesce(e.adultos_confirmados, 0),
                    'ninos_confirmados',
                        coalesce(e.ninos_confirmados, 0),
                    'asistentes_confirmados',
                        coalesce(e.adultos_confirmados, 0)
                        + coalesce(e.ninos_confirmados, 0)
                )
            )
            order by d.fecha
        ),
        '[]'::jsonb
    )
    into v_items
    from dias as d
    left join actividad as a
        on a.fecha = d.fecha
    left join estado_diario as e
        on e.fecha = d.fecha;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'periodo', jsonb_build_object(
                'desde', v_desde,
                'hasta', v_hasta,
                'dias', 30,
                'zona_horaria', 'America/Mexico_City'
            ),
            'items', v_items
        )
    );
end;
$$;

revoke execute on function
public.admin_estadisticas_evolucion()
from public, anon;

grant execute on function
public.admin_estadisticas_evolucion()
to authenticated;

commit;
