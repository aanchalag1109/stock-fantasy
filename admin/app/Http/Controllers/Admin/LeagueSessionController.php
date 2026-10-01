<?php
namespace App\Http\Controllers\Admin;

use App\Models\LeagueSession;
use App\Models\Contest;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Http;

class LeagueSessionController extends Controller
{
    public function index(Request $request)
    {
        // Auto-update session statuses
        $this->updateSessionStatuses();
        
        $status = $request->get('status');
        $sessions = LeagueSession::when($status, function($q) use ($status) {
            return $q->where('status', $status);
        })->paginate(8);
        return view('admin.league_sessions.index', compact('sessions', 'status'));
    }
    
    private function updateSessionStatuses()
    {
        $now = now('Asia/Kolkata');

        // 'completing' wali sessions ko skip karo — master cron handle kar raha hai
        $sessionsToLive = LeagueSession::where('status', 'upcoming')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>', $now)
            ->get();

        foreach ($sessionsToLive as $session) {
            // Atomic update
            $updated = \DB::table('league_sessions')
                ->where('id', $session->id)
                ->where('status', 'upcoming')
                ->update(['status' => 'live']);

            if (!$updated) continue;

            $this->saveSessionAssetStartPrices($session);
            $this->startContestsForSession($session->id);
        }

        // 'completing' wali sessions ko touch mat karo
        LeagueSession::where('status', 'live')
            ->where('end_time', '<=', $now)
            ->update(['status' => 'completed']);
    }

