"""Prepare verified, compressed offline game icons from adopted anime-game-data metadata and verified URLs.

Requires Python + Pillow. Rejects server placeholders even when HTTP returns 200.
"""
import argparse
import time
import threading
import concurrent.futures
import hashlib
import io
import json
import re
from pathlib import Path
import urllib.request
from PIL import Image, ImageOps
import xml.etree.ElementTree as ET
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2] / 'lib'))
from asset_capture import read_capture, write_candidate
from content_source import read_content

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = read_capture(ROOT)
if MANIFEST['formatVersion'] != 4:
    raise ValueError('Asset manifest formatVersion must be 4')
AGD = ROOT / 'tools/data/sources/anime-game-data'
CACHE = ROOT / '.references/game-icon-downloads'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, default=ROOT / 'artifacts/content-candidates' / ('assets-' + str(time.time_ns())))
parser.add_argument('--offline', action='store_true', help='Use adopted files and cached image sources without network access')
args = parser.parse_args()
OUTPUT = args.out.resolve()
if not OUTPUT.is_relative_to((ROOT / 'artifacts/content-candidates').resolve()) or OUTPUT == (ROOT / 'artifacts/content-candidates').resolve():
    parser.error('--out must be a new directory beneath artifacts/content-candidates')
GAME_OUTPUT = OUTPUT / 'game'
def game_folder(kind): return GAME_OUTPUT / ('artifact-slots' if kind == 'artifactSlots' else kind)
PLACEHOLDER = 'ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b'
TRANSFORM = 'square-portrait-v1'
WEAPON_TRANSFORM = 'equipment-detail-square-v4'
CATALYST_TRANSFORM = 'full-weapon-square-v4'
ARTIFACT_TRANSFORM = 'artifact-square-v2'
DOWNLOAD_LOCKS = {}
LOCK = threading.Lock()
ELEMENT_TRANSFORM = 'element-hq-v2'
TRANSPARENT_AVATARS = {'manekin': 'UI_AvatarIcon_MannequinBoy', 'manekina': 'UI_AvatarIcon_MannequinGirl'}
CACHE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=False)

def read(path):
    return read_content(path)

def sha(content):
    return hashlib.sha256(content).hexdigest()

def valid_image(content):
    if sha(content) == PLACEHOLDER:
        raise ValueError('Server returned a known placeholder image')
    image = Image.open(io.BytesIO(content)).convert('RGBA')
    if image.getchannel('A').getextrema()[1] < 128:
        raise ValueError('Image is blank or a nearly transparent server placeholder')
    return image

agd_characters = read(AGD / 'characters.json')
agd_weapons = read(AGD / 'weapons.json')
agd_sets = read(AGD / 'sets.json')
agd_skill_icons = read(AGD / 'skill-icons.json')
agd_base_manekin = read(AGD / 'base-and-manekin.json')
catalog = {key: [read(file) for file in sorted((ROOT / 'src/game-data/data' / folder).glob('*.json'))]
           for key, folder in [('characters', 'characters'), ('weapons', 'weapons'), ('sets', 'artifact-sets')]}
previous = MANIFEST
existing = {(item['kind'], item['key']): item for item in previous['assets']}

SPRITE_TREES = {}

def sprite_sources(filename):
    sources = []
    for asset in previous['assets']:
        if asset.get('sourceFilename') == filename or asset['sourceUrl'].rsplit('/', 1)[-1] == filename + '.png':
            sources.append((None, asset['sourceUrl']))
    for repository in previous['capture']['spriteRepositories']:
        name = repository['repository']
        if name not in SPRITE_TREES:
            cache = ROOT / '.references' / repository['cacheFile']
            tree = read(cache) if cache.exists() else None
            if tree and (tree.get('sha') != previous['sourceCommits'][name] or tree.get('truncated')):
                raise ValueError(f'Unverified or truncated image tree: {name}')
            SPRITE_TREES[name] = tree['tree'] if tree else []
        matches = [entry['path'] for entry in SPRITE_TREES[name]
                   if entry['path'].startswith(repository['pathPrefix']) and entry['path'].endswith('/' + filename + '.png')]
        if matches:
            sources.append((None, f"https://raw.githubusercontent.com/{name}/{previous['sourceCommits'][name]}/{matches[0]}"))
    return list(dict.fromkeys(sources))

