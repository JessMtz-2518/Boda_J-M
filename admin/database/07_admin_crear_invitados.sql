begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 3.5B / MICROFASE 4A
-- ALTA ADMINISTRATIVA DE NUEVOS INVITADOS
--
-- Ejecutar manualmente en Supabase después de revisión.
-- No modifica RSVP, Dashboard, login ni RPC públicas.
-- =========================================================

-- =========================================================
-- 1. CONTADORES PRIVADOS POR GRUPO
-- =========================================================

create table if not exists private.consecutivos_invitaciones (
    grupo text primary key,
    prefijo text not null unique,
    ultimo_numero integer not null,
    fecha_actualizacion timestamptz not null default now(),

    constraint consecutivos_invitaciones_grupo_check
        check (
            grupo in (
                'Familia Marcos',
                'Familia Jess',
                'Amigos Marcos',
                'Amigos Jess'
            )
        ),

    constraint consecutivos_invitaciones_prefijo_check
        check (prefijo in ('FM', 'FJ', 'AM', 'AJ')),

    constraint consecutivos_invitaciones_numero_check
        check (ultimo_numero between 0 and 999)
);

revoke all on table private.consecutivos_invitaciones
from public, anon, authenticated;

-- Inicialización idempotente.
-- Nunca disminuye un contador existente y toma como mínimo
-- el mayor código ya utilizado para cada grupo/prefijo.

with configuracion(grupo, prefijo) as (
    values
        ('Familia Marcos'::text, 'FM'::text),
        ('Familia Jess'::text,   'FJ'::text),
        ('Amigos Marcos'::text,  'AM'::text),
        ('Amigos Jess'::text,    'AJ'::text)
),
maximos as (
    select
        c.grupo,
        c.prefijo,
        coalesce(
            max(
                case
                    when i.codigo ~ ('^JM-' || c.prefijo || '-[0-9]{3}$')
                    then substring(
                        i.codigo
                        from '^JM-[A-Z]{2}-([0-9]{3})$'
                    )::integer
                    else null
                end
            ),
            0
        ) as maximo_detectado
    from configuracion as c
    left join public.invitados as i
        on i.grupo = c.grupo
    group by c.grupo, c.prefijo
)
insert into private.consecutivos_invitaciones (
    grupo,
    prefijo,
    ultimo_numero
)
select
    m.grupo,
    m.prefijo,
    m.maximo_detectado
from maximos as m
on conflict (grupo)
do update
set
    prefijo = excluded.prefijo,
    ultimo_numero = greatest(
        private.consecutivos_invitaciones.ultimo_numero,
        excluded.ultimo_numero
    ),
    fecha_actualizacion = now();


-- =========================================================
-- 2. RPC: CREAR INVITADO
-- =========================================================

