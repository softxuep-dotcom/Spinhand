import { MAX_RECORDING_SAMPLES } from "../config";
import type { ControlSample } from "./InputController";

export type RecorderMode = "live" | "recording" | "playback";

export interface RecordedInput {
  active: boolean;
  x: number;
  y: number;
  justPressed: boolean;
}

const cloneSample = (sample: ControlSample): RecordedInput => ({
  active: sample.active,
  x: sample.target.x,
  y: sample.target.y,
  justPressed: sample.justPressed,
});

export class InputRecorder {
  mode: RecorderMode = "live";
  private samples: RecordedInput[] = [];
  private playbackIndex = 0;

  get length(): number {
    return this.samples.length;
  }

  startRecording(): void {
    this.samples = [];
    this.playbackIndex = 0;
    this.mode = "recording";
  }

  stop(): void {
    this.mode = "live";
    this.playbackIndex = 0;
  }

  startPlayback(): boolean {
    if (this.samples.length === 0) return false;
    this.mode = "playback";
    this.playbackIndex = 0;
    return true;
  }

  resolve(liveSample: ControlSample): ControlSample {
    if (this.mode === "playback") {
      const recorded = this.samples[this.playbackIndex];
      if (!recorded) {
        this.stop();
        return { active: false, target: { ...liveSample.target }, justPressed: false };
      }
      this.playbackIndex += 1;
      return {
        active: recorded.active,
        target: { x: recorded.x, y: recorded.y },
        justPressed: recorded.justPressed,
      };
    }

    if (this.mode === "recording") {
      this.samples.push(cloneSample(liveSample));
      if (this.samples.length > MAX_RECORDING_SAMPLES) this.samples.shift();
    }
    return liveSample;
  }

  getSamples(): readonly RecordedInput[] {
    return this.samples;
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, hz: 60, samples: this.samples }, null, 2);
  }
}