def icon_sources(filename):
    return list(dict.fromkeys([
        *sprite_sources(filename),
        (None, f'https://enka.network/ui/{filename}.png'),
        (None, f'https://gi.yatta.moe/assets/UI/{filename}.png'),
    ]))

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
    for row in catalog[group]:
        entry = {**row, **row.get('identity', {})}
        if kind == 'characters' and re.match(r'^(aether|lumine|manekin|manekina)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$', entry['id']):
            continue  # Element forms reuse the base portrait in the runtime index.
        variants = {'flower': 'flower', 'plume': 'feather', 'sands': 'sand', 'goblet': 'cup', 'circlet': 'head'} if kind == 'artifacts' else {'icon': 'icon'}
        for slot in variants:
            key = entry['id'] + ('-' + slot if kind == 'artifacts' else '')
            prior = existing.get((kind, key))
            sources = []
            if kind == 'characters':
                icon_name = TRANSPARENT_AVATARS.get(key) or agd_characters.get(entry['id'], {}).get('metadata', {}).get('iconName')
                if key in TRANSPARENT_AVATARS:
                    sources = [
                        (None, f'https://enka.network/ui/{icon_name}.png'),
                        (None, f'https://gi.yatta.moe/assets/UI/{icon_name}.png'),
                    ]
                else:
                    if prior:
                        sources.append((None, prior['sourceUrl']))
                    if icon_name:
                        sources.extend(icon_sources(icon_name))
            elif kind == 'weapons':
                icon_name = agd_weapons.get(entry['id'], {}).get('metadata', {}).get('iconName')
                if icon_name:
                    sources.extend(icon_sources(icon_name))
                if prior:
                    sources.append((None, prior['sourceUrl']))
            else:
                icon_name = agd_sets.get(entry['id'], {}).get('icons', {}).get(slot)
                if not icon_name and not prior:
                    continue
                if prior:
                    sources.append((None, prior['sourceUrl']))
                if icon_name:
                    sources.extend(icon_sources(icon_name))
            tasks.append((kind, key, entry, list(dict.fromkeys(sources)), size))
for element in ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro']:
    prior = existing.get(('elements', element))
    if prior:
        tasks.append(('elements', element, {'id': element, 'name': element}, [(None, prior['sourceUrl'])], 128))

for entry in previous['assets']:
    if entry['kind'] != 'artifactSlots':
        continue
    tasks.append(('artifactSlots', entry['id'], entry, [(None, entry['sourceUrl'])], 128))


SCOPE = previous['capture']['passives']
excluded = []
normal_attacks = {}
seen_skills = set()

# Store the reference identity, not inferred links to simulator mechanics.
for kind, folder, fields in [
    ('skills', 'talents', ['combat1', 'combat2', 'combat3', 'passive1', 'passive2', 'passive3', 'passive4']),
    ('constellations', 'constellations', [f'c{i}' for i in range(1, 7)]),
]:
    for character, localized in sorted(agd_skill_icons[folder].items()):
        for field in fields:
            details = localized.get(field) or {}
            filename = details.get('icon')
            if not filename or filename == 'None':
                continue
            key = f'{character}-{field}'
            entry = {'id': key, 'name': details.get('name', key), 'character': character, 'slot': field}
            if kind == 'skills' and field.startswith('passive') and field not in SCOPE['defaultCombatPassives'] and key not in SCOPE['extraCombatPassives']:
                excluded.append({'kind': kind, 'key': key, 'name': entry['name'], 'reason': 'Non-combat utility/exploration passive; excluded by reviewed scope'})
                continue
            if kind == 'skills' and field == 'combat1':
                shared = normal_attacks.setdefault(filename, {'id': 'normal-' + filename.lower(), 'name': '通用普通攻击 · ' + filename, 'slot': 'combat1', 'aliases': []})
                shared['aliases'].append({'key': key, 'name': entry['name'], 'character': character, 'slot': field})
            else:
                seen_skills.add((kind, key))
                tasks.append((kind, key, entry, icon_sources(filename), 128))

