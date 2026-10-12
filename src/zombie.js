import { model } from './model.js';
import { vec3 } from 'gl-matrix';
import { audioSystem } from './audio.js';

export const ZOMBIE_TYPES = {
    standard: {
        name: 'Standard Zombie',
        modelPath: './assets/model/zombie.glb',
        scale: 24.3,
        maxHealth: 100,
        speed: 48.0,
        damage: 15,
        attackRange: 16.0,
        attackCooldown: 1.1, // seconds between attacks
        height: 43.0,
        radius: 4.5,
        animations: {
            idle: 'Idle',
            walk: 'Walk_InPlace',
            run: 'Run_InPlace',
            attack: 'Attack',
            death: 'FallingBack'
        }
    },
    runner: {
        name: 'Runner Zombie',
        modelPath: './assets/model/zombie-v1.glb',
        scale: 26.3,
        maxHealth: 70,
        speed: 68.0,
        damage: 12,
        attackRange: 18.0,
        attackCooldown: 0.9,
        height: 45.0,
        radius: 4.0,
        animations: {
            idle: 'mixamo.com',
            walk: 'walk',
            run: 'run',
            attack: 'attack',
            death: 'die-back'
        }
    },
    tank: {
        name: 'Brute Tank Zombie',
        modelPath: './assets/model/zombie.glb',
        scale: 36.5,
        maxHealth: 260,
        speed: 36.0,
        damage: 32,
        attackRange: 20.0,
        attackCooldown: 1.5,
        height: 82.0,
        radius: 6.5,
        animations: {
            idle: 'Idle',
            walk: 'Walk1_InPlace',
            run: 'Run_InPlace',
            attack: 'Attack',
            death: 'FallingBack'
        }
    }
};

/**
 * Health Calculator handles damage calculations, armor/resistance, and health state.
 */
export class HealthCalculator {
    constructor(maxHealth = 100, armor = 0) {
        this.maxHealth = maxHealth;
        this.currentHealth = maxHealth;
        this.armor = armor;
        this.isDead = false;
        this.lastDamageTaken = 0;
        this.lastHitTime = 0;
    }

    calculateDamage(baseDamage, hitMultiplier = 1.0) {
        let netDamage = baseDamage * hitMultiplier;
        if (this.armor > 0) {
            netDamage = Math.max(1, netDamage * (1 - this.armor));
        }
        return Math.round(netDamage);
    }

    applyDamage(amount) {
        if (this.isDead) {
            return { damageDealt: 0, isDead: true, killed: false, remainingHealth: 0, healthPercent: 0 };
        }

        const damageDealt = Math.min(this.currentHealth, amount);
        this.currentHealth -= damageDealt;
        this.lastDamageTaken = damageDealt;
        this.lastHitTime = performance.now();

        const killed = this.currentHealth <= 0;
        if (killed) {
            this.currentHealth = 0;
            this.isDead = true;
        }

        return {
            damageDealt,
            remainingHealth: this.currentHealth,
            healthPercent: this.currentHealth / this.maxHealth,
            isDead: this.isDead,
            killed
        };
    }
}

/**
 * Zombie Entity representing an individual enemy in the 3D world.
 */
