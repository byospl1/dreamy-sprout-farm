#!/usr/bin/env python3
"""Sube el "?v=N" de cada <script>/<link> local en index.html a un valor nuevo.

Sin esto, algunos navegadores (sobre todo Safari en iPhone, más si el juego
está agregado a la pantalla de inicio) se quedan sirviendo una copia vieja en
caché de los .js/.css aunque el archivo en el servidor ya haya cambiado.
Cambiar la URL del recurso (agregarle ?v=<algo nuevo>) es la forma estándar
de forzar que la pidan de nuevo.

Uso:
    python3 tools/bump_version.py

Corre esto antes de cada "git push" que toque código, CSS o los sprites
horneados (ver GUIA-DESPLIEGUE.md).
"""
import datetime
import os
import re

INDEX = os.path.join(os.path.dirname(__file__), "..", "index.html")

# Solo toca recursos propios (relativos), nunca URLs externas (CDNs, etc.).
PATTERN = re.compile(r'((?:src|href)="(?!https?://)[^"?]+)\?v=[^"]+"')


def main():
    version = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    with open(INDEX, "r", encoding="utf-8") as f:
        html = f.read()

    new_html, n = PATTERN.subn(lambda m: m.group(1) + "?v=" + version + '"', html)
    if n == 0:
        print("No se encontró ningún ?v=... en index.html — ¿ya lo quitaste?")
        return

    with open(INDEX, "w", encoding="utf-8") as f:
        f.write(new_html)
    print(f"Versión actualizada a {version} en {n} recurso(s) de index.html")


if __name__ == "__main__":
    main()
