import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { WsEvent, WsEventType } from '@servio/shared';
import { AuthPayload } from '../middleware/auth';

let wss: WebSocketServer | null = null;

// Connected sockets and the user each one belongs to
const clients = new Map<WebSocket, { userId: string; role: string }>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    let auth: AuthPayload;
    try {
      auth = jwt.verify(token, config.jwtSecret) as AuthPayload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    clients.set(ws, { userId: auth.userId, role: auth.role });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });
}

export function broadcast<T>(type: WsEventType, payload: T): void {
  send(type, payload, () => true);
}

// Sends only to the sockets of one user (all their open tabs / windows)
export function sendToUser<T>(userId: string, type: WsEventType, payload: T): void {
  send(type, payload, (c) => c.userId === userId);
}

// Sends only to users whose role is in `roles`
export function sendToRoles<T>(roles: string[], type: WsEventType, payload: T): void {
  send(type, payload, (c) => roles.includes(c.role));
}

function send<T>(type: WsEventType, payload: T, toClient: (c: { userId: string; role: string }) => boolean): void {
  if (!wss) return;

  const event: WsEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(event);
  const dead: WebSocket[] = [];

  for (const [client, info] of clients) {
    if (client.readyState !== WebSocket.OPEN) {
      dead.push(client);
    } else if (toClient(info)) {
      client.send(message);
    }
  }

  for (const ws of dead) {
    clients.delete(ws);
  }
}
