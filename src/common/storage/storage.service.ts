import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { existsSync, promises as fs } from 'fs';
import { dirname, join, normalize, resolve, sep } from 'path';

export type StorageVisibility = 'public' | 'private';

type ResolveReadAccessResult =
  | { kind: 'local'; absolutePath: string }
  | { kind: 'redirect'; url: string };

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageRoot = resolve(process.cwd(), 'storage');
  private readonly driver = (
    process.env.STORAGE_DRIVER ?? 'local'
  ).toLowerCase();
  private readonly signedUrlTtl = Number(
    process.env.AWS_SIGNED_URL_EXPIRES_SECONDS ?? 300,
  );
  private readonly publicSignedUrlTtl = Number(
    process.env.AWS_PUBLIC_SIGNED_URL_EXPIRES_SECONDS ?? 3600,
  );
  private s3Client: S3Client | null = null;

  isS3Enabled(): boolean {
    return this.driver === 's3';
  }

  buildStoragePath(...segments: string[]): string {
    const normalizedSegments = segments
      .map((segment) => this.assertSafePathSegment(segment))
      .filter((segment) => segment.length > 0);
    return this.normalizeStoragePath(join('storage', ...normalizedSegments));
  }

  toRoutePath(storagePath: string): string {
    return `/${this.normalizeStoragePath(storagePath)}`;
  }

  async persistUploadedFile(
    file: Express.Multer.File,
    targetStoragePath: string,
    visibility: StorageVisibility,
  ): Promise<string> {
    const normalizedPath = this.normalizeStoragePath(targetStoragePath);

    if (!this.isS3Enabled()) {
      return normalizedPath;
    }

    const localPath = file.path;
    if (!localPath || !existsSync(localPath)) {
      throw new NotFoundException('Uploaded file not found on local storage');
    }

    await this.uploadLocalFile(
      localPath,
      normalizedPath,
      file.mimetype,
      visibility,
      true,
    );
    return normalizedPath;
  }

  async uploadLocalFile(
    localPath: string,
    targetStoragePath: string,
    contentType: string | undefined,
    visibility: StorageVisibility,
    deleteSource: boolean,
  ): Promise<void> {
    const normalizedPath = this.normalizeStoragePath(targetStoragePath);
    if (!this.isS3Enabled()) {
      const absoluteTargetPath = this.resolveLocalAbsolutePath(normalizedPath);
      const absoluteSourcePath = resolve(localPath);

      await this.ensureLocalDirectory(normalizedPath);
      if (absoluteSourcePath !== absoluteTargetPath) {
        await fs.copyFile(localPath, absoluteTargetPath);
        if (deleteSource) {
          await fs.unlink(localPath).catch((error: unknown) => {
            this.logger.warn(
              `No se pudo borrar archivo temporal local '${localPath}': ${String(error)}`,
            );
          });
        }
      }
      return;
    }

    const client = this.getS3Client();
    const buffer = await fs.readFile(localPath);

    await client.send(
      new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: normalizedPath,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          visibility,
        },
      }),
    );

    if (deleteSource) {
      await fs.unlink(localPath).catch((error: unknown) => {
        this.logger.warn(
          `No se pudo borrar archivo temporal local '${localPath}': ${String(error)}`,
        );
      });
    }
  }

  async resolveReadAccess(
    storagePath: string,
    visibility: StorageVisibility,
  ): Promise<ResolveReadAccessResult> {
    const normalizedPath = this.normalizeStoragePath(storagePath);

    if (!this.isS3Enabled()) {
      const absolutePath = this.resolveLocalAbsolutePath(normalizedPath);
      if (!existsSync(absolutePath)) {
        throw new NotFoundException('File not found');
      }
      return { kind: 'local', absolutePath };
    }

    const expiresIn =
      visibility === 'private' ? this.signedUrlTtl : this.publicSignedUrlTtl;
    const signedUrl = await this.getSignedReadUrl(normalizedPath, expiresIn);
    return { kind: 'redirect', url: signedUrl };
  }

  async getSignedReadUrl(
    storagePath: string,
    expiresIn: number,
  ): Promise<string> {
    if (!this.isS3Enabled()) {
      return this.toRoutePath(storagePath);
    }

    const normalizedPath = this.normalizeStoragePath(storagePath);
    const client = this.getS3Client();

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: this.getBucketName(),
        Key: normalizedPath,
      }),
      { expiresIn },
    );
  }

  async deleteStoredFile(storagePath: string): Promise<void> {
    const normalizedPath = this.normalizeStoragePath(storagePath);

    if (!this.isS3Enabled()) {
      const absolutePath = this.resolveLocalAbsolutePath(normalizedPath);
      if (existsSync(absolutePath)) {
        await fs.unlink(absolutePath);
      }
      return;
    }

    const client = this.getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.getBucketName(),
        Key: normalizedPath,
      }),
    );
  }

  async ensureLocalDirectory(storagePath: string): Promise<void> {
    const absolutePath = this.resolveLocalAbsolutePath(storagePath);
    await fs.mkdir(dirname(absolutePath), { recursive: true });
  }

  private normalizeStoragePath(storagePath: string): string {
    const normalized = storagePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized.startsWith('storage/')) {
      throw new BadRequestException(
        `Storage path must start with 'storage/': '${storagePath}'`,
      );
    }
    if (normalized.includes('..')) {
      throw new BadRequestException(`Invalid storage path: '${storagePath}'`);
    }
    return normalized;
  }

  private resolveLocalAbsolutePath(storagePath: string): string {
    const normalized = this.normalizeStoragePath(storagePath);
    const relative = normalize(normalized);
    const absolute = resolve(process.cwd(), relative);

    if (!absolute.startsWith(this.storageRoot + sep)) {
      throw new InternalServerErrorException('Invalid storage path resolution');
    }
    return absolute;
  }

  private getBucketName(): string {
    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      throw new InternalServerErrorException(
        'AWS_BUCKET_NAME is required when STORAGE_DRIVER=s3',
      );
    }
    return bucket;
  }

  private getS3Client(): S3Client {
    if (this.s3Client) {
      return this.s3Client;
    }

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3',
      );
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return this.s3Client;
  }

  private assertSafePathSegment(segment: string): string {
    const normalized = segment.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.length === 0) {
      return normalized;
    }

    const parts = normalized.split('/').filter((part) => part.length > 0);
    for (const part of parts) {
      if (part === '.' || part === '..') {
        throw new BadRequestException(`Invalid path segment: '${segment}'`);
      }
    }

    return parts.join('/');
  }
}
