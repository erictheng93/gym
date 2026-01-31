import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db, files } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

class FileService {
  private s3: S3Client | null = null;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET || 'gym-nexus-files';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  async upload(
    file: { name: string; type: string; size: number; data: ArrayBuffer },
    options: {
      folder?: string;
      tenantId?: string;
      uploadedBy?: string;
    } = {}
  ): Promise<{ id: string; url: string } | null> {
    if (!this.s3) {
      console.warn('[Files] R2 not configured');
      return null;
    }

    const ext = file.name.split('.').pop() || '';
    const key = options.folder
      ? `${options.folder}/${randomUUID()}.${ext}`
      : `${randomUUID()}.${ext}`;

    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(file.data),
        ContentType: file.type,
      }));

      const [newFile] = await db.insert(files).values({
        filename: `${randomUUID()}.${ext}`,
        originalFilename: file.name,
        mimeType: file.type,
        size: file.size,
        storageKey: key,
        folder: options.folder,
        tenantId: options.tenantId,
        uploadedBy: options.uploadedBy,
      }).returning();

      return {
        id: newFile.id,
        url: this.publicUrl ? `${this.publicUrl}/${key}` : key,
      };
    } catch (error) {
      console.error('[Files] Upload failed:', error);
      return null;
    }
  }

  async delete(fileId: string): Promise<boolean> {
    if (!this.s3) {
      console.warn('[Files] R2 not configured');
      return false;
    }

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) {
      return false;
    }

    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
      }));

      await db.delete(files).where(eq(files.id, fileId));

      return true;
    } catch (error) {
      console.error('[Files] Delete failed:', error);
      return false;
    }
  }

  async getSignedUrl(fileId: string, expiresIn = 3600): Promise<string | null> {
    if (!this.s3) {
      return null;
    }

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) {
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
      });

      return await getSignedUrl(this.s3, command, { expiresIn });
    } catch (error) {
      console.error('[Files] Get signed URL failed:', error);
      return null;
    }
  }

  getPublicUrl(storageKey: string): string {
    return this.publicUrl ? `${this.publicUrl}/${storageKey}` : storageKey;
  }
}

export const fileService = new FileService();
