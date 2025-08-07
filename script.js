// Realistic Water Cycle Simulation using Three.js and WebGL Shaders
document.addEventListener('DOMContentLoaded', () => {
    // Check for WebGL support
    if (!window.WebGLRenderingContext) {
        alert("Your browser does not support WebGL. This simulation cannot run.");
        return;
    }

    const simulation = new WaterCycleSimulation();
});

class WaterCycleSimulation {
    constructor() {
        // Core Three.js components
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('simulation-canvas'),
            antialias: true,
            alpha: true
        });

        // Environment and simulation parameters
        this.clock = new THREE.Clock();
        this.simplex = new SimplexNoise();
        this.isPlaying = true;
        this.params = {
            temperature: 15.0,
            windSpeed: 10.0,
        };

        // Water cycle state machine
        this.cycleState = 'EVAPORATION';
        this.cycleTimer = 0;
        this.cycleDurations = {
            EVAPORATION: 15, // seconds
            CONDENSATION: 10,
            PRECIPITATION: 20,
            COLLECTION: 8
        };

        // Object containers
        this.objects = {};
        this.particleSystems = {};

        this.init();
    }

    async init() {
        this.setupRenderer();
        this.setupCamera();
        this.setupLighting();
        this.setupEventListeners();

        // Create scene elements
        this.createSky();
        this.createTerrain();
        this.createWater();
        await this.createTrees();
        this.createClouds();

        // Create particle systems for water cycle processes
        this.createEvaporationParticles();
        this.createRainParticles();
        this.createRunoffParticles();

        // Hide loading screen and start animation
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 500);

        this.animate();
        this.updateCycleStage();
    }

    // --- SETUP METHODS --- //

    setupRenderer() {
        const container = document.getElementById('simulation-container');
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    setupCamera() {
        this.camera.position.set(60, 40, 80);
        this.camera.lookAt(0, 0, 0);
    }

    setupLighting() {
        // Ambient light for overall illumination
        const ambientLight = new THREE.AmbientLight(0x6093c4, 0.5);
        this.scene.add(ambientLight);

        // Directional light for sun
        this.objects.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.objects.sunLight.position.set(100, 100, 50);
        this.objects.sunLight.castShadow = true;
        this.objects.sunLight.shadow.mapSize.set(2048, 2048);
        this.objects.sunLight.shadow.camera.left = -100;
        this.objects.sunLight.shadow.camera.right = 100;
        this.objects.sunLight.shadow.camera.top = 100;
        this.objects.sunLight.shadow.camera.bottom = -100;
        this.objects.sunLight.shadow.camera.near = 0.5;
        this.objects.sunLight.shadow.camera.far = 300;
        this.scene.add(this.objects.sunLight);
    }

    // --- SCENE CREATION METHODS --- //

    createSky() {
        const sky = new THREE.Sky();
        sky.scale.setScalar(1000);
        this.scene.add(sky);

        const sun = new THREE.Vector3();
        const effectController = {
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            elevation: 2,
            azimuth: 180,
        };

        const uniforms = sky.material.uniforms;
        uniforms['turbidity'].value = effectController.turbidity;
        uniforms['rayleigh'].value = effectController.rayleigh;
        uniforms['mieCoefficient'].value = effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);
        sun.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(sun);

        this.objects.sunLight.position.copy(sun).multiplyScalar(100);
    }

    createTerrain() {
        const size = 200;
        const segments = 100;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

        const positions = geometry.attributes.position;
        const colors = [];

        // Generate terrain height and colors
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            
            // Generate height using simplex noise
            let height = this.simplex.noise2D(x / 50, z / 50) * 10;
            height += this.simplex.noise2D(x / 20, z / 20) * 3;
            height += this.simplex.noise2D(x / 10, z / 10) * 1;
            positions.setY(i, height);

            // Set colors based on height
            const snowColor = new THREE.Color(0xffffff);
            const rockColor = new THREE.Color(0x808080);
            const grassColor = new THREE.Color(0x559020);
            const sandColor = new THREE.Color(0xc2b280);

            let color = new THREE.Color();
            if (height > 12) color.copy(snowColor);
            else if (height > 8) color.lerpColors(rockColor, snowColor, (height - 8) / 4);
            else if (height > 2) color.lerpColors(grassColor, rockColor, (height - 2) / 6);
            else if (height > 0) color.lerpColors(sandColor, grassColor, height / 2);
            else color.copy(sandColor);

            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1
        });

        this.objects.terrain = new THREE.Mesh(geometry, material);
        this.objects.terrain.rotation.x = -Math.PI / 2;
        this.objects.terrain.receiveShadow = true;
        this.scene.add(this.objects.terrain);
    }
    
    createWater() {
        const waterGeometry = new THREE.PlaneGeometry(200, 200);
        this.objects.water = new THREE.Water(waterGeometry, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg', (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: 0x001e0f,
            distortionScale: 3.7,
            fog: this.scene.fog !== undefined
        });
        this.objects.water.rotation.x = -Math.PI / 2;
        this.objects.water.position.y = 0.5; // Sea level
        this.scene.add(this.objects.water);
    }
    
    async createTrees() {
        // More realistic trees using instanced mesh for performance
        const loader = new THREE.GLTFLoader();
        const treeData = await loader.loadAsync('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/pine.glb');
        const treeMesh = treeData.scene.children[0];
        treeMesh.castShadow = true;

        const count = 200;
        const instancedTreeMesh = new THREE.InstancedMesh(treeMesh.geometry, treeMesh.material, count);
        instancedTreeMesh.castShadow = true;
        instancedTreeMesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 180;
            const z = (Math.random() - 0.5) * 180;
            
            const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
            const intersects = raycaster.intersectObject(this.objects.terrain);

            if (intersects.length > 0) {
                const y = intersects[0].point.y;
                if (y > 2 && y < 10) { // Only place on grassy areas
                    dummy.position.set(x, y, z);
                    dummy.rotation.y = Math.random() * Math.PI * 2;
                    const scale = Math.random() * 0.5 + 0.8;
                    dummy.scale.set(scale, scale, scale);
                    dummy.updateMatrix();
                    instancedTreeMesh.setMatrixAt(i, dummy.matrix);
                }
            }
        }
        this.scene.add(instancedTreeMesh);
    }

    createClouds() {
        // Volumetric-style clouds using layered planes
        this.objects.clouds = new THREE.Group();
        const cloudTexture = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/cloud.png');
        const cloudMaterial = new THREE.SpriteMaterial({
            map: cloudTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        for (let i = 0; i < 25; i++) {
            const cloudSprite = new THREE.Sprite(cloudMaterial);
            cloudSprite.position.set(
                (Math.random() - 0.5) * 150,
                30 + Math.random() * 15, // Cloud altitude
                (Math.random() - 0.5) * 150
            );
            const scale = Math.random() * 20 + 20;
            cloudSprite.scale.set(scale, scale, scale);
            this.objects.clouds.add(cloudSprite);
        }
        this.scene.add(this.objects.clouds);
    }

    // --- PARTICLE SYSTEM METHODS --- //

    createEvaporationParticles() {
        const count = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 150;
            positions[i3 + 1] = 0.5;
            positions[i3 + 2] = (Math.random() - 0.5) * 150;
            
            velocities[i3] = (Math.random() - 0.5) * 0.1;
            velocities[i3 + 1] = Math.random() * 0.2 + 0.1; // Upward velocity
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0xeeeeff,
            size: 1,
            transparent: true,
            opacity: 0, // Initially invisible
            blending: THREE.AdditiveBlending
        });

        this.particleSystems.evaporation = new THREE.Points(geometry, material);
        this.particleSystems.evaporation.userData.velocities = velocities;
        this.scene.add(this.particleSystems.evaporation);
    }

    createRainParticles() {
        const count = 5000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 200;
            positions[i3 + 1] = 30 + Math.random() * 20;
            positions[i3 + 2] = (Math.random() - 0.5) * 200;
            
            velocities[i3] = 0;
            velocities[i3 + 1] = - (Math.random() * 0.5 + 0.5); // Downward velocity
            velocities[i3 + 2] = 0;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0xaaaaee,
            size: 0.3,
            transparent: true,
            opacity: 0, // Initially invisible
        });

        this.particleSystems.rain = new THREE.Points(geometry, material);
        this.particleSystems.rain.userData.velocities = velocities;
        this.scene.add(this.particleSystems.rain);
    }

    createRunoffParticles() {
        const count = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0x6699ff,
            size: 0.2,
            transparent: true,
            opacity: 0, // Initially invisible
        });

        this.particleSystems.runoff = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystems.runoff);
    }

    // --- ANIMATION & UPDATE LOGIC --- //

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isPlaying) return;

        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        // Update water cycle
        this.updateWaterCycle(delta);

        // Animate objects
        this.objects.water.material.uniforms['time'].value += 1.0 / 60.0;
        this.objects.clouds.children.forEach((cloud, i) => {
            cloud.position.x += (delta * this.params.windSpeed / 5);
            if (cloud.position.x > 100) cloud.position.x = -100;
        });

        this.renderer.render(this.scene, this.camera);
    }

    updateWaterCycle(delta) {
        this.cycleTimer += delta;
        const currentDuration = this.cycleDurations[this.cycleState];

        // Transition to next state if timer exceeds duration
        if (this.cycleTimer > currentDuration) {
            this.cycleTimer = 0;
            switch (this.cycleState) {
                case 'EVAPORATION': this.cycleState = 'CONDENSATION'; break;
                case 'CONDENSATION': this.cycleState = 'PRECIPITATION'; break;
                case 'PRECIPITATION': this.cycleState = 'COLLECTION'; break;
                case 'COLLECTION': this.cycleState = 'EVAPORATION'; break;
            }
            this.updateCycleStage();
        }

        const progress = this.cycleTimer / currentDuration;

        // Update particle systems based on cycle state
        this.updateEvaporation(this.cycleState === 'EVAPORATION', progress);
        this.updateCondensation(this.cycleState === 'CONDENSATION', progress);
        this.updatePrecipitation(this.cycleState === 'PRECIPITATION', progress);
        this.updateCollection(this.cycleState === 'COLLECTION', progress);
    }

    updateEvaporation(isActive, progress) {
        const particles = this.particleSystems.evaporation;
        particles.material.opacity = isActive ? Math.sin(progress * Math.PI) * 0.5 : 0;

        if (!isActive) return;

        const positions = particles.geometry.attributes.position;
        const velocities = particles.userData.velocities;

        for (let i = 0; i < positions.count; i++) {
            positions.setY(i, positions.getY(i) + velocities[i*3+1] * (1 + this.params.temperature / 15));
            if (positions.getY(i) > 30) {
                positions.setY(i, 0.5); // Reset particle
            }
        }
        positions.needsUpdate = true;
    }

    updateCondensation(isActive, progress) {
        // Visually represent condensation by making clouds denser
        const opacity = 0.6 + Math.sin(progress * Math.PI) * 0.4;
        this.objects.clouds.children.forEach(cloud => {
            cloud.material.opacity = opacity;
        });
    }

    updatePrecipitation(isActive, progress) {
        const particles = this.particleSystems.rain;
        particles.material.opacity = isActive ? Math.sin(progress * Math.PI) * 0.7 : 0;

        if (!isActive) return;

        const positions = particles.geometry.attributes.position;
        const velocities = particles.userData.velocities;

        for (let i = 0; i < positions.count; i++) {
            const i3 = i * 3;
            positions.setX(i, positions.getX(i) + this.params.windSpeed / 50);
            positions.setY(i, positions.getY(i) + velocities[i3 + 1]);

            // Check for collision with terrain
            const raycaster = new THREE.Raycaster(new THREE.Vector3(positions.getX(i), 50, positions.getZ(i)), new THREE.Vector3(0, -1, 0));
            const intersects = raycaster.intersectObject(this.objects.terrain);

            if (intersects.length > 0 && positions.getY(i) < intersects[0].point.y) {
                // Reset particle to a cloud position
                const cloud = this.objects.clouds.children[Math.floor(Math.random() * this.objects.clouds.children.length)];
                positions.setX(i, cloud.position.x + (Math.random() - 0.5) * 10);
                positions.setY(i, cloud.position.y);
                positions.setZ(i, cloud.position.z + (Math.random() - 0.5) * 10);
            } else if (positions.getY(i) < -10) {
                 const cloud = this.objects.clouds.children[Math.floor(Math.random() * this.objects.clouds.children.length)];
                positions.setX(i, cloud.position.x + (Math.random() - 0.5) * 10);
                positions.setY(i, cloud.position.y);
                positions.setZ(i, cloud.position.z + (Math.random() - 0.5) * 10);
            }
        }
        positions.needsUpdate = true;
    }

    updateCollection(isActive, progress) {
        // For simplicity, we just show the info panel update.
        // A more complex version would animate runoff particles.
    }


    // --- UI & EVENT HANDLERS --- //

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());

        // Control panel listeners
        document.getElementById('temperature-slider').addEventListener('input', (e) => {
            this.params.temperature = parseFloat(e.target.value);
            document.getElementById('temp-value').textContent = `${this.params.temperature.toFixed(1)}°C`;
        });
        document.getElementById('wind-slider').addEventListener('input', (e) => {
            this.params.windSpeed = parseFloat(e.target.value);
            document.getElementById('wind-value').textContent = `${this.params.windSpeed.toFixed(0)} km/h`;
        });
        document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetSimulation());
        
        // Mouse controls for camera
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousedown', () => isDragging = true);
        canvas.addEventListener('mouseup', () => isDragging = false);
        canvas.addEventListener('mouseleave', () => isDragging = false);
        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaMove = {
                x: e.offsetX - previousMousePosition.x,
                y: e.offsetY - previousMousePosition.y
            };
            
            const deltaRotationQuaternion = new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(
                    THREE.MathUtils.degToRad(deltaMove.y * 0.5),
                    THREE.MathUtils.degToRad(deltaMove.x * 0.5),
                    0,
                    'XYZ'
                ));
            
            this.camera.position.applyQuaternion(deltaRotationQuaternion);
            this.camera.lookAt(0, 0, 0);

            previousMousePosition = { x: e.offsetX, y: e.offsetY };
        });
        canvas.addEventListener('wheel', (e) => {
            const zoomAmount = e.deltaY * 0.05;
            this.camera.position.z += zoomAmount;
            this.camera.position.x += zoomAmount;
        });
    }

    onWindowResize() {
        const container = document.getElementById('simulation-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }
    
    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        document.getElementById('play-pause-btn').innerHTML = this.isPlaying ? '⏸️ Pause' : '▶️ Play';
    }

    resetSimulation() {
        // Reset params and UI
        this.params.temperature = 15.0;
        this.params.windSpeed = 10.0;
        document.getElementById('temperature-slider').value = 15.0;
        document.getElementById('wind-slider').value = 10.0;
        document.getElementById('temp-value').textContent = '15.0°C';
        document.getElementById('wind-value').textContent = '10 km/h';

        // Reset cycle
        this.cycleState = 'EVAPORATION';
        this.cycleTimer = 0;
        this.updateCycleStage();
    }

    updateCycleStage() {
        // Update main info text
        const stageInfo = document.getElementById('cycle-stage-info');
        stageInfo.textContent = this.cycleState.charAt(0) + this.cycleState.slice(1).toLowerCase();

        // Update active indicators and glows
        const allProcesses = document.querySelectorAll('.process-indicator');
        allProcesses.forEach(p => p.classList.remove('active'));
        document.getElementById(`${this.cycleState.toLowerCase()}-indicator`).classList.add('active');

        const allInfoSections = document.querySelectorAll('.info-section');
        allInfoSections.forEach(s => s.classList.remove('active'));
        document.getElementById(`info-${this.cycleState.toLowerCase()}`).classList.add('active');

        // Update state label glows
        const solidLabel = document.getElementById('solid-label');
        const liquidLabel = document.getElementById('liquid-label');
        const gasLabel = document.getElementById('gas-label');

        solidLabel.classList.toggle('glow', this.params.temperature < 0);
        liquidLabel.classList.toggle('glow', this.cycleState === 'PRECIPITATION' || this.cycleState === 'COLLECTION');
        gasLabel.classList.toggle('glow', this.cycleState === 'EVAPORATION' || this.cycleState === 'CONDENSATION');
    }
}

