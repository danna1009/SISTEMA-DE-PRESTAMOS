const { Pool } = require('pg');

// Crea el pool de conexiones con las variables de entorno
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // Esta configuración de SSL es necesaria para conectar con Render
  ssl: {
    rejectUnauthorized: false
  }
});

// Exporta el pool para que pueda ser utilizado en otros archivos
module.exports = pool;