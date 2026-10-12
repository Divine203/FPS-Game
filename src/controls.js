import { vec3 } from "gl-matrix";
import { c } from "./global.js";
import { audioSystem } from "./audio.js";

export const camera = {
    position: vec3.fromValues(153, 1.3, -379), // position: [x, y, z]
    direction: vec3.fromValues(-0.7, 0, 0.7),
    noYdirection: vec3.fromValues(0, 0, -1),
    pitch: 0,
    yaw: 2.5,
    viewBobTime: 0
};

export let isMoving = false;

const K = {
    W: false,
    A: false,
    S: false,
    D: false,
    Q: false,
    E: false,
    R: false, // Reload key
    // Arrow keys as alternate movement controls
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
};

let movVel = 138.95;
let rotVel = 2.031;

// Mouse look sensitivity
let mouseSensitivity = 0.002;
let isPointerLocked = false;

document.addEventListener('keydown', (e) => {
    // Prevent controls during loading
    if (window.isLoading) return;
    
    switch (e.key) {
        case 'w':
        case 'W':
            if (!K.S && !K.ArrowDown) K.W = true;
            break;
        case 'ArrowUp':
            if (!K.S && !K.ArrowDown) K.ArrowUp = true;
            break;
        case 'a':
        case 'A':
            K.A = true;
            break;
        case 'ArrowLeft':
            K.ArrowLeft = true;
            break;
        case 's':
        case 'S':
            if (!K.W && !K.ArrowUp) K.S = true;
            break;
        case 'ArrowDown':
            if (!K.W && !K.ArrowUp) K.ArrowDown = true;
            break;
        case 'd':
        case 'D':
            K.D = true;
            break;
        case 'ArrowRight':
            K.ArrowRight = true;
            break;
        case 'q':
        case 'Q':
            if (!K.E) K.Q = true;
            break;
        case 'e':
        case 'E':
            if (!K.Q) K.E = true;
            break;
        case 'r':
            // Don't set R key for movement, it's handled by weapon system
            break;
    }
});

document.addEventListener('keyup', (e) => {
    // Prevent controls during loading
    if (window.isLoading) return;
    
    switch (e.key) {
        case 'w':
        case 'W':
            K.W = false;
            break;
        case 'ArrowUp':
            K.ArrowUp = false;
            break;
        case 'a':
        case 'A':
            K.A = false;
            break;
        case 'ArrowLeft':
            K.ArrowLeft = false;
            break;
        case 's':
        case 'S':
            K.S = false;
            break;
        case 'ArrowDown':
            K.ArrowDown = false;
            break;
        case 'd':
        case 'D':
            K.D = false;
            break;
        case 'ArrowRight':
            K.ArrowRight = false;
            break;
        case 'q':
        case 'Q':
            K.Q = false;
            break;
        case 'e':
        case 'E':
            K.E = false;
            break;
    }
});

// Mouse movement for camera look
document.addEventListener('mousemove', (e) => {
    if (!isPointerLocked || window.isLoading) return;

    // Update yaw (horizontal rotation)
    camera.yaw += e.movementX * mouseSensitivity;

    // Update pitch (vertical rotation) with clamping
    camera.pitch -= e.movementY * mouseSensitivity;
    // Clamp pitch to prevent looking straight up/down
    camera.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.pitch));
});

// Pointer lock change handler
document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === c;
});

// Click to request pointer lock
c.addEventListener('click', () => {
    if (!isPointerLocked && !window.isLoading) {
        c.requestPointerLock();
    }
});

// Escape to exit pointer lock (handled automatically by browser)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPointerLocked) {
        document.exitPointerLock();
    }
});


