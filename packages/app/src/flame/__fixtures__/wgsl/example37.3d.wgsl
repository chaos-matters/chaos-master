@group(0) @binding(2) var<uniform> outputTextureDimension_1: vec2i;

@group(0) @binding(0) var<storage, read_write> pointRandomSeeds_1: array<vec2u>;

struct color {
  a: atomic<i32>,
  b: atomic<i32>,
}

struct AtomicBucket {
  count: atomic<u32>,
  z: atomic<i32>,
  color: color,
}

@group(0) @binding(4) var<storage, read_write> accumulationBuffer_1: array<AtomicBucket>;

fn hash(value: u32) -> u32 {
  {
    var x = (value ^ (value >> 17u));
    x *= 3982152891u;
    x ^= (x >> 11u);
    x *= 2890668881u;
    x ^= (x >> 15u);
    x *= 830770091u;
    x ^= (x >> 14u);
    return x;
  }
}

var<private> randomState: vec2u = vec2u();

fn setSeed(seed: vec2u) {
  randomState = seed;
}

struct Point3D {
  position: vec3f,
  color: vec2f,
}

@group(0) @binding(8) var<uniform> resetPoints: u32;

fn rotl(x: u32, k: u32) -> u32 {
  return ((x << k) | (x >> (32u - k)));
}

