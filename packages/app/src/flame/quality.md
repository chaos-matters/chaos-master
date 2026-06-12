## 2D

```
N = number of points
A = surface of unit square in pixels
B = surface of a bucket (= 1 pixel)
Z = zoom

for Z = 1 A = height ^ 2 pixels
A(Z) = height^2 * Z^2 / 4 pixels
B = 1 pixels

P(point falls into a bucket) = B / A
E(bucket count) = N * B / A
V(bucket count) = N * p * (1 - p) ~= Np
Q = 1 - sqrt(Np) / Np

Q = 1 - sqrt(N * 1 / A) / (N * (1/A))
Q = 1 - sqrt(N / A) * A / N
Q = 1 - sqrt(A / N)
Q^2 - 2Q + 1 = A / N

Number of points required for achieving quality Q:
N = A / (Q^2 - 2Q + 1)
```

## 3D

The quality formula is the same — only the definition of **A** changes.

In 3D we use a perspective camera defined by:

- `R` = distance from camera position to target (radius)
- `θ` = vertical field of view (radians)
- `H` = canvas height in pixels

A unit world-space square at the target distance projects onto:

```
scale = H / (2 × R × tan(θ/2))     pixels per world unit
A     = scale²                       unit square in pixels
      = H² / (4 × R² × tan²(θ/2))
```

Zooming in (smaller R) → larger scale → larger A → more points needed.

The point count formula remains:

```
N = A / (Q² - 2Q + 1)
```

### Comparison

| Dimension | A (unit square in pixels)   |
| --------- | --------------------------- |
| 2D        | `H² × Z² / 4`               |
| 3D        | `H² / (4 × R² × tan²(θ/2))` |

Note: the 2D zoom `Z` is analogous to `1 / (R × tan(θ/2))` in 3D.
When `R × tan(θ/2) = 1` the 3D camera sees the same angular extent as
the 2D camera at `Z = 1`.
