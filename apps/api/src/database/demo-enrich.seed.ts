import 'reflect-metadata';
import { DataSource } from 'typeorm';

const DS = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [],
  synchronize: false,
});

// ─── IDs fijos (ya existentes en DB) ──────────────────────────────────────────

const MECHANIC_WS = 'Taller Automotriz San Lorenzo';

// Técnicos activos del taller mecánico
const M = {
  omar:     '90617241-d99c-42d7-8811-9718cb2334e4', // Aire/Diagnóstico
  gustavo:  'e7bc01c1-f7d9-4657-a9fd-a17107bc8308', // Electricidad
  patricia: 'ede089da-2f93-4f1f-a740-86cf3f22d83e', // Electricidad
  luz:      '45cafa85-ad0c-449b-bb91-7f7e9bb97a61', // Express
  javier:   '7b1acf5e-9a4c-4a81-a924-69f55088eec3', // Frenos/Suspensión
  silvia:   'ac791acb-4f93-4694-959f-b0c5e0ff5d7d', // Frenos/Suspensión
  natalia:  '9171bcd8-57b1-4286-ae12-b3695ea7f568', // Motor
  rodrigo:  '1d27e768-037c-4994-9a26-6576dc197db4', // Motor
};

// Servicios del taller mecánico (con duración)
const S = {
  aceite:      { id: '8cc1e5c5-0300-4038-8a61-e9d8f0981eb1', h: 0.5  }, // Cambio aceite express
  correa:      { id: '55571e71-8f44-4ce4-940b-0768e36bdf1e', h: 3.0  }, // Cambio de correa
  diagnostico: { id: '879db979-e12f-4aea-8a40-9c93f40fa07e', h: 1.0  }, // Diagnóstico eléctrico
  mant:        { id: '3a2a6f43-34ca-4090-95cd-734694c4f06d', h: 1.0  }, // Mantenimiento 5.000km
  motor:       { id: '136ad48a-0113-4f07-bee9-d86f387cc22d', h: 4.0  }, // Reparación de motor
  frenos:      { id: '50239ddd-9797-4853-8df5-d112bb0ad5a3', h: 1.5  }, // Revisión de frenos
  suspension:  { id: '80a82397-c50c-4edb-8c91-f2521e9204c6', h: 2.0  }, // Revisión de suspensión
};

// Bodyshop workshop ID
const BODYSHOP_WS_ID = '648316df-227c-487d-96d5-e3925bbd1872';

// Técnicos activos del taller de chapa y pintura
const B = {
  chap: {
    francisco: 'a7bba0bd-6208-43f7-b1b0-cdf841685563',
    mario:     '33e62365-6daa-47bd-af6a-937d364f825c',
    ruben:     '2b0782fe-f41f-4413-b086-ef7fb480ca80',
  },
  prep: {
    ana:    '0cc1c50c-a900-49fa-819a-cc32cff6b19e',
    diego:  '90860bbc-cada-432c-a57a-8644a4198fcb',
    estela: 'c166c4e0-32b2-460d-8b11-bbeae039a8cf',
  },
  paint: {
    ismael:   '58545cb3-5716-4c7b-8f26-daa7684ef445',
    liliana:  '082d6be6-af2c-4e96-851f-79af38829361',
    marcelo:  'b77b04a3-4096-4808-805f-2a76dd528247',
  },
};

