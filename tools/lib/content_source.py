"""Strict JSON helpers for Python capture tools; no Node subprocess or YAML dependency."""
import json
from pathlib import Path


def reject_constant(value):
    raise ValueError(f'Non-finite JSON value: {value}')


def read_content(path):
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject_constant)


def write_content(path, value):
    with Path(path).open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n')
