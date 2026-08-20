begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 7.2 · PRESUPUESTO + PROVEEDORES + CALENDARIO DE PAGOS
-- Ejecutar una sola vez en Supabase.
-- =========================================================

create table if not exists public.planeacion_presupuesto (
    id smallint primary key default 1,
    presupuesto_total numeric(12,2) not null default 0,
    moneda text not null default 'MXN',
    fecha_actualizacion timestamptz not null default now(),
    modificado_por uuid,
    constraint planeacion_presupuesto_unico check (id = 1),
    constraint planeacion_presupuesto_total check (presupuesto_total >= 0),
    constraint planeacion_presupuesto_moneda check (moneda in ('MXN'))
);

insert into public.planeacion_presupuesto(id, presupuesto_total, moneda)
values (1, 0, 'MXN')
on conflict (id) do nothing;

create table if not exists public.planeacion_proveedores (
    id bigint generated always as identity primary key,
    nombre text not null,
    categoria text not null default 'General',
    contacto text,
    telefono text,
    correo text,
    costo_total numeric(12,2) not null default 0,
    estado text not null default 'prospecto',
    notas text,
    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),
    creado_por uuid,
    modificado_por uuid,

    constraint planeacion_proveedores_nombre_check
        check (char_length(trim(nombre)) between 1 and 160),
    constraint planeacion_proveedores_categoria_check
        check (char_length(trim(categoria)) between 1 and 80),
    constraint planeacion_proveedores_contacto_check
        check (contacto is null or char_length(trim(contacto)) <= 120),
    constraint planeacion_proveedores_telefono_check
        check (telefono is null or char_length(trim(telefono)) <= 40),
    constraint planeacion_proveedores_correo_check
        check (correo is null or char_length(trim(correo)) <= 160),
    constraint planeacion_proveedores_costo_check
        check (costo_total >= 0),
    constraint planeacion_proveedores_estado_check
        check (estado in ('prospecto','contratado','liquidado','cancelado')),
    constraint planeacion_proveedores_notas_check
        check (notas is null or char_length(notas) <= 2000),
    constraint planeacion_proveedores_creado_por_fkey
        foreign key (creado_por) references auth.users(id) on delete set null,
    constraint planeacion_proveedores_modificado_por_fkey
        foreign key (modificado_por) references auth.users(id) on delete set null
);

create table if not exists public.planeacion_pagos (
    id bigint generated always as identity primary key,
    proveedor_id bigint references public.planeacion_proveedores(id) on delete restrict,
    concepto text not null,
    monto numeric(12,2) not null,
    fecha_limite date not null,
    fecha_pago date,
    estado text not null default 'pendiente',
    notas text,
    fecha_creacion timestamptz not null default now(),
    fecha_actualizacion timestamptz not null default now(),
    creado_por uuid,
    modificado_por uuid,

    constraint planeacion_pagos_concepto_check
        check (char_length(trim(concepto)) between 1 and 180),
    constraint planeacion_pagos_monto_check
        check (monto > 0),
    constraint planeacion_pagos_estado_check
        check (estado in ('pendiente','pagado','cancelado')),
    constraint planeacion_pagos_notas_check
        check (notas is null or char_length(notas) <= 1500),
    constraint planeacion_pagos_creado_por_fkey
        foreign key (creado_por) references auth.users(id) on delete set null,
    constraint planeacion_pagos_modificado_por_fkey
        foreign key (modificado_por) references auth.users(id) on delete set null
);

create index if not exists idx_planeacion_proveedores_estado
on public.planeacion_proveedores(estado);

create index if not exists idx_planeacion_pagos_fecha_limite
on public.planeacion_pagos(fecha_limite);

create index if not exists idx_planeacion_pagos_proveedor
on public.planeacion_pagos(proveedor_id);

create index if not exists idx_planeacion_pagos_estado
on public.planeacion_pagos(estado);

alter table public.planeacion_presupuesto enable row level security;
alter table public.planeacion_proveedores enable row level security;
alter table public.planeacion_pagos enable row level security;

