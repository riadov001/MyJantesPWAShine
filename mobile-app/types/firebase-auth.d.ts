// Firebase v10 ships getReactNativePersistence at runtime but doesn't expose
// it in its public type declarations. Re-declare it here to keep callers typed.
declare module 'firebase/auth' {
  import type { Persistence } from 'firebase/auth';
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<unknown>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<unknown>;
  }): Persistence;
}
