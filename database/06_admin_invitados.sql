begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 3.5A · GESTION ADMINISTRATIVA DE INVITADOS EXISTENTES
--
-- Revisar y ejecutar manualmente en Supabase.
-- No modifica las RPC publicas del RSVP ni concede acceso
-- directo a tablas o vistas desde el navegador.
-- =========================================================

-- =========================================================
-- 1. INDICES DE SOPORTE
-- =========================================================

create index if not exists invitados_admin_listado_idx
    on public.invitados (
        activo,
        grupo,
        orden_grupo,
        codigo,
        id
    );

create index if not exists confirmaciones_admin_invitado_idx
    on public.confirmaciones (invitado_id, fecha_actualizacion desc);


-- =========================================================
-- 2. HISTORIAL ADMINISTRATIVO DE INVITADOS
-- No contiene token_acceso y conserva la identidad historica
-- del administrador sin FK hacia auth.users.
-- =========================================================

create table if not exists public.historial_invitados (
    id bigint generated always as identity primary key,
    invitado_id bigint not null,
    accion text not null,
    datos_anteriores jsonb,
    datos_nuevos jsonb,
    modificado_por uuid not null,
    administrador_nombre text not null,
    motivo text not null,
    fecha_evento timestamptz not null default now(),

    constraint historial_invitados_invitado_id_fkey
        foreign key (invitado_id)
        references public.invitados(id),

    constraint historial_invitados_accion_check
        check (
            accion in (
                'creado',
                'actualizado',
                'desactivado',
                'reactivado'
            )
        ),

    constraint historial_invitados_motivo_check
        check (char_length(trim(motivo)) between 1 and 1000),

    constraint historial_invitados_admin_nombre_check
        check (
            char_length(trim(administrador_nombre)) between 1 and 150
        )
);

-- Completa restricciones si una ejecucion anterior hubiera creado
-- parcialmente la tabla.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_invitados_invitado_id_fkey'
          and conrelid = 'public.historial_invitados'::regclass
    ) then
        alter table public.historial_invitados
        add constraint historial_invitados_invitado_id_fkey
        foreign key (invitado_id)
        references public.invitados(id);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_invitados_accion_check'
          and conrelid = 'public.historial_invitados'::regclass
    ) then
        alter table public.historial_invitados
        add constraint historial_invitados_accion_check
        check (
            accion in (
                'creado',
                'actualizado',
                'desactivado',
                'reactivado'
            )
        );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_invitados_motivo_check'
          and conrelid = 'public.historial_invitados'::regclass
    ) then
        alter table public.historial_invitados
        add constraint historial_invitados_motivo_check
        check (char_length(trim(motivo)) between 1 and 1000);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'historial_invitados_admin_nombre_check'
          and conrelid = 'public.historial_invitados'::regclass
    ) then
        alter table public.historial_invitados
        add constraint historial_invitados_admin_nombre_check
        check (
            char_length(trim(administrador_nombre)) between 1 and 150
        );
    end if;
end;
$$;

create index if not exists historial_invitados_consulta_idx
    on public.historial_invitados (
        invitado_id,
        fecha_evento desc,
        id desc
    );

alter table public.historial_invitados
enable row level security;

revoke all on table public.historial_invitados
from public, anon, authenticated;

revoke all on sequence public.historial_invitados_id_seq
from public, anon, authenticated;


-- =========================================================
-- 3. PROYECCION PRIVADA DEL MODULO
-- Centraliza el estado actual sin exponer token_acceso.
-- Incluye telefono/notas solo para que las RPC autorizadas puedan
-- entregar el detalle bajo demanda.
-- =========================================================

create or replace view private.admin_invitados_gestion
with (security_barrier = true)
as
select
    i.id as invitado_id,
    i.codigo,
    i.nombre,
    i.grupo,
    i.adultos_asignados,
    i.ninos_asignados,
    i.cupo_total,
    i.telefono,
    i.notas_admin,
    i.orden_grupo,
    i.activo,
    i.fecha_creacion,
    i.fecha_actualizacion as version,
    (c.invitado_id is not null) as tiene_confirmacion,
    case
        when c.invitado_id is null then 'pendiente'
        when c.estado = 'confirmado' then 'asistira'
        when c.estado = 'no_asistira' then 'no_asistira'
    end as estado_confirmacion,
    coalesce(c.adultos_confirmados, 0)::integer
        as adultos_confirmados,
    coalesce(c.ninos_confirmados, 0)::integer
        as ninos_confirmados,
    coalesce(
        c.adultos_confirmados + c.ninos_confirmados,
        0
    )::integer as total_confirmado,
    c.mensaje as mensaje_confirmacion,
    c.fecha_confirmacion,
    c.fecha_actualizacion as fecha_actualizacion_confirmacion
