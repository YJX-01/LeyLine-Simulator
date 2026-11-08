"""Capture explicit pinned miao rules as data; never execute upstream JavaScript."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = root / 'docs/constant/character-effective-stats.json'
snapshot = json.loads(target.read_text(encoding='utf8'))
references = root / '.references/metadata'
mapping = {'hp': 'hp', 'atk': 'attack', 'def': 'defense', 'cpct': 'critRate', 'cdmg': 'critDamage', 'mastery': 'elementalMastery', 'recharge': 'energyRecharge'}
supplements = []

def read(filename, source_path):
    raw = (references / filename).read_bytes()
    supplements.append({'path': source_path, 'sha256': hashlib.sha256(raw).hexdigest()})
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
target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
print(f"Effective defaults: {len(snapshot['characters'])} named entries, pinned {snapshot['commit']}")
