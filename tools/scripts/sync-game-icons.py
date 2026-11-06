"""Prepare verified, compressed offline game icons from pinned local references.

Requires Python + Pillow. Rejects server placeholders even when HTTP returns 200.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import subprocess
import urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
MONA = ROOT / '.references/mona-current'
DB = ROOT / '.references/genshin-db/src/data'
CACHE = ROOT / '.references/game-icon-downloads'
OUTPUT = ROOT / 'src/web/public/game-icons'
COMMIT = '589ac6919057709924c0c20d5a9d673fe9b0be1a'
MONA_URL = f'https://raw.githubusercontent.com/TwiceDrop/genshin_artifact/{COMMIT}/'
PLACEHOLDER = 'ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b'
TRANSFORM = 'square-portrait-v1'
WEAPON_TRANSFORM = 'full-weapon-square-hq-v2'
ELEMENT_TRANSFORM = 'element-hq-v2'
TRANSPARENT_AVATARS = {'manekin': 'UI_AvatarIcon_MannequinBoy', 'manekina': 'UI_AvatarIcon_MannequinGirl'}
CACHE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def sha(content):
    return hashlib.sha256(content).hexdigest()

def generated(kind):
    text = (MONA / f'src/assets/_gen_{kind}.js').read_text(encoding='utf-8')
    return json.loads(text.split('export default', 1)[1].strip().rstrip(';'))

def valid_image(content):
    if sha(content) == PLACEHOLDER:
        raise ValueError('Server returned a known placeholder image')
    image = Image.open(io.BytesIO(content)).convert('RGBA')
    if image.getchannel('A').getextrema()[1] < 128:
        raise ValueError('Image is blank or a nearly transparent server placeholder')
    return image

if subprocess.check_output(['git', '-C', str(MONA), 'rev-parse', 'HEAD'], text=True).strip() != COMMIT:
    raise RuntimeError('Mona reference commit changed; review its source and catalog first')
locale = read(MONA / 'src/i18n/generated/zh-cn.json')
metadata = {kind: {locale[item['nameLocale']]: item for item in generated(group).values()} for kind, group in [('characters', 'character'), ('weapons', 'weapon'), ('artifacts', 'artifact')]}
catalog = read(ROOT / 'src/game-data/src/real-data/catalog.json')
previous = read(OUTPUT / 'manifest.json') if (OUTPUT / 'manifest.json').exists() else {'assets': []}
existing = {(item['kind'], item['key']): item for item in previous['assets']}
index = {'characters': {}, 'weapons': {}, 'artifacts': {}, 'elements': {}}
tasks = []
for kind, group, size in [('characters', 'characters', 128), ('weapons', 'weapons', 256), ('artifacts', 'sets', 96)]:
    images = read(DB / f'image/{kind}.json')
    for entry in catalog[group]:
        community = metadata[kind].get(entry['name'], {})
        image = images.get(entry['id'], {})
        variants = {'flower': 'flower', 'plume': 'feather', 'sands': 'sand', 'goblet': 'cup', 'circlet': 'head'} if kind == 'artifacts' else {'icon': 'icon'}
        for slot, mona_slot in variants.items():
            key = entry['id'] + ('-' + slot if kind == 'artifacts' else '')
            url = community.get('avatar' if kind == 'characters' else 'url') if kind != 'artifacts' else community.get(mona_slot, {}).get('url')
            fallback = image.get('mihoyo_' + slot) if kind == 'artifacts' else image.get('mihoyo_icon')
            if not url and not fallback and kind == 'artifacts':
                continue
            sources = []
            if url:
                sources.append((MONA / 'public' / url.lstrip('/'), MONA_URL + 'public/' + url.lstrip('/')) if url.startswith('/') else (None, url))
            # Verified former sources can be reused; placeholder sources never qualify.
            prior = existing.get((kind, key))
            if prior and prior['sourceSha256'] != PLACEHOLDER:
                prior_url = prior['sourceUrl']
                path = MONA / prior_url[len(MONA_URL):] if prior_url.startswith(MONA_URL) else None
                sources.append((path, prior_url))
            if fallback:
                sources.append((None, fallback.replace('upload-os-bbs.mihoyo.com', 'upload-bbs.mihoyo.com')))
            if kind == 'characters' and image.get('hoyowiki_icon'):
                sources.append((None, image['hoyowiki_icon']))
            if kind == 'characters' and key in TRANSPARENT_AVATARS:
                sources = [(None, f"https://enka.network/ui/{TRANSPARENT_AVATARS[key]}.png")]
            if kind == 'weapons':
                sources = [(None, f"https://enka.network/ui/{image['filename_gacha']}.png")]
            tasks.append((kind, key, entry, sources, size))
for element in ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro']:
    path = MONA / f'src/images/misc/{element}.png'
    tasks.append(('elements', element, {'id': element, 'name': element}, [(path, MONA_URL + path.relative_to(MONA).as_posix())], 128))

def convert(task):
    kind, key, entry, sources, size = task
    failures = []
    prior = existing.get((kind, key))
    if prior and prior['sourceSha256'] != PLACEHOLDER and (kind != 'characters' or prior.get('transform') == ('square-transparent-v2' if key in TRANSPARENT_AVATARS else TRANSFORM)) and (kind != 'weapons' or prior.get('transform') == WEAPON_TRANSFORM) and (kind != 'elements' or prior.get('transform') == ELEMENT_TRANSFORM):
        path = OUTPUT / prior['file']
        if path.exists() and sha(path.read_bytes()) == prior['sha256']:
            try:
                checked = valid_image(path.read_bytes())
                return {**prior, 'alphaMax': checked.getchannel('A').getextrema()[1]}, None
            except ValueError:
                pass
    for local, url in sources:
        try:
            if local and local.exists():
                source = local.read_bytes()
            else:
                cached = CACHE / (sha(url.encode()) + '.png')
                if not cached.exists():
                    request = urllib.request.Request(url, headers={'User-Agent': 'LeyLine-asset-preparation/1.0'})
                    with urllib.request.urlopen(request, timeout=12) as response:
                        content = response.read(8 * 1024 * 1024)
                    valid_image(content)
                    cached.write_bytes(content)
                source = cached.read_bytes()
            image = valid_image(source)
            original_size = image.size
            if kind == 'characters':
                if 'image/crop' not in url:
                    edge = min(image.size) * 0.8
                    left, top = (image.width - edge) / 2, image.height * 0.02
                    image = image.crop((left, top, left + edge, top + edge))
                image = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS, centering=(0.5, 0.3))
            else:
                if kind == 'weapons':
                    # Remove only transparent padding; never fit/crop the weapon into a square.
                    bounds = image.getchannel('A').point(lambda alpha: 255 if alpha > 16 else 0).getbbox()
                    if bounds:
                        image = image.crop(bounds)
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                if kind == 'weapons':
                    canvas = Image.new('RGBA', (size, size))
                    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))
                    image = canvas
            destination = OUTPUT / f'{kind}-{key}.webp'
            image.save(destination, 'WEBP', quality=90 if kind == 'elements' else 88 if kind == 'weapons' else 76, method=6, exact=True)
            content = destination.read_bytes()
            valid_image(content)
            if len(content) > 32768:
                raise ValueError('Compressed icon exceeds 32 KiB')
            return {'kind': kind, 'key': key, 'id': entry['id'], 'name': entry['name'], 'element': entry.get('element'), 'file': destination.name, 'bytes': len(content), 'sha256': sha(content), 'sourceUrl': url, 'sourceSha256': sha(source), 'sourceBytes': len(source), 'sourceDimensions': original_size, 'dimensions': image.size, 'alphaMax': image.getchannel('A').getextrema()[1], **({'transform': 'square-transparent-v2' if key in TRANSPARENT_AVATARS else TRANSFORM} if kind == 'characters' else {'transform': WEAPON_TRANSFORM} if kind == 'weapons' else {'transform': ELEMENT_TRANSFORM} if kind == 'elements' else {})}, None
        except Exception as error:
            failures.append(str(error))
    return None, {'kind': kind, 'key': key, 'reason': '; '.join(failures) or 'No image address in pinned reference'}

assets, missing = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for asset, failure in pool.map(convert, tasks):
        if asset:
            assets.append(asset)
            index[asset['kind']][asset['key']] = {key: asset[key] for key in ['file', 'name', 'element'] if asset.get(key) is not None}
            index[asset['kind']][asset['key']]['revision'] = asset['sha256'][:12]
        else:
            missing.append(failure)
total = sum(asset['bytes'] for asset in assets)
if total > 6 * 1024 * 1024:
    raise RuntimeError('Offline icon library exceeds 6 MiB')
# Invalid prior outputs must never remain in the application directory.
kept = {asset['file'] for asset in assets}
for path in OUTPUT.glob('*.webp'):
    if path.name not in kept:
        path.unlink()
manifest = {'formatVersion': 1, 'sourceCommits': {'TwiceDrop/genshin_artifact': COMMIT, 'genshin-db': '8e5badd60b5d894284ccc927a56c9683529d2592', 'legacy-mona': 'beaced4d82619aa86920d0054ab6114b5fc5608f', 'legacy-PathOfGenshin/resources': '015a2493b5672b28576ab78ffbcffde2ea0c9844'}, 'rights': 'Game artwork © miHoYo / HoYoverse. Unofficial tool; code licenses do not grant artwork rights.', 'compression': {'format': 'WebP', 'quality': 76, 'method': 6, 'transparent': True, 'avatarTransform': TRANSFORM, 'weaponTransform': WEAPON_TRANSFORM, 'elementTransform': ELEMENT_TRANSFORM, 'elementQuality': 90, 'elementCanvas': [128, 128], 'weaponQuality': 88, 'weaponCanvas': [256, 256]}, 'rejectedSourceHashes': [PLACEHOLDER], 'budgets': {'maxAssetBytes': 32768, 'maxTotalBytes': 6291456}, 'totalBytes': total, 'totalSourceBytes': sum(asset['sourceBytes'] for asset in assets), 'assets': assets, 'missing': missing}
(OUTPUT / 'manifest.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())
(ROOT / 'src/web/src/assets/game-icon-index.json').write_bytes((json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
print(json.dumps({'icons': len(assets), 'bytes': total, 'missing': missing}, ensure_ascii=True))
