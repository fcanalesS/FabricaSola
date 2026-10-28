/**
 * Lo que la aplicación usa de `node:sqlite`. Los tipos de Node del proyecto
 * (`@types/node` 20) todavía no lo traen, aunque el Node en que corre sí.
 * Cuando se actualicen esos tipos, este archivo sobra.
 */
declare module "node:sqlite" {
  type Valor = null | number | bigint | string | Uint8Array;

  export class StatementSync {
    run(...parametros: Valor[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...parametros: Valor[]): Record<string, Valor> | undefined;
    all(...parametros: Valor[]): Record<string, Valor>[];
  }

  export class DatabaseSync {
    constructor(ruta: string, opciones?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
