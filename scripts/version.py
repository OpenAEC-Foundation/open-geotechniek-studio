#!/usr/bin/env python3
"""Synchronise product versions using Blueprint's ISO year.week.release convention."""
import argparse, datetime, json, re, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'apps/desktop'

def validate(value):
    if not re.fullmatch(r'20\d{2}\.[1-9]\d?\.(0|[1-9]\d*)', value):
        raise ValueError('Expected YYYY.W.N without leading zeros')
    year, week, number = map(int, value.split('.'))
    datetime.date.fromisocalendar(year, week, 1)
    if number > 65535:
        raise ValueError('Release number exceeds package limit')
    return value

def check(version):
    validate(version)
    assert json.loads((APP/'package-lock.json').read_text())['version'] == version
    assert json.loads((APP/'package-lock.json').read_text())['packages']['']['version'] == version
    assert json.loads((APP/'src-tauri/tauri.conf.json').read_text())['version'] == version
    assert re.search(r'\[package\][\s\S]*?\nversion = "([^"]+)"', (APP/'src-tauri/Cargo.toml').read_text())[1] == version
    assert f'name = "open-geo-studio"\nversion = "{version}"' in (APP/'src-tauri/Cargo.lock').read_text()
    assert f"version: '{version}'" in (ROOT/'snap/snapcraft.yaml').read_text()
    assert json.loads((ROOT/'packages/core/package.json').read_text())['version'] == version
    assert re.search(r'\[package\][\s\S]*?\nversion = "([^"]+)"', (ROOT/'packages/native/Cargo.toml').read_text())[1] == version
    assert f'name = "openaec-geotechniek-sdk"\nversion = "{version}"' in (ROOT/'packages/native/Cargo.lock').read_text()
    print(f'All product versions: {version}')

def set_version(version):
    validate(version)
    for name in ['package.json','package-lock.json','src-tauri/tauri.conf.json']:
        p=APP/name; d=json.loads(p.read_text()); d['version']=version
        if name=='package-lock.json': d['packages']['']['version']=version
        p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    p=APP/'src-tauri/Cargo.toml';p.write_text(re.sub(r'(\[package\][\s\S]*?\nversion = ")[^"]+',lambda m:m[1]+version,p.read_text(),count=1))
    p=APP/'src-tauri/Cargo.lock';p.write_text(re.sub(r'(name = "open-geo-studio"\nversion = ")[^"]+',lambda m:m[1]+version,p.read_text(),count=1))
    p=ROOT/'snap/snapcraft.yaml';p.write_text(re.sub(r'^version:.*',f"version: '{version}'",p.read_text(),flags=re.M))
    for lang in ['nl','en']:
        p=APP/f'src/i18n/locales/{lang}/common.json';d=json.loads(p.read_text());d['version']=f'Open Geotechniek Studio v{version}';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    p=ROOT/'packages/core/package.json';d=json.loads(p.read_text());d['version']=version;p.write_text(json.dumps(d,indent=2)+'\n')
    p=ROOT/'packages/native/Cargo.toml';p.write_text(re.sub(r'(\[package\][\s\S]*?\nversion = ")[^"]+',lambda m:m[1]+version,p.read_text(),count=1))
    p=ROOT/'packages/native/Cargo.lock';p.write_text(re.sub(r'(name = "openaec-geotechniek-sdk"\nversion = ")[^"]+',lambda m:m[1]+version,p.read_text(),count=1))
    check(version)

if __name__ == '__main__':
    p=argparse.ArgumentParser();g=p.add_mutually_exclusive_group(required=True);g.add_argument('--check',action='store_true');g.add_argument('--set');g.add_argument('--next',action='store_true');p.add_argument('--date',help='ISO date for reproducible release preparation');a=p.parse_args()
    current=json.loads((APP/'package.json').read_text())['version']
    if a.check: check(current)
    elif a.set: set_version(a.set)
    else:
        today=datetime.date.fromisoformat(a.date) if a.date else datetime.datetime.now(datetime.timezone.utc).date()
        year,week,_=today.isocalendar();prefix=f'{year}.{week}.'
        tags=subprocess.check_output(['git','tag'],cwd=ROOT,text=True).splitlines()
        candidates=[v.removeprefix('v') for v in tags]+[current]
        releases=[int(v[len(prefix):]) for v in candidates if v.startswith(prefix) and v[len(prefix):].isdigit()]
        set_version(prefix+str(max(releases,default=-1)+1))
