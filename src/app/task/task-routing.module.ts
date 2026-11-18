import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TaskListComponent } from './task-list/task-list.component';
import { TaskBoardComponent } from './task-board/task-board.component';
import { TaskFormComponent } from './task-form/task-form.component';
import { TaskPageComponent } from './task-page/task-page.component';

const routes: Routes = [
  { path: '', component: TaskListComponent },
  { path: 'board', component: TaskBoardComponent },
  { path: 'create', component: TaskFormComponent },
  { path: 'edit/:id', component: TaskFormComponent },
  { path: ':id', component: TaskPageComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TaskRoutingModule { }