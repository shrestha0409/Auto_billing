/**
 * Reusable GST Calculation Engine & Indian Mobile Phone Validator
 * Supports decimal arithmetic, consistent rounding, item-level GST, and tax breakdowns.
 */

export const GST_RATES = [0, 5, 12, 18, 28];
export const DEFAULT_GST_RATE = 18;
export const DEFAULT_SUPPLIER_STATE = 'Bihar';

/**
 * Standard rounding to 2 decimal places for financial calculations
 */
export function roundTo2Decimals(num) {
  const n = Number(num);
  if (isNaN(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Format number to Indian Currency string (e.g. 1,23,456.78)
 */
export function formatCurrency(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Validate Indian 10-digit mobile number
 * Phone is optional: empty string is valid.
 * If provided, must be a 10-digit number starting with 6, 7, 8, or 9 (with optional +91 or 0 prefix).
 */
export function validateIndianMobile(phone) {
  if (phone === undefined || phone === null) {
    return { isValid: true, error: null, sanitized: '' };
  }

  const trimmed = String(phone).trim();
  if (trimmed === '') {
    return { isValid: true, error: null, sanitized: '' };
  }

  // Remove common separators
  let cleaned = trimmed.replace(/[\s\-().]/g, '');

  // Strip leading +91 or 91 if followed by 10 digits
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Check 10 digits starting with 6, 7, 8, 9
  const indianMobileRegex = /^[6-9]\d{9}$/;
  if (indianMobileRegex.test(cleaned)) {
    return { isValid: true, error: null, sanitized: cleaned };
  }

  return {
    isValid: false,
    error: 'Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).',
    sanitized: trimmed,
  };
}

/**
 * Check if the transaction is inter-state (IGST) or intra-state (CGST + SGST)
 */
export function checkIsInterState(supplierState = DEFAULT_SUPPLIER_STATE, customerState = '') {
  if (!customerState) return false; // Default to intra-state if customer state not specified
  const normSupplier = String(supplierState).trim().toLowerCase();
  const normCustomer = String(customerState).trim().toLowerCase();
  return normSupplier !== normCustomer;
}

/**
 * Calculate financial totals for a single line item
 */
export function calculateItemGST(item, isInterState = false) {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const unitPrice = Math.max(0, Number(item.unitPrice !== undefined ? item.unitPrice : item.rate) || 0);
  const discount = Math.max(0, Number(item.discount) || 0);

  // Parse GST rate, defaulting to 18% if invalid
  let gstRate = Number(item.gstRate !== undefined ? item.gstRate : DEFAULT_GST_RATE);
  if (!GST_RATES.includes(gstRate)) {
    gstRate = DEFAULT_GST_RATE;
  }

  // Base taxable amount = (Qty * Unit Price) - Discount
  const rawTaxable = Math.max(0, qty * unitPrice - discount);
  const taxableAmount = roundTo2Decimals(rawTaxable);

  // GST Amount
  const rawGST = taxableAmount * (gstRate / 100);
  const gstAmount = roundTo2Decimals(rawGST);

  // Line Total
  const lineTotal = roundTo2Decimals(taxableAmount + gstAmount);

  // CGST / SGST / IGST breakdown
  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isInterState) {
    igstRate = gstRate;
    igstAmount = gstAmount;
  } else {
    cgstRate = gstRate / 2;
    sgstRate = gstRate / 2;
    cgstAmount = roundTo2Decimals(gstAmount / 2);
    sgstAmount = roundTo2Decimals(gstAmount - cgstAmount); // Ensure total matches gstAmount
  }

  return {
    quantity: qty,
    unitPrice,
    discount,
    gstRate,
    taxableAmount,
    gstAmount,
    lineTotal,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
  };
}

/**
 * Calculate complete invoice totals from list of products and shipping charge
 */
export function calculateInvoiceTotals(products = [], shippingCharge = 0, isInterState = false) {
  const validProducts = Array.isArray(products) ? products : [];
  const parsedShipping = Math.max(0, Number(shippingCharge) || 0);

  let subtotal = 0;
  let totalGST = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const calculatedItems = validProducts.map((p) => {
    const calc = calculateItemGST(p, isInterState);
    subtotal = roundTo2Decimals(subtotal + calc.taxableAmount);
    totalGST = roundTo2Decimals(totalGST + calc.gstAmount);
    totalCGST = roundTo2Decimals(totalCGST + calc.cgstAmount);
    totalSGST = roundTo2Decimals(totalSGST + calc.sgstAmount);
    totalIGST = roundTo2Decimals(totalIGST + calc.igstAmount);
    return {
      ...p,
      ...calc,
    };
  });

  const grandTotal = roundTo2Decimals(subtotal + totalGST + parsedShipping);

  return {
    items: calculatedItems,
    subtotal,
    totalGST,
    totalCGST,
    totalSGST,
    totalIGST,
    shippingCharge: parsedShipping,
    grandTotal,
    isInterState,
  };
}
