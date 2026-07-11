import { Routes } from '@angular/router';
import { MODULES, routeFor } from './core/modules';
import { LayoutComponent } from './layout/layout.component';
import { FrontOfficeComponent } from './pages/front-office/front-office.component';
import { OpdComponent } from './pages/opd/opd.component';
import { IpdComponent } from './pages/ipd/ipd.component';
import { BillingComponent } from './pages/billing/billing.component';
import { PharmacyComponent } from './pages/pharmacy/pharmacy.component';
import { LaboratoryComponent } from './pages/laboratory/laboratory.component';
import { EmergencyComponent } from './pages/emergency/emergency.component';
import { BloodBankComponent } from './pages/blood-bank/blood-bank.component';
import { RadiologyComponent } from './pages/radiology/radiology.component';
import { InsuranceComponent } from './pages/insurance/insurance.component';
import { InventoryComponent } from './pages/inventory/inventory.component';
import { HrComponent } from './pages/hr/hr.component';
import { AmbulanceComponent } from './pages/ambulance/ambulance.component';
import { PurchaseComponent } from './pages/purchase/purchase.component';
import { IcuComponent } from './pages/icu/icu.component';
import { SurgeryComponent } from './pages/surgery/surgery.component';
import { NursingComponent } from './pages/nursing/nursing.component';
import { MedicalRecordsComponent } from './pages/medical-records/medical-records.component';
import { HousekeepingComponent } from './pages/housekeeping/housekeeping.component';
import { ItSupportComponent } from './pages/it-support/it-support.component';
import { SecurityComponent } from './pages/security/security.component';
import { QualityComponent } from './pages/quality/quality.component';
import { CommandCenterComponent } from './pages/command-center/command-center.component';
import { SpecialtyComponent } from './pages/specialty/specialty.component';
import { PhysiotherapyComponent } from './pages/physiotherapy/physiotherapy.component';
import { PrMarketingComponent } from './pages/pr-marketing/pr-marketing.component';
import { MyWorkspaceComponent } from './pages/my-workspace/my-workspace.component';
import { ModuleStubComponent } from './pages/module-stub/module-stub.component';

const LIVE_PAGES: Record<string, any> = {
  'front-office': FrontOfficeComponent,
  opd: OpdComponent,
  ipd: IpdComponent,
  billing: BillingComponent,
  pharmacy: PharmacyComponent,
  laboratory: LaboratoryComponent,
  emergency: EmergencyComponent,
  'blood-bank': BloodBankComponent,
  radiology: RadiologyComponent,
  insurance: InsuranceComponent,
  inventory: InventoryComponent,
  hr: HrComponent,
  ambulance: AmbulanceComponent,
  purchase: PurchaseComponent,
  icu: IcuComponent,
  surgery: SurgeryComponent,
  nursing: NursingComponent,
  'medical-records': MedicalRecordsComponent,
  housekeeping: HousekeepingComponent,
  'it-support': ItSupportComponent,
  security: SecurityComponent,
  quality: QualityComponent,
  'command-center': CommandCenterComponent,
  specialty: SpecialtyComponent,
  physiotherapy: PhysiotherapyComponent,
  'pr-marketing': PrMarketingComponent,
  'my-workspace': MyWorkspaceComponent,
};

// No login route, no auth guard -- demo mode. See RoleService for how the
// role tab bar drives what's shown, and supabase/demo-open-access.sql for
// the matching (intentionally permissive) database policies.
export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'command-center', pathMatch: 'full' },
      ...MODULES.map((m) => {
        const path = routeFor(m);
        const component = LIVE_PAGES[path] ?? ModuleStubComponent;
        return { path, component, data: { moduleId: m.id } };
      }),
      { path: '**', redirectTo: 'command-center' },
    ],
  },
];
