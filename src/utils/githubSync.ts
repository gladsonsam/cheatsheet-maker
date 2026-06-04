
import type { StoredImage } from '../types';

class GithubSync {
    baseUrl: string;

    constructor() {
        this.baseUrl = 'https://api.github.com';
    }

    async validateToken(token: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Invalid token');
            const user = await response.json();
            return user;
        } catch (error) {
            console.error('Token validation failed:', error);
            throw error;
        }
    }

    async getRepo(token: string, owner: string, repoName: string): Promise<any | null> {
        const response = await fetch(`${this.baseUrl}/repos/${owner}/${repoName}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to fetch repo');
        return await response.json();
    }

    async createRepo(token: string, name: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/user/repos`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description: 'Created by Cheatsheet Maker',
                private: true,
                auto_init: true
            })
        });
        if (!response.ok) throw new Error('Failed to create repo');
        return await response.json();
    }

    async getFile(token: string, owner: string, repo: string, path: string): Promise<any | null> {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${encoded}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to get file');
        return await response.json();
    }

    async listDirectory(token: string, owner: string, repo: string, path: string): Promise<any[] | null> {
        const encoded = path ? path.split('/').map(encodeURIComponent).join('/') : '';
        const url = encoded
            ? `${this.baseUrl}/repos/${owner}/${repo}/contents/${encoded}`
            : `${this.baseUrl}/repos/${owner}/${repo}/contents`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Failed to list directory');
        const data = await response.json();
        return Array.isArray(data) ? data : null;
    }

    async getFileContent(token: string, owner: string, repo: string, path: string): Promise<string | null> {
        const fileData = await this.getFile(token, owner, repo, path);
        if (!fileData) return null;

        // Decode Base64 content (handling UTF-8)
        try {
            return decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
        } catch (e) {
            console.error('Failed to decode file content:', e);
            return atob(fileData.content); // Fallback for simple ASCII
        }
    }

    async uploadFile(token: string, owner: string, repo: string, path: string, content: string, message = 'Update file'): Promise<any> {
        // First try to get the file to get its SHA (if it exists)
        const currentFile = await this.getFile(token, owner, repo, path);
        const sha = currentFile ? currentFile.sha : undefined;

        // Convert content to Base64 (handling UTF-8)
        const contentEncoded = btoa(unescape(encodeURIComponent(content)));

        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${encoded}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                content: contentEncoded,
                sha
            })
        });

        if (!response.ok) throw new Error('Failed to upload file');
        return await response.json();
    }

    getImageIdsFromMarkdown(markdown: string): string[] {
        const imagePattern = /!\[[^\]]*\]\((img-[^)]+)\)/g;
        const ids = new Set<string>();
        let match;

        while ((match = imagePattern.exec(markdown)) !== null) {
            ids.add(match[1]);
        }

        return Array.from(ids);
    }

    async uploadImage(token: string, owner: string, repo: string, image: StoredImage): Promise<any> {
        const payload = JSON.stringify({
            id: image.id,
            data: image.data,
            type: image.type,
            name: image.name,
            timestamp: image.timestamp
        });

        return this.uploadFile(
            token,
            owner,
            repo,
            `images/${image.id}.json`,
            payload,
            `Update image ${image.name || image.id}`
        );
    }

    async downloadImage(token: string, owner: string, repo: string, imageId: string): Promise<StoredImage | null> {
        const content = await this.getFileContent(token, owner, repo, `images/${imageId}.json`);
        if (!content) return null;
        return JSON.parse(content);
    }

    // Extract embedded images from markdown and store them in IndexedDB
    async extractImagesFromMarkdown(markdown: string, imageStorage: any): Promise<Record<string, string>> {
        const imagePattern = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
        const images: Record<string, string> = {};
        let match;

        while ((match = imagePattern.exec(markdown)) !== null) {
            const altText = match[1];
            const dataUrl = match[2];
            
            try {
                // Convert data URL to File
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const file = new File([blob], `${altText || 'image'}.png`, { type: blob.type });
                
                // Save to IndexedDB
                const imageId = await imageStorage.saveImage(file);
                images[dataUrl] = imageId;
            } catch (error) {
                console.error('Failed to extract and store image:', error);
            }
        }

        return images;
    }

    // Replace image data URLs in markdown with IndexedDB image IDs
    replaceImageReferencesWithIds(markdown: string, imageMapping: Record<string, string>): string {
        let updatedMarkdown = markdown;
        
        for (const [dataUrl, imageId] of Object.entries(imageMapping)) {
            // Escape special regex characters in the data URL
            const escapedUrl = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`!\\[([^\\]]*)\\]\\((${escapedUrl})\\)`, 'g');
            updatedMarkdown = updatedMarkdown.replace(pattern, `![$1](${imageId})`);
        }
        
        return updatedMarkdown;
    }
}

export default new GithubSync();
