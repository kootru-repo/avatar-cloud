/**
 * 100% SDK-Compliant Gemini Live Avatar Frontend
 * Communicates with SDK-compliant Python backend
 */

import { AudioRecorder } from './audio-recorder.js';
import { AudioPlayer } from './audio-player.js';

/**
 * Roll-Up Caption Manager (Original FCC Design)
 * 2-line roll-up display at 170 WPM, completely decoupled from Gemini updates
 */
class RollUpCaptionManager {
    constructor(config, ccOverlay) {
        this.line1El = document.getElementById('ccLine1');
        this.line2El = document.getElementById('ccLine2');
        this.ccOverlay = ccOverlay;

        // Configuration
        this.interimOpacity = config.interimOpacity || 0.85;
        this.finalOpacity = config.finalOpacity || 1.0;
        this.targetWPM = config.targetWPM || 170;
        this.wordDelayMs = config.wordDelayMs || Math.round(60000 / this.targetWPM);
        this.maxCharsPerLine = config.maxCharsPerLine || 37;

        // Buffered state (stores incoming text, displays independently)
        this.bufferedWords = [];  // Array of complete words ready to display
        this.lastProcessedText = '';  // Track last interim text to detect new words
        this.isFinalBuffered = false;

        // Display state (independent of Gemini updates)
        this.currentLines = ['', ''];  // [line1, line2]
        this.displayedWordCount = 0;  // Number of words already displayed
        this.displayTimeout = null;
        this.isDisplaying = false;
    }

    // Buffer incoming text (from Gemini) - does NOT display immediately
    addCaption(text, isFinal = false) {
        if (!text || text.trim().length === 0) return;

        // Extract only NEW complete words from this update
        const newWords = this.extractNewWords(text, this.lastProcessedText, isFinal);

        if (newWords.length > 0) {
            // Add new complete words to buffer
            this.bufferedWords.push(...newWords);

            // Start independent display routine if not already running
            if (!this.isDisplaying) {
                this.startDisplayRoutine();
            }
        }

        // Update tracking
        this.lastProcessedText = text;
        this.isFinalBuffered = isFinal;

        // Show overlay
        if (this.ccOverlay) {
            this.ccOverlay.classList.add('active');
        }
    }

    // Extract only new complete words by comparing current text with previous
    extractNewWords(currentText, previousText, isFinal) {
        const currentWords = currentText.trim().split(/\s+/).filter(w => w.length > 0);
        const previousWords = previousText.trim().split(/\s+/).filter(w => w.length > 0);

        // If current has more words than previous, the NEW words are complete
        // The last word might still be incomplete (being typed), so exclude it unless final
        if (currentWords.length <= previousWords.length) {
            return [];
        }

        // Get the new words (excluding the last one which might be incomplete)
        const numNewWords = currentWords.length - previousWords.length;
        const startIndex = previousWords.length;

        // Extract new complete words (all but possibly the last one)
        // We take words from startIndex to currentWords.length - 1 (exclude last)
        const newCompleteWords = [];
        for (let i = startIndex; i < currentWords.length - 1; i++) {
            newCompleteWords.push(currentWords[i]);
        }

        // If this is a final transcription, also include the last word
        if (isFinal && currentWords.length > 0) {
            newCompleteWords.push(currentWords[currentWords.length - 1]);
        }

        return newCompleteWords;
    }

    // Independent display routine (runs at 170 WPM regardless of Gemini updates)
    startDisplayRoutine() {
        this.isDisplaying = true;
        this.displayNextWord();
    }

