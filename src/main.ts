import RAPIER from "@dimforge/rapier2d-compat";
import "./style.css";
import { MotorAudio } from "./audio/MotorAudio";
import { CampaignSave } from "./game/campaign/CampaignSave";
import { CampaignSimulation } from "./game/campaign/CampaignSimulation";
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_LEVELS,
  TOTAL_LEVELS,
  campaignChapterForLevel,
  getCampaignLevel,
} from "./game/campaign/levels";
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
const chapterLabel = required<HTMLElement>("chapter-label");
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
const chapterTabs = required<HTMLDivElement>("chapter-tabs");
const levelsChapterLabel = required<HTMLElement>("levels-chapter-label");
const levelsChapterName = required<HTMLElement>("levels-chapter-name");
const levelsChapterCopy = required<HTMLElement>("levels-chapter-copy");
const chapterCompleteName = required<HTMLElement>("chapter-complete-name");
const chapterCompleteCopy = required<HTMLElement>("chapter-complete-copy");
const chapterRewardName = required<HTMLElement>("chapter-reward-name");
const nextChapterButton = required<HTMLButtonElement>("next-chapter-button");
const soundToggle = required<HTMLInputElement>("sound-toggle");
const hapticsToggle = required<HTMLInputElement>("haptics-toggle");
const motionToggle = required<HTMLInputElement>("motion-toggle");
const debugPanel = required<HTMLElement>("debug-panel");
const debugMetrics = required<HTMLElement>("debug-metrics");
const debugState = required<HTMLElement>("debug-state");

const searchParams = new URLSearchParams(window.location.search);
const save = new CampaignSave();
const audio = new MotorAudio();
const requestedDebugLevel = searchParams.get("debug") === "1" ? Number(searchParams.get("level")) : Number.NaN;
let currentLevel = Number.isFinite(requestedDebugLevel)
  ? Math.min(TOTAL_LEVELS, Math.max(1, requestedDebugLevel))
  : Math.min(TOTAL_LEVELS, Math.max(1, save.data.highestUnlocked));
let simulation = new CampaignSimulation(getCampaignLevel(currentLevel));
const renderer = new CampaignRenderer(canvas, simulation.getRenderState());
const input = new InputController(canvas, renderer.clientToWorld, () => audio.unlock());

let accumulator = 0;
let lastTime = performance.now();
let paused = false;
let transitioning = false;
let restartCount = 0;
let hintDismissed = false;
let lastPhase = simulation.getRenderState().phase;
let failureTimer: number | undefined;
let levelsFromChapter = false;
let selectedChapter = campaignChapterForLevel(currentLevel).id;
let debugVisible = searchParams.get("debug") === "1";

const setDebugVisible = (visible: boolean): void => {
  debugVisible = visible;
  debugPanel.hidden = !visible;
  renderer.setDebugVisible(visible);
};

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
  const chapter = CAMPAIGN_CHAPTERS[selectedChapter - 1] ?? CAMPAIGN_CHAPTERS[0]!;
  levelsChapterLabel.textContent = `第${chapter.id}章`;
  levelsChapterName.textContent = chapter.name;
  levelsChapterCopy.textContent = chapter.description;
  chapterTabs.replaceChildren();
  for (const item of CAMPAIGN_CHAPTERS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "chapter-tab";
    tab.textContent = String(item.id);
    tab.ariaLabel = `第${item.id}章 ${item.name}`;
    tab.dataset.active = String(item.id === selectedChapter);
    tab.disabled = item.start > save.data.highestUnlocked;
    tab.addEventListener("click", () => {
      selectedChapter = item.id;
      buildLevelGrid();
    });
    chapterTabs.append(tab);
  }
  levelGrid.replaceChildren();
  for (const level of CAMPAIGN_LEVELS.filter((item) => item.chapter === chapter.id)) {
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
  const chapter = campaignChapterForLevel(currentLevel);
  chapterLabel.textContent = `第${chapter.id}章 · ${chapter.name}`;
  levelProgress.textContent = `${currentLevel} / ${TOTAL_LEVELS}`;
  objectiveVerb.textContent = level.verb;
  objectiveName.textContent = level.name;
  hintCopy.textContent = currentLevel === 1
    ? "黄轮贴住齿条下沿 · 向右拨入卡槽"
    : `按住拖动 · ${level.hint}`;
  inputHint.classList.remove("is-hidden");
  firstLevelDemo.classList.toggle("is-hidden", currentLevel !== 1);
  hintDismissed = false;
  lastPhase = simulation.getRenderState().phase;
};

