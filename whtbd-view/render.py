#!/usr/bin/env python3
"""Render a Whiteboard board (.whtbd, or an export that carries one) to a PNG and summarise it.

Uses the app's own drawing code (js/geometry.js + js/io.js) in headless Chrome/Edge, so the
picture matches what the app shows. The code comes from a local checkout of the app when one
is found, otherwise from the live site.

  python render.py BOARD [--out PNG] [--px 1600] [--bg auto|white|dark|none|#rrggbb]
                         [--region X,Y,W,H] [--saved-view] [--entry PATH] [--json]
"""
import argparse, base64, json, os, re, subprocess, sys, tempfile, urllib.request, zlib
from collections import Counter

LIVE = 'https://citromoseper.github.io/Whiteboard/'
SCRIPTS = ['js/geometry.js', 'js/io.js']
CANDIDATE_REPOS = [
    os.environ.get('WHITEBOARD_REPO', ''),
    os.path.expanduser('~/Documents/PROJECTS/Whiteboard app'),
    os.getcwd(),
]


def board_text(path, entry=None):
    """The .whtbd JSON text: the file itself, one board of a gallery backup, or the payload embedded in an export."""
    raw = open(path, 'rb').read()
    try:
        d = json.loads(raw.decode('utf-8-sig'))
    except Exception:
        d = None
    if isinstance(d, dict) and str(d.get('format', '')).startswith('WHTBD-') and isinstance(d.get('entries'), list):
        boards = [e for e in d['entries'] if isinstance(e, dict) and 'text' in e]
        pick = [e for e in boards if entry and entry.lower() in e['path'].lower()]
        if len(pick) != 1:
            print(f"{path} is a {d['format']} backup with {len(boards)} boards:")
            for e in boards:
                print('  ' + e['path'])
            sys.exit('Pick one with --entry PART_OF_ITS_PATH' + (' (that matched several)' if pick else ''))
        print(f"Backup entry: {pick[0]['path']}")
        return pick[0]['text']
    head = raw.lstrip()[:200].decode('utf-8', 'ignore')
    if head.startswith('{') and '"WHTBD"' in raw[:400].decode('utf-8', 'ignore'):
        return raw.decode('utf-8')
    s = raw.decode('latin1')
    i = s.rfind('WHTBD-DATA:')
    m = re.match(r'WHTBD-DATA:([zj]):([A-Za-z0-9+/=]+):END', s[i:]) if i >= 0 else None
    if not m:
        sys.exit(f'{path}: not a Whiteboard board, and no board is embedded in it.')
    data = base64.b64decode(m.group(2))
    return (zlib.decompress(data) if m.group(1) == 'z' else data).decode('utf-8')


GITHUB = 'https://github.com/CITROMOSEPER/Whiteboard'
RAW = 'https://raw.githubusercontent.com/CITROMOSEPER/Whiteboard/main/'
CACHE = os.path.join(tempfile.gettempdir(), 'whtbd-view-Whiteboard')


def _read(repo):
    return [open(os.path.join(repo, p), encoding='utf-8').read() for p in SCRIPTS]


def _has(repo):
    return repo and all(os.path.isfile(os.path.join(repo, p)) for p in SCRIPTS)


def app_code():
    """The app's drawing code: a local checkout, else the live site, raw GitHub, or a git clone
    (cached in the temp folder). Sandboxes often block some of these hosts, so each is tried in turn."""
    for repo in CANDIDATE_REPOS:
        if _has(repo):
            return _read(repo), repo
    errors = []
    for base in (LIVE, RAW):
        try:
            code = []
            for p in SCRIPTS:
                with urllib.request.urlopen(base + p, timeout=20) as r:
                    code.append(r.read().decode('utf-8'))
            return code, base
        except Exception as e:
            errors.append(f'{base}: {e}')
    try:
        if _has(CACHE):
            subprocess.run(['git', '-C', CACHE, 'pull', '-q', '--depth', '1'], timeout=60, capture_output=True)
        else:
            subprocess.run(['git', 'clone', '-q', '--depth', '1', GITHUB, CACHE], timeout=120, check=True, capture_output=True)
        if _has(CACHE):
            return _read(CACHE), f'git clone of {GITHUB} in {CACHE}'
    except Exception as e:
        errors.append(f'git clone {GITHUB}: {e}')
    sys.exit("Could not get the app's drawing code. Clone " + GITHUB + " yourself and set WHITEBOARD_REPO to it.\n  " + "\n  ".join(errors))


