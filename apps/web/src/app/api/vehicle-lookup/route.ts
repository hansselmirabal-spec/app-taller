import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { getDmsConnection } from '@/lib/dms-connection';

// Valores que consideramos "vacíos" aunque existan en el DB
const EMPTY_VALUES = new Set(['0', '0000', '/', '0/0', '0/', '-', 'NULL', 'null', '']);

// Limpia teléfonos con formato basura como "0/0981307018" → "0981307018"
function cleanPhone(val: any): string {
  const s = String(val ?? '').trim();
  if (EMPTY_VALUES.has(s)) return '';
  // Remover prefijos tipo "0/" o "/"
  return s.replace(/^0?\//, '').trim();
}

function clean(val: any): string {
  const s = String(val ?? '').trim();
  return EMPTY_VALUES.has(s) ? '' : s;
}

// Limpia el campo direccion de encuesta que viene como "11ASUNCION-CENTRO - WASHINGTON 793..."
function cleanAddress(val: any): string {
  const s = String(val ?? '').trim();
  if (!s || s === 'NULL') return '';
  // El formato es "CODLOCALIDAD - DIRECCION", extraer parte después del primer " - "
  const idx = s.indexOf(' - ');
  return idx >= 0 ? s.slice(idx + 3).trim() : s;
}

export async function GET(req: NextRequest) {
  const plate   = req.nextUrl.searchParams.get('plate')?.trim().toUpperCase()   ?? '';
  const chassis = req.nextUrl.searchParams.get('chassis')?.trim().toUpperCase() ?? '';

  if (!plate && !chassis) {
    return NextResponse.json({ error: 'Debe ingresar chapa o chasis' }, { status: 400 });
  }

  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();

    const searchValue = plate || chassis;
    const field       = plate ? 'Matricula' : 'Chasis';

    // Query principal en agendamiento + subquery en encuesta para dirección
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        a.NombreCliente, a.NroCliente, a.cedula, a.ruc, a.Telefono,
        a.Vehiculo, a.Chasis, a.Matricula, a.Motor,
        a.Kilometraje, a.FechaMatricula, a.FechaUltimoServicio, a.KilometrajeActual,
        a.nombre_titular, a.cedula_titular, a.ruc_titular, a.telefono_titular,
        a.Localidad,
        (
          SELECT e.direccion FROM encuesta e
          WHERE e.chapa = a.Matricula
            AND e.direccion IS NOT NULL AND e.direccion != ''
          ORDER BY e.fechacarga DESC LIMIT 1
        ) AS direccion_encuesta,
        (
          SELECT e.tel_ofi FROM encuesta e
          WHERE e.chapa = a.Matricula
            AND e.tel_ofi IS NOT NULL AND e.tel_ofi != '' AND e.tel_ofi != '0'
          ORDER BY e.fechacarga DESC LIMIT 1
        ) AS tel_oficina_encuesta,
        (
          SELECT e.cel1 FROM encuesta e
          WHERE e.chapa = a.Matricula
            AND e.cel1 IS NOT NULL AND e.cel1 != '' AND e.cel1 != '0'
          ORDER BY e.fechacarga DESC LIMIT 1
        ) AS celular_encuesta
      FROM agendamiento a
      WHERE UPPER(TRIM(a.${field})) = ?
        AND a.${field} IS NOT NULL
        AND a.${field} != ''
      ORDER BY COALESCE(a.fechaAgendado, a.FechaCreacion, '1900-01-01') DESC
      LIMIT 1`,
      [searchValue],
    );

    // Retry: si se buscó por chapa y no hay resultado, intentar el mismo valor como chasis
    // (usuarios que tipean el nro de chasis en el campo chapa)
    if (rows.length === 0 && plate) {
      const [retryRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT
          a.NombreCliente, a.NroCliente, a.cedula, a.ruc, a.Telefono,
          a.Vehiculo, a.Chasis, a.Matricula, a.Motor,
          a.Kilometraje, a.FechaMatricula, a.FechaUltimoServicio, a.KilometrajeActual,
          a.nombre_titular, a.cedula_titular, a.ruc_titular, a.telefono_titular,
          a.Localidad,
          (SELECT e.direccion FROM encuesta e WHERE e.chapa = a.Matricula AND e.direccion IS NOT NULL AND e.direccion != '' ORDER BY e.fechacarga DESC LIMIT 1) AS direccion_encuesta,
          (SELECT e.tel_ofi FROM encuesta e WHERE e.chapa = a.Matricula AND e.tel_ofi IS NOT NULL AND e.tel_ofi != '' AND e.tel_ofi != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS tel_oficina_encuesta,
          (SELECT e.cel1 FROM encuesta e WHERE e.chapa = a.Matricula AND e.cel1 IS NOT NULL AND e.cel1 != '' AND e.cel1 != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS celular_encuesta
        FROM agendamiento a
        WHERE UPPER(TRIM(a.Chasis)) = ?
          AND a.Chasis IS NOT NULL AND a.Chasis != ''
        ORDER BY COALESCE(a.fechaAgendado, a.FechaCreacion, '1900-01-01') DESC
        LIMIT 1`,
        [plate],
      );
      if (retryRows.length > 0) {
        const r = retryRows[0];
        return NextResponse.json({
          found: true,
          vehicle: {
            plate:            String(r.Matricula ?? '').trim(),
            chassis:          String(r.Chasis   ?? '').trim(),
            vehicleType:      String(r.Vehiculo ?? '').trim(),
            engine:           String(r.Motor    ?? '').trim(),
            mileage:          r.Kilometraje        ?? '',
            currentMileage:   r.KilometrajeActual  ?? '',
            registrationDate: r.FechaMatricula     ?? '',
            lastService:      r.FechaUltimoServicio ?? '',
          },
          customer: {
            customerName:   clean(r.NombreCliente) || clean(r.nombre_titular),
            customerNumber: String(r.NroCliente ?? '').trim(),
            cedula:         clean(r.cedula)  || clean(r.cedula_titular),
            ruc:            clean(r.ruc)     || clean(r.ruc_titular),
            telPrincipal:   cleanPhone(r.Telefono) || cleanPhone(r.telefono_titular),
            telOficina:     cleanPhone(r.tel_oficina_encuesta),
            celular:        cleanPhone(r.celular_encuesta),
            address:        cleanAddress(r.direccion_encuesta) || clean(r.Localidad),
          },
        });
      }
    }

    // Fallback 1: buscar en agendamiento_lavadero si no se encontró en agendamiento
    if (rows.length === 0 && plate) {
      const [lavRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT chapa, chasis, nombrecliente, nrocliente, modelo
         FROM agendamiento_lavadero
         WHERE UPPER(TRIM(chapa)) = ?
         ORDER BY insert_date DESC LIMIT 1`,
        [plate],
      );

      if (lavRows.length === 0) {
        // sigue al siguiente fallback (v_maestro_ot_condor) en lugar de devolver 404 directo
      } else {

      const lav = lavRows[0];
      const nroCliente = String(lav.nrocliente ?? '').trim();

      // Intentar enriquecer con datos completos del cliente via NroCliente
      let enriched: mysql.RowDataPacket | null = null;
      if (nroCliente) {
        const [enrichRows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT
            a.NombreCliente, a.NroCliente, a.cedula, a.ruc, a.Telefono,
            a.nombre_titular, a.cedula_titular, a.ruc_titular, a.telefono_titular,
            a.Localidad,
            (SELECT e.direccion FROM encuesta e WHERE e.chapa = a.Matricula AND e.direccion IS NOT NULL AND e.direccion != '' ORDER BY e.fechacarga DESC LIMIT 1) AS direccion_encuesta,
            (SELECT e.tel_ofi FROM encuesta e WHERE e.chapa = a.Matricula AND e.tel_ofi IS NOT NULL AND e.tel_ofi != '' AND e.tel_ofi != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS tel_oficina_encuesta,
            (SELECT e.cel1 FROM encuesta e WHERE e.chapa = a.Matricula AND e.cel1 IS NOT NULL AND e.cel1 != '' AND e.cel1 != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS celular_encuesta
          FROM agendamiento a
          WHERE TRIM(a.NroCliente) = ?
          ORDER BY COALESCE(a.fechaAgendado, a.FechaCreacion, '1900-01-01') DESC
          LIMIT 1`,
          [nroCliente],
        );
        if (enrichRows.length > 0) enriched = enrichRows[0];
      }

      const customerName = clean(lav.nombrecliente) || (enriched ? clean(enriched.NombreCliente) || clean(enriched.nombre_titular) : '');
      const cedula       = enriched ? clean(enriched.cedula) || clean(enriched.cedula_titular) : '';
      const ruc          = enriched ? clean(enriched.ruc)    || clean(enriched.ruc_titular)    : '';
      const telPrincipal = enriched ? cleanPhone(enriched.Telefono) || cleanPhone(enriched.telefono_titular) : '';
      const address      = enriched ? cleanAddress(enriched.direccion_encuesta) || clean(enriched.Localidad) : '';
      const telOficina   = enriched ? cleanPhone(enriched.tel_oficina_encuesta) : '';
      const celular      = enriched ? cleanPhone(enriched.celular_encuesta) : '';

      return NextResponse.json({
        found: true,
        vehicle: {
          plate:            String(lav.chapa   ?? '').trim(),
          chassis:          String(lav.chasis  ?? '').trim(),
          vehicleType:      String(lav.modelo  ?? '').trim(),
          engine:           '',
          mileage:          '',
          currentMileage:   '',
          registrationDate: '',
          lastService:      '',
        },
        customer: {
          customerName,
          customerNumber: nroCliente,
          cedula,
          ruc,
          telPrincipal,
          telOficina,
          celular,
          address,
        },
      });
      }
    }

    // Fallback 1b: agendamiento_lavadero por chasis (o valor de plate que resulte ser un chasis)
    const chasisCandidate = chassis || plate;
    if (rows.length === 0 && chasisCandidate) {
      const [lavChasisRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT chapa, chasis, nombrecliente, nrocliente, modelo
         FROM agendamiento_lavadero
         WHERE UPPER(TRIM(chasis)) = ?
         ORDER BY insert_date DESC LIMIT 1`,
        [chasisCandidate],
      );

      if (lavChasisRows.length > 0) {
        const lav = lavChasisRows[0];
        const nroCliente = String(lav.nrocliente ?? '').trim();

        let enriched: mysql.RowDataPacket | null = null;
        if (nroCliente) {
          const [enrichRows] = await connection.execute<mysql.RowDataPacket[]>(
            `SELECT
              a.NombreCliente, a.NroCliente, a.cedula, a.ruc, a.Telefono,
              a.nombre_titular, a.cedula_titular, a.ruc_titular, a.telefono_titular,
              a.Localidad,
              (SELECT e.direccion FROM encuesta e WHERE e.chapa = a.Matricula AND e.direccion IS NOT NULL AND e.direccion != '' ORDER BY e.fechacarga DESC LIMIT 1) AS direccion_encuesta,
              (SELECT e.tel_ofi FROM encuesta e WHERE e.chapa = a.Matricula AND e.tel_ofi IS NOT NULL AND e.tel_ofi != '' AND e.tel_ofi != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS tel_oficina_encuesta,
              (SELECT e.cel1 FROM encuesta e WHERE e.chapa = a.Matricula AND e.cel1 IS NOT NULL AND e.cel1 != '' AND e.cel1 != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS celular_encuesta
            FROM agendamiento a
            WHERE TRIM(a.NroCliente) = ?
            ORDER BY COALESCE(a.fechaAgendado, a.FechaCreacion, '1900-01-01') DESC
            LIMIT 1`,
            [nroCliente],
          );
          if (enrichRows.length > 0) enriched = enrichRows[0];
        }

        const customerName = clean(lav.nombrecliente) || (enriched ? clean(enriched.NombreCliente) || clean(enriched.nombre_titular) : '');
        const cedula       = enriched ? clean(enriched.cedula) || clean(enriched.cedula_titular) : '';
        const ruc          = enriched ? clean(enriched.ruc)    || clean(enriched.ruc_titular)    : '';
        const telPrincipal = enriched ? cleanPhone(enriched.Telefono) || cleanPhone(enriched.telefono_titular) : '';
        const address      = enriched ? cleanAddress(enriched.direccion_encuesta) || clean(enriched.Localidad) : '';
        const telOficina   = enriched ? cleanPhone(enriched.tel_oficina_encuesta) : '';
        const celular      = enriched ? cleanPhone(enriched.celular_encuesta) : '';

        return NextResponse.json({
          found: true,
          vehicle: {
            plate:            String(lav.chapa   ?? '').trim(),
            chassis:          String(lav.chasis  ?? '').trim(),
            vehicleType:      String(lav.modelo  ?? '').trim(),
            engine:           '',
            mileage:          '',
            currentMileage:   '',
            registrationDate: '',
            lastService:      '',
          },
          customer: {
            customerName,
            customerNumber: nroCliente,
            cedula,
            ruc,
            telPrincipal,
            telOficina,
            celular,
            address,
          },
        });
      }
    }

    // Fallback 2: v_maestro_ot_condor — vehículos que tienen historial de OTs
    // pero nunca se agendaron por la app (entraron directo por mostrador del DMS).
    // Corre también cuando se buscó por plate y el valor era en realidad un chasis/VIN.
    if (rows.length === 0 && chasisCandidate) {
      const [vmRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT
          OT,
          TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS nombre_cliente,
          TRIM(CONVERT(MODELO USING utf8mb4)) AS modelo,
          TRIM(CONVERT(CHASIS USING utf8mb4)) AS chasis,
          TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
          CODCLIENTE,
          fechaingreso,
          FechaFinalizado
        FROM v_maestro_ot_condor
        WHERE TRIM(CONVERT(CHASIS USING utf8mb4)) = ?
        ORDER BY fechaingreso DESC
        LIMIT 1`,
        [chasisCandidate],
      );

      if (vmRows.length > 0) {
        const vm = vmRows[0];
        const codCliente  = String(vm.CODCLIENTE ?? '').trim();
        const vmMatricula = String(vm.matricula  ?? '').trim();

        // Enriquecer con datos del cliente desde agendamiento (cruce por NroCliente)
        let enriched: mysql.RowDataPacket | null = null;
        if (codCliente) {
          const [enrichRows] = await connection.execute<mysql.RowDataPacket[]>(
            `SELECT
              a.NombreCliente, a.NroCliente, a.cedula, a.ruc, a.Telefono,
              a.Vehiculo, a.Matricula, a.Motor, a.Kilometraje,
              a.FechaMatricula, a.FechaUltimoServicio, a.KilometrajeActual,
              a.nombre_titular, a.cedula_titular, a.ruc_titular, a.telefono_titular,
              a.Localidad,
              (SELECT e.direccion FROM encuesta e WHERE e.chapa = a.Matricula AND e.direccion IS NOT NULL AND e.direccion != '' ORDER BY e.fechacarga DESC LIMIT 1) AS direccion_encuesta,
              (SELECT e.tel_ofi  FROM encuesta e WHERE e.chapa = a.Matricula AND e.tel_ofi  IS NOT NULL AND e.tel_ofi  != '' AND e.tel_ofi  != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS tel_oficina_encuesta,
              (SELECT e.cel1     FROM encuesta e WHERE e.chapa = a.Matricula AND e.cel1     IS NOT NULL AND e.cel1     != '' AND e.cel1     != '0' ORDER BY e.fechacarga DESC LIMIT 1) AS celular_encuesta
            FROM agendamiento a
            WHERE TRIM(a.NroCliente) = ?
            ORDER BY COALESCE(a.fechaAgendado, a.FechaCreacion, '1900-01-01') DESC
            LIMIT 1`,
            [codCliente],
          );
          if (enrichRows.length > 0) enriched = enrichRows[0];
        }

        // Fallback de contacto: si agendamiento no devolvió nada pero tenemos chapa, buscar en encuesta
        let encuestaRow: mysql.RowDataPacket | null = null;
        const chapaParaEncuesta = enriched ? String(enriched.Matricula ?? '').trim() : vmMatricula;
        if (!enriched && chapaParaEncuesta) {
          const [encRows] = await connection.execute<mysql.RowDataPacket[]>(
            `SELECT direccion, tel_ofi, cel1, telefono
             FROM encuesta
             WHERE UPPER(TRIM(chapa)) = ?
               AND (direccion IS NOT NULL OR tel_ofi IS NOT NULL OR cel1 IS NOT NULL)
             ORDER BY fechacarga DESC LIMIT 1`,
            [chapaParaEncuesta.toUpperCase()],
          );
          if (encRows.length > 0) encuestaRow = encRows[0];
        }

        const finalPlate = enriched
          ? String(enriched.Matricula ?? '').trim() || vmMatricula
          : vmMatricula;

        const customerName = clean(vm.nombre_cliente)
          || (enriched ? clean(enriched.NombreCliente) || clean(enriched.nombre_titular) : '');
        const cedula       = enriched ? clean(enriched.cedula) || clean(enriched.cedula_titular) : '';
        const ruc          = enriched ? clean(enriched.ruc)    || clean(enriched.ruc_titular)    : '';
        const telPrincipal = enriched
          ? cleanPhone(enriched.Telefono) || cleanPhone(enriched.telefono_titular)
          : (encuestaRow ? cleanPhone(encuestaRow.telefono) : '');
        const address      = enriched
          ? cleanAddress(enriched.direccion_encuesta) || clean(enriched.Localidad)
          : (encuestaRow ? cleanAddress(encuestaRow.direccion) : '');
        const telOficina   = enriched
          ? cleanPhone(enriched.tel_oficina_encuesta)
          : (encuestaRow ? cleanPhone(encuestaRow.tel_ofi) : '');
        const celular      = enriched
          ? cleanPhone(enriched.celular_encuesta)
          : (encuestaRow ? cleanPhone(encuestaRow.cel1) : '');

        return NextResponse.json({
          found: true,
          source: 'v_maestro_ot_condor',
          vehicle: {
            plate:            finalPlate,
            chassis:          String(vm.chasis ?? '').trim(),
            vehicleType:      enriched
              ? String(enriched.Vehiculo ?? '').trim() || String(vm.modelo ?? '').trim()
              : String(vm.modelo ?? '').trim(),
            engine:           enriched ? String(enriched.Motor ?? '').trim() : '',
            mileage:          enriched ? enriched.Kilometraje        ?? '' : '',
            currentMileage:   enriched ? enriched.KilometrajeActual  ?? '' : '',
            registrationDate: enriched ? enriched.FechaMatricula     ?? '' : '',
            lastService:      enriched ? enriched.FechaUltimoServicio ?? '' : '',
          },
          customer: {
            customerName,
            customerNumber: codCliente,
            cedula,
            ruc,
            telPrincipal,
            telOficina,
            celular,
            address,
          },
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    const r = rows[0];

    const customerName = clean(r.NombreCliente) || clean(r.nombre_titular);
    const cedula       = clean(r.cedula)        || clean(r.cedula_titular);
    const ruc          = clean(r.ruc)           || clean(r.ruc_titular);
    const telPrincipal = cleanPhone(r.Telefono) || cleanPhone(r.telefono_titular);
    const address      = cleanAddress(r.direccion_encuesta) || clean(r.Localidad);
    const telOficina   = cleanPhone(r.tel_oficina_encuesta);
    const celular      = cleanPhone(r.celular_encuesta);

    return NextResponse.json({
      found: true,
      vehicle: {
        plate:            String(r.Matricula ?? '').trim(),
        chassis:          String(r.Chasis   ?? '').trim(),
        vehicleType:      String(r.Vehiculo ?? '').trim(),
        engine:           String(r.Motor    ?? '').trim(),
        mileage:          r.Kilometraje        ?? '',
        currentMileage:   r.KilometrajeActual  ?? '',
        registrationDate: r.FechaMatricula     ?? '',
        lastService:      r.FechaUltimoServicio ?? '',
      },
      customer: {
        customerName,
        customerNumber: String(r.NroCliente ?? '').trim(),
        cedula,
        ruc,
        telPrincipal,
        telOficina,
        celular,
        address,
      },
    });
  } catch (err: any) {
    console.error('[vehicle-lookup]', err.message);
    return NextResponse.json({ error: 'Error al conectar con DMS' }, { status: 500 });
  } finally {
    await connection?.end();
  }
}
