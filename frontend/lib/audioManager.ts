import { SoundSettings } from '@/components/SoundSettingsModal';

const AMBIENT_LABELS = [
    'Waterfall',
    'Wind',
    'Bamboo Leaves',
    'Garden Tone',
    'Birds',
    'Uguisu Bird',
    'Water Stream',
    'Shishi-Odoshi',
    'Cicadas',
    'Windchime'
];

const MUSIC_FILES = [
    '1. Harris Heller - Heart Piece.wav',
    '2. Harris Heller - Moons of Lylat.wav',
    '3. Harris Heller - The Illusive Man.wav',
    '4. Harris Heller - Not Enough Movement.wav',
    '5. Harris Heller - Minuet of the Forest.wav',
    '6. Harris Heller - Would You Kindly.wav',
    '7. Harris Heller - Lavender Tower.wav',
    '8. Harris Heller - Unfortunate Fate.wav',
    '9. Harris Heller - Desync.wav',
    '10. Harris Heller - Mute City.wav',
    '11. Harris Heller - Guilty Spark.wav',
    '12. Harris Heller - Skyward.wav',
    '13. Harris Heller - Ether.wav',
    '14. Harris Heller - Digital Threat.wav',
    '15. Harris Heller - Tall Grass.wav',
    '16. Harris Heller - Pillar of Autumn.wav',
    '17. Harris Heller - 90_s.wav',
    '18. Harris Heller - Gusty Glade.wav',
    '19. Harris Heller - Are You Still There.wav',
    '20. Harris Heller - Miramar Sunset.wav',
    '21. Harris Heller - Another Castle.wav',
    '22. Harris Heller - Saffron Skyline.wav',
    '23. Harris Heller - Stay a While and Listen.wav',
    '24. Harris Heller - Phendrana Drifts.wav',
    '25. Harris Heller - Big Blue.wav',
    '26. Harris Heller - Heroes Never Die.wav',
    '27. Harris Heller - Clyde.wav',
    '28. Harris Heller - Peacekeeper.wav',
    '29. Harris Heller - Manhattan Project.wav',
    '30. Harris Heller - Little Light.wav'
];

class AudioManager {
    // Ambient A/B sources for crossfading
    private ambientSourcesA: (HTMLAudioElement | null)[] = [];
    private ambientSourcesB: (HTMLAudioElement | null)[] = [];
    private ambientGainNodes: (GainNode | null)[] = [];
    private ambientContext: AudioContext | null = null;
    
    // Music player
    private musicAudio: HTMLAudioElement | null = null;
    private shuffledPlaylist: number[] = [];
    private playlistIndex = 0;
    private musicFadeInterval: NodeJS.Timeout | null = null;
    
    private settings: SoundSettings;

    constructor() {
        // Default settings - all sounds disabled by default
        this.settings = {
            uiEnabled: false,
            musicEnabled: false,
            ambientEnabled: false,
            uiVolume: 50,
            musicVolume: 10,
            ambientVolumes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
        };

        if (typeof window !== 'undefined') {
            // Initialize shuffled playlist on app launch
            this.shufflePlaylist();
            
            // Initialize music player
            this.musicAudio = new Audio();
            this.musicAudio.addEventListener('ended', () => {
                // Only play next if music is still enabled
                if (this.settings.musicEnabled) {
                    this.playNextMusic();
                }
            });
            this.musicAudio.addEventListener('error', (e) => {
                console.error('Music playback error:', e);
                // Try to recover by playing next song after a delay (only if enabled)
                if (this.settings.musicEnabled) {
                    setTimeout(() => this.playNextMusic(), 1000);
                }
            });
            this.musicAudio.loop = false;
        }
    }

    private shufflePlaylist() {
        // Create array of indices [0, 1, 2, ..., 29]
        this.shuffledPlaylist = Array.from({ length: MUSIC_FILES.length }, (_, i) => i);
        
        // Fisher-Yates shuffle algorithm
        for (let i = this.shuffledPlaylist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffledPlaylist[i], this.shuffledPlaylist[j]] = 
                [this.shuffledPlaylist[j], this.shuffledPlaylist[i]];
        }
        
        // Reset to beginning of playlist
        this.playlistIndex = 0;
        
