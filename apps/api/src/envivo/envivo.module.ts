import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { MedicionModule } from '../medicion/medicion.module';
import { EnvivoController } from './envivo.controller';
import { EnvivoService } from './envivo.service';
import { LiveGateway } from './live.gateway';

@Module({
  imports: [IdentidadModule, MedicionModule],
  controllers: [EnvivoController],
  providers: [EnvivoService, LiveGateway],
})
export class EnvivoModule {}
