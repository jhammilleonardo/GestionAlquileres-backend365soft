import { firstReturnedRow } from './payment-status.types';

describe('firstReturnedRow', () => {
  it('devuelve el objeto cuando el query retorna filas planas (SELECT-like)', () => {
    const flat = [{ id: 6, status: 'APPROVED' }];
    expect(firstReturnedRow(flat)).toEqual({ id: 6, status: 'APPROVED' });
  });

  it('devuelve la primera fila cuando el query retorna resultado estructurado [rows, count]', () => {
    // TypeORM/pg devuelve esto para UPDATE/INSERT ... RETURNING; sin normalizar,
    // result[0] sería el array de filas y el endpoint respondía [{...}].
    const structured = [[{ id: 6, status: 'APPROVED' }], 1];
    expect(firstReturnedRow(structured)).toEqual({ id: 6, status: 'APPROVED' });
  });

  it('devuelve undefined ante resultados vacíos o no-array', () => {
    expect(firstReturnedRow([])).toBeUndefined();
    expect(firstReturnedRow(null)).toBeUndefined();
    expect(firstReturnedRow(undefined)).toBeUndefined();
  });
});
