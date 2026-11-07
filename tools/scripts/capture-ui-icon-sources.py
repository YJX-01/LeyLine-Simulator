"""Refresh the image path map from the already approved, pinned source commits."""
import argparse
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'docs/constant/ui-icon-sources.json'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--from-cache', action='store_true', help='Use the captured .references trees without network access')
args = parser.parse_args()
current = json.loads(TARGET.read_text(encoding='utf-8'))


def tree(repository, commit, cache_name):
    cache = ROOT / '.references' / cache_name
    if args.from_cache:
        result = json.loads(cache.read_text(encoding='utf-8'))
    else:
        url = f'https://api.github.com/repos/{repository}/git/trees/{commit}?recursive=1'
        request = urllib.request.Request(url, headers={'User-Agent': 'LeyLine-asset-preparation/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(result), encoding='utf-8')
    if result.get('sha') != commit or result.get('truncated'):
        raise ValueError(f'Unverified or truncated image tree: {repository}')
    return result['tree']


paths = {}
for item in tree(current['repository'], current['commit'], 'optimizer-tree.json'):
    path = item['path']
    if path.startswith('libs/gi/assets/src/gen/') and path.endswith('.png'):
        paths.setdefault(Path(path).stem, []).append(path)
normal = current['normalAttackSource']
normal_paths = {}
for item in tree(normal['repository'], normal['commit'], 'wiki-tree.json'):
    path = item['path']
    if path.startswith('resources/talent/Skill_A_') and path.endswith('.png'):
        normal_paths[Path(path).stem] = path
result = {
    'repository': current['repository'], 'commit': current['commit'],
    'paths': dict(sorted(paths.items())),
    'normalAttackSource': {
        'repository': normal['repository'], 'commit': normal['commit'], 'paths': dict(sorted(normal_paths.items())),
    },
}
TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'sourceFilenames': len(paths), 'normalAttackIcons': len(normal_paths)}))
