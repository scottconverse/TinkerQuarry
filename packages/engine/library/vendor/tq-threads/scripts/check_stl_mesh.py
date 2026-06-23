#!/usr/bin/env python3
"""Independent STL topology/bounds check for tq-threads release proofs."""

from __future__ import annotations

import argparse
import math
import struct
import sys
from collections import Counter
from pathlib import Path


def _read_stl(path: Path) -> list[tuple[tuple[float, float, float], ...]]:
    data = path.read_bytes()
    tris: list[tuple[tuple[float, float, float], ...]] = []

    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + 50 * n == len(data):
            off = 84
            for _ in range(n):
                vals = struct.unpack_from("<12fH", data, off)
                tris.append((vals[3:6], vals[6:9], vals[9:12]))
                off += 50
            return tris

    verts: list[tuple[float, float, float]] = []
    for line in data.decode("utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) == 4 and parts[0] == "vertex":
            verts.append(tuple(float(x) for x in parts[1:4]))
    if len(verts) % 3:
        raise ValueError(f"{path}: ASCII STL has an incomplete triangle")
    for i in range(0, len(verts), 3):
        tris.append((verts[i], verts[i + 1], verts[i + 2]))
    return tris


def _key(v: tuple[float, float, float], scale: float) -> tuple[int, int, int]:
    return tuple(round(c / scale) for c in v)


def analyze(path: Path, tol: float) -> dict[str, float | int | bool]:
    tris = _read_stl(path)
    if not tris:
        raise ValueError(f"{path}: no triangles found")

    edges: Counter[tuple[tuple[int, int, int], tuple[int, int, int]]] = Counter()
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []

    for tri in tris:
        keys = [_key(v, tol) for v in tri]
        for a, b in ((0, 1), (1, 2), (2, 0)):
            edge = tuple(sorted((keys[a], keys[b])))
            edges[edge] += 1
        for x, y, z in tri:
            xs.append(x)
            ys.append(y)
            zs.append(z)

    bad_edges = sum(1 for count in edges.values() if count != 2)
    max_radius = max(math.hypot(x, y) for x, y in zip(xs, ys))
    min_radius = min(math.hypot(x, y) for x, y in zip(xs, ys) if math.hypot(x, y) > tol)

    return {
        "triangles": len(tris),
        "unique_edges": len(edges),
        "bad_edges": bad_edges,
        "manifold": bad_edges == 0,
        "diameter": 2 * max_radius,
        "min_diameter": 2 * min_radius,
        "height": max(zs) - min(zs),
        "z_min": min(zs),
        "z_max": max(zs),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stl", type=Path)
    parser.add_argument("--tol", type=float, default=1e-5)
    parser.add_argument("--expect-manifold", action="store_true")
    parser.add_argument("--max-diameter", type=float)
    parser.add_argument("--min-diameter", type=float)
    parser.add_argument("--expect-height", type=float)
    parser.add_argument("--height-tol", type=float, default=0.08)
    args = parser.parse_args()

    result = analyze(args.stl, args.tol)
    for key, value in result.items():
        print(f"{key}: {value}")

    failures: list[str] = []
    if args.expect_manifold and not result["manifold"]:
        failures.append(f"expected a closed 2-manifold, found {result['bad_edges']} bad edges")
    if args.max_diameter is not None and result["diameter"] > args.max_diameter:
        failures.append(f"diameter {result['diameter']:.6f} > {args.max_diameter:.6f}")
    if args.min_diameter is not None and result["diameter"] < args.min_diameter:
        failures.append(f"diameter {result['diameter']:.6f} < {args.min_diameter:.6f}")
    if args.expect_height is not None:
        delta = abs(result["height"] - args.expect_height)
        if delta > args.height_tol:
            failures.append(f"height {result['height']:.6f} differs from {args.expect_height:.6f} by {delta:.6f}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
