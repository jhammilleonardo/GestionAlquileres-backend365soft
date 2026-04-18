import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ContractsService } from '../contracts/contracts.service';
import { BlacklistService } from '../blacklist/blacklist.service';
import { TenantsService } from '../tenants/tenants.service';
import { DataSource } from 'typeorm';
import { ApplicationStatus } from './enums/application-status.enum';
import { ScreeningFinalStatus } from './enums/screening-final-status.enum';
import { UpdateScreeningDto } from './dto/update-screening.dto';

const APPLICATION_ID = 1;
const ADMIN_ID = 99;
const APPLICANT_ID = 5;
const PROPERTY_TITLE = 'Departamento Centro';

function buildApplication(overrides = {}) {
  return {
    id: APPLICATION_ID,
    property_id: 10,
    applicant_id: APPLICANT_ID,
    status: ApplicationStatus.EN_REVISION,
    personal_data: {},
    employment_data: {},
    rental_history: {},
    references: {},
    documents: [],
    created_at: new Date(),
    updated_at: new Date(),
    property_title: PROPERTY_TITLE,
    applicant_name: 'Juan Pérez',
    applicant_email: 'juan@test.com',
    ...overrides,
  };
}

describe('ApplicationsService — screening', () => {
  let service: ApplicationsService;
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let contractsService: jest.Mocked<ContractsService>;

  beforeEach(async () => {
    dataSource = { query: jest.fn() };
    notificationsService = {
      createForUser: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationsService>;
    contractsService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<ContractsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: UsersService, useValue: {} },
        { provide: ContractsService, useValue: contractsService },
        { provide: BlacklistService, useValue: {} },
        { provide: TenantsService, useValue: {} },
      ],
    }).compile();

    service = module.get(ApplicationsService);
  });

  // ─── uploadDocuments ──────────────────────────────────────────────────────

  describe('uploadDocuments', () => {
    it('debe actualizar el array de documentos de la solicitud', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // findOne JOIN
        .mockResolvedValueOnce([{ documents: [] }]) // SELECT documents
        .mockResolvedValueOnce([]); // UPDATE

      const files = [
        { filename: 'abc.jpg', originalname: 'carnet_anverso.jpg' },
      ] as Express.Multer.File[];

      const result = await service.uploadDocuments(APPLICATION_ID, files, ['carnet_anverso'], 'empresa1');

      expect(dataSource.query).toHaveBeenCalledTimes(3);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].type).toBe('carnet_anverso');
    });

    it('debe lanzar NotFoundException si la solicitud no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]); // findOne sin resultados

      await expect(
        service.uploadDocuments(999, [] as Express.Multer.File[], [], 'empresa1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── completeScreening ────────────────────────────────────────────────────

  describe('completeScreening', () => {
    const checklist = {
      id: 1,
      application_id: APPLICATION_ID,
      documents_verified: true,
      employer_call_name: 'ACME SA',
      employer_call_phone: '60000001',
      employer_call_result: 'confirmado',
      previous_landlord_name: null,
      previous_landlord_phone: null,
      previous_landlord_result: null,
      blacklist_checked: true,
      blacklist_result: 'limpio',
      notes: null,
      final_status: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('debe guardar el checklist sin estado final y devolver sin contrato', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([{ ...checklist, final_status: null }]); // INSERT

      const dto: UpdateScreeningDto = { documents_verified: true };

      const result = await service.completeScreening(APPLICATION_ID, dto, ADMIN_ID);

      expect(result.message).toContain('actualizado');
      expect(result.contract).toBeUndefined();
      expect(notificationsService.createForUser).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si APPROVED y no hay monthly_rent', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([{ ...checklist, final_status: ScreeningFinalStatus.APPROVED }]); // INSERT

      const dto: UpdateScreeningDto = { final_status: ScreeningFinalStatus.APPROVED };

      await expect(service.completeScreening(APPLICATION_ID, dto, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe generar contrato cuando final_status es APPROVED con monthly_rent', async () => {
      const app = buildApplication();
      const contract = {
        id: 42,
        contract_number: 'CTR-2026-0001',
        status: 'BORRADOR',
        monthly_rent: 3000,
        currency: 'BOB',
        deposit_amount: 3000,
      };

      contractsService.create.mockResolvedValue(contract as any);

      // Secuencia de llamadas a dataSource.query:
      // 1. findOne (completeScreening)
      // 2. SELECT checklist (no existe)
      // 3. INSERT checklist
      // 4. findOne (approveAndCreateContract → findOne)
      // 5. findOne (updateStatus → findOne interno)
      // 6. UPDATE rental_applications (updateStatus → UPDATE)
      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([{ ...checklist, final_status: ScreeningFinalStatus.APPROVED }]) // INSERT
        .mockResolvedValueOnce([app]) // approveAndCreateContract → findOne
        .mockResolvedValueOnce([app]) // updateStatus → findOne interno
        .mockResolvedValueOnce([{ ...app, status: ApplicationStatus.APROBADA }]); // UPDATE status

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.APPROVED,
        monthly_rent: 3000,
        currency: 'BOB',
      };

      const result = await service.completeScreening(APPLICATION_ID, dto, ADMIN_ID);

      expect(contractsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          property_id: app.property_id,
          tenant_id: app.applicant_id,
          monthly_rent: 3000,
          application_id: APPLICATION_ID,
        }),
        ADMIN_ID,
      );
      expect(result.contract).toBeDefined();
      expect(result.message).toContain('contrato');
    });

    it('debe actualizar estado a RECHAZADA y notificar al inquilino cuando final_status es REJECTED', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([{ ...checklist, final_status: ScreeningFinalStatus.REJECTED }]) // INSERT checklist
        .mockResolvedValueOnce([app]) // handleScreeningRejected → findOne (en updateStatus)
        .mockResolvedValueOnce([{ ...app, status: ApplicationStatus.RECHAZADA }]); // UPDATE status

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.REJECTED,
        admin_feedback: 'No cumple con los requisitos de ingresos.',
      };

      const result = await service.completeScreening(APPLICATION_ID, dto, ADMIN_ID);

      expect(result.message).toContain('rechazada');
      expect(notificationsService.createForUser).toHaveBeenCalledWith(
        APPLICANT_ID,
        'application.status.changed',
        'Resultado de tu solicitud de alquiler',
        expect.stringContaining('rechazada'),
        expect.objectContaining({ final_status: ScreeningFinalStatus.REJECTED }),
      );
    });

    it('debe marcar EN_REVISION y notificar co-firmante cuando final_status es REQUIRES_COSIGNER', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([{ ...checklist, final_status: ScreeningFinalStatus.REQUIRES_COSIGNER }]) // INSERT
        .mockResolvedValueOnce([app]) // handleScreeningRequiresCosigner → findOne (en updateStatus)
        .mockResolvedValueOnce([{ ...app, status: ApplicationStatus.EN_REVISION }]); // UPDATE status

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.REQUIRES_COSIGNER,
      };

      const result = await service.completeScreening(APPLICATION_ID, dto, ADMIN_ID);

      expect(result.message).toContain('co-firmante');
      expect(notificationsService.createForUser).toHaveBeenCalledWith(
        APPLICANT_ID,
        'application.status.changed',
        'Acción requerida en tu solicitud',
        expect.stringContaining('co-firmante'),
        expect.objectContaining({ final_status: ScreeningFinalStatus.REQUIRES_COSIGNER }),
      );
    });

    it('debe actualizar checklist existente en lugar de crear uno nuevo (upsert)', async () => {
      const app = buildApplication();
      const existingId = { id: 7 };
      const updatedChecklist = { ...checklist, id: 7, employer_call_name: 'Nuevo Corp' };

      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([existingId]) // SELECT checklist → existe
        .mockResolvedValueOnce([updatedChecklist]); // UPDATE

      const dto: UpdateScreeningDto = { employer_call_name: 'Nuevo Corp' };

      const result = await service.completeScreening(APPLICATION_ID, dto, ADMIN_ID);

      expect(result.screening.employer_call_name).toBe('Nuevo Corp');
    });
  });

  // ─── markScreeningFeePaid ─────────────────────────────────────────────────

  describe('markScreeningFeePaid', () => {
    it('debe marcar screening_fee_paid en true', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([]); // UPDATE

      const result = await service.markScreeningFeePaid(APPLICATION_ID);

      expect(dataSource.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('screening_fee_paid = TRUE'),
        [APPLICATION_ID],
      );
      expect(result.message).toContain('Pago');
    });

    it('debe lanzar NotFoundException si la solicitud no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]); // findOne sin resultados

      await expect(service.markScreeningFeePaid(999)).rejects.toThrow(NotFoundException);
    });
  });
});
