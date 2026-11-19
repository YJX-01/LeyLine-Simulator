import csv
from content_source import read_content, write_content


def read_capture(root):
    directory = root / 'tools/data/sources/asset-capture'
    manifest = read_content(root / 'assets/manifest.json')
    with (directory / 'inputs.tsv').open(encoding='utf-8', newline='') as stream:
        sources = {row['file']: {key: value for key, value in row.items() if value} for row in csv.DictReader(stream, delimiter='\t')}
    for asset in manifest['assets']:
        asset.update(sources.pop(asset['file']))
        asset['bytes'] = (root / asset['file']).stat().st_size
    if sources:
        raise ValueError('Unknown files in asset capture inputs')
    return {**manifest, **read_content(directory / 'settings.json')}


def write_candidate(directory, catalog):
    keys = ('kind', 'key', 'id', 'file', 'name', 'element', 'rarity', 'weaponType', 'aliases', 'slot', 'character')
    assets = [{key: asset[key] for key in keys if key in asset} for asset in catalog['assets']]
    write_content(directory / 'manifest.json', {**{key: catalog[key] for key in ('formatVersion', 'budgets', 'sharedBuffStatIcons')}, 'assets': assets})
    columns = ('file', 'sourceUrl', 'transform', 'sourceFilename', 'sourceVersion', 'sourceModule', 'sourceOverride')
    with (directory / 'inputs.tsv').open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction='ignore', delimiter='\t', lineterminator='\n')
        writer.writeheader()
        writer.writerows(catalog['assets'])
