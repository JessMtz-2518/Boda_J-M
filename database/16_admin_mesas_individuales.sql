begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 4.3
-- Administración individual de mesas
--
-- Agrega:
--   - alta individual de mesa;
--   - baja lógica individual de mesa;
--   - validación de mesa vacía para baja;
--   - validación de capacidad total suficiente;
--   - auditoría completa.
--
-- No modifica RSVP ni asignaciones existentes.
-- =========================================================


-- =========================================================
-- 1. RPC: AGREGAR MESA
--
-- Reutiliza primero el número menor de una mesa inactiva.
-- Si no existe, toma el primer número todavía no utilizado.
-- =========================================================

create or replace function public.admin_agregar_mesa(
    p_nombre text,
    p_capacidad integer,
    p_ubicacion text,
    p_notas text,
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

    v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
    v_ubicacion text := nullif(trim(coalesce(p_ubicacion, '')), '');
    v_notas text := nullif(trim(coalesce(p_notas, '')), '');

    v_mesa public.mesas%rowtype;
    v_numero integer;
    v_reactivada boolean := false;
    v_activas integer;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
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

    select count(*)::integer
    into v_activas
    from public.mesas
    where activo = true;

    if v_activas >= 100 then
        raise exception 'LIMITE_MESAS_ALCANZADO'
            using errcode = '22023';
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

    -- Reutilizar primero una mesa inactiva, conservando su ID e historial.
    select *
    into v_mesa
    from public.mesas
    where activo = false
    order by numero
    limit 1
    for update;

    if found then
        v_reactivada := true;
        v_numero := v_mesa.numero;

        update public.mesas
        set
            nombre = coalesce(v_nombre, 'Mesa ' || v_numero),
            capacidad = p_capacidad,
            ubicacion = v_ubicacion,
            notas = v_notas,
            incluida_configuracion_general = false,
            activo = true
        where id = v_mesa.id
        returning *
        into v_mesa;
    else
        select gs
        into v_numero
        from generate_series(1, 999) as gs
        where not exists (
            select 1
            from public.mesas as m
            where m.numero = gs
        )
        order by gs
        limit 1;

        if v_numero is null then
            raise exception 'NUMERO_MESA_NO_DISPONIBLE'
                using errcode = '22023';
        end if;

        insert into public.mesas (
            numero,
            nombre,
            capacidad,
            ubicacion,
            notas,
            incluida_configuracion_general,
            activo
        )
        values (
            v_numero,
            coalesce(v_nombre, 'Mesa ' || v_numero),
            p_capacidad,
            v_ubicacion,
            v_notas,
            false,
            true
        )
        returning *
        into v_mesa;
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
        'mesa',
        v_mesa.id,
        case
            when v_reactivada then 'mesa_reactivada'
            else 'mesa_creada'
        end,
        null,
        jsonb_build_object(
            'numero', v_mesa.numero,
            'nombre', v_mesa.nombre,
            'capacidad', v_mesa.capacidad,
            'ubicacion', v_mesa.ubicacion,
            'notas', v_mesa.notas,
            'activo', true,
            'manual', true
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'created', true,
            'reactivated', v_reactivada,
            'mesa', jsonb_build_object(
                'id', v_mesa.id,
                'numero', v_mesa.numero,
                'nombre', v_mesa.nombre,
                'capacidad', v_mesa.capacidad,
                'ubicacion', v_mesa.ubicacion,
                'notas', v_mesa.notas,
                'version', v_mesa.fecha_actualizacion
            )
        )
    );
end;
$$;


-- =========================================================
-- 2. RPC: ELIMINAR / DESACTIVAR MESA
--
-- Solo puede desactivarse si:
--   - está activa;
--   - no tiene asignaciones activas;
--   - la capacidad restante sigue cubriendo el padrón activo.
-- =========================================================

create or replace function public.admin_eliminar_mesa(
    p_mesa_id bigint,
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

    v_mesa public.mesas%rowtype;
    v_asignaciones integer;
    v_capacidad_total integer;
    v_capacidad_restante integer;
    v_cupo_activo integer;
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

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_version is null then
        raise exception 'VERSION_REQUERIDA'
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
        raise exception 'MESA_YA_INACTIVA'
            using errcode = '55000';
    end if;

    if v_mesa.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = '40001';
    end if;

    select count(*)::integer
    into v_asignaciones
    from public.asignaciones_mesa as a
    where a.mesa_id = p_mesa_id
      and a.activo = true;

    if v_asignaciones > 0 then
        raise exception 'MESA_CON_ASIGNACIONES'
            using
                errcode = '55000',
                hint = 'Mueve o retira primero a los invitados de esta mesa.';
    end if;

    select coalesce(sum(m.capacidad), 0)::integer
    into v_capacidad_total
    from public.mesas as m
    where m.activo = true;

    select coalesce(
        sum(i.adultos_asignados + i.ninos_asignados),
        0
    )::integer
    into v_cupo_activo
    from public.invitados as i
    where i.activo = true;

    v_capacidad_restante := v_capacidad_total - v_mesa.capacidad;

    if v_capacidad_restante < v_cupo_activo then
        raise exception 'CAPACIDAD_INSUFICIENTE_AL_ELIMINAR'
            using
                errcode = '22023',
                detail = format(
                    'Al eliminar esta mesa quedarían %s lugares y el padrón activo requiere %s. Faltan %s lugares.',
                    v_capacidad_restante,
                    v_cupo_activo,
                    v_cupo_activo - v_capacidad_restante
                ),
                hint = 'Agrega otra mesa o aumenta capacidad antes de eliminarla.';
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
    set activo = false
    where id = p_mesa_id;

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
        'mesa_desactivada',
        jsonb_build_object(
            'numero', v_mesa.numero,
            'nombre', v_mesa.nombre,
            'capacidad', v_mesa.capacidad,
            'ubicacion', v_mesa.ubicacion,
            'notas', v_mesa.notas,
            'activo', true
        ),
        jsonb_build_object(
            'numero', v_mesa.numero,
            'nombre', v_mesa.nombre,
            'capacidad', v_mesa.capacidad,
            'ubicacion', v_mesa.ubicacion,
            'notas', v_mesa.notas,
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
            'deleted', true,
            'mesa_id', p_mesa_id,
            'numero', v_mesa.numero,
            'nombre', v_mesa.nombre,
            'capacidad_liberada', v_mesa.capacidad,
            'capacidad_restante', v_capacidad_restante
        )
    );
end;
$$;


-- =========================================================
-- 3. PERMISOS
-- =========================================================

revoke execute on function public.admin_agregar_mesa(
    text,
    integer,
    text,
    text,
    text
)
from public, anon;

grant execute on function public.admin_agregar_mesa(
    text,
    integer,
    text,
    text,
    text
)
to authenticated;

revoke execute on function public.admin_eliminar_mesa(
    bigint,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_eliminar_mesa(
    bigint,
    text,
    timestamptz
)
to authenticated;

commit;
