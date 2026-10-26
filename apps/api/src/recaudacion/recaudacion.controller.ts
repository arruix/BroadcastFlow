import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { RecaudacionService, type DonationInput } from './recaudacion.service';

@Controller()
export class RecaudacionController {
  constructor(private readonly recaudacion: RecaudacionService) {}

  @Get('public/campaigns/:slug')
  readPublic(@Param('slug') slug: string) {
    return this.recaudacion.readPublic(slug);
  }

  @Post('public/campaigns/:slug/donations')
  start(
    @Param('slug') slug: string,
    @Body() body: DonationInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.recaudacion.start(
      slug,
      body,
      idempotencyKey,
      request.ip ?? 'local',
    );
  }

  @Get('public/donations/:donationId')
  receipt(@Param('donationId') donationId: string) {
    return this.recaudacion.receipt(donationId);
  }

  @Post('public/donations/:donationId/pay')
  @HttpCode(200)
  pay(@Param('donationId') donationId: string) {
    return this.recaudacion.payDonation(donationId);
  }

  @Post('donations/:donationId/rights')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  rights(
    @Req() request: AuthedRequest,
    @Param('donationId') donationId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: { action?: string; donorName?: string; donorEmail?: string },
  ) {
    if (!organizationId) throw new DomainException('forbidden', 403);
    return this.recaudacion.rights(
      request.userId,
      organizationId,
      donationId,
      body,
    );
  }
}
