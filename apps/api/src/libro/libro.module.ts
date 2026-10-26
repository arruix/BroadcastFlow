import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { MedicionModule } from '../medicion/medicion.module';
import { DisbursementController } from './disbursement.controller';
import { DisbursementService } from './disbursement.service';
import { LibroController } from './libro.controller';
import { LibroService } from './libro.service';
import { PayoutGateway } from './payout.gateway';

@Module({
  imports: [MedicionModule, IdentidadModule],
  controllers: [LibroController, DisbursementController],
  providers: [LibroService, DisbursementService, PayoutGateway],
  exports: [LibroService],
})
export class LibroModule {}