// Work types del bodyshop
const WT = {
  retoque:   { id: '6e410456-1374-477a-beb6-69fcd6e771db', bw: 4,  pr: 2,  pa: 3  },
  frontal:   { id: '317ba1d2-fc2c-4630-b0a8-6cb12ba190f0', bw: 8,  pr: 4,  pa: 6  },
  lateral:   { id: '6ed810ab-9736-4210-be12-98040b38a235', bw: 16, pr: 8,  pa: 12 },
  trasero:   { id: '65ed3514-ed1f-4896-ba01-b6888c246fcc', bw: 28, pr: 14, pa: 20 },
  siniestro: { id: 'e2423f5d-3023-43b3-b74a-02dbc9ed0fa8', bw: 40, pr: 20, pa: 30 },
  pintura:   { id: '004dd428-e06e-4fc2-8c87-267c52e4f5a3', bw: 4,  pr: 6,  pa: 16 },
  abollas:   { id: '23acf90a-0d40-463e-a63c-220d43eb5ab9', bw: 6,  pr: 3,  pa: 4  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function date(offsetDays: number): string {
  const d = new Date('2026-04-27');
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function addTime(start: string, hours: number): string {
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m + Math.round(hours * 60);
  return `${Math.floor(tot / 60).toString().padStart(2, '0')}:${(tot % 60).toString().padStart(2, '0')}`;
}

// ─── Citas mecánico: próximas 3 semanas ────────────────────────────────────────
// Cada día laboral: 6-10 turnos distribuidos entre 8 técnicos
// Algunos días "cargados" para testear RISK en capacidad

interface ApptRow {
  d: number; start: string; tech: string;
  svc: { id: string; h: number }; name: string; plate: string;
  status: 'scheduled' | 'in_progress' | 'done';
}

const APPTS: ApptRow[] = [
  // ── Lun 27/04 (HOY) — ya tiene 4 scheduled del seed previo, agregamos más ─
  { d:0, start:'10:00', tech:M.gustavo,  svc:S.diagnostico, name:'Mónica Dure',       plate:'ADA 101', status:'in_progress' },
  { d:0, start:'11:00', tech:M.patricia, svc:S.frenos,      name:'Bruno Ortiz',       plate:'ADB 102', status:'in_progress' },
  { d:0, start:'08:00', tech:M.silvia,   svc:S.suspension,  name:'Lucia Amarilla',    plate:'ADC 103', status:'in_progress' },
  { d:0, start:'10:30', tech:M.silvia,   svc:S.mant,        name:'Ricardo Flores',    plate:'ADD 104', status:'scheduled'   },
  { d:0, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Graciela Cano',     plate:'ADE 105', status:'in_progress' },
  { d:0, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Isidoro Benitez',   plate:'ADF 106', status:'in_progress' },
  { d:0, start:'11:30', tech:M.rodrigo,  svc:S.mant,        name:'Teresa Villalba',   plate:'ADG 107', status:'scheduled'   },

  // ── Mar 28/04 ──────────────────────────────────────────────────────────────
  { d:1, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Alberto Rivas',     plate:'ADH 108', status:'scheduled'   },
  { d:1, start:'09:00', tech:M.omar,     svc:S.mant,        name:'Cristina Medina',   plate:'ADI 109', status:'scheduled'   },
  { d:1, start:'10:00', tech:M.omar,     svc:S.aceite,      name:'Pablo Sosa',        plate:'ADJ 110', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'Anabella Torres',   plate:'ADK 111', status:'scheduled'   },
  { d:1, start:'09:00', tech:M.gustavo,  svc:S.frenos,      name:'Marcos Gaona',      plate:'ADL 112', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.patricia, svc:S.frenos,      name:'Nora Gimenez',      plate:'ADM 113', status:'scheduled'   },
  { d:1, start:'10:00', tech:M.patricia, svc:S.suspension,  name:'Tomás Ruiz',        plate:'ADN 114', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Valentina Cruz',    plate:'ADO 115', status:'scheduled'   },
  { d:1, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Jorge Cardozo',     plate:'ADP 116', status:'scheduled'   },
  { d:1, start:'09:00', tech:M.luz,      svc:S.aceite,      name:'Dora Álvarez',      plate:'ADQ 117', status:'scheduled'   },
  { d:1, start:'09:30', tech:M.luz,      svc:S.mant,        name:'Raul Acuña',        plate:'ADR 118', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.javier,   svc:S.frenos,      name:'Claudia Estigarribia', plate:'ADS 119', status:'scheduled' },
  { d:1, start:'10:00', tech:M.javier,   svc:S.suspension,  name:'Sebastián Valdez',  plate:'ADT 120', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.natalia,  svc:S.correa,      name:'Elena Pereira',     plate:'ADU 121', status:'scheduled'   },
  { d:1, start:'11:00', tech:M.natalia,  svc:S.mant,        name:'Gustavo Malgarejo', plate:'ADV 122', status:'scheduled'   },
  { d:1, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Fabiola Núñez',     plate:'ADW 123', status:'scheduled'   },

  // ── Mié 29/04 ──────────────────────────────────────────────────────────────
  { d:2, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Eugenio Paredes',   plate:'ADX 124', status:'scheduled'   },
  { d:2, start:'09:00', tech:M.gustavo,  svc:S.diagnostico, name:'Amanda Britez',     plate:'ADY 125', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.patricia, svc:S.suspension,  name:'Horacio López',     plate:'ADZ 126', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Silvia Morales',    plate:'AEA 127', status:'scheduled'   },
  { d:2, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Diego Rojas',       plate:'AEB 128', status:'scheduled'   },
  { d:2, start:'09:00', tech:M.luz,      svc:S.mant,        name:'Marina Ibáñez',     plate:'AEC 129', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.javier,   svc:S.frenos,      name:'Francisco Bernal',  plate:'AED 130', status:'scheduled'   },
  { d:2, start:'09:30', tech:M.javier,   svc:S.mant,        name:'Patricia Cáceres',  plate:'AEE 131', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.silvia,   svc:S.frenos,      name:'Roberto Acosta',    plate:'AEF 132', status:'scheduled'   },
  { d:2, start:'10:00', tech:M.silvia,   svc:S.suspension,  name:'Irene Cardozo',     plate:'AEG 133', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Aurelio Ríos',      plate:'AEH 134', status:'scheduled'   },
  { d:2, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Beatriz Samudio',   plate:'AEI 135', status:'scheduled'   },
  { d:2, start:'11:00', tech:M.rodrigo,  svc:S.mant,        name:'Elías Torres',      plate:'AEJ 136', status:'scheduled'   },

  // ── Jue 30/04 ──────────────────────────────────────────────────────────────
  { d:3, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Hilda Espínola',    plate:'AEK 137', status:'scheduled'   },
  { d:3, start:'09:00', tech:M.gustavo,  svc:S.frenos,      name:'Ignacio Britez',    plate:'AEL 138', status:'scheduled'   },
  { d:3, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Julia Rodas',       plate:'AEM 139', status:'scheduled'   },
  { d:3, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Karina Vallejos',   plate:'AEN 140', status:'scheduled'   },
  { d:3, start:'09:00', tech:M.luz,      svc:S.mant,        name:'Leandro Gimenez',   plate:'AEO 141', status:'scheduled'   },
  { d:3, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Miriam Fleitas',    plate:'AEP 142', status:'scheduled'   },
  { d:3, start:'10:00', tech:M.javier,   svc:S.frenos,      name:'Néstor Almada',     plate:'AEQ 143', status:'scheduled'   },
  { d:3, start:'08:00', tech:M.silvia,   svc:S.suspension,  name:'Olga Meza',         plate:'AER 144', status:'scheduled'   },
  { d:3, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Primitivo Cabrera', plate:'AES 145', status:'scheduled'   },
  { d:3, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Quinto Villalba',   plate:'AET 146', status:'scheduled'   },

  // ── Vie 01/05 ─────────────────────────────────────────────────────────────
  { d:4, start:'08:00', tech:M.omar,     svc:S.mant,        name:'Rosa Colman',       plate:'AEU 147', status:'scheduled'   },
  { d:4, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'Sergio Duarte',     plate:'AEV 148', status:'scheduled'   },
  { d:4, start:'08:00', tech:M.patricia, svc:S.frenos,      name:'Teresa Gómez',      plate:'AEW 149', status:'scheduled'   },
  { d:4, start:'09:30', tech:M.patricia, svc:S.mant,        name:'Ursino López',      plate:'AEX 150', status:'scheduled'   },
  { d:4, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Victoria Morel',    plate:'AEY 151', status:'scheduled'   },
  { d:4, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'William Ortiz',     plate:'AEZ 152', status:'scheduled'   },
  { d:4, start:'09:00', tech:M.luz,      svc:S.aceite,      name:'Ximena Paredes',    plate:'AFA 153', status:'scheduled'   },
  { d:4, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Yanina Romero',     plate:'AFB 154', status:'scheduled'   },
  { d:4, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Zoila Sosa',        plate:'AFC 155', status:'scheduled'   },

  // ─── Semana 2 (May 4-8) — carga alta para testear tablero ─────────────────
  // ── Lun 04/05 ─────────────────────────────────────────────────────────────
  { d:7, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Alfonso Benítez',   plate:'AFD 156', status:'scheduled'   },
  { d:7, start:'09:00', tech:M.omar,     svc:S.mant,        name:'Blanca Cardozo',    plate:'AFE 157', status:'scheduled'   },
  { d:7, start:'10:00', tech:M.omar,     svc:S.diagnostico, name:'Carlos Duarte',     plate:'AFF 158', status:'scheduled'   },
  { d:7, start:'11:00', tech:M.omar,     svc:S.aceite,      name:'Delia Escobar',     plate:'AFG 159', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'Enrique Fleitas',   plate:'AFH 160', status:'scheduled'   },
  { d:7, start:'09:00', tech:M.gustavo,  svc:S.frenos,      name:'Fernanda Gaona',    plate:'AFI 161', status:'scheduled'   },
  { d:7, start:'10:30', tech:M.gustavo,  svc:S.mant,        name:'Gonzalo Herrera',   plate:'AFJ 162', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.patricia, svc:S.frenos,      name:'Hilda Ibáñez',      plate:'AFK 163', status:'scheduled'   },
  { d:7, start:'09:30', tech:M.patricia, svc:S.suspension,  name:'Ivan Jimenez',      plate:'AFL 164', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Julia Krause',      plate:'AFM 165', status:'scheduled'   },
  { d:7, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Kevin Leiva',       plate:'AFN 166', status:'scheduled'   },
  { d:7, start:'09:00', tech:M.luz,      svc:S.aceite,      name:'Laura Meza',        plate:'AFO 167', status:'scheduled'   },
  { d:7, start:'09:30', tech:M.luz,      svc:S.mant,        name:'Mario Núñez',       plate:'AFP 168', status:'scheduled'   },
  { d:7, start:'10:30', tech:M.luz,      svc:S.aceite,      name:'Nadia Ortega',      plate:'AFQ 169', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Oscar Paredes',     plate:'AFR 170', status:'scheduled'   },
  { d:7, start:'10:00', tech:M.javier,   svc:S.frenos,      name:'Paloma Quiroga',    plate:'AFS 171', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.silvia,   svc:S.frenos,      name:'Ramón Rivas',       plate:'AFT 172', status:'scheduled'   },
  { d:7, start:'09:30', tech:M.silvia,   svc:S.suspension,  name:'Sandra Salinas',    plate:'AFU 173', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Tobías Torres',     plate:'AFV 174', status:'scheduled'   },
  { d:7, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Úrsula Urbieta',    plate:'AFW 175', status:'scheduled'   },
  { d:7, start:'12:00', tech:M.rodrigo,  svc:S.correa,      name:'Vicente Vallejos',  plate:'AFX 176', status:'scheduled'   },

  // ── Mar 05/05 ─────────────────────────────────────────────────────────────
  { d:8, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Wilfredo Zárate',   plate:'AFY 177', status:'scheduled'   },
  { d:8, start:'09:00', tech:M.gustavo,  svc:S.frenos,      name:'Ximena Acuña',      plate:'AFZ 178', status:'scheduled'   },
  { d:8, start:'10:30', tech:M.gustavo,  svc:S.suspension,  name:'Yolanda Bejarano',  plate:'AGA 179', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.patricia, svc:S.frenos,      name:'Zaida Cardoso',     plate:'AGB 180', status:'scheduled'   },
  { d:8, start:'10:00', tech:M.patricia, svc:S.mant,        name:'Alfredo Delgado',   plate:'AGC 181', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Beatriz Espino',    plate:'AGD 182', status:'scheduled'   },
  { d:8, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'César Faría',       plate:'AGE 183', status:'scheduled'   },
  { d:8, start:'09:00', tech:M.luz,      svc:S.mant,        name:'Daniela García',    plate:'AGF 184', status:'scheduled'   },
  { d:8, start:'10:00', tech:M.luz,      svc:S.aceite,      name:'Eduardo Herrera',   plate:'AGG 185', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Fiorela Ibarra',    plate:'AGH 186', status:'scheduled'   },
  { d:8, start:'10:00', tech:M.javier,   svc:S.frenos,      name:'Gerardo Juárez',    plate:'AGI 187', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.silvia,   svc:S.suspension,  name:'Helena Keim',       plate:'AGJ 188', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Iván Leiva',        plate:'AGK 189', status:'scheduled'   },
  { d:8, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Jimena Montoya',    plate:'AGL 190', status:'scheduled'   },

  // ── Mié 06/05 ─────────────────────────────────────────────────────────────
  { d:9, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Karen Núñez',       plate:'AGM 191', status:'scheduled'   },
  { d:9, start:'09:00', tech:M.gustavo,  svc:S.diagnostico, name:'Leonardo Ortiz',    plate:'AGN 192', status:'scheduled'   },
  { d:9, start:'10:00', tech:M.patricia, svc:S.frenos,      name:'María Paredes',     plate:'AGO 193', status:'scheduled'   },
  { d:9, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Nicolás Quiroga',   plate:'AGP 194', status:'scheduled'   },
  { d:9, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Olinda Ramos',      plate:'AGQ 195', status:'scheduled'   },
  { d:9, start:'09:00', tech:M.luz,      svc:S.mant,        name:'Pedro Soria',       plate:'AGR 196', status:'scheduled'   },
  { d:9, start:'08:00', tech:M.javier,   svc:S.frenos,      name:'Quilda Torres',     plate:'AGS 197', status:'scheduled'   },
  { d:9, start:'09:30', tech:M.javier,   svc:S.suspension,  name:'Rodrigo Ugarte',    plate:'AGT 198', status:'scheduled'   },
  { d:9, start:'08:00', tech:M.silvia,   svc:S.frenos,      name:'Sofía Villalba',    plate:'AGU 199', status:'scheduled'   },
  { d:9, start:'10:00', tech:M.silvia,   svc:S.suspension,  name:'Tomas Warnes',      plate:'AGV 200', status:'scheduled'   },
  { d:9, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Úrsula Xara',       plate:'AGW 201', status:'scheduled'   },
  { d:9, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Valentín Yebra',    plate:'AGX 202', status:'scheduled'   },

  // ── Jue 07/05 ─────────────────────────────────────────────────────────────
  { d:10, start:'08:00', tech:M.omar,     svc:S.mant,       name:'Walter Zárate',     plate:'AGY 203', status:'scheduled'   },
  { d:10, start:'09:00', tech:M.gustavo,  svc:S.frenos,     name:'Ximena Acosta',     plate:'AGZ 204', status:'scheduled'   },
  { d:10, start:'10:30', tech:M.gustavo,  svc:S.mant,       name:'Yolanda Britos',    plate:'AHA 205', status:'scheduled'   },
  { d:10, start:'08:00', tech:M.luz,      svc:S.aceite,     name:'Zacarías Colman',   plate:'AHB 206', status:'scheduled'   },
  { d:10, start:'08:30', tech:M.luz,      svc:S.aceite,     name:'Ana Díaz',          plate:'AHC 207', status:'scheduled'   },
  { d:10, start:'09:00', tech:M.luz,      svc:S.mant,       name:'Benito Espínola',   plate:'AHD 208', status:'scheduled'   },
  { d:10, start:'10:00', tech:M.luz,      svc:S.aceite,     name:'Carmen Ferreira',   plate:'AHE 209', status:'scheduled'   },
  { d:10, start:'08:00', tech:M.javier,   svc:S.suspension, name:'Damián Garay',      plate:'AHF 210', status:'scheduled'   },
  { d:10, start:'10:00', tech:M.javier,   svc:S.frenos,     name:'Elvira Herrera',    plate:'AHG 211', status:'scheduled'   },
  { d:10, start:'08:00', tech:M.silvia,   svc:S.suspension, name:'Fernando Ibarra',   plate:'AHH 212', status:'scheduled'   },
  { d:10, start:'10:00', tech:M.silvia,   svc:S.frenos,     name:'Gregoria Jiménez',  plate:'AHI 213', status:'scheduled'   },
  { d:10, start:'08:00', tech:M.natalia,  svc:S.motor,      name:'Heber Krause',      plate:'AHJ 214', status:'scheduled'   },
  { d:10, start:'08:00', tech:M.rodrigo,  svc:S.correa,     name:'Ilda Leiva',        plate:'AHK 215', status:'scheduled'   },

  // ── Vie 08/05 ─────────────────────────────────────────────────────────────
  { d:11, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Julio Meza',       plate:'AHL 216', status:'scheduled'   },
  { d:11, start:'09:00', tech:M.omar,     svc:S.aceite,      name:'Karina Núñez',     plate:'AHM 217', status:'scheduled'   },
  { d:11, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'Lisandro Ortega',  plate:'AHN 218', status:'scheduled'   },
  { d:11, start:'09:00', tech:M.patricia, svc:S.frenos,      name:'Magdalena Peña',   plate:'AHO 219', status:'scheduled'   },
  { d:11, start:'10:30', tech:M.patricia, svc:S.mant,        name:'Nadir Quiroga',    plate:'AHP 220', status:'scheduled'   },
  { d:11, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Orlanda Roa',      plate:'AHQ 221', status:'scheduled'   },
  { d:11, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Pedro Sánchez',    plate:'AHR 222', status:'scheduled'   },
  { d:11, start:'09:00', tech:M.luz,      svc:S.mant,        name:'Quirina Torres',   plate:'AHS 223', status:'scheduled'   },
  { d:11, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Raúl Urbieta',     plate:'AHT 224', status:'scheduled'   },
  { d:11, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Sara Villalba',    plate:'AHU 225', status:'scheduled'   },
  { d:11, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Timoteo Warnes',   plate:'AHV 226', status:'scheduled'   },

  // ─── Semana 3 (May 11-15) — carga media ───────────────────────────────────
  { d:14, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Umberto Zárate',   plate:'AHW 227', status:'scheduled'   },
  { d:14, start:'09:00', tech:M.gustavo,  svc:S.frenos,      name:'Viviana Acevedo',  plate:'AHX 228', status:'scheduled'   },
  { d:14, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Walter Barreto',   plate:'AHY 229', status:'scheduled'   },
  { d:14, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Ximena Cáceres',   plate:'AHZ 230', status:'scheduled'   },
  { d:14, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Yolanda Díaz',     plate:'AIA 231', status:'scheduled'   },
  { d:14, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Zoilo Espínola',   plate:'AIB 232', status:'scheduled'   },
  { d:14, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Álvaro Ferreira',  plate:'AIC 233', status:'scheduled'   },

  { d:15, start:'08:00', tech:M.omar,     svc:S.mant,        name:'Beatriz Gaona',    plate:'AID 234', status:'scheduled'   },
  { d:15, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'César Herrera',    plate:'AIE 235', status:'scheduled'   },
  { d:15, start:'09:00', tech:M.patricia, svc:S.frenos,      name:'Dolores Ibáñez',   plate:'AIF 236', status:'scheduled'   },
  { d:15, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Eduardo Jiménez',  plate:'AIG 237', status:'scheduled'   },
  { d:15, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Felipa Krause',    plate:'AIH 238', status:'scheduled'   },
  { d:15, start:'08:00', tech:M.javier,   svc:S.frenos,      name:'Gabriel Leiva',    plate:'AII 239', status:'scheduled'   },
  { d:15, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Hortencia Meza',   plate:'AIJ 240', status:'scheduled'   },
  { d:15, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Inés Núñez',       plate:'AIK 241', status:'scheduled'   },

  { d:16, start:'08:00', tech:M.omar,     svc:S.diagnostico, name:'Jovita Ortiz',     plate:'AIL 242', status:'scheduled'   },
  { d:16, start:'08:00', tech:M.gustavo,  svc:S.frenos,      name:'Kevin Paredes',    plate:'AIM 243', status:'scheduled'   },
  { d:16, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Linda Quiroga',    plate:'AIN 244', status:'scheduled'   },
  { d:16, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Marco Ramos',      plate:'AIO 245', status:'scheduled'   },
  { d:16, start:'08:00', tech:M.javier,   svc:S.suspension,  name:'Norma Soria',      plate:'AIP 246', status:'scheduled'   },
  { d:16, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Oswaldo Torres',   plate:'AIQ 247', status:'scheduled'   },

  { d:17, start:'08:00', tech:M.omar,     svc:S.mant,        name:'Pilar Ugarte',     plate:'AIR 248', status:'scheduled'   },
  { d:17, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Quintino Vargas',  plate:'AIS 249', status:'scheduled'   },
  { d:17, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Rosa Warnes',      plate:'AIT 250', status:'scheduled'   },
  { d:17, start:'08:00', tech:M.javier,   svc:S.frenos,      name:'Salvador Xara',    plate:'AIU 251', status:'scheduled'   },
  { d:17, start:'08:00', tech:M.rodrigo,  svc:S.correa,      name:'Tania Yebra',      plate:'AIV 252', status:'scheduled'   },

  { d:18, start:'08:00', tech:M.gustavo,  svc:S.diagnostico, name:'Ulises Zárate',    plate:'AIW 253', status:'scheduled'   },
  { d:18, start:'08:00', tech:M.patricia, svc:S.frenos,      name:'Vera Acosta',      plate:'AIX 254', status:'scheduled'   },
  { d:18, start:'08:00', tech:M.luz,      svc:S.aceite,      name:'Wilson Britos',    plate:'AIY 255', status:'scheduled'   },
  { d:18, start:'08:30', tech:M.luz,      svc:S.aceite,      name:'Xenia Colman',     plate:'AIZ 256', status:'scheduled'   },
  { d:18, start:'08:00', tech:M.natalia,  svc:S.motor,       name:'Yamila Díaz',      plate:'AJA 257', status:'scheduled'   },
  { d:18, start:'08:00', tech:M.rodrigo,  svc:S.motor,       name:'Zenón Espínola',   plate:'AJB 258', status:'scheduled'   },
];

// ─── Entradas bodyshop: próximas 3 semanas ────────────────────────────────────

interface EntryRow {
  d: number;
  wt: { id: string; bw: number; pr: number; pa: number };
  name: string; plate: string; stay: number;
  channel: 'walk_in' | 'phone' | 'online' | 'insurance';
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled';
  bw: string; pr: string; pa: string; // tech IDs
}

const ENTRIES: EntryRow[] = [
  // ── Semana actual (Apr 27 - May 1) ─────────────────────────────────────────
  { d:0,  wt:WT.retoque,  name:'Adriana Baez',      plate:'CH 101', stay:1,  channel:'walk_in',   status:'in_progress', bw:B.chap.francisco, pr:B.prep.ana,    pa:B.paint.ismael  },
  { d:0,  wt:WT.frontal,  name:'Benjamín Cano',     plate:'CH 102', stay:2,  channel:'insurance', status:'in_progress', bw:B.chap.mario,     pr:B.prep.diego,  pa:B.paint.liliana },
  { d:0,  wt:WT.lateral,  name:'Carla Delgado',     plate:'CH 103', stay:4,  channel:'insurance', status:'in_progress', bw:B.chap.ruben,     pr:B.prep.estela, pa:B.paint.marcelo },
  { d:1,  wt:WT.pintura,  name:'David Espínola',    plate:'CH 104', stay:3,  channel:'phone',     status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:1,  wt:WT.abollas,  name:'Elena Ferreira',    plate:'CH 105', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:2,  wt:WT.retoque,  name:'Fabián Gaona',      plate:'CH 106', stay:1,  channel:'online',    status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:2,  wt:WT.frontal,  name:'Gloria Herrera',    plate:'CH 107', stay:2,  channel:'insurance', status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:3,  wt:WT.lateral,  name:'Héctor Ibáñez',     plate:'CH 108', stay:4,  channel:'insurance', status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:3,  wt:WT.abollas,  name:'Irene Jiménez',     plate:'CH 109', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:4,  wt:WT.pintura,  name:'Jorge Krause',      plate:'CH 110', stay:3,  channel:'phone',     status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:4,  wt:WT.retoque,  name:'Karla Leiva',       plate:'CH 111', stay:1,  channel:'online',    status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },

  // ── Semana 2 (May 4-8) ─────────────────────────────────────────────────────
  { d:7,  wt:WT.frontal,  name:'Luis Morales',      plate:'CH 112', stay:2,  channel:'walk_in',   status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:7,  wt:WT.trasero,  name:'Marta Núñez',       plate:'CH 113', stay:7,  channel:'insurance', status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:7,  wt:WT.abollas,  name:'Nicolás Ortega',    plate:'CH 114', stay:1,  channel:'phone',     status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:8,  wt:WT.pintura,  name:'Olga Paredes',      plate:'CH 115', stay:3,  channel:'online',    status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:8,  wt:WT.retoque,  name:'Pablo Quiroga',     plate:'CH 116', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:8,  wt:WT.lateral,  name:'Quilda Ramos',      plate:'CH 117', stay:4,  channel:'insurance', status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:9,  wt:WT.frontal,  name:'Rosa Sánchez',      plate:'CH 118', stay:2,  channel:'phone',     status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:9,  wt:WT.abollas,  name:'Sergio Torres',     plate:'CH 119', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:9,  wt:WT.siniestro,name:'Teresa Ugarte',     plate:'CH 120', stay:10, channel:'insurance', status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:10, wt:WT.retoque,  name:'Umberto Vargas',    plate:'CH 121', stay:1,  channel:'online',    status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:10, wt:WT.pintura,  name:'Vera Warnes',       plate:'CH 122', stay:3,  channel:'phone',     status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:10, wt:WT.frontal,  name:'Walter Xara',       plate:'CH 123', stay:2,  channel:'insurance', status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:11, wt:WT.trasero,  name:'Ximena Yebra',      plate:'CH 124', stay:7,  channel:'insurance', status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:11, wt:WT.abollas,  name:'Yolanda Zárate',    plate:'CH 125', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },

  // ── Semana 3 (May 11-15) ───────────────────────────────────────────────────
  { d:14, wt:WT.frontal,  name:'Zaida Acosta',      plate:'CH 126', stay:2,  channel:'phone',     status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:14, wt:WT.lateral,  name:'Álvaro Benítez',    plate:'CH 127', stay:4,  channel:'insurance', status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:14, wt:WT.pintura,  name:'Beatriz Cardozo',   plate:'CH 128', stay:3,  channel:'online',    status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:15, wt:WT.retoque,  name:'César Duarte',      plate:'CH 129', stay:1,  channel:'walk_in',   status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:15, wt:WT.abollas,  name:'Diana Espínola',    plate:'CH 130', stay:1,  channel:'phone',     status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:15, wt:WT.trasero,  name:'Eduardo Ferreira',  plate:'CH 131', stay:7,  channel:'insurance', status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:16, wt:WT.frontal,  name:'Fanny Gaona',       plate:'CH 132', stay:2,  channel:'walk_in',   status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:16, wt:WT.pintura,  name:'Gilberto Herrera',  plate:'CH 133', stay:3,  channel:'insurance', status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:17, wt:WT.siniestro,name:'Haydée Ibáñez',     plate:'CH 134', stay:10, channel:'insurance', status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
  { d:17, wt:WT.retoque,  name:'Ignacio Jiménez',   plate:'CH 135', stay:1,  channel:'online',    status:'scheduled',   bw:B.chap.mario,     pr:B.prep.ana,    pa:B.paint.liliana },
  { d:18, wt:WT.lateral,  name:'Juana Krause',      plate:'CH 136', stay:4,  channel:'insurance', status:'scheduled',   bw:B.chap.ruben,     pr:B.prep.diego,  pa:B.paint.marcelo },
  { d:18, wt:WT.abollas,  name:'Karina Leiva',      plate:'CH 137', stay:1,  channel:'phone',     status:'scheduled',   bw:B.chap.francisco, pr:B.prep.estela, pa:B.paint.ismael  },
];

// ─── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  await DS.initialize();
  const qr = DS.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // ── 1. Appointments mecánico ──────────────────────────────────────────────
    let aCreated = 0;
    for (const a of APPTS) {
      const d = date(a.d);
      const end = addTime(a.start, a.svc.h);
      const res: { id: string }[] = await qr.query(
        `INSERT INTO appointments
           (id, date, time_start, time_end, technician_id, service_type_id,
            customer_name, plate, status, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'seed')
         ON CONFLICT DO NOTHING RETURNING id`,
        [d, a.start, end, a.tech, a.svc.id, a.name, a.plate, a.status],
      );
      if (res.length) aCreated++;
    }
    console.log(`✓ ${aCreated} turnos mecánico insertados`);

    // ── 2. Bodyshop entries ───────────────────────────────────────────────────
    let eCreated = 0;
    for (const e of ENTRIES) {
      const d = date(e.d);
      const rows: { id: string }[] = await qr.query(
        `INSERT INTO bodyshop_entries
           (id, workshop_id, date, work_type_id, customer_name, plate, status,
            bodywork_hours, prep_hours, paint_hours, stay_days, channel, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'seed')
         ON CONFLICT DO NOTHING RETURNING id`,
        [BODYSHOP_WS_ID, d, e.wt.id, e.name, e.plate, e.status,
         e.wt.bw, e.wt.pr, e.wt.pa, e.stay, e.channel],
      );
      if (!rows.length) continue;
      eCreated++;
      const entryId = rows[0].id;

      for (const [proc, tid] of [['BODYWORK', e.bw], ['PREP', e.pr], ['PAINT', e.pa]] as [string, string][]) {
        if (!tid) continue;
        await qr.query(
          `INSERT INTO bodyshop_process_techs (id, entry_id, process, technician_id)
           VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (entry_id, process) DO NOTHING`,
          [entryId, proc, tid],
        );
      }
    }
    console.log(`✓ ${eCreated} ingresos bodyshop insertados`);

    await qr.commitTransaction();
    console.log('\n✅ Enriquecimiento completado');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌', err);
    throw err;
  } finally {
    await qr.release();
    await DS.destroy();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
