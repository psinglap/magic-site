// Chart gallery (#/dev/charts), for design review only; not linked from the menu.
// Every chart in app.js, drawn as it is today, with five datasets each: typical, empty, a single
// item, 50+ items and very long labels. Each sits in a MagicCharts.chartCard so taps show details.
(() => {
  const DE = "bde74dbf-3940-4681-ae98-9080a1b4d2c2";
  const LONG = "An unusually long label that keeps going to test wrapping and truncation";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));

  // Profile model charts take {n, counts, earlier, examples, emerging}.
  const modelData = (real, keys) => ({
    typical: real,
    empty: { n: 0, counts: Object.fromEntries(keys.map((k) => [k, 0])), earlier: Object.fromEntries(keys.map((k) => [k, 0])), examples: {}, emerging: null },
    single: { n: 3, counts: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 3 : 0])), earlier: Object.fromEntries(keys.map((k) => [k, 0])), examples: { [keys[0]]: ["One activity"] }, emerging: null },
    many: { ...real, n: real.n * 20, counts: Object.fromEntries(keys.map((k) => [k, (real.counts[k] || 0) * 20 + 50])) },
    long: { ...real, examples: Object.fromEntries(keys.map((k) => [k, [LONG, LONG + " again"]])) },
  });

  const areaRow = (i, name) => ({ id: `x${i}`, name, episodes: 300 - i * 4, last: Date.now() - i * 3600e3, levels: { exposed: 20 + i, familiar: 15, understands: 6, applies: 3, can_teach: i % 7 === 0 ? 1 : 0 } });
  const areaSets = (real) => ({ typical: real, empty: [], single: real.slice(0, 1), many: times(56, (i) => areaRow(i, `Area ${i + 1}`)), long: real.map((a) => ({ ...a, name: `${a.name}: ${LONG}` })) });

  const cardSets = (card) => {
    const s = (card.strengths || [])[0], w = (card.watchouts || [])[0];
    return {
      typical: card,
      empty: { ...card, strengths: [], watchouts: [], highlights: [], transition: { shifts: [] } },
      single: { ...card, strengths: s ? [s] : [], watchouts: w ? [w] : [], highlights: (card.highlights || []).slice(0, 1), transition: { ...(card.transition || {}), shifts: ((card.transition || {}).shifts || []).slice(0, 1) } },
      many: { ...card, strengths: times(52, (i) => ({ ...(s || {}), name: `Strength ${i + 1}`, n: 120 - i })), watchouts: times(52, (i) => ({ ...(w || {}), name: `Pattern ${i + 1}`, n: 100 - i, shadow_of: `Strength ${i + 1}` })), highlights: times(52, (i) => ({ name: `Highlight ${i + 1}`, short: "A short line.", n: 60 - i, weeks: times(8, (k) => (i + k) % 9) })), transition: { ...(card.transition || {}), shifts: times(52, (i) => ({ phase: ["ending", "neutral", "beginning"][i % 3], label: `Shift ${i + 1}`, detail: "Detail." })) } },
      long: { ...card, strengths: (card.strengths || []).map((x) => ({ ...x, name: `${x.name}: ${LONG}`, short: `${x.short} ${LONG}.` })), watchouts: (card.watchouts || []).map((x) => ({ ...x, name: `${x.name}: ${LONG}` })), highlights: (card.highlights || []).map((x) => ({ ...x, name: `${x.name}: ${LONG}` })), transition: { ...(card.transition || {}), shifts: ((card.transition || {}).shifts || []).map((x) => ({ ...x, label: `${x.label}: ${LONG}` })) } },
    };
  };

  // Blind spots are the watchouts named "Blind spot: …".
  const blindSets = (card) => {
    const bs = (card.watchouts || []).filter((w) => /^blind spot/i.test(w.name || "")), b0 = bs[0] || { name: "Blind spot: One thing", short: "A short line.", full: "A longer line." };
    return { typical: card, empty: { ...card, watchouts: [] }, single: { ...card, watchouts: [b0] },
      many: { ...card, watchouts: times(52, (i) => ({ ...b0, name: `Blind spot: Spot ${i + 1}` })) },
      long: { ...card, watchouts: bs.map((x) => ({ ...x, name: `${x.name}: ${LONG}`, short: `${x.short} ${LONG}.` })) } };
  };
  const rhythmSets = (real) => ({ typical: real, empty: [], single: [[2, 10, 4]], many: times(7 * 24, (i) => [Math.floor(i / 24), i % 24, (i * 7) % 23]), long: real });

  // Topic charts take the topic (d), its mentor (m) and its guide (g).
  const topicSets = (d, m, g) => {
    const empty = { d: { ...clone(d), concepts: [] }, m, g: { ...clone(g), map: {}, subs: {}, skills: {} } };
    const c0 = d.concepts[0], single = { d: { ...clone(d), concepts: [c0] }, m, g: { ...clone(g), skills: { ...(g.skills || {}), projects: ((g.skills || {}).projects || []).slice(0, 1) } } };
    const extra = d.concepts.map((c) => ({ ...c, id: `${c.id}-copy`, name: `${c.name} (copy)` }));
    const map2 = { ...(g.map || {}) }, subs2 = { ...(g.subs || {}) };
    extra.forEach((c) => { map2[c.id] = (g.map || {})[c.id.replace(/-copy$/, "")]; subs2[c.id] = (g.subs || {})[c.id.replace(/-copy$/, "")]; });
    const projects = (g.skills || {}).projects || [];
    const many = { d: { ...clone(d), concepts: [...d.concepts, ...extra] }, m, g: { ...clone(g), map: map2, subs: subs2, skills: { ...(g.skills || {}), projects: times(52, (i) => ({ ...(projects[i % projects.length] || { uses: [] }), name: `Project ${i + 1}` })) } } };
    const lm = clone(m);
    ["steps", "across"].forEach((k) => (lm.flow?.[k] || []).forEach((x) => (x.short = `${x.part}, ${LONG}`)));
    const lsubs = Object.fromEntries(Object.entries(g.subs || {}).map(([k, v]) => [k, `${v}: ${LONG}`]));
    const long = { d: { ...clone(d), concepts: d.concepts.map((c) => ({ ...c, name: `${c.name}: ${LONG}` })) }, m: lm, g: { ...clone(g), subs: lsubs, skills: { ...(g.skills || {}), projects: projects.map((p) => ({ ...p, name: `${p.name}: ${LONG}`, what: `${p.what} ${LONG}` })) } } };
    return { typical: { d, m, g }, empty, single, many, long };
  };

  const DATASETS = [["typical", "Typical"], ["empty", "Empty"], ["single", "A single item"], ["many", "50+ items"], ["long", "Very long labels"]];

  window.pageChartGallery = async function pageChartGallery() {
    main.innerHTML = `<div class="page dev-charts"><span class="spinner"></span> Loading every chart…</div>`;
    const [st, d, G] = await Promise.all([api("/api/profile/stats"), api(`/api/docs/${DE}`), api(`/api/guide/${DE}`)]);
    const b = st.behaviour || {}, card = st.card || {}, m = G.mentor || {}, g = G.guide || {};
    const mind = (k, fn) => ({ sets: modelData(b[k], Object.keys(MODEL[k].tags)), draw: (x) => (x.n < 3 ? `<div class="v-mind-empty faint">Not enough classified yet.</div>` : fn(x, MODEL[k])) });
    const tp = topicSets(d, m, g);
    const topic = (fn) => ({ sets: tp, draw: ({ d, m, g }) => fn(d, m, g) });
    const CHARTS = [
      ["Your personality (two-pole)", "#/me", { sets: { typical: st, empty: { behaviour: {}, totals: {}, areas: [], rhythm: [] }, single: { behaviour: {}, totals: st.totals, areas: [], rhythm: [] }, many: { ...st, areas: areaSets(st.areas).many }, long: st }, draw: youPersonality }],
      ["Interests", "#/me", { sets: modelData(b.interest, Object.keys(RIASEC)), draw: riasec }],
      ["Motivation", "#/me", { sets: modelData(b.motive, ["achievement", "power", "affiliation"]), draw: ternary }],
      ["Values", "#/me", { sets: modelData(b.value, SCHWARTZ.map((x) => x[0])), draw: schwartz }],
      ["Thinking style", "#/me", mind("thinking", wholeBrain)],
      ["Learning style", "#/me", mind("learning", kolb)],
      ["How you ask questions", "#/me", mind("question", bloom)],
      ["How you decide", "#/me", mind("decision", rowe)],
      ["Strengths and their shadows", "#/me", { sets: cardSets(card), draw: shadows }],
      ["Who you're becoming", "#/me", { sets: cardSets(card), draw: bridges }],
      ["Blind spots (list)", "#/me", { sets: blindSets(card), draw: youBlindSpots }],
      ["Highlights (list with weekly bars)", "#/me", { sets: Object.fromEntries(Object.entries(cardSets(card)).map(([k, c]) => [k, c.highlights || []])), draw: youHighlights }],
      ["Depth of knowledge (stacked levels)", "#/me", { sets: areaSets(st.areas), draw: youDepth }],
      ["When you learn (heat grid)", "#/me", { sets: rhythmSets(st.rhythm || []), draw: (r) => youWhen(r, st.totals) }],
      ["Topic map (flow chart)", "#/k/<topic> · Learnings", topic(topicParts)],
      ["Your path forward", "#/k/<topic> · Analytics", topic((d, m, g) => topicPath(g))],
      ["Your mentors", "#/k/<topic> · Analytics", topic(topicMentors)],
      ["Skills: where you stand, what you know, when you came back, where used", "#/k/<topic> · Analytics", topic(topicSkills)],
      ["Sample: skills grid", "#/k/<topic>/preview", topic((d, m, g) => pvCharts(d, m, g).skills)],
      ["Sample: worth revisiting", "#/k/<topic>/preview", topic((d, m, g) => pvCharts(d, m, g).revisit)],
      ["Sample: where you've used it", "#/k/<topic>/preview", topic((d, m, g) => pvCharts(d, m, g).used)],
    ];
    const pick = S.galleryPick || "all";
    main.innerHTML = `<div class="page dev-charts">
      <header><div class="crumb">Design review · not in the menu</div><h1>Chart gallery</h1>
        <p class="v-sub">Every chart in the portal as it is today, each with five datasets. Tap a mark to see its detail in the card's note line.</p>
        <nav class="dc-pick">${[["all", "All charts"], ...CHARTS.map(([n], i) => [String(i), n])].map(([k, n]) => `<button data-gpick="${k}" class="${pick === k ? "on" : ""}">${esc(n)}</button>`).join("")}</nav></header>
      <section class="dc-chart" id="dc-system"><h2 class="dc-h">Chart system <span>MagicCharts</span></h2><div class="dc-sets"></div></section>
      ${CHARTS.map(([n, where], i) => (pick === "all" || pick === String(i) ? `<section class="dc-chart" data-i="${i}"><h2 class="dc-h">${esc(n)} <span>${esc(where)}</span></h2><div class="dc-sets"></div></section>` : "")).join("")}
    </div>`;
    const { chartCard, plot, tappable, theme } = MagicCharts;
    // The module itself: a Plot chart with tappable marks, and the three states.
    const sys = main.querySelector("#dc-system .dc-sets");
    const parts = (m.areas || []).map((a, i) => ({ part: a.name.replace(/\s*\(.*\)$/, ""), n: d.concepts.filter((c) => (g.map || {})[c.id] === a.name).length, i }));
    sys.append(
      chartCard({ title: "A Plot chart through the module", subtitle: "Ideas per part, Data Engineering", takeaway: "Every chart reads its colours from the page tokens and sends taps to this note line.",
        render: (el, { width }) => { const ml = Math.min(200, Math.round(width * 0.42)); return plot({ width, height: 40 + parts.length * 34, marginLeft: ml, x: { label: null, axis: null }, y: { label: null, tickFormat: MagicCharts.fit(Math.floor(ml / 7.2)) },
          marks: [Plot.barX(parts, { y: "part", x: "n", fill: (d) => theme().parts[d.i % 5], rx: 4, render: tappable((d) => `${d.part}: ${d.n} ideas`) }), Plot.text(parts, { y: "part", x: "n", text: (d) => String(d.n), dx: 6, textAnchor: "start", fill: theme().muted })] }); } }),
      chartCard({ title: "Loading state", subtitle: "A skeleton in the chart's place", state: { kind: "loading" } }),
      chartCard({ title: "Empty state", subtitle: "What will appear and how to make it happen", state: { kind: "empty", text: "No ideas recorded in this topic yet.", how: "Read or ask about it, and they'll appear here." } }),
      chartCard({ title: "Error state", subtitle: "What happened, nothing lost, one action", state: { kind: "error", text: "This chart couldn't load.", retry: () => route() } }),
    );
    CHARTS.forEach(([n, , c], i) => {
      const host = main.querySelector(`.dc-chart[data-i="${i}"] .dc-sets`);
      if (!host) return;
      DATASETS.forEach(([k, label]) => host.append(chartCard({ title: label, subtitle: n, render: () => c.draw(c.sets[k]) })));
    });
    main.querySelectorAll("[data-gpick]").forEach((b) => (b.onclick = () => { S.galleryPick = b.dataset.gpick; pageChartGallery(); }));
  };
})();
