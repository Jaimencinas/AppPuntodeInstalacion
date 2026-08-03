// Recibe el webhook de WooCommerce ("Pedido creado"), genera el código VLT-XXXX
// y crea la reserva en Airtable. El QR se genera al vuelo a partir de ese código,
// no hace falta guardar ninguna imagen.
//
// Configurar en WooCommerce: Ajustes > Avanzado > Webhooks
//   Tema: Pedido creado
//   URL de entrega: https://tusitio.netlify.app/.netlify/functions/recibir-pedido
//   Secreto: el mismo valor que pongas en la variable de entorno WC_WEBHOOK_SECRET de Netlify
const crypto = require("crypto");

const BASE_ID = "appatrhvJiOYHePKP";
const RESERVAS_TABLE_ID = "tblQmnCMsSROWyeGB"; // Reservas

function verificarFirma(event) {
  const secret = process.env.WC_WEBHOOK_SECRET;
  if (!secret) return true; // sin secreto configurado todavía: no bloquea (solo para pruebas iniciales)
  const firmaRecibida = event.headers["x-wc-webhook-signature"] || event.headers["X-WC-Webhook-Signature"];
  if (!firmaRecibida) return false;
  const firmaEsperada = crypto.createHmac("sha256", secret).update(event.body || "").digest("base64");
  return firmaRecibida === firmaEsperada;
}

function qrUrl(codigo) {
  return "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(codigo);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  if (!verificarFirma(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Firma de WooCommerce inválida" }) };
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar AIRTABLE_TOKEN en Netlify" }) };
  }

  let order;
  try {
    order = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  // WooCommerce manda un webhook de prueba sin datos de pedido al activar el webhook.
  if (!order.id) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, note: "Sin pedido — probablemente el ping de prueba de WooCommerce" }) };
  }

  const codigo = "VLT-" + order.id;
  const billing = order.billing || {};
  const nombreCliente = [billing.first_name, billing.last_name].filter(Boolean).join(" ");

  const fields = {
    "Código": codigo,
    "Nº pedido WooCommerce": String(order.id),
    "Cliente nombre": nombreCliente,
    "Cliente teléfono": billing.phone || "",
    "Estado": "Pendiente",
    "Fecha": new Date().toISOString().slice(0, 10),
    "Importe cobrado": order.total ? Number(order.total) : undefined,
  };
  Object.keys(fields).forEach(function (k) { if (fields[k] === undefined) delete fields[k]; });

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${RESERVAS_TABLE_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    const json = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: json }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: json.id, codigo: codigo, qrUrl: qrUrl(codigo) }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