    // Display next word at controlled pace
    displayNextWord() {
        // Clear any existing timeout
        if (this.displayTimeout) {
            clearTimeout(this.displayTimeout);
            this.displayTimeout = null;
        }

        // Check if we've displayed all buffered words
        if (this.displayedWordCount >= this.bufferedWords.length) {
            this.isDisplaying = false;
            return;
        }

        // Get next word from buffer
        const nextWord = this.bufferedWords[this.displayedWordCount];
        this.displayedWordCount++;

        // Try to add word to line 2 (bottom line)
        const testLine = this.currentLines[1] ? `${this.currentLines[1]} ${nextWord}` : nextWord;

        if (testLine.length <= this.maxCharsPerLine) {
            // Fits on current line
            this.currentLines[1] = testLine;
        } else {
            // Need to scroll: line 2 → line 1, start new line 2
            this.currentLines[0] = this.currentLines[1];
            this.currentLines[1] = nextWord;
        }

        // Update display
        if (this.line1El) this.line1El.textContent = this.currentLines[0];
        if (this.line2El) this.line2El.textContent = this.currentLines[1];

        // Set opacity based on whether we've reached final text
        const isDisplayingFinal = this.isFinalBuffered && (this.displayedWordCount >= this.bufferedWords.length);
        const opacity = isDisplayingFinal ? this.finalOpacity : this.interimOpacity;
        if (this.line1El) this.line1El.style.opacity = opacity;
        if (this.line2El) this.line2El.style.opacity = opacity;

        // Schedule next word at WPM rate
        this.displayTimeout = setTimeout(() => this.displayNextWord(), this.wordDelayMs);
    }

