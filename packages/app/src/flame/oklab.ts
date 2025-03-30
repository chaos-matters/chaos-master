import { tgpu } from 'typegpu'
import { f32, struct, vec3f } from 'typegpu/data'

const cbrt = tgpu['~unstable']
  .fn([f32], f32)
  .does(/* wgsl */ `(x: f32) -> f32 { return pow(x, 1./3); }`)

export const oklab2rgb = tgpu['~unstable'].fn([vec3f], vec3f).does(/* wgsl */ `
  (oklab: vec3f) -> vec3f {
    let l_ = oklab.x + 0.3963377774 * oklab.y + 0.2158037573 * oklab.z;
    let m_ = oklab.x - 0.1055613458 * oklab.y - 0.0638541728 * oklab.z;
    let s_ = oklab.x - 0.0894841775 * oklab.y - 1.2914855480 * oklab.z;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    return vec3f(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
  }`)

export const rgb2oklab = tgpu['~unstable']
  .fn([vec3f], vec3f)
  .does(
    /* wgsl */ `
    (rgb: vec3f) -> vec3f {
      let l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
      let m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
      let s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

      let l_ = cbrt(l);
      let m_ = cbrt(m);
      let s_ = cbrt(s);

      return vec3f(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
      );
    }`,
  )
  .$uses({ cbrt })

export const oklch2oklab = tgpu['~unstable'].fn([vec3f], vec3f)
  .does(/* wgsl */ `
    (oklch: vec3f) -> vec3f {
      let L = oklch.x;
      let c = oklch.y;
      let h = oklch.z;
      let a = c * cos(h);
      let b = c * sin(h);
      return vec3f(L, a, b);
    }`)

export const oklch2rgb = tgpu['~unstable']
  .fn([vec3f], vec3f)
  .does(
    /* wgsl */ `
      (oklch: vec3f) -> vec3f {
        return oklab2rgb(oklch2oklab(oklch));
      }`,
  )
  .$uses({ oklch2oklab, oklab2rgb })

const computeMaxSaturation = tgpu['~unstable'].fn([f32, f32], f32)
  .does(/* wgsl */ `
  (a: f32, b: f32) -> f32 {
    // Max saturation will be when one of r, g or b goes below zero.

    // Select different coefficients depending on which component goes below zero first
    var k0 = 0.;
    var k1 = 0.;
    var k2 = 0.;
    var k3 = 0.;
    var k4 = 0.;
    var wl = 0.;
    var wm = 0.;
    var ws = 0.;

    if (-1.88170328 * a - 0.80936493 * b > 1)
    {
        // Red component
        k0 = 1.19086277; k1 = 1.76576728; k2 = 0.59662641; k3 = 0.75515197; k4 = 0.56771245;
        wl = 4.0767416621; wm = -3.3077115913; ws = 0.2309699292;
    }
    else if (1.81444104 * a - 1.19445276 * b > 1)
    {
        // Green component
        k0 =  0.73956515; k1 = -0.45954404; k2 = 0.08285427; k3 = 0.12541070; k4 = 0.14503204;
        wl = -1.2684380046; wm = 2.6097574011; ws = -0.3413193965;
    }
    else
    {
        // Blue component
        k0 =  1.35733652; k1 = -0.00915799; k2 = -1.15130210; k3 = -0.50559606; k4 = 0.00692167;
        wl = -0.0041960863; wm = -0.7034186147; ws = 1.7076147010;
    }

    // Approximate max saturation using a polynomial:
    var S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;

    // Do one step Halley's method to get closer
    // this gives an error less than 10e6, except for some blue hues where the dS/dh is close to infinite
    // this should be sufficient for most applications, otherwise do two/three steps 

    let k_l =  0.3963377774 * a + 0.2158037573 * b;
    let k_m = -0.1055613458 * a - 0.0638541728 * b;
    let k_s = -0.0894841775 * a - 1.2914855480 * b;

    {
        let l_ = 1 + S * k_l;
        let m_ = 1 + S * k_m;
        let s_ = 1 + S * k_s;

        let l = l_ * l_ * l_;
        let m = m_ * m_ * m_;
        let s = s_ * s_ * s_;

        let l_dS = 3 * k_l * l_ * l_;
        let m_dS = 3 * k_m * m_ * m_;
        let s_dS = 3 * k_s * s_ * s_;

        let l_dS2 = 6 * k_l * k_l * l_;
        let m_dS2 = 6 * k_m * k_m * m_;
        let s_dS2 = 6 * k_s * k_s * s_;

        let f  = wl * l     + wm * m     + ws * s;
        let f1 = wl * l_dS  + wm * m_dS  + ws * s_dS;
        let f2 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;

        S = S - f * f1 / (f1*f1 - 0.5f * f * f2);
    }

    return S;
  }`)

