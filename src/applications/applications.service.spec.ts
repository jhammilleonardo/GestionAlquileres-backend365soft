import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ContractsService } from '../contracts/contracts.service';
import { BlacklistService } from '../blacklist/blacklist.service';
import { TenantsService } from '../tenants/tenants.service';
import { StorageService } from '../common/storage/storage.service';
import { DataSource } from 'typeorm';
import { ApplicationStatus } from './enums/application-status.enum';
import { ScreeningFinalStatus } from './enums/screening-final-status.enum';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { ApplicationApprovalContractFactoryService } from './application-approval-contract-factory.service';
import { ApplicationApprovalSideEffectsService } from './application-approval-side-effects.service';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationCreationService } from './application-creation.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationScreeningFeeService } from './application-screening-fee.service';
import { ApplicationScreeningDecisionService } from './application-screening-decision.service';
import { ApplicationScreeningService } from './application-screening.service';
import { ApplicationStatusService } from './application-status.service';

const APPLICATION_ID = 1;
const ADMIN_ID = 99;
const APPLICANT_ID = 5;
const PROPERTY_TITLE = 'Departamento Centro';
const TENANT_SLUG = 'empresa1';

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
  let dataSource: jest.Mocked<Pick<DataSource, 'query' | 'createQueryRunner'>>;
  let queryRunner: {
    query: jest.Mock;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let notificationsService: jest.Mocked<NotificationsService>;
  let contractsService: jest.Mocked<ContractsService>;
  let tenantsService: jest.Mocked<Pick<TenantsService, 'findBySlug'>>;

  beforeEach(async () => {
    queryRunner = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as jest.Mocked<
      Pick<DataSource, 'query' | 'createQueryRunner'>
    >;
    notificationsService = {
      createForUser: jest.fn().mockResolvedValue(undefined),
      createForUserInSchema: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationsService>;
    contractsService = {
      create: jest.fn(),
      emitContractCreatedSideEffects: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ContractsService>;
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({
        slug: TENANT_SLUG,
        schema_name: 'tenant_empresa1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        ApplicationApprovalContractFactoryService,
        ApplicationApprovalSideEffectsService,
        ApplicationApprovalService,
        ApplicationCreationService,
        ApplicationDocumentsService,
        ApplicationQueriesService,
        ApplicationScreeningFeeService,
        ApplicationScreeningDecisionService,
        ApplicationScreeningService,
        ApplicationStatusService,
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: UsersService, useValue: {} },
        { provide: ContractsService, useValue: contractsService },
        { provide: BlacklistService, useValue: {} },
        { provide: TenantsService, useValue: tenantsService },
        {
          provide: StorageService,
          useValue: {
            persistUploadedFile: jest.fn(),
            buildStoragePath: jest.fn(),
            toRoutePath: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ApplicationsService);
  });

  describe('tenant schema reads', () => {
    it('findOne usa tablas calificadas por schema sin mutar search_path', async () => {
      const app = buildApplication();
      dataSource.query.mockResolvedValueOnce([app]);

      await expect(service.findOne(APPLICATION_ID, TENANT_SLUG)).resolves.toBe(
        app,
      );

      expect(tenantsService.findBySlug).toHaveBeenCalledWith(TENANT_SLUG);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'FROM "tenant_empresa1".rental_applications ra',
        ),
        [APPLICATION_ID],
      );
      expect(dataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining('SET search_path'),
      );
    });
  });

  describe('approveAndCreateContract', () => {
    it('hace rollback si falla la creación del contrato después de marcar la solicitud', async () => {
      const app = buildApplication();
      const approvedApp = { ...app, status: ApplicationStatus.APROBADA };

      queryRunner.query
        .mockResolvedValueOnce([app]) // lock application FOR UPDATE
        .mockResolvedValueOnce([approvedApp]); // mark application approved
      contractsService.create.mockRejectedValueOnce(
        new BadRequestException('El inquilino ya tiene un contrato activo'),
      );

      await expect(
        service.approveAndCreateContract(
          APPLICATION_ID,
          {
            monthly_rent: 3000,
            currency: 'BOB',
            admin_feedback: 'Aprobación de prueba',
          },
          ADMIN_ID,
          TENANT_SLUG,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
      expect(
        notificationsService.createForUserInSchema.mock.calls,
      ).toHaveLength(0);
      expect(
        contractsService.emitContractCreatedSideEffects.mock.calls,
      ).toHaveLength(0);
    });
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

      const result = await service.uploadDocuments(
        APPLICATION_ID,
        files,
        ['carnet_anverso'],
        TENANT_SLUG,
      );

      expect(dataSource.query).toHaveBeenCalledTimes(3);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].type).toBe('carnet_anverso');
    });

    it('debe lanzar NotFoundException si la solicitud no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]); // findOne sin resultados

      await expect(
        service.uploadDocuments(
          999,
          [] as Express.Multer.File[],
          [],
          TENANT_SLUG,
        ),
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

      const result = await service.completeScreening(
        APPLICATION_ID,
        dto,
        ADMIN_ID,
        TENANT_SLUG,
      );

      expect(result.message).toContain('actualizado');
      expect(result.contract).toBeUndefined();
      expect(
        notificationsService.createForUserInSchema.mock.calls,
      ).toHaveLength(0);
    });

    it('debe lanzar BadRequestException si APPROVED y no hay monthly_rent', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([
          { ...checklist, final_status: ScreeningFinalStatus.APPROVED },
        ]); // INSERT

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.APPROVED,
      };

      await expect(
        service.completeScreening(APPLICATION_ID, dto, ADMIN_ID, TENANT_SLUG),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe generar contrato cuando final_status es APPROVED con monthly_rent', async () => {
      const app = buildApplication();
      const contract = {
        id: 42,
        contract_number: 'CTR-2026-0001',
        tenant_id: app.applicant_id,
        property_id: app.property_id,
        status: 'BORRADOR',
        monthly_rent: 3000,
        currency: 'BOB',
        deposit_amount: 3000,
      };

      contractsService.create.mockResolvedValue(contract as never);

      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([
          { ...checklist, final_status: ScreeningFinalStatus.APPROVED },
        ]); // INSERT
      queryRunner.query
        .mockResolvedValueOnce([app]) // lock application FOR UPDATE
        .mockResolvedValueOnce([
          { ...app, status: ApplicationStatus.APROBADA },
        ]); // mark application approved

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.APPROVED,
        monthly_rent: 3000,
        currency: 'BOB',
      };

      const result = await service.completeScreening(
        APPLICATION_ID,
        dto,
        ADMIN_ID,
        TENANT_SLUG,
      );

      expect(contractsService.create.mock.calls).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property_id: app.property_id,
            tenant_id: app.applicant_id,
            monthly_rent: 3000,
            application_id: APPLICATION_ID,
          }),
          ADMIN_ID,
        ]),
      );
      expect(result.contract).toBeDefined();
      expect(result.message).toContain('contrato');
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('debe actualizar estado a RECHAZADA y notificar al inquilino cuando final_status es REJECTED', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([
          { ...checklist, final_status: ScreeningFinalStatus.REJECTED },
        ]) // INSERT checklist
        .mockResolvedValueOnce([app]) // handleScreeningRejected → findOne (en updateStatus)
        .mockResolvedValueOnce([
          { ...app, status: ApplicationStatus.RECHAZADA },
        ]); // UPDATE status

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.REJECTED,
        admin_feedback: 'No cumple con los requisitos de ingresos.',
      };

      const result = await service.completeScreening(
        APPLICATION_ID,
        dto,
        ADMIN_ID,
        TENANT_SLUG,
      );

      expect(result.message).toContain('rechazada');
      expect(
        notificationsService.createForUserInSchema.mock.calls,
      ).toContainEqual(
        expect.arrayContaining([
          'tenant_empresa1',
          APPLICANT_ID,
          'application.status.changed',
          'Resultado de tu solicitud de alquiler',
          expect.stringContaining('rechazada'),
          expect.objectContaining({
            final_status: ScreeningFinalStatus.REJECTED,
          }),
          TENANT_SLUG,
        ]),
      );
    });

    it('debe marcar EN_REVISION y notificar co-firmante cuando final_status es REQUIRES_COSIGNER', async () => {
      const app = buildApplication();
      dataSource.query
        .mockResolvedValueOnce([app]) // completeScreening → findOne
        .mockResolvedValueOnce([]) // SELECT checklist (no existe)
        .mockResolvedValueOnce([
          {
            ...checklist,
            final_status: ScreeningFinalStatus.REQUIRES_COSIGNER,
          },
        ]) // INSERT
        .mockResolvedValueOnce([app]) // handleScreeningRequiresCosigner → findOne (en updateStatus)
        .mockResolvedValueOnce([
          { ...app, status: ApplicationStatus.EN_REVISION },
        ]); // UPDATE status

      const dto: UpdateScreeningDto = {
        final_status: ScreeningFinalStatus.REQUIRES_COSIGNER,
      };

      const result = await service.completeScreening(
        APPLICATION_ID,
        dto,
        ADMIN_ID,
        TENANT_SLUG,
      );

      expect(result.message).toContain('co-firmante');
      expect(
        notificationsService.createForUserInSchema.mock.calls,
      ).toContainEqual(
        expect.arrayContaining([
          'tenant_empresa1',
          APPLICANT_ID,
          'application.status.changed',
          'Acción requerida en tu solicitud',
          expect.stringContaining('co-firmante'),
          expect.objectContaining({
            final_status: ScreeningFinalStatus.REQUIRES_COSIGNER,
          }),
          TENANT_SLUG,
        ]),
      );
    });

    it('debe actualizar checklist existente en lugar de crear uno nuevo (upsert)', async () => {
      const app = buildApplication();
      const existingId = { id: 7 };
      const updatedChecklist = {
        ...checklist,
        id: 7,
        employer_call_name: 'Nuevo Corp',
      };

      dataSource.query
        .mockResolvedValueOnce([app]) // findOne
        .mockResolvedValueOnce([existingId]) // SELECT checklist → existe
        .mockResolvedValueOnce([updatedChecklist]); // UPDATE

      const dto: UpdateScreeningDto = { employer_call_name: 'Nuevo Corp' };

      const result = await service.completeScreening(
        APPLICATION_ID,
        dto,
        ADMIN_ID,
        TENANT_SLUG,
      );

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

      const result = await service.markScreeningFeePaid(
        APPLICATION_ID,
        TENANT_SLUG,
      );

      expect(dataSource.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('screening_fee_paid = TRUE'),
        [APPLICATION_ID],
      );
      expect(result.message).toContain('Pago');
    });

    it('debe lanzar NotFoundException si la solicitud no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]); // findOne sin resultados

      await expect(
        service.markScreeningFeePaid(999, TENANT_SLUG),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
