export interface ActiveContractRow {
  id: number;
  property_id: number;
}

export interface ContractValidationRow {
  id: number;
  tenant_id: number;
  property_id: number;
  status: string;
}
