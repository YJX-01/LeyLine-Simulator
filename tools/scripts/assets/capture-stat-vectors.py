"""Prepare vector candidates from pinned JSX geometry and manifest derivations."""
import argparse
import copy
from html import escape
import json
from pathlib import Path
import re
import time
import urllib.request
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'lib'))
from asset_capture import read_capture, write_candidate
from content_source import read_content, write_content

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--offline', action='store_true')
parser.add_argument('--artifact-slots', action='store_true', help='Prepare artifact slot vectors instead of stat vectors')
parser.add_argument('--out', type=Path, default=ROOT / 'artifacts/content-candidates' / ('vectors-' + str(time.time_ns())))
args = parser.parse_args()
output = args.out.resolve()
candidate_root = (ROOT / 'artifacts/content-candidates').resolve()
if not output.is_relative_to(candidate_root) or output == candidate_root or output.exists():
    parser.error('--out must be a new directory beneath artifacts/content-candidates')

manifest = read_capture(ROOT)
if manifest['formatVersion'] != 4:
    raise ValueError('Asset manifest formatVersion must be 4')
candidate = copy.deepcopy(manifest)
kind = 'artifactSlots' if args.artifact_slots else 'stats'
entries = [entry for entry in candidate['assets'] if entry['kind'] == kind]
cache = ROOT / '.references/stat-vector-sources' / manifest['sourceCommits']['frzyc/genshin-optimizer']
geometry = {}


def bundled_svg(raw, entry):
    text = raw.decode('utf-8')
    if json.dumps('./' + entry['sourceFilename']) + ':' + json.dumps(entry['sourceModule']) not in text:
        raise ValueError(f'SVG source mapping mismatch: {entry["sourceFilename"]}')
    module = re.search(r'"?' + re.escape(entry['sourceModule']) + r'"?:function\([^)]*\)\{', text)
    if not module:
        raise ValueError(f'Missing SVG module: {entry["sourceFilename"]}')
    body = text[module.end():]
    boundary = re.search(r'\},(?:"[a-f0-9]{4}"|[a-f0-9]{4}):function', body)
    if boundary:
        body = body[:boundary.start()]
    if not body.startswith('t.exports={functional:!0,render('):
        raise ValueError(f'Unexpected SVG module: {entry["sourceFilename"]}')
    view_box = re.search(r'viewBox:"([^"]+)"', body)
    if not view_box or view_box[1] != '0 0 15 15':
        raise ValueError(f'Unexpected SVG viewBox: {entry["sourceFilename"]}')
    allowed = {'d', 'fill', 'fill-rule', 'fill-opacity', 'opacity', 'stroke', 'stroke-width'}
    shapes = []
    for match in re.finditer(r'a\("path",\{(?:staticStyle:\{[^}]*\},)?attrs:\{([^}]*)\}', body):
        attributes = {}
        for value in re.finditer(r'(?:("(?:[^"\\]|\\.)*")|([a-zA-Z]+)):("(?:[^"\\]|\\.)*")', match[1]):
            name = json.loads(value[1]) if value[1] else value[2]
            if name in allowed:
                attributes[name] = json.loads(value[3]).replace('currentColor', 'white')
        if not attributes.get('d'):
            raise ValueError(f'Missing SVG path: {entry["sourceFilename"]}')
        shapes.append('<path ' + ' '.join(f'{name}="{escape(value, quote=True)}"' for name, value in attributes.items()) + '/>')
    if not shapes:
        raise ValueError(f'Missing SVG geometry: {entry["sourceFilename"]}')
    return '<g transform="scale(1.6)">' + ''.join(shapes) + '</g>'


for entry in entries:
    source = (ROOT / '.references/yatta-stat-sources' / entry['sourceVersion']) if entry.get('sourceModule') else cache / (entry['sourceFilename'] + '.tsx')
    if source.exists():
        raw = source.read_bytes()
    else:
        if args.offline:
            raise ValueError(f'Missing cached vector source: {source}')
        with urllib.request.urlopen(entry['sourceUrl'], timeout=20) as response:
            raw = response.read(256 * 1024)
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(raw)
    if entry.get('sourceModule'):
        geometry[entry['key']] = bundled_svg(raw, entry)
    else:
        shapes = re.findall(r'<path\b[\s\S]*?/>', raw.decode('utf-8'))
        if not shapes:
            raise ValueError(f'No path geometry in {source}')
        shapes = [re.sub(r'\s+', ' ', shape).replace('fillRule=', 'fill-rule=').replace('clipRule=', 'clip-rule=') for shape in shapes]
        geometry[entry['key']] = ''.join(shapes)
    entry['sourceBytes'] = len(raw)

prepared = []
for entry in entries:
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="white">' + geometry[entry['key']] + '</svg>\n'
    content = svg.encode('utf-8')
    destination = (output / Path(entry['file']).relative_to('assets')).resolve()
    if not destination.is_relative_to(output):
        raise ValueError(f'Vector candidate outside output directory: {entry["key"]}')
    entry['bytes'] = len(content)
    prepared.append((destination, content))

candidate['totalBytes'] = sum(entry['bytes'] for entry in candidate['assets'])
output.mkdir(parents=True, exist_ok=False)
for destination, content in prepared:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
write_candidate(output, candidate)
print(json.dumps({'vectors': len(entries), 'bundledSvg': sum(bool(entry.get('sourceModule')) for entry in entries), 'output': str(output)}))
