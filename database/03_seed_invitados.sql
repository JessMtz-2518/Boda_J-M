-- =========================================================
-- BODA J&M 2027
-- 03 · CARGA INICIAL DE INVITADOS
-- Registros: 92
-- =========================================================

begin;

insert into public.invitados (
  codigo,
  grupo,
  nombre,
  adultos_asignados,
  ninos_asignados,
  activo,
  orden_grupo
)
values
  ('JM-FM-001', 'Familia Marcos', 'Tia Hili', 2, 0, true, 1),
  ('JM-FM-002', 'Familia Marcos', 'Hugo', 2, 1, true, 2),
  ('JM-FM-003', 'Familia Marcos', 'Ale', 2, 1, true, 3),
  ('JM-FM-004', 'Familia Marcos', 'Tio manuel', 2, 0, true, 4),
  ('JM-FM-005', 'Familia Marcos', 'Missael', 3, 1, true, 5),
  ('JM-FM-006', 'Familia Marcos', 'Fernando', 2, 3, true, 6),
  ('JM-FM-007', 'Familia Marcos', 'Tia Wuicha', 1, 0, true, 7),
  ('JM-FM-008', 'Familia Marcos', 'Tia Miriam', 2, 0, true, 8),
  ('JM-FM-009', 'Familia Marcos', 'Juanito', 3, 0, true, 9),
  ('JM-FM-010', 'Familia Marcos', 'Liz', 2, 1, true, 10),
  ('JM-FM-011', 'Familia Marcos', 'Tia Silvia', 3, 0, true, 11),
  ('JM-FM-012', 'Familia Marcos', 'Isaac', 2, 1, true, 12),
  ('JM-FM-013', 'Familia Marcos', 'Sandra', 3, 0, true, 13),
  ('JM-FM-014', 'Familia Marcos', 'Caro', 2, 1, true, 14),
  ('JM-FM-015', 'Familia Marcos', 'Irlemy', 2, 0, true, 15),
  ('JM-FM-016', 'Familia Marcos', 'Karla', 3, 0, true, 16),
  ('JM-FM-017', 'Familia Marcos', 'Denis', 4, 0, true, 17),
  ('JM-FM-018', 'Familia Marcos', 'Ricardo', 3, 0, true, 18),
  ('JM-FM-019', 'Familia Marcos', 'Nestor', 2, 0, true, 19),
  ('JM-FM-020', 'Familia Marcos', 'Tio Youmar', 2, 0, true, 20),
  ('JM-FM-021', 'Familia Marcos', 'Tio Gabriel', 2, 0, true, 21),
  ('JM-FM-022', 'Familia Marcos', 'Yara', 2, 2, true, 22),
  ('JM-FM-023', 'Familia Marcos', 'Dilan', 2, 0, true, 23),
  ('JM-FM-024', 'Familia Marcos', 'Tia noemi', 2, 0, true, 24),
  ('JM-FM-025', 'Familia Marcos', 'Ricardo', 2, 2, true, 25),
  ('JM-FM-026', 'Familia Marcos', 'Erica', 2, 2, true, 26),
  ('JM-FM-027', 'Familia Marcos', 'Tia Yola', 3, 0, true, 27),
  ('JM-FM-028', 'Familia Marcos', 'Lalo', 4, 0, true, 28),
  ('JM-FM-029', 'Familia Marcos', 'Jenny', 2, 1, true, 29),
  ('JM-FM-030', 'Familia Marcos', 'Tio tito', 4, 0, true, 30),
  ('JM-FM-031', 'Familia Marcos', 'Josue', 2, 2, true, 31),
  ('JM-FM-032', 'Familia Marcos', 'Papas', 2, 0, true, 32),
  ('JM-FM-033', 'Familia Marcos', 'Les', 2, 0, true, 33),
  ('JM-FM-034', 'Familia Marcos', 'lulu', 3, 0, true, 34),
  ('JM-FM-035', 'Familia Marcos', 'lulu chica', 2, 1, true, 35),
  ('JM-FM-036', 'Familia Marcos', 'tio carlos', 3, 1, true, 36),
  ('JM-FM-037', 'Familia Marcos', 'Andi', 2, 1, true, 37),
  ('JM-FM-038', 'Familia Marcos', 'arturo', 2, 0, true, 38),
  ('JM-FM-039', 'Familia Marcos', 'abuelitos', 2, 0, true, 39),
  ('JM-FM-040', 'Familia Marcos', 'padrinos', 5, 0, true, 40),
  ('JM-FM-041', 'Familia Marcos', 'yahel', 2, 0, true, 41),
  ('JM-FM-042', 'Familia Marcos', 'Leslie Guadalupe', 2, 2, true, 42),
  ('JM-FM-043', 'Familia Marcos', 'Clever', 5, 0, true, 43),
  ('JM-FJ-001', 'Familia Jess', 'Papás', 2, 0, true, 1),
  ('JM-FJ-002', 'Familia Jess', 'Hermana', 3, 1, true, 2),
  ('JM-FJ-003', 'Familia Jess', 'Abuelitos Mamá', 2, 0, true, 3),
  ('JM-FJ-004', 'Familia Jess', 'Abuelitos Papá', 4, 0, true, 4),
  ('JM-FJ-005', 'Familia Jess', 'Tia Marce', 6, 2, true, 5),
  ('JM-FJ-006', 'Familia Jess', 'Tia Alo', 5, 0, true, 6),
  ('JM-FJ-007', 'Familia Jess', 'Tia Gaby', 3, 0, true, 7),
  ('JM-FJ-008', 'Familia Jess', 'Sele', 2, 1, true, 8),
  ('JM-FJ-009', 'Familia Jess', 'Tia Silvia', 4, 0, true, 9),
  ('JM-FJ-010', 'Familia Jess', 'Tia Sol', 3, 0, true, 10),
  ('JM-FJ-011', 'Familia Jess', 'Tia Magos', 3, 0, true, 11),
  ('JM-FJ-012', 'Familia Jess', 'Tia Argelia', 3, 0, true, 12),
  ('JM-FJ-013', 'Familia Jess', 'Tio Wero', 1, 0, true, 13),
  ('JM-FJ-014', 'Familia Jess', 'Pedro', 2, 0, true, 14),
  ('JM-FJ-015', 'Familia Jess', 'Tio Jose', 2, 0, true, 15),
  ('JM-FJ-016', 'Familia Jess', 'Tia Rosa', 2, 0, true, 16),
  ('JM-AM-001', 'Amigos Marcos', 'Diego', 2, 2, true, 1),
  ('JM-AM-002', 'Amigos Marcos', 'Coco', 2, 1, true, 2),
  ('JM-AM-003', 'Amigos Marcos', 'Diego C', 2, 2, true, 3),
  ('JM-AM-004', 'Amigos Marcos', 'Wero', 2, 0, true, 4),
  ('JM-AM-005', 'Amigos Marcos', 'Jonh', 2, 0, true, 5),
  ('JM-AM-006', 'Amigos Marcos', 'Guera', 3, 0, true, 6),
  ('JM-AM-007', 'Amigos Marcos', 'Leslie', 2, 0, true, 7),
  ('JM-AM-008', 'Amigos Marcos', 'Jaquelin', 2, 0, true, 8),
  ('JM-AM-009', 'Amigos Marcos', 'Vecinos Mid', 3, 1, true, 9),
  ('JM-AJ-001', 'Amigos Jess', 'Rosa', 2, 0, true, 1),
  ('JM-AJ-002', 'Amigos Jess', 'Agustin', 1, 0, true, 2),
  ('JM-AJ-003', 'Amigos Jess', 'Isaias', 2, 0, true, 3),
  ('JM-AJ-004', 'Amigos Jess', 'Osvaldo', 2, 0, true, 4),
  ('JM-AJ-005', 'Amigos Jess', 'Amigui', 10, 1, true, 5),
  ('JM-AJ-006', 'Amigos Jess', 'Almanza', 3, 0, true, 6),
  ('JM-AJ-007', 'Amigos Jess', 'Fer Wera', 2, 0, true, 7),
  ('JM-AJ-008', 'Amigos Jess', 'Axel', 2, 1, true, 8),
  ('JM-AJ-009', 'Amigos Jess', 'Janeth', 4, 0, true, 9),
  ('JM-AJ-010', 'Amigos Jess', 'Itzel', 2, 0, true, 10),
  ('JM-AJ-011', 'Amigos Jess', 'Naye', 5, 0, true, 11),
  ('JM-AJ-012', 'Amigos Jess', 'Joss', 2, 0, true, 12),
  ('JM-AJ-013', 'Amigos Jess', 'Xim', 2, 0, true, 13),
  ('JM-AJ-014', 'Amigos Jess', 'Kary Colombia', 2, 0, true, 14),
  ('JM-AJ-015', 'Amigos Jess', 'Rosy', 2, 0, true, 15),
  ('JM-AJ-016', 'Amigos Jess', 'Fernando', 2, 0, true, 16),
  ('JM-AJ-017', 'Amigos Jess', 'Vero', 2, 0, true, 17),
  ('JM-AJ-018', 'Amigos Jess', 'Belem', 4, 0, true, 18),
  ('JM-AJ-019', 'Amigos Jess', 'Kary Quevedo', 2, 0, true, 19),
  ('JM-AJ-020', 'Amigos Jess', 'Lalo Zamora', 2, 0, true, 20),
  ('JM-AJ-021', 'Amigos Jess', 'David Rivas', 2, 0, true, 21),
  ('JM-AJ-022', 'Amigos Jess', 'Rober', 2, 0, true, 22),
  ('JM-AJ-023', 'Amigos Jess', 'Alma', 1, 0, true, 23),
  ('JM-AJ-024', 'Amigos Jess', 'Israel Aleman', 2, 0, true, 24)
on conflict (codigo)
do update set
  grupo = excluded.grupo,
  nombre = excluded.nombre,
  adultos_asignados = excluded.adultos_asignados,
  ninos_asignados = excluded.ninos_asignados,
  activo = excluded.activo,
  orden_grupo = excluded.orden_grupo;

do $$
declare
  v_total integer;
begin
  select count(*)
  into v_total
  from public.invitados
  where codigo ~ '^JM-(FM|FJ|AM|AJ)-[0-9]{3}$';

  if v_total <> 92 then
    raise exception
      'Validación fallida: se esperaban 92 invitados y existen %.',
      v_total;
  end if;
end;
$$;

commit;

select
  grupo,
  count(*) as invitaciones,
  sum(adultos_asignados) as adultos,
  sum(ninos_asignados) as ninos,
  sum(cupo_total) as cupo_total
from public.invitados
group by grupo
order by grupo;
