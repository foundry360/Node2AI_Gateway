import { query } from './postgres-client';

export const db = {
  query,
};

export type DB = typeof db;

export default db;
