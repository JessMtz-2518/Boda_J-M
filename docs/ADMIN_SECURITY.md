# Seguridad del panel administrativo

Este documento describe la Fase 3.1 del panel administrativo. El script asociado es `database/04_admin_security.sql` y debe revisarse y ejecutarse manualmente en Supabase. Esta fase no crea el login ni ninguna pantalla del panel.

## Autenticación y autorización

La autenticación responde: **¿quién inició sesión?** Supabase Auth valida las credenciales y entrega una sesión con un usuario identificado por `auth.uid()`.

La autorización responde: **¿ese usuario puede administrar la boda?** Una sesión válida no concede acceso administrativo automáticamente. El UUID del usuario también debe existir en `public.administradores`, con `rol = 'administrador'` y `activo = true`.

La RPC `public.admin_verificar_acceso()` combina ambas comprobaciones sin revelar registros de otros administradores. Su respuesta contiene únicamente:

```json
{
  "autorizado": true,
  "nombre": "Nombre visible",
  "rol": "administrador"
}
```

Para usuarios autenticados sin autorización devuelve `autorizado: false` y valores nulos para nombre y rol.

## Crear el primer usuario administrador

1. Abrir el proyecto en Supabase.
2. Ir a **Authentication → Users**.
3. Seleccionar **Add user → Create new user**.
4. Capturar el correo del administrador y una contraseña temporal segura.
5. Crear el usuario y copiar su UUID desde la ficha de usuario.
6. Ejecutar primero `database/04_admin_security.sql` desde **SQL Editor**.
7. Registrar el UUID autorizado desde SQL Editor:

```sql
insert into public.administradores (
    usuario_id,
    nombre
)
values (
    '<UUID_DEL_USUARIO_AUTH>'::uuid,
    'Jessica Martínez'
)
on conflict (usuario_id)
do update set
    nombre = excluded.nombre,
    rol = 'administrador',
    activo = true;
```

La relación usa `ON DELETE CASCADE`: si el usuario se elimina de Supabase Auth, su autorización también se elimina automáticamente de `public.administradores`.

No se deben guardar contraseñas en `public.administradores`, archivos JavaScript, documentación ni GitHub.

## Funciones y permisos

### `private.es_administrador_activo()`

- Es una función interna.
- Comprueba exclusivamente el `auth.uid()` de la sesión actual.
- Exige un registro activo con rol `administrador`.
- Usa `security definer` y `search_path = ''`.
- No concede ejecución a `public`, `anon` ni `authenticated`.

### `public.admin_verificar_acceso()`

- Usa `security definer` y `search_path = ''`.
- Solo `authenticated` tiene permiso `EXECUTE`.
- `anon` y `public` no pueden ejecutarla.
- No acepta un UUID como parámetro y, por ello, no permite consultar a otros administradores.
- No concede acceso directo a ninguna tabla.

Las tablas `administradores` e `historial_confirmaciones` mantienen RLS habilitado y sin permisos directos de `SELECT`, `INSERT`, `UPDATE` o `DELETE` para `anon` o `authenticated`.

## Trazabilidad administrativa

El historial existente no se elimina ni se reescribe. El script agrega:

- `origen`: `invitado` o `administrador`;
- `modificado_por`: UUID histórico del administrador que realizó el cambio;
- `motivo`: justificación opcional de la modificación.

La restricción de consistencia exige:

- Cuando `origen = 'invitado'`, `modificado_por` y `motivo` deben ser `NULL`.
- Cuando `origen = 'administrador'`, `modificado_por` y `motivo` son obligatorios.
- Un motivo administrativo debe contener entre 1 y 1000 caracteres después de aplicar `trim`.

`modificado_por` es deliberadamente nullable y no tiene llave foránea hacia `auth.users`. Cuando el origen es administrativo, la restricción exige que contenga el UUID que identificaba al administrador en el momento del cambio. Al no depender de una FK, ese identificador histórico permanece intacto y el historial continúa siendo válido aunque posteriormente se elimine al usuario de Supabase Auth.

Los registros existentes reciben `origen = 'invitado'`. La regla es compatible con el trigger actual del RSVP público porque ese trigger no informa las columnas nuevas: se aplica el valor predeterminado `invitado` y ambos campos opcionales permanecen en `NULL`.

En una fase posterior, la RPC de corrección administrativa deberá establecer `origen = 'administrador'`, `modificado_por = auth.uid()` y exigir un motivo. Esta fase solo prepara la estructura; no modifica el trigger público del RSVP.

## Por qué no se usa `service_role` en el navegador

Una clave `service_role` omite las políticas RLS y concede privilegios elevados sobre la base. Cualquier secreto incluido en HTML o JavaScript puede ser leído por visitantes desde las herramientas del navegador.

El futuro panel utilizará únicamente la publishable key. La sesión de Supabase Auth aportará el JWT del usuario y las RPC verificarán `auth.uid()` y su autorización administrativa dentro de PostgreSQL.

## Consultas de prueba

Las pruebas siguientes se ejecutan manualmente desde SQL Editor después de aplicar el script. Sustituir los UUID de ejemplo por UUID reales creados en Supabase Auth.

### 1. Usuario no autenticado

Debe fallar por falta de permiso `EXECUTE`:

```sql
begin;

set local role anon;

select public.admin_verificar_acceso();

rollback;
```

Resultado esperado: `permission denied for function admin_verificar_acceso`.

### 2. Usuario autenticado, pero no registrado

```sql
begin;

set local role authenticated;
set local request.jwt.claims =
    '{"sub":"<UUID_AUTH_NO_REGISTRADO>","role":"authenticated"}';

select public.admin_verificar_acceso();

rollback;
```

Resultado esperado:

```json
{"autorizado": false, "nombre": null, "rol": null}
```

### 3. Administrador inactivo

Preparación, ejecutada como `postgres` desde SQL Editor:

```sql
insert into public.administradores (
    usuario_id,
    nombre,
    activo
)
values (
    '<UUID_AUTH_INACTIVO>'::uuid,
    'Administrador inactivo',
    false
)
on conflict (usuario_id)
do update set activo = false;
```

Prueba:

```sql
begin;

set local role authenticated;
set local request.jwt.claims =
    '{"sub":"<UUID_AUTH_INACTIVO>","role":"authenticated"}';

select public.admin_verificar_acceso();

rollback;
```

Resultado esperado: `autorizado = false`.

### 4. Administrador activo

Preparación, ejecutada como `postgres` desde SQL Editor:

```sql
insert into public.administradores (
    usuario_id,
    nombre,
    activo
)
values (
    '<UUID_AUTH_ADMIN_ACTIVO>'::uuid,
    'Jessica Martínez',
    true
)
on conflict (usuario_id)
do update set
    nombre = excluded.nombre,
    rol = 'administrador',
    activo = true;
```

Prueba:

```sql
begin;

set local role authenticated;
set local request.jwt.claims =
    '{"sub":"<UUID_AUTH_ADMIN_ACTIVO>","role":"authenticated"}';

select public.admin_verificar_acceso();

rollback;
```

Resultado esperado:

```json
{
  "autorizado": true,
  "nombre": "Jessica Martínez",
  "rol": "administrador"
}
```

## Pruebas adicionales recomendadas

Verificar que un usuario `authenticated` no pueda consultar directamente las tablas:

```sql
begin;

set local role authenticated;

select * from public.administradores;
select * from public.historial_confirmaciones;

rollback;
```

Ambas consultas deben fallar por permisos insuficientes.

También se debe comprobar que las RPC públicas existentes del RSVP continúan conservando exactamente sus firmas y permisos originales.
