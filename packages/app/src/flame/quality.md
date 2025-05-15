```
N = number of points
A = surface of unit square
B = surface of a bucket
Z = zoom

for Z = 1 A = height ^ 2 pixels
A(Z) = height^2 * Z^2 pixels
B = 1 pixels

P(point falls into a bucket) = B / A
E(bucket count) = N * B / A
V(bucket count) = N * p * (1 - p) ~= Np
Q = 1 - sqrt(Np) / Np

Q = 1 - sqrt(N * 1 / A) / (N * (1/A))
Q = 1 - sqrt(N / A) * A / N
Q^2 - 2Q + 1 = A / N

Number of points required for achieving quality Q:
N = A / (Q^2 - 2Q + 1)
```
