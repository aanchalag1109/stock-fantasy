@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Contest Calculation Results</h5>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <button class="btn btn-info btn-sm" onclick="openWorkingModal()">
                            <i class="bi bi-info-circle"></i> How It Works
                        </button>

                        <div class="d-flex align-items-center gap-2 p-2 bg-dark rounded">
                            <input type="time" id="runAllStartTime" class="form-control form-control-sm" style="width:120px" placeholder="Start Time">
                            <span class="text-white small">to</span>
                            <input type="time" id="runAllEndTime" class="form-control form-control-sm" style="width:120px" placeholder="End Time">
                            <button class="btn btn-warning btn-sm fw-bold" id="runAllBtn" onclick="runAll()">
                                <i class="bi bi-lightning-charge-fill"></i> RUN ALL
                            </button>
                        </div>


 </button>
                        <div style="display:none">
                        {{-- Phase 1 --}}
                        <button class="btn btn-secondary btn-sm" onclick="phase1SessionStart()" title="Phase 1: Session Start — Start prices fetch, contests live, prize structure save">
                            <i class="bi bi-play-circle"></i> Phase 1: Session Start
                        </button>

                        {{-- Phase 2 --}}
                        <button class="btn btn-warning btn-sm" onclick="phase2LiveScores()" title="Phase 2: Live Score Update — End prices fetch, scores calculate (no wallet)">
                            <i class="bi bi-arrow-repeat"></i> Phase 2: Live Scores
                        </button>

                        {{-- Phase 3: Run Calculation --}}
                        <button class="btn btn-warning btn-sm" id="runCalculationBtn" onclick="runCalculation()" title="Phase 3 Step 1: Calculate scores + assign ranks">
                            <i class="bi bi-calculator-fill"></i> Run Calculation
                        </button>

                        {{-- Phase 3: Declare Result --}}
                        <button class="btn btn-success btn-sm" id="declareResultBtn" onclick="declareResult()" title="Phase 3 Step 2: Distribute prizes to winners wallet">
                            <i class="bi bi-trophy-fill"></i> Declare Result
                        </button>

                        {{-- Phase 4 --}}
                        <button class="btn btn-danger btn-sm" onclick="phase4OrphanFix()" title="Phase 4: Fix orphaned contests — session completed but contest still live">
                            <i class="bi bi-wrench"></i> Phase 4: Fix Orphans
                        </button>
                        </div>

                        <span id="sessionStatus" class="badge {{ $contest->session_status == 'live' ? 'bg-success' : ($contest->session_status == 'completed' ? 'bg-secondary' : 'bg-warning') }}">
                            @if($contest->session_status == 'live')
                                🔴 LIVE
                            @elseif($contest->session_status == 'completed')
                                ✅ COMPLETED
                            @else
                                🟡 UPCOMING
                            @endif
                        </span>
                    </div>
                </div>
                <div class="card-body">
                    @php
                        $totalAssets     = \DB::table('league_session_assets')->where('league_session_id', $contest->league_session_id)->count();
                        $startPriceCount = \DB::table('session_asset_prices')->where('league_session_id', $contest->league_session_id)->whereNotNull('start_price')->count();
                        $endPriceCount   = \DB::table('session_asset_prices')->where('league_session_id', $contest->league_session_id)->whereNotNull('end_price')->count();
                        $missingStart    = $totalAssets - $startPriceCount;
                    @endphp
                    <div class="row mb-4">
                        <div class="col">
                            <div class="text-center p-3 bg-light rounded">
                                <h6 class="text-muted mb-1">Total Winners</h6>
                                <h4 class="text-primary mb-0" id="totalWinners">{{ $stats['actual_winners'] }}</h4>
                            </div>
                        </div>
                        <div class="col">
                            <div class="text-center p-3 bg-light rounded">
                                <h6 class="text-muted mb-1">Total Pool</h6>
                                <h4 class="text-success mb-0" id="totalPool">{{ number_format($stats['total_pool_generated']) }} coins</h4>
                            </div>
                        </div>
                        <div class="col">
                            <div class="text-center p-3 bg-light rounded">
                                <h6 class="text-muted mb-1">Platform Fee</h6>
                                <h4 class="text-danger mb-0" id="platformFee">{{ number_format($stats['platform_fee_collected']) }} coins</h4>
                            </div>
                        </div>
                        <div class="col">
                            <div class="text-center p-3 bg-light rounded">
                                <h6 class="text-muted mb-1">Prize Pool</h6>
                                <h4 class="text-warning mb-0" id="prizePool">{{ number_format($stats['actual_prize_pool']) }} coins</h4>
                            </div>
                        </div>
                        <div class="col">
                            <div class="text-center p-3 bg-light rounded {{ $missingStart > 0 ? 'border border-warning' : '' }}">
                                <h6 class="text-muted mb-1">Session Assets</h6>
                                <h4 class="text-info mb-0">{{ $totalAssets }}</h4>
                                <small>
                                    <span class="text-success fw-bold">{{ $startPriceCount }} start</span> /
                                    <span class="text-{{ $endPriceCount == $totalAssets ? 'success' : 'danger' }} fw-bold">{{ $endPriceCount }} end</span>
                                </small>
                                @if($missingStart > 0)
                                    <br><small class="text-warning">⚠️ {{ $missingStart }} prices missing</small>
                                @endif
                            </div>
                        </div>
                    </div>
                    
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <h6 class="text-muted mb-2">Contest Details:</h6>
                            <p class="mb-1"><strong>Contest ID:</strong> {{ $contest->id }}</p>
                            <p class="mb-1"><strong>Category:</strong> {{ ucfirst($contest->category) }}</p>
                            <p class="mb-1"><strong>Session:</strong> {{ $contest->session_name ?? 'N/A' }}</p>
                        </div>
                        <div class="col-md-6">
                            <h6 class="text-muted mb-2">Fee Structure:</h6>
                            <p class="mb-1"><strong>Entry Fee:</strong> {{ $contest->entry_fee }} probcoins</p>
                            <p class="mb-1"><strong>Platform Fee:</strong> {{ $contest->platform_fee }}%</p>
                            <p class="mb-1"><strong>Total Participants:</strong> {{ $stats['total_participants'] }}</p>
                        </div>
                    </div>
                    

                    
                    <!-- Session-Level Saved Prices -->
                    <div class="card mb-4">
                        <div class="card-header bg-gradient-info text-white">
                            <h5 class="mb-0"><i class="bi bi-clock-history me-2"></i>Session Asset Prices</h5>
                            <button class="btn btn-sm btn-light" onclick="loadPrices()" id="loadPricesBtn">
                                <i class="bi bi-arrow-clockwise"></i> Load Prices
                            </button>
                        </div>
                        <div class="card-body p-4">
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle me-2"></i>
                                Prices are saved at session level when session starts/ends. All contests in this session use the same prices.
                            </div>
                            <div id="pricesContainer">
                                <div class="text-center p-4">
                                    <p class="text-muted">Click "Load Prices" to view start/end prices</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Joined Users Section -->
                    <div class="card mb-4">
                        <div class="card-header bg-gradient-primary text-white">
                            <h5 class="mb-0"><i class="bi bi-people-fill me-2"></i>Joined Users (<span id="participantCount">{{ $stats['total_participants'] }}</span>)</h5>
                            <button class="btn btn-sm btn-light" onclick="loadParticipants()" id="loadParticipantsBtn">
                                <i class="bi bi-arrow-clockwise"></i> Load Participants
                            </button>
                        </div>
                        <div class="card-body p-0">
                            <div id="participantsContainer">
                                <div class="text-center p-4">
                                    <p class="text-muted">Click "Load Participants" to view leaderboard data</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    

                    
                    <h6 class="mb-3">Prize Distribution:</h6>
                    <div class="mb-3">
                        <button class="btn btn-sm btn-warning" onclick="calculateResults()">
                            <i class="bi bi-calculator"></i> Calculate Results
                        </button>
                    </div>
                    <div id="distributionContainer" class="row">
                        @if(isset($flexibleDistribution) && count($flexibleDistribution) > 0)
                            @foreach($flexibleDistribution as $dist)
                            <div class="col-md-6 mb-3">
                                <div class="distribution-item">
                                    <div class="d-flex justify-content-between align-items-center">
                                        <div>
                                            <h6 class="mb-1">{{ $dist['label'] }}</h6>
                                            <span class="rank-label">{{ $dist['winners'] }} winners • {{ $dist['percent'] }}%</span>
                                        </div>
                                        <div class="text-end">
                                            <div class="prize-amount">{{ number_format($dist['perWinner']) }} coins</div>
                                            <small class="text-muted">per winner</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            @endforeach
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Working Explanation Modal -->
<div class="modal fade" id="workingModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title"><i class="bi bi-gear-fill me-2"></i>Performance Page - Complete Working Guide</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                <!-- System Status Check -->
                <div class="card border-primary mb-4">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0"><i class="bi bi-shield-check me-2"></i>System Status & Error Detection</h5>
                    </div>
                    <div class="card-body">
                        @php
                            $statusChecks = [];
                            $errorCount = 0;
                            $warningCount = 0;
                            
                            // Check 1: Contest Data Validation
                            if (!$contest || !$contest->id) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Contest Data Missing', 'message' => 'Contest object is null or missing ID'];
                                $errorCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Contest Data Valid', 'message' => 'Contest ID: ' . $contest->id . ' loaded successfully'];
                            }
                            
                            // Check 2: Session Status Validation
                            $validStatuses = ['upcoming', 'live', 'completed'];
                            if (!in_array($contest->session_status ?? '', $validStatuses)) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Invalid Session Status', 'message' => 'Status: "' . ($contest->session_status ?? 'NULL') . '" is not valid. Expected: upcoming/live/completed'];
                                $errorCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Session Status Valid', 'message' => 'Status: ' . strtoupper($contest->session_status)];
                            }
                            
                            // Check 3: Participants Data
                            $participantCount = $participants->count();
                            if ($participantCount == 0) {
                                $statusChecks[] = ['type' => 'warning', 'title' => 'No Participants', 'message' => 'Contest has 0 participants. This may be normal for new contests.'];
                                $warningCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Participants Found', 'message' => $participantCount . ' participants joined this contest'];
                            }
                            
                            // Check 4: Prize Distribution Validation
                            if (!isset($flexibleDistribution) || count($flexibleDistribution) == 0) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Prize Distribution Missing', 'message' => 'No prize distribution structure found. Winners cannot be determined.'];
                                $errorCount++;
                            } else {
                                $totalDistributionPercent = array_sum(array_column($flexibleDistribution, 'percent'));
                                if ($totalDistributionPercent > 105 || $totalDistributionPercent < 95) {
                                    $statusChecks[] = ['type' => 'warning', 'title' => 'Prize Distribution Issue', 'message' => 'Total distribution: ' . number_format($totalDistributionPercent, 2) . '%. Should be ~100%'];
                                    $warningCount++;
                                } else {
                                    $statusChecks[] = ['type' => 'success', 'title' => 'Prize Distribution Valid', 'message' => count($flexibleDistribution) . ' prize groups, Total: ' . number_format($totalDistributionPercent, 2) . '%'];
                                }
                            }
                            
                            // Check 5: Financial Calculations
                            $totalParticipants = $stats['total_participants'] ?? 0;
                            $entryFee = $contest->entry_fee ?? 0;
                            $platformFeePercent = $contest->platform_fee ?? 0;
                            $expectedPool = $totalParticipants * $entryFee;
                            $actualPool = $stats['total_pool_generated'] ?? 0;
                            
                            if (abs($expectedPool - $actualPool) > 1) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Pool Calculation Error', 'message' => 'Expected: ₹' . number_format($expectedPool) . ', Actual: ₹' . number_format($actualPool)];
                                $errorCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Pool Calculation Correct', 'message' => 'Pool: ₹' . number_format($actualPool) . ' (' . $totalParticipants . ' × ₹' . $entryFee . ')'];
                            }
                            
                            // Check 6: Price Data Availability
                            $sessionStartPrices = \DB::table('session_asset_prices')
                                ->where('league_session_id', $contest->league_session_id)
                                ->whereNotNull('start_price')
                                ->count();
                                
                            $sessionEndPrices = \DB::table('session_asset_prices')
                                ->where('league_session_id', $contest->league_session_id)
                                ->whereNotNull('end_price')
                                ->count();
                            
                            if ($contest->session_status == 'live' && $sessionStartPrices == 0) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Missing Start Prices', 'message' => 'Session is LIVE but no start prices found. Scores cannot be calculated.'];
                                $errorCount++;
                            } elseif ($contest->session_status == 'completed' && $sessionEndPrices == 0) {
                                $statusChecks[] = ['type' => 'error', 'title' => 'Missing End Prices', 'message' => 'Session is COMPLETED but no end prices found. Final scores may be incorrect.'];
                                $errorCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Price Data Available', 'message' => 'Start: ' . $sessionStartPrices . ', End: ' . $sessionEndPrices . ' prices found'];
                            }
                            
                            // Check 7: Transaction Consistency
                            $participantUserIds = $participants->pluck('user_id')->toArray();
                            $contestTransactions = \DB::table('transactions')
                                ->whereIn('user_id', $participantUserIds)
                                ->where(function($q) use ($contest) {
                                    $q->where('contest_id', $contest->id)
                                      ->orWhere('description', 'like', '%Contest #' . $contest->id . '%');
                                })
                                ->count();
                                
                            if ($participantCount > 0 && $contestTransactions == 0) {
                                $statusChecks[] = ['type' => 'warning', 'title' => 'No Transactions Found', 'message' => 'Participants exist but no transactions found. Entry fees may not be processed.'];
                                $warningCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Transactions Found', 'message' => $contestTransactions . ' transactions found for this contest'];
                            }
                            
                            // Check 8: Winner Count Validation
                            $expectedWinners = ceil(($totalParticipants * ($contest->winning_percentage ?? 30)) / 100);
                            $actualWinners = $stats['actual_winners'] ?? 0;
                            
                            if ($participantCount > 0 && abs($expectedWinners - $actualWinners) > 1) {
                                $statusChecks[] = ['type' => 'warning', 'title' => 'Winner Count Mismatch', 'message' => 'Expected: ' . $expectedWinners . ' winners, Actual: ' . $actualWinners . ' winners'];
                                $warningCount++;
                            } else {
                                $statusChecks[] = ['type' => 'success', 'title' => 'Winner Count Valid', 'message' => $actualWinners . ' winners from ' . $totalParticipants . ' participants'];
                            }
                        @endphp
                        
                        <!-- Status Summary -->
                        <div class="row mb-3">
                            <div class="col-md-4">
                                <div class="alert {{ $errorCount == 0 ? 'alert-success' : 'alert-danger' }} text-center">
                                    <h6 class="mb-1">{{ $errorCount == 0 ? '✅ No Errors' : '❌ ' . $errorCount . ' Errors' }}</h6>
                                    <small>Critical issues that need fixing</small>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="alert {{ $warningCount == 0 ? 'alert-success' : 'alert-warning' }} text-center">
                                    <h6 class="mb-1">{{ $warningCount == 0 ? '✅ No Warnings' : '⚠️ ' . $warningCount . ' Warnings' }}</h6>
                                    <small>Issues that may need attention</small>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="alert {{ ($errorCount == 0 && $warningCount == 0) ? 'alert-success' : 'alert-info' }} text-center">
                                    <h6 class="mb-1">{{ ($errorCount == 0 && $warningCount == 0) ? '🎉 All Good' : '🔍 Review Needed' }}</h6>
                                    <small>Overall system status</small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Detailed Status Checks -->
                        <div class="accordion" id="statusAccordion">
                            @foreach($statusChecks as $index => $check)
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="heading{{ $index }}">
                                    <button class="accordion-button {{ $check['type'] == 'error' ? 'bg-danger text-white' : ($check['type'] == 'warning' ? 'bg-warning text-dark' : 'bg-success text-white') }} collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse{{ $index }}">
                                        @if($check['type'] == 'error')
                                            <i class="bi bi-x-circle me-2"></i>
                                        @elseif($check['type'] == 'warning')
                                            <i class="bi bi-exclamation-triangle me-2"></i>
                                        @else
                                            <i class="bi bi-check-circle me-2"></i>
                                        @endif
                                        {{ $check['title'] }}
                                    </button>
                                </h2>
                                <div id="collapse{{ $index }}" class="accordion-collapse collapse" data-bs-parent="#statusAccordion">
                                    <div class="accordion-body">
                                        <p class="mb-2"><strong>Details:</strong> {{ $check['message'] }}</p>
                                        @if($check['type'] == 'error')
                                            <div class="alert alert-danger mb-0">
                                                <strong>Action Required:</strong> This error may cause incorrect calculations or system malfunction.
                                            </div>
                                        @elseif($check['type'] == 'warning')
                                            <div class="alert alert-warning mb-0">
                                                <strong>Recommendation:</strong> Review this issue to ensure optimal performance.
                                            </div>
                                        @endif
                                    </div>
                                </div>
                            </div>
                            @endforeach
                        </div>
                        
                        @if($errorCount > 0)
                            <div class="alert alert-danger mt-3">
                                <h6><i class="bi bi-exclamation-triangle me-2"></i>Critical Issues Detected</h6>
                                <p class="mb-0">{{ $errorCount }} critical error(s) found. Please review and fix these issues before proceeding with contest operations.</p>
                            </div>
                        @endif
                    </div>
                </div>
                <!-- Real Data Calculation Steps -->
                <div class="card border-success mb-4">
                    <div class="card-header bg-success text-white">
                        <h5 class="mb-0"><i class="bi bi-calculator me-2"></i>Step-by-Step Real Calculation</h5>
                    </div>
                    <div class="card-body">
                        @php
                            $totalParticipants = $stats['total_participants'] ?? 0;
                            $entryFee = $contest->entry_fee ?? 0;
                            $platformFeePercent = $contest->platform_fee ?? 0;
                            $winningPercent = $contest->winning_percentage ?? 0;
                            
                            $totalPool = $totalParticipants * $entryFee;
                            $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
                            $prizePool = $totalPool - $platformFeeAmount;
                            $totalWinners = ceil(($totalParticipants * $winningPercent) / 100);
                        @endphp
                        
                        <div class="row">
                            <div class="col-md-6">
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-primary text-white p-2 rounded-top">
                                        <h6 class="mb-0">📊 STEP 1: Basic Data Collection</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="row text-center">
                                            <div class="col-6">
                                                <div class="metric-box">
                                                    <div class="metric-value text-primary">{{ $totalParticipants }}</div>
                                                    <div class="metric-label">Participants</div>
                                                </div>
                                            </div>
                                            <div class="col-6">
                                                <div class="metric-box">
                                                    <div class="metric-value text-success">{{ $entryFee }}</div>
                                                    <div class="metric-label">Entry Fee</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="row text-center mt-2">
                                            <div class="col-6">
                                                <div class="metric-box">
                                                    <div class="metric-value text-warning">{{ $platformFeePercent }}%</div>
                                                    <div class="metric-label">Platform Fee</div>
                                                </div>
                                            </div>
                                            <div class="col-6">
                                                <div class="metric-box">
                                                    <div class="metric-value text-info">{{ $winningPercent }}%</div>
                                                    <div class="metric-label">Winning %</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-warning text-dark p-2 rounded-top">
                                        <h6 class="mb-0">💰 STEP 2: Pool Calculation</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="formula-box mb-2">
                                            <code class="text-dark">Total Pool = Participants × Entry Fee</code>
                                        </div>
                                        <div class="calculation-line">
                                            <span class="text-muted">{{ $totalParticipants }} × {{ $entryFee }} = </span>
                                            <span class="fw-bold text-success fs-5">{{ number_format($totalPool) }} coins</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-danger text-white p-2 rounded-top">
                                        <h6 class="mb-0">🏦 STEP 3: Platform Fee Deduction</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="formula-box mb-2">
                                            <code class="text-dark">Platform Fee = Total Pool × Platform Fee %</code>
                                        </div>
                                        <div class="calculation-line">
                                            <span class="text-muted">{{ number_format($totalPool) }} × {{ $platformFeePercent }}% = </span>
                                            <span class="fw-bold text-danger fs-5">{{ number_format($platformFeeAmount) }} coins</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-6">
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-info text-white p-2 rounded-top">
                                        <h6 class="mb-0">🎁 STEP 4: Prize Pool Calculation</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="formula-box mb-2">
                                            <code class="text-dark">Prize Pool = Total Pool - Platform Fee</code>
                                        </div>
                                        <div class="calculation-line">
                                            <span class="text-muted">{{ number_format($totalPool) }} - {{ number_format($platformFeeAmount) }} = </span>
                                            <span class="fw-bold text-success fs-4">{{ number_format($prizePool) }} coins</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-secondary text-white p-2 rounded-top">
                                        <h6 class="mb-0">🏆 STEP 5: Winners Count</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="formula-box mb-2">
                                            <code class="text-dark">Winners = Participants × Winning %</code>
                                        </div>
                                        <div class="calculation-line">
                                            <span class="text-muted">{{ $totalParticipants }} × {{ $winningPercent }}% = </span>
                                            <span class="fw-bold text-primary fs-4">{{ $totalWinners }} winners</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="calculation-step mb-4">
                                    <div class="step-header bg-dark text-white p-2 rounded-top">
                                        <h6 class="mb-0">📈 STEP 6: Final Summary</h6>
                                    </div>
                                    <div class="step-content bg-light p-3 rounded-bottom">
                                        <div class="summary-grid">
                                            <div class="summary-item">
                                                <span class="label">Total Collected:</span>
                                                <span class="value text-primary">{{ number_format($totalPool) }}</span>
                                            </div>
                                            <div class="summary-item">
                                                <span class="label">Platform Keeps:</span>
                                                <span class="value text-danger">{{ number_format($platformFeeAmount) }}</span>
                                            </div>
                                            <div class="summary-item">
                                                <span class="label">Prize Distribution:</span>
                                                <span class="value text-success">{{ number_format($prizePool) }}</span>
                                            </div>
                                            <div class="summary-item">
                                                <span class="label">Winners Get Prize:</span>
                                                <span class="value text-warning">{{ $totalWinners }} users</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Prize Distribution Breakdown -->
                @if(isset($flexibleDistribution) && count($flexibleDistribution) > 0)
                <div class="card border-warning mb-4">
                    <div class="card-header bg-warning text-dark">
                        <h5 class="mb-0"><i class="bi bi-trophy me-2"></i>STEP 7: Prize Distribution Breakdown</h5>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-info">
                            <strong>Total Prize Pool:</strong> {{ number_format($prizePool) }} coins will be distributed among {{ $totalWinners }} winners
                        </div>
                        
                        <div class="row">
                            @foreach($flexibleDistribution as $index => $dist)
                            <div class="col-md-6 mb-3">
                                <div class="prize-breakdown-card">
                                    <div class="prize-rank-header">
                                        <span class="rank-badge">{{ $dist['label'] }}</span>
                                        <span class="winners-count">{{ $dist['winners'] }} winners</span>
                                    </div>
                                    <div class="prize-calculation">
                                        <div class="calculation-formula">
                                            <small class="text-muted">{{ $dist['percent'] }}% of {{ number_format($prizePool) }}</small>
                                        </div>
                                        <div class="prize-amount-large">
                                            {{ number_format($dist['perWinner']) }} coins
                                        </div>
                                        <div class="per-winner-text">
                                            per winner
                                        </div>
                                    </div>
                                </div>
                            </div>
                            @endforeach
                        </div>
                        
                        <div class="mt-3">
                            <div class="alert alert-success">
                                <strong>Verification:</strong> 
                                @php
                                    $totalDistributed = 0;
                                    foreach($flexibleDistribution as $dist) {
                                        $totalDistributed += ($dist['perWinner'] * $dist['winners']);
                                    }
                                @endphp
                                Total distributed = {{ number_format($totalDistributed) }} coins 
                                ({{ $totalDistributed <= $prizePool ? '✅ Within budget' : '❌ Exceeds budget' }})
                            </div>
                        </div>
                    </div>
                </div>
                @endif
                
                <div class="row">
                    <!-- Data Flow Section -->
                    <div class="col-md-6 mb-4">
                        <div class="card border-primary">
                            <div class="card-header bg-primary text-white">
                                <h6 class="mb-0"><i class="bi bi-database me-2"></i>Data Loading Process</h6>
                            </div>
                            <div class="card-body">
                                <div class="timeline">
                                    <div class="timeline-item">
                                        <div class="timeline-marker bg-success"></div>
                                        <div class="timeline-content">
                                            <h6>1. Contest Data</h6>
                                            <p class="small text-muted">Fetches contest details, session info, and status from <code>contests</code> and <code>league_sessions</code> tables.</p>
                                        </div>
                                    </div>
                                    <div class="timeline-item">
                                        <div class="timeline-marker bg-warning"></div>
                                        <div class="timeline-content">
                                            <h6>2. Price Data</h6>
                                            <p class="small text-muted">Loads start/end prices from <code>session_asset_prices</code> table for session assets.</p>
                                        </div>
                                    </div>
                                    <div class="timeline-item">
                                        <div class="timeline-marker bg-info"></div>
                                        <div class="timeline-content">
                                            <h6>3. Participants</h6>
                                            <p class="small text-muted">Gets all contest entries with user details and basket information, sorted by score.</p>
                                        </div>
                                    </div>
                                    <div class="timeline-item">
                                        <div class="timeline-marker bg-danger"></div>
                                        <div class="timeline-content">
                                            <h6>4. Calculations</h6>
                                            <p class="small text-muted">Calculates pool amounts, fees, and prize distribution based on actual participants.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Technical Details -->
                    <div class="col-md-6 mb-4">
                        <div class="card border-success">
                            <div class="card-header bg-success text-white">
                                <h6 class="mb-0"><i class="bi bi-gear me-2"></i>Technical Implementation</h6>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <h6 class="text-success">Database Tables Used:</h6>
                                    <ul class="list-unstyled small">
                                        <li><code>contests</code> - Contest configuration</li>
                                        <li><code>contest_entries</code> - Participant data</li>
                                        <li><code>session_asset_prices</code> - Start/end prices</li>
                                        <li><code>contest_performance_prizes</code> - Prize structure</li>
                                        <li><code>transactions</code> - Wallet transactions</li>
                                    </ul>
                                </div>
                                <div class="mb-3">
                                    <h6 class="text-info">Current Contest Details:</h6>
                                    <ul class="list-unstyled small">
                                        <li><strong>Contest ID:</strong> {{ $contest->id }}</li>
                                        <li><strong>Session ID:</strong> {{ $contest->league_session_id }}</li>
                                        <li><strong>Category:</strong> {{ ucfirst($contest->category) }}</li>
                                        <li><strong>Status:</strong> {{ $contest->session_status }}</li>
                                        <li><strong>Created:</strong> {{ \Carbon\Carbon::parse($contest->created_at)->format('d M Y, h:i A') }}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Prize Distribution Logic -->
                <div class="card border-warning mb-4">
                    <div class="card-header bg-warning text-dark">
                        <h6 class="mb-0"><i class="bi bi-trophy me-2"></i>Prize Distribution Logic</h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="text-center p-3 bg-light rounded">
                                    <h6 class="text-primary">Upcoming Sessions</h6>
                                    <p class="small">Uses fixed distribution from database <code>prize_distribution</code> field</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="text-center p-3 bg-light rounded">
                                    <h6 class="text-success">Equal Category (Live)</h6>
                                    <p class="small">Recalculates amounts based on actual participants while maintaining equal structure</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="text-center p-3 bg-light rounded">
                                    <h6 class="text-danger">Mega/Flexible</h6>
                                    <p class="small">Uses dynamic distribution table with predefined percentages for different winner counts</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Interactive Features -->
                <div class="card border-info mb-4">
                    <div class="card-header bg-info text-white">
                        <h6 class="mb-0"><i class="bi bi-mouse me-2"></i>Interactive Features</h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="text-primary">Lazy Loading:</h6>
                                <ul class="small">
                                    <li><strong>Load Participants:</strong> AJAX call to get leaderboard data</li>
                                    <li><strong>Load Prices:</strong> AJAX call to get start/end prices</li>
                                    <li><strong>Performance:</strong> Reduces initial page load time</li>
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-success">Test Functions:</h6>
                                <ul class="small">
                                    <li><strong>Insert Test:</strong> Creates test transactions for all participants</li>
                                    <li><strong>View Tests:</strong> Shows ranked test transactions</li>
                                    <li><strong>Empty Tests:</strong> Deletes all test transactions</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- API Endpoints -->
                <div class="card border-secondary mb-4">
                    <div class="card-header bg-secondary text-white">
                        <h6 class="mb-0"><i class="bi bi-cloud me-2"></i>Key API Endpoints</h6>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>Endpoint</th>
                                        <th>Method</th>
                                        <th>Purpose</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><code>/admin/api/performance/{{ $contest->id }}/participants</code></td>
                                        <td><span class="badge bg-success">GET</span></td>
                                        <td>Lazy load participants</td>
                                    </tr>
                                    <tr>
                                        <td><code>/admin/api/performance/{{ $contest->id }}/prices</code></td>
                                        <td><span class="badge bg-success">GET</span></td>
                                        <td>Lazy load prices</td>
                                    </tr>
                                    <tr>
                                        <td><code>/api/flexible-pricing</code></td>
                                        <td><span class="badge bg-warning">POST</span></td>
                                        <td>Regenerate structure</td>
                                    </tr>
                                    <tr>
                                        <td><code>/api/v1/calculate-results</code></td>
                                        <td><span class="badge bg-warning">POST</span></td>
                                        <td>Recalculate results</td>
                                    </tr>
                                    <tr>
                                        <td><code>/api/insert-leaderboard-test-transactions/{{ $contest->id }}</code></td>
                                        <td><span class="badge bg-warning">POST</span></td>
                                        <td>Create test transactions</td>
                                    </tr>
                                    <tr>
                                        <td><code>/api/test-transactions-ranked/{{ $contest->id }}</code></td>
                                        <td><span class="badge bg-success">GET</span></td>
                                        <td>Get test transactions</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <!-- User-wise Prize Calculation -->
                <div class="card border-info mb-4">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0"><i class="bi bi-people me-2"></i>STEP 8: User-wise Prize Calculation</h5>
                    </div>
                    <div class="card-body">
                        @php
                            // Get all participants sorted by score
                            $sortedParticipants = $participants->sortByDesc('total_score')->values();
                            
                            // Calculate ranks with tie handling
                            $ranksWithTies = [];
                            $currentRank = 1;
                            $previousScore = null;
                            
                            foreach ($sortedParticipants as $index => $p) {
                                if ($previousScore !== null && $p->total_score == $previousScore) {
                                    $ranksWithTies[$index] = $currentRank; // Same rank for tied scores
                                } else {
                                    $currentRank = $index + 1; // Next available rank
                                    $ranksWithTies[$index] = $currentRank;
                                }
                                $previousScore = $p->total_score;
                            }
                            
                            // Calculate who gets what prize
                            $userPrizes = [];
                            $totalPrizeDistributed = 0;
                            
                            foreach ($sortedParticipants as $index => $participant) {
                                $rank = $ranksWithTies[$index];
                                $prize = 0;
                                $prizeGroup = null;
                                
                                // Find which prize group this rank falls into
                                if (isset($flexibleDistribution) && count($flexibleDistribution) > 0) {
                                    foreach ($flexibleDistribution as $dist) {
                                        // Extract rank range from label
                                        if (preg_match('/Ranks (\d+)-(\d+)/', $dist['label'], $matches)) {
                                            $startRank = intval($matches[1]);
                                            $endRank = intval($matches[2]);
                                            
                                            if ($rank >= $startRank && $rank <= $endRank) {
                                                $prize = $dist['perWinner'];
                                                $prizeGroup = $dist['label'];
                                                break;
                                            }
                                        }
                                    }
                                }
                                
                                if ($prize > 0) {
                                    $userPrizes[] = [
                                        'rank' => $rank,
                                        'user_id' => $participant->user_id,
                                        'user_name' => $participant->user_name ?? 'User ' . $participant->user_id,
                                        'user_mobile' => $participant->user_mobile ?? 'N/A',
                                        'score' => $participant->total_score ?? 0,
                                        'prize' => $prize,
                                        'prize_group' => $prizeGroup
                                    ];
                                    $totalPrizeDistributed += $prize;
                                }
                            }
                        @endphp
                        
                        <div class="row mb-3">
                            <div class="col-md-4">
                                <div class="alert alert-success text-center">
                                    <h6 class="mb-1">Total Winners</h6>
                                    <h4 class="mb-0">{{ count($userPrizes) }}</h4>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="alert alert-warning text-center">
                                    <h6 class="mb-1">Prize Distributed</h6>
                                    <h4 class="mb-0">{{ number_format($totalPrizeDistributed) }}</h4>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="alert alert-info text-center">
                                    <h6 class="mb-1">Remaining Pool</h6>
                                    <h4 class="mb-0">{{ number_format($prizePool - $totalPrizeDistributed) }}</h4>
                                </div>
                            </div>
                        </div>
                        
                        @if(count($userPrizes) > 0)
                            <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                <table class="table table-hover table-sm">
                                    <thead class="sticky-top bg-light">
                                        <tr>
                                            <th>Rank</th>
                                            <th>User Details</th>
                                            <th>Score</th>
                                            <th>Prize Group</th>
                                            <th class="text-end">Prize Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @foreach($userPrizes as $winner)
                                        <tr>
                                            <td>
                                                <span class="badge bg-primary fs-6">{{ $winner['rank'] }}</span>
                                            </td>
                                            <td>
                                                <div class="fw-bold">{{ $winner['user_name'] }}</div>
                                                <small class="text-muted">{{ $winner['user_mobile'] }}</small>
                                                <br><small class="text-info">ID: {{ $winner['user_id'] }}</small>
                                            </td>
                                            <td>
                                                <span class="fw-bold {{ $winner['score'] >= 0 ? 'text-success' : 'text-danger' }}">
                                                    {{ number_format($winner['score'], 2) }}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge bg-secondary">{{ $winner['prize_group'] }}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="fw-bold text-success fs-5">{{ number_format($winner['prize']) }} coins</span>
                                            </td>
                                        </tr>
                                        @endforeach
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="mt-3">
                                <div class="alert alert-info">
                                    <h6><i class="bi bi-info-circle me-2"></i>Prize Calculation Logic:</h6>
                                    <ol class="mb-0">
                                        <li><strong>Ranking:</strong> Users sorted by total_score (highest first)</li>
                                        <li><strong>Tie Handling:</strong> Same score = same rank</li>
                                        <li><strong>Prize Groups:</strong> Each rank falls into a prize group (Ranks 1-1, 2-2, etc.)</li>
                                        <li><strong>Prize Amount:</strong> Fixed amount per winner in each group</li>
                                        <li><strong>Distribution:</strong> Only winners (top {{ $totalWinners }} users) get prizes</li>
                                    </ol>
                                </div>
                            </div>
                        @else
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                No winners found. Either no participants or prize structure not configured.
                            </div>
                        @endif
                    </div>
                </div>
                
                <!-- Complete Leaderboard Data -->
                <div class="card border-success mb-4">
                    <div class="card-header bg-success text-white">
                        <h5 class="mb-0"><i class="bi bi-list-ol me-2"></i>STEP 9: Complete Leaderboard</h5>
                    </div>
                    <div class="card-body">
                        @if($participants->count() > 0)
                            <div class="alert alert-info">
                                <strong>Total Participants:</strong> {{ $participants->count() }} users joined this contest
                            </div>
                            
                            <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                <table class="table table-hover table-sm">
                                    <thead class="sticky-top bg-light">
                                        <tr>
                                            <th>Rank</th>
                                            <th>User Details</th>
                                            <th>Portfolio</th>
                                            <th>Score</th>
                                            <th>Wallet Balance</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @foreach($participants->sortByDesc('total_score') as $index => $participant)
                                        @php
                                            $rank = $index + 1;
                                            $score = floatval($participant->total_score ?? 0);
                                            $assets = [];
                                            $multipliers = [];
                                            
                                            try {
                                                $assets = json_decode($participant->assets ?? '[]', true) ?: [];
                                                $multipliers = json_decode($participant->multipliers ?? '[]', true) ?: [];
                                            } catch (Exception $e) {
                                                $assets = [];
                                                $multipliers = [];
                                            }
                                        @endphp
                                        <tr class="{{ $rank <= $totalWinners ? 'table-success' : '' }}">
                                            <td>
                                                <span class="badge {{ $rank <= $totalWinners ? 'bg-success' : 'bg-secondary' }} fs-6">
                                                    {{ $rank }}
                                                </span>
                                                @if($rank <= $totalWinners)
                                                    <small class="text-success d-block">WINNER</small>
                                                @endif
                                            </td>
                                            <td>
                                                <div class="fw-bold">{{ $participant->user_name ?? 'User ' . $participant->user_id }}</div>
                                                <small class="text-muted">{{ $participant->user_mobile ?? 'N/A' }}</small>
                                                <br><small class="text-info">ID: {{ $participant->user_id }}</small>
                                            </td>
                                            <td>
                                                @if(is_array($assets) && count($assets) > 0)
                                                    <div class="portfolio-assets">
                                                        @foreach($assets as $i => $asset)
                                                            <span class="badge bg-info me-1 mb-1">
                                                                {{ is_string($asset) ? $asset : 'Asset' }} 
                                                                @if(isset($multipliers[$i]) && is_numeric($multipliers[$i]))
                                                                    ({{ $multipliers[$i] }}x)
                                                                @endif
                                                            </span>
                                                        @endforeach
                                                    </div>
                                                @else
                                                    <small class="text-muted">No assets</small>
                                                @endif
                                            </td>
                                            <td>
                                                <span class="fw-bold fs-5 {{ $score >= 0 ? 'text-success' : 'text-danger' }}">
                                                    {{ $score >= 0 ? '+' : '' }}{{ number_format($score, 2) }}
                                                </span>
                                                <br><small class="text-muted">{{ $score >= 0 ? 'Profit' : 'Loss' }}</small>
                                            </td>
                                            <td>
                                                <div class="wallet-info">
                                                    <small><strong>Winnings:</strong> {{ number_format(floatval($participant->winnings_balance ?? 0), 2) }}</small>
                                                </div>
                                            </td>
                                            <td>
                                                @if($rank <= $totalWinners)
                                                    <span class="badge bg-success">Winner</span>
                                                @else
                                                    <span class="badge bg-secondary">Participant</span>
                                                @endif
                                            </td>
                                        </tr>
                                        @endforeach
                                    </tbody>
                                </table>
                            </div>
                        @else
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                No participants found in this contest.
                            </div>
                        @endif
                    </div>
                </div>
                
                <!-- Start & End Prices Data -->
                <div class="card border-warning mb-4">
                    <div class="card-header bg-warning text-dark">
                        <h5 class="mb-0"><i class="bi bi-graph-up me-2"></i>STEP 10: Asset Prices (Start vs End) with Time Validation</h5>
                    </div>
                    <div class="card-body">
                        @php
                            // Get all session assets (source of truth for asset list)
                            $allSessionAssets = \DB::table('league_session_assets')
                                ->where('league_session_id', $contest->league_session_id)
                                ->pluck('asset_symbol');

                            $sessionPricesMap = \DB::table('session_asset_prices')
                                ->where('league_session_id', $contest->league_session_id)
                                ->get()
                                ->keyBy('asset_symbol');

                            // Build $sessionStartPrices from ALL session assets, not just those with prices
                            $sessionStartPrices = $allSessionAssets->map(function($symbol) use ($sessionPricesMap) {
                                $row = $sessionPricesMap->get($symbol);
                                return (object)[
                                    'asset_symbol' => $symbol,
                                    'start_price'  => $row->start_price ?? null,
                                    'end_price'    => $row->end_price ?? null,
                                    'created_at'   => $row->created_at ?? null,
                                    'updated_at'   => $row->updated_at ?? null,
                                ];
                            });

                            $sessionEndPrices = $sessionPricesMap->filter(fn($r) => !is_null($r->end_price));
                                
                            // Get session timing details
                            $sessionDetails = \DB::table('league_sessions')
                                ->where('id', $contest->league_session_id)
                                ->first();
                                
                            // Price timing validation
                            $priceValidation = [];
                            $validationErrors = 0;
                            $validationWarnings = 0;
                            
                            if ($sessionDetails) {
                                $sessionStartTime = \Carbon\Carbon::parse($sessionDetails->start_time);
                                $sessionEndTime = \Carbon\Carbon::parse($sessionDetails->end_time);
                                
                                // Check start prices timing
                                foreach ($sessionStartPrices as $startPrice) {
                                    $priceTimestamp = \Carbon\Carbon::parse($startPrice->created_at ?? $startPrice->updated_at);
                                    $timeDiff = $priceTimestamp->diffInMinutes($sessionStartTime);
                                    
                                    if ($timeDiff > 30) { // More than 30 minutes difference
                                        $priceValidation[] = [
                                            'type' => 'error',
                                            'asset' => $startPrice->asset_symbol,
                                            'price_type' => 'Start Price',
                                            'expected_time' => $sessionStartTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionStartTime) ? 'late' : 'early'),
                                            'message' => 'Start price taken ' . $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionStartTime) ? 'after' : 'before') . ' session start'
                                        ];
                                        $validationErrors++;
                                    } elseif ($timeDiff > 10) { // 10-30 minutes difference
                                        $priceValidation[] = [
                                            'type' => 'warning',
                                            'asset' => $startPrice->asset_symbol,
                                            'price_type' => 'Start Price',
                                            'expected_time' => $sessionStartTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionStartTime) ? 'late' : 'early'),
                                            'message' => 'Start price timing acceptable but not optimal'
                                        ];
                                        $validationWarnings++;
                                    } else {
                                        $priceValidation[] = [
                                            'type' => 'success',
                                            'asset' => $startPrice->asset_symbol,
                                            'price_type' => 'Start Price',
                                            'expected_time' => $sessionStartTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionStartTime) ? 'late' : 'early'),
                                            'message' => 'Perfect timing - within acceptable range'
                                        ];
                                    }
                                }
                                
                                // Check end prices timing
                                foreach ($sessionEndPrices as $endPrice) {
                                    $priceTimestamp = \Carbon\Carbon::parse($endPrice->created_at ?? $endPrice->updated_at);
                                    $timeDiff = $priceTimestamp->diffInMinutes($sessionEndTime);
                                    
                                    if ($timeDiff > 30) {
                                        $priceValidation[] = [
                                            'type' => 'error',
                                            'asset' => $endPrice->asset_symbol,
                                            'price_type' => 'End Price',
                                            'expected_time' => $sessionEndTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionEndTime) ? 'late' : 'early'),
                                            'message' => 'End price taken ' . $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionEndTime) ? 'after' : 'before') . ' session end'
                                        ];
                                        $validationErrors++;
                                    } elseif ($timeDiff > 10) {
                                        $priceValidation[] = [
                                            'type' => 'warning',
                                            'asset' => $endPrice->asset_symbol,
                                            'price_type' => 'End Price',
                                            'expected_time' => $sessionEndTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionEndTime) ? 'late' : 'early'),
                                            'message' => 'End price timing acceptable but not optimal'
                                        ];
                                        $validationWarnings++;
                                    } else {
                                        $priceValidation[] = [
                                            'type' => 'success',
                                            'asset' => $endPrice->asset_symbol,
                                            'price_type' => 'End Price',
                                            'expected_time' => $sessionEndTime->format('d M Y, h:i A'),
                                            'actual_time' => $priceTimestamp->format('d M Y, h:i A'),
                                            'difference' => $timeDiff . ' minutes ' . ($priceTimestamp->gt($sessionEndTime) ? 'late' : 'early'),
                                            'message' => 'Perfect timing - within acceptable range'
                                        ];
                                    }
                                }
                            }
                        @endphp
                        
                        <!-- Session Timing Info -->
                        @if($sessionDetails)
                        <div class="alert alert-info mb-4">
                            <h6><i class="bi bi-clock me-2"></i>Session Timing Details:</h6>
                            <div class="row">
                                <div class="col-md-6">
                                    <strong>Session Start:</strong> {{ \Carbon\Carbon::parse($sessionDetails->start_time)->format('d M Y, h:i A') }}<br>
                                    <strong>Session End:</strong> {{ \Carbon\Carbon::parse($sessionDetails->end_time)->format('d M Y, h:i A') }}
                                </div>
                                <div class="col-md-6">
                                    <strong>Duration:</strong> {{ \Carbon\Carbon::parse($sessionDetails->start_time)->diffForHumans(\Carbon\Carbon::parse($sessionDetails->end_time), true) }}<br>
                                    <strong>Status:</strong> <span class="badge bg-{{ $contest->session_status == 'live' ? 'success' : ($contest->session_status == 'completed' ? 'secondary' : 'warning') }}">{{ strtoupper($contest->session_status) }}</span>
                                </div>
                            </div>
                        </div>
                        @endif
                        
                        <!-- Price Timing Validation Summary -->
                        <div class="row mb-4">
                            <div class="col-md-3">
                                <div class="alert {{ $validationErrors == 0 ? 'alert-success' : 'alert-danger' }} text-center">
                                    <h6 class="mb-1">{{ $validationErrors == 0 ? '✅ No Timing Errors' : '❌ ' . $validationErrors . ' Timing Errors' }}</h6>
                                    <small>Critical timing issues</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="alert {{ $validationWarnings == 0 ? 'alert-success' : 'alert-warning' }} text-center">
                                    <h6 class="mb-1">{{ $validationWarnings == 0 ? '✅ No Warnings' : '⚠️ ' . $validationWarnings . ' Warnings' }}</h6>
                                    <small>Timing could be better</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="alert alert-info text-center">
                                    <h6 class="mb-1">📊 Start Prices</h6>
                                    <h4 class="mb-0">{{ $sessionStartPrices->count() }}</h4>
                                    <small>Assets with start prices</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="alert alert-success text-center">
                                    <h6 class="mb-1">🏁 End Prices</h6>
                                    <h4 class="mb-0">{{ $sessionEndPrices->count() }}</h4>
                                    <small>Assets with end prices</small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Price Timing Validation Details -->
                        @if(count($priceValidation) > 0)
                        <div class="card mb-4">
                            <div class="card-header bg-light">
                                <h6 class="mb-0">🕐 Price Timing Validation Report</h6>
                            </div>
                            <div class="card-body">
                                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                                    <table class="table table-hover table-sm">
                                        <thead class="sticky-top bg-light">
                                            <tr>
                                                <th>Asset</th>
                                                <th>Price Type</th>
                                                <th>Expected Time</th>
                                                <th>Actual Time</th>
                                                <th>Difference</th>
                                                <th>Status</th>
                                                <th>Message</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @foreach($priceValidation as $validation)
                                            <tr class="{{ $validation['type'] == 'error' ? 'table-danger' : ($validation['type'] == 'warning' ? 'table-warning' : 'table-success') }}">
                                                <td><strong>{{ $validation['asset'] }}</strong></td>
                                                <td>
                                                    <span class="badge {{ $validation['price_type'] == 'Start Price' ? 'bg-primary' : 'bg-secondary' }}">
                                                        {{ $validation['price_type'] }}
                                                    </span>
                                                </td>
                                                <td><small>{{ $validation['expected_time'] }}</small></td>
                                                <td><small>{{ $validation['actual_time'] }}</small></td>
                                                <td>
                                                    <span class="badge {{ $validation['type'] == 'error' ? 'bg-danger' : ($validation['type'] == 'warning' ? 'bg-warning' : 'bg-success') }}">
                                                        {{ $validation['difference'] }}
                                                    </span>
                                                </td>
                                                <td>
                                                    @if($validation['type'] == 'error')
                                                        <i class="bi bi-x-circle text-danger"></i>
                                                    @elseif($validation['type'] == 'warning')
                                                        <i class="bi bi-exclamation-triangle text-warning"></i>
                                                    @else
                                                        <i class="bi bi-check-circle text-success"></i>
                                                    @endif
                                                </td>
                                                <td><small>{{ $validation['message'] }}</small></td>
                                            </tr>
                                            @endforeach
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        @endif
                        
                        <!-- Price Data Table -->
                        @if($sessionStartPrices->count() > 0)
                            <div class="card">
                                <div class="card-header bg-secondary text-white">
                                    <h6 class="mb-0">📈 Complete Price Data with Timestamps</h6>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                        <table class="table table-hover table-sm mb-0">
                                            <thead class="sticky-top bg-light">
                                                <tr>
                                                    <th>Asset Symbol</th>
                                                    <th class="text-end">Start Price</th>
                                                    <th>Start Time</th>
                                                    <th class="text-end">End Price</th>
                                                    <th>End Time</th>
                                                    <th class="text-end">Change</th>
                                                    <th class="text-end">Change %</th>
                                                    <th>Timing Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @foreach($sessionStartPrices as $startPrice)
                                                @php
                                                    $endPrice = $sessionEndPrices->get($startPrice->asset_symbol);
                                                    $startVal = $startPrice->start_price ? floatval($startPrice->start_price) : null;
                                                    $endVal = $endPrice ? floatval($endPrice->end_price) : null;
                                                    $change = ($startVal && $endVal) ? ($endVal - $startVal) : null;
                                                    $changePercent = ($startVal > 0 && $change !== null) ? (($change / $startVal) * 100) : null;
                                                    
                                                    // Get timing validation for this asset
                                                    $startValidation = collect($priceValidation)->where('asset', $startPrice->asset_symbol)->where('price_type', 'Start Price')->first();
                                                    $endValidation = collect($priceValidation)->where('asset', $startPrice->asset_symbol)->where('price_type', 'End Price')->first();
                                                @endphp
                                                <tr>
                                                    <td><strong>{{ $startPrice->asset_symbol }}</strong></td>
                                                    <td class="text-end">
                                                        @if($startVal !== null)
                                                            ₹{{ number_format($startVal, 2) }}
                                                        @else
                                                            <span class="badge bg-danger">Missing</span>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        <small>{{ \Carbon\Carbon::parse($startPrice->created_at ?? $startPrice->updated_at)->format('d M, h:i A') }}</small>
                                                        @if($startValidation)
                                                            <br><span class="badge badge-sm {{ $startValidation['type'] == 'error' ? 'bg-danger' : ($startValidation['type'] == 'warning' ? 'bg-warning' : 'bg-success') }}">
                                                                {{ $startValidation['difference'] }}
                                                            </span>
                                                        @endif
                                                    </td>
                                                    <td class="text-end">
                                                        @if($endVal)
                                                            ₹{{ number_format($endVal, 2) }}
                                                        @else
                                                            <span class="text-muted">Pending</span>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        @if($endPrice)
                                                            <small>{{ \Carbon\Carbon::parse($endPrice->created_at ?? $endPrice->updated_at)->format('d M, h:i A') }}</small>
                                                            @if($endValidation)
                                                                <br><span class="badge badge-sm {{ $endValidation['type'] == 'error' ? 'bg-danger' : ($endValidation['type'] == 'warning' ? 'bg-warning' : 'bg-success') }}">
                                                                    {{ $endValidation['difference'] }}
                                                                </span>
                                                            @endif
                                                        @else
                                                            <span class="text-muted">-</span>
                                                        @endif
                                                    </td>
                                                    <td class="text-end">
                                                        @if($change !== null)
                                                            <span class="fw-bold {{ $change >= 0 ? 'text-success' : 'text-danger' }}">
                                                                {{ $change >= 0 ? '+' : '' }}₹{{ number_format($change, 2) }}
                                                            </span>
                                                        @else
                                                            <span class="text-muted">-</span>
                                                        @endif
                                                    </td>
                                                    <td class="text-end">
                                                        @if($changePercent !== null)
                                                            <span class="fw-bold {{ $changePercent >= 0 ? 'text-success' : 'text-danger' }}">
                                                                {{ $changePercent >= 0 ? '▲' : '▼' }} {{ number_format(abs($changePercent), 2) }}%
                                                            </span>
                                                        @else
                                                            <span class="text-muted">-</span>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        @php
                                                            $hasError = ($startValidation && $startValidation['type'] == 'error') || ($endValidation && $endValidation['type'] == 'error');
                                                            $hasWarning = ($startValidation && $startValidation['type'] == 'warning') || ($endValidation && $endValidation['type'] == 'warning');
                                                        @endphp
                                                        @if($hasError)
                                                            <span class="badge bg-danger">❌ Timing Error</span>
                                                        @elseif($hasWarning)
                                                            <span class="badge bg-warning">⚠️ Check Timing</span>
                                                        @else
                                                            <span class="badge bg-success">✅ Perfect</span>
                                                        @endif
                                                    </td>
                                                </tr>
                                                @endforeach
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                        <!-- Historical Price Verification -->
                        <div class="card border-info mb-4">
                            <div class="card-header bg-info text-white">
                                <h6 class="mb-0"><i class="bi bi-search me-2"></i>Historical Price Verification via API</h6>
                            </div>
                            <div class="card-body">
                                <div class="alert alert-info">
                                    <h6><i class="bi bi-info-circle me-2"></i>API Price Verification:</h6>
                                    <p class="mb-2">This section fetches historical prices from external APIs to verify if our saved prices were accurate at that time.</p>
                                    <button class="btn btn-primary btn-sm" onclick="verifyHistoricalPrices()">🔍 Verify All Prices via API</button>
                                    <button class="btn btn-secondary btn-sm ms-2" onclick="clearVerificationResults()">🗑️ Clear Results</button>
                                </div>
                                
                                <div id="verificationResults" style="display: none;">
                                    <div class="card mt-3">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0">📊 API Verification Results</h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="verificationContent">
                                                <!-- Results will be populated here -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Price Error Analysis -->
                        <div class="card border-danger mb-4">
                            <div class="card-header bg-danger text-white">
                                <h6 class="mb-0"><i class="bi bi-bug me-2"></i>Price Error Analysis & Root Cause Detection</h6>
                            </div>
                            <div class="card-body">
                                <div class="alert alert-info">
                                    <h6><i class="bi bi-info-circle me-2"></i>Error Analysis:</h6>
                                    <p class="mb-2">This section analyzes why prices might be incorrect and identifies the root cause of pricing errors.</p>
                                    <button class="btn btn-danger btn-sm" onclick="analyzeErrorReasons()">🔍 Analyze Error Reasons</button>
                                    <button class="btn btn-secondary btn-sm ms-2" onclick="clearErrorAnalysis()">🗑️ Clear Analysis</button>
                                </div>
                                
                                <div id="errorAnalysisResults" style="display: none;">
                                    <div class="card mt-3">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0">🔍 Error Analysis Results</h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="errorAnalysisContent">
                                                <!-- Results will be populated here -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <script>
    // Error Analysis Functions
    async function analyzeErrorReasons() {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Analyzing...';
        
        const resultsDiv = document.getElementById('errorAnalysisResults');
        const contentDiv = document.getElementById('errorAnalysisContent');
        
        resultsDiv.style.display = 'block';
        contentDiv.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-danger"></div><br><small>Analyzing price errors and root causes...</small></div>';
        
        try {
            const response = await fetch('{{ url('/admin/api/analyze-price-errors') }}/{{ $contest->league_session_id }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': '{{ csrf_token() }}'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                displayErrorAnalysis(data.analysis_results);
            } else {
                contentDiv.innerHTML = `<div class="alert alert-danger">Error: ${data.error || 'Failed to analyze errors'}</div>`;
            }
        } catch (error) {
            console.error('Analysis error:', error);
            contentDiv.innerHTML = `<div class="alert alert-danger">Network error: ${error.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
    
    function displayErrorAnalysis(results) {
        const contentDiv = document.getElementById('errorAnalysisContent');
        
        if (!results || results.length === 0) {
            contentDiv.innerHTML = '<div class="alert alert-success">No significant errors detected in price data.</div>';
            return;
        }
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="alert alert-danger text-center">
                        <h6 class="mb-1">🚫 Critical Issues</h6>
                        <h4 class="mb-0" id="criticalCount">0</h4>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="alert alert-warning text-center">
                        <h6 class="mb-1">⚠️ Timing Issues</h6>
                        <h4 class="mb-0" id="timingCount">0</h4>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="alert alert-info text-center">
                        <h6 class="mb-1">🔌 API Issues</h6>
                        <h4 class="mb-0" id="apiCount">0</h4>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="alert alert-secondary text-center">
                        <h6 class="mb-1">📊 Data Issues</h6>
                        <h4 class="mb-0" id="dataCount">0</h4>
                    </div>
                </div>
            </div>
            
            <div class="accordion" id="errorAnalysisAccordion">
        `;
        
        let criticalCount = 0, timingCount = 0, apiCount = 0, dataCount = 0;
        
        results.forEach((analysis, index) => {
            let alertClass, iconClass, categoryText;
            
            switch(analysis.error_category) {
                case 'critical':
                    alertClass = 'alert-danger';
                    iconClass = 'bi-exclamation-triangle-fill text-danger';
                    categoryText = 'Critical Issue';
                    criticalCount++;
                    break;
                case 'timing':
                    alertClass = 'alert-warning';
                    iconClass = 'bi-clock-fill text-warning';
                    categoryText = 'Timing Issue';
                    timingCount++;
                    break;
                case 'api':
                    alertClass = 'alert-info';
                    iconClass = 'bi-wifi-off text-info';
                    categoryText = 'API Issue';
                    apiCount++;
                    break;
                default:
                    alertClass = 'alert-secondary';
                    iconClass = 'bi-question-circle text-secondary';
                    categoryText = 'Data Issue';
                    dataCount++;
            }
            
            html += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="errorHeading${index}">
                        <button class="accordion-button collapsed ${alertClass}" type="button" data-bs-toggle="collapse" data-bs-target="#errorCollapse${index}">
                            <i class="${iconClass} me-2"></i>
                            <strong>${analysis.asset_symbol}</strong> - ${categoryText}: ${analysis.error_title}
                        </button>
                    </h2>
                    <div id="errorCollapse${index}" class="accordion-collapse collapse" data-bs-parent="#errorAnalysisAccordion">
                        <div class="accordion-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6 class="text-danger">Problem Details:</h6>
                                    <p><strong>Asset:</strong> ${analysis.asset_symbol}</p>
                                    <p><strong>Price Type:</strong> ${analysis.price_type}</p>
                                    <p><strong>Our Price:</strong> ₹${parseFloat(analysis.our_price).toFixed(2)}</p>
                                    <p><strong>Expected Price:</strong> ₹${parseFloat(analysis.expected_price || 0).toFixed(2)}</p>
                                    <p><strong>Difference:</strong> <span class="text-danger">${analysis.difference_percent}%</span></p>
                                </div>
                                <div class="col-md-6">
                                    <h6 class="text-info">Root Cause Analysis:</h6>
                                    <div class="alert ${alertClass}">
                                        <strong>Reason:</strong> ${analysis.root_cause}<br>
                                        <strong>Impact:</strong> ${analysis.impact_level}<br>
                                        <strong>When:</strong> ${new Date(analysis.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-3">
                                <h6 class="text-success">Recommended Solutions:</h6>
                                <ul class="list-group list-group-flush">
                                    ${analysis.solutions.map(solution => `<li class="list-group-item">✓ ${solution}</li>`).join('')}
                                </ul>
                            </div>
                            
                            ${analysis.technical_details ? `
                                <div class="mt-3">
                                    <h6 class="text-secondary">Technical Details:</h6>
                                    <div class="bg-light p-2 rounded">
                                        <small><code>${analysis.technical_details}</code></small>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
            
            <div class="alert alert-info mt-3">
                <h6>📊 Error Categories Explained:</h6>
                <div class="row">
                    <div class="col-md-3">
                        <div class="text-center p-2 bg-danger text-white rounded">
                            <strong>🚫 Critical Issues</strong><br>
                            <small>System/Logic errors</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center p-2 bg-warning text-dark rounded">
                            <strong>⚠️ Timing Issues</strong><br>
                            <small>Wrong time capture</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center p-2 bg-info text-white rounded">
                            <strong>🔌 API Issues</strong><br>
                            <small>External API problems</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center p-2 bg-secondary text-white rounded">
                            <strong>📊 Data Issues</strong><br>
                            <small>Data quality problems</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        contentDiv.innerHTML = html;
        
        // Update summary counts
        document.getElementById('criticalCount').textContent = criticalCount;
        document.getElementById('timingCount').textContent = timingCount;
        document.getElementById('apiCount').textContent = apiCount;
        document.getElementById('dataCount').textContent = dataCount;
    }
    
    function clearErrorAnalysis() {
        document.getElementById('errorAnalysisResults').style.display = 'none';
    }
    
    // Historical Price Verification Functions
    async function verifyHistoricalPrices() {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Verifying...';
        
        const resultsDiv = document.getElementById('verificationResults');
        const contentDiv = document.getElementById('verificationContent');
        
        resultsDiv.style.display = 'block';
        contentDiv.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div><br><small>Fetching real historical prices from APIs...</small></div>';
        
        try {
            const response = await fetch('{{ url('/admin/api/verify-historical-prices') }}/{{ $contest->league_session_id }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': '{{ csrf_token() }}'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                displayVerificationResults(data.verification_results);
            } else {
                contentDiv.innerHTML = `<div class="alert alert-danger">Error: ${data.error || 'Failed to verify prices'}</div>`;
            }
        } catch (error) {
            console.error('Verification error:', error);
            contentDiv.innerHTML = `<div class="alert alert-danger">Network error: ${error.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
    
    function displayVerificationResults(results) {
        const contentDiv = document.getElementById('verificationContent');
        
        if (!results || results.length === 0) {
            contentDiv.innerHTML = '<div class="alert alert-warning">No verification results available.</div>';
            return;
        }
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-2">
                    <div class="alert alert-success text-center">
                        <h6 class="mb-1">✅ Sahi Prices</h6>
                        <h4 class="mb-0" id="accurateCount">0</h4>
                        <small>≤2% difference</small>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="alert alert-warning text-center">
                        <h6 class="mb-1">⚠️ Thoda Galat</h6>
                        <h4 class="mb-0" id="minorDiffCount">0</h4>
                        <small>2-5% difference</small>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="alert alert-danger text-center">
                        <h6 class="mb-1">❌ Bilkul Galat</h6>
                        <h4 class="mb-0" id="majorDiffCount">0</h4>
                        <small>>5% difference</small>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="alert alert-secondary text-center">
                        <h6 class="mb-1">🔌 API Error</h6>
                        <h4 class="mb-0" id="apiErrorCount">0</h4>
                        <small>API failed</small>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="alert alert-info text-center">
                        <h6 class="mb-1">📊 Total</h6>
                        <h4 class="mb-0" id="totalCount">${results.length}</h4>
                        <small>prices checked</small>
                    </div>
                </div>
                <div class="col-md-2">
                    <div class="alert alert-primary text-center">
                        <h6 class="mb-1">🎯 Accuracy</h6>
                        <h4 class="mb-0" id="accuracyRate">0%</h4>
                        <small>overall rate</small>
                    </div>
                </div>
            </div>
            
            <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                <table class="table table-hover table-sm">
                    <thead class="sticky-top bg-light">
                        <tr>
                            <th>Asset</th>
                            <th>Price Type</th>
                            <th>Hamara Price</th>
                            <th>Real API Price</th>
                            <th>Difference</th>
                            <th>Status</th>
                            <th>Time</th>
                            <th>API Source</th>
                            <th>Galat Kyun?</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let accurateCount = 0, minorDiffCount = 0, majorDiffCount = 0, apiErrorCount = 0;
        
        results.forEach(result => {
            const diffPercent = result.api_error ? 0 : (result.api_price > 0 ? Math.abs((result.our_price - result.api_price) / result.api_price * 100) : 0);
            let statusClass, statusIcon, statusText, reasonText, reasonClass;
            
            if (result.api_error) {
                statusClass = 'table-secondary';
                statusIcon = '🔌';
                statusText = 'API Error';
                reasonText = result.error_reason || 'API call failed';
                reasonClass = 'text-secondary';
                apiErrorCount++;
            } else {
                if (diffPercent <= 2) {
                    statusClass = 'table-success';
                    statusIcon = '✅';
                    statusText = 'Sahi Hai';
                    reasonText = 'Perfect match';
                    reasonClass = 'text-success';
                    accurateCount++;
                } else if (diffPercent <= 5) {
                    statusClass = 'table-warning';
                    statusIcon = '⚠️';
                    statusText = 'Thoda Galat';
                    reasonText = 'API delay mein price change ho gaya';
                    reasonClass = 'text-warning';
                    minorDiffCount++;
                } else {
                    statusClass = 'table-danger';
                    statusIcon = '❌';
                    statusText = 'Bilkul Galat';
                    reasonText = diffPercent > 50 ? 'Database corruption - galat price store hua' : 'Wrong API endpoint se data fetch kiya';
                    reasonClass = 'text-danger';
                    majorDiffCount++;
                }
            }
            
            html += `
                <tr class="${statusClass}">
                    <td><strong>${result.asset_symbol}</strong></td>
                    <td>
                        <span class="badge ${result.price_type === 'start' ? 'bg-primary' : 'bg-secondary'}">
                            ${result.price_type === 'start' ? 'Start Price' : 'End Price'}
                        </span>
                    </td>
                    <td class="text-end">
                        <strong>₹${parseFloat(result.our_price).toFixed(2)}</strong>
                        <br><small class="text-muted">Our stored price</small>
                    </td>
                    <td class="text-end">
                        ${result.api_error ? 
                            '<span class="text-muted">API Failed</span>' : 
                            '<strong>₹' + parseFloat(result.api_price).toFixed(2) + '</strong><br><small class="text-muted">Real market price</small>'
                        }
                    </td>
                    <td class="text-end">
                        ${result.api_error ? 
                            '<span class="text-muted">-</span>' : 
                            '<span class="fw-bold fs-5 ' + (diffPercent > 5 ? 'text-danger' : diffPercent > 2 ? 'text-warning' : 'text-success') + '">' + 
                            diffPercent.toFixed(2) + '%</span><br>' +
                            '<small class="text-muted">₹' + Math.abs(result.our_price - result.api_price).toFixed(2) + ' diff</small>'
                        }
                    </td>
                    <td class="text-center">
                        ${statusIcon}<br>
                        <span class="badge bg-${result.api_error ? 'secondary' : diffPercent <= 2 ? 'success' : diffPercent <= 5 ? 'warning' : 'danger'}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <small>${new Date(result.timestamp).toLocaleString('en-IN')}</small>
                        <br><small class="text-muted">${result.response_time || 'N/A'}</small>
                    </td>
                    <td><small class="text-info">${result.api_source || 'External API'}</small></td>
                    <td>
                        <small class="${reasonClass}">
                            <strong>${reasonText}</strong>
                        </small>
                        ${result.technical_details ? '<br><small class="text-muted">' + result.technical_details + '</small>' : ''}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <div class="alert alert-info mt-3">
                <h6>📊 Detailed Analysis Report:</h6>
                <div class="row">
                    <div class="col-md-4">
                        <h6 class="text-primary">Price Accuracy Summary:</h6>
                        <ul class="mb-0">
                            <li><strong>Total Verified:</strong> ${results.length} prices</li>
                            <li><strong>Accurate Prices:</strong> ${accurateCount} (${((accurateCount / results.length) * 100).toFixed(1)}%)</li>
                            <li><strong>Minor Issues:</strong> ${minorDiffCount} (${((minorDiffCount / results.length) * 100).toFixed(1)}%)</li>
                            <li><strong>Major Issues:</strong> ${majorDiffCount} (${((majorDiffCount / results.length) * 100).toFixed(1)}%)</li>
                        </ul>
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-success">System Performance:</h6>
                        <ul class="mb-0">
                            <li><strong>API Success Rate:</strong> ${(((results.length - apiErrorCount) / results.length) * 100).toFixed(1)}%</li>
                            <li><strong>Average Difference:</strong> ${apiErrorCount < results.length ? (results.filter(r => !r.api_error).reduce((sum, r) => sum + r.difference_percent, 0) / (results.length - apiErrorCount)).toFixed(2) + '%' : 'N/A'}</li>
                            <li><strong>API Failures:</strong> ${apiErrorCount} out of ${results.length}</li>
                        </ul>
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-warning">Common Issues Found:</h6>
                        <ul class="mb-0">
                            <li><strong>Timing Issues:</strong> ${results.filter(r => r.possible_reason && r.possible_reason.includes('timing')).length}</li>
                            <li><strong>API Delays:</strong> ${results.filter(r => r.possible_reason && r.possible_reason.includes('delay')).length}</li>
                            <li><strong>Market Volatility:</strong> ${results.filter(r => r.possible_reason && r.possible_reason.includes('volatility')).length}</li>
                            <li><strong>Source Mismatch:</strong> ${results.filter(r => r.possible_reason && r.possible_reason.includes('source')).length}</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div class="alert alert-warning mt-3">
                <h6>🔍 Kyun Galat Ho Sakta Hai Price:</h6>
                <div class="row">
                    <div class="col-md-6">
                        <h6 class="text-danger">Technical Reasons:</h6>
                        <ul class="small">
                            <li><strong>API Timing:</strong> Hamara system aur external API ka time different ho sakta hai</li>
                            <li><strong>Network Delay:</strong> API call mein delay ki wajah se price change ho gayi</li>
                            <li><strong>Different Sources:</strong> Hum alag API use kar rahe, market mein alag API</li>
                            <li><strong>Caching Issues:</strong> Old cached price use ho gayi instead of live price</li>
                        </ul>
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-info">Market Reasons:</h6>
                        <ul class="small">
                            <li><strong>High Volatility:</strong> Market mein rapid price changes ho rahe the</li>
                            <li><strong>Low Liquidity:</strong> Kam trading volume ki wajah se price fluctuation</li>
                            <li><strong>Exchange Differences:</strong> Different exchanges pe different prices</li>
                            <li><strong>After Hours Trading:</strong> Market close ke baad bhi trading chal rahi thi</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        contentDiv.innerHTML = html;
        
        // Update summary counts
        document.getElementById('accurateCount').textContent = accurateCount;
        document.getElementById('minorDiffCount').textContent = minorDiffCount;
        document.getElementById('majorDiffCount').textContent = majorDiffCount;
        document.getElementById('apiErrorCount').textContent = apiErrorCount;
        document.getElementById('totalCount').textContent = results.length;
        document.getElementById('accuracyRate').textContent = ((accurateCount / results.length) * 100).toFixed(1) + '%';
    }

    

</script>
                        @else
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                No price data available. Session may not have started yet.
                            </div>
                        @endif
                    </div>
                </div>
                
                <!-- Transaction History -->
                <div class="card border-danger mb-4">
                    <div class="card-header bg-danger text-white">
                        <h5 class="mb-0"><i class="bi bi-credit-card me-2"></i>STEP 11: Transaction History & Analysis</h5>
                    </div>
                    <div class="card-body">
                        @php
                            // Get all participant user IDs
                            $participantUserIds = $participants->pluck('user_id')->toArray();
                            
                            // Fetch all transactions for these participants FOR THIS CONTEST ONLY
                            $contestTransactions = \DB::table('transactions')
                                ->join('users', 'transactions.user_id', '=', 'users.id')
                                ->whereIn('transactions.user_id', $participantUserIds)
                                ->where(function($q) use ($contest) {
                                    $q->where('transactions.contest_id', $contest->id)
                                      ->orWhere('transactions.description', 'like', '%Contest #' . $contest->id . '%')
                                      ->orWhere('transactions.description', 'like', '%contest ' . $contest->id . '%');
                                })
                                ->select(
                                    'transactions.*',
                                    'users.name as user_name',
                                    'users.mobile as user_mobile'
                                )
                                ->orderBy('transactions.created_at', 'desc')
                                ->get();
                                
                            // Group transactions by type for analysis
                            $entryTransactions = $contestTransactions->where('type', 'contest_entry');
                            $winningTransactions = $contestTransactions->where('type', 'winnings');
                            $depositTransactions = $contestTransactions->where('type', 'deposit');
                            $withdrawalTransactions = $contestTransactions->where('type', 'withdrawal');
                            
                            $totalEntryAmount = $entryTransactions->sum('amount');
                            $totalWinningAmount = $winningTransactions->sum('amount');
                            $totalDepositAmount = $depositTransactions->sum('amount');
                            $totalWithdrawalAmount = $withdrawalTransactions->sum('amount');
                            
                            // Calculate platform profit/loss
                            $platformProfit = $totalEntryAmount - $totalWinningAmount;
                        @endphp
                        
                        <!-- Transaction Flow Explanation -->
                        <div class="alert alert-info mb-4">
                            <h6><i class="bi bi-info-circle me-2"></i>Transaction Flow Explanation:</h6>
                            <div class="row">
                                <div class="col-md-6">
                                    <h6 class="text-primary">Money IN (Platform Receives):</h6>
                                    <ul class="small mb-0">
                                        <li><strong>Contest Entry:</strong> Users pay entry fee to join contest</li>
                                        <li><strong>Deposits:</strong> Users add money to their wallet</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6 class="text-danger">Money OUT (Platform Pays):</h6>
                                    <ul class="small mb-0">
                                        <li><strong>Winnings:</strong> Prize money distributed to winners</li>
                                        <li><strong>Withdrawals:</strong> Users withdraw money from wallet</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Summary Cards with Detailed Breakdown -->
                        <div class="row mb-4">
                            <div class="col-md-3">
                                <div class="card border-primary">
                                    <div class="card-header bg-primary text-white text-center">
                                        <h6 class="mb-0">💰 Entry Fees</h6>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="text-success">{{ $entryTransactions->count() }}</h4>
                                        <p class="mb-1"><strong>₹{{ number_format($totalEntryAmount, 2) }}</strong></p>
                                        <small class="text-muted">Users paid to join contest</small>
                                        <hr>
                                        <small><strong>Why:</strong> Each user pays ₹{{ $contest->entry_fee }} to participate</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-success">
                                    <div class="card-header bg-success text-white text-center">
                                        <h6 class="mb-0">🏆 Winnings</h6>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="text-success">{{ $winningTransactions->count() }}</h4>
                                        <p class="mb-1"><strong>₹{{ number_format($totalWinningAmount, 2) }}</strong></p>
                                        <small class="text-muted">Prize money distributed</small>
                                        <hr>
                                        <small><strong>Why:</strong> Winners get their share from prize pool</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-info">
                                    <div class="card-header bg-info text-white text-center">
                                        <h6 class="mb-0">📈 Platform Profit</h6>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="{{ $platformProfit >= 0 ? 'text-success' : 'text-danger' }}">₹{{ number_format($platformProfit, 2) }}</h4>
                                        <small class="text-muted">Entry Fees - Winnings</small>
                                        <hr>
                                        <small><strong>Why:</strong> Platform keeps {{ $contest->platform_fee }}% as commission</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-warning">
                                    <div class="card-header bg-warning text-dark text-center">
                                        <h6 class="mb-0">📊 Total Activity</h6>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="text-primary">{{ $contestTransactions->count() }}</h4>
                                        <p class="mb-1"><strong>All Transactions</strong></p>
                                        <small class="text-muted">Complete transaction history</small>
                                        <hr>
                                        <small><strong>Why:</strong> All money movements for this contest</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Transaction Categories -->
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0">🔍 Transaction Categories Breakdown</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <h6 class="text-success">✅ Expected Transactions:</h6>
                                                <ul class="list-group list-group-flush">
                                                    <li class="list-group-item d-flex justify-content-between">
                                                        <span><strong>Contest Entry Fees:</strong> {{ $entryTransactions->count() }} transactions</span>
                                                        <span class="badge bg-success">₹{{ number_format($totalEntryAmount, 2) }}</span>
                                                    </li>
                                                    <li class="list-group-item d-flex justify-content-between">
                                                        <span><strong>Prize Winnings:</strong> {{ $winningTransactions->count() }} transactions</span>
                                                        <span class="badge bg-primary">₹{{ number_format($totalWinningAmount, 2) }}</span>
                                                    </li>
                                                </ul>
                                            </div>
                                            <div class="col-md-6">
                                                <h6 class="text-info">ℹ️ Additional Transactions:</h6>
                                                <ul class="list-group list-group-flush">
                                                    <li class="list-group-item d-flex justify-content-between">
                                                        <span><strong>Wallet Deposits:</strong> {{ $depositTransactions->count() }} transactions</span>
                                                        <span class="badge bg-info">₹{{ number_format($totalDepositAmount, 2) }}</span>
                                                    </li>
                                                    <li class="list-group-item d-flex justify-content-between">
                                                        <span><strong>Wallet Withdrawals:</strong> {{ $withdrawalTransactions->count() }} transactions</span>
                                                        <span class="badge bg-warning">₹{{ number_format($totalWithdrawalAmount, 2) }}</span>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        @if($contestTransactions->count() > 0)
                            <!-- Detailed Transaction Table -->
                            <div class="card">
                                <div class="card-header bg-secondary text-white">
                                    <h6 class="mb-0">📋 Complete Transaction Log</h6>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                        <table class="table table-hover table-sm mb-0">
                                            <thead class="sticky-top bg-light">
                                                <tr>
                                                    <th>Date & Time</th>
                                                    <th>User</th>
                                                    <th>Transaction Type</th>
                                                    <th class="text-end">Amount</th>
                                                    <th>Status</th>
                                                    <th>Purpose & Reason</th>
                                                    <th>Transaction ID</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @foreach($contestTransactions as $transaction)
                                                @php
                                                    // Detect duplicate transactions
                                                    $isDuplicate = false;
                                                    $duplicateReason = '';
                                                    $duplicateIcon = '';
                                                    $duplicateClass = '';
                                                    
                                                    // Check for duplicate prize transactions
                                                    if ($transaction->type == 'winnings') {
                                                        $duplicateCount = $contestTransactions->where('user_id', $transaction->user_id)
                                                            ->where('type', 'winnings')
                                                            ->where('amount', $transaction->amount)
                                                            ->where('description', $transaction->description)
                                                            ->count();
                                                            
                                                        if ($duplicateCount > 1) {
                                                            $isDuplicate = true;
                                                            $duplicateReason = 'Prize distribution code ran TWICE simultaneously - Race Condition';
                                                            $duplicateIcon = '⚠️ DUPLICATE';
                                                            $duplicateClass = 'table-warning';
                                                        }
                                                    }
                                                    
                                                    // Check for wrong entry fee amounts
                                                    if ($transaction->type == 'contest_entry') {
                                                        if ($transaction->amount != $contest->entry_fee) {
                                                            $isDuplicate = true;
                                                            $multiplier = $transaction->amount / $contest->entry_fee;
                                                            $duplicateReason = "Entry fee calculation BUG: Used count(user_entries) × ₹{$contest->entry_fee} = ₹{$transaction->amount} instead of fixed ₹{$contest->entry_fee}";
                                                            $duplicateIcon = '🐛 WRONG AMOUNT';
                                                            $duplicateClass = 'table-danger';
                                                        }
                                                        
                                                        if ($transaction->status == 'pending') {
                                                            $isDuplicate = true;
                                                            $duplicateReason = 'Transaction stuck in PENDING status - Status update logic missing';
                                                            $duplicateIcon = '⏳ PENDING BUG';
                                                            $duplicateClass = 'table-info';
                                                        }
                                                    }
                                                @endphp
                                                <tr class="{{ $isDuplicate ? $duplicateClass : '' }}{{ $transaction->type == 'contest_entry' ? ' table-warning' : ($transaction->type == 'winnings' ? ' table-success' : '') }}">
                                                    <td>
                                                        <small>{{ \Carbon\Carbon::parse($transaction->created_at)->format('d M Y') }}</small>
                                                        <br><small class="text-muted">{{ \Carbon\Carbon::parse($transaction->created_at)->format('h:i A') }}</small>
                                                        @if($isDuplicate)
                                                            <br><span class="badge bg-danger small">{{ $duplicateIcon }}</span>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        <div class="fw-bold">{{ $transaction->user_name ?? 'User ' . $transaction->user_id }}</div>
                                                        <small class="text-muted">{{ $transaction->user_mobile ?? 'N/A' }}</small>
                                                    </td>
                                                    <td>
                                                        @if($transaction->type == 'winnings')
                                                            <span class="badge bg-success mb-1">🏆 Prize Winning</span>
                                                            <br><small class="text-success">Money OUT (Platform pays winner)</small>
                                                        @elseif($transaction->type == 'contest_entry')
                                                            <span class="badge bg-warning mb-1">🎯 Contest Entry</span>
                                                            <br><small class="text-warning">Money IN (User pays to join)</small>
                                                        @elseif($transaction->type == 'deposit')
                                                            <span class="badge bg-primary mb-1">💳 Wallet Deposit</span>
                                                            <br><small class="text-primary">Money IN (User adds funds)</small>
                                                        @elseif($transaction->type == 'withdrawal')
                                                            <span class="badge bg-danger mb-1">💸 Wallet Withdrawal</span>
                                                            <br><small class="text-danger">Money OUT (User withdraws)</small>
                                                        @else
                                                            <span class="badge bg-secondary mb-1">{{ ucfirst($transaction->type) }}</span>
                                                            <br><small class="text-muted">Other transaction</small>
                                                        @endif
                                                    </td>
                                                    <td class="text-end">
                                                        <span class="fw-bold fs-5 {{ $transaction->type == 'winnings' || $transaction->type == 'deposit' ? 'text-success' : 'text-danger' }}">
                                                            {{ $transaction->type == 'winnings' || $transaction->type == 'deposit' ? '+' : '-' }}₹{{ number_format($transaction->amount, 2) }}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        @if($transaction->status == 'success')
                                                            <span class="badge bg-success">✅ Success</span>
                                                        @elseif($transaction->status == 'pending')
                                                            <span class="badge bg-warning">⏳ Pending</span>
                                                        @else
                                                            <span class="badge bg-danger">❌ Failed</span>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        @if($transaction->type == 'contest_entry')
                                                            <strong>Entry Fee Payment</strong><br>
                                                            <small class="text-muted">User paid ₹{{ $contest->entry_fee }} to join Contest #{{ $contest->id }}</small>
                                                            @if($isDuplicate)
                                                                <br><div class="alert alert-danger p-1 mt-1 small">
                                                                    <strong>ERROR:</strong> {{ $duplicateReason }}
                                                                </div>
                                                            @endif
                                                        @elseif($transaction->type == 'winnings')
                                                            <strong>Prize Distribution</strong><br>
                                                            <small class="text-muted">Winner received prize money from Contest #{{ $contest->id }}</small>
                                                            @if($isDuplicate)
                                                                <br><div class="alert alert-warning p-1 mt-1 small">
                                                                    <strong>DUPLICATE:</strong> {{ $duplicateReason }}
                                                                </div>
                                                            @endif
                                                        @elseif($transaction->type == 'deposit')
                                                            <strong>Wallet Top-up</strong><br>
                                                            <small class="text-muted">User added money to wallet for contest participation</small>
                                                        @elseif($transaction->type == 'withdrawal')
                                                            <strong>Wallet Withdrawal</strong><br>
                                                            <small class="text-muted">User withdrew winnings from wallet</small>
                                                        @else
                                                            <strong>{{ ucfirst($transaction->type) }}</strong><br>
                                                            <small class="text-muted">{{ $transaction->description ?? 'No description available' }}</small>
                                                        @endif
                                                    </td>
                                                    <td>
                                                        <small class="font-monospace">{{ $transaction->transaction_id ?? 'N/A' }}</small>
                                                    </td>
                                                </tr>
                                                @endforeach
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Transaction Summary Analysis -->
                            <div class="alert alert-info mt-3">
                                <h6><i class="bi bi-calculator me-2"></i>Transaction Analysis Summary:</h6>
                                <div class="row">
                                    <div class="col-md-6">
                                        <ul class="mb-0">
                                            <li><strong>Expected Entry Transactions:</strong> {{ $participants->count() }} (one per participant)</li>
                                            <li><strong>Actual Entry Transactions:</strong> {{ $entryTransactions->count() }}</li>
                                            <li><strong>Expected Winners:</strong> {{ $stats['actual_winners'] ?? 0 }}</li>
                                            <li><strong>Actual Winning Transactions:</strong> {{ $winningTransactions->count() }}</li>
                                        </ul>
                                    </div>
                                    <div class="col-md-6">
                                        <ul class="mb-0">
                                            <li><strong>Platform Revenue:</strong> ₹{{ number_format($totalEntryAmount, 2) }} (from entry fees)</li>
                                            <li><strong>Platform Expense:</strong> ₹{{ number_format($totalWinningAmount, 2) }} (prize distribution)</li>
                                            <li><strong>Net Platform Profit:</strong> ₹{{ number_format($platformProfit, 2) }}</li>
                                            <li><strong>Platform Fee %:</strong> {{ $contest->platform_fee }}% ({{ number_format(($platformProfit / max($totalEntryAmount, 1)) * 100, 2) }}% actual)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        @else
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <strong>No Transactions Found</strong><br>
                                This could mean:
                                <ul class="mb-0 mt-2">
                                    <li>Contest is new and users haven't paid entry fees yet</li>
                                    <li>Contest is completed but prizes haven't been distributed</li>
                                    <li>There's an issue with transaction recording</li>
                                </ul>
                            </div>
                        @endif
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" onclick="window.open('https://docs.google.com/document/d/your-doc-id', '_blank')">View Full Documentation</button>
            </div>
        </div>
    </div>
</div>

<style>
.timeline {
    position: relative;
    padding-left: 30px;
}

.timeline-item {
    position: relative;
    margin-bottom: 20px;
}

.timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: -21px;
    top: 20px;
    height: calc(100% + 10px);
    width: 2px;
    background-color: #dee2e6;
}

.timeline-marker {
    position: absolute;
    left: -25px;
    top: 5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 2px #dee2e6;
}

.timeline-content h6 {
    margin-bottom: 5px;
    color: #495057;
}

.modal-xl {
    max-width: 1200px;
}

/* New Calculation Styles */
.calculation-step {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.step-header {
    font-weight: bold;
    border-bottom: 1px solid rgba(255,255,255,0.2);
}

.step-content {
    border: 1px solid #dee2e6;
    border-top: none;
}

.formula-box {
    background: #fff;
    border: 1px dashed #007bff;
    padding: 8px 12px;
    border-radius: 4px;
    text-align: center;
}

.calculation-line {
    text-align: center;
    font-size: 1.1em;
}

.metric-box {
    text-align: center;
    padding: 10px;
}

.metric-value {
    font-size: 1.5em;
    font-weight: bold;
}

.metric-label {
    font-size: 0.9em;
    color: #6c757d;
    margin-top: 4px;
}

.summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.summary-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: #fff;
    border-radius: 4px;
    border-left: 3px solid #007bff;
}

.summary-item .label {
    font-weight: 500;
    color: #495057;
}

.summary-item .value {
    font-weight: bold;
}

.prize-breakdown-card {
    background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%);
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 15px;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.prize-rank-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.rank-badge {
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.9em;
    font-weight: bold;
}

.winners-count {
    background: #e9ecef;
    color: #495057;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.8em;
}

.prize-amount-large {
    font-size: 1.8em;
    font-weight: bold;
    color: #28a745;
    margin: 8px 0;
}

.per-winner-text {
    color: #6c757d;
    font-size: 0.9em;
}
</style>

<!-- Test Transactions Modal -->
<div class="modal fade" id="testTransactionsModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
                <h5 class="modal-title"><i class="bi bi-cash-coin me-2"></i>Test Transactions</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <button class="btn btn-danger btn-sm" onclick="emptyTestTransactions()">
                        <i class="bi bi-trash me-1"></i>Empty Test Transactions
                    </button>
                </div>
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-hover table-sm">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th>Rank</th>
                                <th>User</th>
                                <th>Score</th>
                                <th>Transaction ID</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Created At</th>
                            </tr>
                        </thead>
                        <tbody id="testTransactionsTable">
                            <tr>
                                <td colspan="7" class="text-center">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.distribution-item { 
    background: #f8f9fa; 
    border-left: 4px solid #007bff; 
    margin-bottom: 10px; 
    padding: 15px;
    border-radius: 5px;
}
.prize-amount { color: #28a745; font-weight: bold; }
.rank-label { color: #6c757d; font-size: 0.9em; }
.bg-gradient-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
}
.bg-gradient-info {
    background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
}
.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
}
.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
}
</style>

<!-- Analysis Modal -->
<div class="modal fade" id="checkTransactionsModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title"><i class="bi bi-check-circle me-2"></i>Preview Transactions (Not Saved)</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Preview Only:</strong> This shows how transactions would look if inserted. No data will be saved to database.
                </div>
                
                @php
                    $sortedParticipants = $participants->sortByDesc('total_score')->values();
                    $ranksWithTies = [];
                    $currentRank = 1;
                    $previousScore = null;
                    
                    foreach ($sortedParticipants as $index => $p) {
                        if ($previousScore !== null && $p->total_score == $previousScore) {
                            $ranksWithTies[$index] = $currentRank;
                        } else {
                            $currentRank = $index + 1;
                            $ranksWithTies[$index] = $currentRank;
                        }
                        $previousScore = $p->total_score;
                    }
                    
                    $previewTransactions = [];
                    $prizeDistribution = \DB::table('contest_performance_prizes')
                        ->where('contest_id', $contest->id)
                        ->orderBy('rank_start')
                        ->get();
                    
                    foreach ($sortedParticipants as $index => $participant) {
                        $rank = $ranksWithTies[$index];
                        $tiedCount = 0;
                        foreach ($ranksWithTies as $r) {
                            if ($r == $rank) $tiedCount++;
                        }
                        
                        $prize = 0;
                        if ($tiedCount > 1) {
                            $totalPrize = 0;
                            for ($r = $rank; $r < $rank + $tiedCount; $r++) {
                                foreach ($prizeDistribution as $dist) {
                                    if ($r >= $dist->rank_start && $r <= $dist->rank_end) {
                                        $totalPrize += $dist->per_winner_amount;
                                        break;
                                    }
                                }
                            }
                            $prize = $totalPrize > 0 ? floor($totalPrize / $tiedCount) : 0;
                        } else {
                            foreach ($prizeDistribution as $dist) {
                                if ($rank >= $dist->rank_start && $rank <= $dist->rank_end) {
                                    $prize = $dist->per_winner_amount;
                                    break;
                                }
                            }
                        }
                        
                        if ($prize > 0) {
                            $previewTransactions[] = [
                                'user_id' => $participant->user_id,
                                'user_name' => $participant->user_name ?? 'User ' . $participant->user_id,
                                'user_mobile' => $participant->user_mobile ?? 'N/A',
                                'rank' => $rank,
                                'score' => $participant->total_score ?? 0,
                                'prize' => floor($prize),
                                'transaction_id' => 'CONTEST_' . $contest->id . '_ENTRY_' . $participant->id,
                                'description' => 'Prize for ' . strtoupper($contest->category) . ' contest ' . $contest->id . ', entry ' . $participant->id,
                                'tied' => $tiedCount > 1
                            ];
                        }
                    }
                @endphp
                
                @if(count($previewTransactions) > 0)
                    <div class="alert alert-success">
                        <strong>Total Transactions to be Created:</strong> {{ count($previewTransactions) }}
                    </div>
                    
                    <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                        <table class="table table-hover table-sm">
                            <thead class="sticky-top bg-light">
                                <tr>
                                    <th>#</th>
                                    <th>User</th>
                                    <th>Rank</th>
                                    <th>Score</th>
                                    <th class="text-end">Amount</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Transaction ID</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($previewTransactions as $index => $trans)
                                <tr>
                                    <td>{{ $index + 1 }}</td>
                                    <td>
                                        <div class="fw-bold">{{ $trans['user_name'] }}</div>
                                        <small class="text-muted">{{ $trans['user_mobile'] }}</small>
                                    </td>
                                    <td>
                                        <span class="badge {{ $trans['tied'] ? 'bg-warning' : 'bg-primary' }}">{{ $trans['rank'] }}</span>
                                        @if($trans['tied'])
                                            <small class="text-muted">(tied)</small>
                                        @endif
                                    </td>
                                    <td>
                                        <span class="fw-bold {{ $trans['score'] >= 0 ? 'text-success' : 'text-danger' }}">
                                            {{ number_format($trans['score'], 2) }}
                                        </span>
                                    </td>
                                    <td class="text-end">
                                        <span class="fw-bold text-success">+{{ number_format($trans['prize'], 0) }}</span>
                                    </td>
                                    <td><span class="badge bg-success">winnings</span></td>
                                    <td><span class="badge bg-success">success</span></td>
                                    <td><small class="font-monospace">{{ $trans['transaction_id'] }}</small></td>
                                    <td><small class="text-muted">{{ $trans['description'] }}</small></td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @else
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle me-2"></i>
                        No winning transactions to create. Either no winners or prizes not configured.
                    </div>
                @endif
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- Analysis Modal -->
<div class="modal fade" id="analysisModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header bg-info text-white">
                <h5 class="modal-title"><i class="bi bi-graph-up me-2"></i>Contest Wallet Transaction Analysis</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                @php
                    // Get all participant user IDs
                    $participantUserIds = $participants->pluck('user_id')->toArray();
                    
                    // Fetch all transactions for these participants FOR THIS CONTEST ONLY
                    $allTransactions = \DB::table('transactions')
                        ->join('users', 'transactions.user_id', '=', 'users.id')
                        ->whereIn('transactions.user_id', $participantUserIds)
                        ->where(function($q) use ($contest) {
                            $q->where('transactions.contest_id', $contest->id)
                              ->orWhere('transactions.description', 'like', '%Contest #' . $contest->id . '%')
                              ->orWhere('transactions.description', 'like', '%contest ' . $contest->id . '%');
                        })
                        ->select(
                            'transactions.*',
                            'users.name as user_name',
                            'users.mobile as user_mobile',
                            'users.deposit_balance',
                            'users.winnings_balance'
                        )
                        ->orderBy('transactions.created_at', 'desc')
                        ->get();
                    
                    // Calculate ranks for all participants
                    $participantRanks = [];
                    $participantScores = [];
                    $sortedParticipants = $participants->sortByDesc('total_score')->values();
                    $currentRank = 1;
                    $previousScore = null;
                    foreach ($sortedParticipants as $index => $p) {
                        if ($previousScore !== null && $p->total_score == $previousScore) {
                            $participantRanks[$p->user_id] = $currentRank;
                        } else {
                            $currentRank = $index + 1;
                            $participantRanks[$p->user_id] = $currentRank;
                        }
                        $participantScores[$p->user_id] = $p->total_score;
                        $previousScore = $p->total_score;
                    }
                @endphp
                
                @if($allTransactions->count() > 0)
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <div class="alert alert-info mb-0">
                                <i class="bi bi-info-circle me-2"></i>
                                <strong>Total Transactions:</strong> <span id="totalTransCount">{{ $allTransactions->count() }}</span>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <select class="form-select" id="userFilter">
                                <option value="">All Users</option>
                                @foreach($participants->sortBy('user_name') as $p)
                                    <option value="{{ $p->user_id }}">{{ $p->user_name ?? 'User ' . $p->user_id }} ({{ $p->user_mobile ?? 'N/A' }})</option>
                                @endforeach
                            </select>
                        </div>
                    </div>
                    
                    <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                        <table class="table table-hover table-sm">
                            <thead class="sticky-top bg-light">
                                <tr>
                                    <th>Date</th>
                                    <th>User</th>
                                    <th>Rank</th>
                                    <th>Score</th>
                                    <th>Type</th>
                                    <th class="text-end">Amount</th>
                                    <th>Status</th>
                                    <th>Current Wallet</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($allTransactions as $trans)
                                @php
                                    $userRank = $participantRanks[$trans->user_id] ?? '-';
                                    $userScore = $participantScores[$trans->user_id] ?? null;
                                @endphp
                                <tr class="transaction-row" data-user-id="{{ $trans->user_id }}">
                                    <td><small>{{ \Carbon\Carbon::parse($trans->created_at)->format('d M Y, h:i A') }}</small></td>
                                    <td>
                                        <div class="fw-bold">{{ $trans->user_name ?? 'User ' . $trans->user_id }}</div>
                                        <small class="text-muted">{{ $trans->user_mobile ?? 'N/A' }}</small>
                                    </td>
                                    <td>
                                        @if($userRank !== '-')
                                            <span class="badge bg-primary">{{ $userRank }}</span>
                                        @else
                                            <span class="text-muted">-</span>
                                        @endif
                                    </td>
                                    <td>
                                        @if($userScore !== null)
                                            <span class="fw-bold {{ $userScore >= 0 ? 'text-success' : 'text-danger' }}">
                                                {{ number_format($userScore, 2) }}
                                            </span>
                                        @else
                                            <span class="text-muted">-</span>
                                        @endif
                                    </td>
                                    <td>
                                        @if($trans->type == 'winnings')
                                            <span class="badge bg-success">Winnings</span>
                                        @elseif($trans->type == 'contest_entry')
                                            <span class="badge bg-warning">Entry</span>
                                        @elseif($trans->type == 'deposit')
                                            <span class="badge bg-primary">Deposit</span>
                                        @elseif($trans->type == 'withdrawal')
                                            <span class="badge bg-danger">Withdrawal</span>
                                        @else
                                            <span class="badge bg-secondary">{{ ucfirst($trans->type) }}</span>
                                        @endif
                                    </td>
                                    <td class="text-end">
                                        <span class="fw-bold {{ $trans->type == 'winnings' || $trans->type == 'deposit' ? 'text-success' : 'text-danger' }}">
                                            {{ $trans->type == 'winnings' || $trans->type == 'deposit' ? '+' : '-' }}{{ number_format($trans->amount, 2) }}
                                        </span>
                                    </td>
                                    <td>
                                        @if($trans->status == 'success')
                                            <span class="badge bg-success">Success</span>
                                        @elseif($trans->status == 'pending')
                                            <span class="badge bg-warning">Pending</span>
                                        @else
                                            <span class="badge bg-danger">Failed</span>
                                        @endif
                                    </td>
                                    <td>
                                        <small>
                                            <strong>D:</strong> {{ number_format($trans->deposit_balance, 2) }}<br>
                                            <strong>W:</strong> {{ number_format($trans->winnings_balance, 2) }}
                                        </small>
                                    </td>
                                    <td><small class="text-muted">{{ $trans->description ?? '-' }}</small></td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @else
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        No wallet transactions found for this contest.
                    </div>
                @endif
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script>
// Global function definitions (accessible from onclick attributes)

window.runAll = function() {
    var st = document.getElementById('runAllStartTime') ? document.getElementById('runAllStartTime').value : '';
    var et = document.getElementById('runAllEndTime') ? document.getElementById('runAllEndTime').value : '';
    if (!st || !et) { alert('Start Time aur End Time fields mein time likho!'); return; }
    if (st >= et) { alert('End time start time se baad honi chahiye!'); return; }
    if (!confirm('RUN ALL schedule karo?\n\nStart: ' + st + '\nEnd: ' + et + '\n\nBackground mein chalegi!')) return;

    var btn = document.getElementById('runAllBtn');
    var orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Scheduled...';

    var badge = document.getElementById('runAllStatusBadge');
    var stopBtn = document.getElementById('stopRunAllBtn');
    if (badge) badge.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'inline-block';

    var logDiv = document.getElementById('runAllLog');
    if (!logDiv) {
        logDiv = document.createElement('div');
        logDiv.id = 'runAllLog';
        logDiv.style = 'position:fixed;bottom:20px;right:20px;background:#1a1a2e;color:#00ff88;padding:15px 20px;border-radius:10px;z-index:9999;font-family:monospace;font-size:13px;max-width:420px;max-height:300px;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
        document.body.appendChild(logDiv);
    }
    logDiv.innerHTML = '<b>RUN ALL</b><br>Start: ' + st + ' | End: ' + et + '<br><hr style="border-color:#333">';

    fetch('{{ url("admin/api/run-all") }}/{{ $contest->id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' },
        body: JSON.stringify({ start_time: st, end_time: et })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            logDiv.innerHTML += 'Queued! Start: ' + data.start + ' End: ' + data.end + '<br>Polling...<br>';
            var pollUrl = data.poll_url;
            var iv = setInterval(function() {
                fetch(pollUrl).then(function(r){ return r.json(); }).then(function(d) {
                    if (d.log) {
                        logDiv.innerHTML = '<b>RUN ALL</b><br><hr style="border-color:#333">';
                        d.log.forEach(function(l){ logDiv.innerHTML += l + '<br>'; });
                        logDiv.scrollTop = logDiv.scrollHeight;
                    }
                    if (d.status === 'done') {
                        clearInterval(iv);
                        logDiv.innerHTML += '<br><b style="color:#ffff00">ALL DONE!</b>';
                        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Done!';
                        if (badge) badge.style.display = 'none';
                        if (stopBtn) stopBtn.style.display = 'none';
                        setTimeout(function(){ location.reload(); }, 2500);
                    } else if (d.status === 'failed') {
                        clearInterval(iv);
                        btn.disabled = false; btn.innerHTML = orig;
                        if (badge) badge.style.display = 'none';
                        if (stopBtn) stopBtn.style.display = 'none';
                    }
                }).catch(function(){});
            }, 3000);
        } else {
            logDiv.innerHTML += 'Error: ' + (data.message || 'Failed');
            btn.disabled = false; btn.innerHTML = orig;
            if (badge) badge.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
        }
    })
    .catch(function(e) {
        alert('Error: ' + e.message);
        btn.disabled = false; btn.innerHTML = orig;
        if (badge) badge.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
    });
}
function openWorkingModal() {
    const modal = new bootstrap.Modal(document.getElementById('workingModal'));
    modal.show();
}

window.declareResult = function() {
    if (!confirm('Declare Result for contest {{ $contest->id }}?\n\nThis will:\n1. Calculate final scores\n2. Assign final ranks\n3. Distribute prizes to winners wallets\n\n⚠️ This action cannot be undone!')) return;
    const btn = document.getElementById('declareResultBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Declaring...';
    fetch('{{ url('admin/api/declare-result') }}/{{ $contest->id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('✅ Result Declared!\n\n' + (data.message || '') + '\nEntries processed: ' + (data.entries_processed || 0));
            location.reload();
        } else {
            alert('❌ Error: ' + (data.error || data.message || 'Failed'));
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

window.runCalculation = function() {
    if (!confirm('Run Calculation for contest {{ $contest->id }}?\n\nThis will:\n1. Calculate scores for all entries\n2. Assign ranks\n\nWallet will NOT be credited.')) return;
    const btn = document.getElementById('runCalculationBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Running...';
    fetch('{{ url('admin/api/run-calculation') }}/{{ $contest->id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('✅ Calculation done!\n\n' + (data.message || '') + '\nEntries processed: ' + (data.entries_processed || 0));
            location.reload();
        } else {
            alert('❌ Error: ' + (data.error || data.message || 'Failed'));
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

window.phase1SessionStart = function() {
    if (!confirm('Run Phase 1 for session {{ $contest->league_session_id }}?\n\nThis will:\n1. Fetch & save start prices\n2. Mark contests as live\n3. Save prize structure')) return;
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Running...';
    fetch('{{ url('admin/api/phase1-session-start') }}/{{ $contest->league_session_id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            let msg = '✅ Phase 1 Complete!\n\nStart prices saved: ' + data.start_prices_saved + '\n\n';
            if (data.contests && data.contests.length) msg += data.contests.join('\n');
            alert(msg);
            location.reload();
        } else {
            alert('❌ Error: ' + (data.message || 'Failed'));
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

window.phase2LiveScores = function() {
    if (!confirm('Run Phase 2 for session {{ $contest->league_session_id }}?\n\nThis will:\n1. Fetch & update end prices\n2. Recalculate scores\n3. Update ranks\n\nWallet will NOT be credited.')) return;
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Running...';
    fetch('{{ url('admin/api/phase2-live-scores') }}/{{ $contest->league_session_id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            let msg = '✅ Phase 2 Complete!\n\nEnd prices updated: ' + data.end_prices_updated + '\n\n';
            if (data.contests && data.contests.length) msg += data.contests.join('\n');
            alert(msg);
            location.reload();
        } else {
            alert('❌ Error: ' + (data.message || 'Failed'));
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

window.phase4OrphanFix = function() {
    if (!confirm('Run Phase 4 for session {{ $contest->league_session_id }}?\n\nThis will mark all live/upcoming contests as completed.')) return;
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Fixing...';
    fetch('{{ url('admin/api/phase4-orphan-fix') }}/{{ $contest->league_session_id }}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('✅ ' + data.message);
            location.reload();
        } else {
            alert('❌ Error: ' + (data.message || 'Failed'));
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

function insertTestTransaction() {
    console.log('insertTestTransaction called');
    
    const btn = event.target;
    if (btn.disabled) {
        console.log('Button already disabled, ignoring click');
        return; // Prevent multiple clicks
    }
    
    if (!confirm('Create test transactions for all leaderboard users in contest {{ $contest->id }}?')) return;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Creating...';
    
    console.log('Making API call to:', '{{ url('/api/insert-leaderboard-test-transactions') }}/{{ $contest->id }}');
    
    fetch('{{ url('/api/insert-leaderboard-test-transactions') }}/{{ $contest->id }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('API Response:', data);
        if (data.success) {
            alert('Test transactions created for all leaderboard users!\nTotal: ' + data.total_transactions + ' transactions');
        } else {
            alert('Error: ' + (data.message || 'Failed'));
        }
    })
    .catch(error => {
        console.error('API Error:', error);
        alert('Error: ' + error.message);
    })
    .finally(() => {
        // Add a small delay before re-enabling to prevent accidental double-clicks
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-plus-circle"></i> Insert Test';
        }, 1000);
    });
}



document.addEventListener('DOMContentLoaded', function() {
    console.log('Performance page loaded successfully');
    const startSessionBtn = document.getElementById('startSessionBtn');
    const endSessionBtn = document.getElementById('endSessionBtn');
    
    // User filter for analysis modal
    const userFilter = document.getElementById('userFilter');
    if (userFilter) {
        userFilter.addEventListener('change', function() {
            const selectedUserId = this.value;
            const rows = document.querySelectorAll('.transaction-row');
            let visibleCount = 0;
            
            rows.forEach(row => {
                if (!selectedUserId || row.dataset.userId === selectedUserId) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            document.getElementById('totalTransCount').textContent = visibleCount;
        });
    }
    
    // Auto-generate structure on page load
    regenerateStructure();
    
    const regenerateBtn = document.getElementById('regenerateBtn');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', function() {
            regenerateStructure();
        });
    }
    
    // Start Session
    if (startSessionBtn) {
        startSessionBtn.addEventListener('click', function() {
            startSession();
        });
    }
    
    // End Session
    if (endSessionBtn) {
        endSessionBtn.addEventListener('click', function() {
            endSession();
        });
    }

    
    function regenerateStructure() {
        const contestData = {
            participants: {{ $stats['total_participants'] ?? 10 }},
            entry_fee: {{ $contest->entry_fee ?? 10 }},
            platform_fee: {{ $contest->platform_fee ?? 10 }},
            winning_percentage: {{ $contest->winning_percentage ?? 30 }},
            category: '{{ $contest->category ?? 'mega' }}'
        };
        
        // Skip validation if no participants yet
        if (!contestData.participants || contestData.participants < 1) {
            console.log('No participants yet, skipping regenerate');
            const regenerateBtn = document.getElementById('regenerateBtn');
            if (regenerateBtn) {
                regenerateBtn.disabled = false;
                regenerateBtn.innerHTML = 'Regenerate Structure';
            }
            return;
        }
        
        const regenerateBtn = document.getElementById('regenerateBtn');
        if (regenerateBtn) {
            regenerateBtn.disabled = true;
            regenerateBtn.innerHTML = 'Generating...';
        }
        
        fetch('{{ url("/api/flexible-pricing") }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
            },
            body: JSON.stringify(contestData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }
            
            // Update stats
            document.getElementById('totalWinners').textContent = data.totalWinners;
            document.getElementById('totalPool').textContent = Math.floor(data.totalPool) + ' coins';
            document.getElementById('platformFee').textContent = Math.floor(data.platformFeeAmount) + ' coins';
            document.getElementById('prizePool').textContent = Math.floor(data.totalPrizePool) + ' coins';
            
            // Update distribution
            const container = document.getElementById('distributionContainer');
            container.innerHTML = '';
            
            if (data.distribution && data.distribution.length > 0) {
                data.distribution.forEach(dist => {
                    const div = document.createElement('div');
                    div.className = 'col-md-6 mb-3';
                    div.innerHTML = `
                        <div class="distribution-item">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="mb-1">${dist.label}</h6>
                                    <span class="rank-label">${dist.winners} winners • ${dist.percent}%</span>
                                </div>
                                <div class="text-end">
                                    <div class="prize-amount">${Math.floor(dist.perWinner)} coins</div>
                                    <small class="text-muted">per winner</small>
                                </div>
                            </div>
                        </div>
                    `;
                    container.appendChild(div);
                });
            }
            
            // Save API data to database
            fetch('{{ url("/api/v1/save-api-structure") }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                body: JSON.stringify({
                    contest_id: {{ $contest->id }},
                    participants: {{ $stats['total_participants'] }},
                    api_data: data
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    console.log('API structure saved to database');
                } else {
                    console.error('Failed to save API structure:', result.error);
                }
            })
            .catch(error => {
                console.error('Error saving API structure:', error);
            });
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to regenerate structure');
        })
        .finally(() => {
            const regenerateBtn = document.getElementById('regenerateBtn');
            if (regenerateBtn) {
                regenerateBtn.disabled = false;
                regenerateBtn.innerHTML = 'Regenerate Structure';
            }
        });
    }
    
    // Start Session
    function startSession() {
        if (!confirm('Are you sure you want to start this session?')) return;
        
        const btn = document.getElementById('startSessionBtn');
        const statusBadge = document.getElementById('sessionStatus');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Starting...';
        
        fetch('{{ url("/admin/api/start-session") }}/{{ $contest->league_session_id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                statusBadge.textContent = '🔴 LIVE';
                statusBadge.className = 'badge bg-success';
                alert('Session started successfully!');
                location.reload();
            } else {
                alert('Error: ' + (data.message || 'Failed to start session'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-play-fill"></i> Start Session';
        });
    }
    
    // End Session
    function endSession() {
        if (!confirm('Are you sure you want to end this session? This action cannot be undone.')) return;
        
        const btn = document.getElementById('endSessionBtn');
        const statusBadge = document.getElementById('sessionStatus');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Ending...';
        
        fetch('{{ url("/admin/api/end-session") }}/{{ $contest->league_session_id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                statusBadge.textContent = '✅ COMPLETED';
                statusBadge.className = 'badge bg-secondary';
                alert('Session ended successfully!');
                location.reload();
            } else {
                alert('Error: ' + (data.message || 'Failed to end session'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-stop-fill"></i> End Session';
        });
    }
    
    // Calculate results
    window.calculateResults = function() {
        if (!confirm('Recalculate contest results based on current start/end prices?')) return;
        
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Calculating...';
        
        fetch('{{ url('/api/v1/calculate-results') }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            },
            body: JSON.stringify({ contest_id: {{ $contest->id }} })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                location.reload();
            } else {
                alert('Error: ' + data.error);
            }
        })
        .catch(error => alert('Error: ' + error.message))
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-calculator"></i> Calculate Results';
        });
    }
    
    // Test Transaction
    window.testTransaction = function() {
        if (!confirm('Create a test transaction for contest {{ $contest->id }}?')) return;
        
        fetch('{{ url('/api/test-transaction-contest') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Test transaction created successfully!\nTransaction ID: ' + data.transaction_id);
            } else {
                alert('Error: ' + (data.message || 'Failed to create transaction'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        });
    }
    
    // Load test transactions when modal opens
    const testTransactionsModal = document.getElementById('testTransactionsModal');
    if (testTransactionsModal) {
        testTransactionsModal.addEventListener('show.bs.modal', function() {
            loadTestTransactions();
        });
    }
    
    window.loadTestTransactions = function() {
        console.log('Loading test transactions...');
        fetch('{{ url('/api/test-transactions-ranked') }}/{{ $contest->id }}')
            .then(response => {
                console.log('Response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('API Response:', data);
                const tbody = document.getElementById('testTransactionsTable');
                if (data.transactions && data.transactions.length > 0) {
                    let html = '';
                    let currentRank = null;
                    
                    data.transactions.forEach((t, index) => {
                        // Add rank group header when rank changes
                        if (currentRank !== t.rank) {
                            currentRank = t.rank;
                            html += `
                                <tr class="table-primary">
                                    <td colspan="7" class="fw-bold text-center py-2">
                                        <i class="bi bi-trophy me-2"></i>RANK ${t.rank || 'N/A'}
                                    </td>
                                </tr>
                            `;
                        }
                        
                        html += `
                            <tr>
                                <td><span class="badge bg-primary">${t.rank || '-'}</span></td>
                                <td>
                                    <div class="fw-bold">${t.user_name || 'User ' + t.user_id}</div>
                                    <small class="text-muted">ID: ${t.user_id}</small>
                                </td>
                                <td><span class="fw-bold ${(t.score || 0) >= 0 ? 'text-success' : 'text-danger'}">${parseFloat(t.score || 0).toFixed(2)}</span></td>
                                <td><code class="small">${t.transaction_id}</code></td>
                                <td class="text-success fw-bold">₹${parseFloat(t.amount).toFixed(2)}</td>
                                <td><span class="badge bg-success">${t.status}</span></td>
                                <td><small>${new Date(t.created_at).toLocaleString()}</small></td>
                            </tr>
                        `;
                    });
                    
                    tbody.innerHTML = html;
                } else {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No test transactions found</td></tr>';
                }
            })
            .catch(error => {
                console.error('Error loading transactions:', error);
                document.getElementById('testTransactionsTable').innerHTML = 
                    '<tr><td colspan="7" class="text-center text-danger">Error loading transactions: ' + error.message + '</td></tr>';
            });
    }
    
    window.createTestTransaction = function() {
        if (!confirm('Create a new test transaction?')) return;
        
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Creating...';
        
        fetch('{{ url('/api/test-transaction-contest') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Test transaction created!\nID: ' + data.transaction_id);
                // Refresh the table data
                loadTestTransactions();
            } else {
                alert('Error: ' + (data.message || 'Failed'));
            }
        })
        .catch(error => alert('Error: ' + error.message))
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = 'Create Test Transaction';
        });
    }
    
    window.fixDuplicateTransactions = function() {
        if (!confirm('Fix duplicate transactions for contest {{ $contest->id }}? This will:\n\n1. Remove duplicate prize transactions\n2. Correct wrong entry fee amounts\n3. Update pending transactions to success\n4. Adjust user wallet balances\n\nThis action cannot be undone.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Fixing...';
        
        console.log('Starting fix duplicates for contest {{ $contest->id }}');
        
        fetch('{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => {
            console.log('Fix Response status:', response.status);
            return response.text();
        })
        .then(text => {
            console.log('Fix Raw response:', text);
            try {
                const data = JSON.parse(text);
                console.log('Fix Parsed response:', data);
                
                if (data.success) {
                    let message = 'Duplicate transactions fixed successfully!\n\n';
                    message += `Duplicates removed: ${data.duplicates_removed}\n`;
                    message += `Amount corrected: ₹${data.amount_corrected}\n`;
                    message += `Entry fees fixed: ${data.entry_fees_fixed}\n`;
                    message += `Pending updated: ${data.pending_updated}`;
                    alert(message);
                    location.reload();
                } else {
                    alert('Error: ' + (data.message || data.error || 'Failed to fix duplicates'));
                }
            } catch (e) {
                console.error('Fix JSON parse error:', e);
                alert('Fix Server returned invalid response: ' + text.substring(0, 200));
            }
        })
        .catch(error => {
            console.error('Fix Network error:', error);
            alert('Fix Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    window.fixEntryFees = function() {
        if (!confirm('Fix wrong entry fee amounts for contest {{ $contest->id }}? This will:\n\n1. Set all entry fees to correct amount (₹{{ $contest->entry_fee }})\n2. Refund overcharged amounts to users\n3. Update transaction status to success\n\nThis action cannot be undone.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Fixing...';
        
        fetch('{{ url('admin/api/fix-entry-fees') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let message = 'Entry fees fixed successfully!\n\n';
                message += `Transactions fixed: ${data.fixed_count}\n`;
                message += `Total refunded: ₹${data.total_refunded}\n`;
                message += data.message;
                alert(message);
                location.reload();
            } else {
                alert('Error: ' + (data.message || 'Failed to fix entry fees'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    window.distributePrizesFixed = function() {
        if (!confirm('Distribute prizes using the FIXED system for contest {{ $contest->id }}? This will:\n\n1. Use race condition protection\n2. Check for existing prizes\n3. Create unique transactions\n4. Update wallet balances safely\n\nThis is the SAFE version that prevents duplicates.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Distributing...';
        
        fetch('{{ url('admin/api/distribute-prizes-fixed') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let message = 'Prizes distributed successfully!\n\n';
                message += `Total winners: ${data.total_winners}\n`;
                message += `Total amount: ₹${data.total_amount}\n`;
                message += data.message;
                alert(message);
                location.reload();
            } else {
                alert('Error: ' + (data.message || 'Failed to distribute prizes'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    window.validatePrices = function() {
        if (!confirm('Validate all prices for session {{ $contest->league_session_id }}? This will:\n\n1. Cross-check prices with multiple APIs\n2. Calculate consensus prices\n3. Identify suspicious prices\n4. Show detailed accuracy report\n\nThis is read-only validation.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Validating...';
        
        fetch('{{ url('admin/api/validate-session-prices') }}/{{ $contest->league_session_id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let message = 'Price validation completed!\n\n';
                message += `Total prices checked: ${data.total_prices}\n`;
                message += `Validated prices: ${data.validated_prices}\n`;
                message += `Suspicious prices: ${data.suspicious_prices}\n`;
                message += `Accuracy rate: ${data.accuracy_rate.toFixed(1)}%\n\n`;
                
                if (data.suspicious_prices > 0) {
                    message += 'Check console for detailed results.';
                    console.log('Price Validation Results:', data.results);
                }
                
                alert(message);
            } else {
                alert('Error: ' + (data.error || 'Failed to validate prices'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    window.testAPI = function() {
        console.log('=== API TEST START ===');
        console.log('Contest ID:', {{ $contest->id }});
        console.log('API URL:', '{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}');
        console.log('CSRF Token:', '{{ csrf_token() }}');
        
        // Test 1: Check if endpoint exists with GET
        fetch('{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}', {
            method: 'GET'
        })
        .then(response => {
            console.log('GET Test - Status:', response.status);
            return response.text();
        })
        .then(text => {
            console.log('GET Test - Response:', text.substring(0, 200));
        })
        .catch(error => {
            console.log('GET Test - Error:', error.message);
        });
        
        // Test 2: Try POST without action parameter
        setTimeout(() => {
            fetch('{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': '{{ csrf_token() }}'
                }
            })
            .then(response => {
                console.log('POST Test (no params) - Status:', response.status);
                return response.text();
            })
            .then(text => {
                console.log('POST Test (no params) - Response:', text.substring(0, 200));
            })
            .catch(error => {
                console.log('POST Test (no params) - Error:', error.message);
            });
        }, 1000);
        
        // Test 3: Try POST with action parameter
        setTimeout(() => {
            fetch('{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': '{{ csrf_token() }}'
                },
                body: JSON.stringify({
                    action: 'delete_duplicates',
                    contest_id: {{ $contest->id }}
                })
            })
            .then(response => {
                console.log('POST Test (with action) - Status:', response.status);
                return response.text();
            })
            .then(text => {
                console.log('POST Test (with action) - Response:', text.substring(0, 200));
            })
            .catch(error => {
                console.log('POST Test (with action) - Error:', error.message);
            });
        }, 2000);
        
        console.log('=== API TESTS RUNNING ===');
        alert('API tests running... Check console for results in 3 seconds.');
    }
    
    window.deleteDuplicateTransactions = function() {
        if (!confirm('Delete duplicate transactions for contest {{ $contest->id }}? This will:\n\n1. Find and remove duplicate prize transactions\n2. Delete wrong entry fee amount transactions\n3. Remove pending/failed transactions\n4. Keep only correct, unique transactions\n\nThis action cannot be undone.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Deleting...';
        
        console.log('Starting delete duplicates for contest {{ $contest->id }}');
        
        fetch('{{ url('/api/fix-duplicate-transactions') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            },
            body: JSON.stringify({
                action: 'delete_duplicates',
                contest_id: {{ $contest->id }}
            })
        })
        .then(response => {
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            return response.text(); // Get as text first to see raw response
        })
        .then(text => {
            console.log('Raw response:', text);
            try {
                const data = JSON.parse(text);
                console.log('Parsed response:', data);
                
                if (data.success) {
                    let message = 'Duplicate transactions deleted successfully!\n\n';
                    message += `Duplicates removed: ${data.duplicates_removed || 0}\n`;
                    message += `Wrong amounts deleted: ${data.wrong_amounts_deleted || 0}\n`;
                    message += `Pending transactions deleted: ${data.pending_deleted || 0}\n`;
                    message += `Total deleted: ${data.total_deleted || 0}\n`;
                    message += `Wallet balances adjusted: ${data.wallets_adjusted || 0}`;
                    alert(message);
                    location.reload();
                } else {
                    alert('Error: ' + (data.message || data.error || 'Failed to delete duplicate transactions'));
                }
            } catch (e) {
                console.error('JSON parse error:', e);
                alert('Server returned invalid response: ' + text.substring(0, 200));
            }
        })
        .catch(error => {
            console.error('Network error:', error);
            alert('Network Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }

    
    window.fetchPricesRobust = function() {
        if (!confirm('Fetch prices using ROBUST system for session {{ $contest->league_session_id }}? This will:\n\n1. Try multiple API sources\n2. Use fallback APIs if primary fails\n3. Validate prices before saving\n4. Reduce timing gaps\n\nThis will update start prices with better accuracy.')) return;
        
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Fetching...';
        
        fetch('{{ url('/admin/api/fetch-prices-robust') }}/{{ $contest->league_session_id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let message = 'Robust price fetching completed!\n\n';
                message += `Total assets: ${data.total_assets}\n`;
                message += `Successful: ${data.successful_prices}\n`;
                message += `Failed: ${data.failed_prices}\n`;
                message += `Success rate: ${((data.successful_prices / data.total_assets) * 100).toFixed(1)}%\n`;
                message += `Capture time: ${new Date(data.capture_time).toLocaleString()}`;
                alert(message);
                location.reload();
            } else {
                alert('Error: ' + (data.error || 'Failed to fetch prices'));
            }
        })
        .catch(error => {
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    window.emptyTestTransactions = function() {
        console.log('emptyTestTransactions called');
        if (!confirm('Delete all test transactions? This cannot be undone.')) return;
        
        console.log('Making DELETE request to:', '{{ url('/api/empty-test-transactions') }}');
        
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Deleting...';
        
        fetch('{{ url('/api/empty-test-transactions') }}', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => {
            console.log('DELETE Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('DELETE API Response:', data);
            if (data.success) {
                alert('All test transactions deleted!\nTotal deleted: ' + data.deleted_count);
                loadTestTransactions();
            } else {
                alert('Error: ' + (data.message || 'Failed'));
            }
        })
        .catch(error => {
            console.error('DELETE API Error:', error);
            alert('Error: ' + error.message);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash me-1"></i>Empty Test Transactions';
        });
    }
    
    // Distribute Winnings
    window.distributeWinnings = function() {
        if (!confirm('Distribute winnings to all winners for contest {{ $contest->id }}?')) return;
        
        fetch('{{ url('/api/distribute-winnings') }}/{{ $contest->id }}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': '{{ csrf_token() }}'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Winnings distributed!\nTotal: ' + data.total_winners + ' winners\nAmount: ₹' + data.total_amount);
                location.reload();
            } else {
                alert('Error: ' + (data.message || 'Failed'));
            }
        })
        .catch(error => alert('Error: ' + error.message));
    }
    
    // Initialize live prices on page load with optimized calls
    // loadAssetPrices();
    
    // Increase interval to 2 minutes since we're using cache
    // setInterval(loadAssetPrices, 120000); // Refresh every 2 minutes instead of 30 seconds
    
    // Add cache status check
    // checkCacheStatus();
});

// Check cache status
function checkCacheStatus() {
    const sessionId = {{ $contest->league_session_id ?? 'null' }};
    if (!sessionId) return;
    
    fetch(`{{ url('/api/price-cache-status') }}?session_id=${sessionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Price cache status:', data.cache_status);
            }
        })
        .catch(error => console.error('Cache status error:', error));
}

// Add manual cache clear function
window.clearPriceCache = function() {
    if (!confirm('Clear price cache? This will force fresh API calls.')) return;
    
    fetch('{{ url('/api/clear-price-cache') }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Price cache cleared successfully!');
            loadAssetPrices(); // Reload prices
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    });
}

// Lazy loading functions
window.loadParticipants = function() {
    const btn = document.getElementById('loadParticipantsBtn');
    const container = document.getElementById('participantsContainer');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Loading...';
    
    fetch('{{ url('/admin/api/performance') }}/{{ $contest->id }}/participants')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderParticipants(data.participants, container);
                document.getElementById('participantCount').textContent = data.total;
            } else {
                container.innerHTML = '<div class="alert alert-danger m-3">Error loading participants: ' + data.error + '</div>';
            }
        })
        .catch(error => {
            container.innerHTML = '<div class="alert alert-danger m-3">Error: ' + error.message + '</div>';
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
        });
};

function renderParticipants(participants, container) {
    if (!participants || participants.length === 0) {
        container.innerHTML = '<div class="text-center p-4"><p class="text-muted">No participants found</p></div>';
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover mb-0">
                <thead class="bg-light">
                    <tr>
                        <th>Rank</th>
                        <th>User</th>
                        <th>Wallet</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    participants.forEach((participant, index) => {
        const rank = index + 1;
        const score = parseFloat(participant.total_score || 0);
        const scoreClass = score >= 0 ? 'text-success' : 'text-danger';
        
        html += `
            <tr>
                <td><span class="badge bg-primary">${rank}</span></td>
                <td>
                    <div class="fw-bold">${participant.user_name || 'User ' + participant.user_id}</div>
                    <small class="text-muted">${participant.user_mobile || 'N/A'}</small>
                </td>
                <td><span class="badge bg-info">${parseFloat(participant.winnings_balance || 0).toFixed(2)}</span></td>
                <td><span class="fw-bold ${scoreClass}">${score.toFixed(2)}</span></td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

window.loadPrices = function() {
    const btn = document.getElementById('loadPricesBtn');
    const container = document.getElementById('pricesContainer');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Loading...';
    
    fetch('{{ url('/api/session-prices') }}/{{ $contest->league_session_id }}')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderPrices(data.start_prices, data.end_prices, container);
            } else {
                container.innerHTML = '<div class="alert alert-danger">Error loading prices: ' + data.message + '</div>';
            }
        })
        .catch(error => {
            container.innerHTML = '<div class="alert alert-danger">Error: ' + error.message + '</div>';
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
        });
};

// Auto-load prices on page load
document.addEventListener('DOMContentLoaded', function() {
    // Auto-load prices when page loads
    setTimeout(function() {
        loadPrices();
    }, 1000);
});

function renderPrices(startPrices, endPrices, container) {
    let html = '<div class="row">';
    
    // Start Prices
    html += '<div class="col-md-6">';
    html += `<h6 class="text-info mb-3">Start Prices (${startPrices ? startPrices.length : 0})</h6>`;
    if (startPrices && startPrices.length > 0) {
        html += '<div class="table-responsive" style="max-height: 300px; overflow-y: auto;">';
        html += '<table class="table table-sm table-hover"><thead class="sticky-top bg-light"><tr><th>Symbol</th><th class="text-end">Price</th></tr></thead><tbody>';
        startPrices.forEach(price => {
            html += `<tr><td class="fw-bold">${price.asset_symbol}</td><td class="text-end">₹${parseFloat(price.start_price).toFixed(2)}</td></tr>`;
        });
        html += '</tbody></table></div>';
    } else {
        html += '<div class="alert alert-warning">Session not started yet</div>';
    }
    html += '</div>';
    
    // End Prices
    html += '<div class="col-md-6">';
    html += `<h6 class="text-danger mb-3">End Prices (${endPrices ? endPrices.length : 0})</h6>`;
    if (endPrices && endPrices.length > 0) {
        html += '<div class="table-responsive" style="max-height: 300px; overflow-y: auto;">';
        html += '<table class="table table-sm table-hover"><thead class="sticky-top bg-light"><tr><th>Symbol</th><th class="text-end">Price</th></tr></thead><tbody>';
        endPrices.forEach(price => {
            html += `<tr><td class="fw-bold">${price.asset_symbol}</td><td class="text-end">₹${parseFloat(price.end_price).toFixed(2)}</td></tr>`;
        });
        html += '</tbody></table></div>';
    } else {
        html += '<div class="alert alert-warning">Session not completed yet</div>';
    }
    html += '</div></div>';
    
    container.innerHTML = html;
}

function loadAssetPrices() {
    const sessionId = {{ $contest->league_session_id ?? 'null' }};
    
    if (!sessionId) {
        console.error('Session ID not found');
        updatePriceStatus('Error: No Session ID', 'danger');
        return;
    }
    
    updatePriceStatus('Fetching prices...', 'warning');
    
    // Use optimized batch API instead of individual calls
    fetch(`{{ url('/api/batch-live-prices') }}?session_id=${sessionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data) {
                console.log(`✅ Loaded ${data.total_assets} asset prices from cache (${data.cache_duration})`);
                updatePriceStatus(`Updated ${data.total_assets} assets`, 'success');
                
                // Update all assets at once
                data.data.forEach(asset => {
                    let symbol = asset.symbol;
                    
                    // Handle crypto symbols
                    if (asset.symbol && !asset.symbol.includes('-USD') && 
                        document.querySelector(`[data-asset-symbol="${asset.symbol}-USD"]`)) {
                        symbol = asset.symbol + '-USD';
                    }
                    
                    updateAssetDisplay(symbol, asset.price, asset.change_percent);
                });
            } else {
                console.error('❌ Failed to load batch prices:', data.error);
                updatePriceStatus('Batch API failed, trying fallback', 'warning');
                // Fallback to old method if batch fails
                loadAssetPricesLegacy();
            }
        })
        .catch(error => {
            console.error('❌ Batch price API error:', error);
            updatePriceStatus('API Error, using fallback', 'danger');
            // Fallback to old method
            loadAssetPricesLegacy();
        });
}

function updatePriceStatus(message, type) {
    const statusEl = document.getElementById('priceUpdateStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `badge bg-${type}`;
        
        // Reset to default after 3 seconds
        if (type !== 'info') {
            setTimeout(() => {
                statusEl.textContent = 'Auto-updating every 2 min';
                statusEl.className = 'badge bg-info';
            }, 3000);
        }
    }
}

// Legacy method as fallback
function loadAssetPricesLegacy() {
    const assets = document.querySelectorAll('[data-asset-symbol]');
    const symbols = Array.from(assets).map(el => el.getAttribute('data-asset-symbol'));
    
    // Separate stocks and crypto
    const stockSymbols = symbols.filter(s => !s.includes('-USD'));
    const cryptoSymbols = symbols.filter(s => s.includes('-USD')).map(s => s.replace('-USD', ''));
    
    // Fetch stock prices from external API
    if (stockSymbols.length > 0) {
        stockSymbols.forEach(symbol => {
            fetch(`{{ url('/api/stock-live-price') }}?symbol=${symbol}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateAssetDisplay(symbol, data.price, data.change_percent);
                    }
                })
                .catch(error => console.error('Stock price error:', error));
        });
    }
    
    // Fetch crypto prices from external API
    if (cryptoSymbols.length > 0) {
        fetch('{{ url('/api/crypto-live-price') }}')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data) {
                    cryptoSymbols.forEach(cryptoSymbol => {
                        const crypto = data.data.find(c => c.symbol === cryptoSymbol);
                        if (crypto) {
                            updateAssetDisplay(cryptoSymbol + '-USD', crypto.price, crypto.change_percent);
                        }
                    });
                }
            })
            .catch(error => console.error('Crypto price error:', error));
    }
}

function updateAssetDisplay(symbol, price, changePercent) {
    const assetEl = document.querySelector(`[data-asset-symbol="${symbol}"]`);
    if (!assetEl) return;
    
    const priceEl = assetEl.querySelector('.asset-price');
    const changeEl = assetEl.querySelector('.asset-change');
    const statusEl = assetEl.querySelector('.asset-status-badge');
    
    if (priceEl) {
        if (price && price > 0) {
            priceEl.textContent = '₹' + parseFloat(price).toFixed(2);
            priceEl.className = 'fw-bold asset-price text-success';
            if (statusEl) {
                statusEl.textContent = 'Live';
                statusEl.className = 'badge bg-success asset-status-badge';
            }
        } else {
            priceEl.textContent = 'N/A';
            priceEl.className = 'fw-bold asset-price text-muted';
            if (statusEl) {
                statusEl.textContent = 'Error';
                statusEl.className = 'badge bg-danger asset-status-badge';
            }
        }
    }
    
    if (changeEl) {
        if (price && price > 0 && changePercent !== null && changePercent !== undefined) {
            const icon = changePercent >= 0 ? '▲' : '▼';
            const colorClass = changePercent >= 0 ? 'text-success' : 'text-danger';
            changeEl.className = 'asset-change ' + colorClass;
            changeEl.textContent = icon + ' ' + Math.abs(changePercent).toFixed(2) + '%';
        } else {
            changeEl.textContent = 'Not Available';
            changeEl.className = 'asset-change text-muted';
        }
    }
    
    // Update last update time
    const lastUpdateEl = document.getElementById('lastPriceUpdate');
    if (lastUpdateEl) {
        lastUpdateEl.textContent = new Date().toLocaleTimeString();
    }
}
</script>

<script>
(function(){
    var cid = {{ $contest->id }};
    var logUrl = "{{ url('admin/api/run-all-log') }}/" + cid;

    function badge(on) {
        var b = document.getElementById("runAllStatusBadge");
        if (b) b.style.display = on ? "inline-block" : "none";
        var stopBtn = document.getElementById("stopRunAllBtn");
        if (stopBtn) stopBtn.style.display = on ? "inline-block" : "none";
        var btn = document.getElementById("runAllBtn");
        if (!btn) return;
        btn.disabled = on;
        btn.innerHTML = on
            ? '<i class="spinner-border spinner-border-sm me-1"></i>Running...'
            : '<i class="bi bi-lightning-charge-fill"></i> RUN ALL';
    }

    function logBox(lines) {
        var d = document.getElementById("runAllLog");
        if (!d) {
            d = document.createElement("div");
            d.id = "runAllLog";
            d.style = "position:fixed;bottom:20px;right:20px;background:#1a1a2e;color:#00ff88;padding:15px 20px;border-radius:10px;z-index:9999;font-family:monospace;font-size:13px;max-width:420px;max-height:300px;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5)";
            document.body.appendChild(d);
        }
        d.innerHTML = "<b>⚡ RUN ALL</b><br><hr style=\"border-color:#333\">";
        lines.forEach(function(l){ d.innerHTML += l + "<br>"; });
        d.scrollTop = d.scrollHeight;
        return d;
    }

    function poll() {
        var iv = setInterval(function() {
            fetch(logUrl).then(function(r){ return r.json(); }).then(function(data) {
                if (data.log) logBox(data.log);
                if (data.status === "done") {
                    clearInterval(iv); badge(false);
                    var d = document.getElementById("runAllLog");
                    if (d) d.innerHTML += "<br><b style=\"color:#ffff00\">✅ ALL DONE!</b>";
                    setTimeout(function(){ location.reload(); }, 2500);
                } else if (data.status === "failed" || data.status === "not_started") {
                    clearInterval(iv); badge(false);
                }
            }).catch(function(){});
        }, 3000);
    }

    document.addEventListener("DOMContentLoaded", function() {
        fetch(logUrl).then(function(r){ return r.json(); }).then(function(data) {
            if (data.status === "running" || data.status === "queued") {
                badge(true);
                if (data.log) logBox(data.log);
                poll();
            }
        }).catch(function(){});
    });

    window.stopRunAll = function() {
        if (!confirm("RUN ALL job stop karo?")) return;
        var btn = document.getElementById("stopRunAllBtn");
        btn.disabled = true;
        fetch("{{ url('admin/api/run-all-stop') }}/"+cid, {
            method: "POST",
            headers: {"Content-Type":"application/json","X-CSRF-TOKEN":"{{ csrf_token() }}"},
            body: JSON.stringify({})
        }).then(function(r){ return r.json(); }).then(function(data) {
            if (data.success) {
                badge(false);
                var d = document.getElementById("runAllLog");
                if (d) d.innerHTML += "<br><b style=\"color:#ff4444\">Stopped by admin.</b>";
            }
            btn.disabled = false;
        }).catch(function(){ btn.disabled = false; });
    };
})();
</script>

<!-- Edit End Prices Modal -->
<div class="modal fade" id="editEndPricesModal" tabindex="-1">
  <div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header bg-warning text-dark">
      <h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Edit End Prices</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="alert alert-info">Session: {{ $contest->league_session_id }}</div>
      <div id="editEndPricesContainer"><div class="text-center p-3"><div class="spinner-border text-warning"></div></div></div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="button" class="btn btn-warning" onclick="saveEndPrices()"><i class="bi bi-save me-1"></i>Save End Prices</button>
    </div>
  </div></div>
</div>

<script>
function openEditEndPrices() {
    new bootstrap.Modal(document.getElementById("editEndPricesModal")).show();
    fetch("{{ url('admin/api/performance') }}/{{ $contest->id }}/prices")
    .then(function(r){ return r.json(); })
    .then(function(data) {
        var sp = data.start_prices || {};
        var ep = data.end_prices || {};
        var syms = Object.keys(sp);
        var html = '<table class="table table-sm"><thead class="table-light"><tr><th>Asset</th><th>Start Price</th><th>End Price (Edit)</th></tr></thead><tbody>';
        syms.forEach(function(sym) {
            var s = sp[sym] ? parseFloat(sp[sym].start_price).toFixed(2) : "-";
            var e = ep[sym] ? ep[sym].end_price : "";
            html += "<tr><td><strong>"+sym+"</strong></td><td>&#8377;"+s+"</td><td><input type='number' class='form-control form-control-sm end-price-input' data-symbol='"+sym+"' value='"+e+"' step='0.01' style='width:130px'></td></tr>";
        });
        html += "</tbody></table>";
        document.getElementById("editEndPricesContainer").innerHTML = html;
    }).catch(function(e){ document.getElementById("editEndPricesContainer").innerHTML = "Error: "+e.message; });
}

function saveEndPrices() {
    var prices = {};
    document.querySelectorAll(".end-price-input").forEach(function(i){ if(i.value) prices[i.dataset.symbol]=parseFloat(i.value); });
    var btn = event.target; btn.disabled=true; btn.innerHTML='<i class="spinner-border spinner-border-sm me-1"></i>Saving...';
    fetch("{{ url('admin/api/update-end-prices') }}/{{ $contest->league_session_id }}", {
        method:"POST", headers:{"Content-Type":"application/json","X-CSRF-TOKEN":"{{ csrf_token() }}"},
        body: JSON.stringify({prices: prices})
    }).then(function(r){ return r.json(); }).then(function(data) {
        if (data.success) { alert("Saved! "+data.updated+" assets updated."); bootstrap.Modal.getInstance(document.getElementById("editEndPricesModal")).hide(); location.reload(); }
        else { alert("Error: "+(data.message||"Failed")); }
    }).catch(function(e){ alert("Error: "+e.message); })
    .finally(function(){ btn.disabled=false; btn.innerHTML='<i class="bi bi-save me-1"></i>Save End Prices'; });
}
</script>

@endsection