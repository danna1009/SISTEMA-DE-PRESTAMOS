// src/db.js (Versión corregida para Render)

import pg from 'pg'; // Asegúrate de que 'pg' esté instalado (npm install pg)

// En Render, las variables se leen directamente del entorno (process.env)
// Las importaciones de './config.js' ya no son necesarias aquí.

export const pool = new pg.Pool({
  user: process.env.DB_USER,        // Leer de la variable de entorno de Render
  password: process.env.DB_PASSWORD, // Leer de la variable de entorno de Render
  host: process.env.DB_HOST,        // Leer de la variable de entorno de Render
  port: process.env.DB_PORT,        // Leer de la variable de entorno de Render
  database: process.env.DB_DATABASE,  // Leer de la variable de entorno de Render
  
  // 💡 ESTO ES CRÍTICO PARA RENDER (conexiones remotas):
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('✅ Conectado a la base de datos PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error en la conexión a la base de datos:', err);
});