/**
 * 100% SDK-Compliant Gemini Live Avatar Frontend
 * Communicates with SDK-compliant Python backend
 */

import { AudioRecorder } from './audio-recorder.js';
import { AudioPlayer } from './audio-player.js';

class GeminiLiveClient {
    constructor() {
        this.ws = null;
        this.audioRecorder = null;
        this.audioPlayer = null;
        this.isConnected = false;
        this.isRecording = false;

        // SDK-COMPLIANT: Audio specifications from official docs
        this.SAMPLE_RATE_INPUT = 16000;  // 16kHz input
        this.SAMPLE_RATE_OUTPUT = 24000; // 24kHz output

        // Avatar state
        this.currentAvatarState = 'idle';
        this.videoSources = null;
        this.videoCycleTimers = [];
        this.videoCycleAnimationFrame = null;
        this.isSpeaking = false;
        this.pendingTurnComplete = false;  // Track if turn_complete arrived while audio playing
        this.isInterrupted = false;  // Track if we're in interrupted/barge-in state
        this.interruptTimeout = null;  // Track timeout for clearing interrupted state
        this.lastInterruptTime = 0;  // Timestamp of last interrupt (for debouncing)

        // Speaking cycle configuration (loaded from config.json)
        this.speakingCycleConfig = {
            enabled: true,
            initialForwardDuration: 3.0,
            reverseDuration: 2.0,
            forwardDuration: 2.0
        };

        // DOM elements
        this.statusEl = document.getElementById('status');
        this.mixerToggle = document.getElementById('mixerToggle');
        this.labelOn = document.getElementById('labelOn');
        this.isToggleActive = false;
        this.isToggleAnimating = false;
        this.logEl = document.getElementById('log');
        this.audioIndicator = document.getElementById('audioIndicator');
        this.ccOverlay = document.getElementById('ccOverlay');
        this.ccText = document.getElementById('ccText');
        this.ccTimeout = null;  // For delaying next sentence
        this.lastCaptionTime = 0;  // Track when last caption was shown
        this.minCaptionDisplayMs = 5000;  // Minimum 5s display before next caption

        // CC Toggle elements
        this.ccToggle = document.getElementById('ccToggle');
        this.ccLabelOff = document.getElementById('ccLabelOff');
        this.ccLabelOn = document.getElementById('ccLabelOn');
        this.isCCActive = false;  // CC starts OFF

        // CC interim chunk throttling (loaded from config)
        this.ccInterimChunkDelayMs = 130;  // Default 130ms delay between chunks
        this.ccInterimChunkQueue = [];  // Queue of pending interim chunks
        this.ccInterimChunkTimeout = null;  // Timeout for processing queued chunks

        // CC sliding window (loaded from config)
        this.ccWordsArray = [];  // Track individual words for sliding window effect
        this.ccMaxVisibleWords = 16;  // Default: ~2 lines worth of words
        this.ccIsProcessingFinal = false;  // Track if we're on the final chunk

        // Download progress tracking
        this.downloadCountdownInterval = null;
        this.downloadEta = 0;

        // Pre-loaded video elements for instant state switching (no load delay)
        this.avatarVideos = {
            idle: document.getElementById('video-idle'),
            listening: document.getElementById('video-listening'),
            speaking: document.getElementById('video-speaking'),
            dancing: document.getElementById('video-dancing')
        };

        // Current active video reference
        this.avatarVideo = null;  // Will be set in initialization

        // Dance mode state
        this.isDancing = false;
        this.danceTimeout = null;
        this.danceAudio = null;
        this.danceModeConfig = null;

        // Sound effects
        this.soundEffectsConfig = null;

        // Stage curtain
        this.stageCurtain = document.getElementById('stageCurtain');
        this.curtainRaised = false;

        // Preloaded dance music
        this.preloadedDanceMusic = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.mixerToggle.addEventListener('click', () => this.toggleConnection());
        this.ccToggle.addEventListener('click', () => this.toggleCC());
    }

    toggleConnection() {
        // Prevent double-clicks during animation
        if (this.isToggleAnimating) {
            return;
        }

        // Determine the target state
        const willBeActive = !this.isToggleActive;

        // Mark as animating
        this.isToggleAnimating = true;

        // Update UI immediately to start animation
        this.updateToggleUI(willBeActive);

        // Wait for animation to complete (300ms transition) before triggering action
        setTimeout(() => {
            this.isToggleAnimating = false;
            if (willBeActive) {
                this.start();
            } else {
                this.stop();
            }
        }, 300);
    }

    updateToggleUI(active) {
        this.isToggleActive = active;
        if (active) {
            this.mixerToggle.classList.add('active');
            this.labelOn.classList.add('active');
        } else {
            this.mixerToggle.classList.remove('active');
            this.labelOn.classList.remove('active');
        }
    }

    toggleCC() {
        // Toggle CC state
        this.isCCActive = !this.isCCActive;

        // Update UI
        if (this.isCCActive) {
            this.ccToggle.classList.add('active');
            this.ccLabelOff.classList.remove('active');
            this.ccLabelOn.classList.add('active');
            this.log('Closed captions enabled', 'info');
        } else {
            this.ccToggle.classList.remove('active');
            this.ccLabelOff.classList.add('active');
            this.ccLabelOn.classList.remove('active');
            // Hide and clear CC window when disabled
            this.ccOverlay.classList.remove('active');
            this.ccText.textContent = '';
            if (this.ccTimeout) {
                clearTimeout(this.ccTimeout);
                this.ccTimeout = null;
            }
            // Clear interim chunk queue and timeout
            if (this.ccInterimChunkTimeout) {
                clearTimeout(this.ccInterimChunkTimeout);
                this.ccInterimChunkTimeout = null;
            }
            this.ccInterimChunkQueue = [];
            this.ccWordsArray = [];  // Clear sliding window
            // Reset caption timing
            this.lastCaptionTime = 0;
            this.log('Closed captions disabled', 'info');
        }
    }

    async start() {
        try {
            this.log('Starting connection...', 'info');
            this.setStatus('connecting', 'Connecting...');

            // Read config
            const config = await this.loadConfig();

            // Environment-aware WebSocket URL selection
            const wsUrl = this.getWebSocketUrl(config);
            console.log(`🌐 Environment: ${this.isLocalEnvironment() ? 'Local Development' : 'Cloud Production'}`);
            console.log(`🔌 WebSocket URL: ${wsUrl}`);

            // Connect WebSocket
            await this.connectWebSocket(wsUrl);

            // Start audio recording
            await this.startAudio();

            this.isConnected = true;
            this.updateToggleUI(true);

            // Set avatar to listening state
            this.setAvatarState('listening');

            // Play crowd clapping sound effect
            this.playCrowdClapping();

            // Raise the curtain to reveal the stage
            this.raiseCurtain();

            // Update status to ONLINE
            this.setStatus('connected', 'ONLINE');

            this.log('✅ Connected and ready!', 'success');

        } catch (error) {
            this.log(`❌ Error: ${error.message}`, 'error');
            this.setStatus('disconnected', 'Connection Failed');
            this.cleanup();
        }
    }

