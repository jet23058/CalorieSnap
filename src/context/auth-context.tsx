
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { LoadingSpinner } from '@/components/loading-spinner'; // Assuming LoadingSpinner exists

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Check if user exists in Firestore, if not, create them
        const userRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
          try {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            });
             console.log("New user added to Firestore:", firebaseUser.uid);
          } catch (error) {
            console.error("Error creating user document in Firestore:", error);
          }
        } else {
           // Update last login time for existing user
           try {
               await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
           } catch (error) {
               console.error("Error updating last login time:", error);
           }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // User state will be updated by onAuthStateChanged listener
    } catch (error) {
      console.error("Error during Google sign-in:", error);
      setLoading(false); // Ensure loading is false on error
    }
    // setLoading(false); // Handled by onAuthStateChanged
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // User state will be updated by onAuthStateChanged listener
    } catch (error) {
      console.error("Error signing out:", error);
      setLoading(false); // Ensure loading is false on error
    }
     // setLoading(false); // Handled by onAuthStateChanged
  };

  // Show a loading indicator while checking auth state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size={48} />
      </div>
    );
  }


  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
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
