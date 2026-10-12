import { model } from './model.js';
import { vec3, mat4 } from 'gl-matrix';
import { audioSystem } from './audio.js';
import { gl } from './global.js';

class MuzzleFlash {
    constructor(texturePath, positionOffset, scale) {
        this.texturePath = texturePath;
        this.positionOffset = vec3.fromValues(...positionOffset);
        this.scale = scale;
        this.position = vec3.create();
        this.rotation = vec3.create();
        this.isVisible = false;
        this.opacity = 0;
        this.texture = null;
        this.program = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.modelMatrix = mat4.create();
    }

    async load() {
        // Load texture
        const response = await fetch(this.texturePath);
        const blob = await response.blob();
        const image = await createImageBitmap(blob);
        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Create simple quad geometry
        const vertices = new Float32Array([
            // positions        // texture coords
            -0.5, -0.5, 0.0,    0.0, 1.0,
             0.5, -0.5, 0.0,    1.0, 1.0,
             0.5,  0.5, 0.0,    1.0, 0.0,
            -0.5,  0.5, 0.0,    0.0, 0.0,
        ]);

        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        // Create shader program for muzzle flash
        const vertexShaderSource = `
            precision highp float;
            
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uModelMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `;

        const fragmentShaderSource = `
            precision highp float;
            
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uOpacity;
            
            void main() {
                vec4 texColor = texture2D(uTexture, vTexCoord);
                if (texColor.a < 0.1) discard;
                gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
            }
        `;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Muzzle flash shader program failed to link:', gl.getProgramInfoLog(this.program));
        }
    }

    compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    updatePosition(weaponPosition, weaponRotation, cameraDirection) {
        // Calculate muzzle flash position based on weapon position and offset
        vec3.copy(this.position, weaponPosition);
        
        // Apply offset in world space (relative to weapon direction)
        const forward = vec3.create();
        vec3.normalize(forward, cameraDirection);
        
        const right = vec3.create();
        vec3.cross(right, forward, vec3.fromValues(0, 1, 0));
        vec3.normalize(right, right);
        
        const up = vec3.create();
        vec3.cross(up, right, forward);
        
        // Apply offset
        vec3.scaleAndAdd(this.position, this.position, right, this.positionOffset[0]);
        vec3.scaleAndAdd(this.position, this.position, up, this.positionOffset[1]);
        vec3.scaleAndAdd(this.position, this.position, forward, this.positionOffset[2]);

        // Copy weapon rotation to muzzle flash so it rotates with the gun
        vec3.copy(this.rotation, weaponRotation);
    }

    render(viewMatrix, projectionMatrix, cameraPosition) {
        if (!this.isVisible || this.opacity <= 0) return;

        gl.useProgram(this.program);

        // Set up model matrix - use weapon's rotation
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        mat4.scale(this.modelMatrix, this.modelMatrix, [this.scale, this.scale, this.scale]);

        // Apply weapon rotation (inherited from the gun)
        mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation[0]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation[1]);
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation[2]);

        // Set uniforms
        const modelLoc = gl.getUniformLocation(this.program, 'uModelMatrix');
        const viewLoc = gl.getUniformLocation(this.program, 'uViewMatrix');
        const projLoc = gl.getUniformLocation(this.program, 'uProjectionMatrix');
        const textureLoc = gl.getUniformLocation(this.program, 'uTexture');
        const opacityLoc = gl.getUniformLocation(this.program, 'uOpacity');

        gl.uniformMatrix4fv(modelLoc, false, this.modelMatrix);
        gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        gl.uniform1i(textureLoc, 0);
        gl.uniform1f(opacityLoc, this.opacity);

        // Bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        // Bind buffers and draw
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        const posLoc = gl.getAttribLocation(this.program, 'aPosition');
        const texLoc = gl.getAttribLocation(this.program, 'aTexCoord');

        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);

        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 20, 12);

        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        gl.disable(gl.BLEND);
    }

    show() {
        this.isVisible = true;
        this.opacity = 0.8;
    }

    hide() {
        this.isVisible = false;
        this.opacity = 0;
    }

    setOpacity(value) {
        this.opacity = Math.max(0, Math.min(1, value));
    }
}