fn next() -> u32 {
  let s0 = randomState[0i];
  var s1 = randomState[1i];
  s1 ^= s0;
  randomState[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
  randomState[1i] = rotl(s1, 13u);
  return (rotl((s0 * 2654435771u), 5u) * 5u);
}

fn u32To01F32(value: u32) -> f32 {
  let mantissa = (value & 8388607u);
  let bits = (1065353216u | mantissa);
  let f = bitcast<f32>(bits);
  return (f - 1f);
}

fn random() -> f32 {
  return u32To01F32(next());
}

const PI: f32 = 3.141592653589793f;

fn randomUnitSphere() -> vec3f {
  let theta = ((random() * 2f) * PI);
  let phi = acos(((2f * random()) - 1f));
  return (1f * vec3f((sin(phi) * cos(theta)), (sin(phi) * sin(theta)), cos(phi)));
}

fn pointInitMode(_index: u32) -> vec3f {
  return randomUnitSphere();
}

fn colorInitMode(_arg_0: vec2f) -> vec2f {
  return vec2f();
}

struct AffineParams3D {
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
  i: f32,
  j: f32,
  k: f32,
  l: f32,
}

struct VariantUniformsBase3D {
  weight: f32,
}

struct FlameUniforms3D {
  probability: f32,
  preAffine: AffineParams3D,
  postAffine: AffineParams3D,
  color: vec2f,
  colorSpeed: f32,
  variation3d_galaxy_a_v0: VariantUniformsBase3D,
  variation3d_galaxy_a_v1: VariantUniformsBase3D,
}

struct FlameUniforms3D_1 {
  probability: f32,
  preAffine: AffineParams3D,
  postAffine: AffineParams3D,
  color: vec2f,
  colorSpeed: f32,
  variation3d_galaxy_b_v0: VariantUniformsBase3D,
  variation3d_galaxy_b_v1: VariantUniformsBase3D,
}

struct FlameUniforms3D_2 {
  probability: f32,
  preAffine: AffineParams3D,
  postAffine: AffineParams3D,
  color: vec2f,
  colorSpeed: f32,
  variation3d_galaxy_c_v0: VariantUniformsBase3D,
  variation3d_galaxy_c_v1: VariantUniformsBase3D,
}

struct FlameUniforms3D_3 {
  probability: f32,
  preAffine: AffineParams3D,
  postAffine: AffineParams3D,
  color: vec2f,
  colorSpeed: f32,
  variation3d_galaxy_d_v0: VariantUniformsBase3D,
}

struct FlameUniforms {
  flame3d_galaxy_a: FlameUniforms3D,
  flame3d_galaxy_b: FlameUniforms3D_1,
  flame3d_galaxy_c: FlameUniforms3D_2,
  flame3d_galaxy_d: FlameUniforms3D_3,
}

@group(0) @binding(1) var<storage, read> flameUniforms: FlameUniforms;

fn transformAffine3D(T: AffineParams3D, p: vec3f) -> vec3f {
  return vec3f(((((T.a * p.x) + (T.b * p.y)) + (T.c * p.z)) + T.d), ((((T.e * p.x) + (T.f * p.y)) + (T.g * p.z)) + T.h), ((((T.i * p.x) + (T.j * p.y)) + (T.k * p.z)) + T.l));
}

const EPS: f32 = 1e-6f;

struct VariationInfo3D {
  weight: f32,
  affineCoefs: AffineParams3D,
}

fn fn_1(pos: vec3f, _varInfo: VariationInfo3D) -> vec3f {
  let r = (length(pos) + EPS);
  let theta = atan2(pos.y, pos.x);
  let c = cos((theta + r));
  let s = sin((theta + r));
  return (vec3f(((pos.x * c) - (pos.y * s)), ((pos.x * s) + (pos.y * c)), pos.z) / r);
}

fn fn_2(pos: vec3f, _varInfo: VariationInfo3D) -> vec3f {
  let r2 = dot(pos, pos);
  let s2 = sin(r2);
  let c2 = cos(r2);
  return vec3f(((pos.x * c2) - (pos.y * s2)), ((pos.x * s2) + (pos.y * c2)), pos.z);
}

fn fnImpl(point: Point3D, uniforms: FlameUniforms3D) -> Point3D {
      let pre = transformAffine3D(uniforms.preAffine, point.position);
      var p = vec3f(0);
      p += uniforms.variation3d_galaxy_a_v0.weight * fn_1(pre, VariationInfo3D(uniforms.variation3d_galaxy_a_v0.weight, uniforms.preAffine));
      p += uniforms.variation3d_galaxy_a_v1.weight * fn_2(pre, VariationInfo3D(uniforms.variation3d_galaxy_a_v1.weight, uniforms.preAffine));
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  

fn fn_3(pos: vec3f, _varInfo: VariationInfo3D) -> vec3f {
  let r = length(pos);
  let rOrEps = select(r, EPS, (r < EPS));
  let theta = atan2(pos.y, pos.x);
  let phi = acos((pos.z / rOrEps));
  return vec3f((theta / PI), ((phi / (PI / 2f)) - 1f), (r - 1f));
}

fn fn_4(pos: vec3f, _varInfo: VariationInfo3D) -> vec3f {
  return pos;
}

fn fnImpl_1(point: Point3D, uniforms: FlameUniforms3D_1) -> Point3D {
      let pre = transformAffine3D(uniforms.preAffine, point.position);
      var p = vec3f(0);
      p += uniforms.variation3d_galaxy_b_v0.weight * fn_3(pre, VariationInfo3D(uniforms.variation3d_galaxy_b_v0.weight, uniforms.preAffine));
      p += uniforms.variation3d_galaxy_b_v1.weight * fn_4(pre, VariationInfo3D(uniforms.variation3d_galaxy_b_v1.weight, uniforms.preAffine));
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  

fn fn_5(_pos: vec3f, _varInfo: VariationInfo3D) -> vec3f {
  let r = ((((random() + random()) + random()) + random()) - 2f);
  return (randomUnitSphere() * r);
}

fn fnImpl_2(point: Point3D, uniforms: FlameUniforms3D_2) -> Point3D {
      let pre = transformAffine3D(uniforms.preAffine, point.position);
      var p = vec3f(0);
      p += uniforms.variation3d_galaxy_c_v0.weight * fn_1(pre, VariationInfo3D(uniforms.variation3d_galaxy_c_v0.weight, uniforms.preAffine));
      p += uniforms.variation3d_galaxy_c_v1.weight * fn_5(pre, VariationInfo3D(uniforms.variation3d_galaxy_c_v1.weight, uniforms.preAffine));
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  

fn fnImpl_3(point: Point3D, uniforms: FlameUniforms3D_3) -> Point3D {
      let pre = transformAffine3D(uniforms.preAffine, point.position);
      var p = vec3f(0);
      p += uniforms.variation3d_galaxy_d_v0.weight * fn_5(pre, VariationInfo3D(uniforms.variation3d_galaxy_d_v0.weight, uniforms.preAffine));
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  

fn executeRandomFlame(point: Point3D) -> Point3D {
        let flameIndex = random();
        var probabilitySum = f32(0);
        {
            let flameUniforms = flameUniforms.flame3d_galaxy_a;
            probabilitySum += flameUniforms.probability;
            if (flameIndex < probabilitySum) {
              return fnImpl(point, flameUniforms);
            }
          }
{
            let flameUniforms = flameUniforms.flame3d_galaxy_b;
            probabilitySum += flameUniforms.probability;
            if (flameIndex < probabilitySum) {
              return fnImpl_1(point, flameUniforms);
            }
          }
{
            let flameUniforms = flameUniforms.flame3d_galaxy_c;
            probabilitySum += flameUniforms.probability;
            if (flameIndex < probabilitySum) {
              return fnImpl_2(point, flameUniforms);
            }
          }
{
            let flameUniforms = flameUniforms.flame3d_galaxy_d;
            probabilitySum += flameUniforms.probability;
            if (flameIndex < probabilitySum) {
              return fnImpl_3(point, flameUniforms);
            }
          }
        return point;
      }
    

@group(0) @binding(6) var<storage, read_write> pointPositions: array<vec4f>;

@group(0) @binding(7) var<storage, read_write> pointColors: array<vec2f>;

@group(0) @binding(5) var<uniform> stochasticFilterRadius: f32;

@group(0) @binding(3) var<uniform> finalTransform: AffineParams3D;

struct Camera3DUniforms {
  viewProjectionMatrix: mat4x4f,
  resolution: vec2f,
  pixelRatio: f32,
  focusDistance: f32,
}

@group(1) @binding(0) var<uniform> camera3DUniforms_1: Camera3DUniforms;

fn camera3DWorldToClip(world: vec3f) -> vec3f {
  let camera3DUniforms = (&camera3DUniforms_1);
  let clip4 = ((*camera3DUniforms).viewProjectionMatrix * vec4f(world, 1f));
  if ((clip4.w <= 0f)) {
    return vec3f(10000000000);
  }
  return vec3f((clip4.x / clip4.w), (clip4.y / clip4.w), (clip4.w - (*camera3DUniforms).focusDistance));
}

fn mitchellNetravali(x: f32) -> f32 {
    let ax = abs(x);
    if (ax < 1.0) {
      return (7.0 * ax * ax * ax - 12.0 * ax * ax + 16.0 / 3.0) / 6.0;
    } else if (ax < 2.0) {
      return (-7.0 / 3.0 * ax * ax * ax + 12.0 * ax * ax - 20.0 * ax + 32.0 / 3.0) / 6.0;
    }
    return 0.0;
  }


@compute @workgroup_size(64, 1, 1) fn ifsCompute(@builtin(num_workgroups) numWorkgroups: vec3u, @builtin(workgroup_id) workgroupId: vec3u, @builtin(local_invocation_index) localInvocationIndex: u32) {
  let outputTextureDimension = (&outputTextureDimension_1);
  let pointRandomSeeds = (&pointRandomSeeds_1);
  let accumulationBuffer = (&accumulationBuffer_1);
  let workgroupIndex = ((workgroupId.x + (workgroupId.y * numWorkgroups.x)) + ((workgroupId.z * numWorkgroups.x) * numWorkgroups.y));
  let pointIndex = ((workgroupIndex * 64u) + localInvocationIndex);
  if ((pointIndex >= arrayLength(pointRandomSeeds))) {
    return;
  }
  let pointSeed = (&(*pointRandomSeeds)[pointIndex]);
  let seed = ((*pointSeed) + hash(pointIndex));
  setSeed(seed);
  var point = Point3D();
  if ((resetPoints > 0u)) {
    point.position = pointInitMode(pointIndex);
    point.color = colorInitMode(point.position.xy);
    for (var i = 0; (i < 20i); i += 1i) {
      point = executeRandomFlame(point);
    }
  }
  else {
    point.position = pointPositions[pointIndex].xyz;
    point.color = pointColors[pointIndex];
  }
  let outputTextureDimensionF = vec2f((*outputTextureDimension));
  let filterRadius = stochasticFilterRadius;
  for (var plot = 0; (plot < 16i); plot += 1i) {
    point = executeRandomFlame(point);
    let plotPos = transformAffine3D(finalTransform, point.position);
    let clip = camera3DWorldToClip(plotPos);
    let screen = (outputTextureDimensionF * ((clip.xy * vec2f(0.5, -0.5)) + 0.5f));
    if ((filterRadius > 0f)) {
      let offsetX = ((random() - 0.5f) * (filterRadius * 4f));
      let offsetY = ((random() - 0.5f) * (filterRadius * 4f));
      let wx = mitchellNetravali((offsetX / filterRadius));
      let wy = mitchellNetravali((offsetY / filterRadius));
      let accumWeight = max(((wx * wy) * 16f), 0f);
      let finalScreen = (screen + vec2f(offsetX, offsetY));
      let oob = ((((((finalScreen.x < 0f) || (finalScreen.y < 0f)) || (finalScreen.x > outputTextureDimensionF.x)) || (finalScreen.y > outputTextureDimensionF.y)) || (finalScreen.x != finalScreen.x)) || (finalScreen.y != finalScreen.y));
      if (!(oob)) {
        let screenI = vec2i(finalScreen);
        let pixelIndex = ((screenI.y * (*outputTextureDimension).x) + screenI.x);
        const fixed_m = 1000;
        let fixedWeight = u32((accumWeight * f32(fixed_m)));
        if ((atomicLoad(&(*accumulationBuffer)[pixelIndex].count) < 536870912u)) {
          atomicAdd(&(*accumulationBuffer)[pixelIndex].count, fixedWeight);
          atomicAdd(&(*accumulationBuffer)[pixelIndex].z, i32((clip.z * f32(fixedWeight))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.a, i32((point.color.x * f32(fixedWeight))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.b, i32((point.color.y * f32(fixedWeight))));
        }
      }
    }
    else {
      let jittered = (screen + pointInitMode(pointIndex).xy);
      let oob = ((((((jittered.x < 0f) || (jittered.y < 0f)) || (jittered.x > outputTextureDimensionF.x)) || (jittered.y > outputTextureDimensionF.y)) || (jittered.x != jittered.x)) || (jittered.y != jittered.y));
      if (!(oob)) {
        let screenI = vec2i(jittered);
        let pixelIndex = ((screenI.y * (*outputTextureDimension).x) + screenI.x);
        const fixed_m = 1000;
        if ((atomicLoad(&(*accumulationBuffer)[pixelIndex].count) < 536870912u)) {
          atomicAdd(&(*accumulationBuffer)[pixelIndex].count, u32((1i * fixed_m)));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].z, i32((clip.z * f32(fixed_m))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.a, i32((point.color.x * f32(fixed_m))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.b, i32((point.color.y * f32(fixed_m))));
        }
      }
    }
  }
  pointPositions[pointIndex] = vec4f(point.position, 0f);
  pointColors[pointIndex] = point.color;
  pointRandomSeeds_1[pointIndex] = randomState;
}