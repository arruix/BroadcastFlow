import { Module } from '@nestjs/common';
import { MedicionModule } from '../medicion/medicion.module';
import { LibroController } from './libro.controller';
import { LibroService } from './libro.service';

@Module({
  imports: [MedicionModule],
  controllers: [LibroController],
  providers: [LibroService],
})
export class LibroModule {}