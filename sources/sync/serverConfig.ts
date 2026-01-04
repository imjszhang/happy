import { MMKV } from 'react-native-mmkv';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const API_KEY_KEY = 'custom-api-key';
const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com';

export function getServerUrl(): string {
    return serverConfigStorage.getString(SERVER_KEY) || 
           process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || 
           DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// API Key management functions

export function getApiKey(): string | null {
    return serverConfigStorage.getString(API_KEY_KEY) || 
           process.env.EXPO_PUBLIC_HAPPY_API_KEY || 
           null;
}

export function setApiKey(key: string | null): void {
    if (key && key.trim()) {
        serverConfigStorage.set(API_KEY_KEY, key.trim());
    } else {
        serverConfigStorage.delete(API_KEY_KEY);
    }
}

export function hasApiKey(): boolean {
    return getApiKey() !== null;
}

export function isUsingCustomApiKey(): boolean {
    return serverConfigStorage.getString(API_KEY_KEY) !== undefined;
}