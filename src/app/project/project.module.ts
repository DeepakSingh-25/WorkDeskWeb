import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgApexchartsModule } from 'ng-apexcharts';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ProjectRoutingModule } from './project-routing.module';
import { ProjectListComponent } from './project-list/project-list.component';
import { ProjectCreateComponent } from './project-create/project-create.component';
import { ProjectDetailsComponent } from './project-details/project-details.component';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';
import { ProjectMembersComponent } from './project-members/project-members.component';
import { ProjectMilestonesComponent } from './project-milestones/project-milestones.component';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';

@NgModule({
  declarations: [
    ProjectListComponent,
    ProjectCreateComponent,
    ProjectDetailsComponent,
    ProjectOverviewComponent,
    ProjectMembersComponent,
    ProjectMilestonesComponent,
    ProjectSettingsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgApexchartsModule,
    FontAwesomeModule,
    ProjectRoutingModule
  ]
})
export class ProjectModule { }
