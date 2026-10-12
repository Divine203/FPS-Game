import { Zombie, ZOMBIE_TYPES } from './zombie.js';
import { model } from './model.js';
import { vec3 } from 'gl-matrix';
import { audioSystem } from './audio.js';


export class EnemySystem {
    constructor(scene) {
        this.scene = scene;
        this.enemies = [];
        this.modelCache = new Map();
        this.zombiePool = { standard: [], runner: [], tank: [] };
        this.killCount = 0;
        this.totalScore = 0;
        this.onPlayerAttacked = null; // Callback: (damage, zombie) => {}
        this.onZombieKilled = null;   // Callback: (zombie, isHeadshot) => {}
        this.onHit = null;            // Callback: (hitInfo) => {}
    }

    async preloadModels() {
        const uniquePaths = [...new Set(Object.values(ZOMBIE_TYPES).map(t => t.modelPath))];
        const loadPromises = uniquePaths.map(async path => {
            if (!this.modelCache.has(path)) {
                const base = new model(path, 0, -32, 0, 0, 0, 0, 1.0);
                await base.load();
                this.modelCache.set(path, base);
            }
        });
        await Promise.all(loadPromises);
    }

    async spawn(zombieType = 'standard', position = [0, -32, 0]) {
        let zombie;
        const pool = this.zombiePool[zombieType];

        if (pool && pool.length > 0) {
            zombie = pool.pop();
            zombie.reset(position);
        } else {
            const config = ZOMBIE_TYPES[zombieType] || ZOMBIE_TYPES.standard;
            let baseModel = this.modelCache.get(config.modelPath);
            if (!baseModel) {
                baseModel = new model(config.modelPath, 0, -32, 0, 0, 0, 0, 1.0);
                await baseModel.load();
                this.modelCache.set(config.modelPath, baseModel);
            }
            zombie = new Zombie(zombieType, position, baseModel);
            if (!zombie.isLoaded) {
                await zombie.load(baseModel);
            }
        }

        if (this.scene) {
            if (typeof this.scene.addObject === 'function') {
                this.scene.addObject(zombie.model);
            } else if (Array.isArray(this.scene.objects)) {
                if (!this.scene.objects.includes(zombie.model)) {
                    this.scene.objects.push(zombie.model);
                }
            }
        }

        this.enemies.push(zombie);
        this.updateEnemyHUD();
        return zombie;
    }

    async spawnWave(count = 4, spawnPoints = [], playerPosition = [153, 1.3, -379], playerYaw = 2.5) {
        // Balanced zombie type distribution
        const types = ['standard', 'runner', 'tank', 'standard', 'runner', 'tank', 'standard', 'runner'];
        const spawned = [];

        for (let i = 0; i < count; i++) {
            const type = types[i % types.length];
            
            // Generate random spawn position
            // Spawn in front of player (not behind) within reasonable distance
            const playerX = playerPosition[0];
            const playerZ = playerPosition[2];
            
            // Wide angle arc for maximum scattering (180 degree arc)
            const minAngle = -Math.PI / 2; // -90 degrees from forward
            const maxAngle = Math.PI / 2;  // +90 degrees from forward
            const relativeAngle = minAngle + Math.random() * (maxAngle - minAngle);
            
            // Add player's yaw to get world-space angle
            const worldAngle = playerYaw + relativeAngle;
            
            // Large distance range for far spreading (150 to 350 units away)
            const minDistance = 150;
            const maxDistance = 350;
            const distance = minDistance + Math.random() * (maxDistance - minDistance);
            
            // Calculate spawn position based on player's looking direction
            const spawnX = playerX + Math.cos(worldAngle) * distance;
            const spawnZ = playerZ + Math.sin(worldAngle) * distance;
            
            // Large jitter for maximum spreading
            const jitterX = (Math.random() - 0.5) * 80;
            const jitterZ = (Math.random() - 0.5) * 80;
            
            const spawnPos = [spawnX + jitterX, -32, spawnZ + jitterZ];

            const z = await this.spawn(type, spawnPos);
            spawned.push(z);
        }

        return spawned;
    }

