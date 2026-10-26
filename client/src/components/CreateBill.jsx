import React, { useState, useMemo } from 'react';
import {
  GST_RATES,
  DEFAULT_GST_RATE,
  DEFAULT_SUPPLIER_STATE,
  formatCurrency,
  validateIndianMobile,
  checkIsInterState,
  calculateItemGST,
  calculateInvoiceTotals,
} from '../utils/gstCalculator';

// Number to Indian Rupees Words Helper
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

export default function CreateBill() {
  // 1. Invoice Metadata
  const [invoiceNumber, setInvoiceNumber] = useState('EB/2025/001');
  const [invoiceDate, setInvoiceDate] = useState('2025-09-20');
  const [orderNumber, setOrderNumber] = useState('ORD12345');
  const [paymentMode, setPaymentMode] = useState('Online');

  // 2. Bill To (with Customer Phone Number)
  const [billTo, setBillTo] = useState({
    customerName: 'Customer Name',
    phone: '',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    city: 'Muzaffarpur',
    state: 'Bihar',
    pin: '842001',
    gstin: '',
  });

  // 3. Ship To (with Customer Phone Number)
  const [sameAsBillTo, setSameAsBillTo] = useState(true);
  const [shipTo, setShipTo] = useState({
    customerName: 'Customer Name',
    phone: '',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    city: 'Muzaffarpur',
    state: 'Bihar',
    pin: '842001',
  });

  // 4. Products Table (Item-wise GST rates, HSN column removed)
  const [products, setProducts] = useState([
    { id: 1, productName: 'Product 1', quantity: 1, unitPrice: 500, gstRate: 18 },
    { id: 2, productName: 'Product 2', quantity: 2, unitPrice: 300, gstRate: 18 },
    { id: 3, productName: 'Product 3', quantity: 1, unitPrice: 200, gstRate: 18 },
  ]);

  // 5. Shipping Charge (with 0% GST)
  const [shippingCharge, setShippingCharge] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState(null);

  // Phone number live validation
  const phoneValidation = useMemo(() => {
    return validateIndianMobile(billTo.phone);
  }, [billTo.phone]);

  // Inter-state tax determination based on customer billing state vs supplier state (Bihar)
  const isInterState = useMemo(() => {
    return checkIsInterState(DEFAULT_SUPPLIER_STATE, billTo.state);
  }, [billTo.state]);

  // Sync Ship To if "Same as Bill To" is active
  const handleBillToChange = (field, value) => {
    const updated = { ...billTo, [field]: value };
    setBillTo(updated);
    if (sameAsBillTo && field !== 'gstin') {
      setShipTo((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleShipToChange = (field, value) => {
    setShipTo((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSameAsBillTo = (e) => {
    const checked = e.target.checked;
    setSameAsBillTo(checked);
    if (checked) {
      setShipTo({
        customerName: billTo.customerName,
        phone: billTo.phone,
        addressLine1: billTo.addressLine1,
        addressLine2: billTo.addressLine2,
        city: billTo.city,
        state: billTo.state,
        pin: billTo.pin,
      });
    }
  };

  // Product item handlers - Solves Quantity & Price editing UX smoothly
  const handleProductChange = (index, field, value) => {
    const updated = [...products];
    if (field === 'quantity') {
      // Allow clearing the field or typing any number freely without jumping to 1
      if (value === '') {
        updated[index].quantity = '';
      } else {
        const cleaned = String(value).replace(/[^0-9]/g, '');
        updated[index].quantity = cleaned === '' ? '' : parseInt(cleaned, 10);
      }
    } else if (field === 'unitPrice') {
      if (value === '') {
        updated[index].unitPrice = '';
      } else {
        updated[index].unitPrice = value;
      }
    } else if (field === 'gstRate') {
      updated[index][field] = Number(value) || 0;
    } else {
      updated[index][field] = value;
    }
    setProducts(updated);
  };

  // On blur, enforce valid minimum positive numbers if empty
  const handleProductBlur = (index, field) => {
    const updated = [...products];
    if (field === 'quantity') {
      const parsed = parseInt(updated[index].quantity, 10);
      updated[index].quantity = !isNaN(parsed) && parsed >= 1 ? parsed : 1;
      setProducts(updated);
    } else if (field === 'unitPrice') {
      const parsed = parseFloat(updated[index].unitPrice);
      updated[index].unitPrice = !isNaN(parsed) && parsed >= 0 ? parsed : 0;
      setProducts(updated);
    }
  };

  const addProduct = () => {
    setProducts([
      ...products,
      {
        id: Date.now(),
        productName: `Product ${products.length + 1}`,
        quantity: 1,
        unitPrice: 100,
        gstRate: DEFAULT_GST_RATE, // 18% default rate for new items
      },
    ]);
  };

  const removeProduct = (index) => {
    if (products.length <= 1) {
      setNotification({ type: 'info', message: 'Invoice must contain at least one product.' });
      return;
    }
    setProducts(products.filter((_, idx) => idx !== index));
  };

  // Dynamic Calculations using the Accurate GST Engine
  const invoiceCalculations = useMemo(() => {
    return calculateInvoiceTotals(products, shippingCharge, isInterState);
  }, [products, shippingCharge, isInterState]);

  const { subtotal, totalGST, totalCGST, totalSGST, totalIGST, grandTotal } = invoiceCalculations;
  const parsedShipping = invoiceCalculations.shippingCharge;
  const amountInWords = useMemo(() => numberToIndianWords(grandTotal), [grandTotal]);

  // Handle PDF Generation and Download
  const handleGeneratePdf = async (e) => {
    e.preventDefault();

    if (!billTo.customerName.trim()) {
      setNotification({ type: 'danger', message: 'Please enter the Customer Name for Bill To.' });
      return;
    }

    // Validate phone number if entered (field is optional)
    if (!phoneValidation.isValid) {
      setNotification({
        type: 'danger',
        message: phoneValidation.error || 'Please enter a valid 10-digit Indian mobile number.',
      });
      return;
    }

    if (products.some((p) => !p.productName.trim())) {
      setNotification({ type: 'danger', message: 'Please ensure all products have a name.' });
      return;
    }

    // Normalize any temporary empty quantities or prices before generation
    const normalizedProducts = products.map((p) => ({
      ...p,
      quantity: Math.max(1, parseInt(p.quantity, 10) || 1),
      unitPrice: Math.max(0, parseFloat(p.unitPrice) || 0),
    }));

    setIsGenerating(true);
    setNotification(null);

    try {
      const finalCalculations = calculateInvoiceTotals(normalizedProducts, parsedShipping, isInterState);

      const payload = {
        invoiceNumber,
        invoiceDate,
        orderNumber,
        paymentMode,
        billTo: {
          ...billTo,
          phone: phoneValidation.sanitized,
        },
        shipTo: sameAsBillTo
          ? {
              customerName: billTo.customerName,
              phone: phoneValidation.sanitized,
              addressLine1: billTo.addressLine1,
              addressLine2: billTo.addressLine2,
              city: billTo.city,
              state: billTo.state,
              pin: billTo.pin,
            }
          : shipTo,
        products: finalCalculations.items,
        shippingCharge: parsedShipping,
        subtotal: finalCalculations.subtotal,
        tax: finalCalculations.totalGST,
        totalGST: finalCalculations.totalGST,
        totalCGST: finalCalculations.totalCGST,
        totalSGST: finalCalculations.totalSGST,
        totalIGST: finalCalculations.totalIGST,
        isInterState,
        grandTotal: finalCalculations.grandTotal,
      };

      const response = await fetch('/api/bills/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned status ${response.status}: ${errorText}`);
      }

      // Extract unique filename from Content-Disposition header sent by the backend
      let downloadFilename = '';
      const disposition = response.headers.get('content-disposition');
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
        if (match && match[1]) {
          downloadFilename = match[1].replace(/['"]/g, '').trim();
        }
      }

      // Fallback filename if header absent
      if (!downloadFilename) {
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
        downloadFilename = `${cleanBase}_${yyyymmdd}_${hhmmss}.pdf`;
      }

      if (!downloadFilename.toLowerCase().endsWith('.pdf')) {
        downloadFilename = `${downloadFilename}.pdf`;
      }

      // Handle response as a Blob with explicit application/pdf MIME type
      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });

      // Verify that the file is a valid PDF signature %PDF-
      const firstBytesBuffer = await pdfBlob.slice(0, 5).arrayBuffer();
      const signature = new TextDecoder('ascii').decode(firstBytesBuffer);
      if (signature !== '%PDF-') {
        throw new Error('Received invalid PDF format (missing %PDF- signature)');
      }

      // Create Blob URL
      const downloadUrl = window.URL.createObjectURL(pdfBlob);

      // Download file with filename ending in .pdf
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', downloadFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
      }, 5000);

      setNotification({
        type: 'success',
        message: `Success! Invoice "${downloadFilename}" generated and downloaded in official Ekora Bazaar format with item-wise GST.`,
      });
    } catch (err) {
      console.error('Invoice PDF error:', err);
      setNotification({
        type: 'danger',
        message: `Failed to generate PDF: ${err.message}. Please verify the server is running.`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Alert Notification */}
      {notification && (
        <div className={`alert-banner ${notification.type === 'danger' ? 'alert-danger' : notification.type === 'success' ? 'success' : 'info'}`}>
          <span>
            {notification.type === 'success' && '✓ '}
            {notification.type === 'danger' && '⚠️ '}
            {notification.type === 'info' && 'ℹ️ '}
            {notification.message}
          </span>
        </div>
      )}

      {/* Official Template Banner */}
      <div className="panel-card ekora-banner">
        <div className="ekora-banner-inner">
          <img
            src="/ekora-logo.png"
            alt="Ekora Bazaar"
            className="ekora-banner-logo"
          />
          <div>
            <h2 className="ekora-banner-title">
              EKORA BAZAAR — ARTISAN GOODS
            </h2>
            <p className="ekora-banner-subtitle">
              Official Tax Invoice Generator • GSTIN: 10AANFE1465G1ZR • Muzaffarpur, Bihar
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleGeneratePdf}>
        {/* Section 1: Invoice Details */}
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">1. Invoice Header & Metadata</h2>
              <p className="panel-subtitle">Document numbering, order reference, and payment mode</p>
            </div>
            <div className="tab-badge tax">
              {isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}
            </div>
          </div>

          <div className="grid-responsive-metadata metadata-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="invoice-num">Invoice Number *</label>
              <input
                id="invoice-num"
                className="form-input"
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. EB/2025/001"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="invoice-date">Invoice Date *</label>
              <input
                id="invoice-date"
                className="form-input"
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="order-num">Order Number *</label>
              <input
                id="order-num"
                className="form-input"
                type="text"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. ORD12345"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="payment-mode">Payment Mode *</label>
              <input
                id="payment-mode"
                className="form-input"
                type="text"
                required
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                placeholder="e.g. Online, Cash, UPI"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Bill To and Ship To */}
        <div className="grid-2">
          {/* Bill To */}
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">2. Bill To</h2>
                <p className="panel-subtitle">Billing address & customer info</p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="billto-customer-name">Customer Name *</label>
              <input
                id="billto-customer-name"
                className="form-input"
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={billTo.customerName}
                onChange={(e) => handleBillToChange('customerName', e.target.value)}
              />
            </div>

            {/* Customer Phone Number Field */}
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="billto-phone">
                Customer Phone Number <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <input
                id="billto-phone"
                className={`form-input ${!phoneValidation.isValid ? 'form-input-error' : ''}`}
                type="tel"
                inputMode="numeric"
                placeholder="e.g. 9876543210 (10-digit mobile)"
                value={billTo.phone}
                onChange={(e) => handleBillToChange('phone', e.target.value)}
                maxLength={15}
              />
              {!phoneValidation.isValid && (
                <span style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.2rem', display: 'block' }}>
                  ⚠️ {phoneValidation.error}
                </span>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="billto-addr1">Address Line 1 *</label>
              <input
                id="billto-addr1"
                className="form-input"
                type="text"
                required
                placeholder="e.g. Flat, House No., Building"
                value={billTo.addressLine1}
                onChange={(e) => handleBillToChange('addressLine1', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="billto-addr2">Address Line 2</label>
              <input
                id="billto-addr2"
                className="form-input"
                type="text"
                placeholder="e.g. Area, Colony, Street"
                value={billTo.addressLine2}
                onChange={(e) => handleBillToChange('addressLine2', e.target.value)}
              />
            </div>

            <div className="grid-3 csp-grid" style={{ marginBottom: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="billto-city">City *</label>
                <input
                  id="billto-city"
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. Muzaffarpur"
                  value={billTo.city}
                  onChange={(e) => handleBillToChange('city', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="billto-state">State *</label>
                <input
                  id="billto-state"
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. Bihar"
                  value={billTo.state}
                  onChange={(e) => handleBillToChange('state', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="billto-pin">PIN *</label>
                <input
                  id="billto-pin"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="e.g. 842001"
                  value={billTo.pin}
                  onChange={(e) => handleBillToChange('pin', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="billto-gstin">GSTIN (if any)</label>
              <input
                id="billto-gstin"
                className="form-input"
                type="text"
                placeholder="e.g. 10AANFE1465G1ZR or leave blank"
                value={billTo.gstin}
                onChange={(e) => handleBillToChange('gstin', e.target.value)}
              />
            </div>
          </div>

          {/* Ship To */}
          <div className="panel-card">
            <div className="panel-header" style={{ alignItems: 'center' }}>
              <div>
                <h2 className="panel-title">3. Ship To</h2>
                <p className="panel-subtitle">Delivery shipping address</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sameAsBillTo}
                  onChange={toggleSameAsBillTo}
                />
                <span>Same as Bill To</span>
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="shipto-customer-name">Customer Name *</label>
              <input
                id="shipto-customer-name"
                className="form-input"
                type="text"
                required
                disabled={sameAsBillTo}
                placeholder="e.g. Customer Name"
                value={shipTo.customerName}
                onChange={(e) => handleShipToChange('customerName', e.target.value)}
              />
            </div>

            {/* Customer Phone Number in Ship To */}
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="shipto-phone">
                Customer Phone Number <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <input
                id="shipto-phone"
                className="form-input"
                type="tel"
                inputMode="numeric"
                disabled={sameAsBillTo}
                placeholder="e.g. 9876543210 (10-digit mobile)"
                value={shipTo.phone}
                onChange={(e) => handleShipToChange('phone', e.target.value)}
                maxLength={15}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="shipto-addr1">Address Line 1 *</label>
              <input
                id="shipto-addr1"
                className="form-input"
                type="text"
                required
                disabled={sameAsBillTo}
                placeholder="e.g. Flat, House No., Building"
                value={shipTo.addressLine1}
                onChange={(e) => handleShipToChange('addressLine1', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" htmlFor="shipto-addr2">Address Line 2</label>
              <input
                id="shipto-addr2"
                className="form-input"
                type="text"
                disabled={sameAsBillTo}
                placeholder="e.g. Area, Colony, Street"
                value={shipTo.addressLine2}
                onChange={(e) => handleShipToChange('addressLine2', e.target.value)}
              />
            </div>

            <div className="grid-3 csp-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="shipto-city">City *</label>
                <input
                  id="shipto-city"
                  className="form-input"
                  type="text"
                  required
                  disabled={sameAsBillTo}
                  placeholder="e.g. Muzaffarpur"
                  value={shipTo.city}
                  onChange={(e) => handleShipToChange('city', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="shipto-state">State *</label>
                <input
                  id="shipto-state"
                  className="form-input"
                  type="text"
                  required
                  disabled={sameAsBillTo}
                  placeholder="e.g. Bihar"
                  value={shipTo.state}
                  onChange={(e) => handleShipToChange('state', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="shipto-pin">PIN *</label>
                <input
                  id="shipto-pin"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  required
                  disabled={sameAsBillTo}
                  placeholder="e.g. 842001"
                  value={shipTo.pin}
                  onChange={(e) => handleShipToChange('pin', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Products Table (Dual: Desktop Table + Mobile Product Cards) */}
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">4. Products Table</h2>
              <p className="panel-subtitle">Select custom item-wise GST rate (0%, 5%, 12%, 18%, 28%) for each product</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addProduct}
            >
              + Add Product
            </button>
          </div>

          {/* 1. Desktop & Tablet Table View */}
          <div className="items-table-wrapper desktop-table-view">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
                  <th>Product Name</th>
                  <th style={{ width: '85px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Unit Price (₹)</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>GST Rate (%)</th>
                  <th style={{ width: '115px', textAlign: 'right' }}>GST Amt (₹)</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Total (₹)</th>
                  <th style={{ width: '55px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod, index) => {
                  const lineCalc = calculateItemGST(prod, isInterState);
                  return (
                    <tr key={prod.id}>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {index + 1}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          style={{ width: '100%' }}
                          placeholder="Product Name"
                          required
                          value={prod.productName}
                          onChange={(e) => handleProductChange(index, 'productName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-input input-quantity"
                          style={{ textAlign: 'center' }}
                          value={prod.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                          onBlur={() => handleProductBlur(index, 'quantity')}
                          placeholder="1"
                          aria-label={`Quantity for row ${index + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          style={{ textAlign: 'right' }}
                          placeholder="0.00"
                          value={prod.unitPrice}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleProductChange(index, 'unitPrice', e.target.value)}
                          onBlur={() => handleProductBlur(index, 'unitPrice')}
                          aria-label={`Unit price for row ${index + 1}`}
                        />
                      </td>
                      {/* Item-wise GST Dropdown */}
                      <td>
                        <select
                          className="form-select"
                          style={{ width: '100%', textAlign: 'center', fontWeight: 600 }}
                          value={prod.gstRate !== undefined ? prod.gstRate : DEFAULT_GST_RATE}
                          onChange={(e) => handleProductChange(index, 'gstRate', e.target.value)}
                          aria-label={`GST rate for product ${index + 1}`}
                        >
                          {GST_RATES.map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="td-amount" style={{ color: 'var(--text-secondary)' }}>
                        ₹ {formatCurrency(lineCalc.gstAmount)}
                      </td>
                      <td className="td-amount">
                        ₹ {formatCurrency(lineCalc.lineTotal)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-danger"
                          title="Remove product"
                          onClick={() => removeProduct(index)}
                          aria-label={`Remove product ${index + 1}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile Responsive Product Cards View (<640px) */}
          <div className="mobile-product-cards-container mobile-card-view">
            {products.map((prod, index) => {
              const lineCalc = calculateItemGST(prod, isInterState);
              return (
                <div className="mobile-product-card" key={prod.id}>
                  {/* Card Header: Product # badge at top-left, Delete button at top-right */}
                  <div className="mobile-product-card-header">
                    <span className="mobile-product-index-badge">
                      Product #{index + 1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger mobile-card-delete-btn"
                      title={`Delete product ${index + 1}`}
                      onClick={() => removeProduct(index)}
                      aria-label={`Delete product ${index + 1}`}
                    >
                      ✕ Delete
                    </button>
                  </div>

                  {/* Clean divider below header */}
                  <div className="mobile-card-divider" />

                  {/* Card Body: Separate, full-width rows for every input field */}
                  <div className="mobile-product-body">
                    {/* 1. Full-width Product Name */}
                    <div className="form-group mobile-field">
                      <label className="form-label" htmlFor={`mobile-prod-name-${index}`}>
                        Product Name *
                      </label>
                      <input
                        id={`mobile-prod-name-${index}`}
                        type="text"
                        className="form-input"
                        placeholder="e.g. Product Name"
                        required
                        value={prod.productName}
                        onChange={(e) => handleProductChange(index, 'productName', e.target.value)}
                      />
                    </div>

                    {/* 2. Full-width Quantity Input */}
                    <div className="form-group mobile-field">
                      <label className="form-label" htmlFor={`mobile-prod-qty-${index}`}>
                        Quantity *
                      </label>
                      <input
                        id={`mobile-prod-qty-${index}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="form-input input-quantity"
                        value={prod.quantity}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                        onBlur={() => handleProductBlur(index, 'quantity')}
                        placeholder="1"
                        aria-label={`Quantity for product ${index + 1}`}
                      />
                    </div>

                    {/* 3. Full-width Price Input */}
                    <div className="form-group mobile-field">
                      <label className="form-label" htmlFor={`mobile-prod-price-${index}`}>
                        Price (₹) *
                      </label>
                      <input
                        id={`mobile-prod-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        placeholder="0.00"
                        value={prod.unitPrice}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleProductChange(index, 'unitPrice', e.target.value)}
                        onBlur={() => handleProductBlur(index, 'unitPrice')}
                        aria-label={`Price for product ${index + 1}`}
                      />
                    </div>

                    {/* 4. Full-width GST Rate Dropdown */}
                    <div className="form-group mobile-field">
                      <label className="form-label" htmlFor={`mobile-prod-gst-${index}`}>
                        GST Rate *
                      </label>
                      <select
                        id={`mobile-prod-gst-${index}`}
                        className="form-select"
                        value={prod.gstRate !== undefined ? prod.gstRate : DEFAULT_GST_RATE}
                        onChange={(e) => handleProductChange(index, 'gstRate', e.target.value)}
                        aria-label={`GST rate for product ${index + 1}`}
                      >
                        {GST_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}% GST
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 5. Well-organized GST calculation summary */}
                    <div className="mobile-product-card-totals">
                      <div className="mobile-calc-row">
                        <span className="mobile-calc-label">Taxable Amount:</span>
                        <span className="mobile-calc-value">₹ {formatCurrency(lineCalc.taxableAmount)}</span>
                      </div>
                      <div className="mobile-calc-row">
                        <span className="mobile-calc-label">GST ({lineCalc.gstRate}%):</span>
                        <span className="mobile-calc-value">₹ {formatCurrency(lineCalc.gstAmount)}</span>
                      </div>
                      <div className="mobile-calc-divider" />
                      <div className="mobile-calc-row mobile-calc-grand-total">
                        <span className="mobile-calc-label bold">Grand Total:</span>
                        <span className="mobile-calc-value bold">₹ {formatCurrency(lineCalc.lineTotal)}</span>
                      </div>
                    </div>

                    {/* 6. Full-width Delete Product Button */}
                    <button
                      type="button"
                      className="btn btn-danger btn-delete-product-full"
                      onClick={() => removeProduct(index)}
                      aria-label={`Delete product ${index + 1}`}
                    >
                      🗑️ Delete Product
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 5: Shipping Charge (0% GST) */}
        <div className="panel-card">
          <div className="panel-header" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="panel-title">5. Shipping Charge</h2>
              <p className="panel-subtitle">Delivery and courier charges (Exempt from GST / 0% GST)</p>
            </div>
            <div className="tab-badge zero-gst" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}>
              <span>✓</span> 0% GST (Tax Exempt)
            </div>
          </div>

          <div className="shipping-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="shipping-charge">
                Shipping / Delivery Charge (₹)
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    pointerEvents: 'none',
                  }}
                >
                  ₹
                </span>
                <input
                  id="shipping-charge"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ paddingLeft: '28px', fontSize: '1.05rem', fontWeight: 600 }}
                  placeholder="0.00"
                  value={shippingCharge}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setShippingCharge(e.target.value)}
                  onBlur={() => {
                    if (shippingCharge === '' || isNaN(parseFloat(shippingCharge))) {
                      setShippingCharge(0);
                    }
                  }}
                />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                0% GST is applied to shipping charges. Enter 0 if shipping is free or not applicable.
              </span>
            </div>

            <div className="shipping-info-banner">
              <div style={{ fontSize: '1.35rem', lineHeight: 1, marginTop: '2px' }}>🚚</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#065f46', marginBottom: '0.15rem' }}>
                  Zero-Rated Shipping (0% GST)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#047857', lineHeight: 1.4 }}>
                  This amount is added directly to the Grand Total with <strong>₹ 0.00 GST</strong>. Flexible GST rates apply individually to each product.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Bill Summary & Amount in Words */}
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">6. Bill Summary & Grand Total</h2>
              <p className="panel-subtitle">Official totals breakdown with item-wise GST and final amount payable</p>
            </div>
          </div>

          <div className="summary-grid">
            {/* Amount in Words */}
            <div className="amount-words-card">
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                Amount in Words:
              </div>
              <div style={{ fontSize: '0.95rem', color: '#1e293b', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.5 }}>
                {amountInWords}
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-main)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <strong>Tax Regime: </strong>
                {isInterState ? (
                  <span>Inter-State Transaction (IGST applicable)</span>
                ) : (
                  <span>Intra-State Transaction (CGST + SGST applicable)</span>
                )}
              </div>
            </div>

            {/* Official Totals Box */}
            <div className="bill-summary-card">
              <div className="summary-row">
                <span style={{ fontWeight: 600 }}>Taxable Subtotal:</span>
                <strong>₹ {formatCurrency(subtotal)}</strong>
              </div>

              {/* Tax Breakdowns */}
              {!isInterState ? (
                <>
                  <div className="summary-row" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <span>CGST (Central Tax):</span>
                    <span>₹ {formatCurrency(totalCGST)}</span>
                  </div>
                  <div className="summary-row" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <span>SGST (State Tax):</span>
                    <span>₹ {formatCurrency(totalSGST)}</span>
                  </div>
                </>
              ) : (
                <div className="summary-row" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <span>IGST (Integrated Tax):</span>
                  <span>₹ {formatCurrency(totalIGST)}</span>
                </div>
              )}

              <div className="summary-row tax-highlight">
                <span>Total GST:</span>
                <span>₹ {formatCurrency(totalGST)}</span>
              </div>

              <div className="summary-row shipping-highlight">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Shipping (0% GST):</span>
                  <span className="tab-badge zero-gst" style={{ fontSize: '0.65rem' }}>0% GST</span>
                </span>
                <strong>₹ {formatCurrency(parsedShipping)}</strong>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span className="summary-total-label">Grand Total (₹):</span>
                <span className="summary-total-amount">
                  ₹ {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="action-bar">
          <button
            type="submit"
            className="btn btn-primary btn-generate-pdf"
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Official PDF...' : '📄 Generate & Download Final Bill (PDF)'}
          </button>
        </div>
      </form>
    </div>
  );
}
