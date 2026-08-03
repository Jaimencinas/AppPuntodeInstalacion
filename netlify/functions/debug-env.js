// Función temporal de diagnóstico — borrar una vez resuelto el problema de la variable de entorno.
exports.handler = async function () {
  const val = process.env.AIRTABLE_TOKEN;
  const airtableKeys = Object.keys(process.env).filter(function (k) {
    return k.toUpperCase().indexOf("AIRTABLE") !== -1;
  });
  return {
    statusCode: 200,
    body: JSON.stringify({
      hasToken: !!val,
      tokenLength: val ? val.length : 0,
      tokenStartsWithPat: val ? val.slice(0, 3) === "pat" : false,
      matchingEnvKeys: airtableKeys,
      totalEnvKeys: Object.keys(process.env).length,
    }),
  };
};
