// Magic — your activity becomes an organised knowledge base.
// Left: you, activity + knowledge. Center: the page. Right: a summary and one chat box.

const $ = (sel, el = document) => el.querySelector(sel);
const main = $("#main");
const right = $("#right");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
marked.use({ renderer: { html: ({ text }) => esc(text) } });
const md = (s) => marked.parse(s || "");
mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });

async function api(path, opts = {}) {
  if (MOCKCHAT && path === "/api/chat") return mockChat(MOCKCHAT);
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ===== Chat test mode (for UX review only) =====
// http://127.0.0.1:7777/?mockchat=ok#/me — the chat's network call is replaced, nothing else.
// ok: a normal reply after ~3s · slow: 15s · error: a server error · offline: models off (light mode)
// long: a very long reply with a list and code. Without ?mockchat the real endpoint is used.
const MOCKCHAT = new URLSearchParams(location.search).get("mockchat");
async function mockChat(mode) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reply = (text) => ({ intent: "discuss", reply: text });
  if (mode === "error") { await wait(1200); throw new Error("Internal Server Error"); }
  if (mode === "offline") { await wait(2000); throw new Error("model Brain is not running yet"); }
  if (mode === "slow") { await wait(15000); return reply("You asked a good question, and the honest answer is that it depends on how often your data changes. For your Notion sync, versioning each write is the simplest safe start."); }
  if (mode === "long") {
    await wait(3000);
    return reply(`You have the foundations of ingestion in place: your Notion sync now writes the same result whether it runs once or three times, and you know why that matters.\n\nThe next thing worth learning is backpressure, because your job pipeline will meet bursts. Here is a small way to try it this week:\n\n1. Put a queue between the job scraper and the Notion writer.\n2. Cap how many writes run at once.\n3. Watch what happens when you feed it 500 jobs at once.\n4. Note where it slows down, and why.\n\n\`\`\`python\nimport asyncio\n\nsem = asyncio.Semaphore(4)  # at most four writes at a time\n\nasync def write(card):\n    async with sem:\n        await notion.update(card)\n\`\`\`\n\n${Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}: you'll notice the queue grows while the writer catches up, and that's fine as long as it drains. What you're learning is to treat load as something to shape, not something to survive. Keep notes on what you see, because they become your own playbook.`).join("\n\n")}`);
  }
  await wait(3000);
  return reply("You've built the part of ingestion most people skip: your Notion sync now gives the same result however many times it runs, so a retry can never create a duplicate.\n\nThe next step that would make the biggest difference is learning how to handle bursts. When fifty job posts arrive at once, a small queue in front of the writer keeps everything steady instead of failing halfway.\n\nIf you'd like, start with the smallest version: cap your writes at four at a time and watch what happens with a big batch. That one experiment will teach you more than another article.");
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
const ago = (ts) => {
  const d = (Date.now() - ts) / 1000;
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
};
const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Five plain steps, each named for what you've actually done with an idea.
const LEVEL = { exposed: "Read", familiar: "Explored", understands: "Understood", applies: "Applied", can_teach: "Fluent" };
// The same steps in one line each, for the scale shown on the page.
const LEVEL_SAY = {
  exposed: "you came across it once",
  familiar: "you came back to it or asked about it",
  understands: "you explained it in your own words",
  applies: "you used it in real work",
  can_teach: "you've used it and explained it again and again",
};
// How each level is earned — mirrors recompute_level in brain.rs. Counts are distinct activities.
const LEVEL_RULE = {
  exposed: "You've read or heard about it once — nothing more yet.",
  familiar: "You came back to it: read or heard about it in 2+ activities, OR spent real time on it (highlighted, copied, re-read), OR asked a question about it.",
  understands: "You explained it in your own words at least once (typing, voice, or your side of a call) — OR you asked about it, engaged with it and saw it 2+ times. A solid answer in Reflect also lifts it here.",
  applies: "You actually used it at least once — in code, a decision, or real work. Planning to use it doesn't count.",
  can_teach: "You've used it 2+ times AND explained it in your own words 2+ times — or used it once and gave a deep answer in Reflect.",
};
const levelTip = (l) => `${LEVEL[l]} — ${LEVEL_RULE[l]}`;

// "New" = added since your previous visit to this page.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};
function visit(page) {
  const seen = store.get("seen") || {};
  const prev = seen[page] || Date.now();
  seen[page] = Date.now();
  store.set("seen", seen);
  return prev;
}

// ---------- State ----------
const S = { topicTab: store.get("topicTab") || "analytics", mentorChat: !!store.get("mentorChat"), page: null, doc: "overview", data: null, target: { type: "doc" }, targetLabel: "", since: 0, open: new Set() };

// ---------- Router ----------
async function route() {
  const [page, a, b] = (location.hash.slice(2) || "me").split("/").map(decodeURIComponent);
  S.page = page;
  const inRecord = page === "activity" || page === "settings" || (page === "k" && (a || "overview") === "overview");
  document.querySelectorAll("[data-nav]").forEach((x) => x.classList.toggle("active", x.dataset.nav === (inRecord ? "record" : page)));
  main.innerHTML = `<div class="page empty"><span class="spinner"></span></div>`;
  try {
    if (page === "dev" && a === "charts") await pageChartGallery();
    else if (page === "k") await pageKnowledge(a || "overview", b);
    else if (page === "settings") await pageSettings();
    else if (page === "activity") await pageActivity(a);
    else await pageProfile();
  } catch (e) {
    main.innerHTML = `<div class="page empty">Couldn't load: ${esc(e.message)}</div>`;
  }
  renderTree();
}
addEventListener("hashchange", () => { main.scrollTop = 0; route(); });

// ---------- Your record: everything Magic has captured, and how it captures it ----------
const recordTabs = (cur) => `<div class="rec-tabs" role="tablist">${[["activity", "#/activity", "Activity"], ["all", "#/k/overview", "Everything recorded"], ["settings", "#/settings", "Recording & privacy"]]
  .map(([k, href, label]) => `<a role="tab" href="${href}" class="${k === cur ? "on" : ""}" aria-selected="${k === cur}">${label}</a>`).join("")}</div>`;

// ---------- Left: knowledge tree ----------
async function renderTree() {
  const domains = await api("/api/domains").catch(() => []);
  const seen = store.get("seen") || {};
  const byParent = {};
  domains.forEach((d) => (byParent[d.parent_id || "root"] ||= []).push(d));
  Object.values(byParent).forEach((l) => l.sort((x, y) => y.last_active - x.last_active));
  // Categories show first; a category's subcategories open when you click it (or its arrow),
  // and the one you're in stays open.
  const open = new Set(store.get("treeOpen") || []), shut = new Set(store.get("treeShut") || []);
  const holds = (d, id) => d.id === id || (byParent[d.id] || []).some((k) => holds(k, id));
  // One category open at a time (with the categories above it), so the menu never grows long.
  const byId = Object.fromEntries(domains.map((d) => [d.id, d]));
  const isAncestor = (id, of) => byId[id] && holds(byId[id], of);
  const only = (id) => { for (const o of [...open]) if (!isAncestor(o, id)) open.delete(o); open.add(id); shut.delete(id); };
  const node = (d) => {
    const kids = byParent[d.id], isOpen = kids && !shut.has(d.id) && (open.has(d.id) || (S.page === "k" && holds(d, S.doc)));
    return `<div class="node">
    <a href="#/k/${d.id}" class="${S.page === "k" && S.doc === d.id ? "active" : ""}" ${kids ? `data-cat="${d.id}"` : ""}>${kids ? `<button class="tw ${isOpen ? "open" : ""}" data-tw="${d.id}" aria-label="${isOpen ? "Collapse" : "Expand"}">›</button>` : ""}<span>${esc(d.name)}</span>${d.last_active > (seen[`k:${d.id}`] || 0) ? `<span class="dot" title="New since you last looked"></span>` : ""}</a>
    ${isOpen ? `<div class="kids">${kids.map(node).join("")}</div>` : ""}</div>`;
  };
  $("#tree").innerHTML = `${(byParent.root || []).map(node).join("") || `<div class="faint" style="padding:6px 10px">Appears as you read and learn.</div>`}`;
  const save = () => { store.set("treeOpen", [...open]); store.set("treeShut", [...shut]); };
  $("#tree").querySelectorAll("[data-tw]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.tw;
    if (b.classList.contains("open")) { open.delete(id); shut.add(id); } else only(id);
    save(); renderTree();
  }));
  $("#tree").querySelectorAll("[data-cat]").forEach((a) => a.addEventListener("click", () => { only(a.dataset.cat); save(); }));
}

// ---------- Activity ----------
const KIND_ICON = { read: "Read", search: "Search", ai_user: "AI chat", highlight: "Highlight", typed: "Wrote", voice: "Voice", call: "Call", note: "Note" };

async function pageActivity(date = dayStr()) {
  const t = await api(`/api/today?date=${date}`);
  const since = visit("activity");
  const d = new Date(date + "T12:00:00");
  const prev = dayStr(new Date(+d - 86400000));
  const next = dayStr(new Date(+d + 86400000));
  const eps = t.episodes;
  main.innerHTML = `<div class="page">${recordTabs("activity")}
    <div class="row spread"><h1>${date === dayStr() ? "Today" : d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h1>
      <div class="row"><a class="link" href="#/activity/${prev}">← Earlier</a>${date < dayStr() ? `<a class="link" href="#/activity/${next}">Later →</a>` : ""}</div></div>
    <div class="meta">${eps.length ? `${eps.length} activities · ${new Set(eps.flatMap((e) => e.domains.map((x) => x.id))).size} areas` : "Nothing recorded yet."}</div>
    <div class="list" style="margin-top:18px">${eps.map((e) => activityRow(e, since)).join("") || `<div class="empty">As you read, ask and talk, your activity appears here — and flows into your knowledge.</div>`}</div>
  </div>`;
  main.querySelectorAll("[data-ep]").forEach((el) => el.addEventListener("click", (ev) => {
    if (ev.target.closest("a, button")) return;
    el.classList.toggle("open");
    el.querySelector(".detail").classList.toggle("hidden");
  }));
  bindMore(main);
  setContext("overview", { type: "doc" }, date === dayStr() ? "Today" : fmtDate(+d));
  renderRight({ kind: "day", date, synthesis: t.synthesis });
}

function activityRow(e, since) {
  const kinds = (e.kinds || []).filter((k) => k !== "read_progress" && k !== "ai_assistant" && k !== "select" && k !== "copy");
  const icon = KIND_ICON[kinds.find((k) => KIND_ICON[k])] || "Activity";
  const status = e.status === "open" ? `<span class="chip gray">now</span>`
    : e.status === "skipped" ? `<span class="chip gray" title="${esc(e.error || "")}">${(e.error || "").startsWith("Skipped by your rule") ? "skipped by your rule" : "not kept"}</span>`
    : e.status !== "processed" ? `<span class="spinner" title="Understanding…"></span>` : "";
  return `<div class="item" data-ep="${e.id}">
    <div class="row" style="align-items:flex-start"><span class="time">${fmtTime(e.start)}</span><span><span class="kind">${icon}</span><span class="title">${esc(e.title || "Activity")}</span>${e.start > since ? ` <span class="new">new</span>` : ""}</span></div>
    <div class="side">${e.domains.map((x) => `<a class="chip" href="#/k/${x.id}">${esc(x.path.split(" > ").pop())}</a>`).join("")}${status}<button class="more" data-more='{"type":"episode","id":"${e.id}"}'>⋯</button></div>
    ${e.summary ? `<div class="sub clamp2" style="padding-left:74px">${esc(e.summary)}</div>` : ""}
    <div class="detail hidden" style="padding-left:74px">${(e.items || []).map((i) => `<div>• <span class="faint">${esc(i.kind)}</span> ${esc(i.text)}</div>`).join("")}</div>
  </div>`;
}

// ---------- Knowledge page ----------
async function pageKnowledge(doc, focus) {
  // #/k/<topic>/preview shows the proposed layout beside the live one, for comparison.
  S.preview = focus === "preview";
  document.body.classList.toggle("nr", S.preview || !!store.get("nr"));
  if (S.preview) focus = undefined;
  if (S.doc !== doc) S.open.clear();
  S.doc = doc;
  const [data, guide] = await Promise.all([api(`/api/docs/${doc}`), doc === "overview" ? null : api(`/api/guide/${doc}`).catch(() => ({}))]);
  S.data = data;
  S.guide = guide;
  S.since = visit(`k:${doc}`);
  S.map = false;
  if (focus) S.open.add(focus);
  const name = doc === "overview" ? "Everything recorded" : S.data.domain.name;
  setContext(doc, focus ? { type: "concept", id: focus } : { type: "doc" }, focus ? S.data.concepts.find((c) => c.id === focus)?.name : name);
  // A topic without a guide gets one written now; the page polls until it lands.
  if (guide && !guide.guide && !guide.building && ((data.concepts || []).length || (data.items || []).length)) {
    await api(`/api/guide/${doc}`, { method: "POST" }).catch(() => {});
    S.guide.building = true;
  }
  renderDoc();
  renderRight({ kind: "doc" });
  if (guide && guide.building) pollGuide(doc);
  if (doc === "overview" && !S.data.blocks.synthesis && (S.data.domains || []).length) writeSummary(true);
}

// Re-render once a guide that's being written arrives (or is updated).
function pollGuide(doc) {
  clearTimeout(S.poll);
  S.poll = setTimeout(async () => {
    if (S.page !== "k" || S.doc !== doc) return;
    const g = await api(`/api/guide/${doc}`).catch(() => null);
    if (!g) return pollGuide(doc);
    const changed = (g.built || 0) !== ((S.guide && S.guide.built) || 0) || !!g.mentor !== !!(S.guide && S.guide.mentor);
    S.guide = g;
    if (changed || !g.building) {
      const top = main.scrollTop;
      S.data = await api(`/api/docs/${doc}`);
      renderDoc();
      main.scrollTop = top;
      if (changed) renderRight({ kind: "doc" });
    }
    if (g.building) pollGuide(doc);
  }, 6000);
}

function renderDoc() {
  const d = S.data;
  if (S.doc === "overview") return renderOverview(d);
  const isNew = (ts) => ts > S.since;
  const items = d.items || [];
  const by = (...kinds) => items.filter((i) => kinds.includes(i.kind));
  const refNo = Object.fromEntries((d.references || []).map((r, i) => [r.id, i + 1]));
  main.innerHTML = `<div class="page topic">
    ${S.preview ? previewPage(d, S.guide || {}) : `${topicHead(d)}${topicGuide(d, S.guide || {})}`}
    ${S.topicTab !== "study" ? "" : `<details class="t-record" ${S.recordOpen ? "open" : ""}><summary><b>Everything recorded</b> <span class="faint">· ${d.concepts.length} concepts · ${by("question", "gap").length} questions &amp; gaps · ${by("idea", "work").length} ideas &amp; work · ${(d.references || []).length} sources — to revise, edit or add</span>
</summary>
    <div class="t-record-tools"><button class="link" id="maptoggle">${S.map ? "Show list" : "Show as map"}</button></div>
    ${S.map ? `<div class="diagram" id="diagram"></div>` : `
    <h2>What you know</h2>
    <div class="list">${d.concepts.map((c) => conceptRow(c, refNo, isNew)).join("") || `<div class="empty">Nothing yet.</div>`}</div>
    <h2>Open questions</h2>
    <div class="list">${by("question", "gap").sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1)).map((i) => itemRow(i, isNew, true)).join("")}
      <input class="text add" data-add="question" placeholder="+ Add a question you're holding"></div>
    <h2>Your ideas & work</h2>
    <div class="list">${by("idea", "work").map((i) => itemRow(i, isNew)).join("")}<input class="text add" data-add="idea" placeholder="+ Add an idea"></div>
    ${by("highlight").length ? `<h2>Highlights</h2><div class="list">${by("highlight").map((i) => itemRow(i, isNew)).join("")}</div>` : ""}
    <h2>Your notes</h2>
    <div class="notes editable" id="notes">${d.blocks.notes ? esc(d.blocks.notes.content) : `<span class="faint">Click to write your own notes…</span>`}</div>
    ${(d.references || []).length ? `<h2>Sources</h2>${d.references.map((r, i) => `<div class="small" style="padding:3px 0"><span class="faint">${i + 1}.</span> ${r.url ? `<a href="${esc(r.url)}" target="_blank" style="color:var(--accent)">${esc(r.title || r.url)}</a>` : esc(r.title || "")} <span class="faint">· ${esc(r.kind === "ai_chat" ? "AI chat" : r.site || "")}</span></div>`).join("")}` : ""}`}
    </details>`}
  </div>`;
  bindDoc();
  bindTopic();
  if (S.map) drawMap();
}

// ---------- A topic, as its mentor would teach it ----------
// The guide (written by the topic's mentor from the record) leads; the raw record sits below it.
// Every topic is laid out the same way, whatever it is and whoever recorded it.
const STAGES = [
  ["novice", "Novice", "Follows rules; little context yet"],
  ["advanced_beginner", "Advanced beginner", "Recognises patterns from experience"],
  ["competent", "Competent", "Plans deliberately and owns outcomes"],
  ["proficient", "Proficient", "Sees the whole situation; adapts"],
  ["expert", "Expert", "Acts from deep, intuitive mastery"],
];
const STAGE_HOW = `Dreyfus model of skill acquisition (Dreyfus & Dreyfus, 1980), measured from your record with the same rule for every topic.
"Covered" = a part of the mentor's framework where you know at least one concept beyond having read about it.`;
// What each stage asks for — mirrors stage() in guide.rs. [label, your value, target, unit].
function stageNeeds(key, st) {
  const cov = Math.round((100 * (st.covered || 0)) / Math.max(1, st.areas || 1));
  const covLabel = (t) => `Cover ${t}% of the framework`;
  return {
    advanced_beginner: { any: true, needs: [["Know 40% of your concepts beyond reading about them", st.familiar, 40], [covLabel(30), cov, 30]] },
    competent: { needs: [["Understand 25% of your concepts", st.understands, 25], [covLabel(50), cov, 50]] },
    proficient: { needs: [["Apply 20% of your concepts in real work", st.applies, 20], [covLabel(70), cov, 70]] },
    expert: { needs: [["Be able to teach 10% of your concepts", st.teaches, 10], ["Apply 30% of your concepts", st.applies, 30], [covLabel(80), cov, 80]] },
  }[key];
}
const initials = (n) => String(n || "?").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || n[0];
const mentorTip = (l) => [l.org && `Today: ${l.org}`, l.description, l.bio, l.known_for && `Known for: ${l.known_for}`, l.why && `Why at this stage: ${l.why}`].filter(Boolean).join("\n\n");
const stageName = (k) => (STAGES.find((x) => x[0] === k) || [, k])[1];

