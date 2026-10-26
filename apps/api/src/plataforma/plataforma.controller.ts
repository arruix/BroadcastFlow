import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { PlataformaService } from './plataforma.service';

@Controller()
@UseGuards(AuthGuard)
export class PlataformaController {
  constructor(private readonly plataforma: PlataformaService) {}

  @Get('platform/summary')
  summary(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface?: string,
  ) {
    return this.plataforma.summary(request.userId, surface ?? 'web');
  }

  @Get('platform/organizations')
  organizations(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface?: string,
  ) {
    return this.plataforma.organizations(request.userId, surface ?? 'web');
  }

  @Post('platform/organizations')
  create(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Body() body: { name?: string; country?: string; ownerEmail?: string },
  ) {
    return this.plataforma.createOrganization(
      request.userId,
      surface ?? 'web',
      body.name ?? '',
      body.country ?? '',
      body.ownerEmail ?? '',
    );
  }

  @Post('platform/organizations/:organizationId/support')
  support(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('organizationId') organizationId: string,
  ) {
    return this.plataforma.enterSupport(
      request.userId,
      surface ?? 'web',
      organizationId,
    );
  }

  @Get('platform/campaigns')
  campaigns(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface?: string,
  ) {
    return this.plataforma.campaigns(request.userId, surface ?? 'web');
  }

  @Post('platform/campaigns/:campaignId/pause')
  pause(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.plataforma.pauseCampaign(
      request.userId,
      surface ?? 'web',
      campaignId,
    );
  }

  @Get('platform/income')
  income(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface?: string,
  ) {
    return this.plataforma.income(request.userId, surface ?? 'web');
  }

  @Get('platform/income.csv')
  async csv(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.plataforma.incomeCsv(
      request.userId,
      surface ?? 'web',
    );
    response.type('text/csv').attachment('ingresos.csv').send(file);
  }

  @Get('platform/payments')
  payments(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface?: string,
  ) {
    return this.plataforma.payments(request.userId, surface ?? 'web');
  }

  @Post('platform/webhooks/:webhookId/retry')
  retry(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('webhookId') webhookId: string,
  ) {
    return this.plataforma.retryWebhook(
      request.userId,
      surface ?? 'web',
      webhookId,
    );
  }

  @Get('platform/users')
  users(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Query('q') query?: string,
  ) {
    return this.plataforma.users(request.userId, surface ?? 'web', query ?? '');
  }

  @Post('platform/users/:userId/block')
  block(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('userId') userId: string,
  ) {
    return this.plataforma.blockUser(request.userId, surface ?? 'web', userId);
  }

  @Post('platform/users/:userId/sessions')
  sessions(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('userId') userId: string,
  ) {
    return this.plataforma.closeSessions(
      request.userId,
      surface ?? 'web',
      userId,
    );
  }

  @Post('platform/users/:userId/remove')
  remove(
    @Req() request: AuthedRequest,
    @Headers('x-surface') surface: string | undefined,
    @Param('userId') userId: string,
  ) {
    return this.plataforma.removeUser(request.userId, surface ?? 'web', userId);
  }

  @Get('support-access')
  supportAccess(@Req() request: AuthedRequest) {
    return this.plataforma.supportAccess(request.userId);
  }
}
