#!/usr/bin/env python3
"""Keep AI Draw's results file current: latest official draws and prize tables.

Runs on a schedule (GitHub Actions in the AI Boosters site repo) and by hand:

    python update_results.py data/ai-draw-results.json            # update in place
    python update_results.py data/ai-draw-results.json --days 400  # deeper backfill

Standard library only, so the scheduled job needs no installs.

Sources (official operators only; nothing is estimated or filled in)
  Eurojackpot, Lotto 6aus49  WestLotto WL_InfoService (German state lottery company)
                             https://www.westlotto.de/wlinfo/WL_InfoService
  EuroMillions               Irish National Lottery results history page, the
                             embedded __NEXT_DATA__ block (Europe-wide winners, EUR)
                             https://www.lottery.ie/results/euromillions/history

A draw is stored with "complete": false until its prize table is published,
and re-fetched on every run until it is complete. If a source fails, the
previous data for that game is kept and the error is recorded in "errors".
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

UA = "AI-Draw-results/1.0 (+https://aiboostersweb-gpt.vercel.app/ai-draw)"
WL = ("https://www.westlotto.de/wlinfo/WL_InfoService?client=jsn&gruppe=ZahlenUndQuoten"
      "&ewGewsum=ja&historie=ja&spielart={game}&adg=ja&lang=de&datum={d}")
IE = "https://www.lottery.ie/results/euromillions/history"
KEEP = 120            # draws kept per game (about a year for twice-weekly games)
EM_DAYS = (1, 4)      # Tuesday, Friday (Python weekday numbers)


def _ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def get(url: str, retries: int = 4) -> str:
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=30, context=_ctx()) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001 - network errors of every kind are retried
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def _num(x) -> float | None:
    try:
        v = float(x)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- WestLotto
def westlotto_draw(game: str, payload: dict) -> dict | None:
    if payload.get("error") or not payload.get("zahlen"):
        return None
    head = payload["head"]
    zs = payload["zahlen"]["hauptlotterie"]["ziehungen"]
    out: dict = {"date": head["datum"], "complete": False, "prizes": []}
    if game == "EJ":
        if len(zs) != 2:
            return None
        out["main"] = sorted(int(x) for x in zs[0]["zahlenSortiert"])
        out["extra"] = sorted(int(x) for x in zs[1]["zahlenSortiert"])
        if len(out["main"]) != 5 or len(out["extra"]) != 2:
            return None
    else:
        if len(zs) != 1 or zs[0].get("superzahl") in (None, ""):
            return None
        out["main"] = sorted(int(x) for x in zs[0]["zahlenSortiert"])
        out["superzahl"] = int(zs[0]["superzahl"])
        if len(out["main"]) != 6:
            return None
    try:
        for g in payload["auswertung"]["quoten"]["hauptlotterie"]["ziehungen"][0]["gewinnklassen"]:
            k = g["kurzbeschreibung"].replace(" ", "").upper()
            if game == "EJ":
                m, e = (int(p) for p in k.split("+"))
                row = {"cls": int(g["klasse"]), "m": m, "e": e}
            else:
                row = {"cls": int(g["klasse"]), "m": int(k.split("+")[0]), "sz": 1 if "+" in k else 0}
            row["winners"] = int(g["anzahl"]) if g.get("anzahl") is not None else None
            row["prize"] = _num(g.get("quote"))
            out["prizes"].append(row)
    except (KeyError, IndexError, TypeError, ValueError):
        out["prizes"] = []
    # complete = the service says so and every class with winners has an amount
    out["complete"] = bool(out["prizes"]) and not head.get("fehlenDaten") and all(
        p["prize"] is not None or not p["winners"] for p in out["prizes"])
    out["next"] = (head.get("folgeZiehung") or {}).get("datum")
    return out


def westlotto(game: str, old: dict, days: int) -> dict:
    """Newest draws for EJ or LOTTO. Only dates that are new or incomplete are fetched."""
    have = {d["date"]: d for d in old.get("draws", [])}
    probe = None
    for back in range(0, 10):
        d = (date.today() - timedelta(days=back)).isoformat()
        p = json.loads(get(WL.format(game=game, d=d)))
        if p.get("history") and p["history"].get("tage"):
            probe = p
            break
    if probe is None:
        raise RuntimeError("WestLotto returned no recent draw")
    since = (date.today() - timedelta(days=days)).isoformat()
    tage = set(probe["history"]["tage"])
    # the calendar covers one year back from the probed draw; extend once if asked for more
    if days > 360:
        oldest = min(tage)
        for back in range(1, 11):
            p = json.loads(get(WL.format(game=game, d=(date.fromisoformat(oldest) - timedelta(days=back)).isoformat())))
            if p.get("history") and p["history"].get("tage"):
                tage |= set(p["history"]["tage"])
                break
    want = sorted((d for d in tage if since <= d <= date.today().isoformat()), reverse=True)[:KEEP]
    draws, nxt = [], None
    for d in want:
        if d in have and have[d].get("complete"):
            draws.append(have[d])
            continue
        rec = westlotto_draw(game, json.loads(get(WL.format(game=game, d=d))))
        time.sleep(0.3)
        if rec:
            nxt = nxt or rec.pop("next", None)
            rec.pop("next", None)
            draws.append(rec)
        elif d in have:
            draws.append(have[d])
    first = westlotto_draw(game, probe) or {}
    nxt = first.get("next") or nxt or old.get("next")
    draws.sort(key=lambda r: r["date"], reverse=True)
    return {"next": nxt, "draws": draws[:KEEP]}


# ---------------------------------------------------------------- EuroMillions (lottery.ie)
def _match(s: str) -> tuple[int, int]:
    s = s.replace(" ", "")
    return (int(s.split("+")[0]), int(s.split("+")[1])) if "+" in s else (int(s), 0)


def _eur(s: str) -> float | None:
    s = (s or "").replace("€", "").replace(",", "").strip()
    return _num(s)


def euromillions(old: dict) -> dict:
    html = get(IE)
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError("lottery.ie page layout changed: no __NEXT_DATA__")
    items = json.loads(m.group(1))["props"]["pageProps"]["list"]
    have = {d["date"]: d for d in old.get("draws", [])}
    for it in items:
        st = it.get("standard") or {}
        if st.get("gameTitle") != "EuroMillions" or not st.get("grids"):
            continue
        when = datetime.fromisoformat(st["drawDates"][0].replace("Z", "+00:00"))
        d = when.astimezone(timezone(timedelta(hours=1))).date().isoformat()   # draw is 21:00 CET
        grid = st["grids"][0]
        main, extra = sorted(grid["standard"][0]), sorted(grid["additional"][0])
        if len(main) != 5 or len(extra) != 2:
            continue
        ranks = {(5, 2): 1, (5, 1): 2, (5, 0): 3, (4, 2): 4, (4, 1): 5, (3, 2): 6, (4, 0): 7,
                 (2, 2): 8, (3, 1): 9, (3, 0): 10, (1, 2): 11, (2, 1): 12, (2, 0): 13}
        prizes = []
        for p in st.get("prizes") or []:
            mm, ee = _match(p["match"])
            prizes.append({"cls": ranks.get((mm, ee)), "m": mm, "e": ee,
                           "winners": p.get("numberOfWinners"), "prize": _eur(p.get("prize"))})
        prizes.sort(key=lambda r: r["cls"] or 99)
        complete = len(prizes) == 13 and all(p["winners"] is not None for p in prizes)
        have[d] = {"date": d, "main": main, "extra": extra, "complete": complete, "prizes": prizes,
                   "jackpot": _eur(st.get("jackpotAmount"))}
    draws = sorted(have.values(), key=lambda r: r["date"], reverse=True)[:KEEP]
    nd = date.today()
    while nd.weekday() not in EM_DAYS or (draws and nd.isoformat() <= draws[0]["date"]):
        nd += timedelta(days=1)
    return {"next": nd.isoformat(), "draws": draws}


SOURCES = {
    "eurojackpot": "WestLotto (official Eurojackpot operator), westlotto.de",
    "lotto649": "WestLotto (official Lotto 6aus49 operator), westlotto.de",
    "euromillions": "Irish National Lottery (official EuroMillions operator), lottery.ie. Prizes are the Irish payout in euros; "
                    "other countries' amounts can differ by a few cents.",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--days", type=int, default=200, help="how far back to keep WestLotto draws")
    a = ap.parse_args()
    old = json.loads(a.out.read_text(encoding="utf-8")) if a.out.exists() else {"games": {}}
    games, errors = {}, {}
    jobs = {"eurojackpot": lambda o: westlotto("EJ", o, a.days),
            "lotto649": lambda o: westlotto("LOTTO", o, a.days),
            "euromillions": euromillions}
    for key, job in jobs.items():
        prev = old.get("games", {}).get(key, {})
        try:
            g = job(prev)
            g["source"] = SOURCES[key]
            games[key] = g
        except Exception as e:  # noqa: BLE001 - keep the other games and the old data
            errors[key] = str(e)[:300]
            if prev:
                games[key] = prev
    new = {"games": games, "errors": errors}
    if new["games"] == old.get("games") and errors == old.get("errors", {}):
        print("no change")
        return 0
    new["updated"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(new, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    for k, g in games.items():
        last = g["draws"][0] if g.get("draws") else {}
        print(f"{k}: {len(g.get('draws', []))} draws, latest {last.get('date')} complete={last.get('complete')}, next {g.get('next')}")
    for k, e in errors.items():
        print(f"ERROR {k}: {e}", file=sys.stderr)
    return 1 if len(errors) == len(jobs) else 0


if __name__ == "__main__":
    sys.exit(main())
