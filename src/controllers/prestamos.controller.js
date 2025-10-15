import { pool } from '../db.js';

/**
 * @desc    Obtener todos los préstamos con la información de su cliente
 */
export const getPrestamos = async (req, res) => {
  try {
    // Esta consulta ahora también selecciona c.documento
    const query = `
      SELECT
        p.id_prestamo,
        p.nro_prestamo,
        p.analista,
        p.monto_original,
        p.saldo_capital_actual,
        p.tasa_interes_anual,
        p.mora_diaria_pct,
        p.plazo_meses,
        p.cuota_mensual_calculada,
        p.fecha_desembolso,
        p.cuotas_pagadas,
        p.cancelado,
        p.fecha_cancelacion,
        c.nombre AS cliente,
        c.documento,
        c.correo,
        c.celular
      FROM PRESTAMOS p
      JOIN CLIENTES c ON p.id_cliente = c.id_cliente
      ORDER BY p.cancelado ASC, p.fecha_desembolso DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener préstamos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Registrar un nuevo préstamo y, si es necesario, un nuevo cliente
 */
export const createPrestamo = async (req, res) => {
  const { cliente, documento, ...prestamoData } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Buscar o crear el cliente
    let resultCliente = await client.query('SELECT id_cliente FROM CLIENTES WHERE documento = $1', [documento]);
    let id_cliente;

    if (resultCliente.rows.length > 0) {
      id_cliente = resultCliente.rows[0].id_cliente;
    } else {
      const insertClienteQuery = 'INSERT INTO CLIENTES (documento, nombre, tipo_documento, origen_registro, celular, correo, direccion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_cliente;';
      const clienteValues = [
          documento, 
          cliente.nombre, 
          cliente.tipo === 'Persona Natural' ? 'DNI' : 'RUC', 
          cliente.origen,
          prestamoData.celular, // Guardamos celular y correo también en la tabla de clientes
          prestamoData.correo,
          cliente.direccion
        ];
      resultCliente = await client.query(insertClienteQuery, clienteValues);
      id_cliente = resultCliente.rows[0].id_cliente;
    }

    // 2. Insertar el préstamo
    const insertPrestamoQuery = `
        INSERT INTO PRESTAMOS (
            id_cliente, nro_prestamo, analista, monto_original, saldo_capital_actual, 
            tasa_interes_anual, mora_diaria_pct, plazo_meses, cuota_mensual_calculada, fecha_desembolso
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;
    `;
    const prestamoValues = [
      id_cliente,
      prestamoData.nroPrestamo,
      prestamoData.analista,
      prestamoData.montoOriginal,
      prestamoData.monto,
      prestamoData.interes,
      prestamoData.moraDiaria,
      prestamoData.plazo,
      prestamoData.cuotaMensual,
      prestamoData.fechaDesembolso
    ];
    
    const resultPrestamo = await client.query(insertPrestamoQuery, prestamoValues);
    
    await client.query('COMMIT');
    res.status(201).json(resultPrestamo.rows[0]);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar préstamo:', error);
    res.status(500).json({ message: 'Error al registrar el préstamo' });
  } finally {
    client.release();
  }
};

/**
 * @desc    Registrar el pago de una cuota
 */
export const pagarCuota = async (req, res) => {
  const { id } = req.params;
  const { nCuota, fechaPagoISO, capital, interes, moraCobrada, itf, totalPagado, saldoCapitalDespues } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Actualizar el préstamo
    const updatePrestamoQuery = 'UPDATE PRESTAMOS SET saldo_capital_actual = $1, cuotas_pagadas = $2 WHERE id_prestamo = $3;';
    await client.query(updatePrestamoQuery, [saldoCapitalDespues, nCuota, id]);

    // 2. Insertar el registro del pago
    const insertPagoQuery = `
      INSERT INTO PAGOS (id_prestamo, fecha_pago, tipo_pago, nro_cuota, monto_total_pagado, capital_pagado, interes_pagado, mora_cobrada, itf_cobrado, saldo_capital_despues) 
      VALUES ($1, $2, 'CUOTA', $3, $4, $5, $6, $7, $8, $9) RETURNING *;
    `;
    const pagoValues = [id, fechaPagoISO, nCuota, totalPagado, capital, interes, moraCobrada, itf, saldoCapitalDespues];
    const resultPago = await client.query(insertPagoQuery, pagoValues);

    await client.query('COMMIT');
    res.status(201).json(resultPago.rows[0]);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar el pago:', error);
    res.status(500).json({ message: 'Error interno al procesar el pago' });
  } finally {
    client.release();
  }
};

/**
 * @desc    Realizar la cancelación total de un préstamo
 */
export const cancelarPrestamo = async (req, res) => {
  const { id } = req.params;
  const { fechaCancelacion, totalPagado, itf } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Actualizar el préstamo a estado cancelado
    const updatePrestamoQuery = `
      UPDATE PRESTAMOS
      SET saldo_capital_actual = 0, cancelado = TRUE, fecha_cancelacion = $1, cuotas_pagadas = plazo_meses
      WHERE id_prestamo = $2;
    `;
    await client.query(updatePrestamoQuery, [fechaCancelacion, id]);

    // 2. Insertar el registro de la cancelación en la tabla PAGOS
    const capitalPagado = totalPagado - itf;
    const insertPagoQuery = `
        INSERT INTO PAGOS (id_prestamo, fecha_pago, tipo_pago, monto_total_pagado, capital_pagado, itf_cobrado, saldo_capital_despues) 
        VALUES ($1, $2, 'CANCELACIÓN TOTAL', $3, $4, $5, 0) RETURNING *;
    `;
    const pagoValues = [id, fechaCancelacion, totalPagado, capitalPagado, itf];
    const resultPago = await client.query(insertPagoQuery, pagoValues);

    await client.query('COMMIT');
    res.status(200).json({ message: 'Préstamo cancelado exitosamente', pago: resultPago.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al cancelar el préstamo:', error);
    res.status(500).json({ message: 'Error interno al cancelar el préstamo' });
  } finally {
    client.release();
  }
};

/**
 * @desc    Eliminar un préstamo y sus registros asociados
 */
export const deletePrestamo = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Por la restricción ON DELETE CASCADE en la tabla CUOTAS_PROGRAMADAS, solo necesitamos eliminar de PAGOS y PRESTAMOS.
        await client.query('DELETE FROM PAGOS WHERE id_prestamo = $1', [id]);
        await client.query('DELETE FROM PRESTAMOS WHERE id_prestamo = $1', [id]);
        // Opcional: Podrías añadir lógica para eliminar el cliente si no tiene más préstamos.
        await client.query('COMMIT');
        res.sendStatus(204); // 204 No Content: éxito, pero no se devuelve nada
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar préstamo:', error);
        res.status(500).json({ message: 'Error al eliminar el préstamo' });
    } finally {
        client.release();
    }
};