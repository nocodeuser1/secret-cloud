/*
 * The Secret Cloud plan site: review layer.
 * One IIFE, plain ES2020, no dependencies, no build step.
 * Talks to Supabase over REST with the publishable key from assets/config.js.
 * Every user-provided string reaches the DOM through textContent / createTextNode.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ config

  var CFG = (typeof window !== "undefined" && window.SECRET_CLOUD_CONFIG) || null;
  if (!CFG || !CFG.supabaseUrl || !CFG.supabaseKey) {
    if (typeof console !== "undefined") console.warn("[review] SECRET_CLOUD_CONFIG missing; review layer not mounted.");
    return;
  }

  var BASE = String(CFG.supabaseUrl).replace(/\/+$/, "");
  var KEY = String(CFG.supabaseKey);
  var SITE_VERSION = String(CFG.siteVersion || "dev").slice(0, 40);
  var TABLES = Object.assign(
    { visits: "secret_cloud_visits", notes: "secret_cloud_notes", stances: "secret_cloud_stances" },
    CFG.tables || {}
  );

  var STORAGE_REVIEWER = "sc.reviewer";
  var STORAGE_VISIT = "sc.lastVisit";
  var PHONE_QUERY = "(max-width: 639.98px)";
  var REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
  var FETCH_TIMEOUT = 12000;
  var REFRESH_MS = 60000;
  var MAX_QUOTE = 1500;
  var QUOTE_DISPLAY = 240;
  var CONTEXT_CHARS = 32;

  // auto-update (see the "auto-update" section)
  var STORAGE_UPDATE_SCROLL = "sc.updateScroll";
  var STORAGE_UPDATE_GUARD = "sc.updateGuard";
  var UPDATE_GUARD_MS = 2 * 60 * 1000;
  var UPDATE_WATCH_MS = 1000;
  var UPDATE_SCROLL_TTL = 10 * 60 * 1000;
  var BUILD_RE = /^[0-9a-f]{6,64}$/;

  var TUTORIAL_COPY = {
    before: "The image that sells it: walking off the path into a little bit of forest ",
    highlight: "because you heard something",
    after: ", and someone else walking in too.",
    name: "Your name · just now",
    body: "This is the whole pitch in one sentence. Lead with it.",
  };

  // ------------------------------------------------------------------ state

  var state = {
    reviewer: null, // { first, last, clientId }
    notes: new Map(), // id -> note row
    stances: new Map(), // id -> stance row
    visits: [],
    anchors: new Map(), // note id -> { start, end } | { orphan: true }
    blocks: new Map(), // block id -> element
    sections: [], // [{ id, title, el }]
    filter: null, // reviewer_key or null
    openNote: null, // id of the note whose thread is open
    pendingAnchor: null, // anchor captured for the pill
    pillArmed: 0, // ms when the pill was pressed; the pending anchor is kept while the tap lands
    composer: null, // { kind, anchor, sectionId, sectionTitle }
    confirmingId: null, // id of the note whose inline remove confirm is open
    markSigs: new Map(), // block id -> signature of the marks rendered in it
    marksDirty: false, // a block was skipped (live selection or pending anchor) and needs a later pass
    loaded: false,
  };

  var ui = {}; // references to layer elements
  var insets = { top: 0, right: 0, bottom: 0, left: 0 };

  // ------------------------------------------------------------------ small helpers

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = String(v);
        else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = String(v[d]); });
        else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) appendChildren(node, arguments[i]);
    return node;
  }

  function appendChildren(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { appendChildren(node, x); }); return; }
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }

  function svgIcon(viewBox, paths, cls) {
    var NS = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("class", "sc-icon" + (cls ? " " + cls : ""));
    paths.forEach(function (d) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }

  var ICON_PEN = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
  var ICON_CLOSE = "M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z";
  var ICON_CURSOR = "M5 2.5l14.5 11.5-6.3 1 3.6 6.4-2.9 1.6-3.6-6.5L5.5 21z";
  var ICON_NOTES = "M4 4h16v12H7l-3 3V4zm3 3v2h10V7H7zm0 4v2h7v-2H7z";

  function isPhone() {
    try { return window.matchMedia(PHONE_QUERY).matches; } catch (_) { return false; }
  }
  function reducedMotion() {
    try { return window.matchMedia(REDUCED_QUERY).matches; } catch (_) { return false; }
  }

  function storageGet(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ }
  }
  function sessionGet(key) {
    try {
      var raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function sessionSet(key, value) {
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function sessionRemove(key) {
    try { window.sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
  }

  function randomHex16() {
    var out = "";
    try {
      var buf = new Uint8Array(8);
      window.crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) out += ("0" + buf[i].toString(16)).slice(-2);
      return out;
    } catch (_) {
      for (var j = 0; j < 16; j++) out += Math.floor(Math.random() * 16).toString(16);
      return out;
    }
  }

  function collapseWs(s) {
    s = String(s || "");
    try { s = s.normalize("NFC"); } catch (_) { /* leave as typed */ }
    return s.replace(/\s+/g, " ").trim();
  }
  function squashWs(s) { return String(s || "").replace(/\s+/g, " "); }
  function normQuote(s) { return squashWs(s).trim(); }
  function reviewerKeyOf(first, last) {
    return collapseWs(first).toLowerCase() + " " + collapseWs(last).toLowerCase();
  }
  function displayName(first, last) {
    var f = collapseWs(first);
    var l = collapseWs(last);
    var initial = l ? Array.from(l)[0] : "";
    return f + (initial ? " " + initial.toUpperCase() + "." : "");
  }
  function nameOfRow(row) { return displayName(row.reviewer_first, row.reviewer_last); }

  function isHighSurrogate(code) { return code >= 0xd800 && code <= 0xdbff; }
  function cutAt(s, n) {
    // s.slice(0, n) that never ends on the high half of a surrogate pair
    if (n > 0 && n < s.length && isHighSurrogate(s.charCodeAt(n - 1))) n--;
    return s.slice(0, n);
  }

  function truncate(s, n) {
    s = String(s || "");
    if (s.length <= n) return s;
    return cutAt(s, Math.max(0, n - 1)).replace(/\s+$/, "") + "…";
  }

  function relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var now = Date.now();
    var diff = Math.max(0, now - d.getTime());
    var sec = Math.round(diff / 1000);
    if (sec < 45) return "just now";
    var min = Math.round(sec / 60);
    if (min < 60) return min + " min ago";
    var hr = Math.round(min / 60);
    if (hr < 24 && new Date(now).getDate() === d.getDate()) return hr + " h ago";
    var y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()) return "yesterday";
    var opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = "numeric";
    try { return d.toLocaleDateString(undefined, opts); } catch (_) { return d.toDateString(); }
  }

  function refreshTimes(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".sc-time[data-sc-ts]"), function (el) {
      var t = relTime(el.dataset.scTs);
      if (el.textContent !== t) el.textContent = t;
    });
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function toInt(v) {
    var n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function sortByCreated(a, b) {
    var ta = new Date(a.created_at).getTime() || 0;
    var tb = new Date(b.created_at).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  }

  function isInUi(node) {
    if (!node) return false;
    var el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest && el.closest(".sc-ui, .sc-layer"));
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  function inSvg(node) {
    // Diagram labels are selectable, but an HTML <mark> inside SVG text hides the label, so they take no notes.
    if (!node) return false;
    var el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest && el.closest("svg"));
  }

  function isIOS() {
    try {
      var p = String(navigator.platform || "");
      return /iP(hone|ad|od)/.test(p) || (/Mac/.test(p) && navigator.maxTouchPoints > 1);
    } catch (_) { return false; }
  }

  function viewportBox() {
    // The visible part of the layout viewport, in layout (fixed-position) coordinates.
    // Pinch zoom and the iOS keyboard shrink or offset it; innerWidth/innerHeight do not follow.
    var vv = window.visualViewport;
    if (vv && vv.width && vv.height) return { left: vv.offsetLeft || 0, top: vv.offsetTop || 0, width: vv.width, height: vv.height };
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function keyboardInset() {
    // Height of the layout viewport hidden below the visual one: the on-screen keyboard on iOS, where
    // innerHeight stays put. Browsers that resize the layout viewport for the keyboard give 0.
    var vv = window.visualViewport;
    if (!vv || !vv.height) return 0;
    return Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
  }

  function hasDraft(pop) {
    var ta = pop ? pop.querySelector("textarea") : null;
    return !!(ta && ta.value.trim());
  }

  function focusables(root) {
    var list = root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    return Array.prototype.filter.call(list, function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  // ------------------------------------------------------------------ transport

  var writesInFlight = 0; // POST/PATCH requests not yet settled

  function api(table, query, opts) {
    opts = opts || {};
    var url = BASE + "/rest/v1/" + table + (query || "");
    var ctrl = null;
    var timer = null;
    try { ctrl = new AbortController(); } catch (_) { ctrl = null; }
    var headers = {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
    };
    var init = { method: opts.method || "GET", headers: headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (_) { /* ignore */ } }, FETCH_TIMEOUT);
    }
    // A write in flight holds back an automatic reload, so a vote or note is never cut off mid-request.
    var writing = init.method !== "GET";
    if (writing) writesInFlight++;
    return fetch(url, init)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }
          if (!res.ok) {
            var msg = (data && (data.message || data.hint || data.error)) || ("HTTP " + res.status);
            var err = new Error(String(msg));
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          var e = new Error("Request timed out");
          e.timeout = true;
          throw e;
        }
        throw err;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
        if (writing) writesInFlight = Math.max(0, writesInFlight - 1);
      });
  }

  function rowBelongsHere(row) {
    // Test rows (site_version "test") stay on the test page; the live site never shows them.
    var v = row && row.site_version;
    if (SITE_VERSION === "test") return v === "test";
    return v !== "test";
  }

  var PAGE_ROWS = 500;
  var PAGE_MAX = 40;
  function fetchAll(table, query) {
    // Page with limit/offset until a short page comes back, so PostgREST's max-rows cap never truncates silently.
    var out = [];
    function page(offset, n) {
      return api(table, query + "&limit=" + PAGE_ROWS + "&offset=" + offset).then(function (rows) {
        if (!Array.isArray(rows)) return out;
        out = out.concat(rows);
        if (rows.length < PAGE_ROWS || n >= PAGE_MAX) return out;
        return page(offset + rows.length, n + 1);
      });
    }
    return page(0, 1);
  }
  function fetchNotes() {
    return fetchAll(TABLES.notes, "?select=*&deleted_at=is.null&order=created_at.asc,id.asc").then(function (rows) {
      return rows.filter(rowBelongsHere);
    });
  }
  function fetchStances() {
    return fetchAll(TABLES.stances, "?select=*&order=created_at.desc,id.desc").then(function (rows) {
      return rows.filter(rowBelongsHere);
    });
  }
  function fetchVisits() {
    return api(TABLES.visits, "?select=reviewer_first,reviewer_last,reviewer_key,created_at,site_version&order=created_at.desc&limit=500").then(function (rows) {
      return Array.isArray(rows) ? rows.filter(rowBelongsHere) : [];
    });
  }

  function reviewerFields() {
    var r = state.reviewer;
    return {
      reviewer_first: r.first,
      reviewer_last: r.last,
      reviewer_key: reviewerKeyOf(r.first, r.last),
      client_id: r.clientId,
      site_version: SITE_VERSION,
    };
  }

  function currentKey() {
    return state.reviewer ? reviewerKeyOf(state.reviewer.first, state.reviewer.last) : null;
  }

  // ------------------------------------------------------------------ toasts

  function toast(message, opts) {
    opts = opts || {};
    if (!ui.toasts) return;
    var t = h("div", { class: "sc-toast" + (opts.kind ? " sc-toast--" + opts.kind : ""), role: "status" });
    t.appendChild(document.createTextNode(message));
    ui.toasts.appendChild(t);
    while (ui.toasts.children.length > 3) ui.toasts.removeChild(ui.toasts.firstChild);
    var ttl = opts.ttl || (opts.kind === "error" ? 6000 : 3200);
    setTimeout(function () {
      t.classList.add("sc-toast--out");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, reducedMotion() ? 0 : 260);
    }, ttl);
  }

  // ------------------------------------------------------------------ identity

  function loadReviewer() {
    var r = storageGet(STORAGE_REVIEWER);
    if (!r || typeof r !== "object") return null;
    var first = collapseWs(r.first).slice(0, 60);
    var last = collapseWs(r.last).slice(0, 60);
    if (!first || !last) return null;
    var clientId = typeof r.clientId === "string" && /^[0-9a-f]{16}$/.test(r.clientId) ? r.clientId : randomHex16();
    var out = { first: first, last: last, clientId: clientId };
    if (clientId !== r.clientId) storageSet(STORAGE_REVIEWER, out);
    return out;
  }

  function recordVisit(force) {
    if (!state.reviewer) return Promise.resolve();
    var key = currentKey();
    var last = storageGet(STORAGE_VISIT);
    var today = todayKey();
    if (!force && last && last.key === key && last.date === today) return Promise.resolve();
    var row = reviewerFields();
    return api(TABLES.visits, "", { method: "POST", body: row, prefer: "return=minimal" })
      .then(function () {
        storageSet(STORAGE_VISIT, { key: key, date: today });
        var local = Object.assign({ created_at: new Date().toISOString() }, row);
        state.visits.unshift(local);
        renderReviewers();
      })
      .catch(function () {
        toast("Couldn't record your visit. Your notes and votes will still save.", { kind: "error" });
      });
  }

  function renderChip() {
    var mount = document.getElementById("review-identity");
    if (!mount) return;
    mount.classList.add("sc-ui");
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    if (!state.reviewer) return;
    var name = displayName(state.reviewer.first, state.reviewer.last);
    var chip = h("button", {
      type: "button",
      class: "sc-chip",
      "aria-label": "Reviewing as " + name.replace(/\.$/, "") + ". Switch reviewer",
      title: "Switch reviewer",
      onclick: function () {
        storageRemove(STORAGE_REVIEWER);
        storageRemove(STORAGE_VISIT);
        state.reviewer = null;
        closeComposer();
        closeThread();
        closeDrawer();
        renderChip();
        openGate(1);
      },
    },
      h("span", { class: "sc-chip-label", text: "Reviewing as " }),
      h("strong", { class: "sc-chip-name", text: name }),
      h("span", { class: "sc-chip-switch", text: "switch" })
    );
    mount.appendChild(chip);
  }

  // ------------------------------------------------------------------ gate

  function openGate(step) {
    closeGate();
    var gate = h("div", { class: "sc-gate sc-ui", role: "dialog", "aria-modal": "true", "aria-labelledby": "sc-gate-title" });
    var card = h("div", { class: "sc-gate-card" });
    gate.appendChild(card);
    ui.gate = gate;
    ui.layer.appendChild(gate);
    document.documentElement.classList.add("sc-gate-open");
    setInertBehindGate(true);
    updateLock();
    renderGateStep(card, step || 1);

    gate.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    });
    // Tab is trapped on document (see bindEvents), so it also catches focus that fell to <body>.
    // Fallback for browsers without inert: pull focus back when it leaves the gate.
    gate.addEventListener("focusout", function (e) {
      if (!ui.gate) return;
      var to = e.relatedTarget;
      if (to && gate.contains(to)) return;
      if (!to && inertSupported()) return; // a backdrop click; the document Tab trap takes over
      setTimeout(function () {
        if (!ui.gate || gate.contains(document.activeElement)) return;
        var list = focusables(gate);
        if (list.length) list[0].focus();
      }, 0);
    });
  }

  function inertSupported() {
    try { return "inert" in HTMLElement.prototype; } catch (_) { return false; }
  }

  function setInertBehindGate(on) {
    // Everything except the gate (and the toasts, which are live regions) is inert while the gate is open.
    if (on) {
      var list = [];
      Array.prototype.forEach.call(document.body.children, function (el) { if (el !== ui.layer) list.push(el); });
      if (ui.layer) Array.prototype.forEach.call(ui.layer.children, function (el) { if (el !== ui.gate && el !== ui.toasts && el !== ui.probe) list.push(el); });
      list.forEach(function (el) {
        if (el.hasAttribute("inert")) return;
        el.setAttribute("inert", "");
        el.dataset.scInert = "1";
      });
      ui.inerted = list;
    } else {
      (ui.inerted || []).forEach(function (el) {
        if (!el.dataset.scInert) return;
        el.removeAttribute("inert");
        delete el.dataset.scInert;
      });
      ui.inerted = null;
    }
  }

  function renderGateStep(card, step) {
    while (card.firstChild) card.removeChild(card.firstChild);
    card.appendChild(h("div", { class: "sc-wordmark", text: "THE SECRET CLOUD" }));

    if (step === 1) {
      card.appendChild(h("h2", { id: "sc-gate-title", class: "sc-gate-title", text: "Before you read" }));
      card.appendChild(h("p", { class: "sc-gate-why", text: "Your name is stamped on every note and vote you leave, so it is clear whose it is when the build starts." }));

      var firstErr = h("span", { class: "sc-field-error", id: "sc-first-error", role: "alert" });
      var lastErr = h("span", { class: "sc-field-error", id: "sc-last-error", role: "alert" });
      var firstInput = h("input", { type: "text", id: "sc-first", name: "first", autocomplete: "given-name", maxlength: "60", required: true, "aria-describedby": "sc-first-error", autocapitalize: "words" });
      var lastInput = h("input", { type: "text", id: "sc-last", name: "last", autocomplete: "family-name", maxlength: "60", required: true, "aria-describedby": "sc-last-error", autocapitalize: "words" });
      var form = h("form", { class: "sc-gate-form", novalidate: true },
        h("div", { class: "sc-field" }, h("label", { for: "sc-first", text: "First name" }), firstInput, firstErr),
        h("div", { class: "sc-field" }, h("label", { for: "sc-last", text: "Last name" }), lastInput, lastErr),
        h("button", { type: "submit", class: "sc-btn sc-btn--primary", text: "Continue" })
      );

      function validate(input, errEl, label) {
        var v = collapseWs(input.value);
        var msg = "";
        if (!v) msg = "Please enter your " + label + ".";
        else if (v.length > 60) msg = "Keep your " + label + " under 60 characters.";
        errEl.textContent = msg;
        input.classList.toggle("sc-invalid", !!msg);
        input.setAttribute("aria-invalid", msg ? "true" : "false");
        return msg ? null : v;
      }
      firstInput.addEventListener("input", function () { if (firstErr.textContent) validate(firstInput, firstErr, "first name"); });
      lastInput.addEventListener("input", function () { if (lastErr.textContent) validate(lastInput, lastErr, "last name"); });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var first = validate(firstInput, firstErr, "first name");
        var last = validate(lastInput, lastErr, "last name");
        if (!first) { firstInput.focus(); return; }
        if (!last) { lastInput.focus(); return; }
        var existing = storageGet(STORAGE_REVIEWER);
        var clientId = existing && typeof existing.clientId === "string" && /^[0-9a-f]{16}$/.test(existing.clientId) ? existing.clientId : randomHex16();
        state.reviewer = { first: first, last: last, clientId: clientId };
        if (!storageSet(STORAGE_REVIEWER, state.reviewer)) {
          toast("Your browser is blocking storage, so you'll be asked your name again next time.", { kind: "error" });
        }
        recordVisit(true);
        renderChip();
        renderAll();
        renderGateStep(card, 2);
      });
      card.appendChild(form);
      setTimeout(function () { firstInput.focus(); }, 0);
    } else {
      card.appendChild(h("h2", { id: "sc-gate-title", class: "sc-gate-title", text: "Here's how to leave your marks" }));
      card.appendChild(buildTutorial());
      var done = h("button", { type: "button", class: "sc-btn sc-btn--primary", text: "Got it, let me read", onclick: function () { closeGate(); } });
      card.appendChild(h("div", { class: "sc-gate-actions" }, done));
      setTimeout(function () { done.focus(); }, 0);
    }
  }

  function closeGate() {
    if (ui.gate && ui.gate.parentNode) ui.gate.parentNode.removeChild(ui.gate);
    ui.gate = null;
    setInertBehindGate(false);
    document.documentElement.classList.remove("sc-gate-open");
    updateLock();
  }

  // ------------------------------------------------------------------ scroll lock

  // The page behind a modal (gate, drawer, phone sheet) must not scroll. overflow: hidden on <html> covers
  // desktop browsers; iOS Safari ignores it, so there the body is fixed at the saved scroll position.
  var lock = { on: false, fixed: false, y: 0 };
  function updateLock() {
    var need = !!ui.gate || !!ui.drawerOpen || (isPhone() && (!!ui.composer || !!ui.thread));
    if (need === lock.on) return;
    var root = document.documentElement;
    if (need) {
      lock.on = true;
      lock.y = window.scrollY || window.pageYOffset || 0;
      root.classList.add("sc-lock");
      if (isIOS()) {
        lock.fixed = true;
        document.body.style.top = -lock.y + "px";
        root.classList.add("sc-lock--fixed");
      }
      return;
    }
    lock.on = false;
    root.classList.remove("sc-lock");
    if (!lock.fixed) return;
    lock.fixed = false;
    root.classList.remove("sc-lock--fixed");
    document.body.style.top = "";
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto"; // the page sets smooth scrolling; restoring must not animate
    try { window.scrollTo(0, lock.y); } catch (_) { /* ignore */ }
    root.style.scrollBehavior = prev;
  }

  // ------------------------------------------------------------------ tutorial

  function buildTutorial() {
    var hl = h("span", { class: "sc-tut-hl" },
      TUTORIAL_COPY.highlight,
      h("span", { class: "sc-tut-cursor" }, svgIcon("0 0 24 24", [ICON_CURSOR])),
      h("span", { class: "sc-tut-pill" }, svgIcon("0 0 24 24", [ICON_PEN]), "Leave a note")
    );
    var stage = h("div", { class: "sc-tut-stage", "aria-hidden": "true" },
      h("p", { class: "sc-tut-para" }, TUTORIAL_COPY.before, hl, TUTORIAL_COPY.after),
      h("div", { class: "sc-tut-card" },
        h("span", { class: "sc-tut-card-name", text: TUTORIAL_COPY.name }),
        h("span", { class: "sc-tut-card-body", text: TUTORIAL_COPY.body })
      )
    );
    var steps = h("ol", { class: "sc-tut-steps" },
      h("li", {}, h("span", { class: "sc-tut-num", text: "1" }), h("span", { text: "Highlight any words" })),
      h("li", {}, h("span", { class: "sc-tut-num", text: "2" }), h("span", { text: "Tap Leave a note" })),
      h("li", {}, h("span", { class: "sc-tut-num", text: "3" }), h("span", { text: "Write and save. Your name is stamped on it." }))
    );
    return h("div", { class: "sc-tut sc-ui" },
      h("div", { class: "sc-tut-grid" }, stage, steps),
      h("p", { class: "sc-tut-line", text: "Vote on each idea with Yes / Maybe / Cut it, and open Notes at the bottom right to see everyone's." })
    );
  }

  function renderTutorialMount() {
    var mount = document.getElementById("review-tutorial");
    if (!mount || mount.dataset.scMounted) return;
    mount.dataset.scMounted = "1";
    mount.classList.add("sc-ui");
    mount.appendChild(buildTutorial());
  }

  // ------------------------------------------------------------------ page map

  function indexPage() {
    state.blocks = new Map();
    Array.prototype.forEach.call(document.querySelectorAll("[data-block]"), function (el) {
      var id = el.getAttribute("data-block");
      if (id && !state.blocks.has(id)) state.blocks.set(id, el);
    });
    state.sections = Array.prototype.map.call(document.querySelectorAll("section[id]"), function (s) {
      var title = s.getAttribute("data-section-title");
      if (!title) {
        var head = s.querySelector("h1, h2, h3");
        title = head ? collapseWs(head.textContent) : s.id;
      }
      return { id: s.id, title: title, el: s };
    });
  }

  function sectionOf(el) {
    var s = el && el.closest ? el.closest("section[id]") : null;
    return s ? s.id : null;
  }

  function sectionTitle(id) {
    for (var i = 0; i < state.sections.length; i++) if (state.sections[i].id === id) return state.sections[i].title;
    return id || "";
  }

  // ------------------------------------------------------------------ anchors

  function blockOf(node) {
    if (!node) return null;
    var el = node.nodeType === 1 ? node : node.parentElement;
    return el && el.closest ? el.closest("[data-block]") : null;
  }

  function textOffsetIn(block, container, offset) {
    // Character offset of a DOM point in the block's counted text (see textNodesOf).
    try {
      var entries = textNodesOf(block);
      var i;
      if (container.nodeType === 3) {
        for (i = 0; i < entries.length; i++) {
          if (entries[i].node === container) return entries[i].pos + Math.min(offset, entries[i].len);
        }
      }
      var point = document.createRange();
      point.setStart(container, offset);
      point.setEnd(container, offset);
      var pos = 0;
      for (i = 0; i < entries.length; i++) {
        if (point.comparePoint(entries[i].node, 0) >= 0) break;
        pos += entries[i].len;
      }
      return pos;
    } catch (_) { return null; }
  }

  function captureAnchor(range, block) {
    var text = blockText(block);
    var start = textOffsetIn(block, range.startContainer, range.startOffset);
    var end = textOffsetIn(block, range.endContainer, range.endOffset);
    if (start === null || end === null) return null;
    if (end < start) { var t = start; start = end; end = t; }
    end = Math.min(end, text.length);
    // trim whitespace at both ends
    while (start < end && /\s/.test(text.charAt(start))) start++;
    while (end > start && /\s/.test(text.charAt(end - 1))) end--;
    if (end <= start) return null;
    if (end - start > MAX_QUOTE) {
      end = start + MAX_QUOTE;
      if (isHighSurrogate(text.charCodeAt(end - 1))) end--;
    }
    var blockId = block.getAttribute("data-block");
    return {
      block_id: blockId,
      section_id: sectionOf(block),
      start_offset: start,
      end_offset: end,
      // Whitespace runs between elements collapse to one space; resolveAnchor compares the same way.
      quote: squashWs(text.slice(start, end)),
      prefix: squashWs(text.slice(Math.max(0, start - CONTEXT_CHARS), start)),
      suffix: squashWs(text.slice(end, end + CONTEXT_CHARS)),
    };
  }

  function normalizeWithMap(raw) {
    // Collapse whitespace runs to one space; map[i] is the raw index of normalised character i.
    var chars = [];
    var map = [];
    var inSpace = false;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (/\s/.test(ch)) {
        if (inSpace) continue;
        inSpace = true;
        chars.push(" ");
      } else {
        inSpace = false;
        chars.push(ch);
      }
      map.push(i);
    }
    return { text: chars.join(""), map: map };
  }

  function resolveAnchor(note) {
    try {
      var block = state.blocks.get(String(note.block_id));
      var quote = normQuote(typeof note.quote === "string" ? note.quote : "");
      if (!block || !quote) return { orphan: true };
      var raw = blockText(block);
      var s = toInt(note.start_offset);
      var e = toInt(note.end_offset);
      if (s !== null && e !== null && e > s && e <= raw.length && normQuote(raw.slice(s, e)) === quote) return { start: s, end: e };
      var norm = normalizeWithMap(raw);
      var candidates = [];
      var idx = norm.text.indexOf(quote);
      while (idx >= 0 && candidates.length < 200) {
        candidates.push(idx);
        idx = norm.text.indexOf(quote, idx + 1);
      }
      if (!candidates.length) return { orphan: true };
      var toRaw = function (c) { return { start: norm.map[c], end: norm.map[c + quote.length - 1] + 1 }; };
      if (candidates.length === 1) return toRaw(candidates[0]);
      var prefix = squashWs(typeof note.prefix === "string" ? note.prefix : "");
      var suffix = squashWs(typeof note.suffix === "string" ? note.suffix : "");
      var best = candidates[0];
      var bestScore = -Infinity;
      candidates.forEach(function (c) {
        var score = 0;
        var before = norm.text.slice(Math.max(0, c - prefix.length), c);
        var after = norm.text.slice(c + quote.length, c + quote.length + suffix.length);
        var i = 0;
        while (i < prefix.length && i < before.length && prefix.charAt(prefix.length - 1 - i) === before.charAt(before.length - 1 - i)) i++;
        score += i;
        var j = 0;
        while (j < suffix.length && j < after.length && suffix.charAt(j) === after.charAt(j)) j++;
        score += j;
        if (s !== null) score -= Math.min(5, Math.abs(toRaw(c).start - s) / 1000);
        if (score > bestScore) { bestScore = score; best = c; }
      });
      return toRaw(best);
    } catch (_) {
      return { orphan: true };
    }
  }

  // ------------------------------------------------------------------ marks

  function skipsText(el) {
    // Visually hidden helpers and the layer's own widgets do not count as reviewable text.
    return !!(el.classList && (el.classList.contains("vh") || el.classList.contains("sc-ui")));
  }
  var TEXT_FILTER = {
    acceptNode: function (n) {
      // SVG subtrees are rejected too: an HTML <mark> inside SVG text would hide the diagram label.
      if (n.nodeType === 1) return skipsText(n) || n.namespaceURI === SVG_NS ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  };

  function textNodesOf(block) {
    var out = [];
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, TEXT_FILTER);
    var pos = 0;
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType !== 3) continue;
      var len = n.nodeValue.length;
      out.push({ node: n, pos: pos, len: len });
      pos += len;
    }
    return out;
  }

  function blockText(block) {
    return textNodesOf(block).map(function (e) { return e.node.nodeValue; }).join("");
  }

  function wrapRange(block, start, end, makeMark) {
    var nodes = textNodesOf(block);
    nodes.forEach(function (entry) {
      var nStart = entry.pos;
      var nEnd = entry.pos + entry.len;
      if (nEnd <= start || nStart >= end || entry.len === 0) return;
      var s = Math.max(start - nStart, 0);
      var e = Math.min(end - nStart, entry.len);
      if (e <= s) return;
      var target = entry.node;
      if (s > 0) target = target.splitText(s);
      if (e - s < target.nodeValue.length) target.splitText(e - s);
      var mark = makeMark();
      var parent = target.parentNode;
      if (!parent) return;
      parent.insertBefore(mark, target);
      mark.appendChild(target);
    });
  }

  function unwrap(el) {
    var p = el.parentNode;
    if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }

  function clearMarks(selector) {
    var marks = document.querySelectorAll(selector || "mark.sc-mark");
    var touched = new Set();
    Array.prototype.forEach.call(marks, function (m) {
      var b = blockOf(m);
      if (b) touched.add(b);
      unwrap(m);
    });
    touched.forEach(function (b) { try { b.normalize(); } catch (_) { /* ignore */ } });
  }

  function clearMarksIn(block) {
    Array.prototype.forEach.call(block.querySelectorAll("mark.sc-mark[data-note]"), function (m) { unwrap(m); });
    try { block.normalize(); } catch (_) { /* ignore */ }
  }

  function visibleRootNotes() {
    var out = [];
    state.notes.forEach(function (n) {
      if (n.deleted_at) return;
      if (n.kind === "reply") return;
      out.push(n);
    });
    out.sort(sortByCreated);
    return out;
  }

  function repliesOf(id) {
    var out = [];
    state.notes.forEach(function (n) {
      if (n.kind === "reply" && String(n.parent_id) === String(id) && !n.deleted_at) out.push(n);
    });
    out.sort(sortByCreated);
    return out;
  }

  function outerFirst(anchors) {
    // Earlier start first, then the longer span, orphans last; consistent so nesting order is stable.
    return function (a, b) {
      var aa = anchors.get(String(a.id)) || { orphan: true };
      var ab = anchors.get(String(b.id)) || { orphan: true };
      var sa = aa.orphan ? Infinity : aa.start;
      var sb = ab.orphan ? Infinity : ab.start;
      if (sa !== sb) return sa < sb ? -1 : 1;
      if (!aa.orphan && !ab.orphan) {
        var la = aa.end - aa.start;
        var lb = ab.end - ab.start;
        if (la !== lb) return lb - la;
      }
      return sortByCreated(a, b);
    };
  }

  function holdsSelection(block) {
    try {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
      var r = sel.getRangeAt(0);
      return block.contains(r.startContainer) || block.contains(r.endContainer);
    } catch (_) { return false; }
  }

  function holdsPending(blockId) {
    var c = state.composer;
    return !!(c && c.kind === "highlight" && c.anchor && String(c.anchor.block_id) === blockId);
  }

  function renderMarks(gentle) {
    // Rebuild only the blocks whose mark set changed. A block that holds the pending anchor is left alone,
    // and so is one that holds the live selection when the render comes from a background refresh (gentle).
    var highlights = visibleRootNotes().filter(function (n) { return n.kind === "highlight"; });
    var anchors = new Map();
    var perBlock = new Map();
    highlights.forEach(function (n) {
      var a = resolveAnchor(n);
      anchors.set(String(n.id), a);
      if (a.orphan) return;
      var bid = String(n.block_id);
      if (!perBlock.has(bid)) perBlock.set(bid, []);
      perBlock.get(bid).push(n);
    });
    state.anchors = anchors;
    var active = document.activeElement;
    var focusedNote = active && active.matches && active.matches("mark.sc-mark[data-note]") ? active.dataset.note : null;
    var sigs = new Map();
    var dirty = false;
    var ids = new Set();
    perBlock.forEach(function (_l, bid) { ids.add(bid); });
    state.markSigs.forEach(function (_s, bid) { ids.add(bid); });
    ids.forEach(function (bid) {
      var block = state.blocks.get(bid);
      if (!block) return;
      var list = (perBlock.get(bid) || []).slice().sort(outerFirst(anchors));
      var sig = list.map(function (n) { var a = anchors.get(String(n.id)); return String(n.id) + ":" + a.start + "-" + a.end; }).join(",");
      var prev = state.markSigs.get(bid) || "";
      if (prev === sig) { if (sig) sigs.set(bid, sig); return; }
      if (holdsPending(bid) || (gentle && holdsSelection(block))) {
        dirty = true;
        if (prev) sigs.set(bid, prev);
        return;
      }
      clearMarksIn(block);
      list.forEach(function (n) {
        var a = anchors.get(String(n.id));
        var label = "Note by " + nameOfRow(n);
        try {
          wrapRange(block, a.start, a.end, function () {
            return h("mark", {
              class: "sc-mark" + (String(state.openNote) === String(n.id) ? " sc-mark--hot" : ""),
              dataset: { note: String(n.id) },
              tabindex: "0",
              role: "button",
              "aria-label": label,
            });
          });
        } catch (_) {
          anchors.set(String(n.id), { orphan: true });
        }
      });
      if (sig) sigs.set(bid, sig);
    });
    state.markSigs = sigs;
    state.marksDirty = dirty;
    if (focusedNote && document.activeElement !== active) {
      var again = marksFor(focusedNote)[0];
      if (again) { try { again.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
    }
  }

  function renderPendingMark(anchor) {
    clearMarks("mark.sc-mark--pending");
    var block = state.blocks.get(String(anchor.block_id));
    if (!block) return;
    try {
      wrapRange(block, anchor.start_offset, anchor.end_offset, function () {
        return h("mark", { class: "sc-mark sc-mark--pending", "aria-hidden": "true" });
      });
    } catch (_) { /* ignore */ }
  }

  function marksFor(noteId) {
    return Array.prototype.filter.call(document.querySelectorAll("mark.sc-mark[data-note]"), function (m) {
      return m.dataset.note === String(noteId);
    });
  }

  function setHot(noteId, on) {
    marksFor(noteId).forEach(function (m) { m.classList.toggle("sc-mark--hot", !!on); });
  }

  function flash(el, noteId) {
    var targets = noteId ? marksFor(noteId) : (el ? [el] : []);
    targets.forEach(function (t) { t.classList.add("sc-mark--hot", "sc-flash"); });
    setTimeout(function () {
      targets.forEach(function (t) {
        if (String(state.openNote) !== String(noteId)) t.classList.remove("sc-mark--hot");
        t.classList.remove("sc-flash");
      });
    }, 1500);
  }

  // ------------------------------------------------------------------ selection and pill

  var selTimer = 0;

  function scheduleSelectionCheck(delay) {
    clearTimeout(selTimer);
    selTimer = setTimeout(checkSelection, delay);
  }

  function hidePill() {
    if (ui.pill) ui.pill.hidden = true;
    state.pendingAnchor = null;
  }
  function hideHint() {
    if (ui.hint) ui.hint.hidden = true;
  }

  function pillArmed() {
    return !!(state.pillArmed && Date.now() - state.pillArmed < 500 && state.pendingAnchor);
  }

  function checkSelection() {
    if (!state.reviewer || ui.gate) { hidePill(); return; }
    if (state.composer) return;
    if (pillArmed()) {
      // A touch on the pill clears the selection before its click lands; keep the anchor and the pill
      // until the tap resolves, then check again in case it never does.
      scheduleSelectionCheck(520);
      return;
    }
    hideHint();
    var sel = null;
    try { sel = window.getSelection(); } catch (_) { sel = null; }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hidePill();
      if (state.marksDirty) renderMarks(true);
      return;
    }
    var range = sel.getRangeAt(0);
    if (isInUi(range.startContainer) || isInUi(range.endContainer)) { hidePill(); return; }
    if (!range.toString().trim()) { hidePill(); return; }

    var startBlock = blockOf(range.startContainer);
    var endBlock = blockOf(range.endContainer);

    if (startBlock && endBlock !== startBlock) {
      // Tighten a selection that merely ends at the start of the next thing (triple-click, drag past the end).
      // Chrome ends such a range at offset 0 of the next block; Firefox ends it on the parent element after
      // the block, so the test is whether the tightened range still reads the same.
      var tight = range.cloneRange();
      var endsAtStart = tight.endOffset === 0 || (tight.endContainer.nodeType === 3 && !tight.endContainer.nodeValue.slice(0, tight.endOffset).trim() && !endBlock);
      try {
        tight.setEnd(startBlock, startBlock.childNodes.length);
        if (blockOf(tight.endContainer) === startBlock && (endsAtStart || tight.toString().trim() === range.toString().trim())) {
          range = tight; endBlock = startBlock;
        }
      } catch (_) { /* ignore */ }
    }

    if (!startBlock && !endBlock) { hidePill(); return; }
    if (inSvg(range.startContainer) || inSvg(range.endContainer)) {
      hidePill();
      showHint(range);
      return;
    }
    if (startBlock !== endBlock) {
      hidePill();
      showHint(range);
      return;
    }

    var anchor = captureAnchor(range, startBlock);
    if (!anchor) { hidePill(); return; }
    state.pendingAnchor = anchor;
    showPill(range);
  }

  function placeFloating(el, rect, gap) {
    // Position a fixed element above (or below) a viewport rect, clamped to the visible viewport and the safe area.
    var box = viewportBox();
    var pw = el.offsetWidth;
    var ph = el.offsetHeight;
    var x = rect.left + rect.width / 2 - pw / 2;
    var minX = box.left + insets.left + 8;
    var maxX = box.left + box.width - insets.right - pw - 8;
    x = Math.max(minX, Math.min(x, maxX));
    var minY = box.top + insets.top + 8;
    var maxY = box.top + box.height - insets.bottom - 8;
    var y = rect.top - ph - gap;
    if (y < minY) y = rect.bottom + gap;
    if (y + ph > maxY) y = Math.max(minY, maxY - ph);
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
  }

  function showPill(range) {
    var pill = ui.pill;
    if (!pill) return;
    pill.hidden = false;
    pill.classList.toggle("sc-pill--bar", isPhone());
    if (isPhone()) {
      pill.style.left = "";
      pill.style.top = "";
      return;
    }
    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hidePill(); return; }
    placeFloating(pill, rect, 10);
  }

  function showHint(range) {
    var hint = ui.hint;
    if (!hint) return;
    hint.hidden = false;
    hint.classList.toggle("sc-pill--bar", isPhone());
    if (isPhone()) { hint.style.left = ""; hint.style.top = ""; return; }
    var rect = range.getBoundingClientRect();
    placeFloating(hint, rect, 10);
  }

  function repositionPill() {
    if (!ui.pill || ui.pill.hidden || isPhone()) return;
    var sel = null;
    try { sel = window.getSelection(); } catch (_) { return; }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hidePill(); return; }
    placeFloating(ui.pill, sel.getRangeAt(0).getBoundingClientRect(), 10);
  }

  // ------------------------------------------------------------------ popover positioning

  function docOffset() {
    var body = document.body;
    var positioned = false;
    try { positioned = getComputedStyle(body).position !== "static"; } catch (_) { positioned = false; }
    if (positioned) {
      var br = body.getBoundingClientRect();
      return { x: -br.left, y: -br.top };
    }
    return { x: window.scrollX || window.pageXOffset || 0, y: window.scrollY || window.pageYOffset || 0 };
  }

  function placePopover(pop, rect) {
    pop.classList.toggle("sc-pop--sheet", isPhone());
    fitSheets();
    if (isPhone() || !rect) {
      pop.style.left = "";
      pop.style.top = "";
      return;
    }
    var box = viewportBox();
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var x = rect.left + rect.width / 2 - pw / 2;
    x = Math.max(box.left + insets.left + 8, Math.min(x, box.left + box.width - insets.right - pw - 8));
    var minY = box.top + insets.top + 8;
    var maxY = box.top + box.height - insets.bottom - 8;
    var y;
    var below = rect.bottom + 10;
    var above = rect.top - ph - 10;
    if (below + ph <= maxY) y = below;
    else if (above >= minY) y = above;
    else y = Math.max(minY, Math.min(below, maxY - ph));
    var off = docOffset();
    pop.style.left = Math.round(x + off.x) + "px";
    pop.style.top = Math.round(y + off.y) + "px";
  }

  function fitSheets() {
    // Phone sheets sit on the visual viewport, so the action row stays above the iOS keyboard.
    var kb = isPhone() ? keyboardInset() : 0;
    [ui.composer, ui.thread].forEach(function (pop) {
      if (!pop) return;
      if (kb > 0 && pop.classList.contains("sc-pop--sheet")) {
        pop.style.bottom = kb + "px";
        pop.style.maxHeight = Math.round(viewportBox().height * 0.85) + "px";
      } else {
        pop.style.bottom = "";
        pop.style.maxHeight = "";
      }
    });
    if (ui.gate) ui.gate.style.paddingBottom = kb > 0 ? kb + "px" : "";
  }

  function rectOfSelectionOrAnchor(anchor) {
    try {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width || r.height) return r;
      }
    } catch (_) { /* ignore */ }
    var pending = document.querySelector("mark.sc-mark--pending");
    if (pending) return pending.getBoundingClientRect();
    if (anchor && state.blocks.get(String(anchor.block_id))) return state.blocks.get(String(anchor.block_id)).getBoundingClientRect();
    return null;
  }

  // ------------------------------------------------------------------ composer

  function openComposer(opts) {
    closeThread();
    closeComposer();
    hidePill();
    hideHint();
    if (!state.reviewer) { openGate(1); return; }
    state.composer = { kind: opts.kind, anchor: opts.anchor || null, sectionId: opts.sectionId || null, sectionTitle: opts.sectionTitle || "", anchorEl: opts.anchorEl || null, returnFocus: document.activeElement };

    var pop = h("div", { class: "sc-pop sc-composer sc-ui", role: "dialog", "aria-label": opts.kind === "section" ? "Note on this section" : "Leave a note" });
    var head = h("div", { class: "sc-pop-head" });
    if (opts.kind === "highlight" && opts.anchor) {
      head.appendChild(h("blockquote", { class: "sc-quote", text: truncate(opts.anchor.quote, QUOTE_DISPLAY) }));
    } else if (opts.kind === "section") {
      head.appendChild(h("div", { class: "sc-pop-eyebrow", text: "Note on section" }));
      head.appendChild(h("div", { class: "sc-pop-title", text: opts.sectionTitle || opts.sectionId || "" }));
    }
    var ta = h("textarea", { class: "sc-textarea", rows: "4", maxlength: "4000", placeholder: "What do you think about this part?", "aria-label": "Your note" });
    var err = h("div", { class: "sc-field-error", role: "alert" });
    var save = h("button", { type: "button", class: "sc-btn sc-btn--primary", text: "Save note" });
    var cancel = h("button", { type: "button", class: "sc-btn sc-btn--ghost", text: "Cancel", onclick: function () { closeComposer(); } });
    var closeX = h("button", { type: "button", class: "sc-x", "aria-label": "Cancel", onclick: function () { closeComposer(); } }, svgIcon("0 0 24 24", [ICON_CLOSE]));
    pop.appendChild(closeX);
    pop.appendChild(head);
    pop.appendChild(ta);
    pop.appendChild(err);
    pop.appendChild(h("div", { class: "sc-pop-actions" }, cancel, save));

    var saving = false;
    function doSave() {
      if (saving || save.disabled) return;
      var body = ta.value.trim();
      if (!body) { err.textContent = "Write something first."; ta.focus(); return; }
      if (body.length > 4000) { err.textContent = "Keep it under 4000 characters."; return; }
      err.textContent = "";
      saving = true;
      save.disabled = true;
      save.textContent = "Saving…";
      var row = Object.assign({ kind: opts.kind, body: body }, reviewerFields());
      if (opts.kind === "highlight" && opts.anchor) {
        Object.assign(row, {
          section_id: opts.anchor.section_id,
          block_id: opts.anchor.block_id,
          start_offset: opts.anchor.start_offset,
          end_offset: opts.anchor.end_offset,
          quote: opts.anchor.quote,
          prefix: opts.anchor.prefix,
          suffix: opts.anchor.suffix,
        });
      } else if (opts.kind === "section") {
        row.section_id = opts.sectionId;
      }
      api(TABLES.notes, "", { method: "POST", body: row, prefer: "return=representation" })
        .then(function (rows) {
          var saved = Array.isArray(rows) ? rows[0] : rows;
          if (!saved || saved.id === undefined) throw new Error("No row returned");
          state.notes.set(String(saved.id), saved);
          noteWritten(saved.id);
          closeComposer();
          renderAll();
          toast("Note saved");
          if (saved.kind === "highlight") flash(null, saved.id);
        })
        .catch(function () {
          saving = false;
          save.disabled = false;
          save.textContent = "Save note";
          toast("Couldn't save your note. Check your connection and try again.", { kind: "error" });
        });
    }
    save.addEventListener("click", doSave);
    ta.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!e.repeat) doSave(); }
    });

    ui.composer = pop;
    ui.layer.appendChild(pop);
    showScrim();
    if (opts.kind === "highlight" && opts.anchor) renderPendingMark(opts.anchor);
    var rect = opts.kind === "highlight" ? rectOfSelectionOrAnchor(opts.anchor) : (opts.anchorEl ? opts.anchorEl.getBoundingClientRect() : null);
    placePopover(pop, rect);
    setTimeout(function () { ta.focus(); }, 0);
  }

  function closeComposer() {
    if (!ui.composer) { state.composer = null; return; }
    var ret = state.composer && state.composer.returnFocus;
    if (ui.composer.parentNode) ui.composer.parentNode.removeChild(ui.composer);
    ui.composer = null;
    state.composer = null;
    clearMarks("mark.sc-mark--pending");
    showScrim();
    if (state.marksDirty) renderMarks(true);
    try { if (ret && document.contains(ret) && !isInUi(ret)) ret.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }

  // ------------------------------------------------------------------ thread popover

  function openThread(noteId, anchorEl, others) {
    var note = state.notes.get(String(noteId));
    if (!note) return;
    closeComposer();
    closeThread();
    hidePill();
    state.openNote = String(noteId);
    setHot(noteId, true);
    var pop = h("div", { class: "sc-pop sc-thread sc-ui", role: "dialog", "aria-label": "Note by " + nameOfRow(note), tabindex: "-1" });
    ui.thread = pop;
    ui.threadAnchor = anchorEl || null;
    ui.threadOthers = others || [];
    ui.threadReturn = document.activeElement;
    ui.layer.appendChild(pop);
    renderThread(true);
    showScrim();
    placePopover(pop, anchorEl ? anchorEl.getBoundingClientRect() : null);
    setTimeout(function () { try { pop.focus({ preventScroll: true }); } catch (_) { pop.focus(); } }, 0);
  }

  function renderThread(full) {
    var pop = ui.thread;
    if (!pop) return;
    var note = state.notes.get(String(state.openNote));
    if (!note) { closeThread(); return; }
    if (!full && pop.firstChild) { patchThread(pop, note); return; }
    buildThread(pop, note);
  }

  function buildThread(pop, note) {
    var draft = pop.querySelector("textarea.sc-textarea");
    var draftText = draft ? draft.value : "";
    var active = document.activeElement;
    var hadFocus = pop.contains(active);
    var draftFocused = !!draft && active === draft;
    var selStart = draftFocused ? draft.selectionStart : 0;
    var selEnd = draftFocused ? draft.selectionEnd : 0;
    while (pop.firstChild) pop.removeChild(pop.firstChild);

    pop.appendChild(h("button", { type: "button", class: "sc-x", "aria-label": "Close", onclick: function () { closeThread(); } }, svgIcon("0 0 24 24", [ICON_CLOSE])));

    if (note.kind === "highlight" && note.quote) {
      pop.appendChild(h("blockquote", { class: "sc-quote sc-quote--short", text: truncate(note.quote, 120) }));
    } else if (note.kind === "section") {
      pop.appendChild(h("div", { class: "sc-pop-eyebrow", text: "Section note · " + sectionTitle(note.section_id) }));
    } else if (note.kind === "general") {
      pop.appendChild(h("div", { class: "sc-pop-eyebrow", text: "General note" }));
    }

    pop.appendChild(renderNoteBody(note, true));

    var others = liveOthers();
    if (others.length) pop.appendChild(buildOthersLine(others));

    var replies = repliesOf(note.id);
    if (replies.length) {
      var list = h("div", { class: "sc-replies" });
      replies.forEach(function (r) { list.appendChild(renderNoteBody(r, false)); });
      pop.appendChild(list);
    }

    var ta = h("textarea", { class: "sc-textarea sc-textarea--reply", rows: "2", maxlength: "4000", placeholder: "Reply…", "aria-label": "Your reply" });
    ta.value = draftText;
    var err = h("div", { class: "sc-field-error", role: "alert" });
    var btn = h("button", { type: "button", class: "sc-btn sc-btn--primary sc-btn--small", text: "Reply" });
    var replying = false;
    function doReply() {
      if (replying || btn.disabled) return;
      var body = ta.value.trim();
      if (!body) { err.textContent = "Write something first."; ta.focus(); return; }
      err.textContent = "";
      replying = true;
      btn.disabled = true;
      var row = Object.assign({
        kind: "reply",
        parent_id: note.id,
        section_id: note.section_id || null,
        block_id: note.block_id || null,
        body: body,
      }, reviewerFields());
      api(TABLES.notes, "", { method: "POST", body: row, prefer: "return=representation" })
        .then(function (rows) {
          var saved = Array.isArray(rows) ? rows[0] : rows;
          if (!saved || saved.id === undefined) throw new Error("No row returned");
          state.notes.set(String(saved.id), saved);
          noteWritten(saved.id);
          ta.value = "";
          renderThread(true);
          renderDrawer();
          renderGeneral();
          toast("Reply posted");
        })
        .catch(function () {
          replying = false;
          btn.disabled = false;
          toast("Couldn't post your reply. Check your connection and try again.", { kind: "error" });
        });
    }
    btn.addEventListener("click", doReply);
    ta.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!e.repeat) doReply(); }
    });
    pop.appendChild(h("div", { class: "sc-reply-box" }, ta, err, h("div", { class: "sc-pop-actions" }, btn)));

    if (draftFocused) {
      try { ta.focus({ preventScroll: true }); ta.setSelectionRange(selStart, selEnd); } catch (_) { /* ignore */ }
    } else if (hadFocus) {
      try { pop.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
  }

  function liveOthers() {
    return (ui.threadOthers || []).filter(function (id) { return state.notes.has(String(id)); });
  }

  function buildOthersLine(others) {
    var line = h("div", { class: "sc-others", dataset: { scOthers: others.map(String).join(",") } });
    line.appendChild(document.createTextNode(others.length + " other note" + (others.length === 1 ? "" : "s") + " here: "));
    others.forEach(function (id, i) {
      var o = state.notes.get(String(id));
      var link = h("button", { type: "button", class: "sc-link", text: nameOfRow(o), onclick: function () {
        var remaining = ui.threadOthers.filter(function (x) { return String(x) !== String(id); }).concat([state.openNote]);
        var m = marksFor(id)[0] || ui.threadAnchor;
        openThread(id, m, remaining);
      } });
      line.appendChild(link);
      if (i < others.length - 1) line.appendChild(document.createTextNode(", "));
    });
    return line;
  }

  function patchThread(pop, note) {
    // A background refresh never rebuilds an open thread: the reply draft, its focus and any open confirm stay put.
    var active = document.activeElement;
    var hadFocus = pop.contains(active);
    var box = pop.querySelector(".sc-reply-box");
    var line = pop.querySelector(".sc-others");
    var others = liveOthers();
    var sig = others.map(String).join(",");
    if ((line ? line.dataset.scOthers : "") !== sig) {
      var fresh = others.length ? buildOthersLine(others) : null;
      if (line && fresh) pop.replaceChild(fresh, line);
      else if (line) pop.removeChild(line);
      else if (fresh) pop.insertBefore(fresh, pop.querySelector(".sc-replies") || box);
    }
    patchReplies(pop, note, box);
    refreshTimes(pop);
    if (hadFocus && !pop.contains(document.activeElement)) {
      try { pop.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
  }

  function patchReplies(pop, note, box) {
    var replies = repliesOf(note.id);
    var list = pop.querySelector(".sc-replies");
    if (!replies.length) {
      if (list) pop.removeChild(list);
      return;
    }
    if (!list) {
      list = h("div", { class: "sc-replies" });
      pop.insertBefore(list, box);
    }
    var existing = new Map();
    Array.prototype.forEach.call(list.children, function (el) { existing.set(el.dataset.note, el); });
    var wanted = new Set(replies.map(function (r) { return String(r.id); }));
    existing.forEach(function (el, id) { if (!wanted.has(id)) list.removeChild(el); });
    var cursor = list.firstChild;
    replies.forEach(function (r) {
      var el = existing.get(String(r.id));
      if (el && el.parentNode === list) { cursor = el.nextSibling; return; }
      list.insertBefore(renderNoteBody(r, false), cursor);
    });
  }

  function renderNoteBody(note, isRoot) {
    var id = String(note.id);
    var mine = currentKey() && note.reviewer_key === currentKey();
    var wrap = h("div", { class: "sc-note" + (isRoot ? " sc-note--root" : " sc-note--reply"), dataset: { note: id } });
    var meta = h("div", { class: "sc-note-meta" },
      h("span", { class: "sc-name", text: nameOfRow(note) }),
      h("time", { class: "sc-time", datetime: note.created_at || "", dataset: { scTs: note.created_at || "" }, text: relTime(note.created_at) })
    );
    wrap.appendChild(meta);
    wrap.appendChild(h("div", { class: "sc-note-body", text: String(note.body || "") }));
    if (mine) {
      var actions = h("div", { class: "sc-note-actions" });
      function showConfirm(fresh) {
        // fresh: the reviewer just clicked Remove, so the confirm takes focus. A re-render leaves focus alone.
        state.confirmingId = id;
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        var c = h("span", { class: "sc-confirm" },
          h("span", { text: "Remove this note? " }),
          h("button", { type: "button", class: "sc-link sc-link--danger", text: "Remove", onclick: function () { removeNote(note, c); } }),
          h("span", { text: " / " }),
          h("button", { type: "button", class: "sc-link", text: "Keep", onclick: function () {
            showRemove();
            var b = actions.querySelector("button");
            if (b) b.focus();
          } })
        );
        actions.appendChild(c);
        if (fresh) { var first = c.querySelector("button"); if (first) first.focus(); }
      }
      function showRemove() {
        if (state.confirmingId === id) state.confirmingId = null;
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        actions.appendChild(h("button", { type: "button", class: "sc-link", text: "Remove", onclick: function () { showConfirm(true); } }));
      }
      if (state.confirmingId === id) showConfirm(false); else showRemove();
      wrap.appendChild(actions);
    }
    return wrap;
  }

  function removeNote(note, confirmEl) {
    var btns = confirmEl ? confirmEl.querySelectorAll("button") : [];
    Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    api(TABLES.notes, "?id=eq." + encodeURIComponent(String(note.id)), {
      method: "PATCH",
      body: { deleted_at: new Date().toISOString() },
      prefer: "return=minimal",
    })
      .then(function () {
        var id = String(note.id);
        state.notes.delete(id);
        noteRemoved(id);
        if (note.kind !== "reply") {
          repliesOf(id).forEach(function (r) { state.notes.delete(String(r.id)); noteRemoved(r.id); });
        }
        if (state.confirmingId === id) state.confirmingId = null;
        if (String(state.openNote) === id) closeThread();
        renderAll();
        if (ui.thread && !ui.thread.contains(document.activeElement)) {
          try { ui.thread.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        }
        toast("Note removed");
      })
      .catch(function () {
        Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
        toast("Couldn't remove the note. Check your connection and try again.", { kind: "error" });
      });
  }

  function closeThread() {
    if (state.openNote !== null) setHot(state.openNote, false);
    state.openNote = null;
    state.confirmingId = null;
    if (ui.thread && ui.thread.parentNode) ui.thread.parentNode.removeChild(ui.thread);
    var ret = ui.threadReturn;
    ui.thread = null;
    ui.threadAnchor = null;
    ui.threadOthers = [];
    ui.threadReturn = null;
    showScrim();
    try { if (ret && document.contains(ret) && !isInUi(ret)) ret.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }

  function showScrim() {
    // The scrim backs the drawer everywhere, and the composer/thread only when they are phone bottom sheets.
    // On desktop a popover has no scrim, so a click outside both closes it and still lands on the page.
    if (!ui.scrim) return;
    var sheet = !ui.drawerOpen && (!!ui.composer || !!ui.thread) && isPhone();
    var need = !!ui.drawerOpen || sheet;
    ui.scrim.hidden = !need;
    ui.scrim.classList.toggle("sc-scrim--sheet", sheet);
    updateLock();
  }

  function keepDraft(pop) {
    // An outside tap never discards typed text: the popover stays, and the reviewer hears why once.
    if (pop.dataset.scKept) return;
    pop.dataset.scKept = "1";
    toast(pop === ui.thread ? "Your reply stays. Use Close to discard it." : "Your draft stays. Use Cancel to discard it.");
  }

  function dismissOverlays() {
    if (ui.composer) { if (hasDraft(ui.composer)) { keepDraft(ui.composer); return; } closeComposer(); }
    if (ui.thread) { if (hasDraft(ui.thread)) { keepDraft(ui.thread); return; } closeThread(); }
    closeDrawer();
  }

  // ------------------------------------------------------------------ section links

  function renderSectionLinks() {
    state.sections.forEach(function (s) {
      if (s.el.querySelector(":scope > .sc-section-link, :scope > header > .sc-section-link, :scope > .sc-section-link-wrap")) return;
      var wrap = h("div", { class: "sc-section-link-wrap sc-ui" });
      var btn = h("button", { type: "button", class: "sc-section-link", text: "Add a note to this section", onclick: function () {
        openComposer({ kind: "section", sectionId: s.id, sectionTitle: s.title, anchorEl: btn });
      } });
      wrap.appendChild(btn);
      s.linkEl = btn;
      var badge = h("button", { type: "button", class: "sc-section-count", hidden: true, onclick: function () { openDrawerAt(s.id); } });
      wrap.appendChild(badge);
      s.badgeEl = badge;
      var header = s.el.querySelector(":scope > header, :scope > h1, :scope > h2, :scope > h3");
      if (header && header.parentNode === s.el) {
        if (header.nextSibling) s.el.insertBefore(wrap, header.nextSibling); else s.el.appendChild(wrap);
      } else {
        s.el.insertBefore(wrap, s.el.firstChild);
      }
    });
  }

  function renderSectionCounts() {
    // A small badge beside the section link says how many section notes exist; it opens the drawer at that group.
    var counts = new Map();
    visibleRootNotes().forEach(function (n) {
      if (n.kind !== "section" || !n.section_id) return;
      counts.set(n.section_id, (counts.get(n.section_id) || 0) + 1);
    });
    state.sections.forEach(function (s) {
      var badge = s.badgeEl;
      if (!badge) return;
      var n = counts.get(s.id) || 0;
      var text = n ? n + (n === 1 ? " note" : " notes") : "";
      if (badge.textContent !== text) badge.textContent = text;
      badge.setAttribute("aria-label", n + (n === 1 ? " note" : " notes") + " on this section. Open Notes");
      badge.hidden = !n;
    });
  }

  function openDrawerAt(sectionId) {
    state.filter = null;
    openDrawer();
    if (!ui.drawerOpen) return;
    var group = ui.drawerBody.querySelector('.sc-drawer-group[data-section="' + String(sectionId).replace(/[^0-9a-zA-Z_-]/g, "") + '"]');
    if (!group) return;
    setTimeout(function () {
      if (!ui.drawerOpen) return;
      var first = group.querySelector(".sc-entry");
      if (first) { try { first.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
      ui.drawerBody.scrollTop = Math.max(0, group.offsetTop - ui.drawerBody.offsetTop - 8);
    }, 0);
  }

  // ------------------------------------------------------------------ general notes

  function renderGeneral() {
    var mount = document.getElementById("review-general");
    if (!mount) return;
    if (!mount.dataset.scMounted) {
      mount.dataset.scMounted = "1";
      mount.classList.add("sc-ui");
      var ta = h("textarea", { class: "sc-textarea", rows: "4", maxlength: "4000", placeholder: "Anything that didn't fit a highlight: the whole plan, what's missing, what you'd cut.", "aria-label": "General note" });
      var err = h("div", { class: "sc-field-error", role: "alert" });
      var save = h("button", { type: "button", class: "sc-btn sc-btn--primary", text: "Save note" });
      save.addEventListener("click", function () {
        if (save.disabled) return;
        if (!state.reviewer) { openGate(1); return; }
        var body = ta.value.trim();
        if (!body) { err.textContent = "Write something first."; ta.focus(); return; }
        err.textContent = "";
        save.disabled = true;
        save.textContent = "Saving…";
        var row = Object.assign({ kind: "general", body: body }, reviewerFields());
        api(TABLES.notes, "", { method: "POST", body: row, prefer: "return=representation" })
          .then(function (rows) {
            var saved = Array.isArray(rows) ? rows[0] : rows;
            if (!saved || saved.id === undefined) throw new Error("No row returned");
            state.notes.set(String(saved.id), saved);
            noteWritten(saved.id);
            ta.value = "";
            renderAll();
            toast("Note saved");
          })
          .catch(function () {
            toast("Couldn't save your note. Check your connection and try again.", { kind: "error" });
          })
          .finally(function () { save.disabled = false; save.textContent = "Save note"; });
      });
      var list = h("div", { class: "sc-general-list" });
      ui.generalList = list;
      mount.appendChild(h("div", { class: "sc-general" },
        h("h3", { class: "sc-general-title", text: "Anything else?" }),
        ta, err,
        h("div", { class: "sc-pop-actions sc-pop-actions--left" }, save),
        list
      ));
    }
    var listEl = ui.generalList;
    if (!listEl) return;
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    var notes = visibleRootNotes().filter(function (n) { return n.kind === "general"; }).reverse();
    if (!notes.length) {
      listEl.appendChild(h("p", { class: "sc-empty", text: "No general notes yet." }));
      return;
    }
    notes.forEach(function (n) {
      var replies = repliesOf(n.id);
      var entry = h("button", { type: "button", class: "sc-entry sc-entry--general", dataset: { note: String(n.id) } },
        h("span", { class: "sc-entry-meta" },
          h("span", { class: "sc-name", text: nameOfRow(n) }),
          h("span", { class: "sc-time", dataset: { scTs: n.created_at || "" }, text: relTime(n.created_at) })
        ),
        h("span", { class: "sc-entry-body", text: String(n.body || "") }),
        replies.length ? h("span", { class: "sc-entry-replies", text: replies.length + (replies.length === 1 ? " reply" : " replies") }) : null
      );
      entry.addEventListener("click", function () { openThread(n.id, entry, []); });
      listEl.appendChild(entry);
    });
  }

  // ------------------------------------------------------------------ stances

  var STANCE_OPTIONS = [
    { value: "yes", label: "Yes, build it", short: "Yes" },
    { value: "maybe", label: "Maybe", short: "Maybe" },
    { value: "cut", label: "Cut it", short: "Cut it" },
  ];

  function latestStances() {
    // latest row per (target_id, reviewer_key)
    var rows = Array.from(state.stances.values());
    rows.sort(function (a, b) { return sortByCreated(b, a); }); // newest first
    var seen = new Map(); // target -> Map(key -> row)
    rows.forEach(function (r) {
      if (!r || !r.target_id || !r.reviewer_key) return;
      var t = seen.get(r.target_id);
      if (!t) { t = new Map(); seen.set(r.target_id, t); }
      if (!t.has(r.reviewer_key)) t.set(r.reviewer_key, r);
    });
    return seen;
  }

  function stanceOptionsFor(mount) {
    // data-stance-labels="Love it|Maybe|Not this" relabels the three buttons (yes|maybe|cut order) for one mount.
    // The stored values stay yes/maybe/cut. Anything other than three non-empty labels falls back to the defaults.
    var raw = mount ? mount.getAttribute("data-stance-labels") : null;
    if (!raw) return STANCE_OPTIONS;
    var parts = String(raw).split("|").map(function (p) { return collapseWs(p).slice(0, 40); });
    if (parts.length !== STANCE_OPTIONS.length || parts.some(function (p) { return !p; })) return STANCE_OPTIONS;
    return STANCE_OPTIONS.map(function (opt, i) { return { value: opt.value, label: parts[i], short: parts[i] }; });
  }

  function stanceTitleOf(mount) {
    return collapseWs(mount.getAttribute("data-stance-title") || mount.getAttribute("data-stance") || "");
  }

  function tallyParts(perKey, options, onlyKey) {
    // "Love it: Kellen R., Israel H." per option that has votes, in button order.
    var parts = [];
    options.forEach(function (opt) {
      var names = [];
      perKey.forEach(function (row, key) {
        if (onlyKey && key !== onlyKey) return;
        if (row.stance === opt.value) names.push(nameOfRow(row));
      });
      if (names.length) parts.push(opt.short + ": " + names.join(", "));
    });
    return parts;
  }

  function renderStances() {
    var latest = latestStances();
    var me = currentKey();
    Array.prototype.forEach.call(document.querySelectorAll("[data-stance]"), function (mount) {
      var target = mount.getAttribute("data-stance");
      if (!target) return;
      var options = stanceOptionsFor(mount);
      var custom = options !== STANCE_OPTIONS;
      if (!mount.dataset.scMounted) {
        mount.dataset.scMounted = "1";
        mount.classList.add("sc-ui", "sc-stance");
        if (custom) mount.classList.add("sc-stance--labelled");
        var title = stanceTitleOf(mount) || target;
        var group = h("div", { class: "sc-stance-row", role: "group", "aria-label": (custom ? "Your vote on " : "Your stance on ") + title });
        options.forEach(function (opt) {
          var b = h("button", { type: "button", class: "sc-stance-btn sc-stance-btn--" + opt.value, dataset: { value: opt.value }, "aria-pressed": "false", "aria-label": opt.label + ", " + title, text: opt.label });
          b.addEventListener("click", function () { vote(target, opt.value, mount); });
          group.appendChild(b);
        });
        mount.appendChild(group);
        mount.appendChild(h("div", { class: "sc-stance-tally", "aria-live": "polite" }));
      }
      var perKey = latest.get(target) || new Map();
      var mine = me && perKey.get(me) ? perKey.get(me).stance : null;
      if (mine === "clear") mine = null;
      Array.prototype.forEach.call(mount.querySelectorAll(".sc-stance-btn"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.value === mine ? "true" : "false");
      });
      var tally = mount.querySelector(".sc-stance-tally");
      var parts = tallyParts(perKey, options, null);
      // Rewrite the live region only when its text changed, so screen readers do not re-announce every refresh.
      var wanted = parts.length ? parts.join(" · ") : "No votes yet.";
      if (tally.textContent === wanted) return;
      while (tally.firstChild) tally.removeChild(tally.firstChild);
      if (!parts.length) tally.appendChild(h("span", { class: "sc-stance-empty", text: "No votes yet." }));
      parts.forEach(function (p, i) {
        tally.appendChild(h("span", { class: "sc-stance-part", text: p }));
        if (i < parts.length - 1) tally.appendChild(h("span", { class: "sc-stance-sep", "aria-hidden": "true", text: " · " }));
      });
    });
  }

  function vote(target, value, mount) {
    if (!state.reviewer) { openGate(1); return; }
    var me = currentKey();
    var latest = latestStances().get(target);
    var current = latest && latest.get(me) ? latest.get(me).stance : null;
    if (current === "clear") current = null;
    var next = current === value ? "clear" : value;
    var tempId = "tmp-" + randomHex16();
    var row = Object.assign({ id: tempId, created_at: new Date().toISOString(), target_id: target, stance: next }, reviewerFields());
    state.stances.set(tempId, row);
    renderStances();
    api(TABLES.stances, "", { method: "POST", body: { target_id: target, stance: next, reviewer_first: row.reviewer_first, reviewer_last: row.reviewer_last, reviewer_key: row.reviewer_key, client_id: row.client_id, site_version: row.site_version }, prefer: "return=representation" })
      .then(function (rows) {
        var saved = Array.isArray(rows) ? rows[0] : rows;
        state.stances.delete(tempId);
        if (saved && saved.id !== undefined) { state.stances.set(String(saved.id), saved); stanceWritten(saved.id); }
        renderStances();
      })
      .catch(function () {
        state.stances.delete(tempId);
        renderStances();
        toast("Couldn't save your vote. Check your connection and try again.", { kind: "error" });
      });
  }

  // ------------------------------------------------------------------ reviewers

  function reviewerNames() {
    var seen = new Set();
    var names = [];
    state.visits.forEach(function (v) {
      if (!v || !v.reviewer_key || seen.has(v.reviewer_key)) return;
      seen.add(v.reviewer_key);
      names.push(nameOfRow(v));
    });
    return names;
  }

  function renderReviewers() {
    var names = reviewerNames();
    var text = names.length ? "Reviewed so far: " + names.join(", ") : "Nobody has reviewed yet. You're first.";
    var mount = document.getElementById("review-reviewers");
    if (mount) {
      mount.classList.add("sc-ui");
      mount.textContent = text;
    }
    if (ui.drawerReviewers) ui.drawerReviewers.textContent = text;
  }

  // ------------------------------------------------------------------ drawer

  function countVisible() {
    return visibleRootNotes().length;
  }

  function openDrawer() {
    if (!ui.drawer) return;
    closeComposer();
    closeThread();
    hidePill();
    ui.drawerOpen = true;
    ui.drawerReturn = document.activeElement;
    ui.drawer.hidden = false;
    ui.drawerBtn.setAttribute("aria-expanded", "true");
    showScrim();
    renderDrawer();
    var close = ui.drawer.querySelector(".sc-x");
    setTimeout(function () { if (close) close.focus(); }, 0);
  }

  function closeDrawer() {
    if (!ui.drawer || !ui.drawerOpen) return;
    ui.drawerOpen = false;
    ui.drawer.hidden = true;
    ui.drawerBtn.setAttribute("aria-expanded", "false");
    showScrim();
    var ret = ui.drawerReturn;
    ui.drawerReturn = null;
    try { if (ret && document.contains(ret)) ret.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }

  function renderDrawer() {
    if (!ui.drawerBtn) return;
    var n = countVisible();
    ui.drawerCount.textContent = "Notes · " + n;
    ui.drawerBtn.setAttribute("aria-label", "Open notes, " + n + " so far");
    renderReviewers();
    if (!ui.drawerOpen) return;
    var active = document.activeElement;
    var inDrawer = !!(active && ui.drawer.contains(active));
    var keepNote = inDrawer && active.dataset && active.dataset.note ? String(active.dataset.note) : null;
    var keepFilter = inDrawer && active.classList.contains("sc-filter") ? (active.dataset.key || "") : null;
    var keepStance = inDrawer && active.dataset && active.dataset.stance ? String(active.dataset.stance) : null;

    // filter chips
    var chips = ui.drawerFilters;
    while (chips.firstChild) chips.removeChild(chips.firstChild);
    var keys = new Map();
    visibleRootNotes().forEach(function (note) {
      [note].concat(repliesOf(note.id)).forEach(function (row) {
        if (row.reviewer_key && !keys.has(row.reviewer_key)) keys.set(row.reviewer_key, nameOfRow(row));
      });
    });
    if (state.filter && !keys.has(state.filter)) state.filter = null;
    if (keys.size >= 1) {
      var all = h("button", { type: "button", class: "sc-filter", dataset: { key: "" }, "aria-pressed": state.filter ? "false" : "true", text: "Everyone", onclick: function () { state.filter = null; renderDrawer(); } });
      chips.appendChild(all);
      keys.forEach(function (name, key) {
        chips.appendChild(h("button", { type: "button", class: "sc-filter", dataset: { key: key }, "aria-pressed": state.filter === key ? "true" : "false", text: name, onclick: function () {
          state.filter = state.filter === key ? null : key;
          renderDrawer();
        } }));
      });
    }

    // grouped list
    var body = ui.drawerBody;
    while (body.firstChild) body.removeChild(body.firstChild);
    var notes = visibleRootNotes().filter(function (note) { return !state.filter || note.reviewer_key === state.filter; });
    if (!notes.length) {
      body.appendChild(h("p", { class: "sc-empty", text: n ? "No notes from this reviewer." : "No notes yet. Highlight a few words to leave the first one." }));
      appendVotesGroup(body);
      restoreDrawerFocus(keepNote, keepFilter, keepStance);
      return;
    }
    var groups = new Map();
    state.sections.forEach(function (s) { groups.set(s.id, { id: s.id, title: s.title, notes: [] }); });
    var elsewhere = { id: "", title: "Elsewhere", notes: [] };
    var general = { id: "", title: "General", notes: [] };
    notes.forEach(function (note) {
      if (note.kind === "general") { general.notes.push(note); return; }
      var g = note.section_id ? groups.get(note.section_id) : null;
      if (g) g.notes.push(note); else elsewhere.notes.push(note);
    });
    var ordered = Array.from(groups.values()).concat([elsewhere, general]);
    ordered.forEach(function (g) {
      if (!g.notes.length) return;
      var sec = h("section", { class: "sc-drawer-group", dataset: g.id ? { section: g.id } : null });
      sec.appendChild(h("h3", { class: "sc-drawer-group-title", text: g.title }));
      var list = g === general ? g.notes.slice().reverse() : g.notes.slice().sort(function (a, b) {
        var aa = state.anchors.get(String(a.id));
        var ab = state.anchors.get(String(b.id));
        var pa = aa && !aa.orphan ? aa.start : Number.MAX_SAFE_INTEGER;
        var pb = ab && !ab.orphan ? ab.start : Number.MAX_SAFE_INTEGER;
        var ba = blockIndex(a.block_id);
        var bb = blockIndex(b.block_id);
        if (ba !== bb) return ba - bb;
        if (pa !== pb) return pa - pb;
        return sortByCreated(a, b);
      });
      list.forEach(function (note) { sec.appendChild(drawerEntry(note)); });
      body.appendChild(sec);
    });
    appendVotesGroup(body);
    restoreDrawerFocus(keepNote, keepFilter, keepStance);
  }

  function appendVotesGroup(body) {
    // Votes on the mounts that carry their own labels (the design options), so the look can be read at a glance
    // next to the notes. Same labels as the buttons; follows the reviewer filter.
    var latest = latestStances();
    var entries = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-stance][data-stance-labels]"), function (mount) {
      var target = mount.getAttribute("data-stance");
      var options = stanceOptionsFor(mount);
      if (!target || options === STANCE_OPTIONS) return;
      var parts = tallyParts(latest.get(target) || new Map(), options, state.filter);
      if (!parts.length) return;
      var title = stanceTitleOf(mount) || target;
      var entry = h("button", { type: "button", class: "sc-entry sc-entry--vote", dataset: { stance: target } },
        h("span", { class: "sc-entry-meta" },
          h("span", { class: "sc-name", text: title }),
          h("span", { class: "sc-tag", text: "Vote" })
        ),
        h("span", { class: "sc-entry-body", text: parts.join(" · ") })
      );
      entry.addEventListener("click", function () {
        closeDrawer();
        mount.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        flash(mount, null);
        var first = mount.querySelector(".sc-stance-btn");
        setTimeout(function () { try { if (first) first.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }, 0);
      });
      entries.push(entry);
    });
    if (!entries.length) return;
    var sec = h("section", { class: "sc-drawer-group sc-drawer-group--votes" });
    sec.appendChild(h("h3", { class: "sc-drawer-group-title", text: "Votes on the look" }));
    entries.forEach(function (e) { sec.appendChild(e); });
    body.appendChild(sec);
  }

  function restoreDrawerFocus(noteId, filterKey, stanceId) {
    // The drawer is rebuilt on every change; put focus back on the same entry or chip when it was there.
    if (noteId === null && filterKey === null && (stanceId === null || stanceId === undefined)) return;
    var target = null;
    var pool = noteId !== null ? ui.drawerBody.querySelectorAll(".sc-entry[data-note]")
      : (filterKey !== null ? ui.drawerFilters.querySelectorAll(".sc-filter") : ui.drawerBody.querySelectorAll(".sc-entry[data-stance]"));
    Array.prototype.forEach.call(pool, function (el) {
      if (target) return;
      if (noteId !== null) { if (el.dataset.note === noteId) target = el; }
      else if (filterKey !== null) { if ((el.dataset.key || "") === filterKey) target = el; }
      else if (el.dataset.stance === stanceId) target = el;
    });
    if (!target) target = ui.drawer.querySelector(".sc-x");
    if (target) { try { target.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
  }

  var blockOrder = null;
  function blockIndex(id) {
    if (!blockOrder) {
      blockOrder = new Map();
      var i = 0;
      state.blocks.forEach(function (_el, key) { blockOrder.set(key, i++); });
    }
    var v = blockOrder.get(String(id));
    return v === undefined ? Number.MAX_SAFE_INTEGER : v;
  }

  function drawerEntry(note) {
    var anchor = state.anchors.get(String(note.id));
    var orphan = note.kind === "highlight" && (!anchor || anchor.orphan);
    var replies = repliesOf(note.id);
    var kindTag = note.kind === "section" ? "Section note" : (note.kind === "general" ? "General" : null);
    var entry = h("button", { type: "button", class: "sc-entry" + (orphan ? " sc-entry--orphan" : ""), dataset: { note: String(note.id) } },
      h("span", { class: "sc-entry-meta" },
        h("span", { class: "sc-name", text: nameOfRow(note) }),
        h("span", { class: "sc-time", dataset: { scTs: note.created_at || "" }, text: relTime(note.created_at) }),
        kindTag ? h("span", { class: "sc-tag", text: kindTag }) : null,
        orphan ? h("span", { class: "sc-tag sc-tag--orphan", text: "(text changed)" }) : null
      ),
      note.quote ? h("span", { class: "sc-entry-quote", text: truncate(note.quote, 90) }) : null,
      h("span", { class: "sc-entry-body", text: String(note.body || "") }),
      replies.length ? h("span", { class: "sc-entry-replies", text: replies.length + (replies.length === 1 ? " reply" : " replies") }) : null
    );
    entry.addEventListener("click", function () { jumpTo(note); });
    return entry;
  }

  function jumpTo(note) {
    closeDrawer();
    var behavior = reducedMotion() ? "auto" : "smooth";
    var target = null;
    if (note.kind === "highlight") {
      target = marksFor(note.id)[0] || null;
      if (!target) {
        var block = state.blocks.get(String(note.block_id));
        target = block || null;
        if (target) { target.scrollIntoView({ block: "center", behavior: behavior }); flash(target, null); }
        else toast("That note's text isn't on the page any more.");
        if (target) setTimeout(function () { openThread(note.id, target, []); }, reducedMotion() ? 0 : 400);
        return;
      }
      target.scrollIntoView({ block: "center", behavior: behavior });
      flash(null, note.id);
      setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }, 0);
      return;
    }
    if (note.kind === "section") {
      var s = null;
      for (var i = 0; i < state.sections.length; i++) if (state.sections[i].id === note.section_id) s = state.sections[i];
      target = s && s.linkEl ? s.linkEl : (s ? s.el : null);
      if (!target) { toast("That section isn't on the page any more."); return; }
      target.scrollIntoView({ block: "center", behavior: behavior });
      flash(target, null);
      setTimeout(function () { openThread(note.id, target, []); }, reducedMotion() ? 0 : 400);
      return;
    }
    if (note.kind === "general") {
      var entry = ui.generalList ? ui.generalList.querySelector('.sc-entry[data-note="' + String(note.id).replace(/[^0-9a-zA-Z_-]/g, "") + '"]') : null;
      target = entry || document.getElementById("review-general");
      if (!target) { toast("The general notes box isn't on this page."); return; }
      target.scrollIntoView({ block: "center", behavior: behavior });
      flash(target, null);
      setTimeout(function () { openThread(note.id, target, []); }, reducedMotion() ? 0 : 400);
    }
  }

  // ------------------------------------------------------------------ layer skeleton

  function buildLayer() {
    var layer = h("div", { class: "sc-layer" });
    ui.layer = layer;

    ui.probe = h("div", { class: "sc-probe", "aria-hidden": "true" });
    layer.appendChild(ui.probe);

    ui.scrim = h("div", { class: "sc-scrim", hidden: true });
    ui.scrim.addEventListener("click", dismissOverlays);
    layer.appendChild(ui.scrim);

    ui.pill = h("button", { type: "button", class: "sc-pill", hidden: true }, svgIcon("0 0 24 24", [ICON_PEN]), h("span", { text: "Leave a note" }));
    ui.pill.addEventListener("mousedown", function (e) { e.preventDefault(); });
    function armPill() {
      // A touch clears the selection before the click lands; hold the anchor until it does.
      clearTimeout(selTimer);
      state.pillArmed = Date.now();
    }
    ui.pill.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") e.preventDefault(); else armPill(); });
    ui.pill.addEventListener("touchstart", armPill, { passive: true });
    ui.pill.addEventListener("click", function () {
      state.pillArmed = 0;
      var anchor = state.pendingAnchor;
      if (!anchor) {
        // try once more from the live selection
        checkSelection();
        anchor = state.pendingAnchor;
      }
      if (!anchor) { hidePill(); return; }
      openComposer({ kind: "highlight", anchor: anchor });
    });
    layer.appendChild(ui.pill);

    ui.hint = h("div", { class: "sc-pill sc-pill--hint", role: "status", hidden: true, text: "Highlight inside one paragraph" });
    layer.appendChild(ui.hint);

    ui.drawerCount = h("span", { class: "sc-drawer-btn-label", text: "Notes · 0" });
    ui.drawerBtn = h("button", { type: "button", class: "sc-drawer-btn", "aria-expanded": "false", "aria-controls": "sc-drawer" }, svgIcon("0 0 24 24", [ICON_NOTES]), ui.drawerCount);
    ui.drawerBtn.addEventListener("click", function () { if (ui.drawerOpen) closeDrawer(); else openDrawer(); });
    layer.appendChild(ui.drawerBtn);

    ui.drawerReviewers = h("p", { class: "sc-drawer-reviewers" });
    ui.drawerFilters = h("div", { class: "sc-drawer-filters", role: "group", "aria-label": "Filter by reviewer" });
    ui.drawerBody = h("div", { class: "sc-drawer-body" });
    ui.drawer = h("aside", { class: "sc-drawer", id: "sc-drawer", role: "dialog", "aria-label": "Notes", hidden: true },
      h("div", { class: "sc-drawer-head" },
        h("h2", { class: "sc-drawer-title", text: "Notes" }),
        h("button", { type: "button", class: "sc-x", "aria-label": "Close notes", onclick: closeDrawer }, svgIcon("0 0 24 24", [ICON_CLOSE]))
      ),
      ui.drawerReviewers,
      ui.drawerFilters,
      ui.drawerBody
    );
    layer.appendChild(ui.drawer);

    ui.toasts = h("div", { class: "sc-toasts", "aria-live": "polite", "aria-relevant": "additions" });
    layer.appendChild(ui.toasts);

    document.body.appendChild(layer);
    readInsets();
  }

  function readInsets() {
    if (!ui.probe) return;
    try {
      var cs = getComputedStyle(ui.probe);
      insets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
    } catch (_) { insets = { top: 0, right: 0, bottom: 0, left: 0 }; }
  }

  // ------------------------------------------------------------------ global events

  function bindEvents() {
    document.addEventListener("selectionchange", function () { scheduleSelectionCheck(150); });
    document.addEventListener("pointerup", function (e) {
      if (isInUi(e.target)) return;
      scheduleSelectionCheck(0);
    });
    document.addEventListener("keyup", function (e) {
      if (isInUi(e.target)) return;
      if (e.key === "Shift" || e.key.indexOf("Arrow") === 0 || e.key === "Home" || e.key === "End" || e.key === "a") scheduleSelectionCheck(0);
    });

    // marks: click / keyboard
    document.addEventListener("click", function (e) {
      var t = e.target;
      var mark = t && t.closest ? t.closest("mark.sc-mark[data-note]") : null;
      if (!mark) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var sel = null;
      try { sel = window.getSelection(); } catch (_) { sel = null; }
      if (sel && !sel.isCollapsed && sel.toString().trim()) return; // the user is selecting, not clicking
      e.preventDefault();
      openMarkThread(mark);
    });
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t && t.matches && t.matches("mark.sc-mark[data-note]") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openMarkThread(t);
      }
    });

    // gate focus trap: on document, so a Tab from <body> (after a backdrop click) is caught too
    document.addEventListener("keydown", function (e) {
      if (!ui.gate || e.key !== "Tab") return;
      var list = focusables(ui.gate);
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0];
      var last = list[list.length - 1];
      var active = document.activeElement;
      if (!ui.gate.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });

    // escape
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (ui.gate) return;
      if (ui.composer) { e.preventDefault(); closeComposer(); return; }
      if (ui.thread) { e.preventDefault(); closeThread(); return; }
      if (ui.drawerOpen) { e.preventDefault(); closeDrawer(); return; }
      if (ui.pill && !ui.pill.hidden) hidePill();
    });

    // click outside popovers (a popover with typed text stays; see keepDraft)
    document.addEventListener("pointerdown", function (e) {
      var t = e.target;
      if (ui.composer && !ui.composer.contains(t) && !(ui.pill && ui.pill.contains(t))) {
        if (hasDraft(ui.composer)) keepDraft(ui.composer); else closeComposer();
      }
      if (ui.thread && !ui.thread.contains(t)) {
        var mark = t && t.closest ? t.closest("mark.sc-mark[data-note]") : null;
        if (!mark || mark.dataset.note !== String(state.openNote)) {
          if (hasDraft(ui.thread)) keepDraft(ui.thread); else closeThread();
        }
      }
    }, true);

    window.addEventListener("resize", function () {
      readInsets();
      showScrim();
      if (ui.pill && !ui.pill.hidden) { ui.pill.classList.toggle("sc-pill--bar", isPhone()); repositionPill(); }
      if (ui.composer) placePopover(ui.composer, state.composer && state.composer.kind === "highlight" ? rectOfSelectionOrAnchor(state.composer.anchor) : (state.composer && state.composer.anchorEl ? state.composer.anchorEl.getBoundingClientRect() : null));
      if (ui.thread) placePopover(ui.thread, ui.threadAnchor ? ui.threadAnchor.getBoundingClientRect() : null);
      fitSheets();
    });
    window.addEventListener("scroll", function () { if (ui.pill && !ui.pill.hidden) repositionPill(); }, { passive: true });
    // the visual viewport moves with pinch zoom and the on-screen keyboard; innerWidth/innerHeight do not
    var vv = window.visualViewport;
    if (vv) {
      var onViewport = function () {
        fitSheets();
        if (ui.pill && !ui.pill.hidden) repositionPill();
        if (ui.hint && !ui.hint.hidden && !isPhone()) {
          try { var s = window.getSelection(); if (s && s.rangeCount && !s.isCollapsed) placeFloating(ui.hint, s.getRangeAt(0).getBoundingClientRect(), 10); } catch (_) { /* ignore */ }
        }
      };
      vv.addEventListener("resize", onViewport);
      vv.addEventListener("scroll", onViewport);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (state.loaded) refresh();
      checkForUpdate();
    });
    setInterval(function () {
      if (document.visibilityState !== "visible") return;
      if (state.loaded) refresh();
      checkForUpdate();
    }, REFRESH_MS);
  }

  function openMarkThread(mark) {
    var id = mark.dataset.note;
    var others = [];
    var el = mark.parentElement;
    while (el && !el.hasAttribute("data-block")) {
      if (el.matches && el.matches("mark.sc-mark[data-note]") && others.indexOf(el.dataset.note) < 0) others.push(el.dataset.note);
      el = el.parentElement;
    }
    openThread(id, mark, others);
  }

  // ------------------------------------------------------------------ auto-update

  // The page carries its build in <meta name="sc-build">, and version.json (fetched past every cache) names the
  // build that is live. When they differ the page reloads itself at ?v=<build>, which misses the CDN and browser
  // caches, unless the reviewer is in the middle of something; then it waits for that to finish. A reload never
  // repeats within UPDATE_GUARD_MS, so a CDN that still serves the old page cannot start a loop.
  var update = {
    loaded: null, // build of this page, from the meta tag; null turns the feature off
    pending: null, // newer build seen in version.json, waiting to load
    checking: false,
    navigating: false,
    notified: false, // the "loads when you finish" toast was shown
    watch: 0, // interval that waits for the reviewer to finish
    bootAt: 0,
    cameFromReload: false, // this page load is the result of an automatic reload
    arrived: false, // show "Updated to the latest plan." once marks are drawn
    restoreY: null, // scroll position to put back after the reload
  };

  function readLoadedBuild() {
    var meta = document.querySelector('meta[name="sc-build"]');
    var v = meta ? String(meta.getAttribute("content") || "").trim().toLowerCase() : "";
    return BUILD_RE.test(v) ? v : null;
  }

  function initUpdates() {
    update.loaded = readLoadedBuild();
    if (!update.loaded) return;
    update.bootAt = Date.now();
    var guard = sessionGet(STORAGE_UPDATE_GUARD);
    if (guard && guard.to === update.loaded) sessionRemove(STORAGE_UPDATE_GUARD); // landed on the build it went for

    var arrivedV = null;
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.has("v")) {
        arrivedV = String(params.get("v") || "").trim().toLowerCase();
        params.delete("v");
        var qs = params.toString();
        window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
      }
    } catch (_) { /* leave the URL as it is */ }

    var saved = sessionGet(STORAGE_UPDATE_SCROLL);
    sessionRemove(STORAGE_UPDATE_SCROLL);
    if (arrivedV === null) return;
    update.cameFromReload = true;
    update.arrived = arrivedV === update.loaded; // a CDN still serving the old page is not an update
    if (saved && typeof saved.y === "number" && isFinite(saved.y) && saved.y >= 0 && typeof saved.at === "number" && Math.abs(Date.now() - saved.at) < UPDATE_SCROLL_TTL) {
      update.restoreY = Math.round(saved.y);
    }
  }

  function finishArrival() {
    // Runs once the first render (marks included) is on the page.
    if (update.restoreY !== null) {
      var y = update.restoreY;
      update.restoreY = null;
      try { window.scrollTo(0, y); } catch (_) { /* ignore */ }
      if (document.readyState !== "complete") {
        // Fonts and images can still grow the page; if the first scroll was cut short and the reviewer has not
        // moved since, finish it when everything has loaded.
        var landed = window.scrollY || window.pageYOffset || 0;
        window.addEventListener("load", function () {
          var now = window.scrollY || window.pageYOffset || 0;
          if (Math.abs(now - landed) < 2 && Math.abs(now - y) >= 2) { try { window.scrollTo(0, y); } catch (_) { /* ignore */ } }
        }, { once: true });
      }
    }
    if (update.arrived) {
      update.arrived = false;
      toast("Updated to the latest plan.");
    }
  }

  function updateGuarded() {
    var now = Date.now();
    if (update.cameFromReload && now - update.bootAt < UPDATE_GUARD_MS) return true;
    var guard = sessionGet(STORAGE_UPDATE_GUARD);
    return !!(guard && typeof guard.at === "number" && now - guard.at >= 0 && now - guard.at < UPDATE_GUARD_MS);
  }

  function updateBlocker() {
    // What the reviewer is in the middle of, if anything:
    //   "draft": an open note composer, a passage picked for a note, an open remove confirm, or any
    //            review-layer field (gate name, reply, general note) holding typed text;
    //   "busy":  a request still saving, or the gate's how-to step on screen (both finish on their own).
    var fields = document.querySelectorAll(".sc-layer textarea, .sc-layer input, .sc-ui textarea, .sc-ui input");
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var type = String(f.type || "text").toLowerCase();
      if (f.tagName === "INPUT" && ["text", "search", "email", "url", "tel", ""].indexOf(type) < 0) continue;
      if (String(f.value || "").trim()) return "draft";
    }
    if (ui.composer) return "draft";
    if (ui.pill && !ui.pill.hidden && state.pendingAnchor) return "draft";
    if (ui.thread && state.confirmingId !== null) return "draft";
    if (writesInFlight > 0) return "busy";
    if (ui.gate && !ui.gate.querySelector("input")) return "busy";
    return null;
  }

  function stopUpdateWatch() {
    if (update.watch) clearInterval(update.watch);
    update.watch = 0;
  }

  function applyUpdate() {
    var b = update.pending;
    if (!b || update.navigating) return false;
    if (updateGuarded()) { stopUpdateWatch(); return false; } // just reloaded; the next refresh tries again
    var blocker = updateBlocker();
    if (blocker) {
      if (blocker === "draft" && !update.notified) {
        update.notified = true;
        toast("A newer version of the plan is out. It loads when you finish this note.", { ttl: 9000 });
      }
      if (!update.watch) update.watch = setInterval(applyUpdate, UPDATE_WATCH_MS);
      return false;
    }
    stopUpdateWatch();
    update.navigating = true;
    var href = window.location.pathname + "?v=" + encodeURIComponent(b) + window.location.hash;
    sessionSet(STORAGE_UPDATE_SCROLL, { y: Math.round(window.scrollY || window.pageYOffset || 0), at: Date.now() });
    sessionSet(STORAGE_UPDATE_GUARD, { from: update.loaded, to: b, at: Date.now(), href: href });
    try { window.location.replace(href); } catch (_) { update.navigating = false; }
    return true;
  }

  function checkForUpdate() {
    if (!update.loaded || update.checking || update.navigating) return Promise.resolve();
    update.checking = true;
    var ctrl = null;
    var timer = null;
    try { ctrl = new AbortController(); } catch (_) { ctrl = null; }
    var init = { cache: "no-store", headers: { Accept: "application/json" } };
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (_) { /* ignore */ } }, FETCH_TIMEOUT);
    }
    var p;
    try { p = Promise.resolve(fetch("version.json?t=" + Date.now(), init)); } catch (err) { p = Promise.reject(err); }
    return p
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        var b = data && typeof data.build === "string" ? data.build.trim().toLowerCase() : "";
        if (!BUILD_RE.test(b)) return;
        if (b === update.loaded) { update.pending = null; stopUpdateWatch(); return; }
        update.pending = b;
        applyUpdate();
      })
      .catch(function () { /* offline or no version.json: try again on the next refresh */ })
      .finally(function () {
        if (timer) clearTimeout(timer);
        update.checking = false;
      });
  }

  // ------------------------------------------------------------------ data flow

  // Rows this client wrote or removed, by id, with the time the request completed. A refresh GET that was
  // issued before one of these completed may predate it, so the merge keeps the local copy instead.
  var localWrites = new Map(); // "n:<id>" or "s:<id>" -> ms
  var localDeletes = new Map(); // "n:<id>" -> ms
  var LOCAL_TTL = 10 * 60 * 1000;
  function noteWritten(id) { localWrites.set("n:" + String(id), Date.now()); }
  function stanceWritten(id) { localWrites.set("s:" + String(id), Date.now()); }
  function noteRemoved(id) { localDeletes.set("n:" + String(id), Date.now()); }
  function pruneLocal(now) {
    [localWrites, localDeletes].forEach(function (m) {
      m.forEach(function (t, k) { if (now - t > LOCAL_TTL) m.delete(k); });
    });
  }

  function mergeNotes(rows, issued) {
    var next = new Map();
    rows.forEach(function (r) {
      if (!r || r.id === undefined || r.deleted_at) return;
      var id = String(r.id);
      var removed = localDeletes.get("n:" + id);
      if (removed !== undefined && removed >= issued) return; // removed here after this GET went out
      next.set(id, r);
    });
    state.notes.forEach(function (r, id) {
      if (next.has(id)) return;
      var written = localWrites.get("n:" + id);
      if (written !== undefined && written >= issued) next.set(id, r); // saved here after this GET went out
    });
    state.notes = next;
  }
  function mergeStances(rows, issued) {
    var next = new Map();
    rows.forEach(function (r) { if (r && r.id !== undefined) next.set(String(r.id), r); });
    state.stances.forEach(function (r, id) {
      if (next.has(id)) return;
      // keep optimistic rows that have not resolved yet, and rows saved here after this GET went out
      if (String(id).indexOf("tmp-") === 0) { next.set(id, r); return; }
      var written = localWrites.get("s:" + id);
      if (written !== undefined && written >= issued) next.set(id, r);
    });
    state.stances = next;
  }

  function dataSignature() {
    var notes = [];
    state.notes.forEach(function (n, id) { notes.push(id + ":" + (n.deleted_at || "")); });
    var stances = [];
    state.stances.forEach(function (_s, id) { stances.push(id); });
    notes.sort();
    stances.sort();
    return notes.join(",") + "|" + stances.join(",");
  }

  var refreshing = false;
  var renderedSig = "";
  function refresh() {
    if (refreshing) return Promise.resolve();
    refreshing = true;
    var issued = Date.now();
    return Promise.allSettled([fetchNotes(), fetchStances()]).then(function (results) {
      refreshing = false;
      var merged = false;
      if (results[0].status === "fulfilled") { mergeNotes(results[0].value, issued); merged = true; }
      if (results[1].status === "fulfilled") { mergeStances(results[1].value, issued); merged = true; }
      pruneLocal(Date.now());
      if (merged) {
        if (dataSignature() !== renderedSig) renderAll(true);
        else {
          if (state.marksDirty) renderMarks(true);
          refreshTimes();
        }
      }
      if (results[0].status === "rejected" && results[1].status === "rejected") toast("Couldn't refresh notes. Check your connection.", { kind: "error" });
    });
  }

  function renderAll(gentle) {
    // gentle: the render comes from a background refresh, so nothing the reviewer is in the middle of gets rebuilt.
    blockOrder = null;
    renderedSig = dataSignature();
    renderMarks(!!gentle);
    renderStances();
    renderGeneral();
    renderDrawer();
    renderSectionCounts();
    if (ui.thread) {
      if (state.notes.has(String(state.openNote))) { setHot(state.openNote, true); renderThread(); }
      else closeThread();
    }
  }

  function boot() {
    initUpdates();
    buildLayer();
    indexPage();
    renderSectionLinks();
    renderTutorialMount();
    bindEvents();

    state.reviewer = loadReviewer();
    renderChip();
    if (state.reviewer) recordVisit(false); else openGate(1);
    // A cached copy of an older page catches up right away, before the reviewer starts reading.
    checkForUpdate();

    var issued = Date.now();
    Promise.allSettled([fetchNotes(), fetchStances(), fetchVisits()]).then(function (results) {
      if (results[0].status === "fulfilled") mergeNotes(results[0].value, issued);
      if (results[1].status === "fulfilled") mergeStances(results[1].value, issued);
      if (results[2].status === "fulfilled") state.visits = results[2].value.concat(state.visits);
      state.loaded = true;
      renderAll();
      renderReviewers();
      finishArrival();
      var failed = results.filter(function (r) { return r.status === "rejected"; }).length;
      if (failed === 3) toast("Couldn't load notes. Reload to try again.", { kind: "error" });
      else if (failed) toast("Some notes may be missing. Reload to try again.", { kind: "error" });
    });
  }

  function safeBoot() {
    try { boot(); } catch (err) {
      if (typeof console !== "undefined") console.error("[review] failed to mount", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeBoot);
  else safeBoot();
})();
