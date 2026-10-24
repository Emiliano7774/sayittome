# 🚨🚨🚨 NOTIFICACIONES WEB BLINDADAS — RECONEXIONES ANÓNIMAS EN REVISIÓN 🚨🚨🚨

**INCIDENCIA REABIERTA (23/10/2026, 23:49 ART):** el responsable retiró la confirmación anterior de reconexiones anónimas de 60 segundos al recuperar el foco en web (PC o Android). **Estado actual: FAIL / pendiente de prueba real tras la corrección de presencia.** El PASS de entrega general Android Web y PC Web se conserva. El sello anterior permite comparar archivos y detectar regresiones; **no representa una nueva validación del caso de 60 segundos**.

> **PROHIBIDO TOCAR SIN NUEVA VERIFICACIÓN REAL.**
> El responsable confirmó el **23/10/2026** el **PASS ABSOLUTO** de entrega en **ANDROID WEB** y **PC WEB**, y posteriormente el **PASS ABSOLUTO** de **reconexiones anónimas repetidas cada 60 segundos o más, incluso más allá de la cuarta vuelta**.
> Esta confirmación corresponde al funcionamiento observado por el usuario, no a un certificado perpetuo ni a pruebas que sustituyan los dispositivos reales.

## Regla permanente para cualquier agente, Cursor, Desktop Commander o desarrollador

**NO** modificar silenciosamente la arquitectura de notificaciones, el service worker `/chat-notify/sw.js`, FCM, permisos, tokens, foreground/background, listeners ni avisos de entradas de anónimos/perfiles.

**NO** revertir esta versión a un flujo antiguo, "optimizar" permisos de forma unilateral ni aprovechar un arreglo de chats/Shuffle/Firebase para alterar accidentalmente los avisos. **NO** desactivar el bloqueo para hacer pasar un build.

El árbol aprobado está sellado en `scripts/notification-pass-lock.json` con el SHA-256 del código real que funcionaba al confirmarse el PASS. El control `scripts/notification-pass-lock.mjs` interrumpe compilaciones, despliegues y commits locales si hay divergencia. Se ejecuta en `npm run build`, `scripts/firebase-deploy-hosting.mjs`, Git hook y GitHub Actions. Si se usa una vía externa que evita estas rutas, verificar el sello manualmente.

## 🚨 Si una tarea legítima REQUIERE tocar notificaciones

1. Detenerse e informar al responsable con un aviso inequívoco: **"🚨 SE VA A MODIFICAR EL SISTEMA DE NOTIFICACIONES QUE TIENE PASS ABSOLUTO"**. Explicar archivo, razón, riesgo y restauración.
2. Conservar una copia verificable del árbol previo y no modificar módulos por efecto colateral.
3. Aplicar el cambio mínimo, con pruebas de permiso, token, service worker, avisos de primer ingreso y **al menos seis reconexiones consecutivas después de estar fuera 60 segundos o más**, apertura, background/foreground y ausencia de duplicaciones; **un latido normal cada 90 segundos no debe producir un aviso nuevo**.
4. Verificar **en dispositivos reales** Android Web (Chrome/Brave según corresponda) y PC Web: activo, minimizado, reinicio de pestaña y retorno. La validación automatizada NO reemplaza estas pruebas.
5. Pedir confirmación explícita para cambiar la versión protegida; no actualizar el sello automáticamente. Únicamente después de esa confirmación: `STM_NOTIFICATIONS_PASS_REVALIDATED=ANDROID_WEB_AND_PC_WEB node scripts/notification-pass-lock.mjs --seal` (PowerShell: asignar `$env:STM_NOTIFICATIONS_PASS_REVALIDATED='ANDROID_WEB_AND_PC_WEB'` antes de ejecutar). Revisar el diff del manifiesto y restaurar el bloqueo.
6. Ejecutar pruebas y recién entonces publicar. Si no se puede validar el PASS, **no desplegar cambios en el sistema de notificaciones**.

## Ámbito

El sello cubre **diecisiete archivos críticos**, incluyendo cliente web, Service Worker, FCM, permisos, recuperación de tokens, avisos de anónimos y, ahora, **detección de reingresos en servidor y ruta de presencia anónima**. No altera el código de ejecución, Firebase ni las preferencias de usuarios. No modifica el código de ejecución, Firebase ni las preferencias de usuarios.

El estado verificado de referencia corresponde al despliegue `a239846`, con `build-release.json` de `2026-10-24T01:51:15.384Z` UTC. **No se necesita redeploy para incorporar esta protección de proceso:** vive en el repo, los hooks y la cadena de compilación/despliegue.

## Pruebas sin tocar producción

- `node scripts/notification-pass-lock.mjs` — comprobación del árbol actual.
- `node scripts/notification-pass-lock.mjs --staged` — comprobación de lo preparado para commit.
- `node scripts/notification-pass-lock.harness.mjs` — simula una discrepancia del sello y verifica que bloquea el despliegue.
