const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const MANUFACTURER_DIR = path.join(UPLOADS_ROOT, 'manufacturer');
const MISC_DIR = path.join(UPLOADS_ROOT, 'miscellaneous');

[UPLOADS_ROOT, MANUFACTURER_DIR, MISC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer Storage for Bills
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.params.category;
    if (category === 'manufacturer') {
      cb(null, MANUFACTURER_DIR);
    } else if (category === 'miscellaneous') {
      cb(null, MISC_DIR);
    } else {
      cb(new Error('Invalid bill category. Must be manufacturer or miscellaneous.'));
    }
  },
  filename: (req, file, cb) => {
    // Sanitize original file name and append timestamp
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    cb(null, `${uniqueSuffix}-${cleanName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Auto_billing API', timestamp: new Date() });
});

// -------------------------------------------------------------
// Helper: Number to Indian Rupees Words
// -------------------------------------------------------------
function numberToIndianWords(num) {
  if (!num || num === 0) return 'Rupees Zero Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(n) {
    let str = '';
    if (n >= 100) {
      str += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += units[n] + ' ';
    }
    return str.trim();
  }

  const rounded = Math.round(num * 100) / 100;
  const wholePart = Math.floor(rounded);
  const paisePart = Math.round((rounded - wholePart) * 100);

  let n = wholePart;
  let words = '';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  if (crore > 0) {
    words += convertLessThanOneThousand(crore) + ' Crore ';
  }

  const lakh = Math.floor(n / 100000);
  n %= 100000;
  if (lakh > 0) {
    words += convertLessThanOneThousand(lakh) + ' Lakh ';
  }

  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (thousand > 0) {
    words += convertLessThanOneThousand(thousand) + ' Thousand ';
  }

  if (n > 0) {
    words += convertLessThanOneThousand(n) + ' ';
  }

  words = words.trim();
  let result = words ? 'Rupees ' + words : '';

  if (paisePart > 0) {
    const paiseWords = convertLessThanOneThousand(paisePart);
    result += (result ? ' and ' : 'Rupees ') + paiseWords + ' Paise';
  }

  result += ' Only';
  return result.replace(/\s+/g, ' ');
}

function formatInvoiceDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatCurrency(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// -------------------------------------------------------------
// Helper: Generate Unique Timestamped Invoice Filename
// -------------------------------------------------------------
function generateInvoiceFilename(invoiceNumber) {
  const cleanBase = (invoiceNumber || 'Invoice')
    .toString()
    .trim()
    .replace(/[/\\:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/\.pdf$/i, '') || 'Invoice';

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyymmdd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const hhmmss = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `${cleanBase}_${yyyymmdd}_${hhmmss}.pdf`;
}

// -------------------------------------------------------------
// 1. CREATE BILL: Generate Official Ekora Bazaar PDF with 18% Tax
// -------------------------------------------------------------
app.post('/api/bills/generate-pdf', (req, res) => {
  try {
    const {
      invoiceNumber = 'EB/2025/001',
      invoiceDate = '2025-09-20',
      orderNumber = 'ORD12345',
      orderNo = '',
      paymentMode = 'Online',
      billTo = {},
      shipTo = {},
      customer = {},
      products = [],
      items = [],
      shippingCharge = 0,
    } = req.body;

    const parsedShipping = Math.max(0, Number(shippingCharge) || 0);
    const finalOrderNo = orderNumber || orderNo || 'ORD12345';
    const rawProducts = Array.isArray(products) && products.length > 0
      ? products
      : Array.isArray(items) && items.length > 0
      ? items
      : [
          { productName: 'Product 1', hsn: 'XXXX', quantity: 1, unitPrice: 500 },
          { productName: 'Product 2', hsn: 'XXXX', quantity: 2, unitPrice: 300 },
          { productName: 'Product 3', hsn: 'XXXX', quantity: 1, unitPrice: 200 },
        ];

    let subtotal = 0;
    const computedProducts = rawProducts.map((p, idx) => {
      const qty = Number(p.quantity) || 1;
      const price = Number(p.unitPrice !== undefined ? p.unitPrice : p.rate) || 0;
      const amount = qty * price;
      subtotal += amount;
      return {
        sno: idx + 1,
        name: p.productName || p.description || `Product ${idx + 1}`,
        hsn: p.hsn || 'XXXX',
        qty,
        unitPrice: price,
        amount,
      };
    });

    const tax = subtotal * 0.18; // Exactly 18% requirement
    const grandTotal = subtotal + tax + parsedShipping;

    const uniqueFilename = generateInvoiceFilename(invoiceNumber);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Invoice ${invoiceNumber}`,
        Author: 'EKORA BAZAAR',
      },
    });

    // Register system fonts for Indian Rupee symbol & serif headers
    const fontsDir = 'C:/Windows/Fonts';
    const hasArial = fs.existsSync(path.join(fontsDir, 'arial.ttf'));
    const hasArialBd = fs.existsSync(path.join(fontsDir, 'arialbd.ttf'));
    const hasTimes = fs.existsSync(path.join(fontsDir, 'times.ttf'));
    const hasTimesBd = fs.existsSync(path.join(fontsDir, 'timesbd.ttf'));

    const fontSans = hasArial ? 'Arial' : 'Helvetica';
    const fontSansBold = hasArialBd ? 'Arial-Bold' : 'Helvetica-Bold';
    const fontSerif = hasTimes ? 'Times-Roman-Local' : 'Times-Roman';
    const fontSerifBold = hasTimesBd ? 'Times-Bold-Local' : 'Times-Bold';

    if (hasArial) doc.registerFont('Arial', path.join(fontsDir, 'arial.ttf'));
    if (hasArialBd) doc.registerFont('Arial-Bold', path.join(fontsDir, 'arialbd.ttf'));
    if (hasTimes) doc.registerFont('Times-Roman-Local', path.join(fontsDir, 'times.ttf'));
    if (hasTimesBd) doc.registerFont('Times-Bold-Local', path.join(fontsDir, 'timesbd.ttf'));

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      res.send(pdfBuffer);
    });
    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate invoice PDF', details: err.message });
      }
    });

    const leftMargin = 40;
    const rightMargin = 555;
    const contentWidth = 515;

    // -------------------------------------------------------------
    // 1. TOP COMPANY HEADER
    // -------------------------------------------------------------
    const headerTop = 38;
    const headerBottom = 136;

    // Logo on Left
    const logoPath = path.join(__dirname, 'assets', 'ekora-logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 42, headerTop + 4, { width: 88, height: 88 });
    }

    // Vertical Divider 1
    doc.strokeColor('#000000').lineWidth(0.6);
    doc.moveTo(144, headerTop).lineTo(144, headerBottom).stroke();

    // Middle Column: EKORA BAZAAR & Address
    const midX = 160;
    doc.fillColor('#000000')
      .font(fontSerifBold)
      .fontSize(21)
      .text('EKORA BAZAAR', midX, headerTop + 6, { characterSpacing: 1.2 });

    doc.font(fontSans)
      .fontSize(8.5)
      .text('A R T I S A N   G O O D S', midX, headerTop + 32, { characterSpacing: 1.5 });

    doc.font(fontSans)
      .fontSize(8)
      .fillColor('#111111')
      .text('N/A, Islam Pur Road, Shyam Mandir,\nISLAMPUR POKHAR RAM LAL LANE,\nMuzaffarpur, Muzaffarpur, Bihar, 842001', midX, headerTop + 52, {
        lineGap: 2.5,
        width: 200,
      });

    // Vertical Divider 2
    doc.strokeColor('#000000').lineWidth(0.6);
    doc.moveTo(375, headerTop).lineTo(375, headerBottom).stroke();

    // Right Column: GSTIN, Email, Website with icons
    const rightX = 390;

    // GSTIN Row with icon
    const gstinY = headerTop + 14;
    doc.roundedRect(rightX, gstinY + 2, 12, 9, 1.5).lineWidth(0.6).strokeColor('#000000').stroke();
    doc.circle(rightX + 4, gstinY + 6.5, 1.5).fill('#000000');
    doc.moveTo(rightX + 7, gstinY + 5).lineTo(rightX + 10, gstinY + 5).stroke();
    doc.moveTo(rightX + 7, gstinY + 8).lineTo(rightX + 10, gstinY + 8).stroke();

    doc.fillColor('#000000').font(fontSans).fontSize(7.5).text('GSTIN/UIN:', rightX + 16, gstinY);
    doc.font(fontSansBold).fontSize(8.5).text('10AANFE1465G1ZR', rightX + 16, gstinY + 10);

    // Email Row with icon
    const emailY = headerTop + 50;
    doc.rect(rightX, emailY + 2, 12, 8).lineWidth(0.6).strokeColor('#000000').stroke();
    doc.moveTo(rightX, emailY + 2).lineTo(rightX + 6, emailY + 6.5).lineTo(rightX + 12, emailY + 2).stroke();
    doc.fillColor('#000000').font(fontSans).fontSize(8).text('techekora@gmail.com', rightX + 16, emailY + 2);

    // Website Row with icon
    const webY = headerTop + 72;
    doc.circle(rightX + 6, webY + 6, 5).lineWidth(0.6).strokeColor('#000000').stroke();
    doc.ellipse(rightX + 6, webY + 6, 2.5, 5).stroke();
    doc.moveTo(rightX + 1, webY + 6).lineTo(rightX + 11, webY + 6).stroke();
    doc.fillColor('#000000').font(fontSans).fontSize(8).text('www.ekorabazaar.in', rightX + 16, webY + 2);

    // Horizontal Divider below Header
    doc.strokeColor('#000000').lineWidth(0.75);
    doc.moveTo(leftMargin, 144).lineTo(rightMargin, 144).stroke();

    // -------------------------------------------------------------
    // 2. INVOICE TITLE & METADATA
    // -------------------------------------------------------------
    const invY = 160;
    doc.fillColor('#000000')
      .font(fontSerifBold)
      .fontSize(28)
      .text('INVOICE', leftMargin, invY, { characterSpacing: 1.5 });

    const rawInvoiceNo = invoiceNumber || 'EB/2025/001';
    const displayInvoiceNo = rawInvoiceNo.startsWith('#') ? rawInvoiceNo : `# ${rawInvoiceNo}`;
    doc.font(fontSans)
      .fontSize(10.5)
      .fillColor('#666666')
      .text(displayInvoiceNo, leftMargin, invY + 34);

    // Right Metadata Block (Invoice Date, Order No., Payment Mode)
    const metaLabelsX = 350;
    const metaValuesX = 430;
    const metaY = invY + 4;
    const metaLineHeight = 15;

    const invoiceDateStr = formatInvoiceDate(invoiceDate || '2025-09-20');
    const paymentModeStr = paymentMode || 'Online';

    doc.fillColor('#000000').font(fontSans).fontSize(9);

    doc.text('Invoice Date', metaLabelsX, metaY);
    doc.text(':', metaValuesX - 8, metaY);
    doc.text(invoiceDateStr, metaValuesX, metaY);

    doc.text('Order No.', metaLabelsX, metaY + metaLineHeight);
    doc.text(':', metaValuesX - 8, metaY + metaLineHeight);
    doc.text(finalOrderNo, metaValuesX, metaY + metaLineHeight);

    doc.text('Payment Mode', metaLabelsX, metaY + metaLineHeight * 2);
    doc.text(':', metaValuesX - 8, metaY + metaLineHeight * 2);
    doc.text(paymentModeStr, metaValuesX, metaY + metaLineHeight * 2);

    // -------------------------------------------------------------
    // 3. BILL TO & SHIP TO BOXES
    // -------------------------------------------------------------
    const boxY = 224;
    const boxWidth = 248;
    const boxHeight = 100;
    const shipBoxX = 307;

    // Helper for city, state, pin
    const formatCSP = (obj) => {
      if (obj.cityStatePin) return obj.cityStatePin;
      const parts = [];
      if (obj.city && obj.state) parts.push(`${obj.city}, ${obj.state}`);
      else if (obj.city) parts.push(obj.city);
      else if (obj.state) parts.push(obj.state);

      if (obj.pin) {
        return parts.length > 0 ? `${parts.join('')} - ${obj.pin}` : obj.pin;
      }
      return parts.join('') || 'City, State - PIN';
    };

    // BILL TO Box
    doc.rect(leftMargin, boxY, boxWidth, boxHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.rect(leftMargin, boxY, boxWidth, 20).fill('#e8e8e8');
    doc.strokeColor('#000000').lineWidth(0.5).rect(leftMargin, boxY, boxWidth, 20).stroke();
    doc.fillColor('#000000').font(fontSansBold).fontSize(9).text('Bill To', leftMargin + 8, boxY + 6);

    const billCustName = billTo.customerName || customer.name || 'Customer Name';
    const billAddr1 = billTo.addressLine1 || customer.address || 'Address Line 1';
    const billAddr2 = billTo.addressLine2 || 'Address Line 2';
    const billCSP = formatCSP(billTo.city ? billTo : customer);
    const billGstin = billTo.gstin ? `GSTIN (if any): ${billTo.gstin}` : 'GSTIN (if any): -';

    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000').text(billCustName, leftMargin + 8, boxY + 26);
    doc.font(fontSans).fontSize(8).fillColor('#222222');
    doc.text(billAddr1, leftMargin + 8, boxY + 40, { width: boxWidth - 16, lineGap: 1.5 });
    doc.text(billAddr2, leftMargin + 8, boxY + 53, { width: boxWidth - 16, lineGap: 1.5 });
    doc.text(billCSP, leftMargin + 8, boxY + 66, { width: boxWidth - 16, lineGap: 1.5 });
    doc.text(billGstin, leftMargin + 8, boxY + 79, { width: boxWidth - 16, lineGap: 1.5 });

    // SHIP TO Box
    doc.rect(shipBoxX, boxY, boxWidth, boxHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.rect(shipBoxX, boxY, boxWidth, 20).fill('#e8e8e8');
    doc.strokeColor('#000000').lineWidth(0.5).rect(shipBoxX, boxY, boxWidth, 20).stroke();
    doc.fillColor('#000000').font(fontSansBold).fontSize(9).text('Ship To', shipBoxX + 8, boxY + 6);

    const activeShipTo = Object.keys(shipTo).length > 0 ? shipTo : billTo;
    const shipCustName = activeShipTo.customerName || billCustName;
    const shipAddr1 = activeShipTo.addressLine1 || billAddr1;
    const shipAddr2 = activeShipTo.addressLine2 || billAddr2;
    const shipCSP = formatCSP(activeShipTo.city ? activeShipTo : (billTo.city ? billTo : customer));

    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000').text(shipCustName, shipBoxX + 8, boxY + 26);
    doc.font(fontSans).fontSize(8).fillColor('#222222');
    doc.text(shipAddr1, shipBoxX + 8, boxY + 40, { width: boxWidth - 16, lineGap: 1.5 });
    doc.text(shipAddr2, shipBoxX + 8, boxY + 53, { width: boxWidth - 16, lineGap: 1.5 });
    doc.text(shipCSP, shipBoxX + 8, boxY + 66, { width: boxWidth - 16, lineGap: 1.5 });

    // -------------------------------------------------------------
    // 4. PRODUCT TABLE
    // -------------------------------------------------------------
    const tableY = 338;
    const colWidths = {
      sno: 45,
      name: 175,
      hsn: 65,
      qty: 50,
      price: 90,
      amount: 90,
    };

    const colX = {
      sno: leftMargin,
      name: leftMargin + colWidths.sno,
      hsn: leftMargin + colWidths.sno + colWidths.name,
      qty: leftMargin + colWidths.sno + colWidths.name + colWidths.hsn,
      price: leftMargin + colWidths.sno + colWidths.name + colWidths.hsn + colWidths.qty,
      amount: leftMargin + colWidths.sno + colWidths.name + colWidths.hsn + colWidths.qty + colWidths.price,
    };

    // Table Header
    const headerHeight = 26;
    doc.rect(leftMargin, tableY, contentWidth, headerHeight).fill('#e8e8e8');
    doc.rect(leftMargin, tableY, contentWidth, headerHeight).lineWidth(0.5).strokeColor('#000000').stroke();

    Object.values(colX).slice(1).forEach((x) => {
      doc.moveTo(x, tableY).lineTo(x, tableY + headerHeight).stroke();
    });

    doc.fillColor('#000000').font(fontSansBold).fontSize(8.5);
    doc.text('S. No.', colX.sno, tableY + 8, { width: colWidths.sno, align: 'center' });
    doc.text('Product Name', colX.name + 8, tableY + 8, { width: colWidths.name - 16, align: 'left' });
    doc.text('HSN', colX.hsn, tableY + 8, { width: colWidths.hsn, align: 'center' });
    doc.text('Qty', colX.qty, tableY + 8, { width: colWidths.qty, align: 'center' });
    doc.text('Unit Price (₹)', colX.price - 8, tableY + 8, { width: colWidths.price, align: 'right' });
    doc.text('Amount (₹)', colX.amount - 8, tableY + 8, { width: colWidths.amount, align: 'right' });

    // Table Rows
    let currentY = tableY + headerHeight;
    const rowHeight = 24;

    computedProducts.forEach((prod, idx) => {
      doc.rect(leftMargin, currentY, contentWidth, rowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
      Object.values(colX).slice(1).forEach((x) => {
        doc.moveTo(x, currentY).lineTo(x, currentY + rowHeight).stroke();
      });

      doc.font(fontSans).fontSize(8.5).fillColor('#000000');
      doc.text(prod.sno.toString(), colX.sno, currentY + 7, { width: colWidths.sno, align: 'center' });
      doc.text(prod.name, colX.name + 8, currentY + 7, {
        width: colWidths.name - 16,
        ellipsis: true,
      });
      doc.text(prod.hsn, colX.hsn, currentY + 7, { width: colWidths.hsn, align: 'center' });
      doc.text(prod.qty.toString(), colX.qty, currentY + 7, { width: colWidths.qty, align: 'center' });
      doc.text(formatCurrency(prod.unitPrice), colX.price - 8, currentY + 7, { width: colWidths.price, align: 'right' });
      doc.text(formatCurrency(prod.amount), colX.amount - 8, currentY + 7, { width: colWidths.amount, align: 'right' });

      currentY += rowHeight;
    });

    // -------------------------------------------------------------
    // 5. TOTALS & AMOUNT IN WORDS
    // -------------------------------------------------------------
    const totalsY = currentY + 14;
    const totalsWidth = 230;
    const totalsX = rightMargin - totalsWidth;
    const totalsLabelWidth = 140;
    const totalsValueWidth = 90;
    const totalsRowHeight = 22;

    // Subtotal Row
    doc.rect(totalsX, totalsY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, totalsY).lineTo(totalsX + totalsLabelWidth, totalsY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(9).fillColor('#000000');
    doc.text('Subtotal', totalsX + 10, totalsY + 6);
    doc.font(fontSans).text(formatCurrency(subtotal), totalsX + totalsLabelWidth - 10, totalsY + 6, {
      width: totalsValueWidth,
      align: 'right',
    });

    // Total Tax (18%) Row
    const taxY = totalsY + totalsRowHeight;
    doc.rect(totalsX, taxY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, taxY).lineTo(totalsX + totalsLabelWidth, taxY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(9).fillColor('#000000');
    doc.text('Total Tax (18%)', totalsX + 10, taxY + 6);
    doc.font(fontSans).text(formatCurrency(tax), totalsX + totalsLabelWidth - 10, taxY + 6, {
      width: totalsValueWidth,
      align: 'right',
    });

    // Shipping (0% GST) Row
    const shippingY = taxY + totalsRowHeight;
    doc.rect(totalsX, shippingY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, shippingY).lineTo(totalsX + totalsLabelWidth, shippingY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(9).fillColor('#000000');
    doc.text('Shipping (0% GST)', totalsX + 10, shippingY + 6);
    doc.font(fontSans).text(formatCurrency(parsedShipping), totalsX + totalsLabelWidth - 10, shippingY + 6, {
      width: totalsValueWidth,
      align: 'right',
    });

    // Grand Total (₹) Row with light gray fill
    const grandY = shippingY + totalsRowHeight;
    doc.rect(totalsX, grandY, totalsWidth, totalsRowHeight).fill('#e8e8e8');
    doc.rect(totalsX, grandY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, grandY).lineTo(totalsX + totalsLabelWidth, grandY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(9.5).fillColor('#000000');
    doc.text('Grand Total (₹)', totalsX + 10, grandY + 6);
    doc.text(formatCurrency(grandTotal), totalsX + totalsLabelWidth - 10, grandY + 6, {
      width: totalsValueWidth,
      align: 'right',
    });

    // Amount in Words on Bottom Left
    const wordsY = totalsY + 16;
    doc.font(fontSansBold).fontSize(9).fillColor('#000000').text('Amount in Words:', leftMargin, wordsY);
    const wordsText = numberToIndianWords(grandTotal);
    doc.font(fontSans).fontSize(8.5).fillColor('#222222').text(wordsText, leftMargin, wordsY + 14, {
      width: totalsX - leftMargin - 16,
      lineGap: 2,
    });

    // -------------------------------------------------------------
    // 6. FOOTER
    // -------------------------------------------------------------
    const footerLineY = 710;
    doc.strokeColor('#000000').lineWidth(0.75);
    doc.moveTo(leftMargin, footerLineY).lineTo(rightMargin, footerLineY).stroke();

    // Centered Thank You Message
    doc.font(fontSans)
      .fontSize(9)
      .fillColor('#000000')
      .text('Thank you for shopping with Ekora Bazaar!', leftMargin, footerLineY + 12, {
        width: contentWidth,
        align: 'center',
      });

    // Authorized Signatory Line on Right
    const signY = footerLineY + 45;
    const signWidth = 140;
    const signX = rightMargin - signWidth;

    doc.strokeColor('#000000').lineWidth(0.5);
    doc.moveTo(signX, signY).lineTo(rightMargin, signY).stroke();
    doc.font(fontSans)
      .fontSize(8.5)
      .fillColor('#000000')
      .text('Authorized Signatory', signX, signY + 5, {
        width: signWidth,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate invoice PDF', details: error.message });
    }
  }
});

// -------------------------------------------------------------
// 2 & 3. UPLOAD BILLS (Manufacturer & Miscellaneous)
// -------------------------------------------------------------
app.post('/api/bills/upload/:category', upload.single('billFile'), (req, res) => {
  try {
    const category = req.params.category;
    if (!['manufacturer', 'miscellaneous'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Use manufacturer or miscellaneous.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select a bill to upload.' });
    }

    res.status(201).json({
      success: true,
      message: `${category === 'manufacturer' ? 'Manufacturer' : 'Miscellaneous'} bill uploaded and stored successfully.`,
      file: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype,
        category: category,
        uploadedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload bill', details: error.message });
  }
});

// Endpoint to list uploaded files for verification
app.get('/api/bills/uploads/:category', (req, res) => {
  try {
    const category = req.params.category;
    const targetDir = category === 'manufacturer' ? MANUFACTURER_DIR : category === 'miscellaneous' ? MISC_DIR : null;

    if (!targetDir) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const files = fs.readdirSync(targetDir).map((fileName) => {
      const stats = fs.statSync(path.join(targetDir, fileName));
      return {
        fileName,
        sizeBytes: stats.size,
        uploadedAt: stats.mtime,
      };
    });

    res.json({ category, count: files.length, files: files.reverse() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list uploads', details: error.message });
  }
});

// Serve uploaded bill files statically if needed for previewing/downloading
app.use('/uploads', express.static(UPLOADS_ROOT));

// Start server
app.listen(PORT, () => {
  console.log(`Auto_billing server running on http://localhost:${PORT}`);
});
