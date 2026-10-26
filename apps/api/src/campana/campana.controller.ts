import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { type CampaignInput, CampanaService } from './campana.service';
import { DomainException } from '../shared/domain';
import type { PaymentMethodInput } from '../shared/payment-method';

@Controller('campaigns')
@UseGuards(AuthGuard)
export class CampanaController {
  constructor(private readonly campanas: CampanaService) {}

  @Get()
  list(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.campanas.list(request.userId, requiredOrg(organizationId));
  }

  @Post()
  create(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() body: CampaignInput,
  ) {
    return this.campanas.create(request.userId, organizationId ?? '', body);
  }

  @Post(':campaignId/activate')
  @HttpCode(200)
  activate(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campanas.activate(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
    );
  }

  @Patch(':campaignId')
  update(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body() body: CampaignInput,
  ) {
    return this.campanas.update(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      body,
    );
  }

  @Put(':campaignId/payment-method')
  setPaymentMethod(
    @Req() request: AuthedRequest,
    @Headers('x-organization-id') organizationId: string | undefined,
    @Param('campaignId') campaignId: string,
    @Body() body: PaymentMethodInput,
  ) {
    return this.campanas.setPaymentMethod(
      request.userId,
      requiredOrg(organizationId),
      campaignId,
      body,
    );
  }
}

function requiredOrg(organizationId: string | undefined): string {
  if (!organizationId) throw new DomainException('forbidden', 403);
  return organizationId;
}
