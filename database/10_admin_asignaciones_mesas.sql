begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 2.1
-- Asignación de asistentes confirmados a mesas
--
-- Requiere:
--   09_admin_mesas.sql
--
-- Incluye:
--   - listar asistentes pendientes de asignar;
--   - detalle de una mesa;
--   - asignar una invitación completa o parcialmente;
--   - editar una asignación existente;
--   - retirar una asignación;
--   - validación de cupo de mesa;
--   - validación contra confirmación vigente;
--   - auditoría.
--
-- No modifica RSVP público, Invitados, Confirmaciones ni Dashboard.
-- =========================================================


-- =========================================================
-- 1. RPC: LISTAR INVITACIONES CON ASISTENTES PENDIENTES
--
-- Solo considera:
--   - invitación activa;
--   - confirmación vigente con estado = 'confirmado';
--   - al menos 1 adulto o niño todavía sin mesa.
-- =========================================================

create or replace function public.admin_listar_pendientes_mesa(
    p_busqueda text default null,
    p_grupo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_busqueda text := nullif(trim(coalesce(p_busqueda, '')), '');
    v_grupo text := nullif(trim(coalesce(p_grupo, '')), '');
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
                'invitado_id', q.invitado_id,
                'codigo', q.codigo,
                'nombre', q.nombre,
                'grupo', q.grupo,
                'confirmados', jsonb_build_object(
                    'adultos', q.adultos_confirmados,
                    'ninos', q.ninos_confirmados,
                    'total',
                        q.adultos_confirmados + q.ninos_confirmados
                ),
                'asignados', jsonb_build_object(
                    'adultos', q.adultos_asignados,
                    'ninos', q.ninos_asignados,
                    'total',
                        q.adultos_asignados + q.ninos_asignados
                ),
                'pendientes', jsonb_build_object(
                    'adultos',
                        greatest(
                            q.adultos_confirmados - q.adultos_asignados,
                            0
                        ),
                    'ninos',
                        greatest(
                            q.ninos_confirmados - q.ninos_asignados,
                            0
                        ),
                    'total',
                        greatest(
                            q.adultos_confirmados - q.adultos_asignados,
                            0
                        )
                        +
                        greatest(
                            q.ninos_confirmados - q.ninos_asignados,
                            0
                        )
                ),
                'confirmacion_version',
                    q.confirmacion_version
            )
            order by q.grupo, q.nombre, q.codigo
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select
            i.id as invitado_id,
            i.codigo,
            i.nombre,
            i.grupo,
            c.adultos_confirmados,
            c.ninos_confirmados,
            c.fecha_actualizacion as confirmacion_version,
            coalesce(
                sum(
                    case
                        when a.activo = true then a.adultos_asignados
                        else 0
                    end
                ),
                0
            )::integer as adultos_asignados,
            coalesce(
                sum(
                    case
                        when a.activo = true then a.ninos_asignados
                        else 0
                    end
                ),
                0
            )::integer as ninos_asignados
        from public.invitados as i
        join public.confirmaciones as c
            on c.invitado_id = i.id
        left join public.asignaciones_mesa as a
            on a.invitado_id = i.id
        where i.activo = true
          and c.estado = 'confirmado'
          and (
              v_busqueda is null
              or i.nombre ilike '%' || v_busqueda || '%'
              or i.codigo ilike '%' || v_busqueda || '%'
              or i.grupo ilike '%' || v_busqueda || '%'
          )
          and (
              v_grupo is null
              or i.grupo = v_grupo
          )
        group by
            i.id,
            i.codigo,
            i.nombre,
            i.grupo,
            c.adultos_confirmados,
            c.ninos_confirmados,
            c.fecha_actualizacion
        having
            greatest(
                c.adultos_confirmados
                -
                coalesce(
                    sum(
                        case
                            when a.activo = true then a.adultos_asignados
                            else 0
                        end
                    ),
                    0
                ),
                0
            )
            +
            greatest(
                c.ninos_confirmados
                -
                coalesce(
                    sum(
                        case
                            when a.activo = true then a.ninos_asignados
                            else 0
                        end
                    ),
                    0
                ),
                0
            ) > 0
    ) as q;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'items', v_items,
            'total', jsonb_array_length(v_items)
        )
    );
end;
$$;


-- =========================================================
-- 2. RPC: OBTENER DETALLE DE MESA
-- =========================================================

