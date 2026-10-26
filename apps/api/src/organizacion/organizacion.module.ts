import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import {
  InvitacionesController,
  OrganizacionController,
} from './organizacion.controller';
import { OrganizacionService } from './organizacion.service';

@Module({
  imports: [IdentidadModule],
  controllers: [OrganizacionController, InvitacionesController],
  providers: [OrganizacionService],
})
export class OrganizacionModule {}
