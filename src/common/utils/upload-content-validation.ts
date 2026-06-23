import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';

type UploadedFilesInput =
  | Express.Multer.File
  | Express.Multer.File[]
  | null
  | undefined;

const HEADER_BYTES_TO_READ = 32;

const fileTypeValidators: Record<string, (header: Buffer) => boolean> = {
  'image/jpeg': (header) =>
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff,
  'image/jpg': (header) =>
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff,
  'image/png': (header) =>
    header.length >= 8 &&
    header[0] === 0x89 &&
    header.subarray(1, 4).toString('ascii') === 'PNG' &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a,
  'image/gif': (header) => {
    const signature = header.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  },
  'image/webp': (header) =>
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/pdf': (header) =>
    header.length >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-',
  'video/mp4': (header) =>
    hasIsoBaseMediaBrand(header, [
      'avc1',
      'iso2',
      'isom',
      'm4a ',
      'm4v ',
      'mp41',
      'mp42',
    ]),
  'video/quicktime': (header) => hasIsoBaseMediaBrand(header, ['qt  ']),
  'video/webm': (header) =>
    header.length >= 4 &&
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3,
};

export async function assertUploadedFilesMatchContent(
  uploadedFiles: UploadedFilesInput,
): Promise<void> {
  const files = Array.isArray(uploadedFiles)
    ? uploadedFiles
    : uploadedFiles
      ? [uploadedFiles]
      : [];

  for (const file of files) {
    await assertUploadedFileMatchesContent(file);
  }
}

async function assertUploadedFileMatchesContent(
  file: Express.Multer.File,
): Promise<void> {
  const validator = fileTypeValidators[file.mimetype];

  if (!validator) {
    await removeUploadedFile(file);
    throw new BadRequestException('Tipo de archivo no permitido');
  }

  const header = await readFileHeader(file);

  if (!validator(header)) {
    await removeUploadedFile(file);
    throw new BadRequestException(
      'El contenido del archivo no coincide con el tipo permitido',
    );
  }
}

async function readFileHeader(file: Express.Multer.File): Promise<Buffer> {
  if (!file.path) {
    throw new BadRequestException('No se pudo validar el archivo subido');
  }

  try {
    const handle = await fs.open(file.path, 'r');
    try {
      const header = Buffer.alloc(HEADER_BYTES_TO_READ);
      const { bytesRead } = await handle.read(
        header,
        0,
        HEADER_BYTES_TO_READ,
        0,
      );
      return header.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    await removeUploadedFile(file);
    throw new BadRequestException('No se pudo validar el archivo subido');
  }
}

function hasIsoBaseMediaBrand(
  header: Buffer,
  allowedBrands: string[],
): boolean {
  if (
    header.length < 12 ||
    header.subarray(4, 8).toString('ascii') !== 'ftyp'
  ) {
    return false;
  }

  const headerText = header.toString('ascii').toLowerCase();
  return allowedBrands.some((brand) => headerText.includes(brand));
}

async function removeUploadedFile(file: Express.Multer.File): Promise<void> {
  if (!file.path) return;
  await fs.unlink(file.path).catch(() => undefined);
}
