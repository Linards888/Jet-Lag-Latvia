"""Writes docs/OWNER-CHEATSHEET.md from public/cheatsheet.json (the owner console shows the same data). Run: python tools/make_cheatsheet.py"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
data = json.load(open(os.path.join(ROOT, 'public', 'cheatsheet.json'), encoding='utf-8'))
out = ['# Īpašnieka špikeris\n', 'Visas komandas un vērtības, ko vari lietot Owner console (`#/owner`).\n']
for sec in data:
    out.append('\n## %s\n' % sec['title'])
    if sec['text']:
        out.append(sec['text'] + '\n')
    if sec['rows']:
        out.append('\n| Nosaukums / ceļš | Piemērs | Ko dara |\n|---|---|---|')
        out.extend('| `%s` | `%s` | %s |' % (k, ex.replace('|', '\\|'), what) for k, ex, what in sec['rows'])
os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
open(os.path.join(ROOT, 'docs', 'OWNER-CHEATSHEET.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('docs/OWNER-CHEATSHEET.md written')