def summary(d):
    st = d.get('strokes', [])
    kinds = Counter(s.get('tool') for s in st)
    out = [f"Title: {d.get('title')!r}   created {d.get('created')}   modified {d.get('modified')}",
           f"Saved view: {d.get('view')}",
           'Objects: ' + (', '.join(f'{n} {k}' for k, n in kinds.most_common()) or 'none')]
    shapes = Counter(s['shape'] for s in st if s.get('shape'))
    if shapes:
        out.append('Snapped shapes: ' + ', '.join(f'{n} {k}' for k, n in shapes.most_common()))
    colors = Counter(s['color'] for s in st if s.get('color') and s.get('tool') != 'eraser')
    if colors:
        out.append('Colours: ' + ', '.join(f'{c}x{n}' for c, n in colors.most_common(10)))
    dashes = Counter(s['dash'] for s in st if s.get('dash'))
    if dashes:
        out.append('Line types: ' + ', '.join(f'{n} {k}' for k, n in dashes.most_common()))
    hl = sum(1 for s in st if s.get('highlight'))
    press = sum(1 for s in st if s.get('pressure'))
    if hl or press:
        out.append(f'Highlighter strokes: {hl}   Strokes drawn with pressure: {press}')
    pages = d.get('pages') or []
    if pages:
        pdf = sum(1 for p in pages if p.get('src'))
        out.append(f"Sheet with {len(pages)} page(s)" + (f", {pdf} of them pages of an opened PDF" if pdf else '') + ': '
                   + '; '.join(f"{p['w']:.0f}x{p['h']:.0f} at ({p['x']:.0f},{p['y']:.0f})" for p in pages[:12])
                   + (' ...' if len(pages) > 12 else ''))
    for s in st:
        if s.get('tool') == 'text':
            out.append(f"Text at ({s['x']},{s['y']}) size {s.get('size')} {s.get('font')} {s.get('color')}"
                       + (f" rot {s['rot']}°" if s.get('rot') else '') + f": {s['text']!r}")
        elif s.get('tool') == 'image':
            kb = len(s.get('src', '')) * 3 // 4 // 1024
            out.append(f"Picture at ({s['x']},{s['y']}) {s['w']}x{s['h']}" + (f" rot {s['rot']}°" if s.get('rot') else '') + f", ~{kb} KB")
    return '\n'.join(out)


