import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { DomainException } from '../shared/domain';
import { AvisosService, type NoticeInput } from './avisos.service';

@Controller('campaigns')
@UseGuards(AuthGuard)
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get(':campaignId/privacy-notices')
  list(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.avisos.list(request.userId, requiredOrg(organizationId), campaignId);
  }

  @Post(':campaignId/privacy-notices')
  save(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body() body: NoticeInput,
  ) {
    return this.avisos.save(request.userId, requiredOrg(organizationId), campaignId, body);
  }

  @Post(':campaignId/privacy-notices/:noticeId/publish')
  @HttpCode(200)
  publish(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Param('noticeId') noticeId: string,
  ) {
    return this.avisos.publish(request.userId, requiredOrg(organizationId), campaignId, noticeId);
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
