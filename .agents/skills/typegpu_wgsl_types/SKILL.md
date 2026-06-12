---
name: typegpu-wgsl-types
description: "Rules for TypeGPU and WGSL data schemas, type conversions, and avoiding implicit casting warnings."
---

# TypeGPU and WGSL Type Rules

When working with TypeGPU and WGSL in this repository, strict typing rules apply. Follow these guidelines to avoid shader compilation errors and implicit conversion warnings.

## 1. Type Conversion (`f32` vs `i32`)
WGSL does **not** support implicit conversion between concrete numeric types (e.g., you cannot directly assign an `i32` to an `f32` or add them together).

- **Literal Floats:** Always use `.0` for float literals. e.g., use `2.0` instead of `2`. Bare integers like `2` or `0` can be interpreted as `i32`, which leads to implicit conversion warnings when used in `f32` contexts.
- **Explicit Casting:** Use `f32(value)` or `i32(value)` for explicit conversions.
  - In TypeGPU, import `f32` or `i32` from `'typegpu/data'` and use it like a function: `f32(myVariable)`.
- **Zeros:** Always use `0.0` instead of `0`. E.g., `vec2f(0.0)` instead of `vec2f(0)`.

## 2. No Ternary Operators (for runtime values)
WGSL does **not** have a `? :` ternary operator. While TypeGPU attempts to resolve ternaries, it only supports them for comptime-known checks.
If you use a ternary operator for runtime values, you will get the error:
`Ternary operator is only supported for comptime-known checks ... For runtime checks, please use 'std.select' or if/else statements.`

Inside `'use gpu'` blocks, you have two options for runtime branching:

**Option 1: Standard `if / else` (Preferred for readability and complex logic)**
TypeGPU correctly parses standard TypeScript `if` and `else` blocks into WGSL branching.
```typescript
let result = falseValue
if (condition) {
  result = trueValue
}
```

**Option 2: `select` function**
Use the `select` function from `'typegpu/std'`.
```typescript
import { select } from 'typegpu/std';
// Note the order: select(false_value, true_value, condition)
const result = select(falseValue, trueValue, condition);
```

## 3. Data Schemas
TypeGPU provides data schemas like `d.u32`, `d.vec3f`, `d.i32`, `d.f32` that help marshal data between JS/TS and WGSL.
- Use these schemas to define buffer structures and function signatures.
- Calling the schema as a function acts as a type constructor/caster: `f32(31.1)` returns `31`. Wait, no, `u32(31.1)` returns `31`. `f32(true)` returns `1.0`.

## 4. `select` with bare literals
When using `select(0, 1, condition)`, TypeGPU may infer the return type as `i32` because `0` and `1` are integers.
- Always use explicit floats if you want an `f32` return type: `select(0.0, 1.0, condition)`.

## 5. Constant Declarations
If you declare `const z = 0.0`, TypeGPU might still treat `z` as an `i32` literal if context allows it, causing a `(z * z): i32` warning. 
- Fix: Wrap the declaration in an explicit cast: `const z = f32(0.0)`.
