begin;

-- =========================================================
-- BODA J&M 2027
-- MESAS · FASE 5.2
-- Editor avanzado del plano
--
-- Agrega:
--   - dimensiones persistentes del lienzo;
--   - coordenadas de mundo expansibles (> 100);
--   - guardado transaccional de lienzo + mesas + elementos;
--   - redimensionamiento persistente de elementos visuales.
--
-- Compatible con las posiciones 0..100 existentes.
-- =========================================================


-- =========================================================
-- 1. CONFIGURACIÓN DEL LIENZO
-- =========================================================

create table if not exists public.configuracion_plano_mesas (
    id smallint primary key default 1,
    ancho numeric(8,3) not null default 100,
    alto numeric(8,3) not null default 100,
    fecha_actualizacion timestamptz not null default now(),

    constraint configuracion_plano_mesas_unica
        check (id = 1),

    constraint configuracion_plano_mesas_ancho_check
        check (ancho between 60 and 600),

    constraint configuracion_plano_mesas_alto_check
        check (alto between 60 and 600)
);

insert into public.configuracion_plano_mesas (id, ancho, alto)
values (1, 100, 100)
on conflict (id) do nothing;


create or replace function public.actualizar_fecha_configuracion_plano_mesas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.fecha_actualizacion := now();
    return new;
end;
$$;

drop trigger if exists trg_configuracion_plano_mesas_fecha
on public.configuracion_plano_mesas;

create trigger trg_configuracion_plano_mesas_fecha
before update on public.configuracion_plano_mesas
for each row
execute function public.actualizar_fecha_configuracion_plano_mesas();


-- =========================================================
-- 2. AMPLIAR RANGO DE COORDENADAS
-- =========================================================

alter table public.mesas
    drop constraint if exists mesas_plano_x_check;

alter table public.mesas
    drop constraint if exists mesas_plano_y_check;

alter table public.mesas
    add constraint mesas_plano_x_check
        check (plano_x is null or plano_x between 0 and 600);

alter table public.mesas
    add constraint mesas_plano_y_check
        check (plano_y is null or plano_y between 0 and 600);


alter table public.elementos_plano
    drop constraint if exists elementos_plano_x_check;

alter table public.elementos_plano
    drop constraint if exists elementos_plano_y_check;

alter table public.elementos_plano
    drop constraint if exists elementos_plano_ancho_check;

alter table public.elementos_plano
    drop constraint if exists elementos_plano_alto_check;

alter table public.elementos_plano
    add constraint elementos_plano_x_check
        check (plano_x is null or plano_x between 0 and 600);

alter table public.elementos_plano
    add constraint elementos_plano_y_check
        check (plano_y is null or plano_y between 0 and 600);

alter table public.elementos_plano
    add constraint elementos_plano_ancho_check
        check (ancho between 3 and 300);

alter table public.elementos_plano
    add constraint elementos_plano_alto_check
        check (alto between 3 and 300);


-- =========================================================
-- 3. AMPLIAR HISTORIAL
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
                'plano_actualizado',
                'elementos_plano_actualizados',
                'editor_plano_actualizado'
            )
        );
exception
    when duplicate_object then
        null;
end;
$$;


-- =========================================================
-- 4. OBTENER CONFIGURACIÓN DEL EDITOR
-- =========================================================

create or replace function public.admin_obtener_configuracion_plano()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_cfg public.configuracion_plano_mesas%rowtype;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    select *
    into v_cfg
    from public.configuracion_plano_mesas
    where id = 1;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'ancho', v_cfg.ancho,
            'alto', v_cfg.alto,
            'version', v_cfg.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 5. GUARDAR EDITOR COMPLETO EN UNA TRANSACCIÓN
--
-- p_mesas:
-- [{"mesa_id":1,"x":20.5,"y":33.2}, ...]
--
-- p_elementos:
-- [{"id":1,"x":50,"y":10,"ancho":24,"alto":9}, ...]
-- =========================================================

