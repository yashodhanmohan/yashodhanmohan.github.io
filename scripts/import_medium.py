#!/usr/bin/env python3
"""Convert a Medium archive into static pages under /writing/.

Usage:
  python3 scripts/import_medium.py <unzipped-medium-export-folder>

Reads <export>/posts/*.html, writes:
  /writing/index.html              — listing of all published posts
  /writing/<slug>/index.html       — one page per post
  /writing/img/<id>.<ext>          — locally-downloaded images

Idempotent: re-running just rewrites the same paths.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

REPO = Path(__file__).resolve().parent.parent
WRITING = REPO / "writing"
IMG_DIR = WRITING / "img"

POST_HASH_RE = re.compile(r"-[a-f0-9]{8,}$")
SITE_URL = "https://yashodhanmohan.github.io"


# ---------- slug + dates ----------

def slugify(s: str) -> str:
    s = re.sub(r"-{2,}", "-", s)
    s = s.replace(" ", "-").lower()
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def derive_slug(filename: str) -> str:
    stem = filename.rsplit(".html", 1)[0]
    parts = stem.split("_", 1)
    rest = parts[1] if len(parts) == 2 else stem
    rest = POST_HASH_RE.sub("", rest)
    return slugify(rest)


def parse_iso(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def reading_time(text: str) -> int:
    words = len(re.findall(r"\w+", text))
    return max(1, round(words / 220))


# ---------- image downloading ----------

def fetch_image(url: str) -> str:
    if not url.startswith("http"):
        return url
    parsed = urllib.parse.urlparse(url)
    name = parsed.path.rsplit("/", 1)[-1].split("?", 1)[0]
    if not name or "." not in name:
        return url
    out_path = IMG_DIR / name
    if not out_path.exists():
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (Medium archive importer)"}
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                out_path.write_bytes(r.read())
            print(f"    fetched {name}")
        except Exception as e:
            print(f"    ! failed to fetch {url}: {e}")
            return url
    return f"/writing/img/{name}"


# ---------- body rendering ----------

def text_of(node) -> str:
    if isinstance(node, NavigableString):
        return str(node)
    return "".join(text_of(c) for c in node.children)


def render_inline(node) -> str:
    if isinstance(node, NavigableString):
        return html.escape(str(node), quote=False)
    if not isinstance(node, Tag):
        return ""
    name = node.name
    if name == "a":
        href = html.escape(node.get("href", ""), quote=True)
        inner = render_inline_children(node)
        return f'<a href="{href}" target="_blank" rel="noreferrer">{inner}</a>'
    if name in {"em", "i"}:
        return f"<em>{render_inline_children(node)}</em>"
    if name in {"strong", "b"}:
        return f"<strong>{render_inline_children(node)}</strong>"
    if name == "code":
        return f"<code>{render_inline_children(node)}</code>"
    if name == "br":
        return "<br />"
    if name == "span":
        return render_inline_children(node)
    return render_inline_children(node)


def render_inline_children(node) -> str:
    return "".join(render_inline(c) for c in node.children)


def render_block(el: Tag) -> str:
    classes = el.get("class", []) or []
    if "graf--title" in classes:
        return ""  # Skip: the body's H3 title duplicates the H1.

    name = el.name
    if name == "p":
        body = render_inline_children(el).strip()
        if not body:
            return ""
        cls = ""
        if "pullquote" in " ".join(classes):
            cls = ' class="pullquote"'
        return f"<p{cls}>{body}</p>"

    if name in {"h3", "h4"}:
        return f"<h2>{render_inline_children(el).strip()}</h2>"
    if name == "h2":
        return f"<h3>{render_inline_children(el).strip()}</h3>"
    if name == "h1":
        return ""  # Title already handled in header

    if name == "blockquote":
        return f"<blockquote>{render_inline_children(el).strip()}</blockquote>"

    if name == "ul":
        items = []
        for li in el.find_all("li", recursive=False):
            items.append(f"<li>{render_inline_children(li).strip()}</li>")
        return "<ul>" + "".join(items) + "</ul>"
    if name == "ol":
        items = []
        for li in el.find_all("li", recursive=False):
            items.append(f"<li>{render_inline_children(li).strip()}</li>")
        return "<ol>" + "".join(items) + "</ol>"

    if name == "pre":
        text = el.get_text()
        return f"<pre><code>{html.escape(text)}</code></pre>"

    if name == "figure":
        img = el.find("img")
        if img is None:
            return ""
        src = img.get("src") or img.get("data-src", "")
        local = fetch_image(src)
        alt = img.get("alt", "")
        cap = el.find("figcaption")
        cap_html = ""
        if cap and cap.get_text().strip():
            cap_html = f"<figcaption>{render_inline_children(cap).strip()}</figcaption>"
        return f'<figure><img src="{local}" alt="{html.escape(alt, quote=True)}" loading="lazy" />{cap_html}</figure>'

    if name == "hr":
        return "<hr />"

    if name == "div" and "section-divider" in classes:
        return ""

    return ""


def render_body(body_section: Tag) -> str:
    out = []
    if body_section is None:
        return ""
    # Body is one or more <section> chapters; each chapter has a section-inner
    # with the actual blocks. Iterate all direct block-level descendants.
    for inner in body_section.select(".section-inner"):
        for child in inner.children:
            if not isinstance(child, Tag):
                continue
            block = render_block(child)
            if block:
                out.append(block)
    if not out:
        # Fallback: render anything block-level we can find.
        for child in body_section.find_all(
            ["p", "h2", "h3", "h4", "blockquote", "figure", "pre", "ul", "ol", "hr"]
        ):
            block = render_block(child)
            if block:
                out.append(block)
    return "\n        ".join(out)


# ---------- parse a single post ----------

def parse_post(path: Path):
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")

    title_el = soup.find("h1", class_="p-name")
    title = title_el.get_text().strip() if title_el else path.stem

    subtitle_el = soup.find("section", attrs={"data-field": "subtitle"})
    subtitle = subtitle_el.get_text().strip() if subtitle_el else ""

    time_el = soup.find("time", class_="dt-published")
    iso = time_el["datetime"] if (time_el and time_el.has_attr("datetime")) else None

    canonical_el = soup.find("a", class_="p-canonical")
    canonical = canonical_el["href"] if canonical_el else None

    body_section = soup.find("section", attrs={"data-field": "body"})
    plain_text = body_section.get_text() if body_section else ""
    body_html = render_body(body_section) if body_section else ""

    slug = derive_slug(path.name)

    return {
        "slug": slug,
        "title": title,
        "subtitle": subtitle,
        "date_iso": iso,
        "canonical": canonical,
        "body_html": body_html,
        "reading_time": reading_time(plain_text),
        "source_filename": path.name,
    }


# ---------- templates ----------

POST_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title_text} — Writing — Yashodhan Mohan Bhatnagar</title>
    <meta name="description" content="{description}" />
    <meta name="author" content="Yashodhan Mohan Bhatnagar" />
    <meta name="theme-color" content="#eef0ee" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0c0e14" media="(prefers-color-scheme: dark)" />

    <link rel="canonical" href="{site}/writing/{slug}/" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="{title_text} — Writing" />
    <meta property="og:description" content="{description}" />
    <meta property="og:url" content="{site}/writing/{slug}/" />
    <meta property="og:site_name" content="Yashodhan Mohan Bhatnagar" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="{site}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Yashodhan Mohan Bhatnagar — Engineer" />
    <meta property="article:author" content="Yashodhan Mohan Bhatnagar" />
    <meta property="article:section" content="Writing" />
    <meta property="article:published_time" content="{date_iso}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title_text} — Writing" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{site}/og-image.png" />

    <script type="application/ld+json">
{json_ld}
    </script>

    <meta name="color-scheme" content="light dark" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" />

    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/writing/writing.css" />
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>
    <div class="orb orb-a" aria-hidden="true"></div>

    <header class="topbar">
      <a class="mark" href="/">YMB</a>
      <span class="status">
        <span class="dot"></span>
        Vadodara · IST
      </span>
    </header>

    <main class="post">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">portfolio</a>
        <span aria-hidden="true">›</span>
        <a href="/writing/">writing</a>
        <span aria-hidden="true">›</span>
        <span>{slug}</span>
      </nav>

      <article class="h-entry">
        <header class="post-header">
          <h1 class="post-title">{title_html}</h1>
          <p class="post-meta">
            <time class="dt-published" datetime="{date_iso}">{date_human}</time>
            <span aria-hidden="true">·</span>
            <span>{reading_time} min read</span>
          </p>
          {subtitle_block}
        </header>

        <div class="post-body e-content">
        {body}
        </div>
      </article>

      <nav class="post-nav" aria-label="More writing">
        <a href="/writing/">← back to writing</a>
      </nav>
    </main>

    <footer class="footer">
      <span>© {year} Yashodhan Mohan Bhatnagar</span>
      <span class="muted">Built quietly in Vadodara.</span>
    </footer>
  </body>
</html>
"""


