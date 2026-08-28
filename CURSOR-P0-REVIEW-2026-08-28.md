# Revisión P0 — 28/08/2026, 16:30 ART

recordá metodología. Cursor implementa, Codex revisa; Auto sin cambios. No cambiar expectativas de pruebas positivas para obtener PASS. No publicar MAIN mezclado. Publicación selectiva sólo con pruebas de seguridad Y continuidad del flujo real. No hay PASS físico nuevo salvo presencia hasta 15 min.

## Ya verificado

- Producción/SSR/Git `214b06b`, deploy exit0/467s. Diez probes admin Chrome200, sin timeout; spoof no cambia huellas. Hosting: direct=false, selected=null, policy=none. Gates siguen OFF.
- Empaquetado valida main declarado, wrapper real y marcador; no generar stub ni borrar paquete preparado.

## Bloqueos comprobados que debe cerrar la entrega

1. Recibos: validar todos los campos (`readBy`, `seenBy`, `readAt`, `unreadCounts`, `latestReadMessageIds`). Repro `demo-p0-independent-1630`: null/lista/escalar reemplazan mapas ajenos y se permiten cuando el fallback devuelve lista vacía. Campo modificado exige tipo válido y diff de claves autorizadas; preservar recibos legítimos de alias derivados de lease privado.
2. Query LIST: fixtures mínimos prueban `uid in data.participantes` y `uid in data.get('participantes',[])` ALLOWED; añadir `is list` hace fallar array-contains. Owner receptorUid/targetUid/anonOwnerUid, legacy participantes y visitante con lease deben seguir funcionando. No cambiar positivas a DENIED sin implementar reemplazo probado en cliente.
3. **Enviar no es sólo crear mensaje.** Repro `demo-p0-real-send-1631`: mensaje profile aislado ALLOWED; batch realista mensaje+metadata DENIED (también límite1000 expresiones). `persistAnonMessage` escribe `buildOutgoingChatMetaPatch`: lastMessage/latestMessageId + readBy del receptor=false + unreadCounts del receptor increment(1). Hace falta autorización acotada al envío atómico auténtico, separada de “marcar leído”. Pruebas con el payload real de ambos lados, no sólo documentos simplificados.
4. `chats_anonimos`/solicitudes: cerrar cambios de participantes/autores ajenos/solicitudes ajenas. Repro1627 escaló destinatario/participantes y un tercero pudo leer. No permitir write genérico de miembro.
5. Compatibilidad servidor: APIs anon-match request/respond/close/report toman identidad del body sin auth; service usa REST con API-key sin bearer. Rules cerradas rompen ese servidor. Implementar token verificado + vínculo privado; nunca trasladar esa confianza en body al Admin SDK. Verificar flujos perfil y visitante anónimo reales.
6. **Anonimato:** retirar UID real de documentos legibles por receptor, no sólo de UI. WIP bind lo publicaba en participantes; además **214 y MAIN `persistAnonMessage` publican `senderAuthUid` y `createdByAuthUid` en messagePayload**. Relación real sólo privada para admin autorizado. No borrar ni reasignar autores históricos por conjetura; preservar prueba privada y preparar migración reversible si corresponde. Prueba sobre payload real, no fixture saneado manualmente.
7. Promoción debe incluir hardening214 sin regresión: MAIN `abuseCors` refleja cualquier Origin y `abuseApiUsesDirectGcf` acepta run.app. CORS exacto, token verificado, misma base directa en check/bind/permit; no usar proxy como IP del visitante.

## Criterios de entrega

