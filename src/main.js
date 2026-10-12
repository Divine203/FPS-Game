import { mat4, vec3 } from 'gl-matrix';
import { Scene } from './scene.js';
import { model } from './model.js';
import { LightMarker } from './light-marker.js';
import { applyViewBob, moveCamera, camera, setupWeaponControls } from './controls.js';
import { moveLights } from './light-controls.js';
import { lights, setCameraPosition } from './lighting.js';
import { ShadowMap } from './shadow.js';
import { WeaponSystem } from './weapon-system.js';
import { EnemySystem } from './enemy-system.js';
import { audioSystem } from './audio.js';

const scene = new Scene();
const enemySystem = new EnemySystem(scene);
const weaponSystem = new WeaponSystem(enemySystem);

let isLoading = true; // Start with loading screen shown

// Make globally accessible for interop
window.weaponSystem = weaponSystem;
window.enemySystem = enemySystem;
window.isLoading = isLoading;


// Initialize shadow mapping from the primary moonlight
const shadowMap = new ShadowMap();
const moonlight = lights[0];  // Primary moonlight
const sceneCenter = vec3.fromValues(0, 0, -200);
const sceneRadius = 800;
shadowMap.computeLightSpaceMatrix(moonlight.position, sceneCenter, sceneRadius);
scene.shadowMap = shadowMap;

scene.objects = [];

// Setup camera
const projectionMatrix = mat4.create();
const viewMatrix = mat4.create();

import { c } from './global.js';
mat4.perspective(projectionMatrix, Math.PI / 4, c.width / c.height, 0.1, 1700);

let lastTime = performance.now();
let nextWaveCooldown = 0;
let currentWave = 0;
let isGamePaused = true; // Start with menu shown
let isMenuOpen = true;


// FPS tracking
let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 0;

// Player health
const maxPlayerHealth = 100;
let playerHealth = maxPlayerHealth;
let isPlayerDead = false;

function handlePlayerDamaged(damage) {
    if (isPlayerDead) return; // Don't process damage if already dead
    
    playerHealth = Math.max(0, playerHealth - damage); // Ensure minimum of 0
    updatePlayerHealthUI();

    const vignette = document.getElementById('damage-vignette');
    if (vignette) {
        vignette.classList.add('active');
        setTimeout(() => vignette.classList.remove('active'), 220);
    }

    // Player death check
    if (playerHealth <= 0 && !isPlayerDead) {
        isPlayerDead = true;
        audioSystem.playFootSteps(false);
        audioSystem.playPlayerDeath(); // Play death sound only once
        showDeathMenu();
    }
}

function updatePlayerHealthUI() {
    const healthText = document.getElementById('player-health-text');
    const healthBar = document.getElementById('player-health-bar');
    const isLow = playerHealth <= maxPlayerHealth * 0.3;
    if (healthText) {
        healthText.textContent = `${Math.round(playerHealth)} / ${maxPlayerHealth}`;
        if (isLow) {
            healthText.classList.add('low-health');
        } else {
            healthText.classList.remove('low-health');
        }
    }
    if (healthBar) {
        const pct = Math.max(0, Math.min(100, (playerHealth / maxPlayerHealth) * 100));
        healthBar.style.width = `${pct}%`;
        if (pct <= 30) {
            healthBar.style.background = '#ff2222';
        } else {
            healthBar.style.background = '#ffffff';
        }
    }
}

function updateWaveUI() {
    const waveElement = document.getElementById('wave-count');
    if (waveElement) {
        waveElement.textContent = `Waves survived: ${currentWave}`;
    }
}

enemySystem.onPlayerAttacked = handlePlayerDamaged;

// Loading screen functions
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.remove('hidden');
    isLoading = true;
    window.isLoading = true;
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
    isLoading = false;
    window.isLoading = false;
}

function updateLoadingProgress(status, progress) {
    const statusElement = document.getElementById('loading-status');
    const barElement = document.getElementById('loading-bar');
    
    if (statusElement) {
        statusElement.textContent = status;
    }
    
    if (barElement) {
        barElement.style.width = `${progress}%`;
    }
}

// Menu functions
function showStartMenu() {
    const menu = document.getElementById('game-menu');
    const title = document.getElementById('menu-title');
    const tipMessage = document.getElementById('tip-message');
    const subtitle = document.getElementById('menu-subtitle');
    const statsContainer = document.getElementById('stats-container');
    
    menu.classList.remove('hidden');
    title.textContent = 'ZOMBIE SURVIVAL';
    subtitle.textContent = 'Press Enter to Start';
    statsContainer.classList.add('hidden');
    
    isGamePaused = true;
    isMenuOpen = true;
}

function showDeathMenu() {
    const menu = document.getElementById('game-menu');
    const title = document.getElementById('menu-title');
    const tipMessage = document.getElementById('tip-message');
    const subtitle = document.getElementById('menu-subtitle');
    const statsContainer = document.getElementById('stats-container');
    const menuKills = document.getElementById('menu-kills');
    const menuScore = document.getElementById('menu-score');
    const menuWave = document.getElementById('menu-wave');
    
    menu.classList.remove('hidden');
    title.textContent = 'YOU DIED';
    tipMessage.style.display = 'none';
    subtitle.textContent = 'Press Enter to Play Again';
    statsContainer.classList.remove('hidden');
    
    menuKills.textContent = enemySystem.killCount;
    menuScore.textContent = enemySystem.totalScore;
    menuWave.textContent = currentWave;
    
    isGamePaused = true;
    isMenuOpen = true;
}

