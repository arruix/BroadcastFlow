import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { AvisosController } from './avisos.controller';
import { AvisosService } from './avisos.service';

@Module({
  imports: [IdentidadModule],
  controllers: [AvisosController],
  providers: [AvisosService],
})
export class AvisosModule {}
