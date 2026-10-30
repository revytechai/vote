import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface RegisterDto {
  handle: string;
  email: string;
  password?: string;
  teamName?: string;
  role?: string;
}

export interface LoginDto {
  login: string;
  password?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MiB standard RFC recommendation
      timeCost: 2,
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async register(dto: RegisterDto) {
    const handle = dto.handle?.trim();
    const email = dto.email?.trim().toLowerCase();

    if (!handle || handle.length < 3) {
      throw new BadRequestException('Handle must be at least 3 characters long');
    }
    if (!email?.includes('@')) {
      throw new BadRequestException('A valid email address is required');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ handle }, { email }],
      },
    });

    if (existingUser) {
      if (existingUser.handle === handle) {
        throw new ConflictException('Handle already in use');
      }
      throw new ConflictException('Email already in use');
    }

    let passwordHash: string | null = null;
    if (dto.password) {
      passwordHash = await this.hashPassword(dto.password);
    }

    let teamId: number | null = null;
    if (dto.teamName?.trim()) {
      const team = await this.prisma.team.create({
        data: { name: dto.teamName.trim() },
      });
      teamId = team.id;
    }

    const assignedRole = dto.role && ['superuser', 'manager', 'sponsor', 'viewer', 'participant'].includes(dto.role)
      ? dto.role
      : 'participant';

    const user = await this.prisma.user.create({
      data: {
        handle,
        email,
        passwordHash,
        teamId,
        roles: {
          create: [{ role: assignedRole }],
        },
      },
      include: {
        team: true,
        roles: true,
      },
    });

    return {
      message: 'Registration successful',
      handle: user.handle,
      roles: user.roles.map((r) => r.role),
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
    };
  }

  async login(dto: LoginDto) {
    const login = dto.login?.trim();
    const password = dto.password || '';

    if (!login) {
      throw new BadRequestException('Login identifier is required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ handle: login }, { email: login.toLowerCase() }],
      },
      include: {
        roles: true,
        team: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lockout: 5 failures locks account for 15 minutes
    const now = new Date();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      const remainingMs = user.lockoutUntil.getTime() - now.getTime();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new HttpException(
        `Account locked out due to multiple failed login attempts. Try again in ${remainingMin} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password login not enabled for this user');
    }

    const isValid = await this.verifyPassword(user.passwordHash, password);

    if (!isValid) {
      const attempts = user.failedLoginAttempts + 1;
      let lockoutUntil: Date | null = null;
      if (attempts >= 5) {
        lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockoutUntil,
          lastLoginAttempt: now,
        },
      });

      if (attempts >= 5) {
        throw new HttpException(
          'Account locked out for 15 minutes after 5 failed login attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Login successful: reset lockout counters
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastLoginAttempt: now,
      },
    });

    // Create session in database
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      sessionId,
      expiresAt,
      user: {
        id: user.id,
        handle: user.handle,
        roles: user.roles.map((r) => r.role),
        team: user.team ? { id: user.team.id, name: user.team.name } : null,
      },
    };
  }

  async logout(sessionId: string | undefined) {
    if (sessionId) {
      await this.prisma.session
        .delete({ where: { id: sessionId } })
        .catch(() => {});
    }
  }
}
