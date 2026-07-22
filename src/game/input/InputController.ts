import type { Vec2 } from "../math/vec2";

export interface ControlSample {
  active: boolean;
  target: Vec2;
  justPressed: boolean;
}

type ClientToWorld = (clientX: number, clientY: number) => Vec2;

export class InputController {
  private pointerId: number | null = null;
  private pointerType = "mouse";
  private active = false;
  private target: Vec2 = { x: 0, y: 4.6 };
  private readonly pendingSamples: ControlSample[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly clientToWorld: ClientToWorld,
    private readonly onFirstInteraction: () => void,
  ) {
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("blur", this.cancel);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  sample(): ControlSample {
    const pending = this.pendingSamples.shift();
    if (pending) {
      return { active: pending.active, target: { ...pending.target }, justPressed: pending.justPressed };
    }
    const result = {
      active: this.active,
      target: { ...this.target },
      justPressed: false,
    };
    return result;
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("blur", this.cancel);
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }

  private updateTarget(event: PointerEvent): void {
    const offsetPixels = this.pointerType === "touch" ? 60 : 24;
    this.target = this.clientToWorld(event.clientX, event.clientY - offsetPixels);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.pointerType = event.pointerType;
    this.active = true;
    this.updateTarget(event);
    this.pendingSamples.push({ active: true, target: { ...this.target }, justPressed: true });
    this.canvas.setPointerCapture(event.pointerId);
    this.onFirstInteraction();
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.updateTarget(event);
    this.queueLatestMove();
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.updateTarget(event);
    this.queueLatestMove();
    this.pendingSamples.push({ active: false, target: { ...this.target }, justPressed: false });
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.active = false;
    event.preventDefault();
  };

  private readonly cancel = (): void => {
    this.pointerId = null;
    this.active = false;
    this.pendingSamples.length = 0;
  };

  private queueLatestMove(): void {
    const sample: ControlSample = { active: true, target: { ...this.target }, justPressed: false };
    const lastIndex = this.pendingSamples.length - 1;
    const last = this.pendingSamples[lastIndex];
    if (last && last.active && !last.justPressed) {
      this.pendingSamples[lastIndex] = sample;
    } else {
      this.pendingSamples.push(sample);
    }
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.cancel();
  };
}