function shortText(t, n) {
  t = String(t || "").trim();
  return t.length > n ? t.slice(0, n).replace(/[ ,;:(]+\S*$/, "") + "…" : t;
}
// The standard itself, without its explanation: "Idempotency is non-negotiable: …" → "Idempotency is non-negotiable".
const shortRule = (r) => shortText(String(r).split(/:\s|;\s| — /)[0], 90);
// "Author of *Inspired: How to Create…*" → "Author of Inspired"
const roleLine = (t) => shortText(String(t || "").replace(/[*"'“”]/g, "").replace(/:[^·]*/, ""), 60);

function firstSentence(t) {
  const x = String(t || "").split(/(?<=[.!?])\s/)[0];
  return x.length > 140 ? x.slice(0, 137).replace(/[ ,;]+\S*$/, "") + "…" : x;
}

function topicHead(d) {
  const m = (S.guide || {}).mentor;
  const cur = ((S.guide || {}).guide || {}).stage?.key;
  return `<header class="t-head">
    <div class="t-title">
      <div class="crumb">${esc((d.path || "").split(" > ").slice(0, -1).join(" / ") || "Knowledge")}</div>
      <h1 class="editable" data-edit-domain="name">${esc(d.domain.name)}</h1>
      <div class="lede editable" data-edit-domain="description">${esc(d.domain.description || "Add a description…")}</div>
      <div class="meta">${d.concepts.length} concepts · ${d.episodes || 0} activities · ${(d.references || []).length} sources · active ${ago(d.domain.last_active)}</div>
      ${(d.subdomains || []).length ? `<div class="row" style="margin-top:10px;flex-wrap:wrap">${d.subdomains.map((x) => `<a class="chip" href="#/k/${x.id}">${esc(x.name)}</a>`).join("")}</div>` : ""}
    </div>
    ${m ? `<button class="t-mentor" id="mentor" aria-expanded="${S.mentorOpen ? "true" : "false"}">
      <span class="t-mentor-av">${esc((m.role || "M").trim()[0])}</span>
      <span><span class="p-label">Your mentor</span><b>${esc(m.role)}</b><span class="faint">${esc((m.leaders || []).slice(0, 3).map((l) => l.name).join(" · "))}</span></span></button>` : ""}
  </header>
  `;
}

function topicGuide(d, G) {
  const g = G.guide;
  if (!g) {
    return `<section class="v-panel t-wait"><span class="spinner"></span> ${G.mentor ? `Your mentor (${esc(G.mentor.role)}) is reading` : "Finding the right mentors for this topic and reading"} everything you've recorded here — ${d.concepts.length} concepts, ${(d.items || []).length} notes from ${d.episodes || 0} activities. This takes a few minutes the first time; the page updates by itself.</section>`;
  }
  const m = G.mentor || {};
  const st = g.stage || {};
  const si = Math.max(0, STAGES.findIndex((x) => x[0] === st.key));
  const next = STAGES[si + 1];
  const req = next && stageNeeds(next[0], st);
  const leaders = m.leaders || [];
  const nowL = leaders.filter((l) => l.stage === st.key);
  const nextL = next ? leaders.filter((l) => l.stage === next[0]) : [];
  const update = G.building
    ? `<span class="t-upd"><span class="spinner"></span> Updating with your latest activity…</span>`
    : G.new_activities ? `<span class="t-upd">${G.new_activities} new ${G.new_activities === 1 ? "activity" : "activities"} since this guide · <button class="link" id="reguide">Update now</button></span>`
    : `<span class="t-upd faint">Written ${ago(G.built)} · <button class="link" id="reguide">Rewrite</button></span>`;
  const person = (l, big) => `<a class="t-person ${big ? "big" : ""}" ${l.url ? `href="${esc(l.url)}" target="_blank"` : ""} data-tip="${esc(mentorTip(l))}"><span class="t-pav">${esc(initials(l.name))}</span><span><b>${esc(l.name)}</b><span>${esc(big ? l.why || l.description : l.description || "")}</span></span></a>`;
  const tab = S.topicTab === "study" ? "study" : "analytics";
  const tabs = `<nav class="t-tabs" role="tablist">${[["analytics", "Analytics"], ["study", "Learnings"]].map(([k, l]) => `<button role="tab" data-ttab="${k}" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</nav>`;
  if (tab === "study") return `${tabs}
  <section><h3 class="v-h">Your map of ${esc(d.domain.name)}</h3>
    <div class="v-sub t-source">${m.framework?.published === false ? `Your mentor's outline of ${esc(m.field || d.domain.name)}, in ${(m.areas || []).length} parts ` : m.framework?.name ? `${(m.areas || []).length} parts, from <b>${esc(m.framework.name)}</b>${m.framework.by ? ` by ${esc(m.framework.by)}` : ""}${m.framework.source ? ` · <a href="${esc(m.framework.source)}" target="_blank" rel="noopener">source</a>` : ""}` : ""}</div>
    ${topicParts(d, m, g)}</section>`;
  // Where you stand, said in full: the stage, what the next one asks of you, and your mentors' note.
  const needs = req ? req.needs.map(([label, v, target]) => `${label.charAt(0).toLowerCase()}${label.slice(1)} (${(v || 0) >= target ? "done" : `you're at ${v || 0}%`})`) : [];
  const reach = req ? `To reach <b>${next[1]}</b>, your mentors look for ${req.any ? "either of these" : needs.length > 1 ? "these" : "this"}: ${needs.length > 1 ? `${needs.slice(0, -1).join("; ")}${req.any ? "; or " : "; and "}${needs[needs.length - 1]}` : needs[0]}.` : "You're at the top stage: keep applying and teaching to stay there.";
  return `${tabs}
  <section class="t-standing">
    <div class="t-sum-top"><div class="p-label">Where you are</div>${update}</div>
    <div class="t-headline">${esc(g.headline)}</div>
    <div class="t-stages" data-tip="${esc(STAGE_HOW)}">${STAGES.map(([k, name, what], i) => `<div class="t-stage ${i < si ? "past" : i === si ? "now" : ""}"><i></i><b>${name}${i === si ? " · you" : ""}</b><span>${what}</span></div>`).join("")}</div>
    <p class="t-prose">${reach}</p>
    ${g.note ? `<blockquote class="t-note">${esc(g.note)}<cite>— your mentors${nowL.length ? `, ${esc(nowL.map((l) => l.name.split(" ").slice(-1)[0]).join(", "))}` : ""}</cite></blockquote>` : ""}
  </section>

  ${topicPath(g)}

  ${topicMentors(d, m, g)}

  ${topicSkills(d, m, g)}

  ${(g.questions || []).length ? `<section><h3 class="v-h">Open questions, answered</h3><div class="v-sub">Questions you asked, and ones worth asking at your stage · click one for the answer</div>
    <div class="t-faq">${g.questions.map((q, i) => `<div class="t-faq-row v-exp" tabindex="0"><div class="t-faq-q"><span class="t-wl-kind">${q.theirs ? "You asked" : "Worth asking"}</span><b>${esc(q.q)}</b><span class="v-caret">▾</span></div>
      <div class="v-more"><div class="t-a">${esc(q.answer)}</div><div>${esc(q.more)}</div></div></div>`).join("")}</div></section>` : ""}

  ${(g.work || []).length ? `<section><h3 class="v-h">At work</h3><div class="v-sub">What you've done and the ideas you've had, with your mentors' view · click one for why</div>
    <div class="t-wlist">${[...g.work].sort((x, y) => (x.kind === "applied" ? 0 : 1) - (y.kind === "applied" ? 0 : 1)).map((w) => `<div class="t-wl v-exp" tabindex="0">
      <span class="t-wl-kind">${w.kind === "applied" ? "Done" : "Idea"}</span><span class="t-wl-title">${esc(w.title)}</span><span class="t-wl-v ${w.verdict || ""}">${WORK_VERDICT[w.verdict] || ""}</span>
      <div class="v-more">${esc(w.detail)}<div style="margin-top:6px"><b>Your mentors:</b> ${esc(w.take)}</div></div></div>`).join("")}</div></section>` : ""}`;
}

const WORK_VERDICT = { pursue: "Worth pursuing", sharpen: "Needs sharpening", rethink: "Rethink this" };
const understood = (cs) => cs.filter((c) => LEVELS.indexOf(c.level) >= 2).length;

// The topic as its parts (the framework's categories), each split into subcategories, each holding
// its concepts. Plain words throughout: how many you understand, what you know, what's missing.
function topicParts(d, m, g) {
  const map = g.map || {}, subs = g.subs || {};
  const areas = m.areas || [];
  if (!areas.length) return "";
  const of = (a) => d.concepts.filter((c) => map[c.id] === a);
  const name = (n) => n.replace(/\s*\(.*\)\s*$/, "");
  const pct = (cs) => (cs.length ? (100 * understood(cs)) / cs.length : 0);
  const count = (cs) => (cs.length ? `${understood(cs)} of ${cs.length} understood` : "Not started");
  // The topic as a flow chart: where it starts, the steps in order inside one frame, what it leads
  // to, and the parts that run underneath every step. Each part keeps one colour everywhere.
  const flow = m.flow || {}, has = (x) => areas.some((ar) => ar.name === x.part);
  const steps = (flow.steps || []).filter(has), across = (flow.across || []).filter(has);
  if (!steps.length && !across.length) areas.forEach((ar) => steps.push({ part: ar.name, role: "" }));
  const order = [...steps, ...across].map((x) => x.part);
  const open = order.includes(S.partOpen) ? S.partOpen : null;
  const block = (x, cls) => {
    const cs = of(x.part), on = open === x.part;
    return `<button class="${cls} c${order.indexOf(x.part) % 8} ${on ? "on" : open ? "dim" : ""}" data-prow="${esc(x.part)}" aria-expanded="${on}">
      <b>${esc(x.short || name(x.part))}</b>
      <span class="dg-p"><span class="dg-fill"><i style="width:${pct(cs)}%"></i></span>${cs.length ? `${understood(cs)}/${cs.length}` : "—"}</span></button>`;
  };
  const ends = (flow.ends || []).filter(Boolean);
  const chart = `<div class="dg ${open ? "focus" : ""}">
    <div class="dg-row">
      ${flow.start ? `<div class="dg-io">${esc(flow.start)}</div><span class="dg-arr" aria-hidden="true"></span>` : ""}
      <div class="dg-frame">${steps.map((x, i) => `${i ? `<span class="dg-step-arr" aria-hidden="true">→</span>` : ""}${block(x, "dg-b")}`).join("")}</div>
      ${ends.length ? `<span class="dg-arr" aria-hidden="true"></span><div class="dg-outs">${ends.map((e) => `<div class="dg-io">${esc(e)}</div>`).join("")}</div>` : ""}
    </div>
    ${across.length ? `<div class="dg-under"><div class="dg-under-label">Underneath every step</div><div class="dg-under-row">${across.map((x) => block(x, "dg-b dg-u")).join("")}</div></div>` : ""}
  </div>`;
  // Nothing open: the chart, one line on how it flows, then the summary. A part open: the chart
  // with the others faded, and that part alone below it.
  const story = g.story ? `<p class="t-story">${esc(g.story)}</p>` : "";
  if (!open) return `${story}${chart}<p class="dg-caption">${flow.how ? `${esc(flow.how)} ` : ""}<span class="faint">Click a block to explore it.</span></p>`;
  return `${story}${chart}${partDetail(d, m, g, of, name, pct, count, order.indexOf(open) % 8)}`;
}

// One part, opened from the chart: what you know there in two sentences, then the groups inside it.
// A group opens and closes on click; while one is open the rest fade back.
function partDetail(d, m, g, of, name, pct, count, color) {
  const ar = (m.areas || []).find((x) => x.name === S.partOpen);
  if (!ar) return "";
  const a = ar.name, cs = of(a), subs = g.subs || {}, comps = g.components || {};
  const part = (g.parts || []).find((x) => x.area === a);
  const groups = {};
  cs.forEach((c) => (groups[subs[c.id] || a] ||= []).push(c));
  const list = Object.keys(groups).sort((x, y) => groups[y].length - groups[x].length);
  const key = (n) => `${a}||${n}`;
  const summary = (n) => { const c = comps[key(n)] || {}; return c.summary || (c.points || []).join(" "); };
  const cur = list.find((n) => S.grpOpen === key(n));
  const text = part ? part.story || [part.learned, part.missing].filter(Boolean).join(" ") : ar.what;
  return `<section class="dg-detail c${color}">
    <div class="dg-detail-head"><h4>${esc(name(a))}</h4><button class="fl-x" data-prow="${esc(a)}" aria-label="Close">×</button></div>
    <p class="dg-detail-story">${esc(text || "")}</p>
    ${list.length ? `<div class="fl-label">Inside ${esc(name(a))}</div>` : `<p class="faint">You haven't come across this part yet.</p>`}
    <div class="fl-groups ${cur ? "focus" : ""}">${list.map((n) => {
      const l = groups[n], on = n === cur, k = key(n), sum = summary(n), more = S.conList === k;
      return `<div class="fl-grp ${on ? "open" : cur ? "dim" : ""}">
        <button class="fl-grp-head" data-grp="${esc(k)}" aria-expanded="${on}"><b>${esc(name(n))}</b>
          <span class="fl-meter"><span class="fl-bar"><i style="width:${pct(l)}%"></i></span><span class="fl-n">${count(l)}</span></span><span class="v-caret">▾</span></button>
        ${on ? `<div class="fl-grp-body">
          ${sum ? `<p>${esc(sum)}</p>` : ""}
          <button class="link fl-more" data-conlist="${esc(k)}">${more ? "Hide the concepts" : `See the ${l.length} concept${l.length === 1 ? "" : "s"} behind this`}</button>
          ${more ? `<div class="fl-clist">${[...l].sort((x, y) => LEVELS.indexOf(y.level) - LEVELS.indexOf(x.level)).map((c) => `<div><button class="t-crow ${S.open.has(c.id) ? "on" : ""}" data-chip="${c.id}"><span>${esc(c.name)}</span><span class="t-lvl lv${LEVELS.indexOf(c.level)}">${LEVEL[c.level]}</span></button>${S.open.has(c.id) ? conceptCard(c) : ""}</div>`).join("")}</div>` : ""}
        </div>` : ""}
      </div>`;
    }).join("")}</div>
  </section>`;
}

// Your mentors (docs/chart-designs/mentors.html): who guides you at your stage, the guide's view,
// the standards they hold you to, and the mentors at every stage one tap away.
function topicMentors(d, m, g) {
  if (!m.role) return "";
  const st = g.stage || {}, leaders = m.leaders || [], C = MagicCharts;
  const stage = stageName(st.key), nowL = leaders.filter((l) => l.stage === st.key);
  const known = (l) => l.kind === "practitioner" ? `${roleLine(l.org || l.known_for)}, working today` : roleLine(l.known_for || l.description || "");
  const tip = (l) => `<p><b>${esc(l.name)}</b>. ${esc(mentorTip(l)).replace(/\n\n/g, " ")}</p>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Read about ${esc(l.name.split(" ")[0])}</a>` : ""}`;
  const who = (l) => `role="button" tabindex="0" data-mc-detail="${esc(l.name)}" data-mc-html="${esc(tip(l))}"`;
  const fw = m.framework || {};
  const heads = (m.rules || []).map((r) => { const t = String(r).trim(), [head, ...rest] = t.split(/:\s|;\s| — /); return { head: head.replace(/[.]$/, ""), full: t }; }).filter((x) => x.head);
  const NUMW = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const body = `
    <div class="mc-mt-guide">
      <span class="mc-label">Your guide in this topic</span>
      <p class="mc-mt-voice">A <b>${esc(m.role)}</b>, who puts it this way: “${esc(firstSentence(m.voice))}”</p>
      ${fw.name ? `<p class="mc-mt-fw">They organise ${esc(d.domain.name)} with <b>${esc(fw.name)}</b>${fw.by ? ` by ${esc(fw.by)}` : ""}${fw.why ? `, because ${esc(firstSentence(fw.why).replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/^because /, ""))}` : "."}</p>` : ""}
    </div>
    ${nowL.length ? `<div class="mc-mt-now">${nowL.map((l) => `<span class="mc-mt-p" ${who(l)}><span class="mc-mt-av">${esc(initials(l.name))}</span><span class="mc-mt-pt"><b>${esc(l.name)}</b><span>${esc(known(l))}</span></span></span>`).join("")}</div>` : ""}
    ${heads.length ? `<div class="mc-mt-std"><h4 class="mc-label">They hold you to ${heads.length <= 10 ? NUMW[heads.length] : heads.length} standard${heads.length === 1 ? "" : "s"}</h4>
      <div class="mc-chips">${heads.map((h) => `<span class="mc-chip" role="button" tabindex="0" data-mc-detail="${esc(h.full)}">${esc(h.head)}</span>`).join("")}</div></div>` : ""}
    <button type="button" class="mc-btn" data-mc-toggle aria-expanded="false" data-on="Hide the other stages" data-off="See mentors at every stage">See mentors at every stage</button>
    <div class="mc-mt-ladder" hidden>${STAGES.map(([k, sname]) => { const ls = leaders.filter((l) => l.stage === k); return `<div class="mc-mt-rung ${k === st.key ? "you" : ""}"><span class="mc-mt-stage">${sname}${k === st.key ? " · you" : ""}</span><span>${ls.length ? ls.map((l) => `<span class="mc-mt-name" ${who(l)}>${esc(l.name)}</span>`).join(", ") : `<span class="faint">No mentor for this stage yet</span>`}</span></div>`; }).join("")}</div>`;
  const names = nowL.map((l) => `<b>${esc(l.name)}</b>`);
  return `<section id="mentors">${MagicCharts.card({
    title: "Your mentors", subtitle: `Experts in ${d.domain.name}, chosen for your stage`, cls: "mc-mt",
    takeaway: nowL.length ? `At your stage, ${esc(stage)}, your mentor${nowL.length === 1 ? " is" : "s are"} ${C.joinAnd(names)}.` : `No mentor has been chosen for your stage, ${esc(stage)}, yet. The mentors for the other stages are below.`,
    body, note: "Tap a mentor or a standard to read more.",
  })}</section>`;
}

// What the skills charts are drawn from: each part of the topic with its ideas, your level there
// now and in your first stretch of recording, the level the role one stage up usually has, and
// the weeks you spent time on it.
const SKILL_HOW = "Your level in a part is the level reached by your strongest quarter of its ideas: what you can reliably do there, not an average pulled down by everything you've only skimmed.";
const KIND_LEVEL = { exposed: 0, engaged: 1, questioned: 1, articulated: 2, applied: 3 };
function topicData(d, m, g) {
  const areas = m.areas || [], map = g.map || {}, subs = g.subs || {}, sk = g.skills || {};
  const flow = m.flow || {}, byPart = Object.fromEntries([...(flow.steps || []), ...(flow.across || [])].map((x) => [x.part, x]));
  const order = [...(flow.steps || []), ...(flow.across || [])].map((x) => x.part).filter((a) => areas.some((ar) => ar.name === a));
  areas.forEach((ar) => order.includes(ar.name) || order.push(ar.name));
  const label = (a) => (byPart[a] || {}).short || a.replace(/\s*\(.*\)\s*$/, "");
  const rank = (c) => Math.max(0, LEVELS.indexOf(c.level));
  // An idea's level at a moment: the highest level its signals had reached by then (never above today's).
  const levelAt = (c, t) => { let r = -1; (c.signals || []).forEach((x) => { if ((x.ts || 0) <= t && KIND_LEVEL[x.kind] != null) r = Math.max(r, KIND_LEVEL[x.kind]); }); if (!(c.signals || []).length && (c.first_seen || 0) <= t) r = 0; return Math.min(r, rank(c)); };
  const depth = (ranks) => { const r = ranks.filter((x) => x >= 0).sort((x, y) => y - x); return r.length ? r[Math.floor((r.length - 1) * 0.25)] : -1; };
  const ts = d.concepts.flatMap((c) => (c.signals || []).map((x) => x.ts || 0)).filter(Boolean);
  const DAY = 86400000, WEEK = 7 * DAY, now = Date.now(), first = ts.length ? Math.min(...ts) : now;
  // "Then" is 12 weeks ago, or the end of your first week here if you started more recently.
  const twelve = now - 12 * WEEK, thenT = first < twelve ? twelve : Math.min(now, first + WEEK);
  const fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const span = (a, b) => (new Date(a).getMonth() === new Date(b).getMonth() ? `${fmt(a)}–${new Date(b).getDate()}` : `${fmt(a)}–${fmt(b)}`);
  const thenLabel = first < twelve ? "12 weeks ago" : `your first week (${span(first, thenT)})`;
  const parts = order.map((a, i) => {
    const cs = d.concepts.filter((c) => map[c.id] === a);
    const nowL = depth(cs.map(rank)), thenL = depth(cs.map((c) => levelAt(c, thenT)));
    const b = (sk.benchmark || []).find((x) => x.area === a);
    // When the part reached each level, replaying its signals in time order.
    const times = [...new Set(cs.flatMap((c) => (c.signals || []).map((x) => x.ts || 0)))].sort((x, y) => x - y);
    const reached = []; let cur = -1;
    times.forEach((t) => { const l = Math.min(nowL, depth(cs.map((c) => levelAt(c, t)))); if (l > cur) { for (let k = cur + 1; k <= l; k++) reached.push([k, t]); cur = l; } });
    // Weeks with time on this part, oldest of the last 12 first: 1–3 by how many moments that week.
    const weeks = Array.from({ length: 12 }, (_, w) => { const lo = now - (12 - w) * WEEK, hi = lo + WEEK; const n = cs.reduce((s, c) => s + (c.signals || []).filter((x) => x.ts > lo && x.ts <= hi).length, 0); return n ? (n >= 6 ? 3 : n >= 3 ? 2 : 1) : 0; });
    const lastSeen = (c) => Math.max(c.last_seen || 0, ...(c.signals || []).map((x) => x.ts || 0));
    const gs = {}; cs.forEach((c) => (gs[subs[c.id] || a] ||= []).push(c));
    return { area: a, name: label(a), hue: `var(--h${i % 8})`, cs, now: nowL, then: thenL, target: b ? LEVELS.indexOf(b.level) : -1, reached, weeks, lastSeen, groups: Object.entries(gs).sort((x, y) => y[1].length - x[1].length), next: ((g.parts || []).find((x) => x.area === a) || {}).next };
  });
  return { parts, order, label, rank, role: sk.role || "", projects: (sk.projects || []).filter((p) => (p.uses || []).length), thenLabel, fmt, now, WEEK, DAY };
}

// Tap details for the skills charts. Each one explains: what the part or idea is, what you did and
// learned there, and the moments behind it as a vertical timeline. All of it comes from your record.
const KIND_SAY = { exposed: "Read about it", engaged: "Came back to it", questioned: "Asked about it", articulated: "Explained it", applied: "Used it" };
function skillDetails(d, m, g, T) {
  const C = MagicCharts, L = C.LEVELS5, subs = g.subs || {}, comps = g.components || {};
  const flow = m.flow || {}, roleOf = (a) => ([...(flow.steps || []), ...(flow.across || [])].find((x) => x.part === a) || {}).role;
  const whatOf = (a) => ((m.areas || []).find((x) => x.name === a) || {}).what || roleOf(a) || "";
  const gp = (a) => (g.parts || []).find((x) => x.area === a) || {};
  const clean = (t) => String(t || "").replace(/[*`]/g, "").trim();
  const day = (t) => T.fmt(t);
  const moments = (cs) => cs.flatMap((c) => (c.signals || []).map((x) => ({ ...x, c }))).filter((x) => x.ts).sort((a, b) => a.ts - b.ts);
  const sec = (t) => `<div class="mc-dt-sec">${esc(t)}</div>`;
  const para = (t) => (clean(t) ? `<p>${esc(clean(t))}</p>` : "");
  // A vertical timeline; past `limit` the rest wait behind "Show N more". `when` is trusted HTML.
  const tl = (items, limit = 4) => {
    const li = (x) => `<li class="${x.cls || ""}"><span class="mc-tlv-when">${x.when}</span>${x.text ? `<span>${esc(clean(x.text))}</span>` : ""}${x.idea ? `<span class="mc-tlv-idea">${esc(x.idea)}</span>` : ""}</li>`;
    if (items.length <= limit) return `<ol class="mc-tlv">${items.map(li).join("")}</ol>`;
    return `<ol class="mc-tlv">${items.slice(0, limit).map(li).join("")}</ol><button type="button" class="link mc-more" data-mc-more>Show ${items.length - limit} more</button><ol class="mc-tlv" hidden>${items.slice(limit).map(li).join("")}</ol>`;
  };
  const moment = (x, withIdea = true) => ({ when: `<b>${KIND_SAY[x.kind] || "Came up"}</b> · ${day(x.ts)}`, text: x.evidence, idea: withIdea ? x.c.name : "" });
  const head = (name, meta) => `<p class="mc-dt-title"><b>${esc(name)}</b></p>${meta ? `<p class="mc-dt-meta">${esc(meta)}</p>` : ""}`;
  const study = (a) => { const x = gp(a); return x.story || [x.learned, x.missing].filter(Boolean).join(" "); };
  // Ideas a project shaped: the ones whose name, take or moments mention it.
  const keyOf = (name) => (String(name).match(/[A-Za-z][A-Za-z0-9]{3,}/) || [""])[0].toLowerCase();
  const mentions = (c, k) => k && [c.name, c.current_take, ...(c.signals || []).map((x) => x.evidence)].some((t) => String(t || "").toLowerCase().includes(k));
  return {
    // One idea: what it is, how it shows up in your work, and how you learned it.
    idea: (c) => { const ms = moments([c]); return `<div class="mc-dt">${head(c.name, `${LEVEL[c.level]}${subs[c.id] ? ` · ${subs[c.id]}` : ""}`)}
      ${para(c.definition)}${clean(c.current_take) ? sec("In your work") + para(c.current_take) : ""}
      ${ms.length ? sec(`How you learned it · ${C.plural(ms.length, "moment")}`) + tl(ms.map((x) => moment(x, false)), 3) : ""}</div>`; },
    // A part on the scale: what it is, where you are, what you did, how you got to each level, what's next.
    stand: (p, line) => {
      const ms = moments(p.cs);
      // Levels reached in the same moment share one entry ("Read → Explored").
      const byT = []; p.reached.forEach(([k, t]) => { const last = byT[byT.length - 1]; if (last && last[1] === t) last[0].push(k); else byT.push([[k], t]); });
      const steps = byT.map(([ks, t]) => { const k = ks.map((x) => L[x]).join(" → "); const x = ms.filter((s) => s.ts === t).sort((a, b) => (KIND_LEVEL[b.kind] ?? 0) - (KIND_LEVEL[a.kind] ?? 0))[0]; return { cls: "lv", when: `<b>${k}</b> · ${day(t)}`, text: x ? x.evidence : "", idea: x ? x.c.name : "" }; });
      return `<div class="mc-dt">${head(p.name)}${para(whatOf(p.area))}
        ${sec("Where you are")}<p>${esc(line)}</p>
        ${study(p.area) ? sec("What you've done and learned") + para(study(p.area)) : ""}
        ${steps.length ? sec("How you got here") + tl(steps, 5) : ""}
        ${p.next ? sec("Your next step") + `<p><b>${esc(clean(p.next.step))}</b>${p.next.how ? `. ${esc(clean(p.next.how))}` : ""}</p>` : ""}</div>`;
    },
    // A part in the grid: what it is, what you know and haven't explored yet there.
    know: (p, line) => { const x = gp(p.area); return `<div class="mc-dt">${head(p.name)}${para(whatOf(p.area))}
      ${sec("What you know here")}<p>${esc(line)}</p>${para(x.learned)}
      ${x.missing ? sec("Not explored yet") + para(x.missing) : ""}
      <p class="mc-dt-meta">Tap a group name or a square below to open it.</p></div>`; },
    // A group of ideas inside a part: its summary and its ideas.
    group: (p, name, l) => { const sum = (comps[`${p.area}||${name}`] || {}).summary; return `<div class="mc-dt">${head(name, `${C.plural(l.length, "idea")} in ${p.name}`)}${para(sum)}
      ${sec("Its ideas")}${tl([...l].sort((a, b) => T.rank(b) - T.rank(a)).map((c) => ({ when: `<b>${esc(c.name)}</b> · ${LEVEL[c.level]}`, text: firstSentence(c.current_take || c.definition) })), 5)}</div>`; },
    // A part's comebacks: how often, which ideas are worth a look, and the latest moments.
    revisit: (p, line, ideas, ago) => { const ms = moments(p.cs).reverse(); return `<div class="mc-dt">${head(p.name)}<p>${esc(line)}</p>
      ${ideas.length ? sec("Worth a quick look") + tl(ideas.map((c) => { const last = moments([c]).pop(); return { when: `<b>${esc(c.name)}</b> · ${LEVEL[c.level]} · last came up ${ago(c).toLowerCase()}`, text: firstSentence(c.definition), idea: last ? `Last time: ${clean(last.evidence)}` : "" }; }), 3) : ""}
      ${ms.length ? sec("Your latest moments here") + tl(ms.map((x) => moment(x)), 3) : ""}</div>`; },
    // A project: what it is, what you did in each part, the ideas it taught you, and its moments.
    project: (x, label) => {
      const k = keyOf(x.name), cs = d.concepts.filter((c) => mentions(c, k)), ms = moments(cs).filter((s) => String(s.evidence || "").toLowerCase().includes(k)).reverse();
      return `<div class="mc-dt">${head(x.name)}${para(x.what)}
        ${sec("What you did")}${x.uses.map((u) => `<p><b>${esc(label(u.area))}, ${u.how === "built" ? "built" : "explored"}</b>: ${esc(clean(u.note))}</p>`).join("")}
        ${cs.length ? sec("Ideas it taught you") + tl([...cs].sort((a, b) => T.rank(b) - T.rank(a)).map((c) => ({ when: `<b>${esc(c.name)}</b> · ${LEVEL[c.level]}`, text: firstSentence(c.current_take || c.definition) })), 4) : ""}
        ${ms.length ? sec("Moments from this project") + tl(ms.map((s) => moment(s)), 3) : ""}</div>`;
    },
  };
}

// Your skills in the topic: where you stand in each part, what you know, when you last came back
// to each part, and where you've used it (docs/chart-designs/).
function topicSkills(d, m, g) {
  if (!(m.areas || []).length) return "";
  const C = MagicCharts, L = C.LEVELS5, T = topicData(d, m, g), role = T.role, roleL = role ? role.toLowerCase() : "";
  const D = skillDetails(d, m, g, T);
  const usual = role ? `What a ${roleL} usually has` : "The usual level";
  const a1 = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
  const withRole = (x) => role ? `${a1(roleL)} ${roleL} is usually at ${L[x]}` : `the usual level is ${L[x]}`;

  // 1. Where you stand in each part (dot-on-scale).
  const ps = T.parts.filter((p) => p.cs.length);
  const moved = ps.filter((p) => p.now > p.then), atTarget = ps.filter((p) => p.target >= 0 && p.now >= p.target);
  const gapP = [...ps].filter((p) => p.target > p.now).sort((x, y) => (y.target - y.now) - (x.target - x.now) || (x.now - x.then) - (y.now - y.then))[0];
  const since = T.thenLabel.startsWith("your first") ? "Since your first week" : "In 12 weeks";
  const byUp = {}; moved.forEach((p) => (byUp[p.now - p.then] ||= []).push(p.name));
  const upText = Object.entries(byUp).sort((x, y) => y[0] - x[0]).map(([n, ns]) => `${n === "1" ? "one level" : `${["", "one", "two", "three", "four"][n]} levels`} in ${C.joinAnd(ns)}`);
  const stand = [
    moved.length ? `${since} you moved up ${C.joinAnd(upText)}` : `${since} your levels have held steady`,
    atTarget.length ? `, and ${atTarget.length === ps.length && ps.length > 2 ? "every part" : C.joinAnd(atTarget.map((p) => p.name))} ${atTarget.length === 1 || (atTarget.length === ps.length && ps.length > 2) ? "is" : "are"} already where ${role ? `${a1(roleL)} ${roleL}` : "the role one stage up"} usually is.` : ".",
    gapP ? ` <b>${esc(gapP.name)} is the biggest gap</b>: ${gapP.now > gapP.then ? "it's moving" : "it hasn't moved yet"}, and it's ${["", "one", "two", "three", "four"][gapP.target - gapP.now]} level${gapP.target - gapP.now === 1 ? "" : "s"} to go.` : "",
  ].join("");
  const standCard = C.dotOnScale(ps.map((p) => {
    const nowL = Math.max(0, p.now), thenL = p.then < 0 ? nowL : p.then;
    const where = nowL > thenL ? `${p.name}: from ${L[thenL]} to ${L[nowL]} since ${T.thenLabel.replace(/ \(.*/, "")}` : `${p.name}: still at ${L[nowL]} since you first came across it on ${T.fmt(Math.min(...p.cs.map((c) => c.first_seen || T.now)))}`;
    const next = p.next ? ` Your next step: ${p.next.how || p.next.step}` : "";
    return { name: p.name, hue: p.hue, then: thenL, now: nowL, target: p.target,
      label: `${p.name}: ${L[thenL]} at ${T.thenLabel}, ${L[nowL]} now.${p.target >= 0 ? ` ${withRole(p.target).replace(/^./, (c) => c.toUpperCase())}.` : ""}`,
      note: `${where}${p.target >= 0 ? `; ${withRole(p.target)}` : ""}.${next}`,
      html: D.stand(p, `${where.replace(/^[^:]+: /, "").replace(/^./, (c) => c.toUpperCase())}${p.target >= 0 ? `; ${withRole(p.target)}` : ""}.`) };
  }), { title: "Where you stand in each part", subtitle: `Where you were in ${T.thenLabel}, where you are now, and ${usual.charAt(0).toLowerCase() + usual.slice(1)}`, takeaway: stand,
    thenLabel: T.thenLabel.replace(/^./, (c) => c.toUpperCase()).replace(/ \(.*/, ""), targetLabel: usual, info: SKILL_HOW,
    empty: { text: "Your level in each part will appear here.", how: "Record a few things on this topic and they'll be placed on the five levels." } });

  // 2. What you know (square-grid): one square per idea, coloured by its level.
  const all = d.concepts.length, und = d.concepts.filter((c) => T.rank(c) >= 2).length;
  const readOnce = T.parts.map((p) => [p.name, p.cs.filter((c) => T.rank(c) === 0).length]).filter((x) => x[1]).sort((x, y) => y[1] - x[1]);
  const readTop = readOnce.length ? readOnce.filter((x) => x[1] >= readOnce[0][1] * 0.6).slice(0, 2).map((x) => x[0]) : [];
  const item = (c, p) => ({ name: c.name, level: T.rank(c), detail: `${c.name} · ${LEVEL[c.level]}${(g.subs || {})[c.id] ? ` · ${(g.subs || {})[c.id]}` : ""}`, html: D.idea(c) });
  const say = ["read once", "explored", "understood", "applied", "fluent"];
  const split = (cs) => { const bits = say.map((w, i) => { const n = cs.filter((c) => T.rank(c) === i).length; return n ? `${n} ${w}` : null; }).filter(Boolean); return `${C.plural(cs.length, "idea")}: ${C.joinAnd(bits)}.`; };
  const knowCard = C.squareGrid(T.parts.map((p) => ({ name: p.name, hue: p.hue, items: p.cs.map((c) => item(c, p)), html: p.cs.length ? D.know(p, split(p.cs)) : "",
    groups: p.groups.map(([n, l]) => ({ name: n, items: l.map((c) => item(c, p)), html: D.group(p, n, l) })) })), {
    title: "What you know", subtitle: "Each square is one idea you've recorded, coloured by how well you know it",
    takeaway: `You've recorded ${C.plural(all, "idea")}, and <b>${und} of them you understand or better</b>.${readTop.length ? ` Most of the ideas you've only read once are in ${C.joinAnd(readTop)}.` : ""}`,
    info: LEVELS.map((l) => `${LEVEL[l]}: ${LEVEL_SAY[l]}.`).join("\n"),
    empty: { text: "The ideas you record here will appear as squares.", how: "Read, search or ask about this topic and each idea gets a square." } });

  // 3. When you last came back to each part (timeline-rows), stalest first.
  const agoW = (w) => (w <= 0 ? "This week" : w === 1 ? "Last week" : w >= 12 ? "Over 12 weeks ago" : `${w} weeks ago`);
  const agoOf = (t) => Math.floor((T.now - t) / T.WEEK);
  const rows = T.parts.filter((p) => p.cs.length).map((p) => {
    const last = Math.max(...p.cs.map(p.lastSeen)), w = agoOf(last), visited = p.weeks.filter(Boolean).length;
    const ideas = [...p.cs].filter((c) => T.rank(c) >= 2).sort((x, y) => p.lastSeen(x) - p.lastSeen(y)).slice(0, 3);
    const list = (ideas.length ? ideas : [...p.cs].sort((x, y) => p.lastSeen(y) - p.lastSeen(x)).slice(0, 3)).map((c) => `${c.name} (${agoW(agoOf(p.lastSeen(c))).toLowerCase()})`);
    const stale = w > 4;
    return { name: p.name, hue: p.hue, weeks: p.weeks, ago: agoW(w), stale, w, label: `${p.name}: ${visited} week${visited === 1 ? "" : "s"} with time on it, last ${agoW(w).toLowerCase()}`,
      note: `${p.name}: you came back to it in ${visited} of the last 12 weeks, most recently ${agoW(w).toLowerCase()}. ${ideas.length ? "The ideas you understand there that came up longest ago" : "Its latest ideas"}: ${C.joinAnd(list)}.`,
      html: D.revisit(p, `You came back to ${p.name} in ${visited} of the last 12 weeks, most recently ${agoW(w).toLowerCase()}.${ideas.length ? " These are the ideas you understand there that came up longest ago, so they're the first to revisit." : ""}`, ideas, (c) => agoW(agoOf(p.lastSeen(c)))),
      action: stale ? { id: p.area, label: "Revisit" } : null };
  }).sort((x, y) => y.w - x.w);
  const months = Array.from({ length: 12 }, (_, w) => { if (w === 11) return "Now"; const t = T.now - (12 - w) * T.WEEK, dt = new Date(t), prev = new Date(t - T.WEEK); return w === 0 || dt.getMonth() !== prev.getMonth() ? dt.toLocaleDateString(undefined, { month: "short" }) : ""; });
  const often = [...rows].sort((x, y) => y.weeks.filter(Boolean).length - x.weeks.filter(Boolean).length).filter((r, i, l) => i < 2 && r.weeks.filter(Boolean).length > 1 && r.weeks.filter(Boolean).length >= l[0].weeks.filter(Boolean).length - 1);
  const staleR = rows.filter((r) => r.stale);
  const revTake = `${often.length ? `You keep coming back to ${C.joinAnd(often.map((r) => r.name))}.` : "You've only just started here."} ${staleR.length ? `<b>${C.joinAnd(staleR.slice(0, 2).map((r) => r.name))} ${staleR.length === 1 ? "hasn't" : "haven't"} come up in over a month</b>, so ${staleR.length === 1 ? "it's the one" : "they're the ones"} worth a quick look.` : `${(() => { const w = Math.max(...rows.map((r) => r.w)); return w <= 0 ? "Every part came up this week" : `Every part has come up in the last ${w + 1} weeks`; })()}, so nothing is going stale yet.`}`;
  const revisitCard = C.timelineRows(rows, { title: "When you last came back to each part", subtitle: "Each dot is a week you spent time on that part, over the last 12 weeks. Bigger dots mean more time.",
    takeaway: revTake, months, info: "Ideas stay sharp when you come back to them every few weeks. A dot's size is how many moments you recorded on that part that week.",
    empty: { text: "Each part's weeks will appear here.", how: "Once you've recorded a few things on this topic, you'll see when you last came back to each part." } });

  // 4. Where you've used it (matrix): your projects against the parts.
  const cols = T.parts.map((p) => ({ name: p.name, hue: p.hue }));
  const unbuilt = T.parts.filter((p) => !T.projects.some((x) => x.uses.some((u) => u.area === p.area && u.how === "built"))).map((p) => p.name);
  const top = [...T.projects].sort((x, y) => y.uses.length - x.uses.length)[0];
  const usedCard = C.matrix({ columns: cols, rows: T.projects.map((x) => {
    const built = x.uses.filter((u) => u.how === "built"), expl = x.uses.filter((u) => u.how === "explored"), nm = (u) => T.label(u.area);
    const did = [built.length ? `built ${C.joinAnd(built.map(nm))}` : "", expl.length ? `explored ${C.joinAnd(expl.map(nm))}` : ""].filter(Boolean).join(" and ");
    return { name: x.name, what: x.what, cells: T.parts.map((p) => (x.uses.find((u) => u.area === p.area) || {}).how || ""),
      note: `${x.name}: ${String(x.what || "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}. You ${did}. ${x.uses.map((u) => `${nm(u)}: ${String(u.note || "").replace(/\.$/, "")}.`).join(" ")}`,
      html: D.project(x, T.label) };
  }) }, { title: "Where you've used it", subtitle: "Your projects, and the parts each one involved",
    takeaway: T.projects.length ? `${esc(top.name)} covers ${top.uses.length} of the ${T.parts.length} parts.${unbuilt.length ? ` The next ${unbuilt.length === 1 ? "place" : "places"} to build ${unbuilt.length === 1 ? "is" : "are"} <b>${esc(C.joinAnd(unbuilt))}</b>.` : " You've built something in every part."}` : "",
    empty: { text: "Your projects will appear here, with the parts of the topic each one used.", how: "Mention a project you're working on in a note or a chat, and your mentor will place it here." } });

  return `<section class="mc-skills"><h3 class="v-h">Your skills in ${esc(d.domain.name)}</h3>
    <div class="v-sub">How far you've taken each part, and how ${role ? `a ${esc(roleL)}` : "an expert"} would see it <span class="v-info" data-tip="${esc(LEVELS.map((l) => `${LEVEL[l]}: ${LEVEL_SAY[l]}.`).join("\n"))}">ⓘ</span></div>
    <div class="mc-stack">${standCard}${knowCard}${revisitCard}${usedCard}</div></section>`;
}

// ---------- Sample: the proposed Analytics layout (#/k/<topic>/preview), not live yet ----------
// One summary (stage and mentors on one line of progress), the next step, then one skills chart
// that shows both how much you know and how deep it goes, and two small charts beside it.
function pvCharts(d, m, g) {
  const areas = m.areas || [], map = g.map || {}, subs = g.subs || {}, sk = g.skills || {};
  const flow = m.flow || {}, byPart = Object.fromEntries([...(flow.steps || []), ...(flow.across || [])].map((x) => [x.part, x]));
  const order = [...(flow.steps || []), ...(flow.across || [])].map((x) => x.part).filter((a) => areas.some((ar) => ar.name === a));
  areas.forEach((ar) => order.includes(ar.name) || order.push(ar.name));
  const label = (a) => (byPart[a] || {}).short || a.replace(/\s*\(.*\)\s*$/, "");
  const of = (a) => d.concepts.filter((c) => map[c.id] === a);
  const rank = (c) => Math.max(0, LEVELS.indexOf(c.level));
  const depth = (cs) => { if (!cs.length) return -1; const r = cs.map(rank).sort((x, y) => y - x); return r[Math.floor((r.length - 1) * 0.25)]; };
  const bench = (a) => { const b = (sk.benchmark || []).find((x) => x.area === a); return b ? LEVELS.indexOf(b.level) : -1; };
  const role = sk.role || "the next stage";
  // 2. One skills chart: rows are the parts, columns the five levels, one square per idea.
  // Lime ring = your level in that part; dashed = where the role one stage up would be.
  const sq = (c) => `<i class="pv-sq lv${rank(c)}" data-tip="${esc(`${c.name} · ${LEVEL[c.level]}${subs[c.id] ? ` · ${subs[c.id]}` : ""}`)}"></i>`;
  const row = (name, cs, cls, a, expandable) => {
    const dp = a ? depth(cs) : -1, bm = a ? bench(a) : -1;
    return `<${expandable ? `button data-pvrow="${esc(a)}" aria-expanded="${S.pvOpen === a}"` : "div"} class="pv-row ${cls}">
      <span class="pv-name">${cls.includes("sub") ? "" : `<i></i>`}${esc(name)}<em>${cs.length}</em>${expandable ? `<span class="v-caret">▾</span>` : ""}</span>
      ${LEVELS.map((l, k) => `<span class="pv-cell ${k === dp ? "you" : ""} ${k === bm ? "bench" : ""}">${cs.filter((c) => c.level === l).map(sq).join("")}</span>`).join("")}
    </${expandable ? "button" : "div"}>`;
  };
  const rows = order.map((a, i) => {
    const cs = of(a), gs = {};
    cs.forEach((c) => (gs[subs[c.id] || a] ||= []).push(c));
    return `<div class="pv-part c${i % 8} ${S.pvOpen === a ? "open" : S.pvOpen ? "dim" : ""}">${row(label(a), cs, "", a, true)}
      ${S.pvOpen === a ? Object.entries(gs).sort((x, y) => y[1].length - x[1].length).map(([n, l]) => row(n, l, "sub", null, false)).join("") : ""}</div>`;
  }).join("");
  const strong = order.map((a) => depth(of(a))), top = strong.indexOf(Math.max(...strong));
  const gapI = order.map((a, i) => (bench(a) >= 0 ? bench(a) - Math.max(0, strong[i]) : -9)), gi = gapI.indexOf(Math.max(...gapI));
  const skills = `<section class="v-panel sk-card pv-skills">
    <div class="v-mind-head"><div><h3>Your skills in ${esc(d.domain.name)}</h3><div class="v-sub">Every idea you've met, by part and by how far you've taken it, against a ${esc(role.toLowerCase())}</div></div><span class="v-info" data-tip="${esc(LEVELS.map((l) => `${LEVEL[l]}: ${LEVEL_SAY[l]}.`).join("\n") + "\n\n" + SKILL_HOW)}">ⓘ</span></div>
    <div class="v-mind-lead">Deepest in <b>${esc(label(order[top]))}</b>${gapI[gi] > 0 ? `; the biggest gap to a ${esc(role.toLowerCase())} is <b>${esc(label(order[gi]))}</b>` : ""}.</div>
    <div class="pv-grid">
      <div class="pv-row pv-head"><span></span>${LEVELS.map((l) => `<span>${LEVEL[l]}</span>`).join("")}</div>
      ${rows}
    </div>
    <div class="sk-legend"><span><i class="pv-k you"></i>Your level</span><span><i class="pv-k bench"></i>${esc(role)}</span><span><i class="pv-sq lv2"></i>One idea</span></div>
    <p class="sk-note" aria-live="polite">Tap a part to see its skills, or a square to see the idea.</p>
  </section>`;

  // 3a. Worth revisiting: ideas you understand, stacked by how long since they came up.
  const DAY = 86400000, now = Date.now(), last = (c) => Math.max(0, ...(c.signals || []).map((x) => x.ts || 0));
  const known = d.concepts.filter((c) => rank(c) >= 2 && last(c));
  const bins = [["This week", 0, 7], ["1 week", 7, 14], ["2 weeks", 14, 21], ["3 weeks", 21, 28], ["A month+", 28, 1e9]];
  const age = (c) => (now - last(c)) / DAY;
  const maxBin = Math.max(1, ...bins.map(([, lo, hi]) => known.filter((c) => age(c) >= lo && age(c) < hi).length));
  const older = known.filter((c) => age(c) >= 7).sort((x, y) => last(x) - last(y));
  const revisit = `<section class="v-panel sk-card">
    <div class="v-mind-head"><div><h3>Worth revisiting</h3><div class="v-sub">Ideas you understand, by when they last came up</div></div></div>
    <div class="v-mind-lead">${older.length ? `${older.length} of ${known.length} haven't come up for a week or more. Start with <b>${esc(older[0].name)}</b>.` : "Everything you understand came up this week."}</div>
    <div class="pv-bins">${bins.map(([n, lo, hi], i) => { const l = known.filter((c) => age(c) >= lo && age(c) < hi); return `<div class="pv-bin ${i ? "old" : ""}"><div class="pv-stack" style="--h:${maxBin}">${l.map((c) => `<i class="pv-sq lv${rank(c)}" data-tip="${esc(`${c.name} · last came up ${Math.round(age(c))} days ago`)}"></i>`).join("")}</div><b>${l.length}</b><span>${n}</span></div>`; }).join("")}</div>
    <p class="sk-note" aria-live="polite">Tap a square to see the idea.</p>
  </section>`;

  // 3b. Where you've used it: each part, and the projects that built or explored it.
  const projects = sk.projects || [];
  const used = `<section class="v-panel sk-card">
    <div class="v-mind-head"><div><h3>Where you've used it</h3><div class="v-sub">Each part, and the projects of yours that touched it</div></div></div>
    <div class="pv-used">${order.map((a, i) => {
      const built = projects.filter((p) => (p.uses || []).some((u) => u.area === a && u.how === "built"));
      const expl = projects.filter((p) => (p.uses || []).some((u) => u.area === a && u.how === "explored"));
      const note = (p) => ((p.uses || []).find((u) => u.area === a) || {}).note || "";
      return `<div class="pv-urow c${i % 8}"><span class="pv-uname"><i></i>${esc(label(a))}</span><span class="pv-chips">${built.map((p) => `<span class="pv-chip built" data-tip="${esc(`Built in ${p.name}: ${note(p)}`)}">${esc(p.name)}</span>`).join("")}${expl.map((p) => `<span class="pv-chip expl" data-tip="${esc(`Explored in ${p.name}: ${note(p)}`)}">${esc(p.name)}</span>`).join("")}${built.length || expl.length ? "" : `<span class="faint">Not in a project yet</span>`}</span></div>`;
    }).join("")}</div>
    <div class="sk-legend"><span><i class="pv-chip built pv-k2"></i>You built it</span><span><i class="pv-chip expl pv-k2"></i>You explored it</span></div>
    <p class="sk-note" aria-live="polite">Tap a project to see what you did there.</p>
  </section>`;

  return { skills, revisit, used, label, order };
}

// ---------- Sample: a calm topic page (#/k/<topic>/preview), not live ----------
// Above the fold: one statement of where you stand, and the one thing to do next. Below: what you
// know as one picture, two plain insights, and your mentors. Everything else lives in Learnings.
function previewPage(d, G) {
  const g = G.guide, m = G.mentor || {};
  if (!g) return topicHead(d) + topicGuide(d, G);
  const tab = S.topicTab === "study" ? "study" : "analytics";
  const st = g.stage || {}, si = Math.max(0, STAGES.findIndex((x) => x[0] === st.key)), next = STAGES[si + 1];
  const req = next && stageNeeds(next[0], st), leaders = m.leaders || [], nowL = leaders.filter((l) => l.stage === st.key);
  const head = `<header class="q-head">
    <div class="crumb">${esc((d.path || "").split(" > ").slice(0, -1).join(" / ") || "Knowledge")}</div>
    <h1>${esc(d.domain.name)}</h1>
    <nav class="q-tabs" role="tablist">${[["analytics", "Overview"], ["study", "Learnings"]].map(([k, l]) => `<button role="tab" data-ttab="${k}" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</nav>
  </header>`;
  const banner = `<div class="q-banner">Sample layout, for comparison · <a href="#/k/${d.domain.id}">Back to the live page</a></div>`;

  if (tab === "study") {
    return `${banner}${head}
      <section class="q-sec"><h2 class="q-h">Your map</h2>${topicParts(d, m, g)}</section>
      ${(g.questions || []).length ? `<section class="q-sec"><h2 class="q-h">Your questions, answered</h2>
        <div class="t-faq">${g.questions.map((q) => `<div class="t-faq-row v-exp" tabindex="0"><div class="t-faq-q"><b>${esc(q.q)}</b><span class="v-caret">▾</span></div><div class="v-more"><div class="t-a">${esc(q.answer)}</div><div>${esc(q.more)}</div></div></div>`).join("")}</div></section>` : ""}
      ${(g.work || []).length ? `<section class="q-sec"><h2 class="q-h">Your work, with your mentors' view</h2>
        <div class="t-wlist">${g.work.map((w) => `<div class="t-wl v-exp" tabindex="0"><span class="t-wl-title">${esc(w.title)}</span><span class="t-wl-v ${w.verdict || ""}">${WORK_VERDICT[w.verdict] || ""}</span><div class="v-more">${esc(w.detail)} ${esc(w.take)}</div></div>`).join("")}</div></section>` : ""}`;
  }

  // 1. Where you stand: one sentence, one line of progress, your mentors' word.
  const needs = req ? req.needs.filter(([, v, t]) => (v || 0) < t).map(([label, v]) => `${label.charAt(0).toLowerCase()}${label.slice(1)} (you're at ${v || 0}%)`) : [];
  const stand = `<section class="q-stand">
    <p class="q-headline">${esc(g.headline)}</p>
    <div class="q-track" role="img" aria-label="Stage ${si + 1} of 5: ${esc(stageName(st.key))}">${STAGES.map((_, i) => `<i class="${i < si ? "past" : i === si ? "now" : ""}"></i>`).join("")}</div>
    <p class="q-stage"><b>${esc(stageName(st.key))}</b>${next ? ` · next is ${next[1]}${needs.length ? `: ${needs.join(" and ")}` : ""}` : ""}</p>
    ${g.note ? `<p class="q-note">“${esc(g.note)}” <span>— ${esc(nowL.map((l) => l.name).join(" & ") || "your mentors")}</span></p>` : ""}
  </section>`;

  // 2. The one thing to do next; the other two steps wait underneath.
  const path = g.path || [], p0 = path[0], open = S.qStep;
  const step = p0 ? `<section class="q-step">
    <div class="q-step-top"><span class="q-kicker">Your next step</span>${p0.time ? `<span class="q-time">${esc(p0.time)}</span>` : ""}</div>
    <h2>${esc(p0.step)}</h2>
    <p>${esc(p0.why)}</p>
    ${open ? `<ol class="q-acts">${(p0.actions || []).map((a) => `<li>${esc(String(a).replace(/[*`]/g, ""))}</li>`).join("")}</ol>${p0.done ? `<p class="q-done"><b>You're done when</b> ${esc(p0.done)}</p>` : ""}` : ""}
    <button class="q-btn" data-qstep>${open ? "Hide the steps" : "Show me how"}</button>
    ${path.length > 1 ? `<div class="q-then"><span>After that</span>${path.slice(1).map((x) => `<b>${esc(x.step)}</b>`).join("<em>then</em>")}</div>` : ""}
  </section>` : "";

  // 3. What you know, as one picture, and two plain insights beside nothing else.
  const c = pvCharts(d, m, g);

  // 4. Your mentors: the stages in one line with who guides each, and what they hold you to.
  const heads = (m.rules || []).map((r) => String(r).split(/:\s|;\s| — /)[0].replace(/[.]$/, "")).filter(Boolean);
  const mentors = leaders.length ? `<section class="q-sec"><h2 class="q-h">Your mentors</h2>
    <div class="v-panel q-mentors">
      <p class="t-prose">${m.role ? `A <b>${esc(m.role)}</b> guides you here. ` : ""}${heads.length ? `They hold you to ${heads.length} standards: ${heads.map((h) => esc(h.charAt(0).toLowerCase() + h.slice(1))).join(", ").replace(/, (?=[^,]*$)/, ", and ")}.` : ""}</p>
      <div class="pv-ladder">${STAGES.map(([k, name], i) => `<div class="pv-stage ${i < si ? "past" : i === si ? "now" : ""}"><i></i><b>${name}</b>${i === si ? `<span class="pv-here">You are here</span>` : ""}
        <div class="pv-ppl">${leaders.filter((l) => l.stage === k).map((l) => `<a ${l.url ? `href="${esc(l.url)}" target="_blank"` : ""} title="${esc(l.known_for || l.description || "")}">${esc(l.name)}</a>`).join("") || `<span class="faint">—</span>`}</div></div>`).join("")}</div>
    </div></section>` : "";

  return `${banner}${head}${stand}${step}
    <section class="q-sec"><h2 class="q-h">What you know</h2>${c.skills}</section>
    <section class="q-sec"><h2 class="q-h">Keep it sharp</h2>${c.revisit}</section>
    <section class="q-sec"><h2 class="q-h">Put it to work</h2>${c.used}</section>
    ${mentors}`;
}

// The way forward, as a mentor would lay it out: three small steps, the first open, each with why
// it matters, how long it takes, the actions in order, and what "done" looks like.
// Your path forward: the mentor's steps, drawn by the steps chart (docs/chart-designs/path-forward.html).
function topicPath(g) {
  const path = g.path || (g.next || []).map((x) => ({ step: x.step, why: x.why, actions: x.how ? [x.how] : [] }));
  return MagicCharts.steps(path.map((x) => ({ title: x.step, time: x.time, why: x.why, actions: x.actions, done: x.done })), {
    title: "Your path forward",
    empty: { text: "Your mentor's steps for this topic will appear here.", how: "They're written once you've recorded a few things on it, such as an article read or a question asked." },
  });
}

// One concept, at a glance: what it is, how it shows up in your work, and how you learned it.
function conceptCard(c) {
  const li = LEVELS.indexOf(c.level);
  const signals = [...(c.signals || [])].sort((a, b) => a.ts - b.ts);
  return `<div class="t-concept">
    <div class="t-concept-head"><b>${esc(c.name)}</b>
      <span class="t-lvl lv${li}" data-tip="${esc(levelTip(c.level))}">${LEVEL[c.level]}</span>
      <button class="more" data-more='{"type":"concept","id":"${c.id}"}'>⋯</button></div>
    <div>
        <div class="p-label">What it is</div><div>${esc(c.definition || "—")}</div>
        ${c.current_take ? `<div class="p-label" style="margin-top:12px">In your work</div><div>${esc(c.current_take)}</div>` : ""}
    </div>
    ${signals.length ? `<details class="t-how"><summary>How you learned it · ${signals.length} moment${signals.length === 1 ? "" : "s"}, ${fmtDate(signals[0].ts)}${signals.length > 1 ? ` to ${fmtDate(signals[signals.length - 1].ts)}` : ""}</summary>
      <ol class="t-timeline">${signals.map((s) => `<li><span>${fmtDate(s.ts)}</span>${esc(s.evidence || s.kind)}</li>`).join("")}</ol></details>` : ""}
  </div>`;
}

// Esc closes the part panel.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.partOpen && !document.body.classList.contains("asking")) { S.partOpen = null; const y = main.scrollTop; renderDoc(); main.scrollTop = y; } });

function bindTopic() {
  const rec = main.querySelector(".t-record");
  if (rec) rec.ontoggle = () => (S.recordOpen = rec.open);
  const mt = $("#mentor");
  if (mt) mt.onclick = () => { S.topicTab = "analytics"; renderDoc(); document.getElementById("mentors")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  main.querySelectorAll("[data-ttab]").forEach((b) => (b.onclick = () => { S.topicTab = b.dataset.ttab; store.set("topicTab", S.topicTab); renderDoc(); main.scrollTop = 0; }));
  const rb = document.getElementById("reach");
  if (rb) rb.onclick = () => { S.reachOpen = !S.reachOpen; const y = main.scrollTop; renderDoc(); main.scrollTop = y; };
  const rg = $("#reguide");
  if (rg) rg.onclick = async () => { await api(`/api/guide/${S.doc}`, { method: "POST" }); S.guide.building = true; renderDoc(); pollGuide(S.doc); };
  main.querySelectorAll(".t-cats [data-chip], .fl-clist [data-chip]").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.chip;
    if (S.open.has(id)) S.open.clear(); else { S.open.clear(); S.open.add(id); }
    setContext(S.doc, { type: "concept", id }, S.data.concepts.find((c) => c.id === id).name);
    const top = main.scrollTop;
    renderDoc();
    main.scrollTop = top;
    renderRight({ kind: "doc" });
  }));
  main.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = b.onkeydown = (e) => {
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    S.openSub = S.openSub === b.dataset.sub ? null : b.dataset.sub;
    const y = main.scrollTop; renderDoc(); main.scrollTop = y;
  }));
  main.querySelectorAll(".page.topic .v-exp").forEach((el) => (el.onclick = (e) => { if (!e.target.closest("a, button")) el.classList.toggle("open"); }));
  const g = (S.guide || {}).guide || {};
  main.querySelectorAll("[data-prow]").forEach((b) => (b.onclick = () => { S.partOpen = S.partOpen === b.dataset.prow ? null : b.dataset.prow; S.conList = null; S.grpOpen = null; const y = main.scrollTop; renderDoc(); main.scrollTop = y; }));
  main.querySelectorAll("[data-part]").forEach((b) => (b.onclick = () => {
    S.part = { ...(S.part || {}), [S.doc]: b.dataset.part }; S.conList = null;
    renderDoc(); const st = main.querySelector(".t-psteps"); if (st) main.scrollTop += st.getBoundingClientRect().top - 80;
  }));
  main.querySelectorAll("[data-what]").forEach((b) => (b.onclick = () => { S.whatOpen = S.whatOpen === b.dataset.what ? null : b.dataset.what; const y = main.scrollTop; renderDoc(); main.scrollTop = y; }));
  // Tap a mark in a skills chart: its detail shows under the chart (hover isn't there on a phone).
  main.querySelectorAll('.sk-card [role="button"]').forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } }));
  main.querySelectorAll(".sk-card [data-tip]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); const n = el.closest(".sk-card")?.querySelector(".sk-note"); if (n) { n.textContent = el.dataset.tip; n.classList.add("on"); } }));
  main.querySelector("[data-qstep]")?.addEventListener("click", () => { S.qStep = !S.qStep; const y = main.scrollTop; renderDoc(); main.scrollTop = y; });
  main.querySelectorAll("[data-pvrow]").forEach((b) => (b.onclick = () => { S.pvOpen = S.pvOpen === b.dataset.pvrow ? null : b.dataset.pvrow; const y = main.scrollTop; renderDoc(); main.scrollTop = y; }));
  main.querySelectorAll("[data-grp]").forEach((b) => (b.onclick = () => { S.grpOpen = S.grpOpen === b.dataset.grp ? null : b.dataset.grp; S.conList = null; S.open.clear(); const y = main.scrollTop; renderDoc(); main.scrollTop = y; }));
  main.querySelectorAll("[data-conlist]").forEach((b) => (b.onclick = () => { S.conList = S.conList === b.dataset.conlist ? null : b.dataset.conlist; const y = main.scrollTop; renderDoc(); main.scrollTop = y; }));
  main.querySelectorAll(".mc-tl").forEach((c) => c.addEventListener("click", (e) => { const b = e.target.closest("[data-mc-act]"); if (!b) return; document.body.classList.remove("nr"); store.set("nr", false); send(`Give me a two-minute recap of ${b.dataset.mcAct} in ${S.data.domain.name}: what I recorded, and one question to check myself.`); }));
  bindTips(main);
}

function conceptRow(c, refNo, isNew) {
  const open = S.open.has(c.id);
  const srcs = (c.sources || []).map((s) => refNo[s]).filter(Boolean);
  return `<div class="item ${S.target.id === c.id ? "selected" : ""}" data-concept="${c.id}">
    <div><span class="title">${esc(c.name)}</span>${isNew(c.first_seen) ? ` <span class="new">new</span>` : ""}</div>
    <div class="side"><span class="level ${c.level}" title="${esc(LEVEL_RULE[c.level] || "")}">${LEVEL[c.level] || c.level}</span><button class="more" data-more='{"type":"concept","id":"${c.id}"}'>⋯</button></div>
    <div class="sub">${esc(c.current_take || c.definition || "")}</div>
    ${open ? `<div class="detail">
      ${c.definition && c.current_take ? `<div class="k">Definition</div><div>${esc(c.definition)}</div>` : ""}
      <div class="k">Your take ${c.take_by_me ? "· written by you" : "· edit it if it's off"}</div>
      <div class="editable" data-edit-take="${c.id}">${esc(c.current_take || "—")}</div>
      ${c.take_suggestion ? `<div class="faint" style="margin-top:4px">Magic noticed: “${esc(c.take_suggestion)}” <button class="link" data-take="${c.id}" data-act="accept">Use</button> · <button class="link" data-take="${c.id}" data-act="dismiss">Keep mine</button></div>` : ""}
      <div class="k">How you learned it</div>${(c.signals || []).map((s) => `<div>${esc(s.evidence || s.kind)} <span class="faint">· ${fmtDate(s.ts)}</span></div>`).join("")}
      ${srcs.length ? `<div class="faint" style="margin-top:6px">Sources ${srcs.join(", ")}</div>` : ""}
    </div>` : ""}
  </div>`;
}

function itemRow(i, isNew, checkable) {
  const done = checkable && i.status && i.status !== "open";
  return `<div class="item ${done ? "done" : ""} ${S.target.id === i.id ? "selected" : ""}" data-item="${i.id}">
    <div>${checkable ? `<span class="check ${done ? "on" : ""}" data-toggle="${i.id}" data-status="${i.status || "open"}" data-kind="${i.kind}"></span>` : ""}<span class="title" style="font-weight:450">${esc(i.text)}</span>${isNew(i.ts) ? ` <span class="new">new</span>` : ""}</div>
    <div class="side">${i.kind === "gap" ? `<span class="chip warn">gap</span>` : i.kind === "work" ? `<span class="chip gray">did</span>` : ""}<button class="more" data-more='{"type":"item","id":"${i.id}"}'>⋯</button></div>
  </div>`;
}

function renderOverview(d) {
  const roots = (d.domains || []).filter((x) => !x.parent_id).sort((a, b) => b.last_active - a.last_active);
  const kids = (id) => (d.domains || []).filter((x) => x.parent_id === id);
  const t = d.totals || {};
  main.innerHTML = `<div class="page">${recordTabs("all")}
    <h1>Everything recorded</h1>
    <div class="meta">${(d.domains || []).length} areas · ${t.concepts || 0} concepts · ${t.sources || 0} sources · ${t.open_gaps || 0} open gaps
      <button class="link" id="maptoggle">${S.map ? "Show list" : "Show as map"}</button> · <button class="link" id="organize">Reorganize</button></div>
    ${S.map ? `<div class="diagram" id="diagram"></div>` : `
    <h2>Your areas</h2>
    <div class="list">${roots.map((x) => `<a class="item" href="#/k/${x.id}">
        <div><span class="title">${esc(x.name)}</span>${x.last_active > S.since ? ` <span class="new">new</span>` : ""}</div>
        <div class="side">${x.concepts} concepts · ${ago(x.last_active)}</div>
        <div class="sub">${esc(x.description || "")}${kids(x.id).length ? ` <span class="faint">· ${kids(x.id).map((k) => esc(k.name)).join(", ")}</span>` : ""}</div>
      </a>`).join("") || `<div class="empty">Your knowledge base fills in as you read, ask and talk.</div>`}</div>
    ${(d.bridges || []).length ? `<h2>Connections across areas</h2><div class="list">${d.bridges.map((b) => `<div class="item"><div>${esc(b.from)} ↔ ${esc(b.to)}</div><div class="sub">${esc(b.note || "")}</div></div>`).join("")}</div>` : ""}`}
  </div>`;
  const mt = $("#maptoggle");
  if (mt) mt.onclick = () => { S.map = !S.map; renderDoc(); };
  $("#organize").onclick = async (e) => {
    e.target.innerHTML = `<span class="spinner"></span> Organizing…`;
    const r = await api("/api/organize", { method: "POST" });
    toast(`Reorganized: ${r.moved || 0} concepts moved, ${r.removed || 0} empty areas removed.`);
    route();
  };
  if (S.map) drawMap();
}

function bindDoc() {
  const mt = $("#maptoggle");
  if (mt) mt.onclick = (e) => { e.preventDefault(); S.map = !S.map; S.recordOpen = true; renderDoc(); };
  main.querySelectorAll("[data-concept]").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("button, [data-edit-take], a")) return;
    const id = el.dataset.concept;
    S.open.has(id) ? S.open.delete(id) : S.open.add(id);
    setContext(S.doc, { type: "concept", id }, S.data.concepts.find((c) => c.id === id).name);
    renderDoc();
    renderRight({ kind: "doc" });
  }));
  main.querySelectorAll("[data-item]").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("button, [data-toggle]")) return;
    const i = S.data.items.find((x) => x.id === el.dataset.item);
    setContext(S.doc, { type: "item", id: i.id }, `“${i.text.slice(0, 50)}”`);
    renderDoc();
    renderRight({ kind: "doc" });
  }));
  main.querySelectorAll("[data-toggle]").forEach((el) => (el.onclick = async () => {
    const next = el.dataset.status === "open" ? (el.dataset.kind === "question" ? "answered" : "closed") : "open";
    await api(`/api/items/${el.dataset.toggle}`, { method: "POST", body: { status: next } });
    reloadDoc();
  }));
  main.querySelectorAll("[data-add]").forEach((el) => (el.onkeydown = async (e) => {
    if (e.key !== "Enter" || !el.value.trim()) return;
    await api("/api/items", { method: "POST", body: { kind: el.dataset.add, text: el.value.trim(), domain_id: S.doc } });
    reloadDoc();
  }));
  main.querySelectorAll("[data-edit-domain]").forEach((el) => (el.onclick = () => inlineEdit(el, S.data.domain[el.dataset.editDomain] || "", (v) => api(`/api/domains/${S.doc}/edit`, { method: "POST", body: { [el.dataset.editDomain]: v } }), 1)));
  main.querySelectorAll("[data-edit-take]").forEach((el) => (el.onclick = () => {
    const c = S.data.concepts.find((x) => x.id === el.dataset.editTake);
    inlineEdit(el, c.current_take || "", (v) => api(`/api/concepts/${c.id}/edit`, { method: "POST", body: { current_take: v } }), 3);
  }));
  main.querySelectorAll("[data-take]").forEach((el) => (el.onclick = async () => { await api(`/api/concepts/${el.dataset.take}/edit`, { method: "POST", body: { suggestion: el.dataset.act } }); reloadDoc(); }));
  const notes = $("#notes");
  if (notes) notes.onclick = () => inlineEdit(notes, S.data.blocks.notes?.content || "", (v) => api(`/api/docs/${S.doc}/blocks/notes`, { method: "POST", body: { content: v } }), 8);
  bindMore(main);
}

async function reloadDoc() {
  S.data = await api(`/api/docs/${S.doc}`);
  renderDoc();
  renderTree();
}

function inlineEdit(el, value, save, rows) {
  if (el.querySelector("textarea")) return;
  el.innerHTML = `<textarea class="text" rows="${rows}">${esc(value)}</textarea><div class="faint">Enter to save · Esc to cancel${rows > 2 ? " · Shift+Enter for a new line" : ""}</div>`;
  const ta = el.querySelector("textarea");
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.onkeydown = async (e) => {
    if (e.key === "Escape") return reloadDoc();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); await save(ta.value); reloadDoc(); }
  };
  ta.onblur = async () => { if (ta.value !== value) await save(ta.value); reloadDoc(); };
}

async function drawMap() {
  const el = $("#diagram");
  const d = S.data;
  const ids = {};
  const nid = (id) => (ids[id] ||= "n" + Object.keys(ids).length);
  const label = (s) => String(s || "").replace(/["<>]/g, "'").slice(0, 44);
  let src;
  if (S.doc === "overview") {
    const by = {};
    (d.domains || []).forEach((x) => (by[x.parent_id || "root"] ||= []).push(x));
    const walk = (p, depth) => (by[p] || []).map((x) => `${"  ".repeat(depth + 2)}${nid(x.id)}["${label(x.name)}"]\n${walk(x.id, depth + 1)}`).join("");
    src = `mindmap\n  root((You))\n${walk("root", 0)}`;
  } else {
    const inDoc = new Set(d.concepts.map((c) => c.id));
    const lines = ["flowchart TB", `  hub(("${label(d.domain.name)}"))`];
    d.concepts.forEach((c) => lines.push(`  ${nid(c.id)}["${label(c.name)}"]`));
    const hasParent = new Set((d.relations || []).filter((r) => inDoc.has(r.src) && inDoc.has(r.dst)).map((r) => r.dst));
    d.concepts.filter((c) => !hasParent.has(c.id)).forEach((c) => lines.push(`  hub --- ${ids[c.id]}`));
    (d.relations || []).filter((r) => ids[r.src] && ids[r.dst]).forEach((r) => lines.push(`  ${ids[r.src]} -->|${label(r.rel.replace("_", " "))}| ${ids[r.dst]}`));
    Object.values(ids).forEach((n) => lines.push(`  click ${n} magicNode`));
    src = lines.join("\n");
  }
  const back = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  window.magicNode = (n) => (S.doc === "overview" ? (location.hash = `#/k/${back[n]}`) : (S.map = false, S.open.add(back[n]), renderDoc()));
  try {
    const { svg, bindFunctions } = await mermaid.render("m" + Date.now(), src);
    el.innerHTML = svg;
    bindFunctions && bindFunctions(el);
  } catch (_) { el.innerHTML = `<div class="empty">Couldn't draw the map.</div>`; }
}

// ---------- "⋯" menu: edit / not worth keeping ----------
function bindMore(root) {
  root.querySelectorAll("[data-more]").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const target = JSON.parse(b.dataset.more);
    closePops();
    const m = document.createElement("div");
    m.className = "menu";
    const editable = target.type === "item";
    m.innerHTML = `${editable ? `<button data-a="edit">Edit</button>` : ""}${target.type === "concept" ? `<button data-a="move">Move to…</button>` : ""}<button data-a="chat">Talk about this</button><button data-a="drop">Not worth keeping…</button>`;
    place(m, b);
    m.onclick = (ev) => {
      const a = ev.target.dataset.a;
      m.remove();
      if (a === "edit") {
        const host = document.querySelector(`[data-item="${target.id}"] .title`);
        const i = S.data.items.find((x) => x.id === target.id);
        inlineEdit(host, i.text, (v) => api(`/api/items/${i.id}`, { method: "POST", body: { text: v } }), 2);
      }
      if (a === "chat") {
        if (target.type === "episode") return location.assign(`#/activity`);
        const label = target.type === "concept" ? S.data.concepts.find((c) => c.id === target.id)?.name : `“${(S.data.items.find((x) => x.id === target.id)?.text || "").slice(0, 50)}”`;
        setContext(S.doc, target, label);
        renderRight({ kind: "doc" });
        $("#chatbox").focus();
      }
      if (a === "drop") notWorthKeeping(target, b);
      if (a === "move") moveConcept(target.id, b);
    };
  }));
}

async function moveConcept(id, anchor) {
  closePops();
  const domains = await api("/api/domains");
  const byId = Object.fromEntries(domains.map((d) => [d.id, d]));
  const path = (d) => (d.parent_id && byId[d.parent_id] ? `${path(byId[d.parent_id])} > ${d.name}` : d.name);
  const paths = domains.map(path).sort();
  const p = document.createElement("div");
  p.className = "pop";
  p.innerHTML = `<b>Move to</b><input class="text" id="area" list="areas" placeholder="Pick an area or type a new one, e.g. Psychology > Mental Models">
    <datalist id="areas">${paths.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
    <div class="faint">It stays where you put it — the organizer learns from your choice.</div>
    <div class="row"><button class="btn primary" id="go">Move</button><button class="btn" id="cancel">Cancel</button></div>`;
  place(p, anchor);
  $("#area", p).focus();
  $("#cancel", p).onclick = () => p.remove();
  const go = async () => {
    const area = $("#area", p).value.trim();
    if (!area) return;
    await api(`/api/concepts/${id}/edit`, { method: "POST", body: { area } });
    p.remove();
    toast(`Moved to ${area}.`);
    reloadDoc();
  };
  $("#go", p).onclick = go;
  $("#area", p).onkeydown = (e) => e.key === "Enter" && go();
}

function notWorthKeeping(target, anchor) {
  closePops();
  const p = document.createElement("div");
  p.className = "pop";
  p.innerHTML = `<b>Not worth keeping?</b><input class="text" id="why" placeholder="Why? (optional — Magic learns from it)">
    <label class="row small"><input type="checkbox" id="gen" checked> Skip things like this from now on</label>
    <div class="row"><button class="btn primary" id="go">Remove</button><button class="btn" id="cancel">Cancel</button></div>`;
  place(p, anchor);
  $("#why", p).focus();
  $("#cancel", p).onclick = () => p.remove();
  const go = async () => {
    $("#go", p).disabled = true;
    $("#go", p).innerHTML = `<span class="spinner"></span>`;
    const r = await api("/api/learn", { method: "POST", body: { kind: "not_useful", text: $("#why", p).value, target, generalize: $("#gen", p).checked } });
    p.remove();
    toast(r.reply, r.rule && r.rule.id && ((r.matches.episodes || []).length + (r.matches.items || []).length) ? r.rule.id : null);
    S.page === "k" ? reloadDoc() : route();
  };
  $("#go", p).onclick = go;
  $("#why", p).onkeydown = (e) => e.key === "Enter" && go();
}

function place(el, anchor) {
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = `${scrollY + r.bottom + 4}px`;
  el.style.left = `${Math.max(12, Math.min(innerWidth - el.offsetWidth - 12, r.right - el.offsetWidth))}px`;
}
function closePops() { document.querySelectorAll(".menu, .pop").forEach((x) => x.remove()); }
document.addEventListener("click", (e) => { if (!e.target.closest(".menu, .pop, [data-more]")) closePops(); });
main.addEventListener("scroll", closePops, { passive: true });

// ---------- Select any text to ask about it ----------
// The answer comes in the chat on the right; the page itself never changes.
document.addEventListener("mouseup", (e) => {
  if (e.target.closest(".ask-sel, .ask-pop")) return;
  setTimeout(() => {
    document.querySelectorAll(".ask-sel").forEach((x) => x.remove());
    const sel = getSelection();
    const text = sel && sel.toString().trim();
    if (!text || text.length < 3 || !sel.rangeCount || !main.contains(sel.anchorNode) || e.target.closest("textarea, input")) return;
    if (S.page !== "k" && S.page !== "me") return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const b = document.createElement("button");
    b.className = "ask-sel";
    b.textContent = S.page === "k" && S.doc !== "overview" && S.mentorChat ? "Ask your mentor" : "Ask about this";
    b.style.top = `${Math.max(8, r.top - 38)}px`;
    b.style.left = `${Math.min(innerWidth - 160, r.left + r.width / 2 - 60)}px`;
    b.onmousedown = (ev) => ev.preventDefault();
    b.onclick = () => askPop(text, r);
    document.body.appendChild(b);
  }, 0);
});

// ---------- Ask mode: one button, then click anything on the page to ask about it ----------
// Like commenting on a document: the clicked piece is quoted, you type your question, the answer
// comes in the chat on the right. Esc or the button again turns it off.
const ASKABLE = ".dg-b, .dg-detail-story, .fl-grp, .t-comp, .t-sumrow, .t-glance li, .t-points li, .t-card-head, .t-card-what, .t-pstep, .t-faq-row, .t-wl, .t-crow, .t-concept, .t-note, .t-mentor-card, .v-name, h1, h2, h3, h4, h5, p, li, section";
const askFab = document.createElement("button");
askFab.className = "ask-fab";
askFab.title = "Ask about anything on this page";
askFab.setAttribute("aria-pressed", "false");
askFab.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Ask</span>`;
document.body.appendChild(askFab);
const placeFab = () => { const r = main.getBoundingClientRect(); askFab.style.left = `${r.right - askFab.offsetWidth - 28}px`; askFab.style.top = `${r.bottom - askFab.offsetHeight - 28}px`; askFab.hidden = !(S.page === "k" || S.page === "me"); };
new ResizeObserver(placeFab).observe(main);
addEventListener("hashchange", () => setTimeout(placeFab, 0));
const setAsking = (on) => { S.asking = on; document.body.classList.toggle("asking", on); askFab.setAttribute("aria-pressed", String(on)); askFab.querySelector("span").textContent = on ? "Click anything" : "Ask"; if (!on) main.querySelectorAll(".ask-hover").forEach((x) => x.classList.remove("ask-hover")); };
askFab.onclick = () => setAsking(!S.asking);
addEventListener("keydown", (e) => { if (e.key === "Escape" && S.asking) setAsking(false); });
main.addEventListener("mouseover", (e) => {
  if (!S.asking) return;
  main.querySelectorAll(".ask-hover").forEach((x) => x.classList.remove("ask-hover"));
  const el = e.target.closest(ASKABLE);
  if (el && main.contains(el)) el.classList.add("ask-hover");
});
main.addEventListener("click", (e) => {
  if (!S.asking) return;
  const el = e.target.closest(ASKABLE);
  if (!el || !main.contains(el)) return;
  e.preventDefault(); e.stopPropagation();
  const text = el.innerText.replace(/\s+\n/g, "\n").trim().slice(0, 900);
  if (!text) return;
  askPop(text, { top: e.clientY, bottom: e.clientY + 6, left: e.clientX }, shortText(text.split("\n")[0], 140));
}, true);

function askPop(text, r, label) {
  document.querySelectorAll(".ask-sel, .ask-pop").forEach((x) => x.remove());
  const p = document.createElement("div");
  p.className = "ask-pop";
  p.innerHTML = `<div class="msg-quote">${esc(label || (text.length > 160 ? text.slice(0, 160) + "…" : text))}</div>
    <textarea class="text" rows="2" placeholder="What do you want to know about this?"></textarea>
    <div class="prompts">${["Explain this simply", "Why does this matter for me?", "Give me a real example", "Is this right?"].map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`;
  p.style.top = `${Math.min(innerHeight - 220, r.bottom + 8)}px`;
  p.style.left = `${Math.max(12, Math.min(innerWidth - 372, r.left))}px`;
  document.body.appendChild(p);
  const ta = $("textarea", p);
  ta.focus();
  const go = (q) => {
    if (!q.trim()) return;
    p.remove();
    getSelection().removeAllRanges();
    if (S.page === "me") { $("#chatbox").value = `About this: “${text}”\n\n${q}`; return sendProfile(); }
    send(q, text);
  };
  ta.onkeydown = (e) => { if (e.key === "Escape") p.remove(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(ta.value); } };
  p.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => go(b.dataset.q)));
  setTimeout(() => document.addEventListener("mousedown", function off(ev) { if (!p.contains(ev.target)) { p.remove(); document.removeEventListener("mousedown", off); } }), 0);
}

function toast(text, purgeRule) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `🎓 ${esc(text)} ${purgeRule ? `<button class="link" id="purge">Remove similar past items too</button>` : ""}`;
  document.body.appendChild(t);
  if (purgeRule) $("#purge", t).onclick = async () => { const r = await api(`/api/rules/${purgeRule}/purge`, { method: "POST" }); t.textContent = `Removed ${r.removed}.`; route(); };
  setTimeout(() => t.remove(), 9000);
}

// ---------- Right: summary + one chat ----------
function setContext(doc, target, label) {
  S.chatDoc = doc;
  S.target = target;
  S.targetLabel = label || "";
}

async function renderRight({ kind, date, synthesis }) {
  if (kind === "doc" && S.doc !== "overview") return renderTopicRight();
  const isDoc = kind === "doc";
  const blocks = isDoc ? S.data.blocks : {};
  const summary = isDoc ? blocks.synthesis?.content : synthesis;
  const coach = isDoc ? blocks.coach?.content : "";
  const title = isDoc ? (S.doc === "overview" ? "Everything recorded" : S.data.domain.name) : kind === "day" ? (date === dayStr() ? "Today" : fmtDate(new Date(date + "T12:00:00"))) : "";
  right.innerHTML = `
    <div class="r-head"><div><div class="faint">Summary</div><b>${esc(title)}</b></div>
      <button class="link" id="resum">${summary ? "Refresh" : "Write"}</button></div>
    <div class="r-sum">
      <div class="summary" id="sum">${summary ? `<div class="clamp" id="clamp">${md(summary)}</div><button class="link" id="more">Read more</button>` : `<div class="faint">${isDoc ? "Magic will summarise what you know here." : "Magic writes your day's summary tonight — or now."}</div>`}</div>
      ${coach ? `<div class="next"><b>What to do next</b>${md(coach)}</div>` : ""}
      <div class="prompts" id="prompts"></div>
    </div>
    <div class="r-scroll" id="rscroll" tabindex="0" role="region" aria-label="Conversation"><div class="chat" id="chat"></div></div>
    <div class="r-input">
      <div class="ctx" id="ctx"></div>
      <textarea class="text" id="chatbox" rows="2" placeholder="Ask, explain what you understood, push back, or tell Magic what to keep…"></textarea>
    </div>`;
  const clamp = $("#clamp");
  if (clamp) {
    if (clamp.scrollHeight <= clamp.clientHeight + 4) { clamp.classList.remove("clamp"); $("#more").remove(); }
    else $("#more").onclick = (e) => { clamp.classList.remove("clamp"); e.target.remove(); };
  }
  $("#resum").onclick = () => (isDoc ? writeSummary() : writeDay(date));
  renderCtx();
  $("#chatbox").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  loadThread();
  // Suggested prompts: concepts here that are worth explaining in your own words.
  const q = await api("/api/reflect/queue").catch(() => []);
  const here = isDoc && S.doc !== "overview" ? q.filter((c) => S.data.concepts.some((x) => x.id === c.id)) : q;
  $("#prompts").innerHTML = [
    ...here.slice(0, 3).map((c) => `<button data-p="My understanding of ${esc(c.name)}: ">Explain “${esc(c.name)}”</button>`),
    `<button data-p="${isDoc ? "What am I missing here?" : "What did I learn today?"}">${isDoc ? "What am I missing?" : "What did I learn today?"}</button>`,
  ].join("");
  $("#prompts").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { $("#chatbox").value = b.dataset.p; $("#chatbox").focus(); if (!b.dataset.p.endsWith(": ")) send(); }));
}

// Right, in a topic: one open chat, with one click to talk with the topic's mentor instead.
// Curiosity questions to start; select any text on the page to ask about it.
function renderTopicRight() {
  const m = (S.guide || {}).mentor;
  const g = (S.guide || {}).guide || {};
  const withMentor = !!(m && S.mentorChat);
  right.innerHTML = `
    <div class="r-head"><div><div class="faint">Chat</div><b>${withMentor ? esc(m.role) : esc(S.data.domain.name)}</b></div>
      ${m ? `<div class="t-seg" role="group" aria-label="Who answers"><button class="${withMentor ? "" : "on"}" aria-pressed="${!withMentor}" data-mode="open">Magic</button><button class="${withMentor ? "on" : ""}" aria-pressed="${!!withMentor}" data-mode="mentor" title="${esc(m.role)}">Mentor</button></div>` : ""}</div>
    <div class="r-sum">
      <div class="faint small">${withMentor ? `Talking with your mentor — their framework, rules and the field's leaders shape every answer.` : `Ask anything — it searches everything you've recorded. Switch to Mentor for an expert's view.`} Select any text on the page to ask about it.</div>
      <div class="prompts t-prompts" id="prompts">${(g.ask || ["What am I missing here?", "What should I learn next?"]).slice(0, 4).map((q) => `<button data-p="${esc(q)}" title="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    </div>
    <div class="r-scroll" id="rscroll" tabindex="0" role="region" aria-label="Conversation"><div class="chat" id="chat"></div></div>
    <div class="r-input">
      <div class="ctx" id="ctx"></div>
      <textarea class="text" id="chatbox" rows="2" placeholder="${withMentor ? "Ask your mentor, explain what you understood, or push back…" : "Ask, explain what you understood, push back, or tell Magic what to keep…"}"></textarea>
    </div>`;
  renderCtx();
  $("#chatbox").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("#prompts").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => send(b.dataset.p)));
  right.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { S.mentorChat = b.dataset.mode === "mentor"; store.set("mentorChat", S.mentorChat); renderTopicRight(); }));
  loadThread();
}

function renderCtx() {
  const generic = S.target.type === "doc";
  $("#ctx").innerHTML = generic ? `Talking about ${esc(S.targetLabel)}` : `Talking about <b>${esc(S.targetLabel)}</b> <button class="link" id="clearctx">×</button>`;
  const c = $("#clearctx");
  if (c) c.onclick = () => { setContext(S.chatDoc, { type: "doc" }, S.doc === "overview" ? "Everything recorded" : S.data.domain.name); renderDoc(); renderCtx(); loadThread(); };
}

async function loadThread() {
  const q = new URLSearchParams({ doc: S.chatDoc, type: S.target.type, ...(S.target.id ? { id: S.target.id } : {}) });
  const h = await api(`/api/discuss/thread?${q}`).catch(() => []);
  $("#chat").innerHTML = h.slice(-20).map((m) => `<div class="msg ${m.role === "user" ? "user" : "magic"}">${m.role === "user" ? userMsg(m.content, m.meta && m.meta.selection) : md(m.content)}</div>`).join("");
  $("#rscroll").scrollTop = 1e9;
}

const userMsg = (text, sel) => `${sel ? `<div class="msg-quote">${esc(sel.length > 220 ? sel.slice(0, 220) + "…" : sel)}</div>` : ""}${esc(text)}`;

const INTENT = { ask: "From what you've recorded", discuss: "", share: "Checked your understanding", teach: "Learned a rule" };
const VERDICT = { misconception: ["warn", "Not quite yet"], partial: ["gray", "Partly there"], solid: ["ok", "Solid"], deep: ["ok", "Deep"] };

async function send(asked, selection) {
  const box = $("#chatbox");
  const text = (asked || box.value).trim();
  if (!text) return;
  if (!asked) box.value = "";
  const chat = $("#chat");
  chat.insertAdjacentHTML("beforeend", `<div class="msg user">${userMsg(text, selection)}</div><div class="msg magic pending" id="pending" role="status"><span class="spinner"></span> <span id="pendingText">Searching your notes…</span> <button class="link" id="stopAsk">Stop</button></div>`);
  $("#rscroll").scrollTop = 1e9;
  // Say what's happening while the answer is written, and let the person stop waiting.
  let stopped = false;
  const said = setTimeout(() => { const t = $("#pendingText"); if (t) t.textContent = "Writing your answer…"; }, 4000);
  const still = setTimeout(() => { const t = $("#pendingText"); if (t) t.textContent = "Still working. Longer answers can take up to a minute."; }, 12000);
  $("#stopAsk").onclick = () => { stopped = true; clearTimeout(said); clearTimeout(still); const p = $("#pending"); if (p) { p.textContent = "Stopped. Ask again whenever you like."; p.classList.remove("pending"); p.removeAttribute("id"); } };
  try {
    const r = await api("/api/chat", { method: "POST", body: { doc: S.chatDoc, target: S.target, message: text, selection, mentor: !!(S.mentorChat && S.page === "k" && S.doc !== "overview") } });
    clearTimeout(said); clearTimeout(still);
    if (stopped) return;
    // A suggested change to your notes only when you shared your understanding or asked for a change.
    if (r.proposed_edit && r.intent !== "share" && !/\b(update|change|save|correct|fix|edit|rewrite|add)\b/i.test(text)) delete r.proposed_edit;
    let html = `<div class="tag">${INTENT[r.intent] || ""}</div>`;
    if (r.verdict && VERDICT[r.verdict]) {
      const [cls, label] = VERDICT[r.verdict];
      html += `<span class="chip ${cls}">${label}</span> ${r.level_before && r.level_before !== r.level_after ? `<span class="faint">${LEVEL[r.level_before]} → ${LEVEL[r.level_after]}</span>` : ""}`;
    }
    html += md(r.reply || r.answer || "");
    if (r.credited && r.credited.length) html += `<div class="faint">Credited: ${r.credited.map((c) => esc(c.name)).join(", ")}</div>`;
    if (r.rule && r.rule.id) html += `<div class="faint">Rule saved — see Settings.</div>`;
    if (r.proposed_edit) html += `<div class="proposal"><div class="faint">${esc(r.proposed_edit.reason || "Suggested update")}</div>${md(r.proposed_edit.content)}<div class="row"><button class="btn primary" data-apply>Save to my knowledge</button><button class="btn" data-skip>No</button></div></div>`;
    $("#pending").outerHTML = `<div class="msg magic" id="last">${html}</div>`;
    const last = $("#last");
    // Start reading at the top of the answer, not its end.
    const rs = $("#rscroll"); rs.scrollTop += last.getBoundingClientRect().top - rs.getBoundingClientRect().top - 12;
    last.removeAttribute("id");
    if (r.proposed_edit) {
      $("[data-apply]", last).onclick = async (ev) => { await applyEdit(r.proposed_edit); ev.target.closest(".proposal").innerHTML = `<span class="faint">✓ Saved</span>`; reloadDoc(); };
      $("[data-skip]", last).onclick = (ev) => ev.target.closest(".proposal").remove();
    }
    if (r.verdict || r.credited || (r.rule && r.rule.id)) S.page === "k" && reloadDoc();
  } catch (e) {
    clearTimeout(said); clearTimeout(still);
    const p = $("#pending");
    if (p && !stopped) {
      // What happened, that the question is still here, and one thing to do.
      const off = /not running|no model|light mode/i.test(e.message);
      p.innerHTML = off
        ? `<b>Magic's models are switched off right now</b>, so it can't answer. Your question is still here. Run <code>./magic models</code> in Terminal, then <button class="link" data-retry>ask again</button>.`
        : `<b>Something went wrong on Magic's side</b> and no answer came back. Your question is still here. <button class="link" data-retry>Try again</button>`;
      p.classList.remove("pending"); p.classList.add("error"); p.setAttribute("role", "alert"); p.removeAttribute("id");
      $("[data-retry]", p).onclick = () => { p.previousElementSibling?.remove(); p.remove(); send(text, selection); };
    }
    $("#rscroll").scrollTop = 1e9;
  }
}

async function applyEdit(p) {
  const t = p.target;
  if (t.type === "concept") return api(`/api/concepts/${t.id}/edit`, { method: "POST", body: { current_take: p.content } });
  if (t.type === "item") return api(`/api/items/${t.id}`, { method: "POST", body: { text: p.content } });
  const cur = S.data.blocks[t.id]?.content || "";
  return api(`/api/docs/${S.chatDoc}/blocks/${t.id}`, { method: "POST", body: { content: p.field === "append" && cur ? `${cur}\n\n${p.content}` : p.content } });
}

async function writeSummary(auto) {
  $("#sum").innerHTML = `<div class="faint"><span class="spinner"></span> ${auto ? "Writing your summary…" : "Updating…"}</div>`;
  try {
    S.data = await api(`/api/docs/${S.doc}/generate`, { method: "POST" });
    renderRight({ kind: "doc" });
  } catch (e) { $("#sum").innerHTML = `<div class="faint">${esc(e.message)}</div>`; }
}

async function writeDay(date) {
  $("#sum").innerHTML = `<div class="faint"><span class="spinner"></span> Summarising your day…</div>`;
  try {
    const r = await api("/api/synthesize", { method: "POST", body: { date } });
    renderRight({ kind: "day", date, synthesis: r.content });
  } catch (e) { $("#sum").innerHTML = `<div class="faint">${esc(e.message)}</div>`; }
}

// ---------- You: the profile, shown visually ----------
// The Mirror writes the profile as Markdown sections; each section gets its own layout, and every
// sentence of the original is kept — the visuals arrange the text, they don't replace it.
const inl = (s) => marked.parseInline(s || "");

function parseProfile(text) {
  const sections = [];
  let cur = null;
  let block = null; // the paragraph or bullet being collected
  const flush = () => { block = null; };
  for (const line of (text || "").split("\n")) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) { cur = { title: h[1].trim(), paras: [], bullets: [] }; sections.push(cur); flush(); continue; }
    if (!cur) { cur = { title: "", paras: [], bullets: [] }; sections.push(cur); }
    if (!line.trim()) { flush(); continue; }
    const b = line.match(/^\s*[*-]\s+(.*)/);
    if (b) {
      const m = b[1].match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      block = m ? { label: m[1].replace(/:$/, ""), text: m[2] } : { label: "", text: b[1] };
      cur.bullets.push(block);
    } else if (block && block.label !== undefined && cur.bullets.includes(block)) {
      block.text += " " + line.trim();
    } else if (block) {
      cur.paras[cur.paras.length - 1] += " " + line.trim();
    } else {
      cur.paras.push(line.trim());
      block = { para: true };
    }
  }
  return sections.filter((x) => x.title || x.paras.length || x.bullets.length);
}

