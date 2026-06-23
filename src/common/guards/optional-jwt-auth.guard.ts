import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticación JWT *opcional* para endpoints públicos.
 *
 * Reutiliza la estrategia `jwt` (cookie HttpOnly o header Authorization). A
 * diferencia de `JwtAuthGuard`, NUNCA bloquea: si no hay token o es inválido,
 * deja pasar como anónimo (`req.user` queda `undefined`); si el token es válido,
 * puebla `req.user`. Lo usan los controllers del portal público para mostrar
 * contenido no publicado únicamente al staff autenticado del propio tenant
 * (p. ej. el preview del editor "Mi sitio web").
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /** Acepta siempre la petición; descarta el error de "sin token". */
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
