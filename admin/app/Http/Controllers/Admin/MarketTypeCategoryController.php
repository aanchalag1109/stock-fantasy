<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MarketTypeCategory;
use Illuminate\Http\Request;

class MarketTypeCategoryController extends Controller
{
    public function index()
    {
        $categories = MarketTypeCategory::orderBy('created_at', 'desc')->get();
        return view('admin.market_type_categories.index', compact('categories'));
    }

    public function create()
    {
        return view('admin.market_type_categories.create');
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'category_type' => 'required|in:stock,crypto',
            'status' => 'required|in:active,inactive'
        ]);

        MarketTypeCategory::create($request->all());
        return redirect()->route('admin.market_type_categories.index')->with('success', 'Category created successfully');
    }

    public function edit(MarketTypeCategory $marketTypeCategory)
    {
        return view('admin.market_type_categories.edit', compact('marketTypeCategory'));
    }

    public function update(Request $request, MarketTypeCategory $marketTypeCategory)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'category_type' => 'required|in:stock,crypto',
            'status' => 'required|in:active,inactive'
        ]);

        $marketTypeCategory->update($request->all());
        return redirect()->route('admin.market_type_categories.index')->with('success', 'Category updated successfully');
    }

    public function destroy(MarketTypeCategory $marketTypeCategory)
    {
        $marketTypeCategory->delete();
        return redirect()->route('admin.market_type_categories.index')->with('success', 'Category deleted successfully');
    }

    public function getByType($type)
    {
        $categories = MarketTypeCategory::where('category_type', $type)
            ->where('status', 'active')
            ->get(['id', 'name']);
        return response()->json($categories);
    }

    public function getCategories()
    {
        $categories = MarketTypeCategory::where('status', 'active')
            ->get(['id', 'name', 'category_type']);
        return response()->json(['categories' => $categories]);
    }
}