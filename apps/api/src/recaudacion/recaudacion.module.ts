import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { LibroModule } from '../libro/libro.module';
import { RecaudacionController } from './recaudacion.controller';
import { RecaudacionService } from './recaudacion.service';

@Module({
  imports: [IdentidadModule, LibroModule],
  controllers: [RecaudacionController],
  providers: [RecaudacionService],
})
export class RecaudacionModule {}
