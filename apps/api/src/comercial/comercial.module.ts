import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { CfdiGateway } from './cfdi.gateway';
import { ComercialController } from './comercial.controller';
import { ComercialService } from './comercial.service';

@Module({
  imports: [IdentidadModule],
  controllers: [ComercialController],
  providers: [ComercialService, CfdiGateway],
  exports: [ComercialService],
})
export class ComercialModule {}