// Helper for Three.js Water, Sky, and GLTFLoader (as they are not in the core library)
// This is a simplified version of the necessary components.
// In a real project, you would import these from the 'three/examples/jsm/' directory.

// --- THREE.js Water (Simplified for inclusion) --- //
THREE.Water = function (geometry, options) {
    THREE.Mesh.call(this, geometry);
    var scope = this;
    options = options || {};
    var textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
    var textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;
    var clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
    var alpha = options.alpha !== undefined ? options.alpha : 1.0;
    var time = options.time !== undefined ? options.time : 0.0;
    var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
    var sunDirection = options.sunDirection !== undefined ? options.sunDirection : new THREE.Vector3(0.70707, 0.70707, 0.0);
    var sunColor = new THREE.Color(options.sunColor !== undefined ? options.sunColor : 0xffffff);
    var waterColor = new THREE.Color(options.waterColor !== undefined ? options.waterColor : 0x7F7F7F);
    var eye = options.eye !== undefined ? options.eye : new THREE.Vector3(0, 0, 0);
    var distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
    var side = options.side !== undefined ? options.side : THREE.FrontSide;
    var fog = options.fog !== undefined ? options.fog : false;
    var mirrorPlane = new THREE.Plane();
    var normal = new THREE.Vector3();
    var mirrorWorldPosition = new THREE.Vector3();
    var cameraWorldPosition = new THREE.Vector3();
    var rotationMatrix = new THREE.Matrix4();
    var lookAtPosition = new THREE.Vector3(0, 0, - 1);
    var clipPlane = new THREE.Vector4();
    var view = new THREE.Vector3();
    var target = new THREE.Vector3();
    var q = new THREE.Vector4();
    var textureMatrix = new THREE.Matrix4();
    var mirrorCamera = new THREE.PerspectiveCamera();
    var renderTarget = new THREE.WebGLRenderTarget(textureWidth, textureHeight);
    var mirrorShader = {
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['fog'],
            THREE.UniformsLib['lights'],
            {
                'normalSampler': { value: null },
                'mirrorSampler': { value: null },
                'alpha': { value: 1.0 },
                'time': { value: 0.0 },
                'size': { value: 1.0 },
                'distortionScale': { value: 20.0 },
                'textureMatrix': { value: new THREE.Matrix4() },
                'sunColor': { value: new THREE.Color(0x7F7F7F) },
                'sunDirection': { value: new THREE.Vector3(0.70707, 0.70707, 0) },
                'eye': { value: new THREE.Vector3() },
                'waterColor': { value: new THREE.Color(0x555555) }
            }
        ]),
        vertexShader: [
            'uniform mat4 textureMatrix;',
            'uniform float time;',
            'varying vec4 mirrorCoord;',
            'varying vec4 worldPosition;',
            '#include <common>',
            '#include <fog_pars_vertex>',
            '#include <shadowmap_pars_vertex>',
            '#include <logdepthbuf_pars_vertex>',
            'void main() {',
            '	mirrorCoord = modelMatrix * vec4( position, 1.0 );',
            '	worldPosition = mirrorCoord.xyzw;',
            '	mirrorCoord = textureMatrix * mirrorCoord;',
            '	vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );',
            '	gl_Position = projectionMatrix * mvPosition;',
            '#include <logdepthbuf_vertex>',
            '#include <fog_vertex>',
            '#include <shadowmap_vertex>',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform sampler2D mirrorSampler;',
            'uniform float alpha;',
            'uniform float time;',
            'uniform float size;',
            'uniform float distortionScale;',
            'uniform sampler2D normalSampler;',
            'uniform vec3 sunColor;',
            'uniform vec3 sunDirection;',
            'uniform vec3 eye;',
            'uniform vec3 waterColor;',
            'varying vec4 mirrorCoord;',
            'varying vec4 worldPosition;',
            'vec4 getNoise( vec2 uv ) {',
            '	vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);',
            '	vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );',
            '	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );',
            '	vec2 uv3 = uv / vec2( 1091.0, 1021.0 ) - vec2( time / 109.0, time / -113.0 );',
            '	vec4 noise = texture2D( normalSampler, uv0 ) +',
            '		texture2D( normalSampler, uv1 ) +',
            '		texture2D( normalSampler, uv2 ) +',
            '		texture2D( normalSampler, uv3 );',
            '	return noise * 0.5 - 1.0;',
            '}',
            'void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {',
            '	vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );',
            '	float direction = max( 0.0, dot( eyeDirection, reflection ) );',
            '	specularColor += pow( direction, shiny ) * sunColor * spec;',
            '	diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;',
            '}',
            '#include <common>',
            '#include <fog_pars_fragment>',
            '#include <logdepthbuf_pars_fragment>',
            'void main() {',
            '#include <logdepthbuf_fragment>',
            '	vec4 noise = getNoise( worldPosition.xz * size );',
            '	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
            '	vec3 diffuseLight = vec3(0.0);',
            '	vec3 specularLight = vec3(0.0);',
            '	vec3 worldToEye = eye-worldPosition.xyz;',
            '	vec3 eyeDirection = normalize( worldToEye );',
            '	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',
            '	float distance = length(worldToEye);',
            '	float distortion = max( 0.0, -distortionScale * distance );',
            '	vec4 mirror = texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w  + distortion);',
            '	vec3 color = waterColor * diffuseLight + specularLight;',
            '	gl_FragColor = vec4( color, alpha );',
            '#include <tonemapping_fragment>',
            '#include <encodings_fragment>',
            '#include <fog_fragment>',
            '}'
        ].join('\n')
    };
    var material = new THREE.ShaderMaterial({
        fragmentShader: mirrorShader.fragmentShader,
        vertexShader: mirrorShader.vertexShader,
        uniforms: THREE.UniformsUtils.clone(mirrorShader.uniforms),
        transparent: true,
        lights: true,
        side: side,
        fog: fog
    });
    material.uniforms['mirrorSampler'].value = renderTarget.texture;
    material.uniforms['textureMatrix'].value = textureMatrix;
    material.uniforms['alpha'].value = alpha;
    material.uniforms['time'].value = time;
    material.uniforms['normalSampler'].value = normalSampler;
    material.uniforms['sunColor'].value = sunColor;
    material.uniforms['waterColor'].value = waterColor;
    material.uniforms['sunDirection'].value = sunDirection;
    material.uniforms['distortionScale'].value = distortionScale;
    material.uniforms['eye'].value = eye;
    scope.material = material;
    scope.onBeforeRender = function (renderer, scene, camera) {
        mirrorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
        cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
        rotationMatrix.extractRotation(scope.matrixWorld);
        normal.set(0, 0, 1);
        normal.applyMatrix4(rotationMatrix);
        view.subVectors(mirrorWorldPosition, cameraWorldPosition);
        if (view.dot(normal) > 0) view.reflect(normal).negate();
        view.add(mirrorWorldPosition);
        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, - 1);
        lookAtPosition.applyMatrix4(rotationMatrix);
        lookAtPosition.add(cameraWorldPosition);
        target.subVectors(mirrorWorldPosition, lookAtPosition);
        target.reflect(normal).negate();
        target.add(mirrorWorldPosition);
        mirrorCamera.position.copy(view);
        mirrorCamera.up.set(0, 1, 0);
        mirrorCamera.up.applyMatrix4(rotationMatrix);
        mirrorCamera.up.reflect(normal);
        mirrorCamera.lookAt(target);
        mirrorCamera.far = camera.far;
        mirrorCamera.updateMatrixWorld();
        mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
        textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
        textureMatrix.multiply(mirrorCamera.projectionMatrix);
        textureMatrix.multiply(mirrorCamera.matrixWorldInverse);
        mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
        mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
        clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);
        var projectionMatrix = mirrorCamera.projectionMatrix;
        q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
        q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
        q.z = - 1.0;
        q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
        clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
        projectionMatrix.elements[2] = clipPlane.x;
        projectionMatrix.elements[6] = clipPlane.y;
        projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
        projectionMatrix.elements[14] = clipPlane.w;
        eye.setFromMatrixPosition(camera.matrixWorld);
        var currentRenderTarget = renderer.getRenderTarget();
        var currentXrEnabled = renderer.xr.enabled;
        var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
        scope.visible = false;
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(renderTarget);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, mirrorCamera);
        scope.visible = true;
        renderer.xr.enabled = currentXrEnabled;
        renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
        renderer.setRenderTarget(currentRenderTarget);
        var viewport = camera.viewport;
        if (viewport !== undefined) {
            renderer.state.viewport(viewport);
        }
    };
};
THREE.Water.prototype = Object.create(THREE.Mesh.prototype);
THREE.Water.prototype.constructor = THREE.Water;