// "(Evidence: …)" at the end of a point becomes a footnote under it.
function splitEvidence(text) {
  const i = text.lastIndexOf("(Evidence:");
  if (i < 0) return [text, ""];
  // Often italicised: *(Evidence: …)*
  return [text.slice(0, i).replace(/[*_]+$/, "").trim(), text.slice(i + 1).replace(/[*_]*\s*$/, "").replace(/\)\.?$/, "").replace(/^Evidence:\s*/, "")];
}

const key = (t) => t.toLowerCase().replace(/[’']/g, "'");

// Who you are → personality → what drives you → how you think → strengths & shadows → evidence → direction.
// Every visual is a summary drawn from a standard model; the full words are one click away.
const LEVELS = ["exposed", "familiar", "understands", "applies", "can_teach"];
const ramp = (i, n) => `color-mix(in srgb, var(--accent) ${Math.round(14 + (86 * i) / Math.max(1, n - 1))}%, var(--panel))`;

async function pageProfile() {
  const [p, st] = await Promise.all([api("/api/profile"), api("/api/profile/stats")]);
  S.chatDoc = "profile";
  if (!p.content) {
    main.innerHTML = `<div class="page profile"><h1>You</h1>
      <div class="empty">Your profile builds up from what you read, ask and talk about. <button class="btn primary" id="build">Build my profile now</button></div></div>`;
    $("#build").onclick = buildProfile;
    renderProfileRight();
    return;
  }
  const c = st.card;
  if (!c) {
    main.innerHTML = `<div class="page profile empty"><span class="spinner"></span> Drawing your profile…</div>`;
    renderProfileRight();
    await api("/api/profile/card", { method: "POST" }).catch(() => {});
    return route();
  }
  const t = st.totals;
  const b = st.behaviour || {};
  const who = parseProfile(p.content).find((x) => key(x.title) === "who you are");
  const ev = (x) => (x.n != null ? ` data-tip="${esc(`Seen in ${x.n} recent activities${x.seen && x.seen.length ? `\n\n${x.seen.map((e) => `• ${e}`).join("\n")}` : ""}`)}"` : "");
  main.innerHTML = `<div class="page profile v2">
    <header class="v-hero">
      <div class="v-hero-top">
        <div class="v-id">
          <div class="p-avatar">P</div>
          <div>
            <div class="v-eyebrow">Your profile · updated ${p.created ? ago(p.created) : ""} · <button class="link" id="refresh">Refresh</button></div>
            <h1>${esc(c.archetype)}</h1>
            <div class="v-tagline">${esc(c.tagline)}</div>
            <button class="v-arc-pill" data-panel="hp-becoming" aria-expanded="false"><span>${esc(c.from)}</span><span class="p-arrow">→</span><b>${esc(c.to)}</b><span class="v-caret">▾</span></button>
            ${who && who.paras.length ? `<div><button class="link v-hero-toggle" data-panel="hp-who" aria-expanded="false">Read more about who you are</button></div>` : ""}
          </div>
        </div>
        <div class="v-kpis">
          ${kpi(t.days, "active days")}${kpi(t.concepts, "concepts")}${kpi(t.deep, "you understand deeply", `${Math.round((100 * t.deep) / Math.max(1, t.concepts))}% of all`)}${kpi(t.sources, "sources")}
        </div>
      </div>
      ${who && who.paras.length ? `<div class="v-hero-panel v-hero-prose" id="hp-who" hidden><h3>Who you are</h3>${who.paras.map((x) => `<p>${inl(x)}</p>`).join("")}</div>` : ""}
      <div class="v-hero-panel" id="hp-becoming" hidden><div class="v-mind-head"><div><h3>Who you're becoming</h3><div class="v-sub">From ${esc(c.from)} to ${esc(c.to)}</div></div>
        <span class="v-info" data-tip="${esc(BRIDGES_HOW)}">ⓘ</span></div>${bridges(c)}</div>
    </header>

    ${youCard("Your personality", () => youPersonality(st))}

    <section><h3 class="v-h">What drives you</h3>
      <div class="v-drives">
        <div class="v-panel v-drive"><div class="v-mind-head"><div><h3>Interests</h3><div class="v-sub">The kinds of work that pull you in · ${b.interest ? b.interest.n : 0} activities</div></div><span class="v-info" data-tip="${esc(RIASEC_HOW)}">ⓘ</span></div>
          <div class="v-drive-body"><div>${riasec(b.interest)}</div><div><div class="p-label">Interests you've named · sized by matching activity</div><div class="v-chips">${(c.interests || []).map((x) => `<span class="v-ichip" style="--w:${Math.min(1, (x.n || 0) / Math.max(1, ...(c.interests || []).map((y) => y.n || 0)))}"${ev(x)}>${esc(x.name)}${x.n != null ? ` <em>${x.n}</em>` : ""}</span>`).join("")}</div></div></div></div>
        <div class="v-panel v-drive"><div class="v-mind-head"><div><h3>Motivation</h3><div class="v-sub">What keeps you going · ${b.motive ? b.motive.n : 0} activities</div></div><span class="v-info" data-tip="${esc(MOTIVE_HOW)}">ⓘ</span></div>
          <div class="v-drive-body"><div>${ternary(b.motive)}</div><div><div class="p-label">What you say drives you</div><div class="v-stack tight">${(c.motivations || []).map((x) => expandable(`<div class="v-short"${ev(x)}>${esc(x.short || x.full)}${x.n != null ? ` <em class="faint">· ${x.n} activities</em>` : ""}</div>`, x.full, "v-mot")).join("")}</div></div></div></div>
        <div class="v-panel v-drive"><div class="v-mind-head"><div><h3>Values &amp; identity</h3><div class="v-sub">What you stand for · ${b.value ? b.value.n : 0} activities</div></div><span class="v-info" data-tip="${esc(VALUES_HOW)}">ⓘ</span></div>
          <div class="v-drive-body"><div>${schwartz(b.value)}</div><div><div class="p-label">How you see yourself</div>${(c.identity || []).map((x) => expandable(`<div class="v-quote">“${esc(x.short || x.full)}”</div>`, x.full, "v-id-quote")).join("")}</div></div></div>
      </div>
    </section>

    <section><h3 class="v-h">How you think</h3>${minds(b, c.thinking || [])}</section>

    <section class="v-panel"><div class="v-mind-head"><div><h3>Strengths &amp; their shadows</h3><div class="v-sub">Each strength, and what it looks like when it's turned up too far · bars show how often it came up recently</div></div>
      <span class="v-info" data-tip="${esc(SHADOW_HOW)}">ⓘ</span></div>${shadows(c)}</section>

    ${youCard("Blind spots", () => youBlindSpots(c))}

    ${youCard("Depth of knowledge", () => youDepth(st.areas))}

    ${youCard("When you learn", () => youWhen(st.rhythm, st.totals))}

    ${youCard("Highlights", () => youHighlights(c.highlights))}
  </div>`;
  bindYouCards(main);
  main.querySelectorAll(".v-exp").forEach((el) => (el.onclick = (e) => { if (!e.target.closest("a")) el.classList.toggle("open"); }));
  // The arc pill and "Read more" open their detail inside the hero, one at a time.
  const toggles = main.querySelectorAll(".v-hero [data-panel]");
  toggles.forEach((btn) => (btn.onclick = () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    toggles.forEach((b) => { b.setAttribute("aria-expanded", "false"); $(`#${b.dataset.panel}`).hidden = true; });
    btn.setAttribute("aria-expanded", String(open));
    $(`#${btn.dataset.panel}`).hidden = !open;
  }));
  $("#refresh").onclick = (e) => { e.preventDefault(); buildProfile(e); };
  bindTips(main);
  renderProfileRight();
}

const kpi = (n, label, sub) => `<div class="v-kpi"><b>${Number(n).toLocaleString()}</b><span>${esc(label)}</span>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`;

// A card that shows the summary and opens to the full text on click.
const expandable = (summary, full, cls = "v-card") =>
  `<div class="${cls} v-exp" tabindex="0">${summary}${full ? `<div class="v-more">${inl(full).replace(/\n\n/g, " ")}</div><div class="v-hint">Read more</div>` : ""}</div>`;

// ---------- How you think: four standard behavioural models, each drawn its own way ----------
const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);
const sum = (m) => Object.values(m || {}).reduce((a, b) => a + b, 0);
const MODEL = {
  thinking: {
    title: "Thinking style", match: /think/i, model: "Herrmann Whole Brain model", plain: "How you approach a problem",
    tags: { A: "Analytical", B: "Practical", C: "Relational", D: "Experimental" },
    how: "Herrmann Whole Brain (HBDI). Every activity Magic records is classified by the mode you used most:\nA Analytical — logic, numbers, debugging\nB Practical — process, planning, detail\nC Relational — people, communication, feelings\nD Experimental — strategy, synthesis, new ideas\nThe shape is each mode's share of your last 60 days; the dashed shape is before this week.",
  },
  learning: {
    title: "Learning style", match: /learn/i, model: "Kolb's learning cycle", plain: "How you take in something new",
    tags: { CE: "Experiencing", RO: "Reflecting", AC: "Conceptualising", AE: "Experimenting" },
    how: "Kolb's experiential learning cycle. Every activity is classified by how you were learning:\nExperiencing — calls, practice, events\nReflecting — reading, watching, listening\nConceptualising — frameworks, explaining in your words\nExperimenting — building, testing, applying\nYour point = (Reflecting − Experimenting, Conceptualising − Experiencing) as shares of activity, which places you in one of Kolb's four styles.",
  },
  question: {
    title: "How you ask questions", match: /ask|question/i, model: "Bloom's taxonomy", plain: "How deep your questions go",
    tags: { remember: "Remember", understand: "Understand", apply: "Apply", analyze: "Analyze", evaluate: "Evaluate", create: "Create" },
    how: "Bloom's revised taxonomy. Every question you ask is graded by the thinking it demands, from Remember (recall a fact) up to Create (design something new).\nDepth = the average level, 1–6. Higher-order = Analyze, Evaluate and Create.\nInterview prompts asked of you are left out.",
  },
  decision: {
    title: "How you decide", match: /decid/i, model: "Rowe's decision styles", plain: "How you make a call",
    tags: { directive: "Directive", analytical: "Analytical", conceptual: "Conceptual", behavioral: "Behavioral" },
    how: "Rowe's decision-style model. When an activity contains a decision, it's classified on two axes — task vs people focus, and tolerance for ambiguity:\nDirective — quick, practical, from rules or experience\nAnalytical — data-heavy, weighs many options\nConceptual — vision-led, long-term, creative\nBehavioral — guided by people and consensus",
  },
};

