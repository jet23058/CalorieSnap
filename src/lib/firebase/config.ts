// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If you use Analytics

// --- List of required Firebase environment variables (excluding optional measurementId) ---
const REQUIRED_FIREBASE_CONFIG_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// --- Enhanced Validation ---
const missingConfigKeys = REQUIRED_FIREBASE_CONFIG_KEYS.filter(key => {
    const value = process.env[key];
    // Return true (missing) if value is undefined, null, or an empty string
    return value === undefined || value === null || value.trim() === '';
});

if (missingConfigKeys.length > 0) {
  const errorMessage = `Firebase configuration is incomplete. Missing keys: ${missingConfigKeys.join(', ')}. Please ensure all required NEXT_PUBLIC_FIREBASE_* environment variables are set in your .env file or deployment environment.`;
  console.error('-------------------------------------------------------');
  console.error('!!! FIREBASE CONFIGURATION ERROR !!!');
  console.error(errorMessage);
  console.error('See https://console.firebase.google.com/ -> Project settings');
  console.error('-------------------------------------------------------');

  // Decide how to handle missing config: Throw error or allow partial init (not recommended for production)
  if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMessage); // Strict in production
  } else {
      console.warn('!!! Attempting to initialize Firebase with incomplete configuration (Development Mode) !!!');
      // Allow potential initialization in dev mode, Firebase might throw specific errors later.
  }
}


// --- Initialize Firebase ---
let app: FirebaseApp;
if (!getApps().length) {
  // Only initialize if config seems valid (or partially valid in dev mode)
  // In production, this block won't be reached if keys are missing due to the throw above.
  try {
      app = initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully."); // Add success log
      // Initialize Analytics if needed
      // if (typeof window !== 'undefined') {
      //   getAnalytics(app);
      // }
  } catch (error) {
       console.error("!!! Error initializing Firebase App:", error);
       // Re-throw or handle error based on application needs
       throw error; // Re-throwing to make sure the failure is obvious
  }
} else {
  app = getApp();
  console.log("Firebase app already initialized."); // Add log for existing app
}

// --- Initialize Auth and Firestore ---
// These will only be attempted if `app` was successfully initialized or retrieved.
let auth: Auth;
let db: Firestore;

try {
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("!!! Error getting Firebase Auth or Firestore instance:", error);
    // Handle the error appropriately, e.g., by setting auth/db to null or throwing
    // Depending on how critical these are, you might want to throw.
    // If the app can function partially without auth/db, you might set them to null/undefined.
    // For this app, auth and db are likely critical, so re-throwing.
    throw new Error(`Failed to initialize Firebase services: ${error}`);
}


export { app, auth, db };
