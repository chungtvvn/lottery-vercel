#!/usr/bin/env python3
"""Ensemble 5 AI — ban chay doc lap cho may khac chay hang ngay voi du lieu that.
Doc: files/Ensemble_5AI_CongThuc_ChiTiet.md (cung goi).

Du lieu vao: JSON gop (compact) dang:
  {"draws": N, "updatedThrough": "YYYY-MM-DD",
   "data": [[date, [27 so nguyen theo thu tu: DB, G1, 2xG2, 6xG3, 4xG4, 6xG5, 3xG6, 4xG7]], ...]}
  hoac JSON day du khiemdoan (list cac dict co date/special/prize*).
Chi dung cac ky co date < target (khong nhin truoc).

Cach dung:
  python3 scripts/ensemble_5ai.py --data data/xsmb-2-digits-compact.json --target 2026-11-05
  python3 scripts/ensemble_5ai.py --data data/xsmb-2-digits-compact.json --backtest 1000
Ket qua: JSON ra stdout (hoac --out <file>).
"""
import argparse
import json
import math
import statistics
from collections import Counter


def load_draws(path):
    raw = json.load(open(path))
    if isinstance(raw, dict) and 'data' in raw:
        return [(d, list(v)) for d, v in raw['data']]
    if isinstance(raw, list):
        out = []
        for e in raw:
            date = e['date'][:10]
            vals = [e['special'], e['prize1'], e['prize2_1'], e['prize2_2'],
                    e['prize3_1'], e['prize3_2'], e['prize3_3'], e['prize3_4'],
                    e['prize3_5'], e['prize3_6'],
                    e['prize4_1'], e['prize4_2'], e['prize4_3'], e['prize4_4'],
                    e['prize5_1'], e['prize5_2'], e['prize5_3'], e['prize5_4'],
                    e['prize5_5'], e['prize5_6'],
                    e['prize6_1'], e['prize6_2'], e['prize6_3'],
                    e['prize7_1'], e['prize7_2'], e['prize7_3'], e['prize7_4']]
            out.append((date, vals))
        return out
    raise ValueError('dinh dang JSON khong nhan dien duoc')


def avg_rank(vals):
    """Hang trung binh: so bang nhau chia deu cac vi tri (vi tri 1 = cao nhat)."""
    groups = {}
    for x, v in vals.items():
        groups.setdefault(v, []).append(x)
    ranks, pos = {}, 1
    for v in sorted(groups, reverse=True):
        ns = groups[v]
        r = (pos + pos + len(ns) - 1) / 2
        for x in ns:
            ranks[x] = r
        pos += len(ns)
    return ranks


def pct_of(vals):
    r = avg_rank(vals)
    return {x: (100 - r[x]) / 99 for x in range(100)}


def zscore(vals):
    m = statistics.mean(vals.values())
    s = statistics.pstdev(vals.values())
    return {x: (vals[x] - m) / s for x in range(100)}


def full(c):
    return {x: c[x] for x in range(100)}


class State:
    """Trang thai dem tich luy tren cac ky < ngay hien tai."""

    def __init__(self, draws):
        self.draws = draws
        self.lo_all, self.de_all = Counter(), Counter()
        self.lo_seen, self.de_seen = {}, {}
        for i, (dt, nums) in enumerate(draws):
            self.lo_all.update(nums)
            self.de_all.update([nums[0]])
            for x in set(nums):
                self.lo_seen[x] = i
            self.de_seen[nums[0]] = i

    def advance(self, i, nums):
        self.lo_all.update(nums)
        self.de_all.update([nums[0]])
        for x in set(nums):
            self.lo_seen[x] = i
        self.de_seen[nums[0]] = i


