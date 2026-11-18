import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { WorkflowRoutingModule } from './workflow-routing.module';
import { WorkflowNavComponent } from './workflow-nav/workflow-nav.component';
import { WorkflowListComponent } from './workflow-list/workflow-list.component';
import { WorkflowDesignerComponent } from './workflow-designer/workflow-designer.component';
import { WorkflowStatusesComponent } from './workflow-statuses/workflow-statuses.component';

@NgModule({
  declarations: [
    WorkflowNavComponent,
    WorkflowListComponent,
    WorkflowDesignerComponent,
    WorkflowStatusesComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    FontAwesomeModule,
    WorkflowRoutingModule
  ]
})
export class WorkflowModule { }
