import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { quoteIdent } from '../common/utils/sql-identifier';

/** Claims necesarios para re-emitir el access token (JWT) tras un refresh. */
export interface RefreshClaims {
  sub: number;
  email: string;
  role: string;
  tenantSlug: string;
  rentalOwnerId?: number | null;
  vendorId?: number | null;
  mfaVerified?: boolean;
  tokenVersion: number;
}

interface RefreshTokenRow {
  id: number;
  user_id: number;
  email: string;
  role: string;
  tenant_slug: string;
  rental_owner_id: number | null;
  vendor_id: number | null;
  mfa_verified: boolean;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  token_version: number;
}

/** Dueño de un refresh token revocado — usado para auditar el logout. */
export interface RevokedTokenOwner {
  user_id: number;
  tenant_slug: string;
  role: string;
}

const REFRESH_TTL_DAYS = 30;

/**
 * Refresh tokens opacos persistidos en `public.refresh_tokens`. Se guarda sólo
 * el hash SHA-256 (nunca el token en claro). Rotación en cada uso (el token
 * consumido se revoca y se emite uno nuevo) y revocación explícita en logout.
 */
@Injectable()
export class RefreshTokenService implements OnModuleInit {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS public.refresh_tokens (
        id              SERIAL PRIMARY KEY,
        token_hash      VARCHAR(64)  NOT NULL UNIQUE,
        user_id         INTEGER      NOT NULL,
        email           VARCHAR(200) NOT NULL,
        role            VARCHAR(30)  NOT NULL,
        tenant_slug     VARCHAR(150) NOT NULL,
        rental_owner_id INTEGER,
        vendor_id       INTEGER,
        mfa_verified    BOOLEAN      NOT NULL DEFAULT false,
        token_version   INTEGER      NOT NULL DEFAULT 0,
        expires_at      TIMESTAMPTZ  NOT NULL,
        revoked_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
         ON public.refresh_tokens(user_id, tenant_slug)`,
    );
    await this.dataSource.query(
      `ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`,
    );
  }

  /** Emite un refresh token nuevo y devuelve el valor en claro (sólo aquí). */
  async issue(claims: RefreshClaims): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.dataSource.query(
      `INSERT INTO public.refresh_tokens
         (token_hash, user_id, email, role, tenant_slug,
          rental_owner_id, vendor_id, mfa_verified, token_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        this.hash(raw),
        claims.sub,
        claims.email,
        claims.role,
        claims.tenantSlug,
        claims.rentalOwnerId ?? null,
        claims.vendorId ?? null,
        claims.mfaVerified ?? false,
        claims.tokenVersion,
        expiresAt,
      ],
    );

    return raw;
  }

  /**
   * Valida un refresh token y lo revoca (rotación). Devuelve los claims para
   * re-emitir el access token. Lanza 401 si es inválido, expirado o ya usado.
   */
  async consume(rawToken: string): Promise<RefreshClaims> {
    const result = await this.dataSource.query<
      RefreshTokenRow[] | [RefreshTokenRow[], number]
    >(
      `UPDATE public.refresh_tokens
          SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
      RETURNING *`,
      [this.hash(rawToken)],
    );

    // El driver PostgreSQL de TypeORM devuelve UPDATE ... RETURNING como
    // [filas, rowCount], mientras algunos dobles de prueba devuelven las filas.
    const rows = Array.isArray(result[0])
      ? result[0]
      : (result as RefreshTokenRow[]);
    const row = rows[0];
    if (!row) {
      await this.revokeOnReuse(rawToken);
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const currentUser = await this.findCurrentUser(row);
    if (
      !currentUser ||
      !currentUser.is_active ||
      currentUser.email.toLowerCase() !== row.email.toLowerCase() ||
      currentUser.role !== row.role ||
      currentUser.token_version !== row.token_version
    ) {
      await this.revokeAll(row.user_id, row.tenant_slug, row.role);
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    return {
      sub: row.user_id,
      email: row.email,
      role: row.role,
      tenantSlug: row.tenant_slug,
      rentalOwnerId: row.rental_owner_id,
      vendorId: row.vendor_id,
      mfaVerified: row.mfa_verified,
      tokenVersion: row.token_version,
    };
  }

  /** Revoca un refresh token (logout). No falla si ya estaba revocado/ausente. */
  async revoke(rawToken: string): Promise<RevokedTokenOwner | null> {
    try {
      const rows = await this.dataSource.query<RevokedTokenOwner[]>(
        `UPDATE public.refresh_tokens
           SET revoked_at = NOW()
         WHERE token_hash = $1 AND revoked_at IS NULL
         RETURNING user_id, tenant_slug, role`,
        [this.hash(rawToken)],
      );
      return rows[0] ?? null;
    } catch (error) {
      this.logger.warn(`No se pudo revocar refresh token: ${String(error)}`);
      return null;
    }
  }

  async revokeAll(
    userId: number,
    tenantSlug: string,
    role: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.refresh_tokens
          SET revoked_at = NOW()
        WHERE user_id = $1
          AND tenant_slug = $2
          AND role = $3
          AND revoked_at IS NULL`,
      [userId, tenantSlug, role],
    );
  }

  private async revokeOnReuse(rawToken: string): Promise<void> {
    const rows = await this.dataSource.query<
      Array<{
        user_id: number;
        tenant_slug: string;
        role: string;
        revoked_at: Date | null;
      }>
    >(
      `SELECT user_id, tenant_slug, role, revoked_at
         FROM public.refresh_tokens
        WHERE token_hash = $1
        LIMIT 1`,
      [this.hash(rawToken)],
    );
    const reused = rows[0];
    if (reused?.revoked_at) {
      await this.revokeAll(reused.user_id, reused.tenant_slug, reused.role);
      this.logger.warn(
        `Reutilización de refresh token detectada para ${reused.tenant_slug}:${reused.role}:${reused.user_id}`,
      );
    }
  }

  private async findCurrentUser(row: RefreshTokenRow): Promise<{
    email: string;
    role: string;
    is_active: boolean;
    token_version: number;
  } | null> {
    const tenants = await this.dataSource.query<Array<{ schema_name: string }>>(
      `SELECT schema_name FROM public.tenant WHERE slug = $1 AND is_active = true`,
      [row.tenant_slug],
    );
    if (!tenants[0]) return null;

    const users = await this.dataSource.query<
      Array<{
        email: string;
        role: string;
        is_active: boolean;
        token_version: number;
      }>
    >(
      `SELECT email, role, is_active, token_version
         FROM ${quoteIdent(tenants[0].schema_name)}."user"
        WHERE id = $1`,
      [row.user_id],
    );
    return users[0] ?? null;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
