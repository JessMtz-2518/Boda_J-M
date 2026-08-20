begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 4.1
-- Sincronización automática RSVP -> Mesas
--
-- Problema corregido:
-- Si una confirmación disminuye después de que las personas
-- ya tienen mesa, las asignaciones activas deben ajustarse.
--
-- Política:
--   - nunca asigna automáticamente personas nuevas;
--   - si la confirmación aumenta, esas personas quedan pendientes;
--   - si disminuye, reduce automáticamente las asignaciones;
--   - si la confirmación pasa a 0, desactiva las asignaciones;
--   - conserva trazabilidad en historial_mesas.
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
                'sincronizado_confirmacion'
            )
        );
exception
    when duplicate_object then
        null;
end;
$$;


-- =========================================================
-- 2. FUNCIÓN DE SINCRONIZACIÓN
--
-- Se ejecuta DESPUÉS de insertar/actualizar confirmaciones.
-- Reduce primero las asignaciones activas más recientes para
-- conservar las más antiguas siempre que sea posible.
-- =========================================================

create or replace function public.sincronizar_mesas_con_confirmacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_total_adultos_asignados integer;
    v_total_ninos_asignados integer;
    v_exceso_adultos integer;
    v_exceso_ninos integer;

    v_asignacion public.asignaciones_mesa%rowtype;
    v_nuevo_adultos integer;
    v_nuevo_ninos integer;
    v_reducir integer;

    v_actor_id uuid := auth.uid();
    v_actor_nombre text;
begin
    -- Si no hay módulo de Mesas instalado, no hay nada que hacer.
    if to_regclass('public.asignaciones_mesa') is null then
        return new;
    end if;

    select
        coalesce(sum(a.adultos_asignados), 0)::integer,
        coalesce(sum(a.ninos_asignados), 0)::integer
    into
        v_total_adultos_asignados,
        v_total_ninos_asignados
    from public.asignaciones_mesa as a
    where a.invitado_id = new.invitado_id
      and a.activo = true;

    v_exceso_adultos := greatest(
        v_total_adultos_asignados - new.adultos_confirmados,
        0
    );

    v_exceso_ninos := greatest(
        v_total_ninos_asignados - new.ninos_confirmados,
        0
    );

    if v_exceso_adultos = 0 and v_exceso_ninos = 0 then
        return new;
    end if;

    -- Identificar al actor cuando la modificación sea administrativa.
    if v_actor_id is not null then
        select a.nombre
        into v_actor_nombre
        from public.administradores as a
        where a.usuario_id = v_actor_id
          and a.activo = true
        limit 1;
    end if;

    if v_actor_nombre is null then
        v_actor_nombre := 'Invitado';
        v_actor_id := null;
    end if;

    -- Recorremos asignaciones activas de la más reciente a la más antigua.
    for v_asignacion in
        select a.*
        from public.asignaciones_mesa as a
        where a.invitado_id = new.invitado_id
          and a.activo = true
        order by a.fecha_actualizacion desc, a.id desc
        for update
    loop
        exit when v_exceso_adultos = 0 and v_exceso_ninos = 0;

        v_nuevo_adultos := v_asignacion.adultos_asignados;
        v_nuevo_ninos := v_asignacion.ninos_asignados;

        if v_exceso_adultos > 0 and v_nuevo_adultos > 0 then
            v_reducir := least(v_exceso_adultos, v_nuevo_adultos);
            v_nuevo_adultos := v_nuevo_adultos - v_reducir;
            v_exceso_adultos := v_exceso_adultos - v_reducir;
        end if;

        if v_exceso_ninos > 0 and v_nuevo_ninos > 0 then
            v_reducir := least(v_exceso_ninos, v_nuevo_ninos);
            v_nuevo_ninos := v_nuevo_ninos - v_reducir;
            v_exceso_ninos := v_exceso_ninos - v_reducir;
        end if;

        if v_nuevo_adultos = v_asignacion.adultos_asignados
           and v_nuevo_ninos = v_asignacion.ninos_asignados then
            continue;
        end if;

        -- No podemos guardar 0 + 0 por el check de la tabla.
        -- En ese caso hacemos baja lógica y conservamos las cantidades
        -- originales como parte del registro histórico.
        if v_nuevo_adultos + v_nuevo_ninos = 0 then
            update public.asignaciones_mesa
            set activo = false
            where id = v_asignacion.id;

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
                'sincronizado_confirmacion',
                jsonb_build_object(
                    'mesa_id', v_asignacion.mesa_id,
                    'invitado_id', v_asignacion.invitado_id,
                    'adultos', v_asignacion.adultos_asignados,
                    'ninos', v_asignacion.ninos_asignados,
                    'activo', true
                ),
                jsonb_build_object(
                    'mesa_id', v_asignacion.mesa_id,
                    'invitado_id', v_asignacion.invitado_id,
                    'adultos', 0,
                    'ninos', 0,
                    'activo', false
                ),
                v_actor_id,
                v_actor_nombre,
                'Ajuste automático por cambio en la confirmación de asistencia'
            );
        else
            update public.asignaciones_mesa
            set
                adultos_asignados = v_nuevo_adultos,
                ninos_asignados = v_nuevo_ninos
            where id = v_asignacion.id;

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
                'sincronizado_confirmacion',
                jsonb_build_object(
                    'mesa_id', v_asignacion.mesa_id,
                    'invitado_id', v_asignacion.invitado_id,
                    'adultos', v_asignacion.adultos_asignados,
                    'ninos', v_asignacion.ninos_asignados,
                    'activo', true
                ),
                jsonb_build_object(
                    'mesa_id', v_asignacion.mesa_id,
                    'invitado_id', v_asignacion.invitado_id,
                    'adultos', v_nuevo_adultos,
                    'ninos', v_nuevo_ninos,
                    'activo', true
                ),
                v_actor_id,
                v_actor_nombre,
                'Ajuste automático por cambio en la confirmación de asistencia'
            );
        end if;
    end loop;

    return new;
end;
$$;

revoke execute on function public.sincronizar_mesas_con_confirmacion()
from public, anon, authenticated;


-- =========================================================
-- 3. TRIGGER
-- =========================================================

drop trigger if exists trg_sincronizar_mesas_confirmacion
on public.confirmaciones;

create trigger trg_sincronizar_mesas_confirmacion
after insert or update of adultos_confirmados, ninos_confirmados, estado
on public.confirmaciones
for each row
execute function public.sincronizar_mesas_con_confirmacion();


-- =========================================================
-- 4. RECONCILIAR DATOS YA EXISTENTES
--
-- Corrige ahora mismo asignaciones que ya quedaron por encima
-- de la confirmación vigente durante las pruebas anteriores.
-- =========================================================

do $$
declare
    v_confirmacion public.confirmaciones%rowtype;
begin
    for v_confirmacion in
        select c.*
        from public.confirmaciones as c
        where exists (
            select 1
            from public.asignaciones_mesa as a
            where a.invitado_id = c.invitado_id
              and a.activo = true
            group by a.invitado_id
            having
                sum(a.adultos_asignados) > c.adultos_confirmados
                or sum(a.ninos_asignados) > c.ninos_confirmados
        )
    loop
        -- Un UPDATE sin cambiar valores dispara el trigger de sincronización.
        update public.confirmaciones
        set
            adultos_confirmados = v_confirmacion.adultos_confirmados,
            ninos_confirmados = v_confirmacion.ninos_confirmados
        where invitado_id = v_confirmacion.invitado_id;
    end loop;
end;
$$;

commit;
