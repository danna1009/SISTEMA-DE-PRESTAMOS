# ✅ Sistema de Validación de Préstamos - Actualización

## 🆕 Nueva Funcionalidad Agregada

Se ha implementado un sistema de validación que **controla los préstamos por cliente** para garantizar un comportamiento crediticio responsable y evaluar el historial de pagos.

---

## 📋 Reglas de Validación

### 1. **Un Préstamo Activo por Cliente**
- Un cliente **NO puede tener más de un préstamo activo** al mismo tiempo
- Si intenta registrar un nuevo préstamo mientras tiene uno activo, el sistema lo bloqueará
- **Mensaje mostrado:**  
  _"Este cliente ya tiene un préstamo activo. Debe cancelarlo antes de solicitar uno nuevo."_

### 2. **Período de Espera de 1 Mes Después de Cancelar**
- Después de **cancelar completamente un préstamo**, el cliente debe esperar **1 mes** antes de poder solicitar otro
- Esto permite un tiempo mínimo de enfriamiento entre préstamos
- **Mensaje mostrado:**  
  _"El cliente canceló su préstamo hace X día(s). Debe esperar 1 mes desde la cancelación. Disponible a partir del: DD/MM/AAAA"_

### 3. **Solo 1 Préstamo por Mes**
- Un cliente **solo puede solicitar 1 préstamo por mes**
- Si ya solicitó un préstamo este mes, debe esperar a demostrar su historial de pagos
- Esto permite evaluar su comportamiento de pago antes de otorgar otro crédito
- **Mensaje mostrado:**  
  _"El cliente ya solicitó un préstamo este mes (DD/MM/AAAA). Solo se permite 1 préstamo por mes. Debe esperar a demostrar su historial de pagos."_

---

## 🔍 Cómo Funciona

### Validación por Documento
- El sistema identifica a cada cliente por su **número de documento** (DNI o RUC)
- Cada vez que intentas registrar un préstamo, verifica:
  1. ¿El cliente tiene préstamos activos?
  2. Si tuvo préstamos cancelados, ¿ha pasado 1 mes desde la cancelación?
  3. ¿Ya solicitó un préstamo este mes?

### Ejemplo Práctico

**Escenario 1: Cliente con préstamo activo**
```
Cliente: Juan Pérez (DNI: 12345678)
Préstamo actual: S/ 5,000 - 12 meses - Cuotas pagadas: 5/12
Intento nuevo préstamo: ❌ BLOQUEADO
Razón: Tiene un préstamo activo
Solución: Cancelar el préstamo actual primero
```

**Escenario 2: Cliente que canceló hace menos de 1 mes**
```
Cliente: María López (DNI: 87654321)
Préstamo anterior: Cancelado el 10/10/2025
Intento nuevo préstamo: 25/10/2025 ❌ BLOQUEADO
Razón: Solo han pasado 15 días (necesita 1 mes)
Disponible desde: 10/11/2025
```

**Escenario 3: Cliente que ya solicitó un préstamo este mes**
```
Cliente: Carlos García (DNI: 11223344)
Préstamo anterior: Otorgado el 05/10/2025
Intento nuevo préstamo: 20/10/2025 ❌ BLOQUEADO
Razón: Ya solicitó 1 préstamo este mes
Solución: Esperar al próximo mes y demostrar buen historial de pagos
```

**Escenario 4: Cliente puede solicitar nuevo préstamo**
```
Cliente: Ana Torres (DNI: 99887766)
Préstamo anterior: Cancelado el 15/08/2025
Intento nuevo préstamo: 20/10/2025 ✅ APROBADO
Razón: Ha pasado más de 1 mes y no ha solicitado préstamos este mes
```

---

## 💡 Beneficios de Esta Validación

### Para la Institución Financiera:
- ✅ Reduce el riesgo de sobreendeudamiento
- ✅ Permite evaluar el historial de pagos del cliente
- ✅ Mejora la calidad de la cartera de créditos
- ✅ Cumple con prácticas bancarias responsables
- ✅ Evita otorgar múltiples préstamos sin evaluar comportamiento de pago

### Para el Cliente:
- ✅ Evita acumular deudas múltiples en corto plazo
- ✅ Fomenta la responsabilidad financiera
- ✅ Permite construir un buen historial crediticio paso a paso
- ✅ Demuestra capacidad de pago antes de nuevos créditos

---

## 🛠️ Funcionalidades Mantenidas

**TODAS las funcionalidades anteriores se mantienen intactas:**

✅ Consulta API RENIEC/SUNAT  
✅ Registro manual de clientes  
✅ Generación de cronogramas  
✅ Registro de pagos con mora automática  
✅ Abonos a capital  
✅ Cancelación total de préstamos  
✅ Historial de pagos  
✅ Impresión de comprobantes  
✅ Exportación a PDF  
✅ Búsqueda y filtros de préstamos  
✅ Cálculo de intereses y moras  
✅ Ajuste por días no laborables (domingos y feriados)  

---

## 🔧 Implementación Técnica

La validación se ejecuta en la función `registrarPrestamo()` antes de crear el préstamo:

```javascript
// 1. Busca todos los préstamos del cliente por documento
const prestamosDelCliente = prestamosRegistrados.filter(p => p.documento === documentoCliente);

// 2. Verifica préstamos activos
const tienePrestamoActivo = prestamosDelCliente.some(p => !p.cancelado);

// 3. Verifica período de espera en préstamos cancelados
const prestamosCancelados = prestamosDelCliente.filter(p => p.cancelado && p.fechaCancelacion);
// Calcula meses transcurridos desde la cancelación más reciente
```

---

## 📝 Notas Importantes

1. **La validación es automática** - No necesitas configurar nada
2. **Los datos se guardan en localStorage** - Persisten entre sesiones
3. **Los mensajes son claros** - Informan exactamente cuándo podrá solicitar un nuevo préstamo
4. **No afecta préstamos existentes** - Solo aplica a nuevos registros

---

## 🚀 Cómo Usar el Sistema

1. **Verifica al cliente** (API o Manual)
2. **Completa el formulario** de préstamo
3. **Haz clic en "Registrar Préstamo"**
4. El sistema automáticamente:
   - ✅ Valida si puede obtener el préstamo
   - ❌ Muestra mensaje si no cumple requisitos
   - ✅ Registra el préstamo si todo está correcto

---

## 📞 Soporte

Si tienes dudas sobre la validación o necesitas ajustar el período de espera (actualmente 6 meses), contacta al desarrollador.

---

**Versión:** 2.0  
**Fecha:** Octubre 2025  
**Desarrollado para:** Sistema de Préstamos RENIEC/SUNAT