create or replace function public.admin_guardar_editor_plano(
    p_ancho numeric,
    p_alto numeric,
    p_mesas jsonb,
    p_elementos jsonb,
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

    v_mesa jsonb;
    v_elemento jsonb;

    v_id bigint;
    v_x numeric;
    v_y numeric;
    v_ancho_elemento numeric;
    v_alto_elemento numeric;

    v_antes_config jsonb;
    v_antes_mesas jsonb;
    v_antes_elementos jsonb;
    v_despues_mesas jsonb;
    v_despues_elementos jsonb;

    v_total_mesas integer := 0;
    v_total_elementos integer := 0;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_ancho is null
       or p_alto is null
       or p_ancho not between 60 and 600
       or p_alto not between 60 and 600 then
        raise exception 'LIENZO_DIMENSION_INVALIDA'
            using errcode = '22023';
    end if;

    if p_mesas is null
       or jsonb_typeof(p_mesas) <> 'array'
       or p_elementos is null
       or jsonb_typeof(p_elementos) <> 'array' then
        raise exception 'EDITOR_PLANO_INVALIDO'
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

    select jsonb_build_object(
        'ancho', c.ancho,
        'alto', c.alto
    )
    into v_antes_config
    from public.configuracion_plano_mesas as c
    where c.id = 1
    for update;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'mesa_id', m.id,
                'x', m.plano_x,
                'y', m.plano_y
            )
            order by m.numero
        ),
        '[]'::jsonb
    )
    into v_antes_mesas
    from public.mesas as m
    where m.activo = true;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', e.id,
                'x', e.plano_x,
                'y', e.plano_y,
                'ancho', e.ancho,
                'alto', e.alto
            )
            order by e.id
        ),
        '[]'::jsonb
    )
    into v_antes_elementos
    from public.elementos_plano as e
    where e.activo = true;

    -- Configuración del lienzo.
    update public.configuracion_plano_mesas
    set
        ancho = round(p_ancho, 3),
        alto = round(p_alto, 3)
    where id = 1;

    -- Mesas.
    for v_mesa in
        select value
        from jsonb_array_elements(p_mesas)
    loop
        v_id := nullif(v_mesa ->> 'mesa_id', '')::bigint;
        v_x := nullif(v_mesa ->> 'x', '')::numeric;
        v_y := nullif(v_mesa ->> 'y', '')::numeric;

        if v_id is null
           or v_x is null
           or v_y is null
           or v_x < 0
           or v_y < 0
           or v_x > p_ancho
           or v_y > p_alto then
            raise exception 'PLANO_POSICION_INVALIDA'
                using errcode = '22023';
        end if;

        update public.mesas
        set
            plano_x = round(v_x, 3),
            plano_y = round(v_y, 3)
        where id = v_id
          and activo = true;

        if not found then
            raise exception 'MESA_NO_ENCONTRADA'
                using errcode = 'P0002';
        end if;

        v_total_mesas := v_total_mesas + 1;
    end loop;

    -- Elementos.
    for v_elemento in
        select value
        from jsonb_array_elements(p_elementos)
    loop
        v_id := nullif(v_elemento ->> 'id', '')::bigint;
        v_x := nullif(v_elemento ->> 'x', '')::numeric;
        v_y := nullif(v_elemento ->> 'y', '')::numeric;
        v_ancho_elemento := nullif(v_elemento ->> 'ancho', '')::numeric;
        v_alto_elemento := nullif(v_elemento ->> 'alto', '')::numeric;

        if v_id is null
           or v_x is null
           or v_y is null
           or v_ancho_elemento is null
           or v_alto_elemento is null
           or v_ancho_elemento not between 3 and 300
           or v_alto_elemento not between 3 and 300
           or v_x - (v_ancho_elemento / 2) < 0
           or v_y - (v_alto_elemento / 2) < 0
           or v_x + (v_ancho_elemento / 2) > p_ancho
           or v_y + (v_alto_elemento / 2) > p_alto then
            raise exception 'ELEMENTO_PLANO_POSICION_INVALIDA'
                using errcode = '22023';
        end if;

        update public.elementos_plano
        set
            plano_x = round(v_x, 3),
            plano_y = round(v_y, 3),
            ancho = round(v_ancho_elemento, 3),
            alto = round(v_alto_elemento, 3)
        where id = v_id
          and activo = true;

        if not found then
            raise exception 'ELEMENTO_PLANO_NO_ENCONTRADO'
                using errcode = 'P0002';
        end if;

        v_total_elementos := v_total_elementos + 1;
    end loop;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'mesa_id', m.id,
                'x', m.plano_x,
                'y', m.plano_y
            )
            order by m.numero
        ),
        '[]'::jsonb
    )
    into v_despues_mesas
    from public.mesas as m
    where m.activo = true;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', e.id,
                'x', e.plano_x,
                'y', e.plano_y,
                'ancho', e.ancho,
                'alto', e.alto
            )
            order by e.id
        ),
        '[]'::jsonb
    )
    into v_despues_elementos
    from public.elementos_plano as e
    where e.activo = true;

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
        'editor_plano_actualizado',
        jsonb_build_object(
            'lienzo', v_antes_config,
            'mesas', v_antes_mesas,
            'elementos', v_antes_elementos
        ),
        jsonb_build_object(
            'lienzo', jsonb_build_object(
                'ancho', round(p_ancho, 3),
                'alto', round(p_alto, 3)
            ),
            'mesas', v_despues_mesas,
            'elementos', v_despues_elementos
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
            'ancho', round(p_ancho, 3),
            'alto', round(p_alto, 3),
            'mesas_actualizadas', v_total_mesas,
            'elementos_actualizados', v_total_elementos
        )
    );
end;
$$;


-- =========================================================
-- 6. PERMISOS
-- =========================================================

revoke all on public.configuracion_plano_mesas
from public, anon;

grant select on public.configuracion_plano_mesas
to authenticated;

revoke execute on function public.admin_obtener_configuracion_plano()
from public, anon;

grant execute on function public.admin_obtener_configuracion_plano()
to authenticated;

revoke execute on function public.admin_guardar_editor_plano(
    numeric,
    numeric,
    jsonb,
    jsonb,
    text
)
from public, anon;

grant execute on function public.admin_guardar_editor_plano(
    numeric,
    numeric,
    jsonb,
    jsonb,
    text
)
to authenticated;

commit;
