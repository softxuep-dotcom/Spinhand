import * as THREE from "three";
import { VIEW_HEIGHT, WHEEL_RADIUS } from "../game/config";
import type { Vec2 } from "../game/math/vec2";
import type { ContactFeedback, SimulationRenderState } from "../game/simulation/types";

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maximumLife: number;
}

const zVector = (point: Vec2, z = 0.8): THREE.Vector3 => new THREE.Vector3(point.x, point.y, z);

export class SpinhandRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-4.5, 4.5, 8, -8, 0.1, 50);
  private readonly wheel = this.createWheel();
  private readonly ball = this.createBall();
  private readonly box = this.createBox();
  private readonly gear = this.createGear();
  private readonly sweepLine: THREE.Line;
  private readonly tangentArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd34e);
  private readonly normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.65, 0x53d9ff);
  private readonly sparks: Spark[] = [];
  private debugVisible = false;
  private wheelSpin = 0;
  private lastSparkAt = 0;

  constructor(private readonly canvas: HTMLCanvasElement, state: SimulationRenderState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    // P0 keeps contact silhouettes clean; real-time projected shadows made the
    // wheel read as a second dark wheel against the backboard.
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#1a1727");
    this.camera.position.set(0, 0, 20);

    this.createBackdrop();
    this.createPlatforms(state);
    this.scene.add(this.gear, this.ball, this.box, this.wheel);

    const sweepGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.sweepLine = new THREE.Line(
      sweepGeometry,
      new THREE.LineDashedMaterial({ color: 0x61e4ff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.8 }),
    );
    this.sweepLine.computeLineDistances();
    this.scene.add(this.sweepLine, this.tangentArrow, this.normalArrow);

    window.addEventListener("resize", this.resize);
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.resize();
  }

  clientToWorld = (clientX: number, clientY: number): Vec2 => {
    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return {
      x: THREE.MathUtils.lerp(this.camera.left, this.camera.right, (normalizedX + 1) * 0.5),
      y: THREE.MathUtils.lerp(this.camera.bottom, this.camera.top, (normalizedY + 1) * 0.5),
    };
  };

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.sweepLine.visible = visible;
    this.tangentArrow.visible = visible;
    this.normalArrow.visible = visible;
  }

  render(state: SimulationRenderState, delta: number): void {
    this.wheelSpin -= delta * (state.wheel.active ? 8.5 : 2.4);
    this.wheel.position.set(state.wheel.position.x, state.wheel.position.y, 1.5);
    this.wheel.rotation.z = this.wheelSpin;
    this.ball.position.set(state.ball.position.x, state.ball.position.y, 0.75);
    this.ball.rotation.z = state.ball.rotation;
    this.box.position.set(state.box.position.x, state.box.position.y, 0.72);
    this.box.rotation.z = state.box.rotation;
    this.gear.position.set(state.gear.position.x, state.gear.position.y, 0.42);
    this.gear.rotation.z = state.gear.rotation;

    const activeContact = state.contacts.find((contact) => !contact.invalidDeep && contact.impulse > 0);
    const invalidContact = state.contacts.find((contact) => contact.invalidDeep);
    const contact = activeContact ?? invalidContact;
    this.updateDebug(state, contact);
    this.updateSparks(contact, delta);
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

  private createBackdrop(): void {
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(8.65, 15.2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x29243a, roughness: 0.88, metalness: 0.06 }),
    );
    back.position.z = -0.75;
    back.receiveShadow = true;
    this.scene.add(back);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.9, 15.5, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x4b435e, roughness: 0.62, metalness: 0.22 }),
    );
    frame.position.z = -0.98;
    this.scene.add(frame);

    this.scene.add(new THREE.HemisphereLight(0xfff1d1, 0x312d52, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-4, 7, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    this.scene.add(key);

    const fill = new THREE.PointLight(0x8c72ff, 18, 20);
    fill.position.set(3, -3, 5);
    this.scene.add(fill);
  }

  private createPlatforms(state: SimulationRenderState): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x655d77, roughness: 0.65, metalness: 0.22 });
    for (const platform of state.platforms) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(platform.halfExtents.x * 2, platform.halfExtents.y * 2, 0.7),
        material,
      );
      mesh.position.set(platform.position.x, platform.position.y, 0);
      mesh.rotation.z = platform.rotation;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
  }

  private createWheel(): THREE.Group {
    const group = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(WHEEL_RADIUS - 0.1, 0.13, 12, 40),
      new THREE.MeshStandardMaterial({ color: 0xffc72e, emissive: 0x4a2600, emissiveIntensity: 0.7, roughness: 0.56 }),
    );
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x302b3a, metalness: 0.55, roughness: 0.34 }),
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.03;
    group.add(rim, hub);

    const spokeMaterial = new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0x6b3900, emissiveIntensity: 0.5 });
    for (let index = 0; index < 6; index += 1) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.075, 0.12), spokeMaterial);
      spoke.position.set(Math.cos((index * Math.PI) / 3) * 0.28, Math.sin((index * Math.PI) / 3) * 0.28, 0.08);
      spoke.rotation.z = (index * Math.PI) / 3;
      group.add(spoke);
    }
    const directionMark = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.09, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    directionMark.position.set(0.45, 0.39, 0.11);
    directionMark.rotation.z = -0.72;
    group.add(directionMark);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    return group;
  }

  private createBall(): THREE.Group {
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 28, 20),
      new THREE.MeshStandardMaterial({ color: 0x3aa7ff, roughness: 0.52, metalness: 0.05 }),
    );
    sphere.castShadow = true;
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.565, 0.025, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xbbe5ff }),
    );
    group.add(sphere, stripe);
    return group;
  }

  private createBox(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 1.28, 0.82, 2, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0xb77a43, roughness: 0.78, metalness: 0.02 }),
    );
    body.castShadow = true;
    const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x785033, roughness: 0.72 });
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1.31, 0.11, 0.86), bandMaterial);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.31, 0.86), bandMaterial);
    group.add(body, horizontal, vertical);
    return group;
  }

  private createGear(): THREE.Group {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x8874b3, roughness: 0.38, metalness: 0.58 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.55, 32), metal);
    core.rotation.x = Math.PI / 2;
    core.castShadow = true;
    group.add(core);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.28, 0.54), metal);
      tooth.position.set(Math.cos(angle) * 1.03, Math.sin(angle) * 1.03, 0);
      tooth.rotation.z = angle;
      tooth.castShadow = true;
      group.add(tooth);
    }
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.68, 20),
      new THREE.MeshStandardMaterial({ color: 0x332e40, roughness: 0.3, metalness: 0.72 }),
    );
    axle.rotation.x = Math.PI / 2;
    axle.position.z = 0.08;
    group.add(axle);
    return group;
  }

  private updateDebug(state: SimulationRenderState, contact?: ContactFeedback): void {
    const position = this.sweepLine.geometry.getAttribute("position");
    position.setXYZ(0, state.wheel.previousPosition.x, state.wheel.previousPosition.y, 1.72);
    position.setXYZ(1, state.wheel.position.x, state.wheel.position.y, 1.72);
    position.needsUpdate = true;
    this.sweepLine.computeLineDistances();

    const visible = this.debugVisible && Boolean(contact);
    this.tangentArrow.visible = visible;
    this.normalArrow.visible = visible;
    if (!contact) return;
    const origin = zVector(contact.point, 1.82);
    this.tangentArrow.position.copy(origin);
    this.tangentArrow.setDirection(new THREE.Vector3(contact.tangent.x, contact.tangent.y, 0));
    this.tangentArrow.setLength(0.55 + contact.impulse * 2.1, 0.13, 0.08);
    this.tangentArrow.setColor(new THREE.Color(contact.invalidDeep ? 0xff5252 : 0xffd34e));
    this.normalArrow.position.copy(origin);
    this.normalArrow.setDirection(new THREE.Vector3(contact.normal.x, contact.normal.y, 0));
    this.normalArrow.setLength(0.52, 0.12, 0.07);
  }

  private updateSparks(contact: ContactFeedback | undefined, delta: number): void {
    this.lastSparkAt -= delta;
    if (contact && this.lastSparkAt <= 0) {
      this.lastSparkAt = contact.invalidDeep ? 0.07 : 0.025;
      const tangent = contact.tangent;
      const color = contact.invalidDeep ? 0xff4c58 : 0xffe36b;
      for (let index = 0; index < (contact.invalidDeep ? 1 : 2); index += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.025, 0.025),
          new THREE.MeshBasicMaterial({ color }),
        );
        mesh.position.copy(zVector(contact.point, 1.9));
        mesh.rotation.z = Math.atan2(tangent.y, tangent.x);
        this.scene.add(mesh);
        const spread = (Math.random() - 0.5) * 1.6;
        const speed = 2.2 + Math.random() * 2.3;
        this.sparks.push({
          mesh,
          velocity: new THREE.Vector3(tangent.x * speed - tangent.y * spread, tangent.y * speed + tangent.x * spread, 0),
          life: 0.22,
          maximumLife: 0.22,
        });
      }
    }

    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      if (!spark) continue;
      spark.life -= delta;
      spark.velocity.multiplyScalar(Math.exp(-5 * delta));
      spark.mesh.position.addScaledVector(spark.velocity, delta);
      spark.mesh.scale.x = Math.max(0.05, spark.life / spark.maximumLife);
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
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

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
  };

  private readonly handleContextRestored = (): void => {
    this.renderer.resetState();
  };
}