        console.log('Music playlist shuffled:', this.shuffledPlaylist.map(i => MUSIC_FILES[i].split(' - ')[1]?.replace('.wav', '')));
    }

    updateSettings(settings: SoundSettings) {
        const oldSettings = { ...this.settings };
        this.settings = settings;

        // Handle music state changes
        if (settings.musicEnabled && !oldSettings.musicEnabled) {
            this.startMusic();
        } else if (!settings.musicEnabled && oldSettings.musicEnabled) {
            this.stopMusic();
        } else if (this.musicAudio && settings.musicEnabled) {
            // Update volume in real-time
            const volume = Math.max(0, Math.min(1, (settings.musicVolume ?? 50) / 100));
            this.musicAudio.volume = volume;
        }

        // Handle ambient state changes
        if (settings.ambientEnabled && !oldSettings.ambientEnabled) {
            this.startAmbient();
        } else if (!settings.ambientEnabled && oldSettings.ambientEnabled) {
            this.stopAmbient();
        } else if (settings.ambientEnabled) {
            this.updateAmbientVolumes();
        }

        // Save volume settings to localStorage (but not toggle states)
        if (typeof window !== 'undefined') {
            const volumeSettings = {
                uiVolume: settings.uiVolume,
                musicVolume: settings.musicVolume,
                ambientVolumes: settings.ambientVolumes
            };
            localStorage.setItem('soundVolumes', JSON.stringify(volumeSettings));
        }
    }

    loadSettings(): SoundSettings {
        // Load saved volume settings, but always start with toggles disabled
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('soundVolumes');
            if (saved) {
                try {
                    const volumes = JSON.parse(saved);
                    this.settings.uiVolume = volumes.uiVolume ?? 50;
                    this.settings.musicVolume = volumes.musicVolume ?? 10;
                    this.settings.ambientVolumes = volumes.ambientVolumes ?? [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
                } catch (e) {
                    console.error('Failed to parse volume settings:', e);
                }
            }
        }
        // Always return with toggles disabled
        return this.settings;
    }

    // ===== REAL-TIME VOLUME UPDATES =====
    
    updateMusicVolume(volume: number) {
        this.settings.musicVolume = volume;
        if (this.musicAudio && this.settings.musicEnabled) {
            const vol = Math.max(0, Math.min(1, (volume ?? 50) / 100));
            this.musicAudio.volume = vol;
        }
    }

    updateAmbientVolume(index: number, volume: number) {
        this.settings.ambientVolumes[index] = volume;
        if (this.ambientGainNodes[index] && this.settings.ambientEnabled) {
            this.ambientGainNodes[index]!.gain.value = (volume / 100) ** 2;
        }
    }

    updateUIVolume(volume: number) {
        this.settings.uiVolume = volume;
    }

    // ===== AMBIENT SOUNDS (A/B Crossfade System) =====
    
    async startAmbient() {
        if (!this.settings.ambientEnabled) return;
        if (typeof window === 'undefined') return;

        try {
            // Initialize Web Audio API context
            if (!this.ambientContext) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                this.ambientContext = new AudioContextClass();
            }

            // Resume context if suspended
            if (this.ambientContext.state === 'suspended') {
                await this.ambientContext.resume();
            }

            // Initialize 10 ambient layers with A/B crossfading
            for (let i = 0; i < 10; i++) {
                await this.initAmbientLayer(i);
            }

            console.log('Ambient sounds started');
        } catch (error) {
            console.error('Failed to start ambient sounds:', error);
        }
    }

    private async initAmbientLayer(index: number) {
        if (!this.ambientContext) return;

        const audioA = new Audio(`/sounds/ambient/${index}a.mp3`);
        const audioB = new Audio(`/sounds/ambient/${index}b.mp3`);

        // Create media element sources
        const sourceA = this.ambientContext.createMediaElementSource(audioA);
        const sourceB = this.ambientContext.createMediaElementSource(audioB);

        // Create gain node for this layer
        const gainNode = this.ambientContext.createGain();
        gainNode.gain.value = (this.settings.ambientVolumes[index] / 100) ** 2; // Quadratic scaling

        // Connect: sources -> gain -> destination
        sourceA.connect(gainNode);
        sourceB.connect(gainNode);
        gainNode.connect(this.ambientContext.destination);

        // Store references
        this.ambientSourcesA[index] = audioA;
        this.ambientSourcesB[index] = audioB;
        this.ambientGainNodes[index] = gainNode;

        // Start playback with crossfade
        audioA.loop = false;
        audioB.loop = false;

        // Play A first
        await audioA.play().catch(e => console.log(`Ambient ${index}a play failed:`, e));

        // When A ends, play B
        audioA.addEventListener('ended', async () => {
            if (this.settings.ambientEnabled && audioB) {
                await audioB.play().catch(e => console.log(`Ambient ${index}b play failed:`, e));
            }
        });

        // When B ends, play A (seamless loop)
        audioB.addEventListener('ended', async () => {
            if (this.settings.ambientEnabled && audioA) {
                await audioA.play().catch(e => console.log(`Ambient ${index}a play failed:`, e));
            }
        });
    }

    private updateAmbientVolumes() {
        for (let i = 0; i < 10; i++) {
            if (this.ambientGainNodes[i]) {
                this.ambientGainNodes[i]!.gain.value = (this.settings.ambientVolumes[i] / 100) ** 2;
            }
        }
    }

    stopAmbient() {
        // Stop all ambient sources
        for (let i = 0; i < 10; i++) {
            if (this.ambientSourcesA[i]) {
                this.ambientSourcesA[i]!.pause();
                this.ambientSourcesA[i]!.currentTime = 0;
            }
            if (this.ambientSourcesB[i]) {
                this.ambientSourcesB[i]!.pause();
                this.ambientSourcesB[i]!.currentTime = 0;
            }
        }

        // Clear arrays
        this.ambientSourcesA = [];
        this.ambientSourcesB = [];
        this.ambientGainNodes = [];

        console.log('Ambient sounds stopped');
    }

    // ===== MUSIC PLAYER (Random with Fade) =====
    
    async startMusic() {
        if (!this.settings.musicEnabled || !this.musicAudio) return;
        
        this.playNextMusic();
    }

    private async playNextMusic() {
        if (!this.musicAudio || !this.settings.musicEnabled) return;

        // Get next song from shuffled playlist
        const songIndex = this.shuffledPlaylist[this.playlistIndex];
        const musicFile = MUSIC_FILES[songIndex];

        // Move to next position in playlist
        this.playlistIndex++;
        
        // Loop back to beginning if we've played all songs
        if (this.playlistIndex >= this.shuffledPlaylist.length) {
            this.playlistIndex = 0;
            console.log('🔁 Playlist complete, looping back to start');
        }

        this.musicAudio.src = `/sounds/music/${musicFile}`;
        this.musicAudio.volume = 0; // Start at 0 for fade in

        try {
            // Reset audio element state
            this.musicAudio.load();
            await this.musicAudio.play();
            this.fadeInMusic();
            console.log(`🎵 Now playing [${this.playlistIndex}/${this.shuffledPlaylist.length}]: ${musicFile}`);
        } catch (error) {
            console.error('Music play failed:', error);
            // Try again after a delay
            setTimeout(() => {
                if (this.settings.musicEnabled) {
                    this.playNextMusic();
                }
            }, 2000);
        }
    }

    private fadeInMusic() {
        if (!this.musicAudio) return;

        const targetVolume = Math.max(0, Math.min(1, (this.settings.musicVolume ?? 50) / 100));
        const fadeSteps = 30; // 3 seconds at 100ms intervals
        let currentStep = 0;

        if (this.musicFadeInterval) clearInterval(this.musicFadeInterval);

        this.musicFadeInterval = setInterval(() => {
            if (!this.musicAudio) return;

            currentStep++;
            this.musicAudio.volume = (currentStep / fadeSteps) * targetVolume;

            if (currentStep >= fadeSteps) {
                if (this.musicFadeInterval) clearInterval(this.musicFadeInterval);
            }
        }, 100);
    }

    private fadeOutMusic(callback: () => void) {
        if (!this.musicAudio) return;

        const startVolume = this.musicAudio.volume;
        const fadeSteps = 30;
        let currentStep = 0;

        if (this.musicFadeInterval) clearInterval(this.musicFadeInterval);

        this.musicFadeInterval = setInterval(() => {
            if (!this.musicAudio) return;

            currentStep++;
            this.musicAudio.volume = startVolume * (1 - currentStep / fadeSteps);

            if (currentStep >= fadeSteps) {
                if (this.musicFadeInterval) clearInterval(this.musicFadeInterval);
                callback();
            }
        }, 100);
    }

    stopMusic() {
        if (!this.musicAudio) return;

        // Clear any fade intervals
        if (this.musicFadeInterval) {
            clearInterval(this.musicFadeInterval);
            this.musicFadeInterval = null;
        }

        // Stop immediately without fade
        this.musicAudio.pause();
        this.musicAudio.currentTime = 0;
        this.musicAudio.volume = 0;
        
        console.log('Music stopped');
    }

    // ===== UI SOUNDS =====
    
    playPieceSound(isBlack: boolean) {
        if (!this.settings.uiEnabled) return;
        if (typeof window === 'undefined') return;
        
        const audio = new Audio(`/sounds/shogi_sound_${isBlack ? 'black' : 'white'}.mp3`);
        const volume = (this.settings.uiVolume ?? 50) / 100;
        audio.volume = Math.max(0, Math.min(1, volume * 0.5));
        audio.play().catch(err => console.log('Piece sound play failed:', err));
    }

    playUISound(soundName: 'message' | 'new_game' | 'start' | 'pause') {
        if (!this.settings.uiEnabled) return;
        if (typeof window === 'undefined') return;
        
        const audio = new Audio(`/sounds/${soundName}.wav`);
        const volume = (this.settings.uiVolume ?? 50) / 100;
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch(err => console.log(`UI sound ${soundName} play failed:`, err));
    }

    // ===== UTILITY =====
    
    getAmbientLabels(): string[] {
        return AMBIENT_LABELS;
    }
}

// Singleton instance
export const audioManager = new AudioManager();
