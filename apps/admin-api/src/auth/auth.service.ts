import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PgService } from '../db/pg.service';

const BCRYPT_ROUNDS = 12;
const REFRESH_DAYS = 7;

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly pg: PgService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ id: string }> {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const { rows } = await this.pg.query<{ id: string }>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [email.toLowerCase(), hash],
      );
      this.logger.log(`user registered: ${rows[0].id}`);
      return rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({ error: 'email_taken' });
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<UserRow> {
    const { rows } = await this.pg.query<UserRow>(
      `SELECT id, email, password_hash
         FROM users
        WHERE email = $1`,
      [email.toLowerCase()],
    );

    const user = rows[0];
    const hashToCheck =
      user?.password_hash ??
      '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';

    const ok = await bcrypt.compare(password, hashToCheck);

    if (!user || !ok) {
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }

    return user;
  }

  async issueTokens(user: { id: string; email: string }): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.pg.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '${REFRESH_DAYS} days')`,
      [user.id, tokenHash],
    );

    return { accessToken, refreshToken };
  }

  async rotateRefresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const { rows } = await this.pg.query<{ user_id: string; email: string }>(
      `UPDATE refresh_tokens rt
          SET revoked_at = now()
         FROM users u
        WHERE rt.token_hash = $1
          AND rt.user_id = u.id
          AND rt.revoked_at IS NULL
          AND rt.expires_at > now()
        RETURNING rt.user_id, u.email`,
      [tokenHash],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException({ error: 'invalid_refresh' });
    }

    return this.issueTokens({ id: rows[0].user_id, email: rows[0].email });
  }

  async revokeRefresh(rawToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.pg.query(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL`,
      [tokenHash],
    );
  }
}