    public function create()
    {
        $templates = \App\Models\LeagueSessionTemplate::where('active', true)->get();
        return view('admin.league_sessions.create', compact('templates'));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'market_type' => 'required|string',
            'max_stocks' => 'required|integer',
            'user_joining_start_time' => 'nullable|date',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
            'status' => 'required|in:upcoming,live,completed,draft',
            'active' => 'required|boolean',
            'session_image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:2048'
        ]);

        // Handle image upload
        if ($request->hasFile('session_image')) {
            $image = $request->file('session_image');
            $imageName = time() . '_' . $image->getClientOriginalName();
            $image->move(public_path('uploads/sessions'), $imageName);
            $data['image_url'] = 'uploads/sessions/' . $imageName;
        } elseif ($request->filled('existing_image')) {
            // Use existing image from template
            $data['image_url'] = $request->input('existing_image');
        }

        $session = LeagueSession::create($data);

        // Save assets for each category first
        $stocks = $request->input('stocks', []);
        $cryptos = $request->input('cryptos', []);
        
        foreach ($stocks as $categoryId => $assets) {
            foreach ($assets as $asset) {
                \DB::table('league_session_assets')->insert([
                    'league_session_id' => $session->id,
                    'category_id' => $categoryId,
                    'asset_symbol' => $asset,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
        }
        
        foreach ($cryptos as $categoryId => $assets) {
            foreach ($assets as $asset) {
                \DB::table('league_session_assets')->insert([
                    'league_session_id' => $session->id,
                    'category_id' => $categoryId,
                    'asset_symbol' => $asset,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
        }

        // Save as template if requested (after assets are saved)
        if ($request->has('save_as_template') && $request->filled('template_name')) {
            $templateAssets = \DB::table('league_session_assets')
                ->leftJoin('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
                ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
                ->where('league_session_assets.league_session_id', $session->id)
                ->select(
                    'league_session_assets.asset_symbol',
                    'assets.name as asset_name',
                    'market_type_categories.name as category_name',
                    'market_type_categories.id as category_id'
                )
                ->get()
                ->groupBy('category_name');
            
            \App\Models\LeagueSessionTemplate::create([
                'name' => $data['name'],
                'template_name' => $request->input('template_name'),
                'market_type' => $data['market_type'],
                'max_stocks' => $data['max_stocks'],
                'user_joining_start_time' => $data['user_joining_start_time'] ?? null,
                'start_time' => $data['start_time'],
                'end_time' => $data['end_time'],
                'status' => $data['status'],
                'active' => $data['active'],
                'image_url' => $data['image_url'] ?? null,
                'assets_data' => $templateAssets->toArray()
            ]);
        }

        return redirect()->route('admin.league_sessions.index')->with('success', 'Session created successfully.');
    }

    public function show(LeagueSession $leagueSession)
    {
        // Get related contests
        $contests = \App\Models\Contest::where('league_session_id', $leagueSession->id)->get();
        $contestsCount = $contests->count();
        
        // Get total participants from all contests
        $totalParticipants = $contests->sum('participants');
        
        // Get unique assets
        $uniqueAssets = \DB::table('league_session_assets')
            ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
            ->where('league_session_assets.league_session_id', $leagueSession->id)
            ->select('league_session_assets.asset_symbol', 'assets.name as asset_name')
            ->distinct()
            ->orderBy('league_session_assets.asset_symbol')
            ->get();
        
        return view('admin.league_sessions.show', compact(
            'leagueSession', 
            'contests', 
            'contestsCount', 
            'totalParticipants',
            'uniqueAssets'
        ));
    }

    public function edit(LeagueSession $leagueSession)
    {
        // Completed sessions are read-only
        if ($leagueSession->status === 'completed') {
            return redirect()->route('admin.league_sessions.show', $leagueSession);
        }
        return view('admin.league_sessions.edit', compact('leagueSession'));
    }

    public function update(Request $request, LeagueSession $leagueSession)
    {
        // Prevent editing completed sessions
        if ($leagueSession->status === 'completed') {
            return redirect()->back()->with('error', 'Cannot edit completed sessions.');
        }

        // Status-based validation rules
        $rules = [
            'name' => 'required|string|max:255',
            'market_type' => 'required|string',
            'max_stocks' => 'required|integer',
            'status' => 'required|in:upcoming,live,completed,draft',
            'active' => 'required|boolean',
        ];

        // For upcoming sessions, allow time changes
        if ($leagueSession->status === 'upcoming') {
            $rules['user_joining_start_time'] = 'nullable|date';
            $rules['start_time'] = 'required|date';
            $rules['end_time'] = 'required|date|after:start_time';
        } else {
            // For live sessions, only allow deactivation
            $rules['user_joining_start_time'] = 'nullable|date';
            $rules['start_time'] = 'required|date';
            $rules['end_time'] = 'required|date|after:start_time';
        }

        $data = $request->validate($rules);

        // Handle live session deactivation with refund
        if ($leagueSession->status === 'live' && $request->active == 0) {
            $this->refundUsers($leagueSession->id);
        }

        $leagueSession->update($data);

        // Delete existing assets
        \DB::table('league_session_assets')->where('league_session_id', $leagueSession->id)->delete();

        // Save new assets for each category
        $stocks = $request->input('stocks', []);
        $cryptos = $request->input('cryptos', []);
        
        foreach ($stocks as $categoryId => $assets) {
            foreach ($assets as $asset) {
                \DB::table('league_session_assets')->insert([
                    'league_session_id' => $leagueSession->id,
                    'category_id' => $categoryId,
                    'asset_symbol' => $asset,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
        }
        
        foreach ($cryptos as $categoryId => $assets) {
            foreach ($assets as $asset) {
                \DB::table('league_session_assets')->insert([
                    'league_session_id' => $leagueSession->id,
                    'category_id' => $categoryId,
                    'asset_symbol' => $asset,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
        }

        return redirect()->route('admin.league_sessions.index')->with('success', 'Session updated successfully.');
    }

    private function refundUsers($id)
    {
        // Get all entries for this session via contests
        $entries = \DB::table('contest_entries')
            ->join('contests', 'contest_entries.contest_id', '=', 'contests.id')
            ->where('contests.league_session_id', $id)
            ->select('contest_entries.*')
            ->get();
        
        foreach ($entries as $entry) {
            // Refund coins to user
            \DB::table('users')
                ->where('id', $entry->user_id)
                ->increment('coins', $entry->entry_fee);
            
            // Log the refund transaction
            \DB::table('transactions')->insert([
                'user_id' => $entry->user_id,
                'type' => 'refund',
                'amount' => $entry->entry_fee,
                'description' => 'Refund for cancelled session: ' . $id,
                'created_at' => now(),
                'updated_at' => now()
            ]);
        }
    }

    public function destroy(LeagueSession $leagueSession)
    {
        // Prevent deletion of active live sessions only
        if ($leagueSession->status === 'live' && $leagueSession->active) {
            return redirect()->back()->with('error', 'Cannot delete active live sessions. Deactivate first.');
        }
        
        $leagueSession->delete();
        return redirect()->route('admin.league_sessions.index')->with('success', 'Session deleted successfully.');
    }
    
    public function bulkDelete(Request $request)
    {
        $request->validate([
            'session_ids' => 'required|array|min:1',
            'session_ids.*' => 'integer|exists:league_sessions,id'
        ]);
        
        $deleted = 0;
        foreach ($request->session_ids as $id) {
            $session = LeagueSession::find($id);
            if ($session && !($session->status === 'live' && $session->active)) {
                $session->delete();
                $deleted++;
            }
        }
        
        return redirect()->back()->with('success', "Deleted {$deleted} sessions successfully.");
    }
    
    public function updateStatus()
    {
        $now = now('Asia/Kolkata');
        
        // Get all sessions for debugging
        $allSessions = LeagueSession::select('id', 'name', 'status', 'start_time', 'end_time')->get();
        
        $updated = LeagueSession::where('status', 'upcoming')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>', $now)
            ->update(['status' => 'live']);
            
        $completed = LeagueSession::where('status', 'live')
            ->where('end_time', '<=', $now)
            ->update(['status' => 'completed']);
            
        return response()->json([
            'success' => true, 
            'updated_to_live' => $updated, 
            'updated_to_completed' => $completed,
            'current_time' => $now->format('Y-m-d H:i:s'),
            'all_sessions' => $allSessions->map(function($s) use ($now) {
                return [
                    'id' => $s->id,
                    'name' => $s->name,
                    'status' => $s->status,
                    'start_time' => $s->start_time,
                    'end_time' => $s->end_time,
                    'should_be_live' => $s->status == 'upcoming' && $s->start_time <= $now && $s->end_time > $now,
                    'should_be_completed' => $s->status == 'live' && $s->end_time <= $now
                ];
            })
        ]);
    }
    
    public function testUpdate()
    {
        $session = LeagueSession::where('status', 'upcoming')->first();
        if ($session) {
            $session->status = 'live';
            $session->save();
            return response()->json(['success' => true, 'message' => 'Updated session: ' . $session->name]);
        }
        return response()->json(['success' => false, 'message' => 'No upcoming sessions found']);
    }
    
    public function fixYears()
    {
        $sessions = LeagueSession::whereYear('start_time', '>', 2024)->get();
        $fixed = 0;
        foreach ($sessions as $session) {
            $session->start_time = str_replace('2025', '2024', $session->start_time);
            $session->end_time = str_replace('2025', '2024', $session->end_time);
            $session->save();
            $fixed++;
        }
        $this->updateSessionStatuses();
        return response()->json(['success' => true, 'fixed_sessions' => $fixed, 'message' => 'Fixed ' . $fixed . ' sessions']);
    }
    
    public function getTemplate($id)
    {
        $template = \App\Models\LeagueSessionTemplate::findOrFail($id);
        return response()->json($template);
    }
    
    public function getSessionAssets($id)
    {
        $assets = \DB::table('league_session_assets')
            ->leftJoin('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
            ->where('league_session_assets.league_session_id', $id)
            ->select(
                'league_session_assets.asset_symbol',
                'league_session_assets.category_id',
                'market_type_categories.name as category_name'
            )
            ->get();
            
        return response()->json([
            'assets' => $assets
        ]);
    }

    private function startContestsForSession($id)
    {
        // Get all upcoming contests for this session
        $contests = Contest::where('league_session_id', $id)
            ->where('status', 'upcoming')
            ->get();

        foreach ($contests as $contest) {
            $contest->update(['status' => 'live']);
        }
    }

    public function saveSessionAssetStartPrices($session)
    {
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $session->id)
            ->distinct()
            ->pluck('asset_symbol')
            ->toArray();

        $marketType = $session->market_type ?? 'stock';

        $alreadySaved = \DB::table('session_asset_prices')
            ->where('league_session_id', $session->id)
            ->whereNotNull('start_price')
            ->pluck('asset_symbol')
            ->toArray();

        $toFetch = array_values(array_diff($assets, $alreadySaved));
        if (empty($toFetch)) return;

        $prices = $marketType === 'crypto'
            ? $this->getCryptoPricesBatch($toFetch)
            : $this->getStockPricesOneByOne($toFetch);

        foreach ($toFetch as $symbol) {
            $price = $prices[$symbol] ?? 0;
            \DB::table('session_asset_prices')->updateOrInsert(
                ['league_session_id' => $session->id, 'asset_symbol' => $symbol],
                ['start_price' => $price > 0 ? $price : null, 'start_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
            );
            if ($price <= 0) \Log::warning("Start price fetch failed for {$symbol}");
        }
    }

    public function saveSessionAssetEndPrices($session)
    {
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $session->id)
            ->distinct()
            ->pluck('asset_symbol')
            ->toArray();

        $marketType = $session->market_type ?? 'stock';

        $prices = $marketType === 'crypto'
            ? $this->getCryptoPricesBatch($assets)
            : $this->getStockPricesOneByOne($assets);

        foreach ($assets as $symbol) {
            try {
                $price = $prices[$symbol] ?? 0;
                if ($price > 0) {
                    \DB::table('session_asset_prices')->updateOrInsert(
                        ['league_session_id' => $session->id, 'asset_symbol' => $symbol],
                        ['end_price' => $price, 'end_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
                    );
                } else {
                    \Log::warning("End price not available for {$symbol}, skipping update.");
                }
            } catch (\Exception $e) {
                \Log::error("Error saving end price for {$symbol}: " . $e->getMessage());
            }
        }
    }

    private function getCurrentPrice($symbol, $marketType)
    {
        try {
            return $marketType === 'crypto'
                ? $this->getCryptoPrice($symbol)
                : $this->getStockPrice($symbol);
        } catch (\Exception $e) {
            \Log::error("Price fetch failed for {$symbol}: " . $e->getMessage());
            return 0;
        }
    }

    // Fetch stocks one by one with delay — returns ['SYMBOL' => price]
    private function getStockPricesOneByOne(array $symbols): array
    {
        $prices  = [];
        $failed  = [];

        foreach ($symbols as $symbol) {
            $price = $this->getStockPrice($symbol);
            usleep(1000000); // 1s — RapidAPI 1 req/sec

            if ($price > 0) {
                $prices[$symbol] = $price;
            } else {
                $failed[] = $symbol; // retry baad mein
            }
        }

        // Retry failed symbols once — 2s wait pehle
        if (!empty($failed)) {
            \Log::warning('Retrying ' . count($failed) . ' failed symbols: ' . implode(', ', $failed));
            sleep(2);
            foreach ($failed as $symbol) {
                $price = $this->getStockPrice($symbol);
                usleep(1000000);
                $prices[$symbol] = $price > 0 ? $price : 0;
                if ($price <= 0) \Log::error("Retry also failed for {$symbol}");
            }
        }

        return $prices;
    }

    // Fetch all crypto prices in ONE API call — returns ['SYMBOL' => price]
    private function getCryptoPricesBatch(array $symbols): array
    {
        $prices = array_fill_keys($symbols, 0);
        try {
            $cleanSymbols = array_map(fn($s) => str_replace('-USD', '', $s), $symbols);
            $response = Http::timeout(10)->withHeaders([
                'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
            ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
                'symbol' => implode(',', $cleanSymbols)
            ]);
            if ($response->successful()) {
                $data = $response->json()['data'] ?? [];
                foreach ($symbols as $symbol) {
                    $clean = str_replace('-USD', '', $symbol);
                    $prices[$symbol] = $data[$clean]['quote']['USD']['price'] ?? 0;
                }
            }
        } catch (\Exception $e) {
            \Log::error('Crypto batch fetch failed: ' . $e->getMessage());
        }
        return $prices;
    }

    private function getCryptoPrice($symbol)
    {
        $response = Http::timeout(5)->withHeaders([
            'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
        ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
            'symbol' => str_replace('-USD', '', $symbol)
        ]);

        if ($response->successful()) {
            $data = $response->json();
            $cleanSymbol = str_replace('-USD', '', $symbol);
            return $data['data'][$cleanSymbol]['quote']['USD']['price'] ?? 0;
        }
        return 0;
    }

    private function getStockPrice($symbol)
    {
        $attempt = 0;
        $maxAttempts = 2; // Reduced attempts but increased timeout
        $waitSeconds = [0, 2];

        while ($attempt < $maxAttempts) {
            if ($waitSeconds[$attempt] > 0) sleep($waitSeconds[$attempt]);

            try {
                $response = Http::timeout(30)->withHeaders([ // Increased to 30s
                    'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                    'x-rapidapi-key'  => config('services.rapidapi.key', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
                ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                    'tradingSymbol' => $symbol,
                    'exchange'      => 'NSE'
                ]);

                if ($response->successful()) {
                    $data  = $response->json();
                    $price = $data['lastPrice'] ?? $data['data']['lastPrice'] ?? 0;
                    if ($price > 0) return $price;
                }
            } catch (\Exception $e) {
                \Log::warning("RapidAPI Timeout/Error for {$symbol} on attempt " . ($attempt + 1) . ": " . $e->getMessage());
            }

            $attempt++;
        }

        return 0;
    }

    /**
     * Refetch missing prices for a completed session
     * Called from admin panel when some assets have null prices
     */
    public function refetchMissingPrices(Request $request, $id)
    {
        try {
            $session = LeagueSession::findOrFail($id);
            $marketType = $session->market_type ?? 'stock';

            // Find assets with null start_price OR no row at all
            $allAssets = \DB::table('league_session_assets')
                ->where('league_session_id', $id)
                ->pluck('asset_symbol');

            $fetched = 0;
            $failed  = [];

            foreach ($allAssets as $symbol) {
                $existing = \DB::table('session_asset_prices')
                    ->where('league_session_id', $id)
                    ->where('asset_symbol', $symbol)
                    ->first();

                $needsStart = !$existing || is_null($existing->start_price);
                $needsEnd   = !$existing || is_null($existing->end_price);

                if (!$needsStart && !$needsEnd) continue;

                usleep(500000);
                $price = $this->getCurrentPrice($symbol, $marketType);

                if ($price <= 0) {
                    $failed[] = $symbol;
                    continue;
                }

                $update = ['updated_at' => now()];
                if ($needsStart) {
                    $update['start_price'] = $price;
                    $update['start_price_fetched_at'] = now();
                }
                if ($needsEnd) {
                    $update['end_price'] = $price;
                    $update['end_price_fetched_at'] = now();
                }

                \DB::table('session_asset_prices')->updateOrInsert(
                    ['league_session_id' => $id, 'asset_symbol' => $symbol],
                    array_merge($update, ['created_at' => now()])
                );
                $fetched++;
            }

            return response()->json([
                'success' => true,
                'fetched' => $fetched,
                'failed'  => $failed,
                'message' => "Fetched {$fetched} missing prices" . (count($failed) ? ". Failed: " . implode(', ', $failed) : ''),
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}

