begin;

-- =========================================================
-- BODA J&M 2027
-- MÓDULO ADMINISTRATIVO DE MESAS · FASE 1
--
-- Incluye:
--   - configuración general de mesas;
--   - carga inicial 27 mesas x 10 lugares;
--   - edición masiva mientras no existan asignaciones activas;
--   - validación obligatoria de capacidad contra el cupo activo;
--   - estructura futura de asignaciones;
--   - resumen y listado administrativo;
--   - auditoría de reconfiguraciones.
--
-- No modifica RSVP, Dashboard, Invitados ni Confirmaciones.
-- =========================================================


-- =========================================================
-- 1. CONFIGURACIÓN GENERAL
-- Un solo registro representa la carga base del salón.
-- =========================================================

create table if not exists public.configuracion_mesas (
    id smallint primary key default 1
        check (id = 1),

    numero_mesas integer not null
        check (numero_mesas between 1 and 100),

    capacidad_inicial integer not null
        check (capacidad_inicial between 1 and 50),

    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now()
);

alter table public.configuracion_mesas enable row level security;

revoke all on table public.configuracion_mesas
from public, anon, authenticated;


-- =========================================================
-- 2. MESAS
-- Las mesas creadas por la configuración general se marcan
-- como parte de la carga base.
-- =========================================================

create table if not exists public.mesas (
    id bigint generated always as identity primary key,

    numero integer not null unique
        check (numero between 1 and 999),

    nombre text
        check (
            nombre is null
            or char_length(trim(nombre)) between 1 and 100
        ),

    capacidad integer not null
        check (capacidad between 1 and 50),

    ubicacion text
        check (
            ubicacion is null
            or char_length(trim(ubicacion)) <= 150
        ),

    notas text
        check (
            notas is null
            or char_length(notas) <= 1000
        ),

    incluida_configuracion_general boolean not null default true,
    activo boolean not null default true,

    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now()
);

create index if not exists mesas_activo_numero_idx
    on public.mesas (activo, numero);

alter table public.mesas enable row level security;

revoke all on table public.mesas
from public, anon, authenticated;


-- =========================================================
-- 3. ASIGNACIONES DE MESA
--
-- Permite que una invitación se divida entre varias mesas.
-- Ejemplo:
--   Mesa 4 -> 2 adultos
--   Mesa 5 -> 1 adulto + 1 niño
--
-- La Fase 1 crea la estructura; las RPC de asignación se
-- implementarán en la fase siguiente.
-- =========================================================

create table if not exists public.asignaciones_mesa (
    id bigint generated always as identity primary key,

    mesa_id bigint not null
        references public.mesas(id)
        on delete restrict,

    invitado_id bigint not null
        references public.invitados(id)
        on delete restrict,

    adultos_asignados smallint not null default 0
        check (adultos_asignados >= 0),

    ninos_asignados smallint not null default 0
        check (ninos_asignados >= 0),

    activo boolean not null default true,

    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),

    constraint asignaciones_mesa_cupo_positivo_check
        check (adultos_asignados + ninos_asignados > 0)
);

create unique index if not exists asignaciones_mesa_activa_unica_idx
    on public.asignaciones_mesa (mesa_id, invitado_id)
    where activo = true;

create index if not exists asignaciones_mesa_mesa_activa_idx
    on public.asignaciones_mesa (mesa_id, activo);

create index if not exists asignaciones_mesa_invitado_activa_idx
    on public.asignaciones_mesa (invitado_id, activo);

alter table public.asignaciones_mesa enable row level security;

revoke all on table public.asignaciones_mesa
from public, anon, authenticated;


-- =========================================================
-- 4. AUDITORÍA DEL MÓDULO
-- =========================================================

create table if not exists public.historial_mesas (
    id bigint generated always as identity primary key,

    tipo_entidad text not null
        check (tipo_entidad in ('configuracion', 'mesa', 'asignacion')),

    entidad_id bigint,

    accion text not null
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
                'asignacion_retirada'
            )
        ),

    datos_anteriores jsonb,
    datos_nuevos jsonb,

    modificado_por uuid,
    administrador_nombre text,

    motivo text
        check (
            motivo is null
            or char_length(trim(motivo)) between 1 and 1000
        ),

    fecha_evento timestamptz not null default now()
);

create index if not exists historial_mesas_fecha_idx
    on public.historial_mesas (fecha_evento desc, id desc);

