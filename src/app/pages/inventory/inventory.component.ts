import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { RealtimeTableService, RealtimeTableHandle } from '../../core/realtime-table.service';
import { KpiRowComponent, KpiItem } from '../../shared/kpi-row.component';

const CATEGORIES = ['Medicine', 'Consumable', 'Equipment', 'Surgical', 'Other'];

interface ItemForm {
  name: string; category: string; stock: string; max: string; reorder: string; cost: string;
}
const emptyForm = (): ItemForm => ({ name: '', category: CATEGORIES[0], stock: '0', max: '', reorder: '', cost: '' });

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiRowComponent],
  template: `
    <div>
      <app-kpi-row [items]="kpis()"></app-kpi-row>


      <div *ngIf="lowStockCount() > 0" class="bg-warning-bg text-warning-fg rounded-card px-4 py-2.5 text-sm font-medium mb-4 flex items-center gap-2">
        <i class="ph ph-warning-circle"></i>
        {{ lowStockCount() }} item(s) at or below reorder level — filter by category below to review.
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <form (ngSubmit)="createItem()" class="bg-white border border-line-1 rounded-card p-5 space-y-3 xl:col-span-1 h-fit">
          <h2 class="font-semibold text-ink-2 text-sm mb-1">Add Item</h2>

          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Item name</label>
            <input required [(ngModel)]="form.name" name="name"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Category</label>
            <select [(ngModel)]="form.category" name="category"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand">
              <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
            </select>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Stock</label>
              <input type="number" min="0" [(ngModel)]="form.stock" name="stock"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Max</label>
              <input type="number" min="0" [(ngModel)]="form.max" name="max"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label class="block text-xs font-medium text-body-1 mb-1">Reorder at</label>
              <input type="number" min="0" [(ngModel)]="form.reorder" name="reorder"
                class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-body-1 mb-1">Unit cost (₹)</label>
            <input type="number" step="0.01" [(ngModel)]="form.cost" name="cost"
              class="w-full border border-line-1 rounded-[9px] px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>

          <div *ngIf="errorMsg" class="text-xs text-danger-fg bg-danger-bg rounded-[9px] px-3 py-2">{{ errorMsg }}</div>
          <button type="submit" [disabled]="submitting"
            class="w-full bg-brand hover:bg-brand-hover text-white rounded-[9px] py-2.5 text-sm font-semibold disabled:opacity-60">
            {{ submitting ? 'Adding…' : 'Add item' }}
          </button>
        </form>

        <div class="xl:col-span-3 bg-white border border-line-1 rounded-card overflow-hidden">
          <div class="px-5 py-3 border-b border-line-1 flex items-center justify-between">
            <span class="font-semibold text-ink-2 text-sm">Stock</span>
            <div class="flex gap-1">
              <button *ngFor="let c of ['All'].concat(categories)" (click)="filterCategory = c"
                class="px-2.5 py-1 rounded-pill text-[11.5px] font-medium"
                [class]="filterCategory === c ? 'bg-brand text-white' : 'bg-line-2 text-body-1 hover:bg-line-1'">
                {{ c }}
              </button>
            </div>
          </div>
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left text-[11.5px] text-muted-1 border-b border-line-1">
                <th class="px-4 py-2 font-medium">Item</th>
                <th class="px-4 py-2 font-medium">Category</th>
                <th class="px-4 py-2 font-medium">Stock</th>
                <th class="px-4 py-2 font-medium">Unit cost</th>
                <th class="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="filteredItems().length === 0">
                <td colspan="5" class="px-4 py-6 text-center text-body-2">No items in this category.</td>
              </tr>
              <tr *ngFor="let item of filteredItems()" class="border-b border-line-2 last:border-0">
                <td class="px-4 py-2 font-medium text-ink-2">{{ item.name }}</td>
                <td class="px-4 py-2 text-body-1">{{ item.category }}</td>
                <td class="px-4 py-2">
                  <span class="font-mono font-semibold" [class]="isLowStock(item) ? 'text-danger-fg' : 'text-ink-2'">{{ item.stock }}</span>
                  <span class="text-[11px] text-muted-1"> / reorder {{ item.reorder ?? '—' }}</span>
                </td>
                <td class="px-4 py-2 font-mono text-body-1">{{ item.cost ? '₹' + item.cost : '—' }}</td>
                <td class="px-4 py-2 text-right">
                  <button (click)="restock(item)" class="text-[12px] font-semibold bg-brand hover:bg-brand-hover text-white rounded-[7px] px-3 py-1.5">
                    Restock
                  </button>
                </td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  `,
})
export class InventoryComponent implements OnDestroy {
  categories = CATEGORIES;
  filterCategory = 'All';
  form: ItemForm = emptyForm();
  submitting = false;
  errorMsg = '';

  items: RealtimeTableHandle<any>;

  constructor(private supabaseService: SupabaseService, private realtime: RealtimeTableService) {
    this.items = this.realtime.watch('inventory_items', (q) => q.order('name'));
  }

  // Matches the reference's Inventory KPI row closely -- "Open POs" and
  // "Vendors" in the reference track a PO/vendor system this module doesn't
  // model (that lives in Purchase & Procurement instead) -- replaced with
  // real inventory-only metrics rather than showing a misleading "0".
  kpis(): KpiItem[] {
    const all = this.items.data();
    const stockValue = all.reduce((sum: number, i: any) => sum + Number(i.stock || 0) * Number(i.cost || 0), 0);
    const categories = new Set(all.map((i: any) => i.category)).size;
    return [
      { label: 'Stock Value', value: '\u20b9' + stockValue.toLocaleString('en-IN'), icon: 'ph-package', tintKey: 'teal' },
      { label: 'Low Stock Items', value: String(all.filter((i: any) => this.isLowStock(i)).length), icon: 'ph-trend-down', tintKey: 'amber' },
      { label: 'Categories', value: String(categories), icon: 'ph-squares-four', tintKey: 'blue' },
      { label: 'Total Items', value: String(all.length), icon: 'ph-storefront', tintKey: 'indigo' },
    ];
  }

  filteredItems() {
    const all = this.items.data();
    return this.filterCategory === 'All' ? all : all.filter((i: any) => i.category === this.filterCategory);
  }

  isLowStock(item: any) {
    return item.reorder != null && item.stock <= item.reorder;
  }

  lowStockCount() {
    return this.items.data().filter((i: any) => this.isLowStock(i)).length;
  }

  async createItem() {
    this.errorMsg = '';
    this.submitting = true;
    try {
      const { error } = await this.supabaseService.client.from('inventory_items').insert({
        name: this.form.name,
        category: this.form.category,
        stock: Number(this.form.stock || 0),
        max: this.form.max ? Number(this.form.max) : null,
        reorder: this.form.reorder ? Number(this.form.reorder) : null,
        cost: this.form.cost ? Number(this.form.cost) : null,
      });
      if (error) throw error;
      this.form = emptyForm();
      await this.items.refresh();
    } catch (err: any) {
      this.errorMsg = err.message;
    } finally {
      this.submitting = false;
    }
  }

  async restock(item: any) {
    const input = prompt(`Add how many units to "${item.name}"? (currently ${item.stock})`, '10');
    if (!input) return;
    const qty = Number(input);
    if (!qty || qty <= 0) return;
    const { error } = await this.supabaseService.client
      .from('inventory_items')
      .update({ stock: item.stock + qty })
      .eq('id', item.id);
    if (error) alert(error.message);
    await this.items.refresh();
  }

  ngOnDestroy() {
    this.items.dispose();
  }
}
