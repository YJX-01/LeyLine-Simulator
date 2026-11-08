"""Prepare verified, compressed offline game icons from pinned local references.

Requires Python + Pillow. Rejects server placeholders even when HTTP returns 200.
"""
import threading
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import subprocess
import urllib.request
from PIL import Image, ImageOps
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MONA = ROOT / '.references/mona-current'
DB = ROOT / '.references/genshin-db/src/data'
CACHE = ROOT / '.references/game-icon-downloads'
OUTPUT = ROOT / 'src/web/public'
COMMIT = '589ac6919057709924c0c20d5a9d673fe9b0be1a'
MONA_URL = f'https://raw.githubusercontent.com/TwiceDrop/genshin_artifact/{COMMIT}/'
PLACEHOLDER = 'ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b'
TRANSFORM = 'square-portrait-v1'
WEAPON_TRANSFORM = 'equipment-detail-square-v4'
CATALYST_TRANSFORM = 'full-weapon-square-v4'
ARTIFACT_TRANSFORM = 'artifact-square-v2'
DB_COMMIT = '8e5badd60b5d894284ccc927a56c9683529d2592'
DOWNLOAD_LOCKS = {}
LOCK = threading.Lock()
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
if subprocess.check_output(['git', '-C', str(DB.parents[1]), 'rev-parse', 'HEAD'], text=True).strip() != DB_COMMIT:
    raise RuntimeError('genshin-db reference commit changed; review first')
locale = read(MONA / 'src/i18n/generated/zh-cn.json')
metadata = {kind: {locale[item['nameLocale']]: item for item in generated(group).values()} for kind, group in [('characters', 'character'), ('weapons', 'weapon'), ('artifacts', 'artifact')]}
catalog = read(ROOT / 'src/game-data/src/real-data/catalog.json')
previous = read(OUTPUT / 'game-icon-manifest.json') if (OUTPUT / 'game-icon-manifest.json').exists() else {'assets': []}
existing = {(item['kind'], item['key']): item for item in previous['assets']}
index = {kind: {} for kind in ['characters', 'weapons', 'artifacts', 'artifactSlots', 'elements', 'skills', 'constellations', 'buffs', 'stats']}

SPRITES = read(ROOT / 'docs/constant/ui-icon-sources.json')

def sprite_sources(filename):
    sources = [(None, f"https://raw.githubusercontent.com/{SPRITES['repository']}/{SPRITES['commit']}/{path}") for path in SPRITES['paths'].get(filename, [])[:1]]
    normal = SPRITES['normalAttackSource']
    if filename in normal['paths']:
        sources.append((None, f"https://raw.githubusercontent.com/{normal['repository']}/{normal['commit']}/{normal['paths'][filename]}"))
    return sources

def weapon_transform(entry):
    return CATALYST_TRANSFORM if entry.get('weaponType') == 'WEAPON_CATALYST' else WEAPON_TRANSFORM
def expected_transform(kind, key, entry):
    if kind == 'characters':
        return 'square-transparent-v2' if key in TRANSPARENT_AVATARS else TRANSFORM
    if kind == 'weapons':
        return weapon_transform(entry)
    if kind == 'artifacts':
        return ARTIFACT_TRANSFORM
    if kind == 'elements':
        return ELEMENT_TRANSFORM
    if kind == 'artifactSlots':
        return 'artifact-slot-vector-v1'
    return 'combat-glyph-contain-v2' if kind in ['buffs', 'stats'] else 'transparent-contain-hq-v1'

tasks = []
for kind, group, size in [('characters', 'characters', 128), ('weapons', 'weapons', 128), ('artifacts', 'sets', 128)]:
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
                sources = sprite_sources(image['filename_gacha'] if entry['weaponType'] == 'WEAPON_CATALYST' else image['filename_icon'])
                # Full art is a verified fallback; detail framing is applied below.
                if prior:
                    sources.append((None, prior['sourceUrl']))
            tasks.append((kind, key, entry, sources, size))
for element in ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro']:
    path = MONA / f'src/images/misc/{element}.png'
    tasks.append(('elements', element, {'id': element, 'name': element}, [(path, MONA_URL + path.relative_to(MONA).as_posix())], 128))

