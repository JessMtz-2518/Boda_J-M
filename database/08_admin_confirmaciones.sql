begin;

-- =========================================================
-- BODA J&M 2027
-- MÓDULO ADMINISTRATIVO DE CONFIRMACIONES · FASE 1
--
-- Capa de datos para:
--   - listado paginado de confirmaciones;
--   - detalle + historial;
--   - corrección administrativa de asistencia;
--   - auditoría con administrador y motivo.
--
-- No modifica la interfaz pública del RSVP.
-- =========================================================


-- =========================================================
-- 1. TRAZABILIDAD: NOMBRE HISTÓRICO DEL ADMINISTRADOR
-- =========================================================

alter table public.historial_confirmaciones
add column if not exists administrador_nombre text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_confirmaciones_admin_nombre_check'
          and conrelid = 'public.historial_confirmaciones'::regclass
    ) then
        alter table public.historial_confirmaciones
        add constraint historial_confirmaciones_admin_nombre_check
        check (
            administrador_nombre is null
            or char_length(trim(administrador_nombre)) between 1 and 150
        );
    end if;
end;
$$;

create index if not exists confirmaciones_admin_listado_idx
    on public.confirmaciones (
        fecha_actualizacion desc,
        invitado_id
    );

create index if not exists historial_confirmaciones_admin_consulta_idx
    on public.historial_confirmaciones (
        invitado_id,
        fecha_evento desc,
        id desc
    );


-- =========================================================
-- 2. VALIDACIÓN DE CONFIRMACIÓN
--
-- Conserva todas las reglas del RSVP público.
-- Una corrección administrativa autorizada puede realizarse aunque:
--   - el periodo RSVP esté cerrado;
--   - haya vencido la fecha límite;
--   - las modificaciones públicas estén deshabilitadas;
--   - la invitación esté inactiva.
--
-- Aun para administración:
--   - el invitado debe existir;
--   - no se puede exceder el cupo asignado;
--   - los valores no pueden ser negativos por constraints de tabla.
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

    v_admin_correction boolean := false;
