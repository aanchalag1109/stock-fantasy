<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Contest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ContestController extends Controller
{
    // ─── INDEX ────────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $status = $request->get('status');
        $contests = Contest::with('leagueSession')
            ->when($status, function ($q) use ($status) {
                return $q->whereHas('leagueSession', function ($query) use ($status) {
                    $query->where('status', $status);
                });
            })
            ->orderByDesc('is_pinned')
            ->orderBy('pin_order')
            ->paginate(8);

        $contests->getCollection()->transform(function ($contest) {
            $contest->participants_count = DB::table('contest_entries')
                ->where('contest_id', $contest->id)
                ->count();
            $contest->progress_percentage = $contest->participants > 0
                ? min(100, ($contest->participants_count / $contest->participants) * 100)
                : 0;
            return $contest;
        });

        return view('admin.contests.index', compact('contests', 'status'));
    }

    // ─── CREATE ───────────────────────────────────────────────────────────────
    public function create()
    {
        $sessions = \App\Models\LeagueSession::where('status', 'upcoming')
            ->orderBy('start_time')
            ->get()
            ->map(fn($s) => [
                'id'           => $s->id,
                'name'         => $s->name,
                'display_name' => $s->name . ' (' . date('d M Y H:i', strtotime($s->start_time)) . ' - ' . date('H:i', strtotime($s->end_time)) . ')',
            ]);
        return view('admin.contests.create', compact('sessions'));
    }

    // ─── STORE ────────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        Log::info('Contest creation request:', $request->all());

        $data = $request->validate([
            'league_session_ids'       => 'required|array|min:1',
            'league_session_ids.*'     => 'integer|exists:league_sessions,id',
            'category'                 => 'required|in:mega,equal,practice,guaranteed',
            'entry_fee'                => 'required|numeric|min:0',
            'participants'             => 'required|integer|min:2',
            'platform_fee'             => 'required|numeric|min:0|max:100',
            'winning_percentage'       => 'required|numeric|min:0|max:100',
            'max_entries_per_user'     => 'required|integer|min:1',
            'prize_distribution'       => 'nullable|string',
            // Guaranteed / Practice fixed prize
            'fixed_prize_pool'         => 'nullable|numeric|min:0',
            // Bot settings
            'bot_count'                => 'nullable|integer|min:0',
            'bot_join_minutes_before'  => 'nullable|integer|min:1',
            // Pin
            'is_pinned'                => 'nullable|boolean',
            'pin_order'                => 'nullable|integer|min:0',
        ]);

        $sessionIds = $data['league_session_ids'];
        unset($data['league_session_ids']);

        $isFixed = in_array($data['category'], ['guaranteed', 'practice']);

        // ── Prize pool calculation ──────────────────────────────────────────
        if ($isFixed && !empty($data['fixed_prize_pool'])) {
            // Guaranteed/Practice: admin sets fixed prize pool directly
            $prizePool         = floatval($data['fixed_prize_pool']);
            $totalPool         = floatval($data['entry_fee']) * intval($data['participants']);
            $platformFeeAmount = $totalPool > 0 ? ($totalPool * floatval($data['platform_fee'])) / 100 : 0;
        } else {
            // Dynamic (mega/equal): calculated from participants
            $totalPool         = floatval($data['entry_fee']) * intval($data['participants']);
            $platformFeeAmount = ($totalPool * floatval($data['platform_fee'])) / 100;
            $prizePool         = $totalPool - $platformFeeAmount;
        }

        $totalWinners = max(1, floor(intval($data['participants']) * (floatval($data['winning_percentage']) / 100)));

        $data['total_pool']          = $totalPool;
        $data['platform_fee_amount'] = $platformFeeAmount;
        $data['prize_pool']          = $prizePool;
        $data['total_winners']       = $totalWinners;
        $data['is_fixed_prize']      = $isFixed;
        $data['is_pinned']           = $request->boolean('is_pinned');
        $data['pin_order']           = intval($request->input('pin_order', 0));
        $data['bot_count']           = intval($request->input('bot_count', 0));
        $data['bot_join_minutes_before'] = intval($request->input('bot_join_minutes_before', 30));

        unset($data['fixed_prize_pool']);

        // ── Prize distribution (tree structure) ────────────────────────────
        $data['prize_distribution'] = $this->buildPrizeDistribution(
            $request,
            $data['category'],
            $totalWinners,
            $prizePool
        );

        // ── Create contest for each session ────────────────────────────────
        $created = [];
        foreach ($sessionIds as $sessionId) {
            $cd = $data;
            $cd['league_session_id'] = $sessionId;

            $session = \App\Models\LeagueSession::find($sessionId);
            if ($session) {
                $cd['start_time'] = $session->start_time;
                $cd['end_time']   = $session->end_time;
            }

            $contest = Contest::create($cd);
            $created[] = $contest;

            // Save rank details (tree rows)
            $this->saveRankDetails($contest->id, $cd['prize_distribution']);
        }

        return redirect()->route('admin.contests.index')
            ->with('success', count($created) . ' contest(s) created successfully.');
    }

    // ─── EDIT ─────────────────────────────────────────────────────────────────
    public function edit($id)
    {
        $contest  = Contest::with('rankDetails')->findOrFail($id);
        $sessions = \App\Models\LeagueSession::all()->map(fn($s) => [
            'id'           => $s->id,
            'name'         => $s->name,
            'display_name' => $s->name . ' (' . date('d M Y H:i', strtotime($s->start_time)) . ' - ' . date('H:i', strtotime($s->end_time)) . ')',
        ]);
        return view('admin.contests.edit', compact('contest', 'sessions'));
    }

    // ─── UPDATE ───────────────────────────────────────────────────────────────
    public function update(Request $request, $id)
    {
        $contest = Contest::findOrFail($id);

        $data = $request->validate([
            'league_session_id'        => 'nullable|integer',
            'category'                 => 'required|in:mega,equal,practice,guaranteed',
            'entry_fee'                => 'required|numeric|min:0',
            'participants'             => 'required|integer|min:2',
            'platform_fee'             => 'required|numeric|min:0|max:100',
            'winning_percentage'       => 'required|numeric|min:0|max:100',
            'max_entries_per_user'     => 'required',
            'prize_distribution'       => 'nullable',
            'fixed_prize_pool'         => 'nullable|numeric|min:0',
            'bot_count'                => 'nullable|integer|min:0',
            'bot_join_minutes_before'  => 'nullable|integer|min:1',
            'is_pinned'                => 'nullable|boolean',
            'pin_order'                => 'nullable|integer|min:0',
        ]);

        $isFixed = in_array($data['category'], ['guaranteed', 'practice']);

        if ($isFixed && !empty($data['fixed_prize_pool'])) {
            $prizePool         = floatval($data['fixed_prize_pool']);
            $totalPool         = floatval($data['entry_fee']) * intval($data['participants']);
            $platformFeeAmount = $totalPool > 0 ? ($totalPool * floatval($data['platform_fee'])) / 100 : 0;
        } else {
            $totalPool         = floatval($data['entry_fee']) * intval($data['participants']);
            $platformFeeAmount = ($totalPool * floatval($data['platform_fee'])) / 100;
            $prizePool         = $totalPool - $platformFeeAmount;
        }

        $totalWinners = max(1, floor(intval($data['participants']) * (floatval($data['winning_percentage']) / 100)));

        $data['total_pool']          = $totalPool;
        $data['platform_fee_amount'] = $platformFeeAmount;
        $data['prize_pool']          = $prizePool;
        $data['total_winners']       = $totalWinners;
        $data['is_fixed_prize']      = $isFixed;
        $data['is_pinned']           = $request->boolean('is_pinned');
        $data['pin_order']           = intval($request->input('pin_order', 0));
        $data['bot_count']           = intval($request->input('bot_count', 0));
        $data['bot_join_minutes_before'] = intval($request->input('bot_join_minutes_before', 30));

        unset($data['fixed_prize_pool']);

        $data['prize_distribution'] = $this->buildPrizeDistribution(
            $request,
            $data['category'],
            $totalWinners,
            $prizePool
        );

        $contest->update($data);

        // Refresh rank details
        DB::table('contest_rank_details')->where('contest_id', $id)->delete();
        $this->saveRankDetails($id, $data['prize_distribution']);

        return redirect()->route('admin.contests.index')
            ->with('success', 'Contest updated successfully.');
    }

    // ─── PIN / UNPIN ──────────────────────────────────────────────────────────
    public function togglePin(Request $request, $id)
    {
        $contest = Contest::findOrFail($id);
        $contest->is_pinned  = !$contest->is_pinned;
        $contest->pin_order  = $contest->is_pinned ? intval($request->input('pin_order', 0)) : 0;
        $contest->save();

        return response()->json([
            'success'   => true,
            'is_pinned' => $contest->is_pinned,
            'message'   => $contest->is_pinned ? 'Contest pinned to top.' : 'Contest unpinned.',
        ]);
    }

    // ─── SHOW ─────────────────────────────────────────────────────────────────
    public function show($id)
    {
        $contest          = Contest::with('leagueSession')->findOrFail($id);
        $participantCount = DB::table('contest_entries')->where('contest_id', $id)->count();
        $stats = [
            'total_participants' => $participantCount,
            'actual_prize_pool'  => $participantCount * $contest->entry_fee * (1 - ($contest->platform_fee ?? 10) / 100),
            'total_entries'      => $participantCount,
        ];
        return view('admin.contests.show', compact('contest', 'stats'));
    }

    // ─── STATUS UPDATE ────────────────────────────────────────────────────────
    public function updateStatus(Request $request, $id)
    {
        $contest = Contest::with('leagueSession')->findOrFail($id);
        $request->validate(['status' => 'required|in:upcoming,live,completed']);

        if ($contest->leagueSession) {
            $contest->leagueSession->update(['status' => $request->status]);
            Contest::where('league_session_id', $contest->league_session_id)
                ->update(['status' => $request->status]);

            if ($request->status === 'completed') {
                $sessionContests = Contest::where('league_session_id', $contest->league_session_id)->get();
                foreach ($sessionContests as $sc) {
                    $this->updateRankings($sc->id);
                }
            }
        }
        return response()->json(['success' => true]);
    }

    // ─── EXPORT ───────────────────────────────────────────────────────────────
    public function exportParticipants($id)
    {
        $contest      = Contest::findOrFail($id);
        $participants = DB::table('contest_entries as ce')
            ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
            ->where('ce.contest_id', $id)
            ->select('ce.rank', 'u.name as user_name', 'u.email as user_email', 'u.mobile as user_mobile', 'ce.total_score', 'ce.created_at')
            ->orderBy('ce.rank')
            ->get();

        $filename = "contest_{$id}_participants_" . date('Y-m-d') . ".csv";
        $headers  = ['Content-Type' => 'text/csv', 'Content-Disposition' => "attachment; filename={$filename}"];

        return response()->stream(function () use ($participants) {
            $file = fopen('php://output', 'w');
            fputcsv($file, ['Rank', 'Name', 'Email', 'Mobile', 'Score', 'Joined At']);
            foreach ($participants as $p) {
                fputcsv($file, [$p->rank ?? 'N/A', $p->user_name ?? 'N/A', $p->user_email ?? 'N/A', $p->user_mobile ?? 'N/A', $p->total_score ?? 0, $p->created_at]);
            }
            fclose($file);
        }, 200, $headers);
    }

    // ─── DELETE ───────────────────────────────────────────────────────────────
    public function destroy($id)
    {
        Contest::destroy($id);
        return back()->with('success', 'Contest deleted!');
    }

    public function bulkDelete(Request $request)
    {
        $request->validate(['contest_ids' => 'required|array|min:1', 'contest_ids.*' => 'integer|exists:contests,id']);
        $deleted = 0;
        foreach ($request->contest_ids as $id) {
            $c = Contest::find($id);
            if ($c && $c->status !== 'live') { $c->delete(); $deleted++; }
        }
        return redirect()->back()->with('success', "Deleted {$deleted} contests.");
    }

    // ─── CANCEL + REFUND ──────────────────────────────────────────────────────
    public function cancelContest($id)
    {
        try {
            $contest = Contest::findOrFail($id);
            if ($contest->status === 'cancelled') {
                return response()->json(['success' => false, 'message' => 'Already cancelled'], 400);
            }

            DB::transaction(function () use ($contest, $id) {
                $entryFee = floatval($contest->entry_fee ?? 0);
                $entries  = DB::table('contest_entries')->where('contest_id', $id)->get();

                foreach ($entries as $entry) {
                    DB::table('users')->where('id', $entry->user_id)->increment('deposit_balance', $entryFee);
                    DB::table('transactions')->insert([
                        'user_id'        => $entry->user_id,
                        'type'           => 'deposit',
                        'amount'         => $entryFee,
                        'status'         => 'success',
                        'description'    => "Contest #{$id} cancelled - Entry fee refunded",
                        'created_at'     => now(),
                        'updated_at'     => now(),
                    ]);
                }
                DB::table('contests')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);
            });

            return response()->json(['success' => true, 'message' => 'Contest cancelled and users refunded']);
        } catch (\Exception $e) {
            Log::error('Cancel contest error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    /**
     * Build prize distribution JSON from request.
     * Supports:
     *  - tree_rows[] (manual tree builder from admin UI)
     *  - prize_distribution (existing JSON string)
     *  - auto-generate for mega/equal
     */
    private function buildPrizeDistribution(Request $request, string $category, int $totalWinners, float $prizePool): string
    {
        // 1. Manual tree rows from admin UI (highest priority)
        $treeRows = $request->input('tree_rows', []);
        if (!empty($treeRows) && is_array($treeRows)) {
            $dist = [];
            foreach ($treeRows as $row) {
                $rankStart   = intval($row['rank_start'] ?? 1);
                $rankEnd     = intval($row['rank_end'] ?? $rankStart);
                $perWinner   = floatval($row['per_winner'] ?? 0);
                $winners     = $rankEnd - $rankStart + 1;
                $totalPrize  = $perWinner * $winners;
                $percent     = $prizePool > 0 ? round(($totalPrize / $prizePool) * 100, 4) : 0;

                $dist[] = [
                    'label'      => "Rank {$rankStart}" . ($rankEnd > $rankStart ? " to {$rankEnd}" : ''),
                    'rank_start' => $rankStart,
                    'rank_end'   => $rankEnd,
                    'winners'    => $winners,
                    'per_winner' => $perWinner,
                    'prize'      => $totalPrize,
                    'percent'    => $percent,
                ];
            }
            return json_encode($dist);
        }

        // 2. Existing JSON string passed directly
        $existing = $request->input('prize_distribution');
        if ($existing && $existing !== '[]') {
            $decoded = json_decode($existing, true);
            if (json_last_error() === JSON_ERROR_NONE && !empty($decoded)) {
                return json_encode($decoded);
            }
        }

        // 3. Auto-generate based on category
        if ($category === 'equal') {
            return json_encode([[
                'label'      => "Rank 1 to {$totalWinners}",
                'rank_start' => 1,
                'rank_end'   => $totalWinners,
                'winners'    => $totalWinners,
                'per_winner' => $totalWinners > 0 ? round($prizePool / $totalWinners, 2) : 0,
                'prize'      => $prizePool,
                'percent'    => 100,
            ]]);
        }

        if (in_array($category, ['mega', 'guaranteed', 'practice'])) {
            return json_encode($this->generateDefaultPrizeDistribution($totalWinners, $prizePool));
        }

        return json_encode([]);
    }

    private function saveRankDetails(int $contestId, string $prizeDistJson): void
    {
        $ranks = json_decode($prizeDistJson, true);
        if (!is_array($ranks)) return;

        foreach ($ranks as $row) {
            \App\Models\ContestRankDetail::create([
                'contest_id' => $contestId,
                'rank_start' => intval($row['rank_start'] ?? 1),
                'rank_end'   => intval($row['rank_end'] ?? 1),
                'percent'    => floatval($row['percent'] ?? 0),
                'prize'      => floatval($row['prize'] ?? 0),
                'winners'    => intval($row['winners'] ?? 1),
            ]);
        }
    }

    private function updateRankings(int $contestId): void
    {
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->orderBy('created_at', 'asc')
            ->get();

        $rank = 1;
        foreach ($entries as $entry) {
            DB::table('contest_entries')->where('id', $entry->id)->update(['rank' => $rank++]);
        }
    }

    private function generateDefaultPrizeDistribution(int $totalWinners, float $prizePool): array
    {
        if ($totalWinners <= 0) return [];

        $tables = [
            10   => [[1,1,30],[2,2,18],[3,3,11],[4,5,13.5],[6,10,27.5]],
            25   => [[1,1,24],[2,2,14],[3,3,9],[4,5,12.375],[6,10,18.125],[11,25,22.5]],
            50   => [[1,1,23],[2,2,13],[3,3,9],[4,5,8.1],[6,10,15],[11,25,16.4],[26,50,15.5]],
            100  => [[1,1,18],[2,2,10],[3,3,8],[4,5,6.576],[6,10,10],[11,25,15.4],[26,50,16.524],[51,100,15.5]],
            250  => [[1,1,14],[2,2,9],[3,3,7],[4,5,5.169],[6,10,8.602],[11,25,13.323],[26,50,13.031],[51,100,13.375],[101,250,16.5]],
            500  => [[1,1,14],[2,2,9],[3,3,7],[4,5,3.1],[6,10,6.628],[11,25,10.576],[26,50,10.102],[51,100,12.469],[101,250,13.625],[251,500,13.5]],
            1000 => [[1,1,12],[2,2,8],[3,3,5],[4,5,2.399],[6,10,4.931],[11,25,9.11],[26,50,8.813],[51,100,10.418],[101,250,11.891],[251,500,12.188],[501,1000,15.25]],
            2500 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.8],[6,10,3.5],[11,25,7.386],[26,50,7.229],[51,100,8.972],[101,250,10.629],[251,500,11.172],[501,1000,12.562],[1001,2500,14.75]],
            5000 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.75],[6,10,3],[11,25,5.314],[26,50,5.355],[51,100,7.14],[101,250,8.853],[251,500,9.471],[501,1000,10.961],[1001,2500,12.281],[2501,5000,13.875]],
            10000 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.6],[6,10,2.049],[11,25,4.283],[26,50,4.31],[51,100,5.08],[101,500,8.774],[501,1000,10.365],[1001,2500,12.82],[2501,5000,12.094],[5001,10000,16.625]],
            25000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.4],[6,10,1.7],[11,25,3.164],[26,50,3.422],[51,100,4.229],[101,500,6.262],[501,1000,7.339],[1001,5000,12.172],[5001,10000,12.562],[10001,25000,29.25]],
            50000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.2],[6,10,1.7],[11,25,2.903],[26,50,3.043],[51,100,3.89],[101,500,6.187],[501,1000,6.916],[1001,5000,8.555],[5001,10000,10],[10001,25000,17.431],[25001,50000,19.675]],
            100000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.052],[6,10,1.502],[11,25,2.737],[26,50,2.65],[51,100,3.533],[101,500,5.377],[501,1000,5.1],[1001,5000,7.893],[5001,10000,8.45],[10001,25000,11.031],[25001,50000,12.375],[50001,100000,19.8]],
            250000 => [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.076],[6,10,1.8],[11,25,2.53],[26,50,2.507],[51,100,3.11],[101,500,5],[501,1000,6],[1001,5000,7.075],[5001,10000,7.766],[10001,25000,8.355],[25001,100000,13.281],[100001,250000,26]],
            500000 => [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.005],[6,10,1.673],[11,25,2.831],[26,50,2.375],[51,100,2.9],[101,500,4.6],[501,1000,5.6],[1001,5000,6.788],[5001,10000,7.532],[10001,25000,7.734],[25001,100000,9.312],[100001,250000,12.75],[250001,500000,19.4]],
            1000000 => [[1,1,5.5],[2,2,4.2],[3,3,3.5],[4,5,0.941],[6,10,1.621],[11,25,2.194],[26,50,2.159],[51,100,2.812],[101,500,4.538],[501,1000,5.2],[1001,5000,6.555],[5001,10000,7.407],[10001,25000,7.709],[25001,100000,8.945],[100001,250000,11.594],[250001,500000,13.125],[500001,1000000,12]],
        ];

        // Find closest key
        $keys = array_keys($tables);
        sort($keys);
        $chosenKey = $keys[0];
        foreach ($keys as $k) {
            if ($k <= $totalWinners) $chosenKey = $k;
        }

        $tiers = $tables[$chosenKey];
        $dist  = [];

        foreach ($tiers as $idx => [$s, $e, $pct]) {
            if ($s > $totalWinners) break;
            $isLast = ($idx === count($tiers) - 1);
            $end    = $isLast ? $totalWinners : min($e, $totalWinners);
            if ($end < $s) break;

            $cnt     = $end - $s + 1;
            $prize   = round($prizePool * $pct / 100, 2);
            $perWin  = $cnt > 0 ? round($prize / $cnt, 2) : 0;

            $dist[] = [
                'label'      => "Rank {$s} to {$end}",
                'rank_start' => $s,
                'rank_end'   => $end,
                'winners'    => $cnt,
                'per_winner' => $perWin,
                'prize'      => $prize,
                'percent'    => $pct,
            ];

            if ($end >= $totalWinners) break;
        }

        // Extra winners beyond table
        $lastDist = end($dist);
        if ($lastDist && $lastDist['rank_end'] < $totalWinners) {
            $es  = $lastDist['rank_end'] + 1;
            $ee  = $totalWinners;
            $ec  = $ee - $es + 1;
            $lp  = end($tiers)[2];
            $ep  = round($prizePool * $lp / 100, 2);
            $epw = $ec > 0 ? round($ep / $ec, 2) : 0;
            $dist[] = [
                'label'      => "Rank {$es} to {$ee}",
                'rank_start' => $es,
                'rank_end'   => $ee,
                'winners'    => $ec,
                'per_winner' => $epw,
                'prize'      => $ep,
                'percent'    => $lp,
            ];
        }

        return $dist;
    }
}
