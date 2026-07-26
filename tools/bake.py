#!/usr/bin/env python3
"""Bakes composite sprites (house, tilled soil) from the Sprout Lands basic pack.

The pack ships houses as tileset pieces plus one assembled demo. Rather than
re-deriving the artist's assembly at runtime, we compose the pieces once here
and let the game blit finished PNGs.
"""
import os
from PIL import Image

SRC = os.path.join(
    os.path.dirname(__file__),
    "..", "assets", "sprout-lands", "Sprout Lands - Sprites - Basic pack",
)
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")


def load(rel):
    return Image.open(os.path.join(SRC, rel)).convert("RGBA")


def repeat_x(strip, width):
    """Fill `width` px by repeating `strip` horizontally."""
    out = Image.new("RGBA", (width, strip.height), (0, 0, 0, 0))
    for x in range(0, width, strip.width):
        out.alpha_composite(strip.crop((0, 0, min(strip.width, width - x), strip.height)), (x, 0))
    return out


def stretch_x(img, width, edge):
    """Widen a sprite keeping `edge` px of each side intact, repeating the middle."""
    out = Image.new("RGBA", (width, img.height), (0, 0, 0, 0))
    inner = img.crop((edge, 0, img.width - edge, img.height))
    out.alpha_composite(repeat_x(inner, width - 2 * edge), (edge, 0))
    out.alpha_composite(img.crop((0, 0, edge, img.height)), (0, 0))
    out.alpha_composite(img.crop((img.width - edge, 0, img.width, img.height)), (width - edge, 0))
    return out


def vstack(pieces):
    w = max(p.width for p in pieces)
    h = sum(p.height for p in pieces)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    for p in pieces:
        out.alpha_composite(p, ((w - p.width) // 2, y))
        y += p.height
    return out


def build_house(wall_tiles=3, storeys=1, chimney_on=True):
    """Roof + `storeys` wall sections + door, `wall_tiles` tiles wide."""
    body_w = wall_tiles * 16
    roof_w = body_w + 4                          # slight overhang

    # --- wall -------------------------------------------------------------
    # The demo wall is only 26px wide, so widen the siding and re-centre the
    # window instead of stretching the window itself.
    src = load("Tilesets/Wooden House.png")
    wall = src.crop((11, 16, 37, 64))            # 26x48 wall body
    top_border = stretch_x(wall.crop((0, 0, 26, 3)), body_w, 3)
    siding = stretch_x(wall.crop((0, 33, 26, 48)), body_w, 3)
    window = wall.crop((4, 3, 22, 33))           # framed window, 18x30

    wall_out = Image.new("RGBA", (body_w, 48), (0, 0, 0, 0))
    for y in range(3, 48, siding.height):
        wall_out.alpha_composite(siding.crop((0, 0, body_w, min(siding.height, 48 - y))), (0, y))
    wall_out.alpha_composite(top_border, (0, 0))
    wall_out.alpha_composite(window, ((body_w - window.width) // 2, 4))

    # --- roof -------------------------------------------------------------
    roof_src = load("Tilesets/Wooden_House_Roof_Tilset.png").crop((10, 9, 38, 71))
    roof_w_src = stretch_x(roof_src, roof_w, 3)
    roof = vstack([
        roof_w_src.crop((0, 0, roof_w, 20)),     # top fringe + shingles
        roof_w_src.crop((0, 28, roof_w, 33)),    # ridge band
        roof_w_src.crop((0, 42, roof_w, 62)),    # shingles + bottom fringe
    ])

    # --- assemble ---------------------------------------------------------
    door = load("Tilesets/Doors.png").crop((0, 16, 16, 32))
    chimney = load("Tilesets/Wooden_House_Roof_Tilset.png").crop((99, 0, 109, 9))

    w = roof_w
    h = roof.height + wall_out.height * storeys
    house = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    house.alpha_composite(roof, (0, 0))
    for i in range(storeys):
        house.alpha_composite(wall_out, ((w - body_w) // 2, roof.height + i * wall_out.height))
    house.alpha_composite(door, ((w - 16) // 2, h - 16))
    if chimney_on:
        house.alpha_composite(chimney, (w - 18, 2))
    return house


def bake_house():
    h = build_house(wall_tiles=3, storeys=1)
    h.save(os.path.join(OUT, "house.png"))
    print("house.png", h.size)
    # The scholar's tower: narrower and two storeys tall, so it reads as a tower.
    t = build_house(wall_tiles=2, storeys=2, chimney_on=False)
    t.save(os.path.join(OUT, "tower.png"))
    print("tower.png", t.size)


def bake_soil():
    """Tilled + watered soil tiles, derived from the dirt tileset's fill colour."""
    dirt = load("Tilesets/Tilled_Dirt.png")
    base = dirt.crop((16, 16, 32, 32))           # solid centre tile
    px = base.load()
    fill = px[8, 8][:3]

    def shade(c, f):
        return tuple(max(0, min(255, int(v * f))) for v in c)

    for name, tint, clod in (
        ("soil_tilled.png", 0.80, 0.63),
        ("soil_watered.png", 0.55, 0.42),
    ):
        img = Image.new("RGBA", (16, 16), shade(fill, tint) + (255,))
        d = img.load()
        dark = shade(fill, clod) + (255,)
        light = shade(fill, min(1.0, tint * 1.12)) + (255,)
        # Broken furrows read as turned earth; continuous lines read as planks.
        for row, y in enumerate((2, 7, 12)):
            off = (row * 5) % 8
            for x in range(16):
                if (x + off) % 8 < 5:
                    d[x, y] = dark
                    d[x, y + 1] = dark
                else:
                    d[x, y + 1] = light
        img.save(os.path.join(OUT, name))
        print(name, fill, tint)


def copy_sheets():
    wanted = {
        "grass.png": "Tilesets/Grass.png",
        "water.png": "Tilesets/Water.png",
        "dirt.png": "Tilesets/Tilled_Dirt_Wide.png",
        "fences.png": "Tilesets/Fences.png",
        "doors.png": "Tilesets/Doors.png",
        "biom.png": "Objects/Basic_Grass_Biom_things.png",
        "plants.png": "Objects/Basic Plants.png",
        "furniture.png": "Objects/Basic Furniture.png",
        "chest.png": "Objects/Chest.png",
        "coop.png": "Objects/Free_Chicken_House.png",
        "bridge.png": "Objects/Wood_Bridge.png",
        "character.png": "Characters/Basic Charakter Spritesheet.png",
        "actions.png": "Characters/Basic Charakter Actions.png",
        "cow.png": "Characters/Free Cow Sprites.png",
        "chicken.png": "Characters/Free Chicken Sprites.png",
        "egg.png": "Objects/Egg_item.png",
        "milk.png": "Objects/Simple Milk and grass item.png",
        "tools.png": "Characters/Tools.png",
    }
    for dst, rel in wanted.items():
        load(rel).save(os.path.join(OUT, dst))
    print("copied", len(wanted), "sheets")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    copy_sheets()
    bake_house()
    bake_soil()