begin
    v_admin_correction :=
        coalesce(
            nullif(
                current_setting('app.admin_confirmation_correction', true),
                ''
            )::boolean,
            false
        )
        and auth.uid() is not null
        and private.es_administrador_activo();

    select
        i.adultos_asignados,
        i.ninos_asignados,
        i.activo
    into
        v_adultos_asignados,
        v_ninos_asignados,
        v_activo
    from public.invitados as i
    where i.id = new.invitado_id
    for update of i;

    if not found then
        raise exception 'La invitación indicada no existe.';
    end if;

    if not v_admin_correction then
        if not v_activo then
            raise exception 'Esta invitación no se encuentra activa.';
        end if;

        select coalesce(
            (
                select (c.valor #>> '{}')::boolean
                from public.configuracion as c
                where c.clave = 'rsvp_activo'
            ),
            true
        )
        into v_rsvp_activo;

        if not v_rsvp_activo then
            raise exception 'El periodo de confirmaciones está cerrado.';
        end if;

        select (
            select nullif(c.valor #>> '{}', '')::timestamptz
            from public.configuracion as c
            where c.clave = 'fecha_limite_rsvp'
        )
        into v_fecha_limite;

        if v_fecha_limite is not null and now() > v_fecha_limite then
            raise exception 'La fecha límite para confirmar ha concluido.';
        end if;

        if tg_op = 'UPDATE' then
            select coalesce(
                (
                    select (c.valor #>> '{}')::boolean
                    from public.configuracion as c
                    where c.clave = 'permitir_modificaciones'
                ),
                true
            )
            into v_permitir_modificaciones;

            if not v_permitir_modificaciones then
                raise exception 'La confirmación ya no puede modificarse.';
            end if;
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

revoke execute on function public.validar_confirmacion()
from public, anon, authenticated;


-- =========================================================
-- 3. HISTORIAL AUTOMÁTICO
--
-- Detecta si la modificación provino de la RPC administrativa.
-- El motivo viaja solo dentro de la transacción mediante set_config().
-- El RSVP público conserva origen='invitado'.
-- =========================================================

create or replace function public.registrar_historial_confirmacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_es_admin boolean := false;
    v_motivo text;
    v_admin_nombre text;
begin
    v_es_admin :=
        coalesce(
            nullif(
                current_setting('app.admin_confirmation_correction', true),
                ''
            )::boolean,
            false
        )
        and auth.uid() is not null
        and private.es_administrador_activo();

    if v_es_admin then
        v_motivo := nullif(
            trim(
                current_setting(
                    'app.admin_confirmation_reason',
                    true
                )
            ),
            ''
        );

        select a.nombre
        into v_admin_nombre
        from public.administradores as a
        where a.usuario_id = auth.uid()
          and a.activo = true
          and a.rol = 'administrador';

        if v_motivo is null
           or char_length(v_motivo) > 1000
           or v_admin_nombre is null then
            raise exception 'AUDITORIA_ADMIN_INVALIDA'
                using errcode = '22023';
        end if;
    end if;

    insert into public.historial_confirmaciones (
        invitado_id,
        accion,
        datos_anteriores,
        datos_nuevos,
        origen,
        modificado_por,
        motivo,
        administrador_nombre
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
        to_jsonb(new),
        case when v_es_admin then 'administrador' else 'invitado' end,
        case when v_es_admin then auth.uid() else null end,
        case when v_es_admin then v_motivo else null end,
        case when v_es_admin then v_admin_nombre else null end
    );

    return new;
end;
$$;

revoke execute on function public.registrar_historial_confirmacion()
from public, anon, authenticated;


-- =========================================================
-- 4. PROYECCIÓN PRIVADA DEL MÓDULO
-- =========================================================

create or replace view private.admin_confirmaciones_gestion
with (security_barrier = true)
as
select
    i.id as invitado_id,
    i.codigo,
    i.nombre,
    i.grupo,
    i.activo as invitacion_activa,

    i.adultos_asignados,
    i.ninos_asignados,
    (i.adultos_asignados + i.ninos_asignados)::integer
        as cupo_total,

    c.estado,
    c.adultos_confirmados::integer,
    c.ninos_confirmados::integer,
    (c.adultos_confirmados + c.ninos_confirmados)::integer
        as total_confirmado,
    c.mensaje,
    c.fecha_confirmacion,
    c.fecha_actualizacion,
    exists (
        select 1
        from public.historial_confirmaciones as h
        where h.invitado_id = i.id
          and h.accion = 'actualizada'
    ) as tiene_actualizaciones
from public.confirmaciones as c
join public.invitados as i
    on i.id = c.invitado_id;

revoke all on table private.admin_confirmaciones_gestion
from public, anon, authenticated;


-- =========================================================
-- 5. RPC: LISTAR CONFIRMACIONES
-- =========================================================

create or replace function public.admin_listar_confirmaciones(
    p_busqueda text default null,
    p_grupo text default null,
    p_estado text default null,
    p_activo boolean default null,
    p_pagina integer default 1,
    p_tamano_pagina integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_busqueda text := nullif(trim(coalesce(p_busqueda, '')), '');
    v_grupo text := nullif(trim(coalesce(p_grupo, '')), '');
    v_estado text := nullif(trim(coalesce(p_estado, '')), '');

    v_total integer;
    v_total_paginas integer;
    v_offset integer;
    v_items jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_pagina is null or p_pagina < 1 then
        raise exception 'PAGINA_INVALIDA'
            using errcode = '22023';
    end if;

    if p_tamano_pagina is null
       or p_tamano_pagina not in (10, 20, 50) then
        raise exception 'TAMANO_PAGINA_INVALIDO'
            using errcode = '22023';
    end if;

    if v_grupo is not null
       and v_grupo not in (
            'Familia Marcos',
            'Familia Jess',
            'Amigos Marcos',
            'Amigos Jess'
       ) then
        raise exception 'GRUPO_INVALIDO'
            using errcode = '22023';
    end if;

    if v_estado is not null
       and v_estado not in ('confirmado', 'no_asistira') then
        raise exception 'ESTADO_INVALIDO'
            using errcode = '22023';
    end if;

    if v_busqueda is not null and char_length(v_busqueda) > 150 then
        raise exception 'BUSQUEDA_DEMASIADO_LARGA'
            using errcode = '22023';
    end if;

    select count(*)
    into v_total
    from private.admin_confirmaciones_gestion as c
    where
        (
            v_busqueda is null
            or c.nombre ilike '%' || v_busqueda || '%'
            or c.codigo ilike '%' || v_busqueda || '%'
            or c.grupo ilike '%' || v_busqueda || '%'
        )
        and (v_grupo is null or c.grupo = v_grupo)
        and (v_estado is null or c.estado = v_estado)
        and (p_activo is null or c.invitacion_activa = p_activo);

    v_total_paginas :=
        case
            when v_total = 0 then 0
            else ceil(v_total::numeric / p_tamano_pagina)::integer
        end;

    if v_total_paginas > 0 and p_pagina > v_total_paginas then
        raise exception 'PAGINA_FUERA_DE_RANGO'
            using errcode = '22023';
    end if;

    v_offset := (p_pagina - 1) * p_tamano_pagina;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'invitado_id', q.invitado_id,
                'codigo', q.codigo,
                'nombre', q.nombre,
                'grupo', q.grupo,
                'invitacion_activa', q.invitacion_activa,
                'cupo', jsonb_build_object(
                    'adultos', q.adultos_asignados,
                    'ninos', q.ninos_asignados,
                    'total', q.cupo_total
                ),
                'confirmacion', jsonb_build_object(
                    'estado', q.estado,
                    'adultos', q.adultos_confirmados,
                    'ninos', q.ninos_confirmados,
                    'total', q.total_confirmado,
                    'tiene_mensaje', q.mensaje is not null,
                    'tiene_actualizaciones', q.tiene_actualizaciones,
                    'fecha_confirmacion', q.fecha_confirmacion,
                    'fecha_actualizacion', q.fecha_actualizacion
                )
            )
            order by q.fecha_actualizacion desc, q.invitado_id desc
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select c.*
        from private.admin_confirmaciones_gestion as c
        where
            (
                v_busqueda is null
                or c.nombre ilike '%' || v_busqueda || '%'
                or c.codigo ilike '%' || v_busqueda || '%'
                or c.grupo ilike '%' || v_busqueda || '%'
            )
            and (v_grupo is null or c.grupo = v_grupo)
            and (v_estado is null or c.estado = v_estado)
            and (p_activo is null or c.invitacion_activa = p_activo)
        order by c.fecha_actualizacion desc, c.invitado_id desc
        limit p_tamano_pagina
        offset v_offset
    ) as q;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'items', v_items,
            'pagination', jsonb_build_object(
                'page', p_pagina,
                'page_size', p_tamano_pagina,
                'total_items', v_total,
                'total_pages', v_total_paginas,
                'has_previous', p_pagina > 1,
                'has_next',
                    v_total_paginas > 0
                    and p_pagina < v_total_paginas
            )
        )
    );
