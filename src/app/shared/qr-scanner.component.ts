import { Component, EventEmitter, Output, OnDestroy, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Html5Qrcode } from 'html5-qrcode';

let scannerInstanceCounter = 0;

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <div [id]="elementId" class="rounded-[10px] overflow-hidden bg-black min-h-[220px]"></div>
      <div *ngIf="errorMsg" class="text-[12px] text-danger-fg bg-danger-bg rounded-[7px] px-2.5 py-1.5 mt-2">{{ errorMsg }}</div>
      <div *ngIf="!cameraStarted && !errorMsg" class="text-[12px] text-muted-1 text-center py-4">Starting camera…</div>
    </div>
  `,
})
export class QrScannerComponent implements AfterViewInit, OnDestroy {
  @Input() hint = '';
  @Output() scanned = new EventEmitter<string>();

  elementId = `qr-scanner-${scannerInstanceCounter++}`;
  errorMsg = '';
  cameraStarted = false;

  private html5Qrcode: Html5Qrcode | null = null;

  async ngAfterViewInit() {
    try {
      this.html5Qrcode = new Html5Qrcode(this.elementId);
      await this.html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => this.scanned.emit(decodedText),
        () => {
          // per-frame "no code found" callback -- expected constantly while
          // aiming the camera, not an error worth surfacing
        }
      );
      this.cameraStarted = true;
    } catch (err: any) {
      this.errorMsg =
        'Could not access the camera. Check browser permissions, or that this page is loaded over HTTPS (required for camera access).';
      console.error(err);
    }
  }

  async ngOnDestroy() {
    try {
      if (this.html5Qrcode?.isScanning) {
        await this.html5Qrcode.stop();
      }
      this.html5Qrcode?.clear();
    } catch {
      // scanner may already be stopped/torn down -- safe to ignore
    }
  }
}
