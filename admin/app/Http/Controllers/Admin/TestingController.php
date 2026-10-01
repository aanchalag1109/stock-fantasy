<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class TestingController extends Controller
{
    public function index()
    {
        $upcomingSessions = \App\Models\LeagueSession::where('status', 'upcoming')
            ->orderBy('start_time', 'asc')
            ->get();
        
        return view('admin.testing.my_game', compact('upcomingSessions'));
    }
    
    public function testUsers()
    {
        $users = \App\Models\User::where('is_test_user', 1)->orderBy('name', 'asc')->paginate(20);
        return view('admin.testing.test_users', compact('users'));
    }
    
    public function generateTestUsers()
    {
        $namesFile = public_path('names.txt');
        $names = file_exists($namesFile) ? file($namesFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
        
        if (empty($names)) {
            return redirect()->route('admin.testing.test-users')->with('error', 'Names file not found in public folder');
        }
        
        shuffle($names);
        
        $lastUser = \App\Models\User::where('is_test_user', 1)
            ->where('mobile', 'LIKE', '00000%')
            ->orderBy('mobile', 'desc')
            ->first();
        
        $startNumber = 1;
        if ($lastUser) {
            $startNumber = intval($lastUser->mobile) + 1;
        }
        
        $created = 0;
        $nameCount = count($names);
        
        for ($i = 0; $i < 100 && $i < $nameCount; $i++) {
            $number = $startNumber + $i;
            $mobile = str_pad($number, 10, '0', STR_PAD_LEFT);
            
            \App\Models\User::create([
                'name' => $names[$i],
                'mobile' => $mobile,
                'email' => 'p' . $number . '@gmail.com',
                'password' => bcrypt('password'),
                'deposit_balance' => 0,
                'winnings_balance' => 0,
                'is_test_user' => 1
            ]);
            $created++;
        }
        
        return redirect()->route('admin.testing.test-users')->with('success', "$created test users generated successfully!");
    }
    
    public function bulkDeleteTestUsers(Request $request)
    {
        $ids = $request->input('ids', []);
        
        if (empty($ids)) {
            return response()->json(['success' => false, 'message' => 'No users selected']);
        }
        
        \DB::beginTransaction();
        try {
            // Delete contest entries first
            \DB::table('contest_entries')->whereIn('user_id', $ids)->delete();
            
            // Delete baskets
            \DB::table('saved_baskets')->whereIn('user_id', $ids)->delete();
            
            // Delete users
            $deleted = \App\Models\User::whereIn('id', $ids)->where('is_test_user', 1)->delete();
            
            \DB::commit();
            return response()->json(['success' => true, 'message' => "$deleted test user(s) deleted successfully"]);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
        }
    }
    
    public function showCreateBasket(Request $request)
    {
        $contestId = $request->query('contest');
        $sessionId = $request->query('session');
        $session = \App\Models\LeagueSession::find($sessionId);
        $maxStocks = $session ? $session->max_stocks : 10;
        $firstTestUser = \App\Models\User::where('is_test_user', 1)->first();
        $defaultUserId = $firstTestUser ? $firstTestUser->id : 1;
        
        return view('admin.testing.create_basket', compact('contestId', 'sessionId', 'maxStocks', 'defaultUserId'));
    }
    
    public function getAvailableUsers(Request $request)
    {
        $contestId = $request->query('contest');
        $users = \App\Models\User::where('is_test_user', 1)
            ->whereNotIn('id', function($query) use ($contestId) {
                $query->select('user_id')->from('contest_entries')->where('contest_id', $contestId);
            })
            ->orderBy('name')
            ->get(['id', 'name', 'mobile']);
        return response()->json($users);
    }
    
    public function contestDetail($contestId)
    {
        $contest = \App\Models\Contest::with('leagueSession')->findOrFail($contestId);
        
        // Get test users who haven't joined this contest
        $availableUsers = \App\Models\User::where('is_test_user', 1)
            ->whereNotIn('id', function($query) use ($contestId) {
                $query->select('user_id')
                    ->from('contest_entries')
                    ->where('contest_id', $contestId);
            })
            ->inRandomOrder()
            ->get();
        
        // Get available baskets for this session
        $availableBaskets = \DB::table('saved_baskets')
            ->join('users', 'saved_baskets.user_id', '=', 'users.id')
            ->where('saved_baskets.session_id', $contest->league_session_id)
            ->where('users.is_test_user', 1)
            ->whereNotIn('saved_baskets.id', function($query) use ($contestId) {
                $query->select('basket_id')
                    ->from('contest_entries')
                    ->where('contest_id', $contestId)
                    ->whereNotNull('basket_id');
            })
            ->select('saved_baskets.id', 'saved_baskets.serial_no', 'saved_baskets.assets', 'saved_baskets.created_at', 'users.name as user_name')
            ->orderBy('saved_baskets.created_at', 'desc')
            ->get();
        
        $entries = \DB::table('contest_entries')
            ->join('users', 'contest_entries.user_id', '=', 'users.id')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->leftJoin('users as basket_users', 'saved_baskets.user_id', '=', 'basket_users.id')
            ->where('contest_entries.contest_id', $contestId)
            ->select('contest_entries.*', 'users.name as user_name', 'users.mobile', 'saved_baskets.serial_no', 'saved_baskets.assets', 'basket_users.name as basket_owner')
            ->orderBy('contest_entries.created_at', 'desc')
            ->get();
        
        \Log::info('Contest detail loaded', ['contest_id' => $contestId, 'entries_count' => $entries->count()]);
        
        return view('admin.testing.contest_detail', compact('contest', 'entries', 'availableUsers', 'availableBaskets'));
    }
    
    public function sessionContests($sessionId)
    {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        
        $contests = \DB::table('contests')
            ->where('league_session_id', $sessionId)
            ->select('id', 'category', 'entry_fee', 'participants', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();
            
        return view('admin.testing.session-contests', compact('session', 'contests'));
    }
    
    public function viewUser($userId)
    {
        $user = \DB::table('users')
            ->where('id', $userId)
            ->first();
            
        if (!$user) {
            return redirect()->route('admin.testing.index')->with('error', 'User not found');
        }
        
        $upcomingSessions = \DB::table('league_sessions')
            ->where('status', 'upcoming')
            ->select('id', 'name', 'start_time', 'end_time', 'status')
            ->orderBy('start_time', 'asc')
            ->get();
        
        return view('admin.testing.user-detail', compact('user', 'upcomingSessions'));
    }
    
    public function userSessionContests($userId, $sessionId)
    {
        $user = \DB::table('users')->where('id', $userId)->first();
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        
        $contests = \DB::table('contests')
            ->where('league_session_id', $sessionId)
            ->select('id', 'category', 'entry_fee', 'participants', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();
            
        $baskets = \DB::table('saved_baskets')
            ->where('user_id', $userId)
            ->where('session_id', $sessionId)
            ->select('id', 'contest_id', 'assets', 'multipliers', 'total_score', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();
            
        return view('admin.testing.user-session-contests', compact('user', 'session', 'contests', 'baskets'));
    }
    
    public function createBasket(Request $request)
    {
        $data = $request->validate([
            'user_id' => 'required|integer',
            'contest_id' => 'required|integer',
            'session_id' => 'required|integer',
            'assets' => 'required|string',
            'multipliers' => 'required|string'
        ]);
        
        $basketId = \DB::table('saved_baskets')->insertGetId([
            'user_id' => $data['user_id'],
            'contest_id' => $data['contest_id'],
            'session_id' => $data['session_id'],
            'assets' => $data['assets'],
            'multipliers' => $data['multipliers'],
            'total_score' => 0,
            'is_standalone' => 0,
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        return response()->json(['success' => true, 'message' => 'Basket created successfully', 'basket_id' => $basketId]);
    }
    
    public function deleteBasket($basketId)
    {
        \DB::table('saved_baskets')->where('id', $basketId)->delete();
        return response()->json(['success' => true, 'message' => 'Basket deleted successfully']);
    }
    
    public function getBaskets($userId, $sessionId)
    {
        $baskets = \DB::table('saved_baskets')
            ->where('user_id', $userId)
            ->where('session_id', $sessionId)
            ->select('id', 'contest_id', 'assets', 'multipliers', 'total_score', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();
            
        return response()->json($baskets);
    }
    
    public function testApi(Request $request)
    {
        $endpoint = $request->input('endpoint');
        $method = $request->input('method', 'GET');
        $data = $request->input('data', []);
        
        try {
            $response = [];
            
            switch($endpoint) {
                case 'flexible-pricing':
                    $response = $this->testFlexiblePricing($data);
                    break;
                case 'live-prices':
                    $response = $this->testLivePrices();
                    break;
                case 'contest-stats':
                    $contestId = $data['contest_id'] ?? 1;
                    $response = $this->testContestStats($contestId);
                    break;
                default:
                    $response = ['error' => 'Unknown endpoint'];
            }
            
            return response()->json($response);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
    
    private function testFlexiblePricing($data)
    {
        $participants = $data['participants'] ?? 100;
        $entryFee = $data['entry_fee'] ?? 10;
        $platformFee = $data['platform_fee'] ?? 10;
        $winningPercentage = $data['winning_percentage'] ?? 30;
        
        $response = \Http::post(url('/api/flexible-pricing'), [
            'participants' => $participants,
            'entry_fee' => $entryFee,
            'platform_fee' => $platformFee,
            'winning_percentage' => $winningPercentage
        ]);
        
        return $response->json();
    }
    
    private function testLivePrices()
    {
        return [
            'BTC-USD' => rand(80000, 100000),
            'ETH-USD' => rand(2500, 3500),
            'RELIANCE' => rand(2200, 2800),
            'TCS' => rand(2800, 3200)
        ];
    }
    
    public function bulkJoinContest(Request $request)
    {
        $userIds = $request->input('user_ids', []);
        $contestId = $request->input('contest_id');
        $sessionId = $request->input('session_id');
        
        \Log::info('Bulk join request', ['user_ids' => $userIds, 'contest_id' => $contestId, 'session_id' => $sessionId]);
        
        if (empty($userIds) || !$contestId || !$sessionId) {
            return response()->json(['success' => false, 'message' => 'Invalid parameters']);
        }
        
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['success' => false, 'message' => 'Contest not found']);
        }
        
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        $maxStocks = $session ? $session->max_stocks : 3;
        
        // Get all assets for this session
        $assets = \DB::table('league_session_assets')
            ->join('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
            ->where('league_session_assets.league_session_id', $sessionId)
            ->select('league_session_assets.asset_symbol as symbol', 'market_type_categories.name as category_name', 'league_session_assets.category_id')
            ->get();
        
        \Log::info('Assets query result', ['count' => $assets->count(), 'session_id' => $sessionId]);
        
        if ($assets->isEmpty()) {
            \Log::error('No assets found', ['session_id' => $sessionId]);
            return response()->json(['success' => false, 'message' => 'No assets found for session ' . $sessionId]);
        }
        
        $assets = $assets->groupBy('category_name');
        \Log::info('Assets grouped', ['categories' => $assets->keys()->toArray(), 'total' => $assets->flatten()->count()]);
        
        $joined = 0;
        
        \DB::beginTransaction();
        try {
            foreach ($userIds as $userId) {
                $selectedAssets = [];
                $allAvailableAssets = [];
                
                // Collect all assets from all categories
                foreach ($assets as $categoryName => $categoryAssets) {
                    foreach ($categoryAssets as $asset) {
                        $allAvailableAssets[] = [
                            'name' => $asset->symbol,
                            'symbol' => $asset->symbol,
                            'sector' => $categoryName,
                            'category_id' => $asset->category_id,
                        ];
                    }
                }
                
                // Ensure at least 1 asset from each category
                $categoriesUsed = [];
                foreach ($assets as $categoryName => $categoryAssets) {
                    $randomAsset = $categoryAssets->random();
                    $selectedAssets[] = [
                        'name' => $randomAsset->symbol,
                        'symbol' => $randomAsset->symbol,
                        'sector' => $categoryName,
                        'category_id' => $randomAsset->category_id,
                        'prediction' => rand(0, 1) ? 'UP' : 'DOWN'
                    ];
                    $categoriesUsed[] = $categoryName;
                }
                
                // Fill remaining slots to reach maxAssets
                while (count($selectedAssets) < $maxStocks && !empty($allAvailableAssets)) {
                    $randomIndex = array_rand($allAvailableAssets);
                    $randomAsset = $allAvailableAssets[$randomIndex];
                    
                    // Check if already selected
                    $alreadySelected = false;
                    foreach ($selectedAssets as $selected) {
                        if ($selected['name'] === $randomAsset['name']) {
                            $alreadySelected = true;
                            break;
                        }
                    }
                    
                    if (!$alreadySelected) {
                        $selectedAssets[] = [
                            'name' => $randomAsset['name'],
                            'symbol' => $randomAsset['symbol'],
                            'sector' => $randomAsset['sector'],
                            'category_id' => $randomAsset['category_id'],
                            'prediction' => rand(0, 1) ? 'UP' : 'DOWN'
                        ];
                    }
                    
                    unset($allAvailableAssets[$randomIndex]);
                    $allAvailableAssets = array_values($allAvailableAssets);
                }
                
                // If we have more than maxAssets, trim to exact count
                if (count($selectedAssets) > $maxStocks) {
                    shuffle($selectedAssets);
                    $selectedAssets = array_slice($selectedAssets, 0, $maxStocks);
                }
                
                // Random multipliers with validation: only 1 Alpha and 1 Beta
                $multipliers = [];
                $assetCount = count($selectedAssets);
                $alphaIndex = rand(0, $assetCount - 1);
                $betaIndex = ($alphaIndex + 1) % $assetCount;
                
                foreach ($selectedAssets as $index => $asset) {
                    $mult = 1;
                    if ($index === $alphaIndex) $mult = 2;
                    elseif ($index === $betaIndex) $mult = 1.5;
                    
                    $multipliers[] = [
                        'index' => $index,
                        'asset_name' => $asset['name'],
                        'multiplier' => $mult,
                        'prediction' => $asset['prediction'],
                        'selected' => true
                    ];
                }
                
                // Generate serial number
                $maxSerial = \DB::table('saved_baskets')
                    ->where('user_id', $userId)
                    ->where('session_id', $sessionId)
                    ->whereNotNull('serial_no')
                    ->max(\DB::raw('CAST(SUBSTRING(serial_no, 2) AS UNSIGNED)'));
                $serialNo = 'B' . (($maxSerial ?? 0) + 1);
                
                // Create basket
                $basketId = \DB::table('saved_baskets')->insertGetId([
                    'user_id' => $userId,
                    'contest_id' => null,
                    'session_id' => $sessionId,
                    'serial_no' => $serialNo,
                    'assets' => json_encode($selectedAssets),
                    'multipliers' => json_encode($multipliers),
                    'total_score' => 0,
                    'is_standalone' => 1,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
                
                // Join contest
                $entryId = \DB::table('contest_entries')->insertGetId([
                    'user_id' => $userId,
                    'contest_id' => $contestId,
                    'basket_id' => $basketId,
                    'session_id' => $sessionId,
                    'total_score' => 0,
                    'rank' => null,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
                
                \Log::info('Entry created', ['entry_id' => $entryId, 'user_id' => $userId, 'basket_id' => $basketId]);
                
                $joined++;
            }
            
            \DB::commit();
            \Log::info('Bulk join completed', ['joined' => $joined]);
            return response()->json(['success' => true, 'message' => 'Users joined successfully', 'joined' => $joined]);
        } catch (\Exception $e) {
            \DB::rollBack();
            \Log::error('Bulk join failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
        }
    }
    
    private function testContestStats($contestId)
    {
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return ['error' => 'Contest not found'];
        }
        
        $participants = \DB::table('contest_entries')->where('contest_id', $contestId)->count();
        
        return [
            'contest_id' => $contestId,
            'category' => $contest->category,
            'entry_fee' => $contest->entry_fee,
            'participants' => $participants,
            'total_pool' => $participants * $contest->entry_fee
        ];
    }
}
