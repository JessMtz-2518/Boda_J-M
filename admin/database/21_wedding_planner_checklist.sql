begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 7.1 · CENTRO DE PLANEACIÓN + CHECKLIST MAESTRO
-- Ejecutar una sola vez en Supabase.
-- =========================================================

create table if not exists public.planeacion_tareas (
    id bigint generated always as identity primary key,
    titulo text not null,
    categoria text not null default 'General',
    responsable text,
    fecha_limite date,
    prioridad text not null default 'media',
    estado text not null default 'pendiente',
    notas text,
    orden integer not null default 0,
    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),
    creado_por uuid,
    modificado_por uuid,

    constraint planeacion_tareas_titulo_check
        check (char_length(trim(titulo)) between 1 and 180),

    constraint planeacion_tareas_categoria_check
        check (char_length(trim(categoria)) between 1 and 80),

    constraint planeacion_tareas_responsable_check
        check (responsable is null or char_length(trim(responsable)) between 1 and 120),

    constraint planeacion_tareas_prioridad_check
        check (prioridad in ('baja','media','alta')),

    constraint planeacion_tareas_estado_check
        check (estado in ('pendiente','en_proceso','completada')),

    constraint planeacion_tareas_notas_check
        check (notas is null or char_length(notas) <= 1500),

    constraint planeacion_tareas_creado_por_fkey
        foreign key (creado_por) references auth.users(id) on delete set null,

    constraint planeacion_tareas_modificado_por_fkey
        foreign key (modificado_por) references auth.users(id) on delete set null
);

create index if not exists idx_planeacion_tareas_estado
on public.planeacion_tareas(estado);

create index if not exists idx_planeacion_tareas_fecha_limite
on public.planeacion_tareas(fecha_limite);

alter table public.planeacion_tareas enable row level security;

-- El navegador no accede directamente a la tabla.
revoke all on table public.planeacion_tareas from anon, authenticated;

create or replace function public.actualizar_fecha_planeacion_tarea()
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

drop trigger if exists trg_planeacion_tareas_fecha
on public.planeacion_tareas;

create trigger trg_planeacion_tareas_fecha
before update on public.planeacion_tareas
for each row
execute function public.actualizar_fecha_planeacion_tarea();

revoke execute on function public.actualizar_fecha_planeacion_tarea()
from public, anon, authenticated;


-- =========================================================
-- LISTADO + RESUMEN
-- =========================================================

create or replace function public.admin_planner_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_items jsonb;
    v_total integer;
    v_pendientes integer;
    v_en_proceso integer;
    v_completadas integer;
    v_vencidas integer;
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    select
        count(*)::integer,
        count(*) filter (where estado = 'pendiente')::integer,
        count(*) filter (where estado = 'en_proceso')::integer,
        count(*) filter (where estado = 'completada')::integer,
        count(*) filter (
            where estado <> 'completada'
              and fecha_limite is not null
              and fecha_limite < current_date
        )::integer
    into
        v_total,
        v_pendientes,
        v_en_proceso,
        v_completadas,
        v_vencidas
    from public.planeacion_tareas;

    select coalesce(jsonb_agg(to_jsonb(q) order by q.orden_clasificacion, q.fecha_orden nulls last, q.prioridad_orden, q.id), '[]'::jsonb)
    into v_items
    from (
        select
            t.id,
            t.titulo,
            t.categoria,
            t.responsable,
            t.fecha_limite,
            t.prioridad,
            t.estado,
            t.notas,
            t.orden,
            t.fecha_creacion,
            t.fecha_actualizacion,
            case
                when t.estado = 'completada' then 3
                when t.fecha_limite is not null and t.fecha_limite < current_date then 0
                when t.estado = 'en_proceso' then 1
                else 2
            end as orden_clasificacion,
            t.fecha_limite as fecha_orden,
            case t.prioridad when 'alta' then 0 when 'media' then 1 else 2 end as prioridad_orden
        from public.planeacion_tareas t
    ) q;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object(
            'resumen',jsonb_build_object(
                'total',v_total,
                'pendientes',v_pendientes,
                'en_proceso',v_en_proceso,
                'completadas',v_completadas,
                'vencidas',v_vencidas,
                'porcentaje_completado',
                    case when v_total = 0 then 0
                         else round((v_completadas::numeric / v_total::numeric) * 100, 1)
                    end
            ),
            'items',v_items
        )
    );
