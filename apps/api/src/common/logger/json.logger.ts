import { ConsoleLogger } from '@nestjs/common';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

/**
 * Logger que serializa cada entrada como JSON cuando NODE_ENV=production.
 * Formato compatible con la mayoría de los agregadores (Datadog, Loki, ELK).
 *
 * En dev/test usa el ConsoleLogger por default (texto coloreado).
 *
 * Resolución de argumentos: NestJS llama `error(msg, stack?, context?)` y
 * `log/warn/...(msg, context?)`. Los argumentos extra se interpretan en orden,
 * sin heurísticas frágiles sobre el contenido (mejor que la implementación
 * anterior que miraba si "incluye \n").
 */
export class JsonLogger extends ConsoleLogger {
  private write(level: Level, message: unknown, ctx: string | undefined, stack?: string) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: typeof message === 'string' ? message : JSON.stringify(message),
      ctx: ctx ?? this.context ?? null,
      ...(stack ? { stack } : {}),
      pid: process.pid,
    };
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  // NestJS firma:
  //   error(message: any, stack?: string, context?: string)
  //   error(message: any, context?: string)            ← cuando no hay stack
  // Discriminamos por número de args, no por contenido.
  error(message: unknown, stackOrContext?: string, context?: string) {
    if (context !== undefined) {
      // 3 args → (msg, stack, context)
      this.write('error', message, context, stackOrContext);
    } else {
      // 2 args → (msg, context); no hay stack
      this.write('error', message, stackOrContext);
    }
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
}
