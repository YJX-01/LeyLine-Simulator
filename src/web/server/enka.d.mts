import type { IncomingMessage, ServerResponse } from 'node:http';
export function validEnkaUid(uid: unknown): boolean;
export function lookupEnka(uid: string): Promise<string>;
export function serveEnka(request: IncomingMessage, response: ServerResponse, uid: string): Promise<void>;
