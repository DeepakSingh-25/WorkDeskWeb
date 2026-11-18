import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReportsDashboardComponent } from './reports-dashboard/reports-dashboard.component';
import { ReportProjectsComponent } from './report-projects/report-projects.component';
import { ReportTasksComponent } from './report-tasks/report-tasks.component';

const routes: Routes = [
  { path: '', component: ReportsDashboardComponent },
  { path: 'projects', component: ReportProjectsComponent },
  { path: 'tasks', component: ReportTasksComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportsRoutingModule { }
