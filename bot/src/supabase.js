import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper para formatar BRL
export function fmtBRL(valor) {
  if (valor == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor));
}

// Helper para formatar número com separador de milhar
export function fmtNum(valor, decimais = 0) {
  if (valor == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(Number(valor));
}

// Helper para percentual
export function fmtPct(valor, decimais = 1) {
  if (valor == null || isNaN(valor)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(Number(valor));
}

// Helper para formato de prazo
export function fmtPrazo(dias) {
  if (dias == null) return '—';
  const d = Number(dias);
  if (d === 1) return '1 dia';
  return `${d} dias`;
}
