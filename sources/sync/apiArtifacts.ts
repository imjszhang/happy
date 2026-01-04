import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { apiRequestWithCredentials } from './apiClient';
import { Artifact, ArtifactCreateRequest, ArtifactUpdateRequest, ArtifactUpdateResponse } from './artifactTypes';

/**
 * Fetch all artifacts for the account
 */
export async function fetchArtifacts(credentials: AuthCredentials): Promise<Artifact[]> {
    return await backoff(async () => {
        const response = await apiRequestWithCredentials('/v1/artifacts', credentials, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch artifacts: ${response.status}`);
        }

        const data = await response.json() as Artifact[];
        return data;
    });
}

/**
 * Fetch a single artifact with full body
 */
export async function fetchArtifact(credentials: AuthCredentials, artifactId: string): Promise<Artifact> {
    return await backoff(async () => {
        const response = await apiRequestWithCredentials(`/v1/artifacts/${artifactId}`, credentials, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to fetch artifact: ${response.status}`);
        }

        const data = await response.json() as Artifact;
        return data;
    });
}

/**
 * Create a new artifact
 */
export async function createArtifact(
    credentials: AuthCredentials, 
    request: ArtifactCreateRequest
): Promise<Artifact> {
    return await backoff(async () => {
        const response = await apiRequestWithCredentials('/v1/artifacts', credentials, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 409) {
                throw new Error('Artifact ID already exists');
            }
            throw new Error(`Failed to create artifact: ${response.status}`);
        }

        const data = await response.json() as Artifact;
        return data;
    });
}

/**
 * Update an existing artifact
 */
export async function updateArtifact(
    credentials: AuthCredentials,
    artifactId: string,
    request: ArtifactUpdateRequest
): Promise<ArtifactUpdateResponse> {
    return await backoff(async () => {
        const response = await apiRequestWithCredentials(`/v1/artifacts/${artifactId}`, credentials, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to update artifact: ${response.status}`);
        }

        const data = await response.json() as ArtifactUpdateResponse;
        return data;
    });
}

/**
 * Delete an artifact
 */
export async function deleteArtifact(
    credentials: AuthCredentials,
    artifactId: string
): Promise<void> {
    return await backoff(async () => {
        const response = await apiRequestWithCredentials(`/v1/artifacts/${artifactId}`, credentials, {
            method: 'DELETE'
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to delete artifact: ${response.status}`);
        }
    });
}