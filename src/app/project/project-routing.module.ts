import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProjectListComponent } from './project-list/project-list.component';
import { ProjectCreateComponent } from './project-create/project-create.component';
import { ProjectDetailsComponent } from './project-details/project-details.component';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';
import { ProjectMembersComponent } from './project-members/project-members.component';
import { ProjectMilestonesComponent } from './project-milestones/project-milestones.component';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';
import { moduleGuard } from '../guards/module.guard';

const routes: Routes = [
  { path: '', component: ProjectListComponent },
  { path: 'create', component: ProjectCreateComponent, canActivate: [moduleGuard('Projects', 'Create')] },
  { path: 'edit/:id', component: ProjectCreateComponent, canActivate: [moduleGuard('Projects', 'Edit')] },
  {
    path: ':id', component: ProjectDetailsComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: ProjectOverviewComponent },
      { path: 'members', component: ProjectMembersComponent },
      { path: 'milestones', component: ProjectMilestonesComponent },
      { path: 'settings', component: ProjectSettingsComponent },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProjectRoutingModule { }
