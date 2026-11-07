"""Run isolated, headless Brave image-preservation research (developer tool).

Profiles and screenshots stay under research-artifacts; no existing browser
profile is opened or closed. Pillow is required only for pixel measurements.
"""

import argparse
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import time

from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / 'research-artifacts' / 'native-images' / f'run-{time.time_ns()}'
    output.mkdir(parents=True, exist_ok=True)
    logo = Image.new('RGB', (32, 32), 'white')
    ImageDraw.Draw(logo).rectangle((10, 10, 21, 21), fill='black')
    buffer = io.BytesIO()
    logo.save(buffer, format='PNG')
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    template = '''<!doctype html><meta charset="utf-8"><style>
body { margin:0; background:white; color:black; font:20px sans-serif; }
img { position:absolute; top:100px; left:100px; width:32px; height:32px; %s }
</style><p>Native image preservation test</p><img src="data:image/png;base64,%s">'''
    measurements = {}
    cases = {
        'baseline': ([], ''),
        'native': (['--enable-features=WebContentsForceDark'], ''),
        'native-css-opt-out': (['--enable-features=WebContentsForceDark'], 'color-scheme:only light !important;'),
        'native-skip-images': (['--enable-features=WebContentsForceDark', '--enable-blink-features=AutoDarkModeSkipImages'], ''),
    }
    for name, (flags, css) in cases.items():
        page = output / f'{name}.html'
        page.write_text(template % (css, encoded), encoding='utf-8')
        screenshot = output / f'{name}.png'
        command = [str(args.browser.resolve()), '--headless=new', '--no-first-run',
                   '--no-default-browser-check', '--disable-background-networking',
                   '--disable-component-update', '--disable-sync', '--hide-scrollbars',
                   '--force-device-scale-factor=1', '--window-size=800,600',
                   '--virtual-time-budget=1000', f'--user-data-dir={output / (name + "-profile")}',
                   f'--screenshot={screenshot}', *flags, page.as_uri()]
        try:
            result = subprocess.run(command, capture_output=True, timeout=35,
                                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except subprocess.TimeoutExpired as error:
            (output / f'{name}.stderr.txt').write_bytes(error.stderr or b'')
            raise SystemExit(f'{name}: browser timed out; no rendering conclusion. Logs: {output}') from None
        (output / f'{name}.stderr.txt').write_bytes(result.stderr)
        if not screenshot.is_file():
            raise RuntimeError(f'{name}: no screenshot generated; see its stderr log. Exit: {result.returncode}')
        with Image.open(screenshot) as rendered:
            rgb = rendered.convert('RGB')
            measurements[name] = {
                'page_background': rgb.getpixel((300, 200)),
                'image_white': rgb.getpixel((102, 102)),
                'image_black': rgb.getpixel((115, 115)),
            }
        print(name, measurements[name], flush=True)
    (output / 'measurements.json').write_text(json.dumps(measurements, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