depot_id = str(agd_base_manekin['bindings']['manekin-pyro']['skillDepotId'])
manekin_depot = agd_base_manekin['skillDepots'][depot_id]
manekin_skills_map = agd_base_manekin['skills']
manekin_text_map = agd_base_manekin['textMap']
def clean_manekin_name(text_hash, fallback):
    return re.sub(r'<[^>]+>', '', manekin_text_map.get(str(text_hash), '')).strip() or fallback

normal_icon = manekin_skills_map[str(manekin_depot['skills'][0])].get('skillIcon')
if normal_icon and normal_icon in normal_attacks:
    existing_aliases = {alias['key'] for alias in normal_attacks[normal_icon]['aliases']}
    for manekin_id in ['manekin', 'manekina']:
        alias_key = f'{manekin_id}-combat1'
        if alias_key not in existing_aliases:
            normal_attacks[normal_icon]['aliases'].append({'key': alias_key, 'name': alias_key, 'character': manekin_id, 'slot': 'combat1'})

for field, filename, name in [
    ('combat2', manekin_skills_map[str(manekin_depot['skills'][1])].get('skillIcon', ''), clean_manekin_name(manekin_skills_map[str(manekin_depot['skills'][1])].get('nameTextMapHash'), 'manekin-combat2')),
    ('combat3', manekin_skills_map[str(manekin_depot['energySkill'])].get('skillIcon', ''), clean_manekin_name(manekin_skills_map[str(manekin_depot['energySkill'])].get('nameTextMapHash'), 'manekin-combat3')),
    *[
        (f'passive{index}', item.get('icon', ''), clean_manekin_name(item.get('nameTextMapHash'), f'manekin-passive{index}'))
        for index, item in enumerate(manekin_depot.get('passives', []), start=1)
    ],
]:
    if not filename or filename == 'None':
        continue
    if field.startswith('passive') and field not in SCOPE['defaultCombatPassives'] and f'manekin-{field}' not in SCOPE['extraCombatPassives']:
        for who in ['manekin', 'manekina']:
            key = f'{who}-{field}'
            if all(existing_item['key'] != key for existing_item in excluded):
                excluded.append({'kind': 'skills', 'key': key, 'name': name, 'reason': 'Non-combat utility/exploration passive; excluded by reviewed scope'})
        continue
    key = f'manekin-{field}'
    entry = {
        'id': key,
        'name': name,
        'character': 'manekin',
        'slot': field,
        'aliases': [{'key': f'manekina-{field}', 'name': name, 'character': 'manekina', 'slot': field}],
    }
    seen_skills.add(('skills', key))
    tasks.append(('skills', key, entry, icon_sources(filename), 128))

for filename, entry in normal_attacks.items():
    seen_skills.add(('skills', entry['id']))
    tasks.append(('skills', entry['id'], entry, icon_sources(filename), 128))
for entry in previous['assets']:
    if entry['kind'] in ['skills', 'constellations'] and not entry.get('sourceOverride') and (entry['kind'], entry['key']) not in seen_skills:
        seen_skills.add((entry['kind'], entry['key']))
        tasks.append((entry['kind'], entry['key'], {**entry, 'id': entry['key']}, [(None, entry['sourceUrl'])], 128))
for entry in previous['assets']:
    if entry['kind'] != 'buffs':
        continue
    tasks.append(('buffs', entry['id'], entry, [(None, entry['sourceUrl'])], 128))

for entry in previous['assets']:
    if entry['kind'] != 'stats':
        continue
    tasks.append(('stats', entry['id'], entry, [(None, entry['sourceUrl'])], 128))

