"""Refresh ignored image-tree caches using the manifest's pinned repositories."""
import argparse
import json
from pathlib import Path
import urllib.request
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'lib'))
from content_source import read_content, write_content

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--from-cache', action='store_true', help='Verify existing .references trees without network access')
args = parser.parse_args()
manifest = read_content(ROOT / 'assets/manifest.json')
if manifest['formatVersion'] != 3:
    raise ValueError('Asset manifest formatVersion must be 3')

counts = {}
for source in manifest['capture']['spriteRepositories']:
    repository = source['repository']
    commit = manifest['sourceCommits'][repository]
    cache = ROOT / '.references' / source['cacheFile']
    if args.from_cache:
        result = read_content(cache)
    else:
        url = f'https://api.github.com/repos/{repository}/git/trees/{commit}?recursive=1'
        request = urllib.request.Request(url, headers={'User-Agent': 'LeyLine-asset-preparation/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    if result.get('sha') != commit or result.get('truncated'):
        raise ValueError(f'Unverified or truncated image tree: {repository}')
    paths = [entry['path'] for entry in result['tree']
             if entry['path'].startswith(source['pathPrefix']) and entry['path'].endswith('.png')]
    if not args.from_cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        write_content(cache, result)
    counts[repository] = len(paths)

print(json.dumps(counts))
