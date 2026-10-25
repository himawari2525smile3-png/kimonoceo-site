// Instagram横スライド（カルーセル）の画像を、URLのパラメーターから作る。
// 例：/ig/slide.jpg?d=<base64url JSON>
// JSON: { k:"cover|point|list|steps|scene|end", e:"シリーズ名", t:"見出し", s:"補足", b:["箇条書き"...], n:"2/7" }
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function loadFont(name) {
  const cands = [join(here, "fonts", name), join(process.cwd(), "netlify/functions/igslide/fonts", name)];
  for (const p of cands) { try { return readFileSync(p); } catch (e) {} }
  throw new Error("font not found: " + name);
}
const SERIF = loadFont("serif.otf");
const SANS = loadFont("sans.otf");
let EXTRA = null; // 第2水準の漢字など、まれな文字のための予備（必要な時だけ読む）

const W = 1080, H = 1350;
const NAVY = "#0F1B3D", GOLD = "#C9A227", GOLD_L = "#E8C766", INK = "#F4F1E8", MUTED = "#AEB4C6";

const h = (type, style, children) => ({ type, props: { style, children } });

function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; }

function frame(d, inner) {
  const top = h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }, [
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 30, color: GOLD_L, letterSpacing: 2 }, clip(d.e, 24)),
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 30, color: MUTED }, clip(d.n, 8)),
  ]);
  const foot = h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderTop: `2px solid ${GOLD}`, paddingTop: 28 }, [
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 28, color: MUTED }, "AI時代の経営者専属顧問　飯村 惇"),
    h("div", { display: "flex", fontFamily: "Sans", fontSize: 28, color: GOLD_L }, d.k === "end" ? "@kimonoceo" : "スワイプ →"),
  ]);
  // 外側に太い金の縁（24px）、少し空けて内側に細い金の線（2px）
  const content = h("div", {
    display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%",
    border: `2px solid ${GOLD}`, padding: "50px 58px 44px 58px",
  }, [top, h("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", width: "100%" }, inner), foot]);
  return h("div", {
    width: W, height: H, display: "flex", backgroundColor: NAVY,
    border: `24px solid ${GOLD}`, padding: 14,
  }, [content]);
}

const title = (t, size) => h("div", { display: "flex", fontFamily: "Serif", fontSize: size, color: INK, lineHeight: 1.35, letterSpacing: 1 }, t);
const sub = (t) => h("div", { display: "flex", fontFamily: "Sans", fontSize: 38, color: MUTED, lineHeight: 1.7, marginTop: 36 }, t);
const rule = h("div", { display: "flex", width: 96, height: 4, backgroundColor: GOLD, marginBottom: 44 }, []);

function body(d) {
  const b = (Array.isArray(d.b) ? d.b : []).slice(0, 5).map((x) => clip(x, 40));
  switch (d.k) {
    case "cover":
      return [
        rule,
        title(clip(d.t, 40), 92),
        d.s ? sub(clip(d.s, 60)) : null,
        h("div", { display: "flex", marginTop: 64, alignSelf: "flex-start", border: `2px solid ${GOLD}`, color: GOLD_L, fontFamily: "Sans", fontSize: 32, padding: "14px 28px" }, "保存して、あとで見返す"),
      ].filter(Boolean);
    case "list":
    case "steps":
      return [
        rule,
        title(clip(d.t, 34), 66),
        h("div", { display: "flex", flexDirection: "column", marginTop: 52, width: "100%" }, b.map((x, i) =>
          h("div", { display: "flex", alignItems: "flex-start", marginBottom: 34, width: "100%" }, [
            h("div", { display: "flex", justifyContent: "center", alignItems: "center", width: 64, height: 64, flexShrink: 0, borderRadius: d.k === "steps" ? 32 : 4, backgroundColor: d.k === "steps" ? GOLD : "transparent", border: `2px solid ${GOLD}`, color: d.k === "steps" ? NAVY : GOLD_L, fontFamily: "Serif", fontSize: 34, marginRight: 30 }, String(i + 1)),
            h("div", { display: "flex", flex: 1, fontFamily: "Sans", fontSize: 42, color: INK, lineHeight: 1.55, paddingTop: 2 }, x),
          ])
        )),
        d.s ? sub(clip(d.s, 60)) : null,
      ].filter(Boolean);
    case "scene":
      return [
        rule,
        h("div", { display: "flex", fontFamily: "Sans", fontSize: 34, color: GOLD_L, marginBottom: 28 }, clip(d.t, 30)),
        h("div", { display: "flex", fontFamily: "Serif", fontSize: 60, color: INK, lineHeight: 1.6, borderLeft: `6px solid ${GOLD}`, paddingLeft: 40 }, clip(d.s, 90)),
        b.length ? h("div", { display: "flex", fontFamily: "Sans", fontSize: 38, color: MUTED, lineHeight: 1.7, marginTop: 44 }, b.join("")) : null,
      ].filter(Boolean);
    case "end":
      return [
        rule,
        title(clip(d.t, 40), 76),
        d.s ? sub(clip(d.s, 80)) : null,
        h("div", { display: "flex", flexDirection: "column", marginTop: 60, width: "100%" }, [
          h("div", { display: "flex", fontFamily: "Sans", fontSize: 40, color: INK, marginBottom: 22 }, "□ 保存して、来週もう一度読む"),
          h("div", { display: "flex", fontFamily: "Sans", fontSize: 40, color: INK, marginBottom: 22 }, "□ 右腕・幹部にシェアする"),
          h("div", { display: "flex", fontFamily: "Sans", fontSize: 40, color: INK }, "□ プロフィールから無料の診断へ"),
        ]),
      ].filter(Boolean);
    default: // point
      return [
        rule,
        title(clip(d.t, 40), 76),
        d.s ? sub(clip(d.s, 120)) : null,
      ].filter(Boolean);
  }
}

function decode(q) {
  const raw = String(q || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw + "===".slice((raw.length + 3) % 4);
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
}

export async function render(d) {
  const svg = await satori(frame(d, body(d)), {
    width: W, height: H,
    fonts: [
      { name: "Serif", data: SERIF, weight: 700, style: "normal" },
      { name: "Sans", data: SANS, weight: 400, style: "normal" },
    ],
    loadAdditionalAsset: async (code, segment) => {
      if (code === "emoji") return segment;
      if (!EXTRA) EXTRA = loadFont("extra.otf");
      return [{ name: "Extra", data: EXTRA, weight: 700, style: "normal" }];
    },
  });
  const img = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render();
  // InstagramのAPIはJPEGだけを受け付けるため、JPEGで返す
  return jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, 92).data;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const d = decode(url.searchParams.get("d"));
    const png = await render(d);
    return new Response(png, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
  } catch (e) {
    return new Response("bad request: " + e.message, { status: 400 });
  }
};

export const config = { path: "/ig/slide.jpg" };
