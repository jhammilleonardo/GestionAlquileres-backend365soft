import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class OptionalPositiveIntPipe implements PipeTransform<
  string | number | undefined,
  number | undefined
> {
  transform(value: string | number | undefined): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('El valor debe ser un entero positivo');
    }

    return parsed;
  }
}
