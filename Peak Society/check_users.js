const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' }); // Make sure path to .env is correct

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('users').select('username, role, id');
  if (error) console.error(error);
  else console.table(data);
}
check();
