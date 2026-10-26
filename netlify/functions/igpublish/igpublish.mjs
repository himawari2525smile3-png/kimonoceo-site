// Instagramに横スライド（カルーセル）を直接投稿する（Instagram API with Instagram Login。Facebookページ不要）。2026-10-26追加
// 呼び出し：POST /ig/publish  ヘッダー x-key: <環境変数 IG_PUBLISH_KEY>
//   本文 JSON: { "images": ["https://kimonoceo.com/ig/slide.jpg?d=...", ...(2〜10枚)], "caption": "...", "dry": true|false }
//   dry=true なら、投稿の準備（コンテナ作成）までで止め、公開しない（確認用）
// 必要な環境変数（Netlify）：IG_TOKEN（長期アクセストークン）、IG_PUBLISH_KEY（呼び出し用の合言葉）
// トークンは60日で切れるため、igrefresh（週1回）が更新して Netlify Blobs に保存する。保存済みがあればそちらを優先
import { getStore } from "@netlify/blobs";

const API = "https://graph.instagram.com/v23.0";
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export async function getToken() {
  try {
    const t = await getStore("instagram").get("token");
    if (t) return t;
  } catch (e) {}
  return process.env.IG_TOKEN || "";
}

async function call(method, path, params, token) {
  const u = new URL(API + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "GET" ? await fetch(u + "?" + body) : await fetch(u, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ("HTTP " + res.status));
  return data;
}

async function waitReady(id, token) {
  for (let i = 0; i < 20; i++) {
    const s = await call("GET", "/" + id, { fields: "status_code" }, token);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("container " + id + " " + s.status_code);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("container " + id + " not ready");
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = process.env.IG_PUBLISH_KEY;
  if (!key || req.headers.get("x-key") !== key) return json({ error: "forbidden" }, 403);
  const token = await getToken();
  if (!token) return json({ error: "IG_TOKEN is not set" }, 500);
  let p;
  try { p = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const images = Array.isArray(p.images) ? p.images.filter((x) => /^https:\/\//.test(x)) : [];
  if (images.length < 1 || images.length > 10) return json({ error: "images must be 1-10 https URLs" }, 400);
  const caption = String(p.caption || "").slice(0, 2200);
  try {
    const me = await call("GET", "/me", { fields: "user_id,username" }, token);
    const uid = me.user_id || me.id;
    let creation;
    if (images.length === 1) {
      creation = (await call("POST", `/${uid}/media`, { image_url: images[0], caption }, token)).id;
    } else {
      const children = [];
      for (const url of images) children.push((await call("POST", `/${uid}/media`, { image_url: url, is_carousel_item: "true" }, token)).id);
      for (const c of children) await waitReady(c, token);
      creation = (await call("POST", `/${uid}/media`, { media_type: "CAROUSEL", children: children.join(","), caption }, token)).id;
    }
    await waitReady(creation, token);
    if (p.dry) return json({ ok: true, dry: true, username: me.username, creation_id: creation });
    const pub = await call("POST", `/${uid}/media_publish`, { creation_id: creation }, token);
    const info = await call("GET", "/" + pub.id, { fields: "permalink" }, token).catch(() => ({}));
    return json({ ok: true, id: pub.id, permalink: info.permalink || null });
  } catch (e) {
    return json({ ok: false, error: e.message }, 502);
  }
};

export const config = { path: "/ig/publish" };
