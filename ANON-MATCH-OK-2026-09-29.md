# Anon match funcionando — 29/09/2026

Versión de referencia. Si más adelante el match anónimo se rompe, comparar contra esto.

- Rama: `p0/abuse-checkpoint`
- Tag: `anon-match-ok-20260929`
- Commit: `e6bcc00` (código: `091fc9c`)
- Hosting desplegado: sha `091fc9c` → https://sayittome-app.web.app
- Versión Android en el repo al momento del checkpoint: `1.0.10` / `129`

## Qué funciona

- Entrar anónimo abre la puerta de match (presencia + avisos entrantes).
- Cada pestaña del mismo navegador es una persona distinta.
- Buscar devuelve `200` y elige destinatario por cola, no al azar.
- El destinatario recibe el aviso en segundos.
- Presencia devuelve `200`, sin `foreign_alias` ni `400`.

## Las dos correcciones que lo destrabaron

**1. Identidad por pestaña.** La persistencia por defecto de Firebase (IndexedDB) comparte
una sola cuenta anónima entre todas las pestañas del navegador, así que dos pestañas
anónimas eran la misma persona y nunca podían matchear. Ahora el anónimo usa persistencia
de sesión y cada pestaña reclama su propia cuenta al arrancar.

**2. Alias atado a su cuenta.** Un intento previo cambiaba la cuenta a mitad de sesión y
dejaba el alias viejo guardado, lo que hacía que el servidor rechazara la búsqueda con
`403 foreign_alias` y la presencia con `400`. Ahora el alias se guarda junto al uid dueño y
se descarta si no coincide, y la cuenta de pestaña se reclama al arrancar en vez de
cambiarla después.

## Archivos clave

- `src/lib/auth/authPersistence.ts` — persistencia por pestaña + `adoptTabLocalAnonymousAuth`
- `src/lib/auth/ensureStorageAuth.ts` — reclama la cuenta de pestaña al arrancar
- `src/lib/auth/enterAnonymousMode.ts` — abre la puerta, rota alias, sin cambiar de cuenta
- `src/lib/anonMatch/anonMatchSession.ts` — alias + uid dueño, `dropAnonMatchAliasIfForeign`
- `src/lib/anonMatch/fetchAnonMatch.ts` — descarta alias ajeno antes de usarlo
- `src/services/anonymousPresence.ts` — limpia el alias cacheado al cambiar de cuenta
- `src/lib/anonMatch/matchPool.ts` — orden de cola (nunca contactados → más viejos → más fresco)
- `src/lib/anonMatch/recentMatchTargets.ts` — el recién contactado va al final
- `src/lib/anonMatch/rejectedMatchTargets.ts` — el que rechaza queda afuera hasta cerrar un chat

## Tiempos

- Vida de un pedido: **45 s** (`ANON_MATCH_REQUEST_MS`)
- Reintento tras fallo/expiración: **4 s** (`RETRY_DELAY_MS`)
- Gracia antes de reapuntar a alguien que recién entró: **5 s**
- Frescura de presencia para entrar al pool: **3 min**

## Cómo verificar

```
node scripts/anon-match-tab-isolation.harness.mjs
node scripts/anon-match-required-alert.harness.mjs
node scripts/_tmp-same-browser-two-tab-repro.mjs
```

El último abre un Chromium con dos pestañas contra producción. Ojo: si hay otros anónimos
reales conectados, las dos pestañas pueden emparejarse con desconocidos en vez de entre
ellas. Eso es correcto, no una falla.
