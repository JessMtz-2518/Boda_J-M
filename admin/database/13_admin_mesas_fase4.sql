begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 4
-- Reasignación directa + historial visual enriquecido
--
-- Requiere:
--   09_admin_mesas.sql
--   10_admin_asignaciones_mesas.sql
--   11_admin_editar_mesas.sql
-- =========================================================


-- =========================================================
-- 1. RPC: REASIGNAR DIRECTAMENTE UNA ASIGNACIÓN
--
-- Mueve una asignación activa de una mesa a otra sin tener
-- que retirarla primero.
--
-- Si el mismo invitado ya tiene una asignación activa en la
-- mesa destino, ambas asignaciones se consolidan.
-- =========================================================

create or replace function public.admin_reasignar_mesa(
    p_asignacion_id bigint,
    p_mesa_destino_id bigint,
    p_motivo text,
    p_version timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_usuario_id uuid := auth.uid();
    v_admin_nombre text;
    v_motivo text := trim(coalesce(p_motivo, ''));

    v_origen public.asignaciones_mesa%rowtype;
    v_destino public.mesas%rowtype;
    v_destino_existente public.asignaciones_mesa%rowtype;
    v_resultado public.asignaciones_mesa%rowtype;

    v_ocupacion_destino integer;
    v_total_mover integer;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_asignacion_id is null or p_asignacion_id < 1
       or p_mesa_destino_id is null or p_mesa_destino_id < 1 then
        raise exception 'REASIGNACION_INVALIDA'
            using errcode = '22023';
    end if;

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_version is null then
        raise exception 'VERSION_REQUERIDA'
            using errcode = '22023';
    end if;

    select *
    into v_origen
    from public.asignaciones_mesa
    where id = p_asignacion_id
    for update;

    if not found then
        raise exception 'ASIGNACION_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_origen.activo = false then
        raise exception 'ASIGNACION_YA_INACTIVA'
            using errcode = '55000';
    end if;

    if v_origen.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = '40001';
    end if;

    if v_origen.mesa_id = p_mesa_destino_id then
        raise exception 'MISMA_MESA_DESTINO'
            using errcode = '22023';
    end if;

    -- Bloqueo determinista de ambas mesas para reducir riesgo
    -- de deadlocks en operaciones simultáneas.
    perform 1
    from public.mesas as m
    where m.id in (v_origen.mesa_id, p_mesa_destino_id)
    order by m.id
    for update;

    select *
    into v_destino
    from public.mesas
    where id = p_mesa_destino_id;

    if not found then
        raise exception 'MESA_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_destino.activo = false then
        raise exception 'MESA_INACTIVA'
            using errcode = '55000';
    end if;

    select *
    into v_destino_existente
    from public.asignaciones_mesa
    where mesa_id = p_mesa_destino_id
      and invitado_id = v_origen.invitado_id
      and activo = true
    for update;

    select coalesce(
        sum(a.adultos_asignados + a.ninos_asignados),
        0
    )::integer
    into v_ocupacion_destino
    from public.asignaciones_mesa as a
    where a.mesa_id = p_mesa_destino_id
      and a.activo = true;

    v_total_mover :=
        v_origen.adultos_asignados + v_origen.ninos_asignados;

    if v_ocupacion_destino + v_total_mover > v_destino.capacidad then
        raise exception 'CAPACIDAD_MESA_EXCEDIDA'
            using
                errcode = '22023',
                detail = format(
                    'La mesa destino tiene %s lugares disponibles y la asignación requiere %s.',
                    greatest(v_destino.capacidad - v_ocupacion_destino, 0),
                    v_total_mover
                );
    end if;

    select a.nombre
    into v_admin_nombre
    from public.administradores as a
    where a.usuario_id = v_usuario_id
      and a.activo = true
      and a.rol = 'administrador';

    if v_admin_nombre is null then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if v_destino_existente.id is null then
        update public.asignaciones_mesa
        set mesa_id = p_mesa_destino_id
        where id = v_origen.id
        returning *
        into v_resultado;
    else
        update public.asignaciones_mesa
        set
            adultos_asignados =
                adultos_asignados + v_origen.adultos_asignados,
            ninos_asignados =
                ninos_asignados + v_origen.ninos_asignados
        where id = v_destino_existente.id
        returning *
        into v_resultado;

        update public.asignaciones_mesa
        set activo = false
        where id = v_origen.id;
    end if;

    insert into public.historial_mesas (
        tipo_entidad,
        entidad_id,
        accion,
        datos_anteriores,
        datos_nuevos,
        modificado_por,
        administrador_nombre,
        motivo
    )
    values (
        'asignacion',
        v_resultado.id,
        'reasignado',
        jsonb_build_object(
            'asignacion_origen_id', v_origen.id,
            'mesa_id', v_origen.mesa_id,
            'invitado_id', v_origen.invitado_id,
            'adultos', v_origen.adultos_asignados,
            'ninos', v_origen.ninos_asignados
        ),
        jsonb_build_object(
            'asignacion_id', v_resultado.id,
            'mesa_id', v_resultado.mesa_id,
            'invitado_id', v_resultado.invitado_id,
            'adultos', v_resultado.adultos_asignados,
            'ninos', v_resultado.ninos_asignados,
            'consolidada',
                v_destino_existente.id is not null
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'moved', true,
            'asignacion_id', v_resultado.id,
            'mesa_origen_id', v_origen.mesa_id,
            'mesa_destino_id', v_resultado.mesa_id,
            'invitado_id', v_resultado.invitado_id,
            'adultos', v_resultado.adultos_asignados,
            'ninos', v_resultado.ninos_asignados,
            'total',
                v_resultado.adultos_asignados
                + v_resultado.ninos_asignados,
            'consolidada',
                v_destino_existente.id is not null,
            'version', v_resultado.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 2. HISTORIAL VISUAL ENRIQUECIDO
-- =========================================================

create or replace function public.admin_historial_mesas(
    p_limite integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_limite integer :=
        greatest(1, least(coalesce(p_limite, 100), 500));
    v_items jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'tipo_entidad', q.tipo_entidad,
                'entidad_id', q.entidad_id,
                'accion', q.accion,
                'titulo', q.titulo,
                'detalle', q.detalle,
                'datos_anteriores', q.datos_anteriores,
                'datos_nuevos', q.datos_nuevos,
                'administrador_nombre', q.administrador_nombre,
                'motivo', q.motivo,
                'fecha_evento', q.fecha_evento
            )
            order by q.fecha_evento desc, q.id desc
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select
            h.id,
            h.tipo_entidad,
            h.entidad_id,
            h.accion,
            case
                when h.tipo_entidad = 'configuracion'
                    then 'Configuración general'
                when h.tipo_entidad = 'mesa'
                    then coalesce(
                        m.nombre,
                        'Mesa ' || coalesce(m.numero::text, '')
                    )
                when h.tipo_entidad = 'asignacion'
                    then coalesce(i.nombre, 'Asignación de invitado')
                else 'Mesas'
            end as titulo,
            case
                when h.tipo_entidad = 'mesa'
                    then concat_ws(
                        ' · ',
                        case when m.numero is not null
                            then 'Mesa ' || m.numero
                            else null
                        end,
                        m.ubicacion
                    )
                when h.tipo_entidad = 'asignacion'
                    then concat_ws(
                        ' · ',
                        i.codigo,
                        coalesce(
                            m.nombre,
                            case when m.numero is not null
                                then 'Mesa ' || m.numero
                                else null
                            end
                        )
                    )
                else null
            end as detalle,
            h.datos_anteriores,
            h.datos_nuevos,
            h.administrador_nombre,
            h.motivo,
            h.fecha_evento
        from public.historial_mesas as h
        left join public.mesas as m
            on (
                h.tipo_entidad = 'mesa'
                and m.id = h.entidad_id
            )
            or (
                h.tipo_entidad = 'asignacion'
                and m.id = coalesce(
                    nullif(h.datos_nuevos ->> 'mesa_id', '')::bigint,
                    nullif(h.datos_anteriores ->> 'mesa_id', '')::bigint
                )
            )
        left join public.invitados as i
            on h.tipo_entidad = 'asignacion'
           and i.id = coalesce(
                nullif(h.datos_nuevos ->> 'invitado_id', '')::bigint,
                nullif(h.datos_anteriores ->> 'invitado_id', '')::bigint
           )
        order by h.fecha_evento desc, h.id desc
        limit v_limite
    ) as q;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'items', v_items
        )
    );
end;
$$;


-- =========================================================
-- 3. PERMISOS
-- =========================================================

revoke execute on function public.admin_reasignar_mesa(
    bigint,
    bigint,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_reasignar_mesa(
    bigint,
    bigint,
    text,
    timestamptz
)
to authenticated;

revoke execute on function public.admin_historial_mesas(integer)
from public, anon;

grant execute on function public.admin_historial_mesas(integer)
to authenticated;

commit;
