
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
    // Use a function form for setStoredValue to avoid depending on storedValue
    setStoredValue(currentStoredValue => {
      try {
        // Determine the value to store. If 'value' is a function, call it with the current state.
        const valueToStore = value instanceof Function ? value(currentStoredValue) : value;
        // Attempt to save to localStorage
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        // Clear any previous error on success
        setError(null);
        // Return the new value to update the React state
        return valueToStore;
      } catch (err) {
        // Handle potential errors during saving
        if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
          console.error(`LocalStorage quota exceeded when setting key “${key}”.`);
          setError(new LocalStorageError(`Failed to save data for "${key}". Browser storage quota exceeded.`));
        } else {
          console.error(`Error setting localStorage key “${key}”:`, err);
          setError(new LocalStorageError(`An unexpected error occurred while saving data for "${key}".`));
        }
        // Return the current value to prevent state change on error
        return currentStoredValue;
      }
    });
  }, [key]); // Remove storedValue from dependency array


  // Return the state, the error-handling setter, and the error state
  return [storedValue, setValue, error];
}

export default useLocalStorage;
export { LocalStorageError }; // Export the custom error class if needed elsewhere
