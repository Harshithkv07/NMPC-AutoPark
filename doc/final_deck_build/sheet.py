"""Review helper: contact sheets of the figure and equation images on the dark slide colour (python sheet.py)."""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def sheet(files, out, w=700, cols=3):
    ims = []
    for f in files:
        i = Image.open(f).convert("RGBA")
        bg = Image.new("RGBA", i.size, (17, 22, 28, 255))
        bg.alpha_composite(i)
        i = bg.convert("RGB")
        ims.append(i.resize((w, int(i.height * w / i.width))))
    h = max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    c = Image.new("RGB", (cols * (w + 12), rows * (h + 12)), (200, 200, 200))
    for k, i in enumerate(ims):
        c.paste(i, ((k % cols) * (w + 12), (k // cols) * (h + 12)))
    c.save(out, quality=85)


img = os.path.join(HERE, "img")
sheet(sorted(glob.glob(os.path.join(img, "fig_*.png"))), os.path.join(HERE, "_figs.jpg"))
sheet(sorted(glob.glob(os.path.join(img, "eq_*.png"))), os.path.join(HERE, "_eqs.jpg"), w=600)
