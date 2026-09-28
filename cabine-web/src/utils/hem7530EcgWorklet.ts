/**
 * HEM-7530T / AliveCor ultrasonic ECG.
 *
 * The monitor does not send a waveform. It sends FM audio (manual):
 * 19 kHz carrier, 200 Hz/mV, ECG already limited to 0.67–40 Hz, ±5 mV.
 * Chain: flat 17–21 kHz FIR, quadrature demod, 3-sample median and a slew
 * limit to drop FM clicks, 4th-order Bessel 40 Hz lowpass (little overshoot,
 * so Q and S are not pulled down), then a slow 0.2 Hz highpass and 50/60 Hz
 * notches. Samples always leave at 300 Hz while the carrier is locked.
 */
export const HEM7530_ECG_HZ = 300;

export const HEM7530_ECG_WORKLET = `
function butterLp(fc, q, sr) {
  const k = Math.tan((Math.PI * fc) / sr);
  const k2 = k * k;
  const n = 1 / (1 + k / q + k2);
  return {
    b0: k2 * n,
    b1: 2 * k2 * n,
    b2: k2 * n,
    a1: 2 * (k2 - 1) * n,
    a2: (1 - k / q + k2) * n,
    z1: 0,
    z2: 0,
  };
}

function notch(f0, q, sr) {
  const w0 = (2 * Math.PI * f0) / sr;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: 1 / a0,
    b1: (-2 * cw) / a0,
    b2: 1 / a0,
    a1: (-2 * cw) / a0,
    a2: (1 - alpha) / a0,
    z1: 0,
    z2: 0,
  };
}

function step(f, x) {
  const y = f.b0 * x + f.z1;
  f.z1 = f.b1 * x - f.a1 * y + f.z2;
  f.z2 = f.b2 * x - f.a2 * y;
  return y;
}

function med3(a, b, c) {
  if (a > b) {
    if (b > c) return b;
    return a > c ? c : a;
  }
  if (a > c) return a;
  return b > c ? c : b;
}

class Hem7530EcgProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.f0 = 19000;
    this.phase = 0;
    this.prevI = 0;
    this.prevQ = 0;
    this.h0 = 0;
    this.h1 = 0;
    this.h2 = 0;
    this.tracked = 0;
    this.magMean = 0;
    this.magDev = 0;
    this.buf = [];
    this.rawSum = 0;
    this.bandSum = 0;
    this.rmsN = 0;
    this.rawEma = 0;
    this.bandEma = 0;
    this.lockMs = 0;
    this.missMs = 0;
    this.warmMs = 0;
    this.locked = false;
    this.wasLocked = false;
    this.decN = 0;
    this.carry = 0;
    this.sum = 0;
    this.sumN = 0;
    this.dcY = 0;
    this.dcX = 0;
  }

  setup(sr) {
    const nTaps = 241;
    const mid = (nTaps - 1) / 2;
    const f1 = 17000 / sr;
    const f2 = 21000 / sr;
    this.taps = new Float32Array(nTaps);
    this.hist = new Float32Array(nTaps);
    this.histAt = 0;
    const w0 = (2 * Math.PI * this.f0) / sr;
    let gain = 0;
    for (let n = 0; n < nTaps; n += 1) {
      const k = n - mid;
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (nTaps - 1));
      const h = k === 0
        ? 2 * (f2 - f1)
        : (Math.sin(2 * Math.PI * f2 * k) - Math.sin(2 * Math.PI * f1 * k)) / (Math.PI * k);
      this.taps[n] = h * w;
      gain += this.taps[n] * Math.cos(w0 * k);
    }
    if (gain > 1e-9 || gain < -1e-9) {
      for (let n = 0; n < nTaps; n += 1) this.taps[n] /= gain;
    }
    this.w = w0;
    this.iq = [
      butterLp(1200, 0.5411961, sr),
      butterLp(1200, 1.306563, sr),
    ];
    this.qi = [
      butterLp(1200, 0.5411961, sr),
      butterLp(1200, 1.306563, sr),
    ];
    this.decim = Math.max(4, Math.round(sr / 6000));
    this.decSr = sr / this.decim;
    this.lp = [
      butterLp(40, 0.522, this.decSr),
      butterLp(40, 0.806, this.decSr),
    ];
    this.dcA = Math.exp((-2 * Math.PI * 0.2) / 300);
    this.n50 = notch(50, 30, 300);
    this.n60 = notch(60, 30, 300);
    this.ready = true;
  }

  bandpass(x) {
    const taps = this.taps;
    const hist = this.hist;
    const n = taps.length;
    hist[this.histAt] = x;
    let acc = 0;
    let idx = this.histAt;
    for (let k = 0; k < n; k += 1) {
      acc += taps[k] * hist[idx];
      idx = idx === 0 ? n - 1 : idx - 1;
    }
    this.histAt += 1;
    if (this.histAt === n) this.histAt = 0;
    return acc;
  }

  shape(mv) {
    const dc = this.dcA * (this.dcY + mv - this.dcX);
    this.dcX = mv;
    this.dcY = dc;
    let y = step(this.n50, dc);
    y = step(this.n60, y);
    if (y > 5) return 5;
    if (y < -5) return -5;
    return y;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    const sr = sampleRate;
    if (!this.ready) this.setup(sr);
    const twoPi = Math.PI * 2;
    for (let n = 0; n < ch.length; n += 1) {
      const rawIn = ch[n];
      this.rawSum += rawIn * rawIn;
      const y = this.bandpass(rawIn);
      this.bandSum += y * y;
      this.rmsN += 1;
      const c = Math.cos(this.phase);
      const s = Math.sin(this.phase);
      this.phase += this.w;
      if (this.phase > twoPi) this.phase -= twoPi;
      const iIn = step(this.iq[1], step(this.iq[0], y * c));
      const qIn = step(this.qi[1], step(this.qi[0], y * -s));
      this.decN += 1;
      if (this.decN < this.decim) continue;
      this.decN = 0;
      const mag = Math.sqrt(iIn * iIn + qIn * qIn);
      this.magMean = this.magMean * 0.98 + mag * 0.02;
      const magErr = mag - this.magMean;
      this.magDev = this.magDev * 0.98 + magErr * magErr * 0.02;
      let hz = this.tracked;
      if (mag > 1e-7) {
        const den = iIn * this.prevI + qIn * this.prevQ;
        const num = this.prevI * qIn - this.prevQ * iIn;
        hz = (Math.atan2(num, den) * this.decSr) / twoPi;
      }
      this.prevI = iIn;
      this.prevQ = qIn;
      this.h0 = this.h1;
      this.h1 = this.h2;
      this.h2 = hz;
      const med = med3(this.h0, this.h1, this.h2);
      const magOk = this.magMean > 2.5e-4 && mag > this.magMean * 0.35;
      if (magOk) {
        let diff = med - this.tracked;
        if (diff > 20) diff = 20;
        else if (diff < -20) diff = -20;
        this.tracked += diff;
      } else if (!this.locked) {
        this.tracked *= 0.9;
      }
      const smooth = step(this.lp[1], step(this.lp[0], this.tracked));
      this.sum += smooth / 200;
      this.sumN += 1;
      this.carry += 300;
      if (this.carry < this.decSr) continue;
      this.carry -= this.decSr;
      const sample = this.sum / this.sumN;
      this.sum = 0;
      this.sumN = 0;
      const shaped = this.shape(sample);
      if (this.locked) this.buf.push(shaped);
    }
    if (this.rmsN > 0) {
      const rawRms = Math.sqrt(this.rawSum / this.rmsN);
      const bandRms = Math.sqrt(this.bandSum / this.rmsN);
      this.rawEma = this.rawEma === 0 ? rawRms : this.rawEma * 0.85 + rawRms * 0.15;
      this.bandEma = this.bandEma === 0 ? bandRms : this.bandEma * 0.85 + bandRms * 0.15;
      this.rawSum = 0;
      this.bandSum = 0;
      this.rmsN = 0;
    }
    const cv = this.magMean > 1e-6 ? Math.sqrt(this.magDev) / this.magMean : 1;
    const steady = this.magMean > 2.5e-4 && cv < 0.42;
    const ultrasonic = this.bandEma > 0.0008 && this.bandEma > this.rawEma * 0.18;
    const present = ultrasonic && steady;
    const dtMs = (ch.length / sr) * 1000;
    this.warmMs += dtMs;
    if (this.warmMs < 400) {
      this.locked = false;
      this.lockMs = 0;
      this.missMs = 0;
    } else if (present) {
      this.lockMs += dtMs;
      this.missMs = 0;
      if (this.lockMs > 180) this.locked = true;
    } else {
      this.missMs += dtMs;
      if (this.missMs > 220) this.lockMs = 0;
      if (this.missMs > 700) {
        this.locked = false;
        this.lockMs = 0;
      }
    }
    const rose = this.locked && !this.wasLocked;
    const fell = this.wasLocked && !this.locked;
    this.wasLocked = this.locked;
    if (this.buf.length || rose || fell) {
      this.port.postMessage({
        samples: this.buf.splice(0),
        locked: this.locked,
        snr: this.bandEma,
      });
    }
    return true;
  }
}
registerProcessor('hem7530-ecg', Hem7530EcgProcessor);
`;
