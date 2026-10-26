import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { AvisosController } from './avisos.controller';
import { AvisosService } from './avisos.service';
import { NotificacionesController } from './notificaciones.controller';

@Module({
  imports: [IdentidadModule],
  controllers: [AvisosController, NotificacionesController],
  providers: [AvisosService],
})
export class AvisosModule {}
