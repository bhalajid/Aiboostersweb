/* AI Draw runtime settings. Safe to publish: the anon key only allows what the
   row-level-security policies in supabase/ai-draw-schema.sql permit (each signed-in
   user can read and change only their own tickets).
   Leave both empty to keep tickets on the user's device only. */
window.AI_DRAW_CONFIG = {
  supabaseUrl: "",        // e.g. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: ""     // Project Settings -> API -> "anon public" key
};
