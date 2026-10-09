"""Generated WOFF2 assets: retain the exact declared 400–600 weight range.

Run using Python with fonttools and brotli available. Original fonts are never
overwritten. Validation compares every glyph's advance at 400, 500 and 600.
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path('tmp/font-tool').resolve()))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

fonts = Path('public/fonts')
report = []
for family, latin, extended in [
    ('jost', 'jost-dd7c9ad741.woff2', 'jost-567eb1cc36.woff2'),
    ('cormorant-garamond', 'cormorant-garamond-3ed3913013.woff2', 'cormorant-garamond-30893fb892.woff2'),
]:
    for source, rupee in [(latin, False), (extended, True)]:
        original = TTFont(fonts / source)
        if rupee and 0x20B9 not in original.getBestCmap():
            continue
        optimized = instantiateVariableFont(original, {'wght': (400, 600)}, inplace=False)
        if rupee:
            options = subset.Options()
            options.layout_features = ['*']
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=[0x20B9])
            subsetter.subset(optimized)
            assert 0x20B9 in optimized.getBestCmap()
        else:
            assert original.getBestCmap() == optimized.getBestCmap()
            for weight in (400, 500, 600):
                first = instantiateVariableFont(original, {'wght': weight}, inplace=False)
                second = instantiateVariableFont(optimized, {'wght': weight}, inplace=False)
                assert first['hmtx'].metrics.keys() == second['hmtx'].metrics.keys()
                for glyph in first['hmtx'].metrics:
                    assert abs(first['hmtx'][glyph][0] - second['hmtx'][glyph][0]) <= 1, (source, weight, glyph)
        optimized.flavor = 'woff2'
        buffer = BytesIO()
        optimized.save(buffer)
        data = buffer.getvalue()
        name = f'{family}-{"rupee-" if rupee else ""}{sha256(data).hexdigest()[:12]}.woff2'
        (fonts / name).write_bytes(data)
        report.append({'source': source, 'file': name, 'originalBytes': (fonts / source).stat().st_size, 'bytes': len(data), 'rupeeOnly': rupee})
print(json.dumps(report, indent=2))
