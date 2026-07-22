export class MotorAudio {
  private context: AudioContext | null = null;
  private motor: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private friction: OscillatorNode | null = null;
  private frictionGain: GainNode | null = null;
  private previousContact = false;

  unlock(): void {
    if (!this.context) this.createGraph();
    void this.context?.resume();
  }

  update(active: boolean, impulse: number, invalidDeep: boolean): void {
    if (!this.context || !this.motorGain || !this.frictionGain || !this.motor || !this.friction) return;
    const now = this.context.currentTime;
    const contact = impulse > 0.001;
    this.motorGain.gain.setTargetAtTime(active ? 0.018 : 0.006, now, 0.035);
    this.motor.frequency.setTargetAtTime(active ? 76 : 58, now, 0.05);
    this.frictionGain.gain.setTargetAtTime(contact ? Math.min(0.055, 0.012 + impulse * 0.13) : 0, now, 0.022);
    this.friction.frequency.setTargetAtTime(invalidDeep ? 92 : 170 + impulse * 520, now, 0.018);

    if (contact && !this.previousContact && "vibrate" in navigator) {
      navigator.vibrate(7);
    }
    this.previousContact = contact;
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
