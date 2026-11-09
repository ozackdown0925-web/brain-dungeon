# 日本地図の棚（書庫）の地図データを作る（2026-11-09）。
# もとのデータ：Natural Earth（パブリックドメイン）の ne_10m_admin_1_states_provinces.geojson
#   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
# 使い方：py tools/make-japan-map.py <ダウンロードした geojson> → js/game/japanmap.js を書き出す
# 県のさかいを少しなめらかにし、小さな島ははぶく。座標は 経度・緯度 をかんたんな方法で平らにしたもの（1 = 約1km）。
import json, math, sys, os

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "js", "game", "japanmap.js")
LON0, LAT0, K = 127.0, 46.0, 100.0
COS = math.cos(math.radians(36))
TOL = 0.9          # なめらかにする度合い（1 = 約1km）
MIN_AREA = 12.0    # これより小さい島ははぶく（平方km のめやすの 1/1）

def proj(lon, lat):
    return ((lon - LON0) * COS * K, (LAT0 - lat) * K)

def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L > 1e-9 else math.hypot(px - ax, py - ay)
            if d > best: best, bi = d, i
        if best > tol:
            keep[bi] = True; stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def area(r):
    s = 0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

d = json.load(open(SRC, encoding="utf-8"))
out = {}
for f in d["features"]:
    p = f["properties"]
    if p.get("adm0_a3") != "JPN": continue
    code = p["iso_3166_2"].split("-")[1]
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = []
    for poly in polys:
        outer = [proj(x, y) for x, y in poly[0]]
        rings.append(outer)
    rings.sort(key=area, reverse=True)
    main = rings[0]
    keep = [r for r in rings if area(r) >= MIN_AREA or r is main]
    # 東京都の小笠原諸島・伊豆諸島の南のほうははぶく（本州から遠いため）
    if code == "13": keep = [r for r in keep if min(y for x, y in r) < (LAT0 - 34.5) * K]
    # 沖縄県は沖縄島のまわり（先島諸島・大東諸島ははぶく。全国の地図で左上の四角に入れるため）
    if code == "47":
        def mid(r): return (sum(x for x, y in r) / len(r), sum(y for x, y in r) / len(r))
        keep = [r for r in keep if -60 <= mid(r)[0] <= 140 and mid(r)[1] >= (LAT0 - 27.2) * K]
    paths = []
    for r in keep:
        s = dp(r[:-1] if r[0] == r[-1] else r, TOL)
        if len(s) < 3: continue
        paths.append("M" + "L".join("%d %d" % (round(x), round(y)) for x, y in s) + "Z")
    xs = [x for x, y in main]; ys = [y for x, y in main]
    out[code] = {"d": "".join(paths), "box": [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))]}

allx = []; ally = []
for c, v in out.items():
    if c == "47": continue
    allx += [v["box"][0], v["box"][2]]; ally += [v["box"][1], v["box"][3]]
js = ("// 日本地図の棚の地図データ（tools/make-japan-map.py で作った。手で直さない）\n"
      "// もと：Natural Earth（パブリックドメイン）。座標は 1 = 約1km。box は いちばん大きい島の範囲 [左, 上, 右, 下]。\n"
      "var JAPAN_MAP = " + json.dumps({"prefs": out}, ensure_ascii=False, separators=(",", ":")) + ";\n")
open(OUT, "w", encoding="utf-8").write(js)
print("wrote", OUT, len(js), "bytes; mainland box", min(allx), min(ally), max(allx), max(ally))
