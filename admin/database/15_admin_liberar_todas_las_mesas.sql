begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 4.2
-- Liberar todas las mesas
--
-- Acción administrativa global:
--   - baja lógica de TODAS las asignaciones activas;
--   - conserva registros e historial;
--   - requiere motivo;
--   - devuelve confirmados a Pendientes de asignar;
--   - desbloquea la configuración general al quedar 0
--     asignaciones activas.
-- =========================================================


-- =========================================================
-- 1. AMPLIAR ACCIONES DE AUDITORÍA
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
                'asignaciones_liberadas'
            )
        );
exception
    when duplicate_object then
        null;
end;
$$;


-- =========================================================
-- 2. RPC: LIBERAR TODAS LAS MESAS
-- =========================================================

create or replace function public.admin_liberar_todas_las_mesas(
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

    v_asignaciones integer;
    v_adultos integer;
    v_ninos integer;
    v_personas integer;
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

    -- Bloqueamos todas las asignaciones activas para que el resumen
    -- y la baja lógica correspondan al mismo instante transaccional.
    perform 1
    from public.asignaciones_mesa as a
    where a.activo = true
    order by a.id
    for update;

    select
        count(*)::integer,
        coalesce(sum(a.adultos_asignados), 0)::integer,
        coalesce(sum(a.ninos_asignados), 0)::integer
    into
        v_asignaciones,
        v_adultos,
        v_ninos
    from public.asignaciones_mesa as a
    where a.activo = true;

    v_personas := v_adultos + v_ninos;

    if v_asignaciones = 0 then
        raise exception 'SIN_ASIGNACIONES_ACTIVAS'
            using errcode = '55000';
    end if;

    update public.asignaciones_mesa
    set activo = false
    where activo = true;

    -- Una sola entrada global evita llenar el historial con una fila
    -- por cada asignación cuando el usuario ejecuta esta acción masiva.
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
        'asignaciones_liberadas',
        jsonb_build_object(
            'asignaciones_activas', v_asignaciones,
            'adultos_asignados', v_adultos,
            'ninos_asignados', v_ninos,
            'personas_asignadas', v_personas
        ),
        jsonb_build_object(
            'asignaciones_activas', 0,
            'adultos_asignados', 0,
            'ninos_asignados', 0,
            'personas_asignadas', 0
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'liberadas', true,
            'asignaciones_afectadas', v_asignaciones,
            'adultos_liberados', v_adultos,
            'ninos_liberados', v_ninos,
            'personas_liberadas', v_personas
        )
    );
end;
$$;


-- =========================================================
-- 3. PERMISOS
-- =========================================================

revoke execute on function public.admin_liberar_todas_las_mesas(text)
from public, anon;

grant execute on function public.admin_liberar_todas_las_mesas(text)
to authenticated;

commit;
