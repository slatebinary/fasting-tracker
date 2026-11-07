#!/usr/bin/env python3
"""Assemble the committed app shell from ordered, atomized source fragments."""
from pathlib import Path
import argparse, json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "app"
TEMPLATE = SOURCE / "index.template.html"
STYLE = SOURCE / "styles.css"
SCRIPT_PARTS = sorted((SOURCE / "js").glob("*.js"))
OUTPUT = ROOT / "index.html"

def assemble():
    info = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
    version = str(info.get("version", "")).strip()
    components = version.split(".")
    if len(components) != 3 or not all(part.isdigit() for part in components):
        raise SystemExit("version.json must contain semantic X.Y.Z")
    if not SCRIPT_PARTS:
        raise SystemExit("No atomized app JavaScript fragments found")
    template = TEMPLATE.read_text(encoding="utf-8")
    css = STYLE.read_text(encoding="utf-8")
    javascript = "".join(path.read_text(encoding="utf-8") for path in SCRIPT_PARTS)
    for marker in ("@@FT_APP_CSS@@", "@@FT_APP_JS@@", "@@FT_APP_VERSION@@"):
        if marker not in template:
            raise SystemExit(f"Missing app-shell template marker: {marker}")
    result = template.replace("@@FT_APP_CSS@@", css)
    result = result.replace("@@FT_APP_JS@@", javascript)
    result = result.replace("@@FT_APP_VERSION@@", version)
    if "@@FT_APP_" in result:
        raise SystemExit("Unexpanded app-shell template marker")
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify index.html matches the source fragments")
    args = parser.parse_args()
    generated = assemble()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != generated:
            raise SystemExit("index.html is stale; run python3 tools/build_app_shell.py")
        print("PASS: index.html matches the atomized CSS/JavaScript source.")
        return
    OUTPUT.write_text(generated, encoding="utf-8")
    print(f"Built index.html from {len(SCRIPT_PARTS)} ordered JavaScript fragments and one stylesheet.")

if __name__ == "__main__":
    main()
