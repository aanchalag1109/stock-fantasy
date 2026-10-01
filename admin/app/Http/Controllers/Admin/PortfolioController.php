<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;

use App\Models\Portfolio;
use App\Models\User;
use App\Models\Contest;
use Illuminate\Http\Request;

class PortfolioController extends Controller
{
    public function index() {
        $portfolios = Portfolio::with(['user', 'contest'])->get();
        return view('admin.portfolios.index', compact('portfolios'));
    }

    public function create() {
        $users = User::all();
        $contests = Contest::all();
        return view('admin.portfolios.create', compact('users', 'contests'));
    }

    public function store(Request $request) {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'contest_id' => 'required|exists:contests,id',
            'total_score' => 'numeric',
            'rank' => 'nullable|integer',
            'winnings' => 'numeric',
        ]);

        Portfolio::create($request->all());
        return redirect()->route('admin.portfolios.index')->with('success', 'Portfolio created successfully!');
    }

    public function edit($id) {
        $portfolio = Portfolio::findOrFail($id);
        $users = User::all();
        $contests = Contest::all();
        return view('admin.portfolios.edit', compact('portfolio', 'users', 'contests'));
    }

    public function update(Request $request, $id) {
        $portfolio = Portfolio::findOrFail($id);

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'contest_id' => 'required|exists:contests,id',
            'total_score' => 'numeric',
            'rank' => 'nullable|integer',
            'winnings' => 'numeric',
        ]);

        $portfolio->update($request->all());
        return redirect()->route('admin.portfolios.index')->with('success', 'Portfolio updated successfully!');
    }

    public function destroy($id) {
        Portfolio::destroy($id);
        return back()->with('success', 'Portfolio deleted!');
    }
}