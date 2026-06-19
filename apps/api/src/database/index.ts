/**
 * Orquestador de seeds. Ejecuta todos los seeds en orden.
 * Uso: npm run db:seed:all
 */
import { execSync } from 'child_process';
import { resolve } from 'path';

const seeds = [
  'src/database/seed.ts',
  'src/database/mechanic.seed.ts',
  'src/database/bodyshop-catalog.seed.ts',
];

for (const seed of seeds) {
  console.log(`\n▶ Ejecutando ${seed}...`);
  try {
    execSync(`npx ts-node -r tsconfig-paths/register ${resolve(__dirname, '../../..', seed)}`, {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.error(`❌ Error en ${seed}`);
    process.exit(1);
  }
}

console.log('\n🎉 Todos los seeds completados.');
