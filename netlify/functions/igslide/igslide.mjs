// Instagram横スライド（カルーセル）の画像を、URLのパラメーターから作る。
// 例：/ig/slide.jpg?d=<base64url JSON>
// JSON: { k:"cover|point|list|steps|scene|end", e:"シリーズ名", t:"見出し", s:"補足", b:["箇条書き"...], n:"2/7", p:"hero|seiza|none"（表紙の写真。省略時 hero） }
// 2026-10-26 改修：文節で改行（BudouX）／本文の文字を大きく／表紙に本人写真／締めの箇条書きを指定可能に
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import { loadDefaultJapaneseParser } from "budoux";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function loadFile(name) {
  const cands = [join(here, "fonts", name), join(process.cwd(), "netlify/functions/igslide/fonts", name)];
  for (const p of cands) { try { return readFileSync(p); } catch (e) {} }
  throw new Error("file not found: " + name);
}
const SERIF = loadFile("serif.otf");
const SANS = loadFile("sans.otf");
const jpgData = (name) => "data:image/jpeg;base64," + loadFile(name).toString("base64");
const GOLD_LEAF = jpgData("goldleaf.jpg");
const PHOTOS = { hero: { src: jpgData("photo-hero.jpg"), pos: "50% 20%" }, seiza: { src: jpgData("photo-seiza.jpg"), pos: "50% 35%" } };
let EXTRA = null; // 第2水準の漢字など、まれな文字のための予備（必要な時だけ読む）
const parser = loadDefaultJapaneseParser();

const W = 1080, H = 1350;
const NAVY = "#0F1B3D", GOLD = "#C9A227", GOLD_L = "#E8C766", INK = "#F4F1E8", MUTED = "#C3C8D6";

const h = (type, style, children) => ({ type, props: { style, children } });
function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; }

// 文節ごとに区切り、文節の途中では改行しない。行末に1〜2文字だけ残る「泣き別れ」も防ぐ
function chunks(text) {
  const parts = parser.parse(String(text || ""));
  const out = [];
  for (const p of parts) {
    // 句読点・閉じ括弧・小さい文字だけの断片は前の文節に付ける
    if (out.length && (/^[、。，．・」』）)！？!?ー〜]+$/.test(p) || p.length <= 1)) out[out.length - 1] += p;
    else out.push(p);
  }
  return out;
}
function wrap(text, style) {
  const lh = style.lineHeight || 1.5;
  return h("div", { display: "flex", flexWrap: "wrap", width: "100%", ...style }, chunks(text).map((c) =>
    h("div", { display: "flex", flexShrink: 0, whiteSpace: "nowrap", lineHeight: lh }, c)));
}

