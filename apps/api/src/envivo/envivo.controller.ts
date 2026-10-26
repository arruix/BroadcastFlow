import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { EnvivoService } from './envivo.service';

@Controller()
export class EnvivoController {
  constructor(private readonly envivo: EnvivoService) {}

  @Get('campaigns/:campaignId/live')
  @UseGuards(AuthGuard)
  desk(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.envivo.desk(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
    );
  }

  @Post('campaigns/:campaignId/live-sessions')
  @UseGuards(AuthGuard)
  open(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body() body: { connectionIds?: string[] },
  ) {
    return this.envivo.open(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      body.connectionIds,
    );
  }

  @Post('live-sessions/:liveSessionId/start')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  start(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('liveSessionId') liveSessionId: string,
  ) {
    return this.envivo.start(
      request.userId,
      requiredOrg(organizationId),
      liveSessionId,
    );
  }

  @Post('live-sessions/:liveSessionId/stop')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  stop(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('liveSessionId') liveSessionId: string,
  ) {
    return this.envivo.stop(
      request.userId,
      requiredOrg(organizationId),
      liveSessionId,
    );
  }

  @Post('live-sessions/:liveSessionId/origin')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  origin(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('liveSessionId') liveSessionId: string,
    @Body() body: { connected?: boolean },
  ) {
    return this.envivo.origin(
      request.userId,
      requiredOrg(organizationId),
      liveSessionId,
      body.connected,
    );
  }

  @Get('live-sessions/:liveSessionId')
  @UseGuards(AuthGuard)
  read(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('liveSessionId') liveSessionId: string,
  ) {
    return this.envivo.read(
      request.userId,
      requiredOrg(organizationId),
      liveSessionId,
    );
  }

  @Get('public/live/:sessionId/index.m3u8')
  @Header('content-type', 'application/vnd.apple.mpegurl')
  async playlist(@Param('sessionId') sessionId: string) {
    const body = await this.envivo.hls(sessionId);
    if (!body) throw new NotFoundException();
    return body;
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
