import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [CommonModule],
  template: `<canvas #canvas class="rounded-[8px]"></canvas>`,
})
export class QrCodeComponent implements AfterViewInit, OnChanges {
  @Input() value = '';
  @Input() size = 160;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private rendered = false;

  ngAfterViewInit() {
    this.render();
    this.rendered = true;
  }

  ngOnChanges() {
    if (this.rendered) this.render();
  }

  private render() {
    if (!this.value || !this.canvasRef) return;
    QRCode.toCanvas(this.canvasRef.nativeElement, this.value, { width: this.size, margin: 1 }, (err) => {
      if (err) console.error('QR render failed', err);
    });
  }
}
