/**
 * FabtrackJS - Global Base URL & CSRF Fetch Interceptor
 * Externalized from views/includes/pagehead.html for strict CSP (no unsafe-inline).
 */
(() => {
  "use strict";

  window.getAppBaseUrl = function (endpoint) {
    var base = "";
    try {
      if (document.baseURI) {
        var p = new URL(document.baseURI).pathname.replace(/\/+$/, "");
        if (p && p !== "/") base = p;
      }
    } catch (_e) {
      // Ignore malformed baseURI
    }
    var clean = (endpoint || "").replace(/^\/+/, "");
    var baseNoSlash = base.replace(/^\/+/, "");
    if (baseNoSlash && (clean === baseNoSlash || clean.indexOf(baseNoSlash + "/") === 0)) {
      return "/" + clean;
    }
    return base ? (clean ? base + "/" + clean : base + "/") : "/" + clean;
  };

  window.getCsrfToken = function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
  };

  if (typeof window.fetch !== "function" || window.__fabtrackCsrfFetchPatched) {
    return;
  }
  window.__fabtrackCsrfFetchPatched = true;
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var opts = init ? Object.assign({}, init) : {};
    var method = (opts.method || (input && typeof input === "object" && input.method) || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      var rawUrl = typeof input === "string" ? input : input && input.url ? input.url : "";
      var isSameOrigin = true;
      try {
        if (rawUrl) {
          var parsed = new URL(rawUrl, window.location.href);
          isSameOrigin = parsed.origin === window.location.origin;
        }
      } catch (_e) {
        // Keep default same-origin assumption for relative URLs
      }
      if (isSameOrigin) {
        var token = window.getCsrfToken();
        if (token && typeof window.Headers === "function") {
          var headers = new window.Headers(
            opts.headers || (input && typeof input === "object" && input.headers ? input.headers : undefined),
          );
          if (!headers.has("X-CSRF-Token") && !headers.has("CSRF-Token")) {
            headers.set("X-CSRF-Token", token);
          }
          opts.headers = headers;
        }
      }
    }
    return nativeFetch(input, opts);
  };
})();
