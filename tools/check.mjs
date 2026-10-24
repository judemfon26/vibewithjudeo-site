#!/usr/bin/env node
// Quality gate for dist/. Exits 1 on any failure.
//   node tools/check.mjs          -> offline checks (uses content/youtube.json snapshot for video status)
//   node tools/check.mjs --live   -> also asks yt-dlp, right now, whether every referenced video is public
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const LIVE = process.argv.includes("--live");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8"));
const SITE_URL = (process.env.SITE_URL || site.siteUrl).replace(/\/$/, "");
const yt = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, "content/youtube.json"), "utf8")).map((v) => [v.id, v]));
const errors = [];
const fail = (file, msg) => errors.push(`${path.relative(DIST, file) || file}: ${msg}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(DIST);
const html = files.filter((f) => f.endsWith(".html"));
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
const countWords = (s) => strip(s).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
const videoIds = new Map(); // id -> files

for (const file of html) {
  const src = fs.readFileSync(file, "utf8");
  const is404 = path.basename(file) === "404.html";
  const rel = "/" + path.relative(DIST, file).replace(/index\.html$/, "");

  // head
  if (!/<title>[^<]{10,}<\/title>/.test(src)) fail(file, "missing/short <title>");
  const desc = src.match(/<meta name="description" content="([^"]*)"/);
  if (!desc || desc[1].length < 50) fail(file, "missing/short meta description");
  if (!is404) {
    const can = src.match(/<link rel="canonical" href="([^"]+)"/);
    if (!can) fail(file, "missing canonical");
    else if (can[1] !== SITE_URL + rel) fail(file, `canonical ${can[1]} != ${SITE_URL + rel}`);
    if (!/<meta property="og:image" content="https:\/\//.test(src)) fail(file, "missing absolute og:image");
  }
  if ((src.match(/<h1[\s>]/g) || []).length !== 1) fail(file, "must have exactly one <h1>");

  // JSON-LD parses
  const ld = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch { fail(file, "invalid JSON-LD"); return {}; }
  });

  // film pages
  if (/^\/films\/[^/]+\/$/.test(rel)) {
    const w = src.match(/<div class="writeup">([\s\S]*?)<\/div>/);
    const n = w ? countWords(w[1]) : 0;
    if (n < 300) fail(file, `write-up only ${n} words (< 300)`);
    const vo = ld.find((j) => j["@type"] === "VideoObject");
    if (!vo) fail(file, "missing VideoObject JSON-LD");
    else for (const k of ["name", "description", "thumbnailUrl", "uploadDate", "duration", "embedUrl", "contentUrl"]) if (!vo[k]) fail(file, `VideoObject missing ${k}`);
    if (!ld.find((j) => j["@type"] === "BreadcrumbList")) fail(file, "missing BreadcrumbList JSON-LD");
    if (!/class="lite"[^>]*data-id="/.test(src)) fail(file, "missing click-to-load player");
    if (/<iframe/i.test(src)) fail(file, "iframe present in static HTML (must load only on click)");
    if (!src.includes(`action="${site.kitFormAction}"`)) fail(file, "signup form missing");
  }

  // signup form markup (any page that has one)
  for (const m of src.matchAll(/<form[^>]*class="kit-form"[\s\S]*?<\/form>/g)) {
    const f = m[0];
    if (!f.includes(`action="${site.kitFormAction}"`) || !/method="post"/.test(f)) fail(file, "kit form action/method wrong");
    if (!/<input[^>]*type="email"[^>]*name="email_address"[^>]*required/.test(f)) fail(file, "kit form email_address input wrong");
    if (!/name="fields\[first_name\]"/.test(f)) fail(file, "kit form first-name field missing");
    const cb = f.match(/<input[^>]*type="checkbox"[^>]*>/);
    if (!cb || !cb[0].includes(`name="tags[]" value="${site.kitWeeklyTagId}"`) || /checked/.test(cb[0])) fail(file, "weekly opt-in checkbox missing, wrong tag, or pre-ticked");
    if (!/Free case files and a weekly note\. Unsubscribe any time\. <a href="[^"]*privacy\/">Privacy notice<\/a>/.test(f)) fail(file, "consent line missing/wrong");
  }

  // internal links
  const base = is404 ? DIST : path.dirname(file);
  for (const m of src.replace(/<base [^>]*>/g, "").replace(/<script>document\.write[^<]*<\/script>/, "").matchAll(/\s(?:href|src|srcset)="([^"]+)"/g)) {
    for (let url of m[1].split(",").map((s) => s.trim().split(/\s+/)[0])) {
      if (!url || /^(https?:|mailto:|tel:|#|data:)/.test(url)) continue;
      url = url.split("#")[0].split("?")[0];
      let target = path.resolve(base, url);
      if (url.endsWith("/") || url === "" || url === "./") target = path.join(target, "index.html");
      if (!target.startsWith(DIST)) { fail(file, `link escapes site root: ${url}`); continue; }
      if (!fs.existsSync(target)) fail(file, `broken internal link: ${url}`);
    }
  }
  // absolute links to own domain must not be used for navigation (would break the preview)
  for (const m of src.matchAll(/<a [^>]*href="(https?:\/\/(?:www\.)?vibewithjudeo\.com[^"]*)"/g)) fail(file, `absolute internal nav link: ${m[1]}`);

  // every YouTube video referenced anywhere
  for (const re of [/youtube\.com\/watch\?v=([\w-]{11})/g, /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g, /youtu\.be\/([\w-]{11})/g, /data-id="([\w-]{11})"/g, /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})/g]) {
    for (const m of src.matchAll(re)) {
      if (!videoIds.has(m[1])) videoIds.set(m[1], new Set());
      videoIds.get(m[1]).add(path.relative(DIST, file));
    }
  }
}

// sitemap
const sm = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  if (!m[1].startsWith(SITE_URL + "/")) { errors.push(`sitemap: foreign URL ${m[1]}`); continue; }
  const p = m[1].slice(SITE_URL.length);
  if (!fs.existsSync(path.join(DIST, p, p.endsWith("/") ? "index.html" : ""))) errors.push(`sitemap: ${m[1]} has no page`);
}
const filmDirs = fs.readdirSync(path.join(DIST, "films"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const d of filmDirs) if (!sm.includes(`${SITE_URL}/films/${d}/`)) errors.push(`sitemap: missing /films/${d}/`);
for (const f of ["robots.txt", "CNAME", "favicon.ico", "404.html"]) if (!fs.existsSync(path.join(DIST, f))) errors.push(`missing ${f}`);

// video status
for (const [id, where] of videoIds) {
  const v = yt[id];
  if (!v) { errors.push(`video ${id} (in ${[...where][0]}) not in content/youtube.json`); continue; }
  if (v.availability !== "public") errors.push(`video ${id} is ${v.availability} in snapshot`);
}
if (LIVE) {
  for (const id of videoIds.keys()) {
    let status = "error";
    try {
      status = execFileSync("yt-dlp", ["--skip-download", "--print", "%(availability)s|%(live_status)s|%(channel_id)s", "--", `https://www.youtube.com/watch?v=${id}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (e) { status = "unavailable: " + String(e.stderr || e).split("\n").find((l) => l.includes("ERROR")); }
    const [avail, live, ch] = status.split("|");
    const ok = avail === "public" && live === "not_live" && ch === site.channelId;
    console.log(`  live ${id}: ${status}${ok ? "" : "  <-- FAIL"}`);
    if (!ok) errors.push(`video ${id} not public right now (${status})`);
  }
}

console.log(`Checked ${html.length} HTML pages, ${filmDirs.length} film pages, ${videoIds.size} video IDs${LIVE ? " (live)" : ""}.`);
if (errors.length) { console.error(`\n${errors.length} problem(s):\n- ` + errors.join("\n- ")); process.exit(1); }
console.log("All checks passed.");
