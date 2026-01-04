import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';
import { getServerUrl, getApiKey } from './serverConfig';

/**
 * Configuration options for API requests
 */
export interface ApiRequestConfig extends Omit<RequestInit, 'headers'> {
    /** Whether to include Authorization header (default: true) */
    includeAuth?: boolean;
    /** Additional headers to include */
    headers?: Record<string, string>;
}

/**
 * Get common headers for API requests
 * @param includeAuth - Whether to include Authorization header
 * @returns Headers object with X-API-Key and optionally Authorization
 */
export async function getCommonHeaders(includeAuth: boolean = true): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    
    // Add API Key if configured
    const apiKey = getApiKey();
    if (apiKey) {
        headers['X-API-Key'] = apiKey;
    }
    
    // Add Authorization header if requested and credentials exist
    if (includeAuth) {
        const credentials = await TokenStorage.getCredentials();
        if (credentials) {
            headers['Authorization'] = `Bearer ${credentials.token}`;
        }
    }
    
    return headers;
}

/**
 * Get common headers synchronously (requires credentials to be passed)
 * @param credentials - Auth credentials (optional)
 * @returns Headers object with X-API-Key and optionally Authorization
 */
export function getCommonHeadersSync(credentials?: AuthCredentials | null): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Add API Key if configured
    const apiKey = getApiKey();
    if (apiKey) {
        headers['X-API-Key'] = apiKey;
    }
    
    // Add Authorization header if credentials provided
    if (credentials) {
        headers['Authorization'] = `Bearer ${credentials.token}`;
    }
    
    return headers;
}

/**
 * Make an API request with automatic header injection
 * @param path - API path (e.g., '/v1/sessions')
 * @param options - Request options including custom config
 * @returns Fetch Response
 */
export async function apiRequest(
    path: string,
    options?: ApiRequestConfig
): Promise<Response> {
    const { includeAuth = true, headers: customHeaders, ...fetchOptions } = options || {};
    
    const baseUrl = getServerUrl();
    const url = `${baseUrl}${path}`;
    
    const commonHeaders = await getCommonHeaders(includeAuth);
    const headers = {
        ...commonHeaders,
        ...customHeaders
    };
    
    return fetch(url, {
        ...fetchOptions,
        headers
    });
}

/**
 * Make an API request with credentials passed directly (for use in contexts where credentials are already loaded)
 * @param path - API path (e.g., '/v1/sessions')
 * @param credentials - Auth credentials
 * @param options - Request options
 * @returns Fetch Response
 */
export function apiRequestWithCredentials(
    path: string,
    credentials: AuthCredentials | null,
    options?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
): Promise<Response> {
    const { headers: customHeaders, ...fetchOptions } = options || {};
    
    const baseUrl = getServerUrl();
    const url = `${baseUrl}${path}`;
    
    const commonHeaders = getCommonHeadersSync(credentials);
    const headers = {
        ...commonHeaders,
        ...customHeaders
    };
    
    return fetch(url, {
        ...fetchOptions,
        headers
    });
}
