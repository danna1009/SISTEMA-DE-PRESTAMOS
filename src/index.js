// src/index.js
import express from 'express';
import {PORT} from './config.js';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

// Importamos las rutas
import prestamosRoutes from './routes/prestamos.routes.js';

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
app.listen(PORT);
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);