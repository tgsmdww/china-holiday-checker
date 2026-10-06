#!/usr/bin/env python3
"""Fetch annual State Council notices; reject incomplete/ambiguous calendars."""
import argparse
import copy
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlencode, urlparse

ROOT = Path(__file__).resolve().parents[1]
SEARCH = 'https://sousuo.www.gov.cn/search-gov/data?'
NOTICE_TITLE = r'国务院办公厅关于(20\d{2})年部分节假日安排的通知'
NAMES = {
    '元旦': ("New Year's Day", '元旦', 'busy'),
    '春节': ('Spring Festival', 'Chinese New Year · 春节', 'high'),
    '清明节': ('Qingming Festival', 'Tomb-Sweeping Day · 清明节', 'busy'),
    '劳动节': ('Labour Day', 'May Day holiday · 劳动节', 'high'),
    '端午节': ('Dragon Boat Festival', 'Duanwu · 端午节', 'busy'),
    '中秋节': ('Mid-Autumn Festival', 'Moon Festival · 中秋节', 'busy'),
    '国庆节': ('National Day', 'Golden Week · 国庆节', 'high'),
}

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def plain(raw):
    p = Text(); p.feed(raw)
    return re.sub(r'\s+', '', html.unescape(''.join(p.parts)))

def fetch(url):
    # curl uses the OS trust store, enforces HTTPS and bounds all requests.
    p = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
        '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '15',
        '--max-time', '60', '--retry', '2', '--max-filesize', '5000000', url],
        capture_output=True, check=True, timeout=210)
    return p.stdout.decode('utf-8')

def official_url(url):
    u = urlparse(url)
    if u.scheme != 'https' or u.hostname != 'www.gov.cn' or not u.path.startswith('/zhengce/') or u.username or u.port:
        raise ValueError('Unexpected official notice URL')
    return url

def discover(fetcher=fetch):
    query = urlencode(dict(q='节假日', t='zhengcelibrary_gw', searchfield='title',
        sort='pubtime', sortType=1, p=1, n=100))
    response = json.loads(fetcher(SEARCH + query))
    if response.get('code') != 200: raise ValueError('Official search failed')
    result = response['searchVO']; items = result['listVO']
    if not isinstance(items, list) or not items: raise ValueError('Official search returned no records')
    if result['totalCount'] > len(items): raise ValueError('Official search requires pagination; review needed')
    notices = {}
    for item in items:
        match = re.fullmatch(NOTICE_TITLE, plain(item['title']))
        if not match: continue
        year = match[1]; url = official_url(item['url'])
        if year in notices and notices[year] != url: raise ValueError('Conflicting annual notices')
        notices[year] = url
    if '2026' not in notices: raise ValueError('Known 2026 notice missing from official search')
    return notices

def parse_notice(raw, year, source):
    source = official_url(source)
    text = plain(raw)
    if not re.search(NOTICE_TITLE.replace('(20\\d{2})', str(year)), text):
        raise ValueError('Notice title/year mismatch')
    if '经国务院批准' not in text and '经党中央、国务院批准' not in text:
        raise ValueError('Approval statement missing')
    # Only numbered holiday clauses; compensating workdays occur after 放假.
    clauses = re.findall(r'[一二三四五六七八九十]+、([^：:。]+)[：:]([^。]+)。(?:[^。]*上班。)?', text)
    rows = []; seen = set()
    for label, clause in clauses:
        categories = [n for n in NAMES if n in label]
        if not categories: continue
        if label.replace('、','').replace('和','') != ''.join(categories):
            # Combined National Day/Mid-Autumn may list names in either order.
            remainder = label.replace('、','').replace('和','')
            for name in categories: remainder = remainder.replace(name, '')
            if remainder: raise ValueError('Unknown holiday clause')
        if seen.intersection(categories): raise ValueError('Duplicate holiday')
        seen.update(categories)
        clean = re.sub(r'（[^）]*）|\([^)]*\)', '', clause)
        clean = re.sub(r'放假(\d+)天[，,]不调休$', r'放假，共\1天', clean)
        m = re.fullmatch(r'(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日(?:至(?:(20\d{2})年)?(?:(\d{1,2})月)?(\d{1,2})日)?放假(?:调休)?[，,]共(\d{1,2})天', clean)
        if not m: raise ValueError('Unrecognized holiday date format: ' + label)
        sy, sm, sd, ey, em, ed, count = m.groups()
        sy = int(sy or year); sm = int(sm); sd = int(sd)
        ey = int(ey or sy); em = int(em or sm); ed = int(ed or sd)
        if em < sm and not m[4]: ey += 1
        start, end = dt.date(sy,sm,sd), dt.date(ey,em,ed)
        count = int(count)
        if not 1 <= count <= 15 or (end-start).days+1 != count: raise ValueError('Holiday duration mismatch')
        if not (dt.date(int(year)-1,12,25) <= start <= end <= dt.date(int(year),12,31)):
            raise ValueError('Holiday outside notice year')
        rows.append(dict(name=' / '.join(NAMES[n][0] for n in categories),
            local=' · '.join(categories), start=start.isoformat(), end=end.isoformat(),
            level='high' if any(NAMES[n][2]=='high' for n in categories) else 'busy'))
    if seen != set(NAMES): raise ValueError('Incomplete annual calendar')
    rows.sort(key=lambda h:h['start'])
    for prev, nxt in zip(rows,rows[1:]):
        if prev['end'] >= nxt['start']: raise ValueError('Overlapping holiday breaks')
    total = sum((dt.date.fromisoformat(h['end'])-dt.date.fromisoformat(h['start'])).days+1 for h in rows)
    if not 20 <= total <= 50: raise ValueError('Unexpected annual holiday total')
    return dict(source=source, noticeHash=hashlib.sha256(text.encode()).hexdigest(), holidays=rows)

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')

def atomic_json(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    temp.replace(path)

def update(data, fetcher=fetch, now=None):
    stamp = now or now_iso()
    notices = discover(fetcher)
    candidate = copy.deepcopy(data)
    current_year = dt.datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(dt.timezone(dt.timedelta(hours=8))).year
    years = set(data['years']) | {y for y in notices if 2026 <= int(y) <= current_year+1}
    for year in sorted(years):
        if year not in notices: raise ValueError('Previously verified annual notice disappeared')
        parsed = parse_notice(fetcher(notices[year]), year, notices[year])
        parsed['verifiedAt'] = stamp
        candidate['years'][year] = parsed
    candidate['lastSuccessfulCheck'] = stamp
    return candidate

def run(root=ROOT):
    path = root/'data/holidays.json'; status_path = root/'data/update-status.json'
    data = json.loads(path.read_text())
    status = dict(lastAttempt=now_iso(), lastSuccess=data.get('lastSuccessfulCheck'), state='error')
    try:
        candidate = update(data)
        atomic_json(path,candidate)
        status.update(lastSuccess=candidate['lastSuccessfulCheck'],state='ok',message='Official annual holiday notices checked successfully.')
        atomic_json(status_path,status)
        print('Verified years: ' + ', '.join(candidate['years']))
        return 0
    except Exception as error:
        status['message'] = 'Automatic check failed; previously verified dates have been retained.'
        atomic_json(status_path,status)
        print(f'Update failed: {type(error).__name__}: {error}',file=sys.stderr)
        return 1

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--root',type=Path,default=ROOT)
    sys.exit(run(parser.parse_args().root))
