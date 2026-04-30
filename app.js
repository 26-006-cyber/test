/* ES5 bootstrapper for Sleep Planner */
(function () {
  function $(id) {
    return document.getElementById(id);
  }
  function showStatus(msg) {
    var el = $("status");
    if (!el) return;
    el.className = "status status--big status--error";
    el.innerHTML = msg;
  }
  var isModern = true;
  try {
    // eslint-disable-next-line no-new-func
    new Function("let a=1; const b=2; return ()=>a+b;")();
  } catch (e) {
    isModern = false;
  }
  if (!isModern) {
    showStatus("This browser is too old. Please use a modern browser (Edge/Chrome).");
    return;
  }

  var s = document.createElement("script");
  s.src = "./app.modern.js";
  s.type = "module";
  s.defer = true;
  s.onerror = function () {
    showStatus("Script load failed: app.modern.js");
  };
  document.head.appendChild(s);
})();

