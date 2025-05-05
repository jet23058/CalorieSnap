// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If you use Analytics

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


type FirebaseConfigKeys = keyof Omit<typeof firebaseConfig, 'measurementId'>; // Exclude optional measurementId

// --- List of required Firebase environment variables (excluding optional measurementId) ---
const REQUIRED_FIREBASE_CONFIG_KEYS: FirebaseConfigKeys[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
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
let app: FirebaseApp;
// Check if Firebase configuration seems minimally viable before initializing
// We check this even in development after the warning
const isConfigPotentiallyViable = missingConfigKeys.length === 0;

if (!getApps().length) {
  if (isConfigPotentiallyViable) {
      try {
          app = initializeApp(firebaseConfig);
          console.log("Firebase initialized successfully."); // Add success log
          // Initialize Analytics if needed
          // if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
          //   getAnalytics(app);
          // }
      } catch (error) {
           console.error("!!! Error initializing Firebase App:", error);
           // Re-throw or handle error based on application needs
           throw error; // Re-throwing to make sure the failure is obvious
      }
  } else {
      console.error("!!! Firebase initialization skipped due to incomplete configuration. !!!");
      // Set app to a non-functional state or handle appropriately
      // Depending on the app structure, this might require adjustments elsewhere
      // to prevent errors when `auth` or `db` are accessed.
      // For now, we let the subsequent auth/db initialization fail clearly.
  }
} else {
  app = getApp();
  console.log("Firebase app already initialized."); // Add log for existing app
}

// --- Initialize Auth and Firestore ---
// These will only be attempted if `app` was successfully initialized or retrieved.
let auth: Auth | null = null; // Initialize as null
let db: Firestore | null = null; // Initialize as null

if (app) { // Only proceed if app exists
    try {
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("Firebase Auth and Firestore services obtained.");
    } catch (error) {
        console.error("!!! Error getting Firebase Auth or Firestore instance:", error);
        // Handle the error appropriately, e.g., by keeping auth/db as null
        // The application needs to handle cases where auth or db might be null.
        // Throwing here might be too disruptive if the app could partially function.
        // For now, we log the error, auth/db remain null.
    }
} else {
    console.error("!!! Cannot get Auth/Firestore because Firebase App is not initialized. !!!");
}


// Export potentially null auth and db, requiring checks where used.
export { app, auth, db };