export class Zombie {
    constructor(typeKey = 'standard', position = [0, -32, 0], baseModel = null) {
        this.id = 'zombie_' + Math.random().toString(36).substring(2, 9);
        this.typeKey = ZOMBIE_TYPES[typeKey] ? typeKey : 'standard';
        this.config = ZOMBIE_TYPES[this.typeKey];

        const [px, py, pz] = position;
        this.position = vec3.fromValues(px, py !== undefined ? py : -32, pz);
        this.rotation = vec3.fromValues(0, 0, 0);

        if (baseModel && baseModel.isLoaded) {
            this.model = baseModel.clone(
                this.position[0],
                this.position[1],
                this.position[2],
                0,
                0,
                0,
                this.config.scale
            );
            this.model.isObstacle = false;
            this.isLoaded = true;
        } else {
            this.model = new model(
                this.config.modelPath,
                this.position[0],
                this.position[1],
                this.position[2],
                0,
                0,
                0,
                this.config.scale
            );
            this.model.isObstacle = false;
            this.isLoaded = false;
        }

        this.health = new HealthCalculator(this.config.maxHealth);

        // AI and Animation State
        // States: 'spawning', 'chase', 'attack', 'dead', 'disappearing'
        this.state = this.isLoaded ? 'chase' : 'spawning';
        this.currentAnimState = null;
        this.lastAttackTime = 0;
        this.attackDuration = 1.0;
        this.isAttacking = false;
        this.deathTime = 0;
        this.despawnDelay = 1.3; // Seconds to linger after death before removal
        this.hitFlashTime = 0;

        // Steering / Path smoothing
        this.targetYaw = 0;
        this.currentYaw = 0;
        this.turnSpeed = 6.0; // Radians per second
        this.stuckTimer = 0;
        this.avoidanceAngle = 0;

        // Audio timing
        this.lastFootstepTime = 0;
        this.lastGrowlTime = 0;
        this.footstepInterval = 0.4; // seconds between footsteps
        this.growlInterval = 3.0 + Math.random() * 2.0; // random interval between growls

        if (this.isLoaded) {
            this.playAnimation('walk', true);
        }
    }

    async load(baseModel = null) {
        if (baseModel && baseModel.isLoaded) {
            this.model = baseModel.clone(
                this.position[0],
                this.position[1],
                this.position[2],
                0,
                0,
                0,
                this.config.scale
            );
            this.model.isObstacle = false;
            this.isLoaded = true;
        } else if (!this.isLoaded) {
            await this.model.load();
            this.model.isObstacle = false;
            this.isLoaded = true;
        }
        this.state = 'chase';
        this.playAnimation('walk', true);
        return this;
    }

    /**
     * Resets this zombie instance to be reused from an object pool.
     */
    reset(position = [0, -32, 0]) {
        const [px, py, pz] = position;
        this.position[0] = px;
        this.position[1] = py !== undefined ? py : -32;
        this.position[2] = pz;
        this.rotation[0] = 0;
        this.rotation[1] = 0;
        this.rotation[2] = 0;

        if (this.model) {
            vec3.copy(this.model.position, this.position);
            vec3.copy(this.model.rotation, this.rotation);
            this.model.isObstacle = false;
        }

        this.health = new HealthCalculator(this.config.maxHealth);
        this.state = 'chase';
        this.currentAnimState = null;
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.deathTime = 0;
        this.targetYaw = 0;
        this.currentYaw = 0;
        this.stuckTimer = 0;
        this.avoidanceAngle = 0;
        this.hitFlashTime = 0;

        // Reset audio timers
        this.lastFootstepTime = 0;
        this.lastGrowlTime = 0;
        this.growlInterval = 3.0 + Math.random() * 2.0;

        this.playAnimation('walk', true);
        return this;
    }

    playAnimation(animType, loop = true) {
        if (!this.isLoaded || !this.model.animations || this.model.animations.length === 0) return;
        if (this.currentAnimState === animType && this.model.currentAnimation) return;

        const animName = this.config.animations[animType] || this.config.animations.idle;
        const clip = this.model.animations.find(a => a.name === animName) || this.model.animations[0];

        if (clip) {
            this.currentAnimState = animType;
            this.model.play(clip.name, {
                loop: loop,
                speed: animType === 'attack' ? 1.2 : (animType === 'run' ? 1.3 : 1.0)
            }, this.config.name);
        }
    }

