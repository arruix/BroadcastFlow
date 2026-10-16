import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MailService } from '../mail/mail.service';
import { DomainException } from '../shared/domain';
import { IssuedSession, IdentidadService } from './identidad.service';
import { AuthGuard, type AuthedRequest } from './auth.guard';

const refreshCookie = 'bf_refresh';

@Controller('auth')
export class IdentidadController {
  constructor(
    private readonly identidad: IdentidadService,
    private readonly mail: MailService,
  ) {}

  @Post('register')
  async register(@Body() body: { email?: string; password?: string }) {
    await this.identidad.register(body.email ?? '', body.password ?? '');
  }

  @Post('verify')
  @HttpCode(204)
  async verify(@Body() body: { token?: string }) {
    await this.identidad.verifyEmail(body.token ?? '');
  }

  @Post('verify/resend')
  @HttpCode(204)
  async resend(@Body() body: { email?: string }) {
    await this.identidad.resendVerification(body.email ?? '');
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email?: string; password?: string; totp?: string; recoveryCode?: string },
    @Headers('x-surface') surface: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.identidad.login(body.email ?? '', body.password ?? '', surfaceOf(surface), body.totp, body.recoveryCode);
    if ('code' in result) throw new DomainException(result.code, 401, result.ticket);
    return present(result, surface, response);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Headers('x-surface') surface: string | undefined, @Res({ passthrough: true }) response: Response) {
    const raw = readCookie(request.headers.cookie, refreshCookie);
    const session = await this.identidad.refresh(raw ?? '', surfaceOf(surface));
    return present(session, surface, response);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.identidad.logout(readCookie(request.headers.cookie, refreshCookie) ?? '');
    response.clearCookie(refreshCookie, { path: '/v1/auth' });
  }

  @Post('password/forgot')
  @HttpCode(204)
  forgot(@Body() body: { email?: string }) {
    return this.identidad.forgotPassword(body.email ?? '');
  }

  @Post('password/reset')
  @HttpCode(204)
  reset(@Body() body: { token?: string; password?: string }) {
    return this.identidad.resetPassword(body.token ?? '', body.password ?? '');
  }

  @Post('mfa/enroll')
  @HttpCode(200)
  enroll(@Body() body: { ticket?: string }) {
    return this.identidad.enroll(body.ticket ?? '');
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  async confirm(
    @Body() body: { ticket?: string; code?: string },
    @Headers('x-surface') surface: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identidad.confirm(body.ticket ?? '', body.code ?? '', surfaceOf(surface));
    const presented = present(session, surface, response);
    return { ...presented, recoveryCodes: session.recoveryCodes };
  }

  @Post('step-up')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  stepUp(@Req() request: AuthedRequest, @Body() body: { code?: string }) {
    return this.identidad.stepUp(request.userId, request.sessionId, body.code ?? '');
  }

  @Post('oauth/:provider/start')
  start(@Param('provider') provider: string) {
    return this.identidad.startOAuth(providerOf(provider));
  }

  @Post('oauth/:provider/callback')
  callback() {
    throw new DomainException('oauth_not_configured', 422);
  }

  @Post('oauth/:provider/link')
  @UseGuards(AuthGuard)
  link() {
    throw new DomainException('oauth_not_configured', 422);
  }

  @Get('dev/mailbox')
  mailbox() {
    if (process.env.NODE_ENV === 'production') throw new DomainException('forbidden', 403);
    return this.mail.sent;
  }
}

function present(session: IssuedSession, surface: string | undefined, response: Response) {
  response.cookie(refreshCookie, session.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/v1/auth',
  });
  return {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    ...(surfaceOf(surface) === 'tablet' ? { refreshToken: session.refreshToken } : {}),
  };
}

function surfaceOf(surface: string | undefined): string {
  return surface === 'tablet' ? 'tablet' : 'web';
}

function providerOf(value: string): 'google' | 'microsoft' {
  if (value === 'google' || value === 'microsoft') return value;
  throw new DomainException('oauth_not_configured', 422);
}

function readCookie(header: string | undefined, name: string): string | undefined {
  const parts = header?.split(';') ?? [];
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
