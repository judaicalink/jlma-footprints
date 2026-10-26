/* Footprints on JudaicaLink Mannheim (jlma-footprints): where Jewish books were printed and where their copies
   went. Plain JavaScript, no libraries; the base map and the data come from this site (decision 0001). The map
   engine (projection, base map, panning and zooming, timeline, area, search, address) is the one of jlma-atlas. */
(function () {
  "use strict";

  const app = document.getElementById("main");
  const BASE = app.dataset.base;
  const D = "http://data.judaicalink.org";
  const FP = D + "/data/footprints/";
  const SITE = "https://footprints.ctl.columbia.edu/";
  const NOW = 2026;
  const KIND_PLURAL = ["imprints printed", "footprints"];
  const KIND_ONE = ["imprint printed", "footprint"];

  // ---- state -------------------------------------------------------------------------------------------------
  const DEFAULTS = () => ({ from: null, to: NOW, area: null, kinds: [true, true, true], medium: -1, sel: null,
    view: null, missing: null });
  const S = DEFAULTS();
  let A = null;        // the data
  let BM = null;       // the base map
  let V = null;        // what the filters let through

  // ---- helpers -----------------------------------------------------------------------------------------------
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }
  const keep = (kids) => kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false);
  const fmt = (n) => n.toLocaleString("en");
  const fold = (s) => s.normalize("NFD").replace(/[̀-֑ͯ-ׇ]/g, "").toLowerCase();
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  // the platform's view of a record (platform decision 0002) and its page on the Footprints site
  const view_ = (kind, id) => `/data/footprints/${kind}/${id}`;
  const sitePage = (kind, id) => `${SITE}${kind}/${id}/`;

  // ---- data --------------------------------------------------------------------------------------------------
  function groups(n, key) {        // index lists: for each of n targets, the items whose key is the target
    const start = new Int32Array(n + 1);
    for (const k of key) if (k >= 0) start[k + 1]++;
    for (let i = 0; i < n; i++) start[i + 1] += start[i];
    const list = new Int32Array(start[n]), fill = start.slice(0, n);
    key.forEach((k, i) => { if (k >= 0) list[fill[k]++] = i; });
    return { start, list, of: (t) => Array.from(list.subarray(start[t], start[t + 1])) };
  }
  function decode(d) {
    const P = d.places.id.length;
    const px = new Float64Array(P), py = new Float64Array(P);
    for (let i = 0; i < P; i++) [px[i], py[i]] = project(d.places.lon[i], d.places.lat[i]);
    const W = d.works.id.length, I = d.imprints.id.length, Cn = d.copies.id.length, F = d.footprints.id.length;
    const im = d.imprints, fp = d.footprints, cp = d.copies;
    const iY0 = Int16Array.from(im.y0), iY1 = Int16Array.from(im.y1), iPl = Int32Array.from(im.place);
    const fY0 = Int16Array.from(fp.y0), fY1 = Int16Array.from(fp.y1), fPl = Int32Array.from(fp.place);
    const fCopy = Int32Array.from(fp.copy), cImp = Int32Array.from(cp.imprint), iWork = Int32Array.from(im.work);
    const workImprints = groups(W, iWork), imprintCopies = groups(I, cImp), copyFps = groups(Cn, fCopy);
    // the stations of a copy: its printing, then its footprints by date (undated ones last, not on its way)
    const stations = (c) => {
      const i = cImp[c], out = [];
      if (i >= 0) out.push({ t: "i", i, p: iPl[i], y0: iY0[i], y1: iY1[i] });
      const fs = copyFps.of(c).map((f) => ({ t: "f", i: f, p: fPl[f], y0: fY0[f], y1: fY1[f] }));
      fs.sort((a, b) => (a.y0 || 9999) - (b.y0 || 9999) || (a.y1 || 9999) - (b.y1 || 9999) || fp.id[a.i] - fp.id[b.i]);
      return out.concat(fs);
    };
    // the steps of the journeys: two consecutive dated stations at different places (the printing counts as first
    // station also without a year); the time of a step is the time of its later station
    const sA = [], sB = [], sY0 = [], sY1 = [], sC = [], sF = [];
    for (let c = 0; c < Cn; c++) {
      let prev = null;
      for (const s of stations(c)) {
        if (s.t === "f" && !s.y0) break;
        if (s.p < 0) continue;
        if (prev && prev.p !== s.p && s.y0) { sA.push(prev.p); sB.push(s.p); sY0.push(s.y0); sY1.push(s.y1); sC.push(c); sF.push(s.t === "f" ? s.i : -1); }
        prev = s;
      }
    }
    // records by person
    const byPerson = new Map();
    const pr = (ao, a, type, n) => {
      for (let r = 0; r < n; r++) for (let j = ao[r]; j < ao[r + 1]; j++) {
        const role = a[2 * j], person = a[2 * j + 1];
        if (!byPerson.has(person)) byPerson.set(person, []);
        byPerson.get(person).push([type, r, role]);
      }
    };
    pr(d.works.ao, d.works.a, "w", W); pr(im.ao, im.a, "i", I); pr(fp.ao, fp.a, "f", F);
    cp.owner.forEach((o, c) => { if (o >= 0) { if (!byPerson.has(o)) byPerson.set(o, []); byPerson.get(o).push(["c", c, -1]); } });
    const idMap = (ids) => { const m = new Map(); ids.forEach((id, i) => m.set(String(id), i)); return m; };
    return {
      raw: d, P, W, I, Cn, F, px, py, lon: d.places.lon, lat: d.places.lat, plabel: d.places.label, pid: d.places.id,
      pcountry: Int16Array.from(d.places.country), countries: d.countries, roles: d.roles, media: d.media,
      pname: d.persons.name, perId: d.persons.id, wtitle: d.works.title, wid: d.works.id, wao: d.works.ao, wa: d.works.a,
      iid: im.id, ititle: im.title, idate: im.date, iY0, iY1, iPl, iWork, iao: im.ao, ia: im.a,
      cid: cp.id, cImp, ccall: cp.call, cowner: cp.owner,
      fid: fp.id, fCopy, fPl, fY0, fY1, fdate: fp.date, fmed: Uint8Array.from(fp.medium), fflags: Uint8Array.from(fp.flags),
      fao: fp.ao, fa: fp.a,
      workImprints, imprintCopies, copyFps, stations,
      S: sA.length, sA: Int32Array.from(sA), sB: Int32Array.from(sB), sY0: Int16Array.from(sY0), sY1: Int16Array.from(sY1),
      sC: Int32Array.from(sC), sF: Int32Array.from(sF), byPerson,
      placeById: idMap(d.places.id), workById: idMap(d.works.id), impById: idMap(im.id), copyById: idMap(cp.id),
      fpById: idMap(fp.id), personById: idMap(d.persons.id),
    };
  }
  const actorsOf = (ao, a, r) => { const out = []; for (let j = ao[r]; j < ao[r + 1]; j++) out.push([a[2 * j], a[2 * j + 1]]); return out; };
  const workOfCopy = (c) => A.cImp[c] >= 0 ? A.iWork[A.cImp[c]] : -1;
  const imprintTitle = (i) => A.ititle[i] || (A.iWork[i] >= 0 ? A.wtitle[A.iWork[i]] : "") || "(no title)";
  const copyTitle = (c) => { const w = workOfCopy(c); return w >= 0 ? A.wtitle[w] : A.cImp[c] >= 0 ? imprintTitle(A.cImp[c]) : "(no title)"; };

  // ---- filters -----------------------------------------------------------------------------------------------
  const lo = () => (S.from === null ? -9999 : S.from);
  const inT = (y0, y1) => y0 > 0 && y1 >= lo() && y0 <= S.to;
  function areaTest() {
    const a = S.area;
    if (!a) return null;
    const t = new Uint8Array(A.P);
    for (let p = 0; p < A.P; p++) {
      t[p] = a.type === "country" ? A.pcountry[p] === a.i
        : (A.lon[p] >= a.w && A.lon[p] <= a.e && A.lat[p] >= a.s && A.lat[p] <= a.n) ? 1 : 0;
    }
    return t;
  }
  const medOk = (f) => S.medium < 0 || A.fmed[f] === S.medium;
  const impVisible = (i) => S.kinds[0] && A.iPl[i] >= 0 && inT(A.iY0[i], A.iY1[i]) && (!inArea || inArea[A.iPl[i]]);
  const fpVisible = (f) => S.kinds[1] && A.fPl[f] >= 0 && inT(A.fY0[f], A.fY1[f]) && medOk(f) && (!inArea || inArea[A.fPl[f]]);
  const stepVisible = (s) => S.kinds[2] && inT(A.sY0[s], A.sY1[s]) && (A.sF[s] < 0 || medOk(A.sF[s]))
    && (!inArea || inArea[A.sA[s]] || inArea[A.sB[s]]);

  let inArea = null;
  function compute() {
    const P = A.P, counts = new Int32Array(P * 2);
    let nI = 0, nF = 0, nS = 0;
    for (let i = 0; i < A.I; i++) if (impVisible(i)) { counts[A.iPl[i] * 2]++; nI++; }
    for (let f = 0; f < A.F; f++) if (fpVisible(f)) { counts[A.fPl[f] * 2 + 1]++; nF++; }
    const pairs = new Map();
    for (let s = 0; s < A.S; s++) {
      if (!stepVisible(s)) continue;
      nS++;
      const key = A.sA[s] * P + A.sB[s];
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    const places = [];
    for (let p = 0; p < P; p++) if (counts[2 * p] + counts[2 * p + 1]) places.push(p);
    const tot = (p) => counts[2 * p] + counts[2 * p + 1];
    places.sort((a, b) => tot(b) - tot(a));
    V = { counts, places, pairs, tot, nI, nF, nS };
  }

  // ---- projection and view -----------------------------------------------------------------------------------
  const W0 = 256;
  function project(lon, lat) {
    const f = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return [(lon + 180) / 360 * W0, (1 - Math.log(Math.tan(Math.PI / 4 + f / 2)) / Math.PI) / 2 * W0];
  }
  function unproject(x, y) {
    return [x / W0 * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / W0))) * 180 / Math.PI];
  }
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  let CW = 0, CH = 0, DPR = 1;
  const view = { cx: 0, cy: 0, z: 3 };
  const K = () => Math.pow(2, view.z);
  function toScreen(x, y) { const k = K(); return [(x - view.cx) * k + CW / 2, (y - view.cy) * k + CH / 2]; }
  function toWorld(sx, sy) { const k = K(); return [(sx - CW / 2) / k + view.cx, (sy - CH / 2) / k + view.cy]; }
  function minZ() { return Math.log2(Math.max(CW, 300) / W0) - 0.4; }
  function clampView() {
    view.z = Math.max(minZ(), Math.min(13, view.z));
    const k = K(), hw = CW / 2 / k, hh = CH / 2 / k;
    view.cx = hw * 2 >= W0 ? W0 / 2 : Math.max(hw, Math.min(W0 - hw, view.cx));
    view.cy = hh * 2 >= W0 * 0.86 ? W0 * 0.43 : Math.max(hh + W0 * 0.03, Math.min(W0 * 0.83 - hh, view.cy));
  }
  function fitBounds(w, s, e, n, pad) {
    const [x0, y1] = project(w, s), [x1, y0] = project(e, n);
    const p = pad === undefined ? 40 : pad;
    const zx = Math.log2((CW - 2 * p) / Math.max(x1 - x0, 1e-4)), zy = Math.log2((CH - 2 * p) / Math.max(y1 - y0, 1e-4));
    view.z = Math.min(zx, zy, 9);
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
    clampView();
  }
  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    CW = r.width; CH = r.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    const tr = tl.getBoundingClientRect();
    tl.width = Math.round(tr.width * DPR); tl.height = Math.round(tr.height * DPR);
    if (A) { clampView(); render(); renderTimeline(); }
  }

  // ---- base map ----------------------------------------------------------------------------------------------
  let paths = null;
  function decodeLine(flat, q, path, close) {
    let x = 0, y = 0;
    for (let i = 0; i < flat.length; i += 2) {
      x += flat[i]; y += flat[i + 1];
      const [wx, wy] = project(x / q, y / q);
      if (i === 0) path.moveTo(wx, wy); else path.lineTo(wx, wy);
    }
    if (close) path.closePath();
  }
  function buildPaths(bm) {
    const q = bm.q, land = new Path2D(), lakes = new Path2D(), rivers = new Path2D(), country = [];
    for (const c of bm.countries) {
      const p = new Path2D();
      for (const r of c.p) decodeLine(r, q, p, true);
      land.addPath(p);
      country.push(p);
    }
    for (const r of bm.lakes) decodeLine(r, q, lakes, true);
    for (const l of bm.rivers) decodeLine(l, q, rivers, false);
    return { land, lakes, rivers, country };
  }

  // ---- colours -----------------------------------------------------------------------------------------------
  let C = {};
  function readColours() {
    C = {
      sea: css("--fp-sea"), land: css("--fp-land"), border: css("--fp-border"), river: css("--fp-river"),
      label: css("--fp-label"), k: [css("--fp-k0"), css("--fp-k1")], line: css("--fp-line"), way: css("--fp-way"),
      scrim: css("--fp-scrim"), ring: css("--fp-ring"), sel: css("--fp-sel"), bar: css("--fp-bar"),
      brush: css("--fp-brush"), muted: css("--jl-muted"), accent: css("--jl-accent"),
    };
  }

  // ---- map rendering -----------------------------------------------------------------------------------------
  let drawn = [];          // [p, sx, sy, r] of the drawn places, for hovering
  let drawRect = null;     // the rectangle being drawn (screen)
  let hoverP = -1;
  function radius(n) {
    const s = 0.5 * Math.pow(1.38, view.z - 4);
    return Math.min(5 + 3.2 * Math.max(view.z, 2), 1.6 + s * Math.sqrt(n));
  }
  let pending = false;
  function render() {
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
  }
  function draw() {
    if (!A || !paths) return;
    const k = K();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = C.sea; ctx.fillRect(0, 0, CW, CH);
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * (CW / 2 - view.cx * k), DPR * (CH / 2 - view.cy * k));
    ctx.fillStyle = C.land; ctx.fill(paths.land);
    ctx.fillStyle = C.sea; ctx.fill(paths.lakes);
    ctx.lineJoin = "round";
    if (view.z > 3.2) { ctx.strokeStyle = C.river; ctx.lineWidth = 0.9 / k; ctx.stroke(paths.rivers); }
    ctx.strokeStyle = C.border; ctx.lineWidth = 0.7 / k; ctx.stroke(paths.land);
    if (S.area) {
      ctx.fillStyle = C.scrim;
      const p = new Path2D(); p.rect(-W0, -W0, 3 * W0, 3 * W0);
      if (S.area.type === "country") {
        p.addPath(paths.country[S.area.i]); ctx.fill(p, "evenodd");
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5 / k; ctx.stroke(paths.country[S.area.i]);
      } else {
        const [x0, y1] = project(S.area.w, S.area.s), [x1, y0] = project(S.area.e, S.area.n);
        p.rect(x0, y0, x1 - x0, y1 - y0); ctx.fill(p, "evenodd");
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5 / k; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const hasSel = !!S.sel && S.sel.type !== "place";
    // journeys, as one line per pair of places and direction
    ctx.lineCap = "round";
    ctx.strokeStyle = C.line;
    // many lines: a single step faint, frequent ways stronger
    const dense = V.pairs.size > 300;
    for (const [key, n] of V.pairs) {
      const a = dense ? Math.min(0.75, 0.05 + 0.09 * Math.log2(1 + n)) : 0.55;
      ctx.globalAlpha = hasSel ? a * 0.25 : a;
      ctx.lineWidth = Math.min(5, 0.7 + Math.log2(n) * 0.7);
      arc(Math.floor(key / A.P), key % A.P);
    }
    ctx.globalAlpha = 1;
    // places
    drawn = [];
    for (const p of V.places) {
      const [sx, sy] = toScreen(A.px[p], A.py[p]);
      const R = radius(V.tot(p));
      if (sx < -R || sy < -R || sx > CW + R || sy > CH + R) continue;
      const ks = [0, 1].filter((kk) => V.counts[p * 2 + kk] > 0).sort((a, b) => V.counts[p * 2 + b] - V.counts[p * 2 + a]);
      for (const kk of ks) {
        const r = radius(V.counts[p * 2 + kk]);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI);
        ctx.fillStyle = C.k[kk]; ctx.globalAlpha = hasSel ? 0.5 : 0.88; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = r > 3 ? 1.5 : 1; ctx.strokeStyle = C.ring; ctx.stroke();
      }
      drawn.push([p, sx, sy, R]);
    }
    if (hasSel) drawSelection();
    if (S.sel && S.sel.type === "place") ringAt(S.sel.i, C.sel, 2.5);
    if (hoverP >= 0) ringAt(hoverP, C.sel, 1.5);
    drawLabels();
    if (drawRect) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(drawRect[0], drawRect[1], drawRect[2] - drawRect[0], drawRect[3] - drawRect[1]);
      ctx.setLineDash([]);
    }
  }
  // a curve from pa to pb that bends to the right of the way, so that the two directions are apart
  function arc(pa, pb, arrow) {
    const [x0, y0] = toScreen(A.px[pa], A.py[pa]), [x1, y1] = toScreen(A.px[pb], A.py[pb]);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const cx = mx - dy * 0.18, cy = my + dx * 0.18;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
    if (arrow) {
      const len = Math.hypot(dx, dy);
      if (len < 18) return;
      // the point and direction of the curve a little before its end
      const t = Math.max(0.5, 1 - 9 / len), u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      const a = Math.atan2(ty, tx), h = 8;
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px - h * Math.cos(a - 0.45), py - h * Math.sin(a - 0.45));
      ctx.lineTo(px - h * Math.cos(a + 0.45), py - h * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fill();
    }
  }
  function ringAt(p, colour, w) {
    const [sx, sy] = toScreen(A.px[p], A.py[p]);
    const r = Math.max(5, radius(V.tot(p) || 1)) + 3;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI);
    ctx.lineWidth = w + 2; ctx.strokeStyle = C.ring; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = colour; ctx.stroke();
  }
  function marker(p, label, colour) {
    const [sx, sy] = toScreen(A.px[p], A.py[p]);
    ctx.beginPath(); ctx.arc(sx, sy, label ? 9 : 6, 0, 2 * Math.PI);
    ctx.fillStyle = colour; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ring; ctx.stroke();
    if (label) {
      ctx.fillStyle = C.ring; ctx.font = "bold 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, sx, sy + 0.5); ctx.textAlign = "left";
    }
  }
  // the copies of the selection (a copy, an imprint, a work), or null
  function selCopies() {
    const s = S.sel;
    if (!s) return null;
    if (s.type === "copy") return [s.i];
    if (s.type === "imprint") return A.imprintCopies.of(s.i);
    if (s.type === "work") return A.workImprints.of(s.i).flatMap((i) => A.imprintCopies.of(i));
    return null;
  }
  function wayOf(c) { return A.stations(c).filter((st) => st.p >= 0 && (st.t === "i" || st.y0)); }
  function drawSelection() {
    const s = S.sel;
    ctx.strokeStyle = C.way; ctx.fillStyle = C.way; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    if (s.type === "copy") {
      const way = wayOf(s.i);
      for (let n = 1; n < way.length; n++) if (way[n].p !== way[n - 1].p) arc(way[n - 1].p, way[n].p, true);
      // numbered stations: one marker per place, with the numbers of its stations
      const at = new Map();
      way.forEach((st, n) => { if (!at.has(st.p)) at.set(st.p, []); at.get(st.p).push(n + 1); });
      for (const [p, ns] of at) marker(p, ns.length > 2 ? `${ns[0]}…` : ns.join(","), way[ns[0] - 1].t === "i" ? C.k[0] : C.k[1]);
      return;
    }
    const copies = selCopies();
    if (copies) {
      const seen = new Set(), places = new Map();
      ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      for (const c of copies) {
        const way = wayOf(c);
        way.forEach((st) => { if (!places.has(st.p)) places.set(st.p, st.t); });
        for (let n = 1; n < way.length; n++) {
          const a = way[n - 1].p, b = way[n].p, key = a * A.P + b;
          if (a === b || seen.has(key)) continue;
          seen.add(key); arc(a, b, true);
        }
      }
      ctx.globalAlpha = 1;
      for (const [p, t] of places) marker(p, "", t === "i" ? C.k[0] : C.k[1]);
      return;
    }
    if (s.type === "person") {
      for (const p of personPlaces(s.i)) ringAt(p, C.way, 2.5);
    }
  }
  function personPlaces(n) {
    const ps = new Set();
    for (const [t, r] of A.byPerson.get(n) || []) {
      if (t === "i" && A.iPl[r] >= 0) ps.add(A.iPl[r]);
      if (t === "f" && A.fPl[r] >= 0) ps.add(A.fPl[r]);
    }
    return [...ps];
  }
  function selPlaces() {
    const s = S.sel;
    if (!s) return [];
    if (s.type === "place") return [s.i];
    if (s.type === "person") return personPlaces(s.i);
    const cs = selCopies() || [];
    const ps = new Set();
    for (const c of cs) for (const st of wayOf(c)) ps.add(st.p);
    return [...ps];
  }
  function drawLabels() {
    ctx.font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";
    const boxes = [], want = selPlaces().slice(0, 40);
    const limit = Math.max(12, Math.round(CW * CH / 26000));
    for (const d of drawn.slice().sort((a, b) => b[3] - a[3]).slice(0, limit)) want.push(d[0]);
    const seen = new Set();
    for (const p of want) {
      if (seen.has(p)) continue;
      seen.add(p);
      const [sx, sy] = toScreen(A.px[p], A.py[p]);
      if (sx < 0 || sy < 0 || sx > CW || sy > CH) continue;
      const r = Math.max(9, radius(V.tot(p) || 1));
      const t = shortPlace(p), w = ctx.measureText(t).width;
      const box = [sx + r + 3, sy - 8, sx + r + 5 + w, sy + 8];
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      ctx.lineWidth = 3; ctx.strokeStyle = C.land; ctx.lineJoin = "round";
      ctx.strokeText(t, box[0], sy); ctx.fillStyle = C.label; ctx.fillText(t, box[0], sy);
    }
  }
  const shortPlace = (p) => (A.plabel[p] || "").split(",")[0];

  // ---- map interaction ---------------------------------------------------------------------------------------
  const tip = document.getElementById("tip");
  let drawing = false;
  const pointers = new Map();
  let dragStart = null, pinch = null, moved = false;
  function placeAt(sx, sy) {
    let best = -1, bestR = Infinity, near = -1, nearD = 14;
    for (const [p, x, y, r] of drawn) {
      const d = Math.hypot(sx - x, sy - y);
      if (d <= r + 3 && r < bestR) { best = p; bestR = r; }
      if (d < nearD) { near = p; nearD = d; }
    }
    return best >= 0 ? best : near;
  }
  function showTip(p, sx, sy) {
    if (p < 0) { tip.hidden = true; return; }
    tip.replaceChildren(el("b", { text: A.plabel[p] }));
    for (let k = 0; k < 2; k++) {
      const n = V.counts[p * 2 + k];
      if (!n) continue;
      const i = el("i"); i.style.background = C.k[k];
      tip.append(el("div", { class: "fp-row" }, i, el("strong", { text: fmt(n) }), " " + (n === 1 ? KIND_ONE[k] : KIND_PLURAL[k])));
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(CW - w - 6, sx + 14) + "px";
    tip.style.top = Math.max(6, sy - h - 10) + "px";
  }
  cv.addEventListener("pointerdown", (ev) => {
    cv.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    moved = false;
    if (drawing) { drawRect = [ev.offsetX, ev.offsetY, ev.offsetX, ev.offsetY]; return; }
    if (pointers.size === 1) dragStart = [ev.offsetX, ev.offsetY, view.cx, view.cy];
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = [Math.hypot(a[0] - b[0], a[1] - b[1]), view.z];
      dragStart = null;
    }
  });
  cv.addEventListener("pointermove", (ev) => {
    if (!A) return;
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    if (drawing && drawRect) { drawRect[2] = ev.offsetX; drawRect[3] = ev.offsetY; render(); return; }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch[1] + Math.log2(d / pinch[0]) - view.z);
      moved = true;
      return;
    }
    if (dragStart && pointers.size === 1) {
      const dx = ev.offsetX - dragStart[0], dy = ev.offsetY - dragStart[1];
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        cv.classList.add("fp-dragging");
        view.cx = dragStart[2] - dx / K(); view.cy = dragStart[3] - dy / K();
        clampView(); tip.hidden = true; render(); saveSoon();
      }
      return;
    }
    const p = placeAt(ev.offsetX, ev.offsetY);
    if (p !== hoverP) { hoverP = p; render(); }
    cv.classList.toggle("fp-hover", p >= 0);
    showTip(p, ev.offsetX, ev.offsetY);
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    cv.classList.remove("fp-dragging");
    if (drawing && drawRect) {
      const [x0, y0, x1, y1] = drawRect;
      drawRect = null;
      setDrawing(false);
      if (Math.abs(x1 - x0) > 8 && Math.abs(y1 - y0) > 8) {
        const [w, n] = unproject(...toWorld(Math.min(x0, x1), Math.min(y0, y1)));
        const [e, s] = unproject(...toWorld(Math.max(x0, x1), Math.max(y0, y1)));
        setArea({ type: "box", w: +w.toFixed(2), s: +s.toFixed(2), e: +e.toFixed(2), n: +n.toFixed(2) }, false);
      } else render();
      return;
    }
    if (pointers.size < 2) pinch = null;
    if (ev.type === "pointerup" && !moved && pointers.size === 0 && dragStart) {
      const p = placeAt(ev.offsetX, ev.offsetY);
      select(p >= 0 ? { type: "place", i: p } : null);
    }
    if (pointers.size === 0) dragStart = null;
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("pointerleave", () => { if (hoverP >= 0) { hoverP = -1; render(); } tip.hidden = true; });
  function zoomAt(sx, sy, dz) {
    const [wx, wy] = toWorld(sx, sy);
    view.z += dz; clampView();
    const k = K();
    view.cx = wx - (sx - CW / 2) / k; view.cy = wy - (sy - CH / 2) / k;
    clampView(); render(); saveSoon();
  }
  cv.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const dz = -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0022);
    zoomAt(ev.offsetX, ev.offsetY, Math.max(-1, Math.min(1, dz)));
  }, { passive: false });
  cv.addEventListener("dblclick", (ev) => zoomAt(ev.offsetX, ev.offsetY, ev.shiftKey ? -1 : 1));
  cv.addEventListener("keydown", (ev) => {
    const step = 80 / K();
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (keys[ev.key]) { view.cx += keys[ev.key][0]; view.cy += keys[ev.key][1]; clampView(); render(); saveSoon(); }
    else if (ev.key === "+" || ev.key === "=") zoomAt(CW / 2, CH / 2, 0.5);
    else if (ev.key === "-") zoomAt(CW / 2, CH / 2, -0.5);
    else if (ev.key === "Escape") { setDrawing(false); select(null); }
    else return;
    ev.preventDefault();
  });
  document.getElementById("z-in").onclick = () => zoomAt(CW / 2, CH / 2, 1);
  document.getElementById("z-out").onclick = () => zoomAt(CW / 2, CH / 2, -1);
  document.getElementById("z-fit").onclick = () => fitSelection();
  function fitSelection() {
    const ps = selPlaces();
    if (S.sel && S.sel.type === "place") {
      const p = S.sel.i;
      view.cx = A.px[p]; view.cy = A.py[p]; view.z = Math.max(view.z, 6); clampView();
    } else if (ps.length) fitPlaces(ps);
    else if (S.sel) return;
    else if (S.area) fitArea();
    else fitPlaces(V.places.slice(0, 300));
    render(); saveSoon();
  }
  function fitPlaces(ps) {
    if (!ps.length) return;
    let w = 180, e = -180, s = 90, n = -90;
    for (const p of ps) { w = Math.min(w, A.lon[p]); e = Math.max(e, A.lon[p]); s = Math.min(s, A.lat[p]); n = Math.max(n, A.lat[p]); }
    const padLon = Math.max(0.4, (e - w) * 0.1), padLat = Math.max(0.3, (n - s) * 0.1);
    fitBounds(w - padLon, s - padLat, e + padLon, n + padLat, 50);
  }
  function fitArea() {
    const a = S.area;
    if (a.type === "box") fitBounds(a.w, a.s, a.e, a.n);
    else {
      const b = BM.countries[a.i].b, ps = [];
      for (let p = 0; p < A.P; p++) if (A.pcountry[p] === a.i) ps.push(p);
      if (b[2] - b[0] > 90 && ps.length) fitPlaces(ps); else fitBounds(b[0], b[1], b[2], b[3]);
    }
  }

  // ---- timeline ----------------------------------------------------------------------------------------------
  const tl = document.getElementById("tl"), tctx = tl.getContext("2d");
  const T0 = 1450, T1 = 2030, F_EARLY = 0.03;
  const BINS = 1 + (T1 - T0) / 10;    // bin 0: before 1450; then decades
  let hist = null;
  function yearToF(y) {
    if (y === null || y < T0) return F_EARLY * 0.5;
    return F_EARLY + (Math.min(y, T1) - T0) / (T1 - T0) * (1 - F_EARLY);
  }
  function fToYear(f) { return f < F_EARLY ? null : Math.round(T0 + (f - F_EARLY) / (1 - F_EARLY) * (T1 - T0)); }
  function binOf(y) { return y < T0 ? 0 : Math.min(BINS - 1, 1 + Math.floor((y - T0) / 10)); }
  function binF(b) { return b === 0 ? [0, F_EARLY] : [yearToF(T0 + (b - 1) * 10), yearToF(T0 + b * 10)]; }
  function computeHist() {
    hist = new Float32Array(BINS * 2);
    const add = (y0, y1, k) => {
      const b0 = binOf(y0), b1 = binOf(y1), w = 1 / (b1 - b0 + 1);   // a period counts once, spread over its decades
      for (let b = b0; b <= b1; b++) hist[b * 2 + k] += w;
    };
    for (let i = 0; i < A.I; i++) if (S.kinds[0] && A.iPl[i] >= 0 && A.iY0[i] && (!inArea || inArea[A.iPl[i]])) add(A.iY0[i], A.iY1[i], 0);
    for (let f = 0; f < A.F; f++) if (S.kinds[1] && A.fPl[f] >= 0 && A.fY0[f] && medOk(f) && (!inArea || inArea[A.fPl[f]])) add(A.fY0[f], A.fY1[f], 1);
  }
  function renderTimeline() {
    if (!hist) return;
    const W = tl.width / DPR, H = tl.height / DPR, top = 4, axis = 16, hh = H - top - axis;
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.clearRect(0, 0, W, H);
    let max = 1;
    for (let b = 0; b < BINS; b++) max = Math.max(max, hist[b * 2] + hist[b * 2 + 1]);
    const fx = yearToF(S.from) * W, tx = yearToF(S.to) * W;
    tctx.fillStyle = C.brush; tctx.fillRect(S.from === null ? 0 : fx, 0, tx - (S.from === null ? 0 : fx), H - axis + 2);
    for (let b = 0; b < BINS; b++) {
      const [f0, f1] = binF(b);
      const x0 = f0 * W, x1 = f1 * W, gap = x1 - x0 > 4 ? 1 : 0.5;
      let y = top + hh;
      const blo = b === 0 ? -Infinity : T0 + (b - 1) * 10, bhi = b === 0 ? T0 - 1 : blo + 9;
      const inside = bhi >= lo() && blo <= S.to;
      for (let k = 0; k < 2; k++) {
        const v = hist[b * 2 + k];
        if (!v) continue;
        const h = v / max * hh;
        tctx.fillStyle = inside ? C.k[k] : C.bar;
        tctx.fillRect(x0 + gap / 2, y - h, Math.max(0.5, x1 - x0 - gap), h);
        y -= h;
      }
    }
    tctx.fillStyle = C.muted; tctx.font = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    tctx.textBaseline = "top"; tctx.textAlign = "center";
    tctx.fillRect(0, H - axis, W, 1);
    tctx.textAlign = "left"; tctx.fillText("earlier", 0, H - axis + 4); tctx.textAlign = "center";
    let lastX = 40;
    for (let y = 1500; y <= 2000; y += 50) {
      const x = yearToF(y) * W;
      tctx.fillRect(x, H - axis, 1, 4);
      if (x - lastX < 36) continue;
      tctx.fillText(String(y), Math.max(14, Math.min(W - 14, x)), H - axis + 4);
      lastX = x;
    }
    tctx.fillStyle = C.accent;
    for (const x of [S.from === null ? 2 : fx, tx]) {
      tctx.fillRect(x - 1, 0, 2, H - axis + 2);
      tctx.beginPath(); tctx.roundRect(x - 4, (H - axis) / 2 - 9, 8, 18, 3); tctx.fill();
    }
  }
  let tdrag = null;
  tl.addEventListener("pointerdown", (ev) => {
    tl.setPointerCapture(ev.pointerId);
    const W = tl.width / DPR, x = ev.offsetX;
    const fx = S.from === null ? 2 : yearToF(S.from) * W, tx = yearToF(S.to) * W;
    if (Math.abs(x - fx) < 9 && Math.abs(x - fx) <= Math.abs(x - tx)) tdrag = { h: "from" };
    else if (Math.abs(x - tx) < 9) tdrag = { h: "to" };
    else if (x > fx && x < tx) tdrag = { h: "move", x, from: S.from, to: S.to };
    else {
      const y = fToYear(x / W), w = S.to - (S.from === null ? T0 : S.from);
      if (y === null) setTime(null, S.to);
      else setTime(Math.round(y - w / 2), Math.round(y + w / 2));
      tdrag = { h: "move", x, from: S.from, to: S.to };
    }
  });
  tl.addEventListener("pointermove", (ev) => {
    if (!tdrag) return;
    const W = tl.width / DPR, y = fToYear(Math.max(0, Math.min(1, ev.offsetX / W)));
    if (tdrag.h === "from") setTime(y === null ? null : Math.min(y, S.to), S.to);
    else if (tdrag.h === "to") setTime(S.from, Math.max(y === null ? T0 : y, S.from === null ? T0 : S.from));
    else {
      const y0 = fToYear(tdrag.x / W), d = (y === null || y0 === null) ? 0 : y - y0;
      if (tdrag.from === null) setTime(null, tdrag.to + d);
      else setTime(tdrag.from + d, tdrag.to + d);
    }
  });
  const endT = () => { tdrag = null; };
  tl.addEventListener("pointerup", endT);
  tl.addEventListener("pointercancel", endT);
  tl.addEventListener("keydown", (ev) => {
    const d = ev.shiftKey ? 10 : 1;
    if (ev.key === "ArrowLeft") setTime(S.from === null ? null : S.from - d, S.to - d);
    else if (ev.key === "ArrowRight") setTime(S.from === null ? null : S.from + d, S.to + d);
    else return;
    ev.preventDefault();
  });

  // ---- filters -----------------------------------------------------------------------------------------------
  const fFrom = document.getElementById("f-from"), fTo = document.getElementById("f-to");
  const fArea = document.getElementById("f-area"), fDraw = document.getElementById("f-draw");
  const fMed = document.getElementById("f-medium"), fPlay = document.getElementById("f-play");
  fFrom.placeholder = "earliest";
  function setTime(from, to) {
    if (to > NOW) { if (from !== null) from -= to - NOW; to = NOW; }
    if (from !== null && from < T0 - 1) from = null;
    if (to < T0) to = T0;
    if (from !== null && from > to) from = to;
    S.from = from; S.to = to;
    fFrom.value = from === null ? "" : from; fTo.value = to;
    update(false);
  }
  fFrom.addEventListener("change", () => setTime(fFrom.value === "" ? null : Math.round(+fFrom.value), S.to));
  fTo.addEventListener("change", () => setTime(S.from, Math.round(+fTo.value || NOW)));
  function setArea(area, fit) {
    S.area = area;
    inArea = areaTest();
    const boxOpt = fArea.querySelector('option[value="box"]');
    boxOpt.disabled = !(area && area.type === "box");
    fArea.value = !area ? "" : area.type === "box" ? "box" : "c" + area.i;
    if (fit !== false && area) fitArea();
    update(true);
  }
  fArea.addEventListener("change", () => {
    const v = fArea.value;
    setArea(v === "" ? null : v === "box" ? S.area : { type: "country", i: +v.slice(1) });
  });
  function setDrawing(on) {
    drawing = on;
    fDraw.setAttribute("aria-pressed", on ? "true" : "false");
    cv.classList.toggle("fp-drawing", on);
    if (on) cv.focus();
  }
  fDraw.onclick = () => setDrawing(!drawing);
  fMed.addEventListener("change", () => { S.medium = fMed.value === "" ? -1 : +fMed.value; update(true); });
  for (let k = 0; k < 3; k++) {
    document.getElementById("k-" + k).addEventListener("change", (ev) => { S.kinds[k] = ev.target.checked; update(true); });
  }
  let playing = null;
  fPlay.onclick = () => {
    if (playing) { stopPlay(); return; }
    if (S.from === null || S.to >= NOW) setTime(1500, 1525);
    fPlay.setAttribute("aria-pressed", "true"); fPlay.textContent = "Pause";
    let last = performance.now(), acc = 0;
    const step = (t) => {
      acc += (t - last) / 1000 * 8; last = t;      // eight years a second
      if (acc >= 1) {
        const d = Math.floor(acc); acc -= d;
        if (S.to + d > NOW) { setTime(S.from + (NOW - S.to), NOW); stopPlay(); return; }
        setTime(S.from + d, S.to + d);
      }
      playing = requestAnimationFrame(step);
    };
    playing = requestAnimationFrame(step);
  };
  function stopPlay() {
    if (playing) cancelAnimationFrame(playing);
    playing = null; fPlay.setAttribute("aria-pressed", "false"); fPlay.textContent = "Play";
  }
  function update(histToo) {
    if (!A) return;
    if (histToo || !hist) computeHist();
    compute();
    render(); renderTimeline(); renderPanel(); renderLegend(); saveSoon();
  }

  // ---- panel -------------------------------------------------------------------------------------------------
  const panel = document.getElementById("panel");
  const timeText = () => S.from === null ? `until ${S.to}` : S.from === S.to ? `in ${S.from}` : `${S.from}–${S.to}`;
  const areaText = () => !S.area ? "the whole world" : S.area.type === "country" ? A.countries[S.area.i] : "the drawn area";
  const years = (y0, y1, text) => text || (!y0 ? "undated" : y0 === y1 ? String(y0) : `${y0}–${y1}`);
  function link(text, sel, cls) {
    return el("button", { type: "button", class: "fp-link" + (cls ? " " + cls : ""), text, onclick: () => select(sel, true) });
  }
  function dot(k) { const d = el("span", { class: "fp-dot" }); d.style.background = C.k[k]; return d; }
  function out(href, text) { return el("a", { href, class: href.startsWith("http") ? "jl-ext" : null, text }); }
  function closeBtn() { return el("button", { type: "button", class: "fp-btn fp-close", text: "Close", onclick: () => select(null) }); }
  function actorList(actors) {
    const span = el("span");
    actors.forEach(([role, p], n) => {
      if (n) span.append("; ");
      span.append(A.roles[role] + ": ", link(A.pname[p], { type: "person", i: p }));
    });
    return span;
  }
  function more(ul, items, render_, step) {
    let shown = 0;
    const btn = el("button", { type: "button", class: "fp-btn fp-more", text: `Show ${step} more` });
    const show = () => { for (const it of items.slice(shown, shown + step)) ul.append(render_(it)); shown += step; if (shown >= items.length) btn.remove(); };
    show();
    btn.onclick = show;
    return items.length > step ? btn : null;
  }
  function renderPanel() {
    panel.replaceChildren();
    const s = S.sel;
    if (!s) return overviewPanel();
    ({ place: placePanel, work: workPanel, imprint: imprintPanel, copy: copyPanel, person: personPanel })[s.type](s.i);
  }
  function overviewPanel() {
    const sum = el("p", { class: "fp-sum" });
    const parts = [];
    if (S.kinds[0]) parts.push([el("strong", { text: fmt(V.nI) }), ` ${V.nI === 1 ? "imprint" : "imprints"} printed`]);
    if (S.kinds[1]) parts.push([el("strong", { text: fmt(V.nF) }), ` ${V.nF === 1 ? "footprint" : "footprints"}`]);
    if (S.kinds[2]) parts.push([el("strong", { text: fmt(V.nS) }), ` ${V.nS === 1 ? "step" : "steps"} of copies between places`]);
    parts.forEach((p, i) => { if (i) sum.append(i === parts.length - 1 ? " and " : ", "); sum.append(...p); });
    sum.append(` at ${fmt(V.places.length)} places, ${timeText()}, in ${areaText()}.`);
    panel.append(...keep([el("h2", { text: "In the selection" }), sum]));
    if (!V.places.length && !V.nS) {
      panel.append(...keep([el("p", { class: "fp-hint", text: "Nothing on the map for this time and area. Widen the time window or the area." })]));
      return;
    }
    const tb = el("tbody");
    for (const p of V.places.slice(0, 40)) {
      tb.append(el("tr", null, el("td", null, link(shortPlace(p), { type: "place", i: p })),
        el("td", { class: "num", text: V.counts[2 * p] ? fmt(V.counts[2 * p]) : "" }),
        el("td", { class: "num", text: V.counts[2 * p + 1] ? fmt(V.counts[2 * p + 1]) : "" })));
    }
    panel.append(...keep([el("h3", { text: V.places.length > 40 ? `The 40 places with most records (of ${fmt(V.places.length)})` : "Places" }),
      el("table", null, el("thead", null, el("tr", null, el("th", { text: "Place" }), el("th", { class: "num", text: "Printed" }),
        el("th", { class: "num", text: "Footprints" }))), tb)]));
    if (V.pairs.size) {
      const top = [...V.pairs].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const ul = el("ul");
      for (const [key, n] of top) {
        const a = Math.floor(key / A.P), b = key % A.P;
        ul.append(el("li", null, link(shortPlace(a), { type: "place", i: a }), " → ", link(shortPlace(b), { type: "place", i: b }),
          el("span", { class: "fp-meta", text: `${fmt(n)} ${n === 1 ? "step" : "steps"}` })));
      }
      panel.append(...keep([el("h3", { text: "The most frequent ways" }), ul]));
    }
    panel.append(...keep([el("p", { class: "fp-hint" }, "Select a place on the map or in this list, or find a book or a person. ",
      el("a", { href: BASE + "about/", text: "About the map" }))]));
  }
  function placePanel(p) {
    const cname = A.pcountry[p] >= 0 ? A.countries[A.pcountry[p]] : "";
    panel.append(...keep([closeBtn(), el("h2", { text: A.plabel[p] }),
      el("p", { class: "fp-hint" }, cname ? `${cname} (today) · ` : "", out(view_("place", A.pid[p]), "View in JudaicaLink"))]));
    const imps = [], fps = [];
    for (let i = 0; i < A.I; i++) if (A.iPl[i] === p && impVisible(i)) imps.push(i);
    for (let f = 0; f < A.F; f++) if (A.fPl[f] === p && fpVisible(f)) fps.push(f);
    if (!imps.length && !fps.length) panel.append(...keep([el("p", { class: "fp-hint", text: `Nothing here ${timeText()}.` })]));
    if (imps.length) {
      imps.sort((a, b) => A.iY0[a] - A.iY0[b] || imprintTitle(a).localeCompare(imprintTitle(b)));
      const ul = el("ul");
      const btn = more(ul, imps, (i) => el("li", null, dot(0), link(imprintTitle(i), { type: "imprint", i }),
        el("span", { class: "fp-meta", text: years(A.iY0[i], A.iY1[i], A.idate[i]) })), 100);
      panel.append(...keep([el("h3", { text: `${fmt(imps.length)} printed here ${timeText()}` }), ul, btn]));
    }
    if (fps.length) {
      fps.sort((a, b) => A.fY0[a] - A.fY0[b] || A.fid[a] - A.fid[b]);
      const ul = el("ul");
      const btn = more(ul, fps, (f) => {
        const acts = actorsOf(A.fao, A.fa, f);
        return el("li", { class: "fp-li2" }, dot(1), el("div", null, link(copyTitle(A.fCopy[f]), { type: "copy", i: A.fCopy[f], f }),
          acts.length ? el("div", { class: "fp-sub" }, actorList(acts)) : null),
        el("span", { class: "fp-meta", text: years(A.fY0[f], A.fY1[f], A.fdate[f]) }));
      }, 100);
      panel.append(...keep([el("h3", { text: `${fmt(fps.length)} footprints here ${timeText()}` }), ul, btn]));
    }
  }
  function workPanel(w) {
    const acts = actorsOf(A.wao, A.wa, w);
    const imps = A.workImprints.of(w).sort((a, b) => (A.iY0[a] || 9999) - (A.iY0[b] || 9999));
    const nCopies = imps.reduce((n, i) => n + A.imprintCopies.of(i).length, 0);
    panel.append(...keep([closeBtn(), el("h2", { text: A.wtitle[w] || "(no title)" }),
      el("p", null, "A literary work · ", fmt(imps.length), imps.length === 1 ? " imprint · " : " imprints · ", fmt(nCopies),
        nCopies === 1 ? " copy" : " copies"),
      acts.length ? el("p", null, actorList(acts)) : null,
      el("p", { class: "fp-hint" }, out(sitePage("writtenwork", A.wid[w]), "On the Footprints site"), " · ",
        out(view_("writtenwork", A.wid[w]), "View in JudaicaLink"))]));
    const ul = el("ul");
    for (const i of imps) {
      ul.append(el("li", null, dot(0), link(imprintTitle(i), { type: "imprint", i }),
        el("span", { class: "fp-meta", text: [years(A.iY0[i], A.iY1[i], A.idate[i]), A.iPl[i] >= 0 ? shortPlace(A.iPl[i]) : ""].filter(Boolean).join(" · ") })));
    }
    panel.append(...keep([el("h3", { text: "Imprints" }), ul]));
    panel.append(...keep([el("p", { class: "fp-hint", text: "The map shows the journeys of all its copies." })]));
  }
  function imprintPanel(i) {
    const w = A.iWork[i], acts = actorsOf(A.iao, A.ia, i), copies = A.imprintCopies.of(i);
    panel.append(...keep([closeBtn(), el("h2", { text: imprintTitle(i) }),
      el("p", null, dot(0), " Printed ", years(A.iY0[i], A.iY1[i], A.idate[i]),
        A.iPl[i] >= 0 ? [" in ", link(shortPlace(A.iPl[i]), { type: "place", i: A.iPl[i] })] : null),
      w >= 0 ? el("p", null, "Edition of ", link(A.wtitle[w] || "(no title)", { type: "work", i: w })) : null,
      acts.length ? el("p", null, actorList(acts)) : null,
      el("p", { class: "fp-hint" }, out(view_("imprint", A.iid[i]), "View in JudaicaLink"))]));
    const ul = el("ul");
    for (const c of copies) {
      const n = A.copyFps.of(c).length, owner = A.cowner[c];
      ul.append(el("li", null, link(A.ccall[c] || `Copy ${A.cid[c]}`, { type: "copy", i: c }),
        el("span", { class: "fp-meta", text: [owner >= 0 ? A.pname[owner] : "", `${n} ${n === 1 ? "footprint" : "footprints"}`].filter(Boolean).join(" · ") })));
    }
    panel.append(...keep([el("h3", { text: `${fmt(copies.length)} ${copies.length === 1 ? "copy" : "copies"}` }), ul]));
  }
  function copyPanel(c, focus) {
    const i = A.cImp[c], w = workOfCopy(c), owner = A.cowner[c];
    panel.append(...keep([closeBtn(), el("h2", { text: copyTitle(c) }),
      el("p", null, "A copy", A.ccall[c] ? ` (call number ${A.ccall[c]})` : "",
        i >= 0 ? [" of ", link(imprintTitle(i) + (A.iY0[i] ? `, ${years(A.iY0[i], A.iY1[i], A.idate[i])}` : ""), { type: "imprint", i })] : null),
      owner >= 0 ? el("p", null, "Now: ", link(A.pname[owner], { type: "person", i: owner })) : null,
      el("p", { class: "fp-hint" }, w >= 0 ? [link("All copies of the work", { type: "work", i: w }), " · "] : null,
        out(view_("book", A.cid[c]), "View in JudaicaLink"))]));
    const ol = el("ol", { class: "fp-way" });
    const sts = A.stations(c);
    const onWay = new Set(sts.filter((st) => st.p >= 0 && (st.t === "i" || st.y0)));
    let num = 0;
    sts.forEach((st) => {
      const li = el("li", { class: onWay.has(st) ? null : "fp-off", "data-n": onWay.has(st) ? String(++num) : "–" });
      if (st.t === "i") {
        li.append(el("div", null, dot(0), " Printed", st.p >= 0 ? [" in ", link(shortPlace(st.p), { type: "place", i: st.p })] : "",
          el("span", { class: "fp-meta", text: years(st.y0, st.y1, A.idate[st.i]) })),
        el("div", { class: "fp-sub" }, actorList(actorsOf(A.iao, A.ia, st.i))));
      } else {
        const f = st.i;
        if (focus === f) li.classList.add("fp-focus");
        li.append(el("div", null, dot(1), " ", A.media[A.fmed[f]] || "Footprint",
          st.p >= 0 ? [" · ", link(shortPlace(st.p), { type: "place", i: st.p })] : " · no place",
          el("span", { class: "fp-meta", text: years(st.y0, st.y1, A.fdate[f]) })),
        el("div", { class: "fp-sub" }, actorList(actorsOf(A.fao, A.fa, f))),
        el("div", { class: "fp-sub" }, out(sitePage("footprint", A.fid[f]), "On the Footprints site"), " · ",
          out(view_("footprint", A.fid[f]), "View in JudaicaLink"), A.fflags[f] & 2 ? " · with image" : "",
          A.fflags[f] & 1 ? " · verified" : ""));
      }
      ol.append(li);
    });
    panel.append(...keep([el("h3", { text: "Its way" }), ol,
      el("p", { class: "fp-hint", text: "Stations without a date or a place are listed, but not on the map." })]));
  }
  function personPanel(n) {
    const recs = A.byPerson.get(n) || [];
    panel.append(...keep([closeBtn(), el("h2", { text: A.pname[n] }),
      el("p", { class: "fp-hint" }, out(view_("person", A.perId[n]), "View in JudaicaLink"),
        " (with the records of the same person from other sources)")]));
    const sections = { w: [], i: [], f: [], c: [] };
    for (const r of recs) sections[r[0]].push(r);
    const role = (r) => r[2] >= 0 ? A.roles[r[2]] : "";
    if (sections.w.length) {
      const ul = el("ul");
      for (const r of sections.w) ul.append(el("li", null, link(A.wtitle[r[1]] || "(no title)", { type: "work", i: r[1] }), el("span", { class: "fp-meta", text: role(r) })));
      panel.append(...keep([el("h3", { text: "Works" }), ul]));
    }
    if (sections.i.length) {
      sections.i.sort((a, b) => (A.iY0[a[1]] || 9999) - (A.iY0[b[1]] || 9999));
      const ul = el("ul");
      const btn = more(ul, sections.i, (r) => el("li", null, dot(0), link(imprintTitle(r[1]), { type: "imprint", i: r[1] }),
        el("span", { class: "fp-meta", text: `${role(r)} · ${years(A.iY0[r[1]], A.iY1[r[1]], A.idate[r[1]])}` })), 100);
      panel.append(...keep([el("h3", { text: "Imprints" }), ul, btn]));
    }
    if (sections.f.length) {
      sections.f.sort((a, b) => (A.fY0[a[1]] || 9999) - (A.fY0[b[1]] || 9999));
      const ul = el("ul");
      const btn = more(ul, sections.f, (r) => el("li", null, dot(1), link(copyTitle(A.fCopy[r[1]]), { type: "copy", i: A.fCopy[r[1]], f: r[1] }),
        el("span", { class: "fp-meta", text: [role(r), A.fPl[r[1]] >= 0 ? shortPlace(A.fPl[r[1]]) : "", years(A.fY0[r[1]], A.fY1[r[1]], A.fdate[r[1]])].filter(Boolean).join(" · ") })), 100);
      panel.append(...keep([el("h3", { text: `${fmt(sections.f.length)} footprints` }), ul, btn]));
    }
    if (sections.c.length) {
      const ul = el("ul");
      const btn = more(ul, sections.c, (r) => el("li", null, link(copyTitle(r[1]), { type: "copy", i: r[1] }), el("span", { class: "fp-meta", text: A.ccall[r[1]] })), 100);
      panel.append(...keep([el("h3", { text: `${fmt(sections.c.length)} copies owned now` }), ul, btn]));
    }
  }
  function renderLegend() {
    const lg = document.getElementById("sizes");
    lg.replaceChildren();
    const svgNS = "http://www.w3.org/2000/svg";
    const row = el("div");
    for (const n of [10, 100, 1000].filter((x) => radius(x) < 40)) {
      const r = radius(n);
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", 2 * r + 4); svg.setAttribute("height", 2 * r + 4);
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", r + 2); c.setAttribute("cy", r + 2); c.setAttribute("r", r);
      c.setAttribute("fill", "none"); c.setAttribute("stroke", C.muted);
      svg.append(c);
      row.append(svg, fmt(n) + " ");
    }
    lg.append(el("div", { text: "Records at a place" }), row);
  }

  // ---- selection ---------------------------------------------------------------------------------------------
  function select(sel, fit) {
    S.sel = sel;
    if (sel && sel.type === "copy") { panel.replaceChildren(); copyPanel(sel.i, sel.f); } else renderPanel();
    render(); saveSoon();
    if (fit && sel) {
      const ps = selPlaces();
      const off = ps.some((p) => { const [x, y] = toScreen(A.px[p], A.py[p]); return x < 20 || y < 20 || x > CW - 20 || y > CH - 20; });
      if (off) fitSelection();
    }
    panel.scrollTop = 0;
  }

  // ---- search ------------------------------------------------------------------------------------------------
  const q = document.getElementById("f-q"), list = document.getElementById("f-q-list");
  let idx = null, hits = [], active = -1;
  function buildIndex() {
    idx = [];
    A.wtitle.forEach((t, i) => idx.push(["work", i, fold(t || "")]));
    A.pname.forEach((t, i) => { if (A.byPerson.has(i)) idx.push(["person", i, fold(t || "")]); });
    A.plabel.forEach((t, i) => idx.push(["place", i, fold(t || "")]));
  }
  const labelOf = (h) => h.type === "work" ? A.wtitle[h.i] : h.type === "person" ? A.pname[h.i] : A.plabel[h.i];
  function search(text) {
    const t = fold(text.trim());
    if (t.length < 2) return [];
    if (!idx) buildIndex();
    const out_ = [];
    for (const [type, i, s] of idx) {
      const at = s.indexOf(t);
      if (at < 0) continue;
      const word = at === 0 || " ,-'(".includes(s[at - 1]);
      out_.push([(at === 0 ? 0 : word ? 1 : 2) + (type === "place" ? -0.5 : 0), { type, i }]);
      if (out_.length > 4000) break;
    }
    out_.sort((a, b) => a[0] - b[0] || labelOf(a[1]).length - labelOf(b[1]).length);
    return out_.slice(0, 14).map((x) => x[1]);
  }
  function showHits() {
    list.replaceChildren();
    hits.forEach((h, n) => {
      const nRec = h.type === "person" ? (A.byPerson.get(h.i) || []).length : h.type === "work" ? A.workImprints.of(h.i).length : 0;
      const meta = h.type === "work" ? `book · ${nRec} ${nRec === 1 ? "imprint" : "imprints"}`
        : h.type === "person" ? `person · ${nRec} ${nRec === 1 ? "record" : "records"}` : "place";
      const li = el("li", { role: "option", id: "hit-" + n, "aria-selected": n === active ? "true" : "false" },
        el("span", { text: labelOf(h) || "(no name)" }), el("small", { text: meta }));
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); choose(n); });
      list.append(li);
    });
    list.hidden = !hits.length;
    q.setAttribute("aria-expanded", hits.length ? "true" : "false");
    q.setAttribute("aria-activedescendant", active >= 0 ? "hit-" + active : "");
  }
  function choose(n) {
    const h = hits[n];
    if (!h) return;
    hits = []; showHits(); q.value = labelOf(h);
    select(h, false);
    fitSelection();
  }
  let qTimer = null;
  q.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { if (!A) return; hits = search(q.value); active = -1; showHits(); }, 120);
  });
  q.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { active = Math.min(hits.length - 1, active + 1); showHits(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { active = Math.max(-1, active - 1); showHits(); ev.preventDefault(); }
    else if (ev.key === "Enter") { choose(active >= 0 ? active : 0); ev.preventDefault(); }
    else if (ev.key === "Escape") { hits = []; showHits(); }
  });
  q.addEventListener("blur", () => setTimeout(() => { hits = []; showHits(); }, 150));

  // ---- the address keeps the state ---------------------------------------------------------------------------
  const SEL_KEY = { place: "p", work: "w", imprint: "i", copy: "c", person: "n" };
  const selId = (s) => ({ place: A.pid, work: A.wid, imprint: A.iid, copy: A.cid, person: A.perId })[s.type][s.i];
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }
  function save() {
    const h = new URLSearchParams();
    h.set("t", `${S.from === null ? "" : S.from}-${S.to}`);
    if (S.area) h.set("a", S.area.type === "country" ? "c:" + BM.countries[S.area.i].c : `b:${S.area.w},${S.area.s},${S.area.e},${S.area.n}`);
    if (!S.kinds.every(Boolean)) h.set("k", S.kinds.map(Number).join(""));
    if (S.medium >= 0) h.set("e", String(S.medium));
    if (S.sel) h.set("s", SEL_KEY[S.sel.type] + ":" + selId(S.sel) + (S.sel.f !== undefined ? ":" + A.fid[S.sel.f] : ""));
    const [lon, lat] = unproject(view.cx, view.cy);
    h.set("v", `${lon.toFixed(2)},${lat.toFixed(2)},${view.z.toFixed(2)}`);
    history.replaceState(null, "", location.pathname + "#" + h.toString());
  }
  function selFrom(key, id, fid) {
    const maps = { p: ["place", A.placeById], w: ["work", A.workById], i: ["imprint", A.impById], c: ["copy", A.copyById],
      n: ["person", A.personById] };
    const m = maps[key];
    if (!m || !m[1].has(String(id))) return null;
    const sel = { type: m[0], i: m[1].get(String(id)) };
    if (fid !== undefined && A.fpById.has(String(fid))) sel.f = A.fpById.get(String(fid));
    return sel;
  }
  function selFromRecord(path) {        // "<kind>/<id>" of a footprints record
    const [kind, id] = path.split("/");
    if (kind === "footprint" && A.fpById.has(id)) { const f = A.fpById.get(id); return { type: "copy", i: A.fCopy[f], f }; }
    return selFrom({ place: "p", writtenwork: "w", imprint: "i", book: "c", person: "n" }[kind], id);
  }
  async function load() {
    const h = new URLSearchParams(location.hash.slice(1));
    const t = (h.get("t") || "").match(/^(-?\d*)-(-?\d+)$/);
    if (t) { S.from = t[1] === "" ? null : +t[1]; S.to = +t[2]; }
    const a = h.get("a") || "";
    if (a.startsWith("c:")) {
      const i = BM.countries.findIndex((c) => c.c === a.slice(2));
      if (i >= 0) S.area = { type: "country", i };
    } else if (a.startsWith("b:")) {
      const [w, s, e, n] = a.slice(2).split(",").map(Number);
      if ([w, s, e, n].every(Number.isFinite)) S.area = { type: "box", w, s, e, n };
    }
    const k = h.get("k");
    if (k && /^[01]{3}$/.test(k)) S.kinds = [...k].map((c) => c === "1");
    const e = h.get("e");
    if (e && /^\d+$/.test(e) && +e < A.media.length) S.medium = +e;
    const s = (h.get("s") || "").split(":");
    if (s.length >= 2) S.sel = selFrom(s[0], s[1], s[2]);
    const v = (h.get("v") || "").split(",").map(Number);
    if (v.length === 3 && v.every(Number.isFinite)) { const [x, y] = project(v[0], v[1]); S.view = { cx: x, cy: y, z: v[2] }; }
    // ?iri=<a footprints record or an entity page> (the resolve link of the registry, platform decision 0007)
    const iri = new URLSearchParams(location.search).get("iri");
    if (iri) {
      const norm = iri.replace(/^https:/, "http:");
      let sel = null;
      if (norm.startsWith(FP)) sel = selFromRecord(norm.slice(FP.length));
      const m = norm.match(/^http:\/\/data\.judaicalink\.org\/data\/ep\/(\d+)$/);
      if (m) {
        try {
          const res = await fetch(app.dataset.resolve).then((r) => r.json());
          if (res[m[1]]) sel = selFromRecord(res[m[1]]);
        } catch (err) { console.error(err); }
      }
      if (sel) { sel.fit = true; S.sel = sel; } else S.missing = iri;
    }
  }

  // ---- start -------------------------------------------------------------------------------------------------
  function fillFilters() {
    const used = new Set(A.pcountry);
    for (const [n, i] of BM.countries.map((c, i) => [c.n, i]).filter(([, i]) => used.has(i))) fArea.append(el("option", { value: "c" + i, text: n }));
    A.media.forEach((m, i) => { if (m) fMed.append(el("option", { value: String(i), text: m })); });
  }
  async function start() {
    readColours();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColours(); update(false); });
    const [data, bm] = await Promise.all([
      fetch(app.dataset.src).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(app.dataset.basemap).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
    BM = bm; A = decode(data); paths = buildPaths(bm);
    document.getElementById("loading").remove();
    fillFilters();
    if (matchMedia("(max-width: 860px)").matches) document.getElementById("legend").open = false;
    await apply();
  }
  async function apply() {
    stopPlay();
    Object.assign(S, DEFAULTS());
    await load();
    resize();
    inArea = areaTest();
    if (S.view) { view.cx = S.view.cx; view.cy = S.view.cy; view.z = S.view.z; clampView(); }
    else if (S.area) fitArea();
    else fitBounds(-80, 22, 40, 60, 10);
    fFrom.value = S.from === null ? "" : S.from; fTo.value = S.to;
    fArea.value = !S.area ? "" : S.area.type === "box" ? "box" : "c" + S.area.i;
    if (S.area && S.area.type === "box") fArea.querySelector('option[value="box"]').disabled = false;
    fMed.value = S.medium < 0 ? "" : String(S.medium);
    S.kinds.forEach((on, k) => { document.getElementById("k-" + k).checked = on; });
    const sel = S.sel;
    update(true);
    if (sel) select(sel, false);
    if (sel && !S.view) sel.fit = true;
    if (sel && sel.fit) { delete sel.fit; fitSelection(); history.replaceState(null, "", location.pathname + location.hash); save(); }
    if (S.missing) panel.prepend(el("p", { class: "jl-note", text: "This record is not on the map: it is not a Footprints record, or the data give it no place." }),
      el("p", null, el("a", { href: S.missing.startsWith(D + "/") ? S.missing.slice(D.length) : S.missing, text: "View it in JudaicaLink" })));
  }
  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", () => { if (A) apply(); });
  start().catch((err) => {
    const l = document.getElementById("loading");
    if (l) l.textContent = "The map could not be loaded (" + err.message + ").";
    console.error(err);
  });
})();
