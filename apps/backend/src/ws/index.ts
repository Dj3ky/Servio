import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { WsEvent, WsEventType } from '@servio/shared';
import { resolveAuth } from '../middleware/auth';
import { getUserAccess } from '../services/userAccessService';

let wss: WebSocketServer | null = null;

// Connected sockets and the id of the user each one belongs to
const clients = new Map<WebSocket, string>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const auth = resolveAuth(token);
    if (!auth) {
      ws.close(4001, 'Invalid token');
      return;
    }

    clients.set(ws, auth.userId);

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

  for (const [client, userId] of clients) {
    // Looked up per send so a role change applies to sockets that are already open
    const access = getUserAccess(userId);
    if (client.readyState !== WebSocket.OPEN) {
      dead.push(client);
    } else if (toClient({ userId, role: access?.isActive ? access.role : '' })) {
      client.send(message);
    }
  }

  for (const ws of dead) {
    clients.delete(ws);
  }
}
