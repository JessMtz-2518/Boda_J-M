insert into public.administradores (
    usuario_id,
    nombre
)
values (
    '35997f8f-6325-421d-b4eb-150b81503acb'::uuid,
    'Jessica Martínez'
)
on conflict (usuario_id)
do update set
    nombre = excluded.nombre,
    rol = 'administrador',
    activo = true;