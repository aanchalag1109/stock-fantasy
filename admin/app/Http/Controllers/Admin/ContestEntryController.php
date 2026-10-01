<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class ContestEntryController extends Controller
{
    public function index(Request $request)
    {
        $contestId = $request->get('contest_id');
        
        $query = DB::table('contest_entries')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->leftJoin('contests', 'contest_entries.contest_id', '=', 'contests.id')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->select(
                'contest_entries.*',
                'users.name as user_name',
                'users.email as user_email',
                'contests.category as contest_name',
                'saved_baskets.assets',
                'saved_baskets.multipliers'
            );
        
        if ($contestId) {
            $query->where('contest_entries.contest_id', $contestId);
        }
        
        $entries = $query->orderBy('contest_entries.total_score', 'desc')
                        ->paginate(50);
        
        $contests = DB::table('contests')->select('id', 'category')->get();
        
        return view('admin.contest_entries.index', compact('entries', 'contests', 'contestId'));
    }

    public function show($id)
    {
        $entry = DB::table('contest_entries')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->leftJoin('contests', 'contest_entries.contest_id', '=', 'contests.id')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.id', $id)
            ->select(
                'contest_entries.*',
                'users.name as user_name',
                'users.email as user_email',
                'users.mobile as user_mobile',
                'contests.category as contest_name',
                'contests.start_time',
                'contests.end_time',
                'saved_baskets.assets',
                'saved_baskets.multipliers'
            )
            ->first();
        
        if (!$entry) {
            abort(404);
        }
        
        $entry->assets = json_decode($entry->assets, true);
        $entry->multipliers = json_decode($entry->multipliers, true);
        $entry->starting_prices = json_decode($entry->starting_prices, true);
        $entry->ending_prices = json_decode($entry->ending_prices, true);
        
        return view('admin.contest_entries.show', compact('entry'));
    }

    public function destroy($id)
    {
        DB::table('contest_entries')->where('id', $id)->delete();
        
        return redirect()->route('admin.contest-entries.index')
                        ->with('success', 'Contest entry deleted successfully');
    }
}
