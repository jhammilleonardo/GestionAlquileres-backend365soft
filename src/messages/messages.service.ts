import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { StorageService } from '../common/storage/storage.service';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import { NotificationsGateway } from '../notifications/notifications.gateway';

export interface MessageAttachmentRow {
  id: number;
  message_id: number | null;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface MessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  is_read: boolean;
  created_at: string;
  attachments: MessageAttachmentRow[];
}

export interface ThreadRow {
  user_id: number;
  user_name: string;
  user_role: string;
  last_message: string;
  last_at: string;
  unread: number;
}

export interface RecipientRow {
  id: number;
  name: string;
  role: string;
}

type MessageRole = string;

// Agrega los adjuntos de cada mensaje como JSON; '[]' cuando no hay ninguno.
const ATTACHMENTS_AGG = `
  COALESCE(
    json_agg(
      json_build_object(
        'id', ima.id,
        'message_id', ima.message_id,
        'file_url', ima.file_url,
        'file_name', ima.file_name,
        'file_type', ima.file_type,
        'file_size', ima.file_size,
        'created_at', ima.created_at
      )
    ) FILTER (WHERE ima.id IS NOT NULL),
    '[]'
  )`;

@Injectable()
export class MessagesService {
  private readonly staffRoles = new Set(['ADMIN', 'SUPERADMIN', 'EMPLEADO']);
  private readonly externalRoles = new Set([
    'INQUILINO',
    'PROPIETARIO',
    'VENDOR',
  ]);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /** Bandeja de entrada: hilos agrupados por el otro participante. */
  async getThreads(userId: number): Promise<ThreadRow[]> {
    return this.dataSource.query<ThreadRow[]>(
      `
      WITH conv AS (
        SELECT
          CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
          body, created_at
        FROM internal_messages
        WHERE sender_id = $1 OR recipient_id = $1
      ),
      ranked AS (
        SELECT other_id, body, created_at,
               ROW_NUMBER() OVER (PARTITION BY other_id ORDER BY created_at DESC) AS rn
        FROM conv
      )
      SELECT r.other_id AS user_id,
             u.name      AS user_name,
             u.role      AS user_role,
             r.body      AS last_message,
             r.created_at AS last_at,
             (SELECT COUNT(*)::int FROM internal_messages m
                WHERE m.recipient_id = $1 AND m.sender_id = r.other_id AND m.is_read = false) AS unread
      FROM ranked r
      JOIN "user" u ON u.id = r.other_id
      WHERE r.rn = 1
      ORDER BY r.created_at DESC
      `,
      [userId],
    );
  }

