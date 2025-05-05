// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore, persistentLocalCache, FirestoreSettings, CACHE_SIZE_UNLIMITED } from 'firebase/firestore'; // Import Firestore persistence functions

// Log environment variables being read (for debugging)
console.log("Reading Firebase config from environment variables:");
console.log("NEXT_PUBLIC_FIREBASE_API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_APP_ID:", process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? 'Exists' : 'MISSING');
console.log("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:", process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? 'Exists' : 'Optional, MISSING'); // Optional

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Log the config object that will be used (mask API key partially for security)
console.log("Firebase config object to be used for initialization:", {
    ...firebaseConfig,
    apiKey: firebaseConfig.apiKey ? `******${firebaseConfig.apiKey.slice(-4)}` : 'MISSING'
});


type FirebaseConfigKeys = keyof typeof firebaseConfig;

// --- List of required Firebase environment variables ---
const REQUIRED_FIREBASE_CONFIG_KEYS: FirebaseConfigKeys[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  // 'measurementId' is optional, so not included here
];

// --- Enhanced Validation ---
const missingConfigKeys = REQUIRED_FIREBASE_CONFIG_KEYS.filter(key => {
    const value = firebaseConfig[key];
    // Return true (missing) if value is undefined, null, or an empty string
    return value === undefined || value === null || String(value).trim() === '';
});

if (missingConfigKeys.length > 0) {
  const envVarNames = missingConfigKeys.map(key => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
  const errorMessage = `Firebase configuration is incomplete. Missing or empty environment variables: ${envVarNames.join(', ')}. Please ensure all required NEXT_PUBLIC_FIREBASE_* environment variables are set correctly in your .env file or deployment environment.`;
  console.error('-------------------------------------------------------');
  console.error('!!! FIREBASE CONFIGURATION ERROR !!!');
  console.error(errorMessage);
  console.error('See https://console.firebase.google.com/ -> Project settings');
  console.error('-------------------------------------------------------');

  // Decide how to handle missing config: Throw error or allow partial init (not recommended for production)
  if (process.env.NODE_ENV === 'production') {
      // In production, throw an error to prevent deployment with invalid config
      throw new Error(errorMessage);
  } else {
      // In development, log a warning but attempt initialization (Firebase SDK might throw its own specific errors)
      console.warn('!!! Attempting to initialize Firebase with incomplete configuration (Development Mode) !!!');
  }
}


// --- Initialize Firebase ---
let app: FirebaseApp | null = null; // Initialize as null
// Check if Firebase configuration seems minimally viable before initializing
// We check this even in development after the warning
const isConfigPotentiallyViable = missingConfigKeys.length === 0;

try {
    if (!getApps().length) {
        if (isConfigPotentiallyViable) {
            app = initializeApp(firebaseConfig);
            console.log("Firebase initialized successfully.");
        } else {
            console.error("!!! Firebase initialization skipped due to incomplete configuration. !!!");
        }
    } else {
        app = getApp();
        console.log("Firebase app already initialized.");
    }
} catch (error) {
    console.error("!!! Error initializing Firebase App:", error);
    // Set app to null explicitly on error
    app = null;
}


// --- Initialize Auth and Firestore ---
let auth: Auth | null = null; // Initialize as null
let db: Firestore | null = null; // Initialize as null

if (app) { // Only proceed if app was successfully initialized or retrieved.
    try {
        auth = getAuth(app);
        console.log("Firebase Auth service obtained.");
    } catch (error) {
        console.error("!!! Error getting Firebase Auth instance:", error);
        auth = null; // Ensure auth is null if getting it fails
    }

    try {
        // Initialize Firestore with persistent cache settings
        const settings: FirestoreSettings = {
            localCache: persistentLocalCache({ cacheSizeBytes: CACHE_SIZE_UNLIMITED }), // Enable persistent cache
            // You might want to adjust cacheSizeBytes later if needed, but UNLIMITED is a good start
        };
        db = initializeFirestore(app, settings);
        console.log("Firestore with persistence enabled.");
    } catch (error) {
        console.error("!!! Error initializing Firestore with persistence:", error);
        // Attempt fallback to default Firestore initialization if persistence fails
        try {
            console.warn("Attempting to initialize Firestore without persistence...");
            db = getFirestore(app);
            console.log("Firestore initialized without persistence (fallback).");
        } catch (fallbackError) {
            console.error("!!! Failed to initialize Firestore even without persistence:", fallbackError);
            db = null; // Ensure db is null if all initialization fails
        }
    }
} else {
    console.error("!!! Cannot get Auth/Firestore because Firebase App is not initialized. !!!");
}


// Export potentially null app, auth and db, requiring checks where used.
export { app, auth, db };