revoke all on table public.planeacion_presupuesto from anon, authenticated;
revoke all on table public.planeacion_proveedores from anon, authenticated;
revoke all on table public.planeacion_pagos from anon, authenticated;

-- =========================================================
-- FECHAS DE ACTUALIZACIÓN
-- =========================================================

create or replace function public.actualizar_fecha_finanzas_boda()
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

drop trigger if exists trg_planeacion_presupuesto_fecha on public.planeacion_presupuesto;
create trigger trg_planeacion_presupuesto_fecha
before update on public.planeacion_presupuesto
for each row execute function public.actualizar_fecha_finanzas_boda();

drop trigger if exists trg_planeacion_proveedores_fecha on public.planeacion_proveedores;
create trigger trg_planeacion_proveedores_fecha
before update on public.planeacion_proveedores
for each row execute function public.actualizar_fecha_finanzas_boda();

drop trigger if exists trg_planeacion_pagos_fecha on public.planeacion_pagos;
create trigger trg_planeacion_pagos_fecha
before update on public.planeacion_pagos
for each row execute function public.actualizar_fecha_finanzas_boda();

revoke execute on function public.actualizar_fecha_finanzas_boda()
from public, anon, authenticated;

-- =========================================================
-- RESUMEN GENERAL
-- =========================================================

create or replace function public.admin_finanzas_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_presupuesto numeric(12,2);
    v_contratado numeric(12,2);
    v_pagado numeric(12,2);
    v_pendiente numeric(12,2);
    v_proveedores jsonb;
    v_pagos jsonb;
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    select presupuesto_total
    into v_presupuesto
    from public.planeacion_presupuesto
    where id = 1;

    v_presupuesto := coalesce(v_presupuesto, 0);

    select coalesce(sum(costo_total), 0)
    into v_contratado
    from public.planeacion_proveedores
    where estado in ('contratado','liquidado');

    select coalesce(sum(monto), 0)
    into v_pagado
    from public.planeacion_pagos
    where estado = 'pagado';

    v_pendiente := greatest(v_contratado - v_pagado, 0);

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'nombre', p.nombre,
                'categoria', p.categoria,
                'contacto', p.contacto,
                'telefono', p.telefono,
                'correo', p.correo,
                'costo_total', p.costo_total,
                'estado', p.estado,
                'notas', p.notas,
                'pagado', coalesce(x.pagado,0),
                'saldo', greatest(p.costo_total - coalesce(x.pagado,0),0),
                'fecha_actualizacion', p.fecha_actualizacion
            )
            order by
                case p.estado
                    when 'contratado' then 0
                    when 'liquidado' then 1
                    when 'prospecto' then 2
                    else 3
                end,
                lower(p.nombre)
        ),
        '[]'::jsonb
    )
    into v_proveedores
    from public.planeacion_proveedores p
    left join (
        select proveedor_id, sum(monto) as pagado
        from public.planeacion_pagos
        where estado = 'pagado'
        group by proveedor_id
    ) x on x.proveedor_id = p.id;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', pg.id,
                'proveedor_id', pg.proveedor_id,
                'proveedor', pr.nombre,
                'concepto', pg.concepto,
                'monto', pg.monto,
                'fecha_limite', pg.fecha_limite,
                'fecha_pago', pg.fecha_pago,
                'estado', pg.estado,
                'estado_visual',
                    case
                        when pg.estado = 'pendiente' and pg.fecha_limite < current_date then 'vencido'
                        else pg.estado
                    end,
                'notas', pg.notas,
                'fecha_actualizacion', pg.fecha_actualizacion
            )
            order by
                case
                    when pg.estado = 'pendiente' and pg.fecha_limite < current_date then 0
                    when pg.estado = 'pendiente' then 1
                    when pg.estado = 'pagado' then 2
                    else 3
                end,
                pg.fecha_limite,
                pg.id
        ),
        '[]'::jsonb
    )
    into v_pagos
    from public.planeacion_pagos pg
    left join public.planeacion_proveedores pr on pr.id = pg.proveedor_id;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object(
            'resumen',jsonb_build_object(
                'presupuesto_total',v_presupuesto,
                'contratado',v_contratado,
                'pagado',v_pagado,
                'pendiente_pago',v_pendiente,
                'disponible',v_presupuesto - v_contratado,
                'porcentaje_comprometido',
                    case when v_presupuesto <= 0 then 0
                         else round((v_contratado / v_presupuesto) * 100,1)
                    end,
                'porcentaje_pagado',
                    case when v_presupuesto <= 0 then 0
                         else round((v_pagado / v_presupuesto) * 100,1)
                    end
            ),
            'proveedores',v_proveedores,
            'pagos',v_pagos
        )
    );