INDEX_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Writing — Yashodhan Mohan Bhatnagar</title>
    <meta name="description" content="Essays, short stories, and notes by Yashodhan Mohan Bhatnagar." />
    <meta name="author" content="Yashodhan Mohan Bhatnagar" />
    <meta name="keywords" content="writing, essays, short stories, notes, Yashodhan Mohan Bhatnagar" />
    <meta name="theme-color" content="#eef0ee" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0c0e14" media="(prefers-color-scheme: dark)" />

    <link rel="canonical" href="{site}/writing/" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="Writing — Yashodhan Mohan Bhatnagar" />
    <meta property="og:description" content="Essays, short stories, and notes." />
    <meta property="og:url" content="{site}/writing/" />
    <meta property="og:site_name" content="Yashodhan Mohan Bhatnagar" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="{site}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Yashodhan Mohan Bhatnagar — Engineer" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Writing — Yashodhan Mohan Bhatnagar" />
    <meta name="twitter:description" content="Essays, short stories, and notes." />
    <meta name="twitter:image" content="{site}/og-image.png" />

    <script type="application/ld+json">
{json_ld}
    </script>

    <meta name="color-scheme" content="light dark" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" />

    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/writing/writing.css" />
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>
    <div class="orb orb-a" aria-hidden="true"></div>

    <header class="topbar">
      <a class="mark" href="/">YMB</a>
      <span class="status">
        <span class="dot"></span>
        Vadodara · IST
      </span>
    </header>

    <main class="writing-shell">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">portfolio</a>
        <span aria-hidden="true">›</span>
        <span>writing</span>
      </nav>

      <h1 class="writing-title">Writing.</h1>
      <p class="writing-lede">
        A small archive of essays, short stories, and notes. Older pieces
        first lived on Medium and have been brought home; new ones land here
        directly.
      </p>

      <ol class="writing-list">
{rows}
      </ol>
    </main>

    <footer class="footer">
      <span>© {year} Yashodhan Mohan Bhatnagar</span>
      <span class="muted">Built quietly in Vadodara.</span>
    </footer>
  </body>
