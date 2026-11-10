"""Prepare complete character JSON candidates from adopted source bytes; never overwrite author files."""
import argparse
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COMMIT = '8e5badd60b5d894284ccc927a56c9683529d2592'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT / 'tools/data/sources/genshin-db' / COMMIT)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
output = args.out.resolve()
if not output.is_relative_to((ROOT / 'artifacts/content-candidates').resolve()) or output == (ROOT / 'artifacts/content-candidates').resolve():
    parser.error('--out must be a new directory beneath artifacts/content-candidates')
output.mkdir(parents=True, exist_ok=False)

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

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
                  'details': details, 'hits': [], 'support': {'supported': False, 'reason': '已收录原始文本和等级参数，伤害与附魔规则尚未核验。'}}
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
                                      'unlockAscension': item['needAvatarPromoteLevel'],
                                      'support': {'supported': False, 'reason': '已收录说明，效果规则尚未核验。'}})
    if any(depot['talents']):
        raise ValueError('Supplement constellation bindings require review')
    candidate['constellations'] = []
    candidate['capabilities'] = {'text': 'complete', 'numbers': 'complete',
                                  'calculation': {'supported': False, 'reason': '已收录原始文本和数值，角色伤害与效果规则尚未核验。'}}
    if binding['element'] == 'physical':
        candidate['capabilities']['notes'] = ['当前是未元素化的基础形态，仅配置普通攻击。元素战技与元素爆发请查看对应元素形态。']
    if binding['baseId'].startswith('manekin'):
        candidate['capabilities'].setdefault('notes', []).append('奇偶没有命座；固有天赋与对应元素形态按实际配置收录。')


changes = []
directory = ROOT / 'src/game-data/data/characters'
paths = {path.stem: path for path in directory.glob('*.json')}
paths.update({key: directory / f'{key}.json' for key in supplement['bindings']})
for identifier, path in sorted(paths.items()):
    original = read(path) if path.exists() else None
    if identifier in supplement['bindings']:
        binding = supplement['bindings'][identifier]
        candidate = copy.deepcopy(read(directory / f'{binding["baseId"]}.json'))
        candidate['id'] = identifier
        candidate['revision'] = original['revision'] if original else '1'
        supplement_character(candidate, binding)
        if candidate != original:
            changes.append(identifier)
        write(output / 'characters' / path.name, candidate)
        continue
    candidate = copy.deepcopy(original)
    identifier = candidate['id']
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
        elif field == 'region':
            candidate['identity'].pop('region', None)
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
        old = {param['id']: param['values'] for param in talent['parameters']}
        new = {param['id']: param['values'] for param in parameters}
        if any(old.get(hit['parameter']) != new.get(hit['parameter']) for hit in talent['hits']):
            talent['support'] = {'supported': False, 'reason': '来源参数发生变化，命中绑定等待重新核验。'}
            candidate['capabilities']['calculation'] = {'supported': False, 'reason': '来源参数更新候选尚未核验。'}
        talent['parameters'] = parameters
    for passive in candidate['passives']:
        source = text.get(passive['id'].rsplit('.', 1)[-1], {})
        passive['name'] = source.get('name', passive['name'])
        passive['description'] = source.get('description', '')
    for constellation in candidate['constellations']:
        source = constellations.get(f'c{constellation["rank"]}', {})
        constellation['name'] = source.get('name', constellation['name'])
        constellation['description'] = source.get('description', '')
    candidate['capabilities']['text'] = 'complete' if identity and text else 'unavailable'
    candidate['capabilities']['numbers'] = 'complete' if all(talent['parameters'] for talent in candidate['talents']) else 'partial'
    if candidate != original:
        changes.append(identifier)
    write(output / 'characters' / path.name, candidate)
write(output / 'review.json', {'source': str(args.source), 'changed': changes, 'policy': 'Candidates only. Review text, numbers, rules, revision and dataVersion before explicitly adopting. Existing rule and constellation bonus bindings are preserved; changed verified parameters revoke support pending review.'})
print(json.dumps({'candidateDirectory': str(output), 'changedCharacters': len(changes)}))
