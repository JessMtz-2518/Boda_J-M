# Fase 3.5B / Microfase 4A — Alta administrativa de invitados

## Alcance

Esta microfase agrega únicamente la capa de datos para dar de alta nuevos invitados desde el panel administrativo.

No modifica:

- RSVP público.
- Dashboard.
- Login/autenticación.
- RPC existentes de listado, edición, token o confirmaciones.
- Frontend del módulo Invitados.

## RPC nueva

`public.admin_crear_invitado(...)`

Recibe únicamente:

- nombre;
- grupo;
- adultos;
- niños;
- teléfono opcional;
- notas opcionales;
- motivo obligatorio.

No recibe ni permite definir:

- id;
- código;
- token;
- activo;
- fechas;
- administrador.

## Código automático

Los prefijos se mantienen:

| Grupo | Prefijo |
|---|---|
| Familia Marcos | FM |
| Familia Jess | FJ |
| Amigos Marcos | AM |
| Amigos Jess | AJ |

El código conserva el formato `JM-XX-###`.

La tabla privada `private.consecutivos_invitaciones` mantiene un contador independiente por grupo. La asignación usa un `UPDATE ... RETURNING`, por lo que dos altas concurrentes del mismo grupo quedan serializadas sobre una sola fila y reciben números diferentes.

Los códigos no se reutilizan.

## Inicialización idempotente

Al ejecutar `07_admin_crear_invitados.sql`, cada contador se inicializa con el mayor valor entre:

1. el contador privado ya existente; y
2. el máximo código histórico detectado en `public.invitados`.

Volver a ejecutar el script no disminuye contadores ni cambia códigos existentes.

## Token

`public.invitados.token_acceso` conserva su `default gen_random_uuid()`.

La RPC no recibe, genera explícitamente ni devuelve el token.

Para compartir la invitación después del alta se debe seguir usando `admin_obtener_token_invitacion()`.

## Auditoría

El alta registra en `public.historial_invitados`:

- acción `creado`;
- datos nuevos;
- administrador;
- motivo;
- fecha.

No almacena el token.

## Regla de cupo

Una nueva invitación debe tener al menos una persona asignada:

`adultos + niños > 0`

Los registros históricos existentes no se modifican.

## Pruebas antes del frontend

1. Ejecutar el script una vez.
2. Ejecutarlo nuevamente y confirmar idempotencia.
3. Probar anon: rechazado.
4. Probar authenticated no administrador: rechazado.
5. Probar administrador inactivo: rechazado.
6. Probar administrador activo.
7. Crear un invitado de cada grupo.
8. Confirmar códigos consecutivos.
9. Confirmar que no se devuelve `token_acceso`.
10. Confirmar que el token sí existe y es UUID en la tabla.
11. Confirmar auditoría `creado`.
12. Probar nombre vacío.
13. Grupo inválido.
14. Cupo cero.
15. Cupos negativos.
16. Teléfono inválido.
17. Motivo vacío.
18. Notas > 1000 caracteres.
19. Simular dos altas simultáneas del mismo grupo.
20. Confirmar que reciben códigos distintos.
21. Confirmar que el listado administrativo muestra los nuevos invitados.
22. Confirmar que el Dashboard los incluye según sus reglas vigentes.
23. Confirmar que RSVP existente no presenta regresiones.

## Siguiente microfase

Después de validar el SQL en Supabase:

**Microfase 4B — Panel “+ Nuevo invitado”**

El frontend reutilizará el estilo del editor actual y, después de crear, ofrecerá:

- Vista previa;
- Copiar enlace;
- WhatsApp;
- Cerrar.

No se implementa en esta entrega.