from public.invitados as i
left join public.confirmaciones as c
    on c.invitado_id = i.id;

revoke all on table private.admin_invitados_gestion
from public, anon, authenticated;


-- =========================================================
-- 4. RPC: LISTAR INVITADOS
-- Busqueda, filtros, ordenamiento permitido y paginacion en servidor.
-- Nunca devuelve token, telefono completo, notas completas ni mensaje.
-- =========================================================

create or replace function public.admin_listar_invitados(
    p_busqueda text default null,
    p_grupo text default null,
    p_estado text default null,
    p_activo boolean default null,
    p_con_ninos boolean default null,
    p_sin_telefono boolean default null,
    p_con_notas boolean default null,
    p_pagina integer default 1,
    p_tamano_pagina integer default 20,
    p_orden text default 'grupo',
    p_direccion text default 'asc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_busqueda text := nullif(trim(p_busqueda), '');
    v_grupo text := nullif(trim(p_grupo), '');
    v_estado text := lower(nullif(trim(p_estado), ''));
    v_orden text := lower(nullif(trim(p_orden), ''));
    v_direccion text := lower(nullif(trim(p_direccion), ''));
    v_offset integer;
    v_total bigint;
    v_total_paginas integer;
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

    if v_busqueda is not null
       and char_length(v_busqueda) > 100 then
        raise exception 'BUSQUEDA_DEMASIADO_LARGA'
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
       and v_estado not in (
            'pendiente',
            'asistira',
            'no_asistira'
       ) then
        raise exception 'ESTADO_INVALIDO'
            using errcode = '22023';
    end if;

    if v_orden is null
       or v_orden not in (
            'grupo',
            'nombre',
            'codigo',
            'cupo_total',
            'estado',
            'fecha_actualizacion'
       ) then
        raise exception 'ORDEN_INVALIDO'
            using errcode = '22023';
    end if;

    if v_direccion is null
       or v_direccion not in ('asc', 'desc') then
        raise exception 'DIRECCION_INVALIDA'
            using errcode = '22023';
    end if;

    v_offset := (p_pagina - 1) * p_tamano_pagina;

    select count(*)
    into v_total
    from private.admin_invitados_gestion as g
    where (
            v_busqueda is null
            or g.nombre ilike '%' || v_busqueda || '%'
            or g.codigo ilike '%' || v_busqueda || '%'
            or g.grupo ilike '%' || v_busqueda || '%'
            or coalesce(g.telefono, '') ilike '%' || v_busqueda || '%'
        )
      and (v_grupo is null or g.grupo = v_grupo)
      and (v_estado is null or g.estado_confirmacion = v_estado)
      and (p_activo is null or g.activo = p_activo)
      and (
            p_con_ninos is null
            or (g.ninos_asignados > 0) = p_con_ninos
        )
      and (
            p_sin_telefono is null
            or (
                nullif(trim(coalesce(g.telefono, '')), '') is null
            ) = p_sin_telefono
        )
      and (
            p_con_notas is null
            or (
                nullif(trim(coalesce(g.notas_admin, '')), '') is not null
            ) = p_con_notas
        );

    v_total_paginas := case
        when v_total = 0 then 0
        else ceil(v_total::numeric / p_tamano_pagina)::integer
    end;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'invitado_id', q.invitado_id,
                'codigo', q.codigo,
                'nombre', q.nombre,
                'grupo', q.grupo,
                'adultos_asignados', q.adultos_asignados,
                'ninos_asignados', q.ninos_asignados,
                'cupo_total', q.cupo_total,
                'estado_confirmacion', q.estado_confirmacion,
                'adultos_confirmados', q.adultos_confirmados,
                'ninos_confirmados', q.ninos_confirmados,
                'total_confirmado', q.total_confirmado,
                'activo', q.activo,
                'tiene_telefono',
                    nullif(trim(coalesce(q.telefono, '')), '')
                        is not null,
                'tiene_notas',
                    nullif(trim(coalesce(q.notas_admin, '')), '')
                        is not null,
                'version', q.version
            )
            order by q.posicion
        ),
        '[]'::jsonb
    )
    into v_items
    from (
        select
            g.*,
            row_number() over (
                order by
                    case when v_orden = 'grupo'
                              and v_direccion = 'asc'
                        then case g.grupo
                            when 'Familia Marcos' then 1
                            when 'Familia Jess' then 2
                            when 'Amigos Marcos' then 3
                            when 'Amigos Jess' then 4
                            else 5
                        end
                    end asc,
                    case when v_orden = 'grupo'
                              and v_direccion = 'desc'
                        then case g.grupo
                            when 'Familia Marcos' then 1
                            when 'Familia Jess' then 2
                            when 'Amigos Marcos' then 3
                            when 'Amigos Jess' then 4
                            else 5
                        end
                    end desc,
                    case when v_orden = 'nombre'
                              and v_direccion = 'asc'
                        then lower(g.nombre)
                    end asc,
                    case when v_orden = 'nombre'
                              and v_direccion = 'desc'
                        then lower(g.nombre)
                    end desc,
                    case when v_orden = 'codigo'
                              and v_direccion = 'asc'
                        then g.codigo
                    end asc,
                    case when v_orden = 'codigo'
                              and v_direccion = 'desc'
                        then g.codigo
                    end desc,
                    case when v_orden = 'cupo_total'
                              and v_direccion = 'asc'
                        then g.cupo_total
                    end asc,
                    case when v_orden = 'cupo_total'
                              and v_direccion = 'desc'
                        then g.cupo_total
                    end desc,
                    case when v_orden = 'estado'
                              and v_direccion = 'asc'
                        then g.estado_confirmacion
                    end asc,
                    case when v_orden = 'estado'
                              and v_direccion = 'desc'
                        then g.estado_confirmacion
                    end desc,
                    case when v_orden = 'fecha_actualizacion'
                              and v_direccion = 'asc'
                        then g.version
                    end asc,
                    case when v_orden = 'fecha_actualizacion'
                              and v_direccion = 'desc'
                        then g.version
                    end desc,
                    g.id_for_order asc
            ) as posicion
        from (
            select
                ag.*,
                ag.invitado_id as id_for_order
            from private.admin_invitados_gestion as ag
            where (
                    v_busqueda is null
                    or ag.nombre ilike '%' || v_busqueda || '%'
                    or ag.codigo ilike '%' || v_busqueda || '%'
                    or ag.grupo ilike '%' || v_busqueda || '%'
                    or coalesce(ag.telefono, '')
                        ilike '%' || v_busqueda || '%'
                )
              and (v_grupo is null or ag.grupo = v_grupo)
              and (
                    v_estado is null
                    or ag.estado_confirmacion = v_estado
                )
              and (p_activo is null or ag.activo = p_activo)
              and (
                    p_con_ninos is null
                    or (ag.ninos_asignados > 0) = p_con_ninos
                )
              and (
                    p_sin_telefono is null
                    or (
                        nullif(
                            trim(coalesce(ag.telefono, '')),
                            ''
                        ) is null
                    ) = p_sin_telefono
                )
              and (
                    p_con_notas is null
                    or (
                        nullif(
                            trim(coalesce(ag.notas_admin, '')),
                            ''
                        ) is not null
                    ) = p_con_notas
                )
        ) as g
        order by posicion
        offset v_offset
        limit p_tamano_pagina
    ) as q;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'items', v_items,
            'paginacion', jsonb_build_object(
                'pagina', p_pagina,
                'tamano_pagina', p_tamano_pagina,
                'total_registros', v_total,
                'total_paginas', v_total_paginas
            ),
            'criterios', jsonb_build_object(
                'busqueda', v_busqueda,
                'grupo', v_grupo,
                'estado', v_estado,
                'activo', p_activo,
                'con_ninos', p_con_ninos,
                'sin_telefono', p_sin_telefono,
                'con_notas', p_con_notas,
                'orden', v_orden,
                'direccion', v_direccion
            )
        )
    );
