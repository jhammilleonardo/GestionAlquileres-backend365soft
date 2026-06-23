/**
 * Rounds de bcrypt — OWASP recomienda ≥12 para servidores modernos.
 * Subir a 13 cuando el hardware lo permita sin afectar latencia de login.
 */
export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Longitud mínima de contraseña para todos los roles.
 * Los DTOs la aplican con @MinLength.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Regex de política de contraseña:
 * - Al menos una minúscula
 * - Al menos una mayúscula
 * - Al menos un dígito
 * No se exige símbolo para no bloquear a usuarios latinoamericanos con
 * teclados físicos que dificultan ciertos caracteres especiales.
 */
export const PASSWORD_STRENGTH_REGEX = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export const PASSWORD_STRENGTH_MESSAGE =
  'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número.';

export const AUTH_LOCKOUT_FAILED_ATTEMPTS = 5;
export const AUTH_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
