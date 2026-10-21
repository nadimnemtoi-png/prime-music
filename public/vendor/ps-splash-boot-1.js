/* Prime School · ecranul de start: dacă e cineva logat, pune clasa „ps-splash” pe <html>
   chiar înainte să se încarce restul, ca ecranul să fie galben din prima clipă (fără
   flash închis). Animația cu Prime pornește din app.js (psSplash). Nu apare când
   aplicația e deschisă dintr-o notificare (?notifs=) sau cu „reducerea mișcării”. */
(function(){try{
 var ls=window.localStorage;
 if(!(ls.getItem("pm_auth")||ls.getItem("elev_id"))) return;
 if(/[?&]notifs=/.test(location.search)) return;
 if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
 document.documentElement.classList.add("ps-splash");
}catch(e){}})();
