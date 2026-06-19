// Type shim for mssql — needed because moduleResolution: "bundler" (Next.js 15)
// does not pick up package type declarations without an exports.types entry.
declare module 'mssql' {
  export interface config {
    server?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    options?: { encrypt?: boolean; trustServerCertificate?: boolean; [key: string]: any };
    connectionTimeout?: number;
    requestTimeout?: number;
    [key: string]: any;
  }

  export interface ISqlType {
    type: any;
    length?: number;
    [key: string]: any;
  }

  export interface IResult<T = any> {
    recordset: T[];
    recordsets: T[][];
    rowsAffected: number[];
    [key: string]: any;
  }

  export class Request {
    input(name: string, type?: any, value?: any): this;
    query<T = any>(command: string): Promise<IResult<T>>;
    [key: string]: any;
  }

  export class ConnectionPool {
    constructor(config: config | string);
    connect(): Promise<this>;
    close(): Promise<void>;
    request(): Request;
    [key: string]: any;
  }

  export const Int: ISqlType;
  export const BigInt: ISqlType;
  export const TinyInt: ISqlType;
  export const SmallInt: ISqlType;
  export const Bit: ISqlType;
  export const Float: ISqlType;
  export const Real: ISqlType;
  export const DateTime: ISqlType;
  export const DateTime2: ISqlType;
  export const UniqueIdentifier: ISqlType;
  export const Money: ISqlType;
  export const Decimal: ISqlType;
  export function NVarChar(length?: number): ISqlType;
  export function VarChar(length?: number): ISqlType;
  export function NChar(length?: number): ISqlType;
  export function Char(length?: number): ISqlType;
  export function Binary(length?: number): ISqlType;
  export function VarBinary(length?: number): ISqlType;
}