  /** Conversación completa con otro usuario; marca como leídos los recibidos. */
  async getThread(
    userId: number,
    userRole: string,
    otherId: number,
    limit = 50,
    before?: number,
  ): Promise<MessageRow[]> {
    await this.assertCanInteract(userId, userRole, otherId);

    // Paginación por cursor: se devuelven los `limit` mensajes más recientes
    // anteriores a `before` (id), y luego se ordenan ascendente para mostrarlos.
    const params: number[] = [userId, otherId];
    let cursorClause = '';
    if (before) {
      params.push(before);
      cursorClause = `AND id < $${params.length}`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;

    const messages = await this.dataSource.query<MessageRow[]>(
      `SELECT sub.*, ${ATTACHMENTS_AGG} AS attachments
       FROM (
         SELECT * FROM internal_messages
         WHERE ((sender_id = $1 AND recipient_id = $2)
             OR (sender_id = $2 AND recipient_id = $1))
           ${cursorClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limitParam}
       ) sub
       LEFT JOIN internal_message_attachments ima ON ima.message_id = sub.id
       GROUP BY sub.id, sub.sender_id, sub.recipient_id, sub.body, sub.is_read,
                sub.read_at, sub.created_at
       ORDER BY sub.created_at ASC, sub.id ASC`,
      params,
    );

    await this.dataSource.query(
      `UPDATE internal_messages SET is_read = true, read_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND is_read = false`,
      [userId, otherId],
    );

    return messages;
  }

  async send(
    senderId: number,
    senderRole: string,
    recipientId: number,
    body: string,
    files: string[] = [],
    tenantSlug?: string,
  ): Promise<MessageRow> {
    const normalizedBody = (body ?? '').trim();

    if (!normalizedBody && files.length === 0) {
      throw new BadRequestException('El mensaje o un adjunto es obligatorio');
    }

    await this.assertCanInteract(senderId, senderRole, recipientId);

    const messageId = await runTenantTransaction(
      this.dataSource,
      async (queryRunner) => {
        const [row] = (await queryRunner.query(
          `INSERT INTO internal_messages (sender_id, recipient_id, body)
           VALUES ($1, $2, $3) RETURNING id`,
          [senderId, recipientId, normalizedBody],
        )) as { id: number }[];

        if (files.length > 0) {
          await this.linkMessageFiles(queryRunner, row.id, senderId, files);
        }

        return row.id;
      },
    );

    const message = await this.findMessageWithAttachments(messageId);
    this.emitMessageEvent(tenantSlug, senderId, recipientId, message);
    return message;
  }

  /**
   * Persiste los archivos subidos vía multer como adjuntos sin mensaje aún
   * (message_id = NULL). Se enlazan al mensaje en el envío posterior.
   */
  async saveUploadedFiles(
    files: Express.Multer.File[],
    userId: number,
    tenantSlug: string,
  ): Promise<MessageAttachmentRow[]> {
    const saved: MessageAttachmentRow[] = [];

    for (const file of files) {
      const storagePath = await this.storageService.persistUploadedFile(
        file,
        this.storageService.buildStoragePath(
          'messages',
          tenantSlug,
          String(userId),
          file.filename,
        ),
        'private',
      );

      const fileUrl = this.storageService.toRoutePath(storagePath);
      const [row] = await this.dataSource.query<MessageAttachmentRow[]>(
        `INSERT INTO internal_message_attachments
           (message_id, file_url, file_name, file_type, file_size, uploaded_by)
         VALUES (NULL, $1, $2, $3, $4, $5)
         RETURNING *`,
        [
          fileUrl,
          file.originalname,
          this.getFileType(file.originalname),
          file.size,
          userId,
        ],
      );
      saved.push(row);
    }

    return saved;
  }

  private async linkMessageFiles(
    queryRunner: QueryRunner,
    messageId: number,
    userId: number,
    files: string[],
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE internal_message_attachments
       SET message_id = $1
       WHERE message_id IS NULL
         AND uploaded_by = $2
         AND file_url = ANY($3)`,
      [messageId, userId, files],
    );
  }

  private async findMessageWithAttachments(
    messageId: number,
  ): Promise<MessageRow> {
    const [row] = await this.dataSource.query<MessageRow[]>(
      `SELECT m.*, ${ATTACHMENTS_AGG} AS attachments
       FROM internal_messages m
       LEFT JOIN internal_message_attachments ima ON ima.message_id = m.id
       WHERE m.id = $1
       GROUP BY m.id`,
      [messageId],
    );
    return row;
  }

  private emitMessageEvent(
    tenantSlug: string | undefined,
    senderId: number,
    recipientId: number,
    message: MessageRow,
  ): void {
    if (!tenantSlug) {
      return;
    }

    this.notificationsGateway.emitUserEvent(
      tenantSlug,
      recipientId,
      'message.new',
      {
        messageId: message.id,
        peerUserId: senderId,
        senderId,
        recipientId,
      },
    );

    this.notificationsGateway.emitUserEvent(
      tenantSlug,
      senderId,
      'message.new',
      {
        messageId: message.id,
        peerUserId: recipientId,
        senderId,
        recipientId,
      },
    );
  }

  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';
    return 'unknown';
  }

  /** Envío masivo a todos los inquilinos y propietarios. */
  async broadcast(
    senderId: number,
    senderRole: string,
    body: string,
  ): Promise<{ count: number }> {
    if (!this.isStaffRole(senderRole)) {
      throw new ForbiddenException('No autorizado para envío masivo');
    }

    const result = await this.dataSource.query<MessageRow[]>(
      `INSERT INTO internal_messages (sender_id, recipient_id, body)
       SELECT $1, u.id, $2
       FROM "user" u
       WHERE u.role IN ('INQUILINO', 'PROPIETARIO', 'VENDOR')
         AND u.is_active = true
       RETURNING id`,
      [senderId, body],
    );
    return { count: result.length };
  }

  async unreadCount(userId: number): Promise<{ count: number }> {
    const [row] = await this.dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM internal_messages
       WHERE recipient_id = $1 AND is_read = false`,
      [userId],
    );
    return { count: row?.count ?? 0 };
  }

  /** Destinatarios posibles según el rol del solicitante. */
  async getRecipients(role: string): Promise<RecipientRow[]> {
    const targetRoles = this.isStaffRole(role)
      ? ['INQUILINO', 'PROPIETARIO', 'VENDOR']
      : ['ADMIN', 'SUPERADMIN', 'EMPLEADO'];

    return this.dataSource.query<RecipientRow[]>(
      `SELECT id, name, role FROM "user"
       WHERE role = ANY($1)
         AND is_active = true
       ORDER BY name ASC`,
      [targetRoles],
    );
  }

  private async assertCanInteract(
    currentUserId: number,
    currentUserRole: MessageRole,
    otherUserId: number,
  ): Promise<void> {
    if (currentUserId === otherUserId) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo');
    }

    const [recipient] = await this.dataSource.query<Array<{ role: string }>>(
      `SELECT role FROM "user" WHERE id = $1 AND is_active = true`,
      [otherUserId],
    );

    if (!recipient) {
      throw new ForbiddenException('Destinatario no permitido');
    }

    const currentIsStaff = this.isStaffRole(currentUserRole);
    const otherIsStaff = this.isStaffRole(recipient.role);
    const currentIsExternal = this.isExternalRole(currentUserRole);
    const otherIsExternal = this.isExternalRole(recipient.role);

    const allowed =
      (currentIsStaff && otherIsExternal) ||
      (currentIsExternal && otherIsStaff);

    if (!allowed) {
      throw new ForbiddenException('Destinatario no permitido');
    }
  }

  private isStaffRole(role: MessageRole): boolean {
    return this.staffRoles.has(role);
  }

  private isExternalRole(role: MessageRole): boolean {
    return this.externalRoles.has(role);
  }
}