for entry in read(ROOT / 'docs/constant/ui-artifact-slot-sources.json')['icons']:
    tasks.append(('artifactSlots', entry['id'], entry, [(None, entry['sourceUrl'])], 128))


SCOPE = read(ROOT / 'docs/constant/ui-icon-scope.json')
if SCOPE['sourceCommit'] != DB_COMMIT:
    raise RuntimeError('Review combat/utility passive scope for the updated genshin-db snapshot')
excluded = []
normal_attacks = {}

# Store the reference identity, not inferred links to simulator mechanics.
for kind, folder, fields in [
    ('skills', 'talents', ['combat1', 'combat2', 'combat3', 'passive1', 'passive2', 'passive3', 'passive4']),
    ('constellations', 'constellations', [f'c{i}' for i in range(1, 7)]),
]:
    for character, images in read(DB / f'image/{folder}.json').items():
        localized_path = DB / f'ChineseSimplified/{folder}/{character}.json'
        localized = read(localized_path) if localized_path.exists() else {}
        for field in fields:
            filename = images.get('filename_' + field)
            if not filename or filename == 'None':
                continue
            key = f'{character}-{field}'
            details = localized.get(field, {})
            entry = {'id': key, 'name': details.get('name', key), 'character': character, 'slot': field}
            if kind == 'skills' and field.startswith('passive') and field not in SCOPE['defaultCombatPassives'] and key not in SCOPE['extraCombatPassives']:
                excluded.append({'kind': kind, 'key': key, 'name': entry['name'], 'reason': 'Non-combat utility/exploration passive; excluded by reviewed scope'})
                continue
            if kind == 'skills' and field == 'combat1':
                shared = normal_attacks.setdefault(filename, {'id': 'normal-' + filename.lower(), 'name': '通用普通攻击 · ' + filename, 'slot': 'combat1', 'aliases': []})
                shared['aliases'].append({'key': key, 'name': entry['name'], 'character': character, 'slot': field})
            else:
                tasks.append((kind, key, entry, sprite_sources(filename), 128))
for filename, entry in normal_attacks.items():
    tasks.append(('skills', entry['id'], entry, sprite_sources(filename), 128))
BUFF_SOURCES = read(ROOT / 'docs/constant/ui-buff-sources.json')
for entry in BUFF_SOURCES['icons']:
    tasks.append(('buffs', entry['id'], entry, [(None, entry['sourceUrl'])], 128))

STAT_SOURCES = read(ROOT / 'docs/constant/ui-stat-sources.json')
for entry in STAT_SOURCES['icons']:
    tasks.append(('stats', entry['id'], entry, [(None, entry['sourceUrl'])], 128))

