"""Inline fonts, template data and scripts into one self-contained HTML file."""
import base64, json, pathlib

root = pathlib.Path(__file__).parent
fonts = [
    ("PI Hex XCond", 800, "hex-xcond-extrabold.otf"),
    ("PI Hex", 800, "hex-extrabold.otf"),
    ("PI Hex", 300, "hex-light.otf"),
    ("PI Caslon", 400, "caslon-ionic-regular.otf"),
]
faces = "\n".join(
    f'@font-face{{font-family:"{fam}";font-weight:{w};font-style:normal;font-display:block;'
    f'src:url(data:font/otf;base64,{base64.b64encode((root/"fonts"/fn).read_bytes()).decode()}) format("opentype");}}'
    for fam, w, fn in fonts
)
data = json.dumps(json.loads((root / "templates.json").read_text()), separators=(",", ":"))
html = (root / "src/index.html").read_text()
html = (html.replace("/*FONTS*/", faces)
            .replace("/*DATA*/", data)
            .replace("/*ENGINE*/", (root / "src/engine.js").read_text())
            .replace("/*APP*/", (root / "src/app.js").read_text()))
out = root / "docs/index.html"
out.write_text(html)
print(out, f"{len(html)/1024:.0f} KB")