export function applyViewBob(deltaTime) {
    const bobAmount = 0.05;
    const swayAmount = 0.03;

    if (isMoving) {
        camera.viewBobTime += deltaTime * 8; // bob speed
    } else {
        camera.viewBobTime = 0; // reset if standing still
    }

    const verticalBob = Math.sin(camera.viewBobTime) * bobAmount;
    const sidewaysSway = Math.cos(camera.viewBobTime * 0.5) * swayAmount;

    // clone the real position, add bob offsets
    const renderPos = vec3.clone(camera.position);
    renderPos[1] += verticalBob;  // up/down
    renderPos[0] += sidewaysSway; // left/right

    return renderPos;
}


export const moveCamera = (scene, deltaTime) => {
    camera.direction[0] = Math.cos(camera.pitch) * Math.cos(camera.yaw);
    camera.direction[1] = Math.sin(camera.pitch);
    camera.direction[2] = Math.cos(camera.pitch) * Math.sin(camera.yaw);

    camera.noYdirection[0] = Math.cos(0) * Math.cos(camera.yaw);
    camera.noYdirection[1] = Math.sin(0);
    camera.noYdirection[2] = Math.cos(0) * Math.sin(camera.yaw);

    camera.right = vec3.fromValues(-1 * Math.sin(camera.yaw), 0, Math.cos(camera.yaw));

    let dx = 0;
    let dz = 0;

    // Forward/Backward movement
    if (K.W || K.ArrowUp) {
        dx += camera.noYdirection[0] * movVel * deltaTime;
        dz += camera.noYdirection[2] * movVel * deltaTime;

        // audioSystem.playFootSteps(true);
    }
    if (K.S || K.ArrowDown) {
        dx -= camera.noYdirection[0] * movVel * deltaTime;
        dz -= camera.noYdirection[2] * movVel * deltaTime;

        // audioSystem.playFootSteps(true);
    }

    // Rotation Left/Right (A/D and Arrow keys)
    if (K.A || K.ArrowLeft) {
        camera.yaw -= rotVel * deltaTime;
    }
    if (K.D || K.ArrowRight) {
        camera.yaw += rotVel * deltaTime;
    }

    if (dx !== 0 || dz !== 0) {
        if (scene && typeof scene.checkPlayerCollision === 'function') {
            const currX = camera.position[0];
            const currZ = camera.position[2];
            const targetX = currX + dx;
            const targetZ = currZ + dz;

            // Attempt full movement first
            if (!scene.checkPlayerCollision(targetX, camera.position[1], targetZ)) {
                camera.position[0] = targetX;
                camera.position[2] = targetZ;
            }
            // If blocked, attempt sliding along X
            else if (!scene.checkPlayerCollision(targetX, camera.position[1], currZ)) {
                camera.position[0] = targetX;
            }
            // If blocked along X, attempt sliding along Z
            else if (!scene.checkPlayerCollision(currX, camera.position[1], targetZ)) {
                camera.position[2] = targetZ;
            }
            // If both blocked, player stops at the obstacle boundary
        } else {
            camera.position[0] += dx;
            camera.position[2] += dz;
        }
    }

    // Cap camera x position to prevent drifting away from map
    camera.position[0] = Math.min(camera.position[0], 250);

    isMoving = (K.W || K.S || K.ArrowUp || K.ArrowDown);

    if (isMoving) {
        // console.log([...camera.position])
        audioSystem.playFootSteps(true);
    } else {
        audioSystem.playFootSteps(false);
    }
}

export function setupWeaponControls(weaponSystem) {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (window.isLoading) return;
        
        switch (e.key.toLowerCase()) {
            case 'r':
                weaponSystem.reload();
                break;
            case '1':
                weaponSystem.switchToWeapon(0);
                break;
            case '2':
                weaponSystem.switchToWeapon(1);
                break;
            case '3':
                weaponSystem.switchToWeapon(2);
                break;

            case 'x':
                weaponSystem.shoot(camera);
                break;

        }
    });

    // Mouse controls
    c.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !window.isLoading) { // Left click
            weaponSystem.shoot(camera);
        }
    });
}