create index if not exists historial_mesas_entidad_idx
    on public.historial_mesas (tipo_entidad, entidad_id, fecha_evento desc);

alter table public.historial_mesas enable row level security;

revoke all on table public.historial_mesas
from public, anon, authenticated;


-- =========================================================
-- 5. ACTUALIZACIÓN AUTOMÁTICA DE FECHAS
-- =========================================================

drop trigger if exists trg_configuracion_mesas_fecha
    on public.configuracion_mesas;

create trigger trg_configuracion_mesas_fecha
before update on public.configuracion_mesas
for each row
execute function public.actualizar_fecha_modificacion();

drop trigger if exists trg_mesas_fecha
    on public.mesas;

create trigger trg_mesas_fecha
before update on public.mesas
for each row
execute function public.actualizar_fecha_modificacion();

drop trigger if exists trg_asignaciones_mesa_fecha
    on public.asignaciones_mesa;

create trigger trg_asignaciones_mesa_fecha
before update on public.asignaciones_mesa
for each row
execute function public.actualizar_fecha_modificacion();


-- =========================================================
-- 6. SIN CARGA INICIAL AUTOMÁTICA
--
-- La configuración se realizará desde el módulo administrativo.
-- El script deja las tablas vacías para probar el flujo real:
--
--   Sin configuración
--       ↓
--   Capturar número de mesas + capacidad
--       ↓
--   Crear configuración y mesas automáticamente
--
-- No se insertan mesas ni configuración al ejecutar esta migración.
-- =========================================================


-- =========================================================
-- 7. FUNCIÓN PRIVADA
-- Indica si existe al menos una asignación activa.
-- =========================================================

create or replace function private.hay_asignaciones_mesa_activas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.asignaciones_mesa as a
        where a.activo = true
    );
$$;

revoke execute on function private.hay_asignaciones_mesa_activas()
from public, anon, authenticated;


-- =========================================================
-- 8. RPC: OBTENER CONFIGURACIÓN
-- =========================================================

create or replace function public.admin_obtener_configuracion_mesas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_config public.configuracion_mesas%rowtype;
    v_asignaciones_activas boolean;
    v_mesas_activas integer;
    v_capacidad_total integer;
    v_cupo_invitados_activos integer;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select coalesce(
        sum(i.adultos_asignados + i.ninos_asignados),
        0
    )::integer
    into v_cupo_invitados_activos
    from public.invitados as i
    where i.activo = true;

    select *
    into v_config
    from public.configuracion_mesas
    where id = 1;

    v_asignaciones_activas := private.hay_asignaciones_mesa_activas();

    if not found then
        return jsonb_build_object(
            'schema_version', '1.0',
            'generated_at', now(),
            'data', jsonb_build_object(
                'configurado', false,
                'numero_mesas', null,
                'capacidad_inicial', null,
                'capacidad_inicial_total', 0,
                'mesas_activas', 0,
                'capacidad_total_actual', 0,
                'cupo_invitados_activos', v_cupo_invitados_activos,
                'margen_capacidad', -v_cupo_invitados_activos,
                'capacidad_suficiente', false,
                'hay_asignaciones_activas', v_asignaciones_activas,
                'puede_reconfigurar', not v_asignaciones_activas,
                'version', null
            )
        );
    end if;

    select
        count(*)::integer,
        coalesce(sum(m.capacidad), 0)::integer
    into
        v_mesas_activas,
        v_capacidad_total
    from public.mesas as m
    where m.activo = true;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'configurado', true,
            'numero_mesas', v_config.numero_mesas,
            'capacidad_inicial', v_config.capacidad_inicial,
            'capacidad_inicial_total',
                v_config.numero_mesas * v_config.capacidad_inicial,
            'mesas_activas', v_mesas_activas,
            'capacidad_total_actual', v_capacidad_total,
            'cupo_invitados_activos', v_cupo_invitados_activos,
            'margen_capacidad', v_capacidad_total - v_cupo_invitados_activos,
            'capacidad_suficiente',
                v_capacidad_total >= v_cupo_invitados_activos,
            'hay_asignaciones_activas', v_asignaciones_activas,
            'puede_reconfigurar', not v_asignaciones_activas,
            'version', v_config.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 9. RPC: RECONFIGURAR CARGA GENERAL
