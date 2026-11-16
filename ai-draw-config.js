/* AI Draw runtime settings. Safe to publish: the anon key only allows what the
   row-level-security policies in supabase/ai-draw-schema.sql permit (each signed-in
   user can read and change only their own tickets).
   Leave both empty to keep tickets on the user's device only. */
window.AI_DRAW_CONFIG = {
  supabaseUrl: "https://nnejeqrlvrzyogsdrhcx.supabase.co",
  supabaseAnonKey: "sb_publishable_dUPbSL7vE023ZkkpW6Foag_4T_JS4UP"   // publishable key (public by design)
};
