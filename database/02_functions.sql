begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 1.2 · MEJORA DE LA TABLA INVITADOS
-- =========================================================

-- 1. CAMPOS ADMINISTRATIVOS OPCIONALES

alter table public.invitados
add column if not exists telefono text;

alter table public.invitados
add column if not exists notas_admin text;

alter table public.invitados
add column if not exists orden_grupo smallint;


-- 2. CUPO TOTAL CALCULADO AUTOMÁTICAMENTE

alter table public.invitados
add column if not exists cupo_total smallint
generated always as (
    adultos_asignados + ninos_asignados
) stored;


-- 3. VALIDAR FORMATO DEL CÓDIGO RSVP
-- Ejemplos válidos:
-- JM-FM-001
-- JM-FJ-001
-- JM-AM-001
-- JM-AJ-001

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_codigo_formato_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_codigo_formato_check
        check (
            codigo ~ '^JM-(FM|FJ|AM|AJ)-[0-9]{3}$'
        );
    end if;
end;
$$;


-- 4. LIMITAR LOS GRUPOS VÁLIDOS

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_grupo_valido_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_grupo_valido_check
        check (
            grupo in (
                'Familia Marcos',
                'Familia Jess',
                'Amigos Marcos',
                'Amigos Jess'
            )
        );
    end if;
end;
$$;


-- 5. VALIDAR TELÉFONO CUANDO SE CAPTURE
-- Se permiten números, espacios, +, guiones y paréntesis.

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_telefono_formato_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_telefono_formato_check
        check (
            telefono is null
            or telefono = ''
            or telefono ~ '^[0-9+() -]{7,25}$'
        );
    end if;
end;
$$;


-- 6. LIMITAR LONGITUD DE LOS TEXTOS

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_nombre_longitud_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_nombre_longitud_check
        check (
            char_length(trim(nombre)) between 1 and 150
        );
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_notas_longitud_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_notas_longitud_check
        check (
            notas_admin is null
            or char_length(notas_admin) <= 1000
        );
    end if;
end;
$$;


-- 7. ORDEN VÁLIDO DENTRO DEL GRUPO

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'invitados_orden_grupo_check'
          and conrelid = 'public.invitados'::regclass
    ) then
        alter table public.invitados
        add constraint invitados_orden_grupo_check
        check (
            orden_grupo is null
            or orden_grupo > 0
        );
    end if;
end;
$$;


-- 8. ÍNDICES ADMINISTRATIVOS

create index if not exists invitados_codigo_idx
    on public.invitados (codigo);

create index if not exists invitados_nombre_idx
    on public.invitados (lower(nombre));

create index if not exists invitados_grupo_orden_idx
    on public.invitados (grupo, orden_grupo);


-- 9. MANTENER RLS Y ACCESO DIRECTO BLOQUEADO

alter table public.invitados
enable row level security;

revoke all on table public.invitados
from anon, authenticated;

commit;