def ai_scores(st, i, n_before):
    """Tra ve (lo, de): moi cai la dict ten AI -> vector diem tren 100 so."""
    draws = st.draws
    lo_100 = full(Counter(x for _, v in draws[i - 100:i] for x in v))
    lo_30 = full(Counter(x for _, v in draws[i - 30:i] for x in v))
    de_100 = full(Counter(v[0] for _, v in draws[i - 100:i]))
    de_30 = full(Counter(v[0] for _, v in draws[i - 30:i]))
    gap_lo = {x: i - 1 - st.lo_seen.get(x, -1) if x in st.lo_seen else i for x in range(100)}
    gap_de = {x: i - 1 - st.de_seen.get(x, -1) if x in st.de_seen else i for x in range(100)}
    lo, de = {}, {}
    # Muse
    lo['muse'] = {x: st.lo_all[x] + 2 * lo_100[x] for x in range(100)}
    de['muse'] = {x: st.de_all[x] + 2 * de_100[x] for x in range(100)}
    # Perplexity
    lo['perplexity'] = {x: 0.5 * st.lo_all[x] / (n_before * 27) + 0.5 * lo_100[x] / (100 * 27) for x in range(100)}
    de['perplexity'] = {x: 0.5 * st.de_all[x] / n_before + 0.5 * de_100[x] / 100 for x in range(100)}
    # Gemini Lo (Z-score, lam tron 4 chu so)
    z30, z100, zall = zscore(lo_30), zscore(lo_100), zscore(st.lo_all)
    lo['gemini'] = {x: round(0.40 * z30[x] + 0.30 * z100[x] + 0.20 * (min(gap_lo[x], 30) / 30) + 0.10 * zall[x], 4) for x in range(100)}
    # ChatGPT Lo (percentile)
    r_h, r_1, r_3, r_g = avg_rank(st.lo_all), avg_rank(lo_100), avg_rank(lo_30), avg_rank(gap_lo)
    p = lambda r: (100 - r) / 99
    lo['chatgpt'] = {x: 0.20 * p(r_h[x]) + 0.30 * p(r_1[x]) + 0.30 * p(r_3[x]) + 0.20 * p(r_g[x]) for x in range(100)}
    # Claude Lo = F100; Claude De (adapted) = F100 tren cot DB
    lo['claude'] = dict(lo_100)
    de['claude'] = dict(de_100)
    # Gemini/ChatGPT De = union: tang 3/2/1/0
    top_fall = set(sorted(range(100), key=lambda x: (-st.de_all[x], x))[:10])
    top_100 = set(sorted(range(100), key=lambda x: (-de_100[x], x))[:10])
    core = top_fall | top_100
    fill = max((x for x in range(100) if x not in core), key=lambda x: (gap_de[x], -x))
    uni = {}
    for x in range(100):
        if x in top_fall and x in top_100:
            uni[x] = 3
        elif x in core:
            uni[x] = 2
        elif x == fill:
            uni[x] = 1
        else:
            uni[x] = 0
    de['gemini'] = dict(uni)
    de['chatgpt'] = dict(uni)
    return lo, de


def ensemble(lo, de):
    out = {}
    for side, d in (('lo', lo), ('de', de)):
        pcts = {s: pct_of(v) for s, v in d.items()}
        ens = {x: sum(pcts[s][x] for s in d) / len(d) for x in range(100)}
        ranked = sorted(range(100), key=lambda x: (-ens[x], x))
        out[side] = {'ranking': [(f'{x:02d}', round(ens[x], 4)) for x in ranked],
                     'top50': [f'{x:02d}' for x in ranked[:50]],
                     'top20': [f'{x:02d}' for x in ranked[:20]],
                     'top6': [f'{x:02d}' for x in ranked[:6]]}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--target', default=None, help='YYYY-MM-DD; mac dinh = ngay sau ky cuoi')
    ap.add_argument('--backtest', type=int, default=0, help='so ky walk-forward de do (0 = khong chay)')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()

    all_draws = load_draws(a.data)
    if a.target:
        draws = [(d, v) for d, v in all_draws if d < a.target]
        target = a.target
    else:
        draws = all_draws
        last = draws[-1][0]
        y, m, dd = map(int, last.split('-'))
        import datetime
        target = (datetime.date(y, m, dd) + datetime.timedelta(days=1)).isoformat()
    result = {'target': target, 'draws_used': len(draws),
              'data_through': draws[-1][0] if draws else None}

    st = State(draws)
    lo, de = ai_scores(st, len(draws), len(draws))
    result.update(ensemble(lo, de))

    if a.backtest:
        n = min(a.backtest, len(all_draws))
        start = len(all_draws) - n
        st2 = State(all_draws[:start])
        lo50, lo20, lo6, de50, de20 = [], [], [], [], []
        for i in range(start, len(all_draws)):
            lo_b, de_b = ai_scores(st2, i, i)
            ens = ensemble(lo_b, de_b)
            _, nums = all_draws[i]
            pset, db = set(nums), nums[0]
            lo50.append(len(set(ens['lo']['top50']) & pset))
            lo20.append(len(set(ens['lo']['top20']) & pset))
            lo6.append(len(set(ens['lo']['top6']) & pset))
            de50.append(1 if db in ens['de']['top50'] else 0)
            de20.append(1 if db in ens['de']['top20'] else 0)
            st2.advance(i, nums)

        def summ(vals):
            m = sum(vals) / len(vals)
            se = statistics.pstdev(vals) / math.sqrt(len(vals))
            return {'mean': round(m, 4), 'ci95_half': round(1.96 * se, 4), 'n': len(vals)}
        p1 = 1 - (99 / 100) ** 27
        result['backtest'] = {
            'lo_top50': {**summ(lo50), 'random_baseline': round(50 * p1, 4)},
            'lo_top20': {**summ(lo20), 'random_baseline': round(20 * p1, 4)},
            'lo_top6': {**summ(lo6), 'random_baseline': round(6 * p1, 4)},
            'de_top50': {**summ(de50), 'random_baseline': 0.5},
            'de_top20': {**summ(de20), 'random_baseline': 0.2},
        }

    text = json.dumps(result, ensure_ascii=False, indent=1)
    if a.out:
        open(a.out, 'w').write(text)
    print(text)


if __name__ == '__main__':
    main()
