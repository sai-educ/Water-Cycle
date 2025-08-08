// ===== Imports (CDN ESM) =====
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import * as EZT from 'https://cdn.jsdelivr.net/npm/@dgreenheck/ez-tree@1.0.0/build/ez-tree.es.js';
import { Cloud } from 'https://cdn.jsdelivr.net/npm/@pmndrs/vanilla@1.23.0/core/index.js';

// ===== Simulation =====
class WaterCycleSim {
  constructor() {
    // Core Three
    this.scene   = new THREE.Scene();
    this.camera  = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
    this.clock   = new THREE.Clock();
    this.isPlaying = true;

    // Params
    this.params = { temperature: 25, humidity: 50, windSpeed: 5 };

    // Collections
    this.waterBodies = [];
    this.treeEmitters = []; // positions for transpiration particle emission
    this.clouds = [];

    // Init
    this.setupRenderer();
    this.setupCamera();
    this.setupLights();
    this.createGround();
    this.createWaterBodies();
    this.createEZTrees();   // Trees (EZ‑Tree)
    this.createClouds();    // Clouds (drei‑vanilla) — kept high "on the top"
    this.createParticles();

    this.setupUI();
    this.animate();
  }

  // --- Setup ---
  setupRenderer() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb, 1);
  }

  setupCamera() {
    this.camera.position.set(32, 20, 34);
    this.camera.lookAt(0, 6, 0);
  }

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(50, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5f3a, 0.35);
    this.scene.add(hemi);
  }

  // --- Terrain & Water ---
  createGround() {
    const geo = new THREE.PlaneGeometry(120, 120, 80, 80);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a5f3a, roughness: 0.85 });
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.6;
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  createWaterBodies() {
    const lakes = [
      { x: -22, z: -12, w: 18, h: 12 },
      { x:  16, z:  10, w: 14, h: 10 },
      { x:   2, z:  -4, w:  9, h:  8 },
    ];
    lakes.forEach(({ x, z, w, h }) => {
      const geo = new THREE.PlaneGeometry(w, h, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1976d2, transparent: true, opacity: 0.85,
        roughness: 0.1, metalness: 0.15
      });
      const water = new THREE.Mesh(geo, mat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, 0.08, z);
      water.receiveShadow = true;
      water.userData = { base: geo.attributes.position.array.slice(), w, h };
      this.waterBodies.push(water);
      this.scene.add(water);
    });
  }

  // --- EZ‑Tree (procedural trees) ---
  createEZTrees() {
    const spots = [
      { x: -10, z:  5, scale: 1.00, seed: 101 },
      { x:  10, z: -8, scale: 1.10, seed: 202 },
      { x: -15, z: 15, scale: 0.90, seed: 303 },
      { x:  20, z:  6, scale: 1.20, seed: 404 },
      { x:   5, z: 14, scale: 0.95, seed: 505 },
      { x: -25, z: -6, scale: 1.15, seed: 606 },
      { x:  26, z: -16, scale: 1.00, seed: 707 },
      { x:   0, z: 11, scale: 1.05, seed: 808 },
    ];

    const forest = new THREE.Group();
    this.scene.add(forest);

    for (const s of spots) {
      const t = new EZT.Tree();

      // Lightweight but natural look
      t.options.seed = s.seed;
      t.options.branch.levels = 3;
      t.options.branch.angle = { 0: 20, 1: 25, 2: 30 };
      t.options.branch.children = { 0: 3, 1: 3, 2: 2 };
      t.options.branch.length = { 0: 7, 1: 5, 2: 3.5 };
      t.options.branch.radius = { 0: 0.6, 1: 0.35, 2: 0.22 };
      t.options.leaves.count = 800;
      t.options.leaves.size = 0.22;
      t.options.leaves.alphaTest = 0.3;
      t.options.bark.flatShading = false;

      t.generate(); // build meshes

      t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      t.position.set(s.x, 0, s.z);
      t.scale.setScalar(s.scale);
      t.rotation.y = Math.random() * Math.PI * 2;
      forest.add(t);

      // Emitter near canopy top (~80% of height)
      const box = new THREE.Box3().setFromObject(t);
      const size = box.getSize(new THREE.Vector3());
      this.treeEmitters.push(new THREE.Vector3(s.x, size.y * s.scale * 0.8, s.z));
    }
  }

  // --- Clouds (kept high on top) ---
  createClouds() {
    // Big cloud deck high in the sky
    const deck = Cloud({
      bounds: [70, 12, 50],
      segments: 22,
      volume: 8,
      speed: 0.15,
      opacity: 0.6,
      fade: 22,
      color: '#ffffff',
    });
    deck.group.position.set(0, 26, 0); // "top" of the scene
    this.scene.add(deck.group);
    this.clouds.push(deck);

    // Secondary band offset a bit lower (still “top”)
    const band = Cloud({
      bounds: [50, 10, 36],
      segments: 20,
      volume: 6,
      speed: 0.2,
      opacity: 0.55,
      fade: 18,
      color: '#eef6ff',
    });
    band.group.position.set(-12, 22, -10);
    this.scene.add(band.group);
    this.clouds.push(band);
  }

  // --- Particles (evaporation & transpiration) ---
  createParticles() {
    // Transpiration (green)
    const tCount = 600;
    const tPos = new Float32Array(tCount * 3);
    const tVel = new Float32Array(tCount * 3);
    for (let i = 0; i < tCount; i++) {
      const idx = Math.floor(Math.random() * this.treeEmitters.length);
      const p = this.treeEmitters[idx] || new THREE.Vector3();
      tPos[i*3+0] = p.x + (Math.random() - 0.5) * 2;
      tPos[i*3+1] = p.y + Math.random() * 3;
      tPos[i*3+2] = p.z + (Math.random() - 0.5) * 2;
      tVel[i*3+0] = (Math.random() - 0.5) * 0.08;
      tVel[i*3+1] = Math.random() * 0.2 + 0.1;
      tVel[i*3+2] = (Math.random() - 0.5) * 0.08;
    }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    const tMat = new THREE.PointsMaterial({
      color: 0x64ff64, size: 0.5, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.transpiration = new THREE.Points(tGeo, tMat);
    this.transpiration.userData = { vel: tVel };
    this.scene.add(this.transpiration);

    // Evaporation (blue)
    const eCount = 600;
    const ePos = new Float32Array(eCount * 3);
    const eVel = new Float32Array(eCount * 3);
    for (let i = 0; i < eCount; i++) {
      if (this.waterBodies.length) {
        const w = this.waterBodies[Math.floor(Math.random() * this.waterBodies.length)];
        ePos[i*3+0] = w.position.x + (Math.random() - 0.5) * w.userData.w;
        ePos[i*3+1] = 0.12;
        ePos[i*3+2] = w.position.z + (Math.random() - 0.5) * w.userData.h;
      }
      eVel[i*3+0] = (Math.random() - 0.5) * 0.05;
      eVel[i*3+1] = Math.random() * 0.15 + 0.05;
      eVel[i*3+2] = (Math.random() - 0.5) * 0.05;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const eMat = new THREE.PointsMaterial({
      color: 0x64c8ff, size: 0.45, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.evaporation = new THREE.Points(eGeo, eMat);
    this.evaporation.userData = { vel: eVel };
    this.scene.add(this.evaporation);

    // ---- Rain hook (not yet used) ----
    // this.precipitation = this.createRainSystem(); // call later when adding rain
  }

  // Example stub for future raindrops
  createRainSystem() {
    const count = 1500;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i*3+0] = (Math.random() - 0.5) * 120;
      pos[i*3+1] = 30 + Math.random() * 20;   // start high
      pos[i*3+2] = (Math.random() - 0.5) * 120;
      vel[i] = 10 + Math.random() * 10;       // fall speed
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.9 });
    const rain = new THREE.Points(geo, mat);
    rain.userData = { vel };
    return rain;
  }

  // --- UI ---
  setupUI() {
    const $ = id => document.getElementById(id);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    $('temperature').addEventListener('input', e => {
      this.params.temperature = +e.target.value; $('temp-value').textContent = this.params.temperature;
    });
    $('humidity').addEventListener('input', e => {
      this.params.humidity = +e.target.value; $('humidity-value').textContent = this.params.humidity;
    });
    $('wind').addEventListener('input', e => {
      this.params.windSpeed = +e.target.value; $('wind-value').textContent = this.params.windSpeed;
    });

    $('toggle-btn').addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      $('toggle-btn').textContent = this.isPlaying ? 'Pause' : 'Play';
    });

    $('reset-btn').addEventListener('click', () => {
      this.params = { temperature: 25, humidity: 50, windSpeed: 5 };
      $('temperature').value = 25; $('temp-value').textContent = 25;
      $('humidity').value = 50; $('humidity-value').textContent = 50;
      $('wind').value = 5; $('wind-value').textContent = 5;
    });
  }

  // --- Frame ---
  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.isPlaying) return;

    const dt = this.clock.getDelta();
    const t  = this.clock.getElapsedTime();

    // water ripples
    for (const w of this.waterBodies) {
      const pos = w.geometry.attributes.position;
      const base = w.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i*3+0], z = base[i*3+2];
        const wave = Math.sin(x * 0.45 + t * 1.8) * 0.1 + Math.cos(z * 0.45 + t * 1.1) * 0.08;
        pos.setY(i, wave);
      }
      pos.needsUpdate = true;
      w.geometry.computeVertexNormals();
    }

    // particle systems
    this.updateParticles(dt);

    // clouds drift with wind; tick helper if available
    for (const c of this.clouds) {
      c.group.position.x += this.params.windSpeed * 0.002;
      if (typeof c.update === 'function') c.update(t);
    }

    // optional rain update (when enabled later)
    // if (this.precipitation) this.updateRain(dt);

    // camera orbit
    const r = 42;
    this.camera.position.x = Math.sin(t * 0.2) * r;
    this.camera.position.z = Math.cos(t * 0.2) * r;
    this.camera.position.y = 20 + Math.sin(t * 0.3) * 5;
    this.camera.lookAt(0, 6, 0);

    this.renderer.render(this.scene, this.camera);
  }

  updateParticles(dt) {
    const tempF = (this.params.temperature - 10) / 30;  // 0..1
    const humidF = 1 - (this.params.humidity - 20) / 70; // 1..0
    const windF = this.params.windSpeed / 20;            // 0..1

    const transp = (tempF * 0.7 + humidF * 0.3) * 2.5;
    const evap   = (tempF * 0.8 + windF  * 0.2) * 3.0;

    document.getElementById('transpiration-rate').textContent = transp.toFixed(1) + ' mm/hr';
    document.getElementById('evaporation-rate').textContent   = evap.toFixed(1) + ' mm/hr';

    // transpiration
    const tPos = this.transpiration.geometry.attributes.position;
    const tVel = this.transpiration.userData.vel;
    for (let i = 0; i < tPos.count; i++) {
      tPos.setY(i, tPos.getY(i) + tVel[i*3+1] * dt * transp);
      tPos.setX(i, tPos.getX(i) + tVel[i*3+0] + this.params.windSpeed * 0.01 * dt);
      if (tPos.getY(i) > 30) {
        const idx = Math.floor(Math.random() * this.treeEmitters.length);
        const p = this.treeEmitters[idx] || new THREE.Vector3();
        tPos.setX(i, p.x + (Math.random() - 0.5) * 2);
        tPos.setY(i, p.y + Math.random() * 3);
        tPos.setZ(i, p.z + (Math.random() - 0.5) * 2);
      }
    }
    tPos.needsUpdate = true;
    this.transpiration.material.opacity = 0.3 + humidF * 0.3;

    // evaporation
    const ePos = this.evaporation.geometry.attributes.position;
    const eVel = this.evaporation.userData.vel;
    for (let i = 0; i < ePos.count; i++) {
      ePos.setY(i, ePos.getY(i) + eVel[i*3+1] * dt * evap);
      ePos.setX(i, ePos.getX(i) + eVel[i*3+0] + this.params.windSpeed * 0.01 * dt);
      if (ePos.getY(i) > 25 && this.waterBodies.length) {
        const w = this.waterBodies[Math.floor(Math.random() * this.waterBodies.length)];
        ePos.setX(i, w.position.x + (Math.random() - 0.5) * w.userData.w);
        ePos.setY(i, 0.12);
        ePos.setZ(i, w.position.z + (Math.random() - 0.5) * w.userData.h);
      }
    }
    ePos.needsUpdate = true;
    this.evaporation.material.opacity = 0.2 + humidF * 0.3;
  }

  // for later
  updateRain(dt) {
    const pos = this.precipitation.geometry.attributes.position;
    const vel = this.precipitation.userData.vel;
    for (let i = 0; i < vel.length; i++) {
      let y = pos.getY(i) - vel[i] * dt;
      if (y < 0.1) y = 26 + Math.random() * 10; // reset back to "top"
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + this.params.windSpeed * 0.03 * dt);
    }
    pos.needsUpdate = true;
  }
}

// Boot
new WaterCycleSim();
