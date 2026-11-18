import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AccessAction, AccessDeniedReason, AccessModule, MyAccess } from '../Interface/access';
import { EntitlementService, PLAN_GATED_MODULES } from '../services/Access/entitlement.service';

/**
 * Why `access` does not allow `action` on `module`, or null when it does.
 * Same order as the API rule (spec 005 §7.1): always-on → role only; license missing/invalid → license;
 * not in plan → plan; read-only license and a write action → license; otherwise role.
 * No answer at all (A1 failed) → error for plan-gated modules (fail closed — the API is the real gate anyway),
 * but always-on modules (Settings, Billing) open, so an A1 outage never locks an admin out of the screens
 * that fix things. Their own endpoints still answer 403 when the role doesn't allow it.
 */
export function accessDeniedReason(access: MyAccess | null, module: AccessModule, action: AccessAction = 'View'): AccessDeniedReason | null {
  if (!access) return PLAN_GATED_MODULES.includes(module) ? 'error' : null;
  const m = access.Modules[module];
  if (m?.[action]) return null;
  if (!PLAN_GATED_MODULES.includes(module)) return 'role';
  const state = access.License.State;
  if (state === 'Unlicensed' || state === 'Invalid' || state === 'NotYetValid') return 'license';
  if (!m?.InPlan) return 'plan';
  if (access.License.ReadOnly && action !== 'View') return 'license';
  return 'role';
}

/**
 * Route guard: `canActivate: [moduleGuard('Agile')]`. Use after authGuard.
 * Denied → /accessdenied?module=Agile&reason=plan|license|role|error.
 */
export function moduleGuard(module: AccessModule, action: AccessAction = 'View'): CanActivateFn {
  return () => {
    const entitlement = inject(EntitlementService);
    const router = inject(Router);
    return entitlement.ensureLoaded().pipe(
      take(1),
      map(access => {
        const reason = accessDeniedReason(access, module, action);
        return reason ? router.createUrlTree(['/accessdenied'], { queryParams: { module, reason } }) : true;
      })
    );
  };
}