    update(deltaTime, playerPosition, scene) {
        if (!this.isLoaded) return null;

        // Keep model position/rotation synced
        vec3.copy(this.model.position, this.position);

        // If dead, handle death state & despawning
        if (this.health.isDead) {
            if (this.state !== 'dead' && this.state !== 'disappearing') {
                this.state = 'dead';
                this.model.isObstacle = false;
                this.deathTime = performance.now() / 1000;
                this.playAnimation('death', false);
                // Play zombie death sound
                audioSystem.playZombieSound('death', this.position, playerPosition);
            }

            this.model.update(deltaTime);

            const elapsedDead = (performance.now() / 1000) - this.deathTime;
            if (elapsedDead >= this.despawnDelay) {
                this.state = 'disappearing';
            }
            return null;
        }

        // Alive Zombie AI: Trace path to player
        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        // Calculate direct facing angle towards player
        this.targetYaw = Math.atan2(dx, dz);
        this.currentYaw = this.lerpAngle(this.currentYaw, this.targetYaw, this.turnSpeed * deltaTime);
        this.rotation[1] = this.currentYaw;
        this.model.rotation[1] = this.currentYaw;

        let attackEvent = null;
        const now = performance.now() / 1000;

        // Attack distance check
        if (distToPlayer <= this.config.attackRange) {
            this.state = 'attack';
            this.playAnimation('attack', true);

            if (now - this.lastAttackTime >= this.config.attackCooldown) {
                this.lastAttackTime = now;
                // Play zombie strike sound when attack cooldown triggers
                audioSystem.playZombieSound('strike', this.position, playerPosition);
                attackEvent = {
                    zombie: this,
                    damage: this.config.damage,
                    zombieName: this.config.name
                };
            }
        } else {
            // Chase Player: Trace path and navigate around obstacles
            this.state = 'chase';
            const useRun = distToPlayer > 60 && this.config.animations.run;
            this.playAnimation(useRun ? 'run' : 'walk', true);

            const moveSpeed = (useRun ? this.config.speed * 1.4 : this.config.speed) * deltaTime;
            this.navigateTowards(dx, dz, distToPlayer, moveSpeed, scene);

            // Play footsteps while moving
            if (now - this.lastFootstepTime >= this.footstepInterval) {
                this.lastFootstepTime = now;
                audioSystem.playZombieSound('footsteps', this.position, playerPosition);
            }

            // Play random growls
            if (now - this.lastGrowlTime >= this.growlInterval) {
                this.lastGrowlTime = now;
                this.growlInterval = 3.0 + Math.random() * 2.0; // Reset with new random interval
                audioSystem.playZombieGrowl(this.typeKey, this.position, playerPosition);
            }
        }

        this.model.update(deltaTime);
        return attackEvent;
    }
    
    // Simple straight-line navigation towards player (no collision detection)
    navigateTowards(dx, dz, dist, stepSize, scene) {
        if (dist < 0.001) return;

        const baseDirX = dx / dist;
        const baseDirZ = dz / dist;

        // Move directly towards player in a straight line
        this.position[0] += baseDirX * stepSize;
        this.position[2] += baseDirZ * stepSize;
    }

    // Takes damage from a weapon shot, calculating multipliers and death.
    takeDamage(baseDamage, hitMultiplier = 1.0) {
        if (this.health.isDead) return null;

        const effectiveDamage = this.health.calculateDamage(baseDamage, hitMultiplier);
        const result = this.health.applyDamage(effectiveDamage);
        this.hitFlashTime = performance.now();

        if (result.killed) {
            this.state = 'dead';
            this.model.isObstacle = false;
            this.deathTime = performance.now() / 1000;
            this.playAnimation('death', false);
        }

        return {
            ...result,
            effectiveDamage,
            isHeadshot: hitMultiplier >= 1.9,
            zombie: this
        };
    }

    
    // Bounding box for raycast shooting & collision hit detection.
    getBoundingBox() {
        const h = this.config.height;
        const r = this.config.radius + 1.2;
        return {
            min: [this.position[0] - r, this.position[1], this.position[2] - r],
            max: [this.position[0] + r, this.position[1] + h, this.position[2] + r]
        };
    }


    getHeadSphere() {
        const headHeight = this.position[1] + this.config.height * 0.88;
        return {
            center: [this.position[0], headHeight, this.position[2]],
            radius: this.config.radius * 0.85
        };
    }

    lerpAngle(a, b, t) {
        let diff = (b - a) % (2 * Math.PI);
        if (diff < -Math.PI) diff += 2 * Math.PI;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        return a + diff * Math.min(1, Math.max(0, t));
    }
}
