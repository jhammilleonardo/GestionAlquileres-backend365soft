import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { InspectionType } from './dto/create-inspection.dto';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';

const mockDataSource = {
  query: jest.fn(),
};

const mockLifecycleNotificationsService = {
  onMoveOutCompleted: jest.fn().mockResolvedValue(undefined),
};

const SCHEMA = 'tenant_test';

describe('InspectionsService', () => {
  let service: InspectionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: LifecycleNotificationsService,
          useValue: mockLifecycleNotificationsService,
        },
      ],
    }).compile();

    service = module.get<InspectionsService>(InspectionsService);
  });

  // ── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debe crear inspección sin ítems y retornar el registro completo', async () => {
      const created = { id: 1, type: 'move_in', status: 'scheduled' };
      const fullInspection = {
        ...created,
        property_title: 'Apt A',
        items: [],
      };

      mockDataSource.query
        .mockResolvedValueOnce([created]) // INSERT inspections
        .mockResolvedValueOnce([fullInspection]) // findOne SELECT inspections
        .mockResolvedValueOnce([]); // findOne SELECT inspection_items

      const result = await service.create(
        SCHEMA,
        {
          property_id: 1,
          type: InspectionType.MOVE_IN,
          scheduled_date: '2026-05-01',
        },
        42,
      );

      expect(result).toMatchObject({ id: 1, status: 'scheduled', items: [] });
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);

      const insertCall = mockDataSource.query.mock.calls[0][0] as string;
      expect(insertCall).toContain('"tenant_test".inspections');
      expect(insertCall).toContain('INSERT INTO');
    });

    it('debe insertar los ítems cuando se proporcionan en el DTO', async () => {
      const created = { id: 2, type: 'move_in', status: 'scheduled' };
      const fullInspection = {
        ...created,
        property_title: 'Casa B',
        items: [],
      };

      mockDataSource.query
        .mockResolvedValueOnce([created]) // INSERT inspections
        .mockResolvedValueOnce(undefined) // INSERT item 1
        .mockResolvedValueOnce(undefined) // INSERT item 2
        .mockResolvedValueOnce([fullInspection]) // findOne SELECT
        .mockResolvedValueOnce([]); // findOne items

      await service.create(
        SCHEMA,
        {
          property_id: 1,
          type: InspectionType.MOVE_IN,
          scheduled_date: '2026-05-01',
          items: [
            { area: 'kitchen' as any, item_name: 'Cocina' },
            { area: 'bathroom' as any, item_name: 'Baño' },
          ],
        },
        42,
      );

      // INSERT inspections + 2 INSERT items + 2 SELECT findOne = 5 calls
      expect(mockDataSource.query).toHaveBeenCalledTimes(5);
    });
  });

  // ── updateItems ──────────────────────────────────────────────────────────

  describe('updateItems', () => {
    it('debe actualizar ítems existentes y avanzar estado a in_progress', async () => {
      const scheduled = { id: 1, status: 'scheduled' };
      const updated = { id: 1, status: 'in_progress', items: [] };

      mockDataSource.query
        .mockResolvedValueOnce([scheduled]) // SELECT inspections status
        .mockResolvedValueOnce([{ id: 10 }]) // SELECT item exists
        .mockResolvedValueOnce(undefined) // UPDATE item
        .mockResolvedValueOnce(undefined) // UPDATE status → in_progress
        .mockResolvedValueOnce([updated]) // findOne SELECT
        .mockResolvedValueOnce([]); // findOne items

      const result = await service.updateItems(
        SCHEMA,
        1,
        {
          items: [
            {
              id: 10,
              area: 'kitchen' as any,
              item_name: 'Cocina',
              condition: 'good' as any,
            },
          ],
        },
        42,
      );

      expect(result).toMatchObject({ status: 'in_progress' });

      const statusUpdateCall = mockDataSource.query.mock.calls[3][0] as string;
      expect(statusUpdateCall).toContain("status = 'in_progress'");
    });

    it('debe insertar nuevos ítems (sin id) correctamente', async () => {
      const inProgress = { id: 1, status: 'in_progress' };
      const afterUpdate = { id: 1, status: 'in_progress', items: [] };

      mockDataSource.query
        .mockResolvedValueOnce([inProgress]) // SELECT status
        .mockResolvedValueOnce(undefined) // INSERT item (no id)
        .mockResolvedValueOnce([afterUpdate]) // findOne SELECT
        .mockResolvedValueOnce([]); // findOne items

      await service.updateItems(
        SCHEMA,
        1,
        {
          items: [
            {
              area: 'bedroom' as any,
              item_name: 'Piso',
              condition: 'fair' as any,
            },
          ],
        },
        42,
      );

      const insertCall = mockDataSource.query.mock.calls[1][0] as string;
      expect(insertCall).toContain('INSERT INTO');
    });

    it('debe marcar como completed cuando complete=true', async () => {
      const inProgress = { id: 1, status: 'in_progress' };
      const completed = { id: 1, status: 'completed', items: [] };

      mockDataSource.query
        .mockResolvedValueOnce([inProgress]) // SELECT status
        .mockResolvedValueOnce(undefined) // INSERT item
        .mockResolvedValueOnce(undefined) // UPDATE status → completed
        .mockResolvedValueOnce([completed]) // findOne SELECT
        .mockResolvedValueOnce([]); // findOne items

      const result = await service.updateItems(
        SCHEMA,
        1,
        {
          items: [
            {
              area: 'living_room' as any,
              item_name: 'Sala',
              condition: 'good' as any,
            },
          ],
          complete: true,
        },
        42,
      );

      expect(result).toMatchObject({ status: 'completed' });

      const completeCall = mockDataSource.query.mock.calls[2][0] as string;
      expect(completeCall).toContain("status = 'completed'");
    });

    it('debe lanzar NotFoundException si la inspección no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // SELECT returns empty

      await expect(
        service.updateItems(SCHEMA, 999, { items: [] }, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si la inspección ya está completed', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: 'completed' },
      ]);

      await expect(
        service.updateItems(SCHEMA, 1, { items: [] }, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── generatePdf ──────────────────────────────────────────────────────────

  describe('generatePdf', () => {
    it('debe retornar un Buffer con contenido PDF', async () => {
      const inspection = {
        id: 5,
        type: 'move_in',
        status: 'completed',
        scheduled_date: '2026-04-01',
        completed_date: '2026-04-05',
        property_title: 'Apartamento Centro',
        unit_number: '2B',
        inspector_name: 'Ana García',
        inspector_email: 'ana@test.com',
        created_by_name: 'Admin',
        notes: 'Sin observaciones',
      };
      const items = [
        {
          id: 1,
          area: 'living_room',
          item_name: 'Paredes',
          condition: 'good',
          notes: null,
          photos: [],
        },
        {
          id: 2,
          area: 'kitchen',
          item_name: 'Mesada',
          condition: 'fair',
          notes: 'Pequeño rayón',
          photos: ['/storage/photo1.jpg'],
        },
      ];

      mockDataSource.query
        .mockResolvedValueOnce([inspection]) // findOne SELECT
        .mockResolvedValueOnce(items); // findOne items

      const result = await service.generatePdf(SCHEMA, 5);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(100);

      // Verificar que es PDF (magic bytes: %PDF)
      const header = result.slice(0, 4).toString('ascii');
      expect(header).toBe('%PDF');
    });

    it('debe lanzar NotFoundException si la inspección no existe', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // findOne → vacío
        .mockResolvedValueOnce([]); // findOne items

      // findOne lanza NotFoundException cuando rows está vacío
      await expect(service.generatePdf(SCHEMA, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── compare ──────────────────────────────────────────────────────────────
  // Promise.all llama a ambos findOne simultáneamente; espiamos findOne
  // directamente para evitar problemas de interleaving con el mock de dataSource.

  describe('compare', () => {
    it('debe retornar comparativo con ítems degradados detectados', async () => {
      const moveInFull = {
        id: 1,
        type: 'move_in',
        status: 'completed',
        scheduled_date: '2026-01-01',
        property_title: 'Casa X',
        items: [
          {
            id: 1,
            area: 'living_room',
            item_name: 'Paredes',
            condition: 'good',
            notes: null,
            photos: [],
          },
        ],
      };
      const moveOutFull = {
        id: 2,
        type: 'move_out',
        status: 'completed',
        scheduled_date: '2026-04-01',
        property_title: 'Casa X',
        items: [
          {
            id: 3,
            area: 'living_room',
            item_name: 'Paredes',
            condition: 'damaged',
            notes: 'Hueco',
            photos: [],
          },
        ],
      };

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(moveInFull as any)
        .mockResolvedValueOnce(moveOutFull as any);

      const result = await service.compare(SCHEMA, 1, 2);

      expect(result.summary.degraded_items).toBe(1);
      expect(result.comparison[0]).toMatchObject({
        move_in_condition: 'good',
        move_out_condition: 'damaged',
        degraded: true,
      });
    });

    it('debe lanzar BadRequestException si el tipo de la inspección es incorrecto', async () => {
      const wrongTypeFull = {
        id: 1,
        type: 'periodic',
        status: 'completed',
        items: [],
      };
      const moveOutFull = {
        id: 2,
        type: 'move_out',
        status: 'completed',
        items: [],
      };

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(wrongTypeFull as any)
        .mockResolvedValueOnce(moveOutFull as any);

      await expect(service.compare(SCHEMA, 1, 2)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
