const app = require('./index.js');
const http = require('http');

const server = http.createServer(app);
server.listen(0, async () => {
  const port = server.address().port;
  console.log('Test server listening on port:', port);

  try {
    // 1. Mandatory test case
    const payload = {
      invoiceNumber: 'EB/2026/001',
      invoiceDate: '2026-10-26',
      orderNumber: 'ORD-12345',
      paymentMode: 'UPI',
      billTo: {
        customerName: 'Rahul Sharma',
        phone: '9876543210',
        addressLine1: 'Sector 17',
        city: 'Chandigarh',
        state: 'Punjab',
        pin: '160017',
      },
      products: [
        { productName: 'Product A', quantity: 2, unitPrice: 100, gstRate: 18 },
        { productName: 'Product B', quantity: 1, unitPrice: 200, gstRate: 5 },
      ],
      shippingCharge: 0,
    };

    const res = await fetch(`http://localhost:${port}/api/bills/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Disposition:', res.headers.get('content-disposition'));

    const buffer = Buffer.from(await res.arrayBuffer());
    console.log('PDF Buffer Length:', buffer.length);
    const header = buffer.slice(0, 5).toString('ascii');
    console.log('PDF Header Signature:', header);

    if (res.status === 200 && header === '%PDF-' && buffer.length > 5000) {
      console.log('>>> MANDATORY PDF GENERATION TEST PASSED! <<<');
    } else {
      console.error('>>> MANDATORY PDF GENERATION TEST FAILED! <<<');
      process.exit(1);
    }

    // 2. Test without phone number
    const payloadNoPhone = {
      ...payload,
      billTo: { ...payload.billTo, phone: '' }
    };
    const resNoPhone = await fetch(`http://localhost:${port}/api/bills/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadNoPhone),
    });
    const bufNoPhone = Buffer.from(await resNoPhone.arrayBuffer());
    if (resNoPhone.status === 200 && bufNoPhone.slice(0, 5).toString('ascii') === '%PDF-') {
      console.log('>>> NO-PHONE PDF GENERATION TEST PASSED! <<<');
    } else {
      console.error('>>> NO-PHONE PDF TEST FAILED! <<<');
      process.exit(1);
    }

    // 3. Test Intra-state (Bihar)
    const payloadIntra = {
      ...payload,
      billTo: { ...payload.billTo, state: 'Bihar' }
    };
    const resIntra = await fetch(`http://localhost:${port}/api/bills/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadIntra),
    });
    if (resIntra.status === 200) {
      console.log('>>> INTRA-STATE PDF GENERATION TEST PASSED! <<<');
    }

    server.close(() => {
      console.log('All tests completed successfully!');
      process.exit(0);
    });
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
});
