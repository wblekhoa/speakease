//! Echo detector for meeting recording (rule SE-MEET-025, work order 1A of
//! `ai-memory/plans/meeting-live-help.md`): without headphones the microphone
//! also hears the meeting app, so the other side's words land on the "Me"
//! track. This module compares the *sound* of the two tracks (not their
//! loudness) and says which stretches of the microphone are the app's sound.
//! Pure functions: no I/O, no clock, no threads, nothing calls it yet.

// Nothing calls this module yet (work orders 1B-1D wire it in).
#![allow(dead_code)]

/// Both tracks are compared at 1 kHz: one low sample is the mean of 16
/// samples of the 16 kHz track.
pub const STEP: usize = 16;

/// A stretch whose mean square is below this has no sound (SE-MEET-025).
const QUIET: f32 = 1e-6;
/// How far either way, in low samples (ms), the tracks' clocks may differ.
const LAG: i64 = 500;
/// A comparison window is 1 s of low samples.
const WINDOW: usize = 1000;
/// Windows start every half second.
const HOP: usize = 500;
/// A window is echo when its likeness is at least this (SE-MEET-025).
const FOLLOWS: f32 = 0.75;

// SE-MEET-025
/// A 16 kHz track at 1 kHz (whole groups of `STEP` samples only).
pub fn low(samples: &[f32]) -> Vec<f32> {
    samples
        .chunks_exact(STEP)
        .map(|group| group.iter().sum::<f32>() / STEP as f32)
        .collect()
}

/// Dot product with eight independent sums so the compiler can vectorise it.
fn dot(a: &[f32], b: &[f32]) -> f32 {
    let mut lanes = [0.0f32; 8];
    let mut ca = a.chunks_exact(8);
    let mut cb = b.chunks_exact(8);
    for (x, y) in (&mut ca).zip(&mut cb) {
        for i in 0..8 {
            lanes[i] += x[i] * y[i];
        }
    }
    let tail: f32 = ca
        .remainder()
        .iter()
        .zip(cb.remainder())
        .map(|(x, y)| x * y)
        .sum();
    lanes.iter().sum::<f32>() + tail
}

/// Running sums of squares: `sums[i]` is the energy of `track[..i]`.
fn energy_sums(track: &[f32]) -> Vec<f64> {
    let mut sums = Vec::with_capacity(track.len() + 1);
    let mut total = 0.0f64;
    sums.push(0.0);
    for &x in track {
        total += (x as f64) * (x as f64);
        sums.push(total);
    }
    sums
}

// SE-MEET-025
fn best_match_with(
    me_low: &[f32],
    others_low: &[f32],
    others_energy: &[f64],
    start: usize,
    len: usize,
) -> (f32, i32) {
    if len == 0 || start >= me_low.len() {
        return (0.0, 0);
    }
    // A track counts as silence past its end: those samples add nothing.
    let me_end = (start + len).min(me_low.len());
    let me = &me_low[start..me_end];
    let me_sq = dot(me, me);
    if me_sq / (len as f32) < QUIET {
        return (0.0, 0);
    }
    let mut best = (0.0f32, 0i32);
    for lag in -LAG..=LAG {
        // Microphone sample j is compared with the app's sample j - lag.
        let lo = (start as i64).max(lag).max(0) as usize;
        let hi = (me_end as i64).min(others_low.len() as i64 + lag);
        if hi <= lo as i64 {
            continue;
        }
        let hi = hi as usize;
        let a_lo = (lo as i64 - lag) as usize;
        let a_hi = (hi as i64 - lag) as usize;
        let app_sq = (others_energy[a_hi] - others_energy[a_lo]) as f32;
        if app_sq / (len as f32) < QUIET {
            continue;
        }
        let cross = dot(&me_low[lo..hi], &others_low[a_lo..a_hi]);
        let likeness = cross.abs() / (me_sq * app_sq).sqrt();
        if likeness > best.0 {
            best = (likeness, lag as i32);
        }
    }
    best
}

// SE-MEET-025
/// How much the microphone's stretch `me_low[start..start + len]` is a copy
/// of the app's sound, 0.0-1.0, and the lag in low samples (milliseconds)
/// at which it matches best; (0.0, 0) for a stretch with no sound. Both
/// inputs are low tracks on the same clock (index 0 is the meeting's
/// start); a track counts as silence past its end.
pub fn best_match(me_low: &[f32], others_low: &[f32], start: usize, len: usize) -> (f32, i32) {
    best_match_with(me_low, others_low, &energy_sums(others_low), start, len)
}

/// Where each comparison window starts and how long it is: every `HOP`, and
/// a last one ending at the track's end so no sample is left uncovered.
fn windows(n: usize) -> Vec<(usize, usize)> {
    if n == 0 {
        return Vec::new();
    }
    if n <= WINDOW {
        return vec![(0, n)];
    }
    let mut out: Vec<(usize, usize)> = (0..)
        .map(|i| i * HOP)
        .take_while(|s| s + WINDOW <= n)
        .map(|s| (s, WINDOW))
        .collect();
    if out.last().map(|&(s, l)| s + l) != Some(n) {
        out.push((n - WINDOW, WINDOW));
    }
    out
}

