import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QrPaymentResponseDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ example: 'QR365T7T20260520153000a1b2c3d4' })
  alias: string;

  @ApiProperty({ example: 7 })
  tenant_id: number;

  @ApiPropertyOptional({ example: 22, nullable: true })
  contract_id?: number | null;

  @ApiProperty({ example: 1250.5 })
  amount: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 'RENT' })
  payment_type: string;

  @ApiProperty({
    example: 'PENDIENTE',
    enum: ['PENDIENTE', 'PAGADO', 'CANCELADO', 'EXPIRADO'],
  })
  status: string;

  @ApiPropertyOptional({
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
    nullable: true,
    description: 'Imagen QR en base64 o null si el proveedor no la devuelve.',
  })
  qr_image: string | null;

  @ApiPropertyOptional({ example: 44, nullable: true })
  payment_id?: number | null;

  @ApiProperty({ example: '2026-05-21T15:30:00.000Z' })
  expires_at: string | Date;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  created_at: string | Date;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  updated_at: string | Date;
}

export class QrProviderStatusResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 'PENDIENTE' })
  status: string;

  @ApiProperty({ type: Object })
  qr: Record<string, unknown>;

  @ApiProperty({ example: { codigo: '9999', mensaje: 'No encontrado' } })
  estado_transaccion: Record<string, unknown>;

  @ApiProperty({ example: 'Error al consultar estado: No encontrado' })
  message: string;
}

export class QrCallbackResponseDto {
  @ApiProperty({ example: '0000' })
  codigo: string;

  @ApiProperty({ example: 'Registro Exitoso' })
  mensaje: string;
}
