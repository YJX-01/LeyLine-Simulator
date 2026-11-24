"""Capture Enka skill ID supplements from release pages, matched by catalog talent names.

Reads ignored source pages; never reads player responses or infers order from numeric IDs.
"""
import html
import json
from pathlib import Path
import re
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2] / 'lib'))
from content_source import read_content, write_content

ROOT = Path(__file__).resolve().parents[3]
DB_COMMIT = '8e5badd60b5d894284ccc927a56c9683529d2592'
DB = ROOT / '.references/genshin-db'
if subprocess.check_output(['git', '-C', str(DB), 'rev-parse', 'HEAD'], text=True).strip() != DB_COMMIT:
    raise RuntimeError('Review the changed game catalog reference before capturing skills')
catalog = read_content(ROOT / 'tools/data/sources/catalog/genshin-db/characters.json')
entries = {}
for key in ['columbina', 'linnea', 'sandrone', 'vodyanitsa', 'vesna', 'alyosha', 'odette', 'aether-cryo', 'lumine-cryo', 'zibai', 'illuga', 'varka', 'lohen', 'nicole', 'prune', 'mitya', 'valeriy']:
    source = ROOT / f'.references/enka/{key}-release.html'
    page = source.read_text(encoding='utf-8')
    sections = re.findall(r'<section\b[^>]*\bid="talent-(\d+)"[^>]*>.*?<h3\b[^>]*>(.*?)</h3>', page, re.S)
    names = {}
    for identifier, heading in sections:
        name = ' '.join(html.unescape(re.sub('<[^>]+>', ' ', heading)).split('Lv.')[0].split())
        if name:
            if name in names:
                raise RuntimeError(f'Duplicate talent heading: {key}/{name}')
            names[name] = int(identifier)
    traveler = key.endswith('-cryo')
    talent_name = 'travelercryo' if traveler else key
    talent_file = DB / f'src/data/English/talents/{talent_name}.json'
    talents = read_content(talent_file)
    ordered = [{'category': category, 'name': talents[combat]['name'], 'id': names[talents[combat]['name']]} for category, combat in [('normal', 'combat1'), ('skill', 'combat2'), ('burst', 'combat3')]]
    avatar = key.split('-')[0]
    avatar_id = catalog[avatar]['metadata']['id']
    depot = talents['id']
    url_path = f'{avatar_id}/{key}'
    if traveler:
        canonical = re.search(fr'<link rel="canonical" href="https://gi\.gachabase\.net/characters/{avatar_id}/(\d+)/{avatar}/release"', page)
        if not canonical:
            raise ValueError(f'Missing traveler form: {key}')
        depot = int(canonical.group(1))
        url_path = f'{avatar_id}/{depot}/{avatar}'
    mapping_key = f'{avatar_id}-{depot}' if traveler else str(avatar_id)
    entries[mapping_key] = {'id': key, 'skillDepotId': depot, 'skills': [item['id'] for item in ordered], 'talents': ordered, 'source': {'url': f'https://gi.gachabase.net/characters/{url_path}/release?lang=en', 'localPath': source.relative_to(ROOT).as_posix()}, 'nameSource': {'repository': 'theBowja/genshin-db', 'commit': DB_COMMIT, 'path': talent_file.relative_to(DB).as_posix()}}
output = ROOT / 'tools/data/sources/catalog/enka/skill-supplements.json'
write_content(output, {'formatVersion': 1, 'capturedOn': '2026-11-24', 'method': 'Release page numeric talent IDs matched by exact combat1/combat2/combat3 names from the pinned game catalog; not inferred from a player skillLevelMap or sorted IDs.', 'characters': entries})
print(json.dumps({key: item['skills'] for key, item in entries.items()}))