function frame(d, inner, photo) {
  const top = h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }, [
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 32, color: GOLD_L, letterSpacing: 2 }, clip(d.e, 24)),
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 32, color: MUTED }, clip(d.n, 8)),
  ]);
  const foot = h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderTop: `2px solid ${GOLD}`, paddingTop: 26 }, [
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 30, color: photo ? INK : MUTED }, "AI時代の経営者専属顧問　飯村 惇"),
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 30, color: GOLD_L }, d.k === "end" ? "@kimonoceo" : "スワイプ →"),
  ]);
  const content = h("div", {
    display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%",
    border: `2px solid ${GOLD}`, padding: "50px 56px 42px 56px",
  }, [top, h("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: photo ? "flex-start" : "center", paddingTop: photo ? 36 : 0, width: "100%" }, inner), foot]);
  const PW = W - 56, PH = H - 56; // 紺の面の大きさ
  const layers = [];
  if (photo) {
    const PHOTO_H = 600; // 写真は下側に置き、上の文字の面は紺のまま残す（2026-10-26 顔に文字が重ならないよう 760→600）
    layers.push({ type: "img", props: { src: photo.src, width: PW, height: PHOTO_H, style: { position: "absolute", left: 0, top: PH - PHOTO_H, width: PW, height: PHOTO_H, objectFit: "cover", objectPosition: photo.pos } } });
    layers.push(h("div", { position: "absolute", left: 0, top: PH - PHOTO_H - 2, width: PW, height: 170, display: "flex", backgroundImage: `linear-gradient(to bottom, ${NAVY} 0%, rgba(15,27,61,0.6) 45%, rgba(15,27,61,0) 100%)` }, []));
    layers.push(h("div", { position: "absolute", left: 0, top: PH - 220, width: PW, height: 220, display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(15,27,61,0) 0%, rgba(15,27,61,0.9) 70%)" }, []));
  }
  layers.push(h("div", { position: "absolute", left: 0, top: 0, width: PW, height: PH, display: "flex", padding: 14 }, [content]));
  return h("div", { width: W, height: H, display: "flex", position: "relative" }, [
    { type: "img", props: { src: GOLD_LEAF, width: W, height: H, style: { position: "absolute", left: 0, top: 0, width: W, height: H } } },
    h("div", { position: "absolute", left: 28, top: 28, width: PW, height: PH, display: "flex", backgroundColor: NAVY }, layers),
  ]);
}

const title = (t, size) => wrap(t, { fontFamily: "Serif", fontSize: size, color: INK, lineHeight: 1.38, letterSpacing: 1 });
const sub = (t, size = 42) => wrap(t, { fontFamily: "Sans", fontSize: size, color: MUTED, lineHeight: 1.65, marginTop: 34 });
const rule = h("div", { display: "flex", width: 96, height: 4, backgroundColor: GOLD, marginBottom: 40 }, []);
const norm = (s) => String(s || "").replace(/[\s□・、。]/g, "");

function items(list, kind) {
  return h("div", { display: "flex", flexDirection: "column", marginTop: 50, width: "100%" }, list.map((x, i) =>
    h("div", { display: "flex", alignItems: "flex-start", marginBottom: 40, width: "100%" }, [
      kind === "check"
        ? h("div", { display: "flex", width: 46, height: 46, flexShrink: 0, border: `3px solid ${GOLD}`, marginRight: 30, marginTop: 12 }, [])
        : h("div", { display: "flex", justifyContent: "center", alignItems: "center", width: 68, height: 68, flexShrink: 0, borderRadius: kind === "steps" ? 34 : 4, backgroundColor: kind === "steps" ? GOLD : "transparent", border: `2px solid ${GOLD}`, color: kind === "steps" ? NAVY : GOLD_L, fontFamily: "Serif", fontSize: 36, marginRight: 30 }, String(i + 1)),
      h("div", { display: "flex", flex: 1 }, [wrap(x, { fontFamily: "Sans", fontSize: 48, color: INK, lineHeight: 1.5 })]),
    ])
  ));
}

function body(d) {
  const b = (Array.isArray(d.b) ? d.b : []).slice(0, 5).map((x) => clip(String(x).replace(/^\s*[□☐■・\-]\s*/, ""), 44));
  switch (d.k) {
    case "cover":
      return [rule, title(clip(d.t, 40), 74), d.s ? sub(clip(d.s, 50), 34) : null].filter(Boolean);
    case "list":
    case "steps":
      return [rule, title(clip(d.t, 34), 72), items(b, d.k), d.s ? sub(clip(d.s, 60)) : null].filter(Boolean);
    case "scene":
      return [
        rule,
        h("div", { display: "flex", fontFamily: "Sans", fontSize: 36, color: GOLD_L, marginBottom: 28 }, clip(d.t, 30)),
        h("div", { display: "flex", borderLeft: `6px solid ${GOLD}`, paddingLeft: 40, width: "100%" }, [wrap(clip(d.s, 90), { fontFamily: "Serif", fontSize: 60, color: INK, lineHeight: 1.6 })]),
        b.length ? sub(b.join(""), 40) : null,
      ].filter(Boolean);
    case "end": {
      const defaults = ["保存して、来週もう一度読む", "右腕・幹部にシェアする", "プロフィールから無料の診断へ"];
      const list = (b.length ? b : defaults).filter((x) => norm(x) !== norm(d.t)).slice(0, 4);
      return [rule, title(clip(d.t, 40), 72), d.s ? sub(clip(d.s, 80)) : null, items(list, "check")].filter(Boolean);
    }
    default: // point
      return [rule, title(clip(d.t, 44), 76), d.s ? sub(clip(d.s, 120), 44) : null].filter(Boolean);
  }
}

function decode(q) {
  const raw = String(q || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw + "===".slice((raw.length + 3) % 4);
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
}

export async function render(d) {
  const photo = d.k === "cover" && d.p !== "none" ? PHOTOS[d.p] || PHOTOS.hero : null;
  const svg = await satori(frame(d, body(d), photo), {
    width: W, height: H,
    fonts: [
      { name: "Serif", data: SERIF, weight: 700, style: "normal" },
      { name: "Sans", data: SANS, weight: 400, style: "normal" },
    ],
    loadAdditionalAsset: async (code, segment) => {
      if (code === "emoji") return segment;
      if (!EXTRA) EXTRA = loadFile("extra.otf");
      return [{ name: "Extra", data: EXTRA, weight: 700, style: "normal" }];
    },
  });
  const img = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render();
  // InstagramのAPIはJPEGだけを受け付けるため、JPEGで返す
  return jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, 90).data;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const d = decode(url.searchParams.get("d"));
    const out = await render(d);
    return new Response(out, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
  } catch (e) {
    return new Response("bad request: " + e.message, { status: 400 });
  }
};

export const config = { path: "/ig/slide.jpg" };