const LC = struct({
  L: f32,
  C: f32,
})

const findCusp = tgpu['~unstable']
  .fn([f32, f32], LC)
  .does(
    /* wgsl */ `
    (a: f32, b: f32) -> LC {
      // First, find the maximum saturation (saturation S = C/L)
      let S_cusp = computeMaxSaturation(a, b);

      // Convert to linear sRGB to find the first point where at least one of r,g or b >= 1:
      let rgb_at_max = oklab2rgb(vec3f(1, S_cusp * a, S_cusp * b));
      let L_cusp = cbrt(1 / max(max(rgb_at_max.r, rgb_at_max.g), rgb_at_max.b));
      let C_cusp = L_cusp * S_cusp;

      return LC(L_cusp , C_cusp);
    }`,
  )
  .$uses({ computeMaxSaturation, oklab2rgb, cbrt })

const findGamutIntersection = tgpu['~unstable']
  .fn([f32, f32, f32, f32, f32], f32)
  .does(
    /* wgsl */ `
    (a: f32, b: f32, L1: f32, C1: f32, L0: f32) -> f32 {
      const FLT_MAX = 3.40282346e+38;

      // Find the cusp of the gamut triangle
      let cusp = findCusp(a, b);

      // Find the intersection for upper and lower half seprately
      var t = 0.;
      if (((L1 - L0) * cusp.C - (cusp.L - L0) * C1) <= 0)
      {
        // Lower half

        t = cusp.C * L0 / (C1 * cusp.L + cusp.C * (L0 - L1));
      }
      else
      {
        // Upper half

        // First intersect with triangle
        t = cusp.C * (L0 - 1) / (C1 * (cusp.L - 1) + cusp.C * (L0 - L1));

        // Then one step Halley's method
        {
          let dL = L1 - L0;
          let dC = C1;

          let k_l =  0.3963377774 * a + 0.2158037573 * b;
          let k_m = -0.1055613458 * a - 0.0638541728 * b;
          let k_s = -0.0894841775 * a - 1.2914855480 * b;

          let l_dt = dL + dC * k_l;
          let m_dt = dL + dC * k_m;
          let s_dt = dL + dC * k_s;

          
          // If higher accuracy is required, 2 or 3 iterations of the following block can be used:
          {
            let L = L0 * (1 - t) + t * L1;
            let C = t * C1;

            let l_ = L + C * k_l;
            let m_ = L + C * k_m;
            let s_ = L + C * k_s;

            let l = l_ * l_ * l_;
            let m = m_ * m_ * m_;
            let s = s_ * s_ * s_;

            let ldt = 3 * l_dt * l_ * l_;
            let mdt = 3 * m_dt * m_ * m_;
            let sdt = 3 * s_dt * s_ * s_;

            let ldt2 = 6 * l_dt * l_dt * l_;
            let mdt2 = 6 * m_dt * m_dt * m_;
            let sdt2 = 6 * s_dt * s_dt * s_;

            let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
            let r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
            let r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;

            let u_r = r1 / (r1 * r1 - 0.5 * r * r2);
            var t_r = -r * u_r;

            let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
            let g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
            let g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;

            let u_g = g1 / (g1 * g1 - 0.5 * g * g2);
            var t_g = -g * u_g;

            let b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s - 1;
            let b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.7076147010 * sdt;
            let b2 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.7076147010 * sdt2;

            let u_b = b1 / (b1 * b1 - 0.5 * b * b2);
            var t_b = -b * u_b;

            t_r = select(FLT_MAX, t_r, u_r >= 0);
            t_g = select(FLT_MAX, t_g, u_g >= 0);
            t_b = select(FLT_MAX, t_b, u_b >= 0);

            t += min(t_r, min(t_g, t_b));
          }
        }
      }

      return t;
    }`,
  )
  .$uses({ findCusp })

export const gamutClipPreserveChroma = tgpu['~unstable']
  .fn([vec3f], vec3f)
  .does(
    /* wgsl */ `
    (lab: vec3f) -> vec3f {
      let L = lab.x;
      const eps = 0.00001;
      let C = max(eps, length(lab.yz));
      let ab_ = lab.yz / C;
      let L0 = clamp(L, 0, 1);
      let t = findGamutIntersection(ab_.x, ab_.y, L, C, L0);
      let L_clipped = min(L, mix(L0, L, t));
      let C_clipped = min(C, t * C);
      return oklab2rgb(vec3f(L_clipped, C_clipped * ab_));
    }
  `,
  )
  .$uses({ oklab2rgb, findGamutIntersection })
