"""Capture pinned SVG paths and regenerate documented outline variants; no JSX execution."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'docs/constant/ui-stat-sources.json'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--offline', action='store_true')
args = parser.parse_args()
config = json.loads(CONFIG.read_text(encoding='utf-8'))
cache = ROOT / '.references/stat-vector-sources'
cache.mkdir(parents=True, exist_ok=True)

for entry in config['icons']:
    if entry.get('derivedFrom'):
        continue
    source = cache / (entry['sourceFilename'] + '.tsx')
    if not source.exists():
        if args.offline:
            raise ValueError(f'Missing cached vector source: {source}')
        with urllib.request.urlopen(entry['sourceUrl'], timeout=20) as response:
            source.write_bytes(response.read(256 * 1024))
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != entry['sourceSha256']:
        raise ValueError(f'Unverified vector source: {source}')
    shapes = re.findall(r'<path\b[\s\S]*?/>', raw.decode('utf-8'))
    if not shapes:
        raise ValueError(f'No path geometry in {source}')
    shapes = [re.sub(r'\s+', ' ', shape).replace('fillRule=', 'fill-rule=').replace('clipRule=', 'clip-rule=') for shape in shapes]
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="white">' + ''.join(shapes) + '</svg>\n'
    target = ROOT / entry['vectorPath']
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(svg.encode())
    entry['vectorSha256'] = hashlib.sha256(svg.encode()).hexdigest()

for entry in config['icons']:
    if not entry.get('derivedFrom'):
        continue
    parent = next(item for item in config['icons'] if item['id'] == entry['derivedFrom'])
    body = (ROOT / parent['vectorPath']).read_text(encoding='utf-8').split('fill="white">', 1)[1].split('</svg>')[0]
    paths = re.findall(r'<path\b[^>]*?\bd="([^"]+)"', body)
    recipe = entry['derivation']
    method = recipe['method']
    if method == 'blade-only-cutout':
        shape = '<path fill-rule="evenodd" d="' + paths[0] + ' ' + recipe['cutoutPath'] + '"/>'
    elif method == 'outer-silhouette-stroke':
        outer = paths[0].split(' Z M ', 1)[0] + ' Z'
        shape = '<defs><clipPath id="shape"><path d="' + outer + '"/></clipPath></defs><path d="' + outer + '" clip-path="url(#shape)" fill="none" stroke="white" stroke-width="' + str(recipe['strokeWidth']) + '" stroke-linejoin="round"/>'
    elif method == 'drop-outline-only':
        outline = paths[-1]
        position = outline.find(recipe['outlineStart'])
        if position < 0:
            raise ValueError('Missing source drop outline')
        shape = '<path d="' + outline[position:] + '"/>'
    else:
        raise ValueError(f'Unknown stat derivation: {method}')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="white">' + shape + '</svg>\n'
    (ROOT / entry['vectorPath']).write_bytes(svg.encode())
    entry['vectorSha256'] = hashlib.sha256(svg.encode()).hexdigest()

CONFIG.write_bytes((json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode())
print(json.dumps({'vectors': len(config['icons']), 'derived': sum(bool(item.get('derivedFrom')) for item in config['icons'])}))
