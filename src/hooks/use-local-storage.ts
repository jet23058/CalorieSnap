
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
        // Determine the new value first
        const valueToStore = value instanceof Function ? value(storedValue) : value;

        // Attempt to save to localStorage
        window.localStorage.setItem(keyRef.current, JSON.stringify(valueToStore));

        // If save successful, update React state and clear error
        setStoredValue(valueToStore);
        setError(null);

    } catch (err) {
         // Handle potential errors during saving
        const currentKey = keyRef.current; // Use variable for readability
        if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
            console.error(`LocalStorage quota exceeded when setting key “${currentKey}”.`);
            // Set a more specific and user-friendly error message
            setError(new LocalStorageError(`無法儲存資料：瀏覽器儲存空間已滿。請嘗試刪除部分舊記錄。`));
        } else {
            console.error(`Error setting localStorage key “${currentKey}”:`, err);
            setError(new LocalStorageError(`儲存資料時發生未預期的錯誤。`));
        }
        // Important: Do NOT update React state (setStoredValue) if localStorage saving failed
    }
  }, [storedValue]); // Add storedValue as dependency to ensure value() function uses the latest state


  // Return the state, the stable error-handling setter, and the error state
  return [storedValue, setValue, error];
}

export default useLocalStorage;
export { LocalStorageError }; // Export the custom error class if needed elsewhere
