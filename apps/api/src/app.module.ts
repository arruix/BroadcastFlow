import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './db/core.module';
import { DomainFilter } from './shared/domain';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AvisosModule } from './avisos/avisos.module';
import { CampanaModule } from './campana/campana.module';
import { ComercialModule } from './comercial/comercial.module';
import { DistribucionModule } from './distribucion/distribucion.module';
import { EnvivoModule } from './envivo/envivo.module';
import { IdentidadModule } from './identidad/identidad.module';
import { LibroModule } from './libro/libro.module';
import { MedicionModule } from './medicion/medicion.module';
import { OrganizacionModule } from './organizacion/organizacion.module';
import { PlataformaModule } from './plataforma/plataforma.module';
import { RecaudacionModule } from './recaudacion/recaudacion.module';
import { ReportesModule } from './reportes/reportes.module';

@Module({
  imports: [
    CoreModule,
    IdentidadModule,
    OrganizacionModule,
    CampanaModule,
    DistribucionModule,
    EnvivoModule,
    RecaudacionModule,
    LibroModule,
    ComercialModule,
    MedicionModule,
    AvisosModule,
    ReportesModule,
    PlataformaModule,
    AuditoriaModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: DomainFilter }],
})
export class AppModule {}
