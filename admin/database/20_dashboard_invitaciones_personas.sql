begin;

create or replace function public.admin_dashboard_operativo(
    p_limite_actividad integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_limite integer := greatest(1, least(coalesce(p_limite_actividad, 8), 20));
    v_invitaciones_activas integer;
    v_invitaciones_pendientes integer;
    v_adultos_invitados integer;
    v_ninos_invitados integer;
    v_personas_invitadas integer;
    v_adultos_confirmados integer;
    v_ninos_confirmados integer;
    v_personas_confirmadas integer;
    v_personas_asignadas integer;
    v_pendientes_mesa integer;
    v_mesas_activas integer;
    v_capacidad_mesas integer;
    v_actividad jsonb;
begin
    if auth.uid() is null or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select
        count(*) filter (where i.activo = true)::integer,
        count(*) filter (where i.activo = true and c.invitado_id is null)::integer
    into v_invitaciones_activas, v_invitaciones_pendientes
    from public.invitados i
    left join public.confirmaciones c on c.invitado_id = i.id;


    select
        coalesce(sum(case when i.activo = true then i.adultos_asignados else 0 end),0)::integer,
        coalesce(sum(case when i.activo = true then i.ninos_asignados else 0 end),0)::integer
    into v_adultos_invitados, v_ninos_invitados
    from public.invitados i;

    v_personas_invitadas := v_adultos_invitados + v_ninos_invitados;

    select
        coalesce(sum(case when i.activo = true and c.estado = 'confirmado' then c.adultos_confirmados else 0 end),0)::integer,
        coalesce(sum(case when i.activo = true and c.estado = 'confirmado' then c.ninos_confirmados else 0 end),0)::integer
    into v_adultos_confirmados, v_ninos_confirmados
    from public.confirmaciones c
    join public.invitados i on i.id = c.invitado_id;

    v_personas_confirmadas := v_adultos_confirmados + v_ninos_confirmados;

    select coalesce(sum(case when a.activo = true and i.activo = true then a.adultos_asignados + a.ninos_asignados else 0 end),0)::integer
    into v_personas_asignadas
    from public.asignaciones_mesa a
    join public.invitados i on i.id = a.invitado_id;

    v_pendientes_mesa := greatest(v_personas_confirmadas - v_personas_asignadas, 0);

    select
        count(*) filter (where m.activo = true)::integer,
        coalesce(sum(case when m.activo = true then m.capacidad else 0 end),0)::integer
    into v_mesas_activas, v_capacidad_mesas
    from public.mesas m;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'tipo', q.tipo,
            'accion', q.accion,
            'titulo', q.titulo,
            'detalle', q.detalle,
            'actor', q.actor,
            'motivo', q.motivo,
            'fecha_evento', q.fecha_evento
        )
        order by q.fecha_evento desc, q.orden_id desc
    ), '[]'::jsonb)
    into v_actividad
    from (
        select *
        from (
            select
                'invitado'::text tipo,
                h.accion,
                coalesce(i.nombre,'Invitado')::text titulo,
                concat_ws(' · ', i.codigo, i.grupo)::text detalle,
                h.administrador_nombre::text actor,
                h.motivo::text motivo,
                h.fecha_evento,
                (3000000000000 + h.id)::bigint orden_id
            from public.historial_invitados h
            join public.invitados i on i.id = h.invitado_id

            union all

            select
                'confirmacion'::text tipo,
                h.accion,
                coalesce(i.nombre,'Invitado')::text titulo,
                concat_ws(
                    ' · ',
                    i.codigo,
                    case
                        when h.datos_nuevos ->> 'estado' = 'confirmado' then 'Asistirá'
                        when h.datos_nuevos ->> 'estado' = 'no_asistira' then 'No asistirá'
                        else null
                    end
                )::text detalle,
                coalesce(h.administrador_nombre, case when h.origen = 'invitado' then 'Invitado' else 'Sistema' end)::text actor,
                h.motivo::text motivo,
                h.fecha_evento,
                (2000000000000 + h.id)::bigint orden_id
            from public.historial_confirmaciones h
            join public.invitados i on i.id = h.invitado_id

            union all

            select
                'mesa'::text tipo,
                h.accion,
                case
                    when h.tipo_entidad = 'asignacion' then coalesce(i.nombre,'Asignación de mesa')
                    when h.tipo_entidad = 'mesa' then coalesce(m.nombre,'Mesa')
                    else 'Configuración de mesas'
                end::text titulo,
                case
                    when h.tipo_entidad = 'asignacion' then concat_ws(' · ', i.codigo, m.nombre)
                    when h.tipo_entidad = 'mesa' then concat_ws(' · ', 'Mesa ' || m.numero, m.ubicacion)
                    else null
                end::text detalle,
                coalesce(h.administrador_nombre,'Sistema')::text actor,
                h.motivo::text motivo,
                h.fecha_evento,
                (1000000000000 + h.id)::bigint orden_id
            from public.historial_mesas h
            left join public.asignaciones_mesa a
              on h.tipo_entidad = 'asignacion' and a.id = h.entidad_id
            left join public.invitados i on i.id = a.invitado_id
            left join public.mesas m
              on (h.tipo_entidad = 'mesa' and m.id = h.entidad_id)
              or (h.tipo_entidad = 'asignacion' and m.id = a.mesa_id)
        ) actividad
        order by fecha_evento desc, orden_id desc
        limit v_limite
    ) q;

    return jsonb_build_object(
        'schema_version','1.1',
        'generated_at',now(),
        'data',jsonb_build_object(
            'indicadores',jsonb_build_object(
                'invitaciones_activas',v_invitaciones_activas,
                'personas_invitadas',v_personas_invitadas,
                'adultos_invitados',v_adultos_invitados,
                'ninos_invitados',v_ninos_invitados,
                'personas_confirmadas',v_personas_confirmadas,
                'adultos_confirmados',v_adultos_confirmados,
                'ninos_confirmados',v_ninos_confirmados,
                'invitaciones_pendientes',v_invitaciones_pendientes,
                'pendientes_mesa',v_pendientes_mesa
            ),
            'mesas',jsonb_build_object(
                'activas',v_mesas_activas,
                'capacidad_total',v_capacidad_mesas,
                'personas_asignadas',v_personas_asignadas
            ),
            'actividad',v_actividad
        )
    );
end;
$$;

revoke execute on function public.admin_dashboard_operativo(integer)
from public, anon;

grant execute on function public.admin_dashboard_operativo(integer)
to authenticated;

commit;