function minds(b, thinking) {
  if (!b) return "";
  const draw = { thinking: wholeBrain, learning: kolb, question: bloom, decision: rowe };
  const pending = b.pending ? `<div class="v-pending"><span class="spinner"></span> Magic is still classifying ${b.pending} past activities and questions — these fill in as it goes.</div>` : "";
  return `${pending}<div class="v-minds">${Object.entries(MODEL).map(([k, m]) => {
    const d = b[k];
    const text = thinking.find((x) => m.match.test(x.name));
    const em = d.emerging && `<div class="v-emerging">↑ Emerging: <b>${esc(m.tags[d.emerging.tag])}</b> +${d.emerging.delta} pts in the last ${b.recent_days} days</div>`;
    const body = d.n < 3 ? `<div class="v-mind-empty faint">Not enough classified yet.</div>` : draw[k](d, m);
    return `<div class="v-panel v-mind"><div class="v-mind-head"><div><h3>${m.title}</h3><div class="v-sub">${m.plain} · ${d.n} ${k === "question" ? "questions" : k === "decision" ? "decisions" : "activities"}</div></div>
      <span class="v-info" data-tip="${esc(m.how)}">ⓘ</span></div>
      ${body}${em || ""}
      ${text ? expandable(`<div class="v-short">${esc(text.short)}</div>`, text.full, "v-mind-text") : ""}</div>`;
  }).join("")}</div>`;
}

