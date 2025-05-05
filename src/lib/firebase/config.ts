// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
// import { getAnalytics } from "firebase/analytics"; // Optional: If you use Analytics

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Validate that Firebase config values are present
const missingConfigKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value && key !== 'measurementId') // measurementId is optional
  .map(([key]) => key);

if (missingConfigKeys.length > 0) {
  console.error('Firebase configuration is missing:', missingConfigKeys.join(', '));
  console.error('Please ensure all NEXT_PUBLIC_FIREBASE_* environment variables are set in your .env file or deployment environment.');
  // Optionally throw an error or handle this case appropriately
  // throw new Error(`Missing Firebase configuration: ${missingConfigKeys.join(', ')}`);
}


// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  // Only initialize if config seems valid (or partially valid, letting Firebase handle specific errors)
  if (missingConfigKeys.length === 0 || process.env.NODE_ENV !== 'production') { // Allow initialization in dev even if partially missing
    try {
        app = initializeApp(firebaseConfig);
        // Initialize Analytics if needed
        // if (typeof window !== 'undefined') {
        //   getAnalytics(app);
        // }
    } catch (error) {
         console.error("Error initializing Firebase:", error);
         // Re-throw or handle error based on application needs
         throw error;
    }
  } else {
      // In production, prevent initialization if config is missing
      console.error("Firebase initialization skipped due to missing configuration in production.");
      // A fallback 'app' object or null could be assigned here if needed
      // app = null as any; // Example: assign null or a mock object
      throw new Error("Firebase configuration is missing in production.");
  }
} else {
  app = getApp();
}

// Initialize Auth and Firestore, handling potential errors if app initialization failed
let auth: Auth;
let db: Firestore;

try {
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("Error getting Firebase Auth or Firestore instance:", error);
    // Handle the error appropriately, e.g., by setting auth/db to null or throwing
    throw error;
}


export { app, auth, db };
