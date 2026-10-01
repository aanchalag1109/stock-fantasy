<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\SavedBasket;

class FixEmptyBaskets extends Command
{
    protected $signature = 'baskets:fix-empty';
    protected $description = 'Fix saved baskets with empty assets by extracting from multipliers';

    public function handle()
    {
        $baskets = SavedBasket::whereRaw("JSON_LENGTH(assets) = 0")
            ->orWhereNull('assets')
            ->get();

        $fixed = 0;
        foreach ($baskets as $basket) {
            $multipliers = json_decode($basket->multipliers, true);
            
            if (!empty($multipliers)) {
                $assets = array_map(function($m) {
                    return [
                        'name' => $m['asset_name'] ?? '',
                        'symbol' => $m['asset_name'] ?? '',
                        'direction' => $m['prediction'] ?? 'NONE',
                        'multiplier' => $m['multiplier'] ?? 1
                    ];
                }, $multipliers);
                
                $basket->update(['assets' => $assets]);
                $fixed++;
            }
        }

        $this->info("Fixed {$fixed} baskets with empty assets.");
        return 0;
    }
}
