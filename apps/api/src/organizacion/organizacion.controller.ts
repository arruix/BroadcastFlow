import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post()
  create(@Req() request: AuthedRequest, @Body() body: { name?: string; country?: string }) {
    return this.organizaciones.create(request.userId, body.name ?? '', body.country ?? '');
  }
}
