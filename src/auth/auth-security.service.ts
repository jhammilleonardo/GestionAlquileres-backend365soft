import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AUTH_LOCKOUT_DURATION_MS,
  AUTH_LOCKOUT_FAILED_ATTEMPTS,
  AUTH_LOCKOUT_WINDOW_MS,
} from '../common/constants/security.constants';

export enum AuthLoginContext {
  ADMIN = 'admin_login',
  TENANT = 'tenant_login',
  OWNER = 'owner_login',
  VENDOR = 'vendor_login',
  JWT_TENANT_CONTEXT = 'jwt_tenant_context',
}

export enum AuthSecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGIN_LOCKED = 'LOGIN_LOCKED',
  INACTIVE_USER_LOGIN = 'INACTIVE_USER_LOGIN',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  PERMISSIONS_CHANGED = 'PERMISSIONS_CHANGED',
}

interface LoginAttemptRow {
  failed_count: number;
  locked_until: Date | string | null;
}

@Injectable()
export class AuthSecurityService {
  private readonly logger = new Logger(AuthSecurityService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async assertLoginAllowed(
    email: string,
    tenantSlug: string,
    context: AuthLoginContext,
  ): Promise<void> {
    const [attempt] = await this.dataSource.query<LoginAttemptRow[]>(
      `
        SELECT failed_count, locked_until
        FROM public.auth_login_attempts
        WHERE email = LOWER($1)
          AND tenant_slug = $2
          AND login_context = $3
          AND locked_until > NOW()
      `,
      [email, tenantSlug, context],
    );

    if (!attempt) {
      return;
    }

    await this.recordSecurityEvent({
      email,
      tenantSlug,
      context,
      eventType: AuthSecurityEventType.LOGIN_LOCKED,
      reason: 'account_locked',
      metadata: {
        failed_count: attempt.failed_count,
        locked_until: attempt.locked_until,
      },
    });

    throw new HttpException(
      'Too many failed login attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordFailure(params: {
    email: string;
    tenantSlug: string;
    context: AuthLoginContext;
    reason: string;
  }): Promise<void> {
    const [attempt] = await this.dataSource.query<LoginAttemptRow[]>(
      `
        WITH next_attempt AS (
          SELECT
            CASE
              WHEN existing.first_failed_at IS NULL
                OR existing.first_failed_at < NOW() - ($4::int * INTERVAL '1 millisecond')
                OR existing.locked_until < NOW()
              THEN 1
              ELSE existing.failed_count + 1
            END AS failed_count,
            CASE
              WHEN existing.first_failed_at IS NULL
                OR existing.first_failed_at < NOW() - ($4::int * INTERVAL '1 millisecond')
                OR existing.locked_until < NOW()
              THEN NOW()
              ELSE existing.first_failed_at
            END AS first_failed_at
          FROM (
            SELECT failed_count, first_failed_at, locked_until, 1 AS priority
            FROM public.auth_login_attempts
            WHERE email = LOWER($1)
              AND tenant_slug = $2
              AND login_context = $3
            UNION ALL
            SELECT 0, NULL::timestamptz, NULL::timestamptz, 2 AS priority
            ORDER BY priority
            LIMIT 1
          ) existing
        )
        INSERT INTO public.auth_login_attempts (
          email,
          tenant_slug,
          login_context,
          failed_count,
          first_failed_at,
          last_failed_at,
          locked_until,
          updated_at
        )
        SELECT
          LOWER($1),
          $2,
          $3,
          failed_count,
          first_failed_at,
          NOW(),
          CASE
            WHEN failed_count >= $5 THEN NOW() + ($6::int * INTERVAL '1 millisecond')
            ELSE NULL
          END,
          NOW()
        FROM next_attempt
        ON CONFLICT (email, tenant_slug, login_context)
        DO UPDATE SET
          failed_count = EXCLUDED.failed_count,
          first_failed_at = EXCLUDED.first_failed_at,
          last_failed_at = EXCLUDED.last_failed_at,
          locked_until = EXCLUDED.locked_until,
          updated_at = NOW()
        RETURNING failed_count, locked_until
      `,
      [
        params.email,
        params.tenantSlug,
        params.context,
        AUTH_LOCKOUT_WINDOW_MS,
        AUTH_LOCKOUT_FAILED_ATTEMPTS,
        AUTH_LOCKOUT_DURATION_MS,
      ],
    );

    await this.recordSecurityEvent({
      ...params,
      eventType: attempt?.locked_until
        ? AuthSecurityEventType.LOGIN_LOCKED
        : AuthSecurityEventType.LOGIN_FAILURE,
      metadata: {
        failed_count: attempt?.failed_count ?? 1,
        locked_until: attempt?.locked_until ?? null,
      },
    });
  }

  async recordSuccess(params: {
    email: string;
    tenantSlug: string;
    context: AuthLoginContext;
    userId: number;
  }): Promise<void> {
    await this.dataSource.query(
      `
        DELETE FROM public.auth_login_attempts
        WHERE email = LOWER($1)
          AND tenant_slug = $2
          AND login_context = $3
      `,
      [params.email, params.tenantSlug, params.context],
    );

    await this.recordSecurityEvent({
      email: params.email,
      tenantSlug: params.tenantSlug,
      context: params.context,
      eventType: AuthSecurityEventType.LOGIN_SUCCESS,
      metadata: { user_id: params.userId },
    });
  }

  async recordInactiveUserAttempt(params: {
    email: string;
    tenantSlug: string;
    context: AuthLoginContext;
    userId: number;
  }): Promise<void> {
    await this.recordSecurityEvent({
      email: params.email,
      tenantSlug: params.tenantSlug,
      context: params.context,
      eventType: AuthSecurityEventType.INACTIVE_USER_LOGIN,
      reason: 'inactive_user',
      metadata: { user_id: params.userId },
    });
  }

  async recordTenantMismatch(params: {
    email: string;
    userId: number;
    requestTenantSlug: string;
    tokenTenantSlug: string;
    path?: string;
    reason: string;
  }): Promise<void> {
    await this.recordSecurityEvent({
      email: params.email,
      tenantSlug: params.requestTenantSlug,
      context: AuthLoginContext.JWT_TENANT_CONTEXT,
      eventType: AuthSecurityEventType.TENANT_MISMATCH,
      reason: params.reason,
      metadata: {
        user_id: params.userId,
        request_tenant_slug: params.requestTenantSlug,
        token_tenant_slug: params.tokenTenantSlug,
        path: params.path ?? null,
      },
    });
  }

  async recordPermissionsChanged(params: {
    tenantSlug: string;
    targetUserId: number;
    performedBy: number;
    action: 'employee_created' | 'permissions_updated' | 'employee_disabled';
    targetEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.recordSecurityEvent({
      email: params.targetEmail ?? null,
      tenantSlug: params.tenantSlug,
      context: AuthLoginContext.JWT_TENANT_CONTEXT,
      eventType: AuthSecurityEventType.PERMISSIONS_CHANGED,
      reason: params.action,
      metadata: {
        target_user_id: params.targetUserId,
        performed_by: params.performedBy,
        ...params.metadata,
      },
    });
  }

  private async recordSecurityEvent(params: {
    email: string | null;
    tenantSlug: string;
    context: AuthLoginContext;
    eventType: AuthSecurityEventType;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.dataSource.query(
        `
          INSERT INTO public.auth_security_events (
            email,
            tenant_slug,
            login_context,
            event_type,
            reason,
            metadata,
            created_at
          )
          VALUES (LOWER($1), $2, $3, $4, $5, $6, NOW())
        `,
        [
          params.email,
          params.tenantSlug,
          params.context,
          params.eventType,
          params.reason ?? null,
          params.metadata ? JSON.stringify(params.metadata) : null,
        ],
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not persist auth security event: ${message}`);
    }
  }
}
