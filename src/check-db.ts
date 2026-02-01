/**
 * Database Diagnostic - Check all tables
 */

import { getSupabase } from './lib/db/client.js';
import { config } from './config/index.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  DATABASE DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!config.supabase.url) {
    console.log('ERROR: Supabase not configured');
    process.exit(1);
  }

  const supabase = getSupabase();

  // Check all tables
  const tables = ['users', 'options', 'trades', 'positions', 'deposits', 'withdrawals', 'settlements', 'price_history'];

  for (const table of tables) {
    console.log(`\n📋 TABLE: ${table}`);
    console.log('─'.repeat(60));

    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .limit(5);

      if (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        console.log(`   Code: ${error.code}`);
        console.log(`   Details: ${error.details}`);
        console.log(`   Hint: ${error.hint}`);
      } else {
        console.log(`   ✓ Total rows: ${count}`);
        if (data && data.length > 0) {
          console.log(`   Sample data (first ${Math.min(data.length, 3)} rows):`);
          for (const row of data.slice(0, 3)) {
            // Show key fields based on table
            if (table === 'users') {
              console.log(`     - ${row.wallet_address?.slice(0, 20)}... | Balance: $${row.balance}`);
            } else if (table === 'options') {
              console.log(`     - ${row.option_type?.toUpperCase()} | Strike: $${row.strike_price} | Premium: $${row.premium} | Status: ${row.status}`);
            } else if (table === 'trades') {
              console.log(`     - Premium: $${row.premium} | Size: ${row.size} | Buyer: ${row.buyer_address?.slice(0, 15)}...`);
            } else if (table === 'positions') {
              console.log(`     - ${row.side?.toUpperCase()} | Size: ${row.size} | Entry: $${row.entry_price} | Status: ${row.status}`);
            } else {
              console.log(`     - ${JSON.stringify(row).slice(0, 80)}...`);
            }
          }
        } else {
          console.log(`   (no data)`);
        }
      }
    } catch (err) {
      console.log(`   ❌ EXCEPTION: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
