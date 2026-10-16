import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { BoardBus } from './board.bus';
import { MedicionController, VisitaController } from './medicion.controller';
import { MedicionService } from './medicion.service';

@Module({
  imports: [IdentidadModule],
  controllers: [VisitaController, MedicionController],
  providers: [MedicionService, BoardBus],
  exports: [BoardBus],
})
export class MedicionModule {}