function hideMenu() {
    const menu = document.getElementById('game-menu');
    menu.classList.add('hidden');
    isGamePaused = false;
    isMenuOpen = false;
}

async function beginGame() {
    hideMenu();
    playerHealth = maxPlayerHealth;
    isPlayerDead = false;
    updatePlayerHealthUI();
    
    // Reset camera position
    camera.position = vec3.fromValues(153, 1.3, -379);
    camera.yaw = 2.5;
    camera.pitch = 0;
    
    // Spawn initial zombies
    setTimeout(async () => {
        await enemySystem.spawnWave(4, [], camera.position, camera.yaw);
    }, 100000)
}

async function restartGame() {
    hideMenu();
    
    // Reset player state
    playerHealth = maxPlayerHealth;
    isPlayerDead = false;
    currentWave = 0;
    updatePlayerHealthUI();
    updateWaveUI();
    
    // Reset camera position
    camera.position = vec3.fromValues(153, 1.3, -379);
    camera.yaw = 2.5;
    camera.pitch = 0;
    
    // Reset enemy system
    enemySystem.reset();
    
    // Respawn zombies
    setTimeout(async () => {
        await enemySystem.spawnWave(4, [], camera.position, camera.yaw);
    }, 12000);

}

// Enter key handler for menu
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isMenuOpen && !isLoading) {
        if (isPlayerDead) {
            restartGame();
        } else {
            beginGame();
        }
    }
});

function updateFpsUI() {
    const fpsElement = document.getElementById('fps-counter');
    if (fpsElement) {
        fpsElement.textContent = `FPS: ${currentFps}`;
        // Color coding based on FPS
        if (currentFps >= 50) {
            fpsElement.style.color = '#00ff00';
        } else if (currentFps >= 30) {
            fpsElement.style.color = '#ffff00';
        } else {
            fpsElement.style.color = '#ff2222';
        }
    }
}

const animate = () => {
    const now = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // seconds capped to prevent spikes
    lastTime = now;

    // FPS calculation
    frameCount++;
    if (now - lastFpsUpdate >= 500) { // Update every 500ms
        currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = now;
        updateFpsUI();
    }

    // Don't update game logic if paused
    if (!isGamePaused) {
        moveCamera(scene, deltaTime);
        moveLights(lights, deltaTime);
        setCameraPosition(camera.position);

        const up = vec3.fromValues(0, 1, 0);
        const renderPos = applyViewBob(deltaTime);
        mat4.lookAt(viewMatrix, renderPos, vec3.add(vec3.create(), renderPos, camera.direction), up);

        // Update weapon system
        weaponSystem.update(deltaTime);
        weaponSystem.updateWeaponPosition(camera);

        // Update Enemy System (AI, path navigation, facing, attack animations, despawn)
        enemySystem.update(deltaTime, camera.position);

        // Auto-spawn incoming waves when all zombies are cleared
        if (enemySystem.getAliveCount() === 0) {
            nextWaveCooldown += deltaTime;
            if (nextWaveCooldown >= 15.0) { // 15 seconds breathing time
                nextWaveCooldown = 0;
                currentWave++;
                enemySystem.spawnWave(8, [], camera.position, camera.yaw);
                updateWaveUI();
            }
        } else {
            nextWaveCooldown = 0;
        }

        scene.render(viewMatrix, projectionMatrix);

        // Render muzzle flashes after scene (to appear on top of world but behind gun)
        weaponSystem.renderMuzzleFlashes(viewMatrix, projectionMatrix, camera.position);
    }

    requestAnimationFrame(animate);
};

let street1;

async function initializeGame() {
    // Show loading screen
    showLoadingScreen();
    updateLoadingProgress('Initializing...', 10);

    // 1. Load weapon system models and add to scene
    updateLoadingProgress('Loading weapons...', 25);
    await weaponSystem.loadWeapons();
    const weaponModels = weaponSystem.getWeaponsForScene();
    scene.objects.push(...weaponModels);

    // Setup weapon controls
    setupWeaponControls(weaponSystem);

    // 2. Load environment map (street)
    updateLoadingProgress('Loading environment...', 50);
    street1 = new model("./assets/model/street-v2.glb", 0, -31.5, 0, 0, 0, 0, 55);
    await street1.load();
    scene.objects.push(street1);

    // 3. Add light markers
    updateLoadingProgress('Setting up lighting...', 75);
    scene.objects.push(...lights.map(light => new LightMarker(light)));

    // 4. Preload enemy models (but don't spawn until menu)
    updateLoadingProgress('Loading enemy models...', 90);
    await enemySystem.preloadModels();

    // Initialize health UI
    updateLoadingProgress('Finalizing...', 100);
    updatePlayerHealthUI();

    // Hide loading screen and show start menu
    setTimeout(() => {
        hideLoadingScreen();
        showStartMenu();
    }, 500);

    animate();
}

initializeGame();



// public: https://threed-game-js.onrender.com/