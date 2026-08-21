begin;

-- =========================================================
-- BODA J&M 2027
-- FASE 10.12 · PADRINO ENTREGADO → TAREA DE PLANEACIÓN COMPLETADA
--
-- Cuando un padrino confirmado marca su compromiso como
-- "entregado", y existe:
--   • Esencial relacionado
--   • Sincronización automática activa en el Esencial
--   • Tarea de Planeación vinculada
-- entonces la tarea se marca automáticamente como completada.
--
-- No existe reversa automática si después cambia el
-- cumplimiento del padrino.
-- =========================================================

create or replace function public.sync_padrino_entregado_planeacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'confirmado'
     and new.cumplimiento_estado = 'entregado'
     and (
       old.cumplimiento_estado is distinct from new.cumplimiento_estado
       or old.estado is distinct from new.estado
     )
  then
    update public.planeacion_tareas t
       set estado = 'completada'
      from public.wedding_padrinos_esenciales pe
      join public.wedding_esenciales e
        on e.id = pe.esencial_id
     where pe.padrino_id = new.id
       and e.tarea_id = t.id
       and e.sincronizacion_automatica = true
       and coalesce(e.planeacion_no_aplica, false) = false
       and t.estado not in ('completada','cancelada');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_padrino_entregado_planeacion
  on public.wedding_padrinazgos;

create trigger trg_sync_padrino_entregado_planeacion
after update of estado, cumplimiento_estado
on public.wedding_padrinazgos
for each row
execute function public.sync_padrino_entregado_planeacion();

-- Sincroniza también datos ya existentes que cumplan la regla.
update public.planeacion_tareas t
   set estado = 'completada'
  from public.wedding_padrinos_esenciales pe
  join public.wedding_padrinazgos p
    on p.id = pe.padrino_id
  join public.wedding_esenciales e
    on e.id = pe.esencial_id
 where e.tarea_id = t.id
   and p.estado = 'confirmado'
   and p.cumplimiento_estado = 'entregado'
   and e.sincronizacion_automatica = true
   and coalesce(e.planeacion_no_aplica, false) = false
   and t.estado not in ('completada','cancelada');

commit;

notify pgrst, 'reload schema';