const tipList = (label, n, total, ex) => `${label}: ${n} (${pct(n, total)}%)${ex && ex.length ? `\n\nRecent:\n${ex.map((e) => `• ${e}`).join("\n")}` : ""}`;

// HBDI: a kite on the four quadrant diagonals — A top-left, D top-right, B bottom-left, C bottom-right.
function wholeBrain(d, m) {
  const keys = ["A", "D", "C", "B"], ang = { A: 225, D: 315, C: 45, B: 135 };
  const shape = (counts) => {
    const t = sum(counts) || 1;
    return keys.map((k) => { const r = 18 + 88 * Math.sqrt(counts[k] / t); const a = (ang[k] * Math.PI) / 180; return `${(120 + r * Math.cos(a)).toFixed(1)},${(120 + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
  };
  const t = sum(d.counts), top = keys.reduce((a, k) => (d.counts[k] > d.counts[a] ? k : a), "A");
  const pos = { A: [8, 18, "start"], D: [232, 18, "end"], B: [8, 230, "start"], C: [232, 230, "end"] };
  return `<div class="v-mind-lead">Leads with <b>${m.tags[top]}</b> thinking</div>
  <svg class="v-svg" viewBox="0 0 240 240" role="img" aria-label="Whole Brain profile">
    ${keys.map((k) => { const [x, y] = [k === "A" || k === "B" ? 0 : 120, k === "A" || k === "D" ? 0 : 120]; return `<rect x="${x + 1}" y="${y + 1}" width="118" height="118" rx="10" class="${k === top ? "q top" : "q"}" data-tip="${esc(tipList(`${k} · ${m.tags[k]}`, d.counts[k], t, d.examples[k]))}"/>`; }).join("")}
    ${sum(d.earlier) ? `<polygon points="${shape(d.earlier)}" class="prev"/>` : ""}
    <polygon points="${shape(d.counts)}" class="now"/>
    ${keys.map((k) => { const [x, y, a] = pos[k]; return `<text x="${x}" y="${y}" text-anchor="${a}" class="lbl"><tspan class="${k === top ? "strong" : ""}">${k} ${m.tags[k]}</tspan><tspan x="${x}" dy="14" class="num">${pct(d.counts[k], t)}%</tspan></text>`; }).join("")}
  </svg>`;
}

// Kolb: a point on Doing↔Watching × Feeling↔Thinking, with last week's move.
function kolb(d, m) {
  const at = (c) => { const t = sum(c) || 1; return [Math.max(10, Math.min(230, 120 + 220 * ((c.RO - c.AE) / t))), Math.max(10, Math.min(230, 120 + 220 * ((c.AC - c.CE) / t)))]; };
  const [x, y] = at(d.counts);
  const style = y <= 120 ? (x <= 120 ? "Accommodating — learn by doing and feeling" : "Diverging — learn by watching and feeling") : (x <= 120 ? "Converging — learn by doing and thinking" : "Assimilating — learn by watching and thinking");
  const t = sum(d.counts);
  const hasMove = sum(d.recent) >= 3 && sum(d.earlier) >= 3;
  const [x0, y0] = hasMove ? at(d.earlier) : [x, y], [x1, y1] = hasMove ? at(d.recent) : [x, y];
  const end = (k, tx, ty, a) => `<text x="${tx}" y="${ty}" text-anchor="${a}" class="lbl" data-tip="${esc(tipList(m.tags[k], d.counts[k], t, d.examples[k]))}">${m.tags[k]} <tspan class="num">${pct(d.counts[k], t)}%</tspan></text>`;
  return `<div class="v-mind-lead"><b>${style.split(" — ")[0]}</b> — ${style.split(" — ")[1]}</div>
  <svg class="v-svg" viewBox="-26 -26 292 292" role="img" aria-label="Kolb learning style">
    <rect x="1" y="1" width="238" height="238" rx="12" class="q"/>
    <line x1="120" y1="18" x2="120" y2="222" class="axis"/><line x1="18" y1="120" x2="222" y2="120" class="axis"/>
    <text x="60" y="64" text-anchor="middle" class="qname">Accommodating</text><text x="180" y="64" text-anchor="middle" class="qname">Diverging</text>
    <text x="60" y="182" text-anchor="middle" class="qname">Converging</text><text x="180" y="182" text-anchor="middle" class="qname">Assimilating</text>
    ${end("CE", 120, -10, "middle")}${end("AC", 120, 258, "middle")}<g transform="translate(-10 120) rotate(-90)">${end("AE", 0, 0, "middle")}</g><g transform="translate(252 120) rotate(90)">${end("RO", 0, 0, "middle")}</g>
    ${hasMove ? `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="move"/><circle cx="${x0}" cy="${y0}" r="5" class="prevdot" data-tip="Before this week"/>` : ""}
    <circle cx="${hasMove ? x1 : x}" cy="${hasMove ? y1 : y}" r="8" class="dot" data-tip="${hasMove ? "This week" : "You"}"/>
  </svg>`;
}

// Bloom: a staircase from Remember (bottom) to Create (top); bar = how often you ask at that level.
function bloom(d, m) {
  const keys = Object.keys(m.tags), t = sum(d.counts) || 1, max = Math.max(1, ...Object.values(d.counts));
  const depth = keys.reduce((a, k, i) => a + (i + 1) * d.counts[k], 0) / t;
  const higher = pct(d.counts.analyze + d.counts.evaluate + d.counts.create, t);
  return `<div class="v-mind-lead">Depth <b>${depth.toFixed(1)}</b> of 6 · <b>${higher}%</b> higher-order questions</div>
  <div class="v-bloom">${keys.slice().reverse().map((k) => { const i = keys.indexOf(k); return `<div class="v-bloom-row ${i >= 3 ? "hi" : ""}" data-tip="${esc(tipList(m.tags[k], d.counts[k], t, d.examples[k]))}">
    <span class="v-bloom-name">${m.tags[k]}</span>
    <span class="v-bar-track"><span class="v-bar-fill" style="width:${(100 * d.counts[k]) / max}%;background:${ramp(i, 6)}"></span></span><span class="v-bar-val">${pct(d.counts[k], t)}%</span></div>`; }).join("")}</div>`;
}

// Rowe: 2×2 — task↔people across, ambiguity tolerance up; bubble area = share of decisions.
function rowe(d, m) {
  const t = sum(d.counts) || 1, top = Object.keys(m.tags).reduce((a, k) => (d.counts[k] > d.counts[a] ? k : a), "directive");
  const cell = { analytical: [60, 62], conceptual: [180, 62], directive: [60, 170], behavioral: [180, 170] };
  return `<div class="v-mind-lead">Mostly <b>${m.tags[top]}</b> decisions</div>
  <svg class="v-svg" viewBox="-24 0 264 244" role="img" aria-label="Rowe decision styles">
    ${Object.entries(cell).map(([k, [cx, cy]]) => { const r = 5 + 33 * Math.sqrt(d.counts[k] / t); return `<rect x="${cx - 59}" y="${cy - 53}" width="118" height="106" rx="10" class="${k === top ? "q top" : "q"}" data-tip="${esc(tipList(m.tags[k], d.counts[k], t, d.examples[k]))}"/>
      <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="bub ${k === top ? "top" : ""}" data-tip="${esc(tipList(m.tags[k], d.counts[k], t, d.examples[k]))}"/>
      <text x="${cx}" y="${cy - 40}" text-anchor="middle" class="lbl ${k === top ? "strong" : ""}">${m.tags[k]}</text><text x="${cx}" y="${cy + 47}" text-anchor="middle" class="num">${pct(d.counts[k], t)}%</text>`; }).join("")}
    <text x="60" y="236" text-anchor="middle" class="axislbl">Task-focused</text><text x="180" y="236" text-anchor="middle" class="axislbl">People-focused</text>
    <text transform="translate(-10 62) rotate(-90)" text-anchor="middle" class="axislbl">Open to ambiguity</text><text transform="translate(-10 170) rotate(-90)" text-anchor="middle" class="axislbl">Wants clarity</text>
  </svg>`;
}

// ---------- Personality and drives: each drawn from a standard model, scored from what you did ----------
// Laplace-smoothed (+1 per category) so a handful of activities can't pin a share to 0 or 1.
const share = (d, tags) => { if (!d || !d.n) return null; const ks = Object.keys(d.counts); return tags.reduce((a, k) => a + (d.counts[k] || 0) + 1, 0) / (sum(d.counts) + ks.length); };
// 50 = an even split across the model's categories; 100 = twice that share.
const rel = (x, base) => (x == null ? null : Math.max(0, Math.min(100, Math.round(50 + (50 * (x - base)) / base))));

const BIG5_HOW = "Big Five (OCEAN) is the most widely validated model of personality. Magic doesn't ask you questions — it scores each trait from behavioural indicators that research links to it (the digital-footprint approach, e.g. Stachl et al., 2020, PNAS; Kosinski et al., 2013).\nEach indicator is 0–100, where 50 means an even split across that model's categories. The trait score is their average. Scores are relative to your own record, not to a population.";
const RIASEC_HOW = "Holland's RIASEC model (used by O*NET) sorts interests into six types: Realistic, Investigative, Artistic, Social, Enterprising, Conventional.\nEvery activity is classified by the type of work it is. The shape is each type's share; your Holland code is your top three letters.\nThe chips are interests you've named, sized by how many recent activities match them.";
const MOTIVE_HOW = "McClelland's theory of needs: achievement, power and affiliation.\nMcClelland measured motives by coding the imagery in what people write and do — Magic does the same for each activity: mastering or beating a standard (achievement), influencing or making an impact (power), closeness and belonging (affiliation).\nThe dot sits closest to your strongest need.";
const VALUES_HOW = "Schwartz's theory of basic human values: ten values arranged in a circle, where neighbours are compatible and opposites conflict. They group into Openness to change, Self-enhancement, Conservation and Self-transcendence.\nEach activity is classified by the value it most serves; wedge size is its share.";
const SHADOW_HOW = "From Kaiser & Kaplan's work on overused strengths (\"Fear Your Strengths\", 2013) and the Hogan derailers: the habits that hold people back are usually strengths overplayed.\nEach pattern is paired with the strength it grows from. Bars count recent activities whose content best matches each point (semantic match on your activity).";
const BRIDGES_HOW = "William Bridges' transition model: every change runs through an Ending (letting go of the old identity), a Neutral zone (in-between, exploring) and a New beginning (the new identity taking hold).\nEach shift in your profile is placed in its phase; the highlighted phase is where you mostly are now.";

const BIG5 = [
  ["O", "Openness", "Prefers the familiar", "Curious, imaginative"],
  ["C", "Conscientiousness", "Flexible, spontaneous", "Organised, disciplined"],
  ["E", "Extraversion", "Reserved, reflective", "Outgoing, energised by people"],
  ["A", "Agreeableness", "Challenging, competitive", "Warm, cooperative"],
  ["S", "Emotional stability", "Sensitive, reactive", "Calm, resilient"],
];

function big5Indicators(st) {
  const b = st.behaviour || {}, t = st.totals || {};
  const eps = (st.areas || []).map((a) => a.episodes).filter(Boolean), tot = eps.reduce((x, y) => x + y, 0);
  const entropy = eps.length > 1 ? Math.round((100 * -eps.reduce((h, n) => h + (n / tot) * Math.log(n / tot), 0)) / Math.log(eps.length)) : null;
  const hours = Array(24).fill(0); (st.rhythm || []).forEach(([, h, n]) => (hours[h] += n));
  const night = sum(hours) ? hours.slice(0, 5).reduce((x, y) => x + y, 0) / sum(hours) : null;
  return {
    O: [
      ["Breadth of interests", entropy, "How evenly your activity spreads across areas (normalised entropy). Diverse interests and media use are among the strongest sensed markers of Openness (Kosinski et al., 2013; Stachl et al., 2020)."],
      ["Investigative + Artistic interests", rel(share(b.interest, ["I", "A"]), 2 / 6), "RIASEC I and A are the interest types most correlated with Openness (Barrick, Mount & Gupta, 2003)."],
      ["Experimental thinking", rel(share(b.thinking, ["D"]), 1 / 4), "Whole Brain D — imagination, synthesis, new ideas."],
      ["Openness-to-change values", rel(share(b.value, ["self_direction", "stimulation"]), 2 / 10), "Self-direction and stimulation values correlate with Openness (Roccas et al., 2002)."],
    ],
    C: [
      ["Routine regularity", t.span_days ? Math.round((100 * t.days) / t.span_days) : null, "Share of days you were active since Magic started. Regular daily routines predict Conscientiousness (Stachl et al., 2020)."],
      ["Follow-through on questions", t.q_total ? Math.round((100 * t.q_answered) / t.q_total) : null, "Share of your questions that got answered — finishing what you start (achievement-striving, dutifulness)."],
      ["Practical thinking", rel(share(b.thinking, ["B"]), 1 / 4), "Whole Brain B — process, planning, detail."],
      ["Achievement motive", rel(share(b.motive, ["achievement"]), 1 / 3), "Need for achievement maps to Conscientiousness's achievement-striving facet."],
      ["Conventional interests", rel(share(b.interest, ["C"]), 1 / 6), "RIASEC C correlates with Conscientiousness (Barrick et al., 2003)."],
    ],
    E: [
      ["Live interaction", rel(share(b.learning, ["CE"]), 1 / 4), "Share of activity spent in calls, conversations and events. Communication and social behaviour are the strongest sensed predictors of Extraversion (Stachl et al., 2020)."],
      ["Social + Enterprising interests", rel(share(b.interest, ["S", "E"]), 2 / 6), "RIASEC S and E correlate with Extraversion (Barrick et al., 2003)."],
      ["Power + affiliation motives", rel(share(b.motive, ["power", "affiliation"]), 2 / 3), "Needs that are met through other people."],
    ],
    A: [
      ["Relational thinking", rel(share(b.thinking, ["C"]), 1 / 4), "Whole Brain C — people, feelings, communication."],
      ["People-guided decisions", rel(share(b.decision, ["behavioral"]), 1 / 4), "Rowe's behavioral style — deciding with others' views and feelings in mind."],
      ["Self-transcendence values", rel(share(b.value, ["benevolence", "universalism"]), 2 / 10), "Benevolence is the value most correlated with Agreeableness (Roccas et al., 2002)."],
    ],
    S: [
      ["Settled hours", night == null ? null : 100 - rel(night, 5 / 24), "Less activity between midnight and 5 AM. Late-night activity is weakly linked to lower emotional stability — a tentative signal; emotional stability is the hardest trait to sense from activity."],
    ],
  };
}

// ---------- You page charts (docs/charts.md §7), drawn with the MagicCharts types in charts-you.js ----------
// Takeaways and tap notes are templates filled from the data here; no model call.
const NUMW = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const numWord = (n) => (n <= 10 ? NUMW[n] : String(n));
const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// A chart that fails to draw shows its error state; the rest of the page still works.
function youCard(title, fn) {
  try { return fn(); } catch (e) {
    console.error(e);
    return `<div class="mc-you-c">${MagicCharts.card({ title, cls: "mc-you", body: MagicCharts.stateView({ kind: "error", text: "This chart couldn't be drawn.", retry: true }), note: null })}</div>`;
  }
}
// "Ask about this" buttons in tap notes send the question to the chat beside the profile; "Try again" reloads.
function bindYouCards(root) {
  if (root.dataset.youBound) return; // main persists across pages: bind once
  root.dataset.youBound = "1";
  root.addEventListener("click", (e) => {
    const ask = e.target.closest("[data-you-ask]");
    if (ask && $("#chatbox")) { document.body.classList.remove("nr"); store.set("nr", false); $("#chatbox").value = ask.dataset.youAsk; sendProfile(); return; }
    if (e.target.closest(".mc-you [data-mc-retry]")) route();
  });
}
const youAsk = (q) => `<button type="button" class="mc-act" data-you-ask="${esc(q)}">Ask about this in the chat</button>`;

// Your personality: five traits, each between two plain-word ends (personality.html).
const B5_MEANS = {
  O: "Openness is how drawn you are to new ideas, experiences and ways of thinking.",
  C: "Conscientiousness is how organised, steady and goal-driven you are.",
  E: "Extraversion is how much you draw energy from people and live interaction.",
  A: "Agreeableness is how much you lean towards warmth and cooperation rather than challenge.",
  S: "Emotional stability is how calm and steady you stay when things get hard.",
};
// What to do with it, for a low, middle and high reading.
const B5_DO = {
  O: ["You go deep on what you already know. When you feel stuck, reading one thing outside your usual areas can open it up.", "You mix the new with the familiar, which keeps you curious without scattering you.", "Lean on it: choose work where you connect ideas from different areas. Finishing one thread before opening the next keeps it from scattering."],
  C: ["You work best when you follow your energy. A short, fixed routine, ten minutes at the same hour, makes follow-through easier.", "You plan when it matters and stay flexible when it doesn't. Writing down the one next step helps on bigger projects.", "Your steadiness is an asset. Protect it with a regular slot for learning, and allow yourself rough first drafts so polish doesn't slow you down."],
  E: ["You recharge by thinking things through on your own. Testing an idea out loud with one person a week, on a call or with a study partner, adds what reflection alone can't.", "You're comfortable both alone and with people, so use each where it helps: think alone, then test with others.", "You draw energy from people. Keep some quiet time to turn conversations into notes in your own words."],
  A: ["You question and push back, which sharpens ideas. Saying what you agree with first makes your challenge easier for others to hear.", "You balance challenge and cooperation, which helps you work well with most people.", "You make others feel heard. Make sure your own view gets said too, even when it disagrees."],
  S: ["You feel things strongly, which can make you quick to notice problems. Short breaks and regular hours help on heavy days.", "You stay fairly steady, with the usual ups and downs.", "You stay calm under pressure, which helps others around you stay calm too."],
};
// Each indicator in plain words; the research behind it stays in the ⓘ.
const B5_PLAIN = {
  "Breadth of interests": "How evenly your activity spreads across your areas. A wide spread goes with openness.",
  "Investigative + Artistic interests": "How much of your activity is research, analysis or creative work.",
  "Experimental thinking": "How often you work with imagination, synthesis and new ideas.",
  "Openness-to-change values": "How often what you do serves independence and novelty.",
  "Routine regularity": "The share of days you were active since Magic started. Regular routines go with conscientiousness.",
  "Follow-through on questions": "The share of your questions that got answered: finishing what you start.",
  "Practical thinking": "How often you work through process, planning and detail.",
  "Achievement motive": "How often what drives you is mastering something or meeting a standard.",
  "Conventional interests": "How much of your activity is organising, tracking and structured work.",
  "Live interaction": "The share of your activity spent in calls, conversations and events.",
  "Social + Enterprising interests": "How much of your activity is helping, persuading or leading people.",
  "Power + affiliation motives": "How often what drives you is met through other people: influence or belonging.",
  "Relational thinking": "How often you work through people, feelings and communication.",
  "People-guided decisions": "How often your decisions weigh other people's views and feelings.",
  "Self-transcendence values": "How often what you do serves care for others and the wider world.",
  "Settled hours": "How little of your activity happens between midnight and 5am. It's a weak, tentative signal.",
};
const b5Score = (xs) => (xs.length ? Math.round(xs.reduce((a, x) => a + x[1], 0) / xs.length) : null);
const b5Word = (s) => (s == null ? "not enough data yet" : s >= 65 ? "high" : s >= 55 ? "above the middle" : s > 45 ? "in the middle" : s > 35 ? "below the middle" : "low");

function youPersonality(st) {
  const ind = big5Indicators(st);
  const traits = BIG5.map(([k, name, lo, hi]) => { const xs = ind[k].filter((x) => x[1] != null); return { k, name, lo, hi, all: ind[k], xs, score: b5Score(xs) }; });
  const info = `${BIG5_HOW}\n\nWhat each indicator draws on:\n${traits.flatMap((t) => t.all.map(([label, , basis]) => `${label}: ${basis}`)).join("\n")}`;
  const o = { title: "Your personality", subtitle: "Five traits, read from how you actually work rather than a quiz · tap a trait to see what shows it", info,
    empty: { text: "Your five traits will appear here.", how: "Magic places you on each once it has classified enough of what you read, ask and talk about." } };
  if (traits.every((t) => t.score == null)) return MagicCharts.twoPole([], o);
  const hi = traits.filter((t) => t.score != null && t.score > 60).map((t) => t.name.toLowerCase()), lo = traits.filter((t) => t.score != null && t.score < 40).map((t) => t.name.toLowerCase());
  const jA = MagicCharts.joinAnd;
  o.takeaway = hi.length && lo.length ? `High in <b>${jA(hi)}</b>; low in ${jA(lo)}.`
    : hi.length ? `High in <b>${jA(hi)}</b>${hi.length < 5 ? "; near the middle on the rest" : ""}.`
    : lo.length ? `Low in <b>${jA(lo)}</b>${lo.length < 5 ? "; near the middle on the rest" : ""}.` : "You sit <b>near the middle</b> on every trait so far.";
  return MagicCharts.twoPole(traits.map((t) => {
    const s = t.score, band = s == null ? 1 : s < 40 ? 0 : s > 60 ? 2 : 1;
    const lean = s == null ? "" : s < 40 ? `You lean towards ${t.lo.toLowerCase()}.` : s > 60 ? `You lean towards ${t.hi.toLowerCase()}.` : `You sit between ${t.lo.toLowerCase()} and ${t.hi.toLowerCase()}.`;
    const missing = t.all.filter((x) => x[1] == null).map((x) => x[0].toLowerCase());
    const shows = s == null ? `Magic hasn't seen enough yet to place you on this trait. It will once more of your activity is classified.`
      : `What shows it in your record: ${jA(t.xs.map(([l, v]) => `${l.toLowerCase()} (${v})`))}. That's ${t.xs.length} of ${t.all.length} indicator${t.all.length === 1 ? "" : "s"} measured, each from 0 to 100, where 50 is an even split.${missing.length ? ` Not measured yet: ${jA(missing)}.` : ""}${t.k === "S" ? " This trait is the hardest to read from activity, so treat it as tentative." : ""}`;
    const note = `<p><b>${esc(t.name)}: ${s ?? "not measured yet"}${s == null ? "" : `, ${b5Word(s)}`}.</b> ${esc(B5_MEANS[t.k])} ${esc(lean)}</p><p>${esc(shows)}</p>${s == null ? "" : `<p>${esc(B5_DO[t.k][band])}</p>`}<p class="faint">Each indicator is listed below the trait.</p>`;
    const below = `<p class="mc-label">Each indicator, 0 to 100</p>${t.all.map(([label, v]) => `<div class="mc-tp-ind"><b>${esc(label)}</b><span class="mc-tp-ibar"><span style="width:${v ?? 0}%"></span></span><span class="mc-tp-ival ${v == null ? "none" : ""}">${v ?? "—"}</span><p>${esc(B5_PLAIN[label] || "")}${v == null ? " Not measured yet." : ""}</p></div>`).join("")}`;
    return { name: t.name, badge: t.k === "S" ? "N" : t.k, left: t.lo, right: t.hi, value: s, note, below };
  }), o);
}