def convert(task):
    kind, key, entry, sources, size = task
    if kind in ['stats', 'artifactSlots']:
        content = (ROOT / entry['vectorPath']).read_bytes()
        if sha(content) != entry['vectorSha256']:
            raise ValueError(f'Unverified canonical vector: {key}')
        svg = ET.fromstring(content)
        if svg.tag != '{http://www.w3.org/2000/svg}svg' or not svg.findall('.//{http://www.w3.org/2000/svg}path'):
            raise ValueError(f'Invalid canonical vector: {key}')
        destination = OUTPUT / kind / f'{key}.svg'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        return {'kind': kind, 'key': key, 'id': key, 'name': entry['name'], 'file': destination.relative_to(OUTPUT).as_posix(), 'format': 'SVG', 'bytes': len(content), 'sha256': sha(content), 'sourceUrl': entry['sourceUrl'], 'sourceSha256': entry['sourceSha256'], 'sourceBytes': entry['sourceBytes'], 'sourceDimensions': [24, 24], 'dimensions': [128, 128], 'alphaMax': 255, 'transform': 'stat-vector-v4' if kind == 'stats' else 'artifact-slot-vector-v1', 'vectorPath': entry['vectorPath'], 'vectorSha256': entry['vectorSha256'], **{field: entry[field] for field in ['aliases', 'derivedFrom', 'derivation'] if field in entry}}, None
    failures = []
    prior = existing.get((kind, key))
    if prior and prior['sourceSha256'] != PLACEHOLDER and prior.get('transform') == expected_transform(kind, key, entry):
        path = OUTPUT / prior['file']
        if path.exists() and sha(path.read_bytes()) == prior['sha256']:
            try:
                checked = valid_image(path.read_bytes())
                destination = OUTPUT / kind / f'{key}.webp'
                destination.parent.mkdir(parents=True, exist_ok=True)
                if path != destination:
                    destination.write_bytes(path.read_bytes())
                return {**prior, **({'weaponType': entry['weaponType'], 'framing': prior.get('framing', 'native')} if kind == 'weapons' else {}), **({'aliases': entry['aliases']} if entry.get('aliases') else {}), 'sourceUrl': prior['sourceUrl'], 'file': destination.relative_to(OUTPUT).as_posix(), 'alphaMax': checked.getchannel('A').getextrema()[1]}, None
            except ValueError:
                pass
    for local, url in sources:
        try:
            if local and local.exists():
                source = local.read_bytes()
            else:
                cached = CACHE / (sha(url.encode()) + '.png')
                with LOCK:
                    download_lock = DOWNLOAD_LOCKS.setdefault(url, threading.Lock())
                with download_lock:
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
                    # Native equipment art already has the desired detail composition.
                    bounds = image.getchannel('A').point(lambda alpha: 255 if alpha > 16 else 0).getbbox()
                    if bounds:
                        image = image.crop(bounds)
                    if entry.get('weaponType') != 'WEAPON_CATALYST' and 'UI_Gacha_' in url:
                        # Fallback to the upper decorative/guard region of full art.
                        edge = round(max(image.size) * 0.64)
                        image = image.crop((max(0, image.width - edge), 0, max(0, image.width - edge) + edge, edge))
                if kind in ['buffs', 'stats', 'artifactSlots']:
                    image = ImageOps.contain(image, (size, size), Image.Resampling.LANCZOS)
                else:
                    image.thumbnail((size, size), Image.Resampling.LANCZOS)
                if kind in ['weapons', 'artifacts', 'artifactSlots', 'skills', 'constellations', 'buffs', 'stats']:
                    canvas = Image.new('RGBA', (size, size))
                    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))
                    image = canvas
            destination = OUTPUT / kind / f'{key}.webp'
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, 'WEBP', quality=90 if kind == 'elements' else 88 if kind in ['weapons', 'artifacts'] else 88 if kind in ['skills', 'constellations', 'buffs', 'stats'] else 76, method=6, exact=True)
            content = destination.read_bytes()
            valid_image(content)
            if len(content) > 32768:
                raise ValueError('Compressed icon exceeds 32 KiB')
            return {'kind': kind, 'key': key, 'id': entry['id'], 'name': entry['name'], 'element': entry.get('element'), 'file': destination.relative_to(OUTPUT).as_posix(), 'bytes': len(content), 'sha256': sha(content), 'sourceUrl': url, 'sourceSha256': sha(source), 'sourceBytes': len(source), 'sourceDimensions': original_size, 'dimensions': image.size, 'alphaMax': image.getchannel('A').getextrema()[1], **({'transform': 'square-transparent-v2' if key in TRANSPARENT_AVATARS else TRANSFORM} if kind == 'characters' else {'transform': weapon_transform(entry), 'weaponType': entry['weaponType'], 'framing': 'full-art-detail-crop' if 'UI_Gacha_' in url and entry['weaponType'] != 'WEAPON_CATALYST' else 'native'} if kind == 'weapons' else {'transform': ELEMENT_TRANSFORM} if kind == 'elements' else {'transform': ARTIFACT_TRANSFORM} if kind == 'artifacts' else {'transform': expected_transform(kind, key, entry), **{field: entry[field] for field in ['character', 'slot', 'aliases', 'sourceFilename'] if field in entry}})}, None
        except Exception as error:
            failures.append(str(error))
    return None, {'kind': kind, 'key': key, 'reason': '; '.join(failures) or 'No image address in pinned reference'}

