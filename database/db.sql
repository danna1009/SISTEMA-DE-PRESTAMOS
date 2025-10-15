-- ====================================================================
-- TABLA 1: CLIENTES (Incluye el campo 'es_pep' para la regla de DJ)
-- ====================================================================
CREATE TABLE CLIENTES (
    id_cliente SERIAL PRIMARY KEY,
    documento VARCHAR(11) UNIQUE NOT NULL, -- DNI (8) o RUC (11)
    nombre VARCHAR(255) NOT NULL,
    tipo_documento VARCHAR(4) NOT NULL, -- DNI, RUC
    direccion VARCHAR(255),
    correo VARCHAR(100),
    celular VARCHAR(15),
    origen_registro VARCHAR(10) NOT NULL, -- API o Manual
    es_pep BOOLEAN DEFAULT FALSE -- Adición: Persona Expuesta Políticamente (para regla de DJ)
);

-- ====================================================================
-- TABLA 2: PRESTAMOS (Incluye el campo 'requiere_dj')
-- ====================================================================
CREATE TABLE PRESTAMOS (
    id_prestamo SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL,
    nro_prestamo VARCHAR(10) UNIQUE,
    analista VARCHAR(50) NOT NULL,
    monto_original NUMERIC(10, 2) NOT NULL,
    saldo_capital_actual NUMERIC(10, 2) NOT NULL,
    tasa_interes_anual NUMERIC(5, 2) NOT NULL,
    mora_diaria_pct NUMERIC(5, 2),
    plazo_meses INT NOT NULL,
    cuota_mensual_calculada NUMERIC(10, 2) NOT NULL,
    fecha_desembolso DATE NOT NULL,
    cuotas_pagadas INT DEFAULT 0,
    cancelado BOOLEAN DEFAULT FALSE,
    fecha_cancelacion DATE,
    requiere_dj BOOLEAN DEFAULT FALSE, -- Adición: Resultado de la validación DJ/UIT/PEP
    
    CONSTRAINT fk_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES CLIENTES (id_cliente)
        ON DELETE RESTRICT
);

-- ====================================================================
-- TABLA 3: CUOTAS_PROGRAMADAS (El cronograma explícito, obligatorio para recálculos)
-- ====================================================================
CREATE TABLE CUOTAS_PROGRAMADAS (
    id_cuota SERIAL PRIMARY KEY,
    id_prestamo INT NOT NULL,
    nro_cuota INT NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_capital NUMERIC(10, 2) NOT NULL,
    monto_interes NUMERIC(10, 2) NOT NULL,
    monto_cuota_fija NUMERIC(10, 2) NOT NULL, -- Capital + Interés programado
    saldo_capital_antes NUMERIC(10, 2) NOT NULL,
    saldo_capital_despues NUMERIC(10, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, PAGADA, ATRASADA, ABONADA
    id_pago INT, -- Referencia al pago que liquidó esta cuota (opcional)
    
    CONSTRAINT fk_prestamo_cuota
        FOREIGN KEY (id_prestamo)
        REFERENCES PRESTAMOS (id_prestamo)
        ON DELETE CASCADE, -- Si se elimina el préstamo, se elimina su cronograma
        
    CONSTRAINT uk_prestamo_cuota UNIQUE (id_prestamo, nro_cuota) -- Cada cuota es única por préstamo
);

-- ====================================================================
-- TABLA 4: PAGOS (El historial de transacciones realizadas)
-- ====================================================================
CREATE TABLE PAGOS (
    id_pago SERIAL PRIMARY KEY,
    id_prestamo INT NOT NULL,
    fecha_pago DATE NOT NULL,
    tipo_pago VARCHAR(20) NOT NULL, -- CUOTA, ABONO CAPITAL, CANCELACIÓN TOTAL
    nro_cuota INT, -- Nro de cuota liquidada (si aplica)
    monto_total_pagado NUMERIC(10, 2) NOT NULL,
    capital_pagado NUMERIC(10, 2) DEFAULT 0,
    interes_pagado NUMERIC(10, 2) DEFAULT 0,
    mora_cobrada NUMERIC(10, 2) DEFAULT 0,
    itf_cobrado NUMERIC(5, 2) DEFAULT 0, -- Adición de ITF (0.005%) para la lógica de recibo
    saldo_capital_despues NUMERIC(10, 2) DEFAULT 0,
    
    CONSTRAINT fk_prestamo
        FOREIGN KEY (id_prestamo)
        REFERENCES PRESTAMOS (id_prestamo)
        ON DELETE RESTRICT -- No se puede eliminar un préstamo si tiene pagos
);