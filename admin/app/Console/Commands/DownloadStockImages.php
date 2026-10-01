<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Asset;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;

class DownloadStockImages extends Command
{
    protected $signature = 'stocks:download-images';
    protected $description = 'Download stock images locally';

    public function handle()
    {
        $stocks = Asset::where('type', 'stock')->get();
        $this->info("Downloading images for {$stocks->count()} stocks...");

        foreach ($stocks as $stock) {
            try {
                $url = "https://financialmodelingprep.com/image-stock/{$stock->symbol}.png";
                $response = Http::timeout(10)->get($url);
                
                if ($response->successful()) {
                    $filename = "stocks/{$stock->symbol}.png";
                    Storage::disk('public')->put($filename, $response->body());
                    
                    $stock->update([
                        'image_url' => asset("storage/{$filename}")
                    ]);
                    
                    $this->info("Downloaded: {$stock->symbol}");
                } else {
                    $this->warn("Failed to download: {$stock->symbol}");
                }
            } catch (\Exception $e) {
                $this->error("Error downloading {$stock->symbol}: " . $e->getMessage());
            }
        }

        $this->info('Stock images download completed!');
    }
}