export class WeaponSystem {
    constructor(enemySystem = null) {
        this.weapons = [];
        this.currentWeaponIndex = 0;
        this.isLoaded = false;
        this.enemySystem = enemySystem;
        this.muzzleFlashes = new Map(); // Store 3D muzzle flash objects
        this.weaponConfigs = [
            {
                name: 'Pistol',
                modelPath: './assets/model/fps_pistol_animated.glb',
                sound: {
                    shoot: audioSystem.sound.pistol_shoot,
                    reload: audioSystem.sound.pistol_reload,
                },
                animations: {
                    idle: 'idle',
                    shoot: 'shoot',
                    reload: 'reload'
                },
                ammo: 12,
                maxAmmo: 12,
                reloadTime: 2.4,
                fireRate: 0.2, // seconds between shots
                damage: 45,
                muzzleFlash: {
                    texturePath: './assets/sprites/pistol-muzzle-flash.png',
                    positionOffset: [0, 0.3, 1.2],  // offset from weapon position [x, y, z]
                    scale: 0.35,    // scale in world units
                    duration: 0.03 // flash duration in seconds
                }
            },
            {
                name: 'Shotgun',
                modelPath: './assets/model/fps_shotgun_animated.glb',
                sound: {
                    shoot: audioSystem.sound.shotgun_shoot,
                    reload: audioSystem.sound.shotgun_reload,
                },
                animations: {
                    idle: 'idle',
                    shoot: 'shoot',
                    reload: 'reload'
                },
                ammo: 6,
                maxAmmo: 6,
                reloadTime: 4.0,
                fireRate: 1.1,
                damage: 100,
                muzzleFlash: {
                    texturePath: './assets/sprites/shotgun-muzzle-flash.png',
                    positionOffset: [0., 0.3, 0.9],  // offset from weapon position [x, y, z]
                    scale: 0.35,    // scale in world units
                    duration: 0.05 // flash duration in seconds
                }
            },
            {
                name: 'Ak47',
                modelPath: './assets/model/fps_ak47_animated.glb',
                sound: {
                    shoot: audioSystem.sound.ak47_shoot,
                    reload: audioSystem.sound.ak47_reload,
                },
                animations: {
                    idle: 'idle',
                    shoot: 'shoot',
                    reload: 'reload'
                },
                ammo: 30,
                maxAmmo: 30,
                reloadTime: 2.8,
                fireRate: 0.1,
                damage: 35,
                muzzleFlash: {
                    texturePath: './assets/sprites/ak47-muzzle-flash.png',
                    positionOffset: [-0.045, 0.26, 1.2],  // offset from weapon position [x, y, z]
                    scale: 0.6,   // scale in world units
                    duration: 0.03 // flash duration in seconds
                }
            },
        ];

        this.currentState = 'idle'; // idle, shoot, reload
        this.lastShotTime = 0;
        this.reloadStartTime = 0;
        this.isReloading = false;
    }

    async loadWeapons() {
        // Load all weapon models
        for (let i = 0; i < this.weaponConfigs.length; i++) {
            const config = this.weaponConfigs[i];

            let scale = 0.015;

            const weaponModel = new model(config.modelPath, 0, 0, 0, 0, 0, 0, scale);
            weaponModel.isObstacle = false;

            // Position weapons underground initially to avoid visual glitches
            weaponModel.position = vec3.fromValues(0, -1000, 0);

            await weaponModel.load();

            weaponModel.animations.forEach((anim, index) => {
            });

            // Automatically map animations based on names
            const animationMap = this.mapAnimations(weaponModel.animations, config.name);
            config.animationMap = animationMap;

            // Create muzzle flash if configured
            let muzzleFlash = null;
            if (config.muzzleFlash) {
                muzzleFlash = new MuzzleFlash(
                    config.muzzleFlash.texturePath,
                    config.muzzleFlash.positionOffset,
                    config.muzzleFlash.scale
                );
                await muzzleFlash.load();
                this.muzzleFlashes.set(i, muzzleFlash);
            }

            this.weapons.push({
                model: weaponModel,
                config: config,
                currentAmmo: config.ammo,
                muzzleFlash: muzzleFlash
            });
        }

        // Position the first weapon correctly
        this.switchToWeapon(0);
        this.isLoaded = true;
    }

    mapAnimations(animations, weaponName) {
        const animMap = {
            idle: null,
            shoot: null,
            reload: null
        };

        if (animations.length > 0) {
            const mainAnim = animations[0];

            if (weaponName === this.weaponConfigs[0].name) { // pistol
                animMap.idle = { name: mainAnim.name, startTime: 5.9, endTime: 6, loop: false };
                animMap.shoot = { name: mainAnim.name, startTime: 0.0, endTime: 0.3, loop: false };
                animMap.reload = { name: mainAnim.name, startTime: 1, endTime: 10, loop: false };

            } else if (weaponName === this.weaponConfigs[1].name) { // shot gun

                animMap.idle = { name: mainAnim.name, startTime: 1.1, endTime: 1.2, loop: false };
                animMap.shoot = { name: mainAnim.name, startTime: 0, endTime: 1.2, loop: false };
                animMap.reload = { name: mainAnim.name, startTime: 0.5, endTime: 10, loop: false };

            } else { // ak 47

                animMap.idle = { name: mainAnim.name, startTime: 0, endTime: 0.1, loop: false };
                animMap.shoot = { name: mainAnim.name, startTime: 0, endTime: 0.3, loop: false };
                animMap.reload = { name: mainAnim.name, startTime: 0.2, endTime: 15, loop: false };
            }

            return animMap;
        }
    }

