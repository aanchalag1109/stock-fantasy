<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class PricingController extends Controller
{
    /**
     * Complete prize distribution table matching JavaScript implementation
     * Structure count => array of prize groups
     */
    private array $prizeDistributionTable = [
        10 => [
            ['start' => 1, 'end' => 1, 'percent' => 30],
            ['start' => 2, 'end' => 2, 'percent' => 18],
            ['start' => 3, 'end' => 3, 'percent' => 11],
            ['start' => 4, 'end' => 5, 'percent' => 13.5],
            ['start' => 6, 'end' => 10, 'percent' => 27.5]
        ],
        25 => [
            ['start' => 1, 'end' => 1, 'percent' => 24],
            ['start' => 2, 'end' => 2, 'percent' => 14],
            ['start' => 3, 'end' => 3, 'percent' => 9],
            ['start' => 4, 'end' => 5, 'percent' => 12.375],
            ['start' => 6, 'end' => 10, 'percent' => 18.125],
            ['start' => 11, 'end' => 25, 'percent' => 22.5]
        ],
        50 => [
            ['start' => 1, 'end' => 1, 'percent' => 23],
            ['start' => 2, 'end' => 2, 'percent' => 13],
            ['start' => 3, 'end' => 3, 'percent' => 9],
            ['start' => 4, 'end' => 5, 'percent' => 8.1],
            ['start' => 6, 'end' => 10, 'percent' => 15],
            ['start' => 11, 'end' => 25, 'percent' => 16.4],
            ['start' => 26, 'end' => 50, 'percent' => 15.5]
        ],
        100 => [
            ['start' => 1, 'end' => 1, 'percent' => 18],
            ['start' => 2, 'end' => 2, 'percent' => 10],
            ['start' => 3, 'end' => 3, 'percent' => 8],
            ['start' => 4, 'end' => 5, 'percent' => 6.576],
            ['start' => 6, 'end' => 10, 'percent' => 10],
            ['start' => 11, 'end' => 25, 'percent' => 15.4],
            ['start' => 26, 'end' => 50, 'percent' => 16.524],
            ['start' => 51, 'end' => 100, 'percent' => 15.5]
        ],
        250 => [
            ['start' => 1, 'end' => 1, 'percent' => 14],
            ['start' => 2, 'end' => 2, 'percent' => 9],
            ['start' => 3, 'end' => 3, 'percent' => 7],
            ['start' => 4, 'end' => 5, 'percent' => 5.169],
            ['start' => 6, 'end' => 10, 'percent' => 8.602],
            ['start' => 11, 'end' => 25, 'percent' => 13.323],
            ['start' => 26, 'end' => 50, 'percent' => 13.031],
            ['start' => 51, 'end' => 100, 'percent' => 13.375],
            ['start' => 101, 'end' => 250, 'percent' => 16.5]
        ],
        500 => [
            ['start' => 1, 'end' => 1, 'percent' => 14],
            ['start' => 2, 'end' => 2, 'percent' => 9],
            ['start' => 3, 'end' => 3, 'percent' => 7],
            ['start' => 4, 'end' => 5, 'percent' => 3.1],
            ['start' => 6, 'end' => 10, 'percent' => 6.628],
            ['start' => 11, 'end' => 25, 'percent' => 10.576],
            ['start' => 26, 'end' => 50, 'percent' => 10.102],
            ['start' => 51, 'end' => 100, 'percent' => 12.469],
            ['start' => 101, 'end' => 250, 'percent' => 13.625],
            ['start' => 251, 'end' => 500, 'percent' => 13.5]
        ],
        1000 => [
            ['start' => 1, 'end' => 1, 'percent' => 12],
            ['start' => 2, 'end' => 2, 'percent' => 8],
            ['start' => 3, 'end' => 3, 'percent' => 5],
            ['start' => 4, 'end' => 5, 'percent' => 2.399],
            ['start' => 6, 'end' => 10, 'percent' => 4.931],
            ['start' => 11, 'end' => 25, 'percent' => 9.11],
            ['start' => 26, 'end' => 50, 'percent' => 8.813],
            ['start' => 51, 'end' => 100, 'percent' => 10.418],
            ['start' => 101, 'end' => 250, 'percent' => 11.891],
            ['start' => 251, 'end' => 500, 'percent' => 12.188],
            ['start' => 501, 'end' => 1000, 'percent' => 15.25]
        ],
        2500 => [
            ['start' => 1, 'end' => 1, 'percent' => 10],
            ['start' => 2, 'end' => 2, 'percent' => 7],
            ['start' => 3, 'end' => 3, 'percent' => 5],
            ['start' => 4, 'end' => 5, 'percent' => 1.8],
            ['start' => 6, 'end' => 10, 'percent' => 3.5],
            ['start' => 11, 'end' => 25, 'percent' => 7.386],
            ['start' => 26, 'end' => 50, 'percent' => 7.229],
            ['start' => 51, 'end' => 100, 'percent' => 8.972],
            ['start' => 101, 'end' => 250, 'percent' => 10.629],
            ['start' => 251, 'end' => 500, 'percent' => 11.172],
            ['start' => 501, 'end' => 1000, 'percent' => 12.562],
            ['start' => 1001, 'end' => 2500, 'percent' => 14.75]
        ],
        5000 => [
            ['start' => 1, 'end' => 1, 'percent' => 10],
            ['start' => 2, 'end' => 2, 'percent' => 7],
            ['start' => 3, 'end' => 3, 'percent' => 5],
            ['start' => 4, 'end' => 5, 'percent' => 1.75],
            ['start' => 6, 'end' => 10, 'percent' => 3],
            ['start' => 11, 'end' => 25, 'percent' => 5.314],
            ['start' => 26, 'end' => 50, 'percent' => 5.355],
            ['start' => 51, 'end' => 100, 'percent' => 7.14],
            ['start' => 101, 'end' => 250, 'percent' => 8.853],
            ['start' => 251, 'end' => 500, 'percent' => 9.471],
            ['start' => 501, 'end' => 1000, 'percent' => 10.961],
            ['start' => 1001, 'end' => 2500, 'percent' => 12.281],
            ['start' => 2501, 'end' => 5000, 'percent' => 13.875]
        ],
        10000 => [
            ['start' => 1, 'end' => 1, 'percent' => 10],
            ['start' => 2, 'end' => 2, 'percent' => 7],
            ['start' => 3, 'end' => 3, 'percent' => 5],
            ['start' => 4, 'end' => 5, 'percent' => 1.6],
            ['start' => 6, 'end' => 10, 'percent' => 2.049],
            ['start' => 11, 'end' => 25, 'percent' => 4.283],
            ['start' => 26, 'end' => 50, 'percent' => 4.31],
            ['start' => 51, 'end' => 100, 'percent' => 5.08],
            ['start' => 101, 'end' => 500, 'percent' => 8.774],
            ['start' => 501, 'end' => 1000, 'percent' => 10.365],
            ['start' => 1001, 'end' => 2500, 'percent' => 12.82],
            ['start' => 2501, 'end' => 5000, 'percent' => 12.094],
            ['start' => 5001, 'end' => 10000, 'percent' => 16.625]
        ],
        25000 => [
            ['start' => 1, 'end' => 1, 'percent' => 8],
            ['start' => 2, 'end' => 2, 'percent' => 6],
            ['start' => 3, 'end' => 3, 'percent' => 4.5],
            ['start' => 4, 'end' => 5, 'percent' => 1.4],
            ['start' => 6, 'end' => 10, 'percent' => 1.7],
            ['start' => 11, 'end' => 25, 'percent' => 3.164],
            ['start' => 26, 'end' => 50, 'percent' => 3.422],
            ['start' => 51, 'end' => 100, 'percent' => 4.229],
            ['start' => 101, 'end' => 500, 'percent' => 6.262],
            ['start' => 501, 'end' => 1000, 'percent' => 7.339],
            ['start' => 1001, 'end' => 5000, 'percent' => 12.172],
            ['start' => 5001, 'end' => 10000, 'percent' => 12.562],
            ['start' => 10001, 'end' => 25000, 'percent' => 29.25]
        ],
        50000 => [
            ['start' => 1, 'end' => 1, 'percent' => 8],
            ['start' => 2, 'end' => 2, 'percent' => 6],
            ['start' => 3, 'end' => 3, 'percent' => 4.5],
            ['start' => 4, 'end' => 5, 'percent' => 1.2],
            ['start' => 6, 'end' => 10, 'percent' => 1.7],
            ['start' => 11, 'end' => 25, 'percent' => 2.903],
            ['start' => 26, 'end' => 50, 'percent' => 3.043],
            ['start' => 51, 'end' => 100, 'percent' => 3.89],
            ['start' => 101, 'end' => 500, 'percent' => 6.187],
            ['start' => 501, 'end' => 1000, 'percent' => 6.916],
            ['start' => 1001, 'end' => 5000, 'percent' => 8.555],
            ['start' => 5001, 'end' => 10000, 'percent' => 10],
            ['start' => 10001, 'end' => 25000, 'percent' => 17.431],
            ['start' => 25001, 'end' => 50000, 'percent' => 19.675]
        ],
        100000 => [
            ['start' => 1, 'end' => 1, 'percent' => 8],
            ['start' => 2, 'end' => 2, 'percent' => 6],
            ['start' => 3, 'end' => 3, 'percent' => 4.5],
            ['start' => 4, 'end' => 5, 'percent' => 1.052],
            ['start' => 6, 'end' => 10, 'percent' => 1.502],
            ['start' => 11, 'end' => 25, 'percent' => 2.737],
            ['start' => 26, 'end' => 50, 'percent' => 2.65],
            ['start' => 51, 'end' => 100, 'percent' => 3.533],
            ['start' => 101, 'end' => 500, 'percent' => 5.377],
            ['start' => 501, 'end' => 1000, 'percent' => 5.1],
            ['start' => 1001, 'end' => 5000, 'percent' => 7.893],
            ['start' => 5001, 'end' => 10000, 'percent' => 8.45],
            ['start' => 10001, 'end' => 25000, 'percent' => 11.031],
            ['start' => 25001, 'end' => 50000, 'percent' => 12.375],
            ['start' => 50001, 'end' => 100000, 'percent' => 19.8]
        ],
        250000 => [
            ['start' => 1, 'end' => 1, 'percent' => 6.5],
            ['start' => 2, 'end' => 2, 'percent' => 5],
            ['start' => 3, 'end' => 3, 'percent' => 4],
            ['start' => 4, 'end' => 5, 'percent' => 1.076],
            ['start' => 6, 'end' => 10, 'percent' => 1.8],
            ['start' => 11, 'end' => 25, 'percent' => 2.53],
            ['start' => 26, 'end' => 50, 'percent' => 2.507],
            ['start' => 51, 'end' => 100, 'percent' => 3.11],
            ['start' => 101, 'end' => 500, 'percent' => 5],
            ['start' => 501, 'end' => 1000, 'percent' => 6],
            ['start' => 1001, 'end' => 5000, 'percent' => 7.075],
            ['start' => 5001, 'end' => 10000, 'percent' => 7.766],
            ['start' => 10001, 'end' => 25000, 'percent' => 8.355],
            ['start' => 25001, 'end' => 100000, 'percent' => 13.281],
            ['start' => 100001, 'end' => 250000, 'percent' => 26]
        ],
        500000 => [
            ['start' => 1, 'end' => 1, 'percent' => 6.5],
            ['start' => 2, 'end' => 2, 'percent' => 5],
            ['start' => 3, 'end' => 3, 'percent' => 4],
            ['start' => 4, 'end' => 5, 'percent' => 1.005],
            ['start' => 6, 'end' => 10, 'percent' => 1.673],
            ['start' => 11, 'end' => 25, 'percent' => 2.831],
            ['start' => 26, 'end' => 50, 'percent' => 2.375],
            ['start' => 51, 'end' => 100, 'percent' => 2.9],
            ['start' => 101, 'end' => 500, 'percent' => 4.6],
            ['start' => 501, 'end' => 1000, 'percent' => 5.6],
            ['start' => 1001, 'end' => 5000, 'percent' => 6.788],
            ['start' => 5001, 'end' => 10000, 'percent' => 7.532],
            ['start' => 10001, 'end' => 25000, 'percent' => 7.734],
            ['start' => 25001, 'end' => 100000, 'percent' => 9.312],
            ['start' => 100001, 'end' => 250000, 'percent' => 12.75],
            ['start' => 250001, 'end' => 500000, 'percent' => 19.4]
        ],
        1000000 => [
            ['start' => 1, 'end' => 1, 'percent' => 5.5],
            ['start' => 2, 'end' => 2, 'percent' => 4.2],
            ['start' => 3, 'end' => 3, 'percent' => 3.5],
            ['start' => 4, 'end' => 5, 'percent' => 0.941],
            ['start' => 6, 'end' => 10, 'percent' => 1.621],
            ['start' => 11, 'end' => 25, 'percent' => 2.194],
            ['start' => 26, 'end' => 50, 'percent' => 2.159],
            ['start' => 51, 'end' => 100, 'percent' => 2.812],
            ['start' => 101, 'end' => 500, 'percent' => 4.538],
            ['start' => 501, 'end' => 1000, 'percent' => 5.2],
            ['start' => 1001, 'end' => 5000, 'percent' => 6.555],
            ['start' => 5001, 'end' => 10000, 'percent' => 7.407],
            ['start' => 10001, 'end' => 25000, 'percent' => 7.709],
            ['start' => 25001, 'end' => 100000, 'percent' => 8.945],
            ['start' => 100001, 'end' => 250000, 'percent' => 11.594],
            ['start' => 250001, 'end' => 500000, 'percent' => 13.125],
            ['start' => 500001, 'end' => 1000000, 'percent' => 12]
        ],
        2500000 => [
            ['start' => 1, 'end' => 1, 'percent' => 5.5],
            ['start' => 2, 'end' => 2, 'percent' => 4.2],
            ['start' => 3, 'end' => 3, 'percent' => 3.5],
            ['start' => 4, 'end' => 5, 'percent' => 0.854],
            ['start' => 6, 'end' => 10, 'percent' => 1.301],
            ['start' => 11, 'end' => 25, 'percent' => 2.018],
            ['start' => 26, 'end' => 50, 'percent' => 1.991],
            ['start' => 51, 'end' => 100, 'percent' => 2.655],
            ['start' => 101, 'end' => 500, 'percent' => 3.807],
            ['start' => 501, 'end' => 1000, 'percent' => 3.742],
            ['start' => 1001, 'end' => 5000, 'percent' => 5.656],
            ['start' => 5001, 'end' => 10000, 'percent' => 6.542],
            ['start' => 10001, 'end' => 25000, 'percent' => 7.389],
            ['start' => 25001, 'end' => 100000, 'percent' => 8.185],
            ['start' => 100001, 'end' => 250000, 'percent' => 8.914],
            ['start' => 250001, 'end' => 500000, 'percent' => 9.552],
            ['start' => 500001, 'end' => 1000000, 'percent' => 11.069],
            ['start' => 1000001, 'end' => 2500000, 'percent' => 13.125]
        ],
        5000000 => [
            ['start' => 1, 'end' => 1, 'percent' => 5.5],
            ['start' => 2, 'end' => 2, 'percent' => 4.2],
            ['start' => 3, 'end' => 3, 'percent' => 3.5],
            ['start' => 4, 'end' => 5, 'percent' => 0.765],
            ['start' => 6, 'end' => 10, 'percent' => 1.147],
            ['start' => 11, 'end' => 25, 'percent' => 1.737],
            ['start' => 26, 'end' => 50, 'percent' => 1.716],
            ['start' => 51, 'end' => 100, 'percent' => 1.888],
            ['start' => 101, 'end' => 500, 'percent' => 2.851],
            ['start' => 501, 'end' => 1000, 'percent' => 2.801],
            ['start' => 1001, 'end' => 5000, 'percent' => 4.735],
            ['start' => 5001, 'end' => 10000, 'percent' => 4.646],
            ['start' => 10001, 'end' => 25000, 'percent' => 6.528],
            ['start' => 25001, 'end' => 100000, 'percent' => 7.371],
            ['start' => 100001, 'end' => 250000, 'percent' => 8.162],
            ['start' => 250001, 'end' => 500000, 'percent' => 8.882],
            ['start' => 500001, 'end' => 1000000, 'percent' => 10.509],
            ['start' => 1000001, 'end' => 2500000, 'percent' => 11.012],
            ['start' => 2500001, 'end' => 5000000, 'percent' => 12.05]
        ]
    ];

    /**
     * Calculate flexible pricing based on contest parameters
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function flexiblePricing(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'participants' => 'required|numeric|min:1',
            'entry_fee' => 'required|numeric|min:0',
            'platform_fee' => 'required|numeric|min:0|max:100',
            'winning_percentage' => 'required|numeric|min:0|max:100',
            'category' => 'sometimes|string|in:mega,equal,practice'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $participants = (int) $request->input('participants');
        $entryFee = (float) $request->input('entry_fee');
        $platformFee = (float) $request->input('platform_fee');
        $winningPercentage = (float) $request->input('winning_percentage');
        $category = $request->input('category', 'mega');

        $result = $this->calculateContest($participants, $entryFee, $platformFee, $winningPercentage, $category);

        // Convert to old format for backward compatibility
        return response()->json([
            'totalWinners' => $result['winner_info']['total_winners'],
            'totalPool' => $result['financial_summary']['total_pool'],
            'platformFeeAmount' => $result['financial_summary']['platform_fee_amount'],
            'totalPrizePool' => $result['financial_summary']['total_prize_pool'],
            'distribution' => array_map(function($item) {
                return [
                    'label' => $item['label'],
                    'winners' => $item['winners'],
                    'percent' => $item['percent'],
                    'prize' => $item['total_prize'],
                    'perWinner' => $item['prize_per_winner']
                ];
            }, $result['prize_distribution'])
        ]);
    }

    /**
     * Calculate contest prize distribution
     *
     * @param int $participants
     * @param float $entryFee
     * @param float $platformFee
     * @param float $winningPercentage
     * @param string $category
     * @return array
     */
    private function calculateContest(
        int $participants,
        float $entryFee,
        float $platformFee,
        float $winningPercentage,
        string $category = 'mega'
    ): array {
        // Basic calculations
        $totalWinners = (int) round($participants * ($winningPercentage / 100));
        $totalPool = $participants * $entryFee;
        $platformFeeAmount = $totalPool * ($platformFee / 100);
        $totalPrizePool = $totalPool - $platformFeeAmount;

        $result = [
            'contest_info' => [
                'participants' => $participants,
                'entry_fee' => $entryFee,
                'category' => $category
            ],
            'financial_summary' => [
                'total_pool' => round($totalPool, 2),
                'platform_fee_percent' => $platformFee,
                'platform_fee_amount' => round($platformFeeAmount, 2),
                'total_prize_pool' => round($totalPrizePool, 2)
            ],
            'winner_info' => [
                'total_winners' => $totalWinners,
                'winning_percentage' => $winningPercentage
            ],
            'prize_distribution' => []
        ];

        // Handle edge cases
        if ($totalWinners <= 0) {
            $result['message'] = 'No winners for this contest configuration';
            return $result;
        }

        if ($totalWinners <= 2) {
            $result['message'] = 'Winners are 2 or less. Simple distribution applied.';
            $result['prize_distribution'] = $this->simpleDistribution($totalWinners, $totalPrizePool);
            return $result;
        }

        // Equal prize distribution
        if ($category === 'equal') {
            $result['prize_distribution'] = $this->equalPrizeDistribution($totalWinners, $totalPrizePool);
            return $result;
        }

        // Practice contests (no prizes)
        if ($category === 'practice') {
            $result['message'] = 'Practice contest - no prize distribution';
            return $result;
        }

        // Mega contest - use predefined structure
        $result['prize_distribution'] = $this->megaPrizeDistribution($totalWinners, $totalPrizePool);

        return $result;
    }

    /**
     * Simple distribution for 1-2 winners
     */
    private function simpleDistribution(int $totalWinners, float $prizePool): array
    {
        if ($totalWinners === 1) {
            return [[
                'rank_start' => 1,
                'rank_end' => 1,
                'label' => 'Rank 1',
                'percent' => 100,
                'winners' => 1,
                'total_prize' => $prizePool,
                'prize_per_winner' => (int) floor($prizePool)
            ]];
        }

        // 2 winners: 60-40 split
        return [
            [
                'rank_start' => 1,
                'rank_end' => 1,
                'label' => 'Rank 1',
                'percent' => 60,
                'winners' => 1,
                'total_prize' => $prizePool * 0.6,
                'prize_per_winner' => (int) floor($prizePool * 0.6)
            ],
            [
                'rank_start' => 2,
                'rank_end' => 2,
                'label' => 'Rank 2',
                'percent' => 40,
                'winners' => 1,
                'total_prize' => $prizePool * 0.4,
                'prize_per_winner' => (int) floor($prizePool * 0.4)
            ]
        ];
    }

    /**
     * Equal prize distribution for all winners
     */
    private function equalPrizeDistribution(int $totalWinners, float $prizePool): array
    {
        $perPersonPrize = $prizePool / $totalWinners;

        return [[
            'rank_start' => 1,
            'rank_end' => $totalWinners,
            'label' => "Ranks 1-{$totalWinners}",
            'percent' => 100,
            'winners' => $totalWinners,
            'total_prize' => $prizePool,
            'prize_per_winner' => (int) floor($perPersonPrize)
        ]];
    }

    /**
     * Mega contest prize distribution using predefined structures
     */
    private function megaPrizeDistribution(int $totalWinners, float $prizePool): array
    {
        $chosenStructure = $this->getClosestWinnerCount($totalWinners);
        $groups = $this->prizeDistributionTable[$chosenStructure];
        
        // Determine if we're scaling up or down
        $keys = array_keys($this->prizeDistributionTable);
        sort($keys);
        
        $lower = $keys[0];
        $higher = end($keys);
        
        foreach ($keys as $k) {
            if ($k <= $totalWinners) {
                $lower = $k;
            }
            if ($k >= $totalWinners && $higher === end($keys)) {
                $higher = $k;
            }
        }
        
        $isHigher = $chosenStructure === $higher;
        
        // Adjust groups to fit actual winner count
        $adjustedGroups = $this->getAdjustedPrizeGroups($totalWinners, $groups, $chosenStructure, $isHigher);
        
        $distribution = [];
        $previousPerWinner = PHP_FLOAT_MAX;

        foreach ($adjustedGroups as $i => $group) {
            $groupPrize = $prizePool * ($group['percent'] / 100);
            $numInGroup = $group['end'] - $group['start'] + 1;
            $perPersonPrize = $groupPrize / $numInGroup;

            // Smart last slab logic
            if ($i === count($adjustedGroups) - 1) {
                $originalLastGroup = end($groups);
                $structureWinners = $originalLastGroup['end'] - $originalLastGroup['start'] + 1;
                $actualWinners = $numInGroup;
                
                // Use appropriate divisor
                $divisor = $actualWinners <= $structureWinners ? $structureWinners : $actualWinners;
                $perPersonPrize = $groupPrize / $divisor;
                
                // Safety clamp - prevent last slab from exceeding previous
                if ($i > 0 && $perPersonPrize > $previousPerWinner) {
                    $perPersonPrize = $previousPerWinner * 0.95;
                }
            }

            $distribution[] = [
                'rank_start' => $group['start'],
                'rank_end' => $group['end'],
                'label' => "Ranks {$group['start']}-{$group['end']}",
                'percent' => $group['percent'],
                'winners' => $numInGroup,
                'total_prize' => round($groupPrize, 2),
                'prize_per_winner' => (int) floor($perPersonPrize)
            ];

            $previousPerWinner = $perPersonPrize;
        }

        return $distribution;
    }

    /**
     * Get closest predefined winner count structure
     */
    private function getClosestWinnerCount(int $n): int
    {
        $keys = array_keys($this->prizeDistributionTable);
        sort($keys);
        
        $lower = $keys[0];
        $higher = end($keys);
        
        foreach ($keys as $k) {
            if ($k <= $n) {
                $lower = $k;
            }
            if ($k >= $n && $higher === end($keys)) {
                $higher = $k;
            }
        }
        
        // Exact match
        if ($n === $lower) {
            return $lower;
        }
        
        // Equidistant - prefer higher structure
        if (($n - $lower) === ($higher - $n)) {
            return $higher;
        }
        
        // Return closest
        return ($n - $lower) < ($higher - $n) ? $lower : $higher;
    }

    /**
     * Adjust prize groups to fit actual winner count
     */
    private function getAdjustedPrizeGroups(
        int $actualWinners,
        array $groups,
        int $chosenStructure,
        bool $isHigher
    ): array {
        $adjusted = [];
        
        foreach ($groups as $i => $g) {
            // Skip groups that start beyond actual winners
            if ($g['start'] > $actualWinners) {
                continue;
            }
            
            // Adjust last group
            if ($i === count($groups) - 1) {
                if ($isHigher) {
                    // Scaling down - cap at actual winners
                    $g['end'] = min($g['end'], $actualWinners);
                } else {
                    // Scaling up - extend to actual winners
                    $g['end'] = $actualWinners;
                }
            } else {
                // Cap intermediate groups at actual winners
                if ($g['end'] > $actualWinners) {
                    $g['end'] = $actualWinners;
                }
            }
            
            $adjusted[] = $g;
        }
        
        return $adjusted;
    }

    /**
     * Get available prize structures
     */
    public function getAvailableStructures(): JsonResponse
    {
        $structures = [];
        
        foreach ($this->prizeDistributionTable as $winnerCount => $groups) {
            $structures[] = [
                'winner_count' => $winnerCount,
                'groups' => count($groups),
                'percentages' => array_column($groups, 'percent')
            ];
        }

        return response()->json([
            'success' => true,
            'data' => $structures
        ]);
    }
}