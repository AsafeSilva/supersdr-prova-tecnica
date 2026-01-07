/**
 * SuperSDR - Cliente de Banco de Dados
 * 
 * Abstração para operações de banco de dados.
 * Permite troca fácil entre diferentes implementações (PostgreSQL, SQLite, etc).
 */

/**
 * Interface para resultado de query
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Interface para cliente de banco de dados
 */
export interface DatabaseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  
  close(): Promise<void>;
}

/**
 * Configuração do banco de dados
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * Implementação PostgreSQL usando pg
 */
export class PostgresClient implements DatabaseClient {
  private pool: unknown; // Pool do pg

  constructor(config: DatabaseConfig) {
    // Em produção, usaria:
    // import { Pool } from 'pg';
    // this.pool = new Pool(config);
    
    // Para o exemplo, simulamos
    console.log('[PostgresClient] Inicializando conexão:', {
      host: config.host,
      database: config.database
    });
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    console.log('[PostgresClient] Query:', sql.substring(0, 100));
    
    // Em produção: return this.pool.query(sql, params);
    // Simulação para exemplo:
    return { rows: [], rowCount: 0 };
  }

  async close(): Promise<void> {
    // Em produção: await this.pool.end();
    console.log('[PostgresClient] Conexão encerrada');
  }
}

/**
 * Implementação em memória para testes
 */
export class InMemoryClient implements DatabaseClient {
  private data: Map<string, Record<string, unknown>[]> = new Map();

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    // Simulação simples para testes
    const tableName = this.extractTableName(sql);
    
    if (sql.toLowerCase().startsWith('insert')) {
      const rows = this.data.get(tableName) || [];
      // Simula insert
      rows.push(this.paramsToRow(params || []));
      this.data.set(tableName, rows);
      return { rows: [], rowCount: 1 };
    }
    
    if (sql.toLowerCase().startsWith('select')) {
      const rows = this.data.get(tableName) || [];
      return { rows: rows as T[], rowCount: rows.length };
    }
    
    return { rows: [], rowCount: 0 };
  }

  private extractTableName(sql: string): string {
    const match = sql.match(/(?:from|into|update)\s+(\w+)/i);
    return match ? match[1] : 'unknown';
  }

  private paramsToRow(params: unknown[]): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    params.forEach((param, index) => {
      row[`col_${index}`] = param;
    });
    return row;
  }

  async close(): Promise<void> {
    this.data.clear();
  }

  // Método auxiliar para testes
  getData(table: string): Record<string, unknown>[] {
    return this.data.get(table) || [];
  }
}

/**
 * Factory para obter cliente de banco de dados
 */
let databaseClient: DatabaseClient | null = null;

export function getDatabaseClient(): DatabaseClient {
  if (!databaseClient) {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'test') {
      databaseClient = new InMemoryClient();
    } else {
      databaseClient = new PostgresClient({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'supersdr',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true'
      });
    }
  }
  
  return databaseClient;
}

/**
 * Define cliente de banco de dados (útil para testes)
 */
export function setDatabaseClient(client: DatabaseClient): void {
  databaseClient = client;
}
