import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { moduleGuard } from './guards/module.guard';
import { AccessModule } from './Interface/access';

// Login ke bina sirf admin module ke public pages (login, signup, forgot, reset-password) khulte hain
const protectedRoute = { canActivate: [authGuard], canActivateChild: [authGuard] };
// Plan-gated modules (spec 005 §8.4): pehle login check, phir plan / license / role ka View.
// Denied → /accessdenied?module=…&reason=…. UX only — API ka [RequireModule] asli gate hai.
// Dashboard, Settings, admin pages gated nahi hain (lock-out prevention).
const gated = (m: AccessModule) => ({ canActivate: [authGuard, moduleGuard(m)], canActivateChild: [authGuard] });

const routes: Routes = [
  { path: 'dashboard', loadChildren: () => import('../app/home/home.module').then(m => m.HomeModule), ...protectedRoute },
  { path: 'projects', loadChildren: () => import('../app/project/project.module').then(m => m.ProjectModule), ...gated('Projects') },
  { path: 'tasks', loadChildren: () => import('../app/task/task.module').then(m => m.TaskModule), ...gated('Tasks') },
  { path: 'team', loadChildren: () => import('../app/team/team.module').then(m => m.TeamModule), ...gated('Team') },
  { path: 'agile', loadChildren: () => import('../app/agile/agile.module').then(m => m.AgileModule), ...gated('Agile') },
  { path: 'workflows', loadChildren: () => import('../app/workflow/workflow.module').then(m => m.WorkflowModule), ...gated('Workflows') },
  { path: 'reports', loadChildren: () => import('../app/reports/reports.module').then(m => m.ReportsModule), ...gated('Reports') },
  { path: 'settings', loadChildren: () => import('../app/settings/settings.module').then(m => m.SettingsModule), ...protectedRoute },
  { path: 'workspace', loadChildren: () => import('../app/workspace/workspace.module').then(m => m.WorkspaceModule), ...gated('Workspace') },
  { path: '', loadChildren: () => import('../app/admin/admin.module').then(m => m.AdminModule) },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
