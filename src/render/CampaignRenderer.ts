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
  private hiddenBolt?: THREE.Group;
  private checkpoint?: THREE.Group;
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
    this.hiddenBolt = undefined;
    this.checkpoint = undefined;
    this.createBackdrop(state);
    this.createPlatforms(state);
    this.goal = this.createGoal(state);
    this.hiddenBolt = this.createHiddenBolt(state.level.accent);
    if (state.level.phaseCheckpoint) {
      this.checkpoint = this.createCheckpoint();
      this.checkpoint.position.set(state.level.phaseCheckpoint.x, state.level.phaseCheckpoint.y, 0.2);
      this.content.add(this.checkpoint);
    }
    if (state.object) this.object = state.object.kind === "ball" ? this.createBall(state.level.accent) : this.createBox();
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
    }
    if (this.goal) {
      const pulse = 1 + state.goal.progress * 0.16 + Math.sin(this.elapsed * 3.2) * 0.018;
      this.goal.scale.set(pulse, pulse, 1);
    }
    if (this.hiddenBolt) {
      this.hiddenBolt.visible = !state.hiddenBolt.collected;
      this.hiddenBolt.rotation.z = this.elapsed * 0.7;
      this.hiddenBolt.position.set(state.hiddenBolt.position.x, state.hiddenBolt.position.y + Math.sin(this.elapsed * 2.8) * 0.06, 1.05);
    }
    if (this.checkpoint) {
      const passed = state.phase > 0;
      this.checkpoint.scale.setScalar(passed ? 1.16 : 1);
      this.checkpoint.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.emissiveIntensity = passed ? 1.4 : 0.2;
        }
      });
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
    const edge = new THREE.MeshStandardMaterial({ color: state.level.accent, emissive: state.level.accent, emissiveIntensity: 0.22, roughness: 0.38 });
    for (const platform of state.platforms) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(platform.halfExtents.x * 2, platform.halfExtents.y * 2, 0.7),
        platform.surface === "slick" ? slickMaterial : material,
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

  private createBall(accent: number): THREE.Group {
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 30, 22),
      new THREE.MeshStandardMaterial({ color: 0x45b7ff, roughness: 0.34, metalness: 0.1 }),
    );
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.568, 0.026, 8, 36),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    sphere.castShadow = true;
    group.add(sphere, stripe);
    return group;
  }

  private createBox(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 1.28, 0.84, 2, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0xc4864e, roughness: 0.7, metalness: 0.03 }),
    );
    const bands = new THREE.MeshStandardMaterial({ color: 0x765035, roughness: 0.58, metalness: 0.12 });
    group.add(body, new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.88), bands), new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.32, 0.88), bands));
    group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    return group;
  }

  private createMechanism(state: CampaignRenderState): THREE.Group {
    const mechanism = state.mechanism!;
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: state.level.accent, roughness: 0.3, metalness: 0.68 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(mechanism.halfExtents.x * 2, mechanism.halfExtents.y * 2, 0.78), material);
    body.castShadow = true;
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(mechanism.halfExtents.x * 2.5, 0.18, 0.88),
      new THREE.MeshStandardMaterial({ color: 0xdde4f2, roughness: 0.24, metalness: 0.75 }),
    );
    cap.position.y = mechanism.kind === "bolt" ? mechanism.halfExtents.y - 0.04 : -mechanism.halfExtents.y + 0.04;
    group.add(body, cap);
    return group;
  }

  private createGoal(state: CampaignRenderState): THREE.Group {
    const group = new THREE.Group();
    const { goal } = state;
    const green = new THREE.MeshStandardMaterial({ color: 0x4ee29a, emissive: 0x087a47, emissiveIntensity: 0.55, roughness: 0.38, metalness: 0.28 });
    if (goal.kind === "cup") {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(goal.halfExtents.x * 2, 0.13, 0.66), green);
      floor.position.y = -goal.halfExtents.y;
      const wallGeometry = new THREE.BoxGeometry(0.13, goal.halfExtents.y * 2, 0.66);
      const left = new THREE.Mesh(wallGeometry, green);
      const right = new THREE.Mesh(wallGeometry, green);
      left.position.x = -goal.halfExtents.x;
      right.position.x = goal.halfExtents.x;
      // Chapter one cups are side-entry targets: level 1 opens left and level 5 opens right.
      group.add(floor, state.level.id === 5 ? left : right);
    } else {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(goal.halfExtents.x * 2, goal.halfExtents.y * 2, 0.18), green);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(goal.halfExtents.x, goal.halfExtents.y) * 0.68, 0.045, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xcaffdf }),
      );
      ring.position.z = 0.15;
      group.add(pad, ring);
    }
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
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.055, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x63e7b1, emissive: 0x19a86e, emissiveIntensity: 0.2, transparent: true, opacity: 0.72 }),
    );
    group.add(ring);
    return group;
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
