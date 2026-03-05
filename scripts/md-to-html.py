#!/usr/bin/env python3
"""Markdown to HTML converter for Tana docs.

Usage:
    python3 md-to-html.py <input.md> <output.html> [--images-dir DIR]

Converts a Markdown file to a styled HTML page with Tana green theme.
Uses markdown-it-py if available, otherwise falls back to regex-based conversion.
"""

import argparse
import os
import re
import sys

# ---------------------------------------------------------------------------
# Try markdown-it-py; fall back to built-in regex converter
# ---------------------------------------------------------------------------
try:
    from markdown_it import MarkdownIt

    def convert_markdown(text: str) -> str:
        md = MarkdownIt("commonmark", {"html": True}).enable("table")
        return md.render(text)

    _ENGINE = "markdown-it-py"
except ImportError:

    def convert_markdown(text: str) -> str:
        return _fallback_convert(text)

    _ENGINE = "fallback"

# ---------------------------------------------------------------------------
# CSS Styles (Tana green theme)
# ---------------------------------------------------------------------------
CSS_STYLES = """
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        'Helvetica Neue', Arial, 'Noto Sans CJK JP', sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #1a1a1a;
    background-color: #f8f8f8;
}

.container {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 32px 64px;
    background-color: #fff;
    min-height: 100vh;
}

nav.back-link {
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
}

nav.back-link a {
    color: #059669;
    text-decoration: none;
    font-size: 14px;
}

nav.back-link a:hover {
    text-decoration: underline;
}

h1 {
    font-size: 28px;
    font-weight: bold;
    text-align: center;
    margin-top: 0;
    margin-bottom: 1.2em;
    padding-bottom: 0.4em;
    border-bottom: 2px solid #059669;
}

h2 {
    font-size: 22px;
    font-weight: bold;
    margin-top: 2em;
    margin-bottom: 0.6em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid #ccc;
}

h3 {
    font-size: 18px;
    font-weight: bold;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
}

h4 {
    font-size: 16px;
    font-weight: bold;
    margin-top: 1em;
    margin-bottom: 0.3em;
}

p {
    margin: 0.6em 0;
    text-align: justify;
}

ul, ol {
    margin: 0.6em 0;
    padding-left: 2em;
}

li {
    margin: 0.3em 0;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 15px;
}

th, td {
    border: 1px solid #999;
    padding: 8px 12px;
    text-align: left;
}

th {
    background-color: #ecfdf5;
    font-weight: bold;
}

hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 2em 0;
}

code {
    font-size: 14px;
    background-color: #f5f5f5;
    padding: 0.15em 0.3em;
    border-radius: 3px;
}

pre {
    background-color: #f5f5f5;
    padding: 1em;
    overflow-x: auto;
    font-size: 14px;
    line-height: 1.4;
    border-radius: 4px;
}

pre code {
    background: none;
    padding: 0;
}

blockquote {
    border-left: 3px solid #059669;
    margin: 0.8em 0;
    padding: 0.2em 0 0.2em 1em;
    color: #555;
}

strong {
    font-weight: bold;
}

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.5em auto;
}

a {
    color: #059669;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

sub {
    font-size: 12px;
    color: #888;
}

@media (max-width: 600px) {
    .container {
        padding: 16px 16px 48px;
    }

    h1 {
        font-size: 22px;
    }

    h2 {
        font-size: 19px;
    }

    h3 {
        font-size: 16px;
    }

    table {
        font-size: 13px;
    }

    th, td {
        padding: 6px 8px;
    }
}
"""

# ---------------------------------------------------------------------------
# Fallback regex-based Markdown converter
# ---------------------------------------------------------------------------

