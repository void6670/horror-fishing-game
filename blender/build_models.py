"""
Builds the 3D models for The Deep Hours in Blender and exports them to src/assets/models.glb.

Run with Blender's bundled Python, e.g.:
    blender --background --python blender/build_models.py
or with the `bpy` module from PyPI:
    python blender/build_models.py

Every object is modeled around its pivot at the world origin, with transforms and modifiers applied,
so the game can use each mesh's geometry directly. Output: src/assets/models.glb (bundled into the game). Materials are not exported: the game applies its
own (fish skins, brass, cloth...). Blender is Z-up; the glTF exporter converts to Three.js Y-up, so
"forward" for characters (three.js +Z) is Blender -Y here.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector, noise

random.seed(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets', 'models.glb')


# ---------------------------------------------------------------- helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(obj):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def finalize(obj, name, smooth=True, angle=50):
    """Apply modifiers and transforms, set shading, name the object."""
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    else:
        bpy.ops.object.shade_flat()
    obj.name = name
    obj.data.name = name
    return obj


def join(objs, name):
    activate(objs[0])
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def mesh_from(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def loft(name, rings, closed=True, cap_start=False, cap_end=False):
    """rings: list of lists of (x, y, z); all rings have the same point count."""
    verts, faces, uvs = [], [], []
    m = len(rings[0])
    seg = m if closed else m - 1
    for i, ring in enumerate(rings):
        for j, p in enumerate(ring):
            verts.append(p)
            uvs.append((i / (len(rings) - 1), j / max(1, (m if closed else m - 1))))
    for i in range(len(rings) - 1):
        for j in range(seg):
            a = i * m + j
            b = i * m + (j + 1) % m
            c = (i + 1) * m + (j + 1) % m
            d = (i + 1) * m + j
            faces.append((a, b, c, d))
    if cap_start:
        faces.append(tuple(reversed(range(m))))
    if cap_end:
        base = (len(rings) - 1) * m
        faces.append(tuple(base + j for j in range(m)))
    return mesh_from(name, verts, faces, uvs)


def add_mod(obj, kind, **kw):
    m = obj.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def displace(obj, strength=0.1, size=0.5, kind='CLOUDS'):
    tex = bpy.data.textures.new(obj.name + '_tex', kind)
    if hasattr(tex, 'noise_scale'):
        tex.noise_scale = size
    m = add_mod(obj, 'DISPLACE', strength=strength)
    m.texture = tex
    m.texture_coords = 'OBJECT' if False else 'LOCAL'
    return m


def jitter(obj, amount):
    for v in obj.data.vertices:
        v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * amount


def cyl(r1, r2, depth, verts=12, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    return bpy.context.active_object


def sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return o


def cube(size, loc=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return o


def skin_tree(name, edges_def, radius_fn, subsurf=1):
    """Builds an organic branching mesh with the Skin modifier from a list of (p0, p1) points."""
    verts, edges, index = [], [], {}

    def vid(p):
        key = tuple(round(c, 4) for c in p)
        if key not in index:
            index[key] = len(verts)
            verts.append(p)
        return index[key]

    for a, b in edges_def:
        edges.append((vid(a), vid(b)))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, edges, [])
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    add_mod(obj, 'SKIN')
    for i, sv in enumerate(me.skin_vertices[0].data):
        r = radius_fn(Vector(verts[i]))
        sv.radius = (r, r)
    me.skin_vertices[0].data[0].use_root = True
    if subsurf:
        add_mod(obj, 'SUBSURF', levels=subsurf, render_levels=subsurf)
    return obj


# ---------------------------------------------------------------- vegetation
def build_pine():
    trunk = cyl(0.3, 0.1, 4.6, verts=8, loc=(0, 0, 2.3))
    jitter(trunk, 0.03)
    finalize(trunk, 'pine_trunk', smooth=True)
    tiers = []
    n = 6
    for i in range(n):
        r = 2.3 * (1 - i / (n + 0.6)) + 0.35
        z = 2.4 + i * 1.5
        c = cyl(r, 0.05, 2.5, verts=11, loc=(0, 0, z + 1.25))
        # droop the outer ring and roughen the silhouette into branches
        for v in c.data.vertices:
            if v.co.z < 0:
                ang = math.atan2(v.co.y, v.co.x)
                spike = 1 + 0.28 * math.sin(ang * 5 + i * 1.7) + random.uniform(-0.12, 0.12)
                v.co.x *= spike
                v.co.y *= spike
                v.co.z -= 0.35 * spike
        tiers.append(c)
    crown = join(tiers, 'pine_crown')
    finalize(crown, 'pine_crown', smooth=False)


def build_dead_tree(idx, height):
    rnd = random.Random(idx * 31 + 5)
    edges = []

    def grow(p, d, length, depth):
        end = p + d * length
        edges.append((tuple(p), tuple(end)))
        if depth == 0:
            return
        kids = 2 if depth > 1 else rnd.randint(1, 3)
        for _ in range(kids):
            nd = (d + Vector((rnd.uniform(-0.9, 0.9), rnd.uniform(-0.9, 0.9), rnd.uniform(-0.1, 0.5)))).normalized()
            grow(end, nd, length * rnd.uniform(0.45, 0.65), depth - 1)

    base = Vector((0, 0, 0))
    up = Vector((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), 1)).normalized()
    # trunk in segments so it bends
    p = base
    for s in range(4):
        d = (up + Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))).normalized()
        q = p + d * (height * 0.16)
        edges.append((tuple(p), tuple(q)))
        if s >= 1:
            nd = (d + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0, 0.6)))).normalized()
            grow(q, nd, height * 0.28, 3)
        p = q
    grow(p, up, height * 0.3, 3)
    t = skin_tree(f'dead_tree_{idx}', edges, lambda v: max(0.03, 0.32 * max(0.0, 1 - v.z / (height * 1.3)) ** 1.6), subsurf=0)
    add_mod(t, 'DECIMATE', ratio=0.5)
    finalize(t, f'dead_tree_{idx}', smooth=True, angle=60)


def build_rocks():
    for i in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
        r = bpy.context.active_object
        r.scale = (1 + i * 0.15, 0.85, 0.65 + 0.1 * i)
        displace(r, strength=0.45, size=0.6 + i * 0.2)
        add_mod(r, 'DECIMATE', ratio=0.35)
        finalize(r, f'rock_{i}', smooth=False)


# ---------------------------------------------------------------- fish
def fish_profile(t):
    """t in [0,1] tail->head; returns (half-height, half-width, z-center)."""
    # body: thin at the tail peduncle, deepest a third from the head, blunt snout
    h = 0.15 * (math.sin(math.pi * (t ** 0.75)) ** 0.85) + 0.012
    if t < 0.12:
        h = 0.012 + 0.03 * (t / 0.12)
    w = h * 0.52
    zc = 0.01 * math.sin(math.pi * t) - (0.01 if t > 0.85 else 0)
    return h, w, zc


def build_fish():
    rings = []
    N, M = 28, 16
    for i in range(N):
        t = i / (N - 1)
        x = -0.5 + t
        h, w, zc = fish_profile(t)
        ring = []
        for j in range(M):
            a = j / M * math.pi * 2
            # flatter belly, keeled back
            s = math.sin(a)
            z = zc + (h * s if s > 0 else h * 0.85 * s)
            y = w * math.cos(a)
            ring.append((x, y, z))
        rings.append(ring)
    body = loft('fish_body', rings, closed=True, cap_start=True, cap_end=True)
    # UVs for the painted skin: u runs tail->head, v runs belly->back (canvas top is the dark back)
    me = body.data
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            co = me.vertices[vi].co
            me.uv_layers[0].data[li].uv = (co.x + 0.5, (co.z + 0.16) / 0.32)
    activate(body)
    add_mod(body, 'SUBSURF', levels=1, render_levels=1)
    finalize(body, 'fish_body', smooth=True, angle=80)

    fins = []
    # forked tail
    verts = [(-0.47, 0, 0.0), (-0.72, 0, 0.16), (-0.66, 0, 0.0), (-0.72, 0, -0.15)]
    fins.append(mesh_from('tail', verts, [(0, 1, 2), (0, 2, 3)]))
    # dorsal: spiny front, soft back
    dv = [(0.25, 0, 0.13), (-0.2, 0, 0.12)]
    for k in range(7):
        x = 0.22 - k * 0.065
        dv.append((x, 0, 0.13 + (0.1 if k < 4 else 0.06) * (1 - abs(k - 2) * 0.12)))
    df = [(0, 2, 3)] + [(0, 2 + k, 3 + k) for k in range(1, 6)] + [(0, 8, 1)]
    fins.append(mesh_from('dorsal', dv, df))
    # anal + pectorals
    fins.append(mesh_from('anal', [(-0.05, 0, -0.1), (-0.25, 0, -0.07), (-0.2, 0, -0.16)], [(0, 1, 2)]))
    for s in (1, -1):
        fins.append(mesh_from('pec', [(0.25, s * 0.07, -0.02), (0.12, s * 0.12, -0.06), (0.15, s * 0.08, -0.09)], [(0, 1, 2)]))
    f = join(fins, 'fish_fins')
    finalize(f, 'fish_fins', smooth=False)


# ---------------------------------------------------------------- alarm clock
def build_clock():
    parts = []
    # case: cylinder axis along -Y (faces three.js +Z)
    case = cyl(0.075, 0.075, 0.045, verts=40, rot=(math.pi / 2, 0, 0))
    add_mod(case, 'BEVEL', width=0.006, segments=3)
    parts.append(case)
    for y in (-0.023, 0.023):  # rims
        bpy.ops.mesh.primitive_torus_add(major_radius=0.074, minor_radius=0.005, major_segments=40, minor_segments=8, location=(0, y, 0), rotation=(math.pi / 2, 0, 0))
        parts.append(bpy.context.active_object)
    for s in (-1, 1):  # bells
        b = sphere(0.04, loc=(s * 0.047, 0, 0.088), seg=20, rings=10)
        bm = bmesh.new(); bm.from_mesh(b.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.002], context='VERTS')
        bm.to_mesh(b.data); bm.free()
        b.rotation_euler = (0, s * 0.45, 0)
        add_mod(b, 'SOLIDIFY', thickness=0.003)
        parts.append(b)
        leg = cyl(0.011, 0.006, 0.03, verts=8, loc=(s * 0.05, 0, -0.085), rot=(0, s * 0.35, 0))
        parts.append(leg)
        foot = sphere(0.009, loc=(s * 0.056, 0, -0.1))
        parts.append(foot)
    stem = cyl(0.004, 0.004, 0.06, verts=8, loc=(0, 0, 0.1))
    parts.append(stem)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.022, minor_radius=0.004, location=(0, 0, 0.128), rotation=(math.pi / 2, 0, 0))
    parts.append(bpy.context.active_object)
    for k in range(2):  # winding keys on the back
        key = cube(1, loc=(-0.025 + k * 0.05, 0.035, -0.02), scale=(0.008, 0.012, 0.016))
        parts.append(key)
    c = join(parts, 'clock_case')
    activate(c)
    add_mod(c, 'DECIMATE', ratio=0.25)
    finalize(c, 'clock_case', smooth=True, angle=40)
    # hammer between the bells
    h = cyl(0.003, 0.003, 0.04, verts=6, loc=(0, 0, 0.098))
    hd = sphere(0.006, loc=(0, 0, 0.118))
    finalize(join([h, hd], 'clock_hammer'), 'clock_hammer')
    # face disk with planar UVs (canvas texture goes here)
    bpy.ops.mesh.primitive_circle_add(vertices=40, radius=0.068, fill_type='NGON', location=(0, -0.0235, 0), rotation=(math.pi / 2, 0, 0))
    face = bpy.context.active_object
    me = face.data
    layer = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            co = me.vertices[vi].co
            layer.data[li].uv = (0.5 + co.x / 0.136, 0.5 + co.y / 0.136)
    finalize(face, 'clock_face', smooth=False)


# ---------------------------------------------------------------- boats & props
def build_rowboat():
    rings = []
    N = 20
    L = 4.2
    for i in range(N):
        t = i / (N - 1)  # 0 stern .. 1 bow
        y = -L / 2 + t * L
        beam = 0.72 * (math.sin(math.pi * min(1, t * 1.1 + 0.05)) ** 0.7)
        if t < 0.08:
            beam = 0.62
        depth = 0.42 + 0.15 * (t ** 3)
        sheer = 0.55 + 0.18 * (t ** 4) + 0.05 * ((1 - t) ** 4)
        ring = []
        M = 12
        for j in range(M + 1):
            a = j / M  # 0..1 port rim -> keel -> starboard rim
            ang = math.pi * a
            x = -math.cos(ang) * beam * (1.0 + 0.12 * abs(math.cos(ang)))
            z = sheer - math.sin(ang) * depth
            ring.append((x, y, z))
        rings.append(ring)
    hull = loft('rowboat', rings, closed=False)
    activate(hull)
    add_mod(hull, 'SOLIDIFY', thickness=0.045, offset=1)
    add_mod(hull, 'SUBSURF', levels=1, render_levels=1)
    parts = [hull]
    for y, w in ((-1.2, 1.15), (0.0, 1.35), (1.1, 1.1)):
        parts.append(cube(1, loc=(0, y, 0.38), scale=(w, 0.28, 0.04)))
    for side in (-1, 1):
        parts.append(cube(1, loc=(side * 0.7, 0.2, 0.62), scale=(0.04, 0.04, 0.1)))
        rail = cube(1, loc=(side * 0.66, 0.05, 0.58), scale=(0.05, 3.2, 0.05))
        parts.append(rail)
    parts.append(cube(1, loc=(0, 0, 0.1), scale=(0.8, 3.4, 0.03)))  # floorboards
    b = join(parts, 'rowboat')
    finalize(b, 'rowboat', smooth=True, angle=35)


def build_car():
    body = cube(1, loc=(0, 0, 0.62), scale=(1.8, 4.3, 0.62))
    add_mod(body, 'BEVEL', width=0.12, segments=3)
    cab = cube(1, loc=(0, -0.2, 1.22), scale=(1.55, 2.1, 0.6))
    for v in cab.data.vertices:
        if v.co.z > 0:
            v.co.x *= 0.9
            v.co.y *= 0.72
    add_mod(cab, 'BEVEL', width=0.08, segments=3)
    bumpers = [cube(1, loc=(0, s * 2.18, 0.45), scale=(1.75, 0.12, 0.2)) for s in (-1, 1)]
    finalize(join([body, cab] + bumpers, 'car_body'), 'car_body', smooth=True, angle=40)
    gl = cube(1, loc=(0, -0.2, 1.24), scale=(1.58, 2.12, 0.5))
    for v in gl.data.vertices:
        if v.co.z > 0:
            v.co.x *= 0.88
            v.co.y *= 0.7
    finalize(gl, 'car_glass', smooth=False)
    wheels = []
    for x in (-0.86, 0.86):
        for y in (-1.38, 1.38):
            w = cyl(0.34, 0.34, 0.24, verts=18, loc=(x, y, 0.34), rot=(0, math.pi / 2, 0))
            add_mod(w, 'BEVEL', width=0.05, segments=2)
            wheels.append(w)
    finalize(join(wheels, 'car_wheels'), 'car_wheels', smooth=True)


def build_tent():
    # sagging A-frame: ridge along Y
    W, L, H = 1.0, 1.4, 1.5
    nx, ny = 12, 14
    verts, faces = [], []
    for i in range(ny + 1):
        y = -L + 2 * L * i / ny
        for j in range(nx + 1):
            u = j / nx  # 0 left ground .. 1 right ground
            x = -W + 2 * W * u
            ridge = 1 - abs(2 * u - 1)
            sag = 0.12 * math.sin(math.pi * u) * math.sin(math.pi * i / ny)
            z = H * ridge - sag * (1 - abs(2 * u - 1) * 0.3) + noise.noise(Vector((x * 2, y * 2, 0))) * 0.03
            verts.append((x * (1 + 0.05 * math.sin(math.pi * i / ny)), y, max(0, z)))
    for i in range(ny):
        for j in range(nx):
            a = i * (nx + 1) + j
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    t = mesh_from('tent', verts, faces)
    # back wall (front stays open as a flap)
    bv = [(-W, L, 0), (W, L, 0), (0, L, H)]
    back = mesh_from('tentback', bv, [(0, 1, 2)])
    flap = mesh_from('flap', [(-W, -L, 0), (-0.15, -L - 0.3, 0), (0, -L, H)], [(0, 1, 2)])
    tt = join([t, back, flap], 'tent')
    activate(tt)
    add_mod(tt, 'SOLIDIFY', thickness=0.015)
    finalize(tt, 'tent', smooth=True, angle=45)


# ---------------------------------------------------------------- humanoid parts (normalized)
def build_head():
    """Gaunt drowned head; radius ~1, facing -Y (three.js +Z)."""
    h = sphere(1, seg=28, rings=18)
    for v in h.data.vertices:
        c = v.co
        c.z *= 1.18
        c.x *= 0.86
        fwd = -c.y  # front
        # sunken eye sockets
        for sx in (-0.38, 0.38):
            d = (Vector((c.x, c.y, c.z)) - Vector((sx, -0.85, 0.18))).length
            if d < 0.42:
                c.y += 0.22 * (1 - d / 0.42)
        # hollow cheeks
        if fwd > 0.2 and -0.6 < c.z < 0.05:
            c.x *= 0.85
        # long jaw / chin
        if c.z < -0.5:
            c.z -= 0.18 * (-(c.z) - 0.5)
            c.x *= 0.82
        # nose ridge
        if abs(c.x) < 0.14 and -0.35 < c.z < 0.15 and fwd > 0.75:
            c.y -= 0.12
    jitter(h, 0.015)
    finalize(h, 'h_head', smooth=True, angle=70)


def lathe(name, profile, seg=14, scale_x=1.0, scale_y=1.0):
    """profile: list of (radius, z). Revolves around Z."""
    rings = []
    for r, z in profile:
        rings.append([(r * math.cos(a) * scale_x, r * math.sin(a) * scale_y, z) for a in (k / seg * math.pi * 2 for k in range(seg))])
    return loft(name, rings, closed=True, cap_start=True, cap_end=True)


def build_body_parts():
    # torso: z 0 (hips) .. 1 (shoulders); half-width 1
    t = lathe('h_torso', [(0.78, 0), (0.86, 0.15), (0.8, 0.4), (0.92, 0.7), (1.0, 0.88), (0.55, 1.0), (0.3, 1.05)], seg=16, scale_y=0.6)
    for v in t.data.vertices:
        if v.co.y < 0 and 0.45 < v.co.z < 0.9:  # ribs showing through wet cloth
            v.co.y -= 0.03 * math.sin(v.co.z * 40)
    finalize(t, 'h_torso', smooth=True)
    # coat skirt: top at z 0, hem at -1; radius 1 at hem; open at the front
    rings = []
    M = 18
    for i in range(10):
        z = -i / 9
        r = 0.72 + 0.3 * (i / 9)
        ring = []
        for j in range(M + 1):
            a = -math.pi / 2 + 0.35 + (j / M) * (2 * math.pi - 0.7)
            hem = 0
            if i == 9:
                hem = random.uniform(-0.12, 0.04)  # ragged hem
            ring.append((r * math.cos(a), r * math.sin(a) * 0.62, z + hem + 0.03 * math.sin(a * 6) * (i / 9)))
        rings.append(ring)
    coat = loft('h_coat', rings, closed=False)
    activate(coat)
    add_mod(coat, 'SOLIDIFY', thickness=0.04)
    finalize(coat, 'h_coat', smooth=True)
    # arm: shoulder at z 0, fingertips at -1, radius ~1 at shoulder
    a = lathe('h_arm', [(0.0, 0.05), (0.9, 0.0), (1.0, -0.08), (0.75, -0.38), (0.62, -0.42), (0.7, -0.5), (0.5, -0.74), (0.55, -0.78), (0.0, -0.8)], seg=10)
    hand = []
    palm = cube(1, loc=(0, 0, -0.83), scale=(0.9, 0.35, 0.12))
    hand.append(palm)
    for k in range(4):
        x = -0.32 + k * 0.21
        f = cyl(0.09, 0.05, 0.2, verts=6, loc=(x, 0.0, -0.98))
        f.rotation_euler = (0.25, 0, 0)
        hand.append(f)
    hand.append(cyl(0.1, 0.06, 0.12, verts=6, loc=(0.48, -0.05, -0.85), rot=(0, 0.8, 0)))
    arm = join([a] + hand, 'h_arm')
    finalize(arm, 'h_arm', smooth=True)
    # leg with wader boot: hip at z 0, sole at -1
    l = lathe('h_leg', [(0.0, 0.05), (1.0, 0.0), (0.95, -0.25), (0.7, -0.48), (0.75, -0.53), (0.62, -0.8), (0.75, -0.86), (0.8, -0.98), (0.0, -1.0)], seg=10)
    foot = cube(1, loc=(0, -0.45, -0.95), scale=(0.75, 1.0, 0.12))
    add_mod(foot, 'BEVEL', width=0.05, segments=2)
    leg = join([l, foot], 'h_leg')
    finalize(leg, 'h_leg', smooth=True)
    # wide-brimmed fishing hat: brim radius 1
    brim = lathe('h_hat_brim', [(0.0, 0.0), (1.0, -0.06), (1.0, -0.03), (0.0, 0.03)], seg=24)
    for v in brim.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        v.co.z -= 0.12 * (r ** 2) * (0.6 + 0.4 * math.sin(math.atan2(v.co.y, v.co.x) * 2))
    crown = lathe('h_hat_crown', [(0.48, 0.0), (0.46, 0.3), (0.38, 0.42), (0.0, 0.45)], seg=18)
    hat = join([brim, crown], 'h_hat')
    finalize(hat, 'h_hat', smooth=True)


# ---------------------------------------------------------------- monsters
def build_tentacle():
    edges = []
    pts = []
    for k in range(14):
        t = k / 13
        pts.append(Vector((math.sin(t * 2.4) * 1.6 * t, math.cos(t * 1.7) * 0.6 * t, t * 13)))
    for a, b in zip(pts, pts[1:]):
        edges.append((tuple(a), tuple(b)))
    o = skin_tree('tentacle', edges, lambda v: max(0.06, 0.7 * max(0.0, 1 - v.z / 13.5)), subsurf=2)
    add_mod(o, 'DECIMATE', ratio=0.4)
    finalize(o, 'tentacle', smooth=True)


def build_angler():
    head = sphere(4.5, seg=24, rings=16, scale=(1.2, 1.0, 0.8))
    for v in head.data.vertices:
        if v.co.y < -2.5:  # gaping mouth cavity at the front (-Y)
            v.co.y += (abs(v.co.y) - 2.5) * 0.9 * max(0, 1 - abs(v.co.z) / 2.5)
    displace(head, strength=0.3, size=1.2)
    finalize(head, 'angler_head', smooth=True)
    teeth = []
    for i in range(22):
        a = (i / 21) * math.pi - math.pi / 2
        upper = i % 2 == 0
        t = cyl(0.14, 0.0, random.uniform(0.9, 1.8), verts=6, loc=(math.sin(a) * 3.6, -3.4 - math.cos(a) * 0.4, 0.9 if upper else -0.9), rot=(math.pi if upper else 0, 0, 0))
        teeth.append(t)
    finalize(join(teeth, 'angler_teeth'), 'angler_teeth', smooth=True)


# ---------------------------------------------------------------- main
def main():
    reset()
    build_pine()
    for i, h in enumerate((9, 11, 8)):
        build_dead_tree(i, h)
    build_rocks()
    build_fish()
    build_clock()
    build_rowboat()
    build_car()
    build_tent()
    build_head()
    build_body_parts()
    build_tentacle()
    build_angler()
    # temporary helpers (bell halves etc.) were joined; remove anything unnamed-for-export
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_texcoords=True, export_yup=True)
    names = sorted(o.name for o in bpy.data.objects)
    print('EXPORTED', os.path.abspath(OUT), len(names), 'objects:', ', '.join(names))


if __name__ == '__main__':
    main()
