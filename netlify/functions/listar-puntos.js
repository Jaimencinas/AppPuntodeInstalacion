// Lista los puntos de instalación desde Airtable (para el login real).
// Requiere la variable de entorno AIRTABLE_TOKEN configurada en Netlify.
const BASE_ID = "appatrhvJiOYHePKP";
const TABLE_ID = "tblUMfqfIf5FA8Kdg"; // Puntos de instalación

exports.handler = async function () {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar AIRTABLE_TOKEN en Netlify" }) };
  }

  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: json }) };
    }
    const puntos = (json.records || []).map(function (r) {
      return {
        id: r.id,
        name: r.fields["Nombre"] || "",
        city: r.fields["Ciudad"] || "",
        type: r.fields["Tipo"] || "",
        email: r.fields["Email"] || "",
        clave: r.fields["Contraseña de acceso"] || "",
        stock: 5,
      };
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, puntos: puntos }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