    /**
     * Detect if running in local development or cloud production.
     * @returns {boolean} true if local, false if cloud
     */
    isLocalEnvironment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    }

    /**
     * Get environment-aware WebSocket URL from config.
     * @param {Object} config - Configuration object
     * @returns {string} WebSocket URL appropriate for current environment
     */
    getWebSocketUrl(config) {
        const isLocal = this.isLocalEnvironment();

        // Handle both old format (string) and new format (object with local/cloud)
        const wsConfig = config.backend?.wsUrl;

        if (typeof wsConfig === 'string') {
            // Old format: just a string URL (fallback for backward compatibility)
            return wsConfig;
        } else if (typeof wsConfig === 'object') {
            // New format: object with local and cloud URLs
            return isLocal ? wsConfig.local : wsConfig.cloud;
        }

        // Fallback default
        return isLocal ? 'ws://localhost:8080' : 'wss://YOUR-BACKEND.run.app';
    }

    /**
     * Get environment-aware video URL from config.
     * @param {string} videoKey - Video key (idle, listening, speaking)
     * @returns {string} Video URL appropriate for current environment
     */
    getVideoUrl(videoKey) {
        const isLocal = this.isLocalEnvironment();

        // Handle both old format (flat sources) and new format (local/cloud sources)
        if (this.videoSources.local && this.videoSources.cloud) {
            // New format: separate local and cloud sources
            return isLocal ? this.videoSources.local[videoKey] : this.videoSources.cloud[videoKey];
        } else {
            // Old format: flat sources (backward compatibility)
            return this.videoSources[videoKey];
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('config.json');
            const config = await response.json();

            // Load video sources from config (supports both old and new formats)
            if (config.video && config.video.sources) {
                this.videoSources = config.video.sources;
                console.log('✅ Video sources loaded:', this.videoSources);
            }

            // Load speaking cycle configuration
            if (config.speakingCycle) {
                this.speakingCycleConfig = { ...this.speakingCycleConfig, ...config.speakingCycle };

                // Validate configuration
                const { initialForwardDuration, reverseDuration, forwardDuration } = this.speakingCycleConfig;
                const minRequired = Math.max(initialForwardDuration, reverseDuration + forwardDuration);

                console.log('✅ Speaking cycle config loaded:', this.speakingCycleConfig);
                console.log(`   Min video duration required: ${minRequired}s`);
                console.log(`   Oscillation range: ${initialForwardDuration - reverseDuration}s to ${initialForwardDuration}s`);
            }

            // Load closed captions styling configuration
            if (config.closedCaptions) {
                const cc = config.closedCaptions;
                document.documentElement.style.setProperty('--cc-width', `${cc.width}px`);
                document.documentElement.style.setProperty('--cc-max-width-vh', `${cc.maxWidthVh}vh`);
                document.documentElement.style.setProperty('--cc-max-width-vw', `${cc.maxWidthVw}vw`);
                document.documentElement.style.setProperty('--cc-height', `${cc.height}px`);
                document.documentElement.style.setProperty('--cc-font-size', `${cc.fontSize}px`);
                document.documentElement.style.setProperty('--cc-padding', `${cc.padding}px`);
                document.documentElement.style.setProperty('--cc-border-radius', `${cc.borderRadius}px`);
                document.documentElement.style.setProperty('--cc-line-height', cc.lineHeight);

                // Load interim chunk delay for throttling word-by-word appearance
                if (cc.interimChunkDelayMs !== undefined) {
                    this.ccInterimChunkDelayMs = cc.interimChunkDelayMs;
                }

                // Load max visible words for sliding window
                if (cc.maxVisibleWords !== undefined) {
                    this.ccMaxVisibleWords = cc.maxVisibleWords;
                }

                console.log('✅ Closed captions styling loaded:', cc);
            }

            // Load dance mode configuration
            if (config.danceMode) {
                this.danceModeConfig = config.danceMode;
                console.log('✅ Dance mode configuration loaded:', this.danceModeConfig);
            }

            // Load sound effects configuration
            if (config.soundEffects) {
                this.soundEffectsConfig = config.soundEffects;
                console.log('✅ Sound effects configuration loaded:', this.soundEffectsConfig);
            }

            // Preload dance music
            if (config.danceMode && config.danceMode.enabled && config.danceMode.musicFile) {
                let musicPath = config.danceMode.musicFile;
                if (typeof musicPath === 'object') {
                    const isLocal = this.isLocalEnvironment();
                    musicPath = isLocal ? musicPath.local : musicPath.cloud;
                }
                console.log('🎵 Preloading dance music:', musicPath);
                this.preloadedDanceMusic = new Audio(musicPath);
                this.preloadedDanceMusic.crossOrigin = "anonymous";
                this.preloadedDanceMusic.preload = "auto";
                this.preloadedDanceMusic.load();
                console.log('✅ Dance music preloaded');
            }

            // Load typography configuration
            if (config.typography) {
                const typo = config.typography;

                // Font families
                if (typo.fontFamily) {
                    document.documentElement.style.setProperty('--font-family-primary', typo.fontFamily.primary);
                    document.documentElement.style.setProperty('--font-family-secondary', typo.fontFamily.secondary);
                }

                // Header styles
                if (typo.header) {
                    if (typo.header.title) {
                        const title = typo.header.title;
                        document.documentElement.style.setProperty(
                            '--header-title-font-size',
                            `clamp(${title.fontSizeMin}px, ${title.fontSizePreferred}, ${title.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--header-title-font-weight', title.fontWeight);
                        document.documentElement.style.setProperty('--header-title-letter-spacing', `${title.letterSpacing}px`);
                    }
                    if (typo.header.subtitle) {
                        const subtitle = typo.header.subtitle;
                        document.documentElement.style.setProperty(
                            '--header-subtitle-font-size',
                            `clamp(${subtitle.fontSizeMin}px, ${subtitle.fontSizePreferred}, ${subtitle.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--header-subtitle-font-weight', subtitle.fontWeight);
                        document.documentElement.style.setProperty('--header-subtitle-letter-spacing', `${subtitle.letterSpacing}px`);
                    }
                }

                // Status styles
                if (typo.status) {
                    if (typo.status.small) {
                        const small = typo.status.small;
                        document.documentElement.style.setProperty(
                            '--status-small-font-size',
                            `clamp(${small.fontSizeMin}px, ${small.fontSizePreferred}, ${small.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--status-small-font-weight', small.fontWeight);
                        document.documentElement.style.setProperty('--status-small-letter-spacing', `${small.letterSpacing}px`);
                    }
                    if (typo.status.medium) {
                        const medium = typo.status.medium;
                        document.documentElement.style.setProperty(
                            '--status-medium-font-size',
                            `clamp(${medium.fontSizeMin}px, ${medium.fontSizePreferred}, ${medium.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--status-medium-font-weight', medium.fontWeight);
                        document.documentElement.style.setProperty('--status-medium-letter-spacing', `${medium.letterSpacing}px`);
                    }
                    if (typo.status.large) {
                        const large = typo.status.large;
                        document.documentElement.style.setProperty(
                            '--status-large-font-size',
                            `clamp(${large.fontSizeMin}px, ${large.fontSizePreferred}, ${large.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--status-large-font-weight', large.fontWeight);
                        document.documentElement.style.setProperty('--status-large-letter-spacing', `${large.letterSpacing}px`);
                    }
                }

                // Toggle styles
                if (typo.toggle) {
                    if (typo.toggle.inactive) {
                        const inactive = typo.toggle.inactive;
                        document.documentElement.style.setProperty(
                            '--toggle-inactive-font-size',
                            `clamp(${inactive.fontSizeMin}px, ${inactive.fontSizePreferred}, ${inactive.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--toggle-inactive-font-weight', inactive.fontWeight);
                        document.documentElement.style.setProperty('--toggle-inactive-letter-spacing', `${inactive.letterSpacing}px`);
                    }
                    if (typo.toggle.active) {
                        const active = typo.toggle.active;
                        document.documentElement.style.setProperty(
                            '--toggle-active-font-size',
                            `clamp(${active.fontSizeMin}px, ${active.fontSizePreferred}, ${active.fontSizeMax}px)`
                        );
                        document.documentElement.style.setProperty('--toggle-active-font-weight', active.fontWeight);
                        document.documentElement.style.setProperty('--toggle-active-letter-spacing', `${active.letterSpacing}px`);
                    }
                }

                // CC text styles
                if (typo.closedCaptions) {
                    const ccTypo = typo.closedCaptions;
                    document.documentElement.style.setProperty('--cc-font-weight', ccTypo.fontWeight);
                    // fontSize and lineHeight already handled by closedCaptions config above
                }

                // Debug console styles
                if (typo.debugConsole) {
                    const debug = typo.debugConsole;
                    document.documentElement.style.setProperty(
                        '--debug-console-font-size',
                        `clamp(${debug.fontSizeMin}px, ${debug.fontSizePreferred}, ${debug.fontSizeMax}px)`
                    );
                }

                console.log('✅ Typography configuration loaded:', typo);
            }

            // Note: Videos are pre-loaded in the initialization code (lines 740-750)
            // No need for separate preloading here

            return config;
        } catch (error) {
            console.error('Config load error:', error);
            // Default config
            const defaultConfig = {
                backend: {
                    wsUrl: {
                        local: 'ws://localhost:8080',
                        cloud: 'wss://YOUR-BACKEND.run.app'
                    }
                },
                video: {
                    displayWidth: 768,
                    displayHeight: 768,
                    sources: {
                        local: {
                            idle: 'media/video/idle.mp4',
                            listening: 'media/video/idle.mp4',
                            speaking: 'media/video/talking.mp4'
                        }
                    }
                }
            };
            this.videoSources = defaultConfig.video.sources;
            return defaultConfig;
        }
    }

    connectWebSocket(url) {
        return new Promise((resolve, reject) => {
            this.log(`Connecting to ${url}...`, 'info');

            this.ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.log('WebSocket connected', 'success');
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                this.log('WebSocket error', 'error');
                reject(error);
            };

            this.ws.onclose = (event) => {
                this.log(`WebSocket closed: ${event.code}`, 'info');
                this.setStatus('disconnected', 'Disconnected');
                this.cleanup();
            };

            // Wait for ready message
            const readyHandler = (event) => {
                const data = JSON.parse(event.data);
                if (data.ready) {
                    clearTimeout(timeout);
                    this.ws.removeEventListener('message', readyHandler);
                    resolve();
                }
            };

            this.ws.addEventListener('message', readyHandler);
        });
    }

    async startAudio() {
        // Initialize audio player for output (24kHz)
        this.audioPlayer = new AudioPlayer(this.SAMPLE_RATE_OUTPUT);

        // Set up callback for when all audio finishes
        this.audioPlayer.onAllAudioEnded = () => {
            console.log('🔇 All audio playback complete');
            // Stop barge-in monitoring when audio finishes
            if (this.audioRecorder) {
                this.audioRecorder.stopBargeInMonitoring();
            }
            // If turn_complete arrived while audio was playing, handle it now
            if (this.pendingTurnComplete) {
                console.log('   Processing pending turn_complete');
                this.pendingTurnComplete = false;
                this.setAvatarState('listening');
            }
        };

        // Resume AudioContext (required on some browsers)
        if (this.audioPlayer.audioContext.state === 'suspended') {
            await this.audioPlayer.audioContext.resume();
        }

        // Initialize audio recorder for input (16kHz)
        this.audioRecorder = new AudioRecorder(this.SAMPLE_RATE_INPUT);

        // Handle audio data from microphone
        this.audioRecorder.onData = (base64Audio) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // SDK-COMPLIANT: Send audio as base64 via WebSocket to backend
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: base64Audio
                }));
            }
        };

        // Handle client-side barge-in detection
        this.audioRecorder.onBargeInDetected = () => {
            console.log('🎤 CLIENT-SIDE BARGE-IN: User speaking while audio playing');
            this.handleLocalBargeIn();
        };

        // Start recording
        await this.audioRecorder.start();
        this.isRecording = true;
        this.audioIndicator.classList.add('active');
        this.log('🎤 Microphone active', 'info');
    }

    handleLocalBargeIn() {
        const now = Date.now();

        // Debounce: If last interrupt was less than 50ms ago, extend the existing timeout
        if (this.isInterrupted && (now - this.lastInterruptTime) < 50) {
            console.log('   🔄 Extending interrupt (rapid barge-in)');
            this.lastInterruptTime = now;

            // Clear existing timeout and set a new one
            if (this.interruptTimeout) {
                clearTimeout(this.interruptTimeout);
            }
            this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
            return;
        }

        // Fresh interrupt or first interrupt
        if (this.isInterrupted) {
            console.log('   ⚠️ Already interrupted, forcing cleanup');
            this.forceCleanupInterrupt();
        }

        console.log('⚡ LOCAL BARGE-IN: Immediately halting audio');
        this.lastInterruptTime = now;

        // 1. Set interrupted flag to block incoming audio
        this.isInterrupted = true;

        // 2. Send interrupt signal to backend to stop sending audio
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'interrupt'
            }));
            console.log('   📤 Interrupt signal sent to backend');
        }

        // 3. Stop monitoring for more barge-ins (will restart when needed)
        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
        }

        // 4. Immediately stop ALL audio and clear pending flags
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        this.pendingTurnComplete = false;
        console.log('   🛑 Audio halted');

        // 5. Return to idle
        this.setAvatarState('idle');

        // 6. Schedule transition to listening after brief pause
        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
        }
        this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
    }

    clearInterruptState() {
        console.log('   ✅ Clearing interrupt state, ready for response');
        this.setAvatarState('listening');
        this.isInterrupted = false;
        this.interruptTimeout = null;
    }

    forceCleanupInterrupt() {
        // Aggressive cleanup when multiple interrupts happen
        console.log('   🧹 Force cleanup interrupt state');

        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
            this.interruptTimeout = null;
        }

        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
        }

        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }

        this.pendingTurnComplete = false;
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            const type = message.type;

            // Fast path for audio (most common message)
            if (type === 'audio') {
                // DANCE MODE GUARD: Ignore audio when dancing
                if (this.isDancing) {
                    console.log('   💃 Skipping audio chunk (dance mode active)');
                    return;
                }

                // BARGE-IN GUARD: Ignore audio if we're in interrupted state
                if (this.isInterrupted) {
                    console.log('   ⏭️ Skipping audio chunk (interrupted state)');
                    return;
                }

                // Clear any pending turn_complete since we're receiving new audio
                this.pendingTurnComplete = false;

                // Clear any pending interrupt timeout (we're getting a real response)
                if (this.interruptTimeout) {
                    clearTimeout(this.interruptTimeout);
                    this.interruptTimeout = null;
                }

                // ASYNC COORDINATION: Start video first, then audio
                // This prevents interference between video decoder initialization and audio processing
                this.setAvatarState('speaking');

                // Start barge-in monitoring when audio starts playing
                if (this.audioRecorder && !this.isInterrupted) {
                    this.audioRecorder.startBargeInMonitoring();
                }

                // Resume video if it was paused during sentence break
                if (this.avatarVideo && this.avatarVideo.paused) {
                    this.avatarVideo.play();
                    console.log('   📹 Talking video resumed');
                }

                // Defer audio playback to next tick to avoid blocking video
                // This ensures video element state changes complete before audio decode starts
                requestAnimationFrame(() => {
                    this.audioPlayer.play(message.data);
                });
                return;
            }

            switch (type) {
                case 'setup_complete':
                    console.log('✅ SDK setup complete');
                    this.setStatus('connected', 'Connected & Ready');
                    break;

                case 'text':
                    console.log(`💬 Gemini: ${message.data}`);
                    // Check for DANCE_MODE trigger (case-insensitive)
                    const textData = message.data ? message.data.trim().toUpperCase() : '';
                    if (textData === 'DANCE_MODE') {
                        console.log('🎯 DANCE_MODE trigger detected in text!');
                        // Stop any playing audio (Gemini might have spoken "DANCE_MODE")
                        if (this.audioPlayer) {
                            this.audioPlayer.stop();
                        }
                        this.triggerDanceMode();
                    }
                    // Don't show text messages in CC - only STT transcriptions
                    break;

                case 'transcription_interim':
                    // Don't show captions during dance mode
                    if (!this.isDancing) {
                        // Real-time transcription chunk (interim, shown immediately with lower opacity)
                        this.updateClosedCaptions(message.data, false);
                    }
                    break;

                case 'transcription':
                    // Don't show captions during dance mode
                    if (!this.isDancing) {
                        // Complete transcription (final, shown with full opacity)
                        this.updateClosedCaptions(message.data, true);
                    }
                    break;

                case 'download_progress':
                    // Model download progress with countdown timer
                    this.handleDownloadProgress(message);
                    break;

                case 'turn_complete':
                    console.log('✅ Turn complete received (sentence boundary)');
                    // NATURAL PAUSING: Pause the talking video between sentences
                    // - If audio still queued: Pause talking video (natural pause)
                    // - If no audio: Return to listening (conversation ended)
                    if (this.audioPlayer && this.audioPlayer.sources.length > 0) {
                        console.log('   Audio still queued, pausing talking video between sentences');
                        // Pause the speaking video for natural sentence break
                        if (this.currentAvatarState === 'speaking' && this.avatarVideo) {
                            this.avatarVideo.pause();
                            console.log('   📹 Talking video paused');
                        }
                        this.pendingTurnComplete = true;
                        // Will be handled by audioPlayer.onAllAudioEnded callback
                    } else {
                        console.log('   No audio playing, returning to listening');
                        // Stop barge-in monitoring when returning to listening
                        if (this.audioRecorder) {
                            this.audioRecorder.stopBargeInMonitoring();
                        }
                        this.setAvatarState('listening');
                    }
                    break;

                case 'interrupted':
                    console.log('⚠️ Server-side interruption detected');
                    // If we're already handling a client-side interrupt, skip this
                    if (this.isInterrupted) {
                        console.log('   Already handling client-side interrupt');
                        return;
                    }

                    // BARGE-IN FLOW (server-detected):
                    // 1. Set interrupted flag to block incoming audio
                    this.isInterrupted = true;

                    // 2. Stop monitoring for more barge-ins
                    if (this.audioRecorder) {
                        this.audioRecorder.stopBargeInMonitoring();
                    }

                    // 3. Immediately stop ALL audio and clear pending flags
                    this.audioPlayer.stop();
                    this.pendingTurnComplete = false;
                    this.setAvatarState('idle');
                    console.log('   🛑 Audio halted, avatar to idle');

                    // 4. Schedule transition to listening after brief pause
                    if (this.interruptTimeout) {
                        clearTimeout(this.interruptTimeout);
                    }
                    this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
                    break;

                case 'tool_call':
                    this.log(`🔧 Tool call: ${message.data.name}`, 'info');
                    break;

                case 'error':
                    this.log(`❌ Error: ${message.data.message}`, 'error');
                    break;

                case 'go_away':
                    this.log('🚪 Server closing connection', 'info');
                    this.stop();
                    break;
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    stop() {
        this.log('Stopping...', 'info');
        this.cleanup();
    }

    cleanup() {
        // Stop video cycling
        this.stopVideoSpeakingCycle();

        // Stop dance mode if active
        if (this.isDancing) {
            this.stopDanceMode(false);
        }

        // Clear any pending interrupt timeout
        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
            this.interruptTimeout = null;
        }

        // Stop audio
        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
            this.audioRecorder.stop();
            this.audioRecorder = null;
        }

        if (this.audioPlayer) {
            this.audioPlayer.stop();
            this.audioPlayer = null;
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isRecording = false;
        this.isInterrupted = false;  // Clear interrupted state
        this.pendingTurnComplete = false;  // Clear pending flags
        this.lastInterruptTime = 0;  // Reset interrupt timestamp
        this.isToggleAnimating = false;  // Reset animation flag

        this.updateToggleUI(false);
        this.audioIndicator.classList.remove('active');

        // Clear closed captions
        this.clearClosedCaptions();

        // Clear download countdown timer
        if (this.downloadCountdownInterval) {
            clearInterval(this.downloadCountdownInterval);
            this.downloadCountdownInterval = null;
        }
        this.downloadEta = 0;

        // Set avatar back to idle
        this.setAvatarState('idle');

        // Lower the curtain to hide the stage
        this.lowerCurtain();

        this.setStatus('disconnected', 'Disconnected');
        this.log('Stopped', 'info');
    }

    setStatus(state, text) {
        this.statusEl.className = `status ${state}`;
        this.statusEl.textContent = text;
    }

    raiseCurtain() {
        if (!this.stageCurtain || this.curtainRaised) return;

        console.log('🎭 Raising stage curtain...');
        this.stageCurtain.classList.add('raised');
        this.curtainRaised = true;
    }

    lowerCurtain() {
        if (!this.stageCurtain || !this.curtainRaised) return;

        console.log('🎭 Lowering stage curtain...');
        this.stageCurtain.classList.remove('raised');
        this.curtainRaised = false;
    }

    playCrowdClapping() {
        if (!this.soundEffectsConfig || !this.soundEffectsConfig.crowdClapping) {
            console.log('⚠️ Crowd clapping sound effect not configured');
            return;
        }

        // Get environment-aware sound URL
        let soundPath = this.soundEffectsConfig.crowdClapping;
        if (typeof soundPath === 'object') {
            const isLocal = this.isLocalEnvironment();
            soundPath = isLocal ? soundPath.local : soundPath.cloud;
        }

        console.log(`👏 Playing crowd clapping from: ${soundPath}`);

        // Play crowd clapping
        const crowdAudio = new Audio(soundPath);
        crowdAudio.volume = 0.7; // Slightly lower volume so it doesn't overpower
        crowdAudio.crossOrigin = "anonymous";

        crowdAudio.play().then(() => {
            console.log('👏 Crowd clapping playback started');
        }).catch(e => {
            console.error('❌ Failed to play crowd clapping:', e);
        });
    }


    updateClosedCaptions(text, isFinal = false) {
        if (!this.ccText || !this.ccOverlay) return;

        // Don't show captions if CC toggle is off
        if (!this.isCCActive) return;

        // For interim results, queue chunks and display with configured delay
        if (!isFinal) {
            // Add chunk to queue
            this.ccInterimChunkQueue.push(text);

            // Start processing queue if not already processing
            if (!this.ccInterimChunkTimeout) {
                this.processInterimChunkQueue();
            }
            return;
        }

        // For final results, replace interim text IMMEDIATELY
        // Final transcription should show right away (no 5s delay - that's only for NEW sentences)

        // Clear interim chunk queue and timeout
        this.ccInterimChunkQueue = [];
        if (this.ccInterimChunkTimeout) {
            clearTimeout(this.ccInterimChunkTimeout);
            this.ccInterimChunkTimeout = null;
        }

        // Clear any existing timeout
        if (this.ccTimeout) {
            clearTimeout(this.ccTimeout);
            this.ccTimeout = null;
        }

        // Apply sliding window to final transcription to prevent shift
        const finalWords = text.trim().split(/\s+/).filter(word => word.length > 0);

        // Only show last N words (same as interim chunks)
        if (finalWords.length > this.ccMaxVisibleWords) {
            const visibleWords = finalWords.slice(-this.ccMaxVisibleWords);
            this.ccWordsArray = visibleWords;
            this.ccText.textContent = visibleWords.join(' ');
        } else {
            this.ccWordsArray = finalWords;
            this.ccText.textContent = text;
        }

        this.ccText.style.opacity = '1';  // Full opacity for final
        this.ccOverlay.classList.add('active');
        this.lastCaptionTime = Date.now();
    }

    processInterimChunkQueue() {
        // No chunks to process
        if (this.ccInterimChunkQueue.length === 0) {
            this.ccInterimChunkTimeout = null;
            return;
        }

        // Already processing - don't start another animation
        if (this.ccInterimChunkTimeout) {
            return;
        }

        // Get next chunk from queue
        const chunk = this.ccInterimChunkQueue.shift();

        // Check if there are more chunks coming after this one
        const isLastChunk = this.ccInterimChunkQueue.length === 0;

        // WORD-BY-WORD DISPLAY: Split chunk into individual words
        const newWords = chunk.trim().split(/\s+/).filter(word => word.length > 0);

        // Add each word with a delay for smooth scrolling effect
        let wordIndex = 0;
        const addNextWord = () => {
            if (wordIndex < newWords.length) {
                const isLastWord = isLastChunk && (wordIndex === newWords.length - 1);

                // Add one word at a time
                this.ccWordsArray.push(newWords[wordIndex]);

                // Maintain sliding window - remove oldest words if exceeds max
                const shouldScroll = this.ccWordsArray.length > this.ccMaxVisibleWords && !isLastWord;
                if (shouldScroll) {
                    this.ccWordsArray.shift();
                }

                // Update text content
                this.ccText.textContent = this.ccWordsArray.join(' ');
                this.ccText.style.opacity = '0.8';  // Lower opacity for interim
                this.ccOverlay.classList.add('active');

                // Smooth scroll animation: measure text width and slide left
                // Only scroll if we're not on the last word
                if (shouldScroll) {
                    requestAnimationFrame(() => {
                        // Get the width of one word (approximate)
                        const tempSpan = document.createElement('span');
                        tempSpan.style.font = window.getComputedStyle(this.ccText).font;
                        tempSpan.style.visibility = 'hidden';
                        tempSpan.style.position = 'absolute';
                        tempSpan.textContent = newWords[wordIndex] + ' ';
                        document.body.appendChild(tempSpan);
                        const wordWidth = tempSpan.offsetWidth;
                        document.body.removeChild(tempSpan);

                        // Get current transform
                        const currentTransform = this.ccText.style.transform || 'translateX(0px)';
                        const currentX = parseFloat(currentTransform.match(/-?\d+\.?\d*/)?.[0] || 0);

                        // Slide left by the width of the new word
                        this.ccText.style.transform = `translateX(${currentX - wordWidth}px)`;
                    });
                }

                wordIndex++;

                // Schedule next word with tracked timeout
                this.ccInterimChunkTimeout = setTimeout(addNextWord, this.ccInterimChunkDelayMs);
            } else {
                // All words from this chunk added, process next chunk
                this.ccInterimChunkTimeout = null;
                if (this.ccInterimChunkQueue.length > 0) {
                    this.processInterimChunkQueue();
                }
            }
        };

        // Start adding words
        this.ccInterimChunkTimeout = setTimeout(addNextWord, 0);
    }

    clearClosedCaptions() {
        if (!this.ccOverlay) return;

        // Clear all CC timeouts and queues
        if (this.ccTimeout) {
            clearTimeout(this.ccTimeout);
            this.ccTimeout = null;
        }

        if (this.ccInterimChunkTimeout) {
            clearTimeout(this.ccInterimChunkTimeout);
            this.ccInterimChunkTimeout = null;
        }

        this.ccInterimChunkQueue = [];
        this.ccWordsArray = [];  // Clear sliding window

        this.ccOverlay.classList.remove('active');
        if (this.ccText) {
            this.ccText.textContent = '';
            this.ccText.style.transform = 'translateX(0px)';  // Reset scroll position
        }
    }

    triggerDanceMode() {
        console.log('🎯 triggerDanceMode() called');
        console.log('   danceModeConfig:', this.danceModeConfig);
        console.log('   preloadedDanceMusic:', this.preloadedDanceMusic);

        if (!this.danceModeConfig || !this.danceModeConfig.enabled) {
            console.log('⚠️ Dance mode not enabled in config');
            return;
        }

        if (this.isDancing) {
            console.log('⚠️ Already dancing!');
            return;
        }

        console.log('💃 Triggering dance mode!');
        this.isDancing = true;

        // Stop audio playback (mute conversation)
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }

        // Stop recording temporarily
        const wasRecording = this.isRecording;
        if (this.audioRecorder && wasRecording) {
            this.audioRecorder.stopBargeInMonitoring();
        }

        // Switch to dancing video
        this.setAvatarState('dancing');

        // Get environment-aware music URL
        let musicPath = this.danceModeConfig.musicFile;
        if (typeof musicPath === 'object') {
            // New format: object with local/cloud URLs
            const isLocal = this.isLocalEnvironment();
            musicPath = isLocal ? musicPath.local : musicPath.cloud;
        }

        console.log(`🎵 Loading dance music from: ${musicPath}`);

        // Use preloaded music if available, otherwise create new Audio
        if (this.preloadedDanceMusic && this.preloadedDanceMusic.src.includes(musicPath)) {
            console.log('🎵 Using preloaded dance music');
            this.danceAudio = this.preloadedDanceMusic;
            this.danceAudio.currentTime = 0;  // Reset to beginning
        } else {
            console.log('🎵 Loading dance music on demand');
            this.danceAudio = new Audio(musicPath);
            this.danceAudio.crossOrigin = "anonymous";
            this.danceAudio.preload = "auto";
        }

        this.danceAudio.volume = 1.0;

        // Add event listeners for debugging
        this.danceAudio.addEventListener('canplay', () => {
            console.log('✅ Dance music ready to play');
        });

        this.danceAudio.addEventListener('playing', () => {
            console.log('🎵 Dance music is now playing');
        });

        this.danceAudio.addEventListener('error', (e) => {
            console.error('❌ Dance music error:', e);
            console.error('   Error details:', this.danceAudio.error);
        });

        this.danceAudio.addEventListener('loadeddata', () => {
            console.log('📦 Dance music loaded, attempting playback...');
        });

        // CRITICAL: Load the audio first, then play
        this.danceAudio.load();

        // Start playback with detailed error handling
        const playPromise = this.danceAudio.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`✅ Dance music playback started: ${musicPath}`);
            }).catch(e => {
                console.error('❌ Failed to play dance music:', e);
                console.error('   Error name:', e.name);
                console.error('   Error message:', e.message);

                // Try to resume AudioContext if suspended
                if (this.audioPlayer && this.audioPlayer.audioContext) {
                    console.log('🔄 Attempting to resume AudioContext...');
                    this.audioPlayer.audioContext.resume().then(() => {
                        console.log('✅ AudioContext resumed, retrying dance music...');
                        this.danceAudio.play().catch(retryError => {
                            console.error('❌ Retry also failed:', retryError);
                        });
                    });
                }
            });
        }

        console.log(`💃 Dance mode active for ${this.danceModeConfig.duration}ms`);

        // Return to listening after duration
        this.danceTimeout = setTimeout(() => {
            this.stopDanceMode(wasRecording);
        }, this.danceModeConfig.duration);
    }

    stopDanceMode(resumeRecording = true) {
        if (!this.isDancing) return;

        console.log('🛑 Stopping dance mode');
        this.isDancing = false;

        // Clear timeout
        if (this.danceTimeout) {
            clearTimeout(this.danceTimeout);
            this.danceTimeout = null;
        }

        // Stop music
        if (this.danceAudio) {
            this.danceAudio.pause();
            this.danceAudio.currentTime = 0;
            this.danceAudio = null;
        }

        // Return to listening state
        this.setAvatarState('listening');

        // Resume recording if it was active
        if (resumeRecording && this.audioRecorder) {
            console.log('🎤 Resuming recording after dance');
        }

        console.log('✅ Dance mode complete');
    }

    handleDownloadProgress(message) {
        const { current, total, message: progressMessage, eta_seconds } = message;

        // Clear any existing countdown
        if (this.downloadCountdownInterval) {
            clearInterval(this.downloadCountdownInterval);
            this.downloadCountdownInterval = null;
        }

        // If ETA provided, start countdown timer
        if (eta_seconds > 0) {
            this.downloadEta = eta_seconds;
            this.startDownloadCountdown(progressMessage, total, current);
        } else {
            // No ETA, just show message
            this.setStatus('connecting', progressMessage);
        }
    }

    startDownloadCountdown(baseMessage, total, current) {
        // Update immediately
        this.updateDownloadStatus(baseMessage, total, current);

        // Then update every second
        this.downloadCountdownInterval = setInterval(() => {
            this.downloadEta = Math.max(0, this.downloadEta - 1);
            this.updateDownloadStatus(baseMessage, total, current);

            // Stop countdown when it reaches 0
            if (this.downloadEta <= 0 && this.downloadCountdownInterval) {
                clearInterval(this.downloadCountdownInterval);
                this.downloadCountdownInterval = null;
            }
        }, 1000);
    }

    updateDownloadStatus(baseMessage, total, current) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        const statusText = `${baseMessage} (${current}/${total}) - ${this.downloadEta}s`;
        this.setStatus('connecting', statusText);
    }


    /**
     * VIDEO SPEAKING CYCLE ALGORITHM
     *
     * Mathematical Model:
     * ------------------
     * Position sequence: P₀ → P₁ → P₂ → P₃ → P₂ → P₃ → ...
     *
     * Phase 1 (Initial): P₀=0 → P₁=F1 (forward F1 seconds)
     * Phase 2 (Reverse): P₁=F1 → P₂=(F1-R) (backward R seconds)
     * Phase 3 (Forward): P₂ → P₃=(P₂+F2) (forward F2 seconds)
     * Loop: P₃ → P₂ → P₃ → P₂ ... (stable oscillation)
     *
     * Example with F1=3, R=2, F2=2:
     *   P₀ = 0s
     *   P₁ = 3s (after initial forward)
     *   P₂ = 1s (after reverse: 3-2)
     *   P₃ = 3s (after forward: 1+2)
     *   Oscillates: {3, 1, 3, 1, 3, 1, ...}
     *
     * Stability: P₃ = P₁ → perfect loop with no drift
     *
     * Key Features:
     * - Forced position corrections prevent cumulative drift
     * - requestAnimationFrame for smooth reverse playback
     * - Three end conditions: time, target, floor (safety)
     * - Detailed logging for debugging and verification
     */
    startVideoSpeakingCycle() {
        // Check if enabled in config
        if (!this.speakingCycleConfig.enabled) return;

        // Stop any existing cycle
        this.stopVideoSpeakingCycle();

        if (!this.avatarVideo) return;

        this.isSpeaking = true;
        const video = this.avatarVideo;

        // Note: Video is already playing from setAvatarState()
        // loop and playbackRate already set in setAvatarState()

        // PROBLEM 1: Validate video duration
        const F1 = this.speakingCycleConfig.initialForwardDuration;
        const R = this.speakingCycleConfig.reverseDuration;
        const F2 = this.speakingCycleConfig.forwardDuration;
        const minRequired = Math.max(F1, R + F2);

        // Check video duration (if available)
        if (video.duration && video.duration < minRequired) {
            console.warn(`⚠️ Video too short! Duration: ${video.duration.toFixed(1)}s, Required: ${minRequired}s`);
            console.warn(`   Cycle may not work correctly. Consider using a longer video or reducing cycle durations.`);
        }

        console.log(`🎬 Starting cycle: F1=${F1}s, R=${R}s, F2=${F2}s (min required: ${minRequired}s)`);
        if (video.duration) {
            console.log(`   Video duration: ${video.duration.toFixed(1)}s`);
        }

        // PROBLEM 2, 3: Phase 1 - Initial forward play
        // P₀ = 0 → P₁ = F1
        // Note: Video is already playing from setAvatarState(), we just manage timing

        const phase1Timer = setTimeout(() => {
            if (!this.isSpeaking) return;

            // PROBLEM 3: Force exact position to prevent drift
            const expectedPosition = F1;
            const actualPosition = video.currentTime;
            const drift = Math.abs(actualPosition - expectedPosition);

            console.log(`🔄 Phase 1 complete: expected=${expectedPosition.toFixed(3)}s, actual=${actualPosition.toFixed(3)}s, drift=${drift.toFixed(3)}s`);

            // Correct any drift
            video.currentTime = expectedPosition;
            video.pause();

            // Start oscillation cycle
            this.startReverseCycle();
        }, F1 * 1000);

        this.videoCycleTimers.push(phase1Timer);
    }

    startReverseCycle() {
        if (!this.isSpeaking || !this.avatarVideo) return;

        const video = this.avatarVideo;
        const R = this.speakingCycleConfig.reverseDuration;
        const F2 = this.speakingCycleConfig.forwardDuration;

        let isReverse = true;
        let cycleCount = 0;
        const positionHistory = [];  // Track positions for stability verification

        const cycle = () => {
            if (!this.isSpeaking) return;

            if (isReverse) {
                cycleCount++;

                // PROBLEM 4: Calculate target position
                // V_target = max(0, V_start - R)
                const V_start = video.currentTime;  // Should be ~3.0 after initial or forward
                const V_target = Math.max(0, V_start - R);

                console.log(`⏪ Cycle ${cycleCount}: Reverse ${R}s: ${V_start.toFixed(3)}s → ${V_target.toFixed(3)}s`);

                // PROBLEM 5: Reverse frame calculation setup
                const T_start = Date.now();
                video.pause();  // Ensure paused for manual control

                const reverseFrame = () => {
                    if (!this.isSpeaking) return;

                    // PROBLEM 5: Linear reverse calculation
                    // V(t) = V_start - elapsed
                    const elapsed = (Date.now() - T_start) / 1000;
                    const newTime = V_start - elapsed;

                    // PROBLEM 6: Three end conditions
                    const timeExpired = elapsed >= R;
                    const reachedTarget = newTime <= V_target;
                    const hitFloor = newTime <= 0;

                    if (timeExpired || reachedTarget || hitFloor) {
                        // PROBLEM 7: Force exact final position
                        video.currentTime = V_target;

                        const actualElapsed = elapsed.toFixed(3);
                        const drift = Math.abs(video.currentTime - V_target).toFixed(3);
                        console.log(`  ✅ Reverse done: elapsed=${actualElapsed}s, position=${video.currentTime.toFixed(3)}s, drift=${drift}s`);

                        // Track position for stability analysis
                        positionHistory.push({ cycle: cycleCount, phase: 'reverse_end', position: video.currentTime });

                        // Switch to forward
                        isReverse = false;
                        const timer = setTimeout(cycle, 0);
                        this.videoCycleTimers.push(timer);
                    } else {
                        // PROBLEM 5: Update position for this frame
                        video.currentTime = newTime;
                        this.videoCycleAnimationFrame = requestAnimationFrame(reverseFrame);
                    }
                };

                reverseFrame();

            } else {
                // PROBLEM 8, 9: Forward phase
                // V₃ = V₂ + F2
                const V_start = video.currentTime;  // Should be ~1.0
                const V_expected = V_start + F2;    // Should reach ~3.0

                console.log(`▶️  Cycle ${cycleCount}: Forward ${F2}s: ${V_start.toFixed(3)}s → ${V_expected.toFixed(3)}s`);

                // Play forward naturally
                video.play().catch(e => console.log('Video play failed:', e));

                const T_forward_start = Date.now();

                const timer = setTimeout(() => {
                    if (!this.isSpeaking) return;

                    // PROBLEM 9: Verify end position
                    const V_actual = video.currentTime;
                    const drift = Math.abs(V_actual - V_expected);
                    const timeElapsed = (Date.now() - T_forward_start) / 1000;

                    console.log(`  ✅ Forward done: elapsed=${timeElapsed.toFixed(3)}s, expected=${V_expected.toFixed(3)}s, actual=${V_actual.toFixed(3)}s, drift=${drift.toFixed(3)}s`);

                    // Pause and correct position
                    video.pause();
                    video.currentTime = V_expected;  // Force exact position

                    // Track position for stability analysis
                    positionHistory.push({ cycle: cycleCount, phase: 'forward_end', position: video.currentTime });

                    // PROBLEM 10: Stability verification (every 5 cycles)
                    if (cycleCount % 5 === 0) {
                        const recent = positionHistory.slice(-10);  // Last 10 positions
                        const avgPos = recent.reduce((sum, p) => sum + p.position, 0) / recent.length;
                        const maxDrift = Math.max(...recent.map(p => Math.abs(p.position - avgPos)));

                        console.log(`📊 Cycle ${cycleCount} Stability Check:`);
                        console.log(`   Average position: ${avgPos.toFixed(3)}s`);
                        console.log(`   Max drift from avg: ${maxDrift.toFixed(3)}s`);
                        console.log(`   Status: ${maxDrift < 0.1 ? '✅ Stable' : '⚠️ Drifting'}`);
                    }

                    // PROBLEM 10: Loop back to reverse
                    isReverse = true;
                    cycle();
                }, F2 * 1000);

                this.videoCycleTimers.push(timer);
            }
        };

        // Start the oscillation
        cycle();
    }

    stopVideoSpeakingCycle() {
        if (!this.isSpeaking) return;  // Already stopped

        this.isSpeaking = false;

        // Clear all timers
        const timerCount = this.videoCycleTimers.length;
        for (const timer of this.videoCycleTimers) {
            clearTimeout(timer);
        }
        this.videoCycleTimers = [];

        // Clear animation frame
        if (this.videoCycleAnimationFrame) {
            cancelAnimationFrame(this.videoCycleAnimationFrame);
            this.videoCycleAnimationFrame = null;
        }

        if (this.avatarVideo) {
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;
            console.log(`⏹️ Video cycle stopped (cleared ${timerCount} timers)`);
        }
    }

    setAvatarState(state) {
        if (!this.videoSources) return;

        // Get the target video element for this state
        const targetVideo = this.avatarVideos[state];
        if (!targetVideo) {
            console.error(`❌ Video element not found for state: ${state}`);
            return;
        }

        // Verify video source exists for this state (environment-aware)
        const videoUrl = this.getVideoUrl(state);
        if (!videoUrl) {
            console.error(`❌ Video source not found for state: ${state}`);
            return;
        }

        // CRITICAL FIX: Don't restart video if already in this state
        // This prevents audio chunks from repeatedly resetting the video to frame 0
        if (this.currentAvatarState === state && this.avatarVideo === targetVideo) {
            // Already in this state with this video, nothing to do
            return;
        }

        const previousState = this.currentAvatarState;
        this.currentAvatarState = state;

        console.log(`🎭 Avatar state: ${previousState} -> ${state}`);

        // Store reference to previous video for crossfade
        const previousVideo = this.avatarVideo;

        // Switch to the new video element
        this.avatarVideo = targetVideo;

        // Handle speaking state with video cycling
        if (state === 'speaking') {
            // Prepare video for cycle control
            this.avatarVideo.loop = false;
            this.avatarVideo.playbackRate = 1.0;

            // Reset to beginning (video should already be playing from pre-warm)
            // Use requestAnimationFrame to avoid blocking
            requestAnimationFrame(() => {
                this.avatarVideo.currentTime = 0;
            });

            // Video is already playing from pre-warm, just ensure it's not paused
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().then(() => {
                    console.log('⚡ Speaking video resumed from pre-warm state');
                    this.startVideoSpeakingCycle();
                }).catch(e => {
                    console.error('❌ Failed to play speaking video:', e);
                });
            } else {
                // Already playing! Just start the cycle
                console.log('⚡ Speaking video already warm, starting cycle');
                this.startVideoSpeakingCycle();
            }
        } else if (state === 'dancing') {
            // Handle dancing state - simple loop, no cycling
            this.stopVideoSpeakingCycle();

            // Ensure dancing video loops normally and is playing
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;

            // Start playing the dancing video
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().then(() => {
                    console.log('💃 Dancing video started');
                }).catch(e => {
                    console.error('❌ Failed to play dancing video:', e);
                });
            }
        } else {
            // Stop cycling when returning to idle or listening
            this.stopVideoSpeakingCycle();

            // Stop barge-in monitoring when returning to idle or listening
            if (state === 'idle' || state === 'listening') {
                if (this.audioRecorder) {
                    this.audioRecorder.stopBargeInMonitoring();
                }
            }

            // Ensure idle/listening videos loop normally and are playing
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;

            // Start playing BEFORE the crossfade to ensure smooth transition
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().catch(e => {
                    console.log('Video autoplay blocked, will play on user interaction');
                });
            }
        }

        // SMOOTH CROSSFADE: Add .active to new video FIRST, then remove from old
        // This creates a seamless transition with no flicker
        // The new video is already playing (started above), so the transition is butter-smooth

        // Start fading IN the new video
        this.avatarVideo.classList.add('active');

        // Then fade OUT the previous video (if different)
        if (previousVideo && previousVideo !== targetVideo) {
            // Use requestAnimationFrame to ensure the new video's transition starts first
            requestAnimationFrame(() => {
                previousVideo.classList.remove('active');
            });
        }
    }

    log(message, type = 'info') {
        // Batch DOM updates to reduce reflows
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        // Use DocumentFragment to batch updates
        if (this.logEl.children.length >= 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }

        this.logEl.appendChild(entry);
        // Only scroll if already at bottom (avoid forced reflows)
        if (this.logEl.scrollHeight - this.logEl.scrollTop <= this.logEl.clientHeight + 50) {
            this.logEl.scrollTop = this.logEl.scrollHeight;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.geminiClient = new GeminiLiveClient();

    // Load config and initialize avatar video
    try {
        const config = await window.geminiClient.loadConfig();

        // Set CSS variables from config
        if (config.video) {
            const root = document.documentElement;
            if (config.video.displayWidth) {
                root.style.setProperty('--video-width', `${config.video.displayWidth}px`);
                root.style.setProperty('--container-width', `${config.video.displayWidth + 80}px`);
            }
            if (config.video.displayHeight) {
                root.style.setProperty('--video-height', `${config.video.displayHeight}px`);
            }

            // Set video sources
            if (config.video.sources) {
                window.geminiClient.videoSources = config.video.sources;
                console.log('Video sources:', config.video.sources);

                // Load all videos into their respective elements
                const videos = window.geminiClient.avatarVideos;

                if (videos.idle && videos.listening && videos.speaking && videos.dancing) {
                    // Set sources for all video elements (environment-aware URLs)
                    videos.idle.src = window.geminiClient.getVideoUrl('idle');
                    videos.listening.src = window.geminiClient.getVideoUrl('listening');
                    videos.speaking.src = window.geminiClient.getVideoUrl('speaking');
                    videos.dancing.src = window.geminiClient.getVideoUrl('dancing');

                    console.log(`📹 Video URLs (${window.geminiClient.isLocalEnvironment() ? 'local' : 'cloud'}):`);
                    console.log(`   Idle: ${videos.idle.src}`);
                    console.log(`   Listening: ${videos.listening.src}`);
                    console.log(`   Speaking: ${videos.speaking.src}`);
                    console.log(`   Dancing: ${videos.dancing.src}`);

                    // Pre-load all videos for instant state switching (no loading delays!)
                    Object.values(videos).forEach(video => {
                        video.muted = true;
                        video.loop = true;
                        video.preload = 'auto';  // Force preloading
                        video.load();  // Start loading immediately
                    });

                    console.log('✅ All videos pre-loaded and ready');

                    // PRE-WARM VIDEO DECODERS: Play all videos silently in background
                    // This ensures decoders are initialized and ready for instant switching
                    // Critical for smooth audio/video coordination
                    Object.values(videos).forEach(video => {
                        video.play().catch(e => {
                            console.log('Video pre-warm play blocked (will work after user interaction)');
                        });
                    });

                    console.log('⚡ Video decoders pre-warmed for instant playback');

                    // Set initial idle state
                    window.geminiClient.setAvatarState('idle');
                } else {
                    console.error('❌ Video elements not found');
                }
            }
        }
    } catch (error) {
        console.error('Error loading initial config:', error);
    }
});
