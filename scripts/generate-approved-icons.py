"""Regenerate application icons from approved Snap Store masters (requires Pillow)."""
import base64
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
for app in json.loads((ROOT / 'docs/branding/icons.json').read_text()):
    source = ROOT / app['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != app['sha256']:
        raise ValueError(f'Approved logo checksum differs: {source}')
    image = Image.open(source).convert('RGBA')
    if image.width != image.height:
        raise ValueError(f'Logo must be square: {source}')
    for output in app['outputs']:
        path = ROOT / output['path']
        path.parent.mkdir(parents=True, exist_ok=True)
        suffix = path.suffix.lower()
        size = tuple(output.get('size', [512, 512]))
        if suffix == '.svg':
            buffer = io.BytesIO()
            image.resize((512, 512), Image.Resampling.LANCZOS).save(buffer, format='PNG')
            encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
            path.write_text('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,' + encoded + '" xlink:href="data:image/png;base64,' + encoded + '"/></svg>\n')
        elif suffix == '.ico':
            sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
            base = image.resize((256, 256), Image.Resampling.LANCZOS)
            frames = []
            for size in sizes:
                frame = base.resize(size, Image.Resampling.LANCZOS)
                # Lanczos can leave alpha 2/255 at an otherwise transparent
                # outer corner (notably at 24 px). Preserve the master's
                # transparent corners in every ICO frame without changing
                # the rounded edge or the artwork itself.
                for x, y in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    if image.getpixel((x * (image.width - 1), y * (image.height - 1)))[3] == 0:
                        frame.putpixel((x * (size[0] - 1), y * (size[1] - 1)), (0, 0, 0, 0))
                frames.append(frame)
            frames[-1].save(path, sizes=sizes, append_images=frames[:-1])
        elif suffix == '.icns':
            image.resize((1024,1024), Image.Resampling.LANCZOS).save(path)
        else:
            image.resize(size, Image.Resampling.LANCZOS).save(path, optimize=True)
    print(app['name'] + ': ' + str(len(app['outputs'])) + ' icons regenerated')
