import { BadRequestException } from '@nestjs/common';
import { OptionalPositiveIntPipe } from './optional-positive-int.pipe';

describe('OptionalPositiveIntPipe', () => {
  const pipe = new OptionalPositiveIntPipe();

  it('returns undefined for omitted values', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('')).toBeUndefined();
  });

  it('parses positive integers', () => {
    expect(pipe.transform('7')).toBe(7);
    expect(pipe.transform(3)).toBe(3);
  });

  it('rejects invalid, decimal or non-positive values', () => {
    expect(() => pipe.transform('abc')).toThrow(BadRequestException);
    expect(() => pipe.transform('1.5')).toThrow(BadRequestException);
    expect(() => pipe.transform('0')).toThrow(BadRequestException);
    expect(() => pipe.transform('-1')).toThrow(BadRequestException);
  });
});