create or replace function public.admin_obtener_detalle_mesa(
    p_mesa_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_mesa public.mesas%rowtype;
    v_asignaciones jsonb;
    v_ocupados integer;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select *
    into v_mesa
    from public.mesas
    where id = p_mesa_id;

    if not found then
        raise exception 'MESA_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    select
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'asignacion_id', a.id,
                    'invitado_id', i.id,
                    'codigo', i.codigo,
                    'nombre', i.nombre,
                    'grupo', i.grupo,
                    'adultos', a.adultos_asignados,
                    'ninos', a.ninos_asignados,
                    'total',
                        a.adultos_asignados + a.ninos_asignados,
                    'asignacion_version', a.fecha_actualizacion
                )
                order by i.nombre, i.codigo
            ) filter (where a.id is not null),
            '[]'::jsonb
        ),
        coalesce(
            sum(
                case
                    when a.activo = true
                        then a.adultos_asignados + a.ninos_asignados
                    else 0
                end
            ),
            0
        )::integer
    into
        v_asignaciones,
        v_ocupados
    from public.mesas as m
    left join public.asignaciones_mesa as a
        on a.mesa_id = m.id
       and a.activo = true
    left join public.invitados as i
        on i.id = a.invitado_id
    where m.id = p_mesa_id
    group by m.id;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'mesa', jsonb_build_object(
                'id', v_mesa.id,
                'numero', v_mesa.numero,
                'nombre', v_mesa.nombre,
                'capacidad', v_mesa.capacidad,
                'ocupados', v_ocupados,
                'disponibles',
                    greatest(v_mesa.capacidad - v_ocupados, 0),
                'activo', v_mesa.activo,
                'version', v_mesa.fecha_actualizacion
            ),
            'asignaciones', v_asignaciones
        )
    );
end;
$$;


-- =========================================================
-- 3. RPC: ASIGNAR ASISTENTES A UNA MESA
--
-- Permite asignación parcial.
-- Ejemplo:
--   confirmados 3 adultos + 1 niño
--   Mesa 2 -> 2 adultos
--   Mesa 8 -> 1 adulto + 1 niño
--
-- Si ya existe una asignación activa del mismo invitado en la
-- misma mesa, esta función la reemplaza por los valores enviados.
-- =========================================================

create or replace function public.admin_asignar_mesa(
    p_mesa_id bigint,
    p_invitado_id bigint,
    p_adultos smallint,
    p_ninos smallint,
    p_motivo text
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

    v_mesa public.mesas%rowtype;
    v_invitado public.invitados%rowtype;
    v_confirmacion public.confirmaciones%rowtype;

    v_existente public.asignaciones_mesa%rowtype;
    v_asignacion public.asignaciones_mesa%rowtype;

    v_mesa_ocupada_sin_actual integer;
    v_adultos_asignados_otras integer;
    v_ninos_asignados_otras integer;

    v_total_nuevo integer;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_adultos is null
       or p_ninos is null
       or p_adultos < 0
       or p_ninos < 0
       or (p_adultos + p_ninos) <= 0 then
        raise exception 'ASIGNACION_INVALIDA'
            using errcode = '22023';
    end if;

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    select *
    into v_mesa
    from public.mesas
    where id = p_mesa_id
    for update;

    if not found then
        raise exception 'MESA_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_mesa.activo = false then
        raise exception 'MESA_INACTIVA'
            using errcode = '55000';
    end if;

    select *
    into v_invitado
    from public.invitados
    where id = p_invitado_id
    for update;

    if not found then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    if v_invitado.activo = false then
        raise exception 'INVITADO_INACTIVO'
            using errcode = '55000';
    end if;

    select *
    into v_confirmacion
    from public.confirmaciones
    where invitado_id = p_invitado_id
    for update;

    if not found then
        raise exception 'CONFIRMACION_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_confirmacion.estado <> 'confirmado' then
        raise exception 'INVITADO_NO_ASISTIRA'
            using errcode = '55000';
    end if;

    select *
    into v_existente
    from public.asignaciones_mesa
    where mesa_id = p_mesa_id
      and invitado_id = p_invitado_id
      and activo = true
    for update;

    select
        coalesce(
            sum(a.adultos_asignados),
            0
        )::integer,
        coalesce(
            sum(a.ninos_asignados),
            0
        )::integer
    into
        v_adultos_asignados_otras,
        v_ninos_asignados_otras
    from public.asignaciones_mesa as a
    where a.invitado_id = p_invitado_id
      and a.activo = true
      and (
          v_existente.id is null
          or a.id <> v_existente.id
      );

    if v_adultos_asignados_otras + p_adultos
       > v_confirmacion.adultos_confirmados then
        raise exception 'ADULTOS_EXCEDEN_CONFIRMACION'
            using errcode = '22023';
    end if;

    if v_ninos_asignados_otras + p_ninos
       > v_confirmacion.ninos_confirmados then
        raise exception 'NINOS_EXCEDEN_CONFIRMACION'
            using errcode = '22023';
    end if;

    select coalesce(
        sum(a.adultos_asignados + a.ninos_asignados),
        0
    )::integer
    into v_mesa_ocupada_sin_actual
    from public.asignaciones_mesa as a
    where a.mesa_id = p_mesa_id
      and a.activo = true
      and (
          v_existente.id is null
          or a.id <> v_existente.id
      );

    v_total_nuevo := p_adultos + p_ninos;

    if v_mesa_ocupada_sin_actual + v_total_nuevo
       > v_mesa.capacidad then
        raise exception 'CAPACIDAD_MESA_EXCEDIDA'
            using
                errcode = '22023',
                detail = format(
                    'La mesa tiene %s lugares disponibles y se intentan asignar %s.',
                    greatest(
                        v_mesa.capacidad - v_mesa_ocupada_sin_actual,
                        0
                    ),
                    v_total_nuevo
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

    if v_existente.id is null then
        insert into public.asignaciones_mesa (
            mesa_id,
            invitado_id,
            adultos_asignados,
            ninos_asignados,
            activo
        )
        values (
            p_mesa_id,
            p_invitado_id,
            p_adultos,
            p_ninos,
            true
        )
        returning *
        into v_asignacion;

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
            v_asignacion.id,
            'asignado',
            null,
            jsonb_build_object(
                'mesa_id', p_mesa_id,
                'invitado_id', p_invitado_id,
                'adultos', p_adultos,
                'ninos', p_ninos
            ),
            v_usuario_id,
            v_admin_nombre,
            v_motivo
        );
    else
        update public.asignaciones_mesa
        set
            adultos_asignados = p_adultos,
            ninos_asignados = p_ninos
        where id = v_existente.id
        returning *
        into v_asignacion;

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
            v_asignacion.id,
            'reasignado',
            jsonb_build_object(
                'mesa_id', v_existente.mesa_id,
                'invitado_id', v_existente.invitado_id,
                'adultos', v_existente.adultos_asignados,
                'ninos', v_existente.ninos_asignados
            ),
            jsonb_build_object(
                'mesa_id', p_mesa_id,
                'invitado_id', p_invitado_id,
                'adultos', p_adultos,
                'ninos', p_ninos
            ),
            v_usuario_id,
            v_admin_nombre,
            v_motivo
        );
    end if;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'asignacion_id', v_asignacion.id,
            'mesa_id', v_asignacion.mesa_id,
            'invitado_id', v_asignacion.invitado_id,
            'adultos', v_asignacion.adultos_asignados,
            'ninos', v_asignacion.ninos_asignados,
            'total',
                v_asignacion.adultos_asignados
                + v_asignacion.ninos_asignados,
            'version', v_asignacion.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 4. RPC: RETIRAR UNA ASIGNACIÓN
