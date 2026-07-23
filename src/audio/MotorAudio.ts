import type { GoalKind } from "../game/campaign/levels";

export class MotorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private motor: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;
  private friction: OscillatorNode | null = null;
  private frictionGain: GainNode | null = null;
  private frictionFilter: BiquadFilterNode | null = null;
  private previousContact = false;
  private previousImpulse = 0;
  private lastImpactAt = -1;
  private enabled = true;
  private hapticsEnabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.previousContact = false;
      this.previousImpulse = 0;
    }
    if (!enabled && this.context) void this.context.suspend();
    if (enabled && this.context) void this.context.resume();
  }

  setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  unlock(): void {
    if (!this.enabled) return;
    if (!this.context) this.createGraph();
    void this.context?.resume();
  }

  update(active: boolean, impulse: number, invalidDeep: boolean): void {
    if (
      !this.enabled
      || !this.context
      || !this.motorGain
      || !this.motorFilter
      || !this.frictionGain
      || !this.frictionFilter
      || !this.motor
      || !this.friction
    ) return;
    const now = this.context.currentTime;
    const energy = Math.min(1, Math.max(0, impulse * 3.2));
    const contact = impulse > 0.001;

    // The idle motor stays barely audible; pressure adds body without turning
    // the continuous contact layer into the old high, buzzy sawtooth.
    this.motorGain.gain.setTargetAtTime(active ? 0.018 + energy * 0.009 : 0.0035, now, 0.045);
    this.motor.frequency.setTargetAtTime(active ? 66 + energy * 17 : 48, now, 0.055);
    this.motorFilter.frequency.setTargetAtTime(active ? 230 + energy * 120 : 150, now, 0.08);

    this.frictionGain.gain.setTargetAtTime(contact ? 0.006 + energy * 0.026 : 0, now, contact ? 0.026 : 0.045);
    this.friction.frequency.setTargetAtTime(invalidDeep ? 76 : 118 + energy * 155, now, 0.03);
    this.frictionFilter.frequency.setTargetAtTime(invalidDeep ? 170 : 430 + energy * 760, now, 0.045);

    const freshImpact = contact && (!this.previousContact || impulse > this.previousImpulse + 0.055);
    if (freshImpact && now - this.lastImpactAt > 0.085) {
      this.playContactTick(invalidDeep, energy);
      this.lastImpactAt = now;
    }
    if (contact && !this.previousContact && this.hapticsEnabled && "vibrate" in navigator) {
      navigator.vibrate(invalidDeep ? 11 : 6);
    }
    this.previousContact = contact;
    this.previousImpulse = impulse;
  }

  checkpoint(): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    this.playTone(392, now, 0.13, 0.035, "sine", 440);
    this.playTone(587.33, now + 0.075, 0.18, 0.045, "sine", 659.25);
    this.playNoise(now, 0.045, 0.018, 1150);
    if (this.hapticsEnabled && "vibrate" in navigator) navigator.vibrate([7, 28, 7]);
  }

  success(kind: GoalKind): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const notes: Record<GoalKind, readonly [number, number, number]> = {
      slot: [466.16, 622.25, 783.99],
      plate: [392, 587.33, 783.99],
      seal: [415.3, 622.25, 830.61],
      cup: [440, 659.25, 880],
      dock: [349.23, 523.25, 698.46],
      shelf: [493.88, 659.25, 830.61],
      bell: [523.25, 783.99, 1046.5],
    };

    // A short latch first makes success feel caused by the object landing;
    // the restrained three-note confirmation then identifies completion.
    this.playTone(146.83, now, 0.12, 0.055, "triangle", 82.41);
    this.playNoise(now, 0.052, 0.032, 920);
    notes[kind].forEach((frequency, index) => {
      const start = now + 0.045 + index * 0.065;
      this.playTone(frequency, start, 0.23, index === 2 ? 0.052 : 0.04, "sine");
    });
    if (this.hapticsEnabled && "vibrate" in navigator) navigator.vibrate([10, 32, 15]);
  }

  failure(): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    this.playTone(138.59, now, 0.22, 0.05, "triangle", 73.42);
    this.playNoise(now, 0.075, 0.022, 210);
    if (this.hapticsEnabled && "vibrate" in navigator) navigator.vibrate(18);
  }

  suspend(): void {
    void this.context?.suspend();
  }

  private playContactTick(invalidDeep: boolean, energy: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (invalidDeep) {
      this.playTone(105, now, 0.07, 0.018, "triangle", 72);
      this.playNoise(now, 0.035, 0.012, 180);
      return;
    }
    this.playTone(210 + energy * 95, now, 0.045, 0.012 + energy * 0.014, "triangle");
    this.playNoise(now, 0.025, 0.008 + energy * 0.012, 780 + energy * 760);
  }

  private playTone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.78);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);
  }

  private playNoise(start: number, duration: number, volume: number, frequency: number): void {
    if (!this.context || !this.master) return;
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    master.gain.value = 0.48;
    master.connect(context.destination);

    const motor = context.createOscillator();
    motor.type = "triangle";
    motor.frequency.value = 48;
    const motorFilter = context.createBiquadFilter();
    motorFilter.type = "lowpass";
    motorFilter.frequency.value = 150;
    motorFilter.Q.value = 0.7;
    const motorGain = context.createGain();
    motorGain.gain.value = 0;
    motor.connect(motorFilter).connect(motorGain).connect(master);

    const friction = context.createOscillator();
    friction.type = "triangle";
    friction.frequency.value = 118;
    const frictionFilter = context.createBiquadFilter();
    frictionFilter.type = "bandpass";
    frictionFilter.frequency.value = 430;
    frictionFilter.Q.value = 0.82;
    const frictionGain = context.createGain();
    frictionGain.gain.value = 0;
    friction.connect(frictionFilter).connect(frictionGain).connect(master);

    motor.start();
    friction.start();
    this.context = context;
    this.master = master;
    this.motor = motor;
    this.motorGain = motorGain;
    this.motorFilter = motorFilter;
    this.friction = friction;
    this.frictionGain = frictionGain;
    this.frictionFilter = frictionFilter;
  }
}