end;
$$;


-- =========================================================
-- 5. RPC: OBTENER DETALLE
-- Entrega datos sensibles solo bajo demanda y nunca el token.
-- =========================================================

create or replace function public.admin_obtener_invitado(
    p_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_invitado jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_id is null or p_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    select jsonb_build_object(
        'invitado_id', g.invitado_id,
        'codigo', g.codigo,
        'nombre', g.nombre,
        'grupo', g.grupo,
        'adultos_asignados', g.adultos_asignados,
        'ninos_asignados', g.ninos_asignados,
        'cupo_total', g.cupo_total,
        'telefono', g.telefono,
        'notas', g.notas_admin,
        'activo', g.activo,
        'confirmacion', case
            when not g.tiene_confirmacion then null
            else jsonb_build_object(
                'estado', g.estado_confirmacion,
                'adultos_confirmados', g.adultos_confirmados,
                'ninos_confirmados', g.ninos_confirmados,
                'total_confirmado', g.total_confirmado,
                'mensaje', g.mensaje_confirmacion,
                'fecha_primera_respuesta', g.fecha_confirmacion,
                'fecha_ultima_actividad',
                    g.fecha_actualizacion_confirmacion
            )
        end,
        'version', g.version
    )
    into v_invitado
    from private.admin_invitados_gestion as g
    where g.invitado_id = p_id;

    if v_invitado is null then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object('invitado', v_invitado)
    );
