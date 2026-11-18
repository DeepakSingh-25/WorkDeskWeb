import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { WorkflowListComponent } from './workflow-list/workflow-list.component';
import { WorkflowDesignerComponent } from './workflow-designer/workflow-designer.component';
import { WorkflowStatusesComponent } from './workflow-statuses/workflow-statuses.component';

const routes: Routes = [
  { path: '', component: WorkflowListComponent },
  { path: 'designer', redirectTo: 'designer/new', pathMatch: 'full' },
  { path: 'designer/:id', component: WorkflowDesignerComponent },
  { path: 'statuses', component: WorkflowStatusesComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WorkflowRoutingModule { }
