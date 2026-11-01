// You page chart types (docs/charts.md §2): two-pole, stacked-levels, heat-grid, list. Loaded after charts.js.
// Each is one reusable (data, options) function that returns HTML through MagicCharts.card, wrapped in a
// size container (.mc-you-c) so the layout follows the card's width, not the window's.
// Options shared by all: {title, subtitle, takeaway, info, note, empty: {text, how}, limit}.
(() => {
  const M = window.MagicCharts;
  const { card, esc, capped, pickAttrs, stateView } = M;
  const wrap = (html) => `<div class="mc-you-c">${html}</div>`;
  const out = (o, cls, body, note) => wrap(card({ ...o, cls: `mc-you ${cls}`, body, note: o.note || note }));
  const none = (o) => wrap(card({ title: o.title, subtitle: o.subtitle, info: o.info, cls: "mc-you", body: stateView({ kind: "empty", ...(o.empty || {}) }), note: null }));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // two-pole: a trait between two plain-word ends (personality.html).
  // data: [{name, badge?, left, right, value (0–100, or null = not measured), band?, note (HTML), below? (HTML), label?}]
  // Tapping a row shows its note; `below` opens in place under it.
  function twoPole(data, o = {}) {
    const list = (data || []).filter((d) => d && d.name);
    if (!list.length) return none(o);
    const rows = list.map((d) => {
      const v = d.value == null ? null : clamp(Math.round(d.value), 0, 100), L = v != null && v < 40, R = v != null && v > 60;
      const band = d.band || (v == null ? "not yet" : L ? "low" : R ? "high" : "mid");
      const label = d.label || `${d.name}: ${v == null ? "not measured yet" : `${v}, ${band}`}`;
      return `<div class="mc-tp-item"><button type="button" class="mc-row mc-tp-row" ${pickAttrs(d.note || esc(label), label)}>
          <span class="mc-tp-top">${d.badge ? `<span class="mc-tp-badge" aria-hidden="true">${esc(d.badge)}</span>` : ""}<span class="mc-tp-name mc-name-t">${esc(d.name)}</span><span class="mc-tp-v">${v ?? "—"}</span><span class="mc-tp-band">${esc(band)}</span></span>
          <span class="mc-tp-poles"><span class="${L ? "lean" : ""}">${esc(d.left)}</span><span class="${R ? "lean" : ""}">${esc(d.right)}</span></span>
          <span class="mc-tp-track"><span class="mc-tp-line"></span><span class="mc-tp-mid"></span>${v != null ? `<span class="mc-tp-dot" style="left:${clamp(v, 2, 98)}%"></span>` : ""}</span>
        </button>${d.below ? `<div class="mc-below mc-tp-below" hidden>${d.below}</div>` : ""}</div>`;
    });
    return out(o, "mc-tp", `<div class="mc-rows mc-tp-rows">${capped(rows, o.limit)}</div>`, "Tap a trait to see what it means, what in your record shows it, and what to do with it.");
  }

  // stacked-levels: how much and how deep, per area (depth-of-knowledge.html).
  // data: [{name, counts: [read, explored, understood, applied, fluent], note (HTML)}]; sorted by total here.
  // options.levels: five names; options.levelNotes: five lines shown when a key swatch is tapped.
  function stackedLevels(data, o = {}) {
    const names = o.levels || M.LEVELS5;
    const list = (data || []).map((d) => ({ ...d, total: d.counts.reduce((a, b) => a + b, 0) })).filter((d) => d.total > 0).sort((a, b) => b.total - a.total);
    if (!list.length) return none(o);
    const max = Math.max(...list.map((d) => d.total));
    const rows = list.map((d) => {
      const deep = d.counts[2] + d.counts[3] + d.counts[4];
      return `<button type="button" class="mc-row mc-sl-row" ${pickAttrs(d.note, `${d.name}: ${M.plural(d.total, "idea")}, ${Math.round((100 * deep) / d.total)}% deep`)}>
        <span class="mc-sl-name mc-name-t" title="${esc(d.name)}">${esc(d.name)}</span>
        <span class="mc-sl-track"><span class="mc-sl-bar" style="width:${Math.max(4, (100 * d.total) / max).toFixed(1)}%">${d.counts.map((c, i) => (c ? `<span class="mc-sl-seg lv${i}" style="flex:${c} 1 0"></span>` : "")).join("")}</span></span>
        <span class="mc-sl-num"><b>${Math.round((100 * deep) / d.total)}% deep</b><span>${M.plural(d.total, "idea")}</span></span>
      </button>`;
    });
    const key = `<div class="mc-legend mc-sl-key">${names.map((n, i) => `<span${o.levelNotes ? ` role="button" tabindex="0" data-mc-detail="${esc(o.levelNotes[i])}"` : ""}><span class="mc-sq lv${i}"></span>${esc(n)}</span>`).join("")}</div>`;
    return out(o, "mc-sl", `${key}<div class="mc-rows mc-sl-rows">${capped(rows, o.limit)}</div>`, "“Deep” means understood, applied or fluent. Tap an area for its full breakdown.");
  }

  // heat-grid: when, day × hour (when-you-learn.html).
  // data: [{day (0 = Monday … 6 = Sunday), hour (0–23), value}]; options.detail(day, hour, value) → note text.
  // Wide cards: days down, hours across. Narrow cards: hours down, days across, so every cell stays tappable.
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hr = (h) => { const x = ((h % 24) + 24) % 24; return x === 0 ? "12am" : x === 12 ? "12pm" : x < 12 ? `${x}am` : `${x - 12}pm`; };
  function heatGrid(data, o = {}) {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    (data || []).forEach((c) => { if (c && c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) grid[c.day][c.hour] += +c.value || 0; });
    const max = Math.max(0, ...grid.flat());
    if (!max) return none(o);
    const lvl = (n) => (n ? 1 + Math.floor((4 * n) / (max + 1)) : 0);
    const detail = o.detail || ((d, h, n) => `${DAYS[d]}, ${hr(h)} to ${hr(h + 1)}: ${n || "nothing recorded"}.`);
    const cells = grid.map((row, d) => row.map((n, h) => { const t = detail(d, h, n); return `<span class="mc-hg-c l${lvl(n)}" style="--d:${d};--h:${h}" role="button" tabindex="${n ? 0 : -1}" data-mc-detail="${esc(t)}" aria-label="${esc(t)}"></span>`; }).join("")).join("");
    const dayL = DAYS.map((n, d) => `<span class="mc-hg-day" style="--d:${d}">${n}</span>`).join("");
    const hourL = Array.from({ length: 24 }, (_, h) => `<span class="mc-hg-hr ${h % 6 ? "" : "six"} ${h % 3 ? "" : "three"}" style="--h:${h}">${hr(h)}</span>`).join("");
    const ramp = `<div class="mc-hg-ramp" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4].map((i) => `<span class="mc-hg-k l${i}"></span>`).join("")}<span>More</span></div>`;
    return out(o, "mc-hg", `<div class="mc-hg-grid" role="group" aria-label="${esc(o.title || "Heat grid")}">${dayL}${hourL}${cells}</div>${ramp}`, "Tap any hour to see how often you were learning then.");
  }

  // list: a few named items with one line each, optional weekly bars (blind-spots.html, highlights.html).
  // data: [{title, text, note (HTML), weekly?: [numbers, oldest first]}]
  // options.marker: "number" (01, 02…) or "open" (a dashed ring); options.weeklyUnit: (n) => "34 this week".
  function list(data, o = {}) {
    const items = (data || []).filter((d) => d && d.title);
    if (!items.length) return none(o);
    const weekly = items.some((d) => (d.weekly || []).length);
    const rows = items.map((d, i) => {
      const w = d.weekly || [], top = Math.max(1, ...w), last = w.length ? w[w.length - 1] : 0;
      const mark = o.marker === "number" ? `<span class="mc-ls-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>` : `<span class="mc-ls-ring" aria-hidden="true"></span>`;
      const bars = weekly ? `<span class="mc-ls-side"><span class="mc-ls-bars" aria-hidden="true">${w.map((v, k) => `<span class="${k === w.length - 1 ? "now" : ""}" style="height:${v ? Math.max(3, (32 * v) / top).toFixed(1) : 0}px"></span>`).join("")}</span><span class="mc-ls-tot"><b>${esc(o.weeklyValue ? o.weeklyValue(last) : String(last))}</b><span>${esc(o.weeklyLabel || "this week")}</span></span></span>` : "";
      return `<button type="button" class="mc-row mc-ls-row ${weekly ? "wk" : ""}" ${pickAttrs(d.note || esc(d.text || d.title), d.title)}>
        ${mark}<span class="mc-ls-t"><b class="mc-name-t">${esc(d.title)}</b>${d.text ? `<span>${esc(d.text)}</span>` : ""}</span>${bars}
      </button>`;
    });
    return out(o, `mc-ls ${weekly ? "mc-ls-wk" : ""}`, `<div class="mc-ls-rows">${capped(rows, o.limit)}</div>`, "Tap an item to read more about it.");
  }

  // The ⓘ on these cards: tap shows what the chart is based on in the note line (tap again or Esc closes).
  document.addEventListener("click", (e) => {
    const i = e.target.closest(".mc-you .mc-head .v-info");
    if (!i) return;
    const c = i.closest(".mc-card2"), n = c.querySelector(".mc-note2");
    if (!n) return;
    const was = i.classList.contains("mc-on");
    c.querySelectorAll("[data-mc-pick]").forEach((r) => { r.classList.remove("on", "dim"); r.setAttribute("aria-pressed", "false"); const b = r.nextElementSibling; if (b && b.classList.contains("mc-below")) b.hidden = true; });
    c.querySelectorAll(".mc-on").forEach((x) => x.classList.remove("mc-on"));
    if (was) { n.innerHTML = n.dataset.default; n.classList.remove("on"); return; }
    i.classList.add("mc-on");
    n.innerHTML = String(i.dataset.tip || "").split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("");
    n.classList.add("on");
  });
  document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".mc-you .mc-head .v-info")) { e.preventDefault(); e.target.click(); } });

  Object.assign(window.MagicCharts, { twoPole, stackedLevels, heatGrid, list, hourName: hr, DAYS });
})();
