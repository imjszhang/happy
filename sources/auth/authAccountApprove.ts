import axios from 'axios';
import { encodeBase64 } from "../encryption/base64";
import { getServerUrl, getApiKey } from "@/sync/serverConfig";

export async function authAccountApprove(token: string, publicKey: Uint8Array, answer: Uint8Array) {
    const API_ENDPOINT = getServerUrl();
    
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
    };
    const apiKey = getApiKey();
    if (apiKey) {
        headers['X-API-Key'] = apiKey;
    }
    
    await axios.post(`${API_ENDPOINT}/v1/auth/account/response`, {
        publicKey: encodeBase64(publicKey),
        response: encodeBase64(answer)
    }, {
        headers
    });
}