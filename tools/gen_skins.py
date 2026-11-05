#!/usr/bin/env python3
"""Genera la biblioteca de skins originales de Alqan Launcher (renderer/skins/library.js).
Uso: python3 tools/gen_skins.py   (requiere Pillow)"""
import base64, io, json, os, random, sys
from PIL import Image

MULT = {'top': 1.10, 'front': 1.0, 'right': 0.93, 'left': 0.93, 'back': 0.88, 'bottom': 0.80}
CLEAR = (0, 0, 0, 0)

def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (c[3],)

def faces(x0, y0, w, h, d):
    return {'top': (x0 + d, y0, w, d), 'bottom': (x0 + d + w, y0, w, d), 'right': (x0, y0 + d, d, h),
            'front': (x0 + d, y0 + d, w, h), 'left': (x0 + d + w, y0 + d, d, h), 'back': (x0 + 2 * d + w, y0 + d, w, h)}

class P:
    def __init__(s, seed):
        s.im = Image.new('RGBA', (64, 64), CLEAR); s.px = s.im.load(); s.r = random.Random(seed)
    def put(s, x, y, c):
        if c[3] == 255:
            n = s.r.randint(-4, 4); c = tuple(max(0, min(255, v + n)) for v in c[:3]) + (255,)
        s.px[x, y] = c
    def rect(s, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                s.put(x + i, y + j, c)
    def box(s, x0, y0, w, h, d, c):
        for k, (x, y, fw, fh) in faces(x0, y0, w, h, d).items():
            s.rect(x, y, fw, fh, shade(c, MULT[k]))

def build(sp):
    p = P(sp['name']); a = 3 if sp.get('slim') else 4
    skin = hx(sp['skin']); dark = hx('#1d1d24')
    # ---- cabeza y pelo ----
    p.box(0, 0, 8, 8, 8, skin)
    hs = sp.get('hair_style', 'short')
    if hs != 'none':
        hair = hx(sp.get('hair', '#5a3b1e'))
        p.rect(8, 0, 8, 8, shade(hair, 1.1)); p.rect(8, 8, 8, 2, hair)
        n = {'short': 3, 'long': 8, 'spiky': 4}[hs]
        for x0 in (0, 16): p.rect(x0, 8, 8, n, hair)
        p.rect(24, 8, 8, {'short': 5, 'long': 8, 'spiky': 6}[hs], hair)
        p.rect(9, 11, 2, 1, shade(hair, 0.9)); p.rect(13, 11, 2, 1, shade(hair, 0.9))
    # ---- cara ----
    face = sp.get('face', 'normal'); eyes = hx(sp.get('eyes', '#3b6fd4'))
    if face == 'robot':
        led = hx(sp.get('led', '#33e0ff')); p.rect(9, 12, 2, 1, led); p.rect(13, 12, 2, 1, led)
        p.rect(10, 14, 4, 1, shade(skin, 0.5)); p.rect(10, 15, 4, 1, shade(skin, 0.7))
    elif face == 'ghost':
        p.rect(9, 12, 2, 2, dark); p.rect(13, 12, 2, 2, dark); p.rect(11, 14, 2, 1, shade(skin, 0.6))
    elif face == 'skull':
        p.rect(9, 12, 2, 2, dark); p.rect(13, 12, 2, 2, dark); p.rect(11, 14, 2, 1, shade(skin, 0.7))
        for x in (9, 11, 13): p.rect(x, 15, 1, 1, dark)
    else:
        p.rect(9, 12, 2, 1, hx('#ffffff')); p.rect(13, 12, 2, 1, hx('#ffffff')); p.put(10, 12, eyes); p.put(13, 12, eyes)
        p.rect(11, 14, 2, 1, shade(skin, 0.7))
    if sp.get('glasses'):
        g = hx(sp['glasses'])
        for x in (9, 13): p.rect(x, 11, 2, 1, g); p.rect(x, 13, 2, 1, g)
        for x in (8, 11, 12, 15): p.put(x, 12, g)
    if sp.get('beard'):
        b = hx(sp['beard']); p.rect(9, 14, 6, 2, b); p.rect(8, 13, 1, 3, b); p.rect(15, 13, 1, 3, b)
    if sp.get('patch'):
        p.rect(9, 11, 3, 3, dark)
    # ---- sombrero / casco (capa exterior de la cabeza) ----
    def ring(r0, n, c):
        for x0 in (32, 40, 48, 56): p.rect(x0, 8 + r0, 8, n, c)
    h = sp.get('hat')
    if h:
        t, col = h[0], hx(h[1])
        if t in ('cap', 'straw', 'wizard', 'chef'):
            p.rect(40, 0, 8, 8, col); n = {'cap': 2, 'straw': 2, 'wizard': 3, 'chef': 3}[t]; ring(0, n, col)
            if t == 'chef': p.rect(40, 0, 8, 8, shade(col, 1.0))
            if t in ('cap', 'straw', 'wizard'): ring(n, 1, shade(col, 0.75))
        elif t == 'band':
            ring(2, 1, col)
        elif t in ('helmet', 'astro'):
            p.rect(40, 0, 8, 8, col); ring(0, 8, col)
            if t == 'helmet': p.rect(41, 12, 6, 1, dark)
            else:
                p.rect(41, 9, 6, 6, (110, 200, 255, 110))
        elif t == 'hood':
            p.rect(40, 0, 8, 8, col); ring(0, 8, col)
            p.rect(42, 10, 4, 6, CLEAR)
        elif t == 'ninja':
            p.rect(40, 0, 8, 8, col); ring(0, 8, col); p.rect(41, 11, 6, 3, CLEAR); ring(2, 1, hx(sp.get('trim', '#c0392b')))
    # ---- torso ----
    shirt = hx(sp['shirt']); trim = hx(sp.get('trim', '#ffffff'))
    p.box(16, 16, 8, 12, 4, shirt)
    dz = sp.get('design', 'none')
    bodyfaces = ((16, 4), (20, 8), (28, 4), (32, 8))
    if dz == 'stripe':
        for x0, w in bodyfaces: p.rect(x0, 23, w, 2, trim)
    elif dz == 'zip': p.rect(23, 20, 2, 12, trim)
    elif dz == 'belt':
        for x0, w in bodyfaces: p.rect(x0, 30, w, 2, shade(hx(sp.get('pants', '#444444')), 0.6))
        p.rect(23, 30, 2, 2, trim)
    elif dz == 'emblem': p.rect(22, 23, 4, 4, trim); p.rect(23, 24, 2, 2, shade(trim, 0.55))
    elif dz == 'bibs':
        bib = hx(sp.get('bib', '#3b63b8')); p.rect(21, 24, 6, 8, bib); p.rect(21, 20, 1, 4, bib); p.rect(26, 20, 1, 4, bib); p.rect(23, 27, 2, 2, shade(bib, 0.8))
    elif dz == 'ribs':
        for y in (22, 24, 26, 28): p.rect(21, y, 6, 1, trim)
        p.rect(23, 20, 2, 12, trim)
    if sp.get('coat'):
        c = hx(sp['coat']); p.box(16, 32, 8, 12, 4, c); p.rect(23, 36, 1, 12, shade(c, 0.7))
    # ---- brazos ----
    sl = sp.get('sleeve', 4); glove = hx(sp['glove']) if sp.get('glove') else None
    for ox, oy in ((40, 16), (32, 48)):
        p.box(ox, oy, a, 12, 4, skin)
        for k, (x, y, fw, fh) in faces(ox, oy, a, 12, 4).items():
            if k == 'top': p.rect(x, y, fw, fh, shade(shirt, MULT['top']))
            elif k != 'bottom':
                p.rect(x, y, fw, sl, shade(shirt, MULT[k]))
                if glove: p.rect(x, y + fh - 2, fw, 2, shade(glove, MULT[k]))
            elif glove: p.rect(x, y, fw, fh, shade(glove, MULT[k]))
    # ---- piernas ----
    pants = hx(sp['pants']); shoe = hx(sp.get('shoe', '#333333'))
    for ox, oy in ((0, 16), (16, 48)):
        p.box(ox, oy, 4, 12, 4, pants)
        for k, (x, y, fw, fh) in faces(ox, oy, 4, 12, 4).items():
            if k == 'top': continue
            if k == 'bottom': p.rect(x, y, fw, fh, shade(shoe, MULT[k])); continue
            if sp.get('shorts'): p.rect(x, y + 5, fw, 5, shade(skin, MULT[k]))
            p.rect(x, y + fh - 2, fw, 2, shade(shoe, MULT[k]))
    return p.im

S = [
 dict(name='Explorador', tags='aventura explorador verde gorra', skin='#f1c9a5', hair='#5a3b1e', shirt='#4c9a3c', design='belt', trim='#d9b44a', pants='#7a5230', shoe='#3b2a1a', hat=('cap', '#3d7d31')),
 dict(name='Caballero', tags='knight caballero armadura medieval acero', skin='#e8b894', hair_style='none', shirt='#9aa3ad', design='emblem', trim='#2f5fb3', pants='#6b737c', shoe='#3a3f45', hat=('helmet', '#aab2bb'), sleeve=12, glove='#6b737c'),
 dict(name='Ninja', tags='ninja negro sigilo rojo', skin='#e8b894', hair_style='none', shirt='#22232b', design='belt', trim='#c0392b', pants='#22232b', shoe='#16161b', hat=('ninja', '#22232b'), sleeve=12, glove='#22232b'),
 dict(name='Pirata', tags='pirata mar bandana rayas', skin='#d9a77c', hair='#2b1d12', hair_style='long', shirt='#f1f1f1', design='stripe', trim='#2f4fa0', pants='#4a3a2a', shoe='#241a10', hat=('band', '#c0392b'), patch=True, beard='#2b1d12', slim=False),
 dict(name='Astronauta', tags='astronauta espacio blanco casco', skin='#f1c9a5', hair_style='none', shirt='#eceff3', design='zip', trim='#d9453a', pants='#eceff3', shoe='#9aa0a8', hat=('astro', '#eceff3'), sleeve=12, glove='#9aa0a8'),
 dict(name='Mago', tags='mago hechicero morado magia sombrero', skin='#f1c9a5', hair='#dcdcdc', hair_style='long', shirt='#6b3fa0', design='stripe', trim='#e0c040', pants='#4b2a75', shoe='#2a1a40', hat=('wizard', '#5a3590'), beard='#dcdcdc', coat='#6b3fa0', sleeve=12, slim=True),
 dict(name='Granjero', tags='granjero campo paja overol', skin='#e8b894', hair='#7a4a1e', shirt='#c0392b', design='bibs', bib='#3b63b8', trim='#e0c040', pants='#3b63b8', shoe='#5a3b1e', hat=('straw', '#e0c868'), sleeve=8),
 dict(name='Minero', tags='minero mina casco amarillo', skin='#d9a77c', hair='#2b1d12', shirt='#7d8590', design='stripe', trim='#e8c53a', pants='#3a3f4a', shoe='#22252c', hat=('helmet', '#e8c53a')),
 dict(name='Robot', tags='robot metal plata futuro', skin='#b9c3cc', hair_style='none', face='robot', led='#33e0ff', shirt='#8d98a3', design='emblem', trim='#33e0ff', pants='#6c7782', shoe='#3b434b', sleeve=12, glove='#6c7782'),
 dict(name='Zombi', tags='zombi zombie verde monstruo halloween', skin='#6fa35c', hair_style='none', shirt='#3f8f9a', design='stripe', trim='#2c6a73', pants='#35418a', shoe='#22274f', eyes='#202020'),
 dict(name='Esqueleto', tags='esqueleto huesos calavera halloween', skin='#e9e6da', hair_style='none', face='skull', shirt='#d6d2c4', design='ribs', trim='#6d6a5e', pants='#d6d2c4', shoe='#b7b3a3', sleeve=12, slim=True),
 dict(name='Fantasma', tags='fantasma blanco halloween espectro', skin='#f4f6fb', hair_style='none', face='ghost', shirt='#f4f6fb', pants='#f4f6fb', shoe='#e1e5ee', sleeve=12, slim=True),
 dict(name='Vaquero', tags='vaquero cowboy oeste sombrero', skin='#d9a77c', hair='#3a2412', shirt='#c79a5a', design='belt', trim='#e8d9a0', pants='#3b63b8', shoe='#4a2f18', hat=('straw', '#8a5a2b'), beard='#3a2412'),
 dict(name='Chef', tags='chef cocinero cocina blanco', skin='#f1c9a5', hair='#2b1d12', shirt='#f4f4f4', design='zip', trim='#c8c8c8', pants='#2a2a33', shoe='#16161b', hat=('chef', '#ffffff'), sleeve=8, slim=True),
 dict(name='Deportista', tags='deportista deporte rojo chandal gimnasio', skin='#e8b894', hair='#2b1d12', shirt='#d9453a', design='stripe', trim='#ffffff', pants='#d9453a', shoe='#f1f1f1', hat=('band', '#ffffff'), sleeve=12),
 dict(name='Hoodie azul', tags='hoodie sudadera azul capucha casual', skin='#f1c9a5', hair='#3a2412', shirt='#2f5fb3', design='zip', trim='#9fb7e8', pants='#2a2f3a', shoe='#e9e9ef', hat=('hood', '#2f5fb3'), sleeve=12, slim=True),
 dict(name='Hoodie negro', tags='hoodie sudadera negro capucha urbano', skin='#d9a77c', hair='#16161b', shirt='#24252c', design='emblem', trim='#8d5cf0', pants='#33353f', shoe='#d9d9df', hat=('hood', '#24252c'), sleeve=12),
 dict(name='Zorro', tags='zorro fox naranja animal', skin='#f1c9a5', hair='#e07a1f', hair_style='spiky', shirt='#e07a1f', design='stripe', trim='#fff4e0', pants='#4a3a2a', shoe='#2a1f16', eyes='#4a2f18', slim=True),
 dict(name='Elfo', tags='elfo bosque verde fantasia tunica', skin='#f1d7b8', hair='#c9a050', hair_style='long', shirt='#3f8f4a', design='belt', trim='#d9b44a', pants='#6b4a2a', shoe='#3b2a1a', hat=('cap', '#2f7a3a'), slim=True, eyes='#2f9a5a'),
 dict(name='Samurai', tags='samurai japon guerrero rojo katana', skin='#e8b894', hair='#16161b', hair_style='spiky', shirt='#a82a2a', design='emblem', trim='#e0c040', pants='#2a2a33', shoe='#16161b', hat=('band', '#16161b'), sleeve=8, glove='#2a2a33'),
 dict(name='Vampiro', tags='vampiro dracula negro rojo halloween', skin='#e9dccb', hair='#16161b', shirt='#8c1f2a', design='zip', trim='#16161b', pants='#16161b', shoe='#0d0d10', coat='#1b1b22', sleeve=12, eyes='#c0392b'),
 dict(name='Cientifico', tags='cientifico laboratorio bata blanca gafas', skin='#f1c9a5', hair='#b9b9c2', shirt='#3b63b8', design='none', pants='#2a2a33', shoe='#16161b', coat='#f4f4f4', glasses='#2a2a33', sleeve=12),
 dict(name='Estudiante', tags='estudiante colegio uniforme escuela', skin='#e8b894', hair='#2b1d12', shirt='#f1f1f1', design='stripe', trim='#2f4fa0', pants='#2f4fa0', shoe='#16161b', sleeve=4, slim=True),
 dict(name='Rockero', tags='rockero rock musica cuero guitarra', skin='#e8b894', hair='#b9b9c2', hair_style='spiky', shirt='#1b1b22', design='emblem', trim='#d9453a', pants='#2f3a5a', shoe='#16161b', glasses='#16161b', sleeve=4),
]

def R(name, skin, led, shirt, trim, pants, shoe, design, **kw):
    return dict(name=name, tags='robot metal futuro maquina ' + name.lower(), skin=skin, hair_style='none', face='robot', led=led, shirt=shirt, design=design,
                trim=trim, pants=pants, shoe=shoe, sleeve=12, glove=pants, **kw)

S += [
 R('Robot Rojo', '#b86a6a', '#ff3b3b', '#8f3b3b', '#ff3b3b', '#6a2b2b', '#3b1a1a', 'emblem'),
 R('Robot Dorado', '#d9b44a', '#fff3a0', '#b8901f', '#fff3a0', '#8a6a14', '#4a3a0a', 'stripe'),
 R('Robot Verde', '#7fbf8a', '#7dff9b', '#3f7a4a', '#7dff9b', '#2f5a38', '#183a22', 'ribs'),
 R('Robot Naranja', '#e08a3a', '#ffffff', '#b8601a', '#ffd9a0', '#7a3f10', '#3a1d08', 'zip'),
 R('Robot Rosa', '#e8a0c8', '#ff7ad0', '#b8608f', '#ffd0ee', '#8a3f6a', '#4a1f38', 'emblem', slim=True),
 R('Robot Sigilo', '#3a3d46', '#9b5cff', '#23252c', '#9b5cff', '#1b1c22', '#0d0d10', 'belt', hat=('hood', '#2a2c34')),
 R('Robot Retro', '#c9c4b0', '#ff3b3b', '#a8a38e', '#3b63b8', '#7d7966', '#4a4838', 'stripe', hat=('band', '#3b63b8')),
 R('Robot Cobre', '#c98a5a', '#40e0d0', '#9a5a2f', '#40e0d0', '#6a3b1d', '#331a0b', 'emblem'),
 R('Robot Hielo', '#cfeaf7', '#33b5ff', '#9fd0e8', '#ffffff', '#7fb0cc', '#4a7a94', 'zip'),
 R('Robot Militar', '#7a8560', '#ffcf33', '#59633f', '#ffcf33', '#434b2f', '#22261a', 'belt', hat=('band', '#59633f')),
]

def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'renderer', 'skins')
    os.makedirs(out, exist_ok=True)
    lib = []
    for i, sp in enumerate(S):
        im = build(sp); buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
        lib.append({'id': f's{i + 1:02d}', 'name': sp['name'], 'tags': sp['tags'], 'model': 'slim' if sp.get('slim') else 'wide',
                    'data': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()})
    with open(os.path.join(out, 'library.js'), 'w', encoding='utf8') as f:
        f.write('// Generado por tools/gen_skins.py: skins originales de Alqan Launcher\nwindow.SKIN_LIB = ' + json.dumps(lib, ensure_ascii=False) + ';\n')
    if len(sys.argv) > 1:  # vista previa (montaje) para revisar
        W = Image.new('RGBA', (8 * 100, 5 * 150), (70, 78, 96, 255))
        for i, sp in enumerate(S):
            im = build(sp); a = 3 if sp.get('slim') else 4; t = Image.new('RGBA', (16, 32))
            def d(sx, sy, w, h, dx, dy): t.alpha_composite(im.crop((sx, sy, sx + w, sy + h)), (dx, dy))
            d(8, 8, 8, 8, 4, 0); d(20, 20, 8, 12, 4, 8); d(44, 20, a, 12, 4 - a + 0, 8); d(36, 52, a, 12, 12, 8)
            d(4, 20, 4, 12, 4, 20); d(20, 52, 4, 12, 8, 20); d(40, 8, 8, 8, 4, 0); d(20, 36, 8, 12, 4, 8); d(4, 36, 4, 12, 4, 20)
            W.alpha_composite(t.resize((80, 160), Image.NEAREST).crop((0, 0, 80, 150)), ((i % 8) * 100 + 10, (i // 8) * 150))
        W.save(sys.argv[1])
    print(len(lib), 'skins generadas')

main()
