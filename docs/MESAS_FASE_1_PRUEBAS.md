# Mesas · Fase 1 — Pruebas finales

Usa esta versión como la definitiva de `09_admin_mesas.sql`.

1. Ejecutar el script una vez.
2. Ejecutarlo una segunda vez: debe ser idempotente.
3. Confirmar que no haya configuración ni mesas creadas automáticamente.
4. Abrir la futura pantalla Mesas: estado inicial `sin configuración`.
5. Consultar el cupo activo.
6. Probar una configuración insuficiente:
   - ejemplo: si el cupo activo es 240, usar 20 × 10 = 200;
   - debe rechazarse con `CAPACIDAD_INSUFICIENTE`;
   - no debe guardar configuración ni crear mesas.
7. Probar una configuración suficiente:
   - 27 × 10 = 270;
   - debe crear 27 mesas;
   - debe indicar margen +30 si el cupo activo es 240.
8. Reconfigurar mientras no haya asignaciones activas.
9. Confirmar auditoría `configuracion_inicial` y `reconfigurado`.
10. En Fase 2, al existir la primera asignación activa, la reconfiguración masiva debe quedar bloqueada.
