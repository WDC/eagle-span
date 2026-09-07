#!/usr/bin/env python3
"""
Builds the self-hosted webfont subset and everything that has to agree with it.

Run this only when the font, the subset or the retained OpenType features
change. The outputs are committed; `scripts/verify-fonts.mjs` is the CI gate
that keeps them honest, because woff2 compression is not byte-reproducible
across fontTools versions and a regenerate-and-compare gate would flake.

    pip install 'fonttools[woff]' brotli
    python3 scripts/build-fonts.py

Writes:
    public/fonts/eagle-span-sans-{roman,italic}-var.<hash>.woff2
    public/fonts/OFL.txt              upstream licence, served next to the fonts
    data/og-fonts/eagle-span-og-{regular,semibold}.ttf   build input, never served
    src/styles/fonts.css              @font-face + metric-adjusted fallbacks
    src/lib/fonts.generated.ts        hashed hrefs, for the preload in BaseLayout
    data/fonts.json                   provenance, metrics, hashes — the manifest

Why Source Sans 3: the design calls for old-style proportional figures in prose
and lining tabular figures in specs. That needs a family that actually ships
`onum` and `pnum`, which rules out most of the technical grotesques (Inter and
IBM Plex have neither, and `font-variant-numeric` fails silently when the
feature is absent — you get no error, just the wrong digits forever).

Source Sans 3 has `onum`/`pnum` and NO `lnum`/`tnum`, because its *default*
figures are already lining and tabular — every digit is 497 units at wght 400.
So `font-variant-numeric: lining-nums tabular-nums` works by resetting the
inherited old-style value rather than by applying a feature. That is a real
dependency on this specific font and verify-fonts.mjs asserts it.
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "fonts"
PUBLIC = ROOT / "public" / "fonts"

# --------------------------------------------------------------------------
# Open-graph fonts
# --------------------------------------------------------------------------

# satori rasterises the OG cards at build time and it cannot read woff2 — only
# ttf, otf and woff — and it cannot read a variable font's named instances
# either: it wants one file per weight. So the two faces the cards use are
# pinned static instances of the same upstream, subset the same way, and
# committed as a build input.
#
# They live in data/ and NOT in public/, which is the whole point. A browser
# never fetches these; they exist so `astro build` can draw text into a PNG.
# Putting them under public/ would ship 55 KB of duplicate letterforms to every
# visitor for no reason and put them in the Lighthouse font budget.
OG_FONTS = ROOT / "data" / "og-fonts"

# 400 and 620 are body and heading weight from tokens.css. 620 is not a named
# instance in the STAT table, which is why the instancer runs with
# updateFontNames off — the file's internal name is irrelevant, the OG renderer
# registers it under an explicit family and weight.
OG_WEIGHTS = ((400, "regular"), (620, "semibold"))

# No `onum`, `pnum` or `frac` here. The cards set one headline and two labels;
# there is no prose to give old-style figures to and no spec column to align,
# and every feature retained is bytes in a file that ships in the repository.
OG_LAYOUT_FEATURES = ("ccmp", "locl", "kern", "mark", "mkmk", "liga", "case")

# --------------------------------------------------------------------------
# Upstream. Pinned by digest — a silent upstream change would otherwise ship
# different letterforms under the same commit.
# --------------------------------------------------------------------------
UPSTREAM = "https://cdn.jsdelivr.net/gh/adobe-fonts/source-sans@release"
FAMILY = "Source Sans 3"
FAMILY_VERSION = "3.052"  # release branch, VF build
LICENCE = "SIL Open Font License 1.1"


@dataclass(frozen=True)
class Source:
    style: str
    remote: str
    sha256: str


SOURCES = (
    Source(
        "roman",
        f"{UPSTREAM}/VF/SourceSans3VF-Upright.ttf",
        "1147db9a3f0edd4956068de77930148acce2742dd76d57f7239b2b1c687ac63f",
    ),
    Source(
        "italic",
        f"{UPSTREAM}/VF/SourceSans3VF-Italic.ttf",
        "c34791f4f889af43d84e2f84ebeb02e6eed07058aca21e6729d26e6436d18965",
    ),
)

# --------------------------------------------------------------------------
# Subset
# --------------------------------------------------------------------------

# Ranges, not a character census: the site is a handful of pages today and
# Phase 3 has not landed its copy yet, so subsetting to observed glyphs would
# break the first time someone writes a word we have not seen. Latin-1 plus the
# typographic punctuation the design actually specifies is ~35 KB and needs no
# maintenance.
UNICODES: tuple[tuple[int, int], ...] = (
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x00FF),  # Latin-1: nbsp, ° × ± ¼ ½ ¾ © ® and accented vowels
    (0x0152, 0x0153),  # Œ œ
    (0x0160, 0x0161),  # Š š
    (0x0178, 0x0178),  # Ÿ
    (0x017D, 0x017E),  # Ž ž
    (0x2010, 0x2015),  # hyphen, figure dash, en/em dash
    (0x2018, 0x201A),  # ‘ ’ ‚
    (0x201C, 0x201E),  # “ ” „
    (0x2020, 0x2022),  # † ‡ •
    (0x2026, 0x2026),  # …
    (0x2030, 0x2030),  # ‰
    (0x2032, 0x2033),  # ′ ″  — real prime and double prime, per the design
    (0x2039, 0x203A),  # ‹ ›
    (0x2044, 0x2044),  # ⁄  fraction slash, feeds `frac`
    (0x2060, 0x2060),  # word joiner
    (0x2074, 0x2074),  # ⁴
    (0x2116, 0x2116),  # №
    (0x2122, 0x2122),  # ™
    (0x2153, 0x2154),  # ⅓ ⅔
    (0x215B, 0x215E),  # ⅛ ⅜ ⅝ ⅞
    (0x2190, 0x2193),  # ← ↑ → ↓
    (0x2212, 0x2212),  # −  real minus, so a negative reading is not a hyphen
)

# Exactly the features the stylesheet relies on, and nothing else. Dropping the
# stylistic sets and small caps we never call is most of the size win.
#
# `onum`/`pnum` are the prose figures; the spec figures are the font's default,
# so there is deliberately no lnum/tnum here — see the module docstring.
LAYOUT_FEATURES = (
    "ccmp",  # mark composition, required for correctness
    "locl",
    "kern",
    "mark",
    "mkmk",
    "liga",
    "onum",  # old-style figures — prose
    "pnum",  # proportional figures — prose
    "frac",  # diagonal fractions, and numr/dnom so they work on arbitrary pairs
    "numr",
    "dnom",
    "case",  # case-sensitive punctuation for the uppercase rail labels
)

# Everything else is dropped on purpose. `zero`, `ordn`, `sups`, the ten
# stylistic sets and both small-cap features cost 14 KB per file and nothing in
# the stylesheet calls them; the subset ships what the CSS asks for and no more.

# Features the CSS depends on, asserted after subsetting. A font swap that drops
# one of these degrades silently in every browser; this turns it into a build
# failure.
REQUIRED_FEATURES = ("onum", "pnum", "frac", "kern", "case")

# --------------------------------------------------------------------------
# Metric-adjusted fallbacks
# --------------------------------------------------------------------------

# Relative frequency of each letter in English prose, plus an inter-word space.
# Used to weight the average advance width, so `size-adjust` compares the two
# fonts on text rather than on an unweighted alphabet where `j` and `q` count as
# much as `e`. The same weighting is applied to both sides, so the absolute
# figures matter far less than that they are computed identically.
LETTER_FREQUENCY: dict[str, float] = {
    "a": 8.167, "b": 1.492, "c": 2.782, "d": 4.253, "e": 12.702, "f": 2.228,
    "g": 2.015, "h": 6.094, "i": 6.966, "j": 0.153, "k": 0.772, "l": 4.025,
    "m": 2.406, "n": 6.749, "o": 7.507, "p": 1.929, "q": 0.095, "r": 5.987,
    "s": 6.327, "t": 9.056, "u": 2.758, "v": 0.978, "w": 2.360, "x": 0.150,
    "y": 1.974, "z": 0.074, " ": 17.000,
}

# The weight the fallback is standing in for. Body copy is 400; overriding for
# the headings as well would need a second fallback family per weight, which is
# not worth it when the heading is one line and swaps in first.
FALLBACK_WEIGHT = 400


@dataclass(frozen=True)
class Fallback:
    """A locally-installed font we expect to be substituted before ours loads.

    `x_width_avg` is the frequency-weighted average advance width normalised to
    the em. Measured once, from files metrically identical to the real thing:

      * Arial — measured from Liberation Sans, which is drawn to Arial's advance
        widths on purpose. Helvetica and Helvetica Neue share them too, so one
        face covers Windows, macOS and most Linux.
      * Roboto — measured from the Google Fonts latin subset. This is Android's
        system-ui, where no Arial exists to match.
    """

    family: str
    locals: tuple[str, ...]
    x_width_avg: float
    style: str


FALLBACKS = (
    Fallback("Eagle Span Sans Fallback", ("Arial", "Helvetica Neue", "Liberation Sans"), 0.448415, "normal"),
    Fallback("Eagle Span Sans Fallback", ("Arial Italic", "Helvetica Neue Italic", "Liberation Sans Italic"), 0.448415, "italic"),
    Fallback("Eagle Span Sans Fallback Roboto", ("Roboto",), 0.451076, "normal"),
    Fallback("Eagle Span Sans Fallback Roboto", ("Roboto Italic",), 0.438256, "italic"),
)

WEBFONT_FAMILY = "Eagle Span Sans"


def fetch(source: Source) -> Path:
    """Download once into .cache/, and refuse anything that is not the pin."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / source.remote.rsplit("/", 1)[-1]

    if not path.exists():
        print(f"  fetching {source.remote}")
        with urllib.request.urlopen(source.remote, timeout=120) as response:
            path.write_bytes(response.read())

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != source.sha256:
        path.unlink()
        raise SystemExit(
            f"{path.name}: sha256 {digest}\n"
            f"  expected {source.sha256}\n"
            "  Upstream changed under a pinned URL. Verify the new build before "
            "updating the pin."
        )
    return path


