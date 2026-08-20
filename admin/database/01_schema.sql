begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 1.2 · BASE DE DATOS RSVP
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 1. TABLA DE INVITADOS
-- Información fija y administrada únicamente por los novios.
-- =========================================================

create table if not exists public.invitados (
    id bigint generated always as identity primary key,

    codigo text not null unique,
    token_acceso uuid not null unique default gen_random_uuid(),

    grupo text not null,
    nombre text not null,

    adultos_asignados smallint not null default 0
        check (adultos_asignados >= 0),

    ninos_asignados smallint not null default 0
        check (ninos_asignados >= 0),

    activo boolean not null default true,

    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now()
);

create index if not exists invitados_token_acceso_idx
    on public.invitados (token_acceso);

create index if not exists invitados_grupo_idx
    on public.invitados (grupo);

create index if not exists invitados_activo_idx
    on public.invitados (activo);


-- =========================================================
-- 2. TABLA DE CONFIRMACIONES
-- Un solo registro vigente por invitación.
-- =========================================================

create table if not exists public.confirmaciones (
    invitado_id bigint primary key
        references public.invitados(id)
        on delete cascade,

    adultos_confirmados smallint not null default 0
        check (adultos_confirmados >= 0),

    ninos_confirmados smallint not null default 0
        check (ninos_confirmados >= 0),

    mensaje text
        check (mensaje is null or char_length(mensaje) <= 1000),

    estado text not null
        check (estado in ('confirmado', 'no_asistira')),

    fecha_confirmacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now()
);


-- =========================================================
-- 3. HISTORIAL DE MODIFICACIONES
-- Conserva cada confirmación y actualización.
-- =========================================================

create table if not exists public.historial_confirmaciones (
    id bigint generated always as identity primary key,

    invitado_id bigint not null
        references public.invitados(id)
        on delete cascade,

    accion text not null
        check (accion in ('creada', 'actualizada')),

    datos_anteriores jsonb,
    datos_nuevos jsonb not null,

    fecha_evento timestamptz not null default now()
);

create index if not exists historial_invitado_idx
    on public.historial_confirmaciones (invitado_id);

create index if not exists historial_fecha_idx
    on public.historial_confirmaciones (fecha_evento desc);


-- =========================================================
-- 4. CONFIGURACIÓN GENERAL
-- =========================================================

create table if not exists public.configuracion (
    clave text primary key,
    valor jsonb not null,
    descripcion text,
    fecha_actualizacion timestamptz not null default now()
);

insert into public.configuracion (clave, valor, descripcion)
values
    (
        'rsvp_activo',
        'true'::jsonb,
        'Permite recibir confirmaciones y modificaciones.'
    ),
    (
        'permitir_modificaciones',
        'true'::jsonb,
        'Permite actualizar una confirmación existente.'
    ),
    (
        'fecha_limite_rsvp',
        '"2027-04-15T23:59:59-06:00"'::jsonb,
        'Fecha límite para confirmar o modificar asistencia.'
    )
on conflict (clave) do nothing;


-- =========================================================
-- 5. ACTUALIZACIÓN AUTOMÁTICA DE FECHAS
-- =========================================================

create or replace function public.actualizar_fecha_modificacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.fecha_actualizacion = now();
    return new;
end;
$$;

drop trigger if exists trg_invitados_fecha
    on public.invitados;

create trigger trg_invitados_fecha
before update on public.invitados
for each row
execute function public.actualizar_fecha_modificacion();

drop trigger if exists trg_confirmaciones_fecha
    on public.confirmaciones;

create trigger trg_confirmaciones_fecha
before update on public.confirmaciones
for each row
execute function public.actualizar_fecha_modificacion();

drop trigger if exists trg_configuracion_fecha
    on public.configuracion;

create trigger trg_configuracion_fecha
before update on public.configuracion
for each row
execute function public.actualizar_fecha_modificacion();