end;
$$;

revoke execute on function public.admin_finanzas_resumen()
from public, anon;
grant execute on function public.admin_finanzas_resumen()
to authenticated;

-- =========================================================
-- PRESUPUESTO
-- =========================================================

create or replace function public.admin_finanzas_guardar_presupuesto(
    p_presupuesto_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    if p_presupuesto_total is null or p_presupuesto_total < 0 or p_presupuesto_total > 9999999999.99 then
        raise exception 'PRESUPUESTO_INVALIDO';
    end if;

    insert into public.planeacion_presupuesto(id,presupuesto_total,moneda,modificado_por)
    values (1,p_presupuesto_total,'MXN',auth.uid())
    on conflict (id) do update
    set presupuesto_total = excluded.presupuesto_total,
        modificado_por = auth.uid();

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true)
    );
end;
$$;

revoke execute on function public.admin_finanzas_guardar_presupuesto(numeric)
from public, anon;
grant execute on function public.admin_finanzas_guardar_presupuesto(numeric)
to authenticated;

-- =========================================================
-- PROVEEDORES
-- =========================================================

create or replace function public.admin_finanzas_guardar_proveedor(
    p_id bigint,
    p_nombre text,
    p_categoria text,
    p_contacto text,
    p_telefono text,
    p_correo text,
    p_costo_total numeric,
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
    v_nombre text := trim(coalesce(p_nombre,''));
    v_categoria text := trim(coalesce(nullif(p_categoria,''),'General'));
    v_contacto text := nullif(trim(coalesce(p_contacto,'')),'');
    v_telefono text := nullif(trim(coalesce(p_telefono,'')),'');
    v_correo text := nullif(trim(coalesce(p_correo,'')),'');
    v_notas text := nullif(trim(coalesce(p_notas,'')),'');
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    if char_length(v_nombre) < 1 or char_length(v_nombre) > 160 then
        raise exception 'PROVEEDOR_NOMBRE_INVALIDO';
    end if;

    if char_length(v_categoria) < 1 or char_length(v_categoria) > 80 then
        raise exception 'PROVEEDOR_CATEGORIA_INVALIDA';
    end if;

    if p_costo_total is null or p_costo_total < 0 or p_costo_total > 9999999999.99 then
        raise exception 'PROVEEDOR_COSTO_INVALIDO';
    end if;

    if p_estado not in ('prospecto','contratado','liquidado','cancelado') then
        raise exception 'PROVEEDOR_ESTADO_INVALIDO';
    end if;

    if p_id is null then
        insert into public.planeacion_proveedores(
            nombre,categoria,contacto,telefono,correo,costo_total,estado,notas,
            creado_por,modificado_por
        )
        values (
            v_nombre,v_categoria,v_contacto,v_telefono,v_correo,p_costo_total,p_estado,v_notas,
            auth.uid(),auth.uid()
        )
        returning id into v_id;
    else
        update public.planeacion_proveedores
        set nombre = v_nombre,
            categoria = v_categoria,
            contacto = v_contacto,
            telefono = v_telefono,
            correo = v_correo,
            costo_total = p_costo_total,
            estado = p_estado,
            notas = v_notas,
            modificado_por = auth.uid()
        where id = p_id
        returning id into v_id;

        if v_id is null then
            raise exception 'PROVEEDOR_NO_ENCONTRADO';
        end if;
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true,'id',v_id)
    );
end;
$$;

revoke execute on function public.admin_finanzas_guardar_proveedor(bigint,text,text,text,text,text,numeric,text,text)
from public, anon;
grant execute on function public.admin_finanzas_guardar_proveedor(bigint,text,text,text,text,text,numeric,text,text)
to authenticated;

