// Water Cycle Simulation with Three.js
class WaterCycleSimulation {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.terrain = null;
        this.ocean = null;
        this.sun = null;
        this.clouds = [];
        this.particles = {
            evaporation: [],
            transpiration: [],
            precipitation: [],
            runoff: []
        };
        this.trees = [];
        this.iceCaps = [];
        
        // Climate parameters
        this.climateParams = {
            temperature: 15,
            temperatureChange: 0,
            precipitationIntensity: 1.0,
            evaporationRate: 1.0,
            iceMelting: 0,
            seaLevel: 0
        };
        
        // Animation control
        this.isPlaying = true;
        this.animationSpeed = 1.0;
        
        this.init();
        this.setupControls();
        this.animate();
    }
    
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 30, 50);
        this.camera.lookAt(0, 0, 0);
        
        // Create renderer
        const canvas = document.getElementById('simulation-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setClearColor(0x87CEEB, 1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Add lighting
        this.setupLighting();
        
        // Create terrain and environment
        this.createTerrain();
        this.createOcean();
        this.createSun();
        this.createTrees();
        this.createIceCaps();
        this.createClouds();
        
        // Initialize particle systems
        this.initParticleSystems();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xFFD700, 1);
        this.sunLight.position.set(50, 50, 0);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.scene.add(this.sunLight);
        
        // Point light for atmosphere
        const atmosphereLight = new THREE.PointLight(0x87CEEB, 0.5, 100);
        atmosphereLight.position.set(0, 30, 0);
        this.scene.add(atmosphereLight);
    }
    
    createTerrain() {
        // Create terrain geometry
        const terrainGeometry = new THREE.PlaneGeometry(100, 100, 50, 50);
        const vertices = terrainGeometry.attributes.position.array;
        
        // Generate height map for mountains and valleys
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            const distance = Math.sqrt(x * x + z * z);
            
            // Create mountain ranges
            let height = 0;
            height += Math.sin(x * 0.1) * Math.cos(z * 0.1) * 8;
            height += Math.sin(x * 0.05) * Math.cos(z * 0.05) * 15;
            height += Math.random() * 2;
            
            // Create valleys near center for rivers
            if (Math.abs(x) < 20 && Math.abs(z) < 20) {
                height *= 0.3;
            }
            
            vertices[i + 1] = Math.max(height, -2);
        }
        
        terrainGeometry.attributes.position.needsUpdate = true;
        terrainGeometry.computeVertexNormals();
        
        // Create terrain material with texture
        const terrainMaterial = new THREE.MeshLambertMaterial({
            color: 0x8FBC8F,
            transparent: true,
            opacity: 0.9
        });
        
        this.terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);
        
        // Add underground water representation
        this.createGroundwater();
    }
    
    createGroundwater() {
        const groundwaterGeometry = new THREE.PlaneGeometry(80, 80);
        const groundwaterMaterial = new THREE.MeshBasicMaterial({
            color: 0x4169E1,
            transparent: true,
            opacity: 0.3
        });
        
        const groundwater = new THREE.Mesh(groundwaterGeometry, groundwaterMaterial);
        groundwater.rotation.x = -Math.PI / 2;
        groundwater.position.y = -5;
        this.scene.add(groundwater);
    }
    
    createOcean() {
        const oceanGeometry = new THREE.PlaneGeometry(60, 60, 30, 30);
        const oceanMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                colorDeep: { value: new THREE.Color(0x006994) },
                colorShallow: { value: new THREE.Color(0x87CEEB) },
                transparency: { value: 0.8 }
            },
            vertexShader: `
                uniform float time;
                varying vec2 vUv;
                varying float vElevation;
                
                void main() {
                    vUv = uv;
                    
                    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
                    float elevation = sin(modelPosition.x * 0.1 + time) * 0.5;
                    elevation += sin(modelPosition.z * 0.1 + time * 0.7) * 0.3;
                    modelPosition.y += elevation;
                    vElevation = elevation;
                    
                    vec4 viewPosition = viewMatrix * modelPosition;
                    vec4 projectedPosition = projectionMatrix * viewPosition;
                    
                    gl_Position = projectedPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 colorDeep;
                uniform vec3 colorShallow;
                uniform float transparency;
                varying vec2 vUv;
                varying float vElevation;
                
                void main() {
                    float mixStrength = (vElevation + 1.0) * 0.5;
                    vec3 color = mix(colorDeep, colorShallow, mixStrength);
                    gl_FragColor = vec4(color, transparency);
                }
            `,
            transparent: true
        });
        
        this.ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.ocean.rotation.x = -Math.PI / 2;
        this.ocean.position.y = 0.1;
        this.scene.add(this.ocean);
    }
    
    createSun() {
        const sunGeometry = new THREE.SphereGeometry(3, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            emissive: 0xFFD700,
            emissiveIntensity: 0.5
        });
        
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sun.position.set(40, 40, -20);
        this.scene.add(this.sun);
        
        // Add sun glow effect
        const glowGeometry = new THREE.SphereGeometry(4, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            transparent: true,
            opacity: 0.3
        });
        
        const sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        sunGlow.position.copy(this.sun.position);
        this.scene.add(sunGlow);
    }
    
    createTrees() {
        for (let i = 0; i < 20; i++) {
            const tree = this.createSingleTree();
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            
            // Get terrain height at this position
            const y = this.getTerrainHeight(x, z);
            
            if (y > 2) { // Only place trees on higher ground
                tree.position.set(x, y, z);
                this.trees.push(tree);
                this.scene.add(tree);
            }
        }
    }
    
    createSingleTree() {
        const treeGroup = new THREE.Group();
        
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        // Leaves
        const leavesGeometry = new THREE.SphereGeometry(2.5, 8, 8);
        const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 5;
        leaves.castShadow = true;
        treeGroup.add(leaves);
        
        return treeGroup;
    }
    
    createIceCaps() {
        // Create ice caps on mountain peaks
        for (let i = 0; i < 10; i++) {
            const x = (Math.random() - 0.5) * 80;
            const z = (Math.random() - 0.5) * 80;
            const y = this.getTerrainHeight(x, z);
            
            if (y > 15) { // Only on high peaks
                const iceGeometry = new THREE.SphereGeometry(2 + Math.random() * 2, 8, 8);
                const iceMaterial = new THREE.MeshLambertMaterial({
                    color: 0xF0F8FF,
                    transparent: true,
                    opacity: 0.9
                });
                
                const ice = new THREE.Mesh(iceGeometry, iceMaterial);
                ice.position.set(x, y + 1, z);
                ice.scale.y = 0.5;
                this.iceCaps.push(ice);
                this.scene.add(ice);
            }
        }
    }
    
    createClouds() {
        for (let i = 0; i < 8; i++) {
            const cloud = this.createSingleCloud();
            cloud.position.set(
                (Math.random() - 0.5) * 100,
                20 + Math.random() * 10,
                (Math.random() - 0.5) * 100
            );
            this.clouds.push(cloud);
            this.scene.add(cloud);
        }
    }
    
    createSingleCloud() {
        const cloudGroup = new THREE.Group();
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.8
        });
        
        // Create multiple spheres for cloud shape
        for (let i = 0; i < 5; i++) {
            const cloudGeometry = new THREE.SphereGeometry(2 + Math.random() * 2, 8, 8);
            const cloudPart = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloudPart.position.set(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 8
            );
            cloudGroup.add(cloudPart);
        }
        
        return cloudGroup;
    }
    
    initParticleSystems() {
        // Evaporation particles
        this.createEvaporationSystem();
        
        // Transpiration particles
        this.createTranspirationSystem();
        
        // Precipitation particles
        this.createPrecipitationSystem();
        
        // Runoff particles
        this.createRunoffSystem();
    }
    
    createEvaporationSystem() {
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const lifetimes = new Float32Array(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 50; // x
            positions[i3 + 1] = 0.5; // y
            positions[i3 + 2] = (Math.random() - 0.5) * 50; // z
            
            velocities[i3] = (Math.random() - 0.5) * 0.02;
            velocities[i3 + 1] = 0.05 + Math.random() * 0.03;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
            
            lifetimes[i] = Math.random() * 100;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0x87CEEB,
            size: 0.5,
            transparent: true,
            opacity: 0.6
        });
        
        const evaporationParticles = new THREE.Points(geometry, material);
        evaporationParticles.userData = { velocities, lifetimes, maxLifetime: 100 };
        this.particles.evaporation.push(evaporationParticles);
        this.scene.add(evaporationParticles);
    }
    
    createTranspirationSystem() {
        this.trees.forEach(tree => {
            const particleCount = 20;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const velocities = new Float32Array(particleCount * 3);
            const lifetimes = new Float32Array(particleCount);
            
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                positions[i3] = tree.position.x + (Math.random() - 0.5) * 4;
                positions[i3 + 1] = tree.position.y + 4;
                positions[i3 + 2] = tree.position.z + (Math.random() - 0.5) * 4;
                
                velocities[i3] = (Math.random() - 0.5) * 0.01;
                velocities[i3 + 1] = 0.03 + Math.random() * 0.02;
                velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
                
                lifetimes[i] = Math.random() * 80;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.PointsMaterial({
                color: 0x90EE90,
                size: 0.3,
                transparent: true,
                opacity: 0.4
            });
            
            const transpirationParticles = new THREE.Points(geometry, material);
            transpirationParticles.userData = { velocities, lifetimes, maxLifetime: 80 };
            this.particles.transpiration.push(transpirationParticles);
            this.scene.add(transpirationParticles);
        });
    }
    
    createPrecipitationSystem() {
        this.clouds.forEach(cloud => {
            const particleCount = 50;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const velocities = new Float32Array(particleCount * 3);
            const lifetimes = new Float32Array(particleCount);
            
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                positions[i3] = cloud.position.x + (Math.random() - 0.5) * 10;
                positions[i3 + 1] = cloud.position.y;
                positions[i3 + 2] = cloud.position.z + (Math.random() - 0.5) * 10;
                
                velocities[i3] = (Math.random() - 0.5) * 0.01;
                velocities[i3 + 1] = -0.3 - Math.random() * 0.2;
                velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
                
                lifetimes[i] = Math.random() * 60;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.PointsMaterial({
                color: 0x4169E1,
                size: 0.4,
                transparent: true,
                opacity: 0.7
            });
            
            const precipitationParticles = new THREE.Points(geometry, material);
            precipitationParticles.userData = { velocities, lifetimes, maxLifetime: 60, cloud };
            this.particles.precipitation.push(precipitationParticles);
            this.scene.add(precipitationParticles);
        });
    }
    
    createRunoffSystem() {
        const particleCount = 80;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const lifetimes = new Float32Array(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            const y = this.getTerrainHeight(x, z);
            
            positions[i3] = x;
            positions[i3 + 1] = y + 0.5;
            positions[i3 + 2] = z;
            
            // Flow towards center (ocean)
            const flowDirection = new THREE.Vector3(-x, 0, -z).normalize();
            velocities[i3] = flowDirection.x * 0.1;
            velocities[i3 + 1] = -0.02;
            velocities[i3 + 2] = flowDirection.z * 0.1;
            
            lifetimes[i] = Math.random() * 120;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0x4682B4,
            size: 0.3,
            transparent: true,
            opacity: 0.5
        });
        
        const runoffParticles = new THREE.Points(geometry, material);
        runoffParticles.userData = { velocities, lifetimes, maxLifetime: 120 };
        this.particles.runoff.push(runoffParticles);
        this.scene.add(runoffParticles);
    }
    
    setupControls() {
        // Temperature slider
        const tempSlider = document.getElementById('temperature-slider');
        const tempValue = document.getElementById('temp-change-value');
        tempSlider.addEventListener('input', (e) => {
            this.climateParams.temperatureChange = parseFloat(e.target.value);
            this.climateParams.temperature = 15 + this.climateParams.temperatureChange;
            tempValue.textContent = `${this.climateParams.temperatureChange >= 0 ? '+' : ''}${this.climateParams.temperatureChange.toFixed(1)}°C`;
            this.updateTemperatureDisplay();
            this.updateClimateEffects();
        });
        
        // Precipitation slider
        const precipSlider = document.getElementById('precipitation-slider');
        const precipValue = document.getElementById('precip-value');
        precipSlider.addEventListener('input', (e) => {
            this.climateParams.precipitationIntensity = parseFloat(e.target.value);
            const intensity = this.climateParams.precipitationIntensity;
            precipValue.textContent = intensity < 0.8 ? 'Low' : intensity > 1.2 ? 'High' : 'Normal';
            this.updateProcessIndicator('precipitation', intensity > 1.0);
        });
        
        // Evaporation slider
        const evapSlider = document.getElementById('evaporation-slider');
        const evapValue = document.getElementById('evap-value');
        evapSlider.addEventListener('input', (e) => {
            this.climateParams.evaporationRate = parseFloat(e.target.value);
            const rate = this.climateParams.evaporationRate;
            evapValue.textContent = rate < 0.8 ? 'Low' : rate > 1.2 ? 'High' : 'Normal';
            this.updateProcessIndicator('evaporation', rate > 1.0);
        });
        
        // Ice melting slider
        const iceSlider = document.getElementById('ice-melting-slider');
        const iceValue = document.getElementById('ice-value');
        iceSlider.addEventListener('input', (e) => {
            this.climateParams.iceMelting = parseFloat(e.target.value);
            const melting = this.climateParams.iceMelting;
            iceValue.textContent = melting === 0 ? 'None' : melting < 1 ? 'Slow' : 'Rapid';
            this.updateIceCapSize();
        });
        
        // Control buttons
        document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetSimulation());
        document.getElementById('scenario-btn').addEventListener('click', () => this.loadClimateScenario());
        
        // Camera controls (simple mouse interaction)
        this.setupCameraControls();
    }
    
    setupCameraControls() {
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (event) => {
            isMouseDown = true;
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        
        canvas.addEventListener('mouseup', () => {
            isMouseDown = false;
        });
        
        canvas.addEventListener('mousemove', (event) => {
            if (!isMouseDown) return;
            
            const deltaX = event.clientX - mouseX;
            const deltaY = event.clientY - mouseY;
            
            // Rotate camera around center
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(this.camera.position);
            spherical.theta -= deltaX * 0.01;
            spherical.phi += deltaY * 0.01;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            
            this.camera.position.setFromSpherical(spherical);
            this.camera.lookAt(0, 0, 0);
            
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        
        // Zoom with mouse wheel
        canvas.addEventListener('wheel', (event) => {
            const factor = event.deltaY > 0 ? 1.1 : 0.9;
            this.camera.position.multiplyScalar(factor);
            
            // Limit zoom
            const distance = this.camera.position.length();
            if (distance < 20) this.camera.position.normalize().multiplyScalar(20);
            if (distance > 200) this.camera.position.normalize().multiplyScalar(200);
        });
    }
    
    updateTemperatureDisplay() {
        document.getElementById('temp-value').textContent = `${this.climateParams.temperature.toFixed(1)}°C`;
        
        // Update sun appearance based on temperature
        if (this.sun) {
            const intensity = 0.5 + (this.climateParams.temperatureChange / 10);
            this.sun.material.emissiveIntensity = Math.max(0.3, Math.min(1.0, intensity));
        }
    }
    
    updateProcessIndicator(process, isActive) {
        const indicator = document.getElementById(`${process}-indicator`);
        if (indicator) {
            indicator.classList.toggle('active', isActive);
        }
    }
    
    updateClimateEffects() {
        // Update condition info
        const tempChange = this.climateParams.temperatureChange;
        document.getElementById('current-temp').textContent = 
            tempChange === 0 ? 'Normal temperature' :
            tempChange > 0 ? `${tempChange.toFixed(1)}°C warmer than average` :
            `${Math.abs(tempChange).toFixed(1)}°C cooler than average`;
        
        // Update other climate indicators based on temperature
        if (tempChange > 2) {
            document.getElementById('current-precip').textContent = 'More extreme weather patterns';
            document.getElementById('current-ice').textContent = 'Accelerated ice cap melting';
            document.getElementById('current-sea').textContent = 'Rising sea levels';
        } else if (tempChange > 0) {
            document.getElementById('current-precip').textContent = 'Slightly altered precipitation';
            document.getElementById('current-ice').textContent = 'Gradual ice cap melting';
            document.getElementById('current-sea').textContent = 'Slowly rising sea levels';
        } else {
            document.getElementById('current-precip').textContent = 'Normal precipitation';
            document.getElementById('current-ice').textContent = 'Stable ice caps';
            document.getElementById('current-sea').textContent = 'Stable sea level';
        }
    }
    
    updateIceCapSize() {
        this.iceCaps.forEach(ice => {
            const baseScale = 1 - (this.climateParams.iceMelting * 0.3);
            ice.scale.setScalar(Math.max(0.2, baseScale));
            ice.material.opacity = Math.max(0.3, 0.9 - this.climateParams.iceMelting * 0.3);
        });
    }
    
    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('play-pause-btn');
        btn.textContent = this.isPlaying ? '⏸️ Pause' : '▶️ Play';
    }
    
    resetSimulation() {
        // Reset all climate parameters
        this.climateParams = {
            temperature: 15,
            temperatureChange: 0,
            precipitationIntensity: 1.0,
            evaporationRate: 1.0,
            iceMelting: 0,
            seaLevel: 0
        };
        
        // Reset UI controls
        document.getElementById('temperature-slider').value = 0;
        document.getElementById('precipitation-slider').value = 1.0;
        document.getElementById('evaporation-slider').value = 1.0;
        document.getElementById('ice-melting-slider').value = 0;
        
        // Update displays
        this.updateTemperatureDisplay();
        this.updateClimateEffects();
        this.updateIceCapSize();
        
        // Reset process indicators
        document.querySelectorAll('.process-indicator').forEach(indicator => {
            indicator.classList.remove('active');
        });
    }
    
    loadClimateScenario() {
        // Load a dramatic climate change scenario
        this.climateParams.temperatureChange = 3.5;
        this.climateParams.temperature = 18.5;
        this.climateParams.precipitationIntensity = 1.5;
        this.climateParams.evaporationRate = 1.7;
        this.climateParams.iceMelting = 1.5;
        
        // Update UI controls
        document.getElementById('temperature-slider').value = 3.5;
        document.getElementById('precipitation-slider').value = 1.5;
        document.getElementById('evaporation-slider').value = 1.7;
        document.getElementById('ice-melting-slider').value = 1.5;
        
        // Update displays
        this.updateTemperatureDisplay();
        this.updateClimateEffects();
        this.updateIceCapSize();
        
        // Activate process indicators
        this.updateProcessIndicator('evaporation', true);
        this.updateProcessIndicator('precipitation', true);
    }
    
    getTerrainHeight(x, z) {
        // Simple terrain height calculation (matches terrain generation)
        let height = 0;
        height += Math.sin(x * 0.1) * Math.cos(z * 0.1) * 8;
        height += Math.sin(x * 0.05) * Math.cos(z * 0.05) * 15;
        
        if (Math.abs(x) < 20 && Math.abs(z) < 20) {
            height *= 0.3;
        }
        
        return Math.max(height, -2);
    }
    
    updateParticles() {
        // Update evaporation particles
        this.particles.evaporation.forEach(system => {
            const positions = system.geometry.attributes.position.array;
            const { velocities, lifetimes, maxLifetime } = system.userData;
            
            for (let i = 0; i < positions.length; i += 3) {
                const i1 = i / 3;
                
                // Update position
                positions[i] += velocities[i] * this.climateParams.evaporationRate;
                positions[i + 1] += velocities[i + 1] * this.climateParams.evaporationRate;
                positions[i + 2] += velocities[i + 2] * this.climateParams.evaporationRate;
                
                // Update lifetime
                lifetimes[i1] += this.animationSpeed;
                
                // Reset particle if lifetime exceeded
                if (lifetimes[i1] > maxLifetime || positions[i + 1] > 25) {
                    positions[i] = (Math.random() - 0.5) * 50;
                    positions[i + 1] = 0.5;
                    positions[i + 2] = (Math.random() - 0.5) * 50;
                    lifetimes[i1] = 0;
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
        });
        
        // Update transpiration particles
        this.particles.transpiration.forEach(system => {
            const positions = system.geometry.attributes.position.array;
            const { velocities, lifetimes, maxLifetime } = system.userData;
            
            for (let i = 0; i < positions.length; i += 3) {
                const i1 = i / 3;
                
                positions[i] += velocities[i];
                positions[i + 1] += velocities[i + 1];
                positions[i + 2] += velocities[i + 2];
                
                lifetimes[i1] += this.animationSpeed;
                
                if (lifetimes[i1] > maxLifetime || positions[i + 1] > 20) {
                    // Reset to tree position
                    const treeIndex = Math.floor(Math.random() * this.trees.length);
                    if (this.trees[treeIndex]) {
                        positions[i] = this.trees[treeIndex].position.x + (Math.random() - 0.5) * 4;
                        positions[i + 1] = this.trees[treeIndex].position.y + 4;
                        positions[i + 2] = this.trees[treeIndex].position.z + (Math.random() - 0.5) * 4;
                        lifetimes[i1] = 0;
                    }
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
        });
        
        // Update precipitation particles
        this.particles.precipitation.forEach(system => {
            const positions = system.geometry.attributes.position.array;
            const { velocities, lifetimes, maxLifetime, cloud } = system.userData;
            
            for (let i = 0; i < positions.length; i += 3) {
                const i1 = i / 3;
                
                positions[i] += velocities[i];
                positions[i + 1] += velocities[i + 1] * this.climateParams.precipitationIntensity;
                positions[i + 2] += velocities[i + 2];
                
                lifetimes[i1] += this.animationSpeed;
                
                // Reset if hit ground or lifetime exceeded
                const terrainHeight = this.getTerrainHeight(positions[i], positions[i + 2]);
                if (lifetimes[i1] > maxLifetime || positions[i + 1] < terrainHeight + 1) {
                    positions[i] = cloud.position.x + (Math.random() - 0.5) * 10;
                    positions[i + 1] = cloud.position.y;
                    positions[i + 2] = cloud.position.z + (Math.random() - 0.5) * 10;
                    lifetimes[i1] = 0;
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
        });
        
        // Update runoff particles
        this.particles.runoff.forEach(system => {
            const positions = system.geometry.attributes.position.array;
            const { velocities, lifetimes, maxLifetime } = system.userData;
            
            for (let i = 0; i < positions.length; i += 3) {
                const i1 = i / 3;
                
                positions[i] += velocities[i];
                positions[i + 1] += velocities[i + 1];
                positions[i + 2] += velocities[i + 2];
                
                lifetimes[i1] += this.animationSpeed;
                
                // Reset if reached ocean or lifetime exceeded
                const distance = Math.sqrt(positions[i] * positions[i] + positions[i + 2] * positions[i + 2]);
                if (lifetimes[i1] > maxLifetime || distance < 5 || positions[i + 1] < 0) {
                    const x = (Math.random() - 0.5) * 60;
                    const z = (Math.random() - 0.5) * 60;
                    const y = this.getTerrainHeight(x, z);
                    
                    positions[i] = x;
                    positions[i + 1] = y + 0.5;
                    positions[i + 2] = z;
                    lifetimes[i1] = 0;
                    
                    // Update flow direction
                    const flowDirection = new THREE.Vector3(-x, 0, -z).normalize();
                    velocities[i] = flowDirection.x * 0.1;
                    velocities[i + 2] = flowDirection.z * 0.1;
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (!this.isPlaying) return;
        
        // Update ocean waves
        if (this.ocean && this.ocean.material.uniforms) {
            this.ocean.material.uniforms.time.value += 0.01;
        }
        
        // Animate clouds
        this.clouds.forEach((cloud, index) => {
            cloud.position.x += Math.sin(Date.now() * 0.0005 + index) * 0.01;
            cloud.rotation.y += 0.001;
        });
        
        // Animate sun
        if (this.sun) {
            const time = Date.now() * 0.0003;
            this.sun.position.x = Math.cos(time) * 40;
            this.sun.position.z = Math.sin(time) * 20 - 20;
            this.sunLight.position.copy(this.sun.position);
        }
        
        // Update particles
        this.updateParticles();
        
        // Update process indicators based on activity
        this.updateProcessIndicator('evaporation', this.climateParams.evaporationRate > 1.0);
        this.updateProcessIndicator('transpiration', true);
        this.updateProcessIndicator('condensation', true);
        this.updateProcessIndicator('precipitation', this.climateParams.precipitationIntensity > 1.0);
        this.updateProcessIndicator('runoff', true);
        this.updateProcessIndicator('infiltration', true);
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}

// Initialize the simulation when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WaterCycleSimulation();
});