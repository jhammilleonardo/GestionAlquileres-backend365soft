import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Asegurar que el directorio de storage existe
const ensureDirExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Configuración de Multer para propiedades
export const propertyImageStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    // Extraer tenant del request (seteado por el middleware)
    const tenantSlug = (req as any).tenant?.slug || 'temp';
    const propertyId = (req.params.id as string) || 'temp';

    // Crear path: storage/properties/{tenant_slug}/{property_id}/
    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'properties',
      tenantSlug,
      propertyId,
    );
    ensureDirExists(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generar nombre único
    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');
    const extension = extname(file.originalname);
    cb(null, `${randomName}${extension}`);
  },
});

// Filtro para aceptar solo imágenes
export const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false);
  }
};

// Configuración completa de Multer
export const multerConfig = {
  storage: propertyImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
};

// Configuración de Multer para mantenimiento
export const maintenanceFileStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const tenantSlug =
      (req as any).tenant?.slug || (req.params as any).slug || 'temp';
    const requestId = (req.params as any).id || 'temp';

    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'maintenance',
      tenantSlug,
      requestId,
    );
    ensureDirExists(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');
    const extension = extname(file.originalname);
    cb(null, `${randomName}${extension}`);
  },
});

// Filtro para imágenes y PDFs (mantenimiento)
export const maintenanceFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Solo se permiten imágenes (JPEG, PNG, WebP) y documentos PDF',
      ),
      false,
    );
  }
};

// Configuración completa de Multer para mantenimiento
export const maintenanceMulterConfig = {
  storage: maintenanceFileStorage,
  fileFilter: maintenanceFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
};