def weighted_x_width(font: TTFont) -> float:
    """Frequency-weighted average advance width, normalised to the em."""
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upem = font["head"].unitsPerEm
    total = sum(LETTER_FREQUENCY.values())
    width = sum(hmtx[cmap[ord(ch)]][0] * n for ch, n in LETTER_FREQUENCY.items())
    return width / total / upem


def features_in(font: TTFont) -> set[str]:
    tags: set[str] = set()
    for table in ("GSUB", "GPOS"):
        if table in font:
            tags |= {r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord}
    return tags


def subset(path: Path, style: str) -> tuple[bytes, dict[str, object]]:
    options = Options()
    options.layout_features = list(LAYOUT_FEATURES)
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the licence in the file
    options.name_legacy = False
    options.notdef_outline = False
    options.hinting = False
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]
    options.flavor = "woff2"

    font = TTFont(path)
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=[c for lo, hi in UNICODES for c in range(lo, hi + 1)])
    subsetter.subset(font)

    kept = features_in(font)
    missing = [f for f in REQUIRED_FEATURES if f not in kept]
    if missing:
        raise SystemExit(f"{style}: subsetting dropped required features {missing}")

    out = CACHE / f"{style}.woff2"
    font.save(out)

    # Metrics come from the un-instanced subset at the fallback weight; the
    # shipped file keeps the whole wght axis.
    instance = instantiateVariableFont(
        TTFont(path), {"wght": FALLBACK_WEIGHT}, inplace=False, updateFontNames=False
    )
    hhea = instance["hhea"]
    upem = instance["head"].unitsPerEm
    os2 = instance["OS/2"]
    axis = next(a for a in font["fvar"].axes if a.axisTag == "wght")

    metrics = {
        "unitsPerEm": upem,
        "ascent": hhea.ascender / upem,
        "descent": abs(hhea.descender) / upem,
        "lineGap": hhea.lineGap / upem,
        "xHeight": os2.sxHeight / upem,
        "capHeight": os2.sCapHeight / upem,
        "xWidthAvg": weighted_x_width(instance),
        "weightRange": [axis.minValue, axis.maxValue],
        "glyphs": len(font.getGlyphOrder()),
        "features": sorted(kept),
    }
    return out.read_bytes(), metrics


