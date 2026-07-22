export class MotorAudio {
  private context: AudioContext | null = null;
  private motor: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private friction: OscillatorNode | null = null;
  private frictionGain: GainNode | null = null;
  private previousContact = false;
  private enabled = true;
  private hapticsEnabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.context) void this.context.suspend();
    if (enabled && this.context) void this.context.resume();
  }

  setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  unlock(): void {
    if (!this.context) this.createGraph();
    void this.context?.resume();
  }

  update(active: boolean, impulse: number, invalidDeep: boolean): void {
    if (!this.enabled || !this.context || !this.motorGain || !this.frictionGain || !this.motor || !this.friction) return;
    const now = this.context.currentTime;
    const contact = impulse > 0.001;
    this.motorGain.gain.setTargetAtTime(active ? 0.018 : 0.006, now, 0.035);
    this.motor.frequency.setTargetAtTime(active ? 76 : 58, now, 0.05);
    this.frictionGain.gain.setTargetAtTime(contact ? Math.min(0.055, 0.012 + impulse * 0.13) : 0, now, 0.022);
    this.friction.frequency.setTargetAtTime(invalidDeep ? 92 : 170 + impulse * 520, now, 0.018);

    if (contact && !this.previousContact && this.hapticsEnabled && "vibrate" in navigator) {
      navigator.vibrate(7);
    }
    this.previousContact = contact;
  }

  success(): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.055);
      gain.gain.linearRampToValueAtTime(0.075, now + index * 0.055 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.055 + 0.22);
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start(now + index * 0.055);
      oscillator.stop(now + index * 0.055 + 0.24);
    });
    if (this.hapticsEnabled && "vibrate" in navigator) navigator.vibrate([10, 35, 16]);
  }

  failure(): void {
    if (!this.enabled || !this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(130, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(72, this.context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.06, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.18);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.2);
  }

  suspend(): void {
    void this.context?.suspend();
  }

  private createGraph(): void {
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);

    const motor = context.createOscillator();
    motor.type = "sine";
    motor.frequency.value = 58;
    const motorGain = context.createGain();
    motorGain.gain.value = 0;
    motor.connect(motorGain).connect(master);

    const friction = context.createOscillator();
    friction.type = "sawtooth";
    friction.frequency.value = 180;
    const frictionGain = context.createGain();
    frictionGain.gain.value = 0;
    friction.connect(frictionGain).connect(master);

    motor.start();
    friction.start();
    this.context = context;
    this.motor = motor;
    this.motorGain = motorGain;
    this.friction = friction;
    this.frictionGain = frictionGain;
  }
}
