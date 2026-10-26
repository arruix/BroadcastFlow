import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';
import { OrganizacionService } from './organizacion.service';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizacionController {
  constructor(private readonly organizaciones: OrganizacionService) {}

  @Get()
  list(@Req() request: AuthedRequest) {
    return this.organizaciones.list(request.userId);
  }

  @Get('summary')
  summary(@Req() request: AuthedRequest) {
    return this.organizaciones.summary(request.userId);
  }

  @Get(':organizationId/members')
  members(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizaciones.members(request.userId, organizationId);
  }

  @Post(':organizationId/invitations')
  @HttpCode(201)
  invite(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: { email?: string; role?: string },
  ) {
    return this.organizaciones.invite(
      request.userId,
      organizationId,
      body.email ?? '',
      body.role ?? '',
    );
  }

  @Delete(':organizationId/members/:membershipId')
  @HttpCode(204)
  remove(
    @Req() request: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.organizaciones.remove(
      request.userId,
      organizationId,
      membershipId,
    );
  }

  @Post()
  create(
    @Req() request: AuthedRequest,
    @Body() body: { name?: string; country?: string },
  ) {
    return this.organizaciones.create(
      request.userId,
      body.name ?? '',
      body.country ?? '',
    );
  }
}

@Controller('invitations')
@UseGuards(AuthGuard)
export class InvitacionesController {
  constructor(private readonly organizaciones: OrganizacionService) {}

  @Post('accept')
  @HttpCode(200)
  accept(@Req() request: AuthedRequest, @Body() body: { token?: string }) {
    return this.organizaciones.accept(request.userId, body.token ?? '');
  }
}
