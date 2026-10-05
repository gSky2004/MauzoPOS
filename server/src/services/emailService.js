const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Email service — modular provider interface.
 *
 * Providers:
 *   log  — writes emails to the server console (development default, sends nothing).
 *   smtp — real sending via nodemailer (configure SMTP_HOST/USER/PASS in .env).
 *
 * The frontend never holds email secrets; everything happens server-side.
 */

const htmlLayout = (title, content) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <div style="background:#0f172a;color:#fff;padding:20px 28px">
      <h1 style="margin:0;font-size:18px;letter-spacing:1px">👟 M&E PUB SPORT SHOES</h1>
      <div style="font-size:12px;opacity:.7">Step into your game.</div>
    </div>
    <div style="padding:28px;color:#1e293b">
      <h2 style="margin:0 0 12px;font-size:16px">${title}</h2>
      ${content}
    </div>
    <div style="background:#f8fafc;padding:16px 28px;font-size:12px;color:#64748b">
      M&E Pub · DIT, Morogoro Road, Dar es Salaam · WhatsApp 0675029833
    </div>
  </div>
`;

const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

const orderItemsHtml = (items) => `
  <table style="width:100%;border-collapse:collapse;margin:8px 0">
    <tr style="background:#f1f5f9">
      <th style="text-align:left;padding:8px">Item</th>
      <th style="padding:8px">Size</th>
      <th style="padding:8px">Qty</th>
      <th style="text-align:right;padding:8px">Price</th>
    </tr>
    ${items
      .map(
        (i) => `
      <tr>
        <td style="padding:8px">${i.product_name}</td>
        <td style="padding:8px;text-align:center">${i.size}</td>
        <td style="padding:8px;text-align:center">${i.quantity}</td>
        <td style="padding:8px;text-align:right">${money(i.price * i.quantity)}</td>
      </tr>`
      )
      .join('')}
  </table>
`;

const transport = () => {
  if (env.emailProvider === 'smtp') {
    if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
      throw new Error(
        'SMTP not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in server/.env (see server/.env.example).'
      );
    }
    return nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure || env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return null;
};

const sendMail = async ({ to, subject, html }) => {
  if (env.emailProvider === 'log' || !transport()) {
    console.log('\n===== [EMAIL:' + env.emailProvider + '] =====');
    console.log('To:     ' + to);
    console.log('Subject:' + subject);
    console.log('Body:   ' + html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('======================================\n');
    return { status: 'logged', to, subject };
  }

  const t = transport();
  await t.verify().catch((err) => {
    throw new Error(`SMTP connection failed (${err.code || err.message}). Check SMTP_HOST/PORT/USER/PASS in server/.env`);
  });

  await t.sendMail({
    from: env.emailFrom,
    to,
    subject,
    html,
  });
  console.log(`[email] Sent to ${to}: "${subject}"`);
  return { status: 'sent', to, subject };
};

const trackingUrl = (order) =>
  `${env.clientUrl}/track?orderNumber=${encodeURIComponent(order.order_number)}&email=${encodeURIComponent(
    order.email
  )}`;

const trackButton = (order) =>
  `<p style="margin-top:24px">
     <a href="${trackingUrl(order)}" style="background:#0f172a;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:bold">TRACK YOUR ORDER</a>
   </p>
   <p style="font-size:12px;color:#64748b;margin-top:6px">Keep your Order ID <strong>${order.order_number}</strong> and email handy — you'll need both.</p>`;

const sendWelcome = ({ to, name }) =>
  sendMail({
    to,
    subject: 'Welcome to M&E Pub 👟',
    html: htmlLayout(
      `Welcome, ${name}!`,
      `<p>Your M&E Pub account <strong>${to}</strong> has been created — you're now part of the VIP crew.</p>
       <p>Login anytime to track orders, save your details and get first dibs on fresh arrivals.</p>
       <p style="margin-top:20px"><a href="${env.clientUrl}/login" style="background:#f97316;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">LOGIN NOW</a></p>`
    ),
  });

const sendOrderConfirmation = ({ order, items }) =>
  sendMail({
    to: order.email,
    subject: `Order ${order.order_number} received ✅`,
    html: htmlLayout(
      `Order received — ${order.order_number}`,
      `<p>Hi ${order.full_name}, thanks for shopping with M&E Pub.</p>
       ${orderItemsHtml(items)}
       <p><strong>Subtotal:</strong> ${money(order.subtotal)}<br/>
          <strong>Delivery fee:</strong> ${money(order.delivery_fee)}<br/>
          <strong>Total:</strong> ${money(order.total_amount)}</p>
       <p>We'll update you as soon as your order ships. WhatsApp us on <strong>0675029833</strong> for anything.</p>
       ${trackButton(order)}`
    ),
  });