end;
$$;


-- =========================================================
-- 6. RPC: ACTUALIZAR DATOS EDITABLES
-- La fila se bloquea, se valida la version y la auditoria se
-- inserta en la misma transaccion.
-- =========================================================

create or replace function public.admin_actualizar_invitado(
    p_id bigint,
    p_nombre text,
    p_grupo text,
    p_adultos_asignados smallint,
    p_ninos_asignados smallint,
    p_telefono text,
    p_notas text,
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
    v_anterior record;
    v_nuevo record;
    v_adultos_confirmados integer := 0;
    v_ninos_confirmados integer := 0;
    v_nombre text := trim(p_nombre);
    v_grupo text := trim(p_grupo);
    v_telefono text := nullif(trim(p_telefono), '');
    v_notas text := nullif(trim(p_notas), '');
    v_motivo text := trim(p_motivo);
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_id is null or p_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_version is null then
        raise exception 'VERSION_REQUERIDA'
            using errcode = '22023';
    end if;

    if p_nombre is null
       or char_length(v_nombre) not between 1 and 150 then
        raise exception 'NOMBRE_INVALIDO'
            using errcode = '22023';
    end if;

    if p_grupo is null
       or v_grupo not in (
            'Familia Marcos',
            'Familia Jess',
            'Amigos Marcos',
            'Amigos Jess'
       ) then
        raise exception 'GRUPO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_adultos_asignados is null or p_adultos_asignados < 0
       or p_ninos_asignados is null or p_ninos_asignados < 0 then
        raise exception 'CUPO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_telefono is not null
       and v_telefono is not null
       and v_telefono !~ '^[0-9+() -]{7,25}$' then
        raise exception 'TELEFONO_INVALIDO'
            using errcode = '22023';
    end if;

    if v_notas is not null and char_length(v_notas) > 1000 then
        raise exception 'NOTAS_DEMASIADO_LARGAS'
            using errcode = '22023';
    end if;

    if p_motivo is null
       or char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    select i.*
    into v_anterior
    from public.invitados as i
    where i.id = p_id
    for update;

    if not found then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    if v_anterior.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = 'P0001';
    end if;

    select
        coalesce(c.adultos_confirmados, 0),
        coalesce(c.ninos_confirmados, 0)
    into
        v_adultos_confirmados,
        v_ninos_confirmados
    from public.confirmaciones as c
    where c.invitado_id = p_id;

    if not found then
        v_adultos_confirmados := 0;
        v_ninos_confirmados := 0;
    end if;

    if p_adultos_asignados < v_adultos_confirmados then
        raise exception 'CUPO_ADULTOS_MENOR_A_CONFIRMACION'
            using errcode = '23514';
    end if;

    if p_ninos_asignados < v_ninos_confirmados then
        raise exception 'CUPO_NINOS_MENOR_A_CONFIRMACION'
            using errcode = '23514';
    end if;

    if v_anterior.nombre is not distinct from v_nombre
       and v_anterior.grupo is not distinct from v_grupo
       and v_anterior.adultos_asignados
            is not distinct from p_adultos_asignados
       and v_anterior.ninos_asignados
            is not distinct from p_ninos_asignados
       and v_anterior.telefono is not distinct from v_telefono
       and v_anterior.notas_admin is not distinct from v_notas then
        return jsonb_build_object(
            'schema_version', '1.0',
            'generated_at', now(),
            'data', jsonb_build_object(
                'invitado_id', p_id,
                'actualizado', false,
                'version', v_anterior.fecha_actualizacion
            )
        );
    end if;

    select a.nombre
    into v_admin_nombre
    from public.administradores as a
    where a.usuario_id = v_usuario_id
      and a.activo = true
      and a.rol = 'administrador';

    update public.invitados
    set
        nombre = v_nombre,
        grupo = v_grupo,
        adultos_asignados = p_adultos_asignados,
        ninos_asignados = p_ninos_asignados,
        telefono = v_telefono,
        notas_admin = v_notas
    where id = p_id
    returning * into v_nuevo;

    insert into public.historial_invitados (
        invitado_id,
        accion,
        datos_anteriores,
        datos_nuevos,
        modificado_por,
        administrador_nombre,
        motivo
    )
    values (
        p_id,
        'actualizado',
        jsonb_build_object(
            'nombre', v_anterior.nombre,
            'grupo', v_anterior.grupo,
            'adultos_asignados', v_anterior.adultos_asignados,
            'ninos_asignados', v_anterior.ninos_asignados,
            'telefono', v_anterior.telefono,
            'notas', v_anterior.notas_admin,
            'activo', v_anterior.activo
        ),
        jsonb_build_object(
            'nombre', v_nuevo.nombre,
            'grupo', v_nuevo.grupo,
            'adultos_asignados', v_nuevo.adultos_asignados,
            'ninos_asignados', v_nuevo.ninos_asignados,
            'telefono', v_nuevo.telefono,
            'notas', v_nuevo.notas_admin,
            'activo', v_nuevo.activo
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'invitado_id', p_id,
            'actualizado', true,
            'version', v_nuevo.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 7. RPC: ACTIVAR O DESACTIVAR
-- No modifica ni elimina confirmaciones existentes.
-- =========================================================

create or replace function public.admin_cambiar_estado_invitado(
    p_id bigint,
    p_activo boolean,
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
    v_anterior record;
    v_nuevo record;
    v_motivo text := trim(p_motivo);
    v_accion text;
begin
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_id is null or p_id < 1 or p_activo is null then
        raise exception 'PARAMETROS_INVALIDOS'
            using errcode = '22023';
    end if;

    if p_version is null then
        raise exception 'VERSION_REQUERIDA'
            using errcode = '22023';
    end if;

    if p_motivo is null
       or char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    select i.*
    into v_anterior
    from public.invitados as i
    where i.id = p_id
    for update;

    if not found then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    if v_anterior.fecha_actualizacion is distinct from p_version then
        raise exception 'REGISTRO_DESACTUALIZADO'
            using errcode = 'P0001';
    end if;

    if v_anterior.activo = p_activo then
        return jsonb_build_object(
            'schema_version', '1.0',
            'generated_at', now(),
            'data', jsonb_build_object(
                'invitado_id', p_id,
                'cambio_aplicado', false,
                'activo', v_anterior.activo,
                'version', v_anterior.fecha_actualizacion
            )
        );
    end if;

    select a.nombre
    into v_admin_nombre
    from public.administradores as a
    where a.usuario_id = v_usuario_id
      and a.activo = true
      and a.rol = 'administrador';

    v_accion := case
        when p_activo then 'reactivado'
        else 'desactivado'
    end;

    update public.invitados
    set activo = p_activo
    where id = p_id
    returning * into v_nuevo;

    insert into public.historial_invitados (
        invitado_id,
        accion,
        datos_anteriores,
        datos_nuevos,
        modificado_por,
        administrador_nombre,
        motivo
    )
    values (
        p_id,
        v_accion,
        jsonb_build_object('activo', v_anterior.activo),
        jsonb_build_object('activo', v_nuevo.activo),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'invitado_id', p_id,
            'cambio_aplicado', true,
            'activo', v_nuevo.activo,
            'version', v_nuevo.fecha_actualizacion
        )
    );
end;
$$;


-- =========================================================
-- 8. RPC: OBTENER TOKEN BAJO DEMANDA
-- Es la unica RPC de esta fase que puede devolver token_acceso.
-- =========================================================

create or replace function public.admin_obtener_token_invitacion(
    p_id bigint,
    p_proposito text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_proposito text := lower(trim(p_proposito));
    v_token uuid;
    v_activo boolean;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_id is null or p_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_proposito is null
       or v_proposito not in (
            'copiar_enlace',
            'generar_qr',
            'vista_previa',
            'whatsapp'
       ) then
        raise exception 'PROPOSITO_INVALIDO'
            using errcode = '22023';
    end if;

    select i.token_acceso, i.activo
    into v_token, v_activo
    from public.invitados as i
    where i.id = p_id;

    if not found then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    if not v_activo then
        raise exception 'INVITACION_INACTIVA'
            using errcode = 'P0001';
    end if;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'proposito', v_proposito,
            'token_acceso', v_token
        )
    );
end;
$$;


-- =========================================================
-- 9. RPC: HISTORIAL DEL INVITADO
-- Separa cambios administrativos de eventos del RSVP.
-- =========================================================

create or replace function public.admin_obtener_historial_invitado(
    p_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_existe boolean;
    v_historial_invitado jsonb;
    v_historial_confirmaciones jsonb;
begin
    if auth.uid() is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    if p_id is null or p_id < 1 then
        raise exception 'INVITADO_INVALIDO'
            using errcode = '22023';
    end if;

    select exists (
        select 1
        from public.invitados as i
        where i.id = p_id
    )
    into v_existe;

    if not v_existe then
        raise exception 'INVITADO_NO_ENCONTRADO'
            using errcode = 'P0002';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'accion', h.accion,
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
    into v_historial_invitado
    from public.historial_invitados as h
    where h.invitado_id = p_id;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'accion', h.accion,
                'datos_anteriores', h.datos_anteriores,
                'datos_nuevos', h.datos_nuevos,
                'origen', h.origen,
                'modificado_por', h.modificado_por,
                'motivo', h.motivo,
                'fecha_evento', h.fecha_evento
            )
            order by h.fecha_evento desc, h.id desc
        ),
        '[]'::jsonb
    )
    into v_historial_confirmaciones
    from public.historial_confirmaciones as h
    where h.invitado_id = p_id;

    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'invitado', v_historial_invitado,
            'confirmaciones', v_historial_confirmaciones
        )
    );
