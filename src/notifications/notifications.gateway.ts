import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type RealtimeNotificationEvent =
  | 'payment.received'
  | 'payment.approved'
  | 'maintenance.new'
  | 'maintenance.updated'
  | 'contract.signed'
  | 'screening.completed'
  | 'message.new';

interface SocketJwtPayload {
  sub: number | string;
  email: string;
  role: string;
  tenantSlug: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.rejectConnection(client, 'Missing auth token');
      return;
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      this.rejectConnection(client, 'JWT secret not configured');
      return;
    }

    let payload: SocketJwtPayload | null = null;
    try {
      payload = this.parseSocketJwtPayload(
        this.jwtService.verify(token, { secret }) as unknown,
      );
    } catch {
      this.rejectConnection(client, 'Invalid auth token');
      return;
    }

    if (!payload) {
      this.rejectConnection(client, 'Invalid token payload');
      return;
    }

    const requestedTenantSlug = this.extractRequestedTenantSlug(client);
    if (
      requestedTenantSlug &&
      requestedTenantSlug.trim() !== payload.tenantSlug
    ) {
      this.rejectConnection(client, 'Tenant mismatch');
      return;
    }

    const tenantSlug = payload.tenantSlug;
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      this.rejectConnection(client, 'Invalid user id');
      return;
    }

    const socketData = client.data as {
      userId: number;
      email: string;
      role: string;
      tenantSlug: string;
    };
    socketData.userId = userId;
    socketData.email = payload.email;
    socketData.role = payload.role;
    socketData.tenantSlug = tenantSlug;

    void client.join(this.getTenantRoom(tenantSlug));
    void client.join(this.getUserRoom(tenantSlug, userId));
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  emitTenantEvent(
    tenantSlug: string,
    event: RealtimeNotificationEvent,
    payload: Record<string, unknown>,
  ): void {
    this.server.to(this.getTenantRoom(tenantSlug)).emit(event, payload);
  }

  emitUserEvent(
    tenantSlug: string,
    userId: number,
    event: RealtimeNotificationEvent,
    payload: Record<string, unknown>,
  ): void {
    this.server.to(this.getUserRoom(tenantSlug, userId)).emit(event, payload);
  }

  getTenantRoom(tenantSlug: string): string {
    return `tenant:${tenantSlug}`;
  }

  getUserRoom(tenantSlug: string, userId: number): string {
    return `tenant:${tenantSlug}:user:${userId}`;
  }

  private rejectConnection(client: Socket, reason: string): void {
    this.logger.warn(`Socket connection rejected (${client.id}): ${reason}`);
    client.disconnect(true);
  }

  private extractToken(client: Socket): string | null {
    const authToken = this.normalizeString(
      (client.handshake.auth as Record<string, unknown> | undefined)?.token,
    );
    const headerToken = this.extractTokenFromAuthorizationHeader(
      client.handshake.headers.authorization,
    );
    const queryToken = this.normalizeString(
      (client.handshake.query as Record<string, unknown> | undefined)?.token,
    );

    return this.normalizeBearerToken(authToken ?? headerToken ?? queryToken);
  }

  private extractRequestedTenantSlug(client: Socket): string | null {
    const authTenantSlug = this.normalizeString(
      (client.handshake.auth as Record<string, unknown> | undefined)
        ?.tenantSlug,
    );
    if (authTenantSlug) {
      return authTenantSlug;
    }

    const queryValue = (client.handshake.query as Record<string, unknown>)
      ?.tenantSlug;
    if (Array.isArray(queryValue)) {
      return this.normalizeString(queryValue[0]);
    }

    return this.normalizeString(queryValue);
  }

  private extractTokenFromAuthorizationHeader(
    authorizationHeader?: string,
  ): string | null {
    if (!authorizationHeader) {
      return null;
    }

    const trimmed = authorizationHeader.trim();
    if (trimmed.length === 0) {
      return null;
    }

    if (trimmed.startsWith('Bearer ')) {
      return this.normalizeString(trimmed.slice(7));
    }

    return this.normalizeString(trimmed);
  }

  private normalizeBearerToken(token: string | null): string | null {
    if (!token) {
      return null;
    }

    if (token.startsWith('Bearer ')) {
      return this.normalizeString(token.slice(7));
    }

    return this.normalizeString(token);
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseSocketJwtPayload(payload: unknown): SocketJwtPayload | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const parsed = payload as Record<string, unknown>;
    const sub = parsed.sub;
    const email = parsed.email;
    const role = parsed.role;
    const tenantSlug = parsed.tenantSlug;

    const hasValidSub = typeof sub === 'number' || typeof sub === 'string';
    if (
      !hasValidSub ||
      typeof email !== 'string' ||
      typeof role !== 'string' ||
      typeof tenantSlug !== 'string'
    ) {
      return null;
    }

    return {
      sub,
      email,
      role,
      tenantSlug,
    };
  }
}
