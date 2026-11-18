import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ReportsRoutingModule } from './reports-routing.module';
import { ReportsNavComponent } from './reports-nav/reports-nav.component';
import { ReportFilterBarComponent } from './report-filter-bar/report-filter-bar.component';
import { ReportExportMenuComponent } from './report-export-menu/report-export-menu.component';
import { ReportsDashboardComponent } from './reports-dashboard/reports-dashboard.component';
import { ReportProjectsComponent } from './report-projects/report-projects.component';
import { ReportTasksComponent } from './report-tasks/report-tasks.component';

@NgModule({
  declarations: [
    ReportsNavComponent,
    ReportFilterBarComponent,
    ReportExportMenuComponent,
    ReportsDashboardComponent,
    ReportProjectsComponent,
    ReportTasksComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgApexchartsModule,
    FontAwesomeModule,
    ReportsRoutingModule
  ]
})
export class ReportsModule { }
