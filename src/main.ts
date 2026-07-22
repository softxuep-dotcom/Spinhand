import RAPIER from "@dimforge/rapier2d-compat";
import "./style.css";
import { MotorAudio } from "./audio/MotorAudio";
import { FIXED_DT, MAX_CATCH_UP_STEPS, MAX_FRAME_DELTA } from "./game/config";
import { InputController, type ControlSample } from "./game/input/InputController";
import { InputRecorder, type RecordedInput } from "./game/input/InputRecorder";
import { SpinhandSimulation } from "./game/simulation/SpinhandSimulation";
import { SpinhandRenderer } from "./render/SpinhandRenderer";

const requiredElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: #${id}`);
  return element as T;
};

const toControlSample = (sample: RecordedInput): ControlSample => ({
  active: sample.active,
  target: { x: sample.x, y: sample.y },
  justPressed: sample.justPressed,
});

await RAPIER.init();

const canvas = requiredElement<HTMLCanvasElement>("game-canvas");
const loading = requiredElement<HTMLDivElement>("loading");
const contactStatus = requiredElement<HTMLElement>("contact-status");
const inputHint = requiredElement<HTMLDivElement>("input-hint");
const debugPanel = requiredElement<HTMLElement>("debug-panel");
const debugMetrics = requiredElement<HTMLElement>("debug-metrics");
const replayStatus = requiredElement<HTMLElement>("replay-status");
const simulation = new SpinhandSimulation();
const renderer = new SpinhandRenderer(canvas, simulation.getRenderState());
const audio = new MotorAudio();
const recorder = new InputRecorder();
const input = new InputController(canvas, renderer.clientToWorld, () => audio.unlock());

let accumulator = 0;
let lastTime = performance.now();
let debugVisible = new URLSearchParams(window.location.search).has("debug");
let runningConsistencyTest = false;
let hintDismissed = false;

const setDebugVisible = (visible: boolean): void => {
  debugVisible = visible;
  debugPanel.hidden = !visible;
  renderer.setDebugVisible(visible);
};

const resetSandbox = (): void => {
  recorder.stop();
  simulation.reset();
  replayStatus.textContent = "沙盘已重置";
};

const updateHud = (): void => {
  const state = simulation.getRenderState();
  const contact = state.contacts.find((item) => item.invalidDeep) ?? state.contacts.find((item) => item.impulse > 0);
  const totalImpulse = state.contacts.reduce((sum, item) => sum + item.impulse, 0);
  const renderStats = renderer.getRenderStats();

  if (contact?.invalidDeep) {
    contactStatus.textContent = "深穿空转";
    contactStatus.dataset.state = "invalid";
  } else if (contact) {
    contactStatus.textContent = `切向施力 · ${contact.targetId}`;
    contactStatus.dataset.state = "contact";
    if (!hintDismissed) {
      hintDismissed = true;
      inputHint.classList.add("is-hidden");
    }
  } else if (state.wheel.active) {
    contactStatus.textContent = "寻找轮缘";
    contactStatus.dataset.state = "active";
  } else {
    contactStatus.textContent = "轮缘空转";
    contactStatus.dataset.state = "idle";
  }

  debugMetrics.textContent = `J ${totalImpulse.toFixed(3)} · ω球 ${state.ball.angularVelocity.toFixed(2)} · ω齿 ${state.gear.angularVelocity.toFixed(2)} · ${renderStats.calls} calls`;
  audio.update(state.wheel.active, totalImpulse, Boolean(contact?.invalidDeep));
};

const runConsistencyTest = async (): Promise<void> => {
  const samples = [...recorder.getSamples()];
  if (samples.length === 0 || runningConsistencyTest) {
    replayStatus.textContent = "请先录制一段有效操作";
    return;
  }

  runningConsistencyTest = true;
  recorder.stop();
  let reference: readonly number[] | null = null;
  let matches = 0;

  for (let run = 0; run < 100; run += 1) {
    simulation.reset();
    for (const sample of samples) simulation.step(toControlSample(sample), FIXED_DT);
    const signature = simulation.getSignature();
    reference ??= signature;
    const equal = signature.every((value, index) => Math.abs(value - (reference?.[index] ?? Number.NaN)) < 1e-7);
    if (equal) matches += 1;
    if ((run + 1) % 5 === 0) {
      replayStatus.textContent = `一致性检查 ${run + 1}/100…`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  simulation.reset();
  runningConsistencyTest = false;
  replayStatus.textContent = `一致性 ${matches}/100 ${matches >= 98 ? "✓" : "未达 98%"}`;
};

requiredElement<HTMLButtonElement>("reset-button").addEventListener("click", resetSandbox);
requiredElement<HTMLButtonElement>("debug-button").addEventListener("click", () => setDebugVisible(!debugVisible));
requiredElement<HTMLButtonElement>("record-button").addEventListener("click", () => {
  simulation.reset();
  recorder.startRecording();
  replayStatus.textContent = "正在录制（最多 10 秒）";
});
requiredElement<HTMLButtonElement>("stop-button").addEventListener("click", () => {
  recorder.stop();
  replayStatus.textContent = `已录制 ${recorder.length} 帧`;
});
requiredElement<HTMLButtonElement>("play-button").addEventListener("click", () => {
  simulation.reset();
  replayStatus.textContent = recorder.startPlayback() ? `回放 ${recorder.length} 帧` : "没有可回放的输入";
});
requiredElement<HTMLButtonElement>("repeat-button").addEventListener("click", () => void runConsistencyTest());
requiredElement<HTMLButtonElement>("export-button").addEventListener("click", () => {
  if (recorder.length === 0) {
    replayStatus.textContent = "没有可导出的输入";
    return;
  }
  const blob = new Blob([recorder.exportJson()], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `spinhand-input-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  replayStatus.textContent = "输入轨迹已导出";
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key.toLowerCase() === "r") resetSandbox();
  if (event.key.toLowerCase() === "d") setDebugVisible(!debugVisible);
});
window.addEventListener("blur", () => audio.suspend());
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  accumulator = 0;
  if (document.hidden) audio.suspend();
});

setDebugVisible(debugVisible);
loading.classList.add("is-hidden");

renderer.renderer.setAnimationLoop((time) => {
  const frameDelta = Math.min(MAX_FRAME_DELTA, Math.max(0, (time - lastTime) / 1000));
  lastTime = time;

  if (!runningConsistencyTest) {
    accumulator += frameDelta;
    let stepCount = 0;
    while (accumulator >= FIXED_DT && stepCount < MAX_CATCH_UP_STEPS) {
      const control = recorder.resolve(input.sample());
      simulation.step(control, FIXED_DT);
      accumulator -= FIXED_DT;
      stepCount += 1;
    }
    if (stepCount === MAX_CATCH_UP_STEPS) accumulator = 0;
  }

  updateHud();
  renderer.render(simulation.getRenderState(), frameDelta);
});

window.addEventListener("beforeunload", () => {
  input.dispose();
  renderer.dispose();
});
