import * as THREE from "three";
import { MOVEMENT, WORLD, FINISH, type Settings } from "./config";
import { type Simulation } from "./physics";
import { floorSegments } from "./levels";
import { v } from "./math";
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.08, 1400);
  private parts: {
    mesh: THREE.InstancedMesh;
    local: THREE.Matrix4;
    wheels: boolean;
  }[] = [];
  private obstacles: THREE.Mesh[] = [];
  private rope: THREE.Line;
  private debug: THREE.LineSegments | null = null;
  private matrix = new THREE.Matrix4();
  private partMatrix = new THREE.Matrix4();
  private truckPosition = v();
  private currentPosition = v();
  private truckRotation = new THREE.Quaternion();
  private currentRotation = new THREE.Quaternion();
  private scale = v(1, 1, 1);
  private eyeOffset = v(0, MOVEMENT.eyeHeight - MOVEMENT.height / 2);
  private sunOffset = v(-75, 55, 35);
  private sky!: THREE.Mesh;
  private glow!: THREE.Sprite;
  private groundShadows!: THREE.InstancedMesh;
  private shadowMatrix = new THREE.Matrix4();
  private shadowPosition = v();
  private shadowRotation = new THREE.Quaternion();
  private shadowScale = v(1, 1, 1);
  private up = v(0, 1, 0);
  private forward = v();
  private sunTargetOffset = v(0, -4, -25);
  private software = false;
  private mobile = matchMedia("(pointer: coarse)").matches;
  private performanceScale = 1;
  private slowFrames = 0;
  private landingTime = -10;
  private landingCount = 0;
  private size = { width: 1, height: 1 };
  private resizeObserver: ResizeObserver;
  constructor(
    private host: HTMLElement,
    readonly sim: Simulation,
    private settings: Settings,
    existingRenderer?: THREE.WebGLRenderer,
  ) {
    this.renderer =
      existingRenderer ??
      new THREE.WebGLRenderer({
        antialias: settings.quality !== "low",
        powerPreference: "high-performance",
      });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const gl = this.renderer.getContext(),
      info = gl.getExtension("WEBGL_debug_renderer_info");
    this.software =
      !!info &&
      /swiftshader|llvmpipe|software/i.test(
        gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
      );
    this.renderer.shadowMap.enabled =
      settings.quality === "high" ||
      (settings.quality === "auto" && !this.software && !this.mobile);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Convoy Leap first-person game",
    );
    if (this.renderer.domElement.parentElement !== host)
      host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x80c8eb);
    this.scene.fog = new THREE.Fog(0xb9edf1, 130, 680);
    this.scene.add(new THREE.HemisphereLight(0xe4f6ff, 0xc4a353, 2.0));
    const sun = new THREE.DirectionalLight(0xfff4df, 3.0);
    sun.position.copy(this.sunOffset);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -65;
    sun.shadow.camera.right = 65;
    sun.shadow.camera.top = 65;
    sun.shadow.camera.bottom = -65;
    sun.shadow.camera.far = 240;
    sun.shadow.normalBias = 0.06;
    sun.name = "sun";
    sun.target.name = "sun-target";
    this.scene.add(sun, sun.target);
    this.skydome();
    this.environment();
    this.trucks();
    const ropeGeo = new THREE.BufferGeometry().setFromPoints([v(), v()]);
    this.rope = new THREE.Line(
      ropeGeo,
      new THREE.LineBasicMaterial({ color: 0x25f8d4 }),
    );
    this.rope.frustumCulled = false;
    this.scene.add(this.rope);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
  }
  get canvas() {
    return this.renderer.domElement;
  }
  private material(color: number, roughness = 0.8) {
    return this.settings.quality === "high"
      ? new THREE.MeshStandardMaterial({ color, roughness })
      : new THREE.MeshLambertMaterial({ color });
  }
  private box(
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  private skydome() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          horizon: { value: new THREE.Color(0xc3f4f3) },
          zenith: { value: new THREE.Color(0x468eda) },
        },
        vertexShader: `varying vec2 skyUv; void main() {skyUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);}`,
        fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; varying vec2 skyUv;
          void main() {float height = clamp((skyUv.y - 0.48) * 6.5, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizon, zenith, height), 1.0);
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "rgba(255,255,242,1)");
    glow.addColorStop(0.15, "rgba(255,255,240,.95)");
    glow.addColorStop(0.36, "rgba(255,250,219,.25)");
    glow.addColorStop(1, "rgba(255,250,219,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    this.glow.scale.set(120, 120, 1);
    this.scene.add(this.glow);
  }
  private environment() {
    const l = this.sim.level;
    for (const [front, back] of floorSegments(l)) {
      this.box(
        WORLD.halfWidth * 2,
        0.5,
        back - front,
        l.color,
        0,
        -0.25,
        (front + back) / 2,
      );
    }
    // Broad, faceted dunes frame the course. The drivable sand remains flat.
    let seed = l.seed;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const dunes = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6),
      this.material(0xffd24a),
      24,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const height = 48 + rand() * 40;
      dummy.position.set(
        (i % 2 ? -1 : 1) * (400 + rand() * 90),
        height / 2 - 0.4,
        170 - Math.floor(i / 2) * 135,
      );
      dummy.scale.set(140 + rand() * 35, height, 190 + rand() * 90);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.updateMatrix();
      dunes.setMatrixAt(i, dummy.matrix);
    }
    dunes.receiveShadow = true;
    this.scene.add(dunes);
    for (const o of this.sim.obstacles) {
      const d = o.definition;
      const mesh = this.box(
        d.width,
        d.height,
        d.depth,
        d.type === "ramp" ? 0xe4bc58 : d.type === "laser" ? 0xff463d : 0xc48353,
        d.x,
        d.y,
        d.z,
      );
      mesh.quaternion.copy(o.body.rotation());
      this.obstacles.push(mesh);
      if (d.type === "laser") {
        for (const x of [d.x - d.width / 2, d.x + d.width / 2])
          this.box(0.45, d.height + 2, 1.2, 0x293c39, x, d.y, d.z);
      }
    }
    for (const gap of l.gaps) {
      for (const z of gap)
        this.box(l.roadWidth, 0.15, 0.7, 0xef7848, 0, 0.11, z);
    }
    for (const x of [l.finishX - 11, l.finishX + 11]) {
      this.box(0.5, 10, 0.6, 0x855b65, x, 5, -l.length);
      this.box(1.1, 0.6, 1.2, 0xffdce3, x, 10, -l.length);
    }
    const gateY = l.finishY + FINISH.rise;
    for (const y of [gateY - FINISH.halfHeight, gateY + FINISH.halfHeight])
      this.box(
        FINISH.halfWidth * 2,
        0.12,
        0.16,
        0xe1f5ff,
        l.finishX,
        y,
        -l.length,
      );
    const target = this.box(
      FINISH.halfWidth * 2,
      FINISH.halfHeight * 2,
      0.04,
      0xc5e8ff,
      l.finishX,
      gateY,
      -l.length,
    );
    const targetMaterial = target.material as THREE.Material;
    targetMaterial.transparent = true;
    targetMaterial.opacity = 0.14;
    targetMaterial.depthWrite = false;
    const banner = this.box(22, 1.2, 0.4, 0xac596c, l.finishX, 9.3, -l.length);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#ac596c";
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = "#ffffff";
    c.font = "bold 56px sans-serif";
    c.textAlign = "center";
    c.fillText("JUMP TO FINISH", 512, 90);
    const texture = new THREE.CanvasTexture(canvas);
    banner.material = this.material(0xffffff);
    (banner.material as THREE.MeshStandardMaterial).map = texture;
    // Physical first-truck diversion is deliberately before the finish.
    this.box(5, 2.5, 0.2, 0x415d84, l.startX + 8, 4, -95);
    const hintCanvas = document.createElement("canvas");
    hintCanvas.width = 512;
    hintCanvas.height = 256;
    const hc = hintCanvas.getContext("2d")!;
    hc.fillStyle = "#415d84";
    hc.fillRect(0, 0, 512, 256);
    hc.fillStyle = "#fff8e5";
    hc.textAlign = "center";
    hc.font = "bold 48px sans-serif";
    hc.fillText("JUMP TO", 256, 95);
    hc.fillText("ANOTHER ROOF", 256, 160);
    const sign = this.scene.children[
      this.scene.children.length - 1
    ] as THREE.Mesh;
    (sign.material as THREE.MeshStandardMaterial).map = new THREE.CanvasTexture(
      hintCanvas,
    );
  }
  private trucks() {
    const count = this.sim.trucks.length;
    const part = (
      w: number,
      h: number,
      d: number,
      color: number,
      x: number,
      y: number,
      z: number,
      wheels = false,
    ) => {
      const geo = wheels
        ? new THREE.CylinderGeometry(0.65, 0.65, 0.34, 10).rotateZ(Math.PI / 2)
        : new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.InstancedMesh(geo, this.material(color), count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.parts.push({
        mesh,
        local: new THREE.Matrix4().makeTranslation(x, y, z),
        wheels,
      });
    };
    part(3, 3.1, 11, 0xffffff, 0, 2.45, 2);
    part(2.9, 2.24, 4, 0xf5f7f8, 0, 1.85, -5.5);
    part(2.5, 0.88, 0.07, 0x405568, 0, 2.52, -7.54);
    part(0.06, 0.88, 1.3, 0x405568, -1.46, 2.5, -6.2);
    part(0.06, 0.88, 1.3, 0x405568, 1.46, 2.5, -6.2);
    part(3, 0.18, 15, 0x303942, 0, 1, -0.1);
    part(2.8, 0.36, 0.16, 0x83949f, 0, 1.25, -7.58);
    for (const x of [-1, 1]) part(0.4, 0.25, 0.09, 0xffebbb, x, 1.82, -7.55);
    part(2.8, 0.12, 10.5, 0xffffff, 0, 4.025, 2);
    for (const x of [-1.3, 1.3]) part(0.07, 0.025, 10.5, 0x667984, x, 4.09, 2);
    part(2.8, 0.08, 0.12, 0x667984, 0, 4.09, -3.24);
    part(2.8, 0.08, 0.12, 0x667984, 0, 4.09, 7.24);
    // Separate rear doors, silver frame, central seam and locking bars.
    part(2.75, 2.72, 0.08, 0x526675, 0, 2.42, 7.54);
    for (const x of [-1.43, 0, 1.43])
      part(0.07, 2.95, 0.12, 0x9eafb8, x, 2.42, 7.6);
    for (const y of [0.95, 3.9]) part(2.93, 0.09, 0.12, 0x9eafb8, 0, y, 7.6);
    for (const x of [-0.87, 0.87])
      part(0.035, 2.52, 0.06, 0x90a0ab, x, 2.42, 7.62);
    part(2.95, 0.21, 0.24, 0x44515c, 0, 0.87, 7.58);
    for (const x of [-1.38, 1.38])
      for (const z of [-5.5, 0.2, 5.8])
        part(0, 0, 0, 0x171e24, x, 0.67, z, true);
    for (const x of [-1.1, 1.1]) part(0.3, 0.25, 0.08, 0xb13526, x, 1.26, 7.65);
    // One inexpensive draw call keeps grounded truck shadows on mobile/Low.
    // Hardware High/Auto uses the directional light's real shadow map instead.
    const shadowGeo = new THREE.BufferGeometry();
    shadowGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -1.5, 0, -7.5, 2.5, 0, -9.5, 6.5, 0, -9.5, 6.5, 0, 5.5, 1.5, 0, 7.5,
          -1.5, 0, 7.5,
        ],
        3,
      ),
    );
    shadowGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
    this.groundShadows = new THREE.InstancedMesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        color: 0x684027,
        opacity: 0.32,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      count,
    );
    this.groundShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groundShadows.frustumCulled = false;
    this.scene.add(this.groundShadows);
  }
  update(settings: Settings) {
    const changed =
      (this.settings.quality === "high") !== (settings.quality === "high");
    this.settings = settings;
    if (changed) {
      const replacements = new Map<THREE.Material, THREE.Material>();
      const convert = (source: THREE.Material) => {
        if (!(
          source instanceof THREE.MeshLambertMaterial ||
          source instanceof THREE.MeshStandardMaterial
        ))
          return source;
        let result = replacements.get(source);
        if (!result) {
          const m = this.material(source.color.getHex());
          m.map = source.map;
          m.transparent = source.transparent;
          m.opacity = source.opacity;
          m.side = source.side;
          m.vertexColors = source.vertexColors;
          result = m;
          replacements.set(source, m);
        }
        return result;
      };
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          o.material = Array.isArray(o.material)
            ? o.material.map(convert)
            : convert(o.material);
      });
      replacements.forEach((_, old) => old.dispose());
    }
    this.performanceScale = 1;
    this.slowFrames = 0;
    const gl = this.renderer.getContext(),
      info = gl.getExtension("WEBGL_debug_renderer_info");
    this.software =
      !!info &&
      /swiftshader|llvmpipe|software/i.test(
        gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
      );
    this.renderer.shadowMap.enabled =
      settings.quality === "high" ||
      (settings.quality === "auto" && !this.software && !this.mobile);
    this.resize();
  }
  adapt(fps: number, dt: number) {
    if (
      this.settings.quality !== "auto" ||
      this.software ||
      this.performanceScale < 1
    )
      return;
    this.slowFrames = fps < 35 ? this.slowFrames + dt : 0;
    if (this.slowFrames > 2) {
      this.performanceScale = 0.65;
      this.renderer.shadowMap.enabled = false;
      this.resize();
    }
  }
  private resize = () => {
    const rect = this.host.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.settings.quality === "low" ||
          (this.software && this.settings.quality === "auto")
          ? 0.5
          : this.mobile && this.settings.quality === "auto"
            ? 1
            : this.performanceScale * 1.5,
      ),
    );
    this.renderer.setSize(rect.width, rect.height);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  };
  render(alpha: number, yaw: number, pitch: number, sprint: boolean) {
    for (let i = 0; i < this.sim.trucks.length; i++) {
      const t = this.sim.trucks[i],
        p = this.truckPosition
          .copy(t.previous)
          .lerp(this.currentPosition.copy(t.body.translation()), alpha),
        q = this.truckRotation
          .copy(t.previousRotation)
          .slerp(this.currentRotation.copy(t.body.rotation()), alpha);
      const onSand =
        p.y < 5 &&
        Math.abs(p.x) < WORLD.halfWidth - 2 &&
        !this.sim.level.gaps.some(([front, back]) => p.z > front && p.z < back);
      this.forward.set(0, 0, 1).applyQuaternion(q);
      this.shadowRotation.setFromAxisAngle(
        this.up,
        Math.atan2(this.forward.x, this.forward.z),
      );
      this.shadowPosition.set(p.x, 0.045, p.z);
      this.shadowScale.setScalar(onSand ? 1 : 0);
      this.groundShadows.setMatrixAt(
        i,
        this.shadowMatrix.compose(
          this.shadowPosition,
          this.shadowRotation,
          this.shadowScale,
        ),
      );
      const transform = this.matrix.compose(p, q, this.scale);
      for (const part of this.parts)
        part.mesh.setMatrixAt(
          i,
          this.partMatrix.multiplyMatrices(transform, part.local),
        );
    }
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true;
    this.groundShadows.visible = !this.renderer.shadowMap.enabled;
    this.groundShadows.instanceMatrix.needsUpdate = true;
    this.sim.obstacles.forEach((o, i) => {
      this.obstacles[i].position.copy(o.body.translation());
      this.obstacles[i].quaternion.copy(o.body.rotation());
      if (o.definition.type === "laser") {
        const mat = this.obstacles[i].material as THREE.MeshStandardMaterial;
        mat.color.set(o.active ? 0xff463d : 0x56f5cf);
        mat.transparent = !o.active;
        mat.opacity = o.active ? 0.75 : 0.1;
      }
    });
    const player = this.sim.player;
    this.camera.position
      .copy(player.previous)
      .lerp(player.position, alpha)
      .add(this.eyeOffset);
    if (player.landings !== this.landingCount) {
      this.landingCount = player.landings;
      this.landingTime = this.sim.time;
    }
    const age = this.sim.time - this.landingTime;
    if (this.settings.shake && age < 0.3)
      this.camera.position.y +=
        Math.sin(age * 35) * 0.025 * Math.exp(-age * 15);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
    this.sky.position.copy(this.camera.position);
    this.glow.position.copy(this.camera.position).add(v(-220, 480, -700));
    const targetFov =
      this.settings.fov + (sprint && this.settings.sprintFov ? 5 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * 0.12;
    this.camera.updateProjectionMatrix();
    const sun = this.scene.getObjectByName("sun") as THREE.DirectionalLight;
    sun.position.copy(this.camera.position).add(this.sunOffset);
    sun.target.position.copy(this.camera.position).add(this.sunTargetOffset);
    this.rope.visible = !!player.grapple;
    if (player.grapple) {
      const target = player.grapple.local
        .clone()
        .applyQuaternion(
          new THREE.Quaternion().copy(player.grapple.truck.body.rotation()),
        )
        .add(new THREE.Vector3().copy(player.grapple.truck.body.translation()));
      this.rope.geometry.setFromPoints([
        this.camera.position.clone().add(v(0.2, -0.2, 0)),
        target,
      ]);
    }
    if (this.debug) {
      this.scene.remove(this.debug);
      this.debug.geometry.dispose();
      (this.debug.material as THREE.Material).dispose();
      this.debug = null;
    }
    if (this.settings.debug) {
      const data = this.sim.world.debugRender();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 4));
      this.debug = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
      );
      this.scene.add(this.debug);
    }
    this.renderer.render(this.scene, this.camera);
  }
  stats() {
    return {
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      width: this.size.width,
      height: this.size.height,
    };
  }
  dispose(preserveCanvas = false) {
    this.resizeObserver.disconnect();
    const geos = new Set<THREE.BufferGeometry>(),
      mats = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.DirectionalLight) o.shadow.map?.dispose();
      if (
        o instanceof THREE.Mesh ||
        o instanceof THREE.Line ||
        o instanceof THREE.Sprite
      ) {
        if (!(o instanceof THREE.Sprite)) geos.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          mats.add(m);
          const map = (m as THREE.MeshStandardMaterial).map;
          if (map) textures.add(map);
        }
      }
    });
    geos.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
    if (!preserveCanvas) {
      this.renderer.dispose();
      this.canvas.remove();
    }
  }
}