--
-- Puede cambiar cantidad de mesas y capacidad base SOLO si
-- no existe ninguna asignación activa.
--
-- No elimina mesas físicamente:
--   - activa/actualiza mesas 1..N;
--   - desactiva las mesas base mayores a N.
--
-- Esto conserva IDs e historial.
-- =========================================================

create or replace function public.admin_configurar_mesas(
    p_numero_mesas integer,
    p_capacidad_inicial integer,
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

    v_config_anterior public.configuracion_mesas%rowtype;
    v_config_nueva public.configuracion_mesas%rowtype;

    v_conflicto integer;
    v_cupo_invitados_activos integer;
    v_capacidad_propuesta integer;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_numero_mesas is null
       or p_numero_mesas not between 1 and 100 then
        raise exception 'NUMERO_MESAS_INVALIDO'
            using errcode = '22023';
    end if;

    if p_capacidad_inicial is null
       or p_capacidad_inicial not between 1 and 50 then
        raise exception 'CAPACIDAD_MESA_INVALIDA'
            using errcode = '22023';
    end if;

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    v_capacidad_propuesta := p_numero_mesas * p_capacidad_inicial;

    select coalesce(
        sum(i.adultos_asignados + i.ninos_asignados),
        0
    )::integer
    into v_cupo_invitados_activos
    from public.invitados as i
    where i.activo = true;

    if v_capacidad_propuesta < v_cupo_invitados_activos then
        raise exception 'CAPACIDAD_INSUFICIENTE'
            using
                errcode = '22023',
                detail = format(
                    'La configuración ofrece %s lugares y el padrón activo requiere %s. Faltan %s lugares.',
                    v_capacidad_propuesta,
                    v_cupo_invitados_activos,
                    v_cupo_invitados_activos - v_capacidad_propuesta
                ),
                hint = 'Aumenta el número de mesas o la capacidad por mesa antes de guardar.';
    end if;

    select *
    into v_config_anterior
    from public.configuracion_mesas
    where id = 1
    for update;

    if found then
        if p_version is null then
            raise exception 'VERSION_REQUERIDA'
                using errcode = '22023';
        end if;

        if v_config_anterior.fecha_actualizacion is distinct from p_version then
            raise exception 'REGISTRO_DESACTUALIZADO'
                using errcode = '40001';
        end if;
    else
        if p_version is not null then
            raise exception 'REGISTRO_DESACTUALIZADO'
                using errcode = '40001';
        end if;
    end if;

    if private.hay_asignaciones_mesa_activas() then
        raise exception 'CONFIGURACION_BLOQUEADA_ASIGNACIONES_ACTIVAS'
            using errcode = '55000';
    end if;

    -- Si el rango nuevo necesita un número ya ocupado por una mesa
    -- manual ajena a la configuración general, se detiene.
    select m.numero
    into v_conflicto
    from public.mesas as m
    where m.numero between 1 and p_numero_mesas
      and m.incluida_configuracion_general = false
    order by m.numero
    limit 1;

    if found then
        raise exception 'NUMERO_MESA_OCUPADO:%', v_conflicto
            using errcode = '23505';
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

    -- Actualiza/reactiva las mesas base existentes del rango nuevo.
    update public.mesas as m
    set
        capacidad = p_capacidad_inicial,
        activo = true
    where m.incluida_configuracion_general = true
      and m.numero between 1 and p_numero_mesas;

    -- Crea las mesas faltantes dentro del rango.
    insert into public.mesas (
        numero,
        nombre,
        capacidad,
        incluida_configuracion_general,
        activo
    )
    select
        gs.numero,
        'Mesa ' || gs.numero,
        p_capacidad_inicial,
        true,
        true
    from generate_series(1, p_numero_mesas) as gs(numero)
    where not exists (
        select 1
        from public.mesas as m
        where m.numero = gs.numero
    );

    -- Si se reduce el número de mesas, las sobrantes de la carga
    -- general quedan inactivas. Nunca se borran físicamente.
    update public.mesas as m
    set activo = false
    where m.incluida_configuracion_general = true
      and m.numero > p_numero_mesas
      and m.activo = true;

    insert into public.configuracion_mesas (
        id,
        numero_mesas,
        capacidad_inicial
    )
    values (
        1,
        p_numero_mesas,
        p_capacidad_inicial
    )
    on conflict (id)
    do update
    set
        numero_mesas = excluded.numero_mesas,
        capacidad_inicial = excluded.capacidad_inicial
    returning *
    into v_config_nueva;

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
        1,
        case
            when v_config_anterior.id is null
                then 'configuracion_inicial'
            else 'reconfigurado'
        end,
        case
            when v_config_anterior.id is null
                then null
            else jsonb_build_object(
                'numero_mesas', v_config_anterior.numero_mesas,
                'capacidad_inicial', v_config_anterior.capacidad_inicial
            )
        end,
        jsonb_build_object(
            'numero_mesas', v_config_nueva.numero_mesas,
            'capacidad_inicial', v_config_nueva.capacidad_inicial
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
            'numero_mesas', v_config_nueva.numero_mesas,
            'capacidad_inicial', v_config_nueva.capacidad_inicial,
            'capacidad_inicial_total',
                v_config_nueva.numero_mesas
                * v_config_nueva.capacidad_inicial,
            'cupo_invitados_activos', v_cupo_invitados_activos,
            'margen_capacidad',
                (v_config_nueva.numero_mesas * v_config_nueva.capacidad_inicial)
                - v_cupo_invitados_activos,
            'capacidad_suficiente', true,
            'puede_reconfigurar', true,
            'version', v_config_nueva.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 10. RPC: RESUMEN DEL MÓDULO
-- =========================================================

create or replace function public.admin_resumen_mesas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_mesas_activas integer;
    v_capacidad_total integer;
    v_personas_asignadas integer;
    v_adultos_asignados integer;
    v_ninos_asignados integer;

    v_confirmados_totales integer;
    v_confirmados_adultos integer;
    v_confirmados_ninos integer;

    v_pendientes integer;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select
        count(*)::integer,
        coalesce(sum(m.capacidad), 0)::integer
    into
        v_mesas_activas,
        v_capacidad_total
    from public.mesas as m
    where m.activo = true;

    select
        coalesce(sum(a.adultos_asignados), 0)::integer,
        coalesce(sum(a.ninos_asignados), 0)::integer
    into
        v_adultos_asignados,
        v_ninos_asignados
    from public.asignaciones_mesa as a
    join public.mesas as m
        on m.id = a.mesa_id
       and m.activo = true
    where a.activo = true;

    v_personas_asignadas :=
        v_adultos_asignados + v_ninos_asignados;

    select
        coalesce(sum(c.adultos_confirmados), 0)::integer,
        coalesce(sum(c.ninos_confirmados), 0)::integer
    into
        v_confirmados_adultos,
        v_confirmados_ninos
    from public.confirmaciones as c
    join public.invitados as i
        on i.id = c.invitado_id
       and i.activo = true
    where c.estado = 'confirmado';

    v_confirmados_totales :=
        v_confirmados_adultos + v_confirmados_ninos;

    v_pendientes :=
        greatest(v_confirmados_totales - v_personas_asignadas, 0);

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'mesas', jsonb_build_object(
                'activas', v_mesas_activas,
                'capacidad_total', v_capacidad_total
            ),
            'confirmados', jsonb_build_object(
                'adultos', v_confirmados_adultos,
                'ninos', v_confirmados_ninos,
                'total', v_confirmados_totales
            ),
            'asignados', jsonb_build_object(
                'adultos', v_adultos_asignados,
                'ninos', v_ninos_asignados,
                'total', v_personas_asignadas
            ),
            'pendientes_asignar', v_pendientes,
            'lugares_disponibles',
                greatest(v_capacidad_total - v_personas_asignadas, 0),
            'hay_asignaciones_activas',
                private.hay_asignaciones_mesa_activas()
        )
    );
end;
$$;


-- =========================================================
-- 11. RPC: LISTAR MESAS
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
-- 12. PERMISOS RPC
-- =========================================================

revoke execute on function public.admin_obtener_configuracion_mesas()
from public, anon;

grant execute on function public.admin_obtener_configuracion_mesas()
to authenticated;

revoke execute on function public.admin_configurar_mesas(
    integer,
    integer,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_configurar_mesas(
    integer,
    integer,
    text,
    timestamptz
)
to authenticated;

revoke execute on function public.admin_resumen_mesas()
from public, anon;

grant execute on function public.admin_resumen_mesas()
to authenticated;

revoke execute on function public.admin_listar_mesas()
from public, anon;

grant execute on function public.admin_listar_mesas()
to authenticated;

commit;
