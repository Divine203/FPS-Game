export class AudioSystem {
    constructor() {
        this.path = '../assets/audio/'

        this.music = {
            calm: new Audio(`${this.path}calm-bg.mp3`)
        }

        this.currentMusic = this.music.calm

        this.sound = {
            footsteps: {
                file: new Audio(`${this.path}footsteps-player.mp3`),
                volume: 1.0
            },


            // Gun
            pistol_shoot: {
                file: new Audio(`${this.path}pistol-shoot.mp3`),
                volume: 0.4
            },
            pistol_reload: {
                file: new Audio(`${this.path}pistol-reload1.mp3`),
                volume: 1.0
            },
            shotgun_shoot: {
                file: new Audio(`${this.path}shotgun-shoot.mp3`),
                volume: 0.4
            },
            shotgun_reload: {
                file: new Audio(`${this.path}shotgun-reload.mp3`),
                volume: 0.4
            },
            ak47_shoot: {
                file: new Audio(`${this.path}ak47-shoot.mp3`),
                volume: 1.0
            },
            ak47_reload: {
                file: new Audio(`${this.path}ak47-reload.mp3`),
                volume: 1.0
            },

            // Player
            player_death: {
                file: new Audio(`${this.path}player-dead.mp3`),
                volume: 1.0
            },

            // Zombies
            zombie_footsteps: {
                file: new Audio(`${this.path}footsteps.wav`),
                volume: 0.15
            },
            zombie_small_growl: {
                file: new Audio(`${this.path}small-zombie-growl.mp3`),
                volume: 0.25
            },
            zombie_mid_growl: {
                file: new Audio(`${this.path}mid-zombie-growl.mp3`),
                volume: 0.25
            },
            zombie_big_growl: {
                file: new Audio(`${this.path}big-zombie-growl.mp3`),
                volume: 0.3
            },
            zombie_strike: {
                file: new Audio(`${this.path}zombie-strike.mp3`),
                volume: 0.35
            },
            zombie_death: {
                file: new Audio(`${this.path}zombie-dead.mp3`),
                volume: 0.3
            },
            bullet_hit: {
                file: new Audio(`${this.path}bullet-hit-player-1.mp3`),
                volume: 0.6
            }
        }
    }

    playAudio = (audio_file) => {
        audio_file.file.volume = audio_file.volume
        audio_file.file.play();
        if (!audio_file.file.ended || !audio_file.file.paused) {
            audio_file.file.currentTime = 0;
            audio_file.file.play();
        }
    }

    playFootSteps = (bool) => {
        if (bool) {
            this.sound.footsteps.file.volume = 0.5;
            this.sound.footsteps.file.play();
            this.sound.footsteps.file.removeEventListener('ended', this.footstepsLoop);

            this.footstepsLoop = () => this.playFootSteps(true);

            this.sound.footsteps.file.addEventListener('ended', this.footstepsLoop);
        } else {
            this.sound.footsteps.file.pause();
            this.sound.footsteps.file.removeEventListener('ended', this.footstepsLoop);
        }
    };
    
    playBackgroundMusic = (bool) => {
        if (bool) {
            this.currentTime = 0;
            this.currentMusic.volume = 0.8;
            this.currentMusic.play();

            this.currentMusic.addEventListener('ended', () => {
                this.playBackgroundMusic(true);
            });
        }
        else this.currentMusic.pause()

    }

    // Calculate volume based on distance from player
    calculateDistanceVolume = (soundPosition, playerPosition, baseVolume, maxDistance = 300) => {
        const dx = soundPosition[0] - playerPosition[0];
        const dy = soundPosition[1] - playerPosition[1];
        const dz = soundPosition[2] - playerPosition[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // More aggressive exponential attenuation for better distance perception
        const attenuation = Math.max(0, 1 - Math.pow(distance / maxDistance, 1.5));
        const volume = baseVolume * attenuation;
        return Math.max(0, Math.min(1, volume));
    }

    // Play player death sound
    playPlayerDeath = () => {
        this.playAudio(this.sound.player_death);
    }

    // Play zombie sound with distance-based volume
    playZombieSound = (soundType, zombiePosition, playerPosition) => {
        let sound;
        let baseVolume;

        switch(soundType) {
            case 'footsteps':
                sound = this.sound.zombie_footsteps;
                baseVolume = 0.15;
                break;
            case 'small_growl':
                sound = this.sound.zombie_small_growl;
                baseVolume = 0.25;
                break;
            case 'mid_growl':
                sound = this.sound.zombie_mid_growl;
                baseVolume = 0.25;
                break;
            case 'big_growl':
                sound = this.sound.zombie_big_growl;
                baseVolume = 0.3;
                break;
            case 'strike':
                sound = this.sound.zombie_strike;
                baseVolume = 0.35;
                break;
            case 'death':
                sound = this.sound.zombie_death;
                baseVolume = 0.7;
                break;
            default:
                return;
        }

        const volume = this.calculateDistanceVolume(zombiePosition, playerPosition, baseVolume);
        if (volume > 0.01) { // Only play if audible
            sound.file.volume = volume;
            sound.file.currentTime = 0;
            sound.file.play();
        }
    }

    // Play zombie growl based on type
    playZombieGrowl = (zombieType, zombiePosition, playerPosition) => {
        switch(zombieType) {
            case 'standard':
                this.playZombieSound('small_growl', zombiePosition, playerPosition);
                break;
            case 'runner':
                this.playZombieSound('mid_growl', zombiePosition, playerPosition);
                break;
            case 'tank':
                this.playZombieSound('big_growl', zombiePosition, playerPosition);
                break;
        }
    }

    // Play bullet hit sound when zombie is hit
    playBulletHit = (zombiePosition, playerPosition) => {
        const volume = this.calculateDistanceVolume(zombiePosition, playerPosition, 0.6);
        if (volume > 0.01) {
            this.sound.bullet_hit.file.volume = volume;
            this.sound.bullet_hit.file.currentTime = 0;
            this.sound.bullet_hit.file.play();
        }
    }
}

export const audioSystem = new AudioSystem();