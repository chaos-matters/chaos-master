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

struct Point {
  position: vec2f,
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

fn pointInitMode(_index: u32) -> vec2f {
  let r = sqrt(random());
  let theta = ((random() * 2f) * PI);
  return (r * vec2f(cos(theta), sin(theta)));
}

fn colorInitMode(_arg_0: vec2f) -> vec2f {
  return vec2f();
}

struct AffineParams {
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
}

struct JuliaScopeParams {
  power: f32,
  dist: f32,
}

struct VariationUniforms_juliaScopeVar {
  weight: f32,
  params: JuliaScopeParams,
}

struct FlameUniforms_1 {
  probability: f32,
  preAffine: AffineParams,
  postAffine: AffineParams,
  color: vec2f,
  colorSpeed: f32,
  variation5c4a50b4_9b04_4105_aacb_7d455ac00dc2: VariationUniforms_juliaScopeVar,
}

struct VariationUniforms_juliaScopeVar_1 {
  weight: f32,
  params: JuliaScopeParams,
}

struct FlameUniforms_2 {
  probability: f32,
  preAffine: AffineParams,
  postAffine: AffineParams,
  color: vec2f,
  colorSpeed: f32,
  variation6f0d8526_b8a7_4b0a_a06f_f829ded35840: VariationUniforms_juliaScopeVar_1,
}

struct FlameUniforms {
  flamebfa7d299_b9d5_4a27_ba63_e578c4d13e84: FlameUniforms_1,
  flameda4634e6_3ecc_4063_923d_1e22a297d7a6: FlameUniforms_2,
}

@group(0) @binding(1) var<storage, read> flameUniforms: FlameUniforms;

fn transformAffine(T: AffineParams, p: vec2f) -> vec2f {
  return vec2f((((T.a * p.x) + (T.b * p.y)) + T.c), (((T.d * p.x) + (T.e * p.y)) + T.f));
}

struct VariationInfo {
  weight: f32,
  affineCoefs: AffineParams,
}

fn juliaScopeVar(pos: vec2f, varInfo: VariationInfo, P: JuliaScopeParams) -> vec2f {
  let p1 = P.power;
  let p2 = P.dist;
  let p3 = trunc((abs(p1) * random()));
  let r = length(pos);
  let phi = atan2(pos.y, pos.x);
  let lambda = select(-1f, 1f, (random() > 0.5f));
  let t = (((lambda * phi) + ((2f * PI) * p3)) / p1);
  let factor = pow(r, (p2 / p1));
  return ((vec2f(cos(t), sin(t)) * factor) * varInfo.weight);
}

fn fnImpl(point: Point, uniforms: FlameUniforms_1) -> Point {
      let pre = transformAffine(uniforms.preAffine, point.position);
      var p = vec2f(0.0);
      
            p += juliaScopeVar(pre, VariationInfo(uniforms.variation5c4a50b4_9b04_4105_aacb_7d455ac00dc2.weight, uniforms.preAffine), uniforms.variation5c4a50b4_9b04_4105_aacb_7d455ac00dc2.params);
      p = transformAffine(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point(p, color);
    }
  

fn fnImpl_1(point: Point, uniforms: FlameUniforms_2) -> Point {
      let pre = transformAffine(uniforms.preAffine, point.position);
      var p = vec2f(0.0);
      
            p += juliaScopeVar(pre, VariationInfo(uniforms.variation6f0d8526_b8a7_4b0a_a06f_f829ded35840.weight, uniforms.preAffine), uniforms.variation6f0d8526_b8a7_4b0a_a06f_f829ded35840.params);
      p = transformAffine(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point(p, color);
    }
  

fn executeRandomFlame(point: Point) -> Point {
          let flameIndex = random();
          var probabilitySum = f32(0);
          {
              let flameUniforms = flameUniforms.flamebfa7d299_b9d5_4a27_ba63_e578c4d13e84;
              probabilitySum += flameUniforms.probability;
              if (flameIndex < probabilitySum) {
                return fnImpl(point, flameUniforms);
              }
            }
{
              let flameUniforms = flameUniforms.flameda4634e6_3ecc_4063_923d_1e22a297d7a6;
              probabilitySum += flameUniforms.probability;
              if (flameIndex < probabilitySum) {
                return fnImpl_1(point, flameUniforms);
              }
            }
          return point;
        }
      

@group(0) @binding(6) var<storage, read_write> pointPositions: array<vec4f>;

@group(0) @binding(7) var<storage, read_write> pointColors: array<vec2f>;

@group(0) @binding(5) var<uniform> stochasticFilterRadius: f32;

@group(0) @binding(3) var<uniform> finalTransform: AffineParams;

struct Camera2DUniforms {
  viewMatrix: mat3x3f,
  viewMatrixInverse: mat3x3f,
  resolution: vec2f,
  pixelRatio: f32,
}

@group(1) @binding(0) var<uniform> camera2DUniforms_1: Camera2DUniforms;

fn camera2DWorldToClip(world: vec2f) -> vec2f {
  let camera2DUniforms = (&camera2DUniforms_1);
  let clip = ((*camera2DUniforms).viewMatrix * vec3f(world, 1f));
  return (clip.xy / clip.z);
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
  var point = Point();
  if ((resetPoints > 0u)) {
    point.position = pointInitMode(pointIndex);
    point.color = colorInitMode(point.position);
    for (var i = 0; (i < 20i); i += 1i) {
      point = executeRandomFlame(point);
    }
  }
  else {
    point.position = pointPositions[pointIndex].xy;
    point.color = pointColors[pointIndex];
  }
  let outputTextureDimensionF = vec2f((*outputTextureDimension));
  let filterRadius = stochasticFilterRadius;
  for (var plot = 0; (plot < 16i); plot += 1i) {
    point = executeRandomFlame(point);
    let plotPos = transformAffine(finalTransform, point.position);
    let clip = camera2DWorldToClip(plotPos);
    let screen = (outputTextureDimensionF * ((clip * vec2f(0.5, -0.5)) + 0.5f));
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
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.a, i32((point.color.x * f32(fixedWeight))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.b, i32((point.color.y * f32(fixedWeight))));
        }
      }
    }
    else {
      let jittered = (screen + pointInitMode(pointIndex));
      let oob = ((((((jittered.x < 0f) || (jittered.y < 0f)) || (jittered.x > outputTextureDimensionF.x)) || (jittered.y > outputTextureDimensionF.y)) || (jittered.x != jittered.x)) || (jittered.y != jittered.y));
      if (!(oob)) {
        let screenI = vec2i(jittered);
        let pixelIndex = ((screenI.y * (*outputTextureDimension).x) + screenI.x);
        const fixed_m = 1000;
        if ((atomicLoad(&(*accumulationBuffer)[pixelIndex].count) < 536870912u)) {
          atomicAdd(&(*accumulationBuffer)[pixelIndex].count, u32((1i * fixed_m)));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.a, i32((point.color.x * f32(fixed_m))));
          atomicAdd(&(*accumulationBuffer)[pixelIndex].color.b, i32((point.color.y * f32(fixed_m))));
        }
      }
    }
  }
  pointPositions[pointIndex] = vec4f(point.position, 0f, 0f);
  pointColors[pointIndex] = point.color;
  pointRandomSeeds_1[pointIndex] = randomState;
}