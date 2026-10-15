import React, { useState, useMemo } from 'react';

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

  // 2. Bill To
  const [billTo, setBillTo] = useState({
    customerName: 'Customer Name',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    city: 'Muzaffarpur',
    state: 'Bihar',
    pin: '842001',
    gstin: '',
  });

  // 3. Ship To
  const [sameAsBillTo, setSameAsBillTo] = useState(true);
  const [shipTo, setShipTo] = useState({
    customerName: 'Customer Name',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    city: 'Muzaffarpur',
    state: 'Bihar',
    pin: '842001',
  });

  // 4. Products Table
  const [products, setProducts] = useState([
    { id: 1, productName: 'Product 1', hsn: 'XXXX', quantity: 1, unitPrice: 500 },
    { id: 2, productName: 'Product 2', hsn: 'XXXX', quantity: 2, unitPrice: 300 },
    { id: 3, productName: 'Product 3', hsn: 'XXXX', quantity: 1, unitPrice: 200 },
  ]);

  // 5. Shipping Charge (with 0% GST)
  const [shippingCharge, setShippingCharge] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState(null);

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
        addressLine1: billTo.addressLine1,
        addressLine2: billTo.addressLine2,
        city: billTo.city,
        state: billTo.state,
        pin: billTo.pin,
      });
    }
  };

  // Product item handlers
  const handleProductChange = (index, field, value) => {
    const updated = [...products];
    if (field === 'quantity') {
      updated[index][field] = Math.max(1, parseInt(value, 10) || 1);
    } else if (field === 'unitPrice') {
      updated[index][field] = Math.max(0, parseFloat(value) || 0);
    } else {
      updated[index][field] = value;
    }
    setProducts(updated);
  };

  const addProduct = () => {
    setProducts([
      ...products,
      {
        id: Date.now(),
        productName: `Product ${products.length + 1}`,
        hsn: 'XXXX',
        quantity: 1,
        unitPrice: 100,
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

  // Dynamic Calculations
  const subtotal = useMemo(() => {
    return products.reduce((acc, p) => acc + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0), 0);
  }, [products]);

  const parsedShipping = useMemo(() => {
    const val = parseFloat(shippingCharge);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [shippingCharge]);

  const tax = useMemo(() => subtotal * 0.18, [subtotal]);
  const grandTotal = useMemo(() => subtotal + tax + parsedShipping, [subtotal, tax, parsedShipping]);
  const amountInWords = useMemo(() => numberToIndianWords(grandTotal), [grandTotal]);

  // Handle PDF Generation and Download
  const handleGeneratePdf = async (e) => {
    e.preventDefault();

    if (!billTo.customerName.trim()) {
      setNotification({ type: 'danger', message: 'Please enter the Customer Name for Bill To.' });
      return;
    }

    if (products.some((p) => !p.productName.trim())) {
      setNotification({ type: 'danger', message: 'Please ensure all products have a name.' });
      return;
    }

    setIsGenerating(true);
    setNotification(null);

    try {
      const payload = {
        invoiceNumber,
        invoiceDate,
        orderNumber,
        paymentMode,
        billTo,
        shipTo: sameAsBillTo
          ? {
              customerName: billTo.customerName,
              addressLine1: billTo.addressLine1,
              addressLine2: billTo.addressLine2,
              city: billTo.city,
              state: billTo.state,
              pin: billTo.pin,
            }
          : shipTo,
        products,
        shippingCharge: parsedShipping,
        subtotal,
        tax,
        grandTotal,
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

      // If Content-Disposition header was not present, generate unique timestamped filename fallback
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

      // Verify that the file is a valid PDF and begins with the PDF file signature: %PDF-
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

      // Clean up Blob URL after delay so browser download manager can read the blob
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
      }, 5000);

      setNotification({
        type: 'success',
        message: `Success! Invoice "${downloadFilename}" generated and downloaded in official Ekora Bazaar format with 18% tax.`,
      });
    } catch (err) {
      console.error(err);
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
      <div className="panel-card" style={{ background: '#fafbfc', borderLeft: '4px solid #000' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <img
            src="/ekora-logo.png"
            alt="Ekora Bazaar"
            style={{ width: '56px', height: '56px', objectFit: 'contain' }}
          />
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              EKORA BAZAAR — ARTISAN GOODS
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
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
              18% GST Auto-Calculated
            </div>
          </div>

          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
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
              <label className="form-label">Customer Name *</label>
              <input
                className="form-input"
                type="text"
                required
                placeholder="e.g. Customer Name"
                value={billTo.customerName}
                onChange={(e) => handleBillToChange('customerName', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label">Address Line 1 *</label>
              <input
                className="form-input"
                type="text"
                required
                placeholder="e.g. Flat, House No., Building"
                value={billTo.addressLine1}
                onChange={(e) => handleBillToChange('addressLine1', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label">Address Line 2</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Area, Colony, Street"
                value={billTo.addressLine2}
                onChange={(e) => handleBillToChange('addressLine2', e.target.value)}
              />
            </div>

            <div className="grid-3" style={{ marginBottom: '0.85rem' }}>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. Muzaffarpur"
                  value={billTo.city}
                  onChange={(e) => handleBillToChange('city', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">State *</label>
                <input
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. Bihar"
                  value={billTo.state}
                  onChange={(e) => handleBillToChange('state', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">PIN *</label>
                <input
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. 842001"
                  value={billTo.pin}
                  onChange={(e) => handleBillToChange('pin', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">GSTIN (if any)</label>
              <input
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
              <label className="form-label">Customer Name *</label>
              <input
                className="form-input"
                type="text"
                required
                disabled={sameAsBillTo}
                placeholder="e.g. Customer Name"
                value={shipTo.customerName}
                onChange={(e) => handleShipToChange('customerName', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label">Address Line 1 *</label>
              <input
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
              <label className="form-label">Address Line 2</label>
              <input
                className="form-input"
                type="text"
                disabled={sameAsBillTo}
                placeholder="e.g. Area, Colony, Street"
                value={shipTo.addressLine2}
                onChange={(e) => handleShipToChange('addressLine2', e.target.value)}
              />
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">City *</label>
                <input
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
                <label className="form-label">State *</label>
                <input
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
                <label className="form-label">PIN *</label>
                <input
                  className="form-input"
                  type="text"
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

        {/* Section 3: Products Table */}
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">4. Products Table</h2>
              <p className="panel-subtitle">Product Name, HSN, Quantity, and Unit Price (Amount = Qty × Unit Price)</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addProduct}
            >
              + Add Product
            </button>
          </div>

          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
                  <th>Product Name</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>HSN</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Unit Price (₹)</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Amount (₹)</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod, index) => {
                  const lineAmount = (Number(prod.quantity) || 0) * (Number(prod.unitPrice) || 0);
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
                          className="form-input"
                          style={{ textAlign: 'center' }}
                          placeholder="XXXX"
                          value={prod.hsn}
                          onChange={(e) => handleProductChange(index, 'hsn', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="form-input"
                          style={{ textAlign: 'center' }}
                          value={prod.quantity}
                          onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
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
                          onChange={(e) => handleProductChange(index, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td className="td-amount">
                        ₹ {lineAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
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
                  onChange={(e) => setShippingCharge(e.target.value)}
                />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                0% GST is applied to shipping charges. Enter 0 if shipping is free or not applicable.
              </span>
            </div>

            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1px solid var(--success-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem 1.15rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ fontSize: '1.35rem', lineHeight: 1, marginTop: '2px' }}>🚚</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#065f46', marginBottom: '0.15rem' }}>
                  Zero-Rated Shipping (0% GST)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#047857', lineHeight: 1.4 }}>
                  This amount is added directly to the Grand Total with <strong>₹ 0.00 GST</strong>. Standard 18% GST applies strictly to the product subtotal.
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
              <p className="panel-subtitle">Official totals breakdown and final amount payable</p>
            </div>
          </div>

          <div className="grid-2" style={{ alignItems: 'flex-start' }}>
            {/* Amount in Words */}
            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-main)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                Amount in Words:
              </div>
              <div style={{ fontSize: '0.95rem', color: '#1e293b', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.5 }}>
                {amountInWords}
              </div>
            </div>

            {/* Official Totals Box */}
            <div className="bill-summary-card">
              <div className="summary-row">
                <span style={{ fontWeight: 600 }}>Products Subtotal:</span>
                <strong>₹ {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="summary-row tax-highlight">
                <span>Total Tax (18% GST):</span>
                <span>₹ {tax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="summary-row shipping-highlight">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Shipping (0% GST):</span>
                  <span className="tab-badge zero-gst" style={{ fontSize: '0.65rem' }}>0% GST</span>
                </span>
                <strong>₹ {parsedShipping.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span className="summary-total-label">Grand Total (₹):</span>
                <span className="summary-total-amount">
                  ₹ {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', marginBottom: '3rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: '0.85rem 2.25rem', fontSize: '1.05rem' }}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Official PDF...' : '📄 Generate & Download Final Bill (PDF)'}
          </button>
        </div>
      </form>
    </div>
  );
}