JS = r'''async ([text, opt]) => {
  const doc = WB.parse(text);
  const pages = doc.pages || [];
  await WB.loadImages(doc.strokes, pages);
  // Everything there is: the drawing and, on a sheet, its pages (drawing outside a page is shown too).
  let c = WB.contentBounds(doc.strokes);
  if (pages.length) {
    const p = WB.pagesBounds(pages);
    c = c ? (() => { const x = Math.min(c.x, p.x), y = Math.min(c.y, p.y); return { x, y, w: Math.max(c.x + c.w, p.x + p.w) - x, h: Math.max(c.y + c.h, p.y + p.h) - y }; })() : p;
  }
  // The board as the app shows it: background, a sheet's pages (with an opened PDF's pages) and
  // their edges, then the ink. Unlike an export, nothing is cut off at a page edge.
  const draw = (box, k) => {
    const ink = WB.renderToCanvas(doc.strokes, box, k, null), w = ink.canvas.width, h = ink.canvas.height;
    k = ink.scale;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (opt.bg) { g.fillStyle = opt.bg; g.fillRect(0, 0, w, h); }
    if (pages.length) {
      g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
      WB.paintPages(g, pages, null);
      g.lineWidth = 1.5 / k; g.strokeStyle = 'rgba(128, 128, 128, 0.9)';
      for (const p of pages) g.strokeRect(p.x, p.y, p.w, p.h);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.drawImage(ink.canvas, 0, 0);
    return { canvas: cv, scale: k };
  };
  let b;
  if (opt.region) b = opt.region;
  else if (opt.savedView) { const v = doc.view, w = 1440 / v.zoom, h = 900 / v.zoom; b = { x: v.x, y: v.y, w, h }; }
  else if (c) { const pad = Math.max(16, Math.max(c.w, c.h) * 0.04); b = { x: c.x - pad, y: c.y - pad, w: c.w + 2 * pad, h: c.h + 2 * pad }; }
  else b = { x: 0, y: 0, w: 400, h: 300 };
  const scale = opt.px / Math.max(b.w, b.h);
  const r = draw(b, scale);
  const out = { png: r.canvas.toDataURL('image/png'), bounds: c, region: b, scale: r.scale, size: [r.canvas.width, r.canvas.height], groups: [], details: [] };

  // Groups: pen strokes and texts whose boxes nearly touch (a word, a drawing), so tiny ones can be found and shown close up.
  const items = doc.strokes.filter((s) => s.tool !== 'eraser' && s.tool !== 'image').map((s) => {
    const q = WB.boundsOf(s), z = Math.max(q.x1 - q.x0, q.y1 - q.y0) + (s.width || 0);
    return { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, g: z * 0.6, z, n: 1, kinds: { [s.tool]: 1 } };
  });
  let merged = true;
  while (merged && items.length > 1 && items.length < 4000) {
    merged = false;
    for (let i = 0; i < items.length; i++) for (let j = items.length - 1; j > i; j--) {
      const A = items[i], B = items[j], g = Math.min(Math.max(A.g, B.g), 3 * Math.min(A.z, B.z));
      // Sizes within 30x of each other only, so tiny writing never disappears into a big drawing beside it.
      if (Math.max(A.z, B.z) <= 30 * Math.min(A.z, B.z) && A.x0 - g <= B.x1 && B.x0 - g <= A.x1 && A.y0 - g <= B.y1 && B.y0 - g <= A.y1) {
        A.x0 = Math.min(A.x0, B.x0); A.y0 = Math.min(A.y0, B.y0); A.x1 = Math.max(A.x1, B.x1); A.y1 = Math.max(A.y1, B.y1);
        A.z = Math.max(A.x1 - A.x0, A.y1 - A.y0); A.g = Math.max(A.g, B.g, Math.min(A.x1 - A.x0, A.y1 - A.y0) * 1.2);   // words on a line join up
        A.n += B.n; for (const k in B.kinds) A.kinds[k] = (A.kinds[k] || 0) + B.kinds[k];
        items.splice(j, 1); merged = true;
      }
    }
  }
  const inView = (q) => q.x1 >= b.x && q.x0 <= b.x + b.w && q.y1 >= b.y && q.y0 <= b.y + b.h;
  for (const q of items) {
    const w = q.x1 - q.x0, h = q.y1 - q.y0, onImage = Math.max(w, h) * r.scale;
    out.groups.push({ x: q.x0, y: q.y0, w, h, n: q.n, kinds: q.kinds, px: onImage, small: onImage < opt.small && inView(q) });
  }
  out.groups.sort((a, b2) => a.y - b2.y || a.x - b2.x);
  // Close-ups of the groups too small to read in the main picture.
  for (const q of out.groups.filter((g) => g.small).slice(0, opt.maxDetails)) {
    const side = Math.max(q.w, q.h, 1e-3), pad = side * 0.3;
    const d = { x: q.x - pad, y: q.y - pad, w: q.w + 2 * pad, h: q.h + 2 * pad };
    const k = opt.detailPx / Math.max(d.w, d.h), rr = draw(d, k);
    out.details.push({ group: q, region: d, png: rr.canvas.toDataURL('image/png') });
  }
  return out;
}'''


def render(text, opt):
    from playwright.sync_api import sync_playwright
    code, source = app_code()
    with sync_playwright() as p:
        browser, err = None, None
        for ch in ('chrome', 'msedge', None):
            try:
                browser = p.chromium.launch(channel=ch) if ch else p.chromium.launch()
                break
            except Exception as e:
                err = e
        if not browser:
            sys.exit(f'No usable Chromium browser for Playwright: {err}')
        page = browser.new_page()
        page.set_content('<!doctype html><meta charset="utf-8"><body></body>')
        for c in code:
            page.add_script_tag(content=c)
        res = page.evaluate(JS, [text, opt])
        browser.close()
    res['source'] = source
    return res


