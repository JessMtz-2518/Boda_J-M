begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 5
-- Plano visual de distribución
--
-- Agrega:
--   - posición X/Y porcentual por mesa;
--   - guardado masivo del plano;
--   - auditoría de cambios del plano;
--   - posiciones disponibles en admin_listar_mesas().
--
-- No modifica RSVP ni las asignaciones de invitados.
-- =========================================================


-- =========================================================
-- 1. POSICIONES EN MESAS
-- =========================================================

alter table public.mesas
    add column if not exists plano_x numeric(6,3);

alter table public.mesas
    add column if not exists plano_y numeric(6,3);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.mesas'::regclass
          and conname = 'mesas_plano_x_check'
    ) then
        alter table public.mesas
            add constraint mesas_plano_x_check
            check (
                plano_x is null
                or plano_x between 0 and 100
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.mesas'::regclass
          and conname = 'mesas_plano_y_check'
    ) then
        alter table public.mesas
            add constraint mesas_plano_y_check
            check (
                plano_y is null
                or plano_y between 0 and 100
            );
    end if;
end;
$$;


-- =========================================================
-- 2. AMPLIAR ACCIONES DE AUDITORÍA
-- =========================================================

do $$
declare
    v_constraint text;
begin
    select c.conname
    into v_constraint
    from pg_constraint as c
    where c.conrelid = 'public.historial_mesas'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%accion%'
    limit 1;

    if v_constraint is not null then
        execute format(
            'alter table public.historial_mesas drop constraint %I',
            v_constraint
        );
    end if;

    alter table public.historial_mesas
        add constraint historial_mesas_accion_check
        check (
            accion in (
                'configuracion_inicial',
                'reconfigurado',
                'mesa_creada',
                'mesa_actualizada',
                'mesa_desactivada',
                'mesa_reactivada',
                'asignado',
                'reasignado',
                'asignacion_retirada',
                'sincronizado_confirmacion',
                'asignaciones_liberadas',
                'plano_actualizado'
            )
        );
exception
    when duplicate_object then
        null;
end;
$$;


-- =========================================================
-- 3. LISTADO DE MESAS CON POSICIÓN
-- =========================================================

create or replace function public.admin_listar_mesas()
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

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'numero', q.numero,
                'nombre', q.nombre,
                'capacidad', q.capacidad,
                'ocupados', q.ocupados,
                'disponibles',
                    greatest(q.capacidad - q.ocupados, 0),
                'porcentaje_ocupacion',
                    case
                        when q.capacidad = 0 then 0
                        else round(
                            (q.ocupados::numeric / q.capacidad::numeric) * 100,
                            1
                        )
                    end,
                'estado',
                    case
                        when q.ocupados >= q.capacidad then 'completa'
                        when q.ocupados >= greatest(q.capacidad - 2, 1)
                            then 'casi_llena'
                        else 'disponible'
                    end,
                'plano_x', q.plano_x,
                'plano_y', q.plano_y,
                'activo', q.activo,
                'incluida_configuracion_general',
                    q.incluida_configuracion_general,
                'version', q.fecha_actualizacion
            )
            order by q.numero
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select
            m.id,
            m.numero,
            m.nombre,
            m.capacidad,
            m.plano_x,
            m.plano_y,
            m.activo,
            m.incluida_configuracion_general,
            m.fecha_actualizacion,
            coalesce(
                sum(
                    case
                        when a.activo = true
                            then a.adultos_asignados + a.ninos_asignados
                        else 0
                    end
                ),
                0
            )::integer as ocupados
        from public.mesas as m
        left join public.asignaciones_mesa as a
            on a.mesa_id = m.id
        where m.activo = true
        group by
            m.id,
            m.numero,
            m.nombre,
            m.capacidad,
            m.plano_x,
            m.plano_y,
            m.activo,
            m.incluida_configuracion_general,
            m.fecha_actualizacion
        order by m.numero
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
-- 4. RPC: GUARDAR PLANO COMPLETO
--
-- p_posiciones:
-- [
--   {"mesa_id":1,"x":12.5,"y":20.1},
--   {"mesa_id":2,"x":27.0,"y":20.1}
-- ]
-- =========================================================

create or replace function public.admin_guardar_plano_mesas(
    p_posiciones jsonb,
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

    v_item jsonb;
    v_mesa_id bigint;
    v_x numeric;
    v_y numeric;

    v_total integer := 0;
    v_anteriores jsonb;
    v_nuevos jsonb;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_posiciones is null
       or jsonb_typeof(p_posiciones) <> 'array'
       or jsonb_array_length(p_posiciones) = 0 then
        raise exception 'PLANO_INVALIDO'
            using errcode = '22023';
    end if;

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
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

    -- Verificar que no haya IDs repetidos.
    if (
        select count(*)
        from jsonb_array_elements(p_posiciones)
    ) <> (
        select count(distinct (e ->> 'mesa_id')::bigint)
        from jsonb_array_elements(p_posiciones) as e
    ) then
        raise exception 'PLANO_MESAS_DUPLICADAS'
            using errcode = '22023';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'mesa_id', m.id,
                'numero', m.numero,
                'x', m.plano_x,
                'y', m.plano_y
            )
            order by m.numero
        ),
        '[]'::jsonb
    )
    into v_anteriores
    from public.mesas as m
    where m.activo = true
      and m.id in (
          select (e ->> 'mesa_id')::bigint
          from jsonb_array_elements(p_posiciones) as e
      );

    for v_item in
        select value
        from jsonb_array_elements(p_posiciones)
    loop
        v_mesa_id := nullif(v_item ->> 'mesa_id', '')::bigint;
        v_x := nullif(v_item ->> 'x', '')::numeric;
        v_y := nullif(v_item ->> 'y', '')::numeric;

        if v_mesa_id is null
           or v_mesa_id < 1
           or v_x is null
           or v_y is null
           or v_x not between 0 and 100
           or v_y not between 0 and 100 then
            raise exception 'PLANO_POSICION_INVALIDA'
                using errcode = '22023';
        end if;

        update public.mesas
        set
            plano_x = round(v_x, 3),
            plano_y = round(v_y, 3)
        where id = v_mesa_id
          and activo = true;

        if not found then
            raise exception 'MESA_NO_ENCONTRADA'
                using errcode = 'P0002';
        end if;

        v_total := v_total + 1;
    end loop;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'mesa_id', m.id,
                'numero', m.numero,
                'x', m.plano_x,
                'y', m.plano_y
            )
            order by m.numero
        ),
        '[]'::jsonb
    )
    into v_nuevos
    from public.mesas as m
    where m.activo = true
      and m.id in (
          select (e ->> 'mesa_id')::bigint
          from jsonb_array_elements(p_posiciones) as e
      );

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
        'configuracion',
        null,
        'plano_actualizado',
        jsonb_build_object(
            'posiciones', v_anteriores,
            'mesas', v_total
        ),
        jsonb_build_object(
            'posiciones', v_nuevos,
            'mesas', v_total
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'saved', true,
            'mesas_actualizadas', v_total
        )
    );
end;
$$;


-- =========================================================
-- 5. PERMISOS
-- =========================================================

revoke execute on function public.admin_guardar_plano_mesas(jsonb, text)
from public, anon;

grant execute on function public.admin_guardar_plano_mesas(jsonb, text)
to authenticated;

revoke execute on function public.admin_listar_mesas()
from public, anon;

grant execute on function public.admin_listar_mesas()
to authenticated;

commit;
