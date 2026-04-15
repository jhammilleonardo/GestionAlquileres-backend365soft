import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { UnitsService } from './units.service';
import { Unit } from './entities/unit.entity';
import { UnitStatus } from './enums/unit-status.enum';
import { RentalType } from './enums/rental-type.enum';

const mockUnit = (overrides: Partial<Unit> = {}): Unit =>
  ({
    id: 1,
    property_id: 10,
    unit_number: '2A',
    floor: 2,
    bedrooms: 2,
    bathrooms: 1,
    square_meters: 65,
    status: UnitStatus.AVAILABLE,
    rental_type: RentalType.LONG_TERM,
    price_per_month: 500,
    price_per_night: null,
    deposit_amount: 1000,
    features: { has_balcony: true },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Unit);

describe('UnitsService', () => {
  let service: UnitsService;

  const mockUnitRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockUnitRepository),
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
    jest.clearAllMocks();
    mockDataSource.getRepository.mockReturnValue(mockUnitRepository);
  });

  describe('findByProperty', () => {
    it('debe retornar todas las unidades de una propiedad', async () => {
      const units = [mockUnit(), mockUnit({ id: 2, unit_number: '2B' })];
      mockDataSource.query.mockResolvedValueOnce([{ id: 10 }]); // assertPropertyExists
      mockUnitRepository.find.mockResolvedValueOnce(units);

      const result = await service.findByProperty(10);

      expect(result).toHaveLength(2);
      expect(mockUnitRepository.find).toHaveBeenCalledWith({
        where: { property_id: 10 },
        order: { floor: 'ASC', unit_number: 'ASC' },
      });
    });

    it('debe lanzar NotFoundException si la propiedad no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // propiedad no existe

      await expect(service.findByProperty(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAvailableByProperty', () => {
    it('debe retornar solo unidades con status available', async () => {
      const availableUnit = mockUnit({ status: UnitStatus.AVAILABLE });
      mockDataSource.query.mockResolvedValueOnce([{ id: 10 }]);
      mockUnitRepository.find.mockResolvedValueOnce([availableUnit]);

      const result = await service.findAvailableByProperty(10);

      expect(mockUnitRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { property_id: 10, status: UnitStatus.AVAILABLE } }),
      );
      expect(result).toEqual([availableUnit]);
    });
  });

  describe('findOne', () => {
    it('debe retornar la unidad si existe', async () => {
      const unit = mockUnit();
      mockUnitRepository.findOne.mockResolvedValueOnce(unit);

      const result = await service.findOne(10, 1);

      expect(result).toEqual(unit);
    });

    it('debe lanzar NotFoundException si la unidad no pertenece a la propiedad', async () => {
      mockUnitRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findOne(10, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debe crear una unidad correctamente', async () => {
      const dto = { unit_number: '3C', floor: 3, bedrooms: 1, bathrooms: 1 };
      const unit = mockUnit({ ...dto, id: 5 });

      mockDataSource.query.mockResolvedValueOnce([{ id: 10 }]); // assertPropertyExists

      // assertUnitNumberUnique — queryBuilder chain
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValueOnce(null), // sin duplicado
      };
      mockUnitRepository.createQueryBuilder.mockReturnValueOnce(mockQb);
      mockUnitRepository.create.mockReturnValueOnce(unit);
      mockUnitRepository.save.mockResolvedValueOnce(unit);

      const result = await service.create(10, dto);

      expect(result).toEqual(unit);
      expect(mockUnitRepository.create).toHaveBeenCalledWith({
        ...dto,
        property_id: 10,
      });
    });

    it('debe lanzar ConflictException si el número de unidad ya existe en la propiedad', async () => {
      const dto = { unit_number: '2A' };
      mockDataSource.query.mockResolvedValueOnce([{ id: 10 }]); // assertPropertyExists

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValueOnce(mockUnit()), // duplicado encontrado
      };
      mockUnitRepository.createQueryBuilder.mockReturnValueOnce(mockQb);

      await expect(service.create(10, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('debe eliminar la unidad si no tiene contratos activos', async () => {
      mockUnitRepository.findOne.mockResolvedValueOnce(mockUnit()); // findOne
      mockDataSource.query.mockResolvedValueOnce([]); // sin contratos activos
      mockUnitRepository.delete.mockResolvedValueOnce({ affected: 1 });

      const result = await service.remove(10, 1);

      expect(result).toEqual({ message: 'Unidad 1 eliminada correctamente' });
      expect(mockUnitRepository.delete).toHaveBeenCalledWith(1);
    });

    it('debe lanzar BadRequestException si la unidad tiene contratos activos', async () => {
      mockUnitRepository.findOne.mockResolvedValueOnce(mockUnit());
      mockDataSource.query.mockResolvedValueOnce([{ id: 7 }]); // contrato activo

      await expect(service.remove(10, 1)).rejects.toThrow(BadRequestException);
      expect(mockUnitRepository.delete).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si la unidad no existe', async () => {
      mockUnitRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.remove(10, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