- Compile Rules antes de matriz: funciones con let+return, sin bloques if. Reducir expresiones repetidas sin quitar guardas. CRUD/LIST positivos y negativos, tipos inválidos, mapas ajenos, falsificación de autor, batch real, doble petición/reintento.
- Unit/emulador ≠ producción ni PASS usuario. Mantener activo Ruleset abierto como pendiente hasta rollout compatible real. Estado con timestamps reales y evidencias, no horas inventadas.
- Commit selectivo del hito revisado, dejando explícitos bloqueos de rollout. No desplegar el borrador mientras falle una positiva o una negativa.
- Después siguen: antiacoso30min/IP y admin quién→quién; identidad nueva→hilo nuevo; Shuffle restaura orden+scroll exactos (repro659→0 sigue abierto). Inventario amplio en el archivo de auditoría del hilo.

## R2 — revisión 16:35 ART, bloquear falso PASS1631

- `profileAnonVisitorOutgoingSendUpdate` no comprueba creación atómica: un lease solo no acredita envío. Vincular `latestMessageId` a mensaje NUEVO (no existía antes, `getAfter` del mismo batch), autor/rol correctos y permiso vigente; mapas de destinatarios con cambios exactos esperados (unread+1), no cualquier número ni preview sin mensaje. Incluir owner→anon, no sólo visitor→owner. Probar replay/mensaje preexistente, metadata sin mensaje, bloqueo activo y contador arbitrario.
- `p0-privacy-rules-independent-1631` está fabricando funciones buildReal... dentro del test. Extraer constructor puro del payload real, usarlo desde persist y test (incluidos transforms reales), o ejecutar persist con adaptadores controlados. Una copia manual no acredita el wiring.
- Negativa `anon_message_public_auth_uid_denied` usa otro messageId con PERMIT_ID ligado al anterior: se deniega por permiso incorrecto aunque se quite la protección de UID. Usar un permiso válido para ese messageId y control positivo idéntico sin UID; sólo cambiar el campo privado. Probar cada campo por separado.
- Preservar todas las negativas anteriores: ampliar autorización para enviar no debe permitir falsificar vistos ni escribir metadata después de bloqueo.

## R3 — consumidores del UID privado, necesario antes de promover

Quitar UID público sin adaptar consumidores rompe funciones existentes. Inspección de código:

- `functions/src/viewOnceClaimCore.ts`: isViewOnceAuthor usa senderAuthUid/createdByAuthUid (o UID público); comprobar sellado, autor y claim de bomba con identidad privada.
- `functions/src/deleteChatMessageCore.ts`: autor/member también depende de esos campos o initiatorUid; preservar eliminar para mí/todos y rechazar otro usuario.
- `functions/src/verifiedProfileLink.ts` + scrub trigger en index.ts: messageAuthorUid pierde UID del propietario que comparte desde modo anónimo; enlace verificado dejaría de funcionar. Resolver autor desde vínculo privado validado, sin devolver UID al receptor.
- Push/unread (`functions/src/index.ts`, unreadNotificationLines.ts) usa esos IDs para destinatarios/exclusión: comprobar sin autorreenvíos y sin revelar perfil real.

Preparar compatibilidad server/Functions primero y testear los flujos existentes con nuevos payloads. No resolverlo volviendo a exponer el UID. Histórico requiere plan privado/reversible separado: no declarar anonimato total sólo por limpiar nuevos mensajes, ni cambiar fromUid/autoría histórica por conjetura.

## R4 — constructor compartido debe ejecutar el mismo camino

- El nuevo helper trae `mode:emulator` / `unreadLiteralOne`: eso vuelve a sustituir el comportamiento que había que probar. Emulador soporta `increment(1)` y `serverTimestamp()` reales. Usar el mismo constructor/camino en producto y pruebas, sin rama de payload distinta para QA. Importar dependencias reales y ejecutar lint/TypeScript además del harness.
- Probar dos envíos sucesivos partiendo de unread>0, respuesta owner cuando ambas claves owner/profile_owner están false, y transforms reales. `buildOutgoingChatMetaPatch` escribe true sólo en la clave del sender; la regla no puede exigir ambas claves self=true si el payload no las actualiza. Acotar diff a claves legítimas y valores según envío, no forzar un fixture artificial.
