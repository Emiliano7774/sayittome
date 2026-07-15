/**
 * Synchronous head bootstrap for SoftNavigate remounts into Boost.
 * Must stay free of imports / window-at-module-load so RootLayout (RSC) can embed it.
 * Reads session prepaint marker + suppress-until and installs DOM datasets before paint.
 * Destination-scoped: does not clear or conflict with Chats prepaint keys.
 */
export const BOOST_PREPAINT_BOOTSTRAP_SCRIPT = `(function(){try{var now=Date.now();var markerRaw=sessionStorage.getItem("sayittome:boost-prepaint-handoff");var untilRaw=sessionStorage.getItem("sayittome:boost-sequence-handoff-suppress-until");var until=untilRaw?Number(untilRaw):0;var markerOk=false;if(markerRaw){try{var m=JSON.parse(markerRaw);if(m&&m.destination==="/boost"&&typeof m.expiresAt==="number"&&now<=m.expiresAt){markerOk=true;}else{sessionStorage.removeItem("sayittome:boost-prepaint-handoff");}}catch(e){sessionStorage.removeItem("sayittome:boost-prepaint-handoff");}}var suppressOk=Number.isFinite(until)&&until>now;if(!markerOk&&!suppressOk)return;var html=document.documentElement;if(markerOk)html.setAttribute("data-prepaint-boost-handoff-suppress","1");html.setAttribute("data-boost-handoff-suppress","1");html.setAttribute("data-boost-post-commit-settle","1");html.setAttribute("data-tab-post-auth-settle","1");try{sessionStorage.setItem("sayittome:nav-capture-session","1");}catch(e){}}catch(e){}})();`;
