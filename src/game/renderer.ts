import * as THREE from "three";
import { MOVEMENT, type Settings } from "./config";
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
  private sunOffset = v(-50, 100, 35);
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
    this.scene.background = new THREE.Color(0xd9e6df);
    this.scene.fog = new THREE.Fog(0xd9e6df, 100, 550);
    this.scene.add(new THREE.HemisphereLight(0xd6f2ff, 0x96734e, 2.3));
    const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
    sun.position.set(-50, 100, 35);
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
  private environment() {
    const l = this.sim.level;
    for (const [front, back] of floorSegments(l)) {
      this.box(320, 0.5, back - front, l.color, 0, -0.25, (front + back) / 2);
    }
    // Clip road ribbons at physical gaps; pool lane markings into one draw call.
    const positions: number[] = [],
      indices: number[] = [],
      marks: THREE.Matrix4[] = [];
    for (const route of l.routes)
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1],
          b = route[i],
          dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz),
          rx = ((-dz / length) * l.roadWidth) / 2,
          rz = ((dx / length) * l.roadWidth) / 2;
        let spans: [number, number][] = [[0, 1]];
        for (const [front, end] of l.gaps) {
          const entry = (end - a.z) / dz,
            exit = (front - a.z) / dz;
          if (dz === 0) continue;
          spans = spans.flatMap(([lo, hi]) => {
            if (exit <= lo || entry >= hi)
              return [[lo, hi] as [number, number]];
            const out: [number, number][] = [];
            if (entry > lo) out.push([lo, entry]);
            if (exit < hi) out.push([exit, hi]);
            return out;
          });
        }
        for (const [lo, hi] of spans) {
          const n = positions.length / 3;
          for (const [t, side] of [
            [lo, -1],
            [lo, 1],
            [hi, -1],
            [hi, 1],
          ])
            positions.push(
              a.x + dx * t + rx * side,
              0.02,
              a.z + dz * t + rz * side,
            );
          indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
        }
        for (let t = 8; t < length; t += 16) {
          const z = a.z + (dz * t) / length;
          if (l.gaps.some(([front, end]) => z < end + 3 && z > front - 3))
            continue;
          marks.push(
            new THREE.Matrix4().compose(
              v(a.x + (dx * t) / length, 0.035, z),
              new THREE.Quaternion().setFromAxisAngle(
                v(0, 1, 0),
                Math.atan2(dx, dz),
              ),
              v(1, 1, 1),
            ),
          );
        }
      }
    if (l.crossConvoy) {
      const n = positions.length / 3;
      positions.push(
        -140,
        0.0225,
        -156,
        140,
        0.0225,
        -156,
        -140,
        0.0225,
        -174,
        140,
        0.0225,
        -174,
      );
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      for (let x = -130; x < 140; x += 16)
        marks.push(
          new THREE.Matrix4().compose(
            v(x, 0.04, -165),
            new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), Math.PI / 2),
            v(1, 1, 1),
          ),
        );
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();
    const road = new THREE.Mesh(roadGeo, this.material(0x525c59));
    road.receiveShadow = true;
    this.scene.add(road);
    const stripes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.015, 5),
      this.material(0xe9dabb),
      marks.length,
    );
    marks.forEach((m, i) => stripes.setMatrixAt(i, m));
    stripes.receiveShadow = true;
    this.scene.add(stripes);
    let seed = l.seed;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      this.material(0xbf8e68),
      100,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 100; i++) {
      dummy.position.set(
        (i % 2 ? -1 : 1) * (45 + rand() * 100),
        rand() * 2,
        -rand() * (l.length + 120),
      );
      dummy.scale.set(3 + rand() * 10, 3 + rand() * 15, 4 + rand() * 9);
      dummy.rotation.set(rand(), rand() * 6, rand());
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);
    for (const o of this.sim.obstacles) {
      const d = o.definition;
      const mesh = this.box(
        d.width,
        d.height,
        d.depth,
        d.type === "ramp" ? 0xbe7847 : d.type === "laser" ? 0xff463d : 0xbd6a49,
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
      this.box(0.5, 10, 0.6, 0x245d52, x, 5, -l.length);
      this.box(1.1, 0.6, 1.2, 0x67ffc6, x, 10, -l.length);
    }
    const banner = this.box(22, 1.2, 0.4, 0x163f39, l.finishX, 9.3, -l.length);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#163f39";
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = "#a3ffe0";
    c.font = "bold 70px sans-serif";
    c.textAlign = "center";
    c.fillText("FINISH", 512, 92);
    const texture = new THREE.CanvasTexture(canvas);
    banner.material = this.material(0xffffff);
    (banner.material as THREE.MeshStandardMaterial).map = texture;
    // Physical first-truck diversion is deliberately before the finish.
    this.box(5, 2.5, 0.2, 0x244942, l.startX + 8, 4, -95);
    const hintCanvas = document.createElement("canvas");
    hintCanvas.width = 512;
    hintCanvas.height = 256;
    const hc = hintCanvas.getContext("2d")!;
    hc.fillStyle = "#244942";
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
      if (z === 2 && h === 3.1) {
        for (let i = 0; i < count; i++)
          mesh.setColorAt(
            i,
            new THREE.Color([0xf4e7ce, 0x579b95, 0xe6a868, 0x98b3ad][i % 4]),
          );
      }
      this.scene.add(mesh);
      this.parts.push({
        mesh,
        local: new THREE.Matrix4().makeTranslation(x, y, z),
        wheels,
      });
    };
    part(3, 3.1, 11, 0xffffff, 0, 2.45, 2);
    part(2.9, 2.24, 4, 0xe97849, 0, 1.85, -5.5);
    part(2.5, 0.88, 0.07, 0x244647, 0, 2.52, -7.54);
    part(0.06, 0.88, 1.3, 0x244647, -1.46, 2.5, -6.2);
    part(0.06, 0.88, 1.3, 0x244647, 1.46, 2.5, -6.2);
    part(3, 0.18, 15, 0x354342, 0, 1, -0.1);
    part(2.8, 0.36, 0.16, 0x788b86, 0, 1.25, -7.58);
    for (const x of [-1, 1]) part(0.4, 0.25, 0.09, 0xffebbb, x, 1.82, -7.55);
    part(2.8, 0.12, 10.5, 0xfef5dc, 0, 4.025, 2);
    for (const x of [-1.3, 1.3]) part(0.07, 0.025, 10.5, 0x447a6c, x, 4.09, 2);
    part(2.8, 0.08, 0.12, 0xec744b, 0, 4.09, -3.24);
    for (const x of [-1.38, 1.38])
      for (const z of [-5.5, 0.2, 5.8])
        part(0, 0, 0, 0x23332f, x, 0.67, z, true);
    for (const x of [-1.1, 1.1]) part(0.3, 0.25, 0.08, 0xb13526, x, 1.26, 7.55);
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
      const transform = this.matrix.compose(p, q, this.scale);
      for (const part of this.parts)
        part.mesh.setMatrixAt(
          i,
          this.partMatrix.multiplyMatrices(transform, part.local),
        );
    }
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true;
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
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        geos.add(o.geometry);
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
