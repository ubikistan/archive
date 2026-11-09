// Sends a link to one forecast (#…q_20261020_02…) to that forecast on ubik.gold, everything else to the page's fallback.
(function () {
  var m = (location.hash + location.search).match(/q_\d{8}_\d+/);
  var to = document.currentScript.getAttribute("data-to");
  location.replace(m ? "https://ubik.gold/forecasts/" + m[0] : to);
})();
