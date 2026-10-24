#!/usr/bin/env node
// Static site generator for vibewithjudeo.com. No dependencies.
//   node build.mjs                 -> dist/ (production: canonical/OG/sitemap on https://vibewithjudeo.com)
//   SITE_URL=https://x node build.mjs -> same site, absolute URLs on another origin
// Internal links and assets are always RELATIVE, so the same dist/ also browses correctly
// under https://judemfon26.github.io/vibewithjudeo-site/ (the pre-cutover preview).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8"));
const SITE_URL = (process.env.SITE_URL || site.siteUrl).replace(/\/$/, "");
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// ---------- data ----------
const yt = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(ROOT, "content/youtube.json"), "utf8")).map((v) => [v.id, v])
);
const films = fs
  .readdirSync(path.join(ROOT, "content/films"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const film = JSON.parse(fs.readFileSync(path.join(ROOT, "content/films", f), "utf8"));
    const v = yt[film.id];
    if (!v) throw new Error(`No YouTube metadata for ${film.id} (${f}). Run tools/refresh_youtube.py`);
    if (v.availability !== "public") throw new Error(`${film.id} is not public (${v.availability}); remove ${f}`);
    if (`${film.slug}.json` !== f) throw new Error(`slug/file mismatch in ${f}`);
    return { ...film, yt: v };
  })
  .sort((a, b) => (b.yt.timestamp || 0) - (a.yt.timestamp || 0));