--
-- Borrado lógico. No elimina registros.
-- =========================================================

create or replace function public.admin_retirar_asignacion_mesa(
    p_asignacion_id bigint,
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

    v_anterior public.asignaciones_mesa%rowtype;
    v_nueva public.asignaciones_mesa%rowtype;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
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
    into v_anterior
    from public.asignaciones_mesa
    where id = p_asignacion_id
    for update;

    if not found then
        raise exception 'ASIGNACION_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_anterior.activo = false then
        raise exception 'ASIGNACION_YA_INACTIVA'
            using errcode = '55000';
    end if;

    if v_anterior.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = '40001';
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

    update public.asignaciones_mesa
    set activo = false
    where id = p_asignacion_id
    returning *
    into v_nueva;

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
        p_asignacion_id,
        'asignacion_retirada',
        jsonb_build_object(
            'mesa_id', v_anterior.mesa_id,
            'invitado_id', v_anterior.invitado_id,
            'adultos', v_anterior.adultos_asignados,
            'ninos', v_anterior.ninos_asignados,
            'activo', true
        ),
        jsonb_build_object(
            'mesa_id', v_nueva.mesa_id,
            'invitado_id', v_nueva.invitado_id,
            'adultos', v_nueva.adultos_asignados,
            'ninos', v_nueva.ninos_asignados,
            'activo', false
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'removed', true,
            'asignacion_id', p_asignacion_id
        )
    );
end;
$$;


-- =========================================================
-- 5. RPC: HISTORIAL DE ASIGNACIONES / MESAS
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
    v_limite integer := greatest(1, least(coalesce(p_limite, 100), 500));
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
        select *
        from public.historial_mesas
        order by fecha_evento desc, id desc
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
-- 6. PERMISOS
-- =========================================================

revoke execute on function public.admin_listar_pendientes_mesa(
    text,
    text
)
from public, anon;

grant execute on function public.admin_listar_pendientes_mesa(
    text,
    text
)
to authenticated;

revoke execute on function public.admin_obtener_detalle_mesa(
    bigint
)
from public, anon;

grant execute on function public.admin_obtener_detalle_mesa(
    bigint
)
to authenticated;

revoke execute on function public.admin_asignar_mesa(
    bigint,
    bigint,
    smallint,
    smallint,
    text
)
from public, anon;

grant execute on function public.admin_asignar_mesa(
    bigint,
    bigint,
    smallint,
    smallint,
    text
)
to authenticated;

revoke execute on function public.admin_retirar_asignacion_mesa(
    bigint,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_retirar_asignacion_mesa(
    bigint,
    text,
    timestamptz
)
to authenticated;

revoke execute on function public.admin_historial_mesas(
    integer
)
from public, anon;

grant execute on function public.admin_historial_mesas(
    integer
)
to authenticated;

commit;
