// src/index.js

// --- LÍNEAS DE DEPURACIÓN PARA VERIFICAR VARIABLES ---
console.log('--- VERIFICANDO VARIABLES DE ENTORNO EN RENDER ---');
console.log('DB_HOST leído por la aplicación:', process.env.DB_HOST);
console.log('DB_USER leído por la aplicación:', process.env.DB_USER);
console.log('--------------------------------------------------');


import express from 'express';
// ELIMINAMOS: import {PORT} from './config.js'; 
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

// Importamos las rutas
import prestamosRoutes from './routes/prestamos.routes.js';

// Asignamos el puerto de Render o un valor por defecto (ej. 3000)
// 💡 Render provee la variable PORT automáticamente.
const RENDER_PORT = process.env.PORT || 3000; 

// Inicialización
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middlewares
app.use(morgan('dev')); // Para ver las peticiones en consola
app.use(express.json()); // Para entender los JSON que envía el frontend

// Rutas de la API
app.use('/api', prestamosRoutes);

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar el servidor
app.listen(RENDER_PORT, () => { // Usamos RENDER_PORT
  console.log(`🚀 Servidor corriendo en el puerto ${RENDER_PORT}`);
}); 
// La línea 'http://localhost' solo es válida en desarrollo.
// En producción, solo importa el puerto.