import { createClient } from '@supabase/supabase-js';

const url = 'https://mroudkddozvlpcxedank.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yb3Vka2Rkb3p2bHBjeGVkYW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzAxODUsImV4cCI6MjA4NDUwNjE4NX0.K3x4REiM9Vaju-06eJcPlmLjy6AbkKvbxTtA77FidbQ';

const supabase = createClient(url, key);
const { data, error } = await supabase
  .from('posts')
  .select('id, content, star_count, comment_count, created_at, updated_at')
  .order('created_at', { ascending: false })
  .limit(15);
if (error) throw new Error(error.message);
for (const p of data || []) {
  const diffMs = new Date(p.updated_at) - new Date(p.created_at);
  console.log(`${p.id.slice(0,8)} stars=${p.star_count} comments=${p.comment_count} diff=${diffMs}ms content="${p.content.slice(0,40)}"`);
}
