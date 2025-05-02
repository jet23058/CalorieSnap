
"use client";

import { useState, useEffect, useCallback } from 'react';

// Custom hook error class
class LocalStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalStorageError";
  }
}

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      // Add more robust parsing check
      if (item === null) {
        return initialValue;
      }
      try {
          return JSON.parse(item);
      } catch (parseError) {
          console.error(`Error parsing localStorage key “${key}” with value "${item}":`, parseError);
          // If parsing fails, reset to initial value or handle differently
          window.localStorage.removeItem(key); // Remove corrupted item
          return initialValue;
      }
    } catch (error) {
       // Check specifically for QuotaExceededError on initial load
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
         console.error(`LocalStorage quota exceeded when reading key “${key}”. Data might be too large or storage is full.`);
         // Optionally notify user or return initialValue
         alert(`Warning: Could not load data for "${key}" because browser storage is full. Please clear some space or previous data might be lost.`);
         return initialValue; // Return initial value if quota exceeded on load
      } else {
        console.error(`Error reading localStorage key “${key}”:`, error);
        return initialValue;
      }
    }
  });

  // Callback to set value, handling potential errors
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    if (typeof window === "undefined") {
        console.warn(`Attempted to set localStorage key “${key}” server-side.`);
        return;
    }
    try {
        // Allow value to be a function so we have the same API as useState
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        // Save state to local storage
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        // Update state only after successful storage set
        setStoredValue(valueToStore);
    } catch (error) {
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
            console.error(`LocalStorage quota exceeded when setting key “${key}”. Data might be too large.`);
            // Throw a custom error or handle it, e.g., notify the user
             throw new LocalStorageError(`Failed to save data for "${key}". Browser storage quota exceeded. Please try freeing up space.`);
             // Or, update state partially, or notify via toast etc.
             // Example: toast({ variant: 'destructive', title: 'Storage Full', description: 'Could not save changes.' });
        } else {
            console.error(`Error setting localStorage key “${key}”:`, error);
             throw new LocalStorageError(`An unexpected error occurred while saving data for "${key}".`);
        }
        // Do not update state if setItem failed
    }
  }, [key, storedValue]); // storedValue is needed if the value is a function


  // Return the state and the error-handling setter
  return [storedValue, setValue];
}

export default useLocalStorage;
export { LocalStorageError }; // Export the custom error class if needed elsewhere

    