const bySlug = Object.fromEntries(films.map((f) => [f.slug, f]));

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (d) => ({ y: +d.slice(0, 4), m: +d.slice(4, 6), d: +d.slice(6, 8) });
const longDate = (d) => { const x = ymd(d); return `${x.d} ${MONTHS[x.m - 1]} ${x.y}`; };
const shortDate = (d) => { const x = ymd(d); return `${x.d} ${MONTHS[x.m - 1].slice(0, 3)} ${x.y}`; };
const isoDate = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const clock = (s) => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(sec).padStart(2, "0")}`;
};
const isoDuration = (s) => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${sec}S`;
};
const minutes = (s) => `${Math.round(s / 60)} min`;
const TOPIC = { expedition: "Expedition", disaster: "Disaster", mystery: "Mystery", money: "Money", people: "People", "true-crime": "True crime", ocean: "Ocean", mountains: "Mountains", science: "Science", history: "History" };
const shortTitle = (f) => f.h1.replace(/:\s*(The|A) (Tribute )?Documentary$/i, "").replace(/: The Documentary$/i, "");
const watchUrl = (id, t) => `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.round(t)}s` : ""}`;
const abs = (p) => SITE_URL + p;
const uploadIso = (f) => (f.yt.timestamp ? new Date(f.yt.timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : isoDate(f.yt.upload_date));
const words = (f) => f.sections.reduce((n, s) => n + [...(s.paragraphs || []), ...(s.bullets || [])].join(" ").split(/\s+/).filter(Boolean).length, 0);

// ---------- components ----------
const picture = (r, slug, { sizes, eager = false, alt = "" }) => `<picture>
<source type="image/webp" srcset="${r}img/films/${slug}-640.webp 640w, ${r}img/films/${slug}-1280.webp 1280w" sizes="${sizes}">
<img src="${r}img/films/${slug}-640.jpg" srcset="${r}img/films/${slug}-640.jpg 640w, ${r}img/films/${slug}-1280.jpg 1280w" sizes="${sizes}" width="1280" height="720" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
</picture>`;

const card = (r, f, headingTag = "h3") => `<a class="card" href="${r}films/${f.slug}/">
${picture(r, f.slug, { sizes: "(min-width: 1100px) 340px, (min-width: 640px) 45vw, 100vw" })}
<span class="label">${esc(TOPIC[f.topics[0]] || "Documentary")} · ${clock(f.yt.duration)}</span>
<${headingTag} class="card-title">${esc(shortTitle(f))}</${headingTag}>
<time class="card-date" datetime="${isoDate(f.yt.upload_date)}">${shortDate(f.yt.upload_date)}</time>
</a>`;

const signup = (r, { heading = "Get the case file behind the film", id = "signup" } = {}) => `<section class="signup" aria-labelledby="${id}-h">
<div class="signup-copy">
<p class="label">The Case Files · free</p>
<h2 id="${id}-h">${esc(heading)}</h2>
<p>Free PDFs for the biggest stories on the channel: the timeline, the maps, where the sources disagree, and every source we used. Tick the box if you'd also like our short weekly note when a new film is out.</p>
</div>
<form class="kit-form" action="${esc(site.kitFormAction)}" method="post">
<div class="field"><label for="${id}-fn">First name <span>(optional)</span></label><input id="${id}-fn" type="text" name="fields[first_name]" autocomplete="given-name"></div>
<div class="field"><label for="${id}-em">Email</label><input id="${id}-em" type="email" name="email_address" required autocomplete="email" inputmode="email"></div>
<div class="check"><input id="${id}-wk" type="checkbox" name="tags[]" value="${esc(site.kitWeeklyTagId)}"><label for="${id}-wk">Yes, also send me the weekly Case Files email</label></div>
<button type="submit">Send me the case files</button>
<p class="consent">Free case files and a weekly note. Unsubscribe any time. <a href="${r}privacy/">Privacy notice</a></p>
</form>
</section>`;

const shopBlock = (r) => `<section class="shop-block" aria-labelledby="shop-h">
<img src="${r}img/brand/judeo-archive-lockup.png" width="800" height="138" alt="Judeo Archive, by Vibe with Judeo" loading="lazy" decoding="async">
<div>
<h2 id="shop-h" class="visually-hidden">Judeo Archive store</h2>
<p class="label">Capsule 01 · “Last Seen”</p>
<p>Our own small label: quiet clothing and archive prints made from the case files, with coordinates stitched into cloth and charts redrawn from public survey data. Every piece helps fund the next film.</p>
<p><a class="btn btn-ghost" href="${site.shopUrl}" rel="noopener">Visit the Judeo Archive</a> <a class="text-link" href="${r}shop/">About the capsule</a></p>
</div>
</section>`;

const subscribeBand = () => `<section class="subscribe-band">
<p class="label">On YouTube</p>
<h2>Every film is free on YouTube</h2>
<p>Subscribe on YouTube so the next documentary finds you.</p>
<p><a class="btn" href="${site.subscribeUrl}" rel="noopener">Subscribe on YouTube</a></p>
</section>`;

// ---------- layout ----------
function layout({ urlPath, title, description, body, ogImage, ogType = "website", jsonld = [], extraHead = "", is404 = false }) {
  const depth = is404 ? 0 : urlPath.split("/").filter(Boolean).length;
  const r = "../".repeat(depth);
  const canonical = abs(urlPath);
  const img = ogImage || abs("/img/brand/og-default.jpg");
  const nav = [["films/", "Films"], ["case-files/", "Case Files"], ["shop/", "Shop"], ["about/", "About"]]
    .map(([h, t]) => `<a href="${r}${h}"${urlPath.startsWith("/" + h) ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${is404 ? `<script>document.write('<base href="'+(/\\.github\\.io$/.test(location.hostname)?'/vibewithjudeo-site/':'/')+'"><link rel="icon" href="favicon.ico">');</script><noscript><base href="/"></noscript>` : ""}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${is404 ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#F4F1EB">
${is404 ? `<style>${fs.readFileSync(path.join(ROOT, "static/style.css"), "utf8")}</style>` : `<link rel="icon" href="${r}favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="${r}img/brand/favicon-32.png">
<link rel="apple-touch-icon" href="${r}img/brand/apple-touch-icon.png">
<link rel="preload" href="${r}fonts/cormorant-garamond-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r}style.css">`}
${extraHead}${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap">
<a class="wordmark" href="${r || "./"}">Vibe with Judeo</a>
<nav aria-label="Main">${nav}</nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="site-footer"><div class="wrap">
<div><a class="wordmark" href="${r || "./"}">Vibe with Judeo</a><p>Documentaries on real expeditions, disasters, mysteries and money. Made in ${esc(site.city)} by ${esc(site.owner)}.</p></div>
<nav aria-label="Footer">
<a href="${r}films/">All films</a><a href="${r}case-files/">Case Files</a><a href="${r}shop/">Shop</a><a href="${r}about/">About</a><a href="${r}contact/">Contact</a><a href="${r}privacy/">Privacy</a><a href="${site.youtubeChannel}" rel="noopener">YouTube</a>
</nav>
<p class="small">© ${BUILD_DATE.slice(0, 4)} ${esc(site.name)} · <a href="mailto:${site.email}">${site.email}</a></p>
</div></footer>
</body>
</html>
`;
}

const PLAYER_JS = `<script>
(function(){
function play(el,t){var id=el.getAttribute('data-id'),f=document.createElement('iframe');
f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&start='+(t||0);
f.title=el.getAttribute('data-title');f.className='yt';f.setAttribute('data-id',id);f.setAttribute('data-title',el.getAttribute('data-title'));
f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';
el.replaceWith(f);return f;}
document.addEventListener('click',function(e){
var a=e.target.closest&&e.target.closest('a.lite');
if(a){e.preventDefault();play(a,0);return;}
var c=e.target.closest&&e.target.closest('a[data-t]');
if(c){var p=document.querySelector('a.lite,iframe.yt');if(!p)return;e.preventDefault();
var t=c.getAttribute('data-t');
if(p.tagName==='IFRAME'){p.src='https://www.youtube-nocookie.com/embed/'+p.getAttribute('data-id')+'?autoplay=1&rel=0&start='+t;}else{p=play(p,t);}
p.scrollIntoView({behavior:'smooth',block:'center'});}
});})();
</script>`;

// ---------- pages ----------
const pages = [];
const add = (urlPath, html) => pages.push({ urlPath, html });

// Home
{
  const r = "";
  const latest = films.slice(0, site.homeLatestCount);
  const body = `<section class="hero wrap">
<p class="label">Documentaries · Expeditions · Disasters · Mysteries · Money</p>
<h1>Real stories, told from the record</h1>
<p class="lede">Vibe with Judeo is a YouTube channel of narrated documentaries, made in ${esc(site.city)} by ${esc(site.owner)}. Each film follows a real story: an expedition, a disaster, an unsolved mystery or a question about money. We use real footage, let the people involved speak in their own words, and list every source so you can check our work.</p>
<p class="actions"><a class="btn" href="films/${films[0].slug}/">Watch the latest film</a> <a class="btn btn-ghost" href="${site.subscribeUrl}" rel="noopener">Subscribe on YouTube</a></p>
</section>
<section class="wrap" aria-labelledby="latest-h">
<div class="section-head"><h2 id="latest-h">Latest films</h2><a class="text-link" href="films/">All ${films.length} films</a></div>
<div class="grid">${latest.map((f) => card(r, f)).join("\n")}</div>
</section>
<div class="wrap">${signup(r, { heading: "The Case Files", id: "home-signup" })}</div>
<div class="wrap">${shopBlock(r)}</div>
<div class="wrap">${subscribeBand()}</div>`;
  add("/", layout({
    urlPath: "/",
    title: "Vibe with Judeo · Documentaries on Expeditions, Disasters and Mysteries",
    description: "Narrated documentaries on real expeditions, disasters, mysteries and money, with sources for every film. Watch free, get the Case Files, and shop the Judeo Archive.",
    body,
    jsonld: [
      { "@context": "https://schema.org", "@type": "Organization", "@id": abs("/#org"), name: site.name, url: abs("/"), logo: abs("/img/brand/icon-512.png"), email: site.email, sameAs: [site.youtubeChannel, `https://www.youtube.com/channel/${site.channelId}`, site.shopUrl] },
      { "@context": "https://schema.org", "@type": "WebSite", "@id": abs("/#website"), name: site.name, url: abs("/"), publisher: { "@id": abs("/#org") } },
    ],
  }));
}