const RIASEC = { R: ["Realistic", "Doers"], I: ["Investigative", "Thinkers"], A: ["Artistic", "Creators"], S: ["Social", "Helpers"], E: ["Enterprising", "Persuaders"], C: ["Conventional", "Organisers"] };
function riasec(d) {
  if (!d || d.n < 3) return `<div class="v-mind-empty faint">Not enough classified yet.</div>`;
  const keys = Object.keys(RIASEC), tot = sum(d.counts), max = Math.max(...keys.map((k) => d.counts[k]), 1);
  const code = keys.slice().sort((a, b) => d.counts[b] - d.counts[a]).slice(0, 3).join("");
  const pt = (i, r) => { const a = ((-90 + 60 * i) * Math.PI) / 180; return [120 + r * Math.cos(a), 120 + r * Math.sin(a)]; };
  const ring = (r) => keys.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
  return `<div class="v-mind-lead">Mostly the interests of <b>${code.split("").map((k) => RIASEC[k][1].toLowerCase()).join(", ").replace(/, (?=[^,]*$)/, " and ")}</b></div>
  <svg class="v-svg" viewBox="-105 -10 450 260" role="img" aria-label="RIASEC interests">
    ${[0.33, 0.66, 1].map((f) => `<polygon points="${ring(90 * f)}" class="grid"/>`).join("")}
    <polygon points="${keys.map((k, i) => pt(i, 12 + (78 * d.counts[k]) / max).map((v) => v.toFixed(1)).join(",")).join(" ")}" class="now"/>
    ${keys.map((k, i) => { const [x, y] = pt(i, 108); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${x < 110 ? "end" : x > 130 ? "start" : "middle"}" class="lbl ${code.includes(k) ? "strong" : ""}" data-tip="${esc(tipList(`${k} · ${RIASEC[k][0]} (${RIASEC[k][1]})`, d.counts[k], tot, d.examples[k]))}">${k} ${RIASEC[k][0]} <tspan class="num">${pct(d.counts[k], tot)}%</tspan></text>`; }).join("")}
  </svg>`;
}

// McClelland: a ternary plot — the dot leans toward the strongest need.
function ternary(d) {
  if (!d || d.n < 3) return `<div class="v-mind-empty faint">Not enough classified yet.</div>`;
  const V = { achievement: [120, 18], power: [22, 196], affiliation: [218, 196] }, name = { achievement: "Achievement", power: "Power", affiliation: "Affiliation" };
  const tot = sum(d.counts) || 1, top = Object.keys(V).reduce((a, k) => (d.counts[k] > d.counts[a] ? k : a), "achievement");
  const [x, y] = Object.keys(V).reduce(([ax, ay], k) => [ax + (V[k][0] * d.counts[k]) / tot, ay + (V[k][1] * d.counts[k]) / tot], [0, 0]);
  return `<div class="v-mind-lead">Driven most by <b>${name[top]}</b></div>
  <svg class="v-svg" viewBox="-10 -12 260 236" role="img" aria-label="McClelland motives">
    <polygon points="120,18 22,196 218,196" class="q"/>
    ${Object.keys(V).map((k) => `<line x1="${V[k][0]}" y1="${V[k][1]}" x2="120" y2="136.7" class="axis"/>`).join("")}
    ${Object.entries(V).map(([k, [vx, vy]]) => `<text x="${vx}" y="${k === "achievement" ? vy - 6 : vy + 18}" text-anchor="middle" class="lbl ${k === top ? "strong" : ""}" data-tip="${esc(tipList(name[k], d.counts[k], tot, d.examples[k]))}">${name[k]} <tspan class="num">${pct(d.counts[k], tot)}%</tspan></text>`).join("")}
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" class="dot" data-tip="You"/>
  </svg>`;
}

// Schwartz: ten values in their circular order, wedge = share; four higher-order groups around it.
const SCHWARTZ = [["self_direction", "Self-direction"], ["stimulation", "Stimulation"], ["hedonism", "Hedonism"], ["achievement", "Achievement"], ["power", "Power"], ["security", "Security"], ["conformity", "Conformity"], ["tradition", "Tradition"], ["benevolence", "Benevolence"], ["universalism", "Universalism"]];
function schwartz(d) {
  if (!d || d.n < 3) return `<div class="v-mind-empty faint">Not enough classified yet.</div>`;
  const tot = sum(d.counts) || 1, max = Math.max(1, ...SCHWARTZ.map(([k]) => d.counts[k]));
  const top = SCHWARTZ.slice().sort((a, b) => d.counts[b[0]] - d.counts[a[0]]).slice(0, 2);
  const P = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return `${(120 + r * Math.cos(a)).toFixed(1)},${(120 + r * Math.sin(a)).toFixed(1)}`; };
  const groups = [["Openness to change", ["self_direction", "stimulation"]], ["Self-enhancement", ["hedonism", "achievement", "power"]], ["Conservation", ["security", "conformity", "tradition"]], ["Self-transcendence", ["benevolence", "universalism"]]];
  return `<div class="v-mind-lead">Most served: <b>${top.map((x) => x[1]).join("</b> and <b>")}</b></div>
  <div class="v-groups">${groups.map(([g, ks]) => `<span><b>${pct(ks.reduce((a, k) => a + d.counts[k], 0), tot)}%</b> ${g}</span>`).join("")}</div>
  <svg class="v-svg" viewBox="-70 -8 380 256" role="img" aria-label="Schwartz values">
    <circle cx="120" cy="120" r="96" class="grid"/>
    ${SCHWARTZ.map(([k, label], i) => { const a0 = i * 36 + 1, a1 = (i + 1) * 36 - 1, r = 14 + 82 * Math.sqrt(d.counts[k] / max), mid = i * 36 + 18;
      const [lx, ly] = P(mid, 106).split(",").map(Number);
      return `<path d="M120,120 L${P(a0, r)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${P(a1, r)} Z" class="wedge ${top.some((x) => x[0] === k) ? "top" : ""}" data-tip="${esc(tipList(label, d.counts[k], tot, d.examples[k]))}"/>
        <text x="${lx}" y="${ly + 3}" text-anchor="${lx < 115 ? "end" : lx > 125 ? "start" : "middle"}" class="num">${label}</text>`; }).join("")}
  </svg>`;
}

function evidenceBlock(x) {
  const [full, evid] = splitEvidence(x.full || "");
  return `<div class="v-more">${inl(full)}${evid ? `<div class="p-evidence">Evidence · ${inl(evid)}</div>` : ""}${x.seen && x.seen.length ? `<div class="p-evidence">Seen in · ${x.seen.map(esc).join(" · ")}</div>` : ""}</div>`;
}

function shadows(c) {
  const st = c.strengths || [], pats = (c.watchouts || []).filter((w) => !/^blind spot/i.test(w.name));
  const max = Math.max(1, ...st.concat(pats).map((x) => x.n || 0));
  const block = (x, kind) => `<div class="v-sh ${kind} v-exp" tabindex="0"><div class="v-sh-top"><span class="v-name">${esc(x.name)}</span><span class="v-sh-n">${x.n ?? ""}</span></div>
    <div class="v-sh-bar"><span style="width:${(100 * (x.n || 0)) / max}%"></span></div><div class="v-short">${esc(x.short)}</div>${evidenceBlock(x)}<div class="v-hint">Read more</div></div>`;
  const paired = new Set();
  const rows = st.map((s) => {
    const shadow = pats.filter((p) => p.shadow_of === s.name);
    shadow.forEach((p) => paired.add(p.name));
    return `<div class="v-sh-row">${block(s, "ok")}<div class="v-sh-arrow"${shadow[0] && shadow[0].shadow_why ? ` data-tip="${esc(shadow.map((p) => `${p.name}: ${p.shadow_why}`).join("\n"))}"` : ""}>${shadow.length ? "overused →" : ""}</div><div class="v-sh-col">${shadow.map((p) => block(p, "warn")).join("")}</div></div>`;
  });
  const loose = pats.filter((p) => !paired.has(p.name));
  return `<div class="v-sh-head"><span>Strength</span><span></span><span>Shadow pattern</span></div>${rows.join("")}${loose.map((p) => `<div class="v-sh-row"><div></div><div class="v-sh-arrow"></div><div class="v-sh-col">${block(p, "warn")}</div></div>`).join("")}`;
}

// What a profile point is built on, for a tap note: its full text, the evidence, and where it came up (a vertical list).
function youPointNote(name, x, extra = "") {
  const [full, evid] = splitEvidence(x.full || "");
  const seen = (x.seen || []).filter(Boolean);
  return `<p><b>${esc(name)}.</b> ${inl(full || x.short || "")}</p>${extra}${evid ? `<p><span class="mc-label">What shows it</span><br>${inl(evid)}</p>` : ""}${seen.length ? `<p class="mc-label">Where it came up</p><ol class="mc-you-steps">${seen.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}`;
}