end;
$$;

revoke execute on function public.admin_planner_resumen()
from public, anon;

grant execute on function public.admin_planner_resumen()
to authenticated;


-- =========================================================
-- CREAR / EDITAR
-- =========================================================

create or replace function public.admin_planner_guardar_tarea(
    p_id bigint,
    p_titulo text,
    p_categoria text,
    p_responsable text,
    p_fecha_limite date,
    p_prioridad text,
    p_estado text,
    p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id bigint;
    v_titulo text := trim(coalesce(p_titulo,''));
    v_categoria text := trim(coalesce(nullif(p_categoria,''),'General'));
    v_responsable text := nullif(trim(coalesce(p_responsable,'')),'');
    v_notas text := nullif(trim(coalesce(p_notas,'')),'');
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    if char_length(v_titulo) < 1 or char_length(v_titulo) > 180 then
        raise exception 'PLANNER_TITULO_INVALIDO';
    end if;

    if char_length(v_categoria) < 1 or char_length(v_categoria) > 80 then
        raise exception 'PLANNER_CATEGORIA_INVALIDA';
    end if;

    if v_responsable is not null and char_length(v_responsable) > 120 then
        raise exception 'PLANNER_RESPONSABLE_INVALIDO';
    end if;

    if p_prioridad not in ('baja','media','alta') then
        raise exception 'PLANNER_PRIORIDAD_INVALIDA';
    end if;

    if p_estado not in ('pendiente','en_proceso','completada') then
        raise exception 'PLANNER_ESTADO_INVALIDO';
    end if;

    if v_notas is not null and char_length(v_notas) > 1500 then
        raise exception 'PLANNER_NOTAS_INVALIDAS';
    end if;

    if p_id is null then
        insert into public.planeacion_tareas(
            titulo,categoria,responsable,fecha_limite,prioridad,estado,notas,
            creado_por,modificado_por
        )
        values (
            v_titulo,v_categoria,v_responsable,p_fecha_limite,p_prioridad,p_estado,v_notas,
            auth.uid(),auth.uid()
        )
        returning id into v_id;
    else
        update public.planeacion_tareas
        set
            titulo = v_titulo,
            categoria = v_categoria,
            responsable = v_responsable,
            fecha_limite = p_fecha_limite,
            prioridad = p_prioridad,
            estado = p_estado,
            notas = v_notas,
            modificado_por = auth.uid()
        where id = p_id
        returning id into v_id;

        if v_id is null then
            raise exception 'PLANNER_TAREA_NO_ENCONTRADA';
        end if;
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('id',v_id)
    );
end;
$$;

revoke execute on function public.admin_planner_guardar_tarea(
    bigint,text,text,text,date,text,text,text
) from public, anon;

grant execute on function public.admin_planner_guardar_tarea(
    bigint,text,text,text,date,text,text,text
) to authenticated;


-- =========================================================
-- ELIMINAR
-- =========================================================

create or replace function public.admin_planner_eliminar_tarea(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_deleted bigint;
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    delete from public.planeacion_tareas
    where id = p_id
    returning id into v_deleted;

    if v_deleted is null then
        raise exception 'PLANNER_TAREA_NO_ENCONTRADA';
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('id',v_deleted)
    );
end;
$$;

revoke execute on function public.admin_planner_eliminar_tarea(bigint)
from public, anon;

grant execute on function public.admin_planner_eliminar_tarea(bigint)
to authenticated;

commit;
