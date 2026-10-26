const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const {
  formatCurrency,
  validateIndianMobile,
  checkIsInterState,
  calculateInvoiceTotals,
  DEFAULT_SUPPLIER_STATE,
} = require('./utils/gstCalculator');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Detect serverless environment (e.g. Vercel / AWS Lambda) where root filesystem is read-only
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOADS_ROOT = isServerless ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
const MANUFACTURER_DIR = path.join(UPLOADS_ROOT, 'manufacturer');
const MISC_DIR = path.join(UPLOADS_ROOT, 'miscellaneous');

// Safely ensure upload directories exist
[UPLOADS_ROOT, MANUFACTURER_DIR, MISC_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`Could not create directory ${dir}:`, err.message);
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
  if (!num || num <= 0) return 'Rupees Zero Only';

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
// 1. CREATE BILL: Generate Official Ekora Bazaar PDF with Item-wise GST
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

    // Standardize input products list
    const rawProducts = Array.isArray(products) && products.length > 0
      ? products
      : Array.isArray(items) && items.length > 0
      ? items
      : [
          { productName: 'Product 1', quantity: 1, unitPrice: 500, gstRate: 18 },
          { productName: 'Product 2', quantity: 2, unitPrice: 300, gstRate: 18 },
          { productName: 'Product 3', quantity: 1, unitPrice: 200, gstRate: 18 },
        ];

    // Determine Inter-state vs Intra-state based on customer billing state
    const customerState = billTo.state || customer.state || '';
    const isInterState = checkIsInterState(DEFAULT_SUPPLIER_STATE, customerState);

    // Calculate accurate item-level and invoice-level totals
    const calculation = calculateInvoiceTotals(rawProducts, parsedShipping, isInterState);
    const { subtotal, totalGST, totalCGST, totalSGST, totalIGST, grandTotal } = calculation;

    const computedProducts = calculation.items.map((p, idx) => ({
      sno: idx + 1,
      name: p.productName || p.name || p.description || `Product ${idx + 1}`,
      qty: p.quantity,
      unitPrice: p.unitPrice,
      gstRate: p.gstRate,
      gstAmount: p.gstAmount,
      lineTotal: p.lineTotal,
    }));

    const uniqueFilename = generateInvoiceFilename(invoiceNumber);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Invoice ${invoiceNumber}`,
        Author: 'EKORA BAZAAR',
      },
    });

    // Register system fonts for Indian Rupee symbol & serif headers if available
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
    // 3. BILL TO & SHIP TO BOXES (With Optional Customer Phone Number)
    // -------------------------------------------------------------
    const boxY = 224;
    const boxWidth = 248;
    const boxHeight = 104;
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

    // Extract customer phone numbers (sanitized)
    const billPhoneRes = validateIndianMobile(billTo.phone || customer.phone || '');
    const billPhone = billPhoneRes.isValid ? billPhoneRes.sanitized : '';

    const activeShipTo = Object.keys(shipTo).length > 0 ? shipTo : billTo;
    const shipPhoneRes = validateIndianMobile(activeShipTo.phone || billTo.phone || customer.phone || '');
    const shipPhone = shipPhoneRes.isValid ? shipPhoneRes.sanitized : '';

    // BILL TO Box
    doc.rect(leftMargin, boxY, boxWidth, boxHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.rect(leftMargin, boxY, boxWidth, 20).fill('#e8e8e8');
    doc.strokeColor('#000000').lineWidth(0.5).rect(leftMargin, boxY, boxWidth, 20).stroke();
    doc.fillColor('#000000').font(fontSansBold).fontSize(9).text('Bill To', leftMargin + 8, boxY + 6);

    const billCustName = billTo.customerName || customer.name || 'Customer Name';
    const billAddr1 = billTo.addressLine1 || customer.address || 'Address Line 1';
    const billAddr2 = billTo.addressLine2 || '';
    const billCSP = formatCSP(billTo.city ? billTo : customer);
    const billGstin = billTo.gstin ? `GSTIN (if any): ${billTo.gstin}` : 'GSTIN (if any): -';

    let currentBillY = boxY + 25;
    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000').text(billCustName, leftMargin + 8, currentBillY);
    currentBillY += 12;

    // Conditionally display Customer Phone Number (hide if empty)
    if (billPhone) {
      doc.font(fontSans).fontSize(8).fillColor('#333333').text(`Phone: ${billPhone}`, leftMargin + 8, currentBillY);
      currentBillY += 11;
    }

    doc.font(fontSans).fontSize(8).fillColor('#222222');
    doc.text(billAddr1, leftMargin + 8, currentBillY, { width: boxWidth - 16, lineGap: 1.5 });
    currentBillY += 11;

    if (billAddr2) {
      doc.text(billAddr2, leftMargin + 8, currentBillY, { width: boxWidth - 16, lineGap: 1.5 });
      currentBillY += 11;
    }

    doc.text(billCSP, leftMargin + 8, currentBillY, { width: boxWidth - 16, lineGap: 1.5 });
    currentBillY += 11;
    doc.text(billGstin, leftMargin + 8, currentBillY, { width: boxWidth - 16, lineGap: 1.5 });

    // SHIP TO Box
    doc.rect(shipBoxX, boxY, boxWidth, boxHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.rect(shipBoxX, boxY, boxWidth, 20).fill('#e8e8e8');
    doc.strokeColor('#000000').lineWidth(0.5).rect(shipBoxX, boxY, boxWidth, 20).stroke();
    doc.fillColor('#000000').font(fontSansBold).fontSize(9).text('Ship To', shipBoxX + 8, boxY + 6);

    const shipCustName = activeShipTo.customerName || billCustName;
    const shipAddr1 = activeShipTo.addressLine1 || billAddr1;
    const shipAddr2 = activeShipTo.addressLine2 || '';
    const shipCSP = formatCSP(activeShipTo.city ? activeShipTo : (billTo.city ? billTo : customer));

    let currentShipY = boxY + 25;
    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000').text(shipCustName, shipBoxX + 8, currentShipY);
    currentShipY += 12;

    // Conditionally display Customer Phone Number in Ship To (hide if empty)
    if (shipPhone) {
      doc.font(fontSans).fontSize(8).fillColor('#333333').text(`Phone: ${shipPhone}`, shipBoxX + 8, currentShipY);
      currentShipY += 11;
    }

    doc.font(fontSans).fontSize(8).fillColor('#222222');
    doc.text(shipAddr1, shipBoxX + 8, currentShipY, { width: boxWidth - 16, lineGap: 1.5 });
    currentShipY += 11;

    if (shipAddr2) {
      doc.text(shipAddr2, shipBoxX + 8, currentShipY, { width: boxWidth - 16, lineGap: 1.5 });
      currentShipY += 11;
    }

    doc.text(shipCSP, shipBoxX + 8, currentShipY, { width: boxWidth - 16, lineGap: 1.5 });

    // -------------------------------------------------------------
    // 4. PRODUCT TABLE (HSN Column Removed, Custom Item-wise GST Added)
    // -------------------------------------------------------------
    const tableY = 342;
    const colWidths = {
      sno: 30,
      name: 175,
      qty: 40,
      price: 70,
      gstRate: 55,
      gstAmount: 70,
      total: 75,
    };

    const colX = {
      sno: leftMargin, // 40
      name: leftMargin + colWidths.sno, // 70
      qty: leftMargin + colWidths.sno + colWidths.name, // 245
      price: leftMargin + colWidths.sno + colWidths.name + colWidths.qty, // 285
      gstRate: leftMargin + colWidths.sno + colWidths.name + colWidths.qty + colWidths.price, // 355
      gstAmount: leftMargin + colWidths.sno + colWidths.name + colWidths.qty + colWidths.price + colWidths.gstRate, // 410
      total: leftMargin + colWidths.sno + colWidths.name + colWidths.qty + colWidths.price + colWidths.gstRate + colWidths.gstAmount, // 480
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
    doc.text('Product Name', colX.name + 6, tableY + 8, { width: colWidths.name - 12, align: 'left' });
    doc.text('Qty', colX.qty, tableY + 8, { width: colWidths.qty, align: 'center' });
    doc.text('Unit Price (₹)', colX.price - 6, tableY + 8, { width: colWidths.price, align: 'right' });
    doc.text('GST %', colX.gstRate, tableY + 8, { width: colWidths.gstRate, align: 'center' });
    doc.text('GST Amt (₹)', colX.gstAmount - 6, tableY + 8, { width: colWidths.gstAmount, align: 'right' });
    doc.text('Total (₹)', colX.total - 6, tableY + 8, { width: colWidths.total, align: 'right' });

    // Table Rows
    let currentY = tableY + headerHeight;
    const rowHeight = 24;

    computedProducts.forEach((prod) => {
      doc.rect(leftMargin, currentY, contentWidth, rowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
      Object.values(colX).slice(1).forEach((x) => {
        doc.moveTo(x, currentY).lineTo(x, currentY + rowHeight).stroke();
      });

      doc.font(fontSans).fontSize(8.5).fillColor('#000000');
      doc.text(prod.sno.toString(), colX.sno, currentY + 7, { width: colWidths.sno, align: 'center' });
      doc.text(prod.name, colX.name + 6, currentY + 7, {
        width: colWidths.name - 12,
        ellipsis: true,
      });
      doc.text(prod.qty.toString(), colX.qty, currentY + 7, { width: colWidths.qty, align: 'center' });
      doc.text(formatCurrency(prod.unitPrice), colX.price - 6, currentY + 7, { width: colWidths.price, align: 'right' });
      doc.text(`${prod.gstRate}%`, colX.gstRate, currentY + 7, { width: colWidths.gstRate, align: 'center' });
      doc.text(formatCurrency(prod.gstAmount), colX.gstAmount - 6, currentY + 7, { width: colWidths.gstAmount, align: 'right' });
      doc.text(formatCurrency(prod.lineTotal), colX.total - 6, currentY + 7, { width: colWidths.total, align: 'right' });

      currentY += rowHeight;
    });

    // -------------------------------------------------------------
    // 5. TOTALS & AMOUNT IN WORDS
    // -------------------------------------------------------------
    const totalsY = currentY + 14;
    const totalsWidth = 240;
    const totalsX = rightMargin - totalsWidth;
    const totalsLabelWidth = 145;
    const totalsValueWidth = 95;
    const totalsRowHeight = 21;

    let totalBoxCursorY = totalsY;

    // Subtotal Row
    doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
    doc.text('Taxable Subtotal', totalsX + 8, totalBoxCursorY + 5);
    doc.font(fontSans).text(formatCurrency(subtotal), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
      width: totalsValueWidth,
      align: 'right',
    });
    totalBoxCursorY += totalsRowHeight;

    // Tax Rows (Intra-state CGST & SGST vs Inter-state IGST)
    if (!isInterState) {
      // CGST Row
      doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
      doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
      doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
      doc.text('CGST (Central Tax)', totalsX + 8, totalBoxCursorY + 5);
      doc.font(fontSans).text(formatCurrency(totalCGST), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
        width: totalsValueWidth,
        align: 'right',
      });
      totalBoxCursorY += totalsRowHeight;

      // SGST Row
      doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
      doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
      doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
      doc.text('SGST (State Tax)', totalsX + 8, totalBoxCursorY + 5);
      doc.font(fontSans).text(formatCurrency(totalSGST), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
        width: totalsValueWidth,
        align: 'right',
      });
      totalBoxCursorY += totalsRowHeight;
    } else {
      // IGST Row
      doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
      doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
      doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
      doc.text('IGST (Integrated Tax)', totalsX + 8, totalBoxCursorY + 5);
      doc.font(fontSans).text(formatCurrency(totalIGST), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
        width: totalsValueWidth,
        align: 'right',
      });
      totalBoxCursorY += totalsRowHeight;
    }

    // Total GST Row
    doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
    doc.text('Total Tax (GST)', totalsX + 8, totalBoxCursorY + 5);
    doc.font(fontSans).text(formatCurrency(totalGST), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
      width: totalsValueWidth,
      align: 'right',
    });
    totalBoxCursorY += totalsRowHeight;

    // Shipping (0% GST) Row
    doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight).stroke();
    doc.font(fontSansBold).fontSize(8.5).fillColor('#000000');
    doc.text('Shipping (0% GST)', totalsX + 8, totalBoxCursorY + 5);
    doc.font(fontSans).text(formatCurrency(parsedShipping), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 5, {
      width: totalsValueWidth,
      align: 'right',
    });
    totalBoxCursorY += totalsRowHeight;

    // Grand Total (₹) Row with light gray fill
    doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight + 2).fill('#e8e8e8');
    doc.rect(totalsX, totalBoxCursorY, totalsWidth, totalsRowHeight + 2).lineWidth(0.5).strokeColor('#000000').stroke();
    doc.moveTo(totalsX + totalsLabelWidth, totalBoxCursorY).lineTo(totalsX + totalsLabelWidth, totalBoxCursorY + totalsRowHeight + 2).stroke();
    doc.font(fontSansBold).fontSize(9.5).fillColor('#000000');
    doc.text('Grand Total (₹)', totalsX + 8, totalBoxCursorY + 6);
    doc.text(formatCurrency(grandTotal), totalsX + totalsLabelWidth - 8, totalBoxCursorY + 6, {
      width: totalsValueWidth,
      align: 'right',
    });

    // Amount in Words on Bottom Left
    const wordsY = totalsY + 14;
    doc.font(fontSansBold).fontSize(9).fillColor('#000000').text('Amount in Words:', leftMargin, wordsY);
    const wordsText = numberToIndianWords(grandTotal);
    doc.font(fontSans).fontSize(8.5).fillColor('#222222').text(wordsText, leftMargin, wordsY + 14, {
      width: totalsX - leftMargin - 16,
      lineGap: 2,
    });

    // Tax Regime Note
    const regimeY = wordsY + 44;
    doc.font(fontSans).fontSize(7.5).fillColor('#666666').text(
      isInterState
        ? 'Tax Regime: Inter-State Supply (IGST applicable)'
        : 'Tax Regime: Intra-State Supply (CGST 50% + SGST 50% applicable)',
      leftMargin,
      regimeY
    );

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

    if (!fs.existsSync(targetDir)) {
      return res.json({ category, count: 0, files: [] });
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

// Export app for Vercel Serverless Function & testing
module.exports = app;

// Start standalone server locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Auto_billing server running on http://localhost:${PORT}`);
  });
}