create or replace function public.admin_finanzas_eliminar_proveedor(
    p_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    select count(*)::integer
    into v_count
    from public.planeacion_pagos
    where proveedor_id = p_id;

    if v_count > 0 then
        raise exception 'PROVEEDOR_CON_PAGOS';
    end if;

    delete from public.planeacion_proveedores where id = p_id;
    if not found then
        raise exception 'PROVEEDOR_NO_ENCONTRADO';
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true)
    );
end;
$$;

revoke execute on function public.admin_finanzas_eliminar_proveedor(bigint)
from public, anon;
grant execute on function public.admin_finanzas_eliminar_proveedor(bigint)
to authenticated;

-- =========================================================
-- PAGOS
-- =========================================================

create or replace function public.admin_finanzas_guardar_pago(
    p_id bigint,
    p_proveedor_id bigint,
    p_concepto text,
    p_monto numeric,
    p_fecha_limite date,
    p_fecha_pago date,
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
    v_concepto text := trim(coalesce(p_concepto,''));
    v_notas text := nullif(trim(coalesce(p_notas,'')),'');
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    if p_proveedor_id is not null
       and not exists(select 1 from public.planeacion_proveedores where id = p_proveedor_id) then
        raise exception 'PROVEEDOR_NO_ENCONTRADO';
    end if;

    if char_length(v_concepto) < 1 or char_length(v_concepto) > 180 then
        raise exception 'PAGO_CONCEPTO_INVALIDO';
    end if;

    if p_monto is null or p_monto <= 0 or p_monto > 9999999999.99 then
        raise exception 'PAGO_MONTO_INVALIDO';
    end if;

    if p_fecha_limite is null then
        raise exception 'PAGO_FECHA_INVALIDA';
    end if;

    if p_estado not in ('pendiente','pagado','cancelado') then
        raise exception 'PAGO_ESTADO_INVALIDO';
    end if;

    if p_estado = 'pagado' and p_fecha_pago is null then
        p_fecha_pago := current_date;
    end if;

    if p_estado <> 'pagado' then
        p_fecha_pago := null;
    end if;

    if p_id is null then
        insert into public.planeacion_pagos(
            proveedor_id,concepto,monto,fecha_limite,fecha_pago,estado,notas,
            creado_por,modificado_por
        )
        values (
            p_proveedor_id,v_concepto,p_monto,p_fecha_limite,p_fecha_pago,p_estado,v_notas,
            auth.uid(),auth.uid()
        )
        returning id into v_id;
    else
        update public.planeacion_pagos
        set proveedor_id = p_proveedor_id,
            concepto = v_concepto,
            monto = p_monto,
            fecha_limite = p_fecha_limite,
            fecha_pago = p_fecha_pago,
            estado = p_estado,
            notas = v_notas,
            modificado_por = auth.uid()
        where id = p_id
        returning id into v_id;

        if v_id is null then
            raise exception 'PAGO_NO_ENCONTRADO';
        end if;
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true,'id',v_id)
    );
end;
$$;

revoke execute on function public.admin_finanzas_guardar_pago(bigint,bigint,text,numeric,date,date,text,text)
from public, anon;
grant execute on function public.admin_finanzas_guardar_pago(bigint,bigint,text,numeric,date,date,text,text)
to authenticated;

create or replace function public.admin_finanzas_eliminar_pago(
    p_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.es_administrador_activo() then
        raise exception 'ACCESO_ADMINISTRATIVO_NO_AUTORIZADO';
    end if;

    delete from public.planeacion_pagos where id = p_id;
    if not found then
        raise exception 'PAGO_NO_ENCONTRADO';
    end if;

    return jsonb_build_object(
        'schema_version','1.0',
        'generated_at',now(),
        'data',jsonb_build_object('ok',true)
    );
end;
$$;

revoke execute on function public.admin_finanzas_eliminar_pago(bigint)
from public, anon;
grant execute on function public.admin_finanzas_eliminar_pago(bigint)
to authenticated;

commit;
