# Microfase 4C — Baja lógica / Reactivación

No se agregó SQL nuevo porque `database/06_admin_invitados.sql` ya contiene y autoriza:

`admin_cambiar_estado_invitado(p_id, p_activo, p_motivo, p_version)`

La microfase conecta esa RPC al frontend.

## Pruebas recomendadas

1. Invitado activo sin confirmación:
   - Dar de baja.
   - Debe desaparecer del filtro `Activos`.
   - Buscar en `Inactivos`.
   - Debe aparecer como `Inactivo`.
   - Vista previa/Copiar enlace/WhatsApp deben rechazar la invitación inactiva.

2. Invitado activo con confirmación:
   - Abrir `Dar de baja`.
   - Debe mostrar la confirmación vigente.
   - Dar de baja con motivo.
   - Confirmación e historial deben conservarse.

3. Reactivación:
   - Filtrar `Inactivos`.
   - Pulsar `Reactivar`.
   - Escribir motivo.
   - Debe regresar a `Activos` con mismo código, cupo y confirmación.

4. Auditoría:
   - Revisar `public.historial_invitados`.
   - Debe registrar `desactivado` / `reactivado`, administrador y motivo.

5. Concurrencia:
   - Abrir el mismo invitado en dos sesiones.
   - Cambiar estado en una.
   - Intentar cambiarlo en la otra.
   - Debe rechazar con `REGISTRO_DESACTUALIZADO`.

No se realiza DELETE físico.
