import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TaskRoutingModule } from './task-routing.module';
import { TaskViewTabsComponent } from './task-view-tabs/task-view-tabs.component';
import { TaskFilterBarComponent } from './task-filter-bar/task-filter-bar.component';
import { TaskListComponent } from './task-list/task-list.component';
import { TaskBoardComponent } from './task-board/task-board.component';
import { TaskFormComponent } from './task-form/task-form.component';
import { TaskDrawerComponent } from './task-drawer/task-drawer.component';
import { TaskDetailComponent } from './task-detail/task-detail.component';
import { TaskPageComponent } from './task-page/task-page.component';
import { TaskSubtasksComponent } from './task-subtasks/task-subtasks.component';
import { TaskCommentsComponent } from './task-comments/task-comments.component';

@NgModule({
  declarations: [
    TaskViewTabsComponent,
    TaskFilterBarComponent,
    TaskListComponent,
    TaskBoardComponent,
    TaskFormComponent,
    TaskDrawerComponent,
    TaskDetailComponent,
    TaskPageComponent,
    TaskSubtasksComponent,
    TaskCommentsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    FontAwesomeModule,
    TaskRoutingModule
  ]
})
export class TaskModule { }