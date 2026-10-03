import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRun, distanceToEdge, updateRun, type CharacterId, type Phase, type Quality, type Run } from './core';
import { playTone } from './audio';

export type FrameStats = { score: number; distance: number; gems: number; jumps: number; landings: number; edge: number; airborne: boolean };
export type EngineOptions = { onStats: (stats: FrameStats) => void; onOver: (run: Run) => void; onPause: () => void; onError: (message: string) => void; character: CharacterId; quality: Quality; sound: boolean };
const TRUCK_COLORS = [0x9873eb, 0xec9c67, 0xbacb8d, 0xe9e5d7];
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, .1, 210);
  private world = new THREE.Group();
  private player = new THREE.Group();
  private limbs: THREE.Group[] = [];
  private truckInstances: { mesh: THREE.InstancedMesh; color: number | null }[] = [];
  private gems!: THREE.InstancedMesh;
  private buildingLayouts: { x: number; y: number; z: number; w: number; h: number; d: number }[][] = [];
  private treeInstances: THREE.InstancedMesh[] = [];
  private truckTemplates: THREE.Group[] = [];
  private roadMarks: THREE.InstancedMesh;
  private buildings: THREE.InstancedMesh[] = [];
  private roadside = new THREE.Group();
  private run = createRun(174);
  private phase: Phase = 'menu';
  private keys = new Set<string>();
  private touchDirection = 0;
  private jumpQueued = false;
  private raf = 0;
  private lastTime = 0;
  private lastRender = 0;
  private identity = new THREE.Quaternion();
  private scratchScale = new THREE.Vector3();
  private gemRotation = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private accumulator = 0;
  private displayTime = 0;
  private animationTime = 0;
  private frames = 0;
  private fpsTime = 0;
  private resizeObserver: ResizeObserver;
  private disposables = new Set<THREE.Material | THREE.BufferGeometry>();
  private scratchMatrix = new THREE.Matrix4();
  private scratchVector = new THREE.Vector3();
  private sun: THREE.DirectionalLight;
  private jewelGeo = new THREE.OctahedronGeometry(.3);
  private jewelMat = new THREE.MeshStandardMaterial({ color: 0xdff37f, roughness: .25, metalness: .12, emissive: 0x879834, emissiveIntensity: .2 });
  private skyBirds = new THREE.Group();
  constructor(private container: HTMLElement, private options: EngineOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !matchMedia('(pointer: coarse)').matches, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0xe4ddf0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.setAttribute('aria-label', '3D truck rooftop game');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xe4ddf0); this.scene.fog = new THREE.Fog(0xe4ddf0, 45, 160);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9184ac, 2.4));
    this.sun = new THREE.DirectionalLight(0xfff1d8, 3.1); this.sun.position.set(-16, 26, 18);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -25; this.sun.shadow.camera.right = 25; this.sun.shadow.camera.top = 30; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.bias = -.0006; this.sun.shadow.normalBias = .1;
    this.sun.target.position.set(0, 0, -18); this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.world, this.player, this.roadside, this.skyBirds);
    this.disposables.add(this.jewelGeo); this.disposables.add(this.jewelMat);
    this.buildTrucks(); this.createTruckInstances(); this.buildCharacter(options.character); this.createEnvironment();
    const roadMaterial = this.material(0xfff9e9);
    this.roadMarks = new THREE.InstancedMesh(this.geometry(new THREE.BoxGeometry(.075, .018, 3)), roadMaterial, 120);
    this.roadMarks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.world.add(this.roadMarks);
    this.setQuality(options.quality);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(container);
    this.resize(); this.syncWorld();
    window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibility);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.raf = requestAnimationFrame(this.frame);
  }
  private geometry<T extends THREE.BufferGeometry>(g: T): T { this.disposables.add(g); return g; }
  private material(color: number, roughness = .8) { const m = new THREE.MeshStandardMaterial({ color, roughness }); this.disposables.add(m); return m; }
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
  private buildTrucks() {
    const dark = this.material(0x373449); const glass = this.material(0x515971, .28); const chrome = this.material(0xe4e6e0, .5);
    const light = this.material(0xffecaf); const tire = this.material(0x353441);
    const wheelGeo = this.geometry(new THREE.CylinderGeometry(.5, .5, .36, 10).rotateZ(Math.PI / 2));
    const hubGeo = this.geometry(new THREE.CylinderGeometry(.22, .22, .38, 10).rotateZ(Math.PI / 2));
    const blackParts = this.geometry(mergeGeometries([
      box(2.85, .26, 9.8, 0, .73, 0), box(.15, .6, 1.3, -1.54, 1.34, -3.94), box(.15, .6, 1.3, 1.54, 1.34, -3.94),
    ]));
    const trimParts = this.geometry(mergeGeometries([
      box(3.12, .1, 7.6, 0, 2.5, 1.15), box(3.1, .12, .18, 0, .95, -5),
      box(3.1, .1, .12, 0, 1, 5), box(.08, .08, 9.8, -1.49, 1, 0), box(.08, .08, 9.8, 1.49, 1, 0),
    ]));
    const glassGeo = this.geometry(mergeGeometries([
      box(2.72, .55, .035, 0, 1.85, -5.025), box(.035, .53, 1.3, -1.532, 1.85, -4.15), box(.035, .53, 1.3, 1.532, 1.85, -4.15),
    ]));
    const lightsGeo = this.geometry(mergeGeometries([box(.45, .18, .05, -.99, 1.18, -5.05), box(.45, .18, .05, .99, 1.18, -5.05)]));
    const bodyGeo = this.geometry(mergeGeometries([box(3.05, 1.48, 7.5, 0, 1.72, 1.25), box(3.05, 1.48, 2.5, 0, 1.72, -3.75)]));
    for (const color of TRUCK_COLORS) {
      const group = new THREE.Group();
      group.add(this.mesh(bodyGeo, this.material(color)), this.mesh(blackParts, dark), this.mesh(trimParts, chrome), this.mesh(glassGeo, glass), this.mesh(lightsGeo, light));
      for (const x of [-1.52, 1.52]) for (const z of [-3.5, 2.7, 3.8]) {
        const wheel = this.mesh(wheelGeo, tire); wheel.position.set(x, .5, z); group.add(wheel);
        const hub = this.mesh(hubGeo, chrome); hub.position.copy(wheel.position); group.add(hub);
      }
      // Merge wheels per material so each truck uses seven draw calls.
      for (const mat of [tire, chrome]) {
        const geometries: THREE.BufferGeometry[] = [];
        const children = group.children.filter(child => child instanceof THREE.Mesh && (child.geometry === wheelGeo || child.geometry === hubGeo) && child.material === mat) as THREE.Mesh[];
        for (const child of children) { child.updateMatrix(); geometries.push(child.geometry.clone().applyMatrix4(child.matrix)); group.remove(child); }
        const merged = this.geometry(mergeGeometries(geometries)); geometries.forEach(g => g.dispose()); group.add(this.mesh(merged, mat));
      }
      this.truckTemplates.push(group);
    }
  }
  private createTruckInstances() {
    this.truckTemplates.forEach((template, color) => {
      template.children.forEach((child, index) => {
        if (!(child instanceof THREE.Mesh) || (color !== 0 && index !== 0)) return;
        const mesh = new THREE.InstancedMesh(child.geometry, child.material, 64);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        this.scene.add(mesh); this.truckInstances.push({ mesh, color: index === 0 ? color : null });
      });
    });
    this.gems = new THREE.InstancedMesh(this.jewelGeo, this.jewelMat, 64);
    this.gems.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.gems.frustumCulled = false; this.scene.add(this.gems);
  }
  private buildCharacter(id: CharacterId) {
    // Materials and geometries are pooled and disposed with the renderer.
    const oldAssets = new Set<THREE.Material | THREE.BufferGeometry>();
    this.player.traverse(node => { if (node instanceof THREE.Mesh) { oldAssets.add(node.geometry); if (!Array.isArray(node.material)) oldAssets.add(node.material); } });
    oldAssets.forEach(asset => { asset.dispose(); this.disposables.delete(asset); });
    this.player.clear(); this.limbs = [];
    const suit = this.material(id === 'nova' ? 0xa28af7 : id === 'dash' ? 0xef9d62 : 0x74bfb3);
    const skin = this.material(id === 'nova' ? 0xeac4ad : id === 'dash' ? 0xa77150 : 0xe4eee3);
    const hair = this.material(id === 'nova' ? 0x403349 : 0x433e3c); const pant = this.material(id === 'nova' ? 0x574581 : 0x3d4855);
    const shoe = this.material(0xfffbf1); const accent = this.material(id === 'pixel' ? 0xf0a573 : 0xd8eb8c);
    const torso = this.mesh(this.geometry(new RoundedBoxGeometry(.57, .55, .4, 2, .065)), suit); torso.position.y = .8; this.player.add(torso);
    const head = this.mesh(this.geometry(id === 'pixel' ? new THREE.SphereGeometry(.27, 12, 8) : new RoundedBoxGeometry(.43, .43, .4, 2, .075)), skin);
    head.position.set(0, 1.27, -.005); this.player.add(head);
    if (id !== 'pixel') {
      const cap = this.mesh(this.geometry(new RoundedBoxGeometry(.48, .23, .45, 2, .065)), id === 'dash' ? suit : hair); cap.position.set(0, 1.48, .012); this.player.add(cap);
      if (id === 'nova') { const bob = this.mesh(this.geometry(new RoundedBoxGeometry(.48, .36, .2, 2, .06)), hair); bob.position.set(0, 1.3, .19); this.player.add(bob); }
      else { const brim = this.mesh(this.geometry(new THREE.BoxGeometry(.32, .07, .25)), suit); brim.position.set(0, 1.47, .28); this.player.add(brim); }
    }
    const eyeMat = this.material(0x353447); const eyeGeo = this.geometry(new THREE.BoxGeometry(.055, .065, .018));
    for (const x of [-.09, .09]) { const eye = this.mesh(eyeGeo, eyeMat); eye.position.set(x, 1.29, -.2); this.player.add(eye); }
    const scarf = this.mesh(this.geometry(new THREE.BoxGeometry(.57, .1, .4)), accent); scarf.position.set(0, 1.07, 0); this.player.add(scarf);
    const backpack = this.mesh(this.geometry(new RoundedBoxGeometry(.38, .42, .2, 2, .065)), accent); backpack.position.set(0, .84, .24); this.player.add(backpack);
    for (let i = 0; i < 4; i++) {
      const arm = i < 2; const pivot = new THREE.Group(); pivot.position.set((i % 2 ? 1 : -1) * (arm ? .34 : .15), arm ? .99 : .57, 0);
      const limb = this.mesh(this.geometry(new RoundedBoxGeometry(arm ? .18 : .21, arm ? .42 : .4, .21, 2, .045)), arm ? suit : pant);
      limb.position.y = arm ? -.16 : -.19; pivot.add(limb);
      if (!arm) { const foot = this.mesh(this.geometry(new RoundedBoxGeometry(.25, .18, .39, 2, .05)), shoe); foot.position.set(0, -.46, -.085); pivot.add(foot); }
      else { const hand = this.mesh(this.geometry(new THREE.BoxGeometry(.16, .13, .18)), skin); hand.position.set(0, -.4, 0); pivot.add(hand); }
      this.limbs.push(pivot); this.player.add(pivot);
    }
    this.player.scale.setScalar(.88);
  }
  private createEnvironment() {
    const asphalt = this.mesh(this.geometry(new THREE.PlaneGeometry(16, 320).rotateX(-Math.PI / 2)), this.material(0x9b97aa));
    asphalt.receiveShadow = true; asphalt.castShadow = false; asphalt.position.set(0, .005, -65); this.world.add(asphalt);
    const terrain = this.mesh(this.geometry(new THREE.PlaneGeometry(220, 380).rotateX(-Math.PI / 2)), this.material(0xd5d8c4));
    terrain.receiveShadow = true; terrain.castShadow = false; terrain.position.set(0, -.03, -65); this.world.add(terrain);
    const sidewalks = this.geometry(new THREE.BoxGeometry(2.2, .22, 320)); const sidewalkMat = this.material(0xdad5ce);
    for (const x of [-8.1, 8.1]) { const curb = this.mesh(sidewalks, sidewalkMat); curb.position.set(x, .08, -65); this.world.add(curb); }
    const colors = [0xd5c3cf, 0xbdc5d0, 0xd9c8b7, 0xc5c8ae, 0xaeb6cc];
    const geometry = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    for (let c = 0; c < colors.length; c++) {
      const buildings = new THREE.InstancedMesh(geometry, this.material(colors[c]), 14); buildings.castShadow = true; buildings.receiveShadow = true;
      const layout: { x: number; y: number; z: number; w: number; h: number; d: number }[] = [];
      for (let i = 0; i < 14; i++) {
        const side = i % 2 ? -1 : 1; const height = 3 + ((i * 7 + c * 3) % 15); const width = 3.5 + (i % 3);
        this.scratchMatrix.compose(new THREE.Vector3(side * (14 + c * 6), height / 2, -i * 16 + c * 10), new THREE.Quaternion(), new THREE.Vector3(width, height, 5 + i % 4));
        buildings.setMatrixAt(i, this.scratchMatrix);
        layout.push({ x: side * (14 + c * 6), y: height / 2, z: -i * 16 + c * 10, w: width, h: height, d: 5 + i % 4 });
      }
      buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); buildings.frustumCulled = false;
      this.buildings.push(buildings); this.buildingLayouts.push(layout); this.roadside.add(buildings);
    }
    const treeMat = this.material(0x97ae8d); const trunkMat = this.material(0xa48d80);
    const treeGeo = this.geometry(new THREE.IcosahedronGeometry(1.5, 0)); const trunkGeo = this.geometry(new THREE.CylinderGeometry(.15, .2, 1.7, 5));
    for (const [geo, mat] of [[treeGeo, treeMat], [trunkGeo, trunkMat]] as const) {
      const instance = new THREE.InstancedMesh(geo, mat, 22); instance.castShadow = true; instance.receiveShadow = true;
      instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage); instance.frustumCulled = false; this.treeInstances.push(instance); this.roadside.add(instance);
    }
    const cloudGeo = this.geometry(new THREE.SphereGeometry(1, 8, 6)); const cloudMat = this.material(0xf3eef9);
    for (let i = 0; i < 12; i++) { const cloud = this.mesh(cloudGeo, cloudMat); cloud.castShadow = false; cloud.position.set((i % 2 ? -1 : 1) * (20 + i * 3), 21 + i % 4 * 3, -i * 14); cloud.scale.set(4, .8, 1.7); this.skyBirds.add(cloud); }
  }
  private resize = () => {
    const width = this.container.clientWidth; const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  };
  private syncWorld() {
    for (const { mesh, color } of this.truckInstances) {
      let index = 0;
      for (const t of this.run.trucks) {
        if ((color !== null && t.color !== color) || t.z < this.run.player.z - 125) continue;
        this.scratchMatrix.makeTranslation(t.x, 0, t.z); mesh.setMatrixAt(index++, this.scratchMatrix);
      }
      mesh.count = index; mesh.instanceMatrix.needsUpdate = true;
    }
    let index = 0;
    this.gemRotation.setFromAxisAngle(this.up, this.animationTime * 1.8);
    for (const t of this.run.trucks) if (t.gem && !t.collected && t.z > this.run.player.z - 125) {
      this.scratchMatrix.compose(this.scratchVector.set(t.x, 3.5 + Math.sin(this.animationTime * 2.5 + t.id) * .12, t.z), this.gemRotation, this.scratchScale.set(1, 1, 1));
      this.gems.setMatrixAt(index++, this.scratchMatrix);
    }
    this.gems.count = index; this.gems.instanceMatrix.needsUpdate = true;
  }
  private keyDown = (e: KeyboardEvent) => {
    if (this.phase !== 'playing') return;
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyW', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code) && !e.repeat) this.jumpQueued = true;
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); this.touchDirection = 0; if (this.phase === 'playing') this.options.onPause(); };
  private visibility = () => { if (document.hidden) this.blur(); };
  private contextLost = (e: Event) => { e.preventDefault(); this.phase = 'paused'; this.options.onError('Graphics were interrupted. Reload the page to restore the game.'); };
  private frame = (timestamp: number) => {
    const interval = this.phase === 'menu' ? 1000 / 30 : this.phase === 'paused' || this.phase === 'over' ? 100 : 0;
    if (document.hidden || timestamp - this.lastRender < interval) {
      if (document.hidden) this.lastTime = timestamp;
      this.raf = requestAnimationFrame(this.frame); return;
    }
    this.lastRender = timestamp;
    const dt = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, .075) : 0;
    this.lastTime = timestamp; this.animationTime += dt;
    if (this.phase === 'playing') {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 120) {
        const prevJumps = this.run.jumps; const prevGems = this.run.gems;
        const direction = this.touchDirection || Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
        updateRun(this.run, { direction, jump: this.jumpQueued }, 1 / 120); this.jumpQueued = false;
        if (this.run.jumps !== prevJumps) playTone('jump', this.options.sound);
        if (this.run.gems !== prevGems) playTone('gem', this.options.sound);
        this.accumulator -= 1 / 120;
        if (this.run.over) { this.phase = 'over'; playTone('over', this.options.sound); this.options.onOver(this.run); break; }
      }
      this.displayTime += dt;
      if (this.displayTime > .09) {
        this.displayTime = 0; this.options.onStats({ score: this.run.score, distance: this.run.distance, gems: this.run.gems,
          jumps: this.run.jumps, landings: this.run.landings, edge: distanceToEdge(this.run), airborne: !this.run.player.grounded });
      }
    }
    if (this.phase !== 'paused') {
      this.syncWorld(); const p = this.run.player;
      const bounce = p.grounded && this.phase === 'playing' ? Math.abs(Math.sin(this.run.time * 15)) * .07 : 0;
      this.player.position.set(p.x, p.y + bounce, p.z); this.player.rotation.z = -this.touchDirection * .1;
      for (let i = 0; i < this.limbs.length; i++) this.limbs[i].rotation.x = !p.grounded ? (i < 2 ? -1.1 : .45) : this.phase === 'playing' ? Math.sin(this.run.time * 15 + (i % 2) * Math.PI + (i < 2 ? Math.PI : 0)) * .65 : Math.sin(this.animationTime * 1.4 + i) * .06;
    }
    const p = this.run.player;
    if (this.phase === 'menu') {
      const narrow = this.camera.aspect < .85;
      this.camera.position.set(11 + (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(this.animationTime * .14) * 1.5), narrow ? 11 : 8.5, narrow ? 19 : 13.5);
      this.camera.lookAt(0, 1.5, narrow ? -9 : -9);
    } else {
      const factor = 1 - Math.exp(-dt * 7);
      this.scratchVector.set(p.x * .62, Math.max(6.3, p.y + 3.5), p.z + (this.camera.aspect < .8 ? 11 : 9));
      this.camera.position.lerp(this.scratchVector, factor);
      this.camera.lookAt(p.x * .75, 1.9, p.z - 12);
    }
    this.world.position.z = p.z; 
    for (let c = 0; c < this.buildings.length; c++) {
      this.buildingLayouts[c].forEach((b, i) => {
        const z = b.z + Math.floor((p.z - b.z + 35) / 224) * 224;
        this.scratchMatrix.compose(this.scratchVector.set(b.x, b.y, z), this.identity, this.scratchScale.set(b.w, b.h, b.d));
        this.buildings[c].setMatrixAt(i, this.scratchMatrix);
      });
      this.buildings[c].instanceMatrix.needsUpdate = true;
    }
    this.treeInstances.forEach((mesh, part) => {
      for (let i = 0; i < 22; i++) {
        const baseZ = -i * 10; const z = baseZ + Math.floor((p.z - baseZ + 25) / 220) * 220;
        this.scratchMatrix.compose(this.scratchVector.set((i % 2 ? -1 : 1) * 10.4, part === 0 ? 2.6 : .85, z), this.identity, this.scratchScale.set(1, part === 0 ? 1.2 : 1, 1));
        mesh.setMatrixAt(i, this.scratchMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }); this.skyBirds.position.z = p.z * .85;
    for (let i = 0; i < 120; i++) {
      const lane = i % 3; const z = -Math.floor(i / 3) * 8 + ((this.run.distance + 8) % 8);
      this.scratchMatrix.makeTranslation((lane - 1) * 3.65 + (lane === 1 ? 1.83 : 1.83), .02, z + 20); this.roadMarks.setMatrixAt(i, this.scratchMatrix);
    }
    this.roadMarks.instanceMatrix.needsUpdate = true;
    this.sun.position.set(p.x - 16, 26, p.z + 18); this.sun.target.position.set(p.x, 0, p.z - 18);
    this.renderer.render(this.scene, this.camera);
    this.frames++; this.fpsTime += dt;
    if (this.fpsTime > 4) {
      if (this.options.quality === 'auto' && this.phase === 'playing' && this.frames / this.fpsTime < 38 && this.renderer.getPixelRatio() > 1) {
        this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; this.resize();
      }
      this.frames = 0; this.fpsTime = 0;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  start(chill = false) {
    this.frames = 0; this.fpsTime = 0; this.run = createRun(Date.now(), chill); this.phase = 'playing'; this.accumulator = 0; this.keys.clear(); this.jumpQueued = false; this.touchDirection = 0;
    this.camera.position.set(0, 6.3, 12); this.syncWorld();
  }
  setPhase(phase: Phase) { this.phase = phase; this.keys.clear(); this.touchDirection = 0; this.accumulator = 0; }
  menu() { this.phase = 'menu'; this.run = createRun(174); this.syncWorld(); }
  jump() { if (this.phase === 'playing') this.jumpQueued = true; }
  move(direction: number) { this.touchDirection = direction; }
  setCharacter(id: CharacterId) { if (this.options.character !== id) { this.options.character = id; this.buildCharacter(id); } }
  setSound(sound: boolean) { this.options.sound = sound; }
  setQuality(quality: Quality) {
    this.options.quality = quality;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio, quality === 'high' ? 2 : mobile ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = quality === 'high' || (quality === 'auto' && !mobile);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.resize();
  }
  dispose() {
    cancelAnimationFrame(this.raf); this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility); this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.disposables.forEach(item => item.dispose()); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
