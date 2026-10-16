"""手元確認用のプレビューを作る（GAS にはつながない。解いても保存されない）。

使い方: py tools/make_preview.py [テストID ...]   例: py tools/make_preview.py k6
- 問題と画像は成績管理フォルダの drill/content/out/<テストID>.json から読む（塾の教材なのでリポジトリには入れない）。
- できるファイル：_preview_data.js・_preview_drill.html・_preview_editor.html（.gitignore 済み。コミットしない）。
- ブラウザで _preview_drill.html を開くと、本物の GAS の代わりに中の問題で動く。
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = Path(r"<成績管理フォルダ>\drill\content\out")

MOCK = """
window.BD_MOCK = (function () {
  var Q = window.PREVIEW_QUESTIONS, IMG = window.PREVIEW_IMAGES;
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  return {
    check: function () { return { role: "admin" }; },
    drillQuestions: function () { return { questions: copy(Q.filter(function (q) { return q.enabled !== false; })) }; },
    questions: function () { return { questions: copy(Q) }; },
    history: function () { return { records: window.PREVIEW_RECORDS || [] }; },
    image: function (b) { return { src: IMG[b.id] || null }; },
    saveAnswer: function () { return {}; },
    saveQuestion: function (b) { return { question: b.question }; },
    deleteQuestion: function () { return {}; },
    uploadImage: function (b) { var id = "local" + Date.now(); IMG[id] = b.dataUrl; return { id: id }; }
  };
})();
"""


def main():
    tids = sys.argv[1:] or sorted(p.stem for p in OUT_DIR.glob("*.json"))
    qs, imgs = [], {}
    for tid in tids:
        p = json.loads((OUT_DIR / f"{tid}.json").read_text(encoding="utf-8"))
        sw = lambda l: [v[4:] if isinstance(v, str) and v.startswith("img:") else v for v in (l or [])]
        for q in p["questions"]:
            q["images"] = sw(q.get("images")); q["explainImages"] = sw(q.get("explainImages"))
            for pt in q.get("parts", []):
                pt["images"] = sw(pt.get("images"))
            qs.append(q)
        for n, v in p["images"].items():
            imgs[n] = f"data:{v['mime']};base64,{v['data']}"
    data = ("window.PREVIEW_QUESTIONS=" + json.dumps(qs, ensure_ascii=False)
            + ";\nwindow.PREVIEW_IMAGES=" + json.dumps(imgs) + ";\n" + MOCK)
    (ROOT / "_preview_data.js").write_text(data, encoding="utf-8")
    for src in ["drill.html", "editor.html"]:
        page = (ROOT / src).read_text(encoding="utf-8")
        page = page.replace('<script src="js/api.js"></script>',
                            '<script src="_preview_data.js"></script>\n<script src="js/api.js"></script>', 1)
        (ROOT / f"_preview_{src}").write_text(page, encoding="utf-8")
    print(f"_preview_drill.html と _preview_editor.html を作成しました（問題 {len(qs)} 件）")


if __name__ == "__main__":
    main()