const sendPaymentConfirmed = ({ order, items }) =>
  sendMail({
    to: order.email,
    subject: `Payment confirmed for ${order.order_number} 💳`,
    html: htmlLayout(
      `Payment confirmed`,
      `<p>Hi ${order.full_name}, your payment for order <strong>${order.order_number}</strong> was successful.</p>
       ${orderItemsHtml(items)}
       <p><strong>Total paid:</strong> ${money(order.total_amount)}</p>
       <p>Your order is now being processed. We'll keep you posted!</p>
       ${trackButton(order)}`
    ),
  });

const sendOrderStatusUpdate = ({ order }) => {
  const statusText = order.order_status.toLowerCase().replace(/_/g, ' ');
  const driverNote =
    order.order_status === 'SHIPPED'
      ? `<p>Your parcel is on the move — our driver is on the way to ${order.city}${order.area ? ', ' + order.area : ''}.</p>`
      : '';
  return sendMail({
    to: order.email,
    subject: `Order ${order.order_number} is now ${statusText} 📦`,
    html: htmlLayout(
      `Order status update`,
      `<p>Hi ${order.full_name},</p>
       <p>Your order <strong>${order.order_number}</strong> is now <strong>${order.order_status}</strong>.</p>
       ${driverNote}
       <p>Thank you for shopping with M&E Pub!</p>
       ${trackButton(order)}`
    ),
  });
};

const sendDeliveryConfirmation = ({ order }) =>
  sendMail({
    to: order.email,
    subject: `Delivery confirmed for ${order.order_number} ✅`,
    html: htmlLayout(
      `Delivery confirmed`,
      `<p>Hi ${order.full_name},</p>
       <p>Thanks for confirming you received order <strong>${order.order_number}</strong>. We'll mark it complete on our side shortly.</p>
       <p>Enjoy your new kicks! If anything isn't right, WhatsApp us on <strong>0675029833</strong>.</p>`
    ),
  });

const sendAdminNewOrder = ({ order, items }) => {
  const waLink = `https://wa.me/255675029833?text=${encodeURIComponent(
    `Hi ${order.full_name}, your M&E Pub order ${order.order_number} (${items
      .map((i) => `${i.product_name} x${i.quantity}`)
      .join(', ')}) has been received. Total: TZS ${money(order.total_amount)}.`
  )}`;
  return sendMail({
    to: env.contactToEmail,
    subject: `🛒 New order ${order.order_number} — TZS ${money(order.total_amount)}`,
    html: htmlLayout(
      `New order received`,
      `<p><strong>Order:</strong> ${order.order_number}<br/>
         <strong>Customer:</strong> ${order.full_name} · ${order.phone}<br/>
         <strong>Address:</strong> ${order.city}${order.area ? ', ' + order.area : ''} (${order.delivery_zone})<br/>
         <strong>Total:</strong> ${money(order.total_amount)}</p>
       ${orderItemsHtml(items)}
       <p style="margin-top:24px">
         <a href="${waLink}" style="background:#25d366;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:bold">CONTACT ${order.full_name.toUpperCase()} ON WHATSAPP</a>
       </p>`
    ),
  });
};

const sendContact = ({ name, email, subject, message }) =>
  sendMail({
    to: env.contactToEmail,
    subject: `[Contact] ${subject}`,
    html: htmlLayout(
      'New contact message',
      `<p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
       <p><strong>Subject:</strong> ${subject}</p>
       <div style="background:#f8fafc;border-left:3px solid #f97316;padding:12px 16px;margin-top:8px;white-space:pre-line">${message}</div>`
    ),
  });

const sendTest = ({ to }) =>
  sendMail({
    to,
    subject: 'M&E Pub — test email ✅',
    html: htmlLayout(
      `SMTP test`,
      `<p>This is a test email to confirm your SMTP configuration is working.</p>
       <p>If you're reading this, email is fully functional for order confirmations, status updates and tracking.</p>`
    ),
  });

const sendMarketing = ({ to, name, subject, body }) =>
  sendMail({
    to,
    subject,
    html: htmlLayout(
      `Hey ${name || 'there'}!`,
      `<p>${body}</p>
       <p style="margin-top:24px;font-size:12px;color:#64748b">
         You received this because you subscribed to the M&E Pub VIP list.
         <a href="${env.clientUrl}/newsletter/unsubscribe?email=${encodeURIComponent(
           to
         )}">Unsubscribe</a>
       </p>`
    ),
  });

module.exports = {
  sendMail,
  htmlLayout,
  sendWelcome,
  sendOrderConfirmation,
  sendPaymentConfirmed,
  sendOrderStatusUpdate,
  sendDeliveryConfirmation,
  sendAdminNewOrder,
  sendMarketing,
  sendContact,
  sendTest,
};
