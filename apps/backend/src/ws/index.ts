import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { WsEvent, WsEventType } from '@servio/shared';

let wss: WebSocketServer | null = null;

const clients = new Set<WebSocket>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });
}

export function broadcast<T>(type: WsEventType, payload: T): void {
  if (!wss) return;

  const event: WsEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(event);
  const dead: WebSocket[] = [];

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      dead.push(client);
    }
  }

  for (const ws of dead) {
    clients.delete(ws);
  }
}
