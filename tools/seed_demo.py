"""Creates demo games on a running server (for manual UI testing). Usage: python tools/seed_demo.py [base_url]"""
import json, sys, urllib.request
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8090'

def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'X-Token': token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit('HTTP %s %s: %s' % (e.code, path, e.read().decode()))

def make(mode, settings, names, teams=None):
    g = call('POST', '/games', {'mode': mode, 'name': 'Demo ' + mode, 'adminName': 'Boss', 'adminPin': '1234', 'adminPlays': False, 'settings': settings})
    code, admin = g['code'], g['token']
    toks = {}
    for n in names:
        toks[n] = call('POST', '/games/%s/join' % code, {'name': n, 'pin': '1111', 'role': 'player'})['token']
    if teams:
        for team, members in teams.items():
            call('POST', '/games/%s/action' % code, {'type': 'team_create', 'payload': {'name': team}}, toks[members[0]])
            tid = [t for t in call('GET', '/games/%s/state' % code, token=admin)['teams'] if t['name'] == team][0]['id']
            for m in members[1:]:
                call('POST', '/games/%s/action' % code, {'type': 'team_join', 'payload': {'teamId': tid}}, toks[m])
    return code, admin, toks

out = {}
out['race'] = make('race', {'useWindow': False, 'requiredPerTerritory': 2}, ['Anna', 'Bruno', 'Cita'], {'Reds': ['Anna', 'Bruno'], 'Blues': ['Cita']})
out['hide'] = make('hide', {'hidesPerPlayer': 2}, ['Anna', 'Bruno', 'Cita'])
out['tag'] = make('tag', {'useWindow': False, 'allStars': True}, ['Anna', 'Bruno', 'Cita'], {'Reds': ['Anna', 'Bruno'], 'Blues': ['Cita']})
print(json.dumps({k: {'code': v[0], 'admin': v[1], 'tokens': v[2]} for k, v in out.items()}))
