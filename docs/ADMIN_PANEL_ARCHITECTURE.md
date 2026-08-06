# Arquitectura del panel administrativo

## Alcance de la Fase 3.2

El panel es una aplicación estática independiente bajo `/admin/`. Esta fase incluye autenticación, autorización, navegación protegida y contratos reutilizables para acciones de invitados. No consulta directamente tablas ni implementa información real del dashboard.

## Estructura

```text
admin/
  index.html
  css/admin.css
  js/
    admin-app.js
    auth/
      auth-service.js
      auth-guard.js
    config/supabase-admin-client.js
    router/hash-router.js
    views/*-view.js
    components/guest-actions.js
    utils/
      invitation-url.js
      whatsapp.js
      qr-code.js

css/admin-preview.css
js/admin-preview.js
```

## Autenticación y autorización

1. `signInWithPassword()` valida correo y contraseña con Supabase Auth.
2. Una sesión Auth no concede acceso administrativo por sí sola.
3. `admin_verificar_acceso()` comprueba que el UUID pertenezca a un administrador activo.
4. El shell se muestra únicamente cuando `autorizado` es `true`.
5. Si el usuario no está autorizado se cierra su sesión local y se muestra un mensaje genérico.

El cliente administrativo usa la publishable key, persiste la sesión en `boda-jm-admin-auth` y nunca usa `service_role`.

## Rutas hash protegidas

- `#/dashboard`
- `#/invitados`
- `#/confirmaciones`
- `#/estadisticas`
- `#/mesas`

Las rutas desconocidas se normalizan a `#/dashboard`. El router solo se inicia después de la autorización y se detiene al cerrar sesión.

## Generador único de URLs

`AdminInvitationUrl` expone:

- `buildInvitationUrl(token, options)`
- `openInvitationPreview(token, options)`
- `copyInvitationUrl(token)`
- `validateToken(token)`

La base se obtiene de `window.location`, removiendo `/admin/`. Esto conserva automáticamente la subcarpeta de GitHub Pages y funciona con localhost o un dominio personalizado. Todos los consumidores reciben la misma URL canónica.

## Acciones de invitado

`AdminGuestActions.create(guest)` crea, mediante nodos DOM y `textContent`:

- Vista previa normal.
- Copiar enlace.
- Generar QR.
- Compartir por WhatsApp.
- Menú Más con modo prueba y contratos deshabilitados para correo/PDF.

El ejemplo de `#/invitados` utiliza datos mock. Cuando exista el módulo real, cada registro deberá entregar al componente `{ name, code, token }`; el componente no necesita conocer la fuente de esos datos.

## Vista previa y modo prueba

La vista previa normal abre `?inv=<token>` en otra pestaña. El modo prueba abre `?inv=<token>&preview=admin`.

`preview=admin` no concede acceso. `admin-preview.js` recupera la sesión administrativa del mismo origen, ejecuta `admin_verificar_acceso()` y solo entonces obtiene nombre y código mediante la RPC pública existente. Si falla cualquier validación, no crea la banda y la invitación continúa normalmente.

La banda:

- no modifica el formulario ni registra eventos sobre el RSVP;
- muestra únicamente el token abreviado;
- renderiza valores con `textContent`;
- permite volver a `admin/#/invitados` u ocultarse.

La sesión administrativa debe pertenecer al mismo origen de la invitación. Una sesión creada en localhost no autentica una vista previa abierta en GitHub Pages, y viceversa.

## WhatsApp

`AdminWhatsApp` usa `AdminInvitationUrl.buildInvitationUrl()`. El mensaje predeterminado solo contiene una introducción y el enlace; no incluye cupos, teléfono ni información privada. No existen envíos masivos.

## QR

`AdminQrCode` usa la misma URL canónica. La demo carga `qrcodejs` 1.0.0 desde jsDelivr y genera el QR dentro del navegador; el token no se envía a un servicio generador de imágenes. Como mejora futura puede alojarse una copia local de la librería, conservando su licencia, para eliminar la dependencia del CDN.

## Riesgos y controles

- La publishable key es pública; la seguridad depende de RLS y RPC autorizadas.
- La sesión persistida está disponible para scripts del mismo origen; deben evitarse dependencias no confiables y vulnerabilidades XSS.
- La librería QR usa CDN y requiere conexión. Su fallo afecta únicamente al QR.
- Una ventana emergente puede ser bloqueada por el navegador; el componente informa el error.
- No se consulta ninguna tabla con `.from()`.
- No se muestra contenido administrativo antes del guard.
- No se interpolan datos provenientes de Supabase mediante `innerHTML`.

## Pruebas recomendadas

1. Abrir `/admin/` sin sesión: debe verse solamente el login.
2. Iniciar con un usuario Auth no registrado: debe cerrar sesión y negar acceso.
3. Iniciar con administrador activo: debe abrir `#/dashboard`.
4. Recargar: debe conservar sesión y ruta.
5. Probar menú móvil y las cinco rutas.
6. En Invitados, comprobar que vista previa, copiar, QR y WhatsApp comparten la misma URL.
7. Abrir manualmente `?inv=<uuid>&preview=admin` sin sesión: no debe aparecer la banda.
8. Abrir Modo prueba desde una sesión válida: debe aparecer la banda con token abreviado.
9. Cerrar sesión y volver a cargar la URL de prueba: la banda no debe aparecer.
10. Confirmar que el RSVP normal continúa consultando y guardando sin cambios.
