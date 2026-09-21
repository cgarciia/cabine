/**
 * HEM-7530T ultrasonic ECG: FM 19 kHz, 200 Hz/mV, 0.67–40 Hz, 300 Hz trace.
 */
export const HEM7530_ECG_HZ = 300;

export const HEM7530_ECG_WORKLET = `
class Hem7530EcgProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.f0 = 19000;
    this.phase = 0;
    this.i1 = 0;
    this.i2 = 0;
    this.q1 = 0;
    this.q2 = 0;
    this.prevI = 0;
    this.prevQ = 0;
    this.lastHz = 0;
    this.lpZ1 = 0;
    this.lpZ2 = 0;
    this.hpX = 0;
    this.hpY = 0;
    this.acc = 0;
    this.accN = 0;
    this.buf = [];
    this.magFast = 0;
    this.magSlow = 0;
    this.lockMs = 0;
    this.missMs = 0;
    this.warmMs = 0;
    this.locked = false;
    this.wasLocked = false;
  }

  setup(sr) {
    const iqHz = 2500;
    this.iqA = 1 - Math.exp((-2 * Math.PI * iqHz) / sr);
    this.w = (2 * Math.PI * this.f0) / sr;
    const k = Math.tan(Math.PI * 40 / sr);
    const k2 = k * k;
    const n = 1 / (1 + Math.SQRT2 * k + k2);
    this.lpB0 = k2 * n;
    this.lpB1 = 2 * k2 * n;
    this.lpB2 = k2 * n;
    this.lpA1 = 2 * (k2 - 1) * n;
    this.lpA2 = (1 - Math.SQRT2 * k + k2) * n;
    this.hpA = Math.exp((-2 * Math.PI * 0.67) / sr);
    this.keep = Math.max(1, Math.round(sr / 300));
    this.ready = true;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    const sr = sampleRate;
    if (!this.ready) this.setup(sr);
    const a = this.iqA;
    const twoPi = Math.PI * 2;
    let magSum = 0;
    const pending = [];
    for (let n = 0; n < ch.length; n += 1) {
      const x = ch[n];
      const c = Math.cos(this.phase);
      const s = Math.sin(this.phase);
      this.phase += this.w;
      if (this.phase > twoPi) this.phase -= twoPi;
      this.i1 += a * (x * c - this.i1);
      this.i2 += a * (this.i1 - this.i2);
      this.q1 += a * (x * -s - this.q1);
      this.q2 += a * (this.q1 - this.q2);
      const i = this.i2;
      const q = this.q2;
      const mag2 = i * i + q * q;
      magSum += mag2;
      let hz = this.lastHz;
      if (mag2 > 1e-12) {
        const den = i * this.prevI + q * this.prevQ;
        const num = this.prevI * q - this.prevQ * i;
        const dphi = Math.atan2(num, den);
        hz = (dphi * sr) / twoPi;
      }
      this.prevI = i;
      this.prevQ = q;
      if (hz > 1200) hz = 1200;
      if (hz < -1200) hz = -1200;
      this.lastHz = hz;
      const lp = this.lpB0 * hz + this.lpZ1;
      this.lpZ1 = this.lpB1 * hz - this.lpA1 * lp + this.lpZ2;
      this.lpZ2 = this.lpB2 * hz - this.lpA2 * lp;
      const mv = lp / 200;
      this.hpY = this.hpA * (this.hpY + mv - this.hpX);
      this.hpX = mv;
      this.acc += this.hpY;
      this.accN += 1;
      if (this.accN >= this.keep) {
        pending.push(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
      }
    }
    const instMag = magSum / ch.length;
    this.magFast = this.magFast * 0.78 + instMag * 0.22;
    this.magSlow = this.magSlow * 0.995 + instMag * 0.005;
    const present = this.magFast > 2e-6 && this.magFast > this.magSlow * 0.12;

    const dtMs = (ch.length / sr) * 1000;
    this.warmMs += dtMs;
    if (this.warmMs < 280) {
      this.locked = false;
      this.lockMs = 0;
      this.missMs = 0;
    } else if (present) {
      this.lockMs += dtMs;
      this.missMs = 0;
      if (this.lockMs > 220) this.locked = true;
    } else {
      this.missMs += dtMs;
      if (this.missMs > 1600) {
        this.locked = false;
        this.lockMs = 0;
      }
    }

    if (this.locked) {
      for (let i = 0; i < pending.length; i += 1) this.buf.push(pending[i]);
    }

    const dropped = this.wasLocked && !this.locked;
    this.wasLocked = this.locked;
    if (this.buf.length >= 2 || dropped) {
      this.port.postMessage({
        samples: this.buf.splice(0),
        locked: this.locked,
        snr: this.magFast,
      });
    }
    return true;
  }
}
registerProcessor('hem7530-ecg', Hem7530EcgProcessor);
`;
