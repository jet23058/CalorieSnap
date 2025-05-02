"use client";

import { useState, useEffect, useCallback } from 'react';
import { isValidDate } from '@/lib/utils'; // Import the utility function

// Custom hook error class
class LocalStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalStorageError";
  }
}

// Update the hook signature to return the error state as well
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void, LocalStorageError | null] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [error, setError] = useState<LocalStorageError | null>(null);

  // Effect to load the value from localStorage only on the client-side
   useEffect(() => {
      if (typeof window === "undefined") {
        return; // Do nothing on the server
      }
      try {
        const item = window.localStorage.getItem(key);
        if (item === null) {
          setStoredValue(initialValue); // Keep initial value if nothing in storage
          setError(null);
        } else {
          try {
            const parsedItem = JSON.parse(item);
            setStoredValue(parsedItem);
            setError(null);
          } catch (parseError) {
            console.error(`Error parsing localStorage key “${key}” with value "${item}":`, parseError);
            window.localStorage.removeItem(key); // Remove corrupted item
            setStoredValue(initialValue); // Reset to initial value
            setError(new LocalStorageError(`Failed to parse data for "${key}". Resetting to default.`));
          }
        }
      } catch (err) {
        if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
          console.error(`LocalStorage quota exceeded when reading key “${key}”.`);
          // Don't set initial value here if already set, but set error
          setError(new LocalStorageError(`Could not load data for "${key}" due to full browser storage.`));
          // Optionally alert user only once or use a less intrusive method like a persistent banner
          // alert(`Warning: Could not load data for "${key}" because browser storage is full.`);
        } else {
          console.error(`Error reading localStorage key “${key}”:`, err);
          setError(new LocalStorageError(`Failed to read data for "${key}".`));
        }
        // Keep initialValue in state if read fails (already set by useState)
      }
   }, [key, initialValue]); // Run only once on mount or if key/initialValue changes


  // Callback to set value, handling potential errors
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    if (typeof window === "undefined") {
        console.warn(`Attempted to set localStorage key “${key}” server-side.`);
        return;
    }
    try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        setStoredValue(valueToStore); // Update state only after successful storage set
        setError(null); // Clear any previous error on success
    } catch (err) {
        if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
            console.error(`LocalStorage quota exceeded when setting key “${key}”.`);
            const quotaError = new LocalStorageError(`Failed to save data for "${key}". Browser storage quota exceeded.`);
            setError(quotaError); // Set the error state
            // Optionally re-throw if the caller needs to handle it immediately,
            // but setting state is often sufficient for UI feedback.
             // throw quotaError;
        } else {
            console.error(`Error setting localStorage key “${key}”:`, err);
            const unknownError = new LocalStorageError(`An unexpected error occurred while saving data for "${key}".`);
            setError(unknownError); // Set the error state
             // throw unknownError;
        }
        // Do not update React state (storedValue) if localStorage.setItem failed
    }
  }, [key, storedValue]); // storedValue is needed if the value is a function


  // Return the state, the error-handling setter, and the error state
  return [storedValue, setValue, error];
}

export default useLocalStorage;
export { LocalStorageError }; // Export the custom error class if needed elsewhere
