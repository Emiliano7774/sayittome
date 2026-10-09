/**
 * Captures main-tab clicks that happen before React has hydrated the bottom nav.
 * Without this guard, the raw <a href> performs a full document navigation.
 * The latest intent is replayed by AppNavigation as soon as hydration commits.
 */
export const MAIN_TAB_PREHYDRATE_GUARD_SCRIPT = String.raw`(()=>{try{
  if(window.__sayittomeMainTabPrehydrateGuardInstalled)return;
  window.__sayittomeMainTabPrehydrateGuardInstalled=true;
  window.__sayittomeMainTabHydrated=false;
  document.addEventListener("click",function(e){
    try{
      if(window.__sayittomeMainTabHydrated)return;
      if(e.defaultPrevented)return;
      if(typeof e.button==="number"&&e.button!==0)return;
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      var t=e.target;
      if(!t||typeof t.closest!=="function")return;
      var a=t.closest("a[data-nav-tab]");
      if(!a)return;
      var href=a.getAttribute("href")||"";
      if(!/^\/(stories|chats|shuffle|boost|settings)$/.test(href))return;
      e.preventDefault();
      window.__sayittomePrehydrateMainTabIntent=href;
      document.documentElement.setAttribute("data-sayittome-prehydrate-main-tab-intent",href.slice(1));
    }catch(_){}
  },true);
}catch(_){}})();`;