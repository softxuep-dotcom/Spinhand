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
  private justPressed = false;
  private target: Vec2 = { x: 0, y: 4.6 };

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
    const result = {
      active: this.active,
      target: { ...this.target },
      justPressed: this.justPressed,
    };
    this.justPressed = false;
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
    this.justPressed = true;
    this.updateTarget(event);
    this.canvas.setPointerCapture(event.pointerId);
    this.onFirstInteraction();
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.updateTarget(event);
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
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
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.cancel();
  };
}
