"""Prepare complete character JSON candidates from adopted source bytes; never overwrite author files."""
import argparse
import copy
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/lib'))
from content_source import read_content as read, write_content
COMMIT = '8e5badd60b5d894284ccc927a56c9683529d2592'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT / 'tools/data/sources/genshin-db' / COMMIT)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
output = args.out.resolve()
if not output.is_relative_to((ROOT / 'artifacts/content-candidates').resolve()) or output == (ROOT / 'artifacts/content-candidates').resolve():
    parser.error('--out must be a new directory beneath artifacts/content-candidates')
if output.exists():
    parser.error('candidate directory already exists')
candidates = {}

def write(path, value):
    candidates[path] = value

stats = read(args.source / 'stats/talents.json')
supplement = read(ROOT / 'tools/data/sources/character-text/base-and-manekin.json')
proud = read(ROOT / supplement['proudSkillsFile'])
element_names = {'pyro': '火', 'hydro': '水', 'electro': '雷', 'cryo': '冰', 'anemo': '风', 'geo': '岩', 'dendro': '草'}


def clean_text(value):
    return re.sub(r'<[^>]+>', '', re.sub(r'\\+n', '\n', value)).strip()


def supplement_character(candidate, binding):
    depot = supplement['skillDepots'][str(binding['skillDepotId'])]
    texts = supplement['textMap']
    def text(key):
        value = texts.get(str(key), '')
        if not value:
            raise ValueError(f'Missing adopted Chinese text: {key}')
        return value
    candidate['identity']['element'] = binding['element']
    if binding['element'] != 'physical':
        candidate['identity']['name'] += f'（{element_names[binding["element"]]}）'
    skills = [(skill_id, 'normal' if index == 0 else 'skill') for index, skill_id in enumerate(depot['skills']) if skill_id]
    if depot['energySkill']:
        skills.append((depot['energySkill'], 'burst'))
    talents = []
    for skill_id, category in skills:
        source = supplement['skills'][str(skill_id)]
        rows = sorted((row for row in proud if row['proudSkillGroupId'] == source['proudSkillGroupId']), key=lambda row: row['level'])
        if [row['level'] for row in rows] != list(range(1, len(rows) + 1)):
            raise ValueError(f'Non-contiguous talent levels: {skill_id}')
        description = text(source['descTextMapHash'])
        flavor = re.search(r'<i>(.*?)</i>', description, re.S)
        details = [clean_text(texts[str(key)]).split('|', 1) for key in rows[0]['paramDescList'] if texts.get(str(key))]
        details = [{'label': pair[0], 'template': pair[1] if len(pair) > 1 else ''} for pair in details]
        parameters = []
        for index in range(len(rows[0]['paramList'])):
            param_id = f'param{index + 1}'
            matching = [detail for detail in details if re.search(r'\{' + param_id + r'(?::|\})', detail['template'])]
            unit = 'ratio' if any(re.search(r'\{' + param_id + r':[^}]*P', detail['template']) for detail in matching) else 'unknown'
            if unit == 'unknown' and matching:
                labels = ' '.join(detail['label'] + detail['template'] for detail in matching)
                unit = 'seconds' if '秒' in labels else 'stamina' if '体力' in labels else 'energy' if '能量' in labels else 'scalar'
            parameters.append({'id': param_id, 'unit': unit, 'values': [row['paramList'][index] for row in rows]})
        talent = {'id': f'{candidate["id"]}.{category}', 'name': clean_text(text(source['nameTextMapHash'])),
                  'description': clean_text(re.sub(r'<i>.*?</i>', '', description, flags=re.S)), 'category': category,
                  'element': 'physical' if category == 'normal' else binding['element'], 'parameters': parameters,
                  'details': details}
        if flavor:
            talent['flavorText'] = clean_text(flavor[1])
        talents.append(talent)
    candidate['talents'] = talents
    candidate['passives'] = []
    for item in depot['inherentProudSkillOpens']:
        if not item['proudSkillGroupId']:
            continue
        row = next(row for row in proud if row['proudSkillGroupId'] == item['proudSkillGroupId'])
        candidate['passives'].append({'id': f'{candidate["id"]}.passive{len(candidate["passives"]) + 1}',
                                      'name': clean_text(text(row['nameTextMapHash'])), 'description': clean_text(text(row['descTextMapHash'])),
                                      'unlockAscension': item['needAvatarPromoteLevel']})
    if any(depot['talents']):
        raise ValueError('Supplement constellation bindings require review')
    candidate['constellations'] = []
def merge_parameters(talent, incoming):
    existing = {param['id']: param for param in talent['parameters']}
    received = {param['id']: param for param in incoming}
    if existing.keys() != received.keys():
        raise ValueError(f'{talent["id"]}: parameter identities changed; review the bindings before refreshing')
    changed = any(param['values'] != received[key]['values'] for key, param in existing.items())
    # The adopted unit semantics and array order are part of the current contract.
    talent['parameters'] = [{**param, 'values': received[param['id']]['values']} for param in talent['parameters']]
    return changed