// Blind spots: a list (blind-spots.html). The full text, its evidence and a next step are one tap away.
function youBlindSpots(c) {
  const bs = ((c && c.watchouts) || []).filter((w) => w && /^blind spot/i.test(w.name || ""));
  const n = bs.length;
  return MagicCharts.list(bs.map((x) => {
    const name = x.name.replace(/^blind spot:?\s*/i, "");
    return { title: name, text: x.short, note: `${youPointNote(name, x)}<p>It isn't a problem, just a place others may notice before you do. A good next step is to talk it through, or to try one small thing that brings it into your record.</p>${youAsk(`My profile lists a blind spot: “${name}”. What could I do this week to work on it?`)}` };
  }), {
    title: "Blind spots", subtitle: "Read from what your record barely shows, not from a test", marker: "open",
    takeaway: `${numWord(n)} ${n === 1 ? "thing" : "things"} your record barely shows. ${n === 1 ? "It isn't a problem, just a place" : "They aren't problems, just places"} others may notice before you do.`,
    note: "Tap one to see what shows it and what you could do about it.",
    empty: { text: "Blind spots will appear here.", how: "They're written when your profile is refreshed, from what your record rarely touches." },
  });
}

function bridges(c) {
  const tr = c.transition || { shifts: [] };
  const phases = [["ending", "Ending", "Letting go"], ["neutral", "Neutral zone", "In between, exploring"], ["beginning", "New beginning", "Taking hold"]];
  return `<div class="v-bridges">${phases.map(([k, name, sub]) => `<div class="v-br ${tr.phase === k ? "now" : ""}">
      <div class="v-br-head"><b>${name}</b><span>${sub}</span>${tr.phase === k ? `<span class="v-br-here" data-tip="${esc(tr.why || "")}">You are here</span>` : ""}</div>
      ${(tr.shifts || []).filter((x) => x.phase === k).map((x) => expandable(`<div class="v-name">${esc(x.label)}</div>`, x.detail, "v-br-shift")).join("") || `<div class="faint small">—</div>`}
    </div>`).join("")}</div>
    <div class="v-next-line"><span class="p-label">Your next shift</span> ${esc(c.next || "")}</div>
    ${tr.text ? expandable(`<div class="v-hint on">Read the full picture</div>`, tr.text, "v-br-full") : ""}`;
}