def auto_bg(d):
    """White, unless most of the ink is light (drawn on a dark board): then the dark theme colour."""
    light = dark = 0
    for s in d.get('strokes', []):
        c = s.get('color')
        if s.get('tool') in ('pen', 'text') and isinstance(c, str) and len(c) == 7:
            r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
            if 0.299 * r + 0.587 * g + 0.114 * b > 200: light += 1
            else: dark += 1
    return '#1c1c1e' if light > dark else '#ffffff'


def main():
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('board')
    ap.add_argument('--out', help='PNG path (default: next to the board, NAME.render.png)')
    ap.add_argument('--px', type=int, default=1600, help='longest side of the picture in pixels')
    ap.add_argument('--bg', default='auto', help='auto (default: white, or dark when most ink is light), white, dark (#1c1c1e, the dark theme), none, or #rrggbb')
    ap.add_argument('--region', help='world-coordinate box X,Y,W,H to zoom into')
    ap.add_argument('--saved-view', action='store_true', help='roughly what the user last saw (1440x900 window at the saved view)')
    ap.add_argument('--entry', help='for a gallery backup (.wbgallery/.wbstickers): part of the path of the board to render')
    ap.add_argument('--small', type=float, default=60, help='groups smaller than this many pixels in the main picture get a close-up (default 60)')
    ap.add_argument('--max-details', type=int, default=12, help='at most this many close-ups (default 12)')
    ap.add_argument('--json', action='store_true', help='also print the board JSON, with picture data cut short')
    a = ap.parse_args()

    text = board_text(a.board, a.entry)
    d = json.loads(text)
    print(summary(d))
    if a.json:
        for s in d.get('strokes', []):
            if s.get('src'): s['src'] = s['src'][:60] + '...'
        print(json.dumps(d, ensure_ascii=False)[:20000])

    bg = {'auto': auto_bg(d), 'white': '#ffffff', 'dark': '#1c1c1e', 'none': None}.get(a.bg, a.bg)
    region = None
    if a.region:
        x, y, w, h = (float(v) for v in a.region.split(','))
        region = {'x': x, 'y': y, 'w': w, 'h': h}
    res = render(text, {'px': a.px, 'bg': bg, 'region': region, 'savedView': a.saved_view, 'small': a.small, 'maxDetails': a.max_details, 'detailPx': 900})
    out = a.out or os.path.splitext(a.board)[0] + '.render.png'
    with open(out, 'wb') as f:
        f.write(base64.b64decode(res['png'].split(',', 1)[1]))
    b = res['bounds']
    print('Content bounds (world units): ' + (f"x {b['x']:.0f}..{b['x'] + b['w']:.0f}, y {b['y']:.0f}..{b['y'] + b['h']:.0f}" if b else 'empty'))
    print(f"Rendered region {res['region']} at {res['scale']:.3f} px/unit -> {res['size'][0]}x{res['size'][1]} px")
    print(f"App code from: {res['source']}")
    print(f"Groups of strokes/texts ({len(res['groups'])}), top to bottom; 'px' is their size in the main picture:")
    for g in res['groups'][:60]:
        kinds = ', '.join(f'{n} {k}' for k, n in g['kinds'].items())
        print(f"  x {g['x']:.0f} y {g['y']:.0f}  {g['w']:.1f}x{g['h']:.1f} units, {g['px']:.0f} px, {kinds}" + ('  << SMALL, see close-up' if g['small'] else ''))
    if len(res['groups']) > 60:
        print(f"  ... and {len(res['groups']) - 60} more")
    small = sum(1 for g in res['groups'] if g['small'])
    if small > len(res['details']):
        print(f"{small - len(res['details'])} more small groups have no close-up; render them with --region.")
    stem = os.path.splitext(out)[0]
    print(f'PNG: {os.path.abspath(out)}')
    for i, d in enumerate(res['details'], 1):
        path = f'{stem}.detail-{i}.png'
        with open(path, 'wb') as f:
            f.write(base64.b64decode(d['png'].split(',', 1)[1]))
        g = d['group']
        print(f"Close-up {i} (x {g['x']:.0f} y {g['y']:.0f}, {g['w']:.1f}x{g['h']:.1f} units): {os.path.abspath(path)}")


if __name__ == '__main__':
    main()
