/**
 * Firebase Authentication Module for Kootru LLC
 * Professional authentication with email/password and Google OAuth
 * Handles user authentication for cloud deployment
 * In local dev (firebase.enabled=false), auth is bypassed
 */

class FirebaseAuthManager {
    constructor() {
        this.user = null;
        this.idToken = null;
        this.config = null;
        this.auth = null;
        this.googleProvider = null;
        this.enabled = false;
        this.onAuthStateChangedCallback = null;
        this.initialized = false;
        this.authReady = null;
        this.authReadyResolve = null;
    }

    /**
     * Initialize Firebase Auth from config
     * @param {Object} config - Firebase configuration from frontend_config.json
     */
    async initialize(config) {
        // Create a promise that resolves when auth state is determined
        this.authReady = new Promise(resolve => {
            this.authReadyResolve = resolve;
        });

        this.config = config.firebase;
        this.enabled = config.firebase?.enabled === true;

        if (!this.enabled) {
            console.log('🔓 Firebase Auth disabled (local development mode)');
            this.initialized = true;
            this.authReadyResolve(true);
            return;
        }

        if (!this.config || !this.config.apiKey) {
            console.error('❌ Firebase configuration missing in frontend_config.json');
            throw new Error('Firebase configuration required');
        }

        try {
            // Check if Firebase SDK is loaded
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded. Check network connection.');
            }

            // Initialize Firebase (check if already initialized)
            if (!firebase.apps.length) {
                const firebaseConfig = {
                    apiKey: this.config.apiKey,
                    authDomain: this.config.authDomain,
                    projectId: this.config.projectId,
                    appId: this.config.appId
                };
                console.log('🔧 Initializing Firebase with project:', this.config.projectId);
                firebase.initializeApp(firebaseConfig);
            }

            this.auth = firebase.auth();
            this.googleProvider = new firebase.auth.GoogleAuthProvider();

            // Configure persistence (remember me by default)
            await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

            // Set up auth state observer with timeout fallback
            const authTimeout = setTimeout(() => {
                console.warn('⚠️ Auth state check timed out after 10s');
                if (!this.initialized) {
                    this.initialized = true;
                    this.authReadyResolve(false);
                    if (this.onAuthStateChangedCallback) {
                        this.onAuthStateChangedCallback(null);
                    }
                }
            }, 10000);

            this.auth.onAuthStateChanged(async (user) => {
                clearTimeout(authTimeout);
                this.user = user;

                if (user) {
                    console.log(`✅ User authenticated: ${user.email}`);
                    this.idToken = await user.getIdToken();
                } else {
                    console.log('🔓 No user signed in');
                    this.idToken = null;
                }

                // Resolve the auth ready promise
                if (!this.initialized) {
                    this.initialized = true;
                    this.authReadyResolve(!!user);
                }

                if (this.onAuthStateChangedCallback) {
                    this.onAuthStateChangedCallback(user);
                }
            });

            console.log('✅ Firebase Auth initialized');

        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            this.initialized = true;
            this.authReadyResolve(false);
            // Call the callback to show login screen with error
            if (this.onAuthStateChangedCallback) {
                this.onAuthStateChangedCallback(null);
            }
            throw error;
        }
    }

    /**
     * Wait for auth state to be determined
     * @returns {Promise<boolean>} - true if user is authenticated
     */
    async waitForAuthReady() {
        return this.authReady;
    }

    /**
     * Sign in with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {boolean} rememberMe - Persist session
     */
    async signInWithEmail(email, password, rememberMe = true) {
        if (!this.enabled) {
            console.log('Auth disabled, skipping sign-in');
            return { email: 'dev@localhost', displayName: 'Local Dev User' };
        }

        try {
            // Set persistence based on remember me
            const persistence = rememberMe
                ? firebase.auth.Auth.Persistence.LOCAL
                : firebase.auth.Auth.Persistence.SESSION;
            await this.auth.setPersistence(persistence);

            const result = await this.auth.signInWithEmailAndPassword(email, password);
            this.user = result.user;
            this.idToken = await result.user.getIdToken();
            console.log(`✅ Signed in as: ${this.user.email}`);
            return this.user;
        } catch (error) {
            console.error('❌ Email sign-in failed:', error.code);
            throw this.formatAuthError(error);
        }
    }

    /**
     * Sign up with email and password (create new account)
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {string} displayName - Optional display name
     * @param {boolean} rememberMe - Persist session
     */
    async signUpWithEmail(email, password, displayName = null, rememberMe = true) {
        if (!this.enabled) {
            console.log('Auth disabled, skipping sign-up');
            return { email: 'dev@localhost', displayName: 'Local Dev User' };
        }

        try {
            // Set persistence based on remember me
            const persistence = rememberMe
                ? firebase.auth.Auth.Persistence.LOCAL
                : firebase.auth.Auth.Persistence.SESSION;
            await this.auth.setPersistence(persistence);

            const result = await this.auth.createUserWithEmailAndPassword(email, password);
            this.user = result.user;

            // Update display name if provided
            if (displayName && this.user) {
                await this.user.updateProfile({ displayName });
            }

            this.idToken = await result.user.getIdToken();
            console.log(`✅ Account created: ${this.user.email}`);
            return this.user;
        } catch (error) {
            console.error('❌ Sign-up failed:', error.code);
            throw this.formatAuthError(error);
        }
    }

    /**
     * Sign in with Google OAuth
     */
    async signInWithGoogle() {
        if (!this.enabled) {
            console.log('Auth disabled, skipping sign-in');
            return { email: 'dev@localhost', displayName: 'Local Dev User' };
        }

        try {
            const result = await this.auth.signInWithPopup(this.googleProvider);
            this.user = result.user;
            this.idToken = await result.user.getIdToken();
            console.log(`✅ Signed in with Google as: ${this.user.email}`);
            return this.user;
        } catch (error) {
            console.error('❌ Google sign-in failed:', error.code);
            throw this.formatAuthError(error);
        }
    }

    /**
     * Send password reset email
     * @param {string} email - User email
     */
    async sendPasswordReset(email) {
        if (!this.enabled) {
            console.log('Auth disabled, skipping password reset');
            return;
        }

        try {
            await this.auth.sendPasswordResetEmail(email);
            console.log(`✅ Password reset email sent to: ${email}`);
        } catch (error) {
            console.error('❌ Password reset failed:', error.code);
            throw this.formatAuthError(error);
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        if (!this.enabled) {
            if (this.onAuthStateChangedCallback) {
                this.onAuthStateChangedCallback(null);
            }
            return;
        }

        try {
            await this.auth.signOut();
            this.user = null;
            this.idToken = null;
            console.log('✅ Signed out successfully');
        } catch (error) {
            console.error('❌ Sign-out failed:', error);
            throw error;
        }
    }

    /**
     * Get current Firebase ID token
     * @param {boolean} forceRefresh - Force token refresh
     * @returns {Promise<string|null>} ID token or null if not authenticated
     */
    async getIdToken(forceRefresh = false) {
        if (!this.enabled) {
            return null;
        }

        if (!this.user) {
            return null;
        }

        try {
            this.idToken = await this.user.getIdToken(forceRefresh);
            return this.idToken;
        } catch (error) {
            console.error('❌ Failed to get ID token:', error);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        if (!this.enabled) {
            return true;
        }
        return this.user !== null;
    }

    /**
     * Check if auth is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Get current user info
     * @returns {Object|null}
     */
    getCurrentUser() {
        if (!this.enabled) {
            return {
                email: 'dev@localhost',
                displayName: 'Local Dev User',
                uid: 'local-dev-uid'
            };
        }

        if (!this.user) {
            return null;
        }

        return {
            email: this.user.email,
            displayName: this.user.displayName || this.user.email.split('@')[0],
            photoURL: this.user.photoURL,
            uid: this.user.uid
        };
    }

    /**
     * Set callback for auth state changes
     * @param {Function} callback - Function to call on auth state change
     */
    onAuthStateChanged(callback) {
        this.onAuthStateChangedCallback = callback;
    }

    /**
     * Format Firebase auth errors into user-friendly messages
     * @param {Error} error - Firebase auth error
     * @returns {Error} - Formatted error
     */
    formatAuthError(error) {
        const errorMessages = {
            // Sign-in errors
            'auth/user-not-found': 'No account found with this email address.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/user-disabled': 'This account has been disabled. Contact support.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Please check your connection.',
            'auth/popup-closed-by-user': 'Sign-in was cancelled.',
            'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups for this site.',
            'auth/invalid-credential': 'Invalid credentials. Please check and try again.',
            'auth/invalid-login-credentials': 'Invalid email or password. Please try again.',
            // Sign-up errors
            'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
            'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
            'auth/operation-not-allowed': 'Email/password accounts are not enabled. Contact support.'
        };

        const message = errorMessages[error.code] || 'An error occurred. Please try again.';
        const formattedError = new Error(message);
        formattedError.code = error.code;
        return formattedError;
    }
}

// Create global instance
window.authManager = new FirebaseAuthManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseAuthManager;
}
