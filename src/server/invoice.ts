/**
 * Invoice PDF. Without a GSTIN in Settings it is a plain retail invoice; with one, it becomes a
 * GST tax invoice (imitation jewellery, HSN 7117, 3% included in prices — CGST+SGST within the
 * business's state, IGST otherwise).
 */
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import type { orderItems, orders } from './db/schema';
import type { StoreSettings } from './settings';

type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;

const require = createRequire(import.meta.url);
const SERIF = require.resolve('@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff');
const PURPLE = '#7D46AB';
const GST_RATE = 0.03;

const money = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d) : '');

export const invoiceNumber = (order: Pick<Order, 'invoiceNo'>, prefix: string) => `${prefix}${String(order.invoiceNo ?? 0).padStart(5, '0')}`;

export function renderInvoice(order: Order, items: Item[], s: StoreSettings): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${invoiceNumber(order, s.invoice.prefix)}`, Author: s.business.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.registerFont('serif', SERIF);
  const gst = Boolean(s.business.gstin);
  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  // Header
  doc.font('serif').fontSize(34).fillColor(PURPLE).text('jhumka', left, 44);
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  const biz = [s.business.legalName, s.business.address, [s.business.phone, s.business.email].filter(Boolean).join(' · '), gst ? `GSTIN ${s.business.gstin}` : '']
    .filter(Boolean)
    .join('\n');
  doc.text(biz, left + width / 2, 50, { width: width / 2, align: 'right' });

  doc.moveDown(2);
  doc.font('serif').fontSize(22).fillColor(PURPLE).text(gst ? 'Tax invoice' : 'Invoice', left, 128);
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  const meta: [string, string][] = [
    ['Invoice no.', invoiceNumber(order, s.invoice.prefix)],
    ['Invoice date', day(order.paidAt)],
    ['Order', order.number],
    ['Payment', `Razorpay${order.paymentMethod ? ` · ${order.paymentMethod.toUpperCase()}` : ''}${order.razorpayPaymentId ? ` · ${order.razorpayPaymentId}` : ''}`],
  ];
  let y = 162;
  for (const [k, v] of meta) {
    doc.font('Helvetica-Bold').text(k, left, y, { width: 90 });
    doc.font('Helvetica').text(v, left + 90, y, { width: 220 });
    y += 14;
  }

  const a = order.shippingAddress;
  doc.font('Helvetica-Bold').text('Bill & ship to', left + width / 2, 162);
  doc
    .font('Helvetica')
    .text([a.name, a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : '', `${a.city}, ${a.state} ${a.pincode}`, order.phone, order.email ?? ''].filter(Boolean).join('\n'), left + width / 2, 176, { width: width / 2 });

  // Items table
  y = Math.max(y, doc.y) + 24;
  const cols = gst
    ? [{ h: '#', w: 22 }, { h: 'Item', w: 230 }, { h: 'HSN', w: 44 }, { h: 'Qty', w: 34, r: true }, { h: 'Unit price', w: 80, r: true }, { h: 'Amount', w: 89, r: true }]
    : [{ h: '#', w: 22 }, { h: 'Item', w: 274 }, { h: 'Qty', w: 34, r: true }, { h: 'Unit price', w: 80, r: true }, { h: 'Amount', w: 89, r: true }];
  const row = (cells: string[], bold = false) => {
    let x = left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#222');
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: cols[i].w - 6 })));
    cells.forEach((c, i) => {
      doc.text(c, x + 3, y, { width: cols[i].w - 6, align: cols[i].r ? 'right' : 'left' });
      x += cols[i].w;
    });
    y += h + 8;
  };
  doc.rect(left, y - 4, width, 20).fill('#F3EDF8');
  row(cols.map((c) => c.h), true);
  items.forEach((it, i) => {
    const cells = [String(i + 1), it.name, ...(gst ? ['7117'] : []), String(it.qty), money(it.unitPricePaise), money(it.lineTotalPaise)];
    row(cells);
    doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor('#E6DCF0').lineWidth(0.5).stroke();
  });

  // Totals
  y += 8;
  const totals: [string, string][] = [['Subtotal', money(order.subtotalPaise)]];
  if (order.discountPaise) totals.push([`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- ${money(order.discountPaise)}`]);
  totals.push(['Shipping', order.shippingPaise ? money(order.shippingPaise) : 'Free']);
  if (gst) {
    const taxable = Math.round(order.totalPaise / (1 + GST_RATE));
    const tax = order.totalPaise - taxable;
    totals.push(['Taxable value', money(taxable)]);
    if (a.state.trim().toLowerCase() === s.business.state.trim().toLowerCase()) {
      totals.push(['CGST 1.5%', money(Math.floor(tax / 2))], ['SGST 1.5%', money(tax - Math.floor(tax / 2))]);
    } else totals.push(['IGST 3%', money(tax)]);
  }
  for (const [k, v] of totals) {
    doc.font('Helvetica').fontSize(9).text(k, right - 240, y, { width: 140, align: 'right' });
    doc.text(v, right - 100, y, { width: 100, align: 'right' });
    y += 15;
  }
  doc.moveTo(right - 240, y).lineTo(right, y).strokeColor(PURPLE).lineWidth(0.8).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PURPLE).text(gst ? 'Total (incl. GST)' : 'Total', right - 240, y, { width: 140, align: 'right' });
  doc.text(money(order.totalPaise), right - 100, y, { width: 100, align: 'right' });
  if (order.refundedPaise) {
    y += 18;
    doc.font('Helvetica').fontSize(9).fillColor('#333').text('Refunded', right - 240, y, { width: 140, align: 'right' });
    doc.text(`- ${money(order.refundedPaise)}`, right - 100, y, { width: 100, align: 'right' });
  }

  doc
    .font('serif')
    .fontSize(14)
    .fillColor(PURPLE)
    .text('Thank you for choosing Jhumka.', left, doc.page.height - 110, { width, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666')
    .text(gst ? 'This is a computer-generated tax invoice.' : 'This is a computer-generated invoice. Not a GST tax invoice.', left, doc.page.height - 88, { width, align: 'center' });

  doc.end();
  return done;
}
