import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  is_read: boolean;
  created_at: string;
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

@Injectable()
export class MessagesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
    otherId: number,
    limit = 50,
    before?: number,
  ): Promise<MessageRow[]> {
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
      `SELECT * FROM (
         SELECT * FROM internal_messages
         WHERE ((sender_id = $1 AND recipient_id = $2)
             OR (sender_id = $2 AND recipient_id = $1))
           ${cursorClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ${limitParam}
       ) sub
       ORDER BY created_at ASC, id ASC`,
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
    recipientId: number,
    body: string,
  ): Promise<MessageRow> {
    const [row] = await this.dataSource.query<MessageRow[]>(
      `INSERT INTO internal_messages (sender_id, recipient_id, body)
       VALUES ($1, $2, $3) RETURNING *`,
      [senderId, recipientId, body],
    );
    return row;
  }

  /** Envío masivo a todos los inquilinos y propietarios. */
  async broadcast(senderId: number, body: string): Promise<{ count: number }> {
    const result = await this.dataSource.query<MessageRow[]>(
      `INSERT INTO internal_messages (sender_id, recipient_id, body)
       SELECT $1, u.id, $2
       FROM "user" u
       WHERE u.role IN ('INQUILINO', 'PROPIETARIO')
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
    const targetRoles =
      role === 'ADMIN' || role === 'EMPLEADO'
        ? ['INQUILINO', 'PROPIETARIO']
        : ['ADMIN', 'EMPLEADO'];

    return this.dataSource.query<RecipientRow[]>(
      `SELECT id, name, role FROM "user"
       WHERE role = ANY($1)
       ORDER BY name ASC`,
      [targetRoles],
    );
  }
}