    playSegment() {

    }

    getAnimationDuration(animation) {
        if (!animation.samplers) return 0;
        return Math.max(...animation.samplers.map(sampler => {
            const times = this.readAccessor ? this.readAccessor(sampler.input) : [];
            return times.length > 0 ? times[times.length - 1] : 0;
        }));
    }

    switchToWeapon(index) {
        if (index < 0 || index >= this.weapons.length || this.isReloading || this.currentState === 'shoot') return;

        // Hide current weapon muzzle flash
        this.hideMuzzleFlash(this.currentWeaponIndex);

        // Hide current weapon
        if (this.weapons[this.currentWeaponIndex]) {
            this.weapons[this.currentWeaponIndex].model.position[1] = -1000;
        }

        // Show new weapon
        this.currentWeaponIndex = index;
        const weapon = this.getCurrentWeapon();
        if (weapon) {
            this.currentState = 'idle';
            this.playIdleAnimation();
            this.updateWeaponUI();
        }
    }

    nextWeapon() {
        const nextIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
        this.switchToWeapon(nextIndex);
    }

    previousWeapon() {
        const prevIndex = (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
        this.switchToWeapon(prevIndex);
    }

    getCurrentWeapon() {
        return this.weapons[this.currentWeaponIndex];
    }

    canShoot() {
        const weapon = this.getCurrentWeapon();
        if (!weapon || this.isReloading || this.currentState === 'shooting') return false;

        const now = performance.now() / 1000;
        const timeSinceLastShot = now - this.lastShotTime;

        return weapon.currentAmmo > 0 && timeSinceLastShot >= weapon.config.fireRate;
    }

    shoot(camera) {
        if (!this.canShoot()) return false;

        const weapon = this.getCurrentWeapon();
        weapon.currentAmmo--;
        this.lastShotTime = performance.now() / 1000;
        this.currentState = 'shoot';

        audioSystem.playAudio(weapon.config.sound.shoot);

        // Play shoot animation
        this.playShootAnimation();

        // Trigger muzzle flash
        this.triggerMuzzleFlash();

        // Handle hit detection if enemy system is available
        if (this.enemySystem && camera) {
            this.enemySystem.handleShooting(camera, weapon);
        }

        // Return to idle after animation
        setTimeout(() => {
            if (this.currentState === 'shoot') {
                this.currentState = 'idle';
                this.playIdleAnimation();
            }
        }, weapon.config.fireRate * 1000); // Adjust based on actual animation length

        this.updateWeaponUI();
        return true;
    }

    reload() {
        const weapon = this.getCurrentWeapon();
        if (!weapon || this.isReloading || weapon.currentAmmo === weapon.config.maxAmmo) return false;

        audioSystem.playAudio(weapon.config.sound.reload);

        this.isReloading = true;
        this.currentState = 'reload';
        this.reloadStartTime = performance.now() / 1000;

        // Play reload animation
        this.playReloadAnimation();

        setTimeout(() => {
            weapon.currentAmmo = weapon.config.maxAmmo;
            this.isReloading = false;
            this.currentState = 'idle';
            this.playIdleAnimation();
            this.updateWeaponUI();
        }, weapon.config.reloadTime * 1000);

        this.updateWeaponUI();
        return true;
    }

    playIdleAnimation() {
        const weapon = this.getCurrentWeapon();
        if (weapon && weapon.model.animations.length > 0) {
            const animationMap = weapon.config.animationMap;
            const animData = animationMap.idle;

            if (animData && animData.name) {
                weapon.model.playSegment(animData.name, animData.startTime, animData.endTime, {
                    loop: animData.loop
                });
            } else {
                weapon.model.play(weapon.model.animations[0].name || 0, { loop: false }, model.name);
            }
        }
    }

    playShootAnimation() {
        const weapon = this.getCurrentWeapon();
        if (weapon && weapon.model.animations.length > 0) {
            const animationMap = weapon.config.animationMap;
            const animData = animationMap.shoot;

            // if (animData && animData.name) {
            weapon.model.playSegment(animData.name, animData.startTime, animData.endTime, {
                loop: animData.loop
            });
            // }
        }
    }

    playReloadAnimation() {
        const weapon = this.getCurrentWeapon();
        if (weapon && weapon.model.animations.length > 0) {
            const animationMap = weapon.config.animationMap;
            const animData = animationMap.reload;

            // if (animData && animData.name) {
            weapon.model.playSegment(animData.name, animData.startTime, animData.endTime, {
                loop: animData.loop
            });
            // } else {
            //     const fallback = weapon.model.animations.length > 2 ?
            //         (weapon.model.animations[2].name || 2) :
            //         (weapon.model.animations[0].name || 0);
            //     weapon.model.play(fallback, { loop: false });
            // }
        }
    }

    updateWeaponPosition(camera) {
        const weapon = this.getCurrentWeapon();
        if (!weapon) return;

        // Position weapon in front of camera
        vec3.copy(weapon.model.position, camera.position);
        vec3.scaleAndAdd(
            weapon.model.position,
            weapon.model.position,
            camera.direction,
            0.8
        );
        weapon.model.position[1] -= 0.35;

        // Face the same direction as camera
        weapon.model.rotation[1] = -Math.atan2(
            camera.noYdirection[2],
            camera.noYdirection[0]
        ) + Math.PI / 2;

        // Apply camera pitch
        weapon.model.rotation[0] = -camera.pitch;

        // Update muzzle flash position
        this.updateMuzzleFlashPosition(camera);
    }

    triggerMuzzleFlash() {
        const weapon = this.getCurrentWeapon();
        if (!weapon || !weapon.muzzleFlash) return;

        const muzzleFlash = weapon.muzzleFlash;
        const flashConfig = weapon.config.muzzleFlash;

        // Show the muzzle flash
        muzzleFlash.show();

        // Hide after the configured duration
        setTimeout(() => {
            muzzleFlash.hide();
        }, flashConfig.duration * 1000);
    }

    updateMuzzleFlashPosition(camera) {
        const weapon = this.getCurrentWeapon();
        if (!weapon || !weapon.muzzleFlash) return;

        const muzzleFlash = weapon.muzzleFlash;
        
        // Update the 3D position of the muzzle flash
        muzzleFlash.updatePosition(weapon.model.position, weapon.model.rotation, camera.direction);
    }

    hideMuzzleFlash(weaponIndex) {
        if (weaponIndex < 0 || weaponIndex >= this.weapons.length) return;
        
        const weapon = this.weapons[weaponIndex];
        if (!weapon || !weapon.muzzleFlash) return;

        weapon.muzzleFlash.hide();
    }

    update(deltaTime) {
        if (!this.isLoaded) return;

        // Update current weapon model
        const weapon = this.getCurrentWeapon();
        if (weapon) {
            weapon.model.update(deltaTime);
        }

        // Update UI periodically
        this.updateWeaponUI();
    }

    renderMuzzleFlashes(viewMatrix, projectionMatrix, cameraPosition) {
        if (!this.isLoaded) return;

        // Render muzzle flash for current weapon only
        const weapon = this.getCurrentWeapon();
        if (weapon && weapon.muzzleFlash) {
            weapon.muzzleFlash.render(viewMatrix, projectionMatrix, cameraPosition);
        }
    }

    updateWeaponUI() {
        const weapon = this.getCurrentWeapon();
        if (!weapon) return;

        const weaponNameEl = document.getElementById('weapon-name');
        const ammoCountEl = document.getElementById('ammo-count');
        const reloadStatusEl = document.getElementById('reload-status');

        if (weaponNameEl) {
            weaponNameEl.textContent = weapon.config.name;
        }

        if (ammoCountEl) {
            ammoCountEl.textContent = `${weapon.currentAmmo} / ${weapon.config.maxAmmo}`;
            const lowThreshold = Math.min(25, Math.max(2, Math.floor(weapon.config.maxAmmo * 0.25)));
            if (weapon.currentAmmo <= lowThreshold) {
                ammoCountEl.classList.add('low-ammo');
            } else {
                ammoCountEl.classList.remove('low-ammo');
            }
        }

        if (reloadStatusEl) {
            if (this.isReloading) {
                const elapsed = (performance.now() / 1000) - this.reloadStartTime;
                const progress = Math.min(elapsed / weapon.config.reloadTime, 1);
                reloadStatusEl.textContent = `Reloading... ${Math.round(progress * 100)}%`;
                reloadStatusEl.style.display = 'block';
            } else {
                reloadStatusEl.style.display = 'none';
            }
        }
    }

    getWeaponsForScene() {
        return this.weapons.map(weapon => weapon.model);
    }
}