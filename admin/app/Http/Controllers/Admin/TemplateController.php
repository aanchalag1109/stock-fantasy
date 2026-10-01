<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeagueSessionTemplate;
use Illuminate\Http\Request;

class TemplateController extends Controller
{
    public function index()
    {
        $templates = LeagueSessionTemplate::orderBy('created_at', 'desc')->get();
        return view('admin.templates.index', compact('templates'));
    }

    public function edit($id)
    {
        $template = LeagueSessionTemplate::findOrFail($id);
        return view('admin.templates.edit', compact('template'));
    }

    public function update(Request $request, $id)
    {
        $template = LeagueSessionTemplate::findOrFail($id);
        
        // Update basic fields
        $template->update([
            'template_name' => $request->template_name,
            'name' => $request->name,
            'market_type' => $request->market_type,
            'max_stocks' => $request->max_stocks
        ]);
        
        // Build assets data in the same format as when saving from league session
        $stocks = $request->input('stocks', []);
        $cryptos = $request->input('cryptos', []);
        
        $assetsData = [];
        
        // Get category names and build grouped structure
        foreach ($stocks as $categoryId => $assets) {
            $category = \DB::table('market_type_categories')->where('id', $categoryId)->first();
            if ($category) {
                $assetsData[$category->name] = [];
                foreach ($assets as $assetSymbol) {
                    $asset = \DB::table('assets')->where('symbol', $assetSymbol)->first();
                    $assetsData[$category->name][] = [
                        'asset_symbol' => $assetSymbol,
                        'asset_name' => $asset->name ?? $assetSymbol,
                        'category_name' => $category->name,
                        'category_id' => $categoryId
                    ];
                }
            }
        }
        
        foreach ($cryptos as $categoryId => $assets) {
            $category = \DB::table('market_type_categories')->where('id', $categoryId)->first();
            if ($category) {
                $assetsData[$category->name] = [];
                foreach ($assets as $assetSymbol) {
                    $asset = \DB::table('assets')->where('symbol', $assetSymbol)->first();
                    $assetsData[$category->name][] = [
                        'asset_symbol' => $assetSymbol,
                        'asset_name' => $asset->name ?? $assetSymbol,
                        'category_name' => $category->name,
                        'category_id' => $categoryId
                    ];
                }
            }
        }
        
        $template->update(['assets_data' => $assetsData]);
        
        return redirect()->route('admin.templates.index')->with('success', 'Template updated successfully!');
    }

    public function destroy($id)
    {
        LeagueSessionTemplate::destroy($id);
        return back()->with('success', 'Template deleted successfully!');
    }
}