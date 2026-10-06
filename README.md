# China Holiday Checker

Static public website: https://tgsmdww.github.io/china-holiday-checker/

## What updates automatically

The browser reads `data/holidays.json`. Annual schedules, trip checks, source links and the next-holiday countdown use that data, including newly verified years. Unknown years remain explicitly unverified. Countdown days use Asia/Shanghai. Crowd labels are editorial guidance; Spring Festival travel-rush dates are a separate, manually verified dataset and are **not** inferred from annual holidays.

The server job searches the State Council policy library for annual notices, then parses their official Chinese text at `www.gov.cn`. It requires all seven holiday categories (including combined holidays), valid non-overlapping date ranges and matching stated durations. Any fetch, discovery or validation failure preserves the entire last known good calendar and publishes an error status when GitHub is reachable. Announcement format or search API changes may require maintenance; this is a daily check, not a guarantee of immediate discovery.

The page displays the last successful check and a warning after 48 hours without a successful check, or when a published check fails. This detects stale data even when the server is down, when someone visits the page. No external email/SMS outage notification is configured.

## Server installation

Requirements: Python 3.9+, curl, git, OpenSSH, systemd. No Python packages or database required.

- Dedicated account: `holiday-updater`, home `/var/lib/china-holiday-checker`.
- Checkout: `/var/lib/china-holiday-checker/repo`.
- Root-owned executables: `/opt/china-holiday-checker/{update_holidays,publish_update}.py`.
- Private deploy key: `/var/lib/china-holiday-checker/.ssh/github_ed25519` (0600); never commit it.
- Add only its public key as a **write-enabled deploy key for this repository**. It must not be an account-wide SSH key. This grants the server write access to this repository, not just its data paths.
- Pin GitHub's SSH host key from `https://api.github.com/meta`; keep strict host checking enabled.
- Install the units in `deploy/` into `/etc/systemd/system/`.
- Enable only after deploy-key authorization and a successful publication test:

```sh
systemctl daemon-reload
systemctl start china-holiday-update.service
systemctl enable --now china-holiday-update.timer
```

Runs daily at **09:15 Asia/Shanghai**; `Persistent=true` catches up after downtime. Failures retry after 15 minutes, up to three starts per three hours. A daily timer remains scheduled after exhausted retries. The service runs as the unprivileged account and can write only its dedicated state directory. It pushes changes to the two data files, then waits up to 10 minutes for both public Pages files to match. Failure is recorded locally and in the systemd journal. GitHub Pages must remain configured for main, repository root.

The server scripts are deliberately installed separately from the website checkout: deploying a script change requires copying the reviewed scripts into `/opt/china-holiday-checker/` again. The job does not execute freshly downloaded repository code.

## Operations

```sh
systemctl list-timers china-holiday-update.timer
systemctl status china-holiday-update.service
journalctl -u china-holiday-update.service -n 80 --no-pager
cat /var/lib/china-holiday-checker/run-status.json
```

Stop future runs: `systemctl disable --now china-holiday-update.timer`. Also stop the service to cancel an active run or retry. Revoke the repository deploy key in GitHub to remove the server's publishing access.

If a push fails, no force push is performed. Resolve any divergent checkout/history before restarting the service. For an incorrect calendar, stop the timer, fix the parser and restore a previously verified version from Git history before republishing.

## Tests

```sh
python3 -m unittest discover -s tests -v
node tests/test_app.cjs
python3 scripts/update_holidays.py
```

The last command performs a live official-source check and writes the local data/status files. Parser fixtures cover real 2025 and 2026 notices. Future-year tests use synthetic data only in memory; it is never published.
