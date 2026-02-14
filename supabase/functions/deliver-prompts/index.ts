import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active circles
    const { data: circles, error: circlesError } = await supabase
      .from("circles")
      .select("id, current_prompt_id")
      .eq("status", "active");

    if (circlesError) throw circlesError;
    if (!circles || circles.length === 0) {
      return new Response(
        JSON.stringify({ delivered: 0, message: "No active circles" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Get all active prompts
    const { data: prompts, error: promptsError } = await supabase
      .from("prompts")
      .select("id")
      .eq("is_active", true);

    if (promptsError) throw promptsError;
    if (!prompts || prompts.length === 0) {
      return new Response(
        JSON.stringify({ delivered: 0, message: "No active prompts" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let deliveredCount = 0;

    for (const circle of circles) {
      // Pick a prompt that isn't the current one
      const availablePrompts = prompts.filter(
        (p) => p.id !== circle.current_prompt_id
      );
      if (availablePrompts.length === 0) continue;

      const randomPrompt =
        availablePrompts[Math.floor(Math.random() * availablePrompts.length)];

      // Update circle with new prompt
      const { error: updateError } = await supabase
        .from("circles")
        .update({
          current_prompt_id: randomPrompt.id,
          prompt_delivered_at: new Date().toISOString(),
        })
        .eq("id", circle.id);

      if (updateError) {
        console.error(
          `Failed to deliver prompt to circle ${circle.id}:`,
          updateError
        );
        continue;
      }

      // Send a system message to the circle chat
      const { error: messageError } = await supabase
        .from("messages")
        .insert({
          circle_id: circle.id,
          // Use a system user ID or the first member as sender
          sender_id: (
            await supabase
              .from("circle_memberships")
              .select("user_id")
              .eq("circle_id", circle.id)
              .eq("status", "active")
              .limit(1)
              .single()
          ).data?.user_id,
          content: "A new weekly prompt has arrived!",
          message_type: "prompt",
        });

      if (messageError) {
        console.error(
          `Failed to send prompt message to circle ${circle.id}:`,
          messageError
        );
      }

      deliveredCount++;
    }

    return new Response(
      JSON.stringify({
        delivered: deliveredCount,
        total_circles: circles.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Prompt delivery error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
