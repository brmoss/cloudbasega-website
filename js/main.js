/* CloudBaseGA site behaviour: mobile nav, active link, savings calculator */
(function () {
  "use strict";

  /* Mobile navigation toggle */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* Mark the current page in the nav */
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach(function (a) {
    var target = a.getAttribute("href");
    if (target === here) a.classList.add("active");
  });

  /* Footer year */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Cost & savings calculator (pricing page).
     Rates mirror the standard CloudBaseGA tariff (per aircraft per month +
     per flight; rotary-wing ×2). The cheaper of the low-/high-activity
     options is applied automatically. Savings model: each minute of timing
     error per flight costs one minute of unbilled hire revenue plus one
     minute of early maintenance. Figures are estimates, not a quote. */
  var calc = document.querySelector("[data-calc]");
  if (calc) {
    var RATES = {
      GBP: { symbol: "£", high: { m: 30.0, f: 0.9 }, low: { m: 15.0, f: 1.8 } },
      EUR: { symbol: "€", high: { m: 36.0, f: 1.2 }, low: { m: 18.0, f: 2.4 } },
      USD: { symbol: "$", high: { m: 36.0, f: 1.2 }, low: { m: 18.0, f: 2.4 } }
    };
    var DEFAULTS = {
      fixed: { hire: 200, maint: 50 },
      rotary: { hire: 400, maint: 100 }
    };

    var el = function (id) { return calc.querySelector("#" + id); };
    var currency = el("sc-currency");
    var type = el("sc-type");
    var aircraft = el("sc-aircraft");
    var flights = el("sc-flights");
    var hire = el("sc-hire");
    var maint = el("sc-maint");
    var error = el("sc-error");

    var money = function (symbol, value) {
      return symbol + Math.round(value).toLocaleString("en-GB");
    };

    var update = function () {
      var r = RATES[currency.value];
      var mult = type.value === "rotary" ? 2 : 1;
      var n = parseInt(aircraft.value, 10);
      var perMonth = parseInt(flights.value, 10);
      var err = parseFloat(error.value);
      var hireRate = parseFloat(hire.value) || 0;
      var maintRate = parseFloat(maint.value) || 0;

      el("sc-aircraft-out").value = n;
      el("sc-flights-out").value = perMonth;
      el("sc-error-out").value = err;

      var totalFlights = n * perMonth;

      /* CloudBaseGA cost: cheaper of the two activity options */
      var costHigh = (r.high.m * mult * n) + (r.high.f * mult * totalFlights);
      var costLow = (r.low.m * mult * n) + (r.low.f * mult * totalFlights);
      var useHigh = costHigh <= costLow;
      var cost = useHigh ? costHigh : costLow;
      var opt = useHigh ? r.high : r.low;

      /* Value recovered: err minutes per flight of hire revenue + maintenance */
      var recovered = (totalFlights / 60) * err * (hireRate + maintRate);
      var net = recovered - cost;

      /* Admin time removed: ~6 min of logging/transcribing/billing per flight */
      var adminHours = Math.round((totalFlights * 12 * 6) / 60);

      el("sc-cost").textContent = money(r.symbol, cost);
      el("sc-cost-detail").textContent =
        (useHigh ? "High" : "Low") + " activity: " +
        r.symbol + (opt.m * mult).toFixed(2) + " per aircraft + " +
        r.symbol + (opt.f * mult).toFixed(2) + " per flight";
      el("sc-recovered").textContent = money(r.symbol, recovered);
      el("sc-net").textContent = money(r.symbol, net);
      el("sc-net").style.color = net >= 0 ? "var(--success-text)" : "var(--danger)";
      el("sc-net-year").textContent = money(r.symbol, net * 12);
      el("sc-admin").textContent = adminHours.toLocaleString("en-GB");
    };

    type.addEventListener("change", function () {
      hire.value = DEFAULTS[type.value].hire;
      maint.value = DEFAULTS[type.value].maint;
      update();
    });
    [currency, aircraft, flights, hire, maint, error].forEach(function (input) {
      input.addEventListener("input", update);
    });
    update();
  }
})();