def build_og_fonts(path: Path) -> list[dict[str, object]]:
    """Static instances of the roman face, for the build-time OG renderer."""
    OG_FONTS.mkdir(parents=True, exist_ok=True)
    for stale in OG_FONTS.glob("*.ttf"):
        stale.unlink()

    options = Options()
    options.layout_features = list(OG_LAYOUT_FEATURES)
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the licence in the file
    options.name_legacy = False
    options.notdef_outline = False
    options.hinting = False
    options.drop_tables += ["DSIG"]

    faces: list[dict[str, object]] = []
    for weight, style in OG_WEIGHTS:
        # recalcTimestamp=False keeps `head.modified` from being set to "now",
        # which is what makes these two files byte-reproducible — unlike the
        # woff2 subsets, whose brotli output varies with the fontTools version.
        # That is what lets verify-fonts.mjs treat a digest mismatch here as a
        # real change rather than as a rebuild.
        font = instantiateVariableFont(
            TTFont(path, recalcTimestamp=False),
            {"wght": weight},
            inplace=False,
            updateFontNames=False,
        )
        font.recalcTimestamp = False
        subsetter = Subsetter(options=options)
        subsetter.populate(unicodes=[c for lo, hi in UNICODES for c in range(lo, hi + 1)])
        subsetter.subset(font)

        name = f"eagle-span-og-{style}.ttf"
        font.save(OG_FONTS / name)
        data = (OG_FONTS / name).read_bytes()
        print(f"  {name}  {len(data) / 1024:.1f} KB  wght {weight}")
        faces.append(
            {
                "file": name,
                "weight": weight,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    return faces


def unicode_range_css() -> str:
    parts = [f"U+{lo:04X}" if lo == hi else f"U+{lo:04X}-{hi:04X}" for lo, hi in UNICODES]
    return ", ".join(parts)


def format_pct(value: float) -> str:
    """Three decimals is well inside a rounding error of a device pixel."""
    return f"{value * 100:.3f}".rstrip("0").rstrip(".") + "%"


def build_og_only() -> None:
    """Refresh just the OG fonts and the manifest key that describes them.

    The woff2 subsets are deliberately left alone. Their brotli output is not
    reproducible across fontTools versions, so a full rebuild renames both
    shipped files and rewrites fonts.css and the preload module for no change in
    letterform — churn in a diff that has to be reviewed. Reach for the full
    `build()` when the font, the subset or the retained features actually
    change.
    """
    manifest_path = ROOT / "data" / "fonts.json"
    manifest = json.loads(manifest_path.read_text())

    print("open graph:")
    og_faces = build_og_fonts(fetch(SOURCES[0]))

    manifest["openGraph"] = {
        "_note": "Build input for the OG renderer. Never served — see OG_FONTS in build-fonts.py.",
        "dir": "data/og-fonts",
        "faces": og_faces,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def build() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for stale in PUBLIC.glob("eagle-span-sans-*.woff2"):
        stale.unlink()

    faces: list[dict[str, object]] = []
    for source in SOURCES:
        print(f"{source.style}:")
        path = fetch(source)
        data, metrics = subset(path, source.style)
        digest = hashlib.sha256(data).hexdigest()
        name = f"eagle-span-sans-{source.style}-var.{digest[:10]}.woff2"
        (PUBLIC / name).write_bytes(data)
        print(f"  {name}  {len(data) / 1024:.1f} KB  {metrics['glyphs']} glyphs")
        faces.append(
            {
                "style": "italic" if source.style == "italic" else "normal",
                "file": name,
                "href": f"/fonts/{name}",
                "bytes": len(data),
                "sha256": digest,
                "source": {"url": source.remote, "sha256": source.sha256},
                "metrics": metrics,
            }
        )

    print("open graph:")
    og_faces = build_og_fonts(fetch(SOURCES[0]))

    licence = CACHE / "OFL.txt"
    if not licence.exists():
        with urllib.request.urlopen(f"{UPSTREAM}/LICENSE.md", timeout=60) as response:
            licence.write_bytes(response.read())
    (PUBLIC / "OFL.txt").write_bytes(licence.read_bytes())

    fallbacks: list[dict[str, object]] = []
    for fb in FALLBACKS:
        face = next(f for f in faces if f["style"] == fb.style)
        m = face["metrics"]
        size_adjust = m["xWidthAvg"] / fb.x_width_avg
        fallbacks.append(
            {
                "family": fb.family,
                "style": fb.style,
                "locals": list(fb.locals),
                "sizeAdjust": size_adjust,
                "ascentOverride": m["ascent"] / size_adjust,
                "descentOverride": m["descent"] / size_adjust,
                "lineGapOverride": m["lineGap"] / size_adjust,
            }
        )

    manifest = {
        "_generated": "scripts/build-fonts.py — do not edit by hand",
        "family": WEBFONT_FAMILY,
        "upstream": {"name": FAMILY, "version": FAMILY_VERSION, "licence": LICENCE, "repo": UPSTREAM},
        "requiredFeatures": list(REQUIRED_FEATURES),
        "unicodeRange": unicode_range_css(),
        "faces": faces,
        "fallbacks": fallbacks,
        "openGraph": {
            "_note": "Build input for the OG renderer. Never served — see OG_FONTS in build-fonts.py.",
            "dir": "data/og-fonts",
            "faces": og_faces,
        },
    }
    (ROOT / "data" / "fonts.json").write_text(json.dumps(manifest, indent=2) + "\n")

    write_css(manifest)
    write_ts(manifest)

    total = sum(int(f["bytes"]) for f in faces)
    print(f"\ntotal shipped: {total / 1024:.1f} KB across {len(faces)} files")
    for fb in fallbacks:
        print(
            f"  fallback {fb['family']} {fb['style']}: "
            f"size-adjust {format_pct(float(fb['sizeAdjust']))}"
        )


def write_css(manifest: dict) -> None:
    lines = [
        "/*",
        " * GENERATED by scripts/build-fonts.py — do not edit by hand.",
        " *",
        f" * {manifest['upstream']['name']} {manifest['upstream']['version']}, "
        f"{manifest['upstream']['licence']}. Licence text ships at /fonts/OFL.txt.",
        " *",
        " * One variable file per style, subset to the ranges the design uses. The",
        " * whole wght axis is kept: the type scale asks for 400 body and 620",
        " * headings, and a variable axis is cheaper than two static cuts.",
        " *",
        " * The fallback faces below carry no bytes. They re-describe a font already",
        " * on the reader's machine with our font's metrics, so the swap at",
        " * font-display: swap moves no text. Without them this design shifts on",
        " * every first paint and blows the 0.05 CLS budget on its own.",
        " */",
        "",
    ]

    for face in manifest["faces"]:
        m = face["metrics"]
        lines += [
            "@font-face {",
            f"  font-family: '{manifest['family']}';",
            f"  src: url('{face['href']}') format('woff2');",
            f"  font-weight: {int(m['weightRange'][0])} {int(m['weightRange'][1])};",
            f"  font-style: {face['style']};",
            "  font-display: swap;",
            f"  unicode-range: {manifest['unicodeRange']};",
            "}",
            "",
        ]

    for fb in manifest["fallbacks"]:
        srcs = ", ".join(f"local('{name}')" for name in fb["locals"])
        lines += [
            "@font-face {",
            f"  font-family: '{fb['family']}';",
            f"  src: {srcs};",
            f"  font-style: {fb['style']};",
            f"  size-adjust: {format_pct(fb['sizeAdjust'])};",
            f"  ascent-override: {format_pct(fb['ascentOverride'])};",
            f"  descent-override: {format_pct(fb['descentOverride'])};",
            f"  line-gap-override: {format_pct(fb['lineGapOverride'])};",
            "}",
            "",
        ]

    (ROOT / "src" / "styles" / "fonts.css").write_text("\n".join(lines))


def write_ts(manifest: dict) -> None:
    roman = next(f for f in manifest["faces"] if f["style"] == "normal")
    italic = next(f for f in manifest["faces"] if f["style"] == "italic")
    body = f"""/**
 * GENERATED by scripts/build-fonts.py — do not edit by hand.
 *
 * The filenames carry a content hash so /fonts/* can be served immutable, which
 * means the preload in BaseLayout cannot be a hard-coded string.
 */

export const fontFiles = {{
  /** Preloaded. Everything above the fold is set in it. */
  roman: '{roman["href"]}',
  /** Not preloaded — only downloads if a page actually renders italic text. */
  italic: '{italic["href"]}',
}} as const;
"""
    (ROOT / "src" / "lib" / "fonts.generated.ts").write_text(body)


if __name__ == "__main__":
    try:
        build_og_only() if "--og-only" in sys.argv[1:] else build()
    except KeyboardInterrupt:
        sys.exit(130)
