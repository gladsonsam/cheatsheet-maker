// IndexedDB manager for storing uploaded images.
import type { StoredImage } from '../types';

class ImageStorage {
    dbName: string;
    storeName: string;
    db: IDBDatabase | null;

    constructor() {
        this.dbName = 'CheatsheetImages';
        this.storeName = 'images';
        this.db = null;
    }

    // Initialize the database.
    async init(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
        });
    }

    // Generate a unique image ID.
    generateId() {
        return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Save an image file.
    async saveImage(file: File, existingId: string | null = null): Promise<string> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                const id = existingId || this.generateId();
                const imageData = {
                    id: id,
                    data: e.target?.result as string, // base64 data URL
                    type: file.type,
                    name: file.name || 'pasted-image.png',
                    timestamp: Date.now()
                };

                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(imageData);

                request.onsuccess = () => resolve(id);
                request.onerror = () => reject(request.error);
            };

            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // Get a single image.
    async getImage(id: string): Promise<StoredImage | undefined> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Save a serialized image record.
    async saveImageData(imageData: Partial<StoredImage>): Promise<string> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const record = {
                id: imageData.id || this.generateId(),
                data: imageData.data,
                type: imageData.type || 'image/png',
                name: imageData.name || 'image',
                timestamp: imageData.timestamp || Date.now()
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(record);

            request.onsuccess = () => resolve(record.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllImages(): Promise<StoredImage[]> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete an image.
    async deleteImage(id: string): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Clean up images that are no longer referenced.
    async cleanUnusedImages(usedIds: string[]): Promise<void[]> {
        const allImages = await this.getAllImages();
        const deletePromises = [];

        for (const image of allImages) {
            if (!usedIds.includes(image.id)) {
                deletePromises.push(this.deleteImage(image.id));
            }
        }

        return Promise.all(deletePromises);
    }
}

// Singleton instance.
const imageStorage = new ImageStorage();

export default imageStorage;