assets, missing = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for asset, failure in pool.map(convert, tasks):
        if asset:
            if asset['kind'] == 'characters':
                asset['rarity'] = read(DB / f"English/characters/{asset['id']}.json")['rarity']
            elif asset['kind'] == 'weapons':
                asset['rarity'] = next(item['rarity'] for item in catalog['weapons'] if item['id'] == asset['id'])
            assets.append(asset)
            index[asset['kind']][asset['key']] = {key: asset[key] for key in ['file', 'name', 'element', 'rarity'] if asset.get(key) is not None}
            index[asset['kind']][asset['key']]['revision'] = asset['sha256'][:12]
            for alias in asset.get('aliases', []):
                index[asset['kind']][alias['key']] = {**index[asset['kind']][asset['key']], 'name': alias['name']}
        else:
            missing.append(failure)
for alias in STAT_SOURCES.get('buffAliases', []):
    icon = index['stats'][alias['stat']]
    index['buffs'][alias['key']] = {**icon, 'name': alias['name']}

total = sum(asset['bytes'] for asset in assets)
if total > 16 * 1024 * 1024:
    raise RuntimeError('Offline icon library exceeds 16 MiB')
# Invalid prior outputs must never remain in the application directory.
kept = {asset['file'] for asset in assets}
for directory in [*(OUTPUT / kind for kind in index), OUTPUT / 'game-icons']:
    for path in directory.rglob('*'):
        if path.suffix in ['.webp', '.svg'] and path.relative_to(OUTPUT).as_posix() not in kept:
            path.unlink()
legacy = OUTPUT / 'game-icons'
if legacy.exists() and not any(legacy.iterdir()):
    legacy.rmdir()
manifest = {'formatVersion': 2, 'sourceCommits': {**BUFF_SOURCES['sourceCommits'], 'TwiceDrop/genshin_artifact': COMMIT, SPRITES['repository']: SPRITES['commit'], SPRITES['normalAttackSource']['repository']: SPRITES['normalAttackSource']['commit'], 'genshin-db': '8e5badd60b5d894284ccc927a56c9683529d2592', 'legacy-mona': 'beaced4d82619aa86920d0054ab6114b5fc5608f', 'legacy-PathOfGenshin/resources': '015a2493b5672b28576ab78ffbcffde2ea0c9844'}, 'rights': 'Game artwork © miHoYo / HoYoverse. Unofficial tool; code licenses do not grant artwork rights.', 'compression': {'format': 'WebP + SVG stats', 'statTransform': 'stat-vector-v4', 'quality': 76, 'method': 6, 'transparent': True, 'avatarTransform': TRANSFORM, 'weaponTransform': WEAPON_TRANSFORM, 'catalystTransform': CATALYST_TRANSFORM, 'supplementQuality': 88, 'supplementCanvas': [128, 128], 'elementTransform': ELEMENT_TRANSFORM, 'elementQuality': 90, 'elementCanvas': [128, 128], 'weaponQuality': 88, 'weaponCanvas': [128, 128], 'artifactCanvas': [128, 128], 'artifactQuality': 88, 'artifactTransform': ARTIFACT_TRANSFORM}, 'rejectedSourceHashes': [PLACEHOLDER], 'budgets': {'maxAssetBytes': 32768, 'maxTotalBytes': 16777216}, 'totalBytes': total, 'totalSourceBytes': sum(asset['sourceBytes'] for asset in assets), 'assets': assets, 'missing': missing, 'excluded': excluded, 'sharedBuffStatIcons': STAT_SOURCES.get('buffAliases', [])}
(OUTPUT / 'game-icon-manifest.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())
for filename, groups in [('game-icon-index', ['characters', 'weapons', 'artifacts', 'artifactSlots', 'elements', 'stats']), ('game-detail-icon-index', ['skills', 'constellations', 'buffs'])]:
    (ROOT / f'src/web/src/assets/{filename}.json').write_bytes((json.dumps({kind: index[kind] for kind in groups}, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
print(json.dumps({'icons': len(assets), 'bytes': total, 'missing': len(missing), 'excludedPassives': len(excluded), 'sharedNormalAttackIcons': len(normal_attacks)}, ensure_ascii=True))
