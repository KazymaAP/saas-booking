// types/imapflow.d.ts - imapflow 1.0.x ships without TypeScript declarations.
// Minimal typing for the calls used in app/api/cron/check-replies/route.ts.
declare module 'imapflow' {
  export interface ImapFlowOptions {
    host: string;
    port?: number;
    secure?: boolean;
    auth: { user: string; pass: string };
    logger?: false | object;
  }
  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    close(): Promise<void>;
    getMailboxLock(path: string): Promise<{ release(): void }>;
    search(query: object, options?: { uid?: boolean }): Promise<number[] | false>;
    fetchOne(
      range: string,
      query: { envelope?: boolean; source?: boolean },
      options?: { uid?: boolean },
    ): Promise<any>;
    messageFlagsAdd(range: string, flags: string[], options?: { uid?: boolean }): Promise<boolean>;
  }
}
