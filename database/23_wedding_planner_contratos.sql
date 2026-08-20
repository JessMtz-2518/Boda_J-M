begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 7.7.1 · CONTRATOS DE PROVEEDORES
-- Ejecutar una sola vez en Supabase.
-- Los datos económicos continúan viviendo en planeacion_proveedores.
-- =========================================================

create table if not exists public.planeacion_contratos (
    id bigint generated always as identity primary key,
    proveedor_id bigint not null unique
        references public.planeacion_proveedores(id) on delete cascade,
    estado text not null default 'sin_contrato',
    fecha_firma date,
    fecha_limite_firma date,
    fecha_vigencia date,
    notas text,
    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),
    creado_por uuid,
    modificado_por uuid,

    constraint planeacion_contratos_estado_check
        check (estado in ('sin_contrato','en_revision','por_firmar','firmado','no_requiere')),
    constraint planeacion_contratos_notas_check
        check (notas is null or char_length(notas) <= 2500),
    constraint planeacion_contratos_creado_por_fkey
        foreign key (creado_por) references auth.users(id) on delete set null,
    constraint planeacion_contratos_modificado_por_fkey
        foreign key (modificado_por) references auth.users(id) on delete set null
);

create index if not exists idx_planeacion_contratos_estado
on public.planeacion_contratos(estado);

alter table public.planeacion_contratos enable row level security;
revoke all on table public.planeacion_contratos from anon, authenticated;

create or replace function public.actualizar_fecha_contratos_boda()
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

drop trigger if exists trg_planeacion_contratos_fecha on public.planeacion_contratos;
create trigger trg_planeacion_contratos_fecha
before update on public.planeacion_contratos
for each row execute function public.actualizar_fecha_contratos_boda();

revoke execute on function public.actualizar_fecha_contratos_boda()
from public, anon, authenticated;

-- =========================================================
-- RESUMEN DE CONTRATOS
-- =========================================================

create or replace function public.admin_contratos_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_items jsonb;
    v_total integer;
    v_firmados integer;
    v_revision integer;
    v_por_firmar integer;
    v_sin_contrato integer;
    v_no_requiere integer;
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    select
        count(*)::integer,
        count(*) filter (where coalesce(c.estado,'sin_contrato') = 'firmado')::integer,
        count(*) filter (where coalesce(c.estado,'sin_contrato') = 'en_revision')::integer,
        count(*) filter (where coalesce(c.estado,'sin_contrato') = 'por_firmar')::integer,
        count(*) filter (where coalesce(c.estado,'sin_contrato') = 'sin_contrato')::integer,
        count(*) filter (where coalesce(c.estado,'sin_contrato') = 'no_requiere')::integer
    into v_total, v_firmados, v_revision, v_por_firmar, v_sin_contrato, v_no_requiere
    from public.planeacion_proveedores p
    left join public.planeacion_contratos c on c.proveedor_id = p.id
    where p.estado <> 'cancelado';

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'proveedor_id', p.id,
                'proveedor', p.nombre,
                'categoria', p.categoria,
                'contacto', p.contacto,
                'telefono', p.telefono,
                'correo', p.correo,
                'costo_total', p.costo_total,
                'estado_proveedor', p.estado,
                'contrato_id', c.id,
                'estado_contrato', coalesce(c.estado,'sin_contrato'),
                'fecha_firma', c.fecha_firma,
                'fecha_limite_firma', c.fecha_limite_firma,
                'fecha_vigencia', c.fecha_vigencia,
                'notas_contrato', c.notas,
                'fecha_actualizacion', c.fecha_actualizacion
            )
            order by
                case coalesce(c.estado,'sin_contrato')
                    when 'por_firmar' then 0
                    when 'en_revision' then 1
                    when 'sin_contrato' then 2
                    when 'firmado' then 3
                    else 4
                end,
                lower(p.nombre)
        ),
        '[]'::jsonb
    )
    into v_items
    from public.planeacion_proveedores p
    left join public.planeacion_contratos c on c.proveedor_id = p.id
    where p.estado <> 'cancelado';

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object(
            'resumen',jsonb_build_object(
                'total_proveedores',coalesce(v_total,0),
                'firmados',coalesce(v_firmados,0),
                'en_revision',coalesce(v_revision,0),
                'por_firmar',coalesce(v_por_firmar,0),
                'sin_contrato',coalesce(v_sin_contrato,0),
                'no_requiere',coalesce(v_no_requiere,0)
            ),
            'contratos',v_items
        )
    );
end;
$$;

revoke execute on function public.admin_contratos_resumen()
from public, anon;
grant execute on function public.admin_contratos_resumen()
to authenticated;

-- =========================================================
-- GUARDAR / ACTUALIZAR FICHA CONTRACTUAL
-- =========================================================

create or replace function public.admin_contratos_guardar(
    p_proveedor_id bigint,
    p_estado text,
    p_fecha_firma date,
    p_fecha_limite_firma date,
    p_fecha_vigencia date,
    p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id bigint;
    v_notas text := nullif(trim(coalesce(p_notas,'')),'');
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    if not exists(
        select 1
        from public.planeacion_proveedores
        where id = p_proveedor_id and estado <> 'cancelado'
    ) then
        raise exception 'PROVEEDOR_NO_ENCONTRADO';
    end if;

    if p_estado not in ('sin_contrato','en_revision','por_firmar','firmado','no_requiere') then
        raise exception 'CONTRATO_ESTADO_INVALIDO';
    end if;

    if v_notas is not null and char_length(v_notas) > 2500 then
        raise exception 'CONTRATO_NOTAS_INVALIDAS';
    end if;

    if p_estado = 'firmado' and p_fecha_firma is null then
        raise exception 'CONTRATO_FECHA_FIRMA_REQUERIDA';
    end if;

    if p_estado in ('sin_contrato','no_requiere') then
        p_fecha_firma := null;
        if p_estado = 'no_requiere' then
            p_fecha_limite_firma := null;
        end if;
    end if;

    insert into public.planeacion_contratos(
        proveedor_id,estado,fecha_firma,fecha_limite_firma,fecha_vigencia,notas,
        creado_por,modificado_por
    )
    values (
        p_proveedor_id,p_estado,p_fecha_firma,p_fecha_limite_firma,p_fecha_vigencia,v_notas,
        auth.uid(),auth.uid()
    )
    on conflict (proveedor_id) do update
    set estado = excluded.estado,
        fecha_firma = excluded.fecha_firma,
        fecha_limite_firma = excluded.fecha_limite_firma,
        fecha_vigencia = excluded.fecha_vigencia,
        notas = excluded.notas,
        modificado_por = auth.uid()
    returning id into v_id;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true,'id',v_id)
    );
end;
$$;

revoke execute on function public.admin_contratos_guardar(bigint,text,date,date,date,text)
from public, anon;
grant execute on function public.admin_contratos_guardar(bigint,text,date,date,date,text)
to authenticated;

commit;
