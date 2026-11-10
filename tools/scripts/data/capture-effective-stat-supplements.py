"""Capture explicit pinned miao rules as data; never execute upstream JavaScript."""
import json
import re
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2] / 'lib'))
from content_source import read_content, write_content

root = Path(__file__).resolve().parents[3]
target = root / 'src/game-data/data/tables/character-effective-stats.json'
snapshot = read_content(target)
references = root / '.references/metadata'
mapping = {'hp': 'hp', 'atk': 'attack', 'def': 'defense', 'cpct': 'critRate', 'cdmg': 'critDamage', 'mastery': 'elementalMastery', 'recharge': 'energyRecharge'}
supplements = []

def read(filename, source_path):
    raw = (references / filename).read_bytes()
    supplements.append({'path': source_path})
    return raw.decode('utf8')

def groups(body):
    values = {key: float(value) for key, value in re.findall(r'(\w+)\s*:\s*([\d.]+)', body)}
    result = [stat for key, stat in mapping.items() if values.get(key, 0) > 0]
    if not result:
        raise ValueError('Empty explicit rule')
    return result

traveler = read('miao-traveler-artis.js', 'resources/meta-gs/character/旅行者/artis.js')
forms = dict(re.findall(r"case '(\w+)':\s*return rule\([^,]+,\s*\{([^}]+)\}", traveler))
labels = {'anemo': '风', 'geo': '岩', 'electro': '雷', 'dendro': '草', 'hydro': '水', 'pyro': '火', 'cryo': '冰'}
if set(forms) != set(labels):
    raise ValueError('Traveler element rules changed')
for element, label in labels.items():
    for name in ['空', '荧']:
        snapshot['characters'][f'{name}（{label}）'] = groups(forms[element])
fallback = re.search(r'default:\s*return rule\([^,]+,\s*\{([^}]+)\}', traveler)
for name in ['旅行者', '空', '荧']:
    snapshot['characters'][name] = groups(fallback.group(1))
for filename, name in [('miao-manekin-calc.js', '奇偶·男性'), ('miao-manekina-calc.js', '奇偶·女性')]:
    text = read(filename, f'resources/meta-gs/character/{name}/calc.js')
    declaration = re.search(r"export const mainAttr = '([\w,]+)'", text)
    if not declaration:
        raise ValueError(f'No explicit mainAttr: {name}')
    snapshot['characters'][name] = [mapping[key] for key in declaration.group(1).split(',') if key in mapping]
snapshot['supplements'] = supplements
snapshot['policy'] = 'Nonzero default usefulAttr substat groups; traveler uses explicit per-element artis.js rules, Manekin uses declared calc.js mainAttr. No dynamic per-build thresholds or scoring weights applied.'
write_content(target, snapshot)
print(f"Effective defaults: {len(snapshot['characters'])} named entries, pinned {snapshot['commit']}")
