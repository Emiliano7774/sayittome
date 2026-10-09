# SayItToMe — auditoría de cambios de chats, Shuffle y moderación (2026-10-09)

## Verificado y previamente publicado
- Chats anónimo↔anónimo elegidos desde tarjetas de Shuffle: apertura directa persistente `asd_`, sin invitación del buscador automático; quedan en Chats de ambos.
- El buscador «¿No encontraste a nadie interesante?» conserva su mecánica de solicitud separada.
- Chat directo en página completa; regresiones de mensajería, bombitas y multimedia pasaron en ejecuciones E2E anteriores.
- Estilo clásico de mensajes: globos compartidos, swipe para citar, hora al desplazar; falso aviso «Se encontró un chat» no se emite para IDs `asd_`.
- Fair Shuffle: ventanas de 35 por filtro, con memoria de ciclo (pruebas locales).
- Costos: listener de solicitudes como fuente principal, polling administrativo de respaldo; agregación estadística de actividad.

## Arreglos de este paquete
- El wrapper ChatSwipeRevealTime no roba los toques sobre fotos, videos y botones de bombitas.
- Imágenes y videos regulares se abren por un toque desde el chat común y el chat directo anónimo.
- Visor de imágenes con ampliación x1 a x4; para multimedia de una vista se conservan restricciones de descarga, autorización y contador.
- La moderación de todos los chats anónimos tiene acceso visible desde el panel admin. El detalle usa AdminSpectatorMessageContent, el lector con autorización de admin para imágenes, audios, videos y bombitas, sin consumir vistas.
- Para no disparar costos, la actualización automática del catálogo admin se espacia a cinco minutos (con refresh en foco/visibilidad).

## Actualización 2026-10-09: visibilidad de 3h y notificaciones
- Publicado en Firebase Hosting y GitHub (commit `9487033`): una tarjeta de anónimo permanece hasta 3 horas desde el último latido. No es presencia en tiempo real: las sesiones antiguas o cerradas no pueden recibir solicitudes nuevas aunque sigan figurando con punto verde.
- La identidad anónima es temporal y usa persistencia de sesión de navegador; al cerrar y volver a entrar genera una identidad nueva. El cierre marca el registro previo como `sessionClosed` sin borrar prematuramente la tarjeta.
- La función de push anónimo comprueba `sessionClosed` antes de notificar; se valida con `scripts/anon-direct-closed-session-push.harness.cjs`, sin lecturas adicionales de Firestore.
- **Límite conocido:** un mensaje escrito en una conversación ya existente puede persistir en el historial de la identidad antigua, dado que el cliente escribe directamente en Firestore. Esto no supone entrega a una nueva sesión anónima, pero no equivale a bloquear toda persistencia a un destinatario desconectado; no declararlo garantizado sin una restricción de escritura validada.

## Lo que NO debe declararse solucionado sin más pruebas
- Borrado de conversaciones anónimas desde Chats: la ruta actual de borrado exige cuenta registrada en ciertos flujos. La modificación para ocultar un chat solo a uno de los participantes fue bloqueada por el control de seguridad de las herramientas, por lo que NO está implementada ni en este commit.
- No se puede afirmar que los gastos facturados en Google Cloud estén normalizados sin examinar el informe real de Billing.
- Medios entre dos sesiones: repetir E2E de imagen, video y bombas (cámara y galería) en producción tras despliegue; no confundir pruebas estáticas con E2E.
- Firestore rules: realizar una auditoría independiente del alcance de la regla catchall y permisos de lectura, sin publicar reglas sin validación.
- Shuffle a escala: el servicio aún tiene límites de escaneo de visitantes y requiere pruebas de carga >1000 concurrentes.
- Notificaciones push en dispositivos reales: todavía no todas verificadas.
- Prueba admin con cuenta autorizada en producción y recuperación de contenido histórico: la ruta está implementada, falta comprobar UI de una sesión admin real.

## Criterios de aceptación del producto
- La tarjeta de un anónimo de Shuffle siempre inicia un DM normal, sin cartel de búsqueda aleatoria, mientras la sesión destino sea real y elegible.
- La conversación debe persistir en Chats de ambos participantes; medios, citas, bombitas y mensajes deben mantener la experiencia del chat registrado.
- Bombitas: abrir con consentimiento/autorización, pantalla completa y una sola vista o límite definido, sin descarga.
- Borrado de Chats debe ser coherente con la preservación de evidencias de moderación: ocultar a cada usuario sin destruir contenido visible por el otro participante.
- El panel admin puede auditar todo el contenido autorizado de chats anónimos históricos y actuales.
