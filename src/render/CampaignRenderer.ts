import * as THREE from "three";
import { VIEW_HEIGHT, WHEEL_RADIUS } from "../game/config";
import type { Vec2 } from "../game/math/vec2";
import type { ContactFeedback } from "../game/simulation/types";
import type { CampaignRenderState } from "../game/campaign/types";

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

const zVector = (point: Vec2, z = 2.32): THREE.Vector3 => new THREE.Vector3(point.x, point.y, z);

export class CampaignRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly content = new THREE.Group();
  private readonly camera = new THREE.OrthographicCamera(-4.5, 4.5, 8, -8, 0.1, 50);
  private readonly wheel = this.createWheel();
  private readonly sweepLine: THREE.Line;
  private readonly tangentArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd34e);
  private readonly normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.65, 0x53d9ff);
  private readonly sparks: Spark[] = [];
  private object?: THREE.Group;
  private mechanism?: THREE.Group;
  private goal?: THREE.Group;
  private goalBeacon?: THREE.Group;
  private hiddenBolt?: THREE.Group;
  private checkpoint?: THREE.Group;
  private checkpointBeacon?: THREE.Group;
  private wheelSpin = 0;
  private elapsed = 0;
  private lastSparkAt = 0;
  private loadedLevel = 0;
  private debugVisible = false;

  constructor(private readonly canvas: HTMLCanvasElement, initial: CampaignRenderState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x121522);
    this.camera.position.set(0, 0, 20);

    this.scene.add(this.content);
    this.sweepLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0x61e4ff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9 }),
    );
    this.sweepLine.computeLineDistances();
    this.scene.add(this.sweepLine, this.tangentArrow, this.normalArrow);
    this.setDebugVisible(false);
    this.createLights();
    this.loadLevel(initial);
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.resize();
  }

  clientToWorld = (clientX: number, clientY: number): Vec2 => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return {
      x: THREE.MathUtils.lerp(this.camera.left, this.camera.right, (x + 1) * 0.5),
      y: THREE.MathUtils.lerp(this.camera.bottom, this.camera.top, (y + 1) * 0.5),
    };
  };

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.sweepLine.visible = visible;
    this.tangentArrow.visible = false;
    this.normalArrow.visible = false;
  }

  loadLevel(state: CampaignRenderState): void {
    while (this.content.children.length > 0) {
      const child = this.content.children.pop();
      child?.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    }
    this.loadedLevel = state.level.id;
    this.object = undefined;
    this.mechanism = undefined;
    this.goal = undefined;
    this.goalBeacon = undefined;
    this.hiddenBolt = undefined;
    this.checkpoint = undefined;
    this.checkpointBeacon = undefined;
    this.createBackdrop(state);
    this.createPlatforms(state);
    this.goal = this.createGoal(state);
    this.hiddenBolt = this.createHiddenBolt(state.level.accent);
    if (state.level.phaseCheckpoint) {
      this.checkpoint = this.createCheckpoint();
      this.checkpoint.position.set(
        state.level.phaseCheckpoint.position.x,
        state.level.phaseCheckpoint.position.y,
        0.2,
      );
      this.content.add(this.checkpoint);
    }
    if (state.object) this.object = this.createObject(state);
    if (state.mechanism) this.mechanism = this.createMechanism(state);
    if (this.object) this.content.add(this.object);
    if (this.mechanism) this.content.add(this.mechanism);
    if (this.goal) this.content.add(this.goal);
    if (this.hiddenBolt) this.content.add(this.hiddenBolt);
    this.content.add(this.wheel);
  }

  render(state: CampaignRenderState, delta: number): void {
    if (state.level.id !== this.loadedLevel) this.loadLevel(state);
    this.elapsed += delta;
    this.wheelSpin -= delta * (state.wheel.active ? 9.2 : 2.2);
    this.wheel.position.set(state.wheel.position.x, state.wheel.position.y, 2.15);
    this.wheel.rotation.z = this.wheelSpin;
    this.wheel.scale.setScalar(state.completed ? 1 + Math.sin(this.elapsed * 26) * 0.05 : 1);

    if (this.object && state.object) {
      this.object.position.set(state.object.position.x, state.object.position.y, 0.9);
      this.object.rotation.z = state.object.rotation;
    }
    if (this.mechanism && state.mechanism) {
      this.mechanism.position.set(state.mechanism.position.x, state.mechanism.position.y, 0.82);
      const rotor = this.mechanism.userData.rotor as THREE.Group | undefined;
      if (rotor) rotor.rotation.z = state.mechanism.rotation;
      const coupledRotor = this.mechanism.userData.coupledRotor as THREE.Group | undefined;
      if (coupledRotor) coupledRotor.rotation.z = -state.mechanism.rotation * 0.84;
      const guide = this.mechanism.userData.guide as THREE.Group | undefined;
      if (guide) {
        guide.visible = state.phase === 0;
        guide.scale.setScalar(1 + Math.sin(this.elapsed * 3.2) * 0.025);
      }
      this.mechanism.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
        if (!object.userData.mechanismAccent) return;
        const active = !state.level.mechanismThenObject || state.phase === 0;
        object.material.emissiveIntensity = active ? 0.35 + state.mechanism!.progress * 0.7 : 0.08;
      });
    }
    if (this.goal) {
      const isActive = state.goal.active;
      const pulse = 1 + state.goal.progress * 0.11 + (isActive ? Math.sin(this.elapsed * 3.2) * 0.018 : 0);
      this.goal.position.set(state.goal.position.x, state.goal.position.y, 0.42);
      this.goal.scale.set(pulse, pulse, 1);
      this.updateTargetAppearance(this.goal, isActive, state.completed, state.goal.progress);
      if (this.goalBeacon) {
        this.goalBeacon.visible = isActive && !state.completed;
        this.goalBeacon.position.y = Number(this.goalBeacon.userData.baseY) + Math.sin(this.elapsed * 3.2) * 0.055;
      }
    }
    if (this.hiddenBolt) {
      this.hiddenBolt.visible = !state.hiddenBolt.collected;
      this.hiddenBolt.rotation.z = this.elapsed * 0.7;
      this.hiddenBolt.position.set(state.hiddenBolt.position.x, state.hiddenBolt.position.y + Math.sin(this.elapsed * 2.8) * 0.06, 1.05);
    }
    if (this.checkpoint) {
      const checkpointPhase = state.level.mechanismThenObject ? 1 : 0;
      const active = state.phase === checkpointPhase;
      const passed = state.phase > checkpointPhase;
      this.checkpoint.scale.setScalar(passed ? 1.06 : active ? 1 + Math.sin(this.elapsed * 3.5) * 0.025 : 1);
      this.updateTargetAppearance(this.checkpoint, active, passed, passed ? 1 : 0, passed);
      if (this.checkpointBeacon) {
        this.checkpointBeacon.position.x = Number(this.checkpointBeacon.userData.baseX)
          + (active ? Math.sin(this.elapsed * 3.5) * 0.055 : 0);
      }
    }

    const active = state.contacts.find((contact) => !contact.invalidDeep && contact.impulse > 0)
      ?? state.contacts.find((contact) => contact.invalidDeep);
    this.updateDebug(state, active);
    this.updateSparks(active, delta, state.completed);
    this.renderer.render(this.scene, this.camera);
  }

  getRenderStats(): { calls: number; triangles: number } {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.renderer.dispose();
  }

  private createLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfff4dc, 0x252947, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(-4, 7, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    this.scene.add(key);
    const rim = new THREE.PointLight(0x6b7dff, 20, 22);
    rim.position.set(3.5, -4, 6);
    this.scene.add(rim);
  }

  private createBackdrop(state: CampaignRenderState): void {
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(8.68, 15.25, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x222638, roughness: 0.88, metalness: 0.08 }),
    );
    back.position.z = -1.1;
    back.receiveShadow = true;
    this.content.add(back);

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x4b5069, roughness: 0.43, metalness: 0.66 });
    const horizontal = new THREE.BoxGeometry(9.05, 0.22, 0.42);
    const vertical = new THREE.BoxGeometry(0.22, 15.55, 0.42);
    for (const [geometry, x, y] of [
      [horizontal, 0, 7.67], [horizontal, 0, -7.67], [vertical, -4.46, 0], [vertical, 4.46, 0],
    ] as const) {
      const mesh = new THREE.Mesh(geometry, frameMaterial);
      mesh.position.set(x, y, -0.72);
      this.content.add(mesh);
    }

    const accent = new THREE.Color(state.level.accent);
    for (let index = 0; index < 7; index += 1) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(7.6 - index * 0.55, 0.025, 0.018),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.035 + index * 0.008 }),
      );
      strip.position.set(0, 5.9 - index * 1.8, -0.82);
      this.content.add(strip);
    }
  }

  private createPlatforms(state: CampaignRenderState): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x697086, roughness: 0.52, metalness: 0.42 });
    const slickMaterial = new THREE.MeshStandardMaterial({
      color: 0x507b91,
      emissive: 0x16566f,
      emissiveIntensity: 0.42,
      roughness: 0.12,
      metalness: 0.78,
    });
    const guideMaterial = new THREE.MeshStandardMaterial({
      color: 0x466779,
      emissive: 0x143e50,
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.5,
      transparent: true,
      opacity: 0.58,
    });
    const edge = new THREE.MeshStandardMaterial({ color: state.level.accent, emissive: state.level.accent, emissiveIntensity: 0.22, roughness: 0.38 });
    for (const platform of state.platforms) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(platform.halfExtents.x * 2, platform.halfExtents.y * 2, 0.7),
        platform.surface === "slick" ? slickMaterial : platform.surface === "guide" ? guideMaterial : material,
      );
      body.castShadow = true;
      body.receiveShadow = true;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(platform.halfExtents.x * 2, 0.045, 0.74), edge);
      lip.position.y = platform.halfExtents.y + 0.025;
      if (platform.surface === "slick") {
        lip.scale.y = 1.8;
        lip.material = new THREE.MeshStandardMaterial({
          color: 0x61e4ff,
          emissive: 0x1a8aa8,
          emissiveIntensity: 0.85,
          roughness: 0.16,
        });
      } else if (platform.surface === "guide") {
        body.scale.z = 0.46;
        lip.material = new THREE.MeshStandardMaterial({
          color: state.level.accent,
          emissive: state.level.accent,
          emissiveIntensity: 0.38,
          transparent: true,
          opacity: 0.72,
        });
      }
      group.add(body, lip);
      group.position.set(platform.position.x, platform.position.y, 0);
      group.rotation.z = platform.rotation;
      this.content.add(group);
    }
  }

  private createWheel(): THREE.Group {
    const group = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(WHEEL_RADIUS - 0.1, 0.14, 14, 44),
      new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x9b4b00, emissiveIntensity: 0.72, roughness: 0.34, metalness: 0.28 }),
    );
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.42, 24),
      new THREE.MeshStandardMaterial({ color: 0x303444, roughness: 0.24, metalness: 0.76 }),
    );
    hub.rotation.x = Math.PI / 2;
    for (let index = 0; index < 6; index += 1) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.075, 0.13),
        new THREE.MeshStandardMaterial({ color: 0xffe18a, emissive: 0x704000, emissiveIntensity: 0.5 }),
      );
      spoke.position.set(Math.cos(index * Math.PI / 3) * 0.27, Math.sin(index * Math.PI / 3) * 0.27, 0.08);
      spoke.rotation.z = index * Math.PI / 3;
      group.add(spoke);
    }
    group.add(rim, hub);
    // A wheel-shaped shadow reads as a second controllable wheel in the flat
    // playfield, so the power wheel deliberately does not cast one.
    group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = false; });
    return group;
  }

  private createObject(state: CampaignRenderState): THREE.Group {
    const object = state.level.object!;
    if (object.kind === "box" || object.kind === "cart" || object.kind === "package" || object.kind === "doll") {
      return this.createBoxObject(state);
    }
    const group = new THREE.Group();
    const radius = object.radius ?? 0.56;
    if (object.kind === "disc") {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.34, 32),
        new THREE.MeshStandardMaterial({ color: 0x8fa5ff, emissive: 0x27367e, emissiveIntensity: 0.28, roughness: 0.3, metalness: 0.52 }),
      );
      body.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0xe8ecff, metalness: 0.7, roughness: 0.24 }));
      hub.rotation.x = Math.PI / 2;
      group.add(body, hub);
    } else {
      const material = object.kind === "glass"
        ? new THREE.MeshPhysicalMaterial({ color: 0x9beaff, transparent: true, opacity: 0.58, transmission: 0.42, roughness: 0.08, metalness: 0.02, clearcoat: 1 })
        : new THREE.MeshStandardMaterial({
            color: object.kind === "foam" ? 0xb7efff : 0x45b7ff,
            roughness: object.kind === "foam" ? 0.78 : 0.34,
            metalness: object.kind === "foam" ? 0 : 0.1,
          });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 30, 22), material);
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 0.008, object.kind === "glass" ? 0.018 : 0.026, 8, 36),
        new THREE.MeshBasicMaterial({ color: object.kind === "glass" ? 0xe9fcff : state.level.accent, transparent: true, opacity: 0.9 }),
      );
      group.add(sphere, stripe);
    }
    group.traverse((object3d) => { if (object3d instanceof THREE.Mesh) object3d.castShadow = true; });
    return group;
  }

  private createBoxObject(state: CampaignRenderState): THREE.Group {
    const group = new THREE.Group();
    const object = state.level.object!;
    const halfExtents = object.halfExtents ?? { x: 0.64, y: 0.64 };
    if (object.kind === "doll") {
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(halfExtents.x * 0.72, halfExtents.y * 1.05, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0xffaa7c, roughness: 0.64, metalness: 0.02 }),
      );
      const visor = new THREE.Mesh(new THREE.BoxGeometry(halfExtents.x * 0.82, 0.16, 0.58), new THREE.MeshStandardMaterial({ color: 0x27324a, emissive: 0x4ac6ff, emissiveIntensity: 0.35 }));
      visor.position.set(0, halfExtents.y * 0.35, 0.35);
      group.add(body, visor);
      return group;
    }
    if (object.kind === "cart") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 1.45, 0.78),
        new THREE.MeshStandardMaterial({ color: 0xe4a64f, roughness: 0.48, metalness: 0.28 }),
      );
      body.position.y = halfExtents.y * 0.18;
      group.add(body);
      for (const x of [-halfExtents.x * 0.62, halfExtents.x * 0.62]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 18), new THREE.MeshStandardMaterial({ color: 0x222838, metalness: 0.62, roughness: 0.3 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, -halfExtents.y * 0.58, 0.38);
        group.add(wheel);
      }
      return group;
    }
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, 0.84, 2, 2, 1),
      new THREE.MeshStandardMaterial({ color: object.kind === "package" ? 0xd9a767 : 0xc4864e, roughness: 0.7, metalness: 0.03 }),
    );
    const bands = new THREE.MeshStandardMaterial({ color: 0x765035, roughness: 0.58, metalness: 0.12 });
    group.add(
      body,
      new THREE.Mesh(new THREE.BoxGeometry(halfExtents.x * 2 + 0.04, 0.12, 0.88), bands),
      new THREE.Mesh(new THREE.BoxGeometry(0.12, halfExtents.y * 2 + 0.04, 0.88), bands),
    );
    group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    return group;
  }

  private createMechanism(state: CampaignRenderState): THREE.Group {
    const mechanism = state.mechanism!;
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: state.level.accent, emissive: state.level.accent, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.68 });
    if (mechanism.response === "rotor") {
      const rotor = new THREE.Group();
      const radius = mechanism.radius;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.77, radius * 0.16, 12, 42), material);
      rim.userData.mechanismAccent = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.48, 24), new THREE.MeshStandardMaterial({ color: 0x30384c, metalness: 0.78, roughness: 0.24 }));
      hub.rotation.x = Math.PI / 2;
      rotor.add(rim, hub);
      const spokeCount = mechanism.kind === "valve" ? 3 : mechanism.kind === "pulley" ? 4 : 6;
      for (let index = 0; index < spokeCount; index += 1) {
        const angle = (index / spokeCount) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.92, 0.085, 0.18), new THREE.MeshStandardMaterial({ color: 0xe8edf8, metalness: 0.68, roughness: 0.25 }));
        spoke.position.set(Math.cos(angle) * radius * 0.22, Math.sin(angle) * radius * 0.22, 0.06);
        spoke.rotation.z = angle;
        rotor.add(spoke);
      }
      if (mechanism.kind === "gear") {
        for (let index = 0; index < 12; index += 1) {
          const angle = (index / 12) * Math.PI * 2;
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.22, radius * 0.12, 0.34), material);
          tooth.userData.mechanismAccent = true;
          tooth.position.set(Math.cos(angle) * radius * 0.9, Math.sin(angle) * radius * 0.9, 0);
          tooth.rotation.z = angle;
          rotor.add(tooth);
        }
      }
      if (mechanism.kind === "winch") {
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.58, 24), new THREE.MeshStandardMaterial({ color: 0xaab3c7, metalness: 0.78, roughness: 0.26 }));
        spool.rotation.x = Math.PI / 2;
        rotor.add(spool);
      }
      if (state.level.id === 24 || state.level.id === 27) {
        const coupled = this.createCoupledRotor(radius * 0.67, state.level.accent, state.level.id === 27);
        coupled.position.set(radius * 1.75, radius * 0.24, -0.02);
        const link = new THREE.Mesh(
          new THREE.BoxGeometry(radius * 1.52, 0.09, 0.11),
          new THREE.MeshStandardMaterial({ color: 0x8690a6, metalness: 0.64, roughness: 0.32 }),
        );
        link.position.set(radius * 0.88, radius * 0.1, -0.18);
        link.rotation.z = 0.08;
        group.userData.coupledRotor = coupled;
        group.add(link, coupled);
      }
      group.userData.rotor = rotor;
      group.add(rotor);
      this.addMechanismGuide(state, group);
      return group;
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(mechanism.halfExtents.x * 2, mechanism.halfExtents.y * 2, 0.78), material);
    body.userData.mechanismAccent = true;
    body.castShadow = true;
    if (mechanism.kind === "rack") {
      group.add(body);
      const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xdde4f2, roughness: 0.28, metalness: 0.72 });
      for (let index = -3; index <= 3; index += 1) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.82), toothMaterial);
        tooth.position.set(index * 0.24, -mechanism.halfExtents.y - 0.08, 0);
        group.add(tooth);
      }
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, mechanism.halfExtents.y * 2.3, 0.86), toothMaterial);
      nose.position.x = mechanism.halfExtents.x - 0.05;
      group.add(nose);
      this.addMechanismGuide(state, group);
      return group;
    }
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(mechanism.halfExtents.x * 2.5, 0.18, 0.88),
      new THREE.MeshStandardMaterial({ color: 0xdde4f2, roughness: 0.24, metalness: 0.75 }),
    );
    cap.position.y = mechanism.kind === "bolt" ? mechanism.halfExtents.y - 0.04 : -mechanism.halfExtents.y + 0.04;
    group.add(body, cap);
    this.addMechanismGuide(state, group);
    return group;
  }

  private createCoupledRotor(radius: number, accent: number, teeth: boolean): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.28, metalness: 0.68, roughness: 0.28 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.74, radius * 0.16, 10, 32), material);
    rim.userData.mechanismAccent = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 0.38, 18), new THREE.MeshStandardMaterial({ color: 0x31394d, metalness: 0.74, roughness: 0.25 }));
    hub.rotation.x = Math.PI / 2;
    group.add(rim, hub);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.74, 0.065, 0.13), new THREE.MeshStandardMaterial({ color: 0xe3e8f3, metalness: 0.62, roughness: 0.26 }));
      spoke.rotation.z = angle;
      group.add(spoke);
    }
    if (teeth) {
      for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.2, radius * 0.1, 0.24), material);
        tooth.position.set(Math.cos(angle) * radius * 0.86, Math.sin(angle) * radius * 0.86, 0);
        tooth.rotation.z = angle;
        group.add(tooth);
      }
    }
    return group;
  }

  private addMechanismGuide(state: CampaignRenderState, group: THREE.Group): void {
    if (!state.level.mechanismThenObject || !state.mechanism) return;
    const guide = new THREE.Group();
    if (state.mechanism.response === "rotor") {
      const ring = this.targetMesh(new THREE.TorusGeometry(state.mechanism.radius * 1.08, 0.055, 8, 40), "accent");
      guide.add(ring);
    } else {
      const width = state.mechanism.halfExtents.x * 2 + 0.18;
      const height = state.mechanism.halfExtents.y * 2 + 0.18;
      const horizontal = new THREE.BoxGeometry(width, 0.055, 0.11);
      const vertical = new THREE.BoxGeometry(0.055, height, 0.11);
      const top = this.targetMesh(horizontal, "accent");
      const bottom = this.targetMesh(horizontal.clone(), "accent");
      const left = this.targetMesh(vertical, "accent");
      const right = this.targetMesh(vertical.clone(), "accent");
      top.position.y = height * 0.5;
      bottom.position.y = -height * 0.5;
      left.position.x = -width * 0.5;
      right.position.x = width * 0.5;
      guide.add(top, bottom, left, right);
    }
    const pointer = this.createPointer("down", 0.14);
    pointer.position.y = state.mechanism.halfExtents.y + 0.42;
    guide.add(pointer);
    group.userData.guide = guide;
    group.add(guide);
  }

  private createGoal(state: CampaignRenderState): THREE.Group {
    const group = new THREE.Group();
    const { goal } = state;
    const width = goal.halfExtents.x * 2;
    const height = goal.halfExtents.y * 2;
    const backing = this.targetMesh(
      new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.16),
      "dark",
    );
    backing.position.z = -0.08;
    group.add(backing);

    if (goal.kind === "slot" || goal.kind === "shelf") {
      const rail = Math.min(0.13, Math.min(width, height) * 0.19);
      const horizontal = new THREE.BoxGeometry(width + 0.12, rail, 0.28);
      const vertical = new THREE.BoxGeometry(rail, height + 0.12, 0.28);
      const top = this.targetMesh(horizontal, "accent");
      const bottom = this.targetMesh(horizontal.clone(), "accent");
      const left = this.targetMesh(vertical, "accent");
      const right = this.targetMesh(vertical.clone(), "accent");
      top.position.y = goal.halfExtents.y;
      bottom.position.y = -goal.halfExtents.y;
      left.position.x = -goal.halfExtents.x;
      right.position.x = goal.halfExtents.x;
      group.add(top, bottom, left, right);
      if (state.level.id === 1) {
        this.addApproachChevrons(group, "right", { x: -goal.halfExtents.x - 0.42, y: 0 });
      } else {
        this.addApproachChevrons(group, "up", { x: 0, y: -goal.halfExtents.y - 0.38 });
      }
    } else if (goal.kind === "plate" || goal.kind === "dock") {
      const base = this.targetMesh(new THREE.BoxGeometry(width + 0.18, height + 0.2, 0.28), "surface");
      const face = this.targetMesh(new THREE.BoxGeometry(width, Math.max(0.12, height * 0.48), 0.16), "accent");
      face.position.set(0, 0.06, 0.18);
      const leftPin = this.targetMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), "accent");
      const rightPin = this.targetMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), "accent");
      leftPin.rotation.x = Math.PI / 2;
      rightPin.rotation.x = Math.PI / 2;
      leftPin.position.set(-goal.halfExtents.x * 0.72, 0.05, 0.2);
      rightPin.position.set(goal.halfExtents.x * 0.72, 0.05, 0.2);
      group.add(base, face, leftPin, rightPin);
      this.addApproachChevrons(group, "down", { x: 0, y: goal.halfExtents.y + 0.42 });
    } else if (goal.kind === "seal" || goal.kind === "bell") {
      const circular = goal.halfExtents.y > 0.55;
      const seat = this.targetMesh(new THREE.BoxGeometry(width + 0.2, height + 0.18, 0.25), circular ? "dark" : "surface");
      const outer = this.targetMesh(new THREE.TorusGeometry(0.55, 0.075, 10, 40), "accent");
      const inner = this.targetMesh(new THREE.TorusGeometry(0.31, 0.035, 8, 32), "accent");
      outer.scale.set(goal.halfExtents.x / 0.72, goal.halfExtents.y / (circular ? 0.72 : 0.39), 1);
      inner.scale.set(goal.halfExtents.x / 0.72, goal.halfExtents.y / (circular ? 0.72 : 0.39), 1);
      outer.position.z = 0.2;
      inner.position.z = 0.21;
      group.add(seat, outer, inner);
      this.addApproachChevrons(group, "down", { x: 0, y: goal.halfExtents.y + 0.43 });
    } else {
      const well = this.targetMesh(new THREE.BoxGeometry(width, height, 0.12), "dark");
      well.position.z = -0.01;
      const entry = goal.entry ?? "right";
      const horizontal = this.targetMesh(new THREE.BoxGeometry(width + 0.1, 0.14, 0.42), "accent");
      horizontal.position.y = entry === "bottom" ? goal.halfExtents.y : -goal.halfExtents.y;
      group.add(well, horizontal);
      if (entry === "top" || entry === "bottom") {
        const left = this.targetMesh(new THREE.BoxGeometry(0.14, height + 0.1, 0.42), "accent");
        const right = this.targetMesh(new THREE.BoxGeometry(0.14, height + 0.1, 0.42), "accent");
        left.position.x = -goal.halfExtents.x;
        right.position.x = goal.halfExtents.x;
        group.add(left, right);
        this.addApproachChevrons(group, entry === "bottom" ? "up" : "down", {
          x: 0,
          y: (entry === "bottom" ? -1 : 1) * (goal.halfExtents.y + 0.4),
        });
      } else {
        const wall = this.targetMesh(new THREE.BoxGeometry(0.14, height + 0.1, 0.42), "accent");
        wall.position.x = entry === "left" ? goal.halfExtents.x : -goal.halfExtents.x;
        group.add(wall);
        this.addApproachChevrons(group, entry === "left" ? "right" : "left", {
          x: (entry === "left" ? -1 : 1) * (goal.halfExtents.x + 0.42),
          y: 0.08,
        });
      }
    }

    this.goalBeacon = this.createTargetBeacon();
    this.goalBeacon.position.y = goal.halfExtents.y + 0.72;
    this.goalBeacon.userData.baseY = this.goalBeacon.position.y;
    group.add(this.goalBeacon);
    group.position.set(goal.position.x, goal.position.y, 0.42);
    return group;
  }

  private createHiddenBolt(accent: number): THREE.Group {
    const group = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0xffdc64, emissive: accent, emissiveIntensity: 0.32, roughness: 0.3, metalness: 0.72 }),
    );
    head.rotation.x = Math.PI / 2;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.08), new THREE.MeshBasicMaterial({ color: 0x5a4318 }));
    slot.position.z = 0.08;
    group.add(head, slot);
    return group;
  }

  private createCheckpoint(): THREE.Group {
    const group = new THREE.Group();
    const backing = this.targetMesh(new THREE.BoxGeometry(1.38, 0.68, 0.14), "dark");
    const top = this.targetMesh(new THREE.BoxGeometry(1.38, 0.08, 0.22), "accent");
    const bottom = this.targetMesh(new THREE.BoxGeometry(1.38, 0.08, 0.22), "accent");
    const left = this.targetMesh(new THREE.BoxGeometry(0.08, 0.68, 0.22), "accent");
    const right = this.targetMesh(new THREE.BoxGeometry(0.08, 0.68, 0.22), "accent");
    top.position.y = 0.34;
    bottom.position.y = -0.34;
    left.position.x = -0.69;
    right.position.x = 0.69;
    group.add(backing, top, bottom, left, right);
    this.checkpointBeacon = new THREE.Group();
    for (let index = 0; index < 2; index += 1) {
      const arrow = this.createPointer("right", 0.18);
      arrow.position.x = index * 0.28 - 0.14;
      this.checkpointBeacon.add(arrow);
    }
    this.checkpointBeacon.userData.baseX = 0;
    this.checkpointBeacon.position.z = 0.16;
    group.add(this.checkpointBeacon);
    return group;
  }

  private targetMesh(geometry: THREE.BufferGeometry, role: "accent" | "surface" | "dark"): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color: role === "dark" ? 0x151a27 : role === "surface" ? 0x65401f : 0xffb547,
      emissive: role === "dark" ? 0x000000 : 0x8f3d12,
      emissiveIntensity: role === "dark" ? 0 : 0.55,
      roughness: role === "dark" ? 0.72 : 0.34,
      metalness: role === "dark" ? 0.28 : 0.58,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.targetRole = role;
    return mesh;
  }

  private createPointer(direction: "up" | "down" | "left" | "right", size: number): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, -size);
    shape.lineTo(-size * 0.72, size * 0.72);
    shape.lineTo(size * 0.72, size * 0.72);
    shape.closePath();
    const pointer = this.targetMesh(new THREE.ShapeGeometry(shape), "accent");
    pointer.position.z = 0.28;
    pointer.rotation.z = direction === "up"
      ? Math.PI
      : direction === "right"
        ? Math.PI / 2
        : direction === "left"
          ? -Math.PI / 2
          : 0;
    return pointer;
  }

  private addApproachChevrons(
    group: THREE.Group,
    direction: "up" | "down" | "left" | "right",
    origin: { x: number; y: number },
  ): void {
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "right" || direction === "up" ? 1 : -1;
    for (let index = 0; index < 2; index += 1) {
      const pointer = this.createPointer(direction, 0.13);
      pointer.position.x = origin.x + (horizontal ? sign * index * 0.22 : 0);
      pointer.position.y = origin.y + (horizontal ? 0 : sign * index * 0.22);
      group.add(pointer);
    }
  }

  private createTargetBeacon(): THREE.Group {
    const beacon = new THREE.Group();
    const cap = this.createPointer("down", 0.16);
    const stem = this.targetMesh(new THREE.BoxGeometry(0.065, 0.22, 0.08), "accent");
    stem.position.set(0, 0.22, 0.12);
    beacon.add(cap, stem);
    return beacon;
  }

  private updateTargetAppearance(
    group: THREE.Group,
    active: boolean,
    completed: boolean,
    progress: number,
    mutedCompleted = false,
  ): void {
    const accent = completed ? 0x63edaa : active ? 0xffb547 : 0x596277;
    const surface = completed ? 0x267958 : active ? 0x75491f : 0x303747;
    const emissive = completed ? 0x0e9d65 : active ? 0xc84b10 : 0x151b29;
    const shimmer = active ? (Math.sin(this.elapsed * 3.2) + 1) * 0.12 : 0;
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const role = object.userData.targetRole as "accent" | "surface" | "dark" | undefined;
      if (!role) return;
      if (role === "dark") {
        object.material.color.set(active || completed ? 0x151a27 : 0x222938);
        object.material.emissive.set(0x000000);
        object.material.emissiveIntensity = 0;
      } else {
        object.material.color.set(role === "accent" ? accent : surface);
        object.material.emissive.set(emissive);
        object.material.emissiveIntensity = active
          ? 0.55 + progress * 0.75 + shimmer
          : completed ? 0.75 : 0.06;
      }
      object.material.opacity = mutedCompleted ? (role === "dark" ? 0.24 : 0.38) : active || completed ? 1 : 0.34;
    });
  }

  private updateDebug(state: CampaignRenderState, contact?: ContactFeedback): void {
    const positions = this.sweepLine.geometry.getAttribute("position");
    positions.setXYZ(0, state.wheel.previousPosition.x, state.wheel.previousPosition.y, 2.28);
    positions.setXYZ(1, state.wheel.position.x, state.wheel.position.y, 2.28);
    positions.needsUpdate = true;
    this.sweepLine.computeLineDistances();

    const showContact = this.debugVisible && Boolean(contact);
    this.tangentArrow.visible = showContact;
    this.normalArrow.visible = showContact;
    if (!contact) return;

    const origin = zVector(contact.point);
    this.tangentArrow.position.copy(origin);
    this.tangentArrow.setDirection(new THREE.Vector3(contact.tangent.x, contact.tangent.y, 0));
    this.tangentArrow.setLength(0.55 + contact.impulse * 2.1, 0.13, 0.08);
    this.tangentArrow.setColor(new THREE.Color(contact.invalidDeep ? 0xff5252 : 0xffd34e));
    this.normalArrow.position.copy(origin);
    this.normalArrow.setDirection(new THREE.Vector3(contact.normal.x, contact.normal.y, 0));
    this.normalArrow.setLength(0.52, 0.12, 0.07);
  }

  private updateSparks(contact: ContactFeedback | undefined, delta: number, completed: boolean): void {
    this.lastSparkAt -= delta;
    if (contact && this.lastSparkAt <= 0) {
      this.lastSparkAt = contact.invalidDeep ? 0.075 : 0.025;
      const count = contact.invalidDeep ? 1 : 2;
      for (let index = 0; index < count; index += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.028, 0.028),
          new THREE.MeshBasicMaterial({ color: contact.invalidDeep ? 0xff5067 : 0xffe67a }),
        );
        mesh.position.set(contact.point.x, contact.point.y, 2.3);
        mesh.rotation.z = Math.atan2(contact.tangent.y, contact.tangent.x);
        this.content.add(mesh);
        const spread = (Math.random() - 0.5) * 1.7;
        const speed = 2.4 + Math.random() * 2.4;
        this.sparks.push({
          mesh,
          velocity: new THREE.Vector3(contact.tangent.x * speed - contact.tangent.y * spread, contact.tangent.y * speed + contact.tangent.x * spread, 0),
          life: 0.24,
        });
      }
    }
    if (completed && this.lastSparkAt <= 0) this.lastSparkAt = 0.04;
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index]!;
      spark.life -= delta;
      spark.velocity.multiplyScalar(Math.exp(-5 * delta));
      spark.mesh.position.addScaledVector(spark.velocity, delta);
      spark.mesh.scale.x = Math.max(0.04, spark.life / 0.24);
      if (spark.life <= 0) {
        this.content.remove(spark.mesh);
        spark.mesh.geometry.dispose();
        (spark.mesh.material as THREE.Material).dispose();
        this.sparks.splice(index, 1);
      }
    }
  }

  private readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
    const halfHeight = VIEW_HEIGHT / 2;
    const halfWidth = halfHeight * aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(rect.width, rect.height, false);
  };

  private readonly handleContextLost = (event: Event): void => event.preventDefault();
  private readonly handleContextRestored = (): void => this.renderer.resetState();
}
