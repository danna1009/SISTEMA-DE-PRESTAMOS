// database/db-setup.js
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ CORRECCIÓN: USAR RUTA RELATIVA
import { pool } from '../src/db.js'; // Sube un nivel (..) y entra a src/db.js

// Permite resolver rutas absolutas para leer el archivo SQL
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function setupDatabase() {
    try {
        // Asegúrate de que el archivo se llame init.sql (o ajusta el nombre si es db.sql)
        const sqlFilePath = path.join(__dirname, 'init.sql'); 
        const sql = readFileSync(sqlFilePath, 'utf-8');

        console.log('Iniciando la configuración de la base de datos (creando tablas)...');
        await pool.query(sql);
        console.log('✅ Base de datos inicializada: Tablas creadas correctamente.');

    } catch (error) {
        console.error('❌ Error al configurar la base de datos:', error.message);
        process.exit(1);
    } finally {
        await pool.end();  
    }
}

setupDatabase();