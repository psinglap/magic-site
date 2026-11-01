// Magic chart system: every chart uses this. One card anatomy, one theme read from the CSS tokens,
// tap-to-show details, and the loading / empty / error states (docs/design-rules.md §4, §5, §9).
// Plot (Observable Plot 0.6.16) and D3 (7.9.0) are loaded from portal/vendor before this file.
(() => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Colours only from tokens, read when a chart is drawn so dark mode follows the system.
  const theme = () => ({
    accent: css("--accent"), lime: css("--lime"), muted: css("--muted"), faint: css("--faint"),
    line: css("--line"), ink: css("--ink"), panel: css("--panel"), hover: css("--hover"),
    parts: [0, 1, 2, 3, 4].map((i) => css(`--h${i}`)),
  });

  // Shared Plot settings: Inter, never below 12.5px, no gridlines, no legend (label marks instead).
  const FONT = "Inter, -apple-system, system-ui, sans-serif";
  const plot = (opts = {}) => {
    const t = theme();
    const svg = Plot.plot({
      style: { fontFamily: FONT, fontSize: "12.5px", color: t.ink, background: "transparent", overflow: "visible" },
      marginTop: 16, marginRight: 36, marginBottom: 32, marginLeft: 40,
      ...opts,
      x: { grid: false, tickSize: 0, labelArrow: "none", ...(opts.x || {}) },
      y: { grid: false, tickSize: 0, labelArrow: "none", ...(opts.y || {}) },
      color: { legend: false, ...(opts.color || {}) },
    });
    svg.classList.add("mc-plot");
    return svg;
  };
  // Long labels end in "…" instead of being clipped; the full text stays in the mark's detail.
  const fit = (n) => (s) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

  // A Plot render transform that makes each drawn mark tappable: its detail goes to the note line.
  // Use as the mark's `render` option: Plot.barX(data, {..., render: MagicCharts.tappable((d) => text)}).
  const tappable = (detail) => function (index, scales, values, dimensions, context, next) {
    const g = next(index, scales, values, dimensions, context);
    const data = this.data;
    [...g.querySelectorAll(":scope > *")].forEach((el, i) => {
      const d = data && index[i] != null ? data[index[i]] : null;
      if (!d) return;
      const text = detail(d);
      el.dataset.detail = text;
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", text);
      el.insertAdjacentHTML("afterbegin", `<title>${esc(text)}</title>`); // hover preview
    });
    return g;
  };

  // Tap (or Enter/Space) on any mark with data-detail — or an older chart's data-tip — shows it in the note.
  const bindTap = (card) => {
    const note = card.querySelector(".mc-note");
    const pick = (el) => {
      card.querySelectorAll(".mc-on").forEach((x) => { x.classList.remove("mc-on"); x.removeAttribute("aria-pressed"); });
      el.classList.add("mc-on"); el.setAttribute("aria-pressed", "true");
      note.textContent = el.dataset.detail || el.dataset.tip; note.classList.add("on");
    };
    card.addEventListener("click", (e) => { const el = e.target.closest("[data-detail],[data-tip]"); if (el && card.contains(el)) { e.preventDefault(); pick(el); } });
    card.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const el = e.target.closest("[data-detail],[data-tip]"); if (el) { e.preventDefault(); pick(el); } });
  };

  // The three states every data view designs (rule 9).
  const stateView = (s) => {
    if (s.kind === "loading") return `<div class="mc-state mc-loading" aria-busy="true" role="status" aria-label="Loading">${Array.from({ length: s.rows || 4 }, (_, i) => `<span style="width:${[88, 64, 76, 52, 70][i % 5]}%"></span>`).join("")}</div>`;
    if (s.kind === "empty") return `<div class="mc-state mc-empty"><p>${esc(s.text || "Nothing to show here yet.")}</p>${s.how ? `<p class="faint">${esc(s.how)}</p>` : ""}</div>`;
    if (s.kind === "error") return `<div class="mc-state mc-error" role="alert"><p><b>${esc(s.text || "This chart couldn't load.")}</b> Nothing you recorded is lost.</p>${s.retry ? `<button class="link" data-mc-retry>Try again</button>` : ""}</div>`;
    return "";
  };

  // The card: title, one-line subtitle, one-sentence takeaway, the chart, then the note line.
  // render(el) draws into el: return an HTML string, a node (e.g. from plot()), or fill el yourself.
  // state: {kind: "loading" | "empty" | "error", text, how, retry} replaces the chart.
  function chartCard({ title, subtitle, takeaway, render, note = "Tap any mark to see its detail here.", info, state }) {
    const card = document.createElement("section");
    card.className = "v-panel mc-card";
    card.innerHTML = `<div class="v-mind-head"><div><h3>${esc(title)}</h3>${subtitle ? `<div class="v-sub">${esc(subtitle)}</div>` : ""}</div>${info ? `<span class="v-info" data-info="${esc(info)}" title="${esc(info)}">ⓘ</span>` : ""}</div>
      ${takeaway && !state ? `<div class="v-mind-lead">${takeaway}</div>` : ""}
      <div class="mc-body"></div>
      <p class="sk-note mc-note" aria-live="polite">${state ? "" : esc(note)}</p>`;
    const body = card.querySelector(".mc-body");
    if (state) {
      body.innerHTML = stateView(state);
      const r = card.querySelector("[data-mc-retry]");
      if (r && typeof state.retry === "function") r.onclick = state.retry;
    } else {
      // Draw at the card's real width, and again when it changes, so text never scales below 12.5px.
      let drawn = -1;
      const draw = (width) => {
        if (Math.abs(width - drawn) < 8) return;
        drawn = width;
        try {
          body.textContent = "";
          const out = render(body, { width });
          if (typeof out === "string") body.innerHTML = out;
          else if (out instanceof Node) body.appendChild(out);
        } catch (e) {
          body.innerHTML = stateView({ kind: "error", text: "This chart couldn't be drawn." });
          console.error(e);
        }
      };
      new ResizeObserver(([e]) => { const w = Math.floor(e.contentRect.width); if (w > 0) draw(w); }).observe(body);
      bindTap(card);
    }
    return card;
  }

  // ---------- Chart types (docs/charts.md §2). Each takes (data, options) and returns HTML. ----------
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  // "30 minutes today", "1 hour this week", "2 hours" → minutes, or null if there's no number.
  const minutes = (t) => { const m = String(t || "").match(/(\d+(?:\.\d+)?)\s*(min|minute|hour|hr|h\b|day)/i); if (!m) return null; const u = m[2].toLowerCase(); return +m[1] * (u.startsWith("min") ? 1 : u.startsWith("day") ? 480 : 60); };

  // steps: an ordered plan, first step largest (path-forward.html).
  // data: [{title, time?, why?, actions?: [], done?}]; options: {title, subtitle?, lead?, then?, empty?, limit?}
  // Every step opens in place to show how to do it and when it's done; one open at a time.
  function steps(data, o = {}) {
    const list = (data || []).filter((x) => x && x.title);
    const head = (sub) => `<div class="mc-st-head"><h3 class="mc-st-title">${esc(o.title || "Your path forward")}</h3>${sub ? `<p class="mc-st-sub">${sub}</p>` : ""}</div>`;
    if (!list.length) return `<section class="mc-steps">${head("")}${stateView({ kind: "empty", ...(o.empty || { text: "Your steps will appear here.", how: "They're written once you've recorded a few things on this topic." }) })}</section>`;
    // Takeaway from the data: how many steps, and whether the first really is the smallest.
    const t = list.map((x) => minutes(x.time)), smallest = t[0] != null && t.every((m) => m == null || m >= t[0]);
    const sub = o.subtitle ?? `${list.length <= 10 ? NUM[list.length] : list.length} step${list.length === 1 ? "" : "s"} from your mentor, in order.${list.length > 1 ? ` Start with the first${smallest ? "; it's the smallest" : ""}.` : ""}`;
    const [first, ...rest] = list, limit = o.limit || 8, shown = rest.slice(0, limit - 1), more = rest.length - shown.length;
    const how = (x) => { const acts = (x.actions || []).filter(Boolean); return `${acts.length ? `<div class="mc-st-label">How to do it</div><ol class="mc-st-acts">${acts.map((a) => `<li>${esc(String(a).replace(/[*`]/g, ""))}</li>`).join("")}</ol>` : ""}${x.done ? `<p class="mc-st-done"><span>You're done when</span> ${esc(x.done)}</p>` : ""}`; };
    const row = (x, i) => { const body = (x.why ? `<p class="mc-st-why">${esc(x.why)}</p>` : "") + how(x); return `<div class="mc-st-row" data-mc-step>
        <button type="button" class="mc-st-btn" aria-expanded="false"${body ? "" : " disabled"}>
          <span class="mc-st-n">${i + 2}</span><span class="mc-st-name">${esc(x.title)}</span>${x.time ? `<span class="mc-st-time">${esc(x.time)}</span>` : "<span></span>"}<span class="mc-st-caret" aria-hidden="true">${body ? "▼" : ""}</span>
        </button>${body ? `<div class="mc-st-detail" hidden>${body}</div>` : ""}</div>`; };
    const leadHow = how(first);
    return `<section class="mc-steps">${head(esc(sub))}
      <div class="mc-st-lead" data-mc-step>
        <button type="button" class="mc-st-lead-btn" aria-expanded="false"${leadHow ? "" : " disabled"}>
          <span class="mc-st-tags"><span class="mc-st-start">${esc(o.lead || "Start here")}</span>${first.time ? `<span class="mc-st-time">${esc(first.time)}</span>` : ""}<span class="mc-st-caret" aria-hidden="true">${leadHow ? "▼" : ""}</span></span>
          <span class="mc-st-lead-title">${esc(first.title)}</span>${first.why ? `<span class="mc-st-lead-why">${esc(first.why)}</span>` : ""}
        </button>${leadHow ? `<div class="mc-st-detail" hidden>${leadHow}</div>` : ""}
      </div>
      ${shown.length ? `<h4 class="mc-st-then">${esc(o.then || "Then")}</h4><div class="mc-st-rows">${shown.map(row).join("")}</div>` : ""}
      ${more ? `<button type="button" class="link mc-more" data-mc-more>Show ${more} more</button><div class="mc-st-rows" hidden>${rest.slice(shown.length).map((x, j) => row(x, shown.length + j)).join("")}</div>` : ""}
    </section>`;
  }

  // Shared behaviour for every chart type: one step open at a time, the rest fade, tap again or Esc closes.
  const closeRows = (scope) => scope.querySelectorAll("[data-mc-step]").forEach((r) => { r.classList.remove("on", "dim"); const b = r.querySelector(":scope > button"); if (b) b.setAttribute("aria-expanded", "false"); const d = r.querySelector(".mc-st-detail"); if (d) d.hidden = true; const c = r.querySelector(".mc-st-caret"); if (c && c.textContent) c.textContent = "▼"; });
  document.addEventListener("click", (e) => {
    const more = e.target.closest("[data-mc-more]");
    if (more) { more.nextElementSibling.hidden = false; more.remove(); return; }
    const btn = e.target.closest("[data-mc-step] > button");
    if (!btn || btn.disabled) return;
    const row = btn.parentElement, scope = row.closest(".mc-steps"), was = row.classList.contains("on");
    closeRows(scope);
    if (was) return;
    row.classList.add("on"); btn.setAttribute("aria-expanded", "true");
    row.querySelector(".mc-st-detail").hidden = false; row.querySelector(".mc-st-caret").textContent = "▲";
    scope.querySelectorAll("[data-mc-step]").forEach((r) => r !== row && r.classList.add("dim"));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".mc-steps").forEach(closeRows); });

  // ---------- Shared pieces for the row charts ----------
  const LEVELS5 = ["Read", "Explored", "Understood", "Applied", "Fluent"];
  const joinAnd = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] || "");
  const attr = (html) => esc(html); // HTML kept in an attribute, put back with innerHTML on tap
  const hue = (i) => `var(--h${i % 8})`;
  // The card (docs/charts.md §3): title, subtitle, takeaway, chart, then the note line taps fill.
  const card = ({ title, subtitle, takeaway, body, note, info, cls = "" }) => `<section class="mc-card2 ${cls}">
      <div class="mc-head"><div class="mc-head-row"><h3 class="mc-title">${esc(title)}</h3>${info ? `<span class="v-info" data-tip="${esc(info)}" tabindex="0" role="button" aria-label="About this chart">ⓘ</span>` : ""}</div>${subtitle ? `<p class="mc-sub">${esc(subtitle)}</p>` : ""}${takeaway ? `<p class="mc-take">${takeaway}</p>` : ""}</div>
      ${body}
      ${note == null ? "" : `<div class="mc-note2" aria-live="polite" data-default="${attr(note)}">${note}</div>`}
    </section>`;
  const empty = (title, subtitle, e) => card({ title, subtitle, body: stateView({ kind: "empty", ...e }) });
  // Many rows: the first `limit`, then "Show N more" (§6).
  const capped = (rows, limit = 8) => rows.length <= limit ? rows.join("") : `${rows.slice(0, limit).join("")}<button type="button" class="link mc-more" data-mc-more>Show ${rows.length - limit} more</button><div class="mc-rows-more" hidden>${rows.slice(limit).join("")}</div>`;
  // A row you can pick: its note (HTML) shows in the note line; what's below it opens in place.
  const pickAttrs = (note, label) => `data-mc-pick aria-pressed="false" data-note="${attr(note)}"${label ? ` aria-label="${esc(label)}"` : ""}`;

  // dot-on-scale: where you are on the five levels per item, with then / now / target (where-you-stand.html).
  // data: [{name, hue, then, now, target, note, steps: [[level, when]]}] — levels 0–4, -1 = not yet.
  function dotOnScale(data, o = {}) {
    if (!data.length) return empty(o.title, o.subtitle, o.empty || {});
    const pos = (i) => `${((i + 0.5) * 20).toFixed(1)}%`;
    const rows = data.map((p) => {
      const now = Math.max(0, p.now), then = p.then < 0 ? now : Math.min(p.then, now), came = now - then, tgt = p.target, left = tgt >= 0 ? Math.max(0, tgt - now) : 0;
      return `<button type="button" class="mc-row mc-ds-row" ${pickAttrs(p.html || `<p>${esc(p.note)}</p>`, p.label)}>
        <span class="mc-name"><span class="mc-hue" style="background:${p.hue}"></span><span class="mc-name-t" title="${esc(p.name)}">${esc(p.name)}</span></span>
        <span class="mc-ds-scale">
          <span class="mc-ds-line"></span>
          <span class="mc-ds-ticks">${"<span></span>".repeat(5)}</span>
          ${left ? `<span class="mc-ds-togo" style="left:${pos(now)};width:${left * 20}%"></span>` : ""}
          ${came ? `<span class="mc-ds-came" style="left:${pos(then)};width:${came * 20}%"></span>` : ""}
          ${tgt >= 0 ? `<span class="mc-ds-target" style="left:${pos(tgt)}"></span>` : ""}
          ${came ? `<span class="mc-ds-then" style="left:${pos(then)}"></span>` : ""}
          <span class="mc-ds-now" style="left:${pos(now)}"></span>
        </span>
        <span class="mc-ds-move"><span class="${came ? "up" : ""}">${came ? `+${came} level${came === 1 ? "" : "s"}` : "Not moved yet"}</span><span>${tgt < 0 ? "" : left ? `${left} to go` : "At the usual level"}</span></span>
      </button>`;
    });
    const legend = `<div class="mc-legend">
        <span><span class="mc-k mc-ds-then"></span>${esc(o.thenLabel || "Before")}</span><span><span class="mc-k mc-ds-now"></span>Now</span>
        ${data.some((p) => p.target >= 0) ? `<span><span class="mc-k mc-k-target"></span>${esc(o.targetLabel || "The usual level")}</span>` : ""}
        ${data.some((p) => p.now > p.then && p.then >= 0) ? `<span><span class="mc-k mc-k-bar mc-ds-came"></span>How far you've come</span>` : ""}${data.some((p) => p.target > Math.max(0, p.now)) ? `<span><span class="mc-k mc-k-bar mc-ds-togo"></span>Still to go</span>` : ""}</div>`;
    return card({ ...o, cls: "mc-ds", body: `<div class="mc-rows">
        <div class="mc-ds-head"><span></span><span class="mc-ds-levels">${LEVELS5.map((l) => `<span>${l === "Understood" ? "Under&shy;stood" : l}</span>`).join("")}</span><span></span></div>
        ${capped(rows, o.limit)}</div>${legend}`, note: o.note || "Tap a part to see when each step happened and the one thing to do next." });
  }

  // square-grid: how many and how deep, one square per idea (what-you-know.html).
  // data: [{name, hue, items: [{name, level, detail}], groups?: [{name, items}]}]
  function squareGrid(data, o = {}) {
    const total = data.reduce((n, p) => n + p.items.length, 0);
    if (!total) return empty(o.title, o.subtitle, o.empty || {});
    const sq = (it, tap) => `<span class="mc-sq lv${it.level}"${tap ? ` role="button" tabindex="0" data-mc-detail="${esc(it.detail || `${it.name} · ${LEVELS5[it.level]}`)}"${it.html ? ` data-mc-html="${attr(it.html)}"` : ""} aria-label="${esc(it.detail || it.name)}"` : ""}></span>`;
    const squares = (items, tap) => { const l = [...items].sort((a, b) => a.level - b.level); return l.length > 100 ? `<span class="mc-sq-counts">${LEVELS5.map((n, i) => { const c = l.filter((x) => x.level === i).length; return c ? `<span><span class="mc-sq lv${i}"></span>${c}</span>` : ""; }).join("")}</span>` : `<span class="mc-sqs ${l.length > 40 ? "small" : ""}">${l.map((it) => sq(it, tap)).join("")}</span>`; };
    const say = ["read once", "explored", "understood", "applied", "fluent"];
    const describe = (p) => { const bits = say.map((w, i) => { const c = p.items.filter((x) => x.level === i).length; return c ? `${c} ${w}` : null; }).filter(Boolean); const l = joinAnd(bits); return `${p.name}: ${plural(p.items.length, "idea")}. ${l.charAt(0).toUpperCase()}${l.slice(1)}.`; };
    const rows = data.filter((p) => p.items.length).map((p) => `<div class="mc-sg-part">
        <button type="button" class="mc-row mc-sg-row" ${pickAttrs(p.html || esc(describe(p)) + ((p.groups || []).length ? " Tap a square below to see the idea." : ""), describe(p))}>
          <span class="mc-name"><span class="mc-hue" style="background:${p.hue}"></span><span class="mc-name-t" title="${esc(p.name)}">${esc(p.name)}</span></span>
          ${squares(p.items, false)}
          <span class="mc-count">${plural(p.items.length, "idea")}</span>
        </button>
        ${(p.groups || []).length ? `<div class="mc-below" hidden>${p.groups.map((g) => `<div class="mc-sg-sub"><span class="mc-sg-gname mc-name-t" title="${esc(g.name)}"${g.html ? ` role="button" tabindex="0" data-mc-detail="${esc(g.name)}" data-mc-html="${attr(g.html)}"` : ""}>${esc(g.name)}</span>${squares(g.items, true)}<span class="mc-count">${g.items.length}</span></div>`).join("")}</div>` : ""}
      </div>`);
    const legend = `<div class="mc-legend">${LEVELS5.map((l, i) => `<span><span class="mc-sq lv${i}"></span>${l}</span>`).join("")}</div>`;
    return card({ ...o, cls: "mc-sg", body: `${legend}<div class="mc-rows">${capped(rows, o.limit)}</div>`, note: o.note || "Tap a part to see how its ideas split across the five levels." });
  }

  // timeline-rows: when each item last came up, week by week (worth-revisiting.html).
  // data: [{name, hue, weeks: [0..3 × 12] (oldest first), note, action?}]; options.months: 12 labels.
  function timelineRows(data, o = {}) {
    if (!data.length) return empty(o.title, o.subtitle, o.empty || {});
    const rows = data.map((p) => {
      const last = p.weeks.reduce((k, t, i) => (t ? i : k), -1);
      return `<button type="button" class="mc-row mc-tl-row" ${pickAttrs(`${p.html || `<p>${esc(p.note)}</p>`}${p.action ? `<button type="button" class="mc-act" data-mc-act="${esc(p.action.id)}">${esc(p.action.label)}</button>` : ""}`, p.label)}>
        <span class="mc-name"><span class="mc-hue" style="background:${p.hue}"></span><span class="mc-name-t" title="${esc(p.name)}">${esc(p.name)}</span></span>
        <span class="mc-tl-weeks"><span class="mc-tl-line"></span>${p.weeks.map((t, i) => `<span class="mc-tl-w">${t ? `<span class="mc-tl-dot ${i === last ? "last" : ""}" style="--d:${[0, 8, 12, 16][t] + (i === last ? 6 : 0)}px;--c:${p.hue}"></span>` : ""}</span>`).join("")}</span>
        <span class="mc-tl-ago ${p.stale ? "stale" : ""}">${esc(p.ago)}</span>
      </button>`;
    });
    const legend = `<div class="mc-legend"><span><span class="mc-k-dot" style="--d:8px"></span><span class="mc-k-dot" style="--d:12px"></span><span class="mc-k-dot" style="--d:16px"></span>Less to more time that week</span><span><span class="mc-k mc-k-last"></span>The last time you came back</span></div>`;
    return card({ ...o, cls: "mc-tl", body: `<div class="mc-rows">
        <div class="mc-tl-head"><span></span><span class="mc-tl-months">${(o.months || []).map((m, i) => `<span class="${i === 11 ? "now" : ""}">${esc(m)}</span>`).join("")}</span><span>Last time</span></div>
        ${capped(rows, o.limit)}</div>${legend}`, note: o.note || "Tap a part to see its ideas and when each one last came up." });
  }

  // matrix: which items involve which parts (where-youve-used-it.html).
  // data: {columns: [{name, hue}], rows: [{name, what, cells: ["built" | "explored" | ""], note}]}
  function matrix(data, o = {}) {
    if (!data.rows.length) return empty(o.title, o.subtitle, o.empty || {});
    const n = data.columns.length;
    const rows = data.rows.map((r) => `<button type="button" class="mc-row mc-mx-row" style="--n:${n}" ${pickAttrs(r.html || `<p>${esc(r.note)}</p>`)}>
        <span class="mc-mx-name"><b class="mc-name-t" title="${esc(r.name)}">${esc(r.name)}</b>${r.what ? `<span class="mc-name-t">${esc(r.what)}</span>` : ""}</span>
        ${r.cells.map((c, i) => `<span class="mc-mx-cell ${c ? "" : "none"}"><span class="mc-mx-col" aria-hidden="true">${esc(data.columns[i].name)}</span>${c ? `<span class="mc-mark ${c}"></span>` : `<span class="mc-mx-none"></span>`}</span>`).join("")}
      </button>`);
    const legend = `<div class="mc-legend"><span><span class="mc-mark built"></span>You built it</span><span><span class="mc-mark explored"></span>You explored it</span></div>`;
    return card({ ...o, cls: "mc-mx", body: `<div class="mc-mx-grid">
        <div class="mc-mx-head" style="--n:${n}"><span></span>${data.columns.map((c) => `<span>${esc(c.name)}</span>`).join("")}</div>
        ${capped(rows, o.limit)}</div>${legend}`, note: o.note || "Tap a project to see what you did there." });
  }

  // Picking: one row on at a time (tinted), the rest fade to 0.4, its note shows; tap again or Esc to close.
  const unpick = (c) => { c.querySelectorAll("[data-mc-pick]").forEach((r) => { r.classList.remove("on", "dim"); r.setAttribute("aria-pressed", "false"); const b = r.nextElementSibling; if (b && b.classList.contains("mc-below")) b.hidden = true; }); c.querySelectorAll(".mc-on").forEach((x) => x.classList.remove("mc-on")); const n = c.querySelector(".mc-note2"); if (n) { n.innerHTML = n.dataset.default; n.classList.remove("on"); } };
  document.addEventListener("click", (e) => {
    const sq = e.target.closest("[data-mc-detail]");
    if (sq) { const c = sq.closest(".mc-card2"), n = c.querySelector(".mc-note2"); const was = sq.classList.contains("mc-on"); c.querySelectorAll(".mc-on").forEach((x) => x.classList.remove("mc-on")); if (was && !c.querySelector("[data-mc-pick].on")) { n.innerHTML = n.dataset.default; n.classList.remove("on"); return; } sq.classList.add("mc-on"); if (sq.dataset.mcHtml) n.innerHTML = sq.dataset.mcHtml; else n.textContent = sq.dataset.mcDetail; n.classList.add("on"); e.preventDefault(); return; }
    const tg = e.target.closest("[data-mc-toggle]");
    if (tg) { const box = tg.nextElementSibling, open = box.hidden; box.hidden = !open; tg.setAttribute("aria-expanded", String(open)); tg.textContent = open ? tg.dataset.on : tg.dataset.off; return; }
    const row = e.target.closest("[data-mc-pick]");
    if (!row) return;
    const c = row.closest(".mc-card2"), was = row.classList.contains("on");
    unpick(c);
    if (was) return;
    row.classList.add("on"); row.setAttribute("aria-pressed", "true");
    c.querySelectorAll("[data-mc-pick]").forEach((r) => r !== row && r.classList.add("dim"));
    const b = row.nextElementSibling; if (b && b.classList.contains("mc-below")) b.hidden = false;
    const n = c.querySelector(".mc-note2"); if (n) { n.innerHTML = row.dataset.note; n.classList.add("on"); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".mc-card2").forEach(unpick);
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-mc-detail]")) { e.preventDefault(); e.target.click(); }
  });

  window.MagicCharts = { chartCard, plot, tappable, theme, stateView, fit, FONT, plural, joinAnd, card, empty, capped, pickAttrs, esc, attr, steps, dotOnScale, squareGrid, timelineRows, matrix, LEVELS5 };
})();
