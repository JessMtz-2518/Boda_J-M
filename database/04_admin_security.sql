begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 3.1 · SEGURIDAD Y AUTORIZACION ADMINISTRATIVA
--
-- Este script no crea interfaces ni modifica las RPC publicas
-- del RSVP. Debe revisarse y ejecutarse manualmente en Supabase.
-- =========================================================

-- =========================================================
-- 1. ADMINISTRADORES AUTORIZADOS
-- =========================================================

create table if not exists public.administradores (
    usuario_id uuid primary key,

    nombre text not null,

    rol text not null default 'administrador',

    activo boolean not null default true,

    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),

    constraint administradores_usuario_id_fkey
        foreign key (usuario_id)
        references auth.users(id)
        on delete cascade
);

-- Garantiza ON DELETE CASCADE incluso si la tabla hubiera sido
-- creada previamente con otra accion referencial.
do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'administradores_usuario_id_fkey'
          and conrelid = 'public.administradores'::regclass
          and confdeltype <> 'c'
    ) then
        alter table public.administradores
        drop constraint administradores_usuario_id_fkey;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'administradores_usuario_id_fkey'
          and conrelid = 'public.administradores'::regclass
    ) then
        alter table public.administradores
        add constraint administradores_usuario_id_fkey
        foreign key (usuario_id)
        references auth.users(id)
        on delete cascade;
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'administradores_rol_valido_check'
          and conrelid = 'public.administradores'::regclass
    ) then
        alter table public.administradores
        add constraint administradores_rol_valido_check
        check (rol = 'administrador');
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'administradores_nombre_longitud_check'
          and conrelid = 'public.administradores'::regclass
    ) then
        alter table public.administradores
        add constraint administradores_nombre_longitud_check
        check (char_length(trim(nombre)) between 1 and 150);
    end if;
end;
$$;

alter table public.administradores
enable row level security;

-- No se crean politicas de acceso directo. El navegador solo
-- podra comprobar su acceso mediante la RPC administrativa.
revoke all on table public.administradores
from anon, authenticated;


-- =========================================================
-- 2. FECHA DE ACTUALIZACION AUTOMATICA
-- =========================================================

create or replace function public.actualizar_fecha_administrador()
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

drop trigger if exists trg_administradores_fecha
on public.administradores;

create trigger trg_administradores_fecha
before update on public.administradores
for each row
execute function public.actualizar_fecha_administrador();

revoke execute on function
public.actualizar_fecha_administrador()
from public, anon, authenticated;


-- =========================================================
-- 3. FUNCION INTERNA DE AUTORIZACION
-- =========================================================

create schema if not exists private;

revoke all on schema private
from public, anon, authenticated;

create or replace function private.es_administrador_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.administradores as a
        where a.usuario_id = (select auth.uid())
          and a.activo = true
          and a.rol = 'administrador'
    );
$$;

revoke execute on function
private.es_administrador_activo()
from public, anon, authenticated;


-- =========================================================
-- 4. RPC: VERIFICAR ACCESO ADMINISTRATIVO
-- =========================================================

create or replace function public.admin_verificar_acceso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_usuario_id uuid := auth.uid();
    v_nombre text;
    v_rol text;
begin
    if v_usuario_id is null then
        return jsonb_build_object(
            'autorizado', false,
            'nombre', null,
            'rol', null
        );
    end if;

    if not private.es_administrador_activo() then
        return jsonb_build_object(
            'autorizado', false,
            'nombre', null,
            'rol', null
        );
    end if;

    select
        a.nombre,
        a.rol
    into
        v_nombre,
        v_rol
    from public.administradores as a
    where a.usuario_id = v_usuario_id
      and a.activo = true
      and a.rol = 'administrador';

    return jsonb_build_object(
        'autorizado', true,
        'nombre', v_nombre,
        'rol', v_rol
    );
end;
$$;

revoke execute on function
public.admin_verificar_acceso()
from public, anon;

grant execute on function
public.admin_verificar_acceso()
to authenticated;


-- =========================================================
-- 5. TRAZABILIDAD ADMINISTRATIVA
-- Las columnas son compatibles con el historial existente.
-- Los registros previos quedan marcados como origen invitado.
-- =========================================================

alter table public.historial_confirmaciones
add column if not exists origen text not null default 'invitado';

alter table public.historial_confirmaciones
add column if not exists modificado_por uuid;

alter table public.historial_confirmaciones
add column if not exists motivo text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_confirmaciones_origen_check'
          and conrelid = 'public.historial_confirmaciones'::regclass
    ) then
        alter table public.historial_confirmaciones
        add constraint historial_confirmaciones_origen_check
        check (origen in ('invitado', 'administrador'));
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_confirmaciones_modificado_por_fkey'
          and conrelid = 'public.historial_confirmaciones'::regclass
    ) then
        alter table public.historial_confirmaciones
        add constraint historial_confirmaciones_modificado_por_fkey
        foreign key (modificado_por)
        references auth.users(id)
        on delete set null;
    end if;
end;
$$;

-- Compatible con el trigger actual del RSVP: las inserciones publicas
-- conservan el default origen = 'invitado' y dejan usuario/motivo en null.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_confirmaciones_consistencia_origen_check'
          and conrelid = 'public.historial_confirmaciones'::regclass
    ) then
        alter table public.historial_confirmaciones
        add constraint historial_confirmaciones_consistencia_origen_check
        check (
            (
                origen = 'invitado'
                and modificado_por is null
                and motivo is null
            )
            or
            (
                origen = 'administrador'
                and modificado_por is not null
                and motivo is not null
                and char_length(trim(motivo)) between 1 and 1000
            )
        );
    end if;
end;
$$;

-- Mantener RLS y el bloqueo de acceso directo ya definidos
-- para el historial publico.
alter table public.historial_confirmaciones
enable row level security;

revoke all on table public.historial_confirmaciones
from anon, authenticated;

commit;