def _fallback_convert(text: str) -> str:
    """Convert Markdown to HTML using regex. Handles the most common elements."""
    lines = text.split("\n")
    html_parts: list[str] = []
    i = 0

    def _inline(s: str) -> str:
        """Process inline elements: bold, links, images, inline code."""
        # images
        s = re.sub(
            r"!\[([^\]]*)\]\(([^)]+)\)",
            r'<img src="\2" alt="\1">',
            s,
        )
        # links
        s = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2">\1</a>',
            s,
        )
        # bold
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        # inline code
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s

    while i < len(lines):
        line = lines[i]

        # --- fenced code block ---
        if line.startswith("```"):
            lang = line[3:].strip()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            escaped = "\n".join(code_lines)
            escaped = escaped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if lang:
                html_parts.append(f'<pre><code class="language-{lang}">{escaped}</code></pre>')
            else:
                html_parts.append(f"<pre><code>{escaped}</code></pre>")
            continue

        # --- table ---
        if "|" in line and i + 1 < len(lines) and re.match(r"^\s*\|[\s\-:|]+\|\s*$", lines[i + 1]):
            table_lines: list[str] = []
            while i < len(lines) and "|" in lines[i]:
                table_lines.append(lines[i])
                i += 1
            html_parts.append(_parse_table(table_lines))
            continue

        # --- blockquote ---
        if line.startswith(">"):
            bq_lines: list[str] = []
            while i < len(lines) and lines[i].startswith(">"):
                bq_lines.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            inner = "<p>" + "</p><p>".join(_inline(l) for l in bq_lines if l.strip()) + "</p>"
            html_parts.append(f"<blockquote>{inner}</blockquote>")
            continue

        # --- headings ---
        m = re.match(r"^(#{1,6})\s+(.+)$", line)
        if m:
            level = len(m.group(1))
            html_parts.append(f"<h{level}>{_inline(m.group(2))}</h{level}>")
            i += 1
            continue

        # --- hr ---
        if re.match(r"^(-{3,}|\*{3,}|_{3,})\s*$", line):
            html_parts.append("<hr>")
            i += 1
            continue

        # --- unordered list ---
        if re.match(r"^[-*+]\s", line):
            items: list[str] = []
            while i < len(lines) and re.match(r"^[-*+]\s", lines[i]):
                items.append(re.sub(r"^[-*+]\s+", "", lines[i]))
                i += 1
            html_parts.append(
                "<ul>" + "".join(f"<li>{_inline(it)}</li>" for it in items) + "</ul>"
            )
            continue

        # --- ordered list ---
        if re.match(r"^\d+\.\s", line):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i]):
                items.append(re.sub(r"^\d+\.\s+", "", lines[i]))
                i += 1
            html_parts.append(
                "<ol>" + "".join(f"<li>{_inline(it)}</li>" for it in items) + "</ol>"
            )
            continue

        # --- paragraph / blank ---
        if line.strip():
            html_parts.append(f"<p>{_inline(line)}</p>")
        i += 1

    return "\n".join(html_parts)


def _parse_table(table_lines: list[str]) -> str:
    """Parse pipe-delimited table lines into an HTML table."""

    def _cells(row: str) -> list[str]:
        row = row.strip()
        if row.startswith("|"):
            row = row[1:]
        if row.endswith("|"):
            row = row[:-1]
        return [c.strip() for c in row.split("|")]

    if len(table_lines) < 2:
        return ""

    headers = _cells(table_lines[0])
    # skip separator row (index 1)
    rows = [_cells(r) for r in table_lines[2:]]

    html = "<table>\n<thead><tr>"
    for h in headers:
        html += f"<th>{h}</th>"
    html += "</tr></thead>\n<tbody>"
    for row in rows:
        html += "<tr>"
        for c in row:
            html += f"<td>{c}</td>"
        html += "</tr>"
    html += "</tbody>\n</table>"
    return html


# ---------------------------------------------------------------------------
# Title / description extraction
# ---------------------------------------------------------------------------

def _extract_title(md_text: str) -> str:
    """Extract the first H1 heading as the page title."""
    m = re.search(r"^#\s+(.+)$", md_text, re.MULTILINE)
    return m.group(1).strip() if m else "Tana"


def _extract_description(md_text: str) -> str:
    """Extract the first meaningful paragraph as the description."""
    default = "Tana -- 治療院・サロン向け在庫管理アプリ"
    for line in md_text.split("\n"):
        line = line.strip()
        # skip blanks, headings, images, hrs, html tags
        if not line or line.startswith("#") or line.startswith("!") or line.startswith("---"):
            continue
        if line.startswith("<") and not line.startswith("<strong") and not line.startswith("<a"):
            continue
        # strip markdown formatting for description
        desc = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        desc = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", desc)
        desc = re.sub(r"`([^`]+)`", r"\1", desc)
        if len(desc) > 10:
            return desc[:200]
    return default


# ---------------------------------------------------------------------------
# Image path rewriting
# ---------------------------------------------------------------------------

def _rewrite_image_paths(html: str, images_dir: str) -> str:
    """Rewrite images/XX.png paths to /<images_dir>/XX.png."""
    html = re.sub(
        r'src="images/([^"]+)"',
        rf'src="/{images_dir}/\1"',
        html,
    )
    return html


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} -- Tana</title>
    <meta name="description" content="{description}">
    <meta property="og:title" content="{title} -- Tana">
    <meta property="og:description" content="{description}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="ja_JP">
    <style>
{css}
    </style>
</head>
<body>
    <div class="container">
        <nav class="back-link">
            <a href="/">&larr; Tana アプリに戻る</a>
        </nav>
{body}
    </div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Markdown to styled HTML for Tana docs.")
    parser.add_argument("input", help="Input Markdown file")
    parser.add_argument("output", help="Output HTML file")
    parser.add_argument(
        "--images-dir",
        default="docs-images",
        help="Image directory name used in URL paths (default: docs-images)",
    )
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        md_text = f.read()

    title = _extract_title(md_text)
    description = _extract_description(md_text)

    body_html = convert_markdown(md_text)
    body_html = _rewrite_image_paths(body_html, args.images_dir)

    # Indent body for clean HTML output
    indented_body = "\n".join("        " + line for line in body_html.split("\n"))

    html = HTML_TEMPLATE.format(
        title=title,
        description=description,
        css=CSS_STYLES,
        body=indented_body,
    )

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"[{_ENGINE}] {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
