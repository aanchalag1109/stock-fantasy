<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SavedBasket;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class SavedBasketController extends Controller
{
    public function index(Request $request)
    {
        $query = SavedBasket::with(['user', 'contest'])
                           ->orderBy('created_at', 'desc');
        
        // Apply filters
        if ($request->user_filter) {
            $query->whereHas('user', function($q) use ($request) {
                $q->where('name', 'like', '%' . $request->user_filter . '%');
            });
        }
        
        if ($request->contest_filter) {
            if ($request->contest_filter === 'standalone') {
                $query->whereNull('contest_id');
            } elseif ($request->contest_filter === 'contest') {
                $query->whereNotNull('contest_id');
            } elseif ($request->contest_filter === 'deletable') {
                $query->whereNotExists(function($q) {
                    $q->select(DB::raw(1))
                      ->from('contest_entries')
                      ->whereRaw('contest_entries.basket_id = saved_baskets.id');
                });
            }
        }
        
        // Show all or paginate
        if ($request->show_all) {
            $baskets = $query->get();
            $baskets->showAll = true;
        } else {
            $baskets = $query->paginate(15);
            $baskets->showAll = false;
        }

        return view('admin.saved_baskets.index', compact('baskets'));
    }

    public function show($id)
    {
        $basket = SavedBasket::with(['user'])->findOrFail($id);
        
        // Check if basket is used in any contest
        $contestEntries = DB::table('contest_entries')
            ->leftJoin('contests', 'contest_entries.contest_id', '=', 'contests.id')
            ->where('contest_entries.basket_id', $id)
            ->select('contest_entries.*', 'contests.category as contest_name')
            ->get();
        
        return view('admin.saved_baskets.show', compact('basket', 'contestEntries'));
    }

    public function bulkDelete(Request $request)
    {
        $basketIds = $request->input('basket_ids', []);
        
        if (empty($basketIds)) {
            return redirect()->route('admin.saved-baskets.index')
                            ->with('error', 'No baskets selected');
        }
        
        // Check if any baskets are used in contests
        $usedBaskets = DB::table('contest_entries')
            ->whereIn('basket_id', $basketIds)
            ->pluck('basket_id')
            ->toArray();
        
        if (!empty($usedBaskets)) {
            return redirect()->route('admin.saved-baskets.index')
                            ->with('error', 'Cannot delete baskets that are used in contests: ' . implode(', ', $usedBaskets));
        }
        
        $deleted = SavedBasket::whereIn('id', $basketIds)->delete();
        
        return redirect()->route('admin.saved-baskets.index')
                        ->with('success', "Successfully deleted {$deleted} baskets");
    }

    public function destroy($id)
    {
        $basket = SavedBasket::findOrFail($id);
        
        // Check if basket is used in any contest
        $usedInContest = DB::table('contest_entries')
            ->where('basket_id', $id)
            ->exists();
        
        if ($usedInContest) {
            return redirect()->route('admin.saved-baskets.index')
                            ->with('error', 'Cannot delete basket - it is used in contest entries');
        }
        
        $basket->delete();
        return redirect()->route('admin.saved-baskets.index')
                        ->with('success', 'Basket deleted successfully');
    }
}