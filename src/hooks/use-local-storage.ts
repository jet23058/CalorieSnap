
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

// Custom hook error class
class LocalStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalStorageError";
  }
}

// Update the hook signature to return the error state as well
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void, LocalStorageError | null] {
  // Initialize state from localStorage synchronously on first client render
  const [storedValue, setStoredValue] = useState<T>(() => {
     if (typeof window === "undefined") {
         return initialValue;
     }
     try {
         const item = window.localStorage.getItem(key);
         if (item === null) {
             return initialValue;
         }
         try {
            // Attempt to parse. If it fails, fall back to initialValue.
            return JSON.parse(item);
         } catch (parseError) {
            console.error(`Error parsing localStorage key “${key}” with value "${item}". Resetting to default.`, parseError);
            window.localStorage.removeItem(key); // Remove corrupted item
            return initialValue;
         }
     } catch (error) {
         console.error(`Error reading localStorage key “${key}” on initial load:`, error);
         // Fallback to initialValue if reading fails (e.g., security restrictions)
         return initialValue;
     }
  });

  const [error, setError] = useState<LocalStorageError | null>(null);

  // Use useRef to store the key to avoid it being a dependency of setValue
  const keyRef = useRef(key);
  useEffect(() => {
      // Update ref if key prop changes (though usually it shouldn't)
      keyRef.current = key;
  }, [key]);


  // Callback to set value, ensuring stability
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    if (typeof window === "undefined") {
        console.warn(`Attempted to set localStorage key “${keyRef.current}” server-side.`);
        return;
    }

    try {
        // Use functional update form for setStoredValue
        setStoredValue(prevValue => {
            try {
                const valueToStore = value instanceof Function ? value(prevValue) : value;
                // Attempt to save to localStorage inside the functional update
                window.localStorage.setItem(keyRef.current, JSON.stringify(valueToStore));
                setError(null); // Clear error on success
                return valueToStore; // Return the new value for React state
            } catch (err) {
                 // Handle potential errors during saving
                if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
                    console.error(`LocalStorage quota exceeded when setting key “${keyRef.current}”.`);
                    setError(new LocalStorageError(`Failed to save data for "${keyRef.current}". Browser storage quota exceeded.`));
                } else {
                    console.error(`Error setting localStorage key “${keyRef.current}”:`, err);
                    setError(new LocalStorageError(`An unexpected error occurred while saving data for "${keyRef.current}".`));
                }
                return prevValue; // Return previous value to prevent state change on error
            }
        });

    } catch (outerError) {
        // Catch errors if the `value` function itself throws before setStoredValue runs
        console.error(`Error determining value to set for localStorage key “${keyRef.current}”:`, outerError);
        setError(new LocalStorageError(`An error occurred while preparing data for "${keyRef.current}".`));
        // Do not update storedValue in this case
    }
  }, []); // Empty dependency array - relies on keyRef and functional update


  // Return the state, the stable error-handling setter, and the error state
  return [storedValue, setValue, error];
}

export default useLocalStorage;
export { LocalStorageError }; // Export the custom error class if needed elsewhere