// SE-MEET-025
/// `best_match` for each window of the microphone, one per `HOP`.
pub fn likeness(me_low: &[f32], others_low: &[f32]) -> Vec<(f32, i32)> {
    let energy = energy_sums(others_low);
    windows(me_low.len())
        .into_iter()
        .map(|(start, len)| best_match_with(me_low, others_low, &energy, start, len))
        .collect()
}

// SE-MEET-025
/// For each low sample of the microphone: true when it is the app's sound
/// heard by the microphone. A sample is echo only when every window that
/// covers it is echo, so a window holding the user's voice at least as loud
/// as the echo keeps its words whole.
pub fn echo_mask(me_low: &[f32], others_low: &[f32]) -> Vec<bool> {
    let n = me_low.len();
    let energy = energy_sums(others_low);
    let mut mask = vec![true; n];
    for (start, len) in windows(n) {
        let (score, _) = best_match_with(me_low, others_low, &energy, start, len);
        if score < FOLLOWS {
            mask[start..start + len].fill(false);
        }
    }
    mask
}

// SE-MEET-025
/// The 16 kHz microphone track with its echo set to silence, same length.
/// For recognition only; never save it.
pub fn without_echo(me: &[f32], others: &[f32]) -> Vec<f32> {
    let mask = echo_mask(&low(me), &low(others));
    let mut out = me.to_vec();
    for (i, _) in mask.iter().enumerate().filter(|(_, &echo)| echo) {
        out[i * STEP..(i + 1) * STEP].fill(0.0);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meeting::place_chunk;

    const RATE: usize = 16_000;
    const SECONDS: usize = 14;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        /// Uniform in -1.0..1.0.
        fn unit(&mut self) -> f32 {
            (self.next() >> 11) as f32 / (1u64 << 52) as f32 - 1.0
        }
        fn between(&mut self, lo: u64, hi: u64) -> u64 {
            lo + self.next() % (hi - lo + 1)
        }
    }

    /// Uniform noise has RMS 0.577 of its amplitude.
    fn noise(rng: &mut Rng, rms: f32) -> f32 {
        rng.unit() * rms / 0.577
    }

    /// "Speech": noise in bursts of 150-400 ms with gaps of 80-250 ms at RMS
    /// about 0.1, each burst at its own loudness (0.5-1.5 times).
    fn speech(seed: u64, seconds: usize) -> Vec<f32> {
        let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(12345));
        let total = seconds * RATE;
        let mut out = vec![0.0f32; total];
        let mut at = 0usize;
        while at < total {
            let burst = (rng.between(150, 400) as usize) * RATE / 1000;
            let level = 0.5 + (rng.next() % 1001) as f32 / 1000.0;
            for s in out.iter_mut().skip(at).take(burst) {
                *s = noise(&mut rng, 0.1 * level);
            }
            at += burst + (rng.between(80, 250) as usize) * RATE / 1000;
        }
        out
    }

    /// X late by `delay_ms` (negative: early) at `gain`, summed with copies
    /// 7, 19 and 43 ms later at 0.5, 0.35 and 0.2 of that, plus noise.
    fn echo_of(x: &[f32], delay_ms: i64, gain: f32, seed: u64) -> Vec<f32> {
        let mut rng = Rng(seed.wrapping_mul(0x2545_F491_4F6C_DD1D).wrapping_add(99));
        let taps = [(0i64, 1.0f32), (7, 0.5), (19, 0.35), (43, 0.2)];
        (0..x.len() as i64)
            .map(|t| {
                let mut v = 0.0;
                for (extra, weight) in taps {
                    let source = t - (delay_ms + extra) * RATE as i64 / 1000;
                    if source >= 0 && (source as usize) < x.len() {
                        v += weight * x[source as usize];
                    }
                }
                gain * v + noise(&mut rng, 0.002)
            })
            .collect()
    }

    fn mix(a: &[f32], b: &[f32]) -> Vec<f32> {
        a.iter().zip(b).map(|(x, y)| x + y).collect()
    }

    fn share(mask: &[bool], from_s: usize, to_s: usize) -> f32 {
        let part = &mask[from_s * 1000..(to_s * 1000).min(mask.len())];
        part.iter().filter(|&&m| m).count() as f32 / part.len() as f32
    }

    fn masked(me: &[f32], others: &[f32]) -> Vec<bool> {
        echo_mask(&low(me), &low(others))
    }

    // SE-MEET-025
    #[test]
    fn an_echo_only_microphone_is_silenced() {
        let a = speech(1, SECONDS);
        let me = echo_of(&a, 90, 0.3, 5);
        let share = share(&masked(&me, &a), 1, 13);
        assert!(share >= 0.9, "echo share {share}");
    }

    // SE-MEET-025
    #[test]
    fn the_echo_may_arrive_early_or_late() {
        let a = speech(1, SECONDS);
        for delay in [-300, 400] {
            let me = echo_of(&a, delay, 0.3, 6);
            let share = share(&masked(&me, &a), 1, 13);
            assert!(share >= 0.9, "delay {delay}: echo share {share}");
        }
    }

    // SE-MEET-025
    #[test]
    fn my_own_voice_is_never_silenced() {
        let a = speech(1, SECONDS);
        let me = speech(2, SECONDS);
        let mask = masked(&me, &a);
        assert!(!mask.iter().any(|&m| m));
    }

    // SE-MEET-025
    #[test]
    fn my_voice_over_the_app_is_kept() {
        let a = speech(1, SECONDS);
        let me = mix(&echo_of(&a, 90, 0.3, 5), &speech(2, SECONDS));
        let mask = masked(&me, &a);
        assert!(!mask.iter().any(|&m| m));
    }

    /// Echo of A plus speech B for the first 6 s, then the echo alone.
    fn stops_after_six() -> (Vec<f32>, Vec<f32>) {
        let a = speech(1, SECONDS);
        let mut b = speech(2, SECONDS);
        b[6 * RATE..].fill(0.0);
        (mix(&echo_of(&a, 90, 0.3, 5), &b), a)
    }

    // SE-MEET-025
    #[test]
    fn the_echo_after_i_stop_is_silenced() {
        let (me, a) = stops_after_six();
        let mask = masked(&me, &a);
        assert_eq!(share(&mask, 0, 6), 0.0);
        let after = share(&mask, 7, 13);
        assert!(after >= 0.9, "echo share after stop {after}");
    }

    // SE-MEET-025
    #[test]
    fn a_silent_app_silences_nothing() {
        let a = vec![0.0f32; SECONDS * RATE];
        let me = speech(2, SECONDS);
        assert!(!masked(&me, &a).iter().any(|&m| m));
    }

    // SE-MEET-025
    #[test]
    fn silencing_keeps_the_length_and_my_samples() {
        let (me, a) = stops_after_six();
        let out = without_echo(&me, &a);
        assert_eq!(out.len(), me.len());
        assert_eq!(&out[..6 * RATE], &me[..6 * RATE]);
        let tail = &out[7 * RATE..13 * RATE];
        let zeros = tail.iter().filter(|&&s| s == 0.0).count() as f32 / tail.len() as f32;
        assert!(zeros >= 0.9, "zero share {zeros}");
    }

    // SE-MEET-025
    #[test]
    fn a_short_stretch_is_matched_on_its_own() {
        let a = speech(1, SECONDS);
        let a_low = low(&a);
        let echo_low = low(&echo_of(&a, 90, 0.3, 5));
        let voice_low = low(&speech(2, SECONDS));
        let mut echo_stretches = 0;
        for second in 1..12 {
            let start = second * 1000;
            let stretch = &echo_low[start..start + 600];
            let has_sound = stretch.iter().map(|x| x * x).sum::<f32>() / 600.0 > 1e-5;
            let (likeness, _) = best_match(&echo_low, &a_low, start, 600);
            if has_sound {
                echo_stretches += 1;
                assert!(likeness >= 0.7, "echo at {second} s: {likeness}");
            }
            let (voice, _) = best_match(&voice_low, &a_low, start, 600);
            assert!(voice < 0.5, "voice at {second} s: {voice}");
        }
        assert!(echo_stretches > 5);
    }

    // SE-MEET-025
    #[test]
    fn my_voice_as_loud_as_the_echo_is_kept() {
        let a = speech(1, SECONDS);
        let me = mix(&echo_of(&a, 90, 1.0, 5), &speech(2, SECONDS));
        let mask = masked(&me, &a);
        let echo = mask.iter().filter(|&&m| m).count() as f32 / mask.len() as f32;
        assert!(echo <= 0.1, "echo share {echo}");
    }

    // SE-MEET-025
    #[test]
    fn an_app_track_placed_in_late_chunks_still_matches() {
        let a = speech(1, SECONDS);
        let me = echo_of(&a, 90, 0.3, 5);
        let chunk = 100 * RATE / 1000;
        let mut track = Vec::new();
        for (i, piece) in a.chunks(chunk).enumerate() {
            let arrives = (i + 1) * chunk + ((i * 7) % 11) * 6 * RATE / 1000;
            place_chunk(&mut track, piece, arrives);
        }
        let share = share(&masked(&me, &track), 1, 13);
        assert!(share >= 0.8, "echo share {share}");
    }

    // SE-MEET-025
    #[test]
    #[ignore]
    fn ten_minutes_are_checked_quickly() {
        let a = speech(1, 600);
        let me = echo_of(&a, 90, 0.3, 5);
        let (me_low, a_low) = (low(&me), low(&a));
        let begun = std::time::Instant::now();
        let mask = echo_mask(&me_low, &a_low);
        println!("echo_mask on 10 minutes: {:?}", begun.elapsed());
        assert_eq!(mask.len(), me_low.len());
    }
}