create or replace function public.admin_crear_invitado(
    p_nombre text,
    p_grupo text,
    p_adultos smallint,
    p_ninos smallint,
    p_telefono text default null,
    p_notas text default null,
    p_motivo text default null
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

    v_nombre text := trim(coalesce(p_nombre, ''));
    v_grupo text := trim(coalesce(p_grupo, ''));
    v_telefono text := nullif(trim(coalesce(p_telefono, '')), '');
    v_notas text := nullif(trim(coalesce(p_notas, '')), '');
    v_motivo text := trim(coalesce(p_motivo, ''));

    v_prefijo text;
    v_numero integer;
    v_codigo text;

    v_invitado public.invitados%rowtype;
begin
    -- -----------------------------------------------------
    -- Autorización
    -- -----------------------------------------------------
    if v_usuario_id is null
       or not private.es_administrador_activo() then
        raise exception 'Acceso administrativo no autorizado.'
            using errcode = '42501';
    end if;

    -- -----------------------------------------------------
    -- Validaciones funcionales
    -- -----------------------------------------------------
    if char_length(v_nombre) not between 1 and 150 then
        raise exception 'NOMBRE_INVALIDO'
            using errcode = '22023';
    end if;

    if v_grupo not in (
        'Familia Marcos',
        'Familia Jess',
        'Amigos Marcos',
        'Amigos Jess'
    ) then
        raise exception 'GRUPO_INVALIDO'
            using errcode = '22023';
    end if;

    if p_adultos is null or p_adultos < 0
       or p_ninos is null or p_ninos < 0 then
        raise exception 'CUPO_INVALIDO'
            using errcode = '22023';
    end if;

    if (p_adultos::integer + p_ninos::integer) <= 0 then
        raise exception 'CUPO_CERO_NO_PERMITIDO'
            using errcode = '22023';
    end if;

    if v_telefono is not null
       and v_telefono !~ '^[0-9+() -]{7,25}$' then
        raise exception 'TELEFONO_INVALIDO'
            using errcode = '22023';
    end if;

    if v_notas is not null
       and char_length(v_notas) > 1000 then
        raise exception 'NOTAS_DEMASIADO_LARGAS'
            using errcode = '22023';
    end if;

    if char_length(v_motivo) not between 1 and 1000 then
        raise exception 'MOTIVO_INVALIDO'
            using errcode = '22023';
    end if;

    -- -----------------------------------------------------
    -- Fotografía histórica del administrador
    -- -----------------------------------------------------
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

    -- -----------------------------------------------------
    -- Consecutivo atómico.
    -- UPDATE bloquea únicamente la fila del grupo correspondiente.
    -- El contador solo avanza si toda la transacción termina bien.
    -- -----------------------------------------------------
    update private.consecutivos_invitaciones as c
    set
        ultimo_numero = c.ultimo_numero + 1,
        fecha_actualizacion = now()
    where c.grupo = v_grupo
      and c.ultimo_numero < 999
    returning c.prefijo, c.ultimo_numero
    into v_prefijo, v_numero;

    if not found then
        if exists (
            select 1
            from private.consecutivos_invitaciones as c
            where c.grupo = v_grupo
              and c.ultimo_numero >= 999
        ) then
            raise exception 'CONSECUTIVO_AGOTADO'
                using errcode = '22023';
        end if;

        raise exception 'CONFIGURACION_CONSECUTIVO_NO_DISPONIBLE'
            using errcode = '55000';
    end if;

    v_codigo := format('JM-%s-%s', v_prefijo, lpad(v_numero::text, 3, '0'));

    -- Defensa final. La restricción UNIQUE de public.invitados.codigo
    -- también protege frente a cualquier inconsistencia inesperada.
    if exists (
        select 1
        from public.invitados as i
        where i.codigo = v_codigo
    ) then
        raise exception 'CODIGO_DUPLICADO'
            using errcode = '23505';
    end if;

    -- -----------------------------------------------------
    -- Alta.
    -- token_acceso NO se especifica: PostgreSQL usa gen_random_uuid().
    -- activo y fechas usan sus defaults.
    -- -----------------------------------------------------
    insert into public.invitados (
        codigo,
        grupo,
        nombre,
        adultos_asignados,
        ninos_asignados,
        telefono,
        notas_admin,
        orden_grupo
    )
    values (
        v_codigo,
        v_grupo,
        v_nombre,
        p_adultos,
        p_ninos,
        v_telefono,
        v_notas,
        v_numero::smallint
    )
    returning *
    into v_invitado;

    -- -----------------------------------------------------
    -- Auditoría dentro de la misma transacción.
    -- Nunca incluye token_acceso.
    -- -----------------------------------------------------
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
        v_invitado.id,
        'creado',
        null,
        jsonb_build_object(
            'codigo', v_invitado.codigo,
            'nombre', v_invitado.nombre,
            'grupo', v_invitado.grupo,
            'adultos_asignados', v_invitado.adultos_asignados,
            'ninos_asignados', v_invitado.ninos_asignados,
            'telefono', v_invitado.telefono,
            'notas', v_invitado.notas_admin,
            'activo', v_invitado.activo
        ),
        v_usuario_id,
        v_admin_nombre,
        v_motivo
    );

    -- -----------------------------------------------------
    -- Respuesta segura.
    -- No devuelve token_acceso.
    -- -----------------------------------------------------
    return jsonb_build_object(
        'schema_version', '1.0',
        'generated_at', now(),
        'data', jsonb_build_object(
            'created', true,
            'invitado', jsonb_build_object(
                'id', v_invitado.id,
                'codigo', v_invitado.codigo,
                'nombre', v_invitado.nombre,
                'grupo', v_invitado.grupo,
                'adultos_asignados', v_invitado.adultos_asignados,
                'ninos_asignados', v_invitado.ninos_asignados,
                'cupo_total',
                    v_invitado.adultos_asignados
                    + v_invitado.ninos_asignados,
                'activo', v_invitado.activo,
                'version', v_invitado.fecha_actualizacion
            )
        )
    );
end;
$$;

revoke execute on function public.admin_crear_invitado(
    text,
    text,
    smallint,
    smallint,
    text,
    text,
    text
)
from public, anon;

grant execute on function public.admin_crear_invitado(
    text,
    text,
    smallint,
    smallint,
    text,
    text,
    text
)
to authenticated;

commit;
