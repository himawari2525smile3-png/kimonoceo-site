// Instagramの長期アクセストークン（60日で失効）を週1回更新し、Netlify Blobs に保存する。2026-10-26追加
// 最初は環境変数 IG_TOKEN を使い、以降は保存済みのトークンを更新し続ける
import { getStore } from "@netlify/blobs";
import { getToken } from "../igpublish/igpublish.mjs";

export default async () => {
  const token = await getToken();
  if (!token) return new Response("no token", { status: 200 });
  const u = "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token);
  const res = await fetch(u);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.log("igrefresh failed", res.status, data.error && data.error.message);
    return new Response("refresh failed", { status: 200 });
  }
  await getStore("instagram").set("token", data.access_token);
  await getStore("instagram").set("refreshed_at", new Date().toISOString());
  console.log("igrefresh ok, expires_in", data.expires_in);
  return new Response("ok");
};

export const config = { schedule: "@weekly" };