// Films index
{
  const r = "../";
  const body = `<section class="wrap page-head">
<p class="label">The films</p>
<h1>Documentary films</h1>
<p class="lede">Every long-form documentary on the channel, newest first. Each page has the full film, a written summary, the chapters and the sources.</p>
</section>
<section class="wrap"><div class="grid">${films.map((f) => card(r, f, "h2")).join("\n")}</div></section>
<div class="wrap">${signup(r, { id: "films-signup" })}</div>`;
  add("/films/", layout({
    urlPath: "/films/",
    title: "Documentary Films · Vibe with Judeo",
    description: `All ${films.length} Vibe with Judeo documentaries: Amelia Earhart, Karl Bushby, Everest, North Sentinel, the Congo Basin, El Niño and more, each with sources.`,
    body,
    jsonld: [{
      "@context": "https://schema.org", "@type": "ItemList",
      itemListElement: films.map((f, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/films/${f.slug}/`), name: f.h1 })),
    }],
  }));
}

// Film pages
for (const f of films) {
  const r = "../../";
  const v = f.yt;
  const urlPath = `/films/${f.slug}/`;
  const chapters = v.chapters || [];
  const related = [];
  for (const s of f.related_hint || []) if (bySlug[s] && s !== f.slug && !related.includes(bySlug[s])) related.push(bySlug[s]);
  for (const o of films) if (related.length < 3 && o !== f && !related.includes(o) && o.topics.some((t) => f.topics.includes(t))) related.push(o);
  for (const o of films) if (related.length < 3 && o !== f && !related.includes(o)) related.push(o);
  const rel3 = related.slice(0, 3);

  const sections = f.sections.map((s) => `<h2>${esc(s.heading)}</h2>
${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("\n")}${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}`).join("\n");

  const chapterHtml = chapters.length ? `<section class="chapters" aria-labelledby="ch-h"><h2 id="ch-h">Chapters</h2><ol>${chapters.map(([t, name]) =>
    `<li><a href="${watchUrl(v.id, t)}" data-t="${Math.round(t)}"><span class="ts">${clock(t)}</span> ${esc(name)}</a></li>`).join("")}</ol></section>` : "";

  const sourcesHtml = `<section class="sources" aria-labelledby="src-h"><h2 id="src-h">Sources &amp; further reading</h2><ul>${f.sources.map((s) =>
    s.url ? `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>` : `<li>${esc(s.label)}</li>`).join("")}</ul>
<p class="small">The full source list and credits are in the <a href="${watchUrl(v.id)}" rel="noopener">video description on YouTube</a>.</p></section>`;

  const notice = site.notices?.[f.slug] ? `<aside class="notice" role="note">${site.notices[f.slug]}</aside>` : "";
  const ogImg = abs(`/img/films/${f.slug}-1280.jpg`);
  const body = `<article class="film">
<div class="wrap narrow">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${r}">Home</a> <span aria-hidden="true">/</span> <a href="${r}films/">Films</a></nav>
<p class="label">${f.topics.map((t) => esc(TOPIC[t] || t)).join(" · ")} · ${minutes(v.duration)} · <time datetime="${isoDate(v.upload_date)}">${longDate(v.upload_date)}</time></p>
<h1>${esc(f.h1)}</h1>
<p class="dek">${esc(f.dek)}</p>
${notice}
</div>
<div class="wrap player-wrap">
<div class="player"><a class="lite" href="${watchUrl(v.id)}" data-id="${v.id}" data-title="${esc(v.title)}" aria-label="Play the film: ${esc(v.title)}">
${picture(r, f.slug, { sizes: "(min-width: 980px) 940px, 100vw", eager: true })}
<span class="play" aria-hidden="true"></span></a></div>
<p class="player-meta"><span>On YouTube: “${esc(v.title)}”</span> <a class="text-link" href="${watchUrl(v.id)}" rel="noopener">Watch on YouTube</a> <a class="text-link" href="${site.subscribeUrl}" rel="noopener">Subscribe</a></p>
</div>
<div class="wrap narrow">
<div class="writeup">
${sections}
</div>
${chapterHtml}
${sourcesHtml}
${signup(r, { id: "film-signup" })}
${shopBlock(r)}
</div>
<section class="wrap related" aria-labelledby="rel-h"><h2 id="rel-h">More films</h2><div class="grid">${rel3.map((o) => card(r, o, "h3")).join("\n")}</div></section>
</article>
${PLAYER_JS}`;

  const video = {
    "@context": "https://schema.org", "@type": "VideoObject",
    name: v.title, description: f.meta_description,
    thumbnailUrl: [ogImg, `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`],
    uploadDate: uploadIso(f), duration: isoDuration(v.duration),
    embedUrl: `https://www.youtube.com/embed/${v.id}`, contentUrl: watchUrl(v.id),
    publisher: { "@type": "Organization", name: site.name, url: abs("/"), logo: { "@type": "ImageObject", url: abs("/img/brand/icon-512.png") } },
    inLanguage: "en",
  };
  if (chapters.length) {
    video.hasPart = chapters.map(([t, name], i) => ({
      "@type": "Clip", name, startOffset: Math.round(t),
      endOffset: Math.round(i + 1 < chapters.length ? chapters[i + 1][0] : v.duration), url: watchUrl(v.id, t),
    }));
  }
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
      { "@type": "ListItem", position: 2, name: "Films", item: abs("/films/") },
      { "@type": "ListItem", position: 3, name: f.h1, item: abs(urlPath) },
    ],
  };
  const fullTitle = `${f.seo_title} · ${site.name}`;
  add(urlPath, layout({
    urlPath, title: fullTitle.length <= 72 ? fullTitle : f.seo_title, description: f.meta_description, body,
    ogImage: ogImg, ogType: "video.other", jsonld: [video, crumbs],
    extraHead: `<meta property="og:video:url" content="https://www.youtube.com/embed/${v.id}">\n<meta property="video:duration" content="${Math.round(v.duration)}">\n<meta property="video:release_date" content="${uploadIso(f)}">\n`,
  }));
}

// Simple content pages
function simple(urlPath, { title, description, label, h1, html, after = "" }) {
  add(urlPath, layout({ urlPath, title, description, body: `<div class="wrap narrow prose page-head">
<p class="label">${esc(label)}</p>
<h1>${esc(h1)}</h1>
${html}
</div>${after}` }));
}

simple("/case-files/", {
  title: "The Case Files: Free PDFs Behind the Films · Vibe with Judeo",
  description: "Free Case Files from Vibe with Judeo: the timeline, maps, conflicting accounts and every source behind our biggest documentaries, sent to your inbox.",
  label: "The Case Files · free",
  h1: "The Case Files",
  html: `<p class="lede">A film has to move on. A case file doesn't. For our biggest stories we put the research into a free PDF you can keep: the full timeline, the maps, the places where the sources disagree, and every source we used.</p>
<h2>What's inside a case file</h2>
<ul>
<li>A dated timeline of what happened, with the uncertain parts marked as uncertain.</li>
<li>The maps and diagrams from the film, ready to read at your own pace.</li>
<li>Where the accounts conflict, side by side, so you can weigh them yourself.</li>
<li>The source list, with links, so you can follow any thread further.</li>
</ul>
<p>The first file on the shelf is the Amelia Earhart case, which goes with our two films on the search at Nikumaroro: <a href="../films/amelia-earhart-nikumaroro-lagoon-evidence/">the evidence for the lagoon</a> and <a href="../films/amelia-earhart-taraia-object-expedition/">what the expedition found</a>. More are added as new films come out.</p>
<h2>How it works</h2>
<p>Enter your email below. We send a short message asking you to confirm it; once you do, the case files are yours. Tick the box if you also want the weekly Case Files email when a new film is out. You can unsubscribe from any email in one click.</p>
${signup("../", { heading: "Send me the case files", id: "cf-signup" })}
<p class="small">The signup is handled by Kit, our email provider. Read the <a href="../privacy/">site privacy notice</a> and the <a href="${site.caseFilesPrivacyUrl}" rel="noopener">Case Files privacy notice</a>.</p>`,
});

simple("/shop/", {
  title: "Judeo Archive: Capsule 01 “Last Seen” · Vibe with Judeo",
  description: "Judeo Archive is the clothing and print label from Vibe with Judeo. Capsule 01, “Last Seen”, turns the case files into quiet, field-grade pieces.",
  label: "Judeo Archive · by Vibe with Judeo",
  h1: "Capsule 01: “Last Seen”",
  html: `<p class="lede">Judeo Archive is our own small label. The idea is simple: clothing and prints you'd actually wear and hang, made from the stories we cover, with nothing loud on them.</p>
<figure class="shop-figure"><picture><source type="image/webp" srcset="../img/brand/shop-chart-print.webp"><img src="../img/brand/shop-chart-print.jpg" width="800" height="993" alt="A chart print of the Central Pacific hanging above a wooden map cabinet" loading="lazy" decoding="async"></picture><figcaption>Chart Print, Plate I: the final leg toward Howland Island, July 1937.</figcaption></figure>
<p>The first capsule, “Last Seen”, starts with the Amelia Earhart case. The coordinates where her radio was last heard are embroidered on a tee; a chart of her final leg, drawn from public-domain survey data, is a print for the wall. Alongside them are knitwear, a field hoodie, a cap, a beanie, a desk mat and a tote, all in the same quiet archive colours.</p>
<p>Every piece helps fund the next film. Orders, sizing, shipping and returns are handled on the shop itself.</p>
<p><a class="btn" href="${site.shopUrl}" rel="noopener">Visit the shop</a></p>`,
});

simple("/about/", {
  title: "About Vibe with Judeo · Documentaries by Jude Akpan",
  description: "Vibe with Judeo makes narrated documentaries on real expeditions, disasters, mysteries and money, built on real footage, first-hand voices and listed sources.",
  label: "About",
  h1: "About Vibe with Judeo",
  html: `<p class="lede">Vibe with Judeo is a documentary channel on YouTube, run by ${esc(site.owner)} in ${esc(site.city)}, Canada.</p>
<p>We make narrated films about real events: people walking, rowing and paddling across continents, disasters and the science behind them, mysteries that people have argued over for decades, and the money stories behind the headlines. Recent films have followed Karl Bushby's walk home to Hull, the search for Amelia Earhart's plane at Nikumaroro, the 2026 El Niño and the unsold condos of Metro Vancouver.</p>
<h2>How we make the films</h2>
<ul>
<li><strong>Real footage first.</strong> Archive film, news clips, expedition video and photographs, credited on screen and in the description.</li>
<li><strong>The people involved, in their own words.</strong> Short interview and news clips, so you hear from the explorers, scientists and witnesses directly.</li>
<li><strong>Sources you can check.</strong> Every film lists its sources, and time-sensitive figures carry the date they were checked.</li>
<li><strong>Honest about what isn't known.</strong> Where accounts conflict, or a claim is disputed, we say so. Scenes that had to be recreated are labelled.</li>
</ul>
<h2>Get in touch</h2>
<p>Spotted a mistake, have a story we should look at, or want to work together? Email <a href="mailto:${site.email}">${site.email}</a>. More on the <a href="../contact/">contact page</a>.</p>`,
  after: `<div class="wrap">${subscribeBand()}</div>`,
});

simple("/contact/", {
  title: "Contact · Vibe with Judeo",
  description: "Contact Vibe with Judeo: story tips, corrections, press and brand partnerships. Email hello@vibewithjudeo.com.",
  label: "Contact",
  h1: "Contact",
  html: `<p class="lede">The best way to reach us is email: <a href="mailto:${site.email}">${site.email}</a>.</p>
<h2>Brand deals and sponsorships</h2>
<p>Brand partnerships are welcome. If your product suits an audience that watches long documentaries about expeditions, science, history and money, send a short note with what you have in mind, your timeline and a budget range.</p>
<h2>Corrections</h2>
<p>If you think a film or a page here gets something wrong, tell us which film, the timestamp and your source. We read every one.</p>
<h2>Story tips and press</h2>
<p>Tips about stories we should cover, and press or licensing questions, go to the same address.</p>`,
});

simple("/privacy/", {
  title: "Privacy Notice · Vibe with Judeo",
  description: "How vibewithjudeo.com handles your data: the Case Files signup (processed by Kit), YouTube videos that load only when you press play, and no tracking.",
  label: "Privacy",
  h1: "Privacy notice",
  html: `<p class="lede">This notice covers this website, vibewithjudeo.com. It is short because the site collects very little.</p>
<h2>The Case Files signup</h2>
<p>If you use the signup form, we receive the email address you enter and, if you add it, your first name. We use them to send the free case files and, if you tick the box for it, the weekly Case Files email about new films. Nothing is sent until you confirm your address from the email we send you, and every email has a one-click unsubscribe link.</p>
<p>The form is processed by <a href="https://kit.com" rel="noopener">Kit</a> (formerly ConvertKit), our email provider, which stores your details on our behalf. The full notice for the Case Files list, including how long we keep your details and how to ask for them to be deleted, is at <a href="${site.caseFilesPrivacyUrl}" rel="noopener">${site.caseFilesPrivacyUrl.replace("https://", "")}</a>.</p>
<h2>YouTube videos</h2>
<p>Film pages show a still image, not a live YouTube player. Nothing is loaded from YouTube until you press play. When you do, the video loads from youtube-nocookie.com, and YouTube's own privacy policy applies to that player.</p>
<h2>No tracking</h2>
<p>This site does not use analytics, advertising cookies or tracking pixels. Fonts and images are served from this site itself.</p>
<h2>Hosting</h2>
<p>The site is hosted on GitHub Pages. Like any web host, GitHub may log technical data such as IP addresses to keep the service secure; see GitHub's privacy statement.</p>
<h2>Shop</h2>
<p>The Judeo Archive shop at shop.vibewithjudeo.com is a separate site run on Fourthwall, with its own privacy policy.</p>
<h2>Contact</h2>
<p>Questions about your data: <a href="mailto:${site.email}">${site.email}</a>.</p>
<p class="small">Last updated ${longDate(BUILD_DATE.replace(/-/g, ""))}.</p>`,
});

// 404 (served by Pages at any depth: links are relative to <base>)
pages.push({
  urlPath: "/404.html",
  html: layout({
    urlPath: "/404.html", is404: true,
    title: "Page not found · Vibe with Judeo",
    description: "This page doesn't exist. Browse all Vibe with Judeo documentaries.",
    body: `<div class="wrap narrow page-head prose"><p class="label">404</p><h1>This page isn't here</h1>
<p class="lede">The link may be old, or the page may have moved. The films are all still here.</p>
<p><a class="btn" href="films/">Browse all films</a> <a class="btn btn-ghost" href="./">Go to the home page</a></p></div>
<section class="wrap"><div class="grid">${films.slice(0, 3).map((f) => card("", f)).join("\n")}</div></section>`,
  }),
});

// ---------- write ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, "static"), DIST, { recursive: true });
for (const p of pages) {
  const out = p.urlPath.endsWith(".html") ? path.join(DIST, p.urlPath) : path.join(DIST, p.urlPath, "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, p.html);
}
fs.writeFileSync(path.join(DIST, "CNAME"), new URL(SITE_URL).host + "\n");
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);

const sm = pages.filter((p) => !p.urlPath.endsWith(".html")).map((p) => {
  const f = films.find((x) => `/films/${x.slug}/` === p.urlPath);
  const lastmod = f ? isoDate(f.yt.upload_date) : BUILD_DATE;
  const video = f ? `
    <video:video>
      <video:thumbnail_loc>${abs(`/img/films/${f.slug}-1280.jpg`)}</video:thumbnail_loc>
      <video:title>${esc(f.yt.title)}</video:title>
      <video:description>${esc(f.meta_description)}</video:description>
      <video:player_loc>https://www.youtube.com/embed/${f.id}</video:player_loc>
      <video:duration>${Math.round(f.yt.duration)}</video:duration>
      <video:publication_date>${uploadIso(f)}</video:publication_date>
    </video:video>` : "";
  return `  <url>\n    <loc>${abs(p.urlPath)}</loc>\n    <lastmod>${lastmod}</lastmod>${video}\n  </url>`;
});
fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${sm.join("\n")}
</urlset>
`);

console.log(`Built ${pages.length} pages (${films.length} films) -> dist/  [SITE_URL=${SITE_URL}]`);
for (const f of films) console.log(`  ${f.id.padEnd(12)} ${String(words(f)).padStart(4)} words  /films/${f.slug}/`);
