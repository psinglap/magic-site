// Saves a demo or early-access sign-up. Stored privately in Vercel Blob when a store is connected; always logged.
const { put } = require("@vercel/blob");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const clip = (s, n) => String(s || "").slice(0, n);
  const row = {
    name: clip(b.name, 120), email: clip(b.email, 200).toLowerCase(), goal: clip(b.goal, 600),
    kind: b.kind === "own" ? "own" : "demo", ref: clip(b.ref, 300), at: new Date().toISOString(),
    country: req.headers["x-vercel-ip-country"] || "",
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return res.status(400).json({ error: "That email doesn't look right." });
  console.log("signup", JSON.stringify(row));
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try { await put(`signups/${row.at}-${row.kind}.json`, JSON.stringify(row), { access: "private", addRandomSuffix: true, contentType: "application/json" }); }
    catch (e) { console.error("blob save failed", e.message); }
  }
  res.status(200).json({ ok: true });
};