    clear() {
        // Clear timeout
        if (this.displayTimeout) {
            clearTimeout(this.displayTimeout);
            this.displayTimeout = null;
        }

        // Reset state
        this.bufferedWords = [];
        this.lastProcessedText = '';
        this.isFinalBuffered = false;
        this.currentLines = ['', ''];
        this.displayedWordCount = 0;
        this.isDisplaying = false;

        // Clear display
        if (this.line1El) this.line1El.textContent = '';
        if (this.line2El) this.line2El.textContent = '';
        if (this.ccOverlay) this.ccOverlay.classList.remove('active');
    }
}

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
        this.interruptCooldownMs = 2000;  // 2 second cooldown after barge-in
        this.audioBufferDuringCooldown = [];  // Buffer audio chunks during cooldown
        this.isInCooldown = false;  // Track if we're in post-interrupt cooldown

        // Speaking cycle configuration (loaded from frontend_config.json)
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

        // CC Toggle elements
        this.ccToggle = document.getElementById('ccToggle');
        this.ccLabelOff = document.getElementById('ccLabelOff');
        this.ccLabelOn = document.getElementById('ccLabelOn');
        this.isCCActive = false;  // CC starts OFF

        // CC Manager - initialized after config loads
        this.captionManager = null;

        // Download progress tracking
        this.downloadCountdownInterval = null;
        this.downloadEta = 0;

        // Pre-loaded video elements for instant state switching (no load delay)
        this.avatarVideos = {
            idle: document.getElementById('video-idle'),
            listening: document.getElementById('video-listening'),
            speaking: document.getElementById('video-speaking'),
            dancing: document.getElementById('video-dancing'),
            goodbye: document.getElementById('video-goodbye')
        };

        // Current active video reference
        this.avatarVideo = null;  // Will be set in initialization

        // Dance mode state
        this.isDancing = false;
        this.danceTimeout = null;
        this.danceAudio = null;
        this.danceModeConfig = null;

        // Goodbye mode state
        this.isSayingGoodbye = false;
        this.goodbyeTimeout = null;
        this.goodbyeModeConfig = null;
        this.goodbyeAudioDelay = false;  // Flag to delay audio by 0.5s
        this.goodbyeAudioDelayTimeout = null;

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
            // Clear captions when disabled
            if (this.captionManager) {
                this.captionManager.clear();
            }
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
            const response = await fetch('frontend_config.json');
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

            // Load closed captions configuration and initialize manager
            if (config.closedCaptions) {
                const cc = config.closedCaptions;

                // Set CSS variables
                document.documentElement.style.setProperty('--cc-font-size', `${cc.fontSize}px`);
                document.documentElement.style.setProperty('--cc-padding', `${cc.padding}px`);
                document.documentElement.style.setProperty('--cc-border-radius', `${cc.borderRadius}px`);

                // Initialize roll-up caption manager
                this.captionManager = new RollUpCaptionManager(cc, this.ccOverlay);
                console.log('✅ Roll-up caption manager initialized:', cc);
            }

            // Load dance mode configuration
            if (config.danceMode) {
                this.danceModeConfig = config.danceMode;
                console.log('✅ Dance mode configuration loaded:', this.danceModeConfig);
            }

            // Load goodbye mode configuration
            if (config.goodbyeMode) {
                this.goodbyeModeConfig = config.goodbyeMode;
                console.log('✅ Goodbye mode configuration loaded:', this.goodbyeModeConfig);
            }

            // Load sound effects configuration
            if (config.soundEffects) {
                this.soundEffectsConfig = config.soundEffects;
                console.log('✅ Sound effects configuration loaded:', this.soundEffectsConfig);
            }

            // Load interrupt cooldown configuration
            if (config.timing && config.timing.interruptCooldownMs !== undefined) {
                this.interruptCooldownMs = config.timing.interruptCooldownMs;
                console.log(`✅ Interrupt cooldown loaded: ${this.interruptCooldownMs}ms`);
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
                // COOLDOWN BUFFERING: If in cooldown, buffer audio instead of sending
                if (this.isInCooldown) {
                    this.audioBufferDuringCooldown.push(base64Audio);
                    // Silently accumulate - will be sent after cooldown
                    return;
                }

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

        // IMPROVED DEBOUNCING: If already in cooldown, extend it
        if (this.isInCooldown) {
            const timeSinceLastInterrupt = now - this.lastInterruptTime;
            console.log(`   🔄 Already in cooldown (${timeSinceLastInterrupt}ms since last) - extending ${this.interruptCooldownMs}ms`);

            this.lastInterruptTime = now;

            // Clear existing timeout and restart cooldown period
            if (this.interruptTimeout) {
                clearTimeout(this.interruptTimeout);
            }

            // Continue buffering audio, restart cooldown timer
            this.interruptTimeout = setTimeout(() => this.endCooldownPeriod(), this.interruptCooldownMs);
            return;
        }

        // Fresh interrupt - this is the first barge-in
        if (this.isInterrupted) {
            console.log('   ⚠️ Already interrupted, forcing cleanup before new cooldown');
            this.forceCleanupInterrupt();
        }

        console.log(`⚡ LOCAL BARGE-IN: Halting audio, starting ${this.interruptCooldownMs}ms cooldown`);
        this.lastInterruptTime = now;

        // 1. Set interrupted flag to block incoming audio from server
        this.isInterrupted = true;
        this.isInCooldown = true;

        // 2. Clear audio buffer (fresh start for new user input)
        this.audioBufferDuringCooldown = [];
        console.log('   📦 Audio buffer cleared, ready to accumulate during cooldown');

        // 3. Send interrupt signal to backend to stop sending audio
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'interrupt'
            }));
            console.log('   📤 Interrupt signal sent to backend');
        }

        // 4. Stop monitoring for more barge-ins during cooldown (prevents rapid re-triggers)
        if (this.audioRecorder) {
            this.audioRecorder.stopBargeInMonitoring();
            console.log('   🔇 Barge-in monitoring paused during cooldown');
        }

        // 5. Immediately stop ALL audio playback and clear pending flags
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        this.pendingTurnComplete = false;
        console.log('   🛑 Audio playback halted');

        // 6. Return to idle state visually
        this.setAvatarState('idle');

        // 7. Start cooldown period - user can speak, audio is buffered
        if (this.interruptTimeout) {
            clearTimeout(this.interruptTimeout);
        }
        console.log(`   ⏳ Cooldown started: buffering audio for ${this.interruptCooldownMs}ms`);
        this.interruptTimeout = setTimeout(() => this.endCooldownPeriod(), this.interruptCooldownMs);
    }

    endCooldownPeriod() {
        console.log(`✅ Cooldown complete (${this.interruptCooldownMs}ms elapsed)`);

        // Exit cooldown mode
        this.isInCooldown = false;
        this.isInterrupted = false;
        this.interruptTimeout = null;

        // Send accumulated audio buffer to backend as single turn
        const bufferSize = this.audioBufferDuringCooldown.length;
        if (bufferSize > 0) {
            console.log(`   📤 Sending ${bufferSize} buffered audio chunks to backend`);

            // Send all buffered chunks in order
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                for (const audioChunk of this.audioBufferDuringCooldown) {
                    this.ws.send(JSON.stringify({
                        type: 'audio',
                        data: audioChunk
                    }));
                }
                console.log(`   ✅ Buffer sent, Gemini will process as one turn`);
            }

            // Clear buffer
            this.audioBufferDuringCooldown = [];
        } else {
            console.log('   ℹ️ No audio buffered during cooldown');
        }

        // Return to listening state
        this.setAvatarState('listening');
        console.log('   🎧 Ready for new audio or responses');
    }

    clearInterruptState() {
        // Legacy function - now handled by endCooldownPeriod
        // Kept for compatibility with server-side interrupts
        console.log('   ✅ Clearing interrupt state (legacy path)');
        this.setAvatarState('listening');
        this.isInterrupted = false;
        this.isInCooldown = false;
        this.interruptTimeout = null;
        this.audioBufferDuringCooldown = [];
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
        this.isInCooldown = false;
        this.audioBufferDuringCooldown = [];
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

                // DELAY barge-in monitoring to allow text messages to arrive first
                // This prevents interrupting before dance triggers can be detected
                if (this.audioRecorder && !this.isInterrupted) {
                    console.log('⏰ Delaying barge-in monitoring for 2 seconds...');
                    setTimeout(() => {
                        if (this.audioRecorder && !this.isInterrupted && this.currentAvatarState === 'speaking') {
                            this.audioRecorder.startBargeInMonitoring();
                            console.log('✅ Barge-in monitoring started (after delay)');
                        }
                    }, 2000);  // 2 second delay
                }

                // Resume video if it was paused during sentence break
                if (this.avatarVideo && this.avatarVideo.paused) {
                    this.avatarVideo.play();
                    console.log('   📹 Talking video resumed');
                }

                // Defer audio playback to next tick to avoid blocking video
                // This ensures video element state changes complete before audio decode starts
                requestAnimationFrame(() => {
                    // Check if we need to delay audio for goodbye mode
                    if (this.goodbyeAudioDelay) {
                        // Delay audio by configured amount (from frontend_config.json) to give video a head start
                        const audioDelayMs = (this.goodbyeModeConfig && this.goodbyeModeConfig.audioDelayMs) || 750;
                        console.log(`⏱️ Delaying goodbye audio by ${audioDelayMs}ms`);
                        setTimeout(() => {
                            this.audioPlayer.play(message.data);
                        }, audioDelayMs);
                    } else {
                        // Normal immediate playback
                        this.audioPlayer.play(message.data);
                    }
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
                    // Text messages are not displayed (AUDIO-only model)
                    // Dance mode is now triggered via function calling (tool_call)
                    break;

                case 'transcription_interim':
                    // Don't show captions during dance mode
                    if (!this.isDancing) {
                        // Real-time transcription chunk (interim, shown immediately with lower opacity)
                        this.updateClosedCaptions(message.data, false);
                    }
                    break;

                case 'transcription':
                    // Dance mode is now triggered via Gemini function calling (server-side)
                    // Client-side keyword detection removed to prevent dual triggering

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
                    // If we're already handling a client-side interrupt with cooldown, skip this
                    if (this.isInCooldown) {
                        console.log('   Already in cooldown from client-side interrupt');
                        return;
                    }

                    // SERVER-SIDE BARGE-IN FLOW (uses legacy shorter timeout):
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

                    // 4. Schedule transition to listening after brief pause (server-side uses legacy 150ms)
                    if (this.interruptTimeout) {
                        clearTimeout(this.interruptTimeout);
                    }
                    this.interruptTimeout = setTimeout(() => this.clearInterruptState(), 150);
                    break;

                case 'tool_call':
                    // Fixed: Issue #12, #35 - log tool call ID for tracking
                    const toolId = message.data.id || 'no-id';
                    const toolName = message.data.name;
                    console.log(`🔧 Tool call received: ${toolName} (id: ${toolId})`, message.data);
                    this.log(`🔧 Tool call: ${toolName}`, 'info');

                    // Handle dance mode tool call
                    if (toolName === 'trigger_dance_mode') {
                        console.log(`🎯 Dance mode tool called by Gemini! (id: ${toolId})`);
                        this.triggerDanceMode();
                    }
                    // Handle goodbye mode tool call
                    else if (toolName === 'trigger_goodbye_mode') {
                        console.log(`🎯 Goodbye mode tool called by Gemini! (id: ${toolId})`);
                        this.triggerGoodbyeMode();
                    }
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

        // Stop goodbye mode if active
        if (this.isSayingGoodbye) {
            this.stopGoodbyeMode(false);
        }

        // Clear goodbye audio delay timeout if active
        if (this.goodbyeAudioDelayTimeout) {
            clearTimeout(this.goodbyeAudioDelayTimeout);
            this.goodbyeAudioDelayTimeout = null;
        }
        this.goodbyeAudioDelay = false;

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
        this.isInCooldown = false;  // Clear cooldown state
        this.audioBufferDuringCooldown = [];  // Clear audio buffer
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
        // Don't show captions if CC toggle is off
        if (!this.isCCActive) return;

        // Don't show captions during dance mode
        if (this.isDancing) return;

        // Use roll-up caption manager
        if (this.captionManager) {
            this.captionManager.addCaption(text, isFinal);
        }
    }

    clearClosedCaptions() {
        if (this.captionManager) {
            this.captionManager.clear();
        }
    }

    // Client-side dance detection removed - now using Gemini function calling (server-side)
    // This prevents dual triggering and allows Gemini to control when dance mode activates

    triggerDanceMode() {
        console.log('🎯 triggerDanceMode() called');
        console.log('   danceModeConfig:', this.danceModeConfig);
        console.log('   preloadedDanceMusic:', this.preloadedDanceMusic);
        console.log('   isDancing:', this.isDancing);

        if (!this.danceModeConfig) {
            const errorMsg = '❌ Dance mode config is null/undefined';
            console.error(errorMsg);
            this.log(errorMsg, 'error');  // Fixed: Issue #27 - show errors to user
            return;
        }

        if (!this.danceModeConfig.enabled) {
            const errorMsg = '❌ Dance mode is disabled in config';
            console.error(errorMsg);
            this.log(errorMsg, 'error');  // Fixed: Issue #27 - show errors to user
            return;
        }

        // Fixed: Issue #67 - validate dance duration (max 60 seconds)
        const MAX_DANCE_DURATION = 60000;  // 60 seconds
        if (!this.danceModeConfig.duration || this.danceModeConfig.duration <= 0) {
            const errorMsg = '❌ Invalid dance duration in config';
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }
        if (this.danceModeConfig.duration > MAX_DANCE_DURATION) {
            const errorMsg = `❌ Dance duration too long (max ${MAX_DANCE_DURATION}ms)`;
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }

        if (this.isDancing) {
            console.log('⚠️ Already dancing!');
            return;
        }

        // User feedback: dance mode activated
        // Fixed: Issue #46 - explicit confirmation to user
        this.log('💃 Dance mode activated!', 'info');

        console.log('💃 Triggering dance mode!');
        console.log('   Config enabled:', this.danceModeConfig.enabled);
        console.log('   Music file:', this.danceModeConfig.musicFile);
        console.log('   Duration:', this.danceModeConfig.duration);
        this.isDancing = true;

        // DON'T stop audio playback - let Gemini speak enthusiastically during dance!
        // The dance music will play alongside Gemini's audio response
        // Fixed: Issue #16 - previously stopped audioPlayer, silencing Gemini

        // Keep recording active - allow user to interrupt dance mode
        // Fixed: Issue #17 - previously stopped barge-in monitoring
        // Fixed: Issue #63 - track recording state for proper restoration after dance
        const wasRecording = this.isRecording;

        // Switch to dancing video
        console.log('🎥 Switching to dancing video...');
        this.setAvatarState('dancing');
        console.log('✅ setAvatarState("dancing") completed');

        // Get environment-aware music URL
        let musicPath = this.danceModeConfig.musicFile;
        if (typeof musicPath === 'object') {
            // New format: object with local/cloud URLs
            const isLocal = this.isLocalEnvironment();
            musicPath = isLocal ? musicPath.local : musicPath.cloud;
        }

        console.log(`🎵 Loading dance music from: ${musicPath}`);

        // Use preloaded music if available, otherwise create new Audio
        console.log('🔍 Checking preloaded music...');
        console.log('   preloadedDanceMusic exists:', !!this.preloadedDanceMusic);
        console.log('   preloadedDanceMusic.src:', this.preloadedDanceMusic?.src);
        console.log('   target musicPath:', musicPath);

        // Fixed: Issue #20 - use endsWith for more precise URL matching
        // Also fixed: Issue #28 - set crossOrigin on preloaded audio if needed
        const usePreloaded = this.preloadedDanceMusic &&
                            (this.preloadedDanceMusic.src.endsWith(musicPath) ||
                             this.preloadedDanceMusic.src === musicPath);

        if (usePreloaded) {
            console.log('🎵 Using preloaded dance music');
            this.danceAudio = this.preloadedDanceMusic;
            this.danceAudio.currentTime = 0;  // Reset to beginning
            if (!this.danceAudio.crossOrigin) {
                this.danceAudio.crossOrigin = "anonymous";
            }
        } else {
            console.log('🎵 Loading dance music on demand');
            this.danceAudio = new Audio(musicPath);
            this.danceAudio.crossOrigin = "anonymous";
            this.danceAudio.preload = "auto";
        }

        console.log('🎵 Dance audio element created:', this.danceAudio);
        // Fixed: Issue #57 - use configurable volume instead of hardcoded value
        // Fixed: Issue #29 - previously hardcoded to 1.0 (too loud)
        // Fixed: Issue #14 - allows Gemini audio and dance music to coexist
        const volume = this.danceModeConfig.volume || 0.3;  // Default to 0.3 if not configured
        this.danceAudio.volume = Math.max(0, Math.min(1, volume));  // Clamp to 0-1
        console.log('🔊 Volume set to:', this.danceAudio.volume);

        // Add event listeners for debugging
        this.danceAudio.addEventListener('canplay', () => {
            console.log('✅ Dance music ready to play');
        });

        this.danceAudio.addEventListener('playing', () => {
            console.log('🎵 Dance music is now playing');
        });

        this.danceAudio.addEventListener('error', (e) => {
            const errorMsg = `❌ Dance music failed to load: ${this.danceAudio.error?.message || 'Unknown error'}`;
            console.error(errorMsg, e);
            console.error('   Error details:', this.danceAudio.error);
            // Fixed: Issue #30 - recover from music load failure
            this.log(errorMsg, 'error');
            this.stopDanceMode(false);  // Exit dance mode on error
        });

        this.danceAudio.addEventListener('loadeddata', () => {
            console.log('📦 Dance music loaded, attempting playback...');
        });

        // CRITICAL: Load the audio first, then play
        console.log('📦 Loading dance audio...');
        this.danceAudio.load();
        console.log('✅ Audio load() called');

        // Start playback with detailed error handling
        console.log('▶️ Attempting to play dance music...');
        const playPromise = this.danceAudio.play();
        console.log('🎯 play() promise returned:', playPromise);

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`✅ Dance music playback started successfully: ${musicPath}`);
                console.log('   Audio state - paused:', this.danceAudio.paused, 'currentTime:', this.danceAudio.currentTime);
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

        // CRITICAL: Reset dance video to frame 0 and pause it
        // This ensures the next dance always starts from the beginning
        const danceVideo = this.avatarVideos['dancing'];
        if (danceVideo) {
            danceVideo.pause();
            danceVideo.currentTime = 0;
            console.log('💃 Dance video reset to frame 0 and paused');
        }

        // Resume recording if it was active
        // Fixed: Issue #64 - actually resume barge-in monitoring
        if (resumeRecording && this.audioRecorder) {
            console.log('🎤 Resuming recording after dance');
            this.audioRecorder.startBargeInMonitoring();
        }

        console.log('✅ Dance mode complete');
    }

    triggerGoodbyeMode() {
        console.log('🎯 triggerGoodbyeMode() called');
        console.log('   goodbyeModeConfig:', this.goodbyeModeConfig);
        console.log('   isSayingGoodbye:', this.isSayingGoodbye);

        if (!this.goodbyeModeConfig) {
            const errorMsg = '❌ Goodbye mode config is null/undefined';
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }

        if (!this.goodbyeModeConfig.enabled) {
            const errorMsg = '❌ Goodbye mode is disabled in config';
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }

        // Validate goodbye duration (max 60 seconds)
        const MAX_GOODBYE_DURATION = 60000;  // 60 seconds
        if (!this.goodbyeModeConfig.duration || this.goodbyeModeConfig.duration <= 0) {
            const errorMsg = '❌ Invalid goodbye duration in config';
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }
        if (this.goodbyeModeConfig.duration > MAX_GOODBYE_DURATION) {
            const errorMsg = `❌ Goodbye duration too long (max ${MAX_GOODBYE_DURATION}ms)`;
            console.error(errorMsg);
            this.log(errorMsg, 'error');
            return;
        }

        if (this.isSayingGoodbye) {
            console.log('⚠️ Already in goodbye mode!');
            return;
        }

        // User feedback: goodbye mode activated
        this.log('👋 See you later!', 'info');

        console.log('👋 Triggering goodbye mode!');
        console.log('   Config enabled:', this.goodbyeModeConfig.enabled);
        console.log('   Duration:', this.goodbyeModeConfig.duration);
        this.isSayingGoodbye = true;

        // Set audio delay flag - audio will be delayed while video plays immediately
        // Delay duration comes from config (default 750ms)
        const audioDelayMs = this.goodbyeModeConfig.audioDelayMs || 750;
        this.goodbyeAudioDelay = true;
        console.log(`⏱️ Goodbye audio delay enabled (${audioDelayMs}ms)`);

        // Clear the delay flag after configured duration
        this.goodbyeAudioDelayTimeout = setTimeout(() => {
            this.goodbyeAudioDelay = false;
            console.log('✅ Goodbye audio delay cleared');
        }, audioDelayMs);

        // DON'T stop audio playback - let Gemini say "See you later!" during goodbye animation
        // Track recording state for proper restoration after goodbye
        const wasRecording = this.isRecording;

        // Switch to goodbye video
        console.log('🎥 Switching to goodbye video...');
        this.setAvatarState('goodbye');
        console.log('✅ setAvatarState("goodbye") completed');

        console.log(`👋 Goodbye mode active for ${this.goodbyeModeConfig.duration}ms`);

        // Return to idle after duration
        this.goodbyeTimeout = setTimeout(() => {
            this.stopGoodbyeMode(wasRecording);
        }, this.goodbyeModeConfig.duration);
    }

    stopGoodbyeMode(resumeRecording = true) {
        if (!this.isSayingGoodbye) return;

        console.log('🛑 Stopping goodbye mode');
        this.isSayingGoodbye = false;

        // Clear timeouts
        if (this.goodbyeTimeout) {
            clearTimeout(this.goodbyeTimeout);
            this.goodbyeTimeout = null;
        }
        if (this.goodbyeAudioDelayTimeout) {
            clearTimeout(this.goodbyeAudioDelayTimeout);
            this.goodbyeAudioDelayTimeout = null;
        }

        // Clear audio delay flag
        this.goodbyeAudioDelay = false;

        // Return to idle state
        this.setAvatarState('idle');

        // Resume recording if it was active
        if (resumeRecording && this.audioRecorder) {
            console.log('🎤 Resuming recording after goodbye');
            this.audioRecorder.startBargeInMonitoring();
        }

        console.log('✅ Goodbye mode complete');
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

            // CRITICAL: Reset to frame 0 for consistent start
            this.avatarVideo.currentTime = 0;

            // Start playing the dancing video
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().then(() => {
                    console.log('💃 Dancing video started from frame 0');
                }).catch(e => {
                    console.error('❌ Failed to play dancing video:', e);
                });
            }
        } else if (state === 'goodbye') {
            // Handle goodbye state - simple loop, no cycling
            this.stopVideoSpeakingCycle();

            // Ensure goodbye video loops normally and is playing
            this.avatarVideo.loop = true;
            this.avatarVideo.playbackRate = 1.0;

            // Reset to start for consistent playback
            this.avatarVideo.currentTime = 0;

            // Start playing the goodbye video IMMEDIATELY
            if (this.avatarVideo.paused) {
                this.avatarVideo.play().then(() => {
                    console.log('👋 Goodbye video started');
                }).catch(e => {
                    console.error('❌ Failed to play goodbye video:', e);
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

                if (videos.idle && videos.listening && videos.speaking && videos.dancing && videos.goodbye) {
                    // Set sources for all video elements (environment-aware URLs)
                    videos.idle.src = window.geminiClient.getVideoUrl('idle');
                    videos.listening.src = window.geminiClient.getVideoUrl('listening');
                    videos.speaking.src = window.geminiClient.getVideoUrl('speaking');
                    videos.dancing.src = window.geminiClient.getVideoUrl('dancing');
                    videos.goodbye.src = window.geminiClient.getVideoUrl('goodbye');

                    console.log(`📹 Video URLs (${window.geminiClient.isLocalEnvironment() ? 'local' : 'cloud'}):`);
                    console.log(`   Idle: ${videos.idle.src}`);
                    console.log(`   Listening: ${videos.listening.src}`);
                    console.log(`   Speaking: ${videos.speaking.src}`);
                    console.log(`   Dancing: ${videos.dancing.src}`);
                    console.log(`   Goodbye: ${videos.goodbye.src}`);

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
