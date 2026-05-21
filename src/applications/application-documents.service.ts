import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { StorageService } from '../common/storage/storage.service';
import { TenantsService } from '../tenants/tenants.service';
import { ApplicationQueriesService } from './application-queries.service';

export interface ApplicationDocumentRef {
  type: string;
  url: string;
  name: string;
}

@Injectable()
export class ApplicationDocumentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly tenantsService: TenantsService,
    private readonly storageService: StorageService,
  ) {}

  async uploadDocuments(
    id: number,
    files: Express.Multer.File[],
    types: string[],
    tenantSlug: string,
  ): Promise<{ message: string; documents: ApplicationDocumentRef[] }> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    await this.applicationQueriesService.findOne(id, tenantSlug);

    const newDocs: ApplicationDocumentRef[] = [];
    for (const [index, file] of files.entries()) {
      const storagePath = await this.storageService.persistUploadedFile(
        file,
        this.storageService.buildStoragePath(
          'applications',
          tenantSlug,
          String(id),
          file.filename,
        ),
        'private',
      );

      newDocs.push({
        type: types[index] || 'otros',
        url: this.storageService.toRoutePath(storagePath),
        name: file.originalname,
      });
    }

    const [existing] = await this.dataSource.query<
      { documents: ApplicationDocumentRef[] }[]
    >(
      `SELECT documents FROM ${schemaPrefix}rental_applications WHERE id = $1`,
      [id],
    );
    const current: ApplicationDocumentRef[] = existing?.documents ?? [];

    await this.dataSource.query(
      `UPDATE ${schemaPrefix}rental_applications SET documents = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([...current, ...newDocs]), id],
    );

    return { message: 'Documentos subidos correctamente', documents: newDocs };
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
