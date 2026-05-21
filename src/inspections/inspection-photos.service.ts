import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { StorageService } from '../common/storage/storage.service';

interface InspectionItemPhotoRow {
  id: number;
  photos: string[] | null;
}

@Injectable()
export class InspectionPhotosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  async addPhotosToItem(
    schemaName: string,
    inspectionId: number,
    itemId: number,
    files: Express.Multer.File[],
    tenantSlug: string,
  ): Promise<{ photos: string[] }> {
    const q = quoteIdent(schemaName);

    const [item] = await this.dataSource.query<InspectionItemPhotoRow[]>(
      `SELECT id, photos FROM ${q}.inspection_items
       WHERE id = $1 AND inspection_id = $2`,
      [itemId, inspectionId],
    );

    if (!item) {
      throw new NotFoundException(
        `Ítem ${itemId} no encontrado en la inspección ${inspectionId}`,
      );
    }

    const newPhotos: string[] = [];
    for (const file of files) {
      const storagePath = await this.storageService.persistUploadedFile(
        file,
        this.storageService.buildStoragePath(
          'inspections',
          tenantSlug,
          String(inspectionId),
          file.filename,
        ),
        'private',
      );
      newPhotos.push(this.storageService.toRoutePath(storagePath));
    }

    const allPhotos = [...(item.photos ?? []), ...newPhotos];

    await this.dataSource.query(
      `UPDATE ${q}.inspection_items
       SET photos = $1, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(allPhotos), itemId],
    );

    return { photos: allPhotos };
  }
}
