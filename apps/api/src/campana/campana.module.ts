import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { CampanaController } from './campana.controller';
import { CampanaService } from './campana.service';

@Module({
  imports: [IdentidadModule],
  controllers: [CampanaController],
  providers: [CampanaService],
})
export class CampanaModule {}