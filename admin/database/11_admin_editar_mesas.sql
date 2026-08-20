begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 3
-- Edición individual de mesas
--
-- Requiere:
--   09_admin_mesas.sql
--   10_admin_asignaciones_mesas.sql
--
-- Permite editar:
--   - nombre / alias;
--   - capacidad individual;
--   - ubicación;
--   - notas.
--
-- Reglas:
--   - no reduce capacidad por debajo de ocupación activa;
--   - no altera asignaciones;
--   - usa control de versión;
--   - registra auditoría.
-- =========================================================


-- =========================================================
-- 1. DETALLE DE MESA AMPLIADO
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
                'ubicacion', v_mesa.ubicacion,
                'notas', v_mesa.notas,
                'activo', v_mesa.activo,
                'incluida_configuracion_general',
                    v_mesa.incluida_configuracion_general,
                'version', v_mesa.fecha_actualizacion
            ),
            'asignaciones', v_asignaciones
        )
    );
end;
$$;


-- =========================================================
-- 2. RPC: ACTUALIZAR MESA
-- =========================================================

create or replace function public.admin_actualizar_mesa(
    p_mesa_id bigint,
    p_nombre text,
    p_capacidad integer,
    p_ubicacion text,
    p_notas text,
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

    v_anterior public.mesas%rowtype;
    v_nueva public.mesas%rowtype;

    v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
    v_ubicacion text := nullif(trim(coalesce(p_ubicacion, '')), '');
    v_notas text := nullif(trim(coalesce(p_notas, '')), '');

    v_ocupados integer;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_mesa_id is null or p_mesa_id < 1 then
        raise exception 'MESA_INVALIDA'
            using errcode = '22023';
    end if;

    if p_capacidad is null
       or p_capacidad not between 1 and 50 then
        raise exception 'CAPACIDAD_MESA_INVALIDA'
            using errcode = '22023';
    end if;

    if v_nombre is not null
       and char_length(v_nombre) > 100 then
        raise exception 'NOMBRE_MESA_INVALIDO'
            using errcode = '22023';
    end if;

    if v_ubicacion is not null
       and char_length(v_ubicacion) > 150 then
        raise exception 'UBICACION_MESA_INVALIDA'
            using errcode = '22023';
    end if;

    if v_notas is not null
       and char_length(v_notas) > 1000 then
        raise exception 'NOTAS_MESA_INVALIDAS'
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
    into v_anterior
    from public.mesas
    where id = p_mesa_id
    for update;

    if not found then
        raise exception 'MESA_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_anterior.activo = false then
        raise exception 'MESA_INACTIVA'
            using errcode = '55000';
    end if;

    if v_anterior.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = '40001';
    end if;

    select coalesce(
        sum(a.adultos_asignados + a.ninos_asignados),
        0
    )::integer
    into v_ocupados
    from public.asignaciones_mesa as a
    where a.mesa_id = p_mesa_id
      and a.activo = true;

    if p_capacidad < v_ocupados then
        raise exception 'CAPACIDAD_MENOR_A_OCUPACION'
            using
                errcode = '22023',
                detail = format(
                    'La mesa tiene %s personas asignadas y la nueva capacidad propuesta es %s.',
                    v_ocupados,
                    p_capacidad
                ),
                hint = 'Retira o reasigna asistentes antes de reducir la capacidad.';
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

    update public.mesas
    set
        nombre = coalesce(v_nombre, 'Mesa ' || v_anterior.numero),
        capacidad = p_capacidad,
        ubicacion = v_ubicacion,
        notas = v_notas
    where id = p_mesa_id
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
        'mesa',
        p_mesa_id,
        'mesa_actualizada',
        jsonb_build_object(
            'nombre', v_anterior.nombre,
            'capacidad', v_anterior.capacidad,
            'ubicacion', v_anterior.ubicacion,
            'notas', v_anterior.notas
        ),
        jsonb_build_object(
            'nombre', v_nueva.nombre,
            'capacidad', v_nueva.capacidad,
            'ubicacion', v_nueva.ubicacion,
            'notas', v_nueva.notas
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'updated', true,
            'mesa', jsonb_build_object(
                'id', v_nueva.id,
                'numero', v_nueva.numero,
                'nombre', v_nueva.nombre,
                'capacidad', v_nueva.capacidad,
                'ocupados', v_ocupados,
                'disponibles',
                    greatest(v_nueva.capacidad - v_ocupados, 0),
                'ubicacion', v_nueva.ubicacion,
                'notas', v_nueva.notas,
                'version', v_nueva.fecha_actualizacion
            )
        )
    );
end;
$$;


-- =========================================================
-- 3. PERMISOS
-- =========================================================

revoke execute on function public.admin_actualizar_mesa(
    bigint,
    text,
    integer,
    text,
    text,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_actualizar_mesa(
    bigint,
    text,
    integer,
    text,
    text,
    text,
    timestamptz
)
to authenticated;

-- Reafirmar permiso de detalle con la versión ampliada.
revoke execute on function public.admin_obtener_detalle_mesa(bigint)
from public, anon;

grant execute on function public.admin_obtener_detalle_mesa(bigint)
to authenticated;

commit;
