import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  MessageEvent,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { MedicionService } from './medicion.service';

@Controller('public/campaigns')
export class VisitaController {
  constructor(private readonly medicion: MedicionService) {}

  @Post(':slug/visits')
  @HttpCode(204)
  visit(
    @Param('slug') slug: string,
    @Body()
    body: {
      anonymousId?: string;
      eventType?: string;
      referrer?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      website?: string;
    },
    @Req() request: AuthedRequest,
  ) {
    return this.medicion.record(
      slug,
      body,
      request.header('user-agent'),
      request.ip ?? '',
    );
  }
}

@Controller()
export class MedicionController {
  constructor(private readonly medicion: MedicionService) {}

  @Get('campaigns/:campaignId/metrics')
  @UseGuards(AuthGuard)
  metrics(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.medicion.metrics(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      from,
      to,
    );
  }

  @Get('campaigns/:campaignId/conversion')
  @UseGuards(AuthGuard)
  conversion(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.medicion.conversion(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      from,
      to,
    );
  }

  @Get('campaigns/:campaignId/conversion.csv')
  @UseGuards(AuthGuard)
  async conversionCsv(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Res() response: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const file = await this.medicion.conversionCsv(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      from,
      to,
    );
    response.type('text/csv').attachment('conversion.csv').send(file);
  }

  @Post('campaigns/:campaignId/spend')
  @UseGuards(AuthGuard)
  spend(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      network?: string;
      periodStart?: string;
      periodEnd?: string;
      amountMinor?: number;
      currency?: string;
    },
  ) {
    return this.medicion.saveSpend(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      body,
    );
  }

  @Post('campaigns/:campaignId/spend/:spendId/close')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  close(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Param('spendId') spendId: string,
  ) {
    return this.medicion.closeSpend(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      spendId,
    );
  }

  @Put('campaigns/:campaignId/spend/:spendId')
  @UseGuards(AuthGuard)
  revise(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Param('spendId') spendId: string,
    @Body() body: { amountMinor?: number },
  ) {
    return this.medicion.reviseSpend(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      spendId,
      body.amountMinor,
    );
  }

  @Sse('organizations/:organizationId/events')
  @UseGuards(AuthGuard)
  events(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.medicion.events(request.userId, organizationId);
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
