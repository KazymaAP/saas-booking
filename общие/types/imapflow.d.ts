// types/imapflow.d.ts — imapflow 1.0.x не объявляет "types" в package.json, поэтому TypeScript
// не видит её декларации. Здесь — минимальные типы только для методов, которые использует
// lib/inbox-sync.ts (cron check-replies). Без any: всё, что не используется, не описано.
declare module 'imapflow' {
  export interface ImapFlowOptions {
    host: string;
    port?: number;
    secure?: boolean;
    auth: { user: string; pass: string };
    logger?: false;
    // Таймауты, мс: без них зависший сервер съест весь бюджет функции.
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    // Не выполнять NOOP/IDLE в фоне — cron-подключение короткое.
    disableAutoIdle?: boolean;
  }

  export interface MailboxObject {
    path: string;
    exists: number;
    // UIDVALIDITY приходит как BigInt (RFC 3501: 32-битное беззнаковое).
    uidValidity: bigint;
    uidNext: number;
  }

  export interface MailboxLockObject {
    path: string;
    release(): void;
  }

  export interface SearchObject {
    // Диапазон UID, например "120:*".
    uid?: string;
    since?: Date;
    seen?: boolean;
  }

  export interface FetchQueryObject {
    uid?: boolean;
    size?: boolean;
    flags?: boolean;
    envelope?: boolean;
    source?: boolean;
  }

  export interface FetchMessageObject {
    seq: number;
    uid: number;
    size?: number;
    flags?: Set<string>;
    source?: Buffer;
  }

  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    // false, пока ящик не открыт.
    mailbox: MailboxObject | false;
    usable: boolean;
    connect(): Promise<void>;
    logout(): Promise<void>;
    close(): void;
    getMailboxLock(path: string): Promise<MailboxLockObject>;
    search(query: SearchObject, options?: { uid?: boolean }): Promise<number[] | false>;
    fetch(range: string | number[], query: FetchQueryObject, options?: { uid?: boolean }): AsyncIterableIterator<FetchMessageObject>;
    fetchOne(range: string, query: FetchQueryObject, options?: { uid?: boolean }): Promise<FetchMessageObject | false>;
    messageFlagsAdd(range: string | number[], flags: string[], options?: { uid?: boolean }): Promise<boolean>;
  }
}
