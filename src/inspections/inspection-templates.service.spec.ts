import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InspectionTemplatesService } from './inspection-templates.service';
import { InspectionArea } from './dto/create-inspection.dto';

describe('InspectionTemplatesService', () => {
  let service: InspectionTemplatesService;
  let dataSource: { query: jest.Mock };

  const template = {
    id: 1,
    name: 'Checklist estándar',
    type: null,
    items: [{ area: 'kitchen', item_name: 'Fregadero' }],
    is_default: true,
    created_at: '2026-06-01',
    updated_at: '2026-06-01',
  };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new InspectionTemplatesService(
      dataSource as unknown as DataSource,
    );
  });

  it('lista plantillas ordenadas por defecto y nombre', async () => {
    dataSource.query.mockResolvedValueOnce([template]);
    const result = await service.findAll('tenant_acme');
    expect(result).toHaveLength(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY is_default DESC, name ASC'),
    );
  });

  it('crea una plantilla con sus ítems', async () => {
    dataSource.query.mockResolvedValueOnce([{ ...template, id: 2 }]);
    const result = await service.create(
      'tenant_acme',
      {
        name: 'Mudanza',
        items: [{ area: InspectionArea.BATHROOM, item_name: 'Ducha' }],
      },
      10,
    );
    expect(result.id).toBe(2);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_acme".inspection_templates'),
      expect.arrayContaining(['Mudanza', null]),
    );
  });

  it('lanza NotFound al obtener una plantilla inexistente', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(service.findOne('tenant_acme', 99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('impide eliminar la plantilla por defecto', async () => {
    dataSource.query.mockResolvedValueOnce([template]); // findOne
    await expect(service.remove('tenant_acme', 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('elimina una plantilla no-default', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ ...template, is_default: false }]) // findOne
      .mockResolvedValueOnce([]); // DELETE
    await service.remove('tenant_acme', 2);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "tenant_acme".inspection_templates'),
      [2],
    );
  });
});