end;
$$;


-- =========================================================
-- 10. PERMISOS EXPLICITOS DE LAS RPC
-- =========================================================

revoke execute on function public.admin_listar_invitados(
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    integer,
    integer,
    text,
    text
)
from public, anon;

grant execute on function public.admin_listar_invitados(
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    integer,
    integer,
    text,
    text
)
to authenticated;

revoke execute on function public.admin_obtener_invitado(bigint)
from public, anon;

grant execute on function public.admin_obtener_invitado(bigint)
to authenticated;

revoke execute on function public.admin_actualizar_invitado(
    bigint,
    text,
    text,
    smallint,
    smallint,
    text,
    text,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_actualizar_invitado(
    bigint,
    text,
    text,
    smallint,
    smallint,
    text,
    text,
    text,
    timestamptz
)
to authenticated;

revoke execute on function public.admin_cambiar_estado_invitado(
    bigint,
    boolean,
    text,
    timestamptz
)
from public, anon;

grant execute on function public.admin_cambiar_estado_invitado(
    bigint,
    boolean,
    text,
    timestamptz
)
to authenticated;

revoke execute on function public.admin_obtener_token_invitacion(
    bigint,
    text
)
from public, anon;

grant execute on function public.admin_obtener_token_invitacion(
    bigint,
    text
)
to authenticated;

revoke execute on function public.admin_obtener_historial_invitado(bigint)
from public, anon;

grant execute on function public.admin_obtener_historial_invitado(bigint)
to authenticated;

commit;