def convert(task):
    kind, key, entry, sources, size = task
    if kind in ['stats', 'artifactSlots']:
        content = (ROOT / entry['file']).read_bytes()
        svg = ET.fromstring(content)
        if svg.tag != '{http://www.w3.org/2000/svg}svg' or not svg.findall('.//{http://www.w3.org/2000/svg}path'):
            raise ValueError(f'Invalid canonical vector: {key}')
        destination = game_folder(kind) / f'{key}.svg'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        return {**entry, 'file': 'assets/' + destination.relative_to(OUTPUT).as_posix(), 'bytes': len(content)}, None
    failures = []
    prior = existing.get((kind, key))
    if prior and prior.get('transform') == expected_transform(kind, key, entry):
        path = ROOT / prior['file']
        if path.exists():
            try:
                checked = valid_image(path.read_bytes())
                destination = game_folder(kind) / f'{key}.webp'
                destination.parent.mkdir(parents=True, exist_ok=True)
                if path != destination:
                    destination.write_bytes(path.read_bytes())
                return {**prior, **({'weaponType': entry['weaponType'], 'framing': prior.get('framing', 'native')} if kind == 'weapons' else {}), **({'aliases': entry['aliases']} if entry.get('aliases') else {}), 'sourceUrl': prior['sourceUrl'], 'file': 'assets/' + destination.relative_to(OUTPUT).as_posix(), 'alphaMax': checked.getchannel('A').getextrema()[1]}, None
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
                        if args.offline:
                            raise ValueError(f'Missing cached image source: {url}')
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
            destination = game_folder(kind) / f'{key}.webp'
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, 'WEBP', quality=90 if kind == 'elements' else 88 if kind in ['weapons', 'artifacts'] else 88 if kind in ['skills', 'constellations', 'buffs', 'stats'] else 76, method=6, exact=True)
            content = destination.read_bytes()
            valid_image(content)
            if len(content) > 32768:
                raise ValueError('Compressed icon exceeds 32 KiB')
            return {'kind': kind, 'key': key, 'id': entry['id'], 'name': entry['name'], 'element': entry.get('element'), 'file': 'assets/' + destination.relative_to(OUTPUT).as_posix(), 'bytes': len(content), 'sourceUrl': url, 'sourceBytes': len(source), 'sourceDimensions': original_size, 'dimensions': image.size, 'alphaMax': image.getchannel('A').getextrema()[1], **({'transform': 'square-transparent-v2' if key in TRANSPARENT_AVATARS else TRANSFORM} if kind == 'characters' else {'transform': weapon_transform(entry), 'weaponType': entry['weaponType'], 'framing': 'full-art-detail-crop' if 'UI_Gacha_' in url and entry['weaponType'] != 'WEAPON_CATALYST' else 'native'} if kind == 'weapons' else {'transform': ELEMENT_TRANSFORM} if kind == 'elements' else {'transform': ARTIFACT_TRANSFORM} if kind == 'artifacts' else {'transform': expected_transform(kind, key, entry), **{field: entry[field] for field in ['character', 'slot', 'aliases', 'sourceFilename', 'sourceOverride'] if field in entry}})}, None
        except Exception as error:
            failures.append(str(error))
    return None, {'kind': kind, 'key': key, 'reason': '; '.join(failures) or 'No image address in pinned reference'}

# Explicit supplements override missing reference image addresses and add newly adopted skills.
for entry in previous['assets']:
    if not entry.get('sourceOverride'):
        continue
    shared_keys = {entry['key'], *(alias['key'] for alias in entry.get('aliases', []))}
    tasks = [task for task in tasks if not (task[0] == entry['kind'] and task[1] in shared_keys)]
    tasks.append((entry['kind'], entry['key'], {**entry, 'id': entry['key']}, [(None, entry['sourceUrl'])], 128))

assets, missing = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for asset, failure in pool.map(convert, tasks):
        if asset:
            if asset['kind'] == 'characters':
                asset['rarity'] = agd_characters[asset['id']]['metadata']['rarity']
            elif asset['kind'] == 'weapons':
                asset['rarity'] = agd_weapons[asset['id']]['metadata']['rarity']
            assets.append(asset)
        else:
            missing.append(failure)

total = sum(asset['bytes'] for asset in assets)
if total > 16 * 1024 * 1024:
    raise RuntimeError('Offline icon library exceeds 16 MiB')
assets.sort(key=lambda asset: (asset['kind'], asset['key']))
manifest = {**previous, 'totalBytes': total, 'assets': assets, 'excluded': excluded}
(OUTPUT / 'missing-icons.json').write_bytes((json.dumps(missing,ensure_ascii=False,indent=2)+'\n').encode())
write_candidate(OUTPUT, manifest)
print(json.dumps({'icons': len(assets), 'bytes': total, 'missing': len(missing), 'excludedPassives': len(excluded), 'sharedNormalAttackIcons': len(normal_attacks)}, ensure_ascii=True))
