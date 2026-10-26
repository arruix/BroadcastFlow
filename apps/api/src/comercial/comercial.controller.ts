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
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { ComercialService } from './comercial.service';

@Controller()
export class ComercialController {
  constructor(private readonly comercial: ComercialService) {}

  @Get('plans')
  plans() {
    return this.comercial.plans();
  }

  @Get('subscription')
  @UseGuards(AuthGuard)
  current(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.comercial.current(request.userId, requiredOrg(organizationId));
  }

  @Post('subscriptions/checkout')
  @UseGuards(AuthGuard)
  checkout(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: { plan?: string },
  ) {
    return this.comercial.checkout(
      request.userId,
      requiredOrg(organizationId),
      body.plan,
      request.sessionId,
    );
  }

  @Post('subscriptions/checkout/result')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  result(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: { invoiceId?: string; outcome?: string },
  ) {
    return this.comercial.devResult(
      request.userId,
      requiredOrg(organizationId),
      body.invoiceId,
      body.outcome,
    );
  }

  @Post('subscriptions/cancel')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  cancel(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.comercial.cancel(request.userId, requiredOrg(organizationId));
  }

  @Post('subscriptions/downgrade')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  downgrade(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.comercial.downgrade(
      request.userId,
      requiredOrg(organizationId),
    );
  }

  @Post('invoices/:invoiceId/cfdi')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  retry(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.comercial.retryCfdi(
      request.userId,
      requiredOrg(organizationId),
      invoiceId,
    );
  }

  @Post('webhooks/billing')
  @HttpCode(200)
  billing(@Req() request: RawBodyRequest<Request>) {
    return this.comercial.settle(
      request.rawBody,
      request.header('stripe-signature'),
    );
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
