import RAPIER from "@dimforge/rapier2d-compat";
import "./style.css";
import { MotorAudio } from "./audio/MotorAudio";
import { CampaignSave } from "./game/campaign/CampaignSave";
import { CampaignSimulation } from "./game/campaign/CampaignSimulation";
import { CHAPTER_ONE_LEVELS, getCampaignLevel } from "./game/campaign/levels";
import { FIXED_DT, MAX_CATCH_UP_STEPS, MAX_FRAME_DELTA } from "./game/config";
import { InputController } from "./game/input/InputController";
import { CampaignRenderer } from "./render/CampaignRenderer";

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: #${id}`);
  return element as T;
};

await RAPIER.init();

const canvas = required<HTMLCanvasElement>("game-canvas");
const shell = required<HTMLDivElement>("game-shell");
const loading = required<HTMLDivElement>("loading");
const pausePanel = required<HTMLElement>("pause-panel");
const levelsPanel = required<HTMLElement>("levels-panel");
const chapterPanel = required<HTMLElement>("chapter-panel");
const levelProgress = required<HTMLElement>("level-progress");
const objectiveVerb = required<HTMLElement>("objective-verb");
const objectiveName = required<HTMLElement>("objective-name");
const inputHint = required<HTMLElement>("input-hint");
const hintCopy = required<HTMLElement>("hint-copy");
const firstLevelDemo = required<HTMLElement>("first-level-demo");
const contactStatus = required<HTMLElement>("contact-status");
const resultToast = required<HTMLElement>("result-toast");
const resultBolts = required<HTMLElement>("result-bolts");
const totalBolts = required<HTMLElement>("total-bolts");
const levelGrid = required<HTMLDivElement>("level-grid");
const soundToggle = required<HTMLInputElement>("sound-toggle");
const hapticsToggle = required<HTMLInputElement>("haptics-toggle");
const motionToggle = required<HTMLInputElement>("motion-toggle");

const save = new CampaignSave();
const audio = new MotorAudio();
let currentLevel = Math.min(5, Math.max(1, save.data.highestUnlocked));
let simulation = new CampaignSimulation(getCampaignLevel(currentLevel));
const renderer = new CampaignRenderer(canvas, simulation.getRenderState());
const input = new InputController(canvas, renderer.clientToWorld, () => audio.unlock());

let accumulator = 0;
let lastTime = performance.now();
let paused = false;
let transitioning = false;
let restartCount = 0;
let hintDismissed = false;
let failureTimer: number | undefined;
let levelsFromChapter = false;

const applySettings = (): void => {
  const settings = save.data.settings;
  soundToggle.checked = settings.sound;
  hapticsToggle.checked = settings.haptics;
  motionToggle.checked = settings.reducedMotion;
  audio.setEnabled(settings.sound);
  audio.setHapticsEnabled(settings.haptics);
  shell.classList.toggle("reduced-motion", settings.reducedMotion);
};

const buildLevelGrid = (): void => {
  levelGrid.replaceChildren();
  for (const level of CHAPTER_ONE_LEVELS) {
    const button = document.createElement("button");
    const unlocked = level.id <= save.data.highestUnlocked || Boolean(save.data.results[String(level.id)]?.complete);
    button.type = "button";
    button.className = "level-button";
    button.disabled = !unlocked;
    button.dataset.level = String(level.id);
    const bolts = save.boltsFor(level.id);
    button.innerHTML = `<span>${level.id}</span><strong>${level.name}</strong><small>${unlocked ? `${"◆".repeat(bolts)}${"◇".repeat(3 - bolts)}` : "锁定"}</small>`;
    button.addEventListener("click", () => {
      if (!unlocked) return;
      levelsPanel.hidden = true;
      pausePanel.hidden = true;
      chapterPanel.hidden = true;
      startLevel(level.id, false);
    });
    levelGrid.append(button);
  }
};

const updateLevelHud = (): void => {
  const level = getCampaignLevel(currentLevel);
  levelProgress.textContent = `${currentLevel} / 5`;
  objectiveVerb.textContent = level.verb;
  objectiveName.textContent = level.name;
  hintCopy.textContent = currentLevel === 1
    ? "手指放在黄轮下方 · 按住向右拖"
    : `按住拖动 · ${level.hint}`;
  inputHint.classList.remove("is-hidden");
  firstLevelDemo.classList.toggle("is-hidden", currentLevel !== 1);
  hintDismissed = false;
};

const startLevel = (level: number, countRestart: boolean): void => {
  if (failureTimer !== undefined) window.clearTimeout(failureTimer);
  if (countRestart) restartCount += 1;
  else restartCount = 0;
  currentLevel = Math.max(1, Math.min(5, level));
  simulation = new CampaignSimulation(getCampaignLevel(currentLevel));
  renderer.loadLevel(simulation.getRenderState());
  paused = false;
  transitioning = false;
  accumulator = 0;
  lastTime = performance.now();
  failureTimer = undefined;
  shell.classList.remove("level-complete", "level-failed");
  resultToast.classList.remove("is-visible");
  pausePanel.hidden = true;
  updateLevelHud();
};

const setPaused = (value: boolean): void => {
  paused = value;
  pausePanel.hidden = !value;
  shell.classList.toggle("is-paused", value);
  lastTime = performance.now();
  accumulator = 0;
  if (value) audio.suspend();
};

