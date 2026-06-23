import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

/**
 * Construye las opciones de logging de Winston para la app.
 *
 * - Entornos desplegados (production/staging): JSON estructurado en stdout
 *   (12-factor) — listo para que el colector de logs lo agregue e indexe.
 * - Desarrollo local: salida coloreada y legible con el formato estilo Nest.
 *
 * El nivel se toma de `LOG_LEVEL`; por defecto `info` en entornos desplegados y
 * `debug` en local, para no perder detalle al desarrollar ni ruido en prod.
 */
export function buildWinstonOptions(): winston.LoggerOptions {
  const deployedEnvs = ['production', 'staging'];
  const isDeployed = deployedEnvs.includes(process.env.NODE_ENV ?? '');
  const level = process.env.LOG_LEVEL ?? (isDeployed ? 'info' : 'debug');

  const productionFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  const developmentFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.ms(),
    nestWinstonModuleUtilities.format.nestLike('365Soft', {
      colors: true,
      prettyPrint: true,
    }),
  );

  return {
    level,
    format: isDeployed ? productionFormat : developmentFormat,
    transports: [new winston.transports.Console()],
  };
}
