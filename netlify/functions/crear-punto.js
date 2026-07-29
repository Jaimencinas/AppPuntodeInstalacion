// Crea un registro en la tabla "Puntos de instalación" de Airtable.
// Requiere la variable de entorno AIRTABLE_TOKEN configurada en Netlify.
const BASE_ID = "appatrhvJiOYHePKP";
const TABLE_ID = "tblUMfqfIf5FA8Kdg"; // Puntos de instalación

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar AIRTABLE_TOKEN en Netlify" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  if (!data.nombre || !data.email || !data.clave) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios (nombre, email, clave)" }) };
  }

  const fields = {
    "Nombre": data.nombre,
    "Tipo": data.tipo || "Taller",
    "Ciudad": data.ciudad || "",
    "Código postal": data.postalCode || "",
    "Dirección": data.direccion || "",
    "Persona responsable": data.responsable || "",
    "Teléfono": data.telefono || "",
    "Email": data.email,
    "Tipo de titular": data.tipoTitular === "empresa" ? "Empresa" : "Autónomo",
    "Razón social": data.razonSocial || "",
    "CIF": data.cif || "",
    "NIF": data.nif || "",
    "Nombre para pago": data.pagoNombre || "",
    "IBAN": data.iban || "",
    "Dirección bancaria": data.direccionBancaria || "",
    "Contraseña de acceso": data.clave,
    "Estado": "Activo",
    "Fecha de alta": new Date().toISOString().slice(0, 10),
    "Descripción pública": data.descripcion || "",
    "Notas internas": data.notas || "",
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
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
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: json.id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
