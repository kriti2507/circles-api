import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CIRCLE_SIZE = 4;
const MIN_BACKFILL_SCORE = 3; // At least 1 shared language or 1+ shared interests
const MIN_BATCH_SCORE = 0; // Batch sweep is lenient — match stragglers
const LOCK_TTL_MS = 30_000; // 30 second lock expiry

const CIRCLE_NAME_ADJECTIVES = [
  "Curious", "Wandering", "Friendly", "Bold", "Chill",
  "Creative", "Happy", "Bright", "Cozy", "Sunny",
];

const CIRCLE_NAME_NOUNS = [
  "Explorers", "Adventurers", "Wanderers", "Stargazers", "Trailblazers",
  "Dreamers", "Nomads", "Navigators", "Voyagers", "Pioneers",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateCircleName(): string {
  const adj = CIRCLE_NAME_ADJECTIVES[Math.floor(Math.random() * CIRCLE_NAME_ADJECTIVES.length)];
  const noun = CIRCLE_NAME_NOUNS[Math.floor(Math.random() * CIRCLE_NAME_NOUNS.length)];
  return `The ${adj} ${noun}`;
}

interface UserProfile {
  interests: string[];
  languages: string[];
}

function computeMatchScore(a: UserProfile, b: UserProfile): number {
  const sharedInterests = a.interests.filter((i) => b.interests.includes(i)).length;
  const sharedLanguages = a.languages.filter((l) => b.languages.includes(l)).length;
  return sharedInterests * 2 + sharedLanguages * 3;
}

/** Score a user against an existing circle — returns the MINIMUM pairwise score. */
function computeCircleScore(user: UserProfile, members: UserProfile[]): number {
  if (members.length === 0) return 0;
  const scores = members.map((m) => computeMatchScore(user, m));
  return Math.min(...scores);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lockExpiry(): string {
  return new Date(Date.now() + LOCK_TTL_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Event Mode — triggered when a single user joins the queue
// ---------------------------------------------------------------------------

async function handleEventMode(
  supabase: SupabaseClient,
  userId: string
): Promise<Response> {
  // 1. Fetch user profile
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("interests, languages")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  // Verify user is actually in the queue
  const { data: queueEntry } = await supabase
    .from("matching_queue")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!queueEntry) {
    return jsonResponse({ error: "User not in matching queue" }, 400);
  }

  const profile: UserProfile = {
    interests: user.interests ?? [],
    languages: user.languages ?? [],
  };

  // 2. Try backfill into existing under-capacity circle
  const backfill = await tryBackfill(supabase, userId, profile);
  if (backfill.matched) {
    return jsonResponse({
      matched: true,
      mode: "backfill",
      circle_id: backfill.circleId,
    });
  }

  // 3. Try forming a new circle from queued users
  const newCircle = await tryFormNewCircle(supabase, userId, profile);
  if (newCircle.matched) {
    return jsonResponse({
      matched: true,
      mode: "new_circle",
      circle_id: newCircle.circleId,
    });
  }

  // 4. No match — leave in queue for daily sweep
  return jsonResponse({
    matched: false,
    message: "No compatible match found; will retry in daily sweep",
  });
}

// ---------------------------------------------------------------------------
// Backfill — add user to an existing circle with < 4 members
// ---------------------------------------------------------------------------

interface MatchResult {
  matched: boolean;
  circleId?: string;
}

async function tryBackfill(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile
): Promise<MatchResult> {
  // Find circles with open slots
  const { data: eligible, error: eligibleError } = await supabase
    .from("backfill_eligible_circles")
    .select("circle_id, active_member_count");

  if (eligibleError || !eligible || eligible.length === 0) {
    return { matched: false };
  }

  // Score each eligible circle
  const scored: { circleId: string; score: number; memberCount: number }[] = [];

  for (const ec of eligible) {
    // Get member profiles for this circle
    const { data: members } = await supabase
      .from("circle_memberships")
      .select("user_id, users(interests, languages)")
      .eq("circle_id", ec.circle_id)
      .eq("status", "active");

    if (!members || members.length === 0) continue;

    // Check for blocks between user and circle members
    const memberIds = members.map((m: { user_id: string }) => m.user_id);
    const { data: blocks } = await supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${userId},blocked_id.in.(${memberIds.join(",")})),` +
        `and(blocked_id.eq.${userId},blocker_id.in.(${memberIds.join(",")}))`
      );

    if (blocks && blocks.length > 0) continue; // Skip circles with blocked members

    const memberProfiles: UserProfile[] = members.map((m: any) => ({
      interests: m.users?.interests ?? [],
      languages: m.users?.languages ?? [],
    }));

    const score = computeCircleScore(profile, memberProfiles);

    if (score >= MIN_BACKFILL_SCORE) {
      scored.push({
        circleId: ec.circle_id,
        score,
        memberCount: ec.active_member_count,
      });
    }
  }

  if (scored.length === 0) return { matched: false };

  // Pick best circle: highest score, then prefer emptier circles
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.memberCount - b.memberCount;
  });

  // Try inserting into the best circle — capacity trigger will reject if full
  for (const candidate of scored) {
    const { error: memberError } = await supabase
      .from("circle_memberships")
      .insert({ circle_id: candidate.circleId, user_id: userId });

    if (memberError) {
      // Capacity exceeded or duplicate — try next circle
      console.error("Backfill insert failed:", memberError.message);
      continue;
    }

    // Successfully added — remove from queue
    await supabase.from("matching_queue").delete().eq("user_id", userId);

    // Notify existing members
    await notifyCircleMembers(supabase, candidate.circleId, userId);

    return { matched: true, circleId: candidate.circleId };
  }

  return { matched: false };
}

// ---------------------------------------------------------------------------
// New Circle — form a group of 4 from queued users
// ---------------------------------------------------------------------------

async function tryFormNewCircle(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile
): Promise<MatchResult> {
  const now = new Date().toISOString();
  const expiry = lockExpiry();

  // 1. Lock the triggering user
  const { data: lockResult } = await supabase
    .from("matching_queue")
    .update({ locked_until: expiry })
    .eq("user_id", userId)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .select("user_id")
    .maybeSingle();

  if (!lockResult) {
    return { matched: false }; // Already locked by another process
  }

  // 2. Get unlocked candidates
  const { data: candidates } = await supabase
    .from("matching_queue")
    .select("user_id, users(interests, languages)")
    .neq("user_id", userId)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order("priority", { ascending: false })
    .order("joined_queue_at", { ascending: true });

  if (!candidates || candidates.length < CIRCLE_SIZE - 1) {
    await releaseLock(supabase, userId);
    return { matched: false };
  }

  // 3. Score candidates against the triggering user
  const scoredCandidates = candidates
    .map((c: any) => ({
      userId: c.user_id as string,
      score: computeMatchScore(profile, {
        interests: c.users?.interests ?? [],
        languages: c.users?.languages ?? [],
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scoredCandidates.slice(0, CIRCLE_SIZE - 1);

  // 4. Check minimum compatibility
  if (top.length < CIRCLE_SIZE - 1 || top[top.length - 1].score < MIN_BACKFILL_SCORE) {
    await releaseLock(supabase, userId);
    return { matched: false };
  }

  // 5. Lock the selected candidates
  const candidateIds = top.map((c) => c.userId);
  const { data: locked } = await supabase
    .from("matching_queue")
    .update({ locked_until: expiry })
    .in("user_id", candidateIds)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .select("user_id");

  if (!locked || locked.length < CIRCLE_SIZE - 1) {
    // Could not lock enough — release everything
    await releaseLock(supabase, userId);
    if (locked && locked.length > 0) {
      await supabase
        .from("matching_queue")
        .update({ locked_until: null })
        .in("user_id", locked.map((l: { user_id: string }) => l.user_id));
    }
    return { matched: false };
  }

  const group = [userId, ...locked.map((l: { user_id: string }) => l.user_id)];

  // 6. Compute average score for the circle
  const avgScore = top.reduce((sum, c) => sum + c.score, 0) / top.length;

  // 7. Create circle
  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .insert({ name: generateCircleName(), match_score: avgScore })
    .select("id")
    .single();

  if (circleError) {
    console.error("Failed to create circle:", circleError.message);
    await releaseGroupLocks(supabase, group);
    return { matched: false };
  }

  // 8. Add all members
  const memberships = group.map((uid) => ({
    circle_id: circle.id,
    user_id: uid,
  }));

  const { error: memberError } = await supabase
    .from("circle_memberships")
    .insert(memberships);

  if (memberError) {
    console.error("Failed to add members:", memberError.message);
    await releaseGroupLocks(supabase, group);
    return { matched: false };
  }

  // 9. Remove all from queue
  await supabase.from("matching_queue").delete().in("user_id", group);

  return { matched: true, circleId: circle.id };
}

// ---------------------------------------------------------------------------
// Batch Mode — daily sweep for stragglers (original algorithm)
// ---------------------------------------------------------------------------

interface QueueEntry {
  user_id: string;
  users: {
    interests: string[];
    languages: string[];
  };
}

function matchUsersIntoGroups(queue: QueueEntry[], groupSize: number): string[][] {
  if (queue.length < groupSize) return [];

  const groups: string[][] = [];
  const used = new Set<string>();

  for (const entry of queue) {
    if (used.has(entry.user_id)) continue;

    const candidates = queue
      .filter((e) => e.user_id !== entry.user_id && !used.has(e.user_id))
      .map((e) => ({
        userId: e.user_id,
        score: computeMatchScore(entry.users, e.users),
      }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length < groupSize - 1) continue;

    const group = [entry.user_id];
    for (const candidate of candidates) {
      if (group.length >= groupSize) break;
      if (candidate.score >= MIN_BATCH_SCORE) {
        group.push(candidate.userId);
      }
    }

    if (group.length === groupSize) {
      groups.push(group);
      group.forEach((id) => used.add(id));
    }
  }

  return groups;
}

async function handleBatchMode(supabase: SupabaseClient): Promise<Response> {
  // Clean expired locks before starting
  await supabase
    .from("matching_queue")
    .update({ locked_until: null })
    .not("locked_until", "is", null)
    .lt("locked_until", new Date().toISOString());

  // Fetch all queued users
  const { data: queue, error: queueError } = await supabase
    .from("matching_queue")
    .select("user_id, users(interests, languages)")
    .order("priority", { ascending: false })
    .order("joined_queue_at", { ascending: true });

  if (queueError) throw queueError;

  if (!queue || queue.length < CIRCLE_SIZE) {
    return jsonResponse({
      matched: 0,
      message: `Not enough users in queue (${queue?.length || 0}/${CIRCLE_SIZE})`,
    });
  }

  const groups = matchUsersIntoGroups(queue as QueueEntry[], CIRCLE_SIZE);

  let matchedCount = 0;
  for (const group of groups) {
    const avgScore = computeGroupAvgScore(queue as QueueEntry[], group);

    const { data: circle, error: circleError } = await supabase
      .from("circles")
      .insert({ name: generateCircleName(), match_score: avgScore })
      .select("id")
      .single();

    if (circleError) {
      console.error("Failed to create circle:", circleError.message);
      continue;
    }

    const memberships = group.map((uid) => ({
      circle_id: circle.id,
      user_id: uid,
    }));

    const { error: memberError } = await supabase
      .from("circle_memberships")
      .insert(memberships);

    if (memberError) {
      console.error("Failed to add members:", memberError.message);
      continue;
    }

    await supabase.from("matching_queue").delete().in("user_id", group);
    matchedCount++;
  }

  return jsonResponse({
    matched: matchedCount,
    circles_created: matchedCount,
    users_matched: matchedCount * CIRCLE_SIZE,
  });
}

function computeGroupAvgScore(queue: QueueEntry[], group: string[]): number {
  const entries = queue.filter((q) => group.includes(q.user_id));
  if (entries.length < 2) return 0;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      total += computeMatchScore(entries[i].users, entries[j].users);
      pairs++;
    }
  }
  return pairs > 0 ? Math.round((total / pairs) * 100) / 100 : 0;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function releaseLock(supabase: SupabaseClient, userId: string) {
  await supabase
    .from("matching_queue")
    .update({ locked_until: null })
    .eq("user_id", userId);
}

async function releaseGroupLocks(supabase: SupabaseClient, userIds: string[]) {
  await supabase
    .from("matching_queue")
    .update({ locked_until: null })
    .in("user_id", userIds);
}

async function notifyCircleMembers(
  supabase: SupabaseClient,
  circleId: string,
  newUserId: string
) {
  try {
    // Get existing members (excluding the new one)
    const { data: members } = await supabase
      .from("circle_memberships")
      .select("user_id")
      .eq("circle_id", circleId)
      .eq("status", "active")
      .neq("user_id", newUserId);

    // Get new member's name
    const { data: newUser } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", newUserId)
      .single();

    const name = newUser?.display_name || "Someone";

    for (const member of members || []) {
      await supabase.functions.invoke("send-notification", {
        body: {
          user_id: member.user_id,
          title: "New Circle Member!",
          body: `${name} joined your circle`,
          data: { type: "circle_member_joined", circle_id: circleId },
        },
      });
    }
  } catch (err) {
    // Notification failure is non-fatal
    console.error("Failed to notify circle members:", err);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode || "batch";
    const triggerUserId: string | undefined = body.user_id;

    if (mode === "event" && triggerUserId) {
      return await handleEventMode(supabase, triggerUserId);
    }

    return await handleBatchMode(supabase);
  } catch (error) {
    console.error("Matching error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
