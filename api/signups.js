// Lists sign-ups for the founder: GET /api/signups?key=<ADMIN_KEY>
const { list, get } = require("@vercel/blob");

module.exports = async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Not allowed." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(200).json({ rows: [], note: "No Blob store connected yet; sign-ups are in the function logs." });
  const rows = [];
  let cursor;
  do {
    const page = await list({ prefix: "signups/", cursor, limit: 1000 });
    for (const b of page.blobs) {
      try { const r = await get(b.pathname, { access: "private" }); if (r && r.statusCode === 200) rows.push(JSON.parse(await new Response(r.stream).text())); } catch (_) {}
    }
    cursor = page.cursor;
  } while (cursor);
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  res.status(200).json({ count: rows.length, rows });
};
