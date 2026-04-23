/**
 * Categorías de gastos predefinidas
 * Los tenants pueden agregar categorías personalizadas a través de tenant-config
 */
export enum ExpenseCategoryEnum {
  MAINTENANCE = 'MAINTENANCE',
  INSURANCE = 'INSURANCE',
  TAX = 'TAX',
  UTILITIES = 'UTILITIES',
  MANAGEMENT_FEE = 'MANAGEMENT_FEE',
  CLEANING = 'CLEANING',
  OTHER = 'OTHER',
}

export const ExpenseCategoryLabels: Record<ExpenseCategoryEnum, string> = {
  [ExpenseCategoryEnum.MAINTENANCE]: 'Mantenimiento',
  [ExpenseCategoryEnum.INSURANCE]: 'Seguros',
  [ExpenseCategoryEnum.TAX]: 'Impuestos',
  [ExpenseCategoryEnum.UTILITIES]: 'Servicios (agua, luz, gas)',
  [ExpenseCategoryEnum.MANAGEMENT_FEE]: 'Honorarios de gestión',
  [ExpenseCategoryEnum.CLEANING]: 'Limpieza',
  [ExpenseCategoryEnum.OTHER]: 'Otros',
};
