import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { DisbursementService } from './disbursement.service';

@Controller()
@UseGuards(AuthGuard)
export class DisbursementController {
  constructor(private readonly disbursement: DisbursementService) {}

  @Post('organizations/:organizationId/identity')
  verify(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Headers('x-organization-id') header: string | undefined,
    @Body() body: { legalName?: string },
  ) {
    return this.disbursement.verifyIdentity(
      request.userId,
      request.sessionId,
      sameOrg(organizationId, header),
      body.legalName ?? '',
    );
  }

  @Post('organizations/:organizationId/payout-account')
  account(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Headers('x-organization-id') header: string | undefined,
    @Body() body: { destinationRef?: string; currency?: string },
  ) {
    return this.disbursement.saveAccount(
      request.userId,
      request.sessionId,
      sameOrg(organizationId, header),
      body.destinationRef ?? '',
      body.currency ?? '',
    );
  }

  @Post('organizations/:organizationId/owners')
  owner(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Headers('x-organization-id') header: string | undefined,
    @Body() body: { email?: string },
  ) {
    return this.disbursement.addOwner(
      request.userId,
      request.sessionId,
      sameOrg(organizationId, header),
      body.email ?? '',
    );
  }

  @Get('campaigns/:campaignId/ledger')
  ledger(
    @Req() request: AuthedRequest,
    @Param('campaignId') campaignId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
  ) {
    return this.disbursement.ledger(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
    );
  }

  @Get('campaigns/:campaignId/disputes')
  disputes(
    @Req() request: AuthedRequest,
    @Param('campaignId') campaignId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
  ) {
    return this.disbursement.disputes(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
    );
  }

  @Post('campaigns/:campaignId/payouts')
  payout(
    @Req() request: AuthedRequest,
    @Param('campaignId') campaignId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: { amountMinor?: number },
  ) {
    return this.disbursement.requestPayout(
      request.userId,
      request.sessionId,
      requiredOrg(organizationId),
      campaignId,
      body.amountMinor ?? 0,
    );
  }

  @Post('payouts/:payoutId/approve')
  approve(
    @Req() request: AuthedRequest,
    @Param('payoutId') payoutId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
  ) {
    return this.disbursement.approve(
      request.userId,
      request.sessionId,
      requiredOrg(organizationId),
      payoutId,
    );
  }

  @Post('campaigns/:campaignId/ledger/report')
  report(
    @Req() request: AuthedRequest,
    @Param('campaignId') campaignId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Headers('x-surface') surface: string | undefined,
  ) {
    return this.disbursement.requestReport(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      surface ?? 'web',
    );
  }

  @Get('reports/:reportId')
  async pdf(
    @Req() request: AuthedRequest,
    @Param('reportId') reportId: string,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.disbursement.pdf(
      request.userId,
      requiredOrg(organizationId),
      reportId,
    );
    response.type('application/pdf').attachment('libro.pdf').send(file);
  }
}

function requiredOrg(organizationId: string | undefined) {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}

function sameOrg(organizationId: string, header: string | undefined) {
  if (!header || header !== organizationId)
    throw new DomainException('forbidden', 403);
  return organizationId;
}