const showLevels = (returnToChapter = false): void => {
  paused = true;
  levelsFromChapter = returnToChapter;
  pausePanel.hidden = true;
  chapterPanel.hidden = true;
  buildLevelGrid();
  levelsPanel.hidden = false;
};

const showChapterComplete = (): void => {
  paused = true;
  transitioning = false;
  shell.classList.remove("level-complete");
  totalBolts.textContent = `${save.totalBolts()} / 15`;
  buildLevelGrid();
  chapterPanel.hidden = false;
};

const handleCompletion = (): void => {
  if (transitioning) return;
  transitioning = true;
  const state = simulation.getRenderState();
  const result = {
    level: currentLevel,
    noRestart: restartCount === 0,
    hiddenBolt: state.hiddenBolt.collected,
  };
  save.complete(result);
  const earned = 1 + Number(result.noRestart) + Number(result.hiddenBolt);
  resultBolts.textContent = `${"◆".repeat(earned)}${"◇".repeat(3 - earned)}`;
  resultToast.classList.add("is-visible");
  shell.classList.add("level-complete");
  audio.success();
  window.setTimeout(() => {
    if (currentLevel < 5) startLevel(currentLevel + 1, false);
    else showChapterComplete();
  }, save.data.settings.reducedMotion ? 300 : 760);
};

const handleFailure = (): void => {
  if (failureTimer !== undefined) return;
  shell.classList.add("level-failed");
  audio.failure();
  failureTimer = window.setTimeout(() => startLevel(currentLevel, true), save.data.settings.reducedMotion ? 180 : 420);
};

const updateHud = (): void => {
  const state = simulation.getRenderState();
  const contact = state.contacts.find((item) => item.invalidDeep) ?? state.contacts.find((item) => item.impulse > 0);
  if (contact?.invalidDeep) {
    contactStatus.textContent = "贴得太深 · 空转";
    contactStatus.dataset.state = "invalid";
  } else if (contact) {
    contactStatus.textContent = "切向施力";
    contactStatus.dataset.state = "contact";
    if (!hintDismissed) {
      hintDismissed = true;
      inputHint.classList.add("is-hidden");
      firstLevelDemo.classList.add("is-hidden");
    }
  } else if (state.wheel.active) {
    contactStatus.textContent = "寻找轮缘";
    contactStatus.dataset.state = "active";
  } else {
    contactStatus.textContent = "轮缘空转";
    contactStatus.dataset.state = "idle";
  }
  if (currentLevel === 5 && state.phase > 0 && !state.completed) {
    objectiveVerb.textContent = "现在换到上方";
    hintCopy.textContent = "下轮缘向左 · 扫入高处杯中";
  }
  const impulse = state.contacts.reduce((sum, item) => sum + item.impulse, 0);
  audio.update(state.wheel.active && !paused, impulse, Boolean(contact?.invalidDeep));
  if (state.completed) handleCompletion();
  if (state.failed) handleFailure();
};

required<HTMLButtonElement>("reset-button").addEventListener("click", () => startLevel(currentLevel, true));
required<HTMLButtonElement>("pause-button").addEventListener("click", () => setPaused(true));
required<HTMLButtonElement>("continue-button").addEventListener("click", () => setPaused(false));
required<HTMLButtonElement>("pause-restart-button").addEventListener("click", () => startLevel(currentLevel, true));
required<HTMLButtonElement>("levels-button").addEventListener("click", () => showLevels(false));
required<HTMLButtonElement>("levels-close-button").addEventListener("click", () => {
  levelsPanel.hidden = true;
  if (levelsFromChapter) {
    chapterPanel.hidden = false;
    paused = true;
  } else {
    setPaused(false);
  }
});
required<HTMLButtonElement>("chapter-levels-button").addEventListener("click", () => showLevels(true));
required<HTMLButtonElement>("replay-chapter-button").addEventListener("click", () => {
  chapterPanel.hidden = true;
  startLevel(1, false);
});

soundToggle.addEventListener("change", () => {
  save.setSetting("sound", soundToggle.checked);
  audio.setEnabled(soundToggle.checked);
});
hapticsToggle.addEventListener("change", () => {
  save.setSetting("haptics", hapticsToggle.checked);
  audio.setHapticsEnabled(hapticsToggle.checked);
});
motionToggle.addEventListener("change", () => {
  save.setSetting("reducedMotion", motionToggle.checked);
  shell.classList.toggle("reduced-motion", motionToggle.checked);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key.toLowerCase() === "r") startLevel(currentLevel, true);
  if (event.key === "Escape" || event.key.toLowerCase() === "p") {
    if (!chapterPanel.hidden || !levelsPanel.hidden) return;
    setPaused(!paused);
  }
});
window.addEventListener("blur", () => {
  if (!transitioning) setPaused(true);
});
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  accumulator = 0;
  if (document.hidden) audio.suspend();
});

applySettings();
updateLevelHud();
buildLevelGrid();
loading.classList.add("is-hidden");

renderer.renderer.setAnimationLoop((time) => {
  const frameDelta = Math.min(MAX_FRAME_DELTA, Math.max(0, (time - lastTime) / 1000));
  lastTime = time;
  if (!paused && !transitioning) {
    accumulator += frameDelta;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_CATCH_UP_STEPS) {
      simulation.step(input.sample(), FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_CATCH_UP_STEPS) accumulator = 0;
  }
  updateHud();
  renderer.render(simulation.getRenderState(), frameDelta);
});

window.addEventListener("beforeunload", () => {
  input.dispose();
  renderer.dispose();
});
