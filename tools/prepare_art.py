"""Prepares character cut-outs from images the owner supplies: background removal (rembg, anime model) + upscaling.
Usage: python tools/prepare_art.py <theme>=<input image> [...]   writes public/art/<theme>.png (transparent, up to 1100 px tall); REMBG_MODEL=u2net_human_seg for photos
Requires: pip install rembg pillow"""
import os
import sys

from PIL import Image, ImageFilter
from rembg import new_session, remove

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art')
MAX_H = 1100
TARGET_H = 1000  # upscale small sources until they are about this tall


def prepare(src, dst, session, model_note=None):
    im = Image.open(src).convert('RGB')
    # upscale first so the cut-out edges are smooth, then cut the background out and sharpen a little
    scale = max(1, min(4, -(-TARGET_H // max(1, im.height))))
    big = im.resize((im.width * scale, im.height * scale), Image.LANCZOS) if scale > 1 else im
    cut = remove(big, session=session, alpha_matting=False, post_process_mask=True)
    r, g, b, a = cut.split()
    rgb = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.6, percent=90, threshold=2))
    a = a.filter(ImageFilter.GaussianBlur(0.8))
    out = Image.merge('RGBA', (*rgb.split(), a))
    bbox = out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    if out.height > MAX_H:
        out = out.resize((round(out.width * MAX_H / out.height), MAX_H), Image.LANCZOS)
    out.save(dst, optimize=True)
    return out.size


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    model = os.environ.get('REMBG_MODEL', 'isnet-anime')  # isnet-anime for drawings, u2net_human_seg for photos of people
    session = new_session(model)
    for arg in sys.argv[1:]:
        theme, src = arg.split('=', 1)
        print(theme, prepare(src, os.path.join(OUT, theme + '.png'), session))
