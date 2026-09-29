import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const audience = read("src/lib/geo/audience.ts");
const filters = read("src/lib/shuffle/filters.ts");
const serverFilters = read("src/lib/shuffle/serverFilters.ts");
const sheet = read("src/components/shuffle/ShuffleFiltersSheet.tsx");
const shuffleRoute = read("src/app/api/shuffle/route.ts");
const matchPool = read("src/lib/anonMatch/matchPool.ts");
const presenceRoute = read("src/app/api/anonymous-presence/route.ts");
const directChatSession = read("src/lib/anonMatch/directChatSession.ts");
const context = read("src/contexts/AnonMatchContext.tsx");

// --- Audiencia geográfica compartida -------------------------------------
assert.match(audience, /export function geoAudienceIncludes/);
assert.match(audience, /if \(audience\.paises\.length === 0\) return true;/);
// Provincias sólo tienen sentido bajo un único país.
assert.match(audience, /if \(paises\.length !== 1\) return \{ paises, provincias: \[\] \};/);

// --- Filtros: dos direcciones, no un solo país ----------------------------
assert.match(filters, /verPaises: string\[\];/);
assert.match(filters, /aparecerPaises: string\[\];/);
assert.doesNotMatch(filters, /^\s*pais: string;$/m);
assert.match(filters, /export function discoveryAudience/);
assert.match(filters, /export function visibilityAudience/);
// Migración desde el filtro viejo de un solo país.
assert.match(filters, /export function migrateDiscoveryAudience/);
assert.match(filters, /paises: parsed\.pais \? \[parsed\.pais\] : \[\]/);
// La visibilidad no debe achicar mi propio feed.
assert.match(
  filters,
  /shuffleFiltersHasAny\(filters: ShuffleFilters\) \{\s*return \(\s*geoAudienceHasAny\(discoveryAudience\(filters\)\)/,
);

// --- Servidor Shuffle: ambas direcciones ----------------------------------
assert.match(serverFilters, /export function profileIsVisibleToViewer/);
assert.match(serverFilters, /params\.set\("verPaises"/);
assert.match(serverFilters, /params\.set\("aparecerPaises"/);
assert.match(shuffleRoute, /profileIsVisibleToViewer\(profile, viewer\) &&/);
assert.match(shuffleRoute, /parseViewerGeoTarget\(/);

// --- Pool del match anónimo: mismas reglas --------------------------------
assert.match(matchPool, /function rowAcceptsViewer/);
assert.match(matchPool, /if \(!rowAcceptsViewer\(row, viewer\)\) return null;/);
assert.match(matchPool, /if \(!geoAudienceIncludes\(discovery, row\)\) return null;/);
// El país dejó de ser una simple preferencia blanda.
assert.doesNotMatch(matchPool, /input\.pais && row\.pais && row\.pais !== input\.pais/);
assert.match(presenceRoute, /visibilidadPaises: geo\.visibilidad\.paises/);

// --- UI: dos bloques, multi-selección, "todos" bloqueado ------------------
assert.match(sheet, /function AudiencePicker/);
assert.match(sheet, /hint=\{t\("shuffle_filters_audience_visibility"\)\}/);
assert.match(sheet, /hint=\{t\("shuffle_filters_audience_discovery"\)\}/);
assert.match(sheet, /const allCountriesBlocked = audience\.paises\.length > 0;/);
assert.match(sheet, /disabled=\{allCountriesBlocked\}/);
// Provincias sólo con un único país elegido.
assert.match(sheet, /shuffle_filters_provinces_need_one_country/);

// --- Cierre de chat: instantáneo entre pestañas ---------------------------
assert.match(directChatSession, /export function broadcastAnonDirectChatClosed/);
assert.match(directChatSession, /export function subscribeAnonDirectChatClosed/);
assert.match(directChatSession, /new BroadcastChannel\(CLOSE_CHANNEL\)/);
assert.match(directChatSession, /window\.addEventListener\("storage", onStorage\)/);
assert.match(context, /subscribeAnonDirectChatClosed\(\(chatId\) => \{/);
assert.match(context, /broadcastAnonDirectChatClosed\(chatId\);/);
// El que escucha cierra en silencio; si no, rebota el anuncio.
assert.doesNotMatch(
  context,
  /subscribeAnonDirectChatClosed\(\(chatId\) => \{[\s\S]{0,200}broadcastAnonDirectChatClosed/,
);

// --- Cierre de chat: instantáneo entre dispositivos -----------------------
assert.match(context, /function closedByMe\(cerradoPor: string\)/);
assert.match(context, /closedByMe\(String\(snap\.data\(\)\.cerradoPor \|\| ""\)\)/);
// Cerrar en un dispositivo no puede exigir cerrar de nuevo en el otro.
assert.match(
  context,
  /closedByMe\(String\(snap\.data\(\)\.cerradoPor \|\| ""\)\)\) \{\s*dismissChatLocally\(\);/,
);
// Un perfil logueado escucha chats activos aunque no esté buscando.
assert.match(context, /if \(!waitingForMatch && !matchDoorOpen\) return;/);
assert.match(context, /if \(chatId === lastClosedChatIdRef\.current\) return;/);

console.log(JSON.stringify({ gate: "GEO_AUDIENCE_AND_CHAT_CLOSE_SYNC", pass: true }, null, 2));