// --- THREE.js Sky (Simplified) --- //
THREE.Sky = function () {
    var sky = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.ShaderMaterial({
            uniforms: {
                'luminance': { value: 1 },
                'turbidity': { value: 2 },
                'rayleigh': { value: 1 },
                'mieCoefficient': { value: 0.005 },
                'mieDirectionalG': { value: 0.8 },
                'sunPosition': { value: new THREE.Vector3() },
                'up': { value: new THREE.Vector3(0, 1, 0) }
            },
            vertexShader: [
                'uniform vec3 sunPosition;',
                'uniform float rayleigh;',
                'uniform float turbidity;',
                'uniform float mieCoefficient;',
                'varying vec3 vWorldPosition;',
                'varying vec3 vSunDirection;',
                'varying float vSunfade;',
                'varying vec3 vBetaR;',
                'varying vec3 vBetaM;',
                'varying float vSunE;',
                'const vec3 up = vec3( 0.0, 1.0, 0.0 );',
                'const float e = 2.71828182845904523536028747135266249775724709369995957;',
                'const float pi = 3.141592653589793238462643383279502884197169;',
                'const float n = 1.0003;',
                'const float N = 2.545E25;',
                'const float vp = 0.062;',
                'const float K = 15.0;',
                'const float v = 4.0;',
                'const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );',
                'const vec3 K_o = vec3( 0.686, 0.678, 0.666 );',
                'void main() {',
                '	vWorldPosition = ( modelMatrix * vec4( position, 1.0 ) ).xyz;',
                '	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                '	gl_Position.z = gl_Position.w;',
                '	vSunDirection = normalize( sunPosition );',
                '	vSunE = sunIntensity( dot( vSunDirection, up ) );',
                '	vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );',
                '	float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );',
                '	vBetaR = ( 8.0 * pow( pi, 3.0 ) * pow( pow( n, 2.0 ) - 1.0, 2.0 ) * ( 6.0 + 3.0 * vp ) ) / ( 3.0 * N * pow( lambda, vec3( 4.0 ) ) * ( 6.0 - 7.0 * vp ) ) * rayleighCoefficient;',
                '	float c = ( 0.2 * turbidity ) * 10E-18;',
                '	vBetaM = ( 0.434 * c * pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K_o ) * mieCoefficient;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vWorldPosition;',
                'varying vec3 vSunDirection;',
                'varying float vSunfade;',
                'varying vec3 vBetaR;',
                'varying vec3 vBetaM;',
                'varying float vSunE;',
                'uniform float luminance;',
                'uniform float mieDirectionalG;',
                'const float pi = 3.141592653589793238462643383279502884197169;',
                'const float cameraHeight = 900.0;',
                'float rayleighPhase( float cosTheta ) {',
                '	return ( 3.0 / ( 16.0 * pi ) ) * ( 1.0 + pow( cosTheta, 2.0 ) );',
                '}',
                'float hgPhase( float cosTheta, float g ) {',
                '	return ( 1.0 / ( 4.0 * pi ) ) * ( ( 1.0 - pow( g, 2.0 ) ) / pow( 1.0 - 2.0 * g * cosTheta + pow( g, 2.0 ), 1.5 ) );',
                '}',
                'void main() {',
                '	vec3 direction = normalize( vWorldPosition - cameraPosition );',
                '	float cosTheta = dot( direction, vSunDirection );',
                '	float r = rayleighPhase( cosTheta * 0.5 + 0.5 );',
                '	float m = hgPhase( cosTheta, mieDirectionalG );',
                '	vec3 Fex = exp( -( vBetaR * ( cameraHeight ) + vBetaM * ( cameraHeight ) ) );',
                '	vec3 Fs = ( vBetaR * r + vBetaM * m ) / ( vBetaR + vBetaM );',
                '	vec3 Lin = pow( vSunE * ( ( Fs ) * ( 1.0 - Fex ) ), vec3( 1.5 ) );',
                '	Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( Fs ) * ( 1.0 - Fex ) ), vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );',
                '	vec3 L0 = vec3( 0.25 ) * Fex;',
                '	vec3 color = Lin + L0;',
                '	color *= vSunfade;',
                '	gl_FragColor = vec4( color, 1.0 );',
                '#include <tonemapping_fragment>',
                '#include <encodings_fragment>',
                '}'
            ].join('\n'),
            side: THREE.BackSide,
            depthWrite: false
        })
    );
    sky.material.uniforms.sunIntensity = function(dot) { return 1.0; };
    return sky;
};

// --- THREE.js GLTFLoader (stub for dependency) --- //
THREE.GLTFLoader = function (manager) {
    this.manager = (manager !== undefined) ? manager : THREE.DefaultLoadingManager;
};
THREE.GLTFLoader.prototype = {
    constructor: THREE.GLTFLoader,
    load: function (url, onLoad, onProgress, onError) {
        var scope = this;
        var loader = new THREE.FileLoader(scope.manager);
        loader.setPath(scope.path);
        loader.setResponseType('arraybuffer');
        loader.load(url, function (data) {
            try {
                scope.parse(data, scope.path, onLoad, onError);
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
                scope.manager.itemError(url);
            }
        }, onProgress, onError);
    },
    setPath: function(value) { this.path = value; return this; },
    parse: function() { console.error("GLTFLoader.parse() not fully implemented in this stub."); }
};
