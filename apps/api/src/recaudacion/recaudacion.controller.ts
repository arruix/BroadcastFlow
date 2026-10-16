import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
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
    return this.recaudacion.start(slug, body, idempotencyKey, request.ip ?? 'local');
  }

  @Get('public/donations/:donationId')
  receipt(@Param('donationId') donationId: string) {
    return this.recaudacion.receipt(donationId);
  }
}
