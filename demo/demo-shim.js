// Live demo: every /api read is served from a snapshot of the founder's real Magic. Writes and chat are off.
(function () {
  let user = null;
  try { user = JSON.parse(localStorage.getItem("magic-demo-user") || "null"); } catch (_) {}
  if (!user && !/[?&]open\b/.test(location.search)) { location.replace("/try?next=demo"); return; }
  window.__DEMO_USER = user;
  const real = window.fetch.bind(window);
  const reply = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  window.fetch = function (input, opts = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const i = url.pathname.indexOf("/api/");
    if (i < 0 || url.pathname.startsWith("/api/signup")) return real(input, opts);
    const key = url.pathname.slice(i) + url.search;
    if ((opts.method || "GET").toUpperCase() !== "GET")
      return reply(403, { error: "Chat and edits are off in the live demo. Get your own Magic to talk to it about your own work." });
    if (key in window.__DEMO) return reply(200, window.__DEMO[key]);
    const bare = url.pathname.slice(i);
    if (bare in window.__DEMO) return reply(200, window.__DEMO[bare]);
    return reply(404, { error: "This part isn't in the live demo." });
  };
  document.addEventListener("DOMContentLoaded", () => {
    const first = user && user.name ? user.name.split(" ")[0] : "";
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = `<span><b>${first ? first + ", you're" : "You're"} inside the founder's real Magic.</b> Three weeks of Pallavi's own reading, building and calls, analysed on her laptop.</span>
      <span class="demo-bar-links"><a href="/">About Magic</a><a class="demo-bar-cta" href="/try?own=1">Get your own Magic</a></span>`;
    document.body.prepend(bar);
  });
})();
