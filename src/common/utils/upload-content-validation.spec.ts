import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertUploadedFilesMatchContent } from './upload-content-validation';

describe('assertUploadedFilesMatchContent', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'upload-validation-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true });
  });

  it('accepts an uploaded PNG when the bytes match the MIME type', async () => {
    const file = await writeUpload(
      'image.png',
      'image/png',
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );

    await expect(
      assertUploadedFilesMatchContent(file),
    ).resolves.toBeUndefined();
  });

  it('accepts an uploaded WebP when the RIFF container identifies WEBP', async () => {
    const file = await writeUpload(
      'image.webp',
      'image/webp',
      Buffer.from('RIFF0000WEBPVP8 ', 'ascii'),
    );

    await expect(
      assertUploadedFilesMatchContent(file),
    ).resolves.toBeUndefined();
  });

  it('accepts an uploaded PDF when the bytes match the MIME type', async () => {
    const file = await writeUpload(
      'document.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\n', 'ascii'),
    );

    await expect(
      assertUploadedFilesMatchContent(file),
    ).resolves.toBeUndefined();
  });

  it('rejects a file with a fake MIME type and removes it from disk', async () => {
    const file = await writeUpload(
      'fake.webp',
      'image/webp',
      Buffer.from('<script>alert(1)</script>', 'ascii'),
    );

    await expect(assertUploadedFilesMatchContent(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(fs.stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  async function writeUpload(
    filename: string,
    mimetype: string,
    bytes: Buffer | number[],
  ): Promise<Express.Multer.File> {
    const path = join(tempDir, filename);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    await fs.writeFile(path, buffer);

    return {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype,
      destination: tempDir,
      filename,
      path,
      size: buffer.length,
      stream: undefined as never,
      buffer: undefined as never,
    };
  }
});
