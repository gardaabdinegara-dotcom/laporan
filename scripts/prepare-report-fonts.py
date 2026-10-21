"""Optional asset preparation: python -m pip install fonttools brotli.

Creates static TTF instances of the app's existing OFL DM Sans font for jsPDF.
The production app serves the committed TTF files; Python is not a runtime dependency.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

fonts = Path(__file__).resolve().parents[1] / "public" / "fonts"
for weight, style in [(400, "Regular"), (700, "Bold")]:
    font = instantiateVariableFont(TTFont(fonts / "dm-sans.woff2"), {"wght": weight}, inplace=True)
    font.flavor = None
    names = {1: "Terrace Report", 2: style, 3: f"TerraceReport-{style}", 4: f"Terrace Report {style}", 6: f"TerraceReport-{style}", 16: "Terrace Report", 17: style}
    for name in font["name"].names:
        if name.nameID in names:
            name.string = names[name.nameID].encode(name.getEncoding())
    target = fonts / f"terrace-report-{style.lower()}.ttf"
    font.save(target)
    print(target.name, target.stat().st_size)
