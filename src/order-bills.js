import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export function canReadOrderBill(order, user, token = '') {
  return Boolean(user?.role === 'admin' || (user?.email && String(user.email).toLowerCase() === String(order.customer_email).toLowerCase()) ||
    (token && order.tracking_token && token === order.tracking_token));
}

export async function createOrderBillPdf({ order, seller = {}, issuedAt, fontBytes, logoBytes, lines = [] }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandFont = await pdf.embedFont(StandardFonts.TimesRoman);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  pdf.setTitle(`Glamia bill ${order.order_number || order.id}`);
  pdf.setAuthor('Glamia');
  const issued = new Date(String(issuedAt).includes('T') ? issuedAt : `${issuedAt.replace(' ', 'T')}Z`);
  if (!Number.isNaN(issued.getTime())) { pdf.setCreationDate(issued); pdf.setModificationDate(issued); }
  // Glamia's graphite, soft-white and lavender brand palette, with a white
  // document body for readable, economical printing.
  const ink = rgb(.08, .08, .08), muted = rgb(.37, .37, .37);
  const rule = rgb(.81, .79, .84), paper = rgb(.96, .94, .98);
  const charcoal = rgb(.10, .10, .10), cream = rgb(.96, .95, .93);
  const accent = rgb(.82, .69, .96), accentText = rgb(.41, .29, .56);
  const left = 44, right = 551, bottom = 88;
  const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => {
    const parsed = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }) + ' IST';
  };
  let page, y;
  function wrapped(text, width, size, face = font) {
    const result = []; let line = '';
    for (const word of String(text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').split(/\s+/)) {
      if (face.widthOfTextAtSize(`${line}${line ? ' ' : ''}${word}`, size) <= width) { line += `${line ? ' ' : ''}${word}`; continue; }
      if (line) result.push(line);
      line = '';
      for (const char of word) {
        if (face.widthOfTextAtSize(line + char, size) > width && line) { result.push(line); line = ''; }
        line += char;
      }
    }
    if (line) result.push(line);
    return result.length ? result : [''];
  }
  function draw(text, x, top, size = 10, color = ink, face = font) {
    page.drawText(String(text), { x, y: top, size, font: face, color });
  }
  function aligned(text, end, top, size = 10, color = ink, width = 100, face = font) {
    const naturalWidth = face.widthOfTextAtSize(String(text), size);
    const fittedSize = naturalWidth > width ? size * width / naturalWidth : size;
    draw(text, end - face.widthOfTextAtSize(String(text), fittedSize), top, fittedSize, color, face);
  }
  function divider(top, start = left, end = right, color = rule, thickness = .65) {
    page.drawLine({ start: { x: start, y: top }, end: { x: end, y: top }, thickness, color });
  }
  function startPage(continued = false) {
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: left, y: 744, width: right - left, height: 66, color: charcoal });
    if (logo) {
      const size = logo.scaleToFit(49, 49);
      page.drawImage(logo, { x: left + 8, y: 752, ...size });
      draw('L A M I A', left + 61, 773, 24, cream, brandFont);
    } else draw('G L A M I A', left + 10, 773, 24, cream, brandFont);
    aligned('ORDER BILL', right - 12, 784, 10, cream, 160, headingFont);
    aligned(continued ? 'Purchase details - continued' : 'Completed purchase', right - 12, 764, 8, accent, 195);
    divider(744, left, right, accent, 2);
    y = 722;
    const orderLines = wrapped(String(order.order_number || order.id), 330, 11);
    draw(continued ? 'ORDER / CONTINUED' : 'ORDER NUMBER', left, y, 8, muted, headingFont);
    y -= 18;
    for (const value of orderLines) { draw(value, left, y, 11); y -= 15; }
    return page;
  }
  function room(height, table = false) {
    if (y - height < bottom) { startPage(true); if (table) tableHeader(); }
  }
  function write(text, { size = 9.5, color = ink, width = right - left, x = left, leading = size + 4 } = {}) {
    for (const value of wrapped(text, width, size)) { room(leading); draw(value, x, y, size, color); y -= leading; }
  }
  function label(value, x, top) { draw(value, x, top, 8, accentText, headingFont); }
  function column(entries, x, top, width) {
    let cursor = top;
    for (const entry of entries) {
      for (const value of wrapped(entry.text, width, entry.size || 9.5)) {
        draw(value, x, cursor, entry.size || 9.5, entry.color || ink);
        cursor -= entry.leading || 14;
      }
      cursor -= entry.gap || 0;
    }
    return cursor;
  }

  startPage();
  label('ORDER PLACED', left, y); label('BILL ISSUED', 310, y);
  y -= 18;
  draw(date(order.created_at), left, y, 9); draw(date(issuedAt), 310, y, 9);
  y -= 24;
  divider(y); y -= 21;
  label('BILLED TO', left, y); label('SOLD BY', 310, y);
  y -= 19;
  const shipping = order.shipping || {};
  const address = [shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.pin, shipping.country || 'India'].filter(Boolean).join(', ');
  const buyerEntries = [
    { text: order.customer_name || 'Customer', size: 12, leading: 18, gap: 3 },
    { text: order.customer_email || '', color: muted },
    { text: address, color: muted },
  ];
  const sellerEntries = [
    { text: seller.business_name || 'Glamia', size: 12, leading: 18, gap: 3 },
    ...(seller.business_state ? [{ text: seller.business_state, color: muted }] : []),
    ...(seller.gstin ? [{ text: `GSTIN: ${seller.gstin}`, color: muted }] : []),
    { text: 'glamiastore.com', color: muted },
    { text: 'support@glamiastore.com', color: muted },
  ];
  const columnHeight = entries => entries.reduce((height, entry) => height + wrapped(entry.text, 231, entry.size || 9.5).length * (entry.leading || 14) + (entry.gap || 0), 0);
  // Normal addresses remain side by side. Extremely long persisted fields use
  // a paginated vertical layout rather than running into the table/footer.
  const detailsHeight = Math.max(columnHeight(buyerEntries), columnHeight(sellerEntries));
  if (y - detailsHeight < bottom + 65) {
    for (const entry of buyerEntries) write(entry.text, { size: entry.size || 9.5, color: entry.color || ink });
    room(45); y -= 10; label('SOLD BY', left, y); y -= 18;
    for (const entry of sellerEntries) write(entry.text, { size: entry.size || 9.5, color: entry.color || ink });
  } else {
    y = Math.min(column(buyerEntries, left, y, 231), column(sellerEntries, 310, y, 231));
  }
  y -= 14;
  room(order.payment_reference ? 100 : 60);
  divider(y); y -= 18;
  label('PAYMENT METHOD', left, y); label('PAYMENT STATUS', 410, y);
  y -= 18;
  const method = ({ razorpay: 'Razorpay', phonepe: 'PhonePe', store_credit: 'Store credits' })[order.payment_method]
    || String(order.payment_method || '').replaceAll('_', ' ').toUpperCase();
  const paymentMethod = order.credits_used && order.payment_method !== 'store_credit' ? `Store credits + ${method}` : method;
  const methodLines = wrapped(paymentMethod, 335, 10);
  aligned('PAID', right, y, 9, ink, 120, headingFont);
  for (const value of methodLines) { draw(value, left, y, 10); y -= 15; }
  if (order.payment_reference) {
    y -= 3;
    write(`Reference: ${order.payment_reference}`, { size: 8.5, color: muted });
  }
  y -= 14;

  function tableHeader() {
    page.drawRectangle({ x: left, y: y - 26, width: right - left, height: 27, color: paper });
    label('#', left + 8, y - 16); label('ITEM / DETAILS', 76, y - 16);
    aligned('QTY', 358, y - 16, 8, muted, 34, headingFont);
    aligned('UNIT PRICE', 448, y - 16, 8, muted, 82, headingFont);
    aligned('ITEM TOTAL', right - 8, y - 16, 8, muted, 85, headingFont);
    y -= 29;
  }
  function rowDetails(line) {
    return [
      ...wrapped(line.name, 240, 10).map(text => ({ text, size: 10, leading: 15, color: ink })),
      ...(line.selection ? wrapped(line.selection, 240, 8.5).map(text => ({ text, size: 8.5, leading: 13, color: muted })) : []),
      ...(line.ready ? wrapped(`${line.codeType} ${line.code} | GST ${line.rate}%`, 240, 8).map(text => ({ text, size: 8, leading: 12, color: muted })) : []),
      ...(line.ready ? wrapped(`Taxable ${money(line.taxable)} | Tax ${money(line.tax)}`, 240, 8).map(text => ({ text, size: 8, leading: 12, color: muted })) : []),
    ];
  }
  const rowHeightOf = details => 22 + details.reduce((height, value) => height + value.leading, 0);
  // Keep the first table heading with actual item text, including when an
  // unusually long first product needs to begin on a continuation page.
  room(29 + (lines.length ? Math.min(rowHeightOf(rowDetails(lines[0])), 550) : 40));
  tableHeader();
  for (const [index, line] of lines.entries()) {
    const rowLines = rowDetails(line);
    const rowHeight = rowHeightOf(rowLines);
    room(Math.min(rowHeight, 550), true);
    y -= 16;
    draw(String(index + 1), left + 8, y, 9, muted);
    aligned(String(line.quantity), 358, y, 9.5, ink, 34);
    aligned(money(Number(line.gross || 0) / Math.max(1, Number(line.quantity) || 1)), 448, y, 9, ink, 82);
    aligned(money(line.gross), right - 8, y, 9.5, ink, 87);
    for (const value of rowLines) {
      room(value.leading + 14, true);
      draw(value.text, 76, y, value.size, value.color);
      y -= value.leading;
    }
    y -= 6;
    divider(y); y -= 2;
  }
  if (!lines.length) { y -= 20; write('No line items were recorded.', { color: muted }); }
  y -= 18;
  const totals = [
    ['Subtotal', money(order.subtotal)],
    ...(Number(order.discount) > 0 ? [['Discount', `-${money(order.discount)}`]] : []),
  ];
  const paymentRows = [
    ...(Number(order.credits_used) > 0 ? [['Store credits used', money(order.credits_used)]] : []),
    [order.payment_method === 'store_credit' ? 'Paid via payment gateway' : `Paid via ${method}`, money(order.payment_method === 'store_credit' ? 0 : order.payable_total ?? order.total)],
  ];
  const notes = [
    'This bill records the completed purchase. Any later return or refund is recorded separately.',
    ...(!seller.gstin || lines.some(line => !line.ready) ? ['Payment receipt. GST details are shown only where they were configured at checkout.'] : []),
  ];
  const totalHeight = totals.length * 22 + 11 + 43 + paymentRows.length * 22 + 17 + 22 + 14 + 3
    + notes.reduce((height, note) => height + wrapped(note, right - left, 8).length * 12, 0);
  room(totalHeight);
  const totalLine = (name, value, large = false) => {
    if (large) {
      page.drawRectangle({ x: 296, y: y - 13, width: right - 296, height: 38, color: paper });
      draw(name, 308, y, 11, ink, headingFont);
      aligned(value, right - 12, y, 15, ink, 151);
      y -= 43;
    } else {
      draw(name, 308, y, 9, muted);
      aligned(value, right - 12, y, 10, ink, 125);
      y -= 22;
    }
  };
  for (const [name, value] of totals) totalLine(name, value);
  y -= 11;
  totalLine('Total', money(order.total), true);
  for (const [name, value] of paymentRows) totalLine(name, value);
  y -= 17;
  divider(y); y -= 22;
  write('Thank you for shopping with Glamia.', { size: 10 });
  y -= 3;
  for (const note of notes) write(note, { color: muted, size: 8, leading: 12 });
  for (const [index, sheet] of pdf.getPages().entries()) {
    sheet.drawLine({ start: { x: left, y: 57 }, end: { x: right, y: 57 }, color: accent, thickness: 1 });
    sheet.drawText('glamiastore.com | support@glamiastore.com', { x: left, y: 39, font, size: 8, color: muted });
    const number = `Page ${index + 1} of ${pdf.getPageCount()}`;
    sheet.drawText(number, { x: right - font.widthOfTextAtSize(number, 8), y: 39, font, size: 8, color: muted });
  }
  return pdf.save();
}

let fontBytesPromise;
export async function billFontBytes(env) {
  if (!fontBytesPromise) fontBytesPromise = env.ASSETS.fetch(new Request('https://glamiastore.com/fonts/NotoSans-Regular.ttf')).then(async response => {
    if (!response.ok) throw new Error('Bill font could not be loaded');
    return response.arrayBuffer();
  }).catch(error => { fontBytesPromise = null; throw error; });
  return fontBytesPromise;
}

let logoBytesPromise;
export async function billLogoBytes(env) {
  if (!logoBytesPromise) logoBytesPromise = env.ASSETS.fetch(new Request('https://glamiastore.com/glamia-g-favicon.png')).then(async response => {
    if (!response.ok) throw new Error('Bill logo could not be loaded');
    return response.arrayBuffer();
  }).catch(error => { logoBytesPromise = null; throw error; });
  return logoBytesPromise;
}
