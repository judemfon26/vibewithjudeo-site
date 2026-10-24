# vibewithjudeo.com

Static website for the YouTube documentary channel **Vibe with Judeo**. No dependencies: one Node build script turns JSON files into HTML.

- Production (after cutover): https://vibewithjudeo.com
- Preview (now): https://judemfon26.github.io/vibewithjudeo-site/

## Layout

```
content/site.json          site settings (URLs, Kit form, notices)
content/youtube.json       YouTube metadata for every film (title, description, duration, date, chapters, availability)
content/films/<slug>.json  one file per film page (headline, write-up, sources, topics)
static/                    CSS, self-hosted fonts, images (copied as-is into dist/)
build.mjs                  generator -> dist/
tools/check.mjs            quality gate (links, meta, word counts, JSON-LD, non-public videos)
tools/refresh_youtube.py   re-fetch YouTube metadata with yt-dlp (local)
tools/prep_images.py       thumbnails, favicons and share images (local, outputs are committed)
```

## Build and check

```
node build.mjs                 # production build into dist/
node tools/check.mjs           # offline gate
node tools/check.mjs --live    # also asks yt-dlp, right now, that every referenced video is public
python3 -m http.server 8080 --directory dist   # look at it locally: http://localhost:8080/
```

GitHub Actions (`.github/workflows/deploy.yml`) runs the build and the offline check on every push to `main`, then deploys `dist/` to GitHub Pages. A failed check stops the deploy.

## Preview vs production

The default build is the production build. Canonical tags, Open Graph images, JSON-LD and `sitemap.xml` use absolute `https://vibewithjudeo.com/...` URLs. Every internal link, stylesheet and image is a **relative** URL, so the same build browses correctly under the github.io preview path. The 404 page uses a `<base>` tag that switches to `/vibewithjudeo-site/` on github.io.

To build for another origin (for example a staging domain), set `SITE_URL`: `SITE_URL=https://example.test node build.mjs`.

`dist/CNAME` contains `vibewithjudeo.com`. With Actions-based Pages deploys GitHub ignores this file. The custom domain only takes effect when it is set in the repository's Pages settings, which has not been done yet.

## Add a film

1. Make sure the video is **public** on YouTube (never scheduled, unlisted or private).
2. `python3 tools/refresh_youtube.py --new` lists public long uploads that have no page yet. Create `content/films/<slug>.json` for the new video (copy an existing one and set its `id` and `slug`), then run `python3 tools/refresh_youtube.py` again: it fetches metadata for every film file into `content/youtube.json`.
3. Write the page: `h1` (topic-led, search-friendly), `seo_title` (60 characters or fewer), `meta_description` (140–160 characters), `dek`, 350–550 words in `sections`, `sources` (real URLs from the project research, or `"url": null`), `topics`, optional `related_hint`. Every fact must be traceable to the video description or the project's research files.
4. `python3 tools/prep_images.py` downloads and compresses the thumbnail.
5. `node build.mjs && node tools/check.mjs --live`, then commit and push.

## Cutover checklist (Jude)

1. Namecheap DNS for `vibewithjudeo.com` (keep the existing `shop`, `privacy`, Kit and mail records):
   - `A @` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - `AAAA @` (optional) → 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153
   - `CNAME www` → `judemfon26.github.io.`
   - Remove any URL-redirect record on `@`/`www` that would conflict.
2. Repo **Settings → Pages → Custom domain**: `vibewithjudeo.com`, then tick **Enforce HTTPS** once the certificate is issued.
3. Optional: verify the domain under GitHub account settings → Pages to protect it from takeover.
4. Google Search Console: add the domain property, submit `https://vibewithjudeo.com/sitemap.xml`, request indexing for the home page and a few film pages.