</html>
"""


# ---------- rendering / output ----------

def render_post_page(post: dict) -> str:
    date_iso = post["date_iso"] or ""
    if date_iso:
        d = parse_iso(date_iso)
        date_human = d.strftime("%B %-d, %Y") if sys.platform != "win32" else d.strftime("%B %d, %Y").replace(" 0", " ")
    else:
        date_human = ""
    desc = (post["subtitle"] or post["title"]).replace('"', "&quot;")

    title_text = post["title"].replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    title_html = post["title"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    subtitle_block = (
        f'\n          <p class="post-subtitle p-summary">{post["subtitle"]}</p>'
        if post["subtitle"]
        else ""
    )

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "@id": f"{SITE_URL}/writing/{post['slug']}/#article",
                "headline": post["title"],
                "url": f"{SITE_URL}/writing/{post['slug']}/",
                "datePublished": date_iso,
                "author": {
                    "@type": "Person",
                    "name": "Yashodhan Mohan Bhatnagar",
                    "url": f"{SITE_URL}/",
                },
                "description": post["subtitle"] or post["title"],
                "publisher": {
                    "@type": "Person",
                    "name": "Yashodhan Mohan Bhatnagar",
                    "url": f"{SITE_URL}/",
                },
                "image": f"{SITE_URL}/og-image.png",
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Portfolio", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Writing", "item": f"{SITE_URL}/writing/"},
                    {"@type": "ListItem", "position": 3, "name": post["title"], "item": f"{SITE_URL}/writing/{post['slug']}/"},
                ],
            },
        ],
    }

    return POST_HTML.format(
        title_text=title_text,
        title_html=title_html,
        description=desc,
        slug=post["slug"],
        date_iso=date_iso,
        date_human=date_human,
        subtitle_block=subtitle_block,
        reading_time=post["reading_time"],
        body=post["body_html"],
        site=SITE_URL,
        year=dt.datetime.now().year,
        json_ld=json.dumps(json_ld, indent=2, ensure_ascii=False),
    )


def render_index_page(posts: list[dict]) -> str:
    rows = []
    for i, post in enumerate(posts, 1):
        year = ""
        if post["date_iso"]:
            year = parse_iso(post["date_iso"]).strftime("%Y")
        excerpt = post["subtitle"] or ""
        rows.append(
            f"""        <li>
          <a href="/writing/{post['slug']}/" class="writing-card">
            <span class="post-year">{year}</span>
            <span class="post-title">{html.escape(post['title'])}</span>
            <span class="post-meta">{post['reading_time']} min</span>
            <span class="post-excerpt">{html.escape(excerpt)}</span>
          </a>
        </li>"""
        )

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": f"{SITE_URL}/writing/#page",
                "name": "Writing",
                "url": f"{SITE_URL}/writing/",
                "description": "Essays, short stories, and notes by Yashodhan Mohan Bhatnagar.",
                "isPartOf": {"@type": "WebSite", "name": "Yashodhan Mohan Bhatnagar", "url": f"{SITE_URL}/"},
                "author": {"@type": "Person", "name": "Yashodhan Mohan Bhatnagar", "url": f"{SITE_URL}/"},
                "hasPart": [
                    {
                        "@type": "Article",
                        "headline": p["title"],
                        "url": f"{SITE_URL}/writing/{p['slug']}/",
                        "datePublished": p["date_iso"] or "",
                    }
                    for p in posts
                ],
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Portfolio", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Writing", "item": f"{SITE_URL}/writing/"},
                ],
            },
        ],
    }

    return INDEX_HTML.format(
        site=SITE_URL,
        rows="\n".join(rows),
        year=dt.datetime.now().year,
        json_ld=json.dumps(json_ld, indent=2, ensure_ascii=False),
    )


# ---------- entrypoint ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export", help="Path to unzipped Medium export folder")
    args = ap.parse_args()

    export = Path(args.export).expanduser().resolve()
    posts_dir = export / "posts"
    if not posts_dir.is_dir():
        sys.exit(f"no posts/ folder under {export}")

    WRITING.mkdir(parents=True, exist_ok=True)

    posts = []
    for path in sorted(posts_dir.glob("*.html")):
        if path.name.startswith("draft_"):
            print(f"  skip draft: {path.name}")
            continue
        print(f"parse {path.name}")
        post = parse_post(path)
        posts.append(post)

    # Sort posts newest-first by published date.
    def sort_key(p):
        return parse_iso(p["date_iso"]) if p["date_iso"] else dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    posts.sort(key=sort_key, reverse=True)

    # Write each post page.
    for post in posts:
        out_dir = WRITING / post["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "index.html"
        out_path.write_text(render_post_page(post), encoding="utf-8")
        print(f"  wrote {out_path.relative_to(REPO)}")

    # Write the writing index.
    (WRITING / "index.html").write_text(render_index_page(posts), encoding="utf-8")
    print(f"  wrote writing/index.html ({len(posts)} posts)")

    # Write a manifest JSON for future programmatic use.
    manifest = [
        {
            "slug": p["slug"],
            "title": p["title"],
            "subtitle": p["subtitle"],
            "date_iso": p["date_iso"],
            "reading_time": p["reading_time"],
            "url": f"/writing/{p['slug']}/",
            "medium_canonical": p["canonical"],
        }
        for p in posts
    ]
    (WRITING / "posts.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  wrote writing/posts.json")


if __name__ == "__main__":
    main()
