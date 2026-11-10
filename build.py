"""Bundle the app for shipping.

Run:  python build.py

Produces:
  dist/Whiteboard.html   One self-contained file. No server or internet needed; open it by
                         double-clicking (or with Whiteboard.bat for an app-style window).
  dist/web/              The same app as a small website: upload this folder's contents to any
                         https host. Browsers then offer "Install", and it works offline after
                         the first visit.
"""
import base64
import re
import shutil
from pathlib import Path

root = Path(__file__).parent
dist = root / "dist"
html = (root / "index.html").read_text(encoding="utf-8")


def inline_css(m):
    return "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>"


def inline_js(m):
    code = (root / m.group(1)).read_text(encoding="utf-8")
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html, n_js = re.subn(r'<script src="([^"]+)"></script>', inline_js, html)

# --- Website (installable, offline-capable) ---
web = dist / "web"
if web.exists():
    shutil.rmtree(web)
(web / "icons").mkdir(parents=True)
(web / "index.html").write_text(html, encoding="utf-8", newline="\n")
for name in ("manifest.webmanifest", "sw.js"):
    shutil.copy(root / name, web / name)
for icon in (root / "icons").iterdir():
    shutil.copy(icon, web / "icons" / icon.name)

# --- Single file (opened from disk: no manifest or separate icon files there) ---
icon_uri = "data:image/svg+xml;base64," + base64.b64encode((root / "icons" / "icon.svg").read_bytes()).decode()
single = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
single = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', "", single)
single = single.replace('href="icons/icon.svg"', f'href="{icon_uri}"')
out = dist / "Whiteboard.html"
out.write_text(single, encoding="utf-8", newline="\n")

print(f"{n_css} stylesheet and {n_js} scripts inlined")
print(f"Single file: {out} ({out.stat().st_size // 1024} KB)")
print(f"Website:     {web}  ({', '.join(sorted(p.name for p in web.iterdir()))})")
