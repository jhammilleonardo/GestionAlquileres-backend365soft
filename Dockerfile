# ─── Etapa 1: Build ───────────────────────────────────────────────────────────
# Instala todas las dependencias y compila TypeScript
FROM node:22.21.1-alpine3.21 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Etapa 2: Dependencias de producción ──────────────────────────────────────
# Instalación limpia solo con lo necesario en runtime, sin tocar el builder
FROM node:22.21.1-alpine3.21 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ─── Etapa 3: Imagen de producción ────────────────────────────────────────────
FROM node:22.21.1-alpine3.21 AS production

# Metadata OCI estándar
LABEL org.opencontainers.image.title="365Soft API" \
      org.opencontainers.image.description="Sistema de gestión de alquileres — Backend NestJS" \
      org.opencontainers.image.source="https://github.com/365Soft-Bolivia/GestionAlquileres_365Soft-backend"

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Crear usuario no-root ANTES de copiar archivos
# UID/GID numérico fijo para compatibilidad con sistemas de orquestación (K8s, ECS)
RUN addgroup --system --gid 1001 appgroup \
    && adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser

# Crear directorios que el proceso necesita escribir en runtime
RUN mkdir -p uploads storage \
    && chown -R appuser:appgroup uploads storage

# Copiar dependencias y build con ownership correcto desde el inicio
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

USER appuser

EXPOSE 3000

# wget viene incluido en node:alpine — comprobación cada 30s, 3 reintentos
# start-period da tiempo a la app para conectarse a la DB antes del primer check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