    update(deltaTime, playerPosition) {
        // Soft zombie-to-zombie crowd separation (prevents stacking without expensive mesh checks)
        const count = this.enemies.length;
        for (let i = 0; i < count; i++) {
            const zA = this.enemies[i];
            if (zA.health.isDead) continue;
            for (let j = i + 1; j < count; j++) {
                const zB = this.enemies[j];
                if (zB.health.isDead) continue;

                const sepX = zA.position[0] - zB.position[0];
                const sepZ = zA.position[2] - zB.position[2];
                const minDist = zA.config.radius + zB.config.radius;
                const distSq = sepX * sepX + sepZ * sepZ;

                if (distSq > 0 && distSq < minDist * minDist) {
                    const d = Math.sqrt(distSq);
                    const push = (minDist - d) * 0.45;
                    const nx = sepX / d;
                    const nz = sepZ / d;
                    zA.position[0] += nx * push;
                    zA.position[2] += nz * push;
                    zB.position[0] -= nx * push;
                    zB.position[2] -= nz * push;
                }
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const zombie = this.enemies[i];

            // AI update
            const attackEvent = zombie.update(deltaTime, playerPosition, this.scene);
            if (attackEvent && typeof this.onPlayerAttacked === 'function') {
                this.onPlayerAttacked(attackEvent.damage, attackEvent.zombie);
            }

            // Despawn corpses and return to pool for recycling
            if (zombie.state === 'disappearing') {
                this.removeZombieFromScene(zombie);
                this.enemies.splice(i, 1);
                if (!this.zombiePool[zombie.typeKey]) {
                    this.zombiePool[zombie.typeKey] = [];
                }
                this.zombiePool[zombie.typeKey].push(zombie);
                this.updateEnemyHUD();
            }
        }
    }

    handleShooting(camera, weapon) {
        if (!weapon || !weapon.config) return null;

        const rayOrigin = camera.position;
        const rayDir = vec3.normalize(vec3.create(), camera.direction);
        const baseDamage = weapon.config.damage || 25;
        const playerPosition = camera.position;

        let closestHit = null;
        let minDistance = Infinity;

        for (const zombie of this.enemies) {
            if (!zombie.isLoaded || zombie.health.isDead) continue;

            // 1. Check Headshot Hitbox (Sphere)
            const head = zombie.getHeadSphere();
            const headDist = this.rayIntersectsSphere(rayOrigin, rayDir, head.center, head.radius);

            // 2. Check Body Hitbox (AABB)
            const box = zombie.getBoundingBox();
            const bodyDist = this.rayIntersectsAABB(rayOrigin, rayDir, box.min, box.max);

            if (headDist !== null && headDist < minDistance) {
                minDistance = headDist;
                closestHit = {
                    zombie,
                    distance: headDist,
                    isHeadshot: true,
                    multiplier: 2.0
                };
            } else if (bodyDist !== null && bodyDist < minDistance) {
                minDistance = bodyDist;
                closestHit = {
                    zombie,
                    distance: bodyDist,
                    isHeadshot: false,
                    multiplier: 1.0
                };
            }
        }

        if (closestHit) {
            const hitResult = closestHit.zombie.takeDamage(baseDamage, closestHit.multiplier);

            if (hitResult) {
                hitResult.distance = closestHit.distance;
                hitResult.weaponName = weapon.config.name;

                // Play bullet hit sound when zombie is hit
                audioSystem.playBulletHit(closestHit.zombie.position, playerPosition);

                if (hitResult.killed) {
                    this.killCount++;
                    this.totalScore += hitResult.isHeadshot ? 150 : 100;
                    // Play zombie death sound when killed by player
                    audioSystem.playZombieSound('death', closestHit.zombie.position, playerPosition);
                    if (typeof this.onZombieKilled === 'function') {
                        this.onZombieKilled(closestHit.zombie, hitResult.isHeadshot);
                    }
                }

                if (typeof this.onHit === 'function') {
                    this.onHit(hitResult);
                }

                this.triggerHitmarker(hitResult.isHeadshot, hitResult.killed);
                this.updateEnemyHUD();
                return hitResult;
            }
        }

        return null;
    }


    rayIntersectsAABB(origin, dir, min, max) {
        let tmin = 0;
        let tmax = Infinity;

        for (let i = 0; i < 3; i++) {
            if (Math.abs(dir[i]) < 1e-7) {
                if (origin[i] < min[i] || origin[i] > max[i]) return null;
            } else {
                const invD = 1.0 / dir[i];
                let t1 = (min[i] - origin[i]) * invD;
                let t2 = (max[i] - origin[i]) * invD;
                if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                tmin = Math.max(tmin, t1);
                tmax = Math.min(tmax, t2);
                if (tmin > tmax) return null;
            }
        }
        return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
    }


    rayIntersectsSphere(origin, dir, center, radius) {
        const ocX = origin[0] - center[0];
        const ocY = origin[1] - center[1];
        const ocZ = origin[2] - center[2];

        const a = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
        const b = 2.0 * (ocX * dir[0] + ocY * dir[1] + ocZ * dir[2]);
        const c = (ocX * ocX + ocY * ocY + ocZ * ocZ) - radius * radius;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDisc) / (2.0 * a);
        const t2 = (-b + sqrtDisc) / (2.0 * a);

        if (t1 >= 0) return t1;
        if (t2 >= 0) return t2;
        return null;
    }

    removeZombieFromScene(zombie) {
        if (!this.scene) return;
        if (typeof this.scene.removeObject === 'function') {
            this.scene.removeObject(zombie.model);
        } else if (Array.isArray(this.scene.objects)) {
            const idx = this.scene.objects.indexOf(zombie.model);
            if (idx !== -1) {
                this.scene.objects.splice(idx, 1);
            }
        }
    }

    triggerHitmarker(isHeadshot, isKilled) {
        const crosshair = document.getElementById('crosshair');
        if (!crosshair) return;

        crosshair.classList.remove('hit', 'headshot', 'kill');
        void crosshair.offsetWidth; // Force reflow to re-trigger CSS transition

        if (isKilled) {
            crosshair.classList.add('kill');
        } else if (isHeadshot) {
            crosshair.classList.add('headshot');
        } else {
            crosshair.classList.add('hit');
        }

        setTimeout(() => {
            crosshair.classList.remove('hit', 'headshot', 'kill');
        }, 180);
    }

    updateEnemyHUD() {
        const aliveCount = this.getAliveCount();
        const countEl = document.getElementById('zombie-count');
        const killEl = document.getElementById('kill-count');
        const scoreEl = document.getElementById('score-count');

        if (countEl) countEl.textContent = `Zombies: ${aliveCount}`;
        if (killEl) killEl.textContent = `Kills: ${this.killCount}`;
        if (scoreEl) scoreEl.textContent = `Score: ${this.totalScore}`;
    }

    getAliveCount() {
        return this.enemies.filter(z => !z.health.isDead).length;
    }

    getEnemies() {
        return this.enemies;
    }

    reset() {
        for (const zombie of this.enemies) {
            this.removeZombieFromScene(zombie);
        }
        this.enemies = [];
        this.zombiePool = { standard: [], runner: [], tank: [] };
        this.killCount = 0;
        this.totalScore = 0;
        this.updateEnemyHUD();
    }
}
