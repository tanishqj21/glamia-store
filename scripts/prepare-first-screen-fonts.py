"""Lossless first-screen font subsets. Original font assets stay unchanged."""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import json
import sys

sys.path.insert(0, str(Path('tmp/font-tool').resolve()))
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

characters = set(range(0x20, 0x7f)) | set(range(0x2000, 0x2070)) | {0xa0, 0xa3, 0xa9, 0xae, 0xb7, 0xd7, 0x20ac}
sources = [('Jost', 'jost-8d4387d2d7e4.woff2'), ('Cormorant Garamond', 'cormorant-garamond-3ed3913013.woff2')]
result = []
for family, filename in sources:
    original = TTFont(Path('public/fonts') / filename)
    retained = characters & set(original.getBestCmap())
    compact = TTFont(Path('public/fonts') / filename)
    options = subset.Options()
    options.layout_features = ['*']
    options.notdef_outline = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=retained)
    subsetter.subset(compact)
    assert set(compact.getBestCmap()) == retained
    # Outlines and advances must be unchanged at all weights used by the site.
    for weight in (400, 500, 600):
        before = instantiateVariableFont(original, {'wght': weight}, inplace=False)
        after = instantiateVariableFont(compact, {'wght': weight}, inplace=False)
        for code in retained:
            first = before.getBestCmap()[code]
            second = after.getBestCmap()[code]
            assert before['hmtx'][first] == after['hmtx'][second], (family, weight, code)
            assert before['glyf'][first].getCoordinates(before['glyf'])[0] == after['glyf'][second].getCoordinates(after['glyf'])[0], (family, weight, code)
    compact.flavor = 'woff2'
    output = BytesIO()
    compact.save(output)
    data = output.getvalue()
    name = 'first-screen-' + sha256(data).hexdigest()[:12] + '.woff2'
    (Path('public/fonts') / name).write_bytes(data)
    result.append({'family': family, 'file': 'fonts/' + name, 'bytes': len(data), 'range': ','.join('U+' + format(value, 'X') for value in sorted(retained))})
Path('src/first-screen-fonts.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
