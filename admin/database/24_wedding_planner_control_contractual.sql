begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 7.7.3 · CONTROL CONTRACTUAL
-- Ejecutar una sola vez en Supabase después de la Fase 7.7.1.
-- No almacena documentos ni archivos.
-- =========================================================

alter table public.planeacion_contratos
    add column if not exists condiciones text,
    add column if not exists politica_cancelacion text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'planeacion_contratos_condiciones_check'
    ) then
        alter table public.planeacion_contratos
            add constraint planeacion_contratos_condiciones_check
            check (condiciones is null or char_length(condiciones) <= 2500);
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'planeacion_contratos_cancelacion_check'
    ) then
        alter table public.planeacion_contratos
            add constraint planeacion_contratos_cancelacion_check
            check (politica_cancelacion is null or char_length(politica_cancelacion) <= 2500);
    end if;
end $$;

-- =========================================================
-- RESUMEN CONTRACTUAL + INFORMACIÓN FINANCIERA DERIVADA
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
                'condiciones', c.condiciones,
                'politica_cancelacion', c.politica_cancelacion,
                'notas_contrato', c.notas,
                'pagado_total', coalesce(fin.pagado_total,0),
                'anticipo_pagado', coalesce(fin.anticipo_pagado,0),
                'saldo_pendiente', greatest(p.costo_total - coalesce(fin.pagado_total,0),0),
                'proximo_pago_fecha', prox.fecha_limite,
                'proximo_pago_monto', prox.monto,
                'proximo_pago_concepto', prox.concepto,
                'proximo_pago_vencido', case
                    when prox.fecha_limite is null then false
                    else prox.fecha_limite < current_date
                end,
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
    left join lateral (
        select
            coalesce(sum(pg.monto) filter (where pg.estado = 'pagado'),0) as pagado_total,
            coalesce(sum(pg.monto) filter (
                where pg.estado = 'pagado' and lower(pg.concepto) like '%anticipo%'
            ),0) as anticipo_pagado
        from public.planeacion_pagos pg
        where pg.proveedor_id = p.id
    ) fin on true
    left join lateral (
        select pg.fecha_limite, pg.monto, pg.concepto
        from public.planeacion_pagos pg
        where pg.proveedor_id = p.id
          and pg.estado = 'pendiente'
        order by pg.fecha_limite asc, pg.id asc
        limit 1
    ) prox on true
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

drop function if exists public.admin_contratos_guardar(bigint,text,date,date,date,text);

create or replace function public.admin_contratos_guardar(
    p_proveedor_id bigint,
    p_estado text,
    p_fecha_firma date,
    p_fecha_limite_firma date,
    p_fecha_vigencia date,
    p_condiciones text,
    p_politica_cancelacion text,
    p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id bigint;
    v_condiciones text := nullif(trim(coalesce(p_condiciones,'')),'');
    v_cancelacion text := nullif(trim(coalesce(p_politica_cancelacion,'')),'');
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

    if v_condiciones is not null and char_length(v_condiciones) > 2500 then
        raise exception 'CONTRATO_CONDICIONES_INVALIDAS';
    end if;

    if v_cancelacion is not null and char_length(v_cancelacion) > 2500 then
        raise exception 'CONTRATO_CANCELACION_INVALIDA';
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
        proveedor_id,estado,fecha_firma,fecha_limite_firma,fecha_vigencia,
        condiciones,politica_cancelacion,notas,creado_por,modificado_por
    )
    values (
        p_proveedor_id,p_estado,p_fecha_firma,p_fecha_limite_firma,p_fecha_vigencia,
        v_condiciones,v_cancelacion,v_notas,auth.uid(),auth.uid()
    )
    on conflict (proveedor_id) do update
    set estado = excluded.estado,
        fecha_firma = excluded.fecha_firma,
        fecha_limite_firma = excluded.fecha_limite_firma,
        fecha_vigencia = excluded.fecha_vigencia,
        condiciones = excluded.condiciones,
        politica_cancelacion = excluded.politica_cancelacion,
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

revoke execute on function public.admin_contratos_guardar(bigint,text,date,date,date,text,text,text)
from public, anon;
grant execute on function public.admin_contratos_guardar(bigint,text,date,date,date,text,text,text)
to authenticated;

commit;
