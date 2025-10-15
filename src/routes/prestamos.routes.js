import { Router } from 'express';

// 1. Importa todas las funciones que creaste en el controlador
import {
  getPrestamos,
  createPrestamo,
  pagarCuota,
  cancelarPrestamo,
  deletePrestamo
} from '../controllers/prestamos.controller.js';

const router = Router();

// === RUTAS PRINCIPALES DE PRÉSTAMOS ===

// Obtener todos los préstamos
router.get('/prestamos', getPrestamos);

// Crear un nuevo préstamo
router.post('/prestamos', createPrestamo);

// Eliminar un préstamo (Usa el ID del préstamo)
router.delete('/prestamos/:id', deletePrestamo);


// === RUTAS PARA ACCIONES ESPECÍFICAS DE UN PRÉSTAMO ===

// Registrar el pago de una cuota para un préstamo específico
router.post('/prestamos/:id/pagos', pagarCuota);

// Cancelar un préstamo de forma total
router.put('/prestamos/:id/cancelar', cancelarPrestamo);


export default router;