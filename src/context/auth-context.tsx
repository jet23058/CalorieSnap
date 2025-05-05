"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { auth, db } from '@/lib/firebase/config';
import { LoadingSpinner } from '@/components/loading-spinner'; // Assuming LoadingSpinner exists

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null; // Add state for auth-related errors
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null); // State for errors

  useEffect(() => {
    // Check if auth service is available before subscribing
    if (!auth) {
      console.error("AuthProvider: Firebase Auth service is not available. Cannot initialize authentication.");
      setAuthError("無法初始化驗證服務。請檢查 Firebase 設定。");
      setLoading(false);
      return;
    }

    console.log("AuthProvider: Subscribing to auth state changes...");
    setAuthError(null); // Clear previous errors on mount/re-init

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("AuthProvider: onAuthStateChanged triggered. User:", firebaseUser?.uid ?? 'null');
      if (firebaseUser) {
        setUser(firebaseUser);
        // Check if user exists in Firestore, if not, create them
        if (db) { // Ensure db is available
            const userRef = doc(db, 'users', firebaseUser.uid);
            try {
                const docSnap = await getDoc(userRef);
                const now = Timestamp.now(); // Use Firestore Timestamp for consistency

                if (!docSnap.exists()) {
                    await setDoc(userRef, {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName,
                        photoURL: firebaseUser.photoURL,
                        createdAt: now, // Use Timestamp
                        lastLogin: now, // Use Timestamp
                        // Initialize profile fields here if needed, e.g., age: null etc.
                        // This prevents the CalorieLogger from needing to create it later
                        age: null,
                        gender: null,
                        height: null,
                        weight: null,
                        activityLevel: null,
                        healthGoal: null,
                    }, { merge: true }); // Use merge to be safe
                    console.log("New user added/initialized in Firestore:", firebaseUser.uid);
                } else {
                   // Update last login time for existing user
                   await setDoc(userRef, { lastLogin: now }, { merge: true }); // Use Timestamp
                   console.log("User last login updated:", firebaseUser.uid);
                }
            } catch (error) {
                console.error("Error accessing/updating user document in Firestore:", error);
                setAuthError("無法讀取或更新使用者資料庫。"); // Set Firestore error
            }
        } else {
             console.error("AuthProvider: Firestore service (db) is not available. Cannot update user profile.");
             setAuthError("資料庫服務不可用，無法更新使用者資料。");
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }, (error) => {
        // Handle errors during subscription
        console.error("AuthProvider: Error in onAuthStateChanged listener:", error);
        setAuthError(`驗證狀態監聽失敗: ${error.message}`);
        setUser(null);
        setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
        console.log("AuthProvider: Unsubscribing from auth state changes.");
        unsubscribe();
    }
  }, []); // Empty dependency array means this runs once on mount

  const signInWithGoogle = async () => {
     if (!auth) {
         console.error("signInWithGoogle: Firebase Auth service is not available.");
         setAuthError("驗證服務不可用，無法登入。");
         return;
     }
    setLoading(true);
    setAuthError(null); // Clear previous error
    const provider = new GoogleAuthProvider();
    try {
      console.log("signInWithGoogle: Attempting sign-in...");
      await signInWithPopup(auth, provider);
      console.log("signInWithGoogle: Sign-in successful (authState listener will update state).");
      // User state will be updated by onAuthStateChanged listener
    } catch (error: any) {
      console.error("Error during Google sign-in:", error);
      // Provide more specific error messages
      let message = "Google 登入失敗。";
      if (error.code === 'auth/popup-closed-by-user') {
          message = "登入視窗已關閉，請重試。";
      } else if (error.code === 'auth/network-request-failed') {
          message = "網路錯誤，請檢查您的連線。";
      } else {
          message = `登入錯誤：${error.message}`;
      }
      setAuthError(message);
      setLoading(false); // Ensure loading is false on error
    }
    // setLoading(false); // Handled by onAuthStateChanged or error handler
  };

  const logout = async () => {
     if (!auth) {
         console.error("logout: Firebase Auth service is not available.");
         setAuthError("驗證服務不可用，無法登出。");
         return;
     }
    setLoading(true);
    setAuthError(null); // Clear previous error
    try {
      console.log("logout: Attempting sign-out...");
      await signOut(auth);
      console.log("logout: Sign-out successful (authState listener will update state).");
      // User state will be updated by onAuthStateChanged listener
    } catch (error: any) {
      console.error("Error signing out:", error);
      setAuthError(`登出錯誤：${error.message}`);
      setLoading(false); // Ensure loading is false on error
    }
     // setLoading(false); // Handled by onAuthStateChanged or error handler
  };

  // Show a loading indicator while checking auth state initially
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // Optionally, display a global error message if auth failed to initialize
  // This could be styled better or integrated into a toast system
  // if (authError && !loading) {
  //     return (
  //         <div className="flex justify-center items-center h-screen text-red-600">
  //             <p>錯誤: {authError}</p>
  //         </div>
  //     );
  // }


  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};