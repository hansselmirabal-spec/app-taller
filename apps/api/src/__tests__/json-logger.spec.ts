import { JsonLogger } from '../common/logger/json.logger';

describe('JsonLogger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function lastJson(spy: jest.SpyInstance): any {
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return JSON.parse(calls[calls.length - 1][0] as string);
  }

  it('log() escribe a stdout con level="log"', () => {
    new JsonLogger().log('hello', 'AppContext');
    const entry = lastJson(stdoutSpy);
    expect(entry.level).toBe('log');
    expect(entry.msg).toBe('hello');
    expect(entry.ctx).toBe('AppContext');
    expect(entry.ts).toBeDefined();
    expect(entry.pid).toBe(process.pid);
  });

  it('error(msg, context) sin stack: 2 args → solo msg + ctx', () => {
    new JsonLogger().error('algo falló', 'AuthService');
    const entry = lastJson(stderrSpy);
    expect(entry.level).toBe('error');
    expect(entry.msg).toBe('algo falló');
    expect(entry.ctx).toBe('AuthService');
    expect(entry.stack).toBeUndefined();
  });

  it('error(msg, stack, context) con 3 args: stack se preserva', () => {
    const stack = 'Error: x\n    at foo (bar.js:1:2)';
    new JsonLogger().error('algo falló', stack, 'AuthService');
    const entry = lastJson(stderrSpy);
    expect(entry.stack).toBe(stack);
    expect(entry.ctx).toBe('AuthService');
  });

  it('error con stack de 1 línea funciona (sin heurística "contiene \\n")', () => {
    new JsonLogger().error('algo falló', 'no-newlines-stack', 'CtxX');
    const entry = lastJson(stderrSpy);
    expect(entry.stack).toBe('no-newlines-stack');
    expect(entry.ctx).toBe('CtxX');
  });

  it('error con contexto que contiene \\n funciona (sin heurística rota)', () => {
    new JsonLogger().error('msg', 'contexto\ncon\nsaltos');
    const entry = lastJson(stderrSpy);
    // Solo 2 args → es context, NO stack
    expect(entry.ctx).toBe('contexto\ncon\nsaltos');
    expect(entry.stack).toBeUndefined();
  });

  it('escribe error a stderr (no stdout)', () => {
    new JsonLogger().error('boom');
    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('escribe log/warn/debug a stdout (no stderr)', () => {
    const logger = new JsonLogger();
    logger.log('a');
    logger.warn('b');
    logger.debug('c');
    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('serializa objects en msg como JSON string', () => {
    new JsonLogger().log({ user: 'admin', action: 'login' });
    const entry = lastJson(stdoutSpy);
    expect(JSON.parse(entry.msg)).toEqual({ user: 'admin', action: 'login' });
  });

  it('cada línea termina con \\n (newline-delimited JSON)', () => {
    new JsonLogger().log('hello');
    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written.endsWith('\n')).toBe(true);
    // El JSON no contiene newlines en sí (excepto el del final)
    expect(written.slice(0, -1).includes('\n')).toBe(false);
  });
});
