// Recipe Press API — runs as a Cloudflare Pages Function.
// Bindings (set in the Cloudflare dashboard):
//   DB        D1 database (run schema.sql once)
//   EDIT_KEY  secret passphrase that unlocks editing
//
// Routes
//   GET    /api/session              200 if the passphrase is valid
//   GET    /api/recipes              public list
//   PUT    /api/recipes/:id          editor
//   DELETE /api/recipes/:id          editor
//   GET    /api/cookbooks            editor
//   PUT    /api/cookbooks/:id        editor
//   DELETE /api/cookbooks/:id        editor
//   POST   /api/photos               editor, body = image bytes
//   GET    /api/photos/:id           public

const COLLECTIONS = new Set(["recipes", "cookbooks"]);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_PHOTO = 1_500_000;
const MAX_DOC = 400_000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function isEditor(request, env) {
  const key = env.EDIT_KEY || "";
  if (key.length < 8) return false;
  const h = request.headers.get("authorization") || "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function photoIdOf(env, recipeId) {
  const row = await env.DB.prepare("SELECT data FROM recipes WHERE id = ?").bind(recipeId).first();
  if (!row) return null;
  try { return JSON.parse(row.data).photoId || null; } catch { return null; }
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not connected. Add a D1 binding named DB." }, 500);
  const [col, rawId, extra] = params.path || [];
  const id = rawId ? decodeURIComponent(rawId) : undefined;
  const method = request.method;
  const editor = isEditor(request, env);

  if (extra !== undefined) return json({ error: "Not found" }, 404);

  if (col === "session") return editor ? json({ ok: true }) : json({ error: "unauthorized" }, 401);

  if (COLLECTIONS.has(col)) {
    if (col === "cookbooks" && !editor) return json({ error: "unauthorized" }, 401);

    if (method === "GET" && !id) {
      const { results } = await env.DB.prepare(`SELECT id, data FROM ${col} ORDER BY updated_at DESC`).all();
      return json(results.map(r => ({ id: r.id, ...JSON.parse(r.data) })));
    }
    if (!editor) return json({ error: "unauthorized" }, 401);
    if (!id || !ID_RE.test(id)) return json({ error: "Invalid id" }, 400);

    if (method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_DOC) return json({ error: "Too large" }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Expected an object" }, 400);
      delete body.id;
      if (col === "recipes") {
        const oldPhoto = await photoIdOf(env, id);
        if (oldPhoto && oldPhoto !== body.photoId) await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(oldPhoto).run();
      }
      await env.DB.prepare(
        `INSERT INTO ${col} (id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).bind(id, JSON.stringify(body), new Date().toISOString()).run();
      return json({ ok: true });
    }

    if (method === "DELETE") {
      if (col === "recipes") {
        const oldPhoto = await photoIdOf(env, id);
        if (oldPhoto) await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(oldPhoto).run();
      }
      await env.DB.prepare(`DELETE FROM ${col} WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (col === "photos") {
    if (method === "GET" && id) {
      if (!ID_RE.test(id)) return json({ error: "Invalid id" }, 400);
      const row = await env.DB.prepare("SELECT mime, b64 FROM photos WHERE id = ?").bind(id).first();
      if (!row) return new Response("Not found", { status: 404 });
      return new Response(fromBase64(row.b64), {
        headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" },
      });
    }
    if (method === "POST" && !id) {
      if (!editor) return json({ error: "unauthorized" }, 401);
      const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) return json({ error: "Unsupported image type" }, 415);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.length) return json({ error: "Empty file" }, 400);
      if (bytes.length > MAX_PHOTO) return json({ error: "Too large" }, 413);
      const pid = crypto.randomUUID().replace(/-/g, "");
      await env.DB.prepare("INSERT INTO photos (id, mime, b64, created_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(pid, mime, toBase64(bytes), new Date().toISOString()).run();
      return json({ id: pid, url: "/api/photos/" + pid });
    }
    return json({ error: "Method not allowed" }, 405);
  }

  return json({ error: "Not found" }, 404);
}