// Highlights: a list with weekly bars (highlights.html). Tap: what it is, the activity behind it, where it came up.
function youHighlights(hs) {
  const P = MagicCharts.plural, items = (hs || []).filter((x) => x && x.name);
  const weekName = (k) => (k === 0 ? "this week" : k === 1 ? "last week" : `${numWord(k).toLowerCase()} weeks ago`);
  const activity = (w) => {
    const total = w.reduce((a, b) => a + b, 0);
    if (!total) return `Nothing related has come up in the last ${w.length || 8} weeks. If it still matters to you, a small step this week brings it back into view.`;
    const bits = w.map((v, i) => [v, w.length - 1 - i]).filter(([v]) => v).reverse().map(([v, k]) => `${v} ${weekName(k)}`);
    const first = w.findIndex((v) => v);
    return `In the last ${w.length} weeks, ${P(total, "related activity", "related activities")} came up: ${MagicCharts.joinAnd(bits)}${first > 0 ? ", and none before that" : ""}.`;
  };
  const o = { title: "Highlights", subtitle: "What matters most right now · related activity per week, last 8 weeks", marker: "number",
    weeklyValue: (n) => P(n, "activity", "activities"), weeklyLabel: "this week",
    note: "Tap a highlight to see what it is and the activity behind it.",
    empty: { text: "Your highlights will appear here.", how: "They're picked when your profile is refreshed, from the work that matters most to you right now." } };
  if (items.length) {
    const lastOf = (x) => { const w = x.weeks || []; return w.length ? w[w.length - 1] : 0; }, sumOf = (x) => (x.weeks || []).reduce((a, b) => a + b, 0);
    const top = items.reduce((a, x) => (lastOf(x) > lastOf(a) ? x : a), items[0]), quiet = items.filter((x) => !sumOf(x));
    const lead = lastOf(top) ? `<b>${esc(top.name)}</b> had the most related activity this week, with ${P(lastOf(top), "activity", "activities")}.`
      : (() => { const t = items.reduce((a, x) => (sumOf(x) > sumOf(a) ? x : a), items[0]); return sumOf(t) ? `Nothing came up this week; over the last 8 weeks, <b>${esc(t.name)}</b> had the most related activity.` : "None of these has come up in the last 8 weeks."; })();
    o.takeaway = lead + (quiet.length && quiet.length < items.length ? (quiet.length === 1 ? ` ${esc(quiet[0].name)} hasn't come up lately.` : ` ${numWord(quiet.length)} of them haven't come up lately.`) : "");
  }
  return MagicCharts.list(items.map((x) => ({ title: x.name, text: x.short, weekly: x.weeks && x.weeks.length ? x.weeks : null,
    note: `${youPointNote(x.name, x, `<p>${esc(activity(x.weeks || []))}</p>`)}${youAsk(`Tell me more about my highlight “${x.name}”: what in my record shows it, and how I could build on it.`)}` })), o);
}

// Depth of knowledge: stacked levels per area (depth-of-knowledge.html). It also carries what
// "Where your mind goes" showed (activities per area, last active, a link to the area) in the tap.
function youDepth(areas) {
  const P = MagicCharts.plural, say = ["read once", "explored", "understood", "applied", "fluent"];
  const rows = (areas || []).map((a) => ({ a, counts: LEVELS.map((l) => (a.levels || {})[l] || 0) })).map((r) => ({ ...r, total: r.counts.reduce((x, y) => x + y, 0) })).filter((r) => r.total).sort((x, y) => y.total - x.total);
  const deepOf = (r) => Math.round((100 * (r.counts[2] + r.counts[3] + r.counts[4])) / r.total);
  const o = { title: "Depth of knowledge", subtitle: "Ideas in each area, by how well you know them",
    info: `Every idea Magic records sits at one of five levels:\n${LEVELS.map((l) => `${LEVEL[l]}: ${LEVEL_SAY[l]}.`).join("\n")}\n\n“Deep” means understood, applied or fluent. Each bar is as long as the number of ideas in that area. Tap a level in the key to see how it's earned.`,
    levelNotes: LEVELS.map((l) => `${LEVEL[l]}: ${LEVEL_RULE[l]}`),
    empty: { text: "Your areas will appear here, with how well you know the ideas in each.", how: "Read, ask or talk about something, and Magic files the ideas into areas." } };
  if (rows.length) {
    const all = rows.reduce((a, r) => a + r.total, 0), [t1, t2] = rows;
    if (!t2) o.takeaway = `Everything you know so far is in <b>${esc(t1.a.name)}</b>, and you understand ${deepOf(t1)}% of its ideas or better.`;
    else {
      const big = rows.filter((r) => r.total >= all * 0.1), deep = big.reduce((a, r) => (deepOf(r) > deepOf(a) ? r : a), big[0]);
      o.takeaway = `${(t1.total + t2.total) / all > 0.5 ? "Most" : "The biggest share"} of what you know is in <b>${esc(t1.a.name)} and ${esc(t2.a.name)}</b>. ${big.length > 1 ? `${esc(deep.a.name)} is where you go deepest of your big areas: you understand ${deepOf(deep)}% of its ideas or better.` : `You understand ${deepOf(t1)}% of ${esc(t1.a.name)}'s ideas or better.`}`;
    }
  }
  return MagicCharts.stackedLevels(rows.map((r) => {
    const { a, counts: n, total } = r, bits = n.map((c, i) => (c ? `${c} ${say[i]}` : null)).filter(Boolean);
    const next = deepOf(r) < 20 ? "Most of it is still read or explored. Explaining one idea in your own words is the quickest way to take it deeper."
      : !n[3] && !n[4] ? "You understand ideas here but haven't used them in real work yet; one small project would move them to applied."
      : "You go deep here. Using and explaining the same ideas again is what makes them fluent.";
    return { name: a.name, counts: n, note: `<p><b>${esc(a.name)}: ${P(total, "idea")}.</b> ${cap1(MagicCharts.joinAnd(bits))}. That's ${deepOf(r)}% understood or better.</p>
      <p>You've spent ${P(a.episodes || 0, "activity", "activities")} here${a.last ? `, most recently ${ago(a.last)}` : ""}. ${next}</p>${a.id ? `<a href="#/k/${esc(a.id)}">Open ${esc(a.name)}</a>` : ""}` };
  }), o);
}

// When you learn: a heat grid of weekday × hour (when-you-learn.html). The API counts days from Sunday; the chart from Monday.
function youWhen(cells, totals) {
  const P = MagicCharts.plural, hr = MagicCharts.hourName, FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const data = (cells || []).map(([d, h, n]) => ({ day: (d + 6) % 7, hour: h, value: n }));
  const span = Math.max(1, Math.min(60, (totals && totals.span_days) || 60)), over = span < 60 ? `in the ${P(span, "day")} Magic has been recording` : "over the last 60 days";
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  data.forEach((c) => (grid[c.day][c.hour] += c.value));
  const vals = grid.flat().filter(Boolean).sort((a, b) => b - a), busy = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.1))] : Infinity;
  const o = { title: "When you learn", subtitle: `How many minutes you were learning at each hour of the week, ${over}`,
    info: "Each square is one hour of one weekday. Its colour shows how many minutes in that hour Magic recorded you reading, asking or talking, added up over the last 60 days; darker means more. Times are in your own time zone.",
    empty: { text: "Your learning hours will appear here.", how: "Once Magic has recorded a few days of reading, asking or talking, the hours you were active fill in." },
    detail: (d, h, n) => {
      const when = `${FULL[d]}, ${hr(h)} to ${hr(h + 1)}`;
      if (!n) return `${when}: no learning recorded ${over}.`;
      const wk = Math.round(n / (span / 7));
      return `${when}: ${P(n, "minute")} of learning ${over}${span >= 14 && wk >= 1 ? `, about ${P(wk, "minute")} a week` : ""}.${n >= busy ? " This is one of your busiest hours, so it's a good slot for the bigger next step." : ""}`;
    } };
  if (vals.length) {
    const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0)), byDay = grid.map((row) => row.reduce((a, b) => a + b, 0));
    const win = (h) => byHour[h] + byHour[(h + 1) % 24] + byHour[(h + 2) % 24];
    let best = 0; for (let h = 1; h < 24; h++) if (win(h) > win(best)) best = h;
    const day = byDay.indexOf(Math.max(...byDay));
    let pd = 0, ph = 0; grid.forEach((row, d) => row.forEach((n, h) => { if (n > grid[pd][ph]) { pd = d; ph = h; } }));
    o.takeaway = `You learn most <b>between ${hr(best)} and ${hr(best + 3)}</b>, and most on ${FULL[day]}s. Your single busiest hour is ${FULL[pd]} ${hr(ph)} to ${hr(ph + 1)}, so that's a good time for the bigger next step.`;
  }
  return MagicCharts.heatGrid(data, o);
}

// One tooltip for every chart mark.
function bindTips(root) {
  if (matchMedia("(hover: none)").matches) return;
  let tip = $("#vtip");
  if (!tip) { tip = document.createElement("div"); tip.id = "vtip"; tip.className = "v-tip hidden"; document.body.appendChild(tip); }
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.onmouseenter = () => { tip.textContent = el.dataset.tip; tip.classList.remove("hidden"); };
    el.onmousemove = (e) => { tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 12, e.clientX + 14)}px`; tip.style.top = `${e.clientY + 16}px`; };
    el.onmouseleave = () => tip.classList.add("hidden");
  });
}

async function buildProfile(e) {
  e.target.disabled = true;
  e.target.innerHTML = `<span class="spinner"></span> Writing…`;
  try { await api("/api/profile", { method: "POST" }); } catch (err) { toast(err.message); }
  route();
}

// Right: talk with your profile.
async function renderProfileRight() {
  right.innerHTML = `
    <div class="r-head"><div><div class="faint">Chat</div><b>Talk with your profile</b></div></div>
    <div class="r-sum"><div class="faint small">Ask about yourself, or correct anything that's off — Magic keeps what you say and it shapes the next refresh.</div>
      <div class="prompts" id="prompts">${["Is this accurate?", "What's my biggest blind spot right now?", "How do I come across to people?", "Which strengths should I build on?", "What's changed about me lately?"].map((q) => `<button data-p="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>
    <div class="r-scroll" id="rscroll" tabindex="0" role="region" aria-label="Conversation"><div class="chat" id="chat"></div></div>
    <div class="r-input">
      <textarea class="text" id="chatbox" rows="2" placeholder="Ask about yourself, or tell Magic what it got wrong…"></textarea>
    </div>`;
  $("#chatbox").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendProfile(); } };
  $("#prompts").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { $("#chatbox").value = b.dataset.p; sendProfile(); }));
  const h = await api("/api/discuss/thread?doc=profile&type=profile").catch(() => []);
  $("#chat").innerHTML = h.slice(-20).map((m) => `<div class="msg ${m.role === "user" ? "user" : "magic"}">${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("");
  $("#rscroll").scrollTop = 1e9;
}

async function sendProfile() {
  const box = $("#chatbox");
  const text = box.value.trim();
  if (!text) return;
  box.value = "";
  $("#chat").insertAdjacentHTML("beforeend", `<div class="msg user">${esc(text)}</div><div class="msg magic" id="pending"><span class="spinner"></span></div>`);
  $("#rscroll").scrollTop = 1e9;
  try {
    const r = await api("/api/profile/chat", { method: "POST", body: { message: text } });
    $("#pending").outerHTML = `<div class="msg magic">${md(r.reply)}</div>`;
  } catch (e) {
    clearTimeout(said);
    const p = $("#pending");
    if (p) { p.textContent = `Couldn't answer just now (${e.message}). Your question is kept; try again in a moment.`; p.classList.remove("pending"); p.classList.add("error"); p.removeAttribute("id"); }
  }
}

// ---------- Settings ----------
async function pageSettings() {
  const [st, settings, rules] = await Promise.all([api("/api/status"), api("/api/settings"), api("/api/rules")]);
  const recent = await api("/api/events/recent");
  const lastOf = (app) => recent.find((e) => e.app === app)?.ts;
  const sensor = (name, ts, help) => `<div class="item" style="cursor:default"><div><span class="title" style="font-weight:450">${name}</span></div><div class="side">${ts ? `last signal ${ago(ts)}` : `<span class="chip warn">no signal yet</span>`}</div>${!ts && help ? `<div class="sub">${help}</div>` : ""}</div>`;
  main.innerHTML = `<div class="page">${recordTabs("settings")}
    <h1>Recording &amp; privacy</h1>
    <h2>Recording</h2>
    <div class="row spread"><span>${st.paused ? "Paused" : "Recording"}</span><button class="btn" id="pause">${st.paused ? "Resume" : "Pause"}</button></div>
    <div class="list" style="margin-top:10px">
      ${sensor("Screen — every app", lastOf("screen"), "Turn on <b>magic-sensor</b> in System Settings → Privacy & Security → Screen & System Audio Recording.")}
      ${sensor("Chrome extension", lastOf("chrome"), "Reload any tab that was open before you installed it.")}
      <div class="item" style="cursor:default"><div>Local models</div><div class="side">${["brain", "fast", "embed"].map((m) => `${m} ${st.models[m] ? "✓" : "…"}`).join(" · ")}</div></div>
    </div>
    <h2>Never record</h2>
    <textarea class="text" id="never" rows="3">${esc(settings.never_record.join("\n"))}</textarea>
    <button class="btn" id="savenever" style="margin-top:6px">Save</button>
    <h2>What Magic has learned from you</h2>
    <div class="list">${(rules.rules || []).map((r) => `<div class="item" style="cursor:default" data-rule="${r.id}">
        <div><span class="title" style="font-weight:450;${r.active ? "" : "text-decoration:line-through;color:var(--faint)"}">${esc(r.rule)}</span></div>
        <div class="side">${r.hits ? `used ${r.hits}×` : ""}<button class="link" data-toggle-rule="${r.active ? 0 : 1}">${r.active ? "Turn off" : "Turn on"}</button><button class="link" data-del-rule>Delete</button></div>
      </div>`).join("") || `<div class="empty">Tell Magic in the chat what to keep or skip — e.g. “don't record shopping sites”.</div>`}</div>
    <h2>Who you are becoming</h2>
    <div class="muted">Your profile is your home page now. <a class="link" href="#/me">Open your profile →</a></div>
  </div>`;
  $("#pause").onclick = async () => { await api("/api/settings", { method: "POST", body: { paused: !st.paused } }); route(); };
  $("#savenever").onclick = async () => { await api("/api/settings", { method: "POST", body: { never_record: $("#never").value.split("\n").map((x) => x.trim()).filter(Boolean) } }); toast("Saved."); };
  main.querySelectorAll("[data-rule]").forEach((row) => {
    $("[data-toggle-rule]", row).onclick = async (e) => { await api(`/api/rules/${row.dataset.rule}`, { method: "POST", body: { active: e.target.dataset.toggleRule === "1" } }); route(); };
    $("[data-del-rule]", row).onclick = async () => { await api(`/api/rules/${row.dataset.rule}`, { method: "DELETE" }); route(); };
  });
  setContext("overview", { type: "doc" }, "Everything recorded");
  const today = await api("/api/today");
  renderRight({ kind: "day", date: dayStr(), synthesis: today.synthesis });
}

// ---------- Recording indicator + live refresh ----------
async function heartbeat() {
  try {
    const s = await api("/api/status");
    $("#rec").classList.toggle("on", !s.paused);
    if (S.page === "activity" && !document.querySelector("textarea:focus, input:focus") && s.counts.last_event !== S.lastEvent) {
      if (S.lastEvent !== undefined) route();
      S.lastEvent = s.counts.last_event;
    }
  } catch (_) { $("#rec").classList.remove("on"); }
}
setInterval(heartbeat, 20000);
heartbeat();
route();
setTimeout(placeFab, 0);

// The menu and the chat fold away, like a sidebar: one button each, remembered between visits.
(() => {
  const icon = (side) => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M${side === "l" ? 7.5 : 12.5} 3.5v13"/></svg>`;
  const set = (cls, on) => { document.body.classList.toggle(cls, on); store.set(cls, on); };
  [["nl", "l", "menu"], ["nr", "r", "chat"]].forEach(([cls, side, what]) => {
    const b = document.createElement("button");
    b.className = `pane-tg pane-tg-${side}`;
    b.innerHTML = icon(side);
    const label = () => (b.title = b.ariaLabel = `${document.body.classList.contains(cls) ? "Show" : "Hide"} the ${what}`);
    b.onclick = () => { set(cls, !document.body.classList.contains(cls)); label(); };
    document.body.appendChild(b);
    if (store.get(cls)) document.body.classList.add(cls);
    label();
  });
})();

// On a phone the menu folds behind one button instead of filling the top of the screen.
(() => {
  const b = document.createElement("button");
  b.className = "menu-btn"; b.textContent = "Menu"; b.setAttribute("aria-expanded", "false");
  b.onclick = () => { const on = document.body.classList.toggle("menu-open"); b.setAttribute("aria-expanded", String(on)); };
  document.querySelector(".brand")?.appendChild(b);
  addEventListener("hashchange", () => { document.body.classList.remove("menu-open"); b.setAttribute("aria-expanded", "false"); });
})();