def flag_changed_parameters(candidate, skill_id):
    talent = next(t for t in candidate['talents'] if t['id'] == skill_id)
    def invalidate(key):
        name = key + '-pending'
        candidate['support'][name] = {**candidate['support'][key], 'evidence': 'declared',
            'resolution': 'unavailable', 'reason': '候选参数发生变化，须重新核验。'}
        return name
    for hit in talent['hits']:
        hit['support'] = invalidate(hit['support'])
    if not candidate['contextSupport'].endswith('-pending'):
        candidate['contextSupport'] = invalidate(candidate['contextSupport'])


app_version = read(ROOT / 'package.json')['version']
changes = []
directory = ROOT / 'src/game-data/data/characters'
paths = {path.stem: path for path in directory.glob('*.json')}
paths.update({key: directory / f'{key}.json' for key in supplement['bindings']})
for identifier, path in sorted(paths.items()):
    original = read(path)
    if original.get('schemaVersion') != app_version:
        raise ValueError(f'{path}: expected character metadata version {app_version}')
    candidate = copy.deepcopy(original)
    if identifier in supplement['bindings']:
        binding = supplement['bindings'][identifier]
        text_candidate = {'id': identifier, 'identity': copy.deepcopy(read(directory / f'{binding["baseId"]}.json')['identity'])}
        supplement_character(text_candidate, binding)
        for group in ['talents', 'passives']:
            if [item['id'] for item in candidate[group]] != [item['id'] for item in text_candidate[group]]:
                raise ValueError(f'{identifier}: {group} identities changed; review the bindings before refreshing')
            for current, source in zip(candidate[group], text_candidate[group]):
                if group == 'talents' and merge_parameters(current, source['parameters']):
                    flag_changed_parameters(candidate, current['id'])
                for key in ['name', 'description', 'flavorText', 'details']:
                    if key in source:
                        current[key] = source[key]
                    elif key == 'flavorText':
                        current.pop(key, None)
        if candidate != original:
            changes.append(identifier)
        write(output / 'characters' / path.name, candidate)
        continue
    traveler = identifier.split('-', 1) if identifier.startswith(('aether-', 'lumine-')) else None
    base = traveler[0] if traveler else identifier
    key = 'traveler' + traveler[1] if traveler else identifier
    identity_path = args.source / f'ChineseSimplified/characters/{base}.json'
    text_path = args.source / f'ChineseSimplified/talents/{key}.json'
    constellation_path = args.source / f'ChineseSimplified/constellations/{key}.json'
    identity = read(identity_path) if identity_path.exists() else {}
    text = read(text_path) if text_path.exists() else {}
    constellations = read(constellation_path) if constellation_path.exists() else {}
    for field in ['title', 'description', 'rarity', 'region']:
        if field in identity and (field != 'region' or identity[field]):
            candidate['identity'][field] = identity[field]
    for index, talent in enumerate(candidate['talents'], 1):
        source = text.get(f'combat{index}', {})
        talent['name'] = source.get('name', talent['name'])
        talent['description'] = source.get('description', '')
        if source.get('flavorText'):
            talent['flavorText'] = source['flavorText']
        else:
            talent.pop('flavorText', None)
        talent['details'] = [{'label': label.split('|', 1)[0], 'template': label.split('|', 1)[1] if '|' in label else ''} for label in source.get('attributes', {}).get('labels', [])]
        parameters = []
        for param, values in stats.get(key, stats.get(base, {})).get(f'combat{index}', {}).items():
            if not isinstance(values, list) or not values:
                continue
            formats = [match[1] for detail in talent['details'] for match in re.finditer(r'\{' + re.escape(param) + r':([^}]+)\}', detail['template'])]
            parameters.append({'id': param, 'unit': 'ratio' if any('P' in value for value in formats) else 'unknown', 'values': values})
        if parameters and merge_parameters(talent, parameters):
            flag_changed_parameters(candidate, talent['id'])
    for passive in candidate['passives']:
        source = text.get(passive['id'].rsplit('.', 1)[-1], {})
        passive['name'] = source.get('name', passive['name'])
        passive['description'] = source.get('description', '')
    for constellation in candidate['constellations']:
        source = constellations.get(f'c{constellation["rank"]}', {})
        constellation['name'] = source.get('name', constellation['name'])
        constellation['description'] = source.get('description', '')
    if candidate != original:
        changes.append(identifier)
    write(output / 'characters' / path.name, candidate)
validation = """
import {readFileSync} from 'node:fs';
import {loadContentSchema} from './tools/lib/load-content-schema.mjs';
const {characterMetadataSchema}=await loadContentSchema('/src/schema/src/index.ts');
for (const candidate of JSON.parse(readFileSync(0,'utf8'))) characterMetadataSchema.parse(candidate);
"""
subprocess.run(['node', '--input-type=module', '-e', validation], cwd=ROOT, check=True,
               input=json.dumps(list(candidates.values()), ensure_ascii=False, allow_nan=False).encode('utf-8'))
write(output / 'review.json', {'changed': changes, 'policy': 'Review text, numeric parameters, bindings and revisions before adoption.'})
output.mkdir(parents=True, exist_ok=False)
for path, value in candidates.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    write_content(path, value)
print(json.dumps({'candidateDirectory': str(output), 'changedCharacters': len(changes)}))
