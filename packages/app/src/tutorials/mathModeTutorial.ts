import type { TutorialPage } from '@/components/TutorialModal/TutorialModal'

export const mathModeTutorial: { title: string; pages: TutorialPage[] } = {
  title: 'MathJAX Math Mode',
  pages: [
    {
      title: 'What is Math Mode?',
      content: String.raw`Math mode lets you write flame variation functions using **LaTeX-like mathematical notation** instead of WGSL shader code. The notation you write is translated to WGSL automatically and rendered as beautiful typeset math for verification.

This means you can express transformations using familiar math syntax like:

$$r = \sqrt{x^2 + y^2}$$

...instead of writing \`let r = length(pos);\` in WGSL.

:::tip
Math mode is completely optional — you can always switch back to the **WGSL** tab to write shader code directly.
:::

:::info
The live preview panel on the right renders your equations using MathJAX so you can verify your math is correct before compiling.
:::`,
    },
    {
      title: 'Variables',
      content: String.raw`These variables are available in every math expression:

| Variable | Meaning | WGSL Equivalent |
|----------|---------|-----------------|
| \`r\` | Distance from origin | \`length(pos)\` |
| \`\theta\` | Angle from +x axis | \`atan2(pos.y, pos.x)\` |
| \`p_x\` | X component of input point | \`pos.x\` |
| \`p_y\` | Y component of input point | \`pos.y\` |
| \`w\` | Variation weight | \`varInfo.weight\` |

Variables can be **re-assigned** to transform the point:

$$r = \sqrt{x^2 + y^2}$$
$$\theta = \arctan2(p_y, p_x)$$
$$\theta = \theta + r \cdot 0.5$$

The final position is calculated from the final values of \`r\`, \`\theta\`, \`p_x\`, and \`p_y\`.

:::note
If you don't assign to \`r\` or \`\theta\`, polar coordinates are not used. If you don't assign to \`p_x\` or \`p_y\`, the input point passes through unchanged.
:::`,
    },
    {
      title: 'Trigonometric Functions',
      content: String.raw`All standard trigonometric functions are available:

| Function | Description |
|----------|-------------|
| \`\sin(x)\` | Sine |
| \`\cos(x)\` | Cosine |
| \`\tan(x)\` | Tangent |
| \`\arcsin(x)\` | Inverse sine |
| \`\arccos(x)\` | Inverse cosine |
| \`\arctan(x)\` | Inverse tangent |
| \`\arctan2(y, x)\` | Two-argument arctangent |
| \`\sinh(x)\` | Hyperbolic sine |
| \`\cosh(x)\` | Hyperbolic cosine |
| \`\tanh(x)\` | Hyperbolic tangent |

:::tip
Use \`\arctan2(p_y, p_x)\` to get the angle of a point — this is more robust than \`\arctan(p_y / p_x)\` because it handles all quadrants correctly and avoids division by zero.
:::`,
    },
    {
      title: 'Exponential & Logarithmic',
      content: String.raw`Exponential and logarithmic functions:

| Function | Description |
|----------|-------------|
| \`\exp(x)\` | Exponential \\(e^x\\) |
| \`\ln(x)\` | Natural logarithm |
| \`\log(x)\` | Natural logarithm (same as \`\ln\`) |

Power and root functions:

| Function | Description |
|----------|-------------|
| \`\sqrt{x}\` | Square root |
| \`\sqrt[n]{x}\` | Nth root |
| \`x^y\` | Power \\(x^y\\) |

:::warn
\`\ln\` and \`\log\` both map to WGSL \`log()\` (natural log). There is **no base-10 logarithm** in WGSL.
:::

Examples:

$$r = \sqrt{x^2 + y^2}$$
$$r = r^w$$
$$r = \ln(r + 1)$$`,
    },
    {
      title: 'Utility Functions',
      content: String.raw`These utility functions help with clamping, interpolation, and comparisons:

| Function | Description |
|----------|-------------|
| \`\min(a, b)\` | Minimum of two values |
| \`\max(a, b)\` | Maximum of two values |
| \`\clamp(x, lo, hi)\` | Clamp x between lo and hi |
| \`\mix(a, b, t)\` | Linear interpolation from a to b |
| \`\step(edge, x)\` | Step function: 1 if x ≥ edge, else 0 |
| \`\smoothstep(e0, e1, x)\` | Smooth Hermite interpolation |
| \`\mod(a, b)\` | Floating-point modulo |
| \`\sign(x)\` | Sign of x (-1, 0, or 1) |
| \`\|x\|\` or \`\lvert x \rvert\` | Absolute value |
| \`\frac{a}{b}\` | Division |
| \`a \cdot b\` | Multiplication |
| \`a \times b\` | Multiplication (alternative) |

:::tip
Use \`\mix(a, b, w)\` to blend between two transformations based on variation weight.
:::`,
    },
    {
      title: 'Examples',
      content: String.raw`Here are some complete examples that demonstrate common patterns:

**Polar Ripple** — creates rippling waves radiating from the center:

$$r = \sqrt{x^2 + y^2}$$
$$r = r + \sin(r \cdot 8) \cdot w$$

**Spiral** — twists points around the origin:

$$r = \sqrt{x^2 + y^2}$$
$$\theta = \arctan2(p_y, p_x)$$
$$\theta = \theta + r \cdot 0.5$$

**Wave** — displaces points along the x-axis:

$$p_x = p_x + \sin(p_y \cdot 5) \cdot w$$

**Power Curve** — applies an exponential radius transform:

$$r = \sqrt{x^2 + y^2}$$
$$r = r^w$$

:::tip
Click any example name in the sidebar to load it into the editor. Your current work will be replaced, so save first if needed.
:::`,
    },
  ],
}
