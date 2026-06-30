/**
 * Categorías de gastos predefinidas
 * Los tenants pueden agregar categorías personalizadas a través de tenant-config
 */
export enum ExpenseCategoryEnum {
  MAINTENANCE = 'MAINTENANCE',
  REPAIRS = 'REPAIRS',
  INSURANCE = 'INSURANCE',
  TAX = 'TAX',
  UTILITIES = 'UTILITIES',
  MANAGEMENT_FEE = 'MANAGEMENT_FEE',
  CLEANING = 'CLEANING',
  SUPPLIES = 'SUPPLIES',
  LAUNDRY = 'LAUNDRY',
  PLATFORM_FEE = 'PLATFORM_FEE',
  BANK_FEE = 'BANK_FEE',
  LEGAL = 'LEGAL',
  OTHER = 'OTHER',
}

export const ExpenseCategoryLabels: Record<ExpenseCategoryEnum, string> = {
  [ExpenseCategoryEnum.MAINTENANCE]: 'Mantenimiento',
  [ExpenseCategoryEnum.REPAIRS]: 'Reparaciones',
  [ExpenseCategoryEnum.INSURANCE]: 'Seguros',
  [ExpenseCategoryEnum.TAX]: 'Impuestos',
  [ExpenseCategoryEnum.UTILITIES]: 'Servicios (agua, luz, gas)',
  [ExpenseCategoryEnum.MANAGEMENT_FEE]: 'Honorarios de gestión',
  [ExpenseCategoryEnum.CLEANING]: 'Limpieza',
  [ExpenseCategoryEnum.SUPPLIES]: 'Insumos',
  [ExpenseCategoryEnum.LAUNDRY]: 'Lavandería',
  [ExpenseCategoryEnum.PLATFORM_FEE]: 'Comisiones de plataforma',
  [ExpenseCategoryEnum.BANK_FEE]: 'Comisiones bancarias',
  [ExpenseCategoryEnum.LEGAL]: 'Legal y contratos',
  [ExpenseCategoryEnum.OTHER]: 'Otros',
};

export enum ExpenseScopeEnum {
  GENERAL = 'GENERAL',
  LONG_TERM = 'LONG_TERM',
  SHORT_TERM = 'SHORT_TERM',
}

export enum ExpenseResponsibilityEnum {
  COMPANY = 'COMPANY',
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  GUEST = 'GUEST',
}

export enum ExpensePaymentStatusEnum {
  PAID = 'PAID',
  PENDING = 'PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  REIMBURSED = 'REIMBURSED',
}