end;
$$;


-- =========================================================
-- 6. RPC: DETALLE + HISTORIAL DE CONFIRMACIÓN
-- =========================================================

create or replace function public.admin_obtener_confirmacion(
    p_invitado_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_actual jsonb;
    v_historial jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_invitado_id is null or p_invitado_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    select jsonb_build_object(
        'invitado_id', c.invitado_id,
        'codigo', c.codigo,
        'nombre', c.nombre,
        'grupo', c.grupo,
        'invitacion_activa', c.invitacion_activa,
        'cupo', jsonb_build_object(
            'adultos', c.adultos_asignados,
            'ninos', c.ninos_asignados,
            'total', c.cupo_total
        ),
        'confirmacion', jsonb_build_object(
            'estado', c.estado,
            'adultos', c.adultos_confirmados,
            'ninos', c.ninos_confirmados,
            'total', c.total_confirmado,
            'mensaje_original', c.mensaje,
            'fecha_confirmacion', c.fecha_confirmacion,
            'fecha_actualizacion', c.fecha_actualizacion,
            'version', c.fecha_actualizacion
        )
    )
    into v_actual
    from private.admin_confirmaciones_gestion as c
    where c.invitado_id = p_invitado_id;

    if v_actual is null then
        raise exception 'CONFIRMACION_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'accion', h.accion,
                'origen', h.origen,
                'datos_anteriores', h.datos_anteriores,
                'datos_nuevos', h.datos_nuevos,
                'modificado_por', h.modificado_por,
                'administrador_nombre', h.administrador_nombre,
                'motivo', h.motivo,
                'fecha_evento', h.fecha_evento
            )
            order by h.fecha_evento desc, h.id desc
        ),
        '[]'::jsonb
    )
    into v_historial
    from public.historial_confirmaciones as h
    where h.invitado_id = p_invitado_id;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'actual', v_actual,
            'historial', v_historial
        )
    );
