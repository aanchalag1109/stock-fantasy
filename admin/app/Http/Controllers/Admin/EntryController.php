<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContestEntry;
use Illuminate\Http\Request;

class EntryController extends Controller
{
    public function index() {
        $entries = ContestEntry::with(['user', 'contest', 'basket'])
            ->orderBy('created_at', 'desc')
            ->paginate(50);
        return view('admin.entries.index', compact('entries'));
    }

    public function show($id) {
        $entry = ContestEntry::with(['user', 'contest', 'basket'])->findOrFail($id);
        return view('admin.entries.show', compact('entry'));
    }

    public function calculateScores() {
        $entries = ContestEntry::all();
        foreach ($entries as $entry) {
            $score = 0;
            if ($entry->current_price && $entry->buy_price) {
                $score = (($entry->current_price - $entry->buy_price) / $entry->buy_price) * 100;
            }
            $entry->update(['score' => $score]);
        }
        return back()->with('success', 'Scores calculated!');
    }
}