use blockwild_types::{hash2, hash3};

#[inline]
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

#[inline]
fn fade(t: f64) -> f64 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

pub(crate) fn smoothstep(edge0: f64, edge1: f64, value: f64) -> f64 {
    let t = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

pub(crate) fn value_noise_2(x: f64, z: f64, seed: u32) -> f64 {
    let x0 = x.floor() as i32;
    let z0 = z.floor() as i32;
    let tx = fade(x - f64::from(x0));
    let tz = fade(z - f64::from(z0));
    let a = lerp(hash2(x0, z0, seed), hash2(x0.wrapping_add(1), z0, seed), tx);
    let b = lerp(
        hash2(x0, z0.wrapping_add(1), seed),
        hash2(x0.wrapping_add(1), z0.wrapping_add(1), seed),
        tx,
    );
    lerp(a, b, tz) * 2.0 - 1.0
}

pub(crate) fn value_noise_3(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let z0 = z.floor() as i32;
    let tx = fade(x - f64::from(x0));
    let ty = fade(y - f64::from(y0));
    let tz = fade(z - f64::from(z0));
    let at = |dx: i32, dy: i32, dz: i32| {
        hash3(x0.wrapping_add(dx), y0.wrapping_add(dy), z0.wrapping_add(dz), seed) * 2.0 - 1.0
    };
    let x00 = lerp(at(0, 0, 0), at(1, 0, 0), tx);
    let x10 = lerp(at(0, 1, 0), at(1, 1, 0), tx);
    let x01 = lerp(at(0, 0, 1), at(1, 0, 1), tx);
    let x11 = lerp(at(0, 1, 1), at(1, 1, 1), tx);
    lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz)
}

pub(crate) fn fbm_2(x: f64, z: f64, seed: u32, mut frequency: f64, octaves: usize) -> f64 {
    let mut value = 0.0;
    let mut amplitude = 0.55;
    let mut total = 0.0;
    for octave in 0..octaves {
        value += value_noise_2(x * frequency, z * frequency, seed.wrapping_add(octave as u32 * 977)) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    value / total
}

pub(crate) fn continent_offset(value: f64) -> f64 {
    const POINTS: [(f64, f64); 10] = [
        (-1.0, -24.0),
        (-0.62, -17.0),
        (-0.42, -11.0),
        (-0.25, -6.0),
        (-0.12, -2.0),
        (-0.03, 1.0),
        (0.2, 7.0),
        (0.45, 15.0),
        (0.7, 25.0),
        (1.0, 34.0),
    ];
    for pair in POINTS.windows(2) {
        let (a, ay) = pair[0];
        let (b, by) = pair[1];
        if value <= b {
            return lerp(ay, by, smoothstep(a, b, value));
        }
    }
    POINTS[POINTS.len() - 1].1
}

pub(crate) fn mix(a: f64, b: f64, t: f64) -> f64 {
    lerp(a, b, t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noise_is_deterministic_across_negative_space() {
        assert_eq!(
            value_noise_2(-7.25, 19.5, 17).to_bits(),
            value_noise_2(-7.25, 19.5, 17).to_bits()
        );
        assert_ne!(
            fbm_2(-100.0, 200.0, 91, 1.0 / 420.0, 3),
            fbm_2(-100.0, 201.0, 91, 1.0 / 420.0, 3)
        );
    }
}
