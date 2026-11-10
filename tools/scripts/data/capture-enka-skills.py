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
from content_source import write_content

ROOT = Path(__file__).resolve().parents[3]
DB_COMMIT = '8e5badd60b5d894284ccc927a56c9683529d2592'
DB = ROOT / '.references/genshin-db'
if subprocess.check_output(['git', '-C', str(DB), 'rev-parse', 'HEAD'], text=True).strip() != DB_COMMIT:
    raise RuntimeError('Review the changed game catalog reference before capturing skills')
catalog = json.loads((ROOT / 'tools/data/sources/catalog/genshin-db/characters.json').read_text(encoding='utf-8'))
entries = {}
for key in ['vesna', 'odette', 'sandrone', 'vodyanitsa', 'columbina']:
    source = ROOT / f'.references/enka/{key}-release.html'
    raw = source.read_bytes()
    sections = re.findall(r'<section\b[^>]*\bid="talent-(\d+)"[^>]*>.*?<h3\b[^>]*>(.*?)</h3>', raw.decode('utf-8'), re.S)
    names = {}
    for identifier, heading in sections:
        name = ' '.join(html.unescape(re.sub('<[^>]+>', ' ', heading)).split('Lv.')[0].split())
        if name:
            if name in names:
                raise RuntimeError(f'Duplicate talent heading: {key}/{name}')
            names[name] = int(identifier)
    talent_file = DB / f'src/data/English/talents/{key}.json'
    talents = json.loads(talent_file.read_text(encoding='utf-8'))
    ordered = [{'category': category, 'name': talents[combat]['name'], 'id': names[talents[combat]['name']]} for category, combat in [('normal', 'combat1'), ('skill', 'combat2'), ('burst', 'combat3')]]
    avatar_id = catalog[key]['metadata']['id']
    entries[str(avatar_id)] = {'id': key, 'skillDepotId': talents['id'], 'skills': [item['id'] for item in ordered], 'talents': ordered, 'source': {'url': f'https://gi.gachabase.net/characters/{avatar_id}/{key}/release?lang=en', 'localPath': source.relative_to(ROOT).as_posix()}, 'nameSource': {'repository': 'theBowja/genshin-db', 'commit': DB_COMMIT, 'path': talent_file.relative_to(DB).as_posix()}}
output = ROOT / 'tools/data/sources/catalog/enka/skill-supplements.json'
write_content(output, {'formatVersion': 1, 'capturedOn': '2026-11-07', 'method': 'Release page numeric talent IDs matched by exact combat1/combat2/combat3 names from the pinned game catalog; not inferred from a player skillLevelMap or sorted IDs.', 'characters': entries})
print(json.dumps({key: item['skills'] for key, item in entries.items()}))
