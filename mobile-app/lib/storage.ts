import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const isWeb = Platform.OS === 'web';

export const secureStorage: TokenStorage = {
  async get(key) {
    if (isWeb) return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key, value) {
    if (isWeb) return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key) {
    if (isWeb) return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};
