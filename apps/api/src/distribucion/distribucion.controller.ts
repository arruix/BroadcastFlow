import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { DistribucionService } from './distribucion.service';

@Controller('connections')
export class ConexionController {
  constructor(private readonly distribucion: DistribucionService) {}

  @Post('facebook/start')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  start(@Req() request: AuthedRequest, @Headers('x-organization-id') organizationId?: string) {
    return this.distribucion.startFacebook(request.userId, requiredOrg(organizationId));
  }

  @Post('facebook/callback')
  @HttpCode(200)
  finish(@Body() body: { state?: string; pageId?: string; scopes?: string[] }) {
    return this.distribucion.finishFacebook(body);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@Req() request: AuthedRequest, @Headers('x-organization-id') organizationId?: string) {
    return this.distribucion.listConnections(request.userId, requiredOrg(organizationId));
  }
}

@Controller()
@UseGuards(AuthGuard)
export class DistribucionController {
  constructor(private readonly distribucion: DistribucionService) {}

  @Put('campaigns/:campaignId/share')
  @HttpCode(200)
  share(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body() body: { title?: string; description?: string; imageKey?: string | null },
  ) {
    return this.distribucion.saveShare(request.userId, requiredOrg(organizationId), campaignId, body);
  }

  @Post('campaigns/:campaignId/content-items')
  createItem(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.distribucion.createItem(request.userId, requiredOrg(organizationId), campaignId);
  }

  @Get('campaigns/:campaignId/content-items')
  listItems(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.distribucion.listItems(request.userId, requiredOrg(organizationId), campaignId);
  }

  @Post('content-items/:contentItemId/variants')
  @HttpCode(200)
  variant(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('contentItemId') contentItemId: string,
    @Body() body: { network?: string; body?: string },
  ) {
    return this.distribucion.saveVariant(request.userId, requiredOrg(organizationId), contentItemId, body);
  }

  @Post('publications')
  schedule(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: { variantId?: string; connectionId?: string; scheduledAt?: string },
  ) {
    return this.distribucion.schedule(request.userId, requiredOrg(organizationId), body);
  }

  @Post('publications/dispatch')
  @HttpCode(200)
  dispatch(@Req() request: AuthedRequest, @Headers('x-organization-id') organizationId?: string) {
    return this.distribucion.dispatch(request.userId, requiredOrg(organizationId));
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
