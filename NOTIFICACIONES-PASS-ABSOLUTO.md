# 🚨🚨🚨 NOTIFICACIONES BLINDADAS — PASS ABSOLUTO 🚨🚨🚨

> **PROHIBIDO TOCAR SIN NUEVA VERIFICACIÓN REAL.**
> El responsable confirmó el **23/10/2026** que las notificaciones entran correctamente tanto en **ANDROID WEB** como en **PC WEB**.
> Esta confirmación corresponde al funcionamiento observado por el usuario, no a un certificado perpetuo ni a pruebas que sustituyan los dispositivos reales.

## Regla permanente para cualquier agente, Cursor, Desktop Commander o desarrollador

**NO** modificar silenciosamente la arquitectura de notificaciones, el service worker `/chat-notify/sw.js`, FCM, permisos, tokens, foreground/background, listeners ni avisos de entradas de anónimos/perfiles.

**NO** revertir esta versión a un flujo antiguo, "optimizar" permisos de forma unilateral ni aprovechar un arreglo de chats/Shuffle/Firebase para alterar accidentalmente los avisos. **NO** desactivar el bloqueo para hacer pasar un build.

El árbol aprobado está sellado en `scripts/notification-pass-lock.json` con el SHA-256 del código real que funcionaba al confirmarse el PASS. El control `scripts/notification-pass-lock.mjs` interrumpe compilaciones, despliegues y commits locales si hay divergencia. Se ejecuta en `npm run build`, `scripts/firebase-deploy-hosting.mjs`, Git hook y GitHub Actions. Si se usa una vía externa que evita estas rutas, verificar el sello manualmente.

## 🚨 Si una tarea legítima REQUIERE tocar notificaciones

1. Detenerse e informar al responsable con un aviso inequívoco: **"🚨 SE VA A MODIFICAR EL SISTEMA DE NOTIFICACIONES QUE TIENE PASS ABSOLUTO"**. Explicar archivo, razón, riesgo y restauración.
2. Conservar una copia verificable del árbol previo y no modificar módulos por efecto colateral.
3. Aplicar el cambio mínimo, con pruebas de permiso, token, service worker, avisos de primer ingreso y reconexión, apertura, background/foreground y ausencia de duplicaciones.
4. Verificar **en dispositivos reales** Android Web (Chrome/Brave según corresponda) y PC Web: activo, minimizado, reinicio de pestaña y retorno. La validación automatizada NO reemplaza estas pruebas.
5. Pedir confirmación explícita para cambiar la versión protegida; no actualizar el sello automáticamente. Únicamente después de esa confirmación: `STM_NOTIFICATIONS_PASS_REVALIDATED=ANDROID_WEB_AND_PC_WEB node scripts/notification-pass-lock.mjs --seal` (PowerShell: asignar `$env:STM_NOTIFICATIONS_PASS_REVALIDATED='ANDROID_WEB_AND_PC_WEB'` antes de ejecutar). Revisar el diff del manifiesto y restaurar el bloqueo.
6. Ejecutar pruebas y recién entonces publicar. Si no se puede validar el PASS, **no desplegar cambios en el sistema de notificaciones**.

## Ámbito

El sello cubre quince archivos del cliente, Service Worker y emisor FCM, incluyendo la capa de permisos, la recuperación de tokens, los avisos de conexiones anónimas y la inicialización de notificaciones. No modifica el código de ejecución, Firebase ni las preferencias de usuarios.

El estado verificado de referencia corresponde a la publicación anterior con `build-release.json` de `2026-10-24T00:43:00.399Z` UTC. **No se necesita redeploy para incorporar esta protección de proceso:** vive en el repo, los hooks y la cadena de compilación/despliegue.

## Pruebas sin tocar producción

- `node scripts/notification-pass-lock.mjs` — comprobación del árbol actual.
- `node scripts/notification-pass-lock.mjs --staged` — comprobación de lo preparado para commit.
- `node scripts/notification-pass-lock.harness.mjs` — simula una discrepancia del sello y verifica que bloquea el despliegue.
