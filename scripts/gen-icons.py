#!/usr/bin/env python3
"""Gera os ícones do app a partir da logo oficial (fundo branco, logo colorida).
Uso: python3 scripts/gen-icons.py caminho/CANDEEIRO.png   (PNG com letras brancas e fundo transparente)
As letras brancas viram pretas (a logo colorida de fundo claro); o resto das cores é mantido."""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "CANDEEIRO.png"
im = Image.open(src).convert("RGBA")
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        lo, hi = min(r, g, b), max(r, g, b)
        if lo >= 170 and hi - lo <= 40:  # branco / cinza claro (letras) → preto
            px[x, y] = (0, 0, 0, a)
bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
logo = im.crop(bbox)

def canvas(size, fill, bg=(255, 255, 255, 255)):
    c = Image.new("RGBA", (size, size), bg)
    lw, lh = logo.size
    k = (size * fill) / max(lw, lh)
    l = logo.resize((max(1, round(lw * k)), max(1, round(lh * k))), Image.LANCZOS)
    c.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
    return c.convert("RGB")

out = "public/icons/"
canvas(512, 0.80).save(out + "icon-512.png", optimize=True)
canvas(192, 0.80).save(out + "icon-192.png", optimize=True)
canvas(180, 0.82).save(out + "apple-touch-icon.png", optimize=True)
canvas(167, 0.82).save(out + "apple-touch-icon-167.png", optimize=True)
canvas(152, 0.82).save(out + "apple-touch-icon-152.png", optimize=True)
canvas(1024, 0.80).save(out + "icon-1024.png", optimize=True)
canvas(512, 0.62).save(out + "icon-maskable-512.png", optimize=True)  # zona segura do ícone adaptável
canvas(64, 0.92).save("public/favicon.png", optimize=True)
canvas(32, 0.96).save(out + "favicon-32.png", optimize=True)

# selo das notificações do Android: silhueta branca sobre transparente (o sistema só usa o canal alfa)
a = logo.getchannel("A").point(lambda v: 255 if v > 40 else 0)
k = (96 * 0.92) / max(logo.size)
sil = Image.new("RGBA", logo.size, (255, 255, 255, 0)); sil.putalpha(a)
sil = sil.resize((round(logo.width * k), round(logo.height * k)), Image.LANCZOS)
b = Image.new("RGBA", (96, 96), (0, 0, 0, 0)); b.alpha_composite(sil, ((96 - sil.width) // 2, (96 - sil.height) // 2))
b.save(out + "badge-96.png", optimize=True)
print("ok", bbox)