-- =========================================================
-- 6. VALIDACIÓN DE CUPO Y FECHA LÍMITE
-- La base de datos protege los cupos aunque alteren el JS.
-- =========================================================

create or replace function public.validar_confirmacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_adultos_asignados smallint;
    v_ninos_asignados smallint;
    v_activo boolean;

    v_rsvp_activo boolean;
    v_permitir_modificaciones boolean;
    v_fecha_limite timestamptz;
begin
    select
        adultos_asignados,
        ninos_asignados,
        activo
    into
        v_adultos_asignados,
        v_ninos_asignados,
        v_activo
    from public.invitados
    where id = new.invitado_id;

    if not found then
        raise exception 'La invitación indicada no existe.';
    end if;

    if not v_activo then
        raise exception 'Esta invitación no se encuentra activa.';
    end if;

    select coalesce(
        (
            select (valor #>> '{}')::boolean
            from public.configuracion
            where clave = 'rsvp_activo'
        ),
        true
    )
    into v_rsvp_activo;

    if not v_rsvp_activo then
        raise exception 'El periodo de confirmaciones está cerrado.';
    end if;

    select (
        select nullif(valor #>> '{}', '')::timestamptz
        from public.configuracion
        where clave = 'fecha_limite_rsvp'
    )
    into v_fecha_limite;

    if v_fecha_limite is not null and now() > v_fecha_limite then
        raise exception 'La fecha límite para confirmar ha concluido.';
    end if;

    if tg_op = 'UPDATE' then
        select coalesce(
            (
                select (valor #>> '{}')::boolean
                from public.configuracion
                where clave = 'permitir_modificaciones'
            ),
            true
        )
        into v_permitir_modificaciones;

        if not v_permitir_modificaciones then
            raise exception 'La confirmación ya no puede modificarse.';
        end if;
    end if;

    if new.adultos_confirmados > v_adultos_asignados then
        raise exception
            'El máximo de adultos permitido es %.',
            v_adultos_asignados;
    end if;

    if new.ninos_confirmados > v_ninos_asignados then
        raise exception
            'El máximo de niños permitido es %.',
            v_ninos_asignados;
    end if;

    new.estado :=
        case
            when new.adultos_confirmados + new.ninos_confirmados = 0
                then 'no_asistira'
            else 'confirmado'
        end;

    return new;
end;
$$;

drop trigger if exists trg_validar_confirmacion
    on public.confirmaciones;

create trigger trg_validar_confirmacion
before insert or update on public.confirmaciones
for each row
execute function public.validar_confirmacion();


-- =========================================================
-- 7. HISTORIAL AUTOMÁTICO
-- =========================================================

create or replace function public.registrar_historial_confirmacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.historial_confirmaciones (
        invitado_id,
        accion,
        datos_anteriores,
        datos_nuevos
    )
    values (
        new.invitado_id,
        case
            when tg_op = 'INSERT' then 'creada'
            else 'actualizada'
        end,
        case
            when tg_op = 'UPDATE' then to_jsonb(old)
            else null
        end,
        to_jsonb(new)
    );

    return new;
end;
$$;

drop trigger if exists trg_historial_confirmacion
    on public.confirmaciones;

create trigger trg_historial_confirmacion
after insert or update on public.confirmaciones
for each row
execute function public.registrar_historial_confirmacion();


-- =========================================================
-- 8. RPC: CONSULTAR INVITACIÓN
-- Solo devuelve la invitación correspondiente al token.
-- =========================================================

create or replace function public.obtener_invitacion(
    p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    select jsonb_build_object(
        'codigo', i.codigo,
        'grupo', i.grupo,
        'nombre', i.nombre,
        'adultos_asignados', i.adultos_asignados,
        'ninos_asignados', i.ninos_asignados,
        'activo', i.activo,

        'confirmacion',
            case
                when c.invitado_id is null then null
                else jsonb_build_object(
                    'adultos_confirmados', c.adultos_confirmados,
                    'ninos_confirmados', c.ninos_confirmados,
                    'mensaje', c.mensaje,
                    'estado', c.estado,
                    'fecha_confirmacion', c.fecha_confirmacion,
                    'fecha_actualizacion', c.fecha_actualizacion
                )
            end,

        'rsvp_activo',
            coalesce(
                (
                    select (valor #>> '{}')::boolean
                    from public.configuracion
                    where clave = 'rsvp_activo'
                ),
                true
            ),

        'permitir_modificaciones',
            coalesce(
                (
                    select (valor #>> '{}')::boolean
                    from public.configuracion
                    where clave = 'permitir_modificaciones'
                ),
                true
            ),

        'fecha_limite_rsvp',
            (
                select valor #>> '{}'
                from public.configuracion
                where clave = 'fecha_limite_rsvp'
            )
    )
    into v_resultado
    from public.invitados i
    left join public.confirmaciones c
        on c.invitado_id = i.id
    where i.token_acceso = p_token
      and i.activo = true;

    if v_resultado is null then
        raise exception 'La invitación no existe o no está activa.';
    end if;

    return v_resultado;
end;
$$;


-- =========================================================
-- 9. RPC: GUARDAR O MODIFICAR CONFIRMACIÓN
-- UPSERT: crea o actualiza el mismo registro.
-- =========================================================

create or replace function public.guardar_confirmacion(
    p_token uuid,
    p_adultos smallint,
    p_ninos smallint,
    p_mensaje text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_invitado_id bigint;
begin
    if p_adultos is null or p_adultos < 0 then
        raise exception 'La cantidad de adultos no es válida.';
    end if;

    if p_ninos is null or p_ninos < 0 then
        raise exception 'La cantidad de niños no es válida.';
    end if;

    select id
    into v_invitado_id
    from public.invitados
    where token_acceso = p_token
      and activo = true;

    if not found then
        raise exception 'La invitación no existe o no está activa.';
    end if;

    insert into public.confirmaciones (
        invitado_id,
        adultos_confirmados,
        ninos_confirmados,
        mensaje,
        estado
    )
    values (
        v_invitado_id,
        p_adultos,
        p_ninos,
        nullif(trim(p_mensaje), ''),
        case
            when p_adultos + p_ninos = 0
                then 'no_asistira'
            else 'confirmado'
        end
    )
    on conflict (invitado_id)
    do update set
        adultos_confirmados = excluded.adultos_confirmados,
        ninos_confirmados = excluded.ninos_confirmados,
        mensaje = excluded.mensaje,
        estado = excluded.estado;

    return public.obtener_invitacion(p_token);
end;
$$;


-- =========================================================
-- 10. SEGURIDAD Y PERMISOS
-- =========================================================

alter table public.invitados
    enable row level security;

alter table public.confirmaciones
    enable row level security;

alter table public.historial_confirmaciones
    enable row level security;

alter table public.configuracion
    enable row level security;

-- No se crean políticas públicas sobre las tablas.
-- El navegador accede exclusivamente mediante funciones RPC.

revoke all on table public.invitados
    from anon, authenticated;

revoke all on table public.confirmaciones
    from anon, authenticated;

revoke all on table public.historial_confirmaciones
    from anon, authenticated;

revoke all on table public.configuracion
    from anon, authenticated;

revoke all on sequence public.invitados_id_seq
    from anon, authenticated;

revoke all on sequence public.historial_confirmaciones_id_seq
    from anon, authenticated;

-- Las funciones no deben quedar ejecutables automáticamente
-- para todos los roles.

revoke execute on function
    public.obtener_invitacion(uuid)
    from public;

revoke execute on function
    public.guardar_confirmacion(uuid, smallint, smallint, text)
    from public;

grant execute on function
    public.obtener_invitacion(uuid)
    to anon, authenticated;

grant execute on function
    public.guardar_confirmacion(uuid, smallint, smallint, text)
    to anon, authenticated;

commit;