const startLevel = (level: number, countRestart: boolean): void => {
  if (failureTimer !== undefined) window.clearTimeout(failureTimer);
  if (countRestart) restartCount += 1;
  else restartCount = 0;
  currentLevel = Math.max(1, Math.min(TOTAL_LEVELS, level));
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
  selectedChapter = campaignChapterForLevel(currentLevel).id;
  buildLevelGrid();
  levelsPanel.hidden = false;
};

const showChapterComplete = (): void => {
  const chapter = campaignChapterForLevel(currentLevel);
  paused = true;
  transitioning = false;
  shell.classList.remove("level-complete");
  totalBolts.textContent = `${save.totalBolts(chapter.start, chapter.end)} / 15`;
  chapterCompleteName.textContent = chapter.name;
  chapterCompleteCopy.textContent = chapter.id === 6
    ? "六章工坊测试全部完成。你已经掌握轮缘、控力、机关、轨迹与接力。"
    : chapter.description;
  chapterRewardName.textContent = chapter.reward;
  nextChapterButton.textContent = chapter.id < CAMPAIGN_CHAPTERS.length ? "进入下一章" : "从第一关重玩";
  selectedChapter = chapter.id;
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
  audio.success(state.goal.kind);
  window.setTimeout(() => {
    if (currentLevel < TOTAL_LEVELS && currentLevel % 5 !== 0) startLevel(currentLevel + 1, false);
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
  if (state.phase > lastPhase) audio.checkpoint();
  lastPhase = state.phase;
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
    contactStatus.textContent = currentLevel === 1 ? "保持贴住 · 缓慢向右" : "轮缘空转";
    contactStatus.dataset.state = "idle";
  }
  if (state.phase > 0 && !state.completed && state.level.phaseHint) {
    objectiveVerb.textContent = state.level.mechanismThenObject ? "机关完成 · 第二阶段" : "现在换边";
    hintCopy.textContent = state.level.phaseHint;
  }
  const impulse = state.contacts.reduce((sum, item) => sum + item.impulse, 0);
  if (debugVisible) {
    const stats = renderer.getRenderStats();
    debugMetrics.textContent = `L${currentLevel} · J ${impulse.toFixed(3)} · ${stats.calls} calls / ${stats.triangles} tris`;
    debugState.textContent = state.object
      ? `p ${state.object.position.x.toFixed(2)}, ${state.object.position.y.toFixed(2)} · v ${state.object.linearVelocity.x.toFixed(2)}, ${state.object.linearVelocity.y.toFixed(2)} · ω ${state.object.angularVelocity.toFixed(2)}`
      : `机构 ${state.mechanism?.axis ?? "y"} ${state.mechanism
          ? state.mechanism.position[state.mechanism.axis].toFixed(2)
          : "—"} · 进度 ${Math.round((state.mechanism?.progress ?? 0) * 100)}%`;
  }
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
  startLevel(campaignChapterForLevel(currentLevel).start, false);
});
nextChapterButton.addEventListener("click", () => {
  chapterPanel.hidden = true;
  startLevel(currentLevel < TOTAL_LEVELS ? currentLevel + 1 : 1, false);
});
required<HTMLButtonElement>("debug-prev-button").addEventListener("click", () => startLevel(currentLevel - 1, false));
required<HTMLButtonElement>("debug-reset-button").addEventListener("click", () => startLevel(currentLevel, true));
required<HTMLButtonElement>("debug-next-button").addEventListener("click", () => startLevel(currentLevel + 1, false));

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
  if (event.key.toLowerCase() === "d") setDebugVisible(!debugVisible);
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
setDebugVisible(debugVisible);
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
