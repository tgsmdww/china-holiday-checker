#!/usr/bin/env python3
"""Run under a dedicated unprivileged account; push only data files, verify Pages."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from update_holidays import run, fetch, atomic_json, now_iso

REPO=Path(os.environ.get('HOLIDAY_REPO','/var/lib/china-holiday-checker/repo'))
STATE=REPO.parent/'run-status.json'
SITE='https://tgsmdww.github.io/china-holiday-checker/'

def git(*args):
    return subprocess.run(['git','-C',str(REPO),*args],capture_output=True,text=True,check=True,timeout=90).stdout

def publish():
    atomic_json(STATE,dict(state='running',startedAt=now_iso()))
    git('fetch','origin','main')
    git('merge','--ff-only','origin/main')
    unexpected=[line for line in git('status','--porcelain').splitlines() if line[3:] not in ('data/holidays.json','data/update-status.json')]
    if unexpected: raise RuntimeError('Unexpected worktree changes; refusing to publish')
    result=run(REPO)
    git('add','--','data/holidays.json','data/update-status.json')
    if git('diff','--cached','--name-only').strip():
        git('commit','-m','Refresh official holiday data and check status')
    git('push','origin','HEAD:main')
    expected={name:json.loads((REPO/'data'/name).read_text()) for name in ['holidays.json','update-status.json']}
    # Pages is asynchronous. A successful push alone does not prove publication.
    deadline=time.monotonic()+600
    while time.monotonic()<deadline:
        try:
            actual={name:json.loads(fetch(SITE+'data/'+name+'?check='+str(time.time_ns()))) for name in expected}
            if actual==expected:
                atomic_json(STATE,dict(state='ok' if result==0 else 'source-error',finishedAt=now_iso(),commit=git('rev-parse','HEAD').strip(),deploymentVerified=True))
                print('GitHub Pages data verified after publication.',flush=True)
                return result
        except Exception as error:
            print('Waiting for Pages:',type(error).__name__,flush=True)
        time.sleep(20)
    raise RuntimeError('Pages did not publish matching data within 10 minutes')

if __name__=='__main__':
    try: sys.exit(publish())
    except Exception as error:
        atomic_json(STATE,dict(state='error',finishedAt=now_iso(),message=str(error)))
        print(f'Publication failed: {error}',file=sys.stderr)
        sys.exit(1)
