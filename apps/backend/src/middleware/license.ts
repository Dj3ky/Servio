import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// After generating keys with ServioKeygen, replace this with your public.pem content.
// Run: node generate-keys.js in the ServioKeygen project, then copy public.pem here.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5EcTH5ORAR7DJNKtHBtM
YVIfoIWynk3+Pd6n1Z7u1Wc/rl3TJjU+Y8vcaPPio4M0XtW42ZV8Ln7/o/8R9cJv
FZBVuIsuVpcVjdwgoCol/YDUOR8o8ziTLwqvWgaNfIwINoLnOOw4YxO7kZHPK6hT
gOjGtbcWTdt7A+u/g1lUroL2PCT3idK5H35wENWrOsH8lum//ub71RwqH8JKVG7q
8FI/pAIFri3KMaF13GNmd45pawY/Bygj+o1m9RLsnCcnvIX9ZoTSuRzaZs6kChi0
tyPjVq4KvYxv+Uh62HB/pTLwgrm4ks5GIOTsiNjxL7Kj1Fy82NAHVD03QPwY+Qax
iwIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_KEY_PATH = process.env.LICENSE_KEY_PATH ?? path.join(process.cwd(), 'license.key');
const PUBLIC_KEY_IS_PLACEHOLDER = PUBLIC_KEY.includes('PASTE_YOUR_PUBLIC_KEY');

export interface LicensePayload {
  customer: string;
  seats: number;
  features: string[];
  domain: string | null;
  perpetual: boolean;
  issuedAt: string;
  issuedBy: string;
  exp?: number;
}

export interface LicenseStatus {
  valid: boolean;
  customer?: string;
  seats?: number;
  features?: string[];
  domain?: string | null;
  perpetual?: boolean;
  expiresAt?: string | null;
  daysLeft?: number | null;
  issuedAt?: string;
  configured: boolean;
  error?: string;
}

let cachedStatus: LicenseStatus | null = null;

export function invalidateLicenseCache(): void {
  cachedStatus = null;
}

export function getLicenseStatus(): LicenseStatus {
  if (cachedStatus) return cachedStatus;

  if (!fs.existsSync(LICENSE_KEY_PATH)) {
    cachedStatus = { valid: false, configured: false, error: 'License file not found' };
    return cachedStatus;
  }

  const token = fs.readFileSync(LICENSE_KEY_PATH, 'utf8').trim();

  try {
    const payload = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) as LicensePayload;

    const expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
    const daysLeft = payload.exp
      ? Math.ceil((payload.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    cachedStatus = {
      valid: true,
      configured: true,
      customer: payload.customer,
      seats: payload.seats,
      features: payload.features,
      domain: payload.domain,
      perpetual: payload.perpetual ?? false,
      expiresAt,
      daysLeft,
      issuedAt: payload.issuedAt,
    };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      cachedStatus = { valid: false, configured: true, error: 'License has expired' };
    } else {
      cachedStatus = { valid: false, configured: true, error: 'Invalid license file' };
    }
  }

  return cachedStatus!;
}

export function requireValidLicense(req: Request, res: Response, next: NextFunction): void {
  // If no public key configured yet (development), skip enforcement
  if (PUBLIC_KEY_IS_PLACEHOLDER) {
    next();
    return;
  }

  const status = getLicenseStatus();

  // No license file = not configured, block access
  if (!status.valid) {
    res.status(402).json({ error: 'errors.license_invalid' });
    return;
  }

  next();
}
