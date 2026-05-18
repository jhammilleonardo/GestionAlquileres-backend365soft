import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

// Asegurar que el directorio de storage existe
const ensureDirExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Genera un nombre de archivo seguro usando el PRNG criptográfico del sistema
const generateSecureFilename = (originalName: string): string => {
  const randomName = randomBytes(16).toString('hex'); // 32 chars hex
  return `${randomName}${extname(originalName)}`;
};

const getTenantSlug = (req: Request): string =>
  (req as TenantRequest).tenant?.slug ?? getRouteParam(req, 'slug') ?? 'temp';

const getRouteParam = (req: Request, key: string): string | undefined => {
  const value = req.params?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

// Configuración de Multer para propiedades
export const propertyImageStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    // Extraer tenant del request (seteado por el middleware)
    const tenantSlug = getTenantSlug(req);
    const propertyId = getRouteParam(req, 'id') ?? 'temp';

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
    cb(null, generateSecureFilename(file.originalname));
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
    const tenantSlug = getTenantSlug(req);
    const requestId = getRouteParam(req, 'id') ?? 'temp';

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
    cb(null, generateSecureFilename(file.originalname));
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
      new Error('Solo se permiten imágenes (JPEG, PNG, WebP) y documentos PDF'),
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

// ──────────────────────────────────────────────────────────────
// Comprobantes de pago (imágenes + PDF, máx 10 MB)
// ──────────────────────────────────────────────────────────────

export const receiptFileStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const tenantSlug = getTenantSlug(req);

    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'receipts',
      tenantSlug,
    );
    ensureDirExists(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, generateSecureFilename(file.originalname));
  },
});

export const receiptFileFilter = (
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
      new Error('Solo se permiten imágenes (JPEG, PNG, WebP) y documentos PDF'),
      false,
    );
  }
};

export const receiptMulterConfig = {
  storage: receiptFileStorage,
  fileFilter: receiptFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
};

// ──────────────────────────────────────────────────────────────
// Documentos de solicitud de alquiler (imágenes + PDF, máx 10 MB)
// ──────────────────────────────────────────────────────────────

export const applicationDocumentStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const tenantSlug = getTenantSlug(req);
    const applicationId = getRouteParam(req, 'id') ?? 'temp';

    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'applications',
      tenantSlug,
      applicationId,
    );
    ensureDirExists(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, generateSecureFilename(file.originalname));
  },
});

export const applicationDocumentFilter = (
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
      new Error('Solo se permiten imágenes (JPEG, PNG, WebP) y documentos PDF'),
      false,
    );
  }
};

export const applicationDocumentMulterConfig = {
  storage: applicationDocumentStorage,
  fileFilter: applicationDocumentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
};

// ──────────────────────────────────────────────────────────────
// Fotos de etapas de mantenimiento — solo imágenes, máx 10 MB
// Almacenadas en: storage/maintenance/{slug}/{requestId}/stage/
// ──────────────────────────────────────────────────────────────

export const stagePhotoStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const tenantSlug = getTenantSlug(req);
    const requestId = getRouteParam(req, 'id') ?? 'temp';

    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'maintenance',
      tenantSlug,
      requestId,
      'stage',
    );
    ensureDirExists(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, generateSecureFilename(file.originalname));
  },
});

export const stagePhotoFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP)'), false);
  }
};

export const stagePhotoMulterConfig = {
  storage: stagePhotoStorage,
  fileFilter: stagePhotoFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
};

// Configuración de Multer para fotos de inspecciones
export const inspectionPhotoStorage = diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const tenantSlug = getTenantSlug(req);
    const inspectionId = getRouteParam(req, 'id') ?? 'temp';

    const uploadPath = path.join(
      process.cwd(),
      'storage',
      'inspections',
      tenantSlug,
      inspectionId,
    );
    ensureDirExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    cb(null, generateSecureFilename(file.originalname));
  },
});

export const inspectionPhotoFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP)'), false);
  }
};

export const inspectionPhotoMulterConfig = {
  storage: inspectionPhotoStorage,
  fileFilter: inspectionPhotoFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max por foto
  },
};
