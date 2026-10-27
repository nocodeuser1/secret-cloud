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

  var TUTORIAL_COPY = {
    before: "The image that sells it: walking off the path into a little bit of forest ",
    highlight: "because you heard something",
    after: ", and someone else walking in too.",
    name: "Israel H. · just now",
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
    composer: null, // { kind, anchor, sectionId, sectionTitle }
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

  function collapseWs(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function reviewerKeyOf(first, last) {
    return collapseWs(first).toLowerCase() + " " + collapseWs(last).toLowerCase();
  }
  function displayName(first, last) {
    var f = collapseWs(first);
    var l = collapseWs(last);
    return f + (l ? " " + l.charAt(0).toUpperCase() + "." : "");
  }
  function nameOfRow(row) { return displayName(row.reviewer_first, row.reviewer_last); }

  function truncate(s, n) {
    s = String(s || "");
    if (s.length <= n) return s;
    return s.slice(0, Math.max(0, n - 1)).replace(/\s+$/, "") + "…";
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

  function focusables(root) {
    var list = root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    return Array.prototype.filter.call(list, function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  // ------------------------------------------------------------------ transport

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
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function rowBelongsHere(row) {
    // Test rows (site_version "test") stay on the test page; the live site never shows them.
    var v = row && row.site_version;
    if (SITE_VERSION === "test") return v === "test";
    return v !== "test";
  }

  function fetchNotes() {
    return api(TABLES.notes, "?select=*&deleted_at=is.null&order=created_at.asc").then(function (rows) {
      return Array.isArray(rows) ? rows.filter(rowBelongsHere) : [];
    });
  }
  function fetchStances() {
    return api(TABLES.stances, "?select=*&order=created_at.desc").then(function (rows) {
      return Array.isArray(rows) ? rows.filter(rowBelongsHere) : [];
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
      "aria-label": "Reviewing as " + name + ". Switch reviewer",
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
    renderGateStep(card, step || 1);

    gate.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key !== "Tab") return;
      var list = focusables(gate);
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !gate.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
    // keep focus inside
    gate.addEventListener("focusout", function (e) {
      if (!ui.gate) return;
      var to = e.relatedTarget;
      if (to && !gate.contains(to)) {
        var list = focusables(gate);
        if (list.length) setTimeout(function () { if (ui.gate) list[0].focus(); }, 0);
      }
    });
  }

  function renderGateStep(card, step) {
    while (card.firstChild) card.removeChild(card.firstChild);
    card.appendChild(h("div", { class: "sc-wordmark", text: "THE SECRET CLOUD" }));

    if (step === 1) {
      card.appendChild(h("h2", { id: "sc-gate-title", class: "sc-gate-title", text: "Before you read" }));
      card.appendChild(h("p", { class: "sc-gate-why", text: "Your name is stamped on every note and vote you leave, so Claude knows whose it is when the build starts." }));

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
    document.documentElement.classList.remove("sc-gate-open");
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
    try {
      var r = document.createRange();
      r.setStart(block, 0);
      r.setEnd(container, offset);
      return r.toString().length;
    } catch (_) { return null; }
  }

  function captureAnchor(range, block) {
    var text = block.textContent || "";
    var start = textOffsetIn(block, range.startContainer, range.startOffset);
    var end = textOffsetIn(block, range.endContainer, range.endOffset);
    if (start === null || end === null) return null;
    if (end < start) { var t = start; start = end; end = t; }
    end = Math.min(end, text.length);
    // trim whitespace at both ends
    while (start < end && /\s/.test(text.charAt(start))) start++;
    while (end > start && /\s/.test(text.charAt(end - 1))) end--;
    if (end <= start) return null;
    if (end - start > MAX_QUOTE) end = start + MAX_QUOTE;
    var blockId = block.getAttribute("data-block");
    return {
      block_id: blockId,
      section_id: sectionOf(block),
      start_offset: start,
      end_offset: end,
      quote: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
      suffix: text.slice(end, end + CONTEXT_CHARS),
    };
  }

  function resolveAnchor(note) {
    try {
      var block = state.blocks.get(String(note.block_id));
      var quote = typeof note.quote === "string" ? note.quote : "";
      if (!block || !quote) return { orphan: true };
      var text = block.textContent || "";
      var s = toInt(note.start_offset);
      var e = toInt(note.end_offset);
      if (s !== null && e !== null && e > s && text.slice(s, e) === quote) return { start: s, end: e };
      var candidates = [];
      var idx = text.indexOf(quote);
      while (idx >= 0 && candidates.length < 200) {
        candidates.push(idx);
        idx = text.indexOf(quote, idx + 1);
      }
      if (!candidates.length) return { orphan: true };
      if (candidates.length === 1) return { start: candidates[0], end: candidates[0] + quote.length };
      var prefix = typeof note.prefix === "string" ? note.prefix : "";
      var suffix = typeof note.suffix === "string" ? note.suffix : "";
      var best = candidates[0];
      var bestScore = -1;
      candidates.forEach(function (c) {
        var score = 0;
        var before = text.slice(Math.max(0, c - prefix.length), c);
        var after = text.slice(c + quote.length, c + quote.length + suffix.length);
        var i = 0;
        while (i < prefix.length && i < before.length && prefix.charAt(prefix.length - 1 - i) === before.charAt(before.length - 1 - i)) i++;
        score += i;
        var j = 0;
        while (j < suffix.length && j < after.length && suffix.charAt(j) === after.charAt(j)) j++;
        score += j;
        if (s !== null) score -= Math.min(5, Math.abs(c - s) / 1000);
        if (score > bestScore) { bestScore = score; best = c; }
      });
      return { start: best, end: best + quote.length };
    } catch (_) {
      return { orphan: true };
    }
  }

  // ------------------------------------------------------------------ marks

  function textNodesOf(block) {
    var out = [];
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    var pos = 0;
    var n;
    while ((n = walker.nextNode())) {
      var len = n.nodeValue.length;
      out.push({ node: n, pos: pos, len: len });
      pos += len;
    }
    return out;
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

  function renderMarks() {
    clearMarks();
    state.anchors = new Map();
    var highlights = visibleRootNotes().filter(function (n) { return n.kind === "highlight"; });
    highlights.forEach(function (n) { state.anchors.set(String(n.id), resolveAnchor(n)); });
    // outer-most first: earlier start, then longer span
    highlights.sort(function (a, b) {
      var aa = state.anchors.get(String(a.id));
      var ab = state.anchors.get(String(b.id));
      if (aa.orphan || ab.orphan) return 0;
      if (aa.start !== ab.start) return aa.start - ab.start;
      return (ab.end - ab.start) - (aa.end - aa.start);
    });
    highlights.forEach(function (n) {
      var a = state.anchors.get(String(n.id));
      if (!a || a.orphan) return;
      var block = state.blocks.get(String(n.block_id));
      if (!block) return;
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
        state.anchors.set(String(n.id), { orphan: true });
      }
    });
    if (state.composer && state.composer.kind === "highlight" && state.composer.anchor) renderPendingMark(state.composer.anchor);
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

  function checkSelection() {
    if (!state.reviewer || ui.gate) { hidePill(); return; }
    if (state.composer) return;
    hideHint();
    var sel = null;
    try { sel = window.getSelection(); } catch (_) { sel = null; }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hidePill(); return; }
    var range = sel.getRangeAt(0);
    if (isInUi(range.startContainer) || isInUi(range.endContainer)) { hidePill(); return; }
    if (!range.toString().trim()) { hidePill(); return; }

    var startBlock = blockOf(range.startContainer);
    var endBlock = blockOf(range.endContainer);

    if (startBlock && endBlock !== startBlock) {
      // Tighten a selection that merely ends at the start of the next thing (triple-click, drag past the end).
      var tight = range.cloneRange();
      var endsAtStart = tight.endOffset === 0 || (tight.endContainer.nodeType === 3 && !tight.endContainer.nodeValue.slice(0, tight.endOffset).trim() && !endBlock);
      if (endsAtStart) {
        try {
          tight.setEnd(startBlock, startBlock.childNodes.length);
          if (blockOf(tight.endContainer) === startBlock) { range = tight; endBlock = startBlock; }
        } catch (_) { /* ignore */ }
      }
    }

    if (!startBlock && !endBlock) { hidePill(); return; }
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
    // Position a fixed element above (or below) a viewport rect, clamped to the viewport and the safe area.
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var pw = el.offsetWidth;
    var ph = el.offsetHeight;
    var x = rect.left + rect.width / 2 - pw / 2;
    var minX = insets.left + 8;
    var maxX = vw - insets.right - pw - 8;
    x = Math.max(minX, Math.min(x, maxX));
    var y = rect.top - ph - gap;
    if (y < insets.top + 8) y = rect.bottom + gap;
    if (y + ph > vh - insets.bottom - 8) y = Math.max(insets.top + 8, vh - insets.bottom - ph - 8);
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
    if (isPhone() || !rect) {
      pop.style.left = "";
      pop.style.top = "";
      return;
    }
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var x = rect.left + rect.width / 2 - pw / 2;
    x = Math.max(insets.left + 8, Math.min(x, vw - insets.right - pw - 8));
    var y;
    var below = rect.bottom + 10;
    var above = rect.top - ph - 10;
    if (below + ph <= vh - insets.bottom - 8) y = below;
    else if (above >= insets.top + 8) y = above;
    else y = Math.max(insets.top + 8, Math.min(below, vh - insets.bottom - ph - 8));
    var off = docOffset();
    pop.style.left = Math.round(x + off.x) + "px";
    pop.style.top = Math.round(y + off.y) + "px";
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

    function doSave() {
      var body = ta.value.trim();
      if (!body) { err.textContent = "Write something first."; ta.focus(); return; }
      if (body.length > 4000) { err.textContent = "Keep it under 4000 characters."; return; }
      err.textContent = "";
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
          closeComposer();
          renderAll();
          toast("Note saved");
          if (saved.kind === "highlight") flash(null, saved.id);
        })
        .catch(function () {
          save.disabled = false;
          save.textContent = "Save note";
          toast("Couldn't save your note. Check your connection and try again.", { kind: "error" });
        });
    }
    save.addEventListener("click", doSave);
    ta.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); doSave(); }
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
    renderThread();
    showScrim();
    placePopover(pop, anchorEl ? anchorEl.getBoundingClientRect() : null);
    setTimeout(function () { try { pop.focus({ preventScroll: true }); } catch (_) { pop.focus(); } }, 0);
  }

  function renderThread() {
    var pop = ui.thread;
    if (!pop) return;
    var note = state.notes.get(String(state.openNote));
    if (!note) { closeThread(); return; }
    var draft = pop.querySelector("textarea.sc-textarea");
    var draftText = draft ? draft.value : "";
    var confirming = !!pop.querySelector(".sc-confirm");
    while (pop.firstChild) pop.removeChild(pop.firstChild);

    pop.appendChild(h("button", { type: "button", class: "sc-x", "aria-label": "Close", onclick: function () { closeThread(); } }, svgIcon("0 0 24 24", [ICON_CLOSE])));

    if (note.kind === "highlight" && note.quote) {
      pop.appendChild(h("blockquote", { class: "sc-quote sc-quote--short", text: truncate(note.quote, 120) }));
    } else if (note.kind === "section") {
      pop.appendChild(h("div", { class: "sc-pop-eyebrow", text: "Section note · " + sectionTitle(note.section_id) }));
    } else if (note.kind === "general") {
      pop.appendChild(h("div", { class: "sc-pop-eyebrow", text: "General note" }));
    }

    pop.appendChild(renderNoteBody(note, true, confirming));

    if (ui.threadOthers && ui.threadOthers.length) {
      var others = ui.threadOthers.filter(function (id) { return state.notes.has(String(id)); });
      if (others.length) {
        var line = h("div", { class: "sc-others" });
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
        pop.appendChild(line);
      }
    }

    var replies = repliesOf(note.id);
    if (replies.length) {
      var list = h("div", { class: "sc-replies" });
      replies.forEach(function (r) { list.appendChild(renderNoteBody(r, false, false)); });
      pop.appendChild(list);
    }

    var ta = h("textarea", { class: "sc-textarea sc-textarea--reply", rows: "2", maxlength: "4000", placeholder: "Reply…", "aria-label": "Your reply" });
    ta.value = draftText;
    var err = h("div", { class: "sc-field-error", role: "alert" });
    var btn = h("button", { type: "button", class: "sc-btn sc-btn--primary sc-btn--small", text: "Reply" });
    function doReply() {
      var body = ta.value.trim();
      if (!body) { err.textContent = "Write something first."; ta.focus(); return; }
      err.textContent = "";
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
          ta.value = "";
          renderThread();
          renderDrawer();
          renderGeneral();
          toast("Reply posted");
        })
        .catch(function () {
          btn.disabled = false;
          toast("Couldn't post your reply. Check your connection and try again.", { kind: "error" });
        });
    }
    btn.addEventListener("click", doReply);
    ta.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); doReply(); }
    });
    pop.appendChild(h("div", { class: "sc-reply-box" }, ta, err, h("div", { class: "sc-pop-actions" }, btn)));
  }

  function renderNoteBody(note, isRoot, confirming) {
    var mine = currentKey() && note.reviewer_key === currentKey();
    var wrap = h("div", { class: "sc-note" + (isRoot ? " sc-note--root" : " sc-note--reply") });
    var meta = h("div", { class: "sc-note-meta" },
      h("span", { class: "sc-name", text: nameOfRow(note) }),
      h("time", { class: "sc-time", datetime: note.created_at || "", text: relTime(note.created_at) })
    );
    wrap.appendChild(meta);
    wrap.appendChild(h("div", { class: "sc-note-body", text: String(note.body || "") }));
    if (mine) {
      var actions = h("div", { class: "sc-note-actions" });
      function showConfirm() {
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        var c = h("span", { class: "sc-confirm" },
          h("span", { text: "Remove this note? " }),
          h("button", { type: "button", class: "sc-link sc-link--danger", text: "Remove", onclick: function () { removeNote(note, c); } }),
          h("span", { text: " / " }),
          h("button", { type: "button", class: "sc-link", text: "Keep", onclick: showRemove })
        );
        actions.appendChild(c);
        var first = c.querySelector("button");
        if (first) first.focus();
      }
      function showRemove() {
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        actions.appendChild(h("button", { type: "button", class: "sc-link", text: "Remove", onclick: showConfirm }));
      }
      if (confirming && isRoot) showConfirm(); else showRemove();
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
        if (note.kind !== "reply") {
          repliesOf(id).forEach(function (r) { state.notes.delete(String(r.id)); });
        }
        if (String(state.openNote) === id) closeThread();
        else if (ui.thread) renderThread();
        renderAll();
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
      var header = s.el.querySelector(":scope > header, :scope > h1, :scope > h2, :scope > h3");
      if (header && header.parentNode === s.el) {
        if (header.nextSibling) s.el.insertBefore(wrap, header.nextSibling); else s.el.appendChild(wrap);
      } else {
        s.el.insertBefore(wrap, s.el.firstChild);
      }
    });
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
          h("span", { class: "sc-time", text: relTime(n.created_at) })
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

  function renderStances() {
    var latest = latestStances();
    var me = currentKey();
    Array.prototype.forEach.call(document.querySelectorAll("[data-stance]"), function (mount) {
      var target = mount.getAttribute("data-stance");
      if (!target) return;
      if (!mount.dataset.scMounted) {
        mount.dataset.scMounted = "1";
        mount.classList.add("sc-ui", "sc-stance");
        var title = mount.getAttribute("data-stance-title") || target;
        var group = h("div", { class: "sc-stance-row", role: "group", "aria-label": "Your stance on " + title });
        STANCE_OPTIONS.forEach(function (opt) {
          var b = h("button", { type: "button", class: "sc-stance-btn sc-stance-btn--" + opt.value, dataset: { value: opt.value }, "aria-pressed": "false", text: opt.label });
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
      while (tally.firstChild) tally.removeChild(tally.firstChild);
      var parts = [];
      STANCE_OPTIONS.forEach(function (opt) {
        var names = [];
        perKey.forEach(function (row) { if (row.stance === opt.value) names.push(nameOfRow(row)); });
        if (names.length) parts.push(opt.short + ": " + names.join(", "));
      });
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
        if (saved && saved.id !== undefined) state.stances.set(String(saved.id), saved);
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
      var all = h("button", { type: "button", class: "sc-filter", "aria-pressed": state.filter ? "false" : "true", text: "Everyone", onclick: function () { state.filter = null; renderDrawer(); } });
      chips.appendChild(all);
      keys.forEach(function (name, key) {
        chips.appendChild(h("button", { type: "button", class: "sc-filter", "aria-pressed": state.filter === key ? "true" : "false", text: name, onclick: function () {
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
      return;
    }
    var groups = new Map();
    state.sections.forEach(function (s) { groups.set(s.id, { title: s.title, notes: [] }); });
    var elsewhere = { title: "Elsewhere", notes: [] };
    var general = { title: "General", notes: [] };
    notes.forEach(function (note) {
      if (note.kind === "general") { general.notes.push(note); return; }
      var g = note.section_id ? groups.get(note.section_id) : null;
      if (g) g.notes.push(note); else elsewhere.notes.push(note);
    });
    var ordered = Array.from(groups.values()).concat([elsewhere, general]);
    ordered.forEach(function (g) {
      if (!g.notes.length) return;
      var sec = h("section", { class: "sc-drawer-group" });
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
        h("span", { class: "sc-time", text: relTime(note.created_at) }),
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
    ui.scrim.addEventListener("click", function () { closeComposer(); closeThread(); closeDrawer(); });
    layer.appendChild(ui.scrim);

    ui.pill = h("button", { type: "button", class: "sc-pill", hidden: true }, svgIcon("0 0 24 24", [ICON_PEN]), h("span", { text: "Leave a note" }));
    ui.pill.addEventListener("mousedown", function (e) { e.preventDefault(); });
    ui.pill.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") e.preventDefault(); });
    ui.pill.addEventListener("click", function () {
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

    // escape
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (ui.gate) return;
      if (ui.composer) { e.preventDefault(); closeComposer(); return; }
      if (ui.thread) { e.preventDefault(); closeThread(); return; }
      if (ui.drawerOpen) { e.preventDefault(); closeDrawer(); return; }
      if (ui.pill && !ui.pill.hidden) hidePill();
    });

    // click outside popovers
    document.addEventListener("pointerdown", function (e) {
      var t = e.target;
      if (ui.composer && !ui.composer.contains(t) && !(ui.pill && ui.pill.contains(t))) closeComposer();
      if (ui.thread && !ui.thread.contains(t)) {
        var mark = t && t.closest ? t.closest("mark.sc-mark[data-note]") : null;
        if (!mark || mark.dataset.note !== String(state.openNote)) closeThread();
      }
    }, true);

    window.addEventListener("resize", function () {
      readInsets();
      showScrim();
      if (ui.pill && !ui.pill.hidden) { ui.pill.classList.toggle("sc-pill--bar", isPhone()); repositionPill(); }
      if (ui.composer) placePopover(ui.composer, state.composer && state.composer.kind === "highlight" ? rectOfSelectionOrAnchor(state.composer.anchor) : (state.composer && state.composer.anchorEl ? state.composer.anchorEl.getBoundingClientRect() : null));
      if (ui.thread) placePopover(ui.thread, ui.threadAnchor ? ui.threadAnchor.getBoundingClientRect() : null);
    });
    window.addEventListener("scroll", function () { if (ui.pill && !ui.pill.hidden) repositionPill(); }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && state.loaded) refresh();
    });
    setInterval(function () { if (document.visibilityState === "visible" && state.loaded) refresh(); }, REFRESH_MS);
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

  // ------------------------------------------------------------------ data flow

  function mergeNotes(rows) {
    var next = new Map();
    rows.forEach(function (r) { if (r && r.id !== undefined && !r.deleted_at) next.set(String(r.id), r); });
    state.notes = next;
  }
  function mergeStances(rows) {
    var next = new Map();
    rows.forEach(function (r) { if (r && r.id !== undefined) next.set(String(r.id), r); });
    // keep optimistic rows that have not resolved yet
    state.stances.forEach(function (r, id) { if (String(id).indexOf("tmp-") === 0) next.set(id, r); });
    state.stances = next;
  }

  var refreshing = false;
  function refresh() {
    if (refreshing) return Promise.resolve();
    refreshing = true;
    return Promise.allSettled([fetchNotes(), fetchStances()]).then(function (results) {
      refreshing = false;
      var changed = false;
      if (results[0].status === "fulfilled") { mergeNotes(results[0].value); changed = true; }
      if (results[1].status === "fulfilled") { mergeStances(results[1].value); changed = true; }
      if (changed) renderAll();
      if (results[0].status === "rejected" && results[1].status === "rejected") toast("Couldn't refresh notes. Check your connection.", { kind: "error" });
    });
  }

  function renderAll() {
    blockOrder = null;
    renderMarks();
    renderStances();
    renderGeneral();
    renderDrawer();
    if (ui.thread) {
      if (state.notes.has(String(state.openNote))) { setHot(state.openNote, true); renderThread(); }
      else closeThread();
    }
  }

  function boot() {
    buildLayer();
    indexPage();
    renderSectionLinks();
    renderTutorialMount();
    bindEvents();

    state.reviewer = loadReviewer();
    renderChip();
    if (state.reviewer) recordVisit(false); else openGate(1);

    Promise.allSettled([fetchNotes(), fetchStances(), fetchVisits()]).then(function (results) {
      if (results[0].status === "fulfilled") mergeNotes(results[0].value);
      if (results[1].status === "fulfilled") mergeStances(results[1].value);
      if (results[2].status === "fulfilled") state.visits = results[2].value.concat(state.visits);
      state.loaded = true;
      renderAll();
      renderReviewers();
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