end;
$$;


-- =========================================================
-- 7. RPC: CORRECCIÓN ADMINISTRATIVA
--
-- Corrige exclusivamente cantidades de asistencia.
-- El mensaje escrito por el invitado se conserva sin cambios.
-- =========================================================

create or replace function public.admin_corregir_confirmacion(
    p_invitado_id bigint,
    p_adultos smallint,
    p_ninos smallint,
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
    v_motivo text := trim(coalesce(p_motivo, ''));
    v_version_actual timestamptz;
    v_resultado jsonb;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_invitado_id is null or p_invitado_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_adultos is null or p_adultos < 0
       or p_ninos is null or p_ninos < 0 then
        raise exception 'ASISTENCIA_INVALIDA'
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

    select c.fecha_actualizacion
    into v_version_actual
    from public.confirmaciones as c
    where c.invitado_id = p_invitado_id
    for update of c;

    if not found then
        raise exception 'CONFIRMACION_NO_ENCONTRADA'
            using errcode = 'P0002';
    end if;

    if v_version_actual is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = '40001';
    end if;

    perform set_config(
        'app.admin_confirmation_correction',
        'true',
        true
    );

    perform set_config(
        'app.admin_confirmation_reason',
        v_motivo,
        true
    );

    update public.confirmaciones as c
    set
        adultos_confirmados = p_adultos,
        ninos_confirmados = p_ninos
    where c.invitado_id = p_invitado_id;

    select jsonb_build_object(
        'corrected', true,
        'invitado_id', c.invitado_id,
        'estado', c.estado,
        'adultos_confirmados', c.adultos_confirmados,
        'ninos_confirmados', c.ninos_confirmados,
        'total_confirmado',
            c.adultos_confirmados + c.ninos_confirmados,
        'version', c.fecha_actualizacion
    )
    into v_resultado
    from public.confirmaciones as c
    where c.invitado_id = p_invitado_id;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', v_resultado
    );
end;
$$;


-- =========================================================
-- 8. PERMISOS
-- =========================================================

revoke execute on function public.admin_listar_confirmaciones(
    text,
    text,
    text,
    boolean,
    integer,
    integer
)
from public, anon;

grant execute on function public.admin_listar_confirmaciones(
    text,
    text,
    text,
    boolean,
    integer,
    integer
)
to authenticated;

revoke execute on function public.admin_obtener_confirmacion(bigint)
from public, anon;

grant execute on function public.admin_obtener_confirmacion(bigint)
to authenticated;

revoke execute on function public.admin_corregir_confirmacion(
    bigint,
    smallint,
    smallint,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_corregir_confirmacion(
    bigint,
    smallint,
    smallint,
    text,
    timestamptz
)
to authenticated